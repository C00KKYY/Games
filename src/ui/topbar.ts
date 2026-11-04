/**
 * Top bar (docs/UI_DESIGN.md §3): coins (rolling counter), reputation stars + progress, clock, speed, Flow Bar with
 * bottleneck finder, mood, settings + help. One row, data-hud="top".
 * Space management: when the row does not fit, it collapses step by step (see LEVELS) – measured, not guessed.
 */
import './topbar.css';
import type { UICtx, Component, TipContent } from './ctx';
import type { Key } from '../i18n/i18n';
import { STARS, TIME, type RoomType } from '../content/balance';
import { starsOf, roomsOf } from '../sim/world';
import { dayOf, hourOf, isNight } from '../sim/time';
import { rascals, isResident } from '../sim/agents';
import { flow, type Stage, type StageInfo } from '../sim/flow';

const STAGE_ICON: Record<Stage, string> = { ferry: 'ferry', beds: 'bed', meals: 'meal', showers: 'shower', workshop: 'yarn', class: 'book', gate: 'gate', cart: 'crate' };
/** collapse levels, cumulative: 1 bottleneck label, 2 flow numbers + arrows, 3 mood label, 4 day label, 5 squeeze paddings, 6 flow as one button + list */
const MAX_LEVEL = 6;
const COMPACT_MIN_LEVEL = 2;

type Speed = 0 | 1 | 2 | 3;

