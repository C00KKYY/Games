/**
 * Room geometry (SIM_DESIGN §3, Brief §3.4–3.6): size rules, default doors, the deterministic
 * furniture/slot packer and the layout bonuses (adjacency, noise). Pure; no pathfinding import.
 *
 * Packer model, one cell per interior tile:
 *  - FURN = blocking furniture, SLOT = tile an agent sits/stands on while using the room
 *    (beds are FURN, their slot point lies on the bed), everything else is floor.
 *  - First an aisle NETWORK is reserved: aisle rows (+ columns for the wash ring), one spine
 *    column that links them, the door tile and the tile inside it. Furniture only goes on
 *    non-network floor and every slot must touch the network, so every slot is reachable from
 *    the door by construction (tests/unit/layout.test.ts re-checks this with a BFS).
 *  - Layouts are computed in a canonical frame (door on S; door on W for bunk/canteen/wash whose
 *    sprites cannot rotate) and mapped back by mirroring / transposing.
 *  - Several aisle patterns are tried; the first with the most slots wins (capped by roomSlots).
 *  - Door clearance: door tile + inner tile stay free. Exception (Brief §3.6 "1 Kachel
 *    Türfreiraum", pre-built 6x3 block with 6 beds): a bunk bed may stand on the inner tile when
 *    the door tile itself opens onto an aisle along the wall.
 */
import { ROOMS, roomSlots, type RoomType } from '../content/balance';
import type { Side, Slot, Tile, Furniture, LayoutResult } from './types';

const T = 32;                      // world units per tile
export const MAX_ROOM = 12;        // max interior edge (tiles)
/** exported cell codes of packRoomCells().cells */
export const CELL = { free: 0, furniture: 1, slot: 2 } as const;
const FREE = 0, FURN = 1, SLOT = 2, NET = 3, RSV = 4, WALL = 255; // RSV: kept-free floor (counter front)

/** layout bonus numbers (Brief §3.5). TODO(lead): move into content/balance.ts */
export const LAYOUT = {
  adjMaxWalk: 4,       // door-to-door walk length in tiles
  noiseGap: 3,         // workshop/yard closer than this (Chebyshev gap, tiles) to a bunk → noise
  noiseEnergyMult: 0.8,
  pairs: [
    { a: 'wash', b: 'bunk', kind: 'hygieneWalk', value: -0.5 },
    { a: 'workshop', b: 'dock', kind: 'cartTrip', value: -0.4 },
    // library decor does not exist yet: no room has type 'library', so this pair never fires
    { a: 'classroom', b: 'library', kind: 'reform', value: 0.1 },
    { a: 'canteen', b: 'yard', kind: 'mood', value: 5 },
  ],
} as const;

const isFixed = (t: RoomType) => t === 'gate' || t === 'dock' || t === 'office';
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

// ------------------------------------------------------------------ size & door
export const minSize = (t: RoomType) => ({ w: ROOMS[t].minW, h: ROOMS[t].minH });
/** player-buildable size? (min size from ROOMS, max 12x12, fixed structures never) */
export const sizeOk = (t: RoomType, w: number, h: number) =>
  !isFixed(t) && Number.isInteger(w) && Number.isInteger(h)
  && w >= ROOMS[t].minW && h >= ROOMS[t].minH && w <= MAX_ROOM && h <= MAX_ROOM;

/** door tile (interior coords, same space as x/y) in the middle of `side`; even lengths → lower middle */
export function defaultDoor(_t: RoomType, x: number, y: number, w: number, h: number, side: Side) {
  const mx = x + ((w - 1) >> 1), my = y + ((h - 1) >> 1);
  switch (side) {
    case 'N': return { x: mx, y, side };
    case 'S': return { x: mx, y: y + h - 1, side };
    case 'W': return { x, y: my, side };
    default: return { x: x + w - 1, y: my, side };
  }
}

