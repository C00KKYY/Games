/** Site 1 "Puddlebrook Lockup" – static map description (tiles), shared by sim and renderer. */
import type { RoomType } from './balance';

export const MAP_W = 32, MAP_H = 30;
/** extra water margin around the map (tiles) for the camera */
export const SEA = 6;

export const enum Ground { Water = 0, Sand = 1, Grass = 2, Path = 3, Dock = 4 }

export interface RoomDesc { id: string; type: RoomType; x: number; y: number; w: number; h: number; door: { x: number; side: 'N' | 'S' }; stage: number; level: number }

/** pre-built rooms of the start parcel (interior rects, tiles) */
export const START_ROOMS: RoomDesc[] = [
  { id: 'canteen', type: 'canteen', x: 5, y: 11, w: 4, h: 3, door: { x: 6, side: 'S' }, stage: 1, level: 1 },
  { id: 'bunk1', type: 'bunk', x: 10, y: 11, w: 6, h: 3, door: { x: 12, side: 'S' }, stage: 1, level: 1 },
];

export const PATH_Y = 15; // main path rows 15..16
export const GATE_X = 15; // freedom road turns south at x 15..16; frontal gate arch at y = GATE_Y
export const GATE_Y = 19.4;
export const DOCK = { x: -1, y: 14, w: 4, h: 3 };
export const FERRY_POS = { x: -1.05, y: 18.7 }; // tile coords of the ferry's bottom-centre anchor

export function buildGround(): Uint8Array {
  const g = new Uint8Array(MAP_W * MAP_H).fill(Ground.Grass);
  const set = (x: number, y: number, v: Ground) => { if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) g[y * MAP_W + x] = v; };
  // west coast: water x<2, sand x=2 (wobbly)
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < 2; x++) set(x, y, Ground.Water);
    set(2, y, Ground.Sand);
  }
  // north / south / east beaches
  for (let x = 0; x < MAP_W; x++) { set(x, 0, Ground.Sand); set(x, MAP_H - 1, Ground.Sand); }
  for (let y = 0; y < MAP_H; y++) set(MAP_W - 1, y, Ground.Sand);
  // dock planks over water
  for (let y = DOCK.y; y < DOCK.y + DOCK.h; y++) for (let x = 0; x <= 2; x++) set(x, y, Ground.Dock);
  // main path dock → east, then the freedom road turns south through the gate to the south beach
  for (let x = 3; x <= GATE_X + 1; x++) { set(x, PATH_Y, Ground.Path); set(x, PATH_Y + 1, Ground.Path); }
  for (let y = PATH_Y; y < MAP_H - 1; y++) { set(GATE_X, y, Ground.Path); set(GATE_X + 1, y, Ground.Path); }
  // door spurs
  for (const r of START_ROOMS) for (let y = r.y + r.h; y < PATH_Y; y++) set(r.door.x, y, Ground.Path);
  set(6, 17, Ground.Path);
  return g;
}
export const groundAt = (g: Uint8Array, x: number, y: number): Ground => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? Ground.Water : (g[y * MAP_W + x] as Ground));

/** decor of the start area (tile coords, sprite name) */
export const START_DECOR: { s: string; x: number; y: number }[] = [
  { s: 'tree0', x: 4.2, y: 11.2 }, { s: 'tree1', x: 17.4, y: 12.6 }, { s: 'tree0', x: 19.2, y: 20.8 }, { s: 'tree1', x: 3.6, y: 21.2 },
  { s: 'tree0', x: 20.5, y: 12.4 }, { s: 'tree1', x: 23.4, y: 19.6 }, { s: 'tree0', x: 27.5, y: 13.4 }, { s: 'tree0', x: 9.4, y: 8.6 },
  { s: 'tree1', x: 13.4, y: 7.8 }, { s: 'tree0', x: 22.2, y: 7.2 }, { s: 'tree1', x: 6.8, y: 25.4 }, { s: 'tree0', x: 12.6, y: 26.2 },
  { s: 'bush', x: 9.3, y: 14.6 }, { s: 'bush', x: 13.2, y: 21.0 }, { s: 'bush', x: 18.6, y: 17.6 }, { s: 'bush', x: 3.8, y: 13.2 },
  { s: 'flowerBed', x: 8.9, y: 20.6 }, { s: 'bench', x: 12.4, y: 18.4 }, { s: 'lamp', x: 4.6, y: 14.7 }, { s: 'lamp', x: 10.6, y: 14.7 },
  { s: 'lamp', x: 17.6, y: 17.4 }, { s: 'rock', x: 2.1, y: 11.2 }, { s: 'rock', x: 2.4, y: 20.3 }, { s: 'boardSign', x: 3.6, y: 17.7 },
  { s: 'bollard', x: 0.2, y: 14.25 }, { s: 'bollard', x: 0.2, y: 16.9 },
];

/** island outline (world units): smooth rounded rectangle with a gentle wobble. inset in tiles from the map edge. */
export function islandOutline(inset: number, seed: number, T = 32): number[] {
  const x0 = (1.7 + inset) * T, y0 = (0.3 + inset) * T, x1 = (MAP_W - 0.3 - inset) * T, y1 = (MAP_H - 0.3 - inset) * T;
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
    // round corners: clamp into the inner rect and push out by r along the normal of the nearest point
    const cx = Math.max(x0 + r, Math.min(x1 - r, x)), cy = Math.max(y0 + r, Math.min(y1 - r, y));
    let dx = x - cx, dy = y - cy; const l = Math.hypot(dx, dy) || 1;
    if (l > 1) { dx /= l; dy /= l; } else { dx = nx; dy = ny; }
    const w = wob(d);
    pts.push(cx + dx * (r + w), cy + dy * (r + w));
  }
  return pts;
}
