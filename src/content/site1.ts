/**
 * Site 1 "Puddlebrook Lockup" – static map description, shared by sim and renderer.
 *
 * Layout v2 (after the first bot run showed no room for a 4x4 workshop in v1):
 *  - start parcel x 0..17, y 10..21. Beach/dock at x 0, sea west of the map.
 *  - main road y 20..21 from the dock to x 17; the freedom road turns south at x 16..17 through the gate (y≈22.6).
 *  - pre-built row y 17..19: Warden's Office (x 1..3), Canteen 4x3 (x 5..8), Bunk Block 6x3 (x 10..15), doors open onto the road.
 *  - corridors x 4, x 9, x 16..17 lead up to a contiguous building strip y 10..16 (7 rows × 17 columns).
 */
import type { RoomType } from './balance';

export const MAP_W = 32, MAP_H = 30;
/** extra water margin around the map (tiles) for the camera */
export const SEA = 6;

export const enum Ground { Water = 0, Sand = 1, Grass = 2, Path = 3, Dock = 4 }

export interface RoomDesc { id: string; type: RoomType; x: number; y: number; w: number; h: number; door: { x: number; side: 'N' | 'S' }; stage: number; level: number }

export const PATH_Y = 20;             // main road rows 20..21
export const GATE_X = 16;             // freedom road / gate columns 16..17
export const GATE_Y = 22.6;           // bottom line of the frontal gate arch (tile units)
export const DOCK = { x: 0, y: 20, w: 1, h: 2 };
export const FERRY_POS = { x: -1.75, y: 23.4 }; // tile coords of the ferry's bottom-centre anchor
export const OFFICE = { x: 1, y: 17, w: 3, h: 3 };
export const DEPOT = { x: 1, y: 22, w: 3, h: 1 };
export const BOOTH = { x: 13, y: 22, w: 2, h: 1 };
/** tutorial ghost of the Wash Hut: next to the dock, where the muddy arrivals come in */
export const TUTORIAL_WASH = { x: 1, y: 13, w: 3, h: 3 };

/** "for sale" sign of each unowned parcel (tile coords of its foot; drawn by render/progressView.ts, tapped in tools.ts) */
export const SALE_SIGNS: Readonly<Record<string, { x: number; y: number }>> = { p2: { x: 19.3, y: 16.4 }, p3: { x: 9.3, y: 9.2 }, p4: { x: 20.2, y: 23.4 } };

/** pre-built rooms of the start parcel (interior rects, tiles) */
export const START_ROOMS: RoomDesc[] = [
  { id: 'canteen', type: 'canteen', x: 5, y: 17, w: 4, h: 3, door: { x: 6, side: 'S' }, stage: 1, level: 1 },
  { id: 'bunk1', type: 'bunk', x: 10, y: 17, w: 6, h: 3, door: { x: 12, side: 'S' }, stage: 1, level: 1 },
];

export function buildGround(): Uint8Array {
  const g = new Uint8Array(MAP_W * MAP_H).fill(Ground.Grass);
  const set = (x: number, y: number, v: Ground) => { if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) g[y * MAP_W + x] = v; };
  // beaches on all sides (the island polygon renders the sand; tiles stay walkable)
  for (let y = 0; y < MAP_H; y++) { set(0, y, Ground.Sand); set(MAP_W - 1, y, Ground.Sand); }
  for (let x = 0; x < MAP_W; x++) { set(x, 0, Ground.Sand); set(x, MAP_H - 1, Ground.Sand); }
  // dock
  for (let y = DOCK.y; y < DOCK.y + DOCK.h; y++) set(DOCK.x, y, Ground.Dock);
  // main road → east, then the freedom road south through the gate to the south beach
  for (let x = 1; x <= GATE_X + 1; x++) { set(x, PATH_Y, Ground.Path); set(x, PATH_Y + 1, Ground.Path); }
  for (let y = PATH_Y; y < MAP_H - 1; y++) { set(GATE_X, y, Ground.Path); set(GATE_X + 1, y, Ground.Path); }
  return g;
}
export const groundAt = (g: Uint8Array, x: number, y: number): Ground => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? Ground.Water : (g[y * MAP_W + x] as Ground));

