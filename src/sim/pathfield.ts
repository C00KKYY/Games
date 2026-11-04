/**
 * Grid helpers and pathfinding (docs/SIM_DESIGN.md §1–2). Pure and deterministic.
 *
 * Distance field: 8-neighbour Dijkstra from the targets. field[i] = cost of the cheapest allowed walk
 * from tile i to the nearest target (straight 10, diagonal 14, stepping ONTO Path/Dock ×0.8 → 8 / 11).
 * A step i→j is allowed iff `canStep(g, i, dir)`; only walkable tiles (and the targets themselves) get
 * a finite value, so an agent following `nextStep` never crosses a wall, cuts a corner or enters water.
 * All scratch memory is module-level and reused (grown on demand), so steady-state calls do not allocate.
 */
import { Ground } from '../content/site1';
import { H, UNREACHABLE, W, type Dir8, type Grid, type Side } from './types';

export { UNREACHABLE };

/** Dir8 deltas in the fixed order N, E, S, W, NE, SE, SW, NW (also the nextStep tie order) */
export const DX: readonly number[] = [0, 1, 0, -1, 1, 1, -1, -1];
export const DY: readonly number[] = [-1, 0, 1, 0, -1, 1, 1, -1];

const COST_STRAIGHT = 10, COST_DIAG = 14;
// ×0.8 on Path/Dock, rounded (8, 11.2 → 11)
const COST_STRAIGHT_PATH = Math.round(COST_STRAIGHT * 0.8), COST_DIAG_PATH = Math.round(COST_DIAG * 0.8);

// ------------------------------------------------------------------ grid basics
export function makeGrid(w = W, h = H): Grid {
  const n = w * h;
  return {
    w, h,
    ground: new Uint8Array(n).fill(Ground.Grass),
    owned: new Uint8Array(n), roomAt: new Int16Array(n),
    wallE: new Uint8Array(n), wallS: new Uint8Array(n),
    blocked: new Uint8Array(n), fixed: new Uint8Array(n), road: new Uint8Array(n),
  };
}

/** tile index on the standard W-wide map (use y*g.w+x for other widths) */
export const idx = (x: number, y: number) => y * W + x;
export const inBounds = (g: Grid, x: number, y: number) => x >= 0 && y >= 0 && x < g.w && y < g.h;
export const walkable = (g: Grid, i: number) =>
  i >= 0 && i < g.ground.length && g.ground[i] !== Ground.Water && g.blocked[i] === 0;

/** bits 0..3 (N E S W): orthogonal step from i is in bounds, onto a walkable tile, crosses no wall */
function orthoBits(g: Grid, i: number): number {
  const w = g.w, n = w * g.h, x = i % w, gr = g.ground, bl = g.blocked;
  let m = 0, j = i - w;
  if (j >= 0 && gr[j] !== Ground.Water && bl[j] === 0 && g.wallS[j] === 0) m |= 1;
  j = i + 1;
  if (x < w - 1 && gr[j] !== Ground.Water && bl[j] === 0 && g.wallE[i] === 0) m |= 2;
  j = i + w;
  if (j < n && gr[j] !== Ground.Water && bl[j] === 0 && g.wallS[i] === 0) m |= 4;
  j = i - 1;
  if (x > 0 && gr[j] !== Ground.Water && bl[j] === 0 && g.wallE[j] === 0) m |= 8;
  return m;
}

/**
 * Adds diagonal bits 4..7 (NE SE SW NW) to the orthogonal bits m of a tile, given the orthogonal bits of
 * its N/E/S/W neighbours (only read when the matching bit of m is set). A diagonal needs BOTH two-step
 * routes, e.g. NE = N then E and E then N, so no corner is cut past a wall end or an unwalkable tile.
 */
const withDiag = (m: number, mN: number, mE: number, mS: number, mW: number) => m
  | ((m & 3) === 3 && (mN & 2) && (mE & 1) ? 16 : 0)
  | ((m & 6) === 6 && (mS & 2) && (mE & 4) ? 32 : 0)
  | ((m & 12) === 12 && (mS & 8) && (mW & 4) ? 64 : 0)
  | ((m & 9) === 9 && (mN & 8) && (mW & 1) ? 128 : 0);

