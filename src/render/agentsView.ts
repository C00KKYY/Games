/** Layered, code-animated characters (STYLE_GUIDE §5, Brief §7.4). No per-frame allocation. */
import { Container, Sprite, Texture } from 'pixi.js';
import { tex, hasTex } from './atlas';
import { CHAR, type Dir } from './charLayout';
import { P } from '../../art/palette';
import { rclock } from './rclock';

const hex = (h: string) => parseInt(h.slice(1), 16);
export const SECURITY = {
  low: { overall: hex(P.gold700), stripe: hex(P.cream500) },
  mid: { overall: hex(P.teal700), stripe: hex(P.teal300) },
  high: { overall: hex(P.brick700), stripe: hex(P.coral500) },
} as const;

export type Held = 'clipboard' | 'whistle' | 'mop' | 'horn';
export interface Look {
  species: string;            // raccoon | weasel | bear | bulldog | beaver | badger | cat (VIP) | goose (inspector)
  overall: number;            // tint
  stripe: number | null;      // tint or none (staff)
  paw: number;
  acc?: 'beanie' | 'glasses' | 'scarf' | 'bandage' | 'chef' | 'guardcap' | 'tophat';
  accTint?: number;
  tail?: 'raccoon' | 'weasel' | 'cat' | 'goose';
  furTint?: number;           // subtle individual variation
  /** item in the right paw (clipboard, horn, mop) or on the chest (whistle) – M5 projects, leads, inspector */
  held?: Held | null;
  /** foot sprite override (goose: webbed feet) */
  foot?: string;
}

const ACC_DIRS: Record<string, Dir[]> = { glasses: ['S', 'E'], bandage: ['S', 'E'] };
/** held items: grip at the right paw (or the chest for the whistle); hidden in the N view except the mop stick */
const HELD_CHEST: Partial<Record<Held, boolean>> = { whistle: true };

export class AgentView {
  c = new Container();
  private footL = new Sprite(); private footR = new Sprite();
  private legL = new Sprite(); private legR = new Sprite();
  private body = new Sprite(); private stripes = new Sprite();
  private armL = new Sprite(); private armR = new Sprite();
  private pawL = new Sprite(); private pawR = new Sprite();
  private head = new Sprite(); private blink = new Sprite();
  private tail = new Sprite(); private acc = new Sprite();
  private held = new Sprite();
  private inner = new Container();
  private texCache: Record<string, Texture> = {};
  dir: Dir = 'S';
  /** walk phase in radians, advanced by speed */
  phase = 0;
  moving = false;
  private blinkT = 2 + Math.random() * 4;
  private blinkLeft = 0;
  idle: 'none' | 'scratch' | 'yawn' | 'stretch' | 'raise' = 'none';
  private idleT = 0;
  private idleCd = 4 + Math.random() * 8;
  seed = Math.random() * 10;
  /** juice: happy hops (count left, phase) and a squash impulse (tap feedback), both decay on their own */
  private hopN = 0; private hopT = 0; private squashT = 1;

  constructor(public look: Look) {
    this.c.addChild(this.inner);
    const parts = [this.tail, this.footL, this.footR, this.legL, this.legR, this.armL, this.body, this.stripes, this.armR, this.pawL, this.pawR, this.head, this.blink, this.acc, this.held];
    for (const p of parts) this.inner.addChild(p);
    this.c.eventMode = 'none';
    this.applyLook();
    this.setDir('S');
  }

  private t(name: string) { return (this.texCache[name] ??= tex(name)); }
  /** Pixi v8 applies a texture's defaultAnchor only in the constructor → set it explicitly */
  private set(s: Sprite, name: string) { const t = this.t(name); s.texture = t; const a = t.defaultAnchor; s.anchor.set(a?.x ?? 0, a?.y ?? 0); }

  applyLook() {
    const L = this.look;
    for (const s of [this.legL, this.legR, this.body, this.armL, this.armR]) s.tint = L.overall;
    this.stripes.tint = L.stripe ?? 0xffffff;
    this.stripes.visible = L.stripe !== null;
    this.pawL.tint = this.pawR.tint = L.paw;
    this.head.tint = this.blink.tint = L.furTint ?? 0xffffff;
    this.acc.tint = L.accTint ?? 0xffffff;
    const foot = L.foot ?? 'foot';
    this.set(this.footL, foot); this.set(this.footR, foot);
    this.held.visible = false;
    this.set(this.legL, 'leg'); this.set(this.legR, 'leg');
    this.set(this.armL, 'arm'); this.set(this.armR, 'arm');
    this.set(this.pawL, 'paw'); this.set(this.pawR, 'paw');
  }

