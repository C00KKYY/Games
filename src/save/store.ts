/**
 * Save store (Brief §9.7): two slots A/B written alternately, each with CRC32 (serialize.ts), through
 * Platform.storage() – the SDK data module on CrazyGames, localStorage elsewhere, `null` while locked (§9.2.4).
 * The newest valid slot is loaded; an unreadable slot falls back to the other one. Nothing here ever throws.
 */
import type { Storage } from '../platform/platform';
import type { World } from '../sim/types';
import { decode, encode, plainToWorld, SLOT_KEYS, DEFAULT_SETTINGS, type SaveDoc, type Settings } from './serialize';

export type LoadOutcome =
  | { kind: 'none' }
  /** `damaged`: another slot existed but could not be read (the player gets a friendly hint) */
  | { kind: 'ok'; doc: SaveDoc; world: World; settings: Settings; damaged: boolean }
  /** slots exist but none is readable – start fresh, tell the player */
  | { kind: 'corrupt' };

export type SaveResult = { ok: true; bytes: number; slot: number } | { ok: false; code: string };

/** settings from a save, filled up with defaults and sanitised (an old or edited save never breaks the UI) */
export function sanitizeSettings(s: unknown): Settings {
  const o = (s && typeof s === 'object' ? s : {}) as Partial<Record<keyof Settings, unknown>>;
  const vol = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
  return {
    music: vol(o.music, DEFAULT_SETTINGS.music),
    sfx: vol(o.sfx, DEFAULT_SETTINGS.sfx),
    ambience: vol(o.ambience, DEFAULT_SETTINGS.ambience),
    mute: typeof o.mute === 'boolean' ? o.mute : DEFAULT_SETTINGS.mute,
    lang: o.lang === 'en' || o.lang === 'de' ? o.lang : null,
    shake: typeof o.shake === 'boolean' ? o.shake : DEFAULT_SETTINGS.shake,
  };
}

/**
 * Real time since the save, clamped for offline systems (Brief §3.15, H4): negative (clock turned back) → 0,
 * absurd jumps (+10 years) → cap, garbage → 0.
 */
export function awayMs(savedAt: number, now: number, capMs: number): number {
  const d = now - savedAt;
  if (!Number.isFinite(d) || d <= 0) return 0;
  return Math.min(d, capMs);
}

export class SaveStore {
  /** seq of the newest save known (loaded or written) */
  seq = 0;
  /** slot index the next write goes to (the one NOT holding the newest save) */
  next = 0;
  lastBytes = 0;
  writes = 0;
  lastError: string | null = null;
  private dead = false;

  constructor(private storage: () => Storage | null, private now: () => number = Date.now) {}

  /** storage reachable right now (false while locked on CrazyGames, after clear()) */
  available(): boolean { return !this.dead && !!this.safeStorage(); }

  private safeStorage(): Storage | null { try { return this.storage(); } catch { return null; } }

  load(): LoadOutcome {
    const st = this.safeStorage();
    if (!st || this.dead) return { kind: 'none' };
    const raw = SLOT_KEYS.map(k => { try { return st.get(k); } catch { return null; } });
    const docs = raw.map(r => decode(r));
    const order = [0, 1].filter(i => docs[i]).sort((a, b) => docs[b]!.seq - docs[a]!.seq);
    let unreadable = raw.filter((r, i) => !!r && !docs[i]).length;
    for (const i of order) {
      const doc = docs[i]!;
      let world: World;
      try { world = plainToWorld(doc.world); }
      catch (e) { console.warn('[save] slot', SLOT_KEYS[i], 'decoded but could not be rebuilt', e); unreadable++; continue; }
      this.seq = Math.max(doc.seq, ...order.map(j => docs[j]!.seq));
      this.next = 1 - i;
      return { kind: 'ok', doc, world, settings: sanitizeSettings(doc.settings), damaged: unreadable > 0 };
    }
    if (unreadable > 0) { console.warn('[save] no readable save slot'); return { kind: 'corrupt' }; }
    return { kind: 'none' };
  }

  save(w: World, settings: Settings): SaveResult {
    const st = this.dead ? null : this.safeStorage();
    if (!st) return { ok: false, code: 'locked' };
    let s: string;
    try { s = encode(w, settings, this.seq + 1, this.now()); }
    catch (e) { console.warn('[save] encode failed', e); this.lastError = 'encode'; return { ok: false, code: 'encode' }; }
    const slot = this.next;
    let r: ReturnType<Storage['set']>;
    try { r = st.set(SLOT_KEYS[slot], s); } catch (e) { r = { ok: false, code: String((e as { code?: string })?.code ?? 'other') }; }
    if (!r.ok) { this.lastError = r.code; return r; }
    this.seq++;
    this.next = 1 - slot;
    this.lastBytes = s.length;
    this.writes++;
    this.lastError = null;
    return { ok: true, bytes: s.length, slot };
  }

  /**
   * true when this session has saved/loaded before but both slots are gone now: something else wiped the save
   * (the settings "Reset progress" clears storage and reloads) – the pagehide flush must not resurrect it.
   */
  externallyCleared(): boolean {
    const st = this.dead ? null : this.safeStorage();
    if (!st || this.seq === 0) return false;
    return SLOT_KEYS.every(k => { try { return !st.get(k); } catch { return false; } });
  }

  /** "Reset progress": wipe both slots and never write again in this session (the page reloads next) */
  clear(): void {
    const st = this.safeStorage();
    this.dead = true;
    if (!st) return;
    for (const k of SLOT_KEYS) {
      try { if (st.remove) st.remove(k); else st.set(k, ''); } catch { /* nothing to clear */ }
    }
  }
}

/**
 * Autosave cadence (Brief §9.7): after important actions (debounced to ≤ 1 write per `minGapMs`), every `periodMs`,
 * and immediately on flush() (visibilitychange hidden / pagehide).
 */
export class Autosave {
  private dirty = false;
  private last: number;
  constructor(private write: () => boolean, now: number, private minGapMs = 2000, private periodMs = 30_000) { this.last = now; }
  request() { this.dirty = true; }
  get pending() { return this.dirty; }
  pump(now: number) {
    if ((this.dirty && now - this.last >= this.minGapMs) || now - this.last >= this.periodMs) this.run(now);
  }
  flush(now: number) { this.run(now); }
  private run(now: number) {
    this.last = now;
    if (this.write()) this.dirty = false;
  }
}
