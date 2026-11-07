/**
 * Warden's Clipboard (Brief §3.16, D1, D4; docs/UI_DESIGN.md §3).
 * Permanent goal widget top-left under the topbar. Shows the tutorial step while the tutorial runs, otherwise the
 * current objective with progress, reward, mandatory marker, "Show me" and an expandable list of all goals.
 * Compact (≤ 900 px): a chip ≤ 200×40 that expands the full card as an overlay.
 */
import './clipboard.css';
import { ROOM_ICON, type UICtx, type Component } from './ctx';
import type { Key } from '../i18n/i18n';
import type { World, Room } from '../sim/types';
import { OBJECTIVES, TUTORIAL_STEPS, objectiveReward, currentGoal, type ObjectiveDef } from '../sim/objectives';
import type { FollowupId } from '../content/progress';
import { M5_ICON } from './m5icons';
import { roomsOf } from '../sim/world';
import { RUF, PARCELS, type RoomType } from '../content/balance';
import { GATE_X, GATE_Y, FERRY_POS, TUTORIAL_WASH } from '../content/site1';
import { buildGoal, savingsEta, missingStaff } from './guide';
import { hireFee } from '../sim/staff';

/** room type an objective is about (camera target + icon) */
const OBJ_ROOM: Record<string, RoomType> = {
  wash: 'wash', workshop: 'workshop', classroom: 'classroom', guard: 'guard', beds12: 'bunk', yard: 'yard',
  canteen5: 'canteen', beds24: 'bunk', workshop15: 'workshop',
};
const OBJ_ICON: Record<string, string> = { catch3: 'staff', release20: 'gate' };
const TUT_ICON: Record<string, string> = { horn: 'ferry', wash: 'shower', stamp: 'gate', upgrade: 'meal' };
/** M5 follow-ups after the 10 clipboard goals (Brief §3.16 "always a current objective", objectives.ts currentGoal) */
const FOLLOW_ICON: Record<FollowupId, string> = { callInspection: M5_ICON.inspect, stars2: 'star', stars3: 'star', transfer: M5_ICON.transfer };
const objIcon = (id: string) => OBJ_ICON[id] ?? ROOM_ICON[OBJ_ROOM[id]] ?? 'clipboard';
const TICK_MS = 100;
const NEW_MS = 6000;

interface Target { x: number; y: number; place: string }
type Mode = 'tut' | 'obj' | 'done';

