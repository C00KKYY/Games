/**
 * Transfer + perk shop (Brief §3.17, §12.3 B1 "Versetzung"; docs/M5_DESIGN.md §12.5). Owner: ui-m5. PAUSING dialog.
 *  - Opened from the inspection result ("Transfer…"), the clipboard follow-up "Transfer to a new lockup", and the key
 *    counter in the HUD rail (shown once the player has a golden key or a perk).
 *  - Transfer section (after a passed inspection): what resets / what stays, the key preview (transferKeys), the target
 *    from transferTargets() – in M5 "Fresh start at Puddlebrook Lockup" – and a two-step confirm → cmd.transfer.
 *    Gullrock Lighthouse shows as an unlocked silhouette, without a button and without any promise (H6).
 *    Before a pass: one line that says how to get there, no button.
 *  - Perk shop: 6 perks, level dots, effect, next cost in keys → cmd.buyPerk (an unaffordable Buy answers with the
 *    reason, so it is never a dead button); maxed perks show "Max".
 * Texts: src/i18n/parts/transfer.{en,de}.json + progress.perk*, progress.site.*.
 */
import type { UICtx, Component } from './ctx';
import type { PerkId } from '../sim/types';
import { domKit, WRITE_MS } from './buildbar';
import { panelShell, rail } from './m5kit';
import { M5_ICON } from './m5icons';
import { PERKS } from '../content/progress';
import { transferKeys, transferTargets, perkNextCost } from '../sim/prestige';

interface PerkEls { id: PerkId; el: HTMLElement; name: HTMLElement; fx: HTMLElement; lv: HTMLElement[]; btn: HTMLButtonElement; btnTxt: HTMLElement }

