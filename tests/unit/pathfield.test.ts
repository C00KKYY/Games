import { describe, it, expect } from 'vitest';
import {
  makeGrid, idx, inBounds, walkable, canStep, stepMask, stepCost, distanceField, nextStep,
  components, reachable, setRoomWalls, clearRoomWalls, rebuildWalls, setWall, DX, DY, UNREACHABLE,
  type WallRoom,
} from '../../src/sim/pathfield';
import { H, W, type Dir8, type Grid } from '../../src/sim/types';
import { Ground, buildGround, START_ROOMS } from '../../src/content/site1';

const U = UNREACHABLE;
const I = (g: Grid, x: number, y: number) => y * g.w + x;
const octile = (dx: number, dy: number) => {
  const a = Math.abs(dx), b = Math.abs(dy);
  return 14 * Math.min(a, b) + 10 * (Math.max(a, b) - Math.min(a, b));
};
const DIRS: Dir8[] = [0, 1, 2, 3, 4, 5, 6, 7];

/** seeded LCG in [0, 1) */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/** random terrain: water, blocked tiles, path/dock/sand, random wall edges */
function randomGrid(seed: number, w = W, h = H): Grid {
  const r = lcg(seed), g = makeGrid(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = r();
    g.ground[i] = v < 0.1 ? Ground.Water : v < 0.25 ? Ground.Path : v < 0.3 ? Ground.Dock : v < 0.4 ? Ground.Sand : Ground.Grass;
    if (r() < 0.03) g.blocked[i] = 1;
    if (r() < 0.15) g.wallE[i] = 1;
    if (r() < 0.15) g.wallS[i] = 1;
  }
  return g;
}

/** reference field: Bellman-Ford relaxation using only the public canStep/stepCost */
function refField(g: Grid, targets: number[]): number[] {
  const n = g.w * g.h, f = new Array<number>(n).fill(Infinity);
  for (const t of targets) f[t] = 0;
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < n; i++) {
      if (!walkable(g, i)) continue;
      for (const d of DIRS) {
        if (!canStep(g, i, d)) continue;
        const j = i + DY[d] * g.w + DX[d];
        if (f[j] === Infinity) continue;
        const c = f[j] + stepCost(g, j, d >= 4);
        if (c < f[i]) { f[i] = c; changed = true; }
      }
    }
  }
  return f.map((v) => (v === Infinity ? U : v));
}

/** reference components: flood fill with orthogonal canStep */
function refSameComponent(g: Grid, a: number): Uint8Array {
  const seen = new Uint8Array(g.w * g.h);
  if (!walkable(g, a)) return seen;
  const st = [a]; seen[a] = 1;
  while (st.length) {
    const i = st.pop()!;
    for (const d of [0, 1, 2, 3] as Dir8[]) {
      if (!canStep(g, i, d)) continue;
      const j = i + DY[d] * g.w + DX[d];
      if (!seen[j]) { seen[j] = 1; st.push(j); }
    }
  }
  return seen;
}

function dirOf(g: Grid, a: number, b: number): Dir8 | -1 {
  for (const d of DIRS) {
    const x = (a % g.w) + DX[d], y = Math.floor(a / g.w) + DY[d];
    if (inBounds(g, x, y) && I(g, x, y) === b) return d;
  }
  return -1;
}

