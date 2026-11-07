/**
 * Audio runtime (Brief §8.4, §11.1, §12.6, §12.8): mounts the WebAudio mixer (mixer.ts) into the app.
 * - loading: the INITIAL bundle (tutorial sounds) + musicDayLo (16 kbps stand-in of music loop 1) right away (fetch,
 *   never awaited → never blocks boot or gameplayStart); the rest – musicDay first – after the first gameplayStart (or
 *   3 s), Brief §8.4 "der Rest wird nach gameplayStart nachgeladen". Only files that exist in public/audio are requested (build-time
 *   glob), so missing assets never produce a 404 or console error; decode failures are swallowed.
 * - unlock: the AudioContext is created/resumed inside the first user gesture (capture listeners on window, incl.
 *   click/touchend for iOS). Music and ambience start with that first tap, never before.
 * - mute: SDK muteAudio > settings.mute > volumes; hidden tab ducks master fast (no gameplayStop); ads use setMuted('ad').
 * - music/ambience follow the sim clock (day/evening/night) and the crowd, updated ≤ 4×/s. Until musicDay is decoded the
 *   first tap starts musicDayLo; once musicDay arrives it takes over at the same loop phase with a LO_XFADE cross-fade.
 * - every play() is logged to window.__audioLog [{id, t, ctxState, src, inputT, skip?}] (cap 200).
 */
import type { UICtx, Component } from '../ui/ctx';
import type { Platform } from '../platform/platform';
import type { Settings } from '../save/serialize';
import { hourOf, isNight } from '../sim/time';
import { INITIAL, INITIAL_MUSIC, LOOPS, LO_OF, MUSIC, MUSIC_LO, SFX, type SoundId } from './manifest';
import { Mixer, resolveId, type CtxLike, type BufferLike, type LoopPoints, type MuteReason } from './mixer';
import { cueFor } from './events';
import { assetUrl } from '../platform/assets';

export interface Audio extends Component {
  /** play a sound by id or M3 alias; unknown/unloaded ids are ignored */
  play(name: string, opts?: { vol?: number; rate?: number }): void;
  /** resume the AudioContext from a user gesture (first tap) */
  unlock(): void;
  /** external hard mute (e.g. 'ad' between adStarted and adFinished/adError in the FULL build) */
  setMuted(reason: MuteReason, on: boolean): void;
  /** force a music track (musicInspection in M5); null returns to the clock-driven day/evening music */
  setMusic(id: 'musicDay' | 'musicEvening' | 'musicInspection' | null): void;
}

// files present at build time (keys only – nothing is bundled or fetched by the glob itself)
const PRESENT = new Set(Object.keys(import.meta.glob('../../public/audio/*.mp3')).map(k => k.slice(k.lastIndexOf('/') + 1, -4)));
// dev only: ?audioAll requests every manifest id (e2e serves the files through a route)
if (import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('audioAll')) for (const id of [...SFX, ...LOOPS, ...MUSIC, ...MUSIC_LO]) PRESENT.add(id);
const LOOP_JSON = Object.values(import.meta.glob('../../public/audio/loops.json', { eager: true, import: 'default' }))[0] as Record<string, LoopPoints> | undefined;

/** loading order after gameplayStart: the full day loop (takes over from musicDayLo), ambience beds (they start with the
 *  first tap), then events, then night/evening */
const LATER: SoundId[] = ['musicDay', 'ambWaves', 'ambGulls', ...SFX.filter(s => !INITIAL.includes(s)), 'ambMurmur', 'musicEvening', 'ambClatter', 'ambCrickets'];
const PHASE2_FALLBACK_MS = 3000;
/** low-quality stand-in → full track cross-fade (s); track changes (day ↔ evening) use MUSIC_XFADE */
const LO_XFADE = 1.5, MUSIC_XFADE = 3;
const CONCURRENCY = 3;
/** ambient crate-stacking clack at most every 4 s (several workshops stack constantly) */
const STACK_GAP_MS = 4000;

type W = typeof window & { webkitAudioContext?: typeof AudioContext; webkitOfflineAudioContext?: typeof OfflineAudioContext; __audioLog?: unknown; __audio?: unknown };

