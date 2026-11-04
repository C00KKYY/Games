/** Renders a sim World: static island props, rooms (rebuilt when the grid version changes), agents with smoothing. */
import { Sprite, Container, type Application } from 'pixi.js';
import { WorldView, TILE } from './world';
import { AgentView, SECURITY, type Look } from './agentsView';
import { Ambient } from './fx';
import { tex } from './atlas';
import { rclock } from './rclock';
import { START_DECOR, FERRY_POS, GATE_X, GATE_Y, OFFICE, DEPOT, BOOTH } from '../content/site1';
import { P } from '../../art/palette';
import type { World, Agent } from '../sim/types';
import { hourOf } from '../sim/time';

const hex = (h: string) => parseInt(h.slice(1), 16);
const ACC_TINTS = [hex(P.sage500), hex(P.teal500), hex(P.gold500), hex(P.brick500), hex(P.ink500)];

export function lookFor(a: Agent): Look {
  if (a.kind === 'staff' || a.kind === 'crew') {
    switch (a.role) {
      case 'cook': return { species: 'bear', overall: hex(P.cream300), stripe: null, paw: hex(P.wood700), acc: 'chef' };
      case 'teacher': return { species: 'bear', overall: hex(P.brick700), stripe: null, paw: hex(P.wood700), acc: 'glasses' };
      case 'guard': return { species: 'bulldog', overall: hex(P.ink700), stripe: null, paw: hex(P.brick500), acc: 'guardcap' };
      case 'janitor': return { species: 'bulldog', overall: hex(P.sage700), stripe: null, paw: hex(P.brick500), acc: 'beanie', accTint: hex(P.teal500) };
      case 'clerk': return { species: 'beaver', overall: hex(P.teal700), stripe: null, paw: hex(P.wood700), acc: 'glasses' };
      default: return { species: 'beaver', overall: hex(P.gold700), stripe: null, paw: hex(P.wood700), acc: 'beanie', accTint: hex(P.gold500) };
    }
  }
  const sec = SECURITY[a.security];
  const species = a.species === 'weasel' ? 'weasel' : 'raccoon';
  const k = a.look % 7;
  const acc: Look['acc'] = k === 1 ? 'beanie' : k === 2 ? 'glasses' : k === 3 ? 'scarf' : k === 4 ? 'bandage' : undefined;
  return { species, overall: sec.overall, stripe: sec.stripe, paw: species === 'raccoon' ? hex(P.ink700) : hex(P.wood700), acc, accTint: ACC_TINTS[(a.look >> 3) % ACC_TINTS.length], tail: species };
}

interface Disp { v: AgentView | null; s: Sprite | null; x: number; y: number }

export class SimView {
  world = new WorldView();
  private agents = new Map<number, Disp>();
  private version = -1;
  private glows: Sprite[] = [];
  private amb: Ambient;
  private ferry: Sprite;
  private crates: Sprite[] = [];
  private decor: { s: Sprite; x: number; y: number }[] = [];

  constructor(app: Application, private w: World) {
    app.stage.addChild(this.world.root);
    const wv = this.world;
    wv.buildSea();
    for (const d of START_DECOR) this.decor.push({ s: wv.addProp(d.s, d.x, d.y), x: d.x, y: d.y });
    wv.addProp('office', OFFICE.x, OFFICE.y + OFFICE.h, (OFFICE.y + OFFICE.h) * TILE - 2);
    wv.addProp('booth', BOOTH.x - 0.1, BOOTH.y + 1.1, (BOOTH.y + 1) * TILE);
    wv.addProp('gate', GATE_X - 0.125, GATE_Y, GATE_Y * TILE);
    for (const [x, y] of [[DEPOT.x + 0.4, DEPOT.y + 0.6], [DEPOT.x + 0.9, DEPOT.y + 0.9], [DEPOT.x + 0.3, DEPOT.y + 1.05]]) this.crates.push(wv.addProp('crate', x, y));
    this.ferry = wv.addProp('ferry', FERRY_POS.x, FERRY_POS.y, FERRY_POS.y * TILE - 100);
    const lamps = START_DECOR.filter(d => d.s === 'lamp').map(d => ({ x: d.x * TILE, y: d.y * TILE - 46 }));
    for (const p of [...lamps, { x: 5 * TILE + 19, y: 21 * TILE - 30 }, { x: 5 * TILE + 77, y: 21 * TILE - 30 }, { x: (GATE_X + 1) * TILE, y: GATE_Y * TILE - 62 }]) {
      const g = new Sprite(tex('glow')); g.position.set(p.x, p.y); g.scale.set(1.1); g.alpha = 0; wv.lights.addChild(g); this.glows.push(g);
    }
    this.amb = new Ambient(wv.sea, wv.fx, wv.lights);
  }