describe('grid basics', () => {
  it('makeGrid zeroes everything and fills grass', () => {
    const g = makeGrid();
    expect([g.w, g.h]).toEqual([W, H]);
    for (const a of [g.owned, g.roomAt, g.wallE, g.wallS, g.blocked, g.fixed, g.road]) {
      expect(a.length).toBe(W * H);
      expect(a.every((v) => v === 0)).toBe(true);
    }
    expect(g.ground.every((v) => v === Ground.Grass)).toBe(true);
    const s = makeGrid(5, 4);
    expect([s.w, s.h, s.ground.length, s.wallE.length]).toEqual([5, 4, 20, 20]);
  });
  it('idx / inBounds / walkable', () => {
    const g = makeGrid();
    expect(idx(3, 2)).toBe(2 * W + 3);
    expect(inBounds(g, 0, 0) && inBounds(g, W - 1, H - 1)).toBe(true);
    expect(inBounds(g, -1, 0) || inBounds(g, W, 0) || inBounds(g, 0, H) || inBounds(g, 0, -1)).toBe(false);
    g.ground[idx(1, 1)] = Ground.Water; g.blocked[idx(2, 1)] = 1;
    g.ground[idx(3, 1)] = Ground.Sand; g.ground[idx(4, 1)] = Ground.Path; g.ground[idx(5, 1)] = Ground.Dock;
    expect([1, 2, 3, 4, 5].map((x) => walkable(g, idx(x, 1)))).toEqual([false, false, true, true, true]);
    expect(walkable(g, -1) || walkable(g, W * H)).toBe(false);
  });
  it('stepCost: 10/14, ×0.8 rounded onto Path/Dock', () => {
    const g = makeGrid();
    const t = idx(4, 4);
    for (const [gr, s, d] of [[Ground.Grass, 10, 14], [Ground.Sand, 10, 14], [Ground.Path, 8, 11], [Ground.Dock, 8, 11]]) {
      g.ground[t] = gr;
      expect([stepCost(g, t, false), stepCost(g, t, true)]).toEqual([s, d]);
    }
  });
  it('canStep respects map borders', () => {
    const g = makeGrid();
    const c = idx(0, 0), e = idx(W - 1, H - 1);
    expect(DIRS.filter((d) => canStep(g, c, d))).toEqual([1, 2, 5]); // E S SE
    expect(DIRS.filter((d) => canStep(g, e, d))).toEqual([0, 3, 7]); // N W NW
    expect(DIRS.every((d) => canStep(g, idx(5, 5), d))).toBe(true);
    expect(canStep(g, -1, 1) || canStep(g, W * H, 0)).toBe(false);
    expect(stepMask(g, idx(5, 5))).toBe(255);
  });
});

