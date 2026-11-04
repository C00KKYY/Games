import { describe, it, expect } from 'vitest';
import { packRoom, packRoomCells, defaultDoor, sizeOk, minSize, adjacencyBonuses, noisePenalty, CELL, MAX_ROOM, type LayoutRoom } from '../../src/sim/layout';
import { ROOMS, roomSlots, type RoomType } from '../../src/content/balance';
import type { LayoutResult, Side } from '../../src/sim/types';

const BUILDABLE: RoomType[] = ['bunk', 'canteen', 'wash', 'workshop', 'classroom', 'guard', 'yard'];
const SIDES: Side[] = ['N', 'E', 'S', 'W'];
const KIND: Partial<Record<RoomType, string>> = { bunk: 'bed', canteen: 'seat', wash: 'shower', workshop: 'station', classroom: 'desk', yard: 'spot' };
const SPRITES = new Set(['bunkBed', 'benchTable', 'bistroTable', 'counter1', 'counter2', 'shower', 'knitStation', 'desk', 'chalkboard', 'guardDesk', 'yardBall', 'hoop']);
const INWARD: Record<Side, [number, number]> = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] };

/** local door at offset o along the side */
const doorAt = (w: number, h: number, side: Side, o: number) =>
  ({ x: side === 'W' ? 0 : side === 'E' ? w - 1 : o, y: side === 'N' ? 0 : side === 'S' ? h - 1 : o, side });

/** furniture footprint (tiles) from the sprite position: the inverse of the packer's sprite anchors */
function footprint(f: { sprite: string; x: number; y: number }): { x: number; y: number; w: number; h: number } | null {
  switch (f.sprite) {
    case 'bunkBed': return { x: f.x / 32, y: (f.y - 2) / 32 - 2, w: 1, h: 2 };
    case 'benchTable': return { x: f.x / 32, y: (f.y + 9) / 32 - 2, w: 2, h: 2 };
    case 'bistroTable': return { x: (f.x - 8) / 32, y: (f.y + 10) / 32 - 2, w: 2, h: 2 };
    case 'counter1': case 'counter2': return { x: f.x / 32, y: Math.floor((f.y - 19) / 32), w: 2, h: 1 };
    case 'shower': return { x: f.x / 32, y: Math.floor((f.y - 15) / 32), w: 1, h: 1 };
    case 'knitStation': case 'desk': case 'guardDesk': return { x: f.x / 32, y: f.y / 32 - 1, w: 1, h: 1 };
    default: return null; // wall/decor: chalkboard, hoop, yardBall
  }
}

