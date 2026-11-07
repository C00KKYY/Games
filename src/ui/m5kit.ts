/**
 * Shared kit of the M5 screens (docs/M5_DESIGN.md §12, owner ui-m5):
 *  - panelShell(): the card every M5 panel uses. Non-pausing panels (projects, leads, mail, forecast) are a card on the
 *    right below the top bar (like the room panel); pausing ones (inspection result, transfer) sit on the modal
 *    backdrop of modals.ts (aria-modal, so tools.ts holds the game hotkeys back). × and Esc close; Esc runs in the
 *    capture phase after modals.ts (registered later), so an open Settings/Help modal still wins.
 *  - panelController(): one place for the panel rules – at most one panel, opening one closes ctx.menu / tool /
 *    selection, a menu / tool / selection / camera drag closes a non-pausing panel, and the pausing ones call
 *    ctx.setPaused (gameplayStop/Start stay paired, also when the result screen hands over to the transfer dialog).
 *  - rail(): the column of round HUD buttons top-right under the top bar (inspection, running project, mail, keys).
 *  - banners(): the non-blocking chip stack top-centre under the top bar (director events, inspection walk, catch-up);
 *    toasts.ts moves its stack below it.
 *  - layoutVars(): measures the top bar / build bar once and publishes --m5-top / --m5-bot on the HUD root.
 */
import './overlays.css';
import './m5.css';
import type { UICtx, M5Panel } from './ctx';
import type { DomKit } from './buildbar';
import { WRITE_MS } from './buildbar';

export const PAUSING: ReadonlySet<M5Panel> = new Set<M5Panel>(['inspection', 'transfer']);
const isPausing = (p: M5Panel | null) => p !== null && PAUSING.has(p);