export function mountTransfer(ctx: UICtx): Component {
  const d = domKit(ctx);
  const { t } = ctx;
  const shell = panelShell(ctx, d, 'transfer', { icon: M5_ICON.transfer, cls: 'tr' });

  // ------------------------------------------------------------------ rail: golden keys
  const keyBtn = d.button('m5-rbtn tr-keys', rail(ctx), () => ctx.panel.set(ctx.panel.get() === 'transfer' ? null : 'transfer'));
  keyBtn.style.order = '4';
  d.img(ctx.icon(M5_ICON.key), keyBtn);
  const keyNum = d.h('span', 'm5-rnum', keyBtn);
  keyBtn.hidden = true;
  d.tip(keyBtn, () => ({ title: t('transfer.keysTitle', { n: ctx.w.keys }), body: t('transfer.keysTip') }));

  // ------------------------------------------------------------------ transfer section
  const trH = d.h('h3', 'm5-h', shell.body);
  const notYet = d.h('div', 'm5-why', shell.body);
  d.img(ctx.icon('lock'), notYet);
  const notYetTxt = d.h('span', '', notYet);
  const trBox = d.h('div', 'tr-box', shell.body);
  const cols = d.h('div', 'tr-cols', trBox);
  const colReset = d.h('div', 'tr-col', cols);
  const resetH = d.h('div', 'm5-strong', colReset);
  const resetUl = d.h('ul', '', colReset);
  const colKeep = d.h('div', 'tr-col', cols);
  const keepH = d.h('div', 'm5-strong', colKeep);
  const keepUl = d.h('ul', '', colKeep);
  const keysLine = d.h('p', 'm5-p in-keyrow', trBox);
  const target = d.h('div', 'tr-target', trBox);
  d.img(ctx.icon('gate'), target);
  const targetT = d.h('div', 'm5-titles', target);
  const targetName = d.h('div', 'm5-strong', targetT);
  const targetSub = d.h('p', 'm5-p', targetT);
  const sil = d.h('div', 'tr-target silhouette', trBox);
  d.img(ctx.icon('check'), sil);
  const silT = d.h('div', 'm5-titles', sil);
  const silName = d.h('div', 'm5-strong', silT);
  const silSub = d.h('p', 'm5-p', silT);
  const row = d.h('div', 'm5-btnrow', trBox);
  const go = d.button('m5-btn gold tr-go', row, () => { if (!sure) { sure = true; shell.dirty(); return; } doTransfer(); });
  d.img(ctx.icon(M5_ICON.transfer), go);
  const goTxt = d.h('span', '', go);
  const cancel = d.button('m5-btn ghost tr-cancel', row, () => { sure = false; shell.dirty(); });
  const cancelTxt = d.h('span', '', cancel);
  d.tip(go, () => ({ title: t(sure ? 'transfer.yes' : 'transfer.go'), body: t('transfer.goBody', { n: transferKeys(ctx.w) }) }));
  d.tip(cancel, () => ({ title: t('transfer.cancel'), body: t('transfer.cancelBody') }));
  let sure = false;

  function doTransfer() {
    const to = transferTargets(ctx.w)[0];
    if (to === undefined) { ctx.feedback({ ok: false, reason: 'locked' }); return; }
    const n = transferKeys(ctx.w);
    const r = ctx.cmd.transfer(ctx.w, to);
    if (!r.ok) { ctx.feedback(r); return; }
    sure = false;
    ctx.sound('milestone');
    ctx.panel.set(null);
    ctx.toast(t('transfer.doneToast', { n, site: t(`progress.site.${to}`) }), { kind: 'good', icon: M5_ICON.key, ms: 4500 });
  }

  // ------------------------------------------------------------------ perk shop
  const perkH = d.h('h3', 'm5-h', shell.body);
  const perkIntro = d.h('p', 'm5-p', shell.body);
  const grid = d.h('div', 'tr-perks', shell.body);
  const perks: PerkEls[] = PERKS.map(p => {
    const el = d.h('div', 'tr-perk', grid);
    el.dataset.id = p.id;
    const name = d.h('span', 'tr-perk-name', el);
    const fx = d.h('span', 'tr-perk-fx', el);
    const lvBox = d.h('span', 'tr-perk-lv', el);
    const lv = Array.from({ length: p.max }, () => d.h('i', '', lvBox));
    const btn = d.button('m5-btn tr-buy', el, () => buy(p.id));
    d.img(ctx.icon(M5_ICON.key), btn);
    const btnTxt = d.h('span', '', btn);
    d.tip(btn, () => {
      const c = perkNextCost(ctx.w, p.id);
      if (c === null) return { title: t(`progress.perk.${p.id}`), body: `${t(`progress.perkFx.${p.id}`)}. ${t('transfer.maxBody')}` };
      const short = ctx.w.keys < c ? `\n${t('transfer.short', { n: c - ctx.w.keys })}` : '';
      return { title: t('transfer.buyTitle', { name: t(`progress.perk.${p.id}`), lv: (ctx.w.prestige.perks[p.id] ?? 0) + 1 }), body: `${t(`progress.perkFx.${p.id}`)}. ${t('transfer.buyBody', { n: c })}${short}` };
    });
    return { id: p.id, el, name, fx, lv, btn, btnTxt };
  });
  function buy(id: PerkId) {
    const r = ctx.cmd.buyPerk(ctx.w, id);
    if (!r.ok) { ctx.feedback(r); return; }
    ctx.sound('upgrade');
    shell.dirty();
  }
  const offPanel = ctx.panel.on(v => { if (v !== 'transfer') sure = false; });

  const render = () => {
    const w = ctx.w;
    d.text(shell.title, t('transfer.title'));
    d.text(shell.sub, t('transfer.sub', { n: w.keys }));
    const passed = w.inspection.best >= 1;
    const targets = transferTargets(w);
    d.text(trH, t('transfer.head'));
    d.flag(notYet, 'hidden', passed ? '' : null);
    d.text(notYetTxt, t('transfer.notYet'));
    d.flag(trBox, 'hidden', passed ? null : '');
    if (passed) {
      d.text(resetH, t('transfer.resets'));
      d.text(keepH, t('transfer.keeps'));
      const fill = (ul: HTMLElement, keys: string[]) => {
        const want = keys.map(k => t(k));
        if (ul.childElementCount !== want.length) { ul.textContent = ''; for (const _ of want) d.h('li', '', ul); }
        want.forEach((s, i) => d.text(ul.children[i] as HTMLElement, s));
      };
      fill(resetUl, ['transfer.r.coins', 'transfer.r.rooms', 'transfer.r.projects', 'transfer.r.goals']);
      fill(keepUl, ['transfer.k.keys', 'transfer.k.perks', 'transfer.k.mail', 'transfer.k.stars']);
      d.text(keysLine, t('transfer.keysGain', { n: transferKeys(w), stars: w.inspection.best }));
      const to = targets[0];
      d.flag(target, 'hidden', to !== undefined ? null : '');
      if (to !== undefined) {
        d.text(targetName, t('transfer.target', { site: t(`progress.site.${to}`) }));
        d.text(targetSub, t('transfer.targetSub'));
      }
      const site2 = w.prestige.completedSites.includes(1) && !targets.includes(2);
      d.flag(sil, 'hidden', site2 ? null : '');
      d.text(silName, t('progress.site.2'));
      d.text(silSub, t('transfer.unlocked'));
      d.flag(row, 'hidden', to !== undefined ? null : '');
      d.text(goTxt, t(sure ? 'transfer.yes' : 'transfer.go'));
      d.cls(go, 'sure', sure);
      d.attr(go, 'aria-label', t(sure ? 'transfer.yes' : 'transfer.go'));
      d.flag(cancel, 'hidden', sure ? null : '');
      d.text(cancelTxt, t('transfer.cancel'));
      d.attr(cancel, 'aria-label', t('transfer.cancel'));
    }
    d.text(perkH, t('transfer.perks'));
    d.text(perkIntro, t('transfer.perksIntro', { n: w.keys }));
    for (const p of perks) {
      const lvl = w.prestige.perks[p.id] ?? 0, c = perkNextCost(w, p.id);
      d.text(p.name, t(`progress.perk.${p.id}`));
      d.text(p.fx, t(`progress.perkFx.${p.id}`));
      p.lv.forEach((el, i) => d.cls(el, 'on', i < lvl));
      d.attr(p.lv[0].parentElement!, 'aria-label', t('transfer.level', { n: lvl, max: p.lv.length }));
      d.cls(p.el, 'max', c === null);
      d.text(p.btnTxt, c === null ? t('transfer.max') : t('transfer.buy', { n: c }));
      d.cls(p.btn, 'bad', c !== null && w.keys < c);
      d.cls(p.btn, 'locked', c === null);
      d.attr(p.btn, 'aria-disabled', c === null ? 'true' : 'false');
      d.attr(p.btn, 'aria-label', c === null ? `${t(`progress.perk.${p.id}`)} – ${t('transfer.max')}` : `${t('transfer.buy', { n: c })} – ${t(`progress.perk.${p.id}`)}`);
    }
  };

  let acc = WRITE_MS;
  return {
    update(dt) {
      acc += dt * 1000;
      if (acc >= WRITE_MS) {
        acc = 0;
        const w = ctx.w;
        const show = w.keys > 0 || Object.values(w.prestige.perks).some(v => (v ?? 0) > 0);
        d.flag(keyBtn, 'hidden', show ? null : '');
        d.text(keyNum, ctx.fmt(w.keys));
        d.attr(keyBtn, 'aria-label', t('transfer.keysTitle', { n: w.keys }));
      }
      if (shell.tick(dt)) render();
    },
    destroy() { offPanel(); shell.destroy(); keyBtn.remove(); },
  };
}