  setDir(d: Dir) {
    this.dir = d;
    const td = d === 'W' ? 'E' : d;
    const L = this.look;
    this.inner.scale.x = d === 'W' ? -1 : 1;
    this.set(this.body, `body_${td}`);
    this.set(this.stripes, `stripes_${td}`);
    this.set(this.head, `head_${L.species}_${td}`);
    const bl = `blink_${L.species}_${td === 'N' ? 'S' : td}`;
    this.set(this.blink, bl); this.blink.visible = false;
    if (L.tail) {
      this.tail.visible = true;
      this.set(this.tail, `tail_${L.tail}_${td === 'N' ? 'N' : 'E'}`);
      // tail behind body except in N view (we see the back)
      this.inner.setChildIndex(this.tail, td === 'N' ? this.inner.getChildIndex(this.stripes) + 1 : 0);
      this.tail.scale.x = td === 'S' ? -1 : 1;
    } else this.tail.visible = false;
    if (L.acc) {
      const allowed = ACC_DIRS[L.acc];
      const ad = allowed && !allowed.includes(td) ? null : td;
      const name = ad ? `acc_${L.acc}_${ad}` : '';
      this.acc.visible = !!ad && hasTex(name);
      if (this.acc.visible) this.set(this.acc, name);
    } else this.acc.visible = false;
    this.applyHeld();
    this.armL.visible = this.pawL.visible = true;
    // E view: far arm behind body
    this.inner.setChildIndex(this.armL, td === 'E' ? Math.max(0, this.inner.getChildIndex(this.body) - 0) : this.inner.getChildIndex(this.body));
    this.layout(0, 0);
  }

  /** item in the paw / on the chest (null = none); cheap when unchanged */
  setHeld(h: Held | null) {
    if ((this.look.held ?? null) === h) return;
    this.look.held = h;
    this.applyHeld();
    this.layout(0, 0);
  }
  private applyHeld() {
    const h = this.look.held, td = this.dir === 'W' ? 'E' : this.dir;
    this.held.visible = !!h && (td !== 'N' || h === 'mop');
    if (!h) return;
    this.set(this.held, `held_${h}`);
    // N view: the mop stick shows behind the body; everything else is hidden there
    const bodyIdx = this.inner.getChildIndex(this.body);
    this.inner.setChildIndex(this.held, td === 'N' ? Math.max(0, bodyIdx - 1) : this.inner.children.length - 1);
  }
  /** raise the right paw (with whatever it holds) for ~0.9 s – a lead's visible auto-tap, the inspector's clipboard */
  raise() { this.idle = 'raise'; this.idleT = 0; }

  /** happy jump(s) – release celebration */
  hop(n = 2) { this.hopN = n; this.hopT = 0; }
  /** quick squash & stretch – tap feedback (same frame) */
  squash() { this.squashT = 0; this.applyJuice(); }
  private applyJuice() {
    // hop: 0.32 s parabola per jump, 11 u high
    let hy = 0;
    if (this.hopN > 0) { const k = this.hopT / 0.32; hy = -4 * k * (1 - k) * 11; }
    this.inner.y = hy;
    // squash: 0.3 s damped spring on the outer container (inner.scale.x carries the facing)
    if (this.squashT < 0.3) { const k = this.squashT / 0.3, a = Math.cos(k * Math.PI * 3) * (1 - k) * 0.22; this.c.scale.set(1 + a, 1 - a); }
    else if (this.c.scale.x !== 1 || this.c.scale.y !== 1) this.c.scale.set(1, 1);
  }

