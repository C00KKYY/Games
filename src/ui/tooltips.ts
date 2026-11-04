/**
 * Tooltips (docs/UI_DESIGN.md §3, Brief §6.5): ONE shared tooltip element behind ctx.tip.
 * Mouse: hover 300 ms. Touch/pen: long-press 400 ms (the click that follows the long-press is swallowed).
 * Keyboard: focus-visible 300 ms. Positioned inside the viewport: below the anchor, flipped above, clamped (8 px).
 * Hidden on pointerdown, scroll, wheel, Escape. Content is evaluated when shown and refreshed ≤ 4/s while visible.
 */
import './overlays.css';
import type { UICtx, Component, TipContent } from './ctx';

const HOVER_MS = 300;
const PRESS_MS = 400;
const PRESS_SLOP = 10;
const MARGIN = 8;
const GAP = 8;
const REFRESH_S = 0.25;
const TOUCH_HIDE_MS = 3500;
const TIP_ID = 'ov-tip';

export function mountTooltips(ctx: UICtx): Component & { tip(el: HTMLElement, content: () => TipContent): void } {
  const contents = new WeakMap<HTMLElement, () => TipContent>();
  const wired = new WeakSet<HTMLElement>();

  // ------------------------------------------------------------------ the shared element
  const box = document.createElement('div');
  box.className = 'ov-tip';
  box.id = TIP_ID;
  box.setAttribute('role', 'tooltip');
  box.dataset.overlay = '1';
  const head = document.createElement('div'); head.className = 'ov-tip-head'; box.appendChild(head);
  const title = document.createElement('div'); title.className = 'ov-tip-title'; head.appendChild(title);
  const keys = document.createElement('div'); keys.className = 'ov-tip-keys'; head.appendChild(keys);
  const body = document.createElement('div'); body.className = 'ov-tip-body'; box.appendChild(body);
  ctx.root.appendChild(box);
  if (ctx.touch) box.classList.add('touch');

  // memoised writes
  const memo = new Map<string, string>();
  const put = (k: string, v: string, apply: () => void) => { if (memo.get(k) === v) return; memo.set(k, v); apply(); };

  let anchor: HTMLElement | null = null;
  let shown = false;
  let showTimer = 0;
  let hideAt = 0;
  let acc = 0;
  let lastLang = ctx.lang();
  let lastRect = '';
  // long-press state
  let press: { el: HTMLElement; id: number; x: number; y: number } | null = null;
  let swallow: { el: HTMLElement; until: number } | null = null;

  const evalContent = (el: HTMLElement): TipContent | null => {
    const f = contents.get(el); if (!f) return null;
    try { return f(); } catch (e) { console.warn('[tooltip]', e); return null; }
  };

  const render = (c: TipContent) => {
    put('title', c.title, () => { title.textContent = c.title; });
    const b = c.body ?? '';
    put('body', b, () => { body.textContent = b; body.hidden = !b; });
    const hk = c.hotkey ?? '';
    put('hotkey', hk + '|' + ctx.lang(), () => {
      keys.replaceChildren();
      keys.hidden = !hk;
      if (!hk) return;
      keys.setAttribute('aria-label', ctx.t('overlays.tip.hotkey', { key: hk }));
      // "Ctrl+Z" → two keycaps; "+" alone stays one key
      const parts = hk.length > 1 && hk.includes('+') ? hk.split('+').map(s => s.trim()).filter(Boolean) : [hk];
      parts.forEach((p, i) => {
        if (i) { const s = document.createElement('span'); s.className = 'ov-plus'; s.textContent = '+'; keys.appendChild(s); }
        const k = document.createElement('kbd'); k.className = 'ov-key'; k.textContent = p; keys.appendChild(k);
      });
    });
  };

  const place = () => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const bw = box.offsetWidth, bh = box.offsetHeight;
    const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)},${bw},${bh},${vw},${vh}`;
    if (key === lastRect) return;
    lastRect = key;
    let y = r.bottom + GAP;
    if (y + bh > vh - MARGIN) y = r.top - GAP - bh;              // flip above
    if (y < MARGIN) y = Math.max(MARGIN, Math.min(vh - MARGIN - bh, r.bottom + GAP));
    let x = r.left + r.width / 2 - bw / 2;
    x = Math.max(MARGIN, Math.min(vw - MARGIN - bw, x));
    box.style.transform = `translate3d(${Math.round(x)}px,${Math.round(y)}px,0)`;
  };

  /** an open modal covers everything outside it: no tooltips for anchors behind it */
  const covered = (el: HTMLElement) => { const m = ctx.root.querySelector('.ov-modal:not([hidden])'); return !!m && !m.contains(el); };
  const show = (el: HTMLElement, touch = false) => {
    clearTimeout(showTimer); showTimer = 0;
    if (!el.isConnected || covered(el)) return;
    const ar = el.getBoundingClientRect(); if (ar.width === 0 && ar.height === 0) return;
    const c = evalContent(el); if (!c || !c.title) return;
    anchor = el; lastRect = ''; acc = 0;
    hideAt = touch ? performance.now() + TOUCH_HIDE_MS : 0;
    box.classList.toggle('touchshow', touch);
    render(c);
    place();
    if (!shown) { shown = true; box.classList.add('on'); }
  };
  const hide = () => {
    clearTimeout(showTimer); showTimer = 0;
    anchor = null; hideAt = 0;
    if (shown) { shown = false; box.classList.remove('on'); }
  };
  const schedule = (el: HTMLElement, ms: number) => {
    clearTimeout(showTimer);
    showTimer = window.setTimeout(() => show(el), ms);
  };

  // ------------------------------------------------------------------ global listeners
  const onDownCapture = (e: PointerEvent) => {
    // a press anywhere hides the tooltip (a new long-press re-shows it on its own anchor)
    if (shown || showTimer) hide();
    if (e.pointerType === 'mouse') press = null;
  };
  const onClickCapture = (e: MouseEvent) => {
    if (!swallow) return;
    const t = e.target as Node | null;
    if (performance.now() < swallow.until && t && swallow.el.contains(t)) { e.preventDefault(); e.stopImmediatePropagation(); }
    swallow = null;
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && shown) hide(); };
  const onScroll = () => { if (shown || showTimer) hide(); };
  const onCancelPress = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.id) return;
    if (e.type === 'pointermove') { if (Math.hypot(e.clientX - press.x, e.clientY - press.y) <= PRESS_SLOP) return; }
    press = null; clearTimeout(showTimer); showTimer = 0;
  };
  window.addEventListener('pointerdown', onDownCapture, true);
  window.addEventListener('click', onClickCapture, true);
  window.addEventListener('keydown', onKey);
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  window.addEventListener('wheel', onScroll, { capture: true, passive: true });
  window.addEventListener('pointermove', onCancelPress, true);
  window.addEventListener('pointerup', onCancelPress, true);
  window.addEventListener('pointercancel', onCancelPress, true);
  const onBlur = () => hide();
  window.addEventListener('blur', onBlur);

  // ------------------------------------------------------------------ per element
  const wire = (el: HTMLElement) => {
    el.addEventListener('pointerenter', e => {
      if (e.pointerType !== 'mouse') return;
      if (anchor === el && shown) return;
      schedule(el, HOVER_MS);
    });
    el.addEventListener('pointerleave', e => {
      if (e.pointerType !== 'mouse') return;
      if (anchor === el || showTimer) hide();
    });
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') return;
      press = { el, id: e.pointerId, x: e.clientX, y: e.clientY };
      clearTimeout(showTimer);
      showTimer = window.setTimeout(() => {
        showTimer = 0;
        if (!press || press.el !== el) return;
        press = null;
        show(el, true);
        swallow = { el, until: performance.now() + 1500 };
      }, PRESS_MS);
    });
    // mobile browsers open a context menu on long-press – the tooltip is that long-press
    el.addEventListener('contextmenu', e => { if (ctx.touch) e.preventDefault(); });
    el.addEventListener('focusin', () => { if (el.matches(':focus-visible')) schedule(el, HOVER_MS); });
    el.addEventListener('focusout', () => { if (anchor === el || showTimer) hide(); });
  };

  return {
    tip(el, content) {
      el.dataset.tip = '1';
      el.setAttribute('aria-describedby', TIP_ID);
      contents.set(el, content);
      if (!wired.has(el)) { wired.add(el); wire(el); }
      if (anchor === el && shown) acc = REFRESH_S; // new content → refresh on the next update
    },
    update(dt) {
      if (!shown || !anchor) { lastLang = ctx.lang(); return; }
      if (!anchor.isConnected || (hideAt && performance.now() >= hideAt) || covered(anchor)) { hide(); return; }
      acc += dt;
      const langChanged = lastLang !== ctx.lang();
      if (acc < REFRESH_S && !langChanged) return;
      acc = 0; lastLang = ctx.lang();
      const r = anchor.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) { hide(); return; }
      const c = evalContent(anchor);
      if (!c || !c.title) { hide(); return; }
      render(c);
      place();
    },
    destroy() {
      hide();
      window.removeEventListener('pointerdown', onDownCapture, true);
      window.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('wheel', onScroll, { capture: true });
      window.removeEventListener('pointermove', onCancelPress, true);
      window.removeEventListener('pointerup', onCancelPress, true);
      window.removeEventListener('pointercancel', onCancelPress, true);
      window.removeEventListener('blur', onBlur);
      box.remove();
    },
  };
}
