/**
 * Build bar (docs/UI_DESIGN.md §3): bottom centre, data-hud="bottom". Rooms (B) and Staff open their overlay card
 * through ctx.menu, Demolish (Del) toggles ctx.tool. Decor / Projects stay hidden until their systems exist (M5).
 * Also exports the small DOM kit and the menu-card shell shared by buildMenu.ts and staffMenu.ts (lock icon: ctx.icon('lock')).
 * Hotkeys belong to tools.ts – this file adds no keyboard listeners.
 */
import './buildbar.css';
import type { UICtx, Component, TipContent } from './ctx';
import type { Key } from '../i18n/i18n';
import { ROOMS, STAFF_ROOM, wageFor, type RoomType, type StaffRole } from '../content/balance';
import { staffOf } from '../sim/staff';
import { roomById, roomsOf } from '../sim/world';

/** DOM writes are throttled to this interval (≤ 10 / s) */
export const WRITE_MS = 100;
/** refund share when demolishing (src/sim/rooms.ts demolish: base * 0.5, full refund right after building) */
const DEMOLISH_REFUND_PCT = 50;

/** memoised DOM helpers – every write goes through put() and only touches the DOM when the value changed */
export function domKit(ctx: UICtx) {
  const memo = new WeakMap<Element, Map<string, string>>();
  const put = (el: Element, k: string, v: string) => {
    let m = memo.get(el); if (!m) { m = new Map(); memo.set(el, m); }
    if (m.get(k) === v) return false;
    m.set(k, v);
    if (k === 'text') el.textContent = v;
    else if (k.startsWith('.')) el.classList.toggle(k.slice(1), v === '1');
    else if (k.startsWith('~')) (el as HTMLElement).style.setProperty(k.slice(1), v);
    else if (k === 'src') (el as HTMLImageElement).src = v;
    else if (k.startsWith('!')) { if (v === '\u0000') el.removeAttribute(k.slice(1)); else el.setAttribute(k.slice(1), v); }
    else el.setAttribute(k, v);
    return true;
  };
  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', parent?: HTMLElement) => {
    const el = document.createElement(tag); if (className) el.className = className; parent?.appendChild(el); return el;
  };
  const img = (src: string, parent: HTMLElement, className = '') => { const i = h('img', className, parent); i.src = src; i.alt = ''; i.draggable = false; return i; };
  const tip = (el: HTMLElement, c: () => TipContent) => { el.dataset.tip = '1'; ctx.tip(el, c); };
  const button = (className: string, parent: HTMLElement, onClick: () => void) => {
    const b = h('button', className, parent); b.type = 'button';
    b.addEventListener('click', e => { e.stopPropagation(); ctx.sound('click'); onClick(); });
    return b;
  };
  return {
    put, h, img, tip, button,
    text: (el: Element, v: string) => put(el, 'text', v),
    cls: (el: Element, c: string, on: boolean) => put(el, '.' + c, on ? '1' : '0'),
    attr: (el: Element, a: string, v: string) => put(el, a, v),
    /** set or remove (null) an attribute */
    flag: (el: Element, a: string, v: string | null) => put(el, '!' + a, v ?? '\u0000'),
    style: (el: Element, p: string, v: string) => put(el, '~' + p, v),
    src: (el: HTMLImageElement, v: string) => put(el, 'src', v),
  };
}
export type DomKit = ReturnType<typeof domKit>;

/** hotkey label for Delete (localised key cap) */
export const delKey = (ctx: UICtx) => ctx.t('buildbar.keyDel');

/** wage per day of the NEXT hire of a role: pay grade = level of the room it would be assigned to (sim.ts onMidnight) */
export function nextWage(ctx: UICtx, role: StaffRole, roomId: number): number {
  const w = ctx.w, type = STAFF_ROOM[role];
  const r = roomId ? roomById(w, roomId) : undefined;
  const lvl = r && r.type === type ? r.level : Math.max(1, ...roomsOf(w, type).map(x => x.level));
  return wageFor(role, lvl);
}