/** decor of the island (tile coords, sprite name). Props standing where a room is built get hidden. */
export const START_DECOR: { s: string; x: number; y: number }[] = [
  // around the pre-built row and the road
  { s: 'lamp', x: 4.5, y: 19.8 }, { s: 'lamp', x: 9.5, y: 19.8 }, { s: 'lamp', x: 15.5, y: 22.2 },
  { s: 'bush', x: 4.4, y: 16.9 }, { s: 'bush', x: 9.5, y: 16.8 }, { s: 'flowerBed', x: 12.0, y: 22.9 },
  { s: 'boardSign', x: 1.2, y: 19.7 }, { s: 'rock', x: 0.2, y: 16.4 }, { s: 'rock', x: 0.4, y: 24.6 },
  { s: 'bench', x: 7.0, y: 22.8 }, { s: 'tree1', x: 18.6, y: 22.4 }, { s: 'tree0', x: 19.4, y: 18.6 },
  // building strip (cleared when built over)
  { s: 'tree0', x: 6.8, y: 11.2 }, { s: 'tree1', x: 13.2, y: 10.6 }, { s: 'bush', x: 10.2, y: 14.6 }, { s: 'tree0', x: 16.4, y: 13.8 },
  // further away (other parcels)
  { s: 'tree0', x: 22.4, y: 12.4 }, { s: 'tree1', x: 25.3, y: 17.3 }, { s: 'tree0', x: 28.4, y: 13.6 }, { s: 'tree1', x: 24.4, y: 21.2 },
  { s: 'tree0', x: 4.4, y: 6.6 }, { s: 'tree1', x: 10.4, y: 5.4 }, { s: 'tree0', x: 18.2, y: 7.2 }, { s: 'tree1', x: 26.4, y: 4.6 },
  { s: 'tree0', x: 6.8, y: 26.4 }, { s: 'tree1', x: 12.6, y: 27.2 }, { s: 'tree0', x: 22.6, y: 26.2 }, { s: 'bush', x: 28.6, y: 24.6 },
  { s: 'rock', x: 30.6, y: 9.2 }, { s: 'rock', x: 30.4, y: 20.2 }, { s: 'bush', x: 20.6, y: 3.2 },
];

/** island outline (world units): smooth rounded rectangle with a gentle wobble. inset in tiles from the map edge. */
export function islandOutline(inset: number, seed: number, T = 32): number[] {
  const x0 = (-0.35 + inset) * T, y0 = (-0.35 + inset) * T, x1 = (MAP_W + 0.35 - inset) * T, y1 = (MAP_H + 0.35 - inset) * T;
  const r = (2.4 - inset * 0.5) * T;
  const pts: number[] = [];
  const wob = (t: number) => (Math.sin(t * 0.021 + seed) * 0.28 + Math.sin(t * 0.057 + seed * 2.3) * 0.14) * T;
  const per = 2 * (x1 - x0 + y1 - y0);
  const N = 260;
  for (let i = 0; i < N; i++) {
    const d = (i / N) * per;
    let x: number, y: number, nx: number, ny: number;
    if (d < x1 - x0) { x = x0 + d; y = y0; nx = 0; ny = -1; }
    else if (d < x1 - x0 + y1 - y0) { x = x1; y = y0 + d - (x1 - x0); nx = 1; ny = 0; }
    else if (d < 2 * (x1 - x0) + y1 - y0) { x = x1 - (d - (x1 - x0) - (y1 - y0)); y = y1; nx = 0; ny = 1; }
    else { x = x0; y = y1 - (d - 2 * (x1 - x0) - (y1 - y0)); nx = -1; ny = 0; }
    const cx = Math.max(x0 + r, Math.min(x1 - r, x)), cy = Math.max(y0 + r, Math.min(y1 - r, y));
    let dx = x - cx, dy = y - cy; const l = Math.hypot(dx, dy) || 1;
    if (l > 1) { dx /= l; dy /= l; } else { dx = nx; dy = ny; }
    const w = wob(d);
    pts.push(cx + dx * (r + w), cy + dy * (r + w));
  }
  return pts;
}