// ------------------------------------------------------------------ packer
type Kind = 'bed' | 'counter' | 'table' | 'shower' | 'station' | 'desk' | 'board' | 'gdesk' | 'hoop' | 'ball';
interface Rect { k: Kind; x: number; y: number; w: number; h: number }
/** slot in frame tiles; (fx, fy) = tile it faces (-1 = kind default); it = rect it lies on (-1 = none) */
interface FSlot { x: number; y: number; fx: number; fy: number; it: number }
interface Spot { x: number; y: number; dir: Side; kind: string }
/** aisle rows / columns, spine column (W frame), opt = type option (canteen: 1 = no kept-free counter front) */
interface Cand { rows: number[]; cols: number[]; sc: number; opt: number }
/** canonical frame: tr = transpose, mx/my = mirror in frame space; w/h = frame size */
interface Frame { tr: boolean; mx: boolean; my: boolean; w: number; h: number }

const SLOT_KIND: Partial<Record<RoomType, string>> = { bunk: 'bed', canteen: 'seat', wash: 'shower', workshop: 'station', classroom: 'desk', yard: 'spot' };
/** types whose sprites have no fixed orientation: W/E doors are transposed to a S-door frame */
const TRANSPOSE: Partial<Record<RoomType, true>> = { workshop: true, classroom: true, yard: true, guard: true };

class Packer {
  c: Uint8Array;
  items: Rect[] = []; slots: FSlot[] = []; staff: Spot[] = [];
  ix = 0; iy = 0; needI = true; opt = 0;
  constructor(readonly type: RoomType, readonly w: number, readonly h: number, readonly side: 'S' | 'W',
    readonly dx: number, readonly dy: number, readonly cap: number) { this.c = new Uint8Array(w * h); }

