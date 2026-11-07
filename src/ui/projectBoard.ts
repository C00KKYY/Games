/**
 * Project Board (Brief §3.13, §12.3 B1 screen; docs/M5_DESIGN.md §12.1). Owner: ui-m5.
 *  - Build-bar entry "Projects" once the tutorial is over: before 2★ with a lock (the board opens as a preview with
 *    the reason "Reach 2★ – N reputation to go", so the player sees what they play towards), from 2★ with a dot until
 *    the first look.
 *  - 12 cards from projectCard(): name, effect in numbers, cost, duration, what appears in the world, state
 *    (done / running with bar and time / startable / another runs / locked / needs a room). Start → cmd.startProject;
 *    an unaffordable Start still answers (toast "not enough coins"), so nothing is a dead button.
 *  - While a project runs: a chip in the HUD rail (icon, bar, time left) that opens the board.
 *  - Toasts: board unlocked (2★), project done (+ its effect).
 * Non-pausing panel (gameplay continues). Texts: src/i18n/parts/projectBoard.{en,de}.json + progress.project*.
 */
import type { UICtx, Component } from './ctx';
import type { ProjectId } from '../sim/types';
import { domKit, WRITE_MS } from './buildbar';
import { panelShell, rail, bar, dot, clockStr } from './m5kit';
import { PROJECTS, PROJECT_UNLOCK_STARS, projectDef, type ProjectEffect } from '../content/progress';
import { STARS } from '../content/balance';
import { projectCard, projectsUnlocked } from '../sim/projects';

export const FX_ICON: Record<ProjectEffect, string> = {
  energyRefill: 'bed', mealRefill: 'meal', releaseBounty: 'gate', guardRadius: 'staff', hygieneRefill: 'shower', crateValue: 'crate',
  cartSpeed: 'crate', reform: 'book', yardFun: 'decor', moodFlat: 'mood', dirtPerUse: 'shower', ferrySeats: 'ferry',
};

interface Card {
  id: ProjectId; el: HTMLElement; name: HTMLElement; fx: HTMLElement; cost: HTMLElement; costNum: HTMLElement; dur: HTMLElement; vis: HTMLElement;
  state: HTMLElement; barEl: ReturnType<typeof bar>; btn: HTMLButtonElement; btnTxt: HTMLElement;
}

