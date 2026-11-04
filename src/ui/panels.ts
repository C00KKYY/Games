/**
 * Context panels (Brief §3.4, §6.5; docs/UI_DESIGN.md §3): the panel for ctx.selection.
 * - Room: name + level, throughput/h and the limiting factor with a fix hint, utilisation, queue, Ø walk, staff + Hire +1,
 *   upgrade ×1 / ×10 / Max with preview, next milestone, two-step demolish with refund, resize hint. Bunk / gate / dock
 *   show their own numbers.
 * - Rascal: name, species, case file (case no., offence, remark, sentence), 4 need bars, reform bar, traits, activity,
 *   Follow toggle (camera follows until the player pans or the rascal leaves).
 * - Staff: role, room, wage per day.
 * Desktop: card on the right below the topbar. Compact (≤ 900 px): bottom sheet above the build bar. Overlay
 * (data-overlay), × button, closes on a camera pan. The DOM is built once; live values are written ≤ 10×/s and only
 * when they change (memoised text / attribute / class / transform).
 */
import './panels.css';
import { ROLE_ICON, ROOM_ICON, type UICtx, type Component, type Selection } from './ctx';
import type { Key } from '../i18n/i18n';
import type { World, Room, Agent, Need, CommandResult } from '../sim/types';
import { AF } from '../sim/types';
import { roomStats, throughputAt, type RoomStats } from '../sim/roomstats';
import { staffIn } from '../sim/agents';
import { staffOf, hireFee, cartCapacity } from '../sim/staff';
import { isWalled, roomById, roomsOf, starsOf } from '../sim/world';
import { OFFENCES, ADJECTIVES, SPECIES_NAME } from '../content/gags';
import {
  ROOMS, UPGRADE, TIME, RUF, GUARD_RADIUS, STAFF_ROOM, roomCost, wageFor, boardPerBedHour, releaseBounty, gateBountyMult,
  type StaffRole, type RoomType,
} from '../content/balance';

const TICK_S = 0.1;            // ≤ 10 DOM passes per second
const POS_S = 0.5;             // re-measure topbar / build bar twice per second
const CONFIRM_S = 5;           // demolish confirmation times out
const NEEDS: Need[] = ['hunger', 'energy', 'hygiene', 'fun'];
const NEED_ICON: Record<Need, string> = { hunger: 'meal', energy: 'bed', hygiene: 'shower', fun: 'decor' };
const ROAMING: ReadonlySet<StaffRole> = new Set<StaffRole>(['janitor', 'guard']);
const LOCK_SVG = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7.5 11V8a4.5 4.5 0 0 1 9 0v3" fill="none" stroke="#4a3022" stroke-width="2.6" stroke-linecap="round"/><rect x="4.5" y="10.5" width="15" height="11" rx="2.5" fill="#e8b13a" stroke="#4a3022" stroke-width="1.8"/><circle cx="12" cy="15.6" r="1.7" fill="#4a3022"/></svg>');

type Mode = 'room' | 'rascal' | 'staff' | 'other' | null;