  at(x: number, y: number) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? WALL : this.c[y * this.w + x]; }
  free(x: number, y: number) { return this.at(x, y) === FREE; }
  touch(x: number, y: number) { return this.at(x - 1, y) === NET || this.at(x + 1, y) === NET || this.at(x, y - 1) === NET || this.at(x, y + 1) === NET; }
  /** reachable via the aisle directly or through one neighbouring slot that touches the aisle (squeezing along a bench / desk row) */
  touch2(x: number, y: number) {
    if (this.touch(x, y)) return true;
    const n = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
    return n.some(([i, j]) => this.at(i, j) === SLOT && this.touch(i, j));
  }
  put(x: number, y: number, v: number) { this.c[y * this.w + x] = v; }
  full() { return this.slots.length >= this.cap; }
  rect(k: Kind, x: number, y: number, w: number, h: number, mark: number) {
    if (mark !== FREE) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.put(i, j, mark);
    this.items.push({ k, x, y, w, h }); return this.items.length - 1;
  }
  slot(x: number, y: number, fx: number, fy: number, it = -1) { this.put(x, y, SLOT); this.slots.push({ x, y, fx, fy, it }); }

  /** reserve the aisle network of one candidate */
  reset(cd: Cand) {
    const { w, h, dx, dy } = this;
    this.c.fill(FREE); this.items.length = 0; this.slots.length = 0; this.staff.length = 0; this.opt = cd.opt;
    for (const r of cd.rows) for (let x = 0; x < w; x++) this.put(x, r, NET);
    for (const q of cd.cols) for (let y = 0; y < h; y++) this.put(q, y, NET);
    this.needI = !(this.type === 'bunk' && (this.at(dx, dy) === NET || this.touch(dx, dy)));
    this.ix = this.side === 'S' ? dx : dx + 1; this.iy = this.side === 'S' ? dy - 1 : dy;
    // spine: S frame → door column from the topmost aisle row down to the door; W frame → column sc over all aisle rows + door row
    let lo = this.needI ? this.iy : dy, hi = dy;
    for (const r of cd.rows) { if (r < lo) lo = r; if (r > hi) hi = r; }
    const sc = this.side === 'S' ? dx : cd.sc;
    for (let y = lo; y <= hi; y++) this.put(sc, y, NET);
    this.put(dx, dy, NET);
    if (this.needI) this.put(this.ix, this.iy, NET);
  }

  place() {
    switch (this.type) {
      case 'bunk': return this.bunk();
      case 'canteen': return this.canteen();
      case 'wash': return this.wash();
      case 'workshop': return this.workshop();
      case 'classroom': return this.classroom();
      case 'yard': return this.yard();
      case 'guard': return this.guard();
    }
  }

  /** beds 1x2 (N-S), each touching an aisle with its head, foot or side */
  bunk() {
    for (let y = 0; y + 1 < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.full()) return;
      if (this.free(x, y) && this.free(x, y + 1) && (this.touch(x, y) || this.touch(x, y + 1)))
        this.slots.push({ x, y: y + 1, fx: -1, fy: -1, it: this.rect('bed', x, y, 1, 2, FURN) }); // slot lies on the bed
    }
  }

  /** counter (2 wide) at the far wall, then 2x2 bench tables (bench above + below the table top); fullest tables first */
  canteen() {
    const { w, h } = this;
    const x0 = this.side === 'S' ? clamp(this.dx - 1, 0, w - 2) : w - 2;
    let cx = -1, cy = -1;
    for (let y = 0; y < h && cx < 0; y++) for (let k = 0; k < 2 * w; k++) {
      const x = this.side === 'S' ? x0 + ((k + 1) >> 1) * (k & 1 ? 1 : -1) : w - 2 - k;
      if (x >= 0 && x <= w - 2 && this.free(x, y) && this.free(x + 1, y)) { cx = x; cy = y; break; }
    }
    if (cx >= 0) {
      this.rect('counter', cx, cy, 2, 1, FURN);
      if (!this.opt) for (let i = 0; i < 2; i++) if (this.free(cx + i, cy + 1)) this.put(cx + i, cy + 1, RSV);
      this.staff.push({ x: cx + 1, y: cy + 0.3, dir: 'S', kind: 'cook' });
    }
    // tables: 2x2 block = back bench / table top / front bench (benchTable sprite); a bench seat is a slot when its tile touches the aisle
    const ok = (x: number, y: number) => this.touch(x, y);
    for (let need = 2; need >= 1; need--) for (let y = 0; y + 1 < h; y++) for (let x = 0; x + 1 < w; x++) {
      if (this.full()) return;
      if (!this.free(x, y) || !this.free(x + 1, y) || !this.free(x, y + 1) || !this.free(x + 1, y + 1)) continue;
      if (+ok(x, y) + +ok(x + 1, y) + +ok(x, y + 1) + +ok(x + 1, y + 1) < need) continue;
      this.rect('table', x, y, 2, 2, FURN);
      // seats directly at the aisle first, then those reachable through a neighbouring seat
      for (let pass = 0; pass < 2; pass++) for (let s = 0; s < 4; s++) {
        const sx = x + (s & 1), sy = y + (s >> 1);
        if (this.full() || this.at(sx, sy) === SLOT) continue;
        if (pass === 0 ? ok(sx, sy) : this.touch2(sx, sy)) this.slot(sx, sy, sx, s < 2 ? y + 1 : y);  // back bench faces S, front bench N
      }
    }
  }

  /** shower stalls (1 tile, agent stands in it) along the walls: far wall, sides, door wall */
  wash() {
    const { w, h } = this;
    const stall = (x: number, y: number) => {
      if (this.full() || !this.free(x, y) || !this.touch(x, y)) return;
      // face the first aisle neighbour (N, E, S, W)
      const [fx, fy] = this.at(x, y - 1) === NET ? [x, y - 1] : this.at(x + 1, y) === NET ? [x + 1, y] : this.at(x, y + 1) === NET ? [x, y + 1] : [x - 1, y];
      this.slot(x, y, fx, fy, this.rect('shower', x, y, 1, 1, FREE));
    };
    for (let x = 0; x < w; x++) stall(x, 0);
    for (let y = 1; y < h; y++) stall(0, y);
    for (let y = 1; y < h; y++) stall(w - 1, y);
    for (let x = 1; x < w - 1; x++) stall(x, h - 1);
  }

  /** stations: knitting station + worker stool side by side, aisle in front (2x2 blocks) */
  workshop() {
    for (let y = 0; y < this.h; y++) for (let x = 0; x + 1 < this.w; x++) {
      if (this.full()) break;
      if (!this.free(x, y) || !this.free(x + 1, y)) continue;
      if (this.touch(x + 1, y)) { this.rect('station', x, y, 1, 1, FURN); this.slot(x + 1, y, x, y); }
      else if (this.touch(x, y)) { this.rect('station', x + 1, y, 1, 1, FURN); this.slot(x, y, x + 1, y); }
    }
    // foreman: aisle tile nearest to the room centre
    const cx = (this.w - 1) / 2, cy = (this.h - 1) / 2;
    let bx = this.dx, by = this.dy, bd = Infinity;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (this.at(x, y) === NET && d < bd) { bd = d; bx = x; by = y; }
    }
    this.staff.push({ x: bx + 0.5, y: by + 0.5, dir: 'S', kind: 'foreman' });
  }

  /** chalkboard on the far wall (row 0 = teacher aisle), one-tile school desks (desk + chair), facing the board */
  classroom() {
    const bw = Math.min(2, this.w), bx = Math.max(0, (this.w >> 1) - 1);
    this.rect('board', bx, 0, bw, 1, FREE);
    this.staff.push({ x: bx + bw / 2, y: 0.5, dir: 'S', kind: 'teacher' });
    for (let pass = 0; pass < 2; pass++) for (let y = 1; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.full()) return;
      if (!this.free(x, y) || (x === this.ix && y === this.iy)) continue;
      if (pass === 0 ? this.touch(x, y) : this.touch2(x, y)) { this.rect('desk', x, y, 1, 1, FREE); this.slot(x, y, x, y - 1); }
    }
  }

  /** standing spots, every other column first so they spread over the yard */
  yard() {
    const hx = (this.w - 1) >> 1;
    this.rect('hoop', hx, 0, 1, 1, FREE);
    this.rect('ball', hx, (this.h - 1) >> 1, 1, 1, FREE);
    for (let pass = 0; pass < 2; pass++) for (let y = 0; y < this.h; y++) for (let x = pass; x < this.w; x += 2) {
      if (this.full()) return;
      if (this.free(x, y) && this.touch(x, y)) this.slot(x, y, -1, -1);
    }
  }

  /** guard behind a desk at the far wall, facing the door; no rascal slots */
  guard() {
    const cx = (this.w - 1) / 2;
    let gx = -1;
    for (let x = 0; x < this.w; x++)
      if (x !== this.dx && this.free(x, 1) && (gx < 0 || Math.abs(x - cx) < Math.abs(gx - cx))) gx = x;
    if (gx >= 0) { this.rect('gdesk', gx, 1, 1, 1, FURN); this.staff.push({ x: gx + 0.5, y: 0.5, dir: 'S', kind: 'guard' }); }
    else this.staff.push({ x: this.w / 2, y: 0.5, dir: 'S', kind: 'guard' });
  }

  /** janitor waits beside the door: first floor tile next to the inner tile or the door that is not a queue tile */
  janitor(q: [number, number][]) {
    const c: [number, number][] = this.side === 'S'
      ? [[this.ix - 1, this.iy], [this.ix + 1, this.iy], [this.dx - 1, this.dy], [this.dx + 1, this.dy]]
      : [[this.ix, this.iy - 1], [this.ix, this.iy + 1], [this.dx, this.dy - 1], [this.dx, this.dy + 1]];
    let j: [number, number] = [this.ix, this.iy];
    for (const p of c) {
      const v = this.at(p[0], p[1]);
      if ((v === FREE || v === NET || v === RSV) && !q.some(t => t[0] === p[0] && t[1] === p[1])) { j = p; break; }
    }
    this.staff.push({ x: j[0] + 0.5, y: j[1] + 0.5, dir: this.side === 'S' ? 'N' : 'E', kind: 'janitor' });
  }

  /** waiting tiles on the door wall, contiguous outwards from the door, never next to furniture/slots */
  queue(): [number, number][] {
    const out: [number, number][] = [];
    const ok = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h || (x === this.ix && y === this.iy)) return false;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const v = this.at(x + i, y + j); if (v === FURN || v === SLOT) return false; }
      return true;
    };
    const max = Math.max(this.w, this.h);
    let lo = true, hi = true;
    for (let d = 1; d < max && out.length < 4; d++) for (let s = -1; s <= 1 && out.length < 4; s += 2) {
      if (s < 0 ? !lo : !hi) continue;
      const x = this.side === 'S' ? this.dx + s * d : this.dx, y = this.side === 'S' ? this.dy : this.dy + s * d;
      if (ok(x, y)) out.push([x, y]); else if (s < 0) lo = false; else hi = false;
    }
    return out;
  }
}