  /** dt in seconds; speed in units/s */
  update(dt: number, speed: number) {
    if (this.hopN > 0) { this.hopT += dt; if (this.hopT >= 0.32) { this.hopT -= 0.32; this.hopN--; } }
    if (this.squashT < 0.3) this.squashT += dt;
    this.applyJuice();
    this.moving = speed > 1;
    if (this.moving) { this.phase += dt * Math.min(16, 5 + speed * 0.22); if (this.idle !== 'raise') { this.idle = 'none'; this.idleT = 0; } }
    else {
      this.phase += (Math.round(this.phase / Math.PI) * Math.PI - this.phase) * Math.min(1, dt * 10);
      this.idleCd -= dt;
      if (this.idle === 'none' && this.idleCd <= 0) { this.idle = (['scratch', 'yawn', 'stretch'] as const)[Math.floor(Math.random() * 3)]; this.idleT = 0; this.idleCd = 6 + Math.random() * 10; }
    }
    if (this.idle !== 'none') { this.idleT += dt; if (this.idleT > 1.6) this.idle = 'none'; }
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinkLeft = 0.12; this.blinkT = 2 + Math.random() * 4; }
    if (this.blinkLeft > 0) this.blinkLeft -= dt;
    this.blink.visible = this.blinkLeft > 0 && this.dir !== 'N';
    this.layout(dt, speed);
  }

  private layout(_dt: number, _speed: number) {
    const td = this.dir === 'W' ? 'E' : this.dir;
    const s = Math.sin(this.phase), c2 = Math.abs(Math.cos(this.phase));
    const mv = this.moving ? 1 : 0;
    const bob = mv ? -c2 * 1.4 : Math.sin(rclock.t * 1000 / 700 + this.seed) * 0.35;
    const breathe = 1 + (mv ? 0 : Math.sin(rclock.t * 1000 / 900 + this.seed) * 0.012);
    // squash & stretch on foot contact
    const sq = mv ? 1 + (c2 - 0.5) * 0.06 : 1;
    if (td === 'E') {
      this.footL.position.set(-1.5 + s * 3 * mv, CHAR.footY); this.footR.position.set(1.8 - s * 3 * mv, CHAR.footY);
      this.legL.position.set(-1.5 + s * 2.4 * mv, CHAR.legY + bob * 0.3); this.legR.position.set(1.8 - s * 2.4 * mv, CHAR.legY + bob * 0.3);
      this.legL.rotation = -s * 0.35 * mv; this.legR.rotation = s * 0.35 * mv;
    } else {
      this.footL.position.set(-CHAR.footX, CHAR.footY - Math.max(0, s) * 1.5 * mv); this.footR.position.set(CHAR.footX, CHAR.footY - Math.max(0, -s) * 1.5 * mv);
      this.legL.position.set(-CHAR.legX, CHAR.legY - Math.max(0, s) * 1.4 * mv + bob * 0.3); this.legR.position.set(CHAR.legX, CHAR.legY - Math.max(0, -s) * 1.4 * mv + bob * 0.3);
      this.legL.rotation = this.legR.rotation = 0;
    }
    const by = CHAR.bodyY + bob;
    this.body.position.set(0, by); this.stripes.position.set(0, by);
    this.body.scale.set(1 / sq, sq * breathe); this.stripes.scale.copyFrom(this.body.scale);
    let armSwing = s * 0.45 * mv;
    let lift = 0;
    if (this.idle === 'scratch') { lift = Math.sin(Math.min(1, this.idleT / 0.3) * Math.PI / 2) * (this.idleT < 1.3 ? 1 : 0); armSwing = 0; }
    if (this.idle === 'stretch') { lift = Math.sin(Math.min(1, this.idleT / 0.5) * Math.PI / 2) * (this.idleT < 1.2 ? 1 : 0); }
    let raise = 0;
    if (this.idle === 'raise') { raise = this.idleT < 0.9 ? Math.sin(Math.min(1, this.idleT / 0.18) * Math.PI / 2) : Math.max(0, 1 - (this.idleT - 0.9) / 0.2); armSwing = 0; }
    if (td === 'E') {
      this.armL.position.set(-CHAR.shoulderXE - 1, CHAR.shoulderY + bob); this.armL.rotation = -armSwing;
      this.armR.position.set(CHAR.shoulderXE + 1, CHAR.shoulderY + bob); this.armR.rotation = armSwing - lift * 2.4 - raise * 2.2;
      this.pawL.visible = false;
    } else {
      this.armL.position.set(-CHAR.shoulderX - 0.6, CHAR.shoulderY + bob); this.armL.rotation = 0.16 + (td === 'N' ? -armSwing : armSwing) * 0.4 + (this.idle === 'stretch' ? lift * 2.6 : 0);
      this.armR.position.set(CHAR.shoulderX + 0.6, CHAR.shoulderY + bob); this.armR.rotation = -0.16 - (td === 'N' ? -armSwing : armSwing) * 0.4 - lift * 2.6 - raise * 2.5;
      this.pawL.visible = true;
    }
    // paws at arm ends
    const endL = 8.4, endR = 8.4;
    this.pawL.position.set(this.armL.x - Math.sin(this.armL.rotation) * endL, this.armL.y + Math.cos(this.armL.rotation) * endL);
    this.pawR.position.set(this.armR.x - Math.sin(this.armR.rotation) * endR, this.armR.y + Math.cos(this.armR.rotation) * endR);
    const hx = td === 'E' ? 1 : 0;
    let hy = CHAR.neckY + bob * 1.15;
    let hs = 1;
    if (this.idle === 'yawn' && this.idleT < 1.2) { const k = Math.sin((this.idleT / 1.2) * Math.PI); hy -= k * 0.8; hs = 1 + k * 0.05; }
    this.head.position.set(hx, hy); this.head.scale.set(1 / hs, hs);
    this.blink.position.copyFrom(this.head.position); this.blink.scale.copyFrom(this.head.scale);
    this.acc.position.set(hx, this.look.acc === 'scarf' ? CHAR.neckY + 1.5 + bob : hy);
    this.acc.scale.copyFrom(this.look.acc === 'scarf' ? { x: 1, y: 1 } : this.head.scale);
    if (this.held.visible) {
      if (this.look.held && HELD_CHEST[this.look.held]) this.held.position.set(td === 'E' ? 2.6 : 0, CHAR.neckY + 0.5 + bob);
      else this.held.position.copyFrom(this.pawR.position);
      this.held.rotation = this.look.held === 'mop' ? 0.12 + this.armR.rotation * 0.4 : this.armR.rotation * 0.35;
    }
    const tp = td === 'N' ? CHAR.tailN : td === 'E' ? CHAR.tailE : CHAR.tailS;
    this.tail.position.set(tp.x, tp.y + bob * 0.6);
    this.tail.rotation = Math.sin(rclock.t * 1000 / 500 + this.seed) * 0.08 + (mv ? s * 0.12 : 0);
  }
}