/** all structural checks for one packed room; returns the layout for further asserts */
function check(type: RoomType, w: number, h: number, door: { x: number; y: number; side: Side }, stage = 1): LayoutResult {
  const tag = `${type} ${w}x${h} door ${door.side}@${door.x},${door.y}`;
  const { layout: L, cells } = packRoomCells(type, w, h, door, stage);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : cells[y * w + x]);
  const isQ = (x: number, y: number) => L.queue.some(q => q.x === x && q.y === y);
  const cap = type === 'guard' ? 0 : roomSlots(type, w, h);

  // counts
  expect(L.slots.length, tag).toBeLessThanOrEqual(cap);
  if (type === 'guard') { expect(L.slots, tag).toEqual([]); expect(L.staffSpots.length, tag).toBe(1); }
  else expect(L.slots.length, tag).toBeGreaterThan(0);

  // slots: inside, unique tile, right kind, on a non-free cell
  const seen = new Set<number>();
  for (const s of L.slots) {
    expect(s.x > 0 && s.x < w && s.y > 0 && s.y < h, `${tag} slot inside ${JSON.stringify(s)}`).toBe(true);
    const tx = Math.floor(s.x), ty = Math.floor(s.y), k = ty * w + tx;
    expect(seen.has(k), `${tag} two slots on tile ${tx},${ty}`).toBe(false); seen.add(k);
    expect(s.kind, tag).toBe(KIND[type]);
    expect(SIDES, tag).toContain(s.dir);
    if (s.kind === 'bed') { expect(Number.isInteger(s.y), tag).toBe(true); expect(at(tx, ty - 1), tag).toBe(CELL.furniture); expect(at(tx, ty), tag).toBe(CELL.furniture); }
    else expect(at(tx, ty), `${tag} slot cell`).toBe(CELL.slot);
  }

  // furniture: known sprites, inside the room, footprints match the cell map (no orphan cells)
  const cover = new Uint8Array(w * h);
  for (const f of L.furniture) {
    expect(SPRITES.has(f.sprite), `${tag} sprite ${f.sprite}`).toBe(true);
    expect(f.x >= 0 && f.x <= w * 32 && f.y >= 0 && f.y <= h * 32 + 4, `${tag} ${f.sprite} at ${f.x},${f.y}`).toBe(true);
    const r = footprint(f); if (!r) continue;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      expect(at(x, y) === CELL.furniture || at(x, y) === CELL.slot, `${tag} ${f.sprite} footprint ${x},${y}`).toBe(true);
      cover[y * w + x] = 1;
    }
  }
  for (const s of L.slots) cover[Math.floor(s.y) * w + Math.floor(s.x)] = 1;
  for (let i = 0; i < w * h; i++) if (cells[i] !== CELL.free) expect(cover[i], `${tag} orphan cell ${i % w},${(i / w) | 0}`).toBe(1);

  // door clearance: door tile free; inner tile free (bunk: or the door opens onto a free tile along the wall)
  const [ix, iy] = [door.x + INWARD[door.side][0], door.y + INWARD[door.side][1]];
  expect(at(door.x, door.y), `${tag} door tile`).toBe(CELL.free);
  const lat = door.side === 'N' || door.side === 'S' ? [[door.x - 1, door.y], [door.x + 1, door.y]] : [[door.x, door.y - 1], [door.x, door.y + 1]];
  if (type === 'bunk') expect(at(ix, iy) === CELL.free || lat.some(([x, y]) => at(x, y) === CELL.free), `${tag} bunk door clearance`).toBe(true);
  else expect(at(ix, iy), `${tag} inner door tile`).toBe(CELL.free);

  // queue: ≤ 4, on the door wall, free, not door / inner tile / slot, unique
  expect(L.queue.length, tag).toBeLessThanOrEqual(4);
  const qs = new Set<number>();
  for (const q of L.queue) {
    expect(at(q.x, q.y), `${tag} queue cell`).toBe(CELL.free);
    expect(door.side === 'N' ? q.y === 0 : door.side === 'S' ? q.y === h - 1 : door.side === 'W' ? q.x === 0 : q.x === w - 1, `${tag} queue on door wall`).toBe(true);
    expect((q.x === door.x && q.y === door.y) || (q.x === ix && q.y === iy), `${tag} queue on entrance`).toBe(false);
    expect(qs.has(q.y * w + q.x), tag).toBe(false); qs.add(q.y * w + q.x);
  }

  // test-local BFS over free and slot tiles from the door (agents squeeze along benches/desk rows), queue tiles blocked
  const reach = new Uint8Array(w * h), stack = [door.y * w + door.x]; reach[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop()!, x = i % w, y = (i / w) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if ((at(nx, ny) !== CELL.free && at(nx, ny) !== CELL.slot) || isQ(nx, ny) || reach[ny * w + nx]) continue;
      reach[ny * w + nx] = 1; stack.push(ny * w + nx);
    }
  }
  const nearReach = (x: number, y: number) => reach[y * w + x] === 1 || [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].some(([nx, ny]) => (at(nx, ny) === CELL.free || at(nx, ny) === CELL.slot) && reach[ny * w + nx] === 1);
  for (const s of L.slots) {
    const tx = Math.floor(s.x), ty = Math.floor(s.y);
    const ok = s.kind === 'bed' ? nearReach(tx, ty - 1) || nearReach(tx, ty) : nearReach(tx, ty);
    expect(ok, `${tag} slot ${tx},${ty} unreachable`).toBe(true);
  }
  // staff spots inside
  for (const s of L.staffSpots) expect(s.x >= 0 && s.x <= w && s.y >= 0 && s.y <= h, `${tag} staff ${JSON.stringify(s)}`).toBe(true);
  return L;
}