/** aisle-pattern candidates (frame coords); periodic patterns start at the door row */
function candidates(type: RoomType, fw: number, fh: number, side: 'S' | 'W', dx: number, dy: number): Cand[] {
  const out: Cand[] = [];
  const anchor = side === 'S' ? fh - 1 : dy;
  let opt = 0;
  const add = (rows: number[], cols: number[] = []) => {
    if (side === 'S') out.push({ rows, cols, sc: dx, opt });
    else for (let sc = 0; sc < 2; sc++) out.push({ rows, cols, sc, opt });
  };
  const periodic = (p: number, lo: number, base: number[] = []) => {
    for (let k = 0; k < p; k++) {
      const rows = base.slice();
      for (let r = lo; r < fh; r++) if ((((anchor - r - k) % p) + p) % p === 0) rows.push(r);
      add(rows);
    }
  };
  switch (type) {
    case 'bunk': periodic(3, 0); periodic(5, 0); add([]); break;           // BBA… and back-to-back BB A BB
    case 'canteen':                                                          // row 0 = counter; A BB (2x2 tables) …
      for (opt = 0; opt < 2; opt++) { periodic(3, 1); periodic(4, 1); add([]); }
      break;
    case 'wash': {
      const rows = fh - 2 > 1 ? [1, fh - 2] : [1], cols = fw - 2 > 1 ? [1, fw - 2] : [1];
      add([1]); add(rows); add(rows, cols); break;                         // far-wall row, two rows, ring
    }
    case 'workshop': periodic(2, 0); periodic(3, 0); add([]); break;
    case 'classroom': periodic(3, 1, [0]); add([0]); break;                // row 0 = teacher aisle at the board
    case 'yard': periodic(2, 0); add([]); break;
    case 'guard': add([0]); break;
    default: break;
  }
  return out;
}

