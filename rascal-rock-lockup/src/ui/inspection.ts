/**
 * Inspection Day (Brief §3.17, §12.3 B1 "Inspektionsergebnis"; docs/M5_DESIGN.md §12.4). Owner: ui-m5.
 *  - HUD rail button once the inspection matters (w.unlocked.inspection, the 7 required goals done, or any inspection
 *    on this run): opens the forecast; a dot while it can be called; during the walk it shows the time left; with a
 *    result waiting it pulses and opens the result.
 *  - Forecast panel (non-pausing): the 4 categories with grade + score bar, expected stars, the worst category with
 *    the inspector's tip, key preview, and "Call Inspection Day" (locked with the reason from inspectionBlock: tutorial,
 *    7 required goals, walk running, next game day).
 *  - Walk (45 s): a banner chip with the time left and an optional "Follow" (camera follows the goose; a camera drag
 *    stops it).
 *  - Result screen (PAUSING, opens when the walk ends): stamp animation PASSED/FAILED, grades A–F, stars, worst-category
 *    tip, key preview, "Gullrock Lighthouse unlocked!" at ≥ 1★ (info, no button), "Keep optimising"
 *    (cmd.closeInspection) and "Transfer…" (opens the transfer dialog; only after a pass).
 * Also installs the M5 panel controller (m5kit.ts panelController: takeover + pause rules for every M5 panel).
 * Texts: src/i18n/parts/inspection.{en,de}.json + progress.cat/tip/site/reason.*.
 */
import type { UICtx, Component } from './ctx';
import type { Grade, GradeCat } from '../sim/types';
import { domKit, WRITE_MS } from './buildbar';
import { panelShell, panelController, rail, banners, bar, dot, clockStr } from './m5kit';
import { M5_ICON } from './m5icons';
import { INSPECTION, PRESTIGE } from '../content/balance';
import { forecast, inspectionBlock, GRADE_CATS } from '../sim/inspection';
import { mandatoryDone, OBJECTIVES } from '../sim/objectives';

interface CatEls { cat: GradeCat; el: HTMLElement; name: HTMLElement; bar: ReturnType<typeof bar>; grade: HTMLElement }

