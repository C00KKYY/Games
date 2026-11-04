/**
 * World-space tool overlays for src/ui/tools.ts (docs/UI_DESIGN.md §4): build ghost with tile grid, room selection
 * frame, edge handles, agent selection ring, guard radius, dashed adjacency / noise lines and the workshop crate stacks.
 * Every Graphics is created once; each setter compares a key and only redraws on change (the ring is only moved).
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import { TILE } from './world';
import { tex, hasTex } from './atlas';

export interface Rect { x: number; y: number; w: number; h: number }
export type Edge = 'N' | 'S' | 'E' | 'W';
export interface Line { x1: number; y1: number; x2: number; y2: number; good: boolean }
export interface CrateStack { x: number; y: number; n: number }

const C = {
  ok: 0x5fc39a, okLine: 0x2f8a68, bad: 0xdf6450, badLine: 0xa93e34,
  sel: 0xe8b13a, selLine: 0xb37f1d, cream: 0xf8f0de, wood: 0x7a4e33, teal: 0x33908a, tealLight: 0x66b9a8,
} as const;
const MAX_CRATES = 12; // sprite pool (3 per stack, 4 stacks)

export class GhostLayer {
  readonly root = new Container();
  private radius = new Graphics();
  private adj = new Graphics();
  private ghost = new Graphics();
  private frame = new Graphics();
  private handles = new Graphics();
  private ring = new Graphics();
  private crates = new Container();
  private pool: Sprite[] = [];
  private keys = { radius: '', adj: '', ghost: '', frame: '', handles: '', crates: '' };

  constructor(parent: Container) {
    this.root.eventMode = 'none';
    this.root.label = 'tools-overlay';
    this.root.addChild(this.radius, this.adj, this.ghost, this.frame, this.crates, this.handles, this.ring);
    // selection ring at the feet: drawn once, then only moved
    this.ring.ellipse(0, 0, 14, 6.5).fill({ color: C.sel, alpha: 0.22 }).stroke({ width: 2.5, color: C.sel, alpha: 0.95 });
    this.ring.ellipse(0, 0, 17, 8.5).stroke({ width: 1.5, color: C.selLine, alpha: 0.6 });
    this.ring.visible = false;
    parent.addChild(this.root);
  }

  /** build / resize ghost: tinted rect, tile grid, door notch. r in tiles */
  setGhost(r: Rect | null, valid: boolean, door?: { x: number; y: number; side: Edge } | null) {
    const key = r ? `${r.x},${r.y},${r.w},${r.h},${+valid},${door ? `${door.x},${door.y},${door.side}` : ''}` : '';
    if (key === this.keys.ghost) return;
    this.keys.ghost = key;
    const g = this.ghost;
    g.clear();
    if (!r) return;
    const x = r.x * TILE, y = r.y * TILE, w = r.w * TILE, h = r.h * TILE;
    const fill = valid ? C.ok : C.bad, line = valid ? C.okLine : C.badLine;
    g.rect(x, y, w, h).fill({ color: fill, alpha: 0.3 });
    for (let i = 1; i < r.w; i++) g.moveTo(x + i * TILE, y).lineTo(x + i * TILE, y + h);
    for (let j = 1; j < r.h; j++) g.moveTo(x, y + j * TILE).lineTo(x + w, y + j * TILE);
    g.stroke({ width: 1, color: C.cream, alpha: 0.55 });
    g.rect(x, y, w, h).stroke({ width: 3, color: line, alpha: 0.95 });
    if (door) {
      const dx = door.x * TILE, dy = door.y * TILE;
      const n = door.side === 'N' ? [dx + 6, dy - 3, TILE - 12, 6] : door.side === 'S' ? [dx + 6, dy + TILE - 3, TILE - 12, 6]
        : door.side === 'W' ? [dx - 3, dy + 6, 6, TILE - 12] : [dx + TILE - 3, dy + 6, 6, TILE - 12];
      g.roundRect(n[0], n[1], n[2], n[3], 2).fill({ color: C.cream, alpha: 1 }).stroke({ width: 1.5, color: line });
    }
  }

  /** selection frame (gold) or demolish hover frame (coral). r in tiles */
  setFrame(r: Rect | null, kind: 'sel' | 'bad' = 'sel') {
    const key = r ? `${r.x},${r.y},${r.w},${r.h},${kind}` : '';
    if (key === this.keys.frame) return;
    this.keys.frame = key;
    const g = this.frame;
    g.clear();
    if (!r) return;
    const x = r.x * TILE, y = r.y * TILE, w = r.w * TILE, h = r.h * TILE;
    const c = kind === 'sel' ? C.sel : C.bad, l = kind === 'sel' ? C.selLine : C.badLine;
    if (kind === 'bad') g.rect(x, y, w, h).fill({ color: C.bad, alpha: 0.22 });
    g.roundRect(x - 3, y - 3, w + 6, h + 6, 6).stroke({ width: 4, color: l, alpha: 0.55 });
    g.roundRect(x - 3, y - 3, w + 6, h + 6, 6).stroke({ width: 2, color: c, alpha: 1 });
  }

  /** edge handles on the 4 edges of r (tiles); size = handle half length in world units (constant on screen) */
  setHandles(r: Rect | null, active: Edge | null, size: number) {
    const key = r ? `${r.x},${r.y},${r.w},${r.h},${active ?? ''},${size.toFixed(1)}` : '';
    if (key === this.keys.handles) return;
    this.keys.handles = key;
    const g = this.handles;
    g.clear();
    if (!r) return;
    for (const e of ['N', 'S', 'E', 'W'] as Edge[]) {
      const p = handlePos(r, e);
      const horiz = e === 'N' || e === 'S';
      const len = size * 2, th = size * 0.9;
      const hw = horiz ? len : th, hh = horiz ? th : len;
      const on = e === active;
      g.roundRect(p.x - hw / 2, p.y - hh / 2, hw, hh, th / 2).fill({ color: on ? C.sel : C.cream }).stroke({ width: Math.max(1.5, size * 0.16), color: C.wood });
      // grip lines
      const gl = th * 0.32;
      for (let k = -1; k <= 1; k++) {
        if (horiz) g.moveTo(p.x + k * th * 0.35, p.y - gl).lineTo(p.x + k * th * 0.35, p.y + gl);
        else g.moveTo(p.x - gl, p.y + k * th * 0.35).lineTo(p.x + gl, p.y + k * th * 0.35);
      }
      g.stroke({ width: Math.max(1, size * 0.1), color: C.wood, alpha: 0.8 });
    }
  }

  /** selection ring at an agent's feet (world px); only moves, never redraws */
  setRing(x: number, y: number, visible: boolean) {
    this.ring.visible = visible;
    if (visible) this.ring.position.set(x, y);
  }

  /** guard radius circles around tile centres */
  setRadius(centres: readonly { x: number; y: number; ghost?: boolean }[], rTiles: number) {
    let key = rTiles + ':';
    for (const c of centres) key += `${c.x},${c.y},${c.ghost ? 1 : 0};`;
    if (!centres.length) key = '';
    if (key === this.keys.radius) return;
    this.keys.radius = key;
    const g = this.radius;
    g.clear();
    const R = rTiles * TILE;
    for (const c of centres) g.circle(c.x * TILE, c.y * TILE, R).fill({ color: c.ghost ? C.sel : C.tealLight, alpha: c.ghost ? 0.14 : 0.12 });
    for (const c of centres) {
      // dashed rim
      const n = Math.max(24, Math.round((2 * Math.PI * R) / 14));
      for (let i = 0; i < n; i += 2) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        g.moveTo(c.x * TILE + Math.cos(a0) * R, c.y * TILE + Math.sin(a0) * R).arc(c.x * TILE, c.y * TILE, R, a0, a1);
      }
      g.stroke({ width: 2.5, color: c.ghost ? C.selLine : C.teal, alpha: 0.85 });
    }
  }

  /** dashed lines (world px): mint = bonus, coral = noise */
  setAdj(lines: readonly Line[]) {
    let key = '';
    for (const l of lines) key += `${l.x1|0},${l.y1|0},${l.x2|0},${l.y2|0},${+l.good};`;
    if (key === this.keys.adj) return;
    this.keys.adj = key;
    const g = this.adj;
    g.clear();
    for (const good of [true, false]) {
      let any = false;
      for (const l of lines) {
        if (l.good !== good) continue;
        any = true;
        const dx = l.x2 - l.x1, dy = l.y2 - l.y1, len = Math.hypot(dx, dy);
        if (len < 1) continue;
        const ux = dx / len, uy = dy / len;
        for (let s = 0; s < len; s += 12) {
          const e = Math.min(len, s + 7);
          g.moveTo(l.x1 + ux * s, l.y1 + uy * s).lineTo(l.x1 + ux * e, l.y1 + uy * e);
        }
      }
      if (any) g.stroke({ width: 3, color: good ? C.okLine : C.badLine, alpha: 0.95, cap: 'round' });
    }
    for (const l of lines) g.circle(l.x2, l.y2, 4.5).fill({ color: l.good ? C.ok : C.bad }).stroke({ width: 1.5, color: C.cream });
  }

  /** crate stacks beside workshop doors (tile coords of the stack's foot point) */
  setCrates(stacks: readonly CrateStack[]) {
    let key = '';
    for (const s of stacks) key += `${s.x},${s.y},${Math.min(3, s.n)};`;
    if (key === this.keys.crates) return;
    this.keys.crates = key;
    if (!hasTex('crate')) return;
    let k = 0;
    for (const s of stacks) for (let i = 0; i < Math.min(3, s.n) && k < MAX_CRATES; i++, k++) {
      let sp = this.pool[k];
      if (!sp) { sp = new Sprite(tex('crate')); this.pool.push(sp); this.crates.addChild(sp); }
      sp.visible = true;
      const off = [[0, 0], [16, 1], [8, -15]][i];
      sp.position.set(s.x * TILE + off[0] - 8, s.y * TILE + off[1]);
    }
    for (; k < this.pool.length; k++) this.pool[k].visible = false;
  }

  destroy() { this.root.destroy({ children: true }); }
}

/** centre of an edge handle in world px */
export function handlePos(r: Rect, e: Edge) {
  const x = r.x * TILE, y = r.y * TILE, w = r.w * TILE, h = r.h * TILE;
  switch (e) {
    case 'N': return { x: x + w / 2, y };
    case 'S': return { x: x + w / 2, y: y + h };
    case 'W': return { x, y: y + h / 2 };
    default: return { x: x + w, y: y + h / 2 };
  }
}
