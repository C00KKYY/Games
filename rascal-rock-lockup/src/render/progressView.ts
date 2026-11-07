/**
 * World visuals of the M5 systems (docs/M5_DESIGN.md §13). Owner: art-m5.
 *  - finished projects (content/progress.ts PROJECTS[].visual, read from w.projects.done): furniture variants
 *    (bunkBedPlus, knitStationPro + riding yarn, deskLamp + lamp glow), props (cookbook + extra steam, form tray with
 *    the golden stamp, tetherball pole + swinging ball, suggestion box + heart pops, mop buckets), soap bubbles over
 *    every shower. Whistle/mop on staff, racing cart and the bigger ferry are swapped in SimView.
 *  - hired leads: Olli (horn) next to the Warden's Office at the dock road, Becca (clipboard) at the crate depot;
 *    `leadAutoTap` → Olli raises the horn
 *  - goose inspector (w.inspection.walker while phase walking/result), approval seal at every `inspectorAt`
 *  - dock teaser board for the morning VIP (vipBoard(w): hidden | teaser | ready: sun tag / ferry tag); its text is the
 *    DOM plaque of ui/eventBanner.ts, which should anchor at VIP_BOARD_TOP
 *  - site-2 silhouette in the north-east sea; lit lighthouse + sweeping beam once site 1 is completed
 *  - food fight: a cartoon brawl cloud over every brawling rascal
 *  - parcels: shaded unowned land, rope line on the boundary, a "for sale" sign per parcel, roll-out on 'parcel'
 * Mounted by SimView: constructor once, onRooms() after every room rebuild, update(dt) every frame; events come from
 * juice.ts (onEvent). Sprites are created when a state appears and kept; no allocation in the steady frame.
 */
import { Container, Sprite, Texture } from 'pixi.js';
import type { World, SimEvent, ProjectId, LeadId, Room } from '../sim/types';
import type { WorldView } from './world';
import { TILE } from './world';
import { tex } from './atlas';
import { AgentView, type Look } from './agentsView';
import { rclock } from './rclock';
import { P } from '../../art/palette';
import { BOOTH, OFFICE, DEPOT, MAP_W, MAP_H, SALE_SIGNS } from '../content/site1';
import { PARCELS } from '../content/balance';
import { PROJECTS } from '../content/progress';
import { vipBoard } from '../sim/vip';
import { hourOf } from '../sim/time';

const hex = (h: string) => parseInt(h.slice(1), 16);
const SKIP = new Set(['gate', 'dock', 'office']);
const PIDX = new Map(PROJECTS.map((p, i) => [p.id, i] as const));
const bit = (id: ProjectId) => 1 << (PIDX.get(id) ?? 31);
/** furniture that changes its sprite with a project */
const SWAP: Record<string, { id: ProjectId; to: string }> = {
  bunkBed: { id: 'mattresses', to: 'bunkBedPlus' }, knitStation: { id: 'assembly', to: 'knitStationPro' }, desk: { id: 'nightSchool', to: 'deskLamp' },
};
/** where things stand (tile units) */
const POS = {
  vipBoard: { x: 0.2, y: 19.3 },
  olli: { x: 4.15, y: 20.25 }, becca: { x: DEPOT.x + 3.35, y: DEPOT.y + 1.0 },
  suggestion: { x: OFFICE.x + 2.05, y: OFFICE.y + OFFICE.h + 0.2 },
  isle: { x: MAP_W + 3.3, y: 3.4 },
};
/** top centre of the morning-VIP board (tile units) – anchor for the DOM text plaque (ui/eventBanner.ts) */
export const VIP_BOARD_TOP = { x: POS.vipBoard.x, y: POS.vipBoard.y - 52 / TILE };

interface Pop { s: Sprite; t: number; sx: number; sy: number }
interface Particle { s: Sprite; on: boolean; t: number; life: number; x: number; y: number; vx: number; vy: number; wob: number }
interface Rider { s: Sprite; x0: number; x1: number; y: number; t: number; flip: number }
interface Tether { pole: Sprite; ball: Sprite; rope: Sprite; x: number; y: number; t: number }
interface LeadView { v: AgentView; x: number; y: number; id: LeadId }
interface Cloud { s: Sprite; id: number; t: number }
interface Shade { s: Sprite; k: number; x0: number; y0: number; x1: number; y1: number; wipe: number; dir: 'E' | 'N' | 'S' | 'W' }