export function mountClipboard(ctx: UICtx): Component {
  const w: World = ctx.w;
  const t = (k: Key, v?: Record<string, string | number>) => ctx.t(k, v);
  /** action wording first (G2: "Build beds: 12 in total" says how), then the base table, then the clipboard part */
  const objText = (id: string) => { for (const k of [`clipboard.goal.${id}`, `obj.${id}`, `clipboard.obj.${id}`]) { const s = t(k); if (s !== k) return s; } return id; };
  /** why this goal matters (G2: goals said WHAT but never WHY) */
  const whyText = (id: string) => { const k = `clipboard.why.${id}`; const s = t(k); return s === k ? '' : s; };
  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ------------------------------------------------------------------ DOM (built once)
  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] => {
    const el = document.createElement(tag); el.className = cls; parent?.appendChild(el); return el;
  };
  const img = (name: string, cls: string, parent: HTMLElement) => { const i = h('img', cls, parent); i.src = ctx.icon(name); i.alt = ''; i.draggable = false; return i; };

  const root = h('div', 'cb');
  if (ctx.touch) root.classList.add('cb--touch');

  // compact chip (permanent in compact mode)
  const chip = h('button', 'cb-chip', root);
  chip.type = 'button';
  img('clipboard', 'cb-chip-ic', chip);
  const chipTxt = h('span', 'cb-chip-txt', chip);
  const chipNum = h('span', 'cb-chip-num num', chip);
  const chipFlash = h('span', 'cb-chip-flash', chip);
  // saving up for the goal room: a small coin ring around the chip icon (compact)
  const chipSave = h('span', 'cb-chip-save', chip);
  chipSave.setAttribute('aria-hidden', 'true');

  // full card (permanent on desktop, overlay when expanded from the chip)
  const card = h('section', 'cb-card', root);
  const stamp = h('span', 'cb-stamp', card);
  const cardX = h('button', 'cb-x cb-card-x', card); cardX.type = 'button';
  img('close', '', cardX);
  const head = h('h3', 'cb-h', card);
  img('clipboard', 'cb-h-ic', head);
  const headTxt = h('span', '', head);
  // the core loop in one line, until the player has seen it work three times (G2: "you don't know what to do")
  const loop = h('div', 'cb-loop', card);
  const loopTxt = h('span', '', loop);
  const goal = h('div', 'cb-goal', card);
  const goalIc = img('clipboard', 'cb-goal-ic', goal);
  const goalTxt = h('span', 'cb-goal-txt', goal);
  const why = h('p', 'cb-why', card);
  const req = h('span', 'cb-req', card);
  const prog = h('div', 'cb-prog', card);
  const bar = h('div', 'cb-bar', prog);
  const barFill = h('i', '', bar);
  const progNum = h('span', 'cb-prog-num num', prog);
  // saving up for the goal room (separate from the goal progress: the D4 probe reads .cb-prog-num as "n/m")
  const save = h('div', 'cb-save', card);
  img('coin', 'cb-rew-ic', save);
  const saveBar = h('div', 'cb-bar cb-savebar', save);
  const saveFill = h('i', '', saveBar);
  const saveTxt = h('span', 'cb-save-txt num', save);
  const rew = h('div', 'cb-rew', card);
  img('coin', 'cb-rew-ic', rew);
  const rewTxt = h('span', '', rew);
  const row = h('div', 'cb-row', card);
  const buildBtn = h('button', 'cb-btn cb-build', row); buildBtn.type = 'button';
  img('rooms', 'cb-btn-ic', buildBtn);
  const buildTxt = h('span', '', buildBtn);
  const showBtn = h('button', 'cb-btn cb-show', row); showBtn.type = 'button';
  const showTxt = h('span', '', showBtn);
  const moreBtn = h('button', 'cb-btn cb-more', row); moreBtn.type = 'button';
  img('clipboard', 'cb-btn-ic', moreBtn);
  const moreTxt = h('span', '', moreBtn);
  const skipBtn = h('button', 'cb-btn cb-skip', row); skipBtn.type = 'button';
  const skipTxt = h('span', '', skipBtn);

  // list of all goals (overlay)
  const list = h('div', 'cb-list', root);
  list.setAttribute('data-overlay', '');
  list.setAttribute('role', 'dialog');
  const lHead = h('div', 'cb-lhead', list);
  const lTitle = h('h4', 'cb-ltitle', lHead);
  const lReq = h('span', 'cb-lreq', lHead);
  const listX = h('button', 'cb-x', lHead); listX.type = 'button';
  img('close', '', listX);
  const items = h('div', 'cb-items', list);
  interface RowEls { o: ObjectiveDef; k: number; el: HTMLButtonElement; st: HTMLImageElement; no: HTMLSpanElement; txt: HTMLSpanElement; req: HTMLSpanElement; num: HTMLSpanElement; coins: HTMLSpanElement }
  const rows: RowEls[] = OBJECTIVES.map((o, k) => {
    const el = h('button', 'cb-item', items); el.type = 'button';
    const st = img('check', 'cb-item-st', el);
    const no = h('span', 'cb-item-no num', el);
    const main = h('span', 'cb-item-main', el);
    const txt = h('span', 'cb-item-txt', main);
    const meta = h('span', 'cb-item-meta', main);
    const rq = h('span', 'cb-req cb-req-s', meta);
    const num = h('span', 'cb-item-num num', meta);
    const rw = h('span', 'cb-item-rew', meta);
    img('coin', 'cb-mini-ic', rw);
    const coins = h('span', 'num', rw);
    const rs = h('span', 'cb-item-rew', meta);
    img('star', 'cb-mini-ic', rs);
    h('span', 'num', rs).textContent = `+${RUF.objective}`;
    return { o, k, el, st, no, txt, req: rq, num, coins };
  });
  ctx.root.appendChild(root);

  // ------------------------------------------------------------------ memoised DOM writes
  const cache = new Map<object, Record<string, string>>();
  const memo = (el: object, key: string, val: string) => {
    let c = cache.get(el); if (!c) { c = {}; cache.set(el, c); }
    if (c[key] === val) return false; c[key] = val; return true;
  };
  const text = (el: HTMLElement, s: string) => { if (memo(el, 'text', s)) el.textContent = s; };
  const attr = (el: HTMLElement, name: string, v: string | null) => {
    if (!memo(el, `@${name}`, v ?? '\u0000')) return;
    if (v === null) el.removeAttribute(name); else el.setAttribute(name, v);
  };
  const cls = (el: HTMLElement, name: string, on: boolean) => { if (memo(el, `.${name}`, on ? '1' : '0')) el.classList.toggle(name, on); };
  const css = (el: HTMLElement, prop: 'top' | 'transform' | 'maxHeight', v: string) => { if (memo(el, `$${prop}`, v)) el.style[prop] = v; };
  const src = (el: HTMLImageElement, name: string) => { if (memo(el, 'src', name)) el.src = ctx.icon(name); };

  // ------------------------------------------------------------------ state
  let cardOpen = false;   // compact: card expanded as overlay
  let listOpen = false;
  let newUntil = 0;
  let pendingSlide: 'new' | 'step' | null = null;
  let acc = TICK_MS;      // render on the first frame
  let posAcc = 1e9;
  let lastLang = '';
  const now = () => performance.now();

  const visible = (o: ObjectiveDef) => !o.onlyIfSkipped || !!w.director.data.skippedNoWash;
  const visObjs = () => OBJECTIVES.filter(visible);
  const currentIdx = () => {
    const c = w.obj.current;
    const o = OBJECTIVES[c];
    if (o && visible(o) && !w.obj.done[o.id]) return c;
    return OBJECTIVES.findIndex(x => visible(x) && !w.obj.done[x.id]);
  };
  const mode = (): Mode => (w.tutorial.active ? 'tut' : currentIdx() >= 0 ? 'obj' : 'done');
  const progOf = (o: ObjectiveDef) => Math.max(0, Math.min(o.target, Math.floor(o.progress(w))));
  const counts = () => {
    const vs = visObjs();
    const md = vs.filter(o => o.mandatory);
    return { total: vs.length, done: vs.filter(o => w.obj.done[o.id]).length, req: md.length, reqDone: md.filter(o => w.obj.done[o.id]).length };
  };
  /** the follow-up goal once all clipboard goals are done (null while one is open, or in the tutorial) */
  const followup = () => { const g = currentGoal(w); return g && g.kind === 'followup' ? g : null; };
  /** "Show me" on a follow-up opens its screen: the inspection forecast, or the transfer dialog */
  const openFollowup = () => { const g = followup(); if (!g) return; ctx.sound('click'); ctx.panel.set(g.id === 'transfer' ? 'transfer' : 'forecast'); };
  const tutStep = () => Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, w.tutorial.step));
  const rewardText = (k: number) => {
    const base = t('clipboard.reward', { coins: ctx.fmt(objectiveReward(k)), rep: RUF.objective });
    const un = (OBJECTIVES[k]?.unlocks ?? []).map(u => t(`room.${u}`)).filter(x => !x.startsWith('room.'));
    return un.length ? `${base} ${t('clipboard.rewardNew', { room: un.join(', ') })}` : base;
  };
  /** the goal room the player can build right now (the "Build it" shortcut opens its build tool) */
  const buildNow = () => { const g = mode() === 'obj' ? buildGoal(w) : null; return g && g.unlocked && g.affordable && !g.building ? g : null; };
  const saving = () => { const g = mode() === 'obj' ? buildGoal(w) : null; return g && g.unlocked && !g.affordable && !g.building ? g : null; };

  // ------------------------------------------------------------------ camera targets
  const centre = (r: Room) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const bestRoom = (type: RoomType): Room | null => {
    const rs = roomsOf(w, type);
    if (!rs.length) return null;
    return rs.slice().sort((a, b) => (Number(b.built) - Number(a.built)) || (b.level - a.level) || (a.id - b.id))[0];
  };
  const parcel = (): Target => { const p = PARCELS[0]; return { x: p.x + p.w / 2, y: p.y + p.h / 2, place: t('clipboard.place.parcel') }; };
  const roomTarget = (type: RoomType): Target => { const r = bestRoom(type); return r ? { ...centre(r), place: t(`room.${type}`) } : parcel(); };
  const gate = (): Target => ({ x: GATE_X + 1, y: GATE_Y - 0.6, place: t('room.gate') });
  const objTarget = (o: ObjectiveDef): Target => {
    if (o.id === 'release20') return gate();
    if (o.id === 'catch3') {
      if (bestRoom('yard')) return roomTarget('yard');
      const f = w.poi.fenceEscape;
      if (f.length) { const p = f[Math.floor(f.length / 2)]; return { x: p.x + 0.5, y: p.y + 0.5, place: t('clipboard.place.fence') }; }
      return roomTarget('guard');
    }
    const type = OBJ_ROOM[o.id];
    return type ? roomTarget(type) : parcel();
  };
  const tutTarget = (): Target => {
    switch (TUTORIAL_STEPS[tutStep()]) {
      case 'horn': return { x: FERRY_POS.x, y: FERRY_POS.y - 1, place: t('clipboard.place.ferry') };
      case 'wash': { const r = bestRoom('wash'); return r ? { ...centre(r), place: t('room.wash') } : { x: TUTORIAL_WASH.x + TUTORIAL_WASH.w / 2, y: TUTORIAL_WASH.y + TUTORIAL_WASH.h / 2, place: t('room.wash') }; }
      case 'stamp': return gate();
      default: return roomTarget('canteen');
    }
  };
  const curTarget = (): Target | null => {
    const m = mode();
    if (m === 'tut') return tutTarget();
    if (m === 'obj') return objTarget(OBJECTIVES[currentIdx()]);
    return null;
  };
  const fly = (tg: Target | null) => { if (!tg) return; ctx.sound('click'); ctx.focusTile(tg.x, tg.y); };

  // ------------------------------------------------------------------ actions
  const setOpen = (card_: boolean, list_: boolean) => {
    if (card_ === cardOpen && list_ === listOpen) return;
    ctx.sound('click');
    cardOpen = card_; listOpen = list_;
    acc = TICK_MS; place(); render();
  };
  chip.addEventListener('click', () => setOpen(!cardOpen, cardOpen ? false : listOpen));
  cardX.addEventListener('click', () => setOpen(false, false));
  listX.addEventListener('click', () => setOpen(cardOpen, false));
  moreBtn.addEventListener('click', () => {
    setOpen(cardOpen, !listOpen);
    // bring the current goal into view (one-off layout read on a user action)
    const cur = rows.find(r => r.k === currentIdx());
    if (listOpen && cur) items.scrollTop = Math.max(0, cur.el.offsetTop - items.offsetTop - items.clientHeight / 3);
  });
  buildBtn.addEventListener('click', () => {
    const g = buildNow(); if (!g) return;
    ctx.sound('click');
    if (ctx.compact.get()) setOpen(false, false);
    ctx.tool.set({ kind: 'build', type: g.type });
  });
  showBtn.addEventListener('click', () => {
    if (mode() === 'done') { openFollowup(); if (ctx.compact.get()) setOpen(false, false); return; }
    fly(curTarget());
    if (ctx.compact.get()) setOpen(false, false);
  });
  skipBtn.addEventListener('click', () => {
    if (!w.tutorial.active) return;
    const r = ctx.cmd.skipTutorial(w);
    if (!r.ok) { ctx.feedback(r); return; }
    ctx.sound('click');
    acc = TICK_MS; render();
  });
  for (const r of rows) r.el.addEventListener('click', () => {
    fly(objTarget(r.o));
    if (ctx.compact.get()) setOpen(false, false);
  });
  // another tap anywhere else closes the overlays
  const onDown = (e: PointerEvent) => {
    if (!cardOpen && !listOpen) return;
    if (e.target instanceof Node && root.contains(e.target)) return;
    setOpen(false, false);
  };
  // Esc closes only the top-most thing: the goals list first, then the expanded compact card. Capture phase, so it runs
  // before tools.ts (menu / tool / selection); preventDefault() marks the press as used. A press already used by the
  // topbar stage list (defaultPrevented) is left alone; modals.ts stops the event before it gets here.
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented || !(cardOpen || listOpen)) return;
    e.preventDefault();
    if (listOpen) setOpen(cardOpen, false); else setOpen(false, false);
  };
  document.addEventListener('pointerdown', onDown, true);
  window.addEventListener('keydown', onKey, true);
  const offCompact = ctx.compact.on(() => { cardOpen = false; listOpen = false; posAcc = 1e9; acc = TICK_MS; });
  // a menu, a tool or a new selection (hotkey B / Del, flow-strip jump, …) takes over: the goal list and the expanded
  // compact card close, so the top-most visible layer is always the one Esc closes and nothing opens underneath them
  const closeQuiet = () => { if (!cardOpen && !listOpen) return; cardOpen = false; listOpen = false; acc = TICK_MS; place(); render(); };
  const offTakeover = [
    ctx.menu.on(v => { if (v !== null) closeQuiet(); }),
    ctx.tool.on(v => { if (v.kind !== 'none') closeQuiet(); }),
    ctx.selection.on(v => { if (v !== null) closeQuiet(); }),
  ];
  const offEvent = ctx.onEvent(e => {
    if (e.type === 'objective' || e.type === 'tutorialDone') pendingSlide = 'new';
    else if (e.type === 'tutorialStep' && pendingSlide !== 'new') pendingSlide = 'step';
  });

  // ------------------------------------------------------------------ tooltips (content is evaluated lazily)
  const tipBody = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');
  const tip = (el: HTMLElement, fn: () => { title: string; body?: string; hotkey?: string }) => { el.dataset.tip = '1'; ctx.tip(el, fn); };
  const curGoalLine = () => {
    const m = mode();
    if (m === 'tut') { const s = TUTORIAL_STEPS[tutStep()]; return { title: t(`tut.${s}`), body: t('clipboard.tutorial', { n: tutStep() + 1, total: TUTORIAL_STEPS.length }) }; }
    if (m === 'done') { const g = followup(); return g ? { title: t(`progress.followup.${g.id}`), body: t(`clipboard.fbody.${g.id}`) } : { title: t('clipboard.allDone'), body: '' }; }
    const k = currentIdx(), o = OBJECTIVES[k];
    const y = whyText(o.id);
    return { title: objText(o.id), body: tipBody(y && y + '.', t('clipboard.progressTip', { cur: ctx.fmt(progOf(o)), target: ctx.fmt(o.target) }), rewardText(k) + '.', o.mandatory && t('clipboard.requiredTip')) };
  };
  tip(chip, () => { const g = curGoalLine(); return { title: g.title, body: tipBody(g.body, t('clipboard.chipTip')) }; });
  tip(cardX, () => ({ title: t('clipboard.close'), body: t('clipboard.closeCardTip'), hotkey: 'Esc' }));
  tip(listX, () => ({ title: t('clipboard.close'), body: t('clipboard.closeTip'), hotkey: 'Esc' }));
  tip(showBtn, () => { if (mode() === 'done') { const g = curGoalLine(); return { title: t('clip.show'), body: tipBody(g.title + ':', g.body) }; } const tg = curTarget(); const g = curGoalLine(); return { title: t('clip.show'), body: tipBody(tg && t('clipboard.flyTo', { place: tg.place }), g.title + ':', g.body) }; });
  tip(buildBtn, () => { const g = buildNow(); const room = g ? t(`room.${g.type}`) : ''; return { title: t('clipboard.build'), body: t('clipboard.buildTip', { room, cost: ctx.fmt(g?.cost ?? 0) }) }; });
  tip(loop, () => ({ title: t('clipboard.loopTitle'), body: t('clipboard.loopTip') }));
  tip(moreBtn, () => { const c = counts(); return { title: t('clipboard.allGoals'), body: t('clipboard.allGoalsTip', { total: c.total, req: c.req, done: c.done }) }; });
  tip(skipBtn, () => ({ title: t('tut.skip'), body: t('clipboard.skipTip', { left: TUTORIAL_STEPS.length - tutStep(), total: TUTORIAL_STEPS.length }) }));
  for (const r of rows) tip(r.el, () => ({
    title: objText(r.o.id),
    body: tipBody(w.obj.done[r.o.id] ? t('clipboard.done') + '.' : t('clipboard.progressTip', { cur: ctx.fmt(progOf(r.o)), target: ctx.fmt(r.o.target) }), rewardText(r.k) + '.', r.o.mandatory && t('clipboard.requiredTip'), t('clipboard.flyTo', { place: objTarget(r.o).place })),
  }));

  // ------------------------------------------------------------------ layout: sit under the topbar
  const place = () => {
    const ui = parseFloat(getComputedStyle(document.documentElement).fontSize) || 14;
    const compact = ctx.compact.get();
    const tb = document.querySelector<HTMLElement>('[data-hud="top"]');
    const rb = tb?.getBoundingClientRect();
    // the card's clip tab sticks out .55rem above the card → leave room for it
    const gap = compact ? 6 : Math.round(ui * 0.75);
    const top = rb && rb.height > 0 ? rb.bottom + gap : (compact ? 2.7 : 3.2) * ui;
    css(root, 'top', `${Math.round(top)}px`);
    // the list (compact: and the expanded card) hangs below the chip and must end above the build bar
    const listTop = top + (compact ? chip.offsetHeight + 6 : 0);
    const bots = [...document.querySelectorAll<HTMLElement>('[data-hud="bottom"]')].map(e => e.getBoundingClientRect()).filter(b => b.height > 0);
    const bottom = (bots.length ? Math.min(...bots.map(b => b.top)) : window.innerHeight) - 6;
    const maxH = `${Math.max(120, Math.floor(bottom - listTop))}px`;
    css(list, 'maxHeight', maxH);
    css(card, 'maxHeight', compact ? maxH : 'none');
  };

  // ------------------------------------------------------------------ render (≤ 10× / s, write on change)
  function render() {
    const lang = ctx.lang();
    if (lang !== lastLang) { lastLang = lang; cache.clear(); }
    const m = mode();
    const compact = ctx.compact.get();
    const tNow = now();
    const isNew = tNow < newUntil;

    cls(root, 'cb--compact', compact);
    cls(root, 'cb--open', compact && cardOpen);
    cls(root, 'cb--list', listOpen && m !== 'tut');
    cls(root, 'cb--new', isNew);
    attr(card, 'data-overlay', compact ? '' : null);
    attr(card, 'aria-label', t('clip.title'));
    attr(chip, 'aria-expanded', compact && cardOpen ? 'true' : 'false');
    attr(moreBtn, 'aria-expanded', listOpen ? 'true' : 'false');
    text(stamp, t('clip.new'));

    let header: string, goalS: string, icon: string, chipS: string, num: string, frac: number, mand = false, rewardS = '', whyS = '';
    if (m === 'tut') {
      const k = tutStep(), s = TUTORIAL_STEPS[k];
      header = t('clipboard.tutorial', { n: k + 1, total: TUTORIAL_STEPS.length });
      goalS = t(`tut.${s}`); icon = TUT_ICON[s] ?? 'clipboard'; chipS = t(`clipboard.tshort.${s}`);
      num = `${k + 1}/${TUTORIAL_STEPS.length}`; frac = k / TUTORIAL_STEPS.length;
    } else if (m === 'obj') {
      const k = currentIdx(), o = OBJECTIVES[k], p = progOf(o);
      header = t('clip.title'); goalS = objText(o.id); icon = objIcon(o.id); chipS = t(`clipboard.short.${o.id}`);
      num = `${ctx.fmt(p)}/${ctx.fmt(o.target)}`; frac = p / o.target; mand = o.mandatory; rewardS = rewardText(k); whyS = whyText(o.id);
      // the guide points at Staff first while a built room waits for its worker (guide.ts guideStep): say why here, so
      // the hand on "Staff" next to a "Build a Classroom" goal makes sense (closer M5, fresh play at 1:30)
      const lack = w.tutorial.done ? missingStaff(w) : null;
      if (lack && w.coins >= hireFee(lack)) whyS = t(`clipboard.first.${lack}`);
    } else {
      const c = counts(), g = followup();
      header = t('clip.title');
      if (g) {
        goalS = t(`progress.followup.${g.id}`); icon = FOLLOW_ICON[g.id]; chipS = t(`clipboard.fshort.${g.id}`);
        num = `${g.progress}/${g.target}`; frac = g.progress / g.target;
      } else { goalS = t('clipboard.allDone'); icon = 'check'; chipS = t('clipboard.allDoneShort'); num = `${c.done}/${c.total}`; frac = 1; }
    }
    text(headTxt, header);
    const showLoop = m !== 'tut' && w.stats.released < 3;
    cls(loop, 'cb-hide', !showLoop);
    if (showLoop) text(loopTxt, t('clipboard.loop'));
    text(goalTxt, goalS);
    cls(why, 'cb-hide', !whyS);
    text(why, whyS);
    // saving up for the goal room / "Build it" once it is affordable
    const sv = saving(), bn = buildNow();
    cls(save, 'cb-hide', !sv);
    cls(chipSave, 'cb-hide', !sv);
    if (sv) {
      const f = Math.max(0, Math.min(1, w.coins / (sv.cost + sv.reserve)));
      css(saveFill, 'transform', `scaleX(${Math.round(f * 100) / 100})`);
      const eta = savingsEta(w, sv.cost + sv.reserve);
      // enough for the room, but not for tonight's wages after it: say why the guide waits (closer M5)
      if (sv.reserve > 0) text(saveTxt, t('clipboard.saveWages', { n: ctx.fmt(sv.reserve) }));
      else text(saveTxt, t(eta ? 'clipboard.saveEta' : 'clipboard.save', { have: ctx.fmt(Math.floor(Math.max(0, w.coins))), cost: ctx.fmt(sv.cost), min: eta ?? 0 }));
      attr(save, 'aria-label', t('clipboard.save', { have: ctx.fmt(Math.floor(Math.max(0, w.coins))), cost: ctx.fmt(sv.cost) }));
      attr(chipSave, 'style', `--f:${Math.round(f * 100)}%`);
    }
    cls(buildBtn, 'cb-hide', !bn);
    cls(showBtn, 'cb-alt', !!bn);
    if (bn) { text(buildTxt, t('clipboard.build')); attr(buildBtn, 'aria-label', `${t('clipboard.build')}: ${t(`room.${bn.type}`)}`); }
    src(goalIc, icon);
    cls(req, 'cb-hide', !mand);
    text(req, t('clipboard.required'));
    css(barFill, 'transform', `scaleX(${Math.round(Math.max(0, Math.min(1, frac)) * 1000) / 1000})`);
    text(progNum, num);
    cls(rew, 'cb-hide', !rewardS);
    text(rewTxt, rewardS);
    cls(showBtn, 'cb-hide', m === 'done' && !followup());
    text(showTxt, `${t('clip.show')} ›`);
    attr(showBtn, 'aria-label', `${t('clip.show')}: ${goalS}`);
    cls(moreBtn, 'cb-hide', m === 'tut');
    text(moreTxt, t('clipboard.allGoals'));
    attr(moreBtn, 'aria-label', t('clipboard.allGoals'));
    cls(skipBtn, 'cb-hide', m !== 'tut');
    text(skipTxt, t('tut.skip'));
    attr(skipBtn, 'aria-label', t('tut.skip'));
    attr(cardX, 'aria-label', t('clipboard.close'));
    attr(listX, 'aria-label', t('clipboard.close'));
    text(chipTxt, chipS);
    text(chipNum, num);
    attr(chip, 'aria-label', `${header}: ${goalS} ${num}`);

    if (listOpen && m !== 'tut') {
      const c = counts();
      text(lTitle, t('clipboard.allGoals'));
      text(lReq, t('clipboard.requiredCount', { done: c.reqDone, total: c.req }));
      attr(list, 'aria-label', t('clipboard.allGoals'));
      const cur = currentIdx();
      let n = 0;
      for (const r of rows) {
        const vis = visible(r.o);
        cls(r.el, 'cb-hide', !vis);
        if (!vis) continue;
        n++;
        const done = !!w.obj.done[r.o.id];
        cls(r.el, 'cb-done', done);
        cls(r.el, 'cb-cur', r.k === cur);
        cls(r.st, 'cb-hide', !done);
        cls(r.no, 'cb-hide', done);
        text(r.no, String(n));
        text(r.txt, objText(r.o.id));
        cls(r.req, 'cb-hide', !r.o.mandatory);
        text(r.req, t('clipboard.required'));
        const pn = done ? t('clipboard.done') : `${ctx.fmt(progOf(r.o))}/${ctx.fmt(r.o.target)}`;
        text(r.num, pn);
        text(r.coins, `+${ctx.fmt(objectiveReward(r.k))}`);
        attr(r.el, 'aria-label', `${t('clip.show')}: ${objText(r.o.id)} (${pn})`);
        attr(r.el, 'aria-current', r.k === cur ? 'step' : null);
      }
    }
  }

  const slide = () => {
    const kind = pendingSlide; pendingSlide = null;
    if (kind === 'new') { newUntil = now() + NEW_MS; ctx.sound('objective'); }
    if (reduceMotion) return;
    const el = ctx.compact.get() ? chip : card;
    if (typeof el.animate !== 'function') return;
    // the goal widget stays on screen and readable through the whole animation (D4: visible 100 % of the time): a pop
    // in place for a new goal, a short nudge for a new tutorial step – never off screen, never below 70 % opacity
    if (kind === 'new') el.animate([{ transform: 'scale(.9)', opacity: 0.7 }, { transform: 'scale(1.05)', opacity: 1, offset: 0.55 }, { transform: 'scale(1)', opacity: 1 }], { duration: 420, easing: 'ease-out' });
    else el.animate([{ transform: 'translateX(.35rem)', opacity: 0.75 }, { transform: 'translateX(0)', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
    if (kind === 'new' && ctx.compact.get()) chipFlash.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: 2400, easing: 'ease-in-out' });
  };

  return {
    update(dt: number) {
      acc += dt * 1000; posAcc += dt * 1000;
      if (acc < TICK_MS && ctx.lang() === lastLang && !pendingSlide) return;
      acc = 0;
      if (posAcc >= 500) { posAcc = 0; place(); }
      if (pendingSlide) slide();
      render();
    },
    destroy() {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      offCompact(); offEvent(); for (const off of offTakeover) off();
      root.remove();
    },
  };
}