export function mountAudio(ctx: UICtx, platform: Platform): Audio {
  const win = window as W;
  const now = () => performance.now();
  const mixer = new Mixer({
    now,
    create: () => {
      const AC = win.AudioContext ?? win.webkitAudioContext;
      return AC ? (new AC({ latencyHint: 'interactive' }) as unknown as CtxLike) : null;
    },
  });
  win.__audioLog = mixer.log;
  const t0 = now();

  // ---------------------------------------------------------------- loading
  let offline: BaseAudioContext | null = null;
  const decoder = (): BaseAudioContext | null => {
    if (mixer.ctx) return mixer.ctx as unknown as BaseAudioContext;
    if (!offline) {
      // decoding before the first gesture must not touch an AudioContext (autoplay warning) → offline context
      const OAC = win.OfflineAudioContext ?? win.webkitOfflineAudioContext;
      try { offline = OAC ? new OAC(1, 1, 44100) : null; } catch { offline = null; }
    }
    return offline;
  };
  const decode = (ab: ArrayBuffer) => new Promise<AudioBuffer>((res, rej) => {
    const d = decoder();
    if (!d) { rej(new Error('no decoder')); return; }
    try {
      const p = d.decodeAudioData(ab, res, rej) as Promise<AudioBuffer> | undefined;
      if (p && typeof p.then === 'function') p.then(res, rej);
    } catch (e) { rej(e); }
  });
  const queue: string[] = [];
  const queued = new Set<string>();
  let active = 0;
  const pump = () => {
    while (active < CONCURRENCY && queue.length) {
      const id = queue.shift()!;
      active++;
      fetch(assetUrl(`audio/${id}.mp3`))
        .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then(decode)
        .then(buf => mixer.setBuffer(id, buf as unknown as BufferLike, LOOP_JSON?.[id]))
        .catch(() => mixer.failed(id))
        .finally(() => { active--; pump(); });
    }
  };
  const load = (ids: readonly string[]) => {
    for (const id of ids) {
      if (queued.has(id) || !PRESENT.has(id)) continue;
      queued.add(id); mixer.loading.add(id); queue.push(id);
    }
    pump();
  };
  load([...INITIAL, ...INITIAL_MUSIC]);
  let phase2 = false, phase2At = -1;   // performance.now() when the rest was queued (test hook, A4 / §8.4)
  const startPhase2 = () => {
    if (phase2) return;
    phase2 = true;
    const go = () => { phase2At = now(); load(LATER); };
    const ric = (win as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (ric) ric(go, { timeout: 1500 }); else setTimeout(go, 200);
  };

  // ---------------------------------------------------------------- unlock + input timestamps (test E)
  const onInput = (e: Event) => {
    const ts = e.timeStamp > 0 && e.timeStamp <= now() + 1 ? e.timeStamp : now();
    mixer.inputT = ts;
    mixer.inputH = now();
    if (!mixer.ctx || mixer.ctx.state !== 'running') mixer.unlock();
  };
  const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;
  for (const ev of GESTURES) window.addEventListener(ev, onInput, { capture: true, passive: true });

  // ---------------------------------------------------------------- mute sources
  const applySettings = (s: Settings) => mixer.setVolumes({ music: s.music, sfx: s.sfx, ambience: s.ambience, mute: s.mute });
  applySettings(ctx.settings.get());
  const offSettings = ctx.settings.on(applySettings);
  mixer.setReason('sdk', platform.muted(), true);
  platform.onMuteChange(m => mixer.setReason('sdk', m, true));
  void platform.ready.then(() => mixer.setReason('sdk', platform.muted(), true), () => undefined);
  const onVis = () => mixer.setReason('hidden', document.visibilityState === 'hidden', true);
  const onFreeze = () => mixer.setReason('hidden', true, true);
  const onResume = () => onVis();
  onVis();
  document.addEventListener('visibilitychange', onVis);
  document.addEventListener('freeze', onFreeze);
  document.addEventListener('resume', onResume);

  // ---------------------------------------------------------------- UI sounds derived from stores (panels, hover)
  const panel = (open: boolean) => { if (!mixer.recent('click', 80)) mixer.play(open ? 'panelOpen' : 'panelClose', { vol: 0.6, src: 'ui' }); };
  const offMenu = ctx.menu.on((v, p) => { if (!!v !== !!p) panel(!!v); });
  const offSel = ctx.selection.on((v, p) => { if (!!v !== !!p) panel(!!v); });
  let hovered: Element | null = null;
  const onOver = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const b = (e.target as Element | null)?.closest?.('button');
    if (b === hovered) return;
    hovered = b ?? null;
    if (b && !(b as HTMLButtonElement).disabled && mixer.unlocked) mixer.play('hover', { vol: 0.3, src: 'ui' });
  };
  ctx.root.addEventListener('pointerover', onOver);

  // ---------------------------------------------------------------- sim events → SFX (same frame as the tick)
  // a command voiced by its component (ctx.sound) emits its event in the same sim instant (same rtMs) – that event is
  // the same action, so it stays silent even when the next frame comes later than the mixer's 80 ms dedupe window
  const uiAt = new Map<string, { rtMs: number; t: number }>();
  const offEv = ctx.onEvent(e => {
    const c = cueFor(e);
    if (!c) return;
    const id = resolveId(c.id) ?? c.id, u = uiAt.get(id);
    if (u && u.rtMs === e.rtMs && now() - u.t < 1000) return;
    mixer.play(c.id, { ...c.opts, src: 'event' });
  });

  // ---------------------------------------------------------------- music + ambience (≤ 4×/s)
  let musicOverride: string | null = null;
  let inspLoaded = false;
  let acc = 0;
  let lastStack = -1, lastStackSnd = -1e9;
  function tick() {
    const w = ctx.w;
    if (!phase2 && (now() - t0 >= PHASE2_FALLBACK_MS || platform.calls.some(c => c.name === 'gameplayStart'))) startPhase2();
    mixer.setReason('sdk', platform.muted(), true);
    mixer.reapLoops();
    // crates being stacked in workshops (no sim event for it) – soft, rate limited by the mixer
    let stack = 0;
    for (const r of w.rooms) if (r.type === 'workshop') stack += r.stack;
    if (lastStack >= 0 && stack > lastStack && w.speed > 0 && now() - lastStackSnd > STACK_GAP_MS) { lastStackSnd = now(); mixer.play('crateStack', { vol: 0.4, src: 'auto' }); }
    lastStack = stack;
    if (!mixer.unlocked) return;
    const h = hourOf(w.t), night = isNight(w.t), evening = night || h >= 18;
    // music: day ↔ evening crossfade; the evening track waits until it is loaded
    // Inspection Day (M5_DESIGN §11): the inspection theme from the call until the result screen closes. Read from
    // the world each tick, so a save loaded mid-walk and a world swap (transfer) pick the right track by themselves.
    const inspecting = w.inspection?.phase === 'walking' || w.inspection?.phase === 'result';
    if (inspecting && !inspLoaded) { inspLoaded = true; load(['musicInspection']); }
    let want: string = musicOverride ?? (inspecting ? 'musicInspection' : evening ? 'musicEvening' : 'musicDay');
    if (!mixer.buffers.has(want) && !musicOverride) want = mixer.buffers.has('musicDay') ? 'musicDay' : want;
    // not decoded yet: its low-quality stand-in plays (also as the fallback while the evening track is loading)
    const lo = LO_OF[want as keyof typeof LO_OF] ?? (musicOverride ? undefined : LO_OF.musicDay);
    const useLo = !mixer.buffers.has(want) && !!lo && mixer.buffers.has(lo) ? lo : null;
    if (useLo) want = useLo;
    for (const l of MUSIC_LO) {
      // hand-over: the full track starts at the stand-in's current loop phase, both fade over LO_XFADE
      const full = MUSIC.find(m => LO_OF[m] === l);
      const handover = full === want && mixer.loopPlaying(l) && !mixer.loopPlaying(full);
      if (handover) mixer.setLoop(full, 1, LO_XFADE, mixer.loopPhase(l));
      mixer.setLoop(l, l === want ? 1 : 0, l === want || handover || full === want ? LO_XFADE : MUSIC_XFADE);
    }
    for (const m of MUSIC) mixer.setLoop(m, m === want ? 1 : 0, MUSIC_XFADE);
    // ambience beds
    let residents = 0, eaters = 0, brawl = 0;
    for (const a of w.agents) {
      if (a.kind !== 'rascal' && a.kind !== 'vip') continue;
      if (a.bed > 0) residents++;
      if (a.state === 'using' && a.act?.kind === 'eat') eaters++;
      else if (a.state === 'brawling') brawl++;
    }
    const dusk = !night && h >= 19 ? (h - 19) / 3 : 0; // 19→22 fades gulls out, crickets in
    const amb: Record<string, number> = {
      ambWaves: night ? 0.55 : 0.8,
      ambGulls: night ? 0 : 0.5 * (1 - dusk),
      ambCrickets: night ? 0.7 : 0.6 * dusk,
      ambMurmur: Math.min(1, residents / 24) * (night ? 0.25 : 0.6),
      ambClatter: Math.min(1, (eaters + brawl * 2) / 8) * 0.7,
    };
    for (const l of LOOPS) mixer.setLoop(l, amb[l] ?? 0, 2);
    // hammering while a room is under construction (game running)
    const building = w.speed > 0 && w.rooms.some(r => !r.built && r.buildEndMs > w.rtMs);
    mixer.setLoop('hammerLoop', building ? 0.5 : 0, 0.4);
  }

  mixer.onUnlock(() => tick());

  const audio: Audio = {
    play(name, opts) {
      const id = resolveId(name);
      if (id) uiAt.set(id, { rtMs: ctx.w.rtMs, t: now() });
      mixer.play(name, { ...opts, src: 'ui' });
    },
    unlock() { mixer.unlock(); },
    setMuted(reason, on) { mixer.setReason(reason, on, true); },
    setMusic(id) {
      musicOverride = id;
      if (id) load([id]);
      tick();
    },
    update(dt: number) {
      acc += dt;
      if (acc < 0.25) return;
      acc = 0;
      tick();
    },
    destroy() {
      for (const ev of GESTURES) window.removeEventListener(ev, onInput, { capture: true });
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('freeze', onFreeze);
      document.removeEventListener('resume', onResume);
      ctx.root.removeEventListener('pointerover', onOver);
      offSettings(); offMenu(); offSel(); offEv();
    },
  };
  win.__audio = {
    mixer,
    debug: () => ({
      ctxState: mixer.ctx?.state ?? 'none', unlocked: mixer.unlocked, muted: mixer.muted(), reasons: [...mixer.reasons],
      targets: mixer.targets(), master: mixer.master?.gain.value ?? null, loaded: [...mixer.buffers.keys()], present: [...PRESENT],
      loops: [...mixer.loops.entries()].filter(([, L]) => L.src).map(([id, L]) => ({ id, target: L.target })), phase2, phase2At, voices: mixer.voices,
    }),
  };
  return audio;
}