describe('size rules', () => {
  it('minSize mirrors ROOMS', () => {
    for (const t of BUILDABLE) expect(minSize(t)).toEqual({ w: ROOMS[t].minW, h: ROOMS[t].minH });
    expect(minSize('canteen')).toEqual({ w: 4, h: 3 });
  });
  it('sizeOk: min size per orientation, max 12x12, fixed types never', () => {
    expect(sizeOk('canteen', 4, 3)).toBe(true);
    expect(sizeOk('canteen', 3, 4)).toBe(false);
    expect(sizeOk('canteen', 3, 3)).toBe(false);
    expect(sizeOk('bunk', MAX_ROOM, MAX_ROOM)).toBe(true);
    expect(sizeOk('bunk', 13, 3)).toBe(false);
    expect(sizeOk('yard', 5, 13)).toBe(false);
    expect(sizeOk('guard', 2, 2)).toBe(true);
    expect(sizeOk('bunk', 3.5, 3)).toBe(false);
    for (const t of ['gate', 'dock', 'office'] as RoomType[]) for (const s of [2, 3, 4, 8]) expect(sizeOk(t, s, s)).toBe(false);
  });
});

describe('defaultDoor', () => {
  it('matches the pre-built rooms of site 1', () => {
    expect(defaultDoor('canteen', 5, 11, 4, 3, 'S')).toEqual({ x: 6, y: 13, side: 'S' });
    expect(defaultDoor('bunk', 10, 11, 6, 3, 'S')).toEqual({ x: 12, y: 13, side: 'S' });
  });
  it('middle of the side, lower middle for even lengths', () => {
    expect(defaultDoor('bunk', 0, 0, 5, 4, 'N')).toEqual({ x: 2, y: 0, side: 'N' });
    expect(defaultDoor('bunk', 0, 0, 4, 4, 'N')).toEqual({ x: 1, y: 0, side: 'N' });
    expect(defaultDoor('bunk', 2, 3, 4, 4, 'W')).toEqual({ x: 2, y: 4, side: 'W' });
    expect(defaultDoor('bunk', 2, 3, 4, 5, 'E')).toEqual({ x: 5, y: 5, side: 'E' });
    expect(defaultDoor('bunk', 2, 3, 4, 5, 'S')).toEqual({ x: 3, y: 7, side: 'S' });
  });
});

describe('packRoom: structural sweep', () => {
  it('every buildable type, sizes min..8, every side, default door', () => {
    for (const t of BUILDABLE) for (let w = ROOMS[t].minW; w <= 8; w++) for (let h = ROOMS[t].minH; h <= 8; h++)
      for (const side of SIDES) { const d = defaultDoor(t, 0, 0, w, h, side); check(t, w, h, d); }
  });
  it('every door position along every side (sizes min..7)', () => {
    for (const t of BUILDABLE) for (let w = ROOMS[t].minW; w <= 7; w++) for (let h = ROOMS[t].minH; h <= 7; h++)
      for (const side of SIDES) for (let o = 0; o < (side === 'N' || side === 'S' ? w : h); o++) check(t, w, h, doorAt(w, h, side, o));
  });
  it('max size 12x12 and long thin rooms', () => {
    for (const t of BUILDABLE) for (const [w, h] of [[12, 12], [12, ROOMS[t].minH], [ROOMS[t].minW, 12]]) for (const side of SIDES) check(t, w, h, defaultDoor(t, 0, 0, w, h, side));
  });
  it('fixed structures pack to an empty layout', () => {
    for (const t of ['gate', 'dock', 'office'] as RoomType[]) expect(packRoom(t, 3, 3, { x: 1, y: 2, side: 'S' })).toEqual({ slots: [], queue: [], furniture: [], staffSpots: [] });
  });
});

/**
 * Documented fit for the default S door (rows h = minH..8, columns w = minW..8): slots placed / roomSlots formula.
 * The formula is reached where 1-tile aisles + door clearance leave room; smaller fits are physical limits:
 * canteen pays for the counter and needs an aisle on both bench sides, classroom keeps the board row free,
 * bunk/workshop lose a column where the spine crosses a band.
 */