describe('distanceField', () => {
  it('open field: straight 10, diagonal 14 (octile everywhere)', () => {
    const g = makeGrid(), f = distanceField(g, [idx(10, 10)]);
    expect([f[idx(10, 10)], f[idx(11, 10)], f[idx(11, 11)], f[idx(13, 10)], f[idx(12, 11)], f[idx(13, 13)]])
      .toEqual([0, 10, 14, 30, 24, 42]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) expect(f[idx(x, y)]).toBe(octile(x - 10, y - 10));
  });
  it('multiple targets give the distance to the nearest one', () => {
    const g = makeGrid(), f = distanceField(g, [idx(2, 2), idx(20, 20), idx(2, 2)]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      expect(f[idx(x, y)]).toBe(Math.min(octile(x - 2, y - 2), octile(x - 20, y - 20)));
  });
  it('path discount: stepping onto Path/Dock costs 8 / 11, stepping off costs full', () => {
    const g = makeGrid();
    for (let x = 0; x < W; x++) g.ground[idx(x, 5)] = Ground.Path;
    const f = distanceField(g, [idx(0, 5)]);
    for (let x = 0; x < W; x++) expect(f[idx(x, 5)]).toBe(8 * x);
    expect(f[idx(0, 4)]).toBe(8);
    for (let x = 1; x < 10; x++) expect(f[idx(x, 4)]).toBe(8 * x + 3); // diagonal onto path (11) then along it
    // off the path onto grass costs 10
    expect(distanceField(g, [idx(5, 4)])[idx(5, 5)]).toBe(10);
    // dock counts like path
    const d = makeGrid();
    for (let x = 0; x < 6; x++) d.ground[idx(x, 1)] = Ground.Dock;
    expect(distanceField(d, [idx(0, 1)])[idx(5, 1)]).toBe(40);
  });
  it('agents prefer a longer path when it is cheaper', () => {
    // U-shaped path detour: grass straight 6 steps = 60; path detour 8 steps = 64 → grass; 6-step path → 48
    const g = makeGrid();
    for (let x = 2; x <= 8; x++) g.ground[idx(x, 3)] = Ground.Path;
    expect(distanceField(g, [idx(2, 3)])[idx(8, 3)]).toBe(48);
    const f = distanceField(g, [idx(2, 4)]);
    expect(f[idx(8, 4)]).toBe(11 + 8 * 4 + 14); // diag onto the path, along it, diag off (57) beats grass (60)
    expect(Array.from(f)).toEqual(refField(g, [idx(2, 4)]));
  });
  it('water and blocked tiles are unreachable and block', () => {
    const g = makeGrid();
    for (let y = 0; y < H; y++) g.ground[idx(10, y)] = Ground.Water;
    const f = distanceField(g, [idx(0, 0)]);
    expect(f[idx(10, 3)]).toBe(U);
    expect(f[idx(11, 3)]).toBe(U);
    expect(f[idx(9, 3)]).toBe(octile(9, 3));
    g.ground[idx(10, 7)] = Ground.Grass; // ford
    const f2 = distanceField(g, [idx(0, 0)]);
    expect(f2[idx(11, 7)]).toBe(f2[idx(10, 7)] + 10);
    g.blocked[idx(10, 7)] = 1;
    expect(distanceField(g, [idx(0, 0)])[idx(11, 7)]).toBe(U);
  });
  it('unwalkable targets get 0 but nothing can step onto them', () => {
    const g = makeGrid();
    g.ground[idx(5, 5)] = Ground.Water;
    const f = distanceField(g, [idx(5, 5)]);
    expect(f[idx(5, 5)]).toBe(0);
    expect(f[idx(5, 6)]).toBe(U);
    g.ground[idx(5, 5)] = Ground.Grass; g.blocked[idx(5, 5)] = 1;
    expect(distanceField(g, [idx(5, 5), idx(0, 0)])[idx(5, 5)]).toBe(0);
    // out-of-range targets are ignored
    expect(distanceField(g, [-1, W * H]).every((v) => v === U)).toBe(true);
    expect(distanceField(g, []).every((v) => v === U)).toBe(true);
  });
  it('walls block; a gap opens them', () => {
    const g = makeGrid();
    for (let y = 0; y < H; y++) g.wallE[idx(10, y)] = 1; // between x=10 and x=11
    const f = distanceField(g, [idx(0, 5)]);
    expect(f[idx(10, 5)]).toBe(100);
    expect(f[idx(11, 5)]).toBe(U);
    const c = components(g);
    expect(c[idx(0, 0)]).toBe(0);
    expect(c[idx(31, 0)]).toBe(1);
    expect(reachable(g, idx(0, 5), idx(11, 5))).toBe(false);
    g.wallE[idx(10, 5)] = 0;
    const f2 = distanceField(g, [idx(0, 5)]);
    expect(f2[idx(11, 5)]).toBe(110);
    expect(f2[idx(11, 4)]).toBe(120); // S then through the gap; no diagonal past the wall end
    expect(f2[idx(11, 6)]).toBe(120);
    expect(reachable(g, idx(0, 5), idx(11, 5))).toBe(true);
    // horizontal wall row
    const h = makeGrid();
    for (let x = 0; x < W; x++) h.wallS[idx(x, 7)] = 1; // between y=7 and y=8
    expect(distanceField(h, [idx(4, 0)])[idx(4, 8)]).toBe(U);
  });
  it('no corner cutting at wall ends or past unwalkable tiles', () => {
    const g = makeGrid();
    g.wallE[idx(4, 5)] = 1; // single edge between (4,5) and (5,5)
    const at = (x: number, y: number, d: Dir8) => canStep(g, idx(x, y), d);
    expect(at(4, 5, 1)).toBe(false); // E through the wall
    expect(at(5, 5, 3)).toBe(false); // W through the wall
    expect(at(4, 5, 4)).toBe(false); // NE: E sub-step crosses
    expect(at(4, 4, 5)).toBe(false); // SE: S-then-E crosses
    expect(at(5, 4, 6)).toBe(false); // SW: S-then-W crosses
    expect(at(5, 5, 7)).toBe(false); // NW: W sub-step crosses
    expect(at(4, 6, 4)).toBe(false); // NE: N-then-E crosses
    expect(at(4, 3, 5)).toBe(true);  // above the wall end: free
    expect(at(4, 4, 1)).toBe(true);
    const f = distanceField(g, [idx(5, 5)]);
    expect(f[idx(4, 4)]).toBe(20); // E then S, not a 14 diagonal
    expect(f[idx(4, 6)]).toBe(20);
    expect(f[idx(4, 5)]).toBe(30); // around the edge
    // unwalkable corner tile
    const w = makeGrid();
    w.ground[idx(5, 5)] = Ground.Water;
    expect(canStep(w, idx(4, 5), 4)).toBe(false); // NE would brush (5,5)
    expect(canStep(w, idx(4, 4), 5)).toBe(false); // SE onto water
    expect(canStep(w, idx(6, 4), 6)).toBe(false); // SW onto water
    expect(canStep(w, idx(4, 6), 4)).toBe(false); // NE onto water
    expect(canStep(w, idx(4, 4), 1)).toBe(true);
    const wf = distanceField(w, [idx(6, 6)]);
    expect(wf[idx(4, 4)]).toBe(40); // around the water tile orthogonally instead of 28
    expect(Array.from(wf)).toEqual(refField(w, [idx(6, 6)]));
  });
  it('matches a Bellman-Ford reference on random terrain with walls', () => {
    for (const seed of [1, 2, 3, 42, 777]) {
      const g = randomGrid(seed), r = lcg(seed * 31 + 7), n = W * H;
      const targets = [Math.floor(r() * n), Math.floor(r() * n), Math.floor(r() * n)];
      expect(Array.from(distanceField(g, targets))).toEqual(refField(g, targets));
    }
  });
  it('is deterministic and independent of target order; reuses out', () => {
    const g = randomGrid(9), a = idx(3, 4), b = idx(25, 20), c = idx(14, 2);
    const f1 = Array.from(distanceField(g, [a, b, c]));
    expect(Array.from(distanceField(g, [c, b, a]))).toEqual(f1);
    expect(Array.from(distanceField(g, [b, a, c, a]))).toEqual(f1);
    const buf = new Uint16Array(W * H).fill(123);
    expect(distanceField(g, [a, b, c], buf)).toBe(buf);
    expect(Array.from(buf)).toEqual(f1);
    const small = new Uint16Array(5);
    expect(distanceField(g, [a], small)).not.toBe(small);
  });
  it('works on other grid sizes and regrows scratch buffers', () => {
    const s = makeGrid(7, 5), sf = distanceField(s, [I(s, 0, 0)]);
    expect(sf.length).toBe(35);
    expect(sf[I(s, 6, 4)]).toBe(octile(6, 4));
    const big = makeGrid(70, 64), bf = distanceField(big, [I(big, 0, 0)]);
    expect(bf[I(big, 69, 63)]).toBe(octile(69, 63));
    expect(distanceField(s, [I(s, 6, 4)])[0]).toBe(octile(6, 4));
    expect(components(big)[I(big, 69, 63)]).toBe(0);
  });
});

describe('rooms and doors', () => {
  const sides = [
    { door: { x: 11, y: 10, side: 'N' as const }, out: [11, 9], edge: (g: Grid) => g.wallS[idx(11, 9)] },
    { door: { x: 11, y: 12, side: 'S' as const }, out: [11, 13], edge: (g: Grid) => g.wallS[idx(11, 12)] },
    { door: { x: 10, y: 11, side: 'W' as const }, out: [9, 11], edge: (g: Grid) => g.wallE[idx(9, 11)] },
    { door: { x: 12, y: 11, side: 'E' as const }, out: [13, 11], edge: (g: Grid) => g.wallE[idx(12, 11)] },
  ];
  it('setRoomWalls walls the interior boundary; each door side opens exactly its edge', () => {
    for (const s of sides) {
      const g = makeGrid();
      setRoomWalls(g, 10, 10, 3, 3, [s.door]);
      expect(s.edge(g)).toBe(0);
      let walls = 0;
      for (let i = 0; i < W * H; i++) walls += g.wallE[i] + g.wallS[i];
      expect(walls).toBe(11); // 12 boundary edges − 1 door
      const f = distanceField(g, [idx(s.out[0], s.out[1])]);
      expect(f[idx(s.door.x, s.door.y)]).toBe(10);
      expect(f[idx(11, 11)]).toBe(20); // centre is one step behind every door
      for (let y = 10; y <= 12; y++) for (let x = 10; x <= 12; x++) expect(f[idx(x, y)]).toBeLessThan(U);
      // the outside goes around the room, never through a wall
      expect(Array.from(f)).toEqual(refField(g, [idx(s.out[0], s.out[1])]));
    }
  });
  it('room without (valid) door is sealed; an interior non-boundary door is ignored', () => {
    const g = makeGrid();
    setRoomWalls(g, 10, 10, 3, 3, [{ x: 11, y: 11, side: 'N' }, { x: 9, y: 10, side: 'E' }]);
    const f = distanceField(g, [idx(0, 0)]);
    for (let y = 10; y <= 12; y++) for (let x = 10; x <= 12; x++) expect(f[idx(x, y)]).toBe(U);
    expect(f[idx(9, 10)]).toBeLessThan(U);
    expect(nextStep(g, f, idx(11, 11))).toBe(-1);
    expect(reachable(g, idx(0, 0), idx(11, 11))).toBe(false);
    expect(reachable(g, idx(11, 11), idx(12, 12))).toBe(true);
    const c = components(g);
    expect(c[idx(11, 11)]).not.toBe(c[idx(0, 0)]);
    expect(new Set(Array.from(c)).size).toBe(2);
  });
  it('rooms at the map border ignore off-map edges', () => {
    const g = makeGrid();
    setRoomWalls(g, 0, 0, 3, 3, [{ x: 1, y: 2, side: 'S' }]);
    expect(g.wallE[idx(2, 0)]).toBe(1);
    expect(g.wallS[idx(0, 2)]).toBe(1);
    expect(g.wallS[idx(1, 2)]).toBe(0);
    expect(distanceField(g, [idx(1, 3)])[idx(0, 0)]).toBe(34);
    clearRoomWalls(g, 0, 0, 3, 3);
    expect(g.wallE.every((v) => v === 0) && g.wallS.every((v) => v === 0)).toBe(true);
  });
  // A: interior x 4..6, B: interior x 7..9, both y 4..6; shared edge between x=6 and x=7
  const A: WallRoom = { x: 4, y: 4, w: 3, h: 3, door: { x: 5, y: 4, side: 'N' }, links: [{ x: 6, y: 5, side: 'E' }] };
  const B: WallRoom = { x: 7, y: 4, w: 3, h: 3, door: null, links: [{ x: 7, y: 5, side: 'W' }] };
  it('touching rooms share one edge; the link door connects them', () => {
    const g = makeGrid();
    rebuildWalls(g, [A, B]);
    expect([g.wallE[idx(6, 4)], g.wallE[idx(6, 5)], g.wallE[idx(6, 6)]]).toEqual([1, 0, 1]);
    const f = distanceField(g, [idx(5, 3)]); // tile in front of A's door
    expect(f[idx(5, 4)]).toBe(10);
    expect(f[idx(6, 5)]).toBe(24);
    expect(f[idx(7, 5)]).toBe(34); // through the link
    expect(f[idx(8, 5)]).toBe(44);
    expect(f[idx(10, 5)]).toBe(70); // outside goes around B: N, N, then W along y=3
    expect(Array.from(f)).toEqual(refField(g, [idx(5, 3)]));
    // B is only reachable through A
    const sealedA = makeGrid();
    rebuildWalls(sealedA, [{ ...A, door: null }, B]);
    expect(reachable(sealedA, idx(8, 5), idx(5, 5))).toBe(true);
    expect(reachable(sealedA, idx(8, 5), idx(0, 0))).toBe(false);
  });
  it('a link listed on either room opens the shared edge', () => {
    for (const rooms of [[A, { ...B, links: [] }], [{ ...A, links: [] }, B]]) {
      const g = makeGrid();
      rebuildWalls(g, rooms);
      expect(g.wallE[idx(6, 5)]).toBe(0);
      expect(distanceField(g, [idx(5, 3)])[idx(8, 5)]).toBe(44);
    }
    const g = makeGrid();
    rebuildWalls(g, [{ ...A, links: [] }, { ...B, links: [] }]);
    expect(g.wallE[idx(6, 5)]).toBe(1);
    expect(reachable(g, idx(8, 5), idx(5, 5))).toBe(false);
  });
  it('removing one room keeps the walls of the other', () => {
    const g = makeGrid();
    rebuildWalls(g, [A, B]);
    rebuildWalls(g, [{ ...A, links: [] }]); // B demolished, its link gone
    expect([g.wallE[idx(6, 4)], g.wallE[idx(6, 5)], g.wallE[idx(6, 6)]]).toEqual([1, 1, 1]);
    expect(g.wallE[idx(9, 5)]).toBe(0); // B's east wall is gone
    expect(g.wallS[idx(8, 3)]).toBe(0);
    const f = distanceField(g, [idx(5, 3)]);
    expect(f[idx(8, 5)]).toBe(44); // no diagonal past A's NE wall corner
    expect(Array.from(f)).toEqual(refField(g, [idx(5, 3)]));
    // clearRoomWalls: without keep it removes the shared wall too, keep vetoes edges of A
    const c = makeGrid();
    setRoomWalls(c, A.x, A.y, A.w, A.h, [A.door!]);
    setRoomWalls(c, B.x, B.y, B.w, B.h, []);
    const naive = makeGrid();
    naive.wallE.set(c.wallE); naive.wallS.set(c.wallS);
    clearRoomWalls(naive, B.x, B.y, B.w, B.h);
    expect(naive.wallE[idx(6, 4)]).toBe(0);
    const onA = (e: number, hz: boolean) => {
      const x = e % W, y = Math.floor(e / W);
      return hz ? x >= 4 && x <= 6 && (y === 3 || y === 6) : y >= 4 && y <= 6 && (x === 3 || x === 6);
    };
    const seen: [number, boolean][] = [];
    clearRoomWalls(c, B.x, B.y, B.w, B.h, (e, hz) => { seen.push([e, hz]); return onA(e, hz); });
    expect(seen.length).toBe(12);
    expect([c.wallE[idx(6, 4)], c.wallE[idx(6, 5)], c.wallE[idx(6, 6)]]).toEqual([1, 1, 1]);
    expect(c.wallE[idx(9, 5)]).toBe(0);
    expect(c.wallS[idx(8, 6)]).toBe(0);
    expect(c.wallS[idx(5, 6)]).toBe(1);
  });
  it('setWall writes the edge of the named side', () => {
    const g = makeGrid();
    setWall(g, 3, 3, 'N', 1); setWall(g, 3, 3, 'S', 1); setWall(g, 3, 3, 'W', 1); setWall(g, 3, 3, 'E', 1);
    expect([g.wallS[idx(3, 2)], g.wallS[idx(3, 3)], g.wallE[idx(2, 3)], g.wallE[idx(3, 3)]]).toEqual([1, 1, 1, 1]);
    expect(stepMask(g, idx(3, 3))).toBe(0);
    setWall(g, 3, 3, 'E', 0);
    expect(stepMask(g, idx(3, 3))).toBe(2);
  });
});

describe('nextStep', () => {
  it('tie order N, E, S, W, NE, SE, SW, NW', () => {
    const g = makeGrid(), c = idx(10, 10);
    const pick = (ts: [number, number][]) => {
      const t = ts.map(([x, y]) => idx(x, y));
      const a = nextStep(g, distanceField(g, t), c), b = nextStep(g, distanceField(g, t.slice().reverse()), c);
      expect(a).toBe(b); // independent of target order
      return a;
    };
    expect(pick([[8, 10], [12, 10]])).toBe(idx(11, 10));  // W vs E → E
    expect(pick([[10, 8], [8, 10]])).toBe(idx(10, 9));    // N vs W → N
    expect(pick([[10, 12], [8, 10]])).toBe(idx(10, 11));  // S vs W → S
    expect(pick([[12, 8], [8, 12]])).toBe(idx(11, 9));    // NE vs SW → NE
    expect(pick([[8, 8], [12, 12]])).toBe(idx(11, 11));   // NW vs SE → SE
    expect(pick([[8, 8], [8, 12]])).toBe(idx(9, 11));     // NW vs SW → SW
    expect(pick([[12, 8], [12, 12], [8, 8], [8, 12]])).toBe(idx(11, 9)); // all four diagonals → NE
  });
  it('picks the smallest field value, -1 at target / unreachable / out of range', () => {
    const g = makeGrid(), t = idx(5, 5), f = distanceField(g, [t]);
    expect(nextStep(g, f, t)).toBe(-1);
    expect(nextStep(g, f, idx(8, 8))).toBe(idx(7, 7));
    expect(nextStep(g, f, idx(8, 5))).toBe(idx(7, 5));
    expect(nextStep(g, f, -1)).toBe(-1);
    expect(nextStep(g, f, W * H)).toBe(-1);
    g.ground[idx(20, 20)] = Ground.Water;
    const f2 = distanceField(g, [t]);
    expect(f2[idx(20, 20)]).toBe(U);
    expect(nextStep(g, f2, idx(20, 20))).toBe(-1);
  });
  it('never steps into a wall corner', () => {
    const g = makeGrid();
    g.wallE[idx(4, 5)] = 1;
    const f = distanceField(g, [idx(5, 5)]);
    expect(nextStep(g, f, idx(4, 4))).toBe(idx(5, 4));
    const s = nextStep(g, f, idx(4, 5));
    expect([idx(4, 4), idx(4, 6)]).toContain(s);
    expect(s).toBe(idx(4, 4)); // N wins the tie with S
  });
  it('descends to a target from random starts within field/8 + 5 steps', () => {
    for (const seed of [11, 12, 13, 2024]) {
      const g = randomGrid(seed), r = lcg(seed ^ 0x9e3779b9), n = W * H;
      const targets: number[] = [];
      while (targets.length < 2) { const t = Math.floor(r() * n); if (walkable(g, t)) targets.push(t); }
      const f = distanceField(g, targets);
      let walked = 0;
      for (let k = 0; k < 300; k++) {
        const s = Math.floor(r() * n);
        if (f[s] === U) { expect(nextStep(g, f, s)).toBe(-1); continue; }
        let i = s, steps = 0;
        while (f[i] !== 0) {
          const j = nextStep(g, f, i);
          expect(j).toBeGreaterThanOrEqual(0);
          const d = dirOf(g, i, j);
          expect(d).toBeGreaterThanOrEqual(0);
          expect(canStep(g, i, d as Dir8)).toBe(true);
          expect(f[j]).toBeLessThan(f[i]);
          i = j; steps++;
          expect(steps).toBeLessThanOrEqual(Math.floor(f[s] / 8) + 5);
        }
        expect(targets).toContain(i);
        walked++;
      }
      expect(walked).toBeGreaterThan(50);
    }
  });
});

describe('components', () => {
  it('labels match a canStep flood fill and the distance field', () => {
    for (const seed of [5, 6, 7]) {
      const g = randomGrid(seed), c = components(g), n = W * H;
      for (let i = 0; i < n; i++) expect(c[i] === -1).toBe(!walkable(g, i));
      const r = lcg(seed + 100);
      for (let k = 0; k < 12; k++) {
        const a = Math.floor(r() * n);
        if (!walkable(g, a)) continue;
        const same = refSameComponent(g, a), f = distanceField(g, [a]);
        for (let i = 0; i < n; i++) {
          if (!walkable(g, i)) continue;
          expect(c[i] === c[a]).toBe(same[i] === 1);
          expect(f[i] !== U).toBe(same[i] === 1);
        }
        expect(reachable(g, a, a)).toBe(true);
      }
      // labels are dense and assigned in index order of each component's first tile
      let next = 0;
      for (let i = 0; i < n; i++) if (c[i] === next) next++; else expect(c[i]).toBeLessThan(next);
    }
  });
  it('reachable handles unwalkable and out-of-range tiles; out is reused', () => {
    const g = makeGrid();
    g.ground[idx(3, 3)] = Ground.Water;
    expect(reachable(g, idx(3, 3), idx(3, 3))).toBe(false);
    expect(reachable(g, idx(0, 0), idx(31, 29))).toBe(true);
    expect(reachable(g, -1, 0) || reachable(g, 0, W * H)).toBe(false);
    const buf = new Int32Array(W * H).fill(77);
    expect(components(g, buf)).toBe(buf);
    expect(buf[idx(3, 3)]).toBe(-1);
    expect(buf[0]).toBe(0);
  });
});

describe('performance', () => {
  it('one 32x30 field on the real start map in < 0.5 ms average', () => {
    const g = makeGrid();
    g.ground.set(buildGround());
    rebuildWalls(g, START_ROOMS.map((r) => ({
      x: r.x, y: r.y, w: r.w, h: r.h,
      door: { x: r.door.x, y: r.door.side === 'S' ? r.y + r.h - 1 : r.y, side: r.door.side },
    })));
    const out = new Uint16Array(W * H), t = [idx(START_ROOMS[1].door.x, START_ROOMS[1].y + START_ROOMS[1].h - 1)];
    distanceField(g, t, out);
    expect(out[idx(3, 15)]).toBeLessThan(U); // dock end of the main path reaches the bunk door
    for (let k = 0; k < 300; k++) distanceField(g, t, out); // warm-up
    const runs = 500, t0 = performance.now();
    for (let k = 0; k < runs; k++) distanceField(g, t, out);
    const avg = (performance.now() - t0) / runs;
    expect(avg).toBeLessThan(0.5);
  });
});

describe('review regressions', () => {
  it('reachable is correct even as the first call on a grid larger than any before', () => {
    const big = makeGrid(90, 70);
    big.ground[5] = Ground.Water;
    for (let y = 0; y < 70; y++) big.wallE[y * 90 + 44] = 1;
    expect(reachable(big, 5, 5)).toBe(false);
    expect(reachable(big, 90 * 10 + 1, 90 * 10 + 80)).toBe(false);
  });
  it('orthogonal neighbour wins a tie against a diagonal one (N before NE)', () => {
    const g = makeGrid();
    const f = distanceField(g, [idx(10, 8), idx(12, 9)]);
    expect(nextStep(g, f, idx(10, 10))).toBe(idx(10, 9));
  });
});