// frame ↔ room mapping (mirror in frame space, then transpose)
const toFrame = (f: Frame, x: number, y: number): [number, number] => {
  const ux = f.tr ? y : x, uy = f.tr ? x : y;
  return [f.mx ? f.w - 1 - ux : ux, f.my ? f.h - 1 - uy : uy];
};
const toRoom = (f: Frame, x: number, y: number): [number, number] => {
  const ux = f.mx ? f.w - 1 - x : x, uy = f.my ? f.h - 1 - y : y;
  return f.tr ? [uy, ux] : [ux, uy];
};
const toRoomP = (f: Frame, x: number, y: number): [number, number] => {
  const ux = f.mx ? f.w - x : x, uy = f.my ? f.h - y : y;
  return f.tr ? [uy, ux] : [ux, uy];
};
const FLIP_X: Record<Side, Side> = { N: 'N', S: 'S', E: 'W', W: 'E' };
const FLIP_Y: Record<Side, Side> = { N: 'S', S: 'N', E: 'E', W: 'W' };
const TRANSP: Record<Side, Side> = { N: 'W', W: 'N', S: 'E', E: 'S' };
const dirToRoom = (f: Frame, d: Side): Side => {
  if (f.mx) d = FLIP_X[d];
  if (f.my) d = FLIP_Y[d];
  return f.tr ? TRANSP[d] : d;
};
const dirTo = (x: number, y: number, tx: number, ty: number): Side =>
  tx > x ? 'E' : tx < x ? 'W' : ty < y ? 'N' : 'S';