  get container(): Container { return this.world.root; }

  private rebuildRooms() {
    const wv = this.world, w = this.w;
    wv.clearRooms();
    wv.buildGround(w.grid.ground, w.rooms.filter(r => !['gate', 'dock', 'office'].includes(r.type)).map(r => ({ id: String(r.id), type: r.type, x: r.x, y: r.y, w: r.w, h: r.h, door: { x: r.door.x, side: r.door.side === 'N' ? 'N' : 'S' }, stage: r.stage, level: r.level })));
    const steam: { x: number; y: number }[] = [];
    for (const r of w.rooms) {
      if (['gate', 'dock', 'office'].includes(r.type)) continue;
      wv.addSimRoom(r);
      if (r.type === 'canteen') for (const f of r.furniture) if (f.sprite.startsWith('counter')) steam.push({ x: r.x * TILE + f.x + 11, y: r.y * TILE + f.y - 33 }, { x: r.x * TILE + f.x + 53, y: r.y * TILE + f.y - 33 });
    }
    this.amb.steamSources = steam;
    // natural decor standing where a room was built is cleared
    for (const d of this.decor) d.s.visible = !w.rooms.some(r => d.x >= r.x - 0.2 && d.x <= r.x + r.w + 0.2 && d.y >= r.y && d.y <= r.y + r.h + 0.4);
    this.version = w.cache.version;
  }

  update(dt: number) {
    const w = this.w;
    if (w.cache.version !== this.version) this.rebuildRooms();
    // night
    const h = hourOf(w.t);
    const n = h >= 22 || h < 5 ? 1 : h >= 19 ? (h - 19) / 3 : h < 7 ? 1 - (h - 5) / 2 : 0;
    this.amb.night = n;
    const lerp = (a: number, b: number) => Math.round((a + (b - a) * n) * 255);
    this.world.tinted.tint = (lerp(1, 0xb6 / 255) << 16) | (lerp(1, 0xc0 / 255) << 8) | lerp(1, 0xdc / 255);
    this.glows.forEach((g, i) => { g.alpha = n * 0.85 * (0.92 + Math.sin(rclock.t * 5.5 + i * 1.7) * 0.04); });
    this.amb.update(dt);
    // ferry: away → off screen to the west, arriving/docked at the berth
    const f = w.ferry;
    const targetX = f.state === 'away' ? -9 : f.state === 'leaving' ? -9 : FERRY_POS.x;
    this.ferry.x += ((targetX * TILE) - this.ferry.x) * Math.min(1, dt * (f.state === 'leaving' ? 0.8 : 1.6));
    this.ferry.y = FERRY_POS.y * TILE + Math.sin(rclock.t * 1.1) * 1.2;
    // agents
    const seen = new Set<number>();
    for (const a of w.agents) {
      seen.add(a.id);
      let d = this.agents.get(a.id);
      if (!d) {
        d = { v: null, s: null, x: a.x * TILE, y: a.y * TILE };
        if (a.kind === 'cart') { d.s = new Sprite(tex('cart')); this.world.objects.addChild(d.s); }
        else { d.v = new AgentView(lookFor(a)); this.world.objects.addChild(d.v.c); }
        this.agents.set(a.id, d);
      }
      const tx = a.x * TILE, ty = a.y * TILE;
      const far = Math.hypot(tx - d.x, ty - d.y) > TILE * 2;
      const k = far ? 1 : Math.min(1, dt * 14);
      const px = d.x, py = d.y;
      d.x += (tx - d.x) * k; d.y += (ty - d.y) * k;
      const sp = Math.hypot(d.x - px, d.y - py) / Math.max(1e-3, dt);
      if (d.s) { d.s.position.set(d.x, d.y + 6); d.s.zIndex = d.y + 6; d.s.scale.x = a.dir === 'W' ? -1 : 1; continue; }
      const v = d.v!;
      const dir = a.dir;
      if (v.dir !== dir && (a.moving || a.state === 'using')) v.setDir(dir);
      v.c.position.set(d.x, d.y); v.c.zIndex = d.y;
      v.c.visible = !(a.flags & 128);
      v.update(dt, a.moving ? Math.max(sp, 20) : 0);
    }
    for (const [id, d] of this.agents) if (!seen.has(id)) { d.v?.c.destroy({ children: true }); d.s?.destroy(); this.agents.delete(id); }
  }
}