/** small fixed pool of simple particles (bubbles, steam, hearts, leaves) */
class Pool {
  ps: Particle[] = [];
  constructor(parent: Container, n: number, t: Texture) {
    for (let i = 0; i < n; i++) { const s = new Sprite(t); s.anchor.set(0.5); s.visible = false; parent.addChild(s); this.ps.push({ s, on: false, t: 0, life: 1, x: 0, y: 0, vx: 0, vy: 0, wob: 0 }); }
  }
  spawn(x: number, y: number, life: number, vx: number, vy: number): Particle | null {
    const p = this.ps.find(q => !q.on); if (!p) return null;
    p.on = true; p.t = 0; p.life = life; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.wob = Math.random() * 6;
    p.s.visible = true; p.s.position.set(x, y); p.s.alpha = 1; p.s.scale.set(0.3); p.s.rotation = 0;
    return p;
  }
  update(dt: number, kind: 'bubble' | 'steam' | 'heart' | 'leaf') {
    for (const p of this.ps) {
      if (!p.on) continue;
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) { p.on = false; p.s.visible = false; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const s = p.s;
      if (kind === 'bubble') { s.position.set(p.x + Math.sin(p.t * 3 + p.wob) * 3, p.y); s.scale.set(0.5 + Math.min(1, k * 3) * 0.6); s.alpha = k < 0.85 ? 0.95 : (1 - k) / 0.15; }
      else if (kind === 'steam') { s.position.set(p.x + Math.sin(p.t * 2 + p.wob) * 2, p.y); s.scale.set(0.5 + k * 1.1); s.alpha = 0.55 * (1 - k); }
      else if (kind === 'heart') { const g = Math.min(1, p.t / 0.25); s.position.set(p.x + Math.sin(p.t * 4 + p.wob) * 2.5, p.y); s.scale.set(0.9 * (1 - Math.pow(1 - g, 3) * Math.cos(g * 9)) ); s.alpha = k < 0.7 ? 1 : (1 - k) / 0.3; }
      else { p.vy += 60 * dt; s.position.set(p.x, p.y); s.rotation += dt * 6; s.scale.set(1); s.alpha = 1 - k; }
    }
  }
}

export class ProgressView {
  /** per-room props (rebuilt with the rooms or when a project finishes) */
  private roomProps: Sprite[] = [];
  private glows: Sprite[] = [];
  private riders: Rider[] = [];
  private tethers: Tether[] = [];
  private swapped: { s: Sprite; id: ProjectId }[] = [];
  private bubbleSrc: { x: number; y: number }[] = [];
  private steamSrc: { x: number; y: number }[] = [];
  private bubbleT = 0; private steamT = 0; private heartT = 0;
  private doneMask = -1;
  private pops: Pop[] = [];
  // fixed props (lazy)
  private tray: Sprite | null = null;
  private sBox: Sprite | null = null;
  private board: Sprite | null = null; private tag: Sprite | null = null;
  private isle: Sprite; private lantern: Sprite; private beam: Sprite; private isleLit = false;
  private leads: LeadView[] = [];
  private goose: AgentView | null = null; private gx = 0; private gy = 0; private gooseA = 0;
  private seals: { s: Sprite; t: number; on: boolean }[] = [];
  private clouds: Cloud[] = [];
  private cloudScan = 0;
  // parcels
  private parcelLayer = new Container();
  private shades: Shade[] = [];
  private lines: { s: Sprite; key: string; fall: number }[] = [];
  private signs: Sprite[] = [];
  private parcelMask = -1;
  // particles
  private bubbles: Pool; private steam: Pool; private hearts: Pool; private leaves: Pool;

  constructor(private wv: WorldView, private w: World) {
    const fx = wv.fx;
    this.bubbles = new Pool(fx, 28, tex('bubble'));
    this.steam = new Pool(fx, 12, tex('steam'));
    this.hearts = new Pool(fx, 4, tex('heart'));
    this.leaves = new Pool(fx, 24, tex('leaf'));
    for (let i = 0; i < 3; i++) { const s = new Sprite(tex('stampSeal')); s.anchor.set(0.5); s.visible = false; wv.top.addChild(s); this.seals.push({ s, t: 0, on: false }); }
    for (let i = 0; i < 4; i++) { const s = new Sprite(tex('brawlCloud')); s.visible = false; fx.addChild(s); this.clouds.push({ s, id: -1, t: 0 }); }
    // site 2 silhouette (Brief §5.5): distant isle in the north-east sea
    this.isle = new Sprite(tex('lighthouseIsle'));
    this.isle.position.set(POS.isle.x * TILE, POS.isle.y * TILE);
    wv.sea.addChild(this.isle);
    this.lantern = new Sprite(tex('lanternLit')); this.lantern.position.set(this.isle.x + 9, this.isle.y - 105); this.lantern.visible = false; wv.sea.addChild(this.lantern);
    this.beam = new Sprite(tex('beam')); this.beam.position.set(this.isle.x + 9, this.isle.y - 105); this.beam.visible = false; this.beam.scale.set(1.5, 1.1); wv.lights.addChild(this.beam);
    this.applyIsle();
    // parcels: shading under the walls/furniture, above the ground
    this.parcelLayer.label = 'parcels';
    wv.tinted.addChildAt(this.parcelLayer, wv.tinted.getChildIndex(wv.shadows));
  }