export function mountTopbar(ctx: UICtx): Component {
  const { t } = ctx;
  // ------------------------------------------------------------------ memoised DOM writes
  const memo = new WeakMap<Element, Map<string, string>>();
  const put = (el: Element, k: string, v: string) => {
    let m = memo.get(el); if (!m) { m = new Map(); memo.set(el, m); }
    if (m.get(k) === v) return false;
    m.set(k, v);
    if (k === 'text') el.textContent = v;
    else if (k.startsWith('.')) el.classList.toggle(k.slice(1), v === '1');
    else if (k.startsWith('~')) (el as HTMLElement).style.setProperty(k.slice(1), v);
    else el.setAttribute(k, v);
    return true;
  };
  const text = (el: Element, v: string) => put(el, 'text', v);
  const cls = (el: Element, c: string, on: boolean) => put(el, '.' + c, on ? '1' : '0');
  const attr = (el: Element, a: string, v: string) => put(el, a, v);
  const style = (el: Element, p: string, v: string) => put(el, '~' + p, v);

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
  /** capacity numbers: one decimal below 10 (localised), K-format above */
  const cap = (n: number) => (n >= 10 || Number.isInteger(n) ? ctx.fmt(n) : (Math.round(n * 10) / 10).toFixed(1).replace('.', ctx.lang() === 'de' ? ',' : '.'));

  // ------------------------------------------------------------------ skeleton
  const bar = h('div', 'topbar tb');
  bar.dataset.hud = 'top';
  if (ctx.touch) bar.classList.add('touch');

  const coins = h('div', 'pill coins', bar);
  img(ctx.icon('coin'), coins);
  const coinsNum = h('span', 'num', coins);

  const stars = h('div', 'pill stars', bar);
  const starImgs = [0, 1, 2, 3, 4].map(() => img(ctx.icon('starEmpty'), stars, 'star'));
  const starBar = h('div', 'bar', stars);
  const starFill = h('i', '', starBar);

  const clock = h('div', 'pill clock', bar);
  const sun = img(ctx.icon('sun'), clock);
  const dayLbl = h('span', 'day', clock);
  const timeNum = h('span', 'num', clock);

  const speed = h('div', 'pill speed', bar);
  speed.setAttribute('role', 'group');
  const speedBtns: HTMLButtonElement[] = [];
  const SPEED_ICON = ['pause', 'play', 'fast', 'fast'];
  const lockImg = document.createElement('img'); lockImg.className = 'lock'; lockImg.src = ctx.icon('lock'); lockImg.alt = '';
  for (const s of [0, 1, 2, 3] as Speed[]) {
    const b = button('spd', speed, () => setSpeed(s));
    img(ctx.icon(SPEED_ICON[s]), b, 'ic');
    if (s >= 2) { const n = h('span', 'x num', b); n.textContent = String(s); }
    if (s === 3) b.appendChild(lockImg);
    speedBtns.push(b);
  }

  const flowPill = h('div', 'pill flow', bar);
  const stagesEl = h('div', 'stages', flowPill);
  const sumBtn = button('sum', flowPill, () => toggleList());
  const bnBtn = button('bn', flowPill, () => findBottleneck());
  img(ctx.icon('find'), bnBtn, 'ic');
  const bnLbl = h('span', 'lbl', bnBtn);

  const mood = h('div', 'pill mood', bar);
  img(ctx.icon('mood'), mood);
  const moodLbl = h('span', 'lbl', mood);
  const moodNum = h('span', 'num', mood);

  const gear = button('iconbtn gear', bar, () => ctx.openModal('settings'));
  img(ctx.icon('gear'), gear);
  const help = button('iconbtn help', bar, () => ctx.openModal('help'));
  img(ctx.icon('help'), help);

  // expanded stage list (collapse level 6)
  const list = h('div', 'tb-list');
  list.setAttribute('data-overlay', '');
  list.hidden = true;
  const listHead = h('div', 'head', list);
  const listTitle = h('span', 'ttl', listHead);
  const listClose = button('x', listHead, () => closeList());
  img(ctx.icon('close'), listClose);
  const listRows = h('div', 'rows', list);

  ctx.root.appendChild(bar);
  ctx.root.appendChild(list);

  // ------------------------------------------------------------------ state
  let f = flow(ctx.w);
  let flowAge = 0;
  let stageKey = '';
  type StageEl = { info: StageInfo; btn: HTMLButtonElement; num: HTMLElement; row: HTMLButtonElement; rowNum: HTMLElement; rowName: HTMLElement; sumIc: HTMLImageElement };
  let stageEls: StageEl[] = [];
  let level = -1;
  let fitKey = '';
  let lastLang = '';
  let shown = Math.round(ctx.w.coins), from = shown, to = shown, tw = 1;
  let acc = 1;
  let lastPop = 0;

  // ------------------------------------------------------------------ derived values
  const repInfo = () => {
    const ruf = Math.floor(ctx.w.ruf), s = starsOf(ctx.w.ruf);
    const prev = s > 0 ? STARS[s - 1] : 0, next = s < STARS.length ? STARS[s] : null;
    return { ruf, s, prev, next, frac: next === null ? 1 : Math.max(0, Math.min(1, (ctx.w.ruf - prev) / (next - prev))) };
  };
  const clockInfo = () => {
    const hr = hourOf(ctx.w.t), hh = Math.floor(hr), mm = Math.floor((hr - hh) * 6) * 10;
    return { day: dayOf(ctx.w.t) + 1, time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, night: isNight(ctx.w.t) };
  };
  const moodInfo = () => {
    let sum = 0, n = 0;
    for (const a of rascals(ctx.w)) if (isResident(a)) { sum += a.mood; n++; }
    const v = n ? Math.round(sum / n) : null;
    const state: 'good' | 'ok' | 'low' | 'none' = v === null ? 'none' : v >= 60 ? 'good' : v >= 35 ? 'ok' : 'low';
    return { v, n, state };
  };
  const pct = (v: number | null) => (v === null ? '–' : t('topbar.pct', { n: v }));
  const speedOn = (): Speed => (ctx.paused() || ctx.w.speed === 0 ? 0 : (Math.min(3, Math.max(1, ctx.w.speed)) as Speed));
  const stageName = (s: Stage) => t(`topbar.st.${s}` as Key);
  const roomName = (r: RoomType | null) => (r ? t(`room.${r}` as Key) : '');
  const isBn = (s: Stage) => f.bottleneck === s;

  // ------------------------------------------------------------------ actions
  function setSpeed(s: Speed) {
    if (s === 0) { ctx.setPaused(true); render(); return; }
    if (s === 3 && !ctx.w.unlocked.speed3) { ctx.feedback(ctx.cmd.setSpeed(ctx.w, 3), t('topbar.lock3')); return; }
    ctx.setPaused(false);
    ctx.feedback(ctx.cmd.setSpeed(ctx.w, s));
    render();
  }
  function goStage(info: StageInfo) {
    closeList();
    const rooms = info.roomType ? roomsOf(ctx.w, info.roomType) : [];
    const r = rooms.find(x => x.built) ?? rooms[0];
    if (!r) {
      ctx.toast(t('topbar.stNone', { room: roomName(info.roomType) }), { icon: STAGE_ICON[info.stage], kind: 'info' });
      ctx.menu.set('rooms');
      return;
    }
    ctx.focusTile(r.x + r.w / 2, r.y + r.h / 2);
    ctx.selection.set({ kind: 'room', id: r.id });
  }
  function findBottleneck() {
    f = flow(ctx.w); flowAge = 0;
    const info = f.stages.find(s => s.stage === f.bottleneck);
    if (!info) { ctx.toast(t('topbar.bnNone'), { kind: 'good', icon: 'check' }); return; }
    const line = info.stage === 'beds'
      ? t('topbar.bnBeds', { cap: cap(info.capacity), demand: cap(info.demand) })
      : t('topbar.bnToast', { name: stageName(info.stage), cap: cap(info.capacity), demand: cap(info.demand) });
    ctx.toast(`${line} ${t(`topbar.fix.${info.stage}` as Key)}`, { icon: STAGE_ICON[info.stage], kind: 'bad', ms: 4200 });
    goStage(info);
  }
  function toggleList() { if (list.hidden) openList(); else closeList(); }
  function openList() {
    list.hidden = false;
    const r = flowPill.getBoundingClientRect(), br = bar.getBoundingClientRect();
    const wpx = Math.min(window.innerWidth - 16, list.offsetWidth || 260);
    const left = Math.max(8, Math.min(window.innerWidth - 8 - wpx, r.left + r.width / 2 - wpx / 2));
    list.style.left = `${Math.round(left)}px`;
    list.style.top = `${Math.round(br.bottom + 6)}px`;
    attr(sumBtn, 'aria-expanded', 'true');
    render();
  }
  function closeList() { if (list.hidden) return; list.hidden = true; attr(sumBtn, 'aria-expanded', 'false'); }
  const outside = (e: PointerEvent) => { if (!list.hidden && !list.contains(e.target as Node) && !sumBtn.contains(e.target as Node)) closeList(); };
  document.addEventListener('pointerdown', outside, true);
  // Esc closes only the top-most thing. The stage list is first (capture phase, mounted before the clipboard);
  // preventDefault() marks the press as used, so the clipboard (capture) and tools.ts (menu / tool / selection) leave
  // it alone. While a modal is open, modals.ts stops the event before it gets here.
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented || list.hidden) return;
    e.preventDefault();
    closeList();
  };
  window.addEventListener('keydown', onKey, true);
  const unsubs: (() => void)[] = [
    ctx.panned.on(() => closeList()),
    ctx.compact.on(() => { fitKey = ''; }),
    ctx.onEvent(e => {
      if (e.type === 'star') pop(stars);
      if (e.type === 'unlock') { flowAge = 9; fitKey = ''; }
    }),
  ];
  const onResize = () => { fitKey = ''; if (!list.hidden) closeList(); };
  window.addEventListener('resize', onResize);
  document.fonts?.ready.then(() => { fitKey = ''; });

  function pop(el: HTMLElement) {
    const now = performance.now(); if (now - lastPop < 400) return; lastPop = now;
    el.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
  }

  // ------------------------------------------------------------------ tooltips (lazy: always current language/values)
  tip(coins, () => ({ title: `${t('hud.coins')}: ${ctx.fmt(ctx.w.coins)}`, body: t('topbar.coinsBody') }));
  tip(stars, () => {
    const r = repInfo();
    return r.next === null
      ? { title: t('topbar.repTitleMax', { n: ctx.fmt(r.ruf) }), body: t('topbar.repMax') }
      : { title: t('topbar.repTitle', { n: ctx.fmt(r.ruf), next: ctx.fmt(r.next) }), body: t('topbar.repBody', { s: r.s, left: ctx.fmt(Math.max(1, Math.ceil(r.next - ctx.w.ruf))) }) };
  });
  tip(clock, () => { const c = clockInfo(); return { title: t('topbar.clockTitle', { d: c.day, time: c.time }), body: t('topbar.clockBody', { day: TIME.dayHourSec.toLocaleString(ctx.lang()), night: TIME.nightHourSec.toLocaleString(ctx.lang()) }) }; });
  const SPEED_KEY = ['P', '1', '2', '3'];
  speedBtns.forEach((b, s) => tip(b, () => {
    const locked = s === 3 && !ctx.w.unlocked.speed3;
    const body = t(`topbar.speed${s}Body` as Key);
    return { title: t(`topbar.speed${s}` as Key), body: locked ? `${t('topbar.lock3')}. ${body}` : body, hotkey: SPEED_KEY[s] };
  }));
  const stageTip = (el: StageEl) => () => {
    const i = el.info, live = f.stages.find(s => s.stage === i.stage) ?? i;
    const nums = i.stage === 'beds'
      ? t('topbar.bedsBody', { cap: cap(live.capacity), demand: cap(live.demand) })
      : t('topbar.stBody', { cap: cap(live.capacity), demand: cap(live.demand) });
    const state = isBn(i.stage) ? t('topbar.stBad') : live.ratio < 1 ? t('topbar.stTight') : t('topbar.stOk');
    const jump = i.roomType ? t('topbar.stJump', { room: roomName(i.roomType) }) : '';
    return { title: stageName(i.stage), body: `${nums}\n${state} ${jump}`.trim() };
  };
  tip(sumBtn, () => ({ title: t('hud.flow'), body: `${f.stages.filter(s => s.unlocked).map(s => `${stageName(s.stage)} ${cap(s.capacity)}`).join(' · ')}\n${t('topbar.listBody')}` }));
  tip(bnBtn, () => ({ title: t('hud.bottleneck'), body: f.bottleneck ? t('topbar.bnBody', { name: stageName(f.bottleneck) }) : t('topbar.bnNone') }));
  tip(mood, () => {
    const m = moodInfo();
    return m.v === null ? { title: t('hud.mood'), body: t('topbar.moodNone') } : { title: `${t('hud.mood')} ${pct(m.v)} – ${t(`topbar.mood.${m.state}` as Key)}`, body: t('topbar.moodBody', { n: m.n }) };
  });
  tip(gear, () => ({ title: t('hud.settings'), body: t('topbar.settingsBody') }));
  tip(help, () => ({ title: t('topbar.help'), body: t('topbar.helpBody'), hotkey: 'H' }));
  tip(listClose, () => ({ title: t('topbar.close'), body: t('topbar.closeBody'), hotkey: 'Esc' }));

  // ------------------------------------------------------------------ flow stages DOM (rebuilt only when the stage set changes)
  function buildStages() {
    stagesEl.textContent = ''; listRows.textContent = ''; sumBtn.textContent = '';
    stageEls = [];
    const vis = f.stages.filter(s => s.unlocked);
    vis.forEach((info, k) => {
      if (k) h('span', 'arrow', stagesEl);
      const btn = button('st', stagesEl, () => goStage(info));
      img(ctx.icon(STAGE_ICON[info.stage]), btn, 'ic');
      const num = h('span', 'num', btn);
      const row = button('row', listRows, () => goStage(info));
      img(ctx.icon(STAGE_ICON[info.stage]), row, 'ic');
      const rowName = h('span', 'name', row);
      const rowNum = h('span', 'num', row);
      const sumIc = img(ctx.icon(STAGE_ICON[info.stage]), sumBtn, 'ic');
      const el: StageEl = { info, btn, num, row, rowNum, rowName, sumIc };
      tip(btn, stageTip(el)); tip(row, stageTip(el));
      stageEls.push(el);
    });
  }

  // ------------------------------------------------------------------ fit (progressive collapse)
  const overflows = () => bar.scrollWidth > bar.clientWidth || flowPill.scrollWidth > flowPill.clientWidth;
  function fit() {
    const min = ctx.compact.get() ? COMPACT_MIN_LEVEL : 0;
    let lv = min;
    for (; lv <= MAX_LEVEL; lv++) {
      for (let i = 1; i <= MAX_LEVEL; i++) bar.classList.toggle(`lv${i}`, lv >= i);
      if (lv === MAX_LEVEL || !overflows()) break;
    }
    if (lv < MAX_LEVEL) closeList();
    level = lv;
  }

  // ------------------------------------------------------------------ render (≤ 10×/s, memoised)
  function render() {
    const w = ctx.w;
    const lang = ctx.lang();
    if (lang !== lastLang) { lastLang = lang; fitKey = ''; }

    // coins
    const coinStr = ctx.fmt(Math.round(shown));
    text(coinsNum, coinStr);
    attr(coins, 'aria-label', `${t('hud.coins')}: ${ctx.fmt(w.coins)}`);

    // reputation
    const r = repInfo();
    starImgs.forEach((im, i) => { attr(im, 'src', ctx.icon(i < r.s ? 'star' : 'starEmpty')); cls(im, 'got', i < r.s); });
    style(starFill, 'transform', `scaleX(${r.frac.toFixed(3)})`);
    attr(stars, 'aria-label', r.next === null ? t('topbar.repTitleMax', { n: r.ruf }) : t('topbar.repTitle', { n: r.ruf, next: r.next }));

    // clock
    const c = clockInfo();
    attr(sun, 'src', ctx.icon(c.night ? 'moon' : 'sun'));
    cls(clock, 'night', c.night);
    const dayStr = t('hud.day', { n: c.day });
    text(dayLbl, dayStr);
    text(timeNum, c.time);
    attr(clock, 'aria-label', t('topbar.clockTitle', { d: c.day, time: c.time }));

    // speed
    const on = speedOn(), locked = !w.unlocked.speed3;
    speedBtns.forEach((b, s) => {
      cls(b, 'on', s === on);
      attr(b, 'aria-pressed', s === on ? 'true' : 'false');
      attr(b, 'aria-label', s === 3 && locked ? `${t('topbar.speed3')} – ${t('topbar.lock3')}` : `${t(`topbar.speed${s}` as Key)} (${SPEED_KEY[s]})`);
    });
    cls(speedBtns[3], 'locked', locked);
    attr(speed, 'aria-label', t('topbar.speed'));

    // flow
    const key = f.stages.filter(s => s.unlocked).map(s => s.stage).join(',');
    if (key !== stageKey) { stageKey = key; buildStages(); fitKey = ''; }
    for (const el of stageEls) {
      const live = f.stages.find(s => s.stage === el.info.stage) ?? el.info;
      const bad = isBn(el.info.stage), tight = !bad && live.ratio < 1;
      const n = cap(live.capacity);
      text(el.num, n);
      text(el.rowNum, el.info.stage === 'beds' ? t('topbar.rowBeds', { cap: n, demand: cap(live.demand) }) : t('topbar.row', { cap: n, demand: cap(live.demand) }));
      text(el.rowName, stageName(el.info.stage));
      for (const e of [el.btn, el.row]) { cls(e, 'bad', bad); cls(e, 'tight', tight); }
      cls(el.sumIc, 'bad', bad);
      const label = `${stageName(el.info.stage)}: ${n}${bad ? ` – ${t('topbar.bnShort')}` : ''}`;
      attr(el.btn, 'aria-label', label); attr(el.row, 'aria-label', label);
    }
    attr(flowPill, 'aria-label', t('hud.flow'));
    attr(sumBtn, 'aria-label', `${t('hud.flow')}: ${t('topbar.listBody')}`);
    cls(sumBtn, 'bad', !!f.bottleneck);
    text(bnLbl, t('hud.bottleneck'));
    attr(bnBtn, 'aria-label', t('hud.bottleneck'));
    cls(bnBtn, 'alert', !!f.bottleneck);
    text(listTitle, t('hud.flow'));
    attr(listClose, 'aria-label', t('topbar.close'));

    // mood
    const m = moodInfo();
    text(moodLbl, t('hud.mood'));
    const moodStr = pct(m.v);
    text(moodNum, moodStr);
    for (const s of ['good', 'ok', 'low', 'none']) cls(mood, s, m.state === s);
    attr(mood, 'aria-label', m.v === null ? `${t('hud.mood')}: –` : `${t('hud.mood')} ${moodStr} – ${t(`topbar.mood.${m.state}` as Key)}`);

    attr(gear, 'aria-label', t('hud.settings'));
    attr(help, 'aria-label', `${t('topbar.help')} (H)`);

    // re-fit when anything that changes widths changed
    const k = `${window.innerWidth}|${lang}|${ctx.compact.get()}|${stageKey}|${coinStr.length}|${dayStr.length}|${moodStr.length}`;
    if (k !== fitKey) { fitKey = k; fit(); }
  }

  render();

  return {
    update(dt: number) {
      // rolling counter: ease from the shown value to the target in 0.4 s
      const target = Math.round(ctx.w.coins);
      if (target !== to) { if (target > to + 0.5 && level >= 0) pop(coins); from = shown; to = target; tw = 0; }
      if (tw < 1) { tw = Math.min(1, tw + dt / 0.4); const e = 1 - Math.pow(1 - tw, 3); shown = from + (to - from) * e; }
      flowAge += dt;
      acc += dt;
      if (acc < 0.1) return;
      acc = 0;
      if (flowAge >= 0.25) { flowAge = 0; f = flow(ctx.w); }
      render();
    },
    destroy() {
      for (const u of unsubs) u();
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
      bar.remove(); list.remove();
    },
  };
}