/** sprite + world position (bottom-anchored, relative to interior top-left) for a room-space rect */
function sprite(r: Rect, h: number, stage: number): Furniture {
  const X = r.x * T, B = (r.y + r.h) * T, maxB = h * T - 2;
  switch (r.k) {
    case 'bed': return { sprite: 'bunkBed', x: X, y: B + 2 };
    case 'counter': return { sprite: stage >= 2 ? 'counter2' : 'counter1', x: X, y: Math.min(B + 18, maxB) };
    // 2x2 block, sprite centred; z puts back-bench sitters behind, front-bench sitters in front
    case 'table': return stage >= 2 ? { sprite: 'bistroTable', x: X + 8, y: B - 10, z: -20 } : { sprite: 'benchTable', x: X, y: B - 9, z: -20 };
    case 'shower': return { sprite: 'shower', x: X, y: Math.min(B + 14, maxB) };
    case 'station': return { sprite: 'knitStation', x: X, y: B };
    case 'desk': return { sprite: 'desk', x: X, y: B, z: -12 };
    case 'board': return { sprite: 'chalkboard', x: X, y: B };
    case 'gdesk': return { sprite: 'guardDesk', x: X, y: B };
    case 'hoop': return { sprite: 'hoop', x: X, y: B };
    default: return { sprite: 'yardBall', x: X + 8, y: B - 8 };
  }
}

/**
 * Pack a room. `door` is in interior-local tile coords, unless the room origin (ox, oy) is given,
 * then `door` may be absolute (same space as the room's x/y). Returns the layout plus a w*h cell map
 * (CELL codes, room-local, row-major) for debug overlays and tests.
 */
export function packRoomCells(type: RoomType, w: number, h: number, door: { x: number; y: number; side: Side }, stage = 1, ox = 0, oy = 0): { layout: LayoutResult; cells: Uint8Array } {
  const layout: LayoutResult = { slots: [], queue: [], furniture: [], staffSpots: [] };
  const cells = new Uint8Array(Math.max(0, w * h));
  if (isFixed(type) || !(w >= 1 && h >= 1)) return { layout, cells };
  const sd = door.side;
  const tr = !!TRANSPOSE[type] && (sd === 'W' || sd === 'E');
  const f: Frame = { tr, mx: !tr && sd === 'E', my: sd === 'N' || (tr && sd === 'W'), w: tr ? h : w, h: tr ? w : h };
  const fside = sd === 'S' || sd === 'N' || tr ? 'S' : 'W';
  // snap the door onto its wall (local coords), then into the frame
  const rx = sd === 'W' ? 0 : sd === 'E' ? w - 1 : clamp(door.x - ox, 0, w - 1);
  const ry = sd === 'N' ? 0 : sd === 'S' ? h - 1 : clamp(door.y - oy, 0, h - 1);
  const [fdx, fdy] = toFrame(f, rx, ry);
  const cap = type === 'guard' ? 0 : roomSlots(type, w, h);
  const p = new Packer(type, f.w, f.h, fside, fdx, fdy, cap);

  // try all aisle patterns, keep the first with the most slots (stop early at the cap)
  const cands = candidates(type, f.w, f.h, fside, fdx, fdy);
  let best = 0, bestN = -1;
  for (let i = 0; i < cands.length; i++) {
    p.reset(cands[i]); p.place();
    if (p.slots.length > bestN) { bestN = p.slots.length; best = i; }
    if (bestN >= cap) break;
  }
  p.reset(cands[best]); p.place();

  // ---- map back to room space
  for (let fy = 0; fy < f.h; fy++) for (let fx = 0; fx < f.w; fx++) {
    const v = p.c[fy * f.w + fx];
    if (v === FURN || v === SLOT) { const [x, y] = toRoom(f, fx, fy); cells[y * w + x] = v; }
  }
  const rects = p.items.map((r): Rect => {
    const [ax, ay] = toRoom(f, r.x, r.y), [bx, by] = toRoom(f, r.x + r.w - 1, r.y + r.h - 1);
    return { k: r.k, x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax) + 1, h: Math.abs(by - ay) + 1 };
  });
  for (const r of rects) layout.furniture.push(sprite(r, h, stage));
  const kind = SLOT_KIND[type] ?? 'slot';
  for (const s of p.slots) {
    const [x, y] = toRoom(f, s.x, s.y);
    let sl: Slot;
    if (s.it >= 0 && rects[s.it].k === 'bed') { const r = rects[s.it]; sl = { x: r.x + r.w / 2, y: r.y + r.h / 2, dir: 'S', kind }; }
    else {
      const dir = s.fx < 0 ? 'S' : (() => { const [tx, ty] = toRoom(f, s.fx, s.fy); return dirTo(x, y, tx, ty); })();
      // bench seats sit on the benchTable sprite's benches (back bench high in its tile, front bench low)
      const off = kind === 'seat' ? (dir === 'S' ? 0.45 : dir === 'N' ? 0.75 : 0.5) : 0.5;
      sl = { x: x + 0.5, y: y + off, dir, kind };
    }
    layout.slots.push(sl);
  }
  layout.slots.sort((a, b) => a.y - b.y || a.x - b.x);
  const q = p.queue();
  if (type === 'wash') p.janitor(q);
  for (const [qx, qy] of q) { const [x, y] = toRoom(f, qx, qy); const t: Tile = { x, y }; layout.queue.push(t); }
  for (const s of p.staff) { const [x, y] = toRoomP(f, s.x, s.y); layout.staffSpots.push({ x, y, dir: dirToRoom(f, s.dir), kind: s.kind }); }
  return { layout, cells };
}

