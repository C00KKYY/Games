/** WorldView: sea, ground chunks, shore, walls, furniture, decor (Brief §9.6). */
import { Container, Sprite, Texture, Rectangle, Graphics } from 'pixi.js';
import { tex } from './atlas';
import { MAP_W, MAP_H, SEA, Ground, groundAt, islandOutline, type RoomDesc } from '../content/site1';
import { P } from '../../art/palette';

export const TILE = 32;
const hex = (h: string) => parseInt(h.slice(1), 16);

export class WorldView {
  root = new Container();
  sea = new Container();
  ground = new Container();
  shore = new Container();
  island = new Container();
  rim = new Container();
  dock = new Container();
  shadows = new Container();
  objects = new Container();
  fx = new Container();
  lights = new Container();
  labels = new Container();
  /** the part of the world that gets the night tint */
  tinted = new Container();
  private chunks: Container[] = [];
  roomViews = new Map<string, Container[]>();

  constructor() {
    this.objects.sortableChildren = true;
    this.tinted.addChild(this.sea, this.island, this.ground, this.rim, this.dock, this.shore, this.shadows, this.objects, this.fx);
    this.root.addChild(this.tinted, this.lights, this.labels);
    this.lights.blendMode = 'add';
  }

  buildSea() {
    const x0 = -SEA, y0 = -SEA, x1 = MAP_W + SEA, y1 = MAP_H + SEA;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const s = new Sprite(tex(`water${(x * 7 + y * 3) & 1}`)); s.position.set(x * TILE, y * TILE); this.sea.addChild(s);
    }
  }

  buildGround(g: Uint8Array, rooms: RoomDesc[]) {
    this.ground.removeChildren(); this.chunks = [];
    this.shore.removeChildren();
    const roomFloor = new Map<number, string>();
    for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) roomFloor.set(y * MAP_W + x, floorFor(r.type));
    const CH = 16;
    for (let cy = 0; cy < MAP_H; cy += CH) for (let cx = 0; cx < MAP_W; cx += CH) {
      const chunk = new Container();
      chunk.cullable = true; chunk.cullableChildren = false;
      chunk.cullArea = new Rectangle(cx * TILE, cy * TILE, CH * TILE, CH * TILE);
      for (let y = cy; y < Math.min(MAP_H, cy + CH); y++) for (let x = cx; x < Math.min(MAP_W, cx + CH); x++) {
        const h = hash(x, y);
        const rf = roomFloor.get(y * MAP_W + x);
        let name: string;
        if (rf) name = `${rf}${h % (rf === 'planks' ? 3 : 2)}`;
        else switch (groundAt(g, x, y)) {
          case Ground.Path: name = `paving${h % 3}`; break;
          case Ground.Dock: { const d = new Sprite(tex(`dock${h % 3}`)); d.position.set(x * TILE, y * TILE); this.dock.addChild(d); name = `grass${h % 3}`; break; }
          default: name = `grass${h % 7 === 0 ? 3 : h % 3}`;
        }
        const s = new Sprite(tex(name)); s.position.set(x * TILE, y * TILE);
        chunk.addChild(s);
      }
      this.ground.addChild(chunk); this.chunks.push(chunk);
    }
    this.buildIsland();
  }

  private buildIsland() {
    this.island.removeChildren(); this.rim.removeChildren();
    const outer = islandOutline(0, 1.3), inner = islandOutline(1.0, 4.1), wet = islandOutline(0.22, 1.3);
    const g = new Graphics();
    g.poly(islandOutline(-0.35, 1.3)).fill({ color: hex(P.teal300), alpha: 0.45 });   // shallow water
    g.poly(outer).fill({ color: hex(P.wood300) });
    g.poly(outer).stroke({ color: hex(P.cream300), width: 4, alpha: 0.9 });              // foam line
    g.poly(wet).stroke({ color: hex(P.wood500), width: 6, alpha: 0.35 });                 // wet sand
    this.island.addChild(g);
    const m = new Graphics(); m.poly(inner).fill({ color: 0xffffff });
    this.rim.addChild(m); this.ground.mask = m;
    const r = new Graphics();
    r.poly(inner).stroke({ color: hex(P.sage700), width: 3, alpha: 0.9 });
    r.poly(islandOutline(1.06, 4.1)).stroke({ color: hex(P.wood500), width: 2, alpha: 0.4 });
    this.rim.addChild(r);
    // dock posts on the water side
    for (const [px, py] of [[0, 14], [0, 17], [1.5, 17], [1.5, 14]]) {
      const b = new Sprite(tex('bollard')); b.position.set(px * TILE + 5, py * TILE + 4); this.dock.addChild(b);
    }
  }

  /** wall SE shadow wedge as tinted white quads (no per-frame drawing) */
  private shadowRect(x: number, y: number, w: number, h: number, a = 0.16) {
    const s = new Sprite(Texture.WHITE); s.tint = hex(P.ink900); s.alpha = a; s.position.set(x, y); s.width = w; s.height = h; this.shadows.addChild(s);
  }

  addRoom(r: RoomDesc) {
    const items: Container[] = [];
    const X = r.x * TILE, Y = r.y * TILE, W = r.w * TILE, H = r.h * TILE;
    // inner AO along the north wall + outside SE shadow
    this.shadowRect(X, Y + 4, W, 6, 0.12);
    this.shadowRect(X + W + 4, Y - 6, 5, H + 14, 0.1);
    this.shadowRect(X + 6, Y + H + 4, W + 3, 5, 0.1);
    const add = (name: string, x: number, y: number, z = y, flipX = false) => {
      const s = new Sprite(tex(name)); s.position.set(x, y); s.zIndex = z; if (flipX) s.scale.x = -1;
      this.objects.addChild(s); items.push(s); return s;
    };
    for (let i = 0; i < r.w; i++) {
      const tx = X + i * TILE;
      const doorN = r.door.side === 'N' && r.x + i === r.door.x, doorS = r.door.side === 'S' && r.x + i === r.door.x;
      add(doorN ? 'doorH' : 'wallH', tx, Y + 4, Y + 4);
      add(doorS ? 'doorH' : 'wallH', tx, Y + H + 4, Y + H + 4);
      if (doorS) add('doorMat', tx + 16, Y + H + 8, Y + H - 2);
    }
    for (let j = 0; j < r.h; j++) {
      add('wallV', X, Y + j * TILE - 16, Y + j * TILE + 16);
      add('wallV', X + W, Y + j * TILE - 16, Y + j * TILE + 16);
    }
    add('wallPost', X, Y + 4, Y + 5); add('wallPost', X + W, Y + 4, Y + 5);
    add('wallPost', X, Y + H + 4, Y + H + 5); add('wallPost', X + W, Y + H + 4, Y + H + 5);
    for (const f of furnitureFor(r)) add(f.s, X + f.x, Y + f.y, Y + f.y + (f.z ?? 0));
    this.roomViews.set(r.id, items);
    return items;
  }

  removeRoom(id: string) { for (const s of this.roomViews.get(id) ?? []) s.destroy(); this.roomViews.delete(id); }

  addProp(name: string, tx: number, ty: number, z?: number) {
    const s = new Sprite(tex(name)); s.position.set(tx * TILE, ty * TILE); s.zIndex = z ?? ty * TILE; this.objects.addChild(s); return s;
  }
}