export function mountPanels(ctx: UICtx): Component {
  const w: World = ctx.w;
  const t = (k: Key, v?: Record<string, string | number>) => ctx.t(k, v);

  // ------------------------------------------------------------------ memoised DOM writes
  const memo = new WeakMap<Node, Record<string, string>>();
  const changed = (el: Node, k: string, v: string) => {
    let m = memo.get(el); if (!m) { m = {}; memo.set(el, m); }
    if (m[k] === v) return false;
    m[k] = v; return true;
  };
  const text = (el: HTMLElement, s: string) => { if (changed(el, 'text', s)) el.textContent = s; };
  const attr = (el: HTMLElement, name: string, v: string | null) => {
    if (!changed(el, 'a:' + name, v ?? '\u0000')) return;
    if (v === null) el.removeAttribute(name); else el.setAttribute(name, v);
  };
  const cls = (el: HTMLElement, name: string, on: boolean) => { if (changed(el, 'c:' + name, on ? '1' : '0')) el.classList.toggle(name, on); };
  const show = (el: HTMLElement, on: boolean) => { if (changed(el, 'show', on ? '1' : '0')) el.hidden = !on; };
  const bar = (el: HTMLElement, f: number) => {
    const v = (Math.round(Math.max(0, Math.min(1, f)) * 200) / 200).toString();
    if (changed(el, 'bar', v)) el.style.transform = `scaleX(${v})`;
  };
  const cssVar = (el: HTMLElement, name: string, v: string) => { if (changed(el, 'v:' + name, v)) el.style.setProperty(name, v); };

  // ------------------------------------------------------------------ element helpers
  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, c: string, parent?: HTMLElement): HTMLElementTagNameMap[K] => {
    const el = document.createElement(tag); if (c) el.className = c; parent?.appendChild(el); return el;
  };
  const img = (src: string, c: string, parent: HTMLElement) => {
    const i = h('img', c, parent); i.src = src; i.alt = ''; i.draggable = false; return i;
  };
  const icon = (name: string, c: string, parent: HTMLElement) => img(ctx.icon(name), c, parent);
  const setIcon = (el: HTMLImageElement, name: string) => { const src = ctx.icon(name); if (changed(el, 'src', src)) el.src = src; };
  const tip = (el: HTMLElement, fn: () => { title: string; body?: string; hotkey?: string }) => {
    el.dataset.tip = '1';
    try { ctx.tip(el, fn); } catch { /* tooltip layer not mounted yet */ }
  };
  const button = (c: string, parent: HTMLElement, onClick: () => void) => {
    const b = h('button', 'pn-btn ' + c, parent); b.type = 'button';
    b.addEventListener('click', e => { e.stopPropagation(); onClick(); dirty = true; });
    b.addEventListener('pointerdown', e => e.stopPropagation());
    return b;
  };
  /** number with at most one decimal (ctx.fmt rounds to integers below 10 K) */
  const num = (n: number) => {
    if (Math.abs(n) >= 100) return ctx.fmt(n);
    const r = Math.round(n * 10) / 10;
    return r.toLocaleString(ctx.lang() === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: 1 });
  };
  const coins = (n: number) => ctx.fmt(Math.ceil(n));
  const roomName = (r: Room) => t(`room.${r.type}`);
  const roleName = (role: StaffRole) => t(`staff.${role}`);
  const local = (o: { en: string; de: string } | undefined) => (o ? o[ctx.lang()] ?? o.en : '');

  // ------------------------------------------------------------------ skeleton
  const root = h('section', 'pn');
  root.dataset.overlay = '';
  root.setAttribute('role', 'dialog');
  if (ctx.touch) root.classList.add('pn--touch');
  root.hidden = true;
  root.addEventListener('pointerdown', e => e.stopPropagation());
  root.addEventListener('wheel', e => e.stopPropagation(), { passive: true });

  const head = h('header', 'pn-head', root);
  const plaque = h('span', 'pn-plaque', head);
  const headIc = icon('rooms', '', plaque);
  const headTxt = h('div', 'pn-head-txt', head);
  const title = h('h2', 'pn-title', headTxt);
  const sub = h('div', 'pn-sub', headTxt);
  const closeBtn = button('pn-x', head, () => close());
  icon('close', '', closeBtn);
  tip(closeBtn, () => ({ title: t('panels.close'), body: t('panels.closeTip'), hotkey: 'Esc' }));

  const body = h('div', 'pn-body', root);

  // ================================================================== room view
  const R = h('div', 'pn-view pn-room', body);
  const rA = h('div', 'pn-col', R);
  const rB = h('div', 'pn-col', R);

  // construction
  const rBuild = h('div', 'pn-line pn-building', rA);
  icon('clock', 'pn-ic', rBuild);
  const rBuildTxt = h('span', '', rBuild);

  // throughput + limit
  const rRate = h('div', 'pn-rate', rA);
  const rRateNum = h('span', 'pn-rate-num num', rRate);
  const rRateUnit = h('span', 'pn-rate-unit', rRate);
  const rLimit = h('div', 'pn-limit', rA);
  const rLimitTag = h('span', 'pn-limit-tag', rLimit);
  const rLimitFix = h('div', 'pn-hint', rA);

  // utilisation
  const rUtil = h('div', 'pn-util', rA);
  const rUtilBar = h('div', 'pn-ubar', rUtil);
  const rUtilServed = h('i', 'pn-ubar-served', rUtilBar);
  const rUtilUsed = h('i', 'pn-ubar-used', rUtilBar);
  const rUtilTxt = h('div', 'pn-small', rUtil);

  // queue + walk
  const rQW = h('div', 'pn-chips', rA);
  const rQueue = h('span', 'pn-chip', rQW);
  icon('staff', 'pn-ic', rQueue);
  const rQueueTxt = h('span', '', rQueue);
  const rWalk = h('span', 'pn-chip', rQW);
  icon('clock', 'pn-ic', rWalk);
  const rWalkTxt = h('span', '', rWalk);

  // type-specific lines (bunk / gate / dock / workshop / office / clean)
  const rExtra: { el: HTMLElement; ic: HTMLImageElement; txt: HTMLElement }[] = [];
  for (let i = 0; i < 3; i++) {
    const el = h('div', 'pn-line', rA); const ic = icon('bed', 'pn-ic', el); const txt = h('span', '', el);
    rExtra.push({ el, ic, txt });
  }
  const rTypeHint = h('div', 'pn-hint', rA);

  // staff + hire
  const rStaff = h('div', 'pn-staff', rB);
  const rStaffIc = icon('staff', 'pn-ic', rStaff);
  const rStaffTxt = h('span', 'pn-staff-txt', rStaff);
  const rHire = button('pn-hire', rStaff, () => hire());
  const rHireLbl = h('span', '', rHire);
  const rHireCost = h('span', 'pn-cost', rHire);
  icon('coin', 'pn-coin', rHireCost);
  const rHireNum = h('span', 'num', rHireCost);
  tip(rHire, () => hireTip());

  // upgrades
  const rUp = h('div', 'pn-up', rB);
  const rUpPrev = h('div', 'pn-preview', rUp);
  const rUpRow = h('div', 'pn-up-row', rUp);
  const upBtns: { b: HTMLButtonElement; lbl: HTMLElement; num: HTMLElement; kind: 1 | 10 | 0 }[] = [];
  for (const kind of [1, 10, 0] as const) {
    const b = button('pn-upbtn', rUpRow, () => upgrade(kind));
    const lbl = h('span', 'pn-up-lbl', b);
    const c = h('span', 'pn-cost', b);
    icon('coin', 'pn-coin', c);
    const n = h('span', 'num', c);
    upBtns.push({ b, lbl, num: n, kind });
    tip(b, () => upTip(kind));
  }
  const rMaxLvl = h('div', 'pn-line pn-good', rB);
  icon('star', 'pn-ic', rMaxLvl);
  const rMaxLvlTxt = h('span', '', rMaxLvl);
  const rMile = h('div', 'pn-line pn-mile', rB);
  icon('star', 'pn-ic', rMile);
  const rMileTxt = h('span', '', rMile);

  // demolish (two-step) + resize hint
  const rFoot = h('div', 'pn-foot', rB);
  const rDemo = button('pn-demo', rFoot, () => { confirmAt = now; });
  icon('demolish', 'pn-btn-ic', rDemo);
  const rDemoLbl = h('span', '', rDemo);
  tip(rDemo, () => { const r = selRoom(); return { title: t('panels.demolish'), body: r ? t('panels.demolishTip', { n: coins(refundOf(r)) }) : '' }; });
  const rConfirm = h('div', 'pn-confirm', rFoot);
  rConfirm.dataset.overlay = '';
  const rConfirmTxt = h('span', 'pn-confirm-txt', rConfirm);
  const rYes = button('pn-yes', rConfirm, () => demolish());
  icon('check', 'pn-btn-ic', rYes);
  const rYesLbl = h('span', '', rYes);
  tip(rYes, () => { const r = selRoom(); return { title: t('panels.yes'), body: r ? t('panels.yesTip', { room: roomName(r), n: coins(refundOf(r)) }) : '' }; });
  const rNo = button('pn-no', rConfirm, () => { confirmAt = -1; });
  icon('close', 'pn-btn-ic', rNo);
  const rNoLbl = h('span', '', rNo);
  tip(rNo, () => ({ title: t('panels.no'), body: t('panels.noTip') }));
  const rLast = h('div', 'pn-line pn-locked', rFoot);
  img(LOCK_SVG, 'pn-ic', rLast);
  const rLastTxt = h('span', '', rLast);
  const rResize = h('div', 'pn-hint pn-resize', rB);

  // ================================================================== rascal view
  const A = h('div', 'pn-view pn-rascal', body);
  const aA = h('div', 'pn-col', A);
  const aB = h('div', 'pn-col', A);
  const file = h('div', 'pn-file', aA);
  const fileNo = h('span', 'pn-file-no', file);
  const fileOffLbl = h('div', 'pn-file-lbl', file);
  const fileOff = h('div', 'pn-file-off', file);
  const fileNote = h('div', 'pn-small', file);
  const fileSent = h('div', 'pn-small', file);
  const aAct = h('div', 'pn-act', aA);
  icon('mood', 'pn-ic', aAct);
  const aActTxt = h('span', '', aAct);
  const aTraits = h('div', 'pn-traits', aA);
  const traitEls: HTMLElement[] = [];
  for (let i = 0; i < 3; i++) {
    const el = h('span', 'pn-trait', aTraits);
    const k = i;
    tip(el, () => { const a = selAgent(); const tr = a?.traits[k]; return tr ? { title: t(`trait.${tr}`), body: t(`panels.trait.${tr}`) } : { title: '' }; });
    traitEls.push(el);
  }

  const needRows: Record<string, { row: HTMLElement; lbl: HTMLElement; fill: HTMLElement; n: HTMLElement }> = {};
  for (const k of [...NEEDS, 'reform'] as const) {
    const row = h('div', 'pn-need' + (k === 'reform' ? ' pn-need--reform' : ''), aB);
    icon(k === 'reform' ? 'book' : NEED_ICON[k], 'pn-ic', row);
    const lbl = h('span', 'pn-need-lbl', row);
    const track = h('span', 'pn-need-bar', row);
    const fill = h('i', '', track);
    const n = h('span', 'pn-need-num num', row);
    row.setAttribute('role', 'meter'); row.setAttribute('aria-valuemin', '0'); row.setAttribute('aria-valuemax', '100');
    needRows[k] = { row, lbl, fill, n };
  }
  const aFollow = button('pn-follow', aB, () => { following = !following; if (following) followFrom = panSeen; });
  icon('mood', 'pn-btn-ic', aFollow);
  const aFollowLbl = h('span', '', aFollow);
  tip(aFollow, () => { const a = selAgent(); return { title: following ? t('panels.unfollow') : t('panel.follow'), body: t('panels.followTip', { name: a?.name ?? '' }) }; });

  // ================================================================== staff / other view
  const S = h('div', 'pn-view pn-staffv', body);
  const sRoom = h('div', 'pn-line', S);
  const sRoomIc = icon('rooms', 'pn-ic', sRoom);
  const sRoomTxt = h('span', '', sRoom);
  const sWage = h('div', 'pn-line', S);
  icon('coin', 'pn-ic', sWage);
  const sWageTxt = h('span', '', sWage);
  const sUnpaid = h('div', 'pn-line pn-bad', S);
  icon('clock', 'pn-ic', sUnpaid);
  const sUnpaidTxt = h('span', '', sUnpaid);
  const sShow = button('pn-show', S, () => { const a = selAgent(); const r = a?.roomId ? roomById(w, a.roomId) : undefined; if (r) ctx.selection.set({ kind: 'room', id: r.id }); });
  icon('rooms', 'pn-btn-ic', sShow);
  const sShowLbl = h('span', '', sShow);
  tip(sShow, () => { const a = selAgent(); const r = a?.roomId ? roomById(w, a.roomId) : undefined; return { title: t('panels.showRoom'), body: r ? t('panels.showRoomTip', { room: roomName(r) }) : '' }; });

  ctx.root.appendChild(root);

  // ------------------------------------------------------------------ state
  let sel: Selection = ctx.selection.get();
  let mode: Mode = null;
  let acc = TICK_S, posAcc = POS_S, now = 0, dirty = true, lastLang = '';
  let confirmAt = -1;
  let following = false, followFrom = 0, panSeen = ctx.panned.get();
  let shownKey = '';

  const selRoom = () => (sel?.kind === 'room' ? roomById(w, sel.id) : undefined);
  const selAgent = () => (sel?.kind === 'agent' ? w.agents.find(a => a.id === (sel as { id: number }).id) : undefined);
  function close() { ctx.selection.set(null); }

  const unsubs = [
    ctx.selection.on(v => { sel = v; confirmAt = -1; following = false; dirty = true; }),
    ctx.panned.on(v => { panSeen = v; following = false; if (sel) ctx.selection.set(null); }),
    ctx.compact.on(() => { dirty = true; posAcc = POS_S; }),
    ctx.menu.on(() => { dirty = true; }),
  ];

  // ------------------------------------------------------------------ derived numbers
  const roleOf = (r: Room): StaffRole | undefined => ROOMS[r.type].staff;
  const refundOf = (r: Room) => {
    const lastBuild = w.director.data.lastBuildId === r.id && (!r.built || w.rtMs - r.buildEndMs <= 10000);
    const base = roomCost(r.type, r.w, r.h);
    return lastBuild ? (w.director.data.lastBuildCost ?? base) : base * 0.5;
  };
  const lastOfType = (r: Room) => (r.type === 'bunk' || r.type === 'canteen') && roomsOf(w, r.type).length <= 1;
  /** pay grade of a staff member: level of the room they work in (as in sim.ts onMidnight) */
  const wageOf = (a: Agent) => {
    const role = a.role as StaffRole; const own = a.roomId ? roomById(w, a.roomId) : undefined;
    const type: RoomType = STAFF_ROOM[role];
    const lvl = own && own.type === type ? own.level : Math.max(1, ...roomsOf(w, type).map(r => r.level));
    return wageFor(role, lvl);
  };
  const upN = (r: Room, kind: 1 | 10 | 0, st: RoomStats) => (kind === 1 ? Math.min(1, UPGRADE.maxLevel - r.level) : kind === 10 ? Math.min(10, UPGRADE.maxLevel - r.level) : st.upgrade.maxN);
  const upCostOf = (kind: 1 | 10 | 0, st: RoomStats) => (kind === 1 ? st.upgrade.cost1 : kind === 10 ? st.upgrade.cost10 : st.upgrade.maxN > 0 ? st.upgrade.costMax : st.upgrade.cost1);
  /** "now → next" text of what an upgrade by n levels changes */
  const previewOf = (r: Room, n: number): string => {
    const to = Math.min(UPGRADE.maxLevel, r.level + n);
    if (r.type === 'bunk') return t('panels.boardPreview', { now: num(boardPerBedHour(r.level)), next: num(boardPerBedHour(to)) });
    if (r.type === 'gate') { const b = releaseBounty(starsOf(w.ruf)); return t('panels.bountyPreview', { now: coins(b * gateBountyMult(r.level)), next: coins(b * gateBountyMult(to)) }); }
    const st = unitOf(r);
    if (!st) return t('panels.lvPreview', { from: r.level, to });
    return t('panels.preview', { now: num(throughputAt(w, r, r.level)), next: num(throughputAt(w, r, to)), unit: t(`panels.unit.${st}`) });
  };
  const unitOf = (r: Room): string => (({ canteen: 'meals', wash: 'showers', workshop: 'crates', classroom: 'reform', yard: 'fun', dock: 'trips' } as Partial<Record<RoomType, string>>)[r.type] ?? '');
  const hourRange = (a: number, b: number) => `${String(a).padStart(2, '0')}\u2060–\u2060${String(b).padStart(2, '0')}`; // word joiners: never break inside a range

  // ------------------------------------------------------------------ commands
  function hire() {
    const r = selRoom(); if (!r) return; const role = roleOf(r); if (!role) return;
    const res = ctx.cmd.hire(w, role, r.id);
    ctx.feedback(res);
    if (res.ok) ctx.sound('hire');
  }
  function upgrade(kind: 1 | 10 | 0) {
    const r = selRoom(); if (!r) return;
    const st = roomStats(w, r);
    const n = upN(r, kind, st);
    const res: CommandResult = n > 0 ? ctx.cmd.upgrade(w, r.id, n) : { ok: false, reason: 'coins', cost: st.upgrade.cost1 };
    ctx.feedback(res);
    if (res.ok) ctx.sound('upgrade');
  }
  function demolish() {
    const r = selRoom(); confirmAt = -1; if (!r) return;
    const res = ctx.cmd.demolish(w, r.id);
    ctx.feedback(res);
    if (res.ok) { ctx.sound('demolish'); ctx.selection.set(null); }
  }
  function hireTip() {
    const r = selRoom(); const role = r && roleOf(r);
    if (!r || !role) return { title: '' };
    const lines = [t('panels.hireBody', { fee: coins(hireFee(role)), wage: coins(wageFor(role, r.level)) })];
    const per = role === 'guard' ? GUARD_RADIUS : ROOMS[r.type].perStaff ?? 0;
    lines.push(t(`panels.hireFx.${role}`, { n: per }));
    if (w.coins < hireFee(role)) lines.push(t('panels.poor', { n: coins(hireFee(role) - w.coins) }));
    return { title: t('panels.hireTitle', { role: roleName(role) }), body: lines.join('\n') };
  }
  function upTip(kind: 1 | 10 | 0) {
    const r = selRoom(); if (!r) return { title: '' };
    const st = roomStats(w, r);
    const n = upN(r, kind, st);
    const mult = kind === 0 ? t('panels.max') : `×${kind}`;
    if (n <= 0) return { title: t('panels.upTitle', { mult }), body: t('panels.maxNone', { cost: coins(st.upgrade.cost1) }) };
    const cost = upCostOf(kind, st);
    const lines = [t('panels.upBody', { from: r.level, to: r.level + n, cost: coins(cost) }), previewOf(r, n)];
    const role = roleOf(r);
    if (role && staffIn(w, r, role).length) lines.push(t('panels.wageUp', { role: roleName(role), now: coins(wageFor(role, r.level)), next: coins(wageFor(role, r.level + n)) }));
    if (w.coins < cost) lines.push(t('panels.poor', { n: coins(cost - w.coins) }));
    return { title: t('panels.upTitle', { mult }), body: lines.join('\n') };
  }

  // ------------------------------------------------------------------ render: room
  function renderRoom(r: Room) {
    const ROOM_IC = ROOM_ICON[r.type] ?? 'warden';
    setIcon(headIc, ROOM_IC);
    const hasUp = ROOMS[r.type].baseUp > 0;
    text(title, hasUp ? `${roomName(r)} · ${t('panels.lv', { n: r.level })}` : roomName(r));
    text(sub, '');
    show(sub, false);
    attr(root, 'aria-label', roomName(r));

    const st = roomStats(w, r);
    const walled = isWalled(r);
    const built = r.built;
    const role = roleOf(r);

    // construction
    show(rBuild, !built);
    if (!built) text(rBuildTxt, t('panels.building', { s: Math.max(0, Math.ceil((r.buildEndMs - w.rtMs) / 1000)) }));

    // throughput (not for bunk / office / guard: no per-hour output)
    const unit = unitOf(r);
    const showRate = built && !!unit;
    show(rRate, showRate);
    if (showRate) { text(rRateNum, num(st.throughput)); text(rRateUnit, t(`panels.unit.${unit}`)); }

    // limit + fix hint (rooms with seats; gate/dock/office/guard have no seats)
    const seated = walled && r.type !== 'guard' && built;
    // bunks: the limit is the number of beds (assigned beds, not sleepers), shown below with the bed count
    const bedsUsed = r.type === 'bunk' ? w.agents.filter(a => a.bed === r.id).length : 0;
    const lim = st.limit;
    const showLimit = seated && r.type !== 'bunk' && lim !== 'none' && lim !== 'unbuilt';
    show(rLimit, showLimit); show(rLimitFix, showLimit);
    if (showLimit) {
      text(rLimitTag, t('panel.limit', { what: t(`panels.limit.${lim}`) }));
      cls(rLimitTag, 'bad', lim !== 'level');
      let fix = '';
      if (lim === 'seats') fix = t('panels.fix.seats');
      else if (lim === 'staff') fix = t('panels.fix.staff', { role: roleName(role ?? 'cook') });
      else if (lim === 'level') fix = t('panels.fix.level');
      else if (!r.reachable) fix = t('panels.fix.unreachable');
      else if (r.blockedUntilMs > w.rtMs) fix = t('panels.fix.blocked');
      else if (r.type === 'canteen') fix = t('panels.fix.closedMeal', { times: TIME.meals.map(([a, b]) => hourRange(a, b)).join(', ') });
      else if (r.type === 'yard') fix = t('panels.fix.closedDay', { times: hourRange(8, 22) });
      else fix = t('panels.fix.closedDay', { times: hourRange(TIME.activityHours[0], TIME.activityHours[1]) });
      text(rLimitFix, fix);
    }

    // utilisation
    const showUtil = seated && r.type !== 'bunk' && st.slots > 0;
    show(rUtil, showUtil);
    if (showUtil) {
      bar(rUtilServed, st.served / st.slots);
      bar(rUtilUsed, st.used / st.slots);
      text(rUtilTxt, t('panels.util', { used: st.used, served: st.served, slots: st.slots }));
    }
    show(rQW, seated && r.type !== 'bunk');
    if (seated) {
      text(rQueueTxt, t('panel.queue', { n: st.queue }));
      cls(rQueue, 'bad', st.queue > 0);
      text(rWalkTxt, st.walkSec > 0 ? t('panel.walk', { n: st.walkSec }) : t('panels.walkNone'));
    }

    // type-specific lines
    const extra: [string, string][] = [];
    let typeHint = '';
    if (built) {
      if (r.type === 'bunk') {
        extra.push(['bed', t('panels.beds', { used: bedsUsed, total: r.slots.length })]);
        extra.push(['coin', t('panels.board', { n: num(boardPerBedHour(r.level)) })]);
        if (bedsUsed >= r.slots.length) typeHint = t('panels.fix.beds');
      } else if (r.type === 'gate') {
        const waiting = w.agents.filter(a => a.state === 'atGate' || a.state === 'toGate').length;
        extra.push(['gate', t('panels.gateWait', { n: waiting })]);
        extra.push(['coin', t('panels.bounty', { n: coins(releaseBounty(starsOf(w.ruf)) * gateBountyMult(r.level)) })]);
        typeHint = t('panels.gateHint');
      } else if (r.type === 'dock') {
        extra.push(['crate', t('panels.cart', { load: Math.floor(w.cart.load), cap: cartCapacity(w), state: t(`panels.cart.${w.cart.state}`) })]);
        const waiting = roomsOf(w, 'workshop').reduce((s, x) => s + Math.floor(x.stack), 0);
        extra.push(['yarn', t('panels.stack', { n: waiting })]);
      } else if (r.type === 'workshop') {
        extra.push(['crate', t('panels.stack', { n: Math.floor(r.stack) })]);
      } else if (r.type === 'office') {
        const staff = staffOf(w);
        extra.push(['staff', t('panels.office', { n: staff.length, wage: coins(staff.reduce((s, a) => s + wageOf(a), 0)) })]);
        typeHint = t('panels.officeHint');
      }
      if (walled && r.type !== 'guard' && w.tutorial.done) extra.push(['shower', t('panels.clean', { n: Math.round(r.clean) })]);
    }
    rExtra.forEach((x, i) => {
      const e = extra[i]; show(x.el, !!e);
      if (e) { setIcon(x.ic, e[0]); text(x.txt, e[1]); }
    });
    show(rTypeHint, !!typeHint); if (typeHint) text(rTypeHint, typeHint);

    // staff + hire
    show(rStaff, !!role && built);
    if (role && built) {
      setIcon(rStaffIc, ROLE_ICON[role]);
      const n = ROAMING.has(role) ? staffOf(w, role).length : staffIn(w, r, role).length;
      text(rStaffTxt, n === 0 ? t('panels.staffNone', { role: roleName(role) }) : ROAMING.has(role) ? t('panels.staffRoam', { n, role: roleName(role) }) : t('panels.staffCount', { n, role: roleName(role) }));
      cls(rStaffTxt, 'bad', n === 0 && (r.type === 'canteen' || r.type === 'classroom' || r.type === 'guard'));   // rooms that close without staff
      text(rHireLbl, t('panel.hire'));
      text(rHireNum, coins(hireFee(role)));
      cls(rHire, 'poor', w.coins < hireFee(role));
      attr(rHire, 'aria-label', `${t('panels.hireTitle', { role: roleName(role) })} – ${coins(hireFee(role))}`);
    }

    // upgrades
    const canUp = hasUp && built && r.level < UPGRADE.maxLevel;
    show(rUp, canUp);
    show(rMaxLvl, hasUp && built && r.level >= UPGRADE.maxLevel);
    if (r.level >= UPGRADE.maxLevel) text(rMaxLvlTxt, t('panels.maxLevel'));
    if (canUp) {
      text(rUpPrev, t('panels.next', { txt: previewOf(r, 1) }));
      for (const u of upBtns) {
        const n = upN(r, u.kind, st);
        const cost = upCostOf(u.kind, st);
        const lbl = u.kind === 0 ? (n > 0 ? t('panels.maxN', { n }) : t('panels.max')) : u.kind === 10 && n < 10 ? `×${n}` : `×${u.kind}`;
        text(u.lbl, lbl);
        text(u.num, coins(cost));
        cls(u.b, 'poor', w.coins < cost || n <= 0);
        show(u.b, !(u.kind === 10 && n <= 1));
        attr(u.b, 'aria-label', `${t('panels.upTitle', { mult: u.kind === 0 ? t('panels.max') : `×${u.kind}` })} – ${coins(cost)}`);
      }
    }
    const mile = st.nextMilestone;
    show(rMile, hasUp && built && mile !== null);
    if (mile !== null) text(rMileTxt, t(r.type === 'bunk' || r.type === 'gate' ? 'panels.milestoneLook' : 'panels.milestone', { n: mile, rep: RUF.milestone }));

    // demolish + resize
    show(rFoot, walled);
    if (walled) {
      const last = lastOfType(r);
      const confirming = !last && confirmAt >= 0;
      show(rDemo, !last && !confirming);
      show(rConfirm, confirming);
      show(rLast, last);
      text(rDemoLbl, t('panels.demolish'));
      attr(rDemo, 'aria-label', `${t('panels.demolish')} – ${t('panels.demolishTip', { n: coins(refundOf(r)) })}`);
      if (confirming && changed(rConfirm, 'scrolled', String(confirmAt))) requestAnimationFrame(() => {
        const b = body.getBoundingClientRect(), c = rConfirm.getBoundingClientRect();
        if (c.bottom > b.bottom) body.scrollTop += c.bottom - b.bottom + 6;   // keep the confirm buttons in view (small sheets)
      });
      if (confirming) {
        text(rConfirmTxt, t('panels.confirm', { n: coins(refundOf(r)) }));
        text(rYesLbl, t('panels.yes')); attr(rYes, 'aria-label', t('panels.yesTip', { room: roomName(r), n: coins(refundOf(r)) }));
        text(rNoLbl, t('panels.no')); attr(rNo, 'aria-label', t('panels.noTip'));
      }
      if (last) text(rLastTxt, t('panels.lastOfType', { room: roomName(r) }));
    }
    show(rResize, walled && built);
    if (walled) text(rResize, t('panels.resizeHint'));
  }

  // ------------------------------------------------------------------ render: rascal
  function activityOf(a: Agent): string {
    const room = a.act?.roomId ? roomById(w, a.act.roomId) : undefined;
    const where = room ? roomName(room) : '';
    const doing = a.act ? t(`panels.do.${a.act.kind}`) : '';
    switch (a.state) {
      case 'using': return a.act ? (where && a.act.kind !== 'sleep' ? `${doing} · ${where}` : doing) : t('panels.st.idle');
      case 'queued': return t('panels.queued', { room: where || doing });
      case 'walking': return a.act && a.act.kind !== 'hang' ? t('panels.go', { room: where || doing }) : t('panels.do.hang');
      default: return t(`panels.st.${a.state}`);
    }
  }
  function renderRascal(a: Agent) {
    setIcon(headIc, 'clipboard');
    text(title, a.name);
    const vip = (a.flags & AF.vip) !== 0;
    text(sub, local(SPECIES_NAME[a.species]) + (vip ? ` · ${t('panels.vip')}` : ''));
    show(sub, true);
    attr(root, 'aria-label', a.name);

    text(fileNo, t('file.case', { n: a.caseNo }));
    text(fileOffLbl, t('file.offence'));
    text(fileOff, local(OFFENCES[a.crime % OFFENCES.length]));
    text(fileNote, t('panels.note', { adj: local(ADJECTIVES[(a.crime * 5 + a.caseNo) % ADJECTIVES.length]) }));
    text(fileSent, t('file.sentence', { n: Math.round(a.sentence) }));

    text(aActTxt, activityOf(a));
    traitEls.forEach((el, i) => { const tr = a.traits[i]; show(el, !!tr); if (tr) text(el, t(`trait.${tr}`)); });
    show(aTraits, a.traits.length > 0);

    for (const k of NEEDS) {
      const v = Math.round(a.needs[k]); const row = needRows[k];
      text(row.lbl, t(`need.${k}`)); text(row.n, String(v)); bar(row.fill, v / 100);
      cls(row.row, 'low', v < 35); cls(row.row, 'alarm', v < 15);
      attr(row.row, 'aria-label', `${t(`need.${k}`)} ${v}`); attr(row.row, 'aria-valuenow', String(v));
    }
    const ref = a.sentence > 0 ? Math.min(100, Math.floor((a.reform / a.sentence) * 100)) : 0;
    const rr = needRows.reform;
    text(rr.lbl, t('need.reform')); text(rr.n, `${ref} %`); bar(rr.fill, ref / 100);
    attr(rr.row, 'aria-label', `${t('need.reform')} ${ref} %`); attr(rr.row, 'aria-valuenow', String(ref));

    const gone = a.state === 'leaving' || (a.flags & AF.gone) !== 0;
    if (gone) following = false;
    show(aFollow, !gone);
    text(aFollowLbl, following ? t('panels.unfollow') : t('panel.follow'));
    cls(aFollow, 'on', following);
    attr(aFollow, 'aria-pressed', following ? 'true' : 'false');
    attr(aFollow, 'aria-label', following ? t('panels.unfollow') : t('panel.follow'));
  }

  // ------------------------------------------------------------------ render: staff & others
  function renderStaff(a: Agent) {
    show(sWage, false); show(sUnpaid, false); show(sShow, false);
    if (a.kind === 'cart' || a.kind === 'crew') {
      setIcon(headIc, a.kind === 'cart' ? 'crate' : 'rooms');
      text(title, t(a.kind === 'cart' ? 'panels.cartName' : 'panels.crew'));
      show(sub, false);
      setIcon(sRoomIc, a.kind === 'cart' ? 'crate' : 'rooms');
      text(sRoomTxt, a.kind === 'cart'
        ? t('panels.cart', { load: Math.floor(w.cart.load), cap: cartCapacity(w), state: t(`panels.cart.${w.cart.state}`) })
        : t('panels.crewHint'));
      attr(root, 'aria-label', title.textContent ?? '');
      return;
    }
    const role = a.role as StaffRole;
    setIcon(headIc, ROLE_ICON[role] ?? 'staff');
    text(title, roleName(role));
    text(sub, t('panels.staffSub', { n: a.staffLevel ?? 1 })); show(sub, true);
    attr(root, 'aria-label', roleName(role));
    const r = a.roomId ? roomById(w, a.roomId) : undefined;
    setIcon(sRoomIc, r ? ROOM_ICON[r.type] ?? 'rooms' : 'rooms');
    let where: string;
    if (role === 'janitor') where = r ? t('panels.cleaning', { room: roomName(r) }) : t('panels.hireFx.janitor');
    else if (role === 'guard') where = t('panels.patrol', { n: GUARD_RADIUS });
    else if (role === 'carter') where = t('panels.hireFx.carter');
    else where = r ? t('panels.worksIn', { room: `${roomName(r)} · ${t('panels.lv', { n: r.level })}` }) : t('panels.noRoom');
    text(sRoomTxt, where);
    show(sWage, true); text(sWageTxt, t('panels.wage', { n: coins(wageOf(a)) }));
    const unpaid = w.t < w.unpaidUntilT;
    show(sUnpaid, unpaid); if (unpaid) text(sUnpaidTxt, t('panels.unpaid'));
    const canShow = !!r && role !== 'guard';
    show(sShow, canShow);
    if (canShow) { text(sShowLbl, t('panels.showRoom')); attr(sShow, 'aria-label', t('panels.showRoomTip', { room: roomName(r) })); }
  }

  // ------------------------------------------------------------------ layout (desktop card / compact sheet)
  function place() {
    const tops = [...ctx.root.querySelectorAll<HTMLElement>('[data-hud="top"]')].map(e => e.getBoundingClientRect()).filter(b => b.height > 0);
    const bots = [...ctx.root.querySelectorAll<HTMLElement>('[data-hud="bottom"]')].map(e => e.getBoundingClientRect()).filter(b => b.height > 0);
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 14;
    const top = tops.length ? Math.max(...tops.map(b => b.bottom)) : 3 * rem;
    const bottom = bots.length ? window.innerHeight - Math.min(...bots.map(b => b.top)) : 4.6 * rem;
    cssVar(root, '--pn-top', `${Math.round(top + 6)}px`);
    cssVar(root, '--pn-bot', `${Math.round(bottom + 6)}px`);
  }

  function render() {
    lastLang = ctx.lang();
    attr(closeBtn, 'aria-label', t('panels.close'));

    let m: Mode = null; let room: Room | undefined; let agent: Agent | undefined;
    if (sel?.kind === 'room') { room = selRoom(); m = room ? 'room' : null; }
    else if (sel?.kind === 'agent') {
      agent = selAgent();
      m = !agent ? null : agent.kind === 'rascal' || agent.kind === 'vip' ? 'rascal' : agent.kind === 'staff' ? 'staff' : 'other';
    }
    if (sel && !m) { ctx.selection.set(null); return; }   // the room was demolished / the rascal went home
    const hideForMenu = ctx.compact.get() && ctx.menu.get() !== null;
    const visible = m !== null && !hideForMenu;
    if (!visible) { show(root, false); shownKey = ''; mode = m; return; }

    cls(root, 'pn--compact', ctx.compact.get());
    show(R, m === 'room'); show(A, m === 'rascal'); show(S, m === 'staff' || m === 'other');
    cls(root, 'pn--rascal', m === 'rascal');
    cls(root, 'pn--small', m === 'staff' || m === 'other');
    if (m === 'room' && room) renderRoom(room);
    else if (m === 'rascal' && agent) renderRascal(agent);
    else if (agent) renderStaff(agent);

    const key = `${sel?.kind}:${sel && 'id' in sel ? sel.id : ''}`;
    if (key !== shownKey) {
      shownKey = key;
      show(root, true);
      // replay the 180 ms fade-in (opacity + transform only)
      root.classList.remove('pn--in'); void root.offsetWidth; root.classList.add('pn--in');
      body.scrollTop = 0;
    }
    mode = m;
  }

  return {
    update(dt: number) {
      now += dt; acc += dt; posAcc += dt;
      if (confirmAt >= 0 && now - confirmAt > CONFIRM_S) { confirmAt = -1; dirty = true; }
      // follow: keep the camera on the rascal every frame (not a DOM write)
      if (following && mode === 'rascal') {
        const a = selAgent();
        if (!a || a.state === 'leaving' || (a.flags & AF.gone) || panSeen !== followFrom) { following = false; dirty = true; }
        else ctx.focusTile(a.x, a.y);
      }
      if (ctx.lang() !== lastLang) dirty = true;      // language switch → every text is re-rendered below
      if (acc < TICK_S) return;                         // ≤ 10 DOM passes per second
      if (!dirty && !sel) return;                       // hidden and nothing changed
      if (posAcc >= POS_S && sel) { posAcc = 0; place(); }
      acc = 0; dirty = false;
      render();
    },
    destroy() { for (const u of unsubs) u(); root.remove(); },
  };
}