  // ------------------------------------------------------------------ rooms & projects
  /** rooms were rebuilt (furniture sprites are new): re-apply variants and props */
  onRooms() { this.applyProjects(); this.syncParcels(true); }

  private done(id: ProjectId) { return !!this.w.projects?.done?.[id]; }
  private mask() { let m = 0; const d = this.w.projects?.done; if (d) for (const p of PROJECTS) if (d[p.id]) m |= bit(p.id); return m; }

  private clearRoomProps() {
    for (const s of this.roomProps) s.destroy();
    for (const g of this.glows) g.destroy();
    this.roomProps.length = 0; this.glows.length = 0; this.riders.length = 0; this.tethers.length = 0; this.swapped.length = 0;
    this.bubbleSrc.length = 0; this.steamSrc.length = 0;
  }

  private add(name: string, x: number, y: number, z: number, parent: Container = this.wv.objects): Sprite {
    const s = new Sprite(tex(name)); s.position.set(x, y); s.zIndex = z; parent.addChild(s); this.roomProps.push(s); return s;
  }
  private swapTex(s: Sprite, name: string) {
    const t = tex(name); if (s.texture === t) return;
    s.texture = t; const a = t.defaultAnchor; s.anchor.set(a?.x ?? 0, a?.y ?? 0);
  }

  private applyProjects() {
    this.clearRoomProps();
    const w = this.w;
    this.doneMask = this.mask();
    for (const r of w.rooms) {
      if (SKIP.has(r.type)) continue;
      const items = this.wv.roomViews.get(String(r.id));
      if (!items) continue;
      const f0 = items.length - r.furniture.length;
      const X = r.x * TILE, Y = r.y * TILE;
      let tetherDone = false;
      r.furniture.forEach((f, i) => {
        const s = items[f0 + i] as Sprite | undefined;
        if (!s || s.destroyed) return;
        const fx = X + f.x, fy = Y + f.y, z = fy + (f.z ?? 0), flip = f.flipX ? -1 : 1;
        const sw = SWAP[f.sprite];
        if (sw && this.done(sw.id)) { this.swapTex(s, sw.to); this.swapped.push({ s, id: sw.id }); }
        if (!r.built) return;
        if (f.sprite === 'knitStation' && this.done('assembly')) {
          const b = this.add('yarnBall', fx, fy - 25, z + 0.5);
          this.riders.push({ s: b, x0: fx + 2 * flip, x1: fx + 30 * flip, y: fy - 25, t: (i * 0.37) % 1, flip });
        }
        if (f.sprite === 'desk' && this.done('nightSchool')) {
          const g = new Sprite(tex('glow')); g.anchor.set(0.5); g.position.set(fx + 19 * flip, fy - 24); g.scale.set(0.36); g.alpha = 0; this.wv.lights.addChild(g); this.glows.push(g);
        }
        if (f.sprite.startsWith('counter') && this.done('recipeBook')) {
          this.add('cookbook', fx + 32, fy - 22, z + 1);
          this.steamSrc.push({ x: fx + 11, y: fy - 34 }, { x: fx + 53, y: fy - 34 });
        }
        if (f.sprite === 'shower' && this.done('bubbleBath')) this.bubbleSrc.push({ x: fx + 16, y: fy - 36 });
        if (f.sprite === 'yardBall' && !tetherDone && this.done('tetherball')) { tetherDone = true; s.visible = false; this.addTether(fx, fy + 4, z); }
      });
      if (!r.built) continue;
      if (r.type === 'yard' && this.done('tetherball') && !tetherDone) this.addTether((r.x + r.w / 2) * TILE, (r.y + r.h / 2) * TILE + 16, (r.y + r.h / 2) * TILE + 16);
      if (r.type === 'wash' && this.done('squeakyMops')) { const p = this.doorInside(r); this.add('mopBucket', p.x, p.y, p.y); }
    }
    // fixed props
    if (this.done('form27b')) {
      if (!this.tray) { this.tray = new Sprite(tex('formTray')); this.wv.objects.addChild(this.tray); }
      const bx = (BOOTH.x - 0.1) * TILE, by = (BOOTH.y + 1.1) * TILE;
      this.tray.position.set(bx + 19, by - 15); this.tray.zIndex = (BOOTH.y + 1) * TILE + 2; this.tray.visible = true;
    } else if (this.tray) this.tray.visible = false;
    if (this.done('suggestionBox')) {
      if (!this.sBox) { this.sBox = new Sprite(tex('suggestionBox')); this.wv.objects.addChild(this.sBox); }
      this.sBox.position.set(POS.suggestion.x * TILE, POS.suggestion.y * TILE); this.sBox.zIndex = POS.suggestion.y * TILE; this.sBox.visible = true;
    } else if (this.sBox) this.sBox.visible = false;
  }