const FIT_S: Partial<Record<RoomType, string[]>> = {
  bunk: ['3 4 5 6 7 8', '3 4 5 6 7 8', '5 6 8 10 11 13', '5 7 9 11 13 15', '7 9 11 13 15 17', '7 10 13 16 18 21'],
  canteen: ['4 5 6 7 8', '4 6 8 8 10', '6 8 10 11 13', '8 10 12 14 16', '9 11 14 16 18', '10 13 16 18 21'],
  wash: ['3 4 5 6 7 8', '4 5 6 8 9 10', '5 6 8 10 11 13', '6 8 10 12 14 16', '7 9 11 14 16 18', '8 10 13 15 17 19'],
  workshop: ['4 5 6 7 8', '4 6 7 7 10', '5 7 9 9 12', '6 8 10 11 14', '6 10 11 11 16'],
  classroom: ['5 6 8 9 10', '6 8 10 11 13', '8 10 12 14 16', '9 11 14 16 18', '10 13 16 18 21'],
  yard: ['8 10 11 13', '10 12 14 16', '11 14 16 18', '13 16 18 21'],
};

describe('packRoom: capacity', () => {
  it('matches the documented fit table (S door) and N/S, W/E mirror counts', () => {
    for (const t of Object.keys(FIT_S) as RoomType[]) {
      const rows = FIT_S[t]!;
      for (let h = ROOMS[t].minH; h <= 8; h++) {
        const got: number[] = [];
        for (let w = ROOMS[t].minW; w <= 8; w++) {
          const n = (s: Side) => packRoom(t, w, h, defaultDoor(t, 0, 0, w, h, s)).slots.length;
          got.push(n('S'));
          expect(n('N'), `${t} ${w}x${h} N`).toBe(n('S'));
          expect(n('E'), `${t} ${w}x${h} E`).toBe(n('W'));
        }
        expect(got.join(' '), `${t} h=${h}`).toBe(rows[h - ROOMS[t].minH]);
      }
    }
  });
  it('bunks reach the formula in single-band rooms; workshop and wash mostly do', () => {
    for (let w = 3; w <= 12; w++) expect(packRoom('bunk', w, 3, defaultDoor('bunk', 0, 0, w, 3, 'S')).slots.length).toBe(roomSlots('bunk', w, 3));
    for (const [t, w, h] of [['wash', 6, 6], ['workshop', 6, 6], ['workshop', 4, 4], ['yard', 5, 5]] as [RoomType, number, number][])
      expect(packRoom(t, w, h, defaultDoor(t, 0, 0, w, h, 'S')).slots.length).toBe(roomSlots(t, w, h));
  });
});

describe('packRoom: pre-built rooms', () => {
  it('bunk 6x3, door S at local x=2: 6 beds against the north wall', () => {
    const L = check('bunk', 6, 3, { x: 2, y: 2, side: 'S' });
    expect(L.slots.length).toBe(6);
    expect(L.slots.map(s => [s.x, s.y])).toEqual([[0.5, 1], [1.5, 1], [2.5, 1], [3.5, 1], [4.5, 1], [5.5, 1]]);
    expect(L.furniture.filter(f => f.sprite === 'bunkBed').map(f => [f.x, f.y])).toEqual([[0, 66], [32, 66], [64, 66], [96, 66], [128, 66], [160, 66]]);
  });
  it('canteen 4x3, door S at local x=1: counter + one bench table with 4 seats (formula 1 per 3 tiles = 4)', () => {
    // counter fills the north wall at x 0..1 (cook behind it), the inner door tile is its front;
    // the 2x2 bench table at x 2..3 seats its front bench at the aisle and its back bench through the front bench
    const L = check('canteen', 4, 3, { x: 1, y: 2, side: 'S' });
    expect(roomSlots('canteen', 4, 3)).toBe(4);
    expect(L.slots.length).toBe(4);
    expect(L.furniture.map(f => f.sprite).sort()).toEqual(['benchTable', 'counter1']);
    expect(L.furniture.find(f => f.sprite === 'counter1')).toMatchObject({ x: 0, y: 50 });
    expect(L.staffSpots).toEqual([{ x: 1, y: 0.3, dir: 'S', kind: 'cook' }]);
    expect(L.queue).toEqual([{ x: 0, y: 2 }]);
  });
  it('accepts an absolute door when the room origin is passed', () => {
    expect(packRoom('bunk', 6, 3, { x: 12, y: 13, side: 'S' }, 1, 10, 11)).toEqual(packRoom('bunk', 6, 3, { x: 2, y: 2, side: 'S' }));
    expect(packRoom('canteen', 4, 3, { x: 6, y: 13, side: 'S' }, 1, 5, 11)).toEqual(packRoom('canteen', 4, 3, { x: 1, y: 2, side: 'S' }));
  });
});