/** wages due at the next midnight (same rule as sim.ts onMidnight) */
export function wagesPerDay(ctx: UICtx): number {
  let sum = 0;
  for (const s of staffOf(ctx.w)) sum += nextWage(ctx, s.role as StaffRole, s.roomId ?? 0);
  return sum;
}

export const BUILDABLE: RoomType[] = (Object.keys(ROOMS) as RoomType[]).filter(t => t !== 'gate' && t !== 'dock' && t !== 'office');

export interface MenuShell {
  card: HTMLElement; body: HTMLElement; title: HTMLElement; sub: HTMLElement; extra: HTMLElement;
  /** true while the card is shown */
  open(): boolean;
  /** call from update(): handles show/hide and placement; returns true when the content should be (re)rendered now */
  tick(dt: number): boolean;
  /** call right after rendering the content: keeps the sheet clear of the clipboard (its height is known only now) */
  fit(): void;
  /** remove the card and every listener / store subscription the shell added (call from the menu's destroy()) */
  destroy(): void;
}

/**
 * The overlay card above the build bar shared by the Rooms and Staff menus. Visible while ctx.menu === name.
 * Placement is measured (never covers the top bar or the build bar) and re-measured on resize.
 */
export function menuShell(ctx: UICtx, d: DomKit, name: 'rooms' | 'staff', icon: string, titleKey: Key): MenuShell {
  const card = d.h('div', `bb-menu bb-menu--${name}`);
  card.dataset.overlay = '1';
  card.setAttribute('role', 'dialog');
  card.hidden = true;
  if (ctx.touch) card.classList.add('bb-touch');
  const head = d.h('div', 'bb-head', card);
  d.img(ctx.icon(icon), head, 'bb-head-ic');
  const titles = d.h('div', 'bb-titles', head);
  const title = d.h('h2', 'bb-title', titles);
  const sub = d.h('div', 'bb-sub', titles);
  const extra = d.h('div', 'bb-extra', head);
  const close = d.button('bb-x', head, () => ctx.menu.set(null));
  d.img(ctx.icon('close'), close);
  d.tip(close, () => ({ title: ctx.t('buildbar.close'), body: ctx.t('buildbar.closeBody'), hotkey: name === 'rooms' ? 'B' : undefined }));
  const body = d.h('div', 'bb-scroll', card);
  // a vertical mouse wheel scrolls the card row sideways (and never reaches the camera)
  body.addEventListener('wheel', e => {
    if (body.scrollWidth <= body.clientWidth + 1 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    body.scrollLeft += e.deltaY; e.preventDefault();
  }, { passive: false });
  ctx.root.appendChild(card);

  let shown = false, acc = WRITE_MS, place = true, lang = '';
  const onResize = () => { place = true; };
  window.addEventListener('resize', onResize);
  const unsubs: (() => void)[] = [
    () => window.removeEventListener('resize', onResize),
    ctx.compact.on(v => { d.cls(card, 'bb-compact', v); place = true; }),
    ctx.menu.on(() => { acc = WRITE_MS; }),
  ];
  d.cls(card, 'bb-compact', ctx.compact.get());
  // horizontal scroll cue: fade the edge(s) that still hide cards (buildbar.css .bb-fade-l / .bb-fade-r)
  const cue = () => {
    const max = body.scrollWidth - body.clientWidth;
    d.cls(body, 'bb-fade-l', max > 1 && body.scrollLeft > 1);
    d.cls(body, 'bb-fade-r', max > 1 && body.scrollLeft < max - 1);
  };
  body.addEventListener('scroll', cue, { passive: true });

  const measure = () => {
    let top = 0;
    for (const el of ctx.root.querySelectorAll<HTMLElement>('[data-hud="top"]')) { const r = el.getBoundingClientRect(); if (r.height > 0) top = Math.max(top, r.bottom); }
    const bar = ctx.root.querySelector<HTMLElement>('.bb-bar');
    const vh = window.innerHeight;
    const barTop = bar ? bar.getBoundingClientRect().top : vh - 70;
    const gap = 6;
    d.style(card, 'bottom', `${Math.round(vh - barTop + gap)}px`);
    d.style(card, 'max-height', `${Math.max(120, Math.floor(barTop - gap - Math.max(top, 0) - gap))}px`);
  };

  /**
   * The menu never covers the clipboard (D4: the goal widget stays visible). On a short phone screen the sheet reaches
   * up to the top bar and would cover the compact clipboard chip: then it starts right of the chip instead (CSS
   * --bb-res, buildbar.css). Measured on layout boxes (offset*), so a running open / slide animation does not matter.
   * Once reserved it stays for as long as the menu is open (a narrower sheet is never shorter → no flip-flop).
   */
  let res = 0;
  const reserve = () => {
    const cb = ctx.root.querySelector<HTMLElement>('.cb');
    const clip = cb ? [...cb.querySelectorAll<HTMLElement>('.cb-chip, .cb-card')].find(e => e.offsetWidth > 0 && e.offsetHeight > 0) : undefined;
    const hud = card.offsetParent as HTMLElement | null;
    if (!cb || !clip || !hud) return;
    const o = cb.getBoundingClientRect(), hb = hud.getBoundingClientRect();
    const cl = o.left - hb.left + clip.offsetLeft, ct = o.top - hb.top + clip.offsetTop;
    const cr = cl + clip.offsetWidth, cbm = ct + clip.offsetHeight;
    const gap = 8;
    const mt = card.offsetTop, ml = card.offsetLeft - card.offsetWidth / 2;  // left: 50% + translateX(-50%)
    const want = res > 0 || (mt < cbm + gap && ml < cr + gap && mt + card.offsetHeight > ct) ? Math.ceil(cr) : 0;
    if (want !== res) { res = want; card.style.setProperty('--bb-res', `${res}px`); }
  };

  return {
    card, body, title, sub, extra,
    open: () => shown,
    fit: () => { if (shown) reserve(); },
    tick(dt) {
      const want = ctx.menu.get() === name;
      if (want !== shown) {
        shown = want; card.hidden = !want;
        if (want) { place = true; acc = WRITE_MS; body.scrollLeft = 0; }
        if (res) { res = 0; card.style.removeProperty('--bb-res'); }
      }
      if (!shown) return false;
      acc += dt * 1000;
      if (lang !== ctx.lang()) { lang = ctx.lang(); acc = WRITE_MS; place = true; }
      if (acc < WRITE_MS) return false;
      acc = 0;
      d.attr(card, 'aria-label', ctx.t(titleKey));
      d.attr(close, 'aria-label', ctx.t('buildbar.close'));
      d.text(title, ctx.t(titleKey));
      if (place) { place = false; measure(); }
      cue();
      return true;
    },
    destroy() { for (const u of unsubs.splice(0)) u(); card.remove(); },
  };
}

// ====================================================================== the bar
export function mountBuildbar(ctx: UICtx): Component {
  const d = domKit(ctx);
  const { t } = ctx;
  const bar = d.h('div', 'buildbar bb-bar');
  bar.dataset.hud = 'bottom';
  bar.setAttribute('role', 'toolbar');
  if (ctx.touch) bar.classList.add('bb-touch');

  const mk = (cls: string, icon: string, onClick: () => void) => {
    const b = d.button(`bb-btn ${cls}`, bar, onClick);
    d.img(ctx.icon(icon), b, 'bb-ic');
    const lbl = d.h('span', 'bb-lbl', b);
    const key = d.h('span', 'bb-key', b);
    key.setAttribute('aria-hidden', 'true');
    return { b, lbl, key };
  };

  const rooms = mk('main bb-rooms', 'rooms', () => {
    const tool = ctx.tool.get();
    if (ctx.menu.get() === 'rooms') { ctx.menu.set(null); return; }
    if (tool.kind !== 'none') ctx.tool.set({ kind: 'none' });
    ctx.menu.set('rooms');
  });
  const staff = mk('bb-staff', 'staff', () => {
    if (ctx.menu.get() === 'staff') { ctx.menu.set(null); return; }
    if (ctx.tool.get().kind !== 'none') ctx.tool.set({ kind: 'none' });
    ctx.menu.set('staff');
  });
  const demo = mk('bb-demo', 'demolish', () => {
    const on = ctx.tool.get().kind === 'demolish';
    ctx.menu.set(null);
    ctx.tool.set(on ? { kind: 'none' } : { kind: 'demolish' });
  });

  const unlockedCount = () => BUILDABLE.filter(r => ctx.w.unlocked[r]).length;
  d.tip(rooms.b, () => {
    const tool = ctx.tool.get();
    const body = tool.kind === 'build'
      ? t('buildbar.roomsBodyActive', { room: t(`room.${tool.type}`) })
      : t('buildbar.roomsBody', { n: unlockedCount(), total: BUILDABLE.length });
    return { title: t('build.rooms'), body, hotkey: 'B' };
  });
  d.tip(staff.b, () => ({ title: t('build.staff'), body: t('buildbar.staffBody', { n: staffOf(ctx.w).length, wages: ctx.fmt(Math.round(wagesPerDay(ctx))) }) }));
  d.tip(demo.b, () => ({
    title: t('build.demolish'),
    body: ctx.tool.get().kind === 'demolish' ? t('buildbar.demolishOn') : t('buildbar.demolishBody', { pct: DEMOLISH_REFUND_PCT }),
    hotkey: delKey(ctx),
  }));

  ctx.root.appendChild(bar);

  let acc = WRITE_MS;
  // a picked tool closes any open menu; opening a menu drops a build/demolish tool (only one thing at a time)
  const unsubs = [
    ctx.tool.on(v => { if (v.kind !== 'none' && ctx.menu.get() !== null) ctx.menu.set(null); acc = WRITE_MS; }),
    ctx.menu.on(v => { if (v !== null && (ctx.tool.get().kind === 'build' || ctx.tool.get().kind === 'demolish')) ctx.tool.set({ kind: 'none' }); acc = WRITE_MS; }),
    ctx.compact.on(() => { acc = WRITE_MS; }),
  ];

  const render = () => {
    const menu = ctx.menu.get(), tool = ctx.tool.get();
    d.cls(bar, 'bb-compact', ctx.compact.get());
    d.attr(bar, 'aria-label', t('buildbar.bar'));
    const set = (x: { b: HTMLElement; lbl: HTMLElement; key: HTMLElement }, label: string, on: boolean, key: string, expanded?: boolean) => {
      d.text(x.lbl, label);
      d.text(x.key, key);
      d.cls(x.key, 'bb-hide', !key);
      d.attr(x.b, 'aria-label', key ? `${label} (${key})` : label);
      d.attr(x.b, 'aria-pressed', on ? 'true' : 'false');
      if (expanded !== undefined) d.attr(x.b, 'aria-expanded', expanded ? 'true' : 'false');
      d.cls(x.b, 'on', on);
    };
    set(rooms, t('build.rooms'), menu === 'rooms' || tool.kind === 'build', 'B', menu === 'rooms');
    set(staff, t('build.staff'), menu === 'staff', '', menu === 'staff');
    set(demo, t('build.demolish'), tool.kind === 'demolish', delKey(ctx));
  };

  return {
    update(dt) {
      acc += dt * 1000;
      if (acc < WRITE_MS) return;
      acc = 0;
      render();
    },
    destroy() { for (const u of unsubs.splice(0)) u(); bar.remove(); },
  };
}
