/**
 * Save format (Brief §9.7): versioned JSON → lz-string (base64). Two slots A/B written alternately, each with CRC32.
 * Derived state (walls, room map, distance fields, events) is rebuilt on load. Target < 150 KB.
 */
import LZString from 'lz-string';
import type { World } from '../sim/types';
import { rebuild } from '../sim/world';
import { makeGrid } from '../sim/pathfield';

export const SAVE_VERSION = 1;
export const SLOT_KEYS = ['rrl_save_a', 'rrl_save_b'] as const;
export interface Settings { music: number; sfx: number; ambience: number; mute: boolean; lang: 'en' | 'de' | null; shake: boolean }
export const DEFAULT_SETTINGS: Settings = { music: 0.7, sfx: 0.85, ambience: 0.6, mute: false, lang: null, shake: true };

interface SaveDoc { v: number; seq: number; savedAt: number; settings: Settings; world: Record<string, unknown> }

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
  const { cache: _c, events: _e, eventSeq: _s, grid, ...rest } = w;
  void _c; void _e; void _s;
  const g: Record<string, unknown> = { w: grid.w, h: grid.h };
  for (const k of ['ground', 'owned', 'fixed', 'road', 'blocked'] as const) g[k] = rle(grid[k]);
  return JSON.parse(JSON.stringify({ ...rest, grid: g }));
}
export function plainToWorld(p: Record<string, unknown>): World {
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
  // 1 → 2: example: (d) => { d.world.foo = 0; d.v = 2; return d; }
};
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
  try { return migrate(JSON.parse(json) as SaveDoc); } catch { return null; }
}

/** load the newest valid slot */
export function pickSlot(a: string | null, b: string | null): SaveDoc | null {
  const A = decode(a), B = decode(b);
  if (A && B) return A.seq >= B.seq ? A : B;
  return A ?? B;
}