describe('packRoom: per-type details', () => {
  it('canteen stage only swaps sprites', () => {
    const d = { x: 2, y: 5, side: 'S' as Side };
    const [a, b, c] = [1, 2, 3].map(s => check('canteen', 6, 6, d, s));
    for (const o of [b, c]) { expect(o.slots).toEqual(a.slots); expect(o.queue).toEqual(a.queue); expect(o.staffSpots).toEqual(a.staffSpots); }
    expect(new Set(a.furniture.map(f => f.sprite))).toEqual(new Set(['counter1', 'benchTable']));
    expect(new Set(b.furniture.map(f => f.sprite))).toEqual(new Set(['counter2', 'bistroTable']));
    expect(c.furniture).toEqual(b.furniture);
  });
  it('canteen counter sits at the wall opposite the door', () => {
    const cy = (side: Side) => {
      const L = packRoom('canteen', 6, 6, defaultDoor('canteen', 0, 0, 6, 6, side));
      return L.furniture.find(f => f.sprite === 'counter1')!;
    };
    expect(cy('S').y).toBe(50);               // north wall
    expect(cy('N').y).toBe(6 * 32 - 2);       // south wall (clamped into the room)
    expect(cy('W').x).toBe(4 * 32);           // east end
    expect(cy('E').x).toBe(0);                // west end
  });
  it('staff spots per type', () => {
    const spot = (t: RoomType, side: Side = 'S', w = 6, h = 6) => packRoom(t, w, h, defaultDoor(t, 0, 0, w, h, side)).staffSpots.map(s => s.kind);
    expect(spot('canteen')).toEqual(['cook']);
    expect(spot('classroom')).toEqual(['teacher']);
    expect(spot('workshop')).toEqual(['foreman']);
    expect(spot('wash')).toEqual(['janitor']);
    expect(spot('guard', 'S', 2, 2)).toEqual(['guard']);
    expect(spot('bunk')).toEqual([]);
    expect(spot('yard')).toEqual([]);
    // teacher stands at the board on the wall opposite the door
    expect(packRoom('classroom', 6, 6, defaultDoor('classroom', 0, 0, 6, 6, 'S')).staffSpots[0]).toMatchObject({ y: 0.5, dir: 'S' });
    expect(packRoom('classroom', 6, 6, defaultDoor('classroom', 0, 0, 6, 6, 'E')).staffSpots[0]).toMatchObject({ x: 0.5, dir: 'E' });
    // janitor never stands on a queue tile
    for (let w = 3; w <= 8; w++) for (let h = 3; h <= 8; h++) for (const side of SIDES) {
      const L = packRoom('wash', w, h, defaultDoor('wash', 0, 0, w, h, side)), j = L.staffSpots[0];
      expect(L.queue.some(q => q.x === Math.floor(j.x) && q.y === Math.floor(j.y))).toBe(false);
    }
  });
  it('classroom students face the board wall', () => {
    const face: Record<Side, Side> = { S: 'N', N: 'S', W: 'E', E: 'W' };
    for (const side of SIDES) for (const s of packRoom('classroom', 6, 7, defaultDoor('classroom', 0, 0, 6, 7, side)).slots) expect(s.dir).toBe(face[side]);
  });
  it('bunk beds always stand N-S and keep the door tile free', () => {
    for (const side of SIDES) {
      const L = packRoom('bunk', 7, 7, defaultDoor('bunk', 0, 0, 7, 7, side));
      for (const f of L.furniture) expect(f.sprite).toBe('bunkBed');
      expect(L.slots.every(s => s.dir === 'S')).toBe(true);
    }
  });
});

