/**
 * Small WebAudio mixer (Brief §8.4): master → { music, sfx, ambience } buses, one-shot voices and fading loops.
 * DOM-free and AudioContext-injectable so it runs under Vitest with a fake context.
 *
 * Gain chain:  voice/loop gain → bus gain (settings volume) → master gain (0 when muted) → destination
 * Mute precedence: any hard reason (SDK muteAudio, hidden tab, ad) > settings.mute > volumes. A hard reason can only
 * be lifted by its own source – the in-game toggle never re-enables sound the SDK muted.
 */
import { ALIAS, LOOPS, MUSIC, SFX, type SoundId } from './manifest';

// ------------------------------------------------------------------ minimal structural WebAudio types
export interface ParamLike {
  value: number;
  setTargetAtTime(v: number, startTime: number, timeConstant: number): unknown;
  cancelScheduledValues(t: number): unknown;
  setValueAtTime(v: number, t: number): unknown;
}
export interface NodeLike { connect(dest: unknown): unknown; disconnect(): void }
export interface GainLike extends NodeLike { gain: ParamLike }
export interface BufferLike { duration: number }
export interface SourceLike extends NodeLike {
  buffer: BufferLike | null;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  playbackRate: ParamLike;
  start(when?: number, offset?: number): void;
  stop(when?: number): void;
  onended: (() => void) | null;
}
export interface CtxLike {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  createGain(): GainLike;
  createBufferSource(): SourceLike;
  resume(): Promise<void>;
}

export type Bus = 'music' | 'sfx' | 'ambience';
export interface Volumes { music: number; sfx: number; ambience: number; mute: boolean }
export type MuteReason = 'sdk' | 'hidden' | 'ad' | (string & {});
export interface LoopPoints { loopStart: number; loopEnd: number }
export interface LogEntry { id: string; t: number; ctxState: string; src: string; inputT: number; inputH: number; skip?: string }
export interface PlayOpts { vol?: number; rate?: number; src?: string }

// ------------------------------------------------------------------ tuning
/** same id twice within this window plays once (component ctx.sound + sim event for the same action) */
export const DEDUPE_MS = 80;
/** minimum spacing per rate-limit group */
export const RATE_MS: Record<string, number> = { coin: 140, crateStack: 900, hover: 60, whistle: 400, foodSplat: 250, stamp: 60, click: 40 };
/** ±5 % pitch variation for frequent sounds (Brief §8.3) */
export const PITCH_VARY = 0.05;
const FREQUENT = new Set<string>(['click', 'hover', 'panelOpen', 'panelClose', 'deny', 'coin1', 'coin2', 'coin3', 'stamp', 'buildStart',
  'buildDone', 'hire', 'netSwoosh', 'foodSplat', 'whistle', 'crateStack', 'tunnelPop', 'cartRoll', 'demolish', 'upgrade']);
export const COINS: readonly SoundId[] = ['coin1', 'coin2', 'coin3'];
/** base trims per bus (assets are levelled in the build: music/ambience −20 LUFS, SFX 6–10 dB above, Brief §8.3) */
const BUS_TRIM: Record<Bus, number> = { music: 0.8, sfx: 1, ambience: 0.9 };
/** concurrent one-shot voice cap */
export const MAX_VOICES = 24;
/** a play() for an id whose buffer is still decoding is honoured if the buffer arrives within this time */
export const PENDING_MS = 300;
const LOG_CAP = 200;

const MUSIC_SET = new Set<string>(MUSIC);
const LOOP_SET = new Set<string>(LOOPS);
const ALL = new Set<string>([...SFX, ...LOOPS, ...MUSIC]);

export function busOf(id: string): Bus {
  if (MUSIC_SET.has(id)) return 'music';
  if (LOOP_SET.has(id)) return 'ambience';
  return 'sfx';
}
/** resolve an M3 alias / virtual id ('coin') to a manifest id; null for unknown names */
export function resolveId(name: string): string | null {
  if (name === 'coin') return 'coin';
  const a = ALIAS[name];
  if (a) return a;
  return ALL.has(name) ? name : null;
}
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

interface LoopState { src: SourceLike | null; gain: GainLike | null; target: number; fade: number; zeroSince: number }

export interface MixerOpts {
  /** creates the real AudioContext – only ever called from unlock() (i.e. inside a user gesture) */
  create: () => CtxLike | null;
  now: () => number;
  random?: () => number;
  /** sink for the play log (window.__audioLog in the browser) */
  log?: LogEntry[];
}