/** 8-bit mask of allowed steps from tile i (bit d = Dir8 d). The source tile itself is not checked. */
export function stepMask(g: Grid, i: number): number {
  if (i < 0 || i >= g.w * g.h) return 0;
  const m = orthoBits(g, i), w = g.w;
  return withDiag(m, m & 1 ? orthoBits(g, i - w) : 0, m & 2 ? orthoBits(g, i + 1) : 0,
    m & 4 ? orthoBits(g, i + w) : 0, m & 8 ? orthoBits(g, i - 1) : 0);
}

export function canStep(g: Grid, from: number, dir: Dir8): boolean {
  if (from < 0 || from >= g.w * g.h) return false;
  return (((dir < 4 ? orthoBits(g, from) : stepMask(g, from)) >> dir) & 1) === 1;
}

/** cost of a step onto tile `to` */
export function stepCost(g: Grid, to: number, diagonal: boolean): number {
  const gr = g.ground[to], disc = gr === Ground.Path || gr === Ground.Dock;
  return diagonal ? (disc ? COST_DIAG_PATH : COST_DIAG) : (disc ? COST_STRAIGHT_PATH : COST_STRAIGHT);
}

// ------------------------------------------------------------------ scratch buffers
let cap = 0;
let walk = new Uint8Array(0);    // 1 = walkable
let oMask = new Uint8Array(0);   // orthogonal step bits per walkable tile (0 for unwalkable)
let heap = new Int32Array(0);    // binary min-heap of tile indices keyed by the field
let hpos = new Int32Array(0);    // heap position per tile, -1 = not in heap
let queue = new Int32Array(0);   // BFS queue (components)
let comp = new Int32Array(0);    // component labels for reachable()
const OFF = new Int32Array(8);

function ensure(g: Grid): number {
  const n = g.w * g.h;
  if (n > cap) {
    cap = n;
    walk = new Uint8Array(n); oMask = new Uint8Array(n);
    heap = new Int32Array(n); hpos = new Int32Array(n);
    queue = new Int32Array(n); comp = new Int32Array(n);
  }
  for (let d = 0; d < 8; d++) OFF[d] = DY[d] * g.w + DX[d];
  return n;
}

// ------------------------------------------------------------------ distance fields
/**
 * Dijkstra distance field to the nearest of `targets` (distance 0; out-of-range indices are ignored).
 * Unwalkable targets still get 0 but nothing can step onto them, so they do not propagate.
 * Shortest-path distances are unique, so the result does not depend on heap tie order or target order.
 */