describe('packRoom: determinism', () => {
  it('same input → deep-equal output, independent of call history', () => {
    for (const t of BUILDABLE) for (const side of SIDES) {
      const d = defaultDoor(t, 0, 0, 7, 6, side);
      const a = packRoomCells(t, 7, 6, d, 2);
      packRoom('canteen', 5, 4, { x: 0, y: 3, side: 'S' }); packRoom('yard', 9, 9, { x: 8, y: 4, side: 'E' });
      const b = packRoomCells(t, 7, 6, { ...d }, 2);
      expect(b.layout).toEqual(a.layout);
      expect(Array.from(b.cells)).toEqual(Array.from(a.cells));
    }
  });
});

describe('adjacencyBonuses', () => {
  const D = { x: 0, y: 0, side: 'S' as Side };
  const R = (id: number, type: string): LayoutRoom => ({ id, type, door: D, x: 0, y: 0, w: 3, h: 3 });
  const rooms = [R(1, 'wash'), R(2, 'bunk'), R(3, 'workshop'), R(4, 'dock'), R(5, 'canteen'), R(6, 'yard'), R(7, 'classroom'), R(8, 'bunk')];
  const dist: Record<string, number> = { '1-2': 4, '1-8': 4.2, '3-4': 3, '5-6': 4 };
  const calls: string[] = [];
  const walk = (a: number, b: number) => { calls.push(`${a}-${b}`); return dist[`${a}-${b}`] ?? 99; };

  it('pairs within 4 tiles door-to-door', () => {
    calls.length = 0;
    expect(adjacencyBonuses(rooms, walk)).toEqual([
      { a: 1, b: 2, kind: 'hygieneWalk', value: -0.5 },
      { a: 3, b: 4, kind: 'cartTrip', value: -0.4 },
      { a: 5, b: 6, kind: 'mood', value: 5 },
    ]);
    // walkLen is asked in pair order (wash→bunk, workshop→dock, canteen→yard); classroom has no library partner yet
    expect(calls).toEqual(['1-2', '1-8', '3-4', '5-6']);
  });
  it('order does not depend on the input order', () => {
    const rev = rooms.slice().reverse();
    expect(adjacencyBonuses(rev, walk)).toEqual(adjacencyBonuses(rooms, walk));
  });
  it('nothing without partners', () => {
    expect(adjacencyBonuses([R(1, 'wash'), R(2, 'canteen'), R(3, 'classroom')], () => 0)).toEqual([]);
  });
});

describe('noisePenalty', () => {
  const bunk = { id: 1, type: 'bunk', x: 10, y: 11, w: 6, h: 3 };
  const at = (id: number, type: string, x: number, y: number) => ({ id, type, x, y, w: 4, h: 4 });
  it('workshop or yard closer than 3 tiles (Chebyshev gap) to a bunk', () => {
    expect(noisePenalty([bunk, at(2, 'workshop', 16, 11)])).toEqual([{ bunkId: 1, sourceId: 2 }]);   // touching (gap 0)
    expect(noisePenalty([bunk, at(2, 'workshop', 18, 9)])).toEqual([{ bunkId: 1, sourceId: 2 }]);    // gap 2
    expect(noisePenalty([bunk, at(2, 'workshop', 19, 11)])).toEqual([]);                             // gap 3
    expect(noisePenalty([bunk, at(2, 'yard', 4, 15)])).toEqual([{ bunkId: 1, sourceId: 2 }]);        // diagonal gap (2,1)
    expect(noisePenalty([bunk, at(2, 'yard', 4, 17)])).toEqual([]);                                  // diagonal gap (2,3)
    expect(noisePenalty([bunk, at(2, 'canteen', 16, 11)])).toEqual([]);                              // not noisy
  });
  it('lists every bunk/source pair sorted by id', () => {
    const b2 = { ...bunk, id: 5, x: 22 };
    expect(noisePenalty([at(9, 'yard', 16, 15), b2, at(3, 'workshop', 16, 11), bunk])).toEqual([
      { bunkId: 1, sourceId: 3 }, { bunkId: 1, sourceId: 9 }, { bunkId: 5, sourceId: 3 }, { bunkId: 5, sourceId: 9 },
    ]);
  });
});