export class Mixer {
  ctx: CtxLike | null = null;
  master: GainLike | null = null;
  buses: Partial<Record<Bus, GainLike>> = {};
  /** a user gesture happened (music/ambience may start) */
  unlocked = false;
  readonly buffers = new Map<string, BufferLike>();
  readonly loopPts: Record<string, LoopPoints> = {};
  /** ids currently being fetched/decoded (play() requests for them are queued briefly) */
  readonly loading = new Set<string>();
  readonly loops = new Map<string, LoopState>();
  readonly reasons = new Set<string>();
  vol: Volumes = { music: 0.7, sfx: 0.85, ambience: 0.6, mute: false };
  log: LogEntry[];
  /** performance.now() of the last user input event (for test E) */
  inputT = -1;
  /** performance.now() when the window capture listener saw that input (handler time) */
  inputH = -1;
  voices = 0;
  private last = new Map<string, number>();
  private pending: { id: string; opts: PlayOpts; at: number }[] = [];
  private unlockFns: (() => void)[] = [];
  private random: () => number;

  constructor(private o: MixerOpts) {
    this.random = o.random ?? Math.random;
    this.log = o.log ?? [];
  }

  // ---------------------------------------------------------------- lifecycle
  /** call from every user gesture: creates the context on the first one and resumes it whenever it is not running */
  unlock() {
    if (!this.ctx) {
      let c: CtxLike | null = null;
      try { c = this.o.create(); } catch { c = null; }
      if (!c) return;
      this.ctx = c;
      this.master = c.createGain();
      this.master.connect(c.destination);
      for (const b of ['music', 'sfx', 'ambience'] as Bus[]) {
        const g = c.createGain();
        g.connect(this.master);
        this.buses[b] = g;
      }
      this.applyGains(true);
    }
    if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') {
      try { void this.ctx.resume().catch(() => undefined); } catch { /* ignore */ }
    }
    if (!this.unlocked) {
      this.unlocked = true;
      for (const f of this.unlockFns.splice(0)) f();
    }
  }
  onUnlock(fn: () => void) { if (this.unlocked) fn(); else this.unlockFns.push(fn); }

  // ---------------------------------------------------------------- mute / volumes
  /** effective master: 0 when any hard reason or settings.mute is set */
  muted() { return this.reasons.size > 0 || this.vol.mute; }
  setVolumes(v: Volumes) { this.vol = { music: clamp01(v.music), sfx: clamp01(v.sfx), ambience: clamp01(v.ambience), mute: !!v.mute }; this.applyGains(); }
  setReason(reason: MuteReason, on: boolean, fast = false) {
    const had = this.reasons.has(reason);
    if (on === had) return;
    if (on) this.reasons.add(reason); else this.reasons.delete(reason);
    this.applyGains(false, fast);
  }
  /** target gains (what the param ramps to) – for tests and debugging */
  targets() {
    return {
      master: this.muted() ? 0 : 1,
      music: this.vol.music * BUS_TRIM.music,
      sfx: this.vol.sfx * BUS_TRIM.sfx,
      ambience: this.vol.ambience * BUS_TRIM.ambience,
    };
  }
  private ramp(p: ParamLike, v: number, tc: number, now: boolean) {
    const c = this.ctx!; const t = c.currentTime;
    try {
      p.cancelScheduledValues(t);
      if (now) { p.value = v; p.setValueAtTime(v, t); } else { p.setValueAtTime(p.value, t); p.setTargetAtTime(v, t, tc); }
    } catch { p.value = v; }
  }
  private applyGains(instant = false, fast = false) {
    if (!this.ctx || !this.master) return;
    const tg = this.targets();
    this.ramp(this.master.gain, tg.master, fast ? 0.012 : 0.05, instant);
    for (const b of ['music', 'sfx', 'ambience'] as Bus[]) this.ramp(this.buses[b]!.gain, tg[b], 0.06, instant);
  }

  // ---------------------------------------------------------------- buffers
  setBuffer(id: string, buf: BufferLike, pts?: LoopPoints) {
    this.buffers.set(id, buf);
    this.loading.delete(id);
    if (pts) this.loopPts[id] = pts;
    // honour recent play() calls that arrived while this buffer was decoding
    const t = this.o.now();
    const due = this.pending.filter(p => p.id === id || (p.id === 'coin' && COINS.includes(id as SoundId)));
    this.pending = this.pending.filter(p => !due.includes(p));
    for (const p of due) if (t - p.at <= PENDING_MS) this.voice(p.id === 'coin' ? id : p.id, p.opts);
  }
  failed(id: string) { this.loading.delete(id); this.pending = this.pending.filter(p => p.id !== id); }

  // ---------------------------------------------------------------- one-shots
  /** play a sound by manifest id, M3 alias or 'coin'. Returns true when a voice was started. Never throws. */
  play(name: string, opts: PlayOpts = {}): boolean {
    const t = this.o.now();
    const id = resolveId(name);
    const entry: LogEntry = { id: id ?? name, t, ctxState: this.ctx ? this.ctx.state : 'none', src: opts.src ?? 'ui', inputT: this.inputT, inputH: this.inputH };
    this.log.push(entry);
    if (this.log.length > LOG_CAP) this.log.splice(0, this.log.length - LOG_CAP);
    if (!id) { entry.skip = 'unknown'; return false; }
    if (LOOP_SET.has(id) || MUSIC_SET.has(id)) { entry.skip = 'loop'; return false; }
    // dedupe (same id) and rate limit (per group)
    const group = COINS.includes(id as SoundId) || id === 'coin' ? 'coin' : id;
    const prev = this.last.get(group) ?? -1e9;
    const gap = RATE_MS[group] ?? DEDUPE_MS;
    if (t - prev < Math.max(gap, DEDUPE_MS)) { entry.skip = t - prev < DEDUPE_MS ? 'dedupe' : 'rate'; return false; }
    this.last.set(group, t);
    if (!this.ctx || !this.unlocked) { entry.skip = 'locked'; return false; }
    if (this.muted()) { entry.skip = 'muted'; return false; }
    let real = id;
    if (id === 'coin') {
      const have = COINS.filter(c => this.buffers.has(c));
      if (!have.length) {
        if (COINS.some(c => this.loading.has(c))) { this.pending.push({ id, opts, at: t }); entry.skip = 'pending'; } else entry.skip = 'missing';
        return false;
      }
      real = have[Math.floor(this.random() * have.length) % have.length];
      entry.id = real;
    }
    if (!this.buffers.has(real)) {
      if (this.loading.has(real)) { this.pending.push({ id: real, opts, at: t }); entry.skip = 'pending'; } else entry.skip = 'missing';
      return false;
    }
    if (this.voices >= MAX_VOICES) { entry.skip = 'voices'; return false; }
    return this.voice(real, opts);
  }

  private voice(id: string, opts: PlayOpts): boolean {
    const c = this.ctx, buf = this.buffers.get(id), bus = this.buses[busOf(id)];
    if (!c || !buf || !bus || this.muted()) return false;
    try {
      const s = c.createBufferSource();
      s.buffer = buf;
      let rate = opts.rate ?? 1;
      if (FREQUENT.has(id)) rate *= 1 + (this.random() * 2 - 1) * PITCH_VARY;
      s.playbackRate.value = rate;
      const g = c.createGain();
      g.gain.value = clamp01(opts.vol ?? 1);
      s.connect(g); g.connect(bus);
      this.voices++;
      s.onended = () => { this.voices = Math.max(0, this.voices - 1); try { s.disconnect(); g.disconnect(); } catch { /* ignore */ } };
      s.start(0);
      return true;
    } catch { return false; }
  }

  // ---------------------------------------------------------------- loops (music, ambience, hammerLoop)
  /** set a loop's target volume (0..1) with a fade of `fade` seconds; starts/stops sources as needed (after unlock) */
  setLoop(id: string, target: number, fade = 1.5) {
    let L = this.loops.get(id);
    if (!L) { L = { src: null, gain: null, target: 0, fade, zeroSince: this.o.now() }; this.loops.set(id, L); }
    const v = clamp01(target);
    const changed = Math.abs(v - L.target) > 1e-3;
    L.fade = fade;
    if (changed && v === 0) L.zeroSince = this.o.now();
    L.target = v;
    const c = this.ctx;
    if (!c || !this.unlocked) return;
    if (v > 0 && !L.src) {
      const buf = this.buffers.get(id), bus = this.buses[busOf(id)];
      if (!buf || !bus) return;
      try {
        const s = c.createBufferSource();
        s.buffer = buf; s.loop = true;
        const p = this.loopPts[id];
        if (p && p.loopEnd > p.loopStart && p.loopEnd <= buf.duration + 1e-3) { s.loopStart = p.loopStart; s.loopEnd = p.loopEnd; }
        const g = c.createGain();
        g.gain.value = 0;
        s.connect(g); g.connect(bus);
        s.start(0, p ? Math.min(p.loopStart, Math.max(0, buf.duration - 0.01)) : 0);
        L.src = s; L.gain = g;
        this.ramp(g.gain, v, fade / 3, false);
      } catch { L.src = null; L.gain = null; }
    } else if (L.src && L.gain && changed) {
      this.ramp(L.gain.gain, v, fade / 3, false);
    }
  }
  /** stop loops that have been faded to 0 for a while (saves CPU) */
  reapLoops() {
    const t = this.o.now();
    for (const L of this.loops.values()) {
      if (L.src && L.target === 0 && t - L.zeroSince > L.fade * 1000 + 600) {
        try { L.src.stop(); L.src.disconnect(); L.gain?.disconnect(); } catch { /* ignore */ }
        L.src = null; L.gain = null;
      }
    }
  }
  /** true when the id (or its rate-limit group) was last requested within `ms` */
  recent(id: string, ms: number) { return this.o.now() - (this.last.get(id) ?? -1e9) < ms; }
  loopPlaying(id: string) { const L = this.loops.get(id); return !!(L && L.src && L.target > 0); }
}