export function distanceField(g: Grid, targets: readonly number[], out?: Uint16Array): Uint16Array {
  const n = ensure(g), w = g.w, h = g.h, gr = g.ground, bl = g.blocked, wE = g.wallE, wS = g.wallS;
  const wk = walk, om = oMask, hp = heap, pos = hpos;
  const f = out && out.length >= n ? out : new Uint16Array(n);
  f.fill(UNREACHABLE, 0, n);
  pos.fill(-1, 0, n);
  for (let i = 0; i < n; i++) wk[i] = gr[i] !== Ground.Water && bl[i] === 0 ? 1 : 0;
  // orthogonal step bits (same rules as orthoBits) of walkable tiles
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      if (wk[i] === 0) { om[i] = 0; continue; }
      let m = 0;
      if (y > 0 && wk[i - w] === 1 && wS[i - w] === 0) m = 1;
      if (x < w - 1 && wk[i + 1] === 1 && wE[i] === 0) m |= 2;
      if (y < h - 1 && wk[i + w] === 1 && wS[i] === 0) m |= 4;
      if (x > 0 && wk[i - 1] === 1 && wE[i - 1] === 0) m |= 8;
      om[i] = m;
    }
  }
  // seed: all keys 0, so any order is a valid heap
  let len = 0;
  for (let k = 0; k < targets.length; k++) {
    const t = targets[k];
    if (t < 0 || t >= n || f[t] === 0) continue;
    f[t] = 0; hp[len] = t; pos[t] = len; len++;
  }
  while (len > 0) {
    // pop the minimum
    const j = hp[0];
    pos[j] = -1;
    if (--len > 0) {
      const t = hp[len], v = f[t];
      let k = 0;
      for (;;) {
        let c = 2 * k + 1;
        if (c >= len) break;
        if (c + 1 < len && f[hp[c + 1]] < f[hp[c]]) c++;
        const ct = hp[c];
        if (f[ct] >= v) break;
        hp[k] = ct; pos[ct] = k; k = c;
      }
      hp[k] = t; pos[t] = k;
    }
    // Steps between walkable tiles are symmetric (walls are edges, a diagonal needs all four sub-steps),
    // so the tiles that may step ONTO j are exactly those j may step to. Unwalkable j (a target) has m = 0.
    const m = om[j];
    if (m === 0) continue;
    const s = withDiag(m, m & 1 ? om[j - w] : 0, m & 2 ? om[j + 1] : 0, m & 4 ? om[j + w] : 0, m & 8 ? om[j - 1] : 0);
    const gj = gr[j], disc = gj === Ground.Path || gj === Ground.Dock;
    const c0 = disc ? COST_STRAIGHT_PATH : COST_STRAIGHT, c1 = disc ? COST_DIAG_PATH : COST_DIAG, dj = f[j];
    for (let d = 0; d < 8; d++) {
      if (((s >> d) & 1) === 0) continue;
      const i = j + OFF[d], nd = dj + (d < 4 ? c0 : c1);
      if (nd >= f[i]) continue; // also keeps values < 0xFFFF, no Uint16 wrap
      f[i] = nd;
      // push or decrease-key, then sift up
      let k = pos[i];
      if (k < 0) k = len++;
      while (k > 0) {
        const p = (k - 1) >> 1, pt = hp[p];
        if (f[pt] <= nd) break;
        hp[k] = pt; pos[pt] = k; k = p;
      }
      hp[k] = i; pos[i] = k;
    }
  }
  return f;
}

/**
 * Neighbour index with the smallest field value among allowed steps; it must be strictly smaller
 * than field[i]. Ties keep the first in N, E, S, W, NE, SE, SW, NW. −1 at a target or when unreachable.
 */
export function nextStep(g: Grid, field: Uint16Array, i: number): number {
  if (i < 0 || i >= field.length) return -1;
  const fi = field[i];
  if (fi === 0 || fi === UNREACHABLE) return -1;
  const s = stepMask(g, i), w = g.w;
  let best = -1, bv = fi;
  for (let d = 0; d < 8; d++) {
    if (((s >> d) & 1) === 0) continue;
    const j = i + DY[d] * w + DX[d], v = field[j];
    if (v < bv) { bv = v; best = j; }
  }
  return best;
}

// ------------------------------------------------------------------ connectivity
/** 4-connected component labels (0, 1, … in index order of the first tile) respecting walls; −1 = unwalkable */
export function components(g: Grid, out?: Int32Array): Int32Array {
  const n = ensure(g);
  const c = out && out.length >= n ? out : new Int32Array(n);
  c.fill(-1, 0, n);
  let label = 0;
  for (let s = 0; s < n; s++) {
    if (c[s] !== -1 || !walkable(g, s)) continue;
    c[s] = label; queue[0] = s;
    let head = 0, tail = 1;
    while (head < tail) {
      const i = queue[head++], m = orthoBits(g, i);
      for (let d = 0; d < 4; d++) {
        if (((m >> d) & 1) === 0) continue;
        const j = i + OFF[d];
        if (c[j] === -1) { c[j] = label; queue[tail++] = j; }
      }
    }
    label++;
  }
  return c;
}

/** a and b are walkable and connected (diagonal steps never connect more than 4-connectivity does) */
export function reachable(g: Grid, a: number, b: number): boolean {
  const n = g.w * g.h;
  if (a < 0 || b < 0 || a >= n || b >= n) return false;
  // use the returned array: components() may replace the module scratch buffer (review finding)
  const c = components(g, comp);
  return c[a] >= 0 && c[a] === c[b];
}

// ------------------------------------------------------------------ walls
export interface DoorLike { x: number; y: number; side: Side }
export interface WallRoom { x: number; y: number; w: number; h: number; door?: DoorLike | null; links?: readonly DoorLike[] }

