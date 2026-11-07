/**
 * Off-screen hints (QA_REPORT M4 "Befunde" #2; docs/M5_DESIGN.md §12.9). Owner: ui-m5.
 * A chip with an arrow at the screen edge for things that need the player but are outside the view: an escapee
 * (state 'escaping'; the nearest one, with the count), a food fight (the canteen) and the inspector on her walk.
 * The chip sits where the line from the screen centre to the target leaves the play area (between top bar and build
 * bar), the arrow points at the target; a tap flies the camera there (ctx.focusTile). Positions refresh ≤ 10/s.
 * Hidden during the tutorial. Texts: src/i18n/parts/edgeHints.{en,de}.json.
 */
import type { UICtx, Component } from './ctx';
import { domKit, WRITE_MS } from './buildbar';
import { M5_ICON } from './m5icons';
import { roomById } from '../sim/world';

type Kind = 'escape' | 'food' | 'inspector';
interface Hint { kind: Kind; el: HTMLButtonElement; arrow: HTMLElement; n: HTMLElement; target: { x: number; y: number } | null }
const ICON: Record<Kind, string> = { escape: 'gate', food: 'meal', inspector: M5_ICON.inspect };
const TILE = 32;
const MARGIN = 10;

export function mountEdgeHints(ctx: UICtx): Component {
  const d = domKit(ctx);
  const { t } = ctx;
  const hints: Hint[] = (['escape', 'food', 'inspector'] as Kind[]).map(kind => {
    const el = d.button(`m5-edge ${kind === 'inspector' ? 'gold' : ''} eh-${kind}`, ctx.root, () => {
      const h = hints.find(x => x.el === el);
      if (h?.target) ctx.focusTile(h.target.x, h.target.y, Math.max(ctx.cam.zoom, 1.1));
    });
    el.dataset.overlay = '1';
    if (ctx.touch) el.classList.add('m5-touch');
    const arrow = d.h('span', 'm5-arrow', el);
    arrow.setAttribute('aria-hidden', 'true');
    d.img(ctx.icon(ICON[kind]), el);
    const n = d.h('span', 'm5-edge-n', el);
    el.hidden = true;
    d.tip(el, () => ({ title: t(`edgeHints.${kind}`), body: t('edgeHints.body') }));
    return { kind, el, arrow, n, target: null };
  });

  const targetOf = (kind: Kind): { x: number; y: number; n: number } | null => {
    const w = ctx.w;
    if (!w.tutorial.done) return null;
    if (kind === 'escape') {
      const es = w.agents.filter(a => a.state === 'escaping');
      if (!es.length) return null;
      // nearest to the view centre
      const cx = ctx.cam.x / TILE, cy = ctx.cam.y / TILE;
      es.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
      return { x: es[0].x, y: es[0].y, n: es.length };
    }
    if (kind === 'food') {
      if (w.director.active !== 'food') return null;
      const r = roomById(w, w.director.data.foodRoom ?? -1);
      return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2, n: w.agents.filter(a => a.state === 'brawling').length } : null;
    }
    if (w.inspection.phase !== 'walking') return null;
    return { x: w.inspection.walker.x, y: w.inspection.walker.y, n: 0 };
  };

  type R = { l: number; t: number; r: number; b: number };
  const hit = (a: R, b: R) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  /** HUD parts a chip must not cover: the banner stack, the rail, the clipboard (D4: the goal stays readable) */
  const obstacles = (): R[] => [...ctx.root.querySelectorAll<HTMLElement>(':scope > .m5-banners:not([hidden]), :scope > .m5-rail:not([hidden]), .cb-card, .cb-chip')]
    .map(e => e.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0).map(r => ({ l: r.left - 4, t: r.top - 4, r: r.right + 4, b: r.bottom + 4 }));

  let acc = WRITE_MS;
  const render = () => {
    const W = window.innerWidth, H = window.innerHeight;
    const top = (parseFloat(ctx.root.style.getPropertyValue('--m5-top')) || 44) + MARGIN;
    const bot = H - (parseFloat(ctx.root.style.getPropertyValue('--m5-bot')) || 0) - MARGIN;
    const left = MARGIN, right = W - MARGIN;
    const cx = (left + right) / 2, cy = (top + bot) / 2;
    const busy = hints.some(h => targetOf(h.kind)) ? obstacles() : [];
    for (const h of hints) {
      const tg = targetOf(h.kind);
      h.target = tg;
      let show = false;
      if (tg) {
        const p = ctx.cam.worldToScreen(tg.x * TILE, tg.y * TILE);
        const inside = p.x >= left && p.x <= right && p.y >= top && p.y <= bot;
        if (!inside) {
          show = true;
          const ew = h.el.offsetWidth || 64, eh = h.el.offsetHeight || 36;
          // where the ray centre → target leaves the inner rect (shrunk by half the chip so the chip stays inside)
          const hw = (right - left) / 2 - ew / 2, hh = (bot - top) / 2 - eh / 2;
          const dx = p.x - cx, dy = p.y - cy;
          const k = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
          const clampX = (v: number) => Math.max(left, Math.min(right - ew, v)), clampY = (v: number) => Math.max(top, Math.min(bot - eh, v));
          let x = clampX(Math.round(cx + dx * k - ew / 2)), y = clampY(Math.round(cy + dy * k - eh / 2));
          const sideEdge = Math.abs(dx * k) >= hw - 1;   // on the left/right edge: slide along y, else along x
          // slide along the edge past anything it would cover (other chips included)
          for (let n = 0; n < 4; n++) {
            const me = { l: x, t: y, r: x + ew, b: y + eh };
            const o = busy.find(b => hit(me, b));
            if (!o) break;
            if (sideEdge) y = clampY(o.b + 2 + eh <= bot ? o.b + 2 : o.t - eh - 2);
            else x = clampX(x + ew / 2 < (o.l + o.r) / 2 ? o.l - ew - 2 : o.r + 2);
          }
          busy.push({ l: x - 4, t: y - 4, r: x + ew + 4, b: y + eh + 4 });
          d.style(h.el, 'transform', `translate3d(${x}px,${y}px,0)`);
          d.style(h.arrow, 'transform', `rotate(${Math.round((Math.atan2(dy, dx) * 180) / Math.PI)}deg)`);
          d.text(h.n, tg.n > 1 ? `×${tg.n}` : '');
          d.attr(h.el, 'aria-label', `${t(`edgeHints.${h.kind}`)}${tg.n > 1 ? ` (${tg.n})` : ''} – ${t('edgeHints.body')}`);
        }
      }
      d.flag(h.el, 'hidden', show ? null : '');
    }
  };

  return {
    update(dt) {
      acc += dt * 1000;
      if (acc < WRITE_MS) return;
      acc = 0;
      render();
    },
    destroy() { for (const h of hints) h.el.remove(); },
  };
}
