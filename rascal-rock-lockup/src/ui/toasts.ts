/**
 * Toasts (docs/UI_DESIGN.md §3, Brief §16): a non-blocking stack top-centre below the top bar. Max 3 visible (the
 * oldest drops), ≤ 2 lines, kinds info / good / bad with an icon. Same-type toasts within 1.5 s merge (×n).
 * Sim events arrive through ctx.onEvent; DOM writes happen in update() at ≤ 10/s.
 */
import './overlays.css';
import type { UICtx, Component } from './ctx';
import { ROOM_ICON, ROLE_ICON } from './ctx';
import type { SimEvent } from '../sim/types';
import type { Key } from '../i18n/i18n';
import { ECON, RUF, UPGRADE, STARS, type RoomType, type StaffRole } from '../content/balance';
import { hireFee } from '../sim/staff';
import { objectiveReward, OBJECTIVES } from '../sim/objectives';
import { roomById } from '../sim/world';
import { sideAnchor } from './m5kit';

type Kind = 'info' | 'good' | 'bad';
interface ToastOpts { icon?: string; kind?: Kind; ms?: number }

const MAX = 3;
const DEFAULT_MS = 2500;
const MERGE_MS = 1500;
const STEP_S = 0.1; // ≤ 10 DOM passes per second
const OUT_MS = 200;
const svg = (s: string) => `data:image/svg+xml,${encodeURIComponent(s)}`;
const KIND_ICON: Record<Kind, string> = {
  info: svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="#33908a" stroke="#14424a" stroke-width="2"/><circle cx="12" cy="7.4" r="1.6" fill="#f8f0de"/><path d="M12 11v6.2" stroke="#f8f0de" stroke-width="2.6" stroke-linecap="round"/></svg>'),
  good: 'check',
  bad: svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="#df6450" stroke="#5e2b23" stroke-width="2"/><path d="M12 6.5v6.6" stroke="#f8f0de" stroke-width="2.8" stroke-linecap="round"/><circle cx="12" cy="17" r="1.7" fill="#f8f0de"/></svg>'),
};

interface Entry {
  key: string;
  /** text builder: re-run on merge (count) and on a language switch */
  build: (count: number) => string;
  count: number;
  kind: Kind;
  icon: string;
  ms: number;
  /** show a ×n badge when merged (false when the text itself carries the count) */
  badge: boolean;
  last: number;
  until: number;
  el?: HTMLDivElement;
  textEl?: HTMLSpanElement;
  countEl?: HTMLSpanElement;
  shownText?: string;
  shownCount?: number;
  outAt?: number;
  /** not shown before this time (a toast queued behind another one, e.g. the Daily Ledger behind "Next morning…") */
  startAt?: number;
  /** a direct answer to the player's own tap (ctx.toast / ctx.feedback): never held back behind a modal card */
  ui?: boolean;
}