export function mountInspection(ctx: UICtx): Component {
  const d = domKit(ctx);
  const { t } = ctx;
  const offCtl = panelController(ctx);
  const w0 = () => ctx.w;
  const reqDone = () => { const m = OBJECTIVES.filter(o => o.mandatory); return { done: m.filter(o => w0().obj.done[o.id]).length, total: m.length }; };
  const relevant = () => {
    const w = ctx.w;
    return w.tutorial.done && (!!w.unlocked.inspection || mandatoryDone(w) || w.inspection.phase !== 'idle' || w.inspection.count > 0 || w.inspection.best > 0);
  };

  const cats = (parent: HTMLElement): CatEls[] => {
    const box = d.h('div', 'in-cats', parent);
    return GRADE_CATS.map(cat => {
      const el = d.h('div', 'in-cat', box);
      const nm = d.h('span', 'in-cat-name', el);
      const b = bar(d, el);
      const grade = d.h('span', 'in-grade', el);
      return { cat, el, name: nm, bar: b, grade };
    });
  };
  const paintCats = (els: CatEls[], scores: Record<GradeCat, number>, grades: Record<GradeCat, Grade>, worst: GradeCat) => {
    for (const c of els) {
      d.text(c.name, t(`progress.cat.${c.cat}`));
      c.bar.set(scores[c.cat] / 100);
      d.text(c.grade, grades[c.cat]);
      for (const g of 'ABCDEF') d.cls(c.grade, `g${g}`, grades[c.cat] === g);
      d.cls(c.el, 'worst', c.cat === worst);
      d.attr(c.el, 'aria-label', `${t(`progress.cat.${c.cat}`)}: ${grades[c.cat]} (${Math.round(scores[c.cat])}/100)`);
    }
  };
  const starRow = (parent: HTMLElement) => {
    const row = d.h('div', 'in-stars', parent);
    const imgs = [0, 1, 2].map(() => d.img(ctx.icon('starEmpty'), row));
    const txt = d.h('span', 'm5-p m5-strong', row);
    return { row, imgs, txt, set: (n: number, label: string) => { imgs.forEach((im, i) => d.src(im, ctx.icon(i < n ? 'star' : 'starEmpty'))); d.text(txt, label); d.attr(row, 'aria-label', label); } };
  };
  const tipBox = (parent: HTMLElement) => {
    const box = d.h('div', 'in-tip', parent);
    d.img(ctx.icon(M5_ICON.inspect), box);
    const p = d.h('p', 'm5-p', box);
    return { box, p };
  };

  // ------------------------------------------------------------------ rail button
  const btn = d.button('m5-rbtn in-btn', rail(ctx), () => {
    const ph = ctx.w.inspection.phase;
    if (ph === 'result') ctx.panel.set('inspection');
    else if (ph === 'walking') { follow = true; followNow(); }
    else ctx.panel.set(ctx.panel.get() === 'forecast' ? null : 'forecast');
  });
  btn.style.order = '1';
  d.img(ctx.icon(M5_ICON.inspect), btn);
  const btnNum = d.h('span', 'm5-rnum', btn);
  const btnDot = dot(d, btn);
  btn.hidden = true;
  d.tip(btn, () => {
    const ph = ctx.w.inspection.phase;
    if (ph === 'walking') return { title: t('inspection.walking'), body: t('inspection.followBody') };
    if (ph === 'result') return { title: t('inspection.resultTitle'), body: t('inspection.resultTip') };
    const why = inspectionBlock(ctx.w);
    return { title: t('inspection.title'), body: why ? `${t('inspection.forecastTip')}\n${blockText(why)}` : `${t('inspection.forecastTip')}\n${t('inspection.ready')}` };
  });

  // ------------------------------------------------------------------ walk banner (non-blocking)
  const walk = d.button('m5-ban in-walk', banners(ctx), () => { follow = !follow; if (follow) followNow(); });
  d.img(ctx.icon(M5_ICON.inspect), walk);
  const walkTxt = d.h('span', 'm5-ban-txt', walk);
  const walkBar = bar(d, walk, 'gold');
  const walkNum = d.h('span', 'm5-ban-num', walk);
  const walkAct = d.h('span', 'm5-ban-act', walk);
  walk.hidden = true;
  d.tip(walk, () => ({ title: t('inspection.walking'), body: t('inspection.followBody') }));
  let follow = false;
  const followNow = () => { const p = ctx.w.inspection.walker; ctx.focusTile(p.x, p.y, Math.max(ctx.cam.zoom, 1)); };

  // ------------------------------------------------------------------ forecast panel
  const fc = panelShell(ctx, d, 'forecast', { icon: M5_ICON.inspect, cls: 'in-fc' });
  const fcIntro = d.h('p', 'm5-p', fc.body);
  const fcCatsH = d.h('h3', 'm5-h', fc.body);
  const fcCats = cats(fc.body);
  const fcStars = starRow(fc.body);
  const fcTip = tipBox(fc.body);
  const fcKeys = d.h('p', 'm5-p in-keyrow', fc.body);
  const fcWhy = d.h('div', 'm5-why', fc.body);
  d.img(ctx.icon('lock'), fcWhy);
  const fcWhyTxt = d.h('span', '', fcWhy);
  const fcRow = d.h('div', 'm5-btnrow m5-sticky', fc.body);
  const call = d.button('m5-btn gold in-call', fcRow, () => {
    const r = ctx.cmd.callInspection(ctx.w);
    if (!r.ok) { ctx.feedback(r); return; }
    ctx.panel.set(null);
    follow = true; followNow();
    ctx.toast(t('inspection.calledToast', { sec: INSPECTION.walkSec }), { kind: 'info', icon: M5_ICON.inspect, ms: 3500 });
  });
  d.img(ctx.icon(M5_ICON.inspect), call);
  const callTxt = d.h('span', '', call);
  d.tip(call, () => {
    const why = inspectionBlock(ctx.w);
    return { title: t('inspection.call'), body: why ? `${t('buildbar.locked')}: ${blockText(why)}` : t('inspection.callBody', { sec: INSPECTION.walkSec }) };
  });

  const blockText = (why: string) => {
    if (why === 'notReady') { const r = reqDone(); return t('inspection.notReady', { done: r.done, total: r.total }); }
    if (why === 'tooSoon') return t('inspection.tooSoon', { day: ctx.w.inspection.retryDay + 1 });
    return t(`progress.reason.${why}`);
  };
  const starsLabel = (n: number, fore: boolean) => (n >= 1 ? t(fore ? 'inspection.foreStars' : 'inspection.gotStars', { n }) : t(fore ? 'inspection.foreFail' : 'inspection.gotFail'));

  const renderForecast = () => {
    const w = ctx.w, f = forecast(w), why = inspectionBlock(w);
    d.text(fc.title, t('inspection.title'));
    d.text(fc.sub, w.inspection.best > 0 ? t('inspection.best', { n: w.inspection.best }) : t('inspection.sub'));
    d.text(fcIntro, t('inspection.intro', { h: INSPECTION.windowHours / 24 }));
    d.text(fcCatsH, t('inspection.forecast'));
    paintCats(fcCats, f.scores, f.grades, f.worst);
    fcStars.set(f.stars, starsLabel(f.stars, true));
    d.text(fcTip.p, `${t('inspection.tipLead', { cat: t(`progress.cat.${f.worst}`) })} ${t(`progress.tip.${f.worst}`)}`);
    d.text(fcKeys, f.stars >= 1 || w.inspection.best >= 1 ? t('inspection.keys', { n: f.keysPreview }) : t('inspection.keysNone', { site: t('progress.site.2') }));
    d.flag(fcWhy, 'hidden', why ? null : '');
    if (why) d.text(fcWhyTxt, blockText(why));
    d.text(callTxt, t('inspection.call'));
    d.cls(call, 'locked', !!why);
    d.attr(call, 'aria-disabled', why ? 'true' : 'false');
    d.attr(call, 'aria-label', why ? `${t('inspection.call')} – ${blockText(why)}` : t('inspection.call'));
  };

  // ------------------------------------------------------------------ result screen (pausing)
  const close = () => {
    if (ctx.w.inspection.phase === 'result') ctx.cmd.closeInspection(ctx.w);
    ctx.panel.set(null);
  };
  const rs = panelShell(ctx, d, 'inspection', { icon: M5_ICON.inspect, cls: 'in-res', onClose: close });
  const top = d.h('div', 'in-res-top', rs.body);
  const stamp = d.h('div', 'in-stamp', top);
  const rsStars = starRow(top);
  const rsCats = cats(rs.body);
  const rsTip = tipBox(rs.body);
  const rsKeys = d.h('p', 'm5-p in-keyrow', rs.body);
  const teaser = d.h('div', 'in-teaser', rs.body);
  d.img(ctx.icon('ferry'), teaser);
  const teaserTxt = d.h('p', 'm5-p', teaser);
  const rsNext = d.h('p', 'm5-p', rs.body);
  const rsRow = d.h('div', 'm5-btnrow m5-sticky', rs.body);
  const keep = d.button('m5-btn ghost in-keep', rsRow, close);
  const keepTxt = d.h('span', '', keep);
  const toTransfer = d.button('m5-btn gold in-transfer', rsRow, () => {
    if (ctx.w.inspection.phase === 'result') ctx.cmd.closeInspection(ctx.w);
    ctx.panel.set('transfer'); // pausing → pausing: stays paused (m5kit panelController)
  });
  d.img(ctx.icon(M5_ICON.transfer), toTransfer);
  const transferTxt = d.h('span', '', toTransfer);
  d.tip(keep, () => ({ title: t('inspection.keep'), body: t('inspection.keepBody'), hotkey: 'Esc' }));
  d.tip(toTransfer, () => ({ title: t('inspection.transfer'), body: t('inspection.transferBody') }));
  let stampedFor = -1;

  const renderResult = () => {
    const w = ctx.w, r = w.inspection.last;
    d.text(rs.title, t('inspection.resultTitle'));
    if (!r) { d.text(rs.sub, ''); return; }
    const pass = r.stars >= 1;
    d.text(rs.sub, t('inspection.resultSub', { day: r.day + 1 }));
    d.text(stamp, t(pass ? 'inspection.passed' : 'inspection.failed'));
    d.cls(stamp, 'pass', pass);
    if (stampedFor !== w.inspection.count) {
      stampedFor = w.inspection.count;
      stamp.classList.remove('hit'); void stamp.offsetWidth; stamp.classList.add('hit');
      ctx.sound('inspectStamp');
    }
    rsStars.set(r.stars, starsLabel(r.stars, false));
    paintCats(rsCats, r.scores, r.grades, r.worst);
    d.text(rsTip.p, `${t('inspection.tipLead', { cat: t(`progress.cat.${r.worst}`) })} ${t(`progress.tip.${r.worst}`)}`);
    const best = w.inspection.best;
    const bonus = PRESTIGE.starBonus[Math.min(3, best)] ?? 0;
    d.text(rsKeys, best >= 1 ? (bonus ? t('inspection.keysBonus', { n: r.keysPreview, b: bonus }) : t('inspection.keys', { n: r.keysPreview })) : t('inspection.keysNone', { site: t('progress.site.2') }));
    d.flag(teaser, 'hidden', w.prestige.completedSites.includes(w.site) ? null : '');
    d.text(teaserTxt, t('inspection.unlocked', { site: t('progress.site.2') }));
    const nextLine = !pass ? t('inspection.retry') : r.stars < 3 ? t('inspection.more', { n: r.stars + 1 }) : t('inspection.top');
    d.text(rsNext, nextLine);
    d.text(keepTxt, t('inspection.keep'));
    d.attr(keep, 'aria-label', t('inspection.keep'));
    d.flag(toTransfer, 'hidden', best >= 1 ? null : '');
    d.text(transferTxt, t('inspection.transfer'));
    d.attr(toTransfer, 'aria-label', t('inspection.transfer'));
  };

  // ------------------------------------------------------------------ events
  const offs = [
    offCtl,
    ctx.onEvent(e => {
      if (e.type === 'inspectionResult') { follow = false; ctx.panel.set('inspection'); }
      else if (e.type === 'inspectorAt' && follow) followNow();
    }),
    ctx.panned.on(() => { follow = false; }),
  ];

  let acc = WRITE_MS, fAcc = 0;
  return {
    update(dt) {
      const w = ctx.w, ph = w.inspection.phase;
      if (follow && ph === 'walking') { fAcc += dt; if (fAcc >= 0.1) { fAcc = 0; followNow(); } }
      acc += dt * 1000;
      if (acc >= WRITE_MS) {
        acc = 0;
        const show = relevant();
        d.flag(btn, 'hidden', show ? null : '');
        const left = Math.max(0, INSPECTION.walkSec * 1000 - (w.rtMs - w.inspection.startMs));
        const canCall = show && ph === 'idle' && !inspectionBlock(w);
        d.flag(btnDot, 'hidden', canCall ? null : '');
        d.cls(btn, 'm5-pulse', ph === 'result' && ctx.panel.get() !== 'inspection');
        d.cls(btn, 'live', ph === 'walking');
        d.text(btnNum, ph === 'walking' ? clockStr(left) : '');
        d.flag(btnNum, 'hidden', ph === 'walking' ? null : '');
        d.attr(btn, 'aria-label', ph === 'walking' ? `${t('inspection.walking')} ${clockStr(left)}` : ph === 'result' ? t('inspection.resultTitle') : canCall ? `${t('inspection.title')} – ${t('inspection.ready')}` : t('inspection.title'));
        // walk banner
        d.flag(walk, 'hidden', ph === 'walking' ? null : '');
        if (ph === 'walking') {
          d.text(walkTxt, t('inspection.walking'));
          walkBar.set(1 - left / (INSPECTION.walkSec * 1000));
          d.text(walkNum, clockStr(left));
          d.text(walkAct, t(follow ? 'inspection.following' : 'inspection.follow'));
          d.cls(walkAct, 'on', follow);
          d.attr(walk, 'aria-label', `${t('inspection.walking')} ${clockStr(left)} – ${t(follow ? 'inspection.following' : 'inspection.follow')}`);
          d.attr(walk, 'aria-pressed', follow ? 'true' : 'false');
        }
      }
      if (fc.tick(dt)) renderForecast();
      if (rs.tick(dt)) renderResult();
      // a result screen without a result (e.g. after a load) closes itself
      if (ctx.panel.get() === 'inspection' && ph !== 'result' && !w.inspection.last) ctx.panel.set(null);
    },
    destroy() { for (const o of offs) o(); fc.destroy(); rs.destroy(); btn.remove(); walk.remove(); },
  };
}