  /** a point just inside the room door (mop bucket) */
  private doorInside(r: Room) {
    const d = r.door, cx = (d.x + 0.5) * TILE, cy = (d.y + 0.5) * TILE;
    const lx = Math.min((r.x + r.w) * TILE - 10, Math.max(r.x * TILE + 10, cx + (d.side === 'E' || d.side === 'W' ? 0 : 17)));
    const ly = Math.min((r.y + r.h) * TILE - 2, Math.max(r.y * TILE + 24, cy + (d.side === 'S' ? 13 : d.side === 'N' ? 22 : 18)));
    return { x: lx, y: ly };
  }

  private addTether(x: number, y: number, z: number) {
    const pole = this.add('tetherPole', x, y, z);
    const rope = this.add('rope', x, y - 44, z + 1); rope.tint = hex(P.cream500);
    const ball = this.add('tetherBall', x, y - 30, z + 2);
    this.tethers.push({ pole, ball, rope, x, y, t: Math.random() * 6 });
  }

  /** world points of a project's visuals (juice: celebration puffs at every place where something changed) */
  spots(id: ProjectId): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    const push = (x: number, y: number) => { if (out.length < 6) out.push({ x, y }); };
    for (const q of this.swapped) if (q.id === id) push(q.s.x + (q.s.texture.width * (0.5 - q.s.anchor.x)) * Math.sign(q.s.scale.x || 1), q.s.y - q.s.texture.height * q.s.anchor.y * 0.6);
    switch (id) {
      case 'recipeBook': for (let i = 0; i < this.steamSrc.length; i += 2) push(this.steamSrc[i].x + 21, this.steamSrc[i].y + 12); break;
      case 'bubbleBath': for (const b of this.bubbleSrc) push(b.x, b.y + 10); break;
      case 'tetherball': for (const q of this.tethers) push(q.x, q.y - 20); break;
      case 'form27b': if (this.tray) push(this.tray.x, this.tray.y - 8); break;
      case 'suggestionBox': if (this.sBox) push(this.sBox.x, this.sBox.y - 20); break;
      case 'squeakyMops': for (const s of this.roomProps) if (s.texture === tex('mopBucket')) push(s.x, s.y - 10); break;
      case 'biggerFerry': case 'speedyCarts': case 'whistle': break; // SimView sprites; juice finds those itself
    }
    return out;
  }

  /** elastic grow-in of everything that belongs to a freshly finished project */
  private popProject(id: ProjectId) {
    const targets: Sprite[] = [];
    for (const q of this.swapped) if (q.id === id) targets.push(q.s);
    if (id === 'form27b' && this.tray) targets.push(this.tray);
    if (id === 'suggestionBox' && this.sBox) targets.push(this.sBox);
    if (id === 'tetherball') for (const q of this.tethers) targets.push(q.pole);
    if (id === 'recipeBook' || id === 'squeakyMops') {
      const want = tex(id === 'recipeBook' ? 'cookbook' : 'mopBucket');
      for (const s of this.roomProps) if (s.texture === want) targets.push(s);
    }
    for (const s of targets) { this.pops.push({ s, t: 0, sx: s.scale.x || 1, sy: s.scale.y || 1 }); s.scale.set(0.001); }
  }

  // ------------------------------------------------------------------ events (forwarded by juice.ts)
  onEvent(e: SimEvent) {
    switch (e.type) {
      case 'projectDone': this.applyProjects(); this.popProject(e.id as ProjectId); return;
      case 'leadAutoTap': { const l = this.leads.find(q => q.id === e.id); l?.v.raise(); return; }
      case 'leadHired': this.syncLeads(); { const l = this.leads.find(q => q.id === e.id); l?.v.hop(2); } return;
      case 'inspectorAt': this.goose?.raise(); this.seal(this.gx, this.gy - 46); return;
      case 'inspectionResult': if (e.passed) { this.goose?.raise(); this.goose?.hop(2); } return;
      case 'siteCompleted': this.applyIsle(); return;
      case 'parcel': this.rollOut(Number(e.k)); return;
    }
  }

  /** current world point of a lead (juice) */
  leadPos(id: string) { const l = this.leads.find(q => q.id === id); return l ? { x: l.x, y: l.y } : null; }
  /** goose position while visible (juice) */
  goosePos() { return this.goose?.c.visible ? { x: this.gx, y: this.gy } : null; }

  private seal(x: number, y: number) {
    const q = this.seals.find(s => !s.on) ?? this.seals[0];
    q.on = true; q.t = 0; q.s.position.set(x, y); q.s.visible = true;
  }

  // ------------------------------------------------------------------ leads
  private syncLeads() {
    const hired = new Set(this.w.leads?.slots?.filter(Boolean) as LeadId[] ?? []);
    for (let i = this.leads.length - 1; i >= 0; i--) if (!hired.has(this.leads[i].id)) { this.leads[i].v.c.destroy({ children: true }); this.leads.splice(i, 1); }
    for (const id of hired) {
      if (this.leads.some(l => l.id === id)) continue;
      const intake = id === 'intake', p = intake ? POS.olli : POS.becca;
      const look: Look = intake
        ? { species: 'beaver', overall: hex(P.mint700), stripe: null, paw: hex(P.wood700), acc: 'beanie', accTint: hex(P.coral500), held: 'horn' }
        : { species: 'beaver', overall: hex(P.mint700), stripe: null, paw: hex(P.wood700), acc: 'glasses', held: 'clipboard' };
      const v = new AgentView(look);
      v.setDir(intake ? 'W' : 'S');
      const x = p.x * TILE, y = p.y * TILE;
      v.c.position.set(x, y); v.c.zIndex = y;
      this.wv.objects.addChild(v.c);
      this.leads.push({ v, x, y, id });
    }
  }

  // ------------------------------------------------------------------ goose inspector
  private updateGoose(dt: number) {
    const I = this.w.inspection;
    const show = !!I && (I.phase === 'walking' || I.phase === 'result');
    if (show && !this.goose) {
      this.goose = new AgentView({ species: 'goose', overall: hex(P.stone700), stripe: null, paw: hex(P.cream500), tail: 'goose', foot: 'footGoose', held: 'clipboard', acc: undefined });
      this.goose.c.alpha = 0; this.gooseA = 0;
      this.gx = I.walker.x * TILE; this.gy = I.walker.y * TILE;
      this.wv.objects.addChild(this.goose.c);
    }
    const g = this.goose;
    if (!g) return;
    this.gooseA += (show ? 1 : -1) * dt * 3;
    this.gooseA = Math.max(0, Math.min(1, this.gooseA));
    g.c.alpha = this.gooseA; g.c.visible = this.gooseA > 0;
    if (!g.c.visible) return;
    const wk = I.walker, tx = wk.x * TILE, ty = wk.y * TILE;
    const far = Math.hypot(tx - this.gx, ty - this.gy) > TILE * 3;
    const k = far ? 1 : Math.min(1, dt * 12);
    const px = this.gx, py = this.gy;
    this.gx += (tx - this.gx) * k; this.gy += (ty - this.gy) * k;
    const sp = Math.hypot(this.gx - px, this.gy - py) / Math.max(1e-3, dt);
    const dir = I.phase === 'result' ? 'S' : wk.dir;
    if (g.dir !== dir && (wk.moving || I.phase === 'result')) g.setDir(dir);
    g.c.position.set(this.gx, this.gy); g.c.zIndex = this.gy;
    g.update(dt, wk.moving && I.phase === 'walking' ? Math.max(sp, 24) : 0);
  }

  // ------------------------------------------------------------------ morning VIP board
  private updateBoard() {
    const st = vipBoard(this.w);
    if (st === 'hidden') { if (this.board) { this.board.visible = false; this.tag!.visible = false; } return; }
    const bx = POS.vipBoard.x * TILE, by = POS.vipBoard.y * TILE;
    if (!this.board) {
      this.board = new Sprite(tex('vipBoard')); this.board.position.set(bx, by); this.board.zIndex = by; this.wv.objects.addChild(this.board);
      this.tag = new Sprite(tex('vipTagSun')); this.tag.position.set(bx + 15, by - 44); this.tag.zIndex = by + 1; this.wv.objects.addChild(this.tag);
      this.pops.push({ s: this.board, t: 0, sx: 1, sy: 1 }); this.board.scale.set(0.001);
    }
    this.board.visible = this.tag!.visible = true;
    const tagTex = tex(st === 'ready' ? 'vipTagFerry' : 'vipTagSun');
    if (this.tag!.texture !== tagTex) { this.tag!.texture = tagTex; this.pops.push({ s: this.tag!, t: 0, sx: 1, sy: 1 }); }
    // ready: the ferry tag wiggles so the board reads as "news"
    this.tag!.rotation = st === 'ready' ? Math.sin(rclock.t * 6) * 0.12 * Math.max(0, Math.sin(rclock.t * 1.3)) : 0;
  }

  // ------------------------------------------------------------------ site 2 silhouette
  private applyIsle() {
    const lit = !!this.w.prestige?.completedSites?.includes(1);
    this.isleLit = lit;
    this.isle.tint = lit ? 0xffffff : hex(P.ink500);
    this.isle.alpha = lit ? 1 : 0.72;
    this.lantern.visible = lit; this.beam.visible = lit;
  }

  // ------------------------------------------------------------------ food fight
  private updateClouds(dt: number) {
    this.cloudScan += dt;
    if (this.cloudScan >= 0.2) {
      this.cloudScan = 0;
      for (const c of this.clouds) if (c.id >= 0 && !this.w.agents.some(a => a.id === c.id && a.state === 'brawling')) { c.id = -1; c.s.visible = false; }
      for (const a of this.w.agents) {
        if (a.state !== 'brawling' || this.clouds.some(c => c.id === a.id)) continue;
        const c = this.clouds.find(q => q.id < 0); if (!c) break;
        c.id = a.id; c.t = 0; c.s.visible = true;
      }
    }
    for (const c of this.clouds) {
      if (c.id < 0) continue;
      const a = this.w.agents.find(q => q.id === c.id);
      if (!a) { c.id = -1; c.s.visible = false; continue; }
      c.t += dt;
      const g = Math.min(1, c.t / 0.25);
      const j = Math.sin(c.t * 23) * 0.06, wob = Math.sin(c.t * 17 + c.id) * 1.5;
      c.s.anchor.set(0.5, 0.85);
      c.s.position.set(a.x * TILE + wob, a.y * TILE - 6 + Math.abs(Math.sin(c.t * 11)) * -2);
      c.s.scale.set((1.05 + j) * g, (1.05 - j) * g);
      c.s.rotation = Math.sin(c.t * 9 + c.id) * 0.06;
    }
  }

  // ------------------------------------------------------------------ parcels (Brief §3.6: "Zaun wird abgebaut, das neue Land rollt aus")
  private parcelBits() { let m = 0; (this.w.parcels ?? []).forEach((b, k) => { if (b) m |= 1 << k; }); return m; }
  /** rebuild shades, boundary lines and sale signs when the owned set changed (or always after a room rebuild) */
  private syncParcels(force = false) {
    const m = this.parcelBits();
    if (!force && m === this.parcelMask) return;
    this.parcelMask = m;
    const owned = this.w.parcels ?? [];
    // shades of unowned parcels (inset from the map edge so the sea stays untouched)
    for (const sh of this.shades) if (sh.wipe < 0 || owned[sh.k]) { if (sh.wipe < 0) { sh.s.destroy(); sh.k = -1; } }
    this.shades = this.shades.filter(sh => sh.k >= 0);
    PARCELS.forEach((p, k) => {
      if (owned[k] || this.shades.some(sh => sh.k === k)) return;
      const x0 = Math.max(p.x, 1.15) * TILE, y0 = Math.max(p.y, 1.1) * TILE;
      const x1 = Math.min(p.x + p.w, MAP_W - 1.15) * TILE, y1 = Math.min(p.y + p.h, MAP_H - 1.1) * TILE;
      const s = new Sprite(Texture.WHITE); s.tint = hex(P.ink900); s.alpha = 0.2;
      s.position.set(x0, y0); s.width = x1 - x0; s.height = y1 - y0;
      this.parcelLayer.addChild(s);
      this.shades.push({ s, k, x0, y0, x1, y1, wipe: -1, dir: 'E' });
    });
    // boundary lines between owned land and unowned land
    const g = this.w.grid, keep = new Set<string>();
    const land = (x: number, y: number) => x >= 1 && y >= 1 && x < MAP_W - 1 && y < MAP_H - 1;
    const own = (x: number, y: number) => !!g.owned[y * MAP_W + x];
    const road = (x: number, y: number) => !!g.road[y * MAP_W + x];
    const want: { key: string; name: string; x: number; y: number }[] = [];
    for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) {
      if (!land(x, y) || road(x, y)) continue;
      if (land(x + 1, y) && !road(x + 1, y) && own(x, y) !== own(x + 1, y)) want.push({ key: `v${x + 1},${y}`, name: 'parcelLineV', x: (x + 1) * TILE, y: (y + 1) * TILE });
      if (land(x, y + 1) && !road(x, y + 1) && own(x, y) !== own(x, y + 1)) want.push({ key: `h${x},${y + 1}`, name: 'parcelLineH', x: x * TILE, y: (y + 1) * TILE });
    }
    for (const q of want) {
      keep.add(q.key);
      if (this.lines.some(l => l.key === q.key)) continue;
      const s = new Sprite(tex(q.name)); s.position.set(q.x, q.name === 'parcelLineH' ? q.y - 18 : q.y); s.zIndex = s.y - 1;
      this.wv.objects.addChild(s);
      this.lines.push({ s, key: q.key, fall: -1 });
    }
    for (const l of this.lines) if (!keep.has(l.key) && l.fall < 0) l.fall = 0; // lines of a bought parcel fall over (update)
    // a "for sale" sign on every unowned parcel, near the owned land
    for (const s of this.signs) s.destroy();
    this.signs.length = 0;
    const SIGN = SALE_SIGNS; // shared with the tap hit-test in ui/tools.ts
    PARCELS.forEach((p, k) => {
      const at = SIGN[p.id];
      if (owned[k] || !at) return;
      const s = new Sprite(tex('saleSign')); s.position.set(at.x * TILE, at.y * TILE); s.zIndex = at.y * TILE;
      this.wv.objects.addChild(s); this.signs.push(s);
    });
  }

  /** a parcel was bought: its shade wipes away from the old boundary, leaves fly at the wipe front */
  private rollOut(k: number) {
    const sh = this.shades.find(q => q.k === k);
    const p = PARCELS[k];
    if (sh && p) {
      const st = PARCELS[0];
      sh.dir = p.x >= st.x + st.w ? 'E' : p.y + p.h <= st.y ? 'N' : p.y >= st.y + st.h ? 'S' : 'W';
      sh.wipe = 0;
    }
    this.syncParcels(true);
  }

  private updateParcels(dt: number) {
    this.syncParcels();
    for (const sh of this.shades) {
      if (sh.wipe < 0) continue;
      sh.wipe += dt / 1.4;
      const e = Math.min(1, sh.wipe), k = 1 - Math.pow(1 - e, 2);
      const W = sh.x1 - sh.x0, H = sh.y1 - sh.y0;
      let fx = 0, fy = 0, horiz = true;
      if (sh.dir === 'E') { sh.s.x = sh.x0 + W * k; sh.s.width = W * (1 - k); fx = sh.s.x; horiz = false; }
      else if (sh.dir === 'W') { sh.s.width = W * (1 - k); fx = sh.x0 + sh.s.width; horiz = false; }
      else if (sh.dir === 'S') { sh.s.y = sh.y0 + H * k; sh.s.height = H * (1 - k); fy = sh.s.y; }
      else { sh.s.height = H * (1 - k); fy = sh.y0 + sh.s.height; }
      if (e < 1 && Math.random() < dt * 40) {
        const x = horiz ? sh.x0 + Math.random() * W : fx, y = horiz ? fy : sh.y0 + Math.random() * H;
        this.leaves.spawn(x, y, 0.8, (Math.random() - 0.5) * 30, -40 - Math.random() * 30);
      }
      if (e >= 1) { sh.s.destroy(); sh.k = -1; }
    }
    this.shades = this.shades.filter(q => q.k >= 0);
    for (const l of this.lines) {
      if (l.fall < 0) continue;
      l.fall += dt / 0.45;
      if (l.fall >= 1) { l.s.destroy(); l.fall = 2; continue; }
      l.s.scale.y = 1 - l.fall; l.s.alpha = 1 - l.fall * 0.6;
    }
    if (this.lines.some(l => l.fall >= 2)) this.lines = this.lines.filter(l => l.fall < 2);
  }

  // ------------------------------------------------------------------ frame
  update(dt: number) {
    const w = this.w;
    if (this.mask() !== this.doneMask) this.applyProjects();
    const night = (() => { const h = hourOf(w.t); return h >= 22 || h < 5 ? 1 : h >= 19 ? (h - 19) / 3 : h < 7 ? 1 - (h - 5) / 2 : 0; })();
    const running = w.speed > 0;
    // riders on the conveyors (Assembly Knitting)
    for (const r of this.riders) { if (running) r.t = (r.t + dt * 0.45) % 1; r.s.x = r.x0 + (r.x1 - r.x0) * r.t; r.s.y = r.y - Math.abs(Math.sin(r.t * Math.PI * 6)) * 0.6; r.s.rotation = r.t * 9 * r.flip; }
    // desk lamps (Night School): soft in the day, glowing at night
    for (const g of this.glows) g.alpha = 0.18 + night * 0.7 + Math.sin(rclock.t * 3 + g.x) * 0.02;
    // tetherball: the ball circles the pole on an ellipse (seen from the 3/4 view), the rope follows
    for (const q of this.tethers) {
      if (running) q.t += dt * 2.6;
      const top = q.y - 44, bx = q.x + Math.cos(q.t) * 13, by = top + 16 + Math.sin(q.t) * 5;
      q.ball.position.set(bx, by); q.ball.zIndex = q.y + (Math.sin(q.t) > 0 ? 3 : -3);
      const dx = bx - q.x, dy = by - top;
      q.rope.rotation = Math.atan2(-dx, dy); q.rope.scale.y = Math.hypot(dx, dy) / 16; q.rope.zIndex = q.ball.zIndex - 0.5;
    }
    // particle sources
    if (running && this.bubbleSrc.length) {
      this.bubbleT -= dt;
      if (this.bubbleT <= 0) { this.bubbleT = 0.5 / Math.min(4, this.bubbleSrc.length); const b = this.bubbleSrc[Math.floor(Math.random() * this.bubbleSrc.length)]; this.bubbles.spawn(b.x + (Math.random() - 0.5) * 14, b.y, 1.6 + Math.random() * 0.6, (Math.random() - 0.5) * 6, -16 - Math.random() * 8); }
    }
    if (running && this.steamSrc.length) {
      this.steamT -= dt;
      if (this.steamT <= 0) { this.steamT = 0.35; const b = this.steamSrc[Math.floor(Math.random() * this.steamSrc.length)]; this.steam.spawn(b.x + (Math.random() - 0.5) * 6, b.y, 1.3, (Math.random() - 0.5) * 4, -14); }
    }
    if (running && this.sBox?.visible) {
      this.heartT -= dt;
      if (this.heartT <= 0) { this.heartT = 1.8 + Math.random() * 1.2; this.hearts.spawn(this.sBox.x + (Math.random() - 0.5) * 6, this.sBox.y - 30, 1.1, (Math.random() - 0.5) * 8, -18); }
    }
    this.bubbles.update(dt, 'bubble'); this.steam.update(dt, 'steam'); this.hearts.update(dt, 'heart'); this.leaves.update(dt, 'leaf');
    // grow-in pops
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      if (p.s.destroyed) { this.pops.splice(i, 1); continue; }
      p.t += dt;
      const g = Math.min(1, p.t / 0.55), el = 1 - Math.pow(1 - g, 3) * Math.cos(g * Math.PI * 3);
      p.s.scale.set(p.sx * Math.max(0.001, el), p.sy * Math.max(0.001, el));
      if (g >= 1) { p.s.scale.set(p.sx, p.sy); this.pops.splice(i, 1); }
    }
    // approval seals (inspectorAt)
    const z = this.wv.root.scale.x || 1;
    for (const q of this.seals) {
      if (!q.on) continue;
      q.t += dt;
      if (q.t >= 0.9) { q.on = false; q.s.visible = false; continue; }
      const g = Math.min(1, q.t / 0.18);
      q.s.scale.set((0.55 / z + 0.15) * (1.6 - 0.6 * g));
      q.s.rotation = -0.2 + g * 0.12;
      q.s.alpha = q.t < 0.65 ? 1 : 1 - (q.t - 0.65) / 0.25;
    }
    // lighthouse beam sweep (site 2 unlocked)
    if (!!w.prestige?.completedSites?.includes(1) !== this.isleLit) this.applyIsle();
    // the beam sweeps over the open sea north/east of the isle, never across the prison
    if (this.isleLit) { this.beam.rotation = -Math.PI * 0.3 + Math.sin(rclock.t * 0.6) * 0.75; this.beam.alpha = 0.12 + night * 0.4; this.lantern.alpha = 0.8 + Math.sin(rclock.t * 5) * 0.2; }
    if (this.leads.length !== (w.leads?.slots?.filter(Boolean).length ?? 0)) this.syncLeads();
    for (const l of this.leads) l.v.update(dt, 0);
    this.updateGoose(dt);
    this.updateBoard();
    this.updateClouds(dt);
    this.updateParcels(dt);
  }

  destroy() { /* sprites live in WorldView containers and are destroyed with them */ }
}