function floorFor(t: string) {
  switch (t) {
    case 'canteen': case 'workshop': return 'planks';
    case 'wash': return 'bath';
    case 'classroom': return 'carpet';
    case 'yard': return 'sand';
    default: return 'concrete';
  }
}

interface Furn { s: string; x: number; y: number; z?: number }
/** deterministic furniture layout per room type & stage (units relative to room interior top-left) */
export function furnitureFor(r: RoomDesc): Furn[] {
  const out: Furn[] = [];
  const W = r.w * TILE, H = r.h * TILE;
  switch (r.type) {
    case 'canteen': {
      out.push({ s: `counter${Math.min(2, r.stage)}`, x: 2, y: 50 });
      if (r.stage >= 2) {
        for (let x = 74; x + 48 <= W + 2; x += 52) out.push({ s: 'bistroTable', x, y: 50 });
        for (let x = 8; x + 48 <= W + 2; x += 60) out.push({ s: 'bistroTable', x, y: H - 2 });
      } else {
        for (let x = 66; x + 62 <= W + 2; x += 66) out.push({ s: 'benchTable', x, y: 52 });
        for (let x = 0; x + 62 <= W + 2; x += 64) out.push({ s: 'benchTable', x, y: H });
      }
      break;
    }
    case 'bunk': {
      for (let x = 0; x + 32 <= W; x += 32) out.push({ s: 'bunkBed', x, y: 66 });
      break;
    }
    case 'wash': {
      for (let x = 0; x + 32 <= W; x += 32) out.push({ s: 'shower', x, y: 46 });
      break;
    }
  }
  return out;
}

const hash = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return (h ^ (h >>> 16)) >>> 0; };
