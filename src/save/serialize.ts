/**
 * Save format (Brief §9.7): versioned JSON → lz-string (base64). Two slots A/B written alternately, each with CRC32.
 * Derived state (walls, room map, distance fields, events) is rebuilt on load. Target < 150 KB.
 */
import LZString from 'lz-string';
import type { World } from '../sim/types';
import { rebuild, m5Defaults } from '../sim/world';
import { flushEvents } from '../sim/sim';
import { makeGrid } from '../sim/pathfield';
import { OFFLINE } from '../content/balance';

/** v1 = M4, v2 = M5 (projects, leads, taps, inspection, prestige, mail, vip, wall, offline – docs/M5_DESIGN.md §1.2) */
export const SAVE_VERSION = 2;
export const SLOT_KEYS = ['rrl_save_a', 'rrl_save_b'] as const;
export interface Settings { music: number; sfx: number; ambience: number; mute: boolean; lang: 'en' | 'de' | null; shake: boolean }
export const DEFAULT_SETTINGS: Settings = { music: 0.7, sfx: 0.85, ambience: 0.6, mute: false, lang: null, shake: true };

export interface SaveDoc { v: number; seq: number; savedAt: number; settings: Settings; world: Record<string, unknown> }

// ---------------------------------------------------------------- typed array RLE
export function rle(a: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.length;) { const v = a[i]; let n = 1; while (i + n < a.length && a[i + n] === v && n < 65535) n++; out.push(v, n); i += n; }
  return out;
}
export function unrle(r: number[], into: { length: number; [i: number]: number }) {
  let k = 0;
  for (let i = 0; i < r.length; i += 2) for (let n = 0; n < r[i + 1]; n++) into[k++] = r[i];
  return into;
}

// ---------------------------------------------------------------- CRC32
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(s: string): number { let c = 0xffffffff; for (let i = 0; i < s.length; i++) c = CRC_T[(c ^ s.charCodeAt(i)) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

// ---------------------------------------------------------------- world ⇄ plain object
const DERIVED_GRID = ['roomAt', 'wallE', 'wallS'] as const;
export function worldToPlain(w: World): Record<string, unknown> {
  flushEvents(w); // nothing pending may be lost by a save (review finding)
  const { cache: _c, events: _e, eventSeq: _s, grid, ...rest } = w;
  void _c; void _e; void _s;
  const g: Record<string, unknown> = { w: grid.w, h: grid.h };
  for (const k of ['ground', 'owned', 'fixed', 'road', 'blocked'] as const) g[k] = rle(grid[k]);
  return JSON.parse(JSON.stringify({ ...rest, grid: g }));
}
export function plainToWorld(p: Record<string, unknown>): World {
  // idempotent safety net: an M5 field added after a v2 save was written gets its default (no-op for complete saves)
  fillDefaults(p, m5Defaults(Number(p.site) || 1) as unknown as Record<string, unknown>);
  const pg = p.grid as Record<string, number[] | number>;
  const grid = makeGrid(pg.w as number, pg.h as number);
  for (const k of ['ground', 'owned', 'fixed', 'road', 'blocked'] as const) unrle(pg[k] as number[], grid[k]);
  void DERIVED_GRID;
  const w = { ...(p as object), grid, events: [], eventSeq: 0, cache: { fields: new Map(), version: 0, doorRes: new Int32Array(grid.w * grid.h), evCursor: 0 } } as unknown as World;
  rebuild(w);
  return w;
}

// ---------------------------------------------------------------- migrations
type Migration = (doc: SaveDoc) => SaveDoc;
const MIGRATIONS: Record<number, Migration> = {
  // 1 → 2 (M5): every new top-level field gets its default; a field that already exists (partially) is filled up
  1: (d) => {
    d.world = fillDefaults(d.world, m5Defaults(Number(d.world.site) || 1) as unknown as Record<string, unknown>);
    markFromStats(d.world);
    d.v = 2; return d;
  },
};
/**
 * v1 → v2: the inspection window starts at the moment of the migration – `inspection.mark` takes the current
 * cumulative counters, so the first hour bucket is not the whole M4 history (inspection.ts inspectionCounters).
 */
function markFromStats(world: Record<string, unknown>) {
  const st = (world.stats ?? {}) as { released?: number; escaped?: number; unsolved?: number; income?: Record<string, number>; spend?: Record<string, number> };
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  let income = 0;
  for (const [k, v] of Object.entries(st.income ?? {})) if (!OFFLINE.nonIncomeKinds.includes(k)) income += num(v);
  const insp = world.inspection as { mark: Record<string, number> };
  insp.mark = { released: num(st.released), escaped: num(st.escaped), unsolved: num(st.unsolved), income, wages: num(st.spend?.wages) };
  // the offline income ring starts now too (offline.ts offlineTick would repair ringMs = 0 itself, one minute late)
  const off = world.offline as { ringMs: number; ringLife: number } | undefined;
  if (off) { off.ringMs = num(world.rtMs); off.ringLife = income; }
}
/** deep-fill missing keys of plain objects (arrays and values that exist are kept as they are) */
export function fillDefaults(o: Record<string, unknown>, dflt: Record<string, unknown>): Record<string, unknown> {
  for (const [k, v] of Object.entries(dflt)) {
    const cur = o[k];
    if (cur === undefined || cur === null && v !== null) o[k] = JSON.parse(JSON.stringify(v));
    else if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' && !Array.isArray(cur)) fillDefaults(cur as Record<string, unknown>, v as Record<string, unknown>);
  }
  return o;
}
export function migrate(doc: SaveDoc): SaveDoc {
  while (doc.v < SAVE_VERSION) { const m = MIGRATIONS[doc.v]; if (!m) throw new Error(`no migration from v${doc.v}`); doc = m(doc); }
  return doc;
}

// ---------------------------------------------------------------- encode / decode
export function encode(w: World, settings: Settings, seq: number, now: number): string {
  const doc: SaveDoc = { v: SAVE_VERSION, seq, savedAt: now, settings, world: worldToPlain(w) };
  const json = JSON.stringify(doc);
  return `${crc32(json).toString(16)}:${LZString.compressToBase64(json)}`;
}
export function decode(s: string | null): SaveDoc | null {
  if (!s) return null;
  const i = s.indexOf(':'); if (i < 0) return null;
  const crc = parseInt(s.slice(0, i), 16);
  let json: string | null = null;
  try { json = LZString.decompressFromBase64(s.slice(i + 1)); } catch { return null; }
  if (!json || crc32(json) !== crc) return null;
  try {
    const doc = JSON.parse(json) as SaveDoc;
    // a save from a newer build (rolled-back release) or without a world is not readable here
    if (!doc || typeof doc !== 'object' || typeof doc.v !== 'number' || doc.v > SAVE_VERSION || !doc.world || typeof doc.world !== 'object') return null;
    return migrate(doc);
  } catch { return null; }
}

/** load the newest valid slot */
export function pickSlot(a: string | null, b: string | null): SaveDoc | null {
  const A = decode(a), B = decode(b);
  if (A && B) return A.seq >= B.seq ? A : B;
  return A ?? B;
}