export function mountToasts(ctx: UICtx): Component & { toast(text: string, opts?: ToastOpts): void } {
  const { t, w } = ctx;
  const stack = document.createElement('div');
  stack.className = 'ov-toasts';
  stack.dataset.overlay = '1';
  stack.setAttribute('role', 'status');
  stack.setAttribute('aria-live', 'polite');
  ctx.root.appendChild(stack);

  let entries: Entry[] = [];
  let acc = STEP_S;
  let lastLang = ctx.lang();
  let lastTop = '';
  let lastCompact: boolean | null = null;
  let lastNow = performance.now();

  const iconUrl = (name: string) => (name.startsWith('data:') ? name : ctx.icon(name));
  /** translated text or null when the key does not exist */
  const tx = (key: Key, vars?: Record<string, string | number>) => { const s = t(key, vars); return s === key ? null : s; };

  /** returns the new entry, or null when it merged into a visible one */
  const push = (key: string, build: (count: number) => string, opts: ToastOpts = {}, badge = true): Entry | null => {
    const now = performance.now();
    const kind = opts.kind ?? 'info';
    const ms = opts.ms ?? DEFAULT_MS;
    // same type within 1.5 s of its last trigger → merge into the visible toast instead of stacking
    const prev = entries.find(e => e.key === key && e.outAt === undefined && now - e.last < MERGE_MS);
    if (prev) { prev.count++; prev.last = now; prev.until = now + ms; prev.build = build; return null; }
    const e: Entry = { key, build, count: 1, kind, icon: opts.icon ?? KIND_ICON[kind], ms, badge, last: now, until: now + ms };
    entries.push(e);
    return e;
  };
  /** room unlocks toasted during the current frame's event dispatch (objectives.ts emits 'unlock' right before its 'objective') */
  const frameUnlocks = new Map<string, Entry>();

  // ------------------------------------------------------------------ sim events → toasts
  const agentName = (id: unknown) => w.agents.find(a => a.id === id)?.name || t('overlays.toast.someone');
  const roomName = (type: string) => tx(`room.${type}`) ?? type;
  /** stats snapshot for the Daily Ledger (income / releases since the previous midnight) */
  const totalIncome = () => Object.values(w.stats.income).reduce((s, v) => s + (v || 0), 0);
  let ledger = { income: totalIncome(), released: w.stats.released };
  let firstShipment = (w.stats.income.crates ?? 0) > 0;

  const onEvent = (e: SimEvent) => {
    switch (e.type) {
      case 'ferryLeftWithRest': {
        const n = Number(e.n) || 0;
        push('ferryLeft', c => t('toast.ferryLeft', { n: ctx.fmt(n * c) }), { kind: 'bad', icon: 'ferry', ms: 3500 }, false);
        break;
      }
      case 'escaped': {
        const name = agentName(e.id);
        push('escaped', c => (c > 1 ? t('overlays.toast.escapedN', { n: c, ruf: Math.abs(RUF.escaped) * c }) : t('toast.escaped', { name })), { kind: 'bad', icon: 'gate', ms: 3000 }, false);
        break;
      }
      case 'caught':
        push('caught', c => t('overlays.toast.caught', { coins: ctx.fmt(ECON.caughtCoins * c), ruf: (RUF.caught + RUF.eventSolved) * c }), { kind: 'good', icon: 'coin' }, false);
        break;
      case 'objective': {
        const id = String(e.id), k = Number(e.k) || 0;
        const reward = objectiveReward(k);
        const goal = () => tx(`obj.${id}`) ?? tx(`clipboard.obj.${id}`) ?? (OBJECTIVES[k]?.id === 'wash' ? t('overlays.toast.objBuild', { room: roomName('wash') }) : id);
        // a room this objective unlocked in the same frame joins this toast instead of stacking a second one
        const merged: string[] = [];
        for (const u of OBJECTIVES[k]?.unlocks ?? []) {
          const ue = frameUnlocks.get(u);
          if (!ue || ue.el) continue;
          entries = entries.filter(x => x !== ue); frameUnlocks.delete(u); merged.push(u);
        }
        const text = () => (merged.length
          ? t('overlays.toast.objectiveUnlock', { goal: goal(), coins: ctx.fmt(reward), ruf: RUF.objective, room: merged.map(roomName).join(', ') })
          : t('overlays.toast.objective', { goal: goal(), coins: ctx.fmt(reward), ruf: RUF.objective }));
        push(`objective:${id}`, text, { kind: 'good', icon: 'clipboard', ms: merged.length ? 4500 : 3500 });
        break;
      }
      case 'unlock': {
        const what = String(e.what);
        if (what === 'speed3') push('unlock:speed3', () => t('overlays.toast.unlockSpeed3'), { kind: 'good', icon: 'fast', ms: 3500 });
        else if (tx(`room.${what}`)) {
          const ue = push(`unlock:${what}`, () => t('overlays.toast.unlockRoom', { room: roomName(what) }), { kind: 'good', icon: ROOM_ICON[what as RoomType] ?? 'rooms', ms: 3500 });
          if (ue) frameUnlocks.set(what, ue);
        }
        // projects, supervisor slots and inspection belong to systems that arrive in M5 → no toast yet (no "coming soon")
        break;
      }
      case 'star': {
        // G2: every star says what it brings and what the next one will (the star was an empty "level up" before)
        const s = Number(e.stars) || 0;
        const next = s < STARS.length ? s + 1 : 0;
        push('star', () => (next
          ? t('overlays.toast.starNext', { n: s, what: t(`overlays.starNew.${s}`), next, at: ctx.fmt(STARS[next - 1]), nextWhat: t(`overlays.starNew.${next}`) })
          : t('overlays.toast.starMax', { n: s, what: t(`overlays.starNew.${s}`) })), { kind: 'good', icon: 'star', ms: 5000 });
        break;
      }
      case 'coins': {
        // G2: the very first crate sale is a moment ("Münzregen", Brief §4.2 2:15–3:00) – juice.ts adds the coin fountain
        if (e.kind === 'crates' && !firstShipment && Math.round(w.stats.income.crates ?? 0) <= Math.round(Number(e.amount) || 0) + 0.5) {
          firstShipment = true;
          const n = Math.round(Number(e.amount) || 0);
          push('firstShipment', () => t('overlays.toast.firstShipment', { n: ctx.fmt(n) }), { kind: 'good', icon: 'coin', ms: 3500 });
        }
        break;
      }
      case 'dayEnd': {
        // the sim emits the finished day 0-based (dayOf(t) - 1); the topbar clock counts from 1 (topbar.ts clockInfo)
        const day = (Number(e.day) || 0) + 1, wages = Number(e.wages) || 0;
        const inc = totalIncome(), rel = w.stats.released;
        const earned = Math.max(0, inc - ledger.income), released = Math.max(0, rel - ledger.released);
        ledger = { income: inc, released: rel };
        push(`dayEnd:${day}`, () => t('overlays.toast.dayEnd', { day, earned: ctx.fmt(earned), wages: ctx.fmt(wages), released }), { kind: 'info', icon: 'coin', ms: 3000 });
        break;
      }
      case 'unpaid': {
        const wages = Number(e.wages) || 0;
        push('unpaid', () => t('overlays.toast.unpaid', { wages: ctx.fmt(wages) }), { kind: 'bad', icon: 'staff', ms: 3500 });
        break;
      }
      case 'nightSkip': {
        // the skipped night settles midnight in the same tick: "Next morning…" first, the Daily Ledger right after it
        // (one at a time – two fresh toasts sliding in together read as one on top of the other, M4 self-review)
        const ms = 2200, now = performance.now();
        for (const x of entries) if (/^dayEnd:/.test(x.key) && !x.el && x.outAt === undefined) { x.startAt = now + ms + OUT_MS; x.until = x.startAt + x.ms; x.last = x.startAt; }
        push('nightSkip', () => t('toast.nextMorning'), { kind: 'info', icon: 'sun', ms });
        break;
      }
      case 'loan': {
        const amount = Number(e.amount) || 0;
        push('loan', () => t('loan.text', { n: ctx.fmt(amount) }), { kind: 'info', icon: 'coin', ms: 3500 });
        break;
      }
      case 'loanRepaid':
        push('loanRepaid', () => t('overlays.toast.loanRepaid'), { kind: 'good', icon: 'coin', ms: 3000 });
        break;
      case 'milestone': {
        const r = roomById(w, Number(e.roomId));
        const type = r?.type ?? '';
        const level = Number(e.level) || 0;
        push(`milestone:${e.roomId}:${level}`, () => t('overlays.toast.milestone', { room: type ? roomName(type) : '', n: level, x: UPGRADE.milestoneMult, ruf: RUF.milestone }), { kind: 'good', icon: (type && ROOM_ICON[type as RoomType]) || 'star', ms: 3500 });
        break;
      }
      case 'hire': {
        // one confirmation for every entry point (staff menu, room panel "Hire +1")
        const role = String(e.role) as StaffRole;
        if (!(role in ROLE_ICON)) break;
        push(`hire:${role}`, () => t('buildbar.hireOk', { role: t(`staff.${role}`), fee: ctx.fmt(hireFee(role)) }), { kind: 'good', icon: ROLE_ICON[role], ms: 1800 });
        break;
      }
      case 'parcel':
        push(`parcel:${e.k}`, () => t('overlays.toast.parcel'), { kind: 'good', icon: 'rooms', ms: 3000 });
        break;
    }
  };
  const unsub = ctx.onEvent(onEvent);

  // ------------------------------------------------------------------ DOM
  const make = (e: Entry) => {
    const el = document.createElement('div');
    el.className = `ov-toast ${e.kind}`;
    const img = document.createElement('img'); img.alt = ''; img.draggable = false; img.src = iconUrl(e.icon); el.appendChild(img);
    const txt = document.createElement('span'); txt.className = 'ov-toast-text'; el.appendChild(txt);
    const cn = document.createElement('span'); cn.className = 'ov-toast-count num'; cn.hidden = true; el.appendChild(cn);
    e.el = el; e.textEl = txt; e.countEl = cn;
    stack.appendChild(el);
    // next frame: fade/slide in (transform + opacity only)
    requestAnimationFrame(() => el.classList.add('in'));
  };
  const write = (e: Entry, force: boolean) => {
    if (!e.textEl || !e.countEl) return;
    const s = e.build(e.count);
    if (force || s !== e.shownText) { e.shownText = s; e.textEl.textContent = s; }
    const showCount = e.badge ? e.count : 0;
    if (showCount !== e.shownCount) { e.shownCount = showCount; e.countEl.hidden = showCount < 2; e.countEl.textContent = showCount < 2 ? '' : `×${showCount}`; }
  };

  return {
    toast(text, opts) { const e = push(`txt:${text}`, () => text, opts); if (e) e.ui = true; },
    update(dt) {
      frameUnlocks.clear(); // events are dispatched before update() each frame
      acc += dt;
      if (acc < STEP_S) return;
      acc = 0;
      const now = performance.now();
      // position below the top bar (fallback 48 px) – and below the M5 event banner while one shows (m5kit.ts banners)
      const top = document.querySelector<HTMLElement>('[data-hud="top"]');
      let y = Math.round(top ? top.getBoundingClientRect().bottom + 6 : 48);
      const ban = ctx.root.querySelector<HTMLElement>(':scope > .m5-banners');
      if (ban && !ban.hidden) { const b = ban.getBoundingClientRect(); if (b.height > 0) y = Math.max(y, Math.round(b.bottom + 6)); }
      // … and below the return panel (it sits top-centre too; a toast on it hid its headline, M5 integration flow)
      const ret = ctx.root.querySelector<HTMLElement>(':scope > .m5-ret');
      if (ret && !ret.hidden) { const b = ret.getBoundingClientRect(); if (b.height > 0) y = Math.max(y, Math.round(b.bottom + 14)); }
      // a side panel in the way (narrow screens): above the banner stack in the free area left of it (m5kit sideAnchor)
      let ty = `translate3d(-50%,${y}px,0)`;
      const side = sideAnchor(ctx);
      if (side) {
        let b = side.bottom;
        if (ban && !ban.hidden && ban.classList.contains('m5-side')) { const r = ban.getBoundingClientRect(); if (r.height > 0) b = Math.min(b, r.top - 6); }
        const h = stack.getBoundingClientRect().height;
        ty = `translate3d(calc(-50% + ${Math.round(side.cx - window.innerWidth / 2)}px),${Math.round(b - h)}px,0)`;
      }
      const mw = side ? `${Math.round(side.width)}px` : '';
      if (stack.style.maxWidth !== mw) stack.style.maxWidth = mw;
      if (ty !== lastTop) { lastTop = ty; stack.style.transform = ty; }
      const compact = ctx.compact.get();
      if (compact !== lastCompact) { lastCompact = compact; stack.classList.toggle('compact', compact); stack.classList.toggle('touch', ctx.touch); }
      const langChanged = lastLang !== ctx.lang();
      lastLang = ctx.lang();

      // a modal card is open (inspection result, transfer, settings – all pausing): sim-event toasts (ledger, ferry,
      // goals) wait behind it with their clock stopped instead of covering its stamp and stars (M5 flow audit,
      // 844×390); answers to the player's own taps inside the card still show at once
      // (the return panel counts too: on short screens the stack below it ran into the build bar)
      const modal = [...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')].some(el => !el.closest('[hidden]') && el.getClientRects().length > 0)
        || !!(ret && !ret.hidden);
      const held = now - lastNow;
      lastNow = now;
      if (modal) for (const e of entries) {
        if (e.ui || e.outAt !== undefined) continue;
        if (e.el) { e.until += held; e.last += held; e.el.classList.add('held'); }
        else { e.startAt = Math.max(e.startAt ?? 0, now + 1); e.until = e.startAt + e.ms; }
      } else for (const e of entries) if (e.el?.classList.contains('held')) e.el.classList.remove('held');
      const waiting = (e: Entry) => e.startAt !== undefined && now < e.startAt;
      // expire
      for (const e of entries) if (e.outAt === undefined && !waiting(e) && now >= e.until) e.outAt = now;
      // max 3 visible: the oldest live ones drop
      const live = entries.filter(e => e.outAt === undefined && !waiting(e));
      for (let i = 0; i < live.length - MAX; i++) live[i].outAt = now;
      // create / refresh / fade out
      for (const e of entries) {
        if (e.outAt !== undefined) {
          if (e.el && !e.el.classList.contains('out')) e.el.classList.add('out');
          continue;
        }
        if (waiting(e)) continue;
        if (!e.el) make(e);
        write(e, langChanged);
      }
      // remove finished
      const keep: Entry[] = [];
      for (const e of entries) {
        if (e.outAt !== undefined && now - e.outAt >= OUT_MS) e.el?.remove();
        else keep.push(e);
      }
      entries = keep;
    },
    destroy() { unsub(); stack.remove(); },
  };
}