/** sets (v=1) or clears (v=0) the wall on `side` of tile (x, y); edges on the map border are ignored */
export function setWall(g: Grid, x: number, y: number, side: Side, v: 0 | 1) {
  if (!inBounds(g, x, y)) return;
  const i = y * g.w + x;
  if (side === 'N') { if (y > 0) g.wallS[i - g.w] = v; }
  else if (side === 'S') { if (y < g.h - 1) g.wallS[i] = v; }
  else if (side === 'W') { if (x > 0) g.wallE[i - 1] = v; }
  else if (x < g.w - 1) g.wallE[i] = v;
}

/** door lies on the boundary row/column of the interior rect that its side names */
const onBoundary = (x: number, y: number, w: number, h: number, d: DoorLike) =>
  d.x >= x && d.x < x + w && d.y >= y && d.y < y + h &&
  (d.side === 'N' ? d.y === y : d.side === 'S' ? d.y === y + h - 1 : d.side === 'W' ? d.x === x : d.x === x + w - 1);

function rectWalls(g: Grid, x: number, y: number, w: number, h: number, v: 0 | 1) {
  for (let tx = x; tx < x + w; tx++) { setWall(g, tx, y, 'N', v); setWall(g, tx, y + h - 1, 'S', v); }
  for (let ty = y; ty < y + h; ty++) { setWall(g, x, ty, 'W', v); setWall(g, x + w - 1, ty, 'E', v); }
}

function openDoors(g: Grid, x: number, y: number, w: number, h: number, doors: readonly DoorLike[]) {
  for (const d of doors) if (onBoundary(x, y, w, h, d)) setWall(g, d.x, d.y, d.side, 0);
}

/** walls on all boundary edges of the interior rect (x, y, w, h), except the edges of `doors` (ignored if not on the boundary) */
export function setRoomWalls(g: Grid, x: number, y: number, w: number, h: number, doors: readonly DoorLike[] = []) {
  rectWalls(g, x, y, w, h, 1);
  openDoors(g, x, y, w, h, doors);
}

/**
 * Removes the boundary walls of the interior rect. `keep(edgeTile, horizontal)` can veto single edges
 * (e.g. one shared with a neighbouring room): horizontal = the edge is wallS[edgeTile], else wallE[edgeTile].
 * Prefer rebuildWalls, which handles shared edges without a callback.
 */
export function clearRoomWalls(g: Grid, x: number, y: number, w: number, h: number, keep?: (edgeTile: number, horizontal: boolean) => boolean) {
  if (!keep) { rectWalls(g, x, y, w, h, 0); return; }
  const gw = g.w;
  const clr = (tx: number, ty: number, side: Side) => {
    if (!inBounds(g, tx, ty)) return;
    const i = ty * gw + tx;
    const e = side === 'N' ? i - gw : side === 'W' ? i - 1 : i, hz = side === 'N' || side === 'S';
    if ((side === 'N' && ty === 0) || (side === 'S' && ty === g.h - 1) || (side === 'W' && tx === 0) || (side === 'E' && tx === gw - 1)) return;
    if (!keep(e, hz)) (hz ? g.wallS : g.wallE)[e] = 0;
  };
  for (let tx = x; tx < x + w; tx++) { clr(tx, y, 'N'); clr(tx, y + h - 1, 'S'); }
  for (let ty = y; ty < y + h; ty++) { clr(x, ty, 'W'); clr(x + w - 1, ty, 'E'); }
}

/**
 * Zeroes all walls and re-applies every room: first all boundary walls, then all doors and links.
 * A shared edge of two touching rooms is one edge, so a door/link listed on either room opens it,
 * and removing a room from the list never removes a wall the other room still needs.
 */
export function rebuildWalls(g: Grid, rooms: readonly WallRoom[]) {
  g.wallE.fill(0); g.wallS.fill(0);
  for (const r of rooms) rectWalls(g, r.x, r.y, r.w, r.h, 1);
  for (const r of rooms) {
    if (r.door && onBoundary(r.x, r.y, r.w, r.h, r.door)) setWall(g, r.door.x, r.door.y, r.door.side, 0);
    if (r.links) openDoors(g, r.x, r.y, r.w, r.h, r.links);
  }
}