export function mountProjectBoard(ctx: UICtx): Component {
  const d = domKit(ctx);
  const { t } = ctx;
  const shell = panelShell(ctx, d, 'projects', { icon: 'projects', cls: 'pb' });
  const name = (id: ProjectId) => t(`progress.project.${id}`);
  const fx = (id: ProjectId) => t(`progress.projectFx.${id}`);
  const rufToGo = () => Math.max(1, Math.ceil(STARS[PROJECT_UNLOCK_STARS - 1] - ctx.w.ruf));

  // ------------------------------------------------------------------ build-bar entry
  const bbBar = ctx.root.querySelector<HTMLElement>('.bb-bar');
  const entry = d.button('bb-btn bb-projects', bbBar ?? ctx.root, () => ctx.panel.set(ctx.panel.get() === 'projects' ? null : 'projects'));
  d.img(ctx.icon('projects'), entry, 'bb-ic');
  const entryLbl = d.h('span', 'bb-lbl', entry);
  const entryLock = d.img(ctx.icon('lock'), entry, 'bb-lockbadge');
  const entryDot = dot(d, entry);
  entry.hidden = true;
  d.tip(entry, () => {
    const w = ctx.w;
    if (!projectsUnlocked(w)) return { title: t('projectBoard.title'), body: `${t('projectBoard.lockedTip', { s: PROJECT_UNLOCK_STARS, n: ctx.fmt(rufToGo()) })}\n${t('projectBoard.about')}` };
    const run = w.projects.running;
    const done = PROJECTS.filter(p => w.projects.done[p.id]).length;
    const now = run ? t('projectBoard.runningTip', { name: name(run.id), time: clockStr(run.leftMs) }) : t('projectBoard.idleTip');
    return { title: t('projectBoard.title'), body: `${now}\n${t('projectBoard.doneCount', { n: done, total: PROJECTS.length })}` };
  });

  // ------------------------------------------------------------------ rail chip (running project)
  const chip = d.button('m5-rbtn m5-chip pb-chip', rail(ctx), () => ctx.panel.set('projects'));
  chip.style.order = '2';
  d.img(ctx.icon('projects'), chip);
  const chipBar = bar(d, chip, 'gold');
  const chipNum = d.h('span', 'm5-rnum', chip);
  chip.hidden = true;
  d.tip(chip, () => {
    const run = ctx.w.projects.running;
    return run ? { title: name(run.id), body: `${fx(run.id)}\n${t('projectBoard.runningTip', { name: name(run.id), time: clockStr(run.leftMs) })}` } : { title: t('projectBoard.title') };
  });

  // ------------------------------------------------------------------ panel content
  const lock = d.h('div', 'm5-why pb-lock', shell.body);
  d.img(ctx.icon('lock'), lock);
  const lockTxt = d.h('span', '', lock);
  const intro = d.h('p', 'm5-p pb-intro', shell.body);
  const grid = d.h('div', 'pb-grid', shell.body);
  const cards: Card[] = PROJECTS.map(p => {
    const el = d.h('div', 'pb-card', grid);
    el.dataset.id = p.id;
    const plaque = d.h('span', 'pb-plaque', el);
    d.img(ctx.icon(FX_ICON[p.effect]), plaque);
    const nm = d.h('span', 'pb-name', el);
    const f = d.h('span', 'pb-fx', el);
    const meta = d.h('span', 'pb-meta', el);
    const cost = d.h('span', 'm5-line pb-cost', meta);
    d.img(ctx.icon('coin'), cost, 'm5-li');
    const costNum = d.h('span', 'num', cost);
    const durL = d.h('span', 'm5-line', meta);
    d.img(ctx.icon('clock'), durL, 'm5-li');
    const dur = d.h('span', '', durL);
    const vis = d.h('span', 'pb-vis', el);
    const act = d.h('div', 'pb-act', el);
    const barEl = bar(d, act, 'gold');
    const state = d.h('span', 'pb-state', act);
    const btn = d.button('m5-btn pb-start', act, () => start(p.id));
    d.img(ctx.icon('coin'), btn);
    const btnTxt = d.h('span', '', btn);
    d.tip(btn, () => {
      const c = projectCard(ctx.w, p.id);
      const short = c.state === 'available' && !c.affordable ? `\n${t('projectBoard.short', { n: ctx.fmt(Math.ceil(p.cost - ctx.w.coins)) })}` : '';
      return { title: t('projectBoard.startTitle', { name: name(p.id) }), body: `${fx(p.id)}. ${t('projectBoard.startBody', { cost: ctx.fmt(p.cost), time: clockStr(p.sec * 1000) })}${short}` };
    });
    return { id: p.id, el, name: nm, fx: f, cost, costNum, dur, vis, state, barEl, btn, btnTxt };
  });

  function start(id: ProjectId) {
    const r = ctx.cmd.startProject(ctx.w, id);
    if (!r.ok) { ctx.feedback(r); return; }
    ctx.sound('upgrade');
    ctx.toast(t('projectBoard.started', { name: name(id), time: clockStr(projectDef(id).sec * 1000) }), { kind: 'good', icon: 'projects', ms: 2600 });
    shell.dirty();
  }

  // ------------------------------------------------------------------ events
  let seen = projectsUnlocked(ctx.w) && (PROJECTS.some(p => ctx.w.projects.done[p.id]) || !!ctx.w.projects.running);
  const off = ctx.onEvent(e => {
    if (e.type === 'projectDone') {
      const id = String(e.id) as ProjectId;
      ctx.toast(t('projectBoard.doneToast', { name: name(id), fx: fx(id) }), { kind: 'good', icon: 'projects', ms: 4000 });
    } else if (e.type === 'star' && Number(e.stars) === PROJECT_UNLOCK_STARS && !seen) {
      ctx.toast(t('projectBoard.unlockToast'), { kind: 'good', icon: 'projects', ms: 4200 });
    }
  });
  const offPanel = ctx.panel.on(v => { if (v === 'projects' && projectsUnlocked(ctx.w)) seen = true; });

  // ------------------------------------------------------------------ render
  const renderEntry = () => {
    const w = ctx.w, unlocked = projectsUnlocked(w);
    d.flag(entry, 'hidden', w.tutorial.done ? null : '');
    d.text(entryLbl, t('projectBoard.btn'));
    d.flag(entryLock, 'hidden', unlocked ? '' : null);
    d.flag(entryDot, 'hidden', unlocked && !seen ? null : '');
    d.cls(entry, 'locked', !unlocked);
    d.cls(entry, 'on', ctx.panel.get() === 'projects');
    d.attr(entry, 'aria-pressed', ctx.panel.get() === 'projects' ? 'true' : 'false');
    d.attr(entry, 'aria-label', unlocked ? t('projectBoard.title') : `${t('projectBoard.title')} – ${t('projectBoard.locked', { s: PROJECT_UNLOCK_STARS })}`);
    const run = w.projects.running;
    d.flag(chip, 'hidden', run ? null : '');
    if (run) {
      chipBar.set(1 - run.leftMs / run.totalMs);
      d.text(chipNum, clockStr(run.leftMs));
      d.attr(chip, 'aria-label', t('projectBoard.chipLabel', { name: name(run.id), time: clockStr(run.leftMs) }));
    }
  };
  const renderPanel = () => {
    const w = ctx.w, unlocked = projectsUnlocked(w);
    d.text(shell.title, t('projectBoard.title'));
    const done = PROJECTS.filter(p => w.projects.done[p.id]).length;
    d.text(shell.sub, t('projectBoard.doneCount', { n: done, total: PROJECTS.length }));
    d.flag(lock, 'hidden', unlocked ? '' : null);
    if (!unlocked) d.text(lockTxt, t('projectBoard.lockedTip', { s: PROJECT_UNLOCK_STARS, n: ctx.fmt(rufToGo()) }));
    d.text(intro, t('projectBoard.intro'));
    for (const c of cards) {
      const def = projectDef(c.id), st = projectCard(w, c.id);
      d.text(c.name, name(c.id));
      d.text(c.fx, fx(c.id));
      d.text(c.costNum, ctx.fmt(def.cost));
      d.text(c.dur, clockStr(def.sec * 1000));
      d.text(c.vis, t(`projectBoard.vis.${c.id}`));
      for (const s of ['done', 'running', 'locked', 'needs', 'busy']) d.cls(c.el, s, st.state === s || (s === 'needs' && st.state === 'needsRoom'));
      const showBtn = st.state === 'available';
      d.flag(c.btn, 'hidden', showBtn ? null : '');
      d.flag(c.barEl.el, 'hidden', st.state === 'running' ? null : '');
      d.cls(c.cost, 'bad', st.state === 'available' && !st.affordable);
      let stateTxt = '';
      switch (st.state) {
        case 'done': stateTxt = t('projectBoard.done'); break;
        case 'running': c.barEl.set(st.progress01); stateTxt = t('projectBoard.left', { time: clockStr(st.leftMs) }); break;
        case 'busy': stateTxt = t('projectBoard.busy'); break;
        case 'locked': stateTxt = t('projectBoard.locked', { s: st.stars }); break;
        case 'needsRoom': stateTxt = t('projectBoard.needs', { room: t(`room.${st.room}`) }); break;
        case 'available':
          d.text(c.btnTxt, t('projectBoard.start', { cost: ctx.fmt(def.cost) }));
          d.cls(c.btn, 'bad', !st.affordable);
          d.attr(c.btn, 'aria-label', `${t('projectBoard.start', { cost: ctx.fmt(def.cost) })} – ${name(c.id)}${st.affordable ? '' : ` (${t('place.coins')})`}`);
          break;
      }
      d.text(c.state, stateTxt);
      d.flag(c.state, 'hidden', stateTxt ? null : '');
      d.cls(c.state, 'good', st.state === 'done');
    }
  };

  let acc = WRITE_MS;
  return {
    update(dt) {
      acc += dt * 1000;
      if (acc >= WRITE_MS) { acc = 0; renderEntry(); }
      if (shell.tick(dt)) renderPanel();
    },
    destroy() { off(); offPanel(); shell.destroy(); entry.remove(); chip.remove(); },
  };
}