/** mm:ss (or h:mm:ss) for a duration in ms */
export function clockStr(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

/** panel takeover + pause rules (call once per generation; returns the unsubscribe) */
export function panelController(ctx: UICtx): () => void {
  let before = false;
  const nonPausingOpen = () => { const p = ctx.panel.get(); return p !== null && !isPausing(p); };
  const offs = [
    ctx.panel.on((v, prev) => {
      if (v !== null) {
        if (ctx.menu.get() !== null) ctx.menu.set(null);
        if (ctx.tool.get().kind !== 'none') ctx.tool.set({ kind: 'none' });
        if (ctx.selection.get() !== null) ctx.selection.set(null);
      }
      const pv = isPausing(v), pp = isPausing(prev);
      if (pv && !pp) { before = ctx.paused(); ctx.setPaused(true); }
      else if (!pv && pp) ctx.setPaused(before);
      if (v !== prev) ctx.sound(v === null ? 'panelClose' : 'panelOpen');
    }),
    ctx.menu.on(v => { if (v !== null && nonPausingOpen()) ctx.panel.set(null); }),
    ctx.tool.on(v => { if (v.kind !== 'none' && nonPausingOpen()) ctx.panel.set(null); }),
    ctx.selection.on(v => { if (v !== null && nonPausingOpen()) ctx.panel.set(null); }),
    ctx.panned.on(() => { if (nonPausingOpen()) ctx.panel.set(null); }),
  ];
  return () => { for (const o of offs) o(); if (isPausing(ctx.panel.get())) ctx.setPaused(before); };
}

/** the HUD root element that carries --m5-top / --m5-bot (px) */
export function layoutVars(ctx: UICtx) {
  let top = 0;
  for (const el of ctx.root.querySelectorAll<HTMLElement>('[data-hud="top"]')) { const r = el.getBoundingClientRect(); if (r.height > 0) top = Math.max(top, r.bottom); }
  const bots = [...ctx.root.querySelectorAll<HTMLElement>('[data-hud="bottom"]')].map(e => e.getBoundingClientRect()).filter(b => b.height > 0);
  const bot = bots.length ? window.innerHeight - Math.min(...bots.map(b => b.top)) : 0;
  const t = `${Math.round(top || 44)}px`, b = `${Math.round(bot)}px`;
  if (ctx.root.style.getPropertyValue('--m5-top') !== t) ctx.root.style.setProperty('--m5-top', t);
  if (ctx.root.style.getPropertyValue('--m5-bot') !== b) ctx.root.style.setProperty('--m5-bot', b);
  // the rail column top-right: side panels stand left of it, so the rail buttons stay visible and tappable
  const railEl = ctx.root.querySelector<HTMLElement>(':scope > .m5-rail');
  let rw = 0;
  if (railEl && !railEl.hidden) for (const k of railEl.children) { const r = k.getBoundingClientRect(); if (r.width > 0) rw = Math.max(rw, window.innerWidth - r.left); }
  const rv = `${Math.round(rw)}px`;
  if (ctx.root.style.getPropertyValue('--m5-rail') !== rv) ctx.root.style.setProperty('--m5-rail', rv);
}

/** the round-button column top-right (created by the first component that needs it); hidden while empty */
export function rail(ctx: UICtx): HTMLElement {
  let el = ctx.root.querySelector<HTMLElement>(':scope > .m5-rail');
  if (!el) {
    el = document.createElement('div');
    el.className = 'm5-rail';
    el.setAttribute('role', 'toolbar');
    if (ctx.touch) el.classList.add('m5-touch');
    ctx.root.appendChild(el);
  }
  return el;
}
/** hide the rail when none of its buttons is shown (≤ 10/s, from eventBanner.ts) */
export function syncRail(ctx: UICtx, d: DomKit) {
  const el = ctx.root.querySelector<HTMLElement>(':scope > .m5-rail');
  if (!el) return;
  const any = [...el.children].some(c => !(c as HTMLElement).hidden);
  d.flag(el, 'hidden', any ? null : '');
  d.attr(el, 'aria-label', ctx.t('eventBanner.rail'));
  // an open menu sheet that reaches the right edge (compact sizes) lies over the rail: the rail steps aside until the
  // sheet closes, instead of peeking out half-covered and untappable (M5 flow audit, 844×390)
  let hide = false;
  if (any && ctx.menu.get() !== null) {
    const m = ctx.root.querySelector<HTMLElement>('.bb-menu:not([hidden])')?.getBoundingClientRect();
    if (m && m.width > 0) for (const k of el.children) {
      const r = (k as HTMLElement).getBoundingClientRect();
      if (r.width > 0 && r.left < m.right && r.right > m.left && r.top < m.bottom && r.bottom > m.top) { hide = true; break; }
    }
  }
  d.cls(el, 'm5-away', hide);
}

/** the chip stack top-centre (non-blocking, data-overlay: it floats like the toasts) */
export function banners(ctx: UICtx): HTMLElement {
  let el = ctx.root.querySelector<HTMLElement>(':scope > .m5-banners');
  if (!el) {
    el = document.createElement('div');
    el.className = 'm5-banners';
    el.dataset.overlay = '1';
    if (ctx.touch) el.classList.add('m5-touch');
    ctx.root.appendChild(el);
  }
  return el;
}
export function syncBanners(ctx: UICtx, d: DomKit) {
  const el = ctx.root.querySelector<HTMLElement>(':scope > .m5-banners');
  if (!el) return;
  const any = [...el.children].some(c => !(c as HTMLElement).hidden);
  d.flag(el, 'hidden', any ? null : '');
  d.cls(el, 'm5-compact', ctx.compact.get());
  // a side panel where the stack stands (narrow screens): the stack moves to the free area left of it, at the bottom
  const a = sideAnchor(ctx);
  d.cls(el, 'm5-side', !!a);
  d.style(el, 'left', a ? `${Math.round(a.cx)}px` : '');
  d.style(el, 'bottom', a ? `${Math.round(window.innerHeight - a.bottom)}px` : '');
  d.style(el, 'max-width', a ? `${Math.round(a.width)}px` : '');
  // an open menu sheet lies on top-centre (compact): the stack waits until the sheet closes (the sheet covers the world)
  let hide = false;
  if (!a && any && ctx.menu.get() !== null) {
    const m = ctx.root.querySelector<HTMLElement>('.bb-menu:not([hidden])')?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    hide = !!m && m.width > 0 && r.width > 0 && r.left < m.right && r.right > m.left && r.top < m.bottom && r.bottom > m.top;
  }
  d.cls(el, 'm5-away', hide);
}

/**
 * While a non-pausing side panel stands where the top-centre stacks (event banners, toasts) would be – screens up to
 * ~1000 px wide – both stacks move to the free area left of the panel, anchored above the build bar (M5 flow audit:
 * they covered the panel head). Returns that area's centre x, bottom y and width, or null.
 */
export function sideAnchor(ctx: UICtx): { cx: number; bottom: number; width: number } | null {
  const p = ctx.root.querySelector<HTMLElement>(':scope > .m5p:not([hidden])');
  if (!p) return null;
  const r = p.getBoundingClientRect();
  if (!(r.width > 0) || r.left > window.innerWidth / 2 + 200) return null;
  const bot = parseFloat(ctx.root.style.getPropertyValue('--m5-bot')) || 0;
  const left = 8, right = r.left - 8;
  return { cx: (left + right) / 2, bottom: window.innerHeight - bot - 8, width: Math.max(160, right - left) };
}

export interface PanelShell {
  root: HTMLElement; card: HTMLElement; icon: HTMLImageElement; title: HTMLElement; sub: HTMLElement; body: HTMLElement; x: HTMLButtonElement;
  open(): boolean;
  /** call from update(): show/hide; returns true when the content should be (re)rendered now (≤ 10/s, and right after opening) */
  tick(dt: number): boolean;
  /** force a render on the next tick */
  dirty(): void;
  destroy(): void;
}

/**
 * Card shell of one M5 panel, visible while ctx.panel === name. `onClose` replaces the default close (× / Esc), e.g.
 * the result screen closes the inspection in the sim.
 */
export function panelShell(ctx: UICtx, d: DomKit, name: M5Panel, opts: { icon: string; cls: string; onClose?: () => void }): PanelShell {
  const pausing = PAUSING.has(name);
  let root: HTMLElement, card: HTMLElement;
  if (pausing) {
    root = d.h('div', `ov-modal m5-modal ${opts.cls}-modal`);
    root.dataset.overlay = '1';
    card = d.h('div', `ov-card m5-card ${opts.cls}`, root);
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.tabIndex = -1;
    if (ctx.touch) root.classList.add('touch');
  } else {
    root = card = d.h('div', `m5p ${opts.cls}`);
    card.dataset.overlay = '1';
    card.setAttribute('role', 'dialog');
  }
  if (ctx.touch) card.classList.add('m5-touch');
  root.hidden = true;
  const head = d.h('div', pausing ? 'ov-head m5-head' : 'm5p-head', card);
  const icon = d.img(ctx.icon(opts.icon), head, 'm5-head-ic');
  const titles = d.h('div', 'm5-titles', head);
  const title = d.h('h2', 'm5-title', titles);
  const sub = d.h('div', 'm5-sub', titles);
  const close = () => (opts.onClose ? opts.onClose() : ctx.panel.set(null));
  const x = d.button(pausing ? 'ov-x m5-x' : 'm5-x', head, close);
  d.img(ctx.icon('close'), x);
  d.tip(x, () => ({ title: ctx.t('eventBanner.close'), body: ctx.t('eventBanner.closeBody'), hotkey: 'Esc' }));
  const body = d.h('div', pausing ? 'ov-body m5-body' : 'm5p-body', card);
  ctx.root.appendChild(root);

  let shown = false, acc = WRITE_MS, lang = '';
  const onKey = (e: KeyboardEvent) => {
    if (!shown || e.key !== 'Escape' || e.defaultPrevented) return;
    e.preventDefault();
    if (pausing) e.stopImmediatePropagation();
    close();
  };
  window.addEventListener('keydown', onKey, true);
  // pausing: a click on the dimmed backdrop does nothing (the screen has explicit choices); non-pausing: nothing extra
  return {
    root, card, icon, title, sub, body, x,
    open: () => shown,
    dirty: () => { acc = WRITE_MS; },
    tick(dt) {
      const want = ctx.panel.get() === name;
      if (want !== shown) {
        shown = want; root.hidden = !want;
        if (want) {
          acc = WRITE_MS; body.scrollTop = 0;
          if (pausing) { requestAnimationFrame(() => root.classList.add('in')); card.focus({ preventScroll: true }); }
          else { card.classList.remove('m5-in'); void card.offsetWidth; card.classList.add('m5-in'); }
        } else root.classList.remove('in');
      }
      if (!shown) return false;
      acc += dt * 1000;
      if (lang !== ctx.lang()) { lang = ctx.lang(); acc = WRITE_MS; }
      if (acc < WRITE_MS) return false;
      acc = 0;
      d.cls(root, 'compact', ctx.compact.get());
      d.cls(card, 'm5-compact', ctx.compact.get());
      d.attr(x, 'aria-label', ctx.t('eventBanner.close'));
      d.attr(card, 'aria-label', title.textContent || name);
      return true;
    },
    destroy() { window.removeEventListener('keydown', onKey, true); root.remove(); },
  };
}

/** a labelled progress bar (transform-only fill) */
export function bar(d: DomKit, parent: HTMLElement, cls = '') {
  const b = d.h('div', `m5-bar ${cls}`, parent);
  const fill = d.h('i', '', b);
  return { el: b, set: (v01: number) => d.style(fill, 'transform', `scaleX(${Math.round(Math.max(0, Math.min(1, v01)) * 1000) / 1000})`) };
}

/** a small "new" dot on a button (aria-hidden; the button's label carries the meaning) */
export function dot(d: DomKit, parent: HTMLElement) {
  const el = d.h('span', 'm5-dot', parent);
  el.setAttribute('aria-hidden', 'true');
  return el;
}