/** deterministic layout of a room; stage (1..3) only changes canteen sprites, never slots */
export const packRoom = (type: RoomType, w: number, h: number, door: { x: number; y: number; side: Side }, stage = 1, ox = 0, oy = 0): LayoutResult =>
  packRoomCells(type, w, h, door, stage, ox, oy).layout;

/** door along `side` that maximises capacity (ties: closest to the middle). x,y = room origin; returns absolute coords */
export function bestDoor(type: RoomType, x: number, y: number, w: number, h: number, side: Side, allowed?: (dx: number, dy: number) => boolean) {
  const len = side === 'N' || side === 'S' ? w : h, mid = (len - 1) >> 1;
  let best = defaultDoor(type, x, y, w, h, side), bn = -1, bd = Infinity;
  for (let o = 0; o < len; o++) {
    const d = { x: side === 'E' ? x + w - 1 : side === 'W' ? x : x + o, y: side === 'S' ? y + h - 1 : side === 'N' ? y : y + o, side };
    if (allowed && !allowed(d.x, d.y)) continue;
    const n = packRoom(type, w, h, d, 1, x, y).slots.length, dist = Math.abs(o - mid);
    if (n > bn || (n === bn && dist < bd)) { bn = n; bd = dist; best = d; }
  }
  return best;
}

// ------------------------------------------------------------------ layout bonuses (Brief §3.5)
export interface LayoutRoom { id: number; type: string; door: { x: number; y: number; side: Side }; x: number; y: number; w: number; h: number }
const byId = <R extends { id: number }>(rooms: readonly R[]) => rooms.slice().sort((a, b) => a.id - b.id);

/** active neighbour bonuses: door-to-door walk ≤ 4 tiles (walkLen in tiles) */
export function adjacencyBonuses(rooms: readonly LayoutRoom[], walkLen: (aId: number, bId: number) => number): { a: number; b: number; kind: string; value: number }[] {
  const out: { a: number; b: number; kind: string; value: number }[] = [];
  const rs = byId(rooms);
  for (const pr of LAYOUT.pairs) for (const ra of rs) {
    if (ra.type !== pr.a) continue;
    for (const rb of rs) if (rb.type === pr.b && rb.id !== ra.id && walkLen(ra.id, rb.id) <= LAYOUT.adjMaxWalk) out.push({ a: ra.id, b: rb.id, kind: pr.kind, value: pr.value });
  }
  return out;
}

/** bunks with a workshop or yard closer than 3 tiles (Chebyshev gap between interior rects) → energy refill ×0.8 */
export function noisePenalty(rooms: readonly Omit<LayoutRoom, 'door'>[]): { bunkId: number; sourceId: number }[] {
  const out: { bunkId: number; sourceId: number }[] = [];
  const rs = byId(rooms);
  for (const b of rs) {
    if (b.type !== 'bunk') continue;
    for (const s of rs) {
      if (s.type !== 'workshop' && s.type !== 'yard') continue;
      const gx = Math.max(0, s.x - (b.x + b.w), b.x - (s.x + s.w)), gy = Math.max(0, s.y - (b.y + b.h), b.y - (s.y + s.h));
      if (Math.max(gx, gy) < LAYOUT.noiseGap) out.push({ bunkId: b.id, sourceId: s.id });
    }
  }
  return out;
}
