/**
 * Return panel + catch-up chip (Brief §3.15, §12.3 B1 "Rückkehr-Panel"; docs/M5_DESIGN.md §12.6). Owner: ui-m5.
 *  - NON-pausing card over the running world while w.offline.pending exists: "While you were away", the coins counting
 *    up from 0, how long, at which efficiency (leads raise it) and whether the cap cut it (perks raise it);
 *    "Collect" → cmd.collectOffline. No ×2 in the BASIC build (that is FULL-only, M6+). Esc collects as well.
 *  - "Catching up…" mini chip in the banner stack while the app re-simulates a 60 s – 5 min absence (ctx.catchUp).
 * Texts: src/i18n/parts/returnPanel.{en,de}.json + progress.awayTitle, progress.catchingUp.
 */
import type { UICtx, Component } from './ctx';
import { domKit, WRITE_MS } from './buildbar';
import { banners } from './m5kit';

const COUNT_S = 1.4;

export function mountReturnPanel(ctx: UICtx): Component {
  const d = domKit(ctx);
  const { t } = ctx;

  const card = d.h('div', 'm5-ret');
  card.dataset.overlay = '1';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-live', 'polite');
  if (ctx.touch) card.classList.add('m5-touch');
  card.hidden = true;
  const title = d.h('h2', 'm5-title', card);
  const coins = d.h('div', 'm5-ret-coins', card);
  d.img(ctx.icon('coin'), coins);
  const coinNum = d.h('span', 'num', coins);
  const away = d.h('p', 'm5-p', card);
  const eff = d.h('p', 'm5-p', card);
  const capLine = d.h('p', 'm5-p', card);
  const collect = d.button('m5-btn gold ret-collect', card, () => doCollect());
  d.img(ctx.icon('coin'), collect);
  const collectTxt = d.h('span', '', collect);
  d.tip(collect, () => ({ title: t('returnPanel.collect'), body: t('returnPanel.collectBody', { n: ctx.fmt(ctx.w.offline.pending?.coins ?? 0) }), hotkey: 'Esc' }));
  ctx.root.appendChild(card);

  // catch-up chip (no button: nothing to do but wait a moment)
  const chip = d.h('div', 'm5-ban quiet ret-catch', banners(ctx));
  d.img(ctx.icon('clock'), chip);
  const chipTxt = d.h('span', 'm5-ban-txt', chip);
  const chipNum = d.h('span', 'm5-ban-num', chip);
  chip.hidden = true;

  function doCollect() {
    const r = ctx.cmd.collectOffline(ctx.w);
    if (!r.ok) { ctx.feedback(r); return; }
    ctx.sound('coin3');
  }
  const onKey = (e: KeyboardEvent) => {
    if (card.hidden || e.key !== 'Escape' || e.defaultPrevented) return;
    // only when nothing else is open: Esc closes the top-most thing first (menu, tool, selection, panel)
    if (ctx.menu.get() || ctx.panel.get() || ctx.tool.get().kind !== 'none' || ctx.selection.get()) return;
    e.preventDefault();
    doCollect();
  };
  window.addEventListener('keydown', onKey, true);

  const dur = (ms: number) => {
    const m = Math.max(1, Math.round(ms / 60_000));
    if (m < 60) return t('returnPanel.m', { m });
    return m % 60 ? t('returnPanel.hm', { h: Math.floor(m / 60), m: m % 60 }) : t('returnPanel.h', { h: m / 60 });
  };

  // the resim of a 60 s – 5 min absence takes only a few frames (≤ 300 ticks each): the chip stays up for HOLD_MS after
  // it started, ending on "Caught up – N min played", so the player sees the absence was played and not lost
  const HOLD_MS = 1800;
  let holdUntil = 0, caughtMs = 0;
  const offCatch = ctx.catchUp.on((v, prev) => {
    if (v && v.mode === 'catchup' && !(prev && prev.mode === 'catchup')) { holdUntil = performance.now() + HOLD_MS; caughtMs = 0; }
    if (v && v.mode === 'catchup') caughtMs = Math.max(caughtMs, v.awayMs ?? v.total * 100);
  });

  let shownFor: number | null = null, k = 0, acc = WRITE_MS;
  return {
    update(dt) {
      const p = ctx.w.offline.pending;
      if (p && shownFor !== p.coins) { shownFor = p.coins; k = 0; acc = WRITE_MS; }
      if (!p) shownFor = null;
      if (p && k < 1) k = Math.min(1, k + dt / COUNT_S);
      acc += dt * 1000;
      if (acc < WRITE_MS) return;
      acc = 0;
      d.flag(card, 'hidden', p ? null : '');
      d.cls(card, 'm5-compact', ctx.compact.get());
      // below the banner stack while it shows more than one chip (e.g. "Caught up" + an event): no chip under the card
      let topPx = '';
      const ban = ctx.root.querySelector<HTMLElement>(':scope > .m5-banners');
      if (p && ban && !ban.hidden && !ban.classList.contains('m5-away')) {
        const b = ban.getBoundingClientRect(), tb = ctx.root.querySelector<HTMLElement>('[data-hud="top"]')?.getBoundingClientRect();
        const def = (tb?.bottom ?? 44) + (ctx.compact.get() ? 2.8 : 3.4) * 16;
        if (b.height > 0 && b.bottom + 6 > def) topPx = `${Math.round(b.bottom + 6)}px`;
      }
      d.style(card, 'top', topPx);
      if (p) {
        const e = 1 - Math.pow(1 - k, 3);
        d.text(title, t('progress.awayTitle'));
        d.text(coinNum, `+${ctx.fmt(Math.round(p.coins * e))}`);
        d.attr(coins, 'aria-label', `+${ctx.fmt(p.coins)}`);
        d.text(away, t('returnPanel.away', { time: dur(p.awayMs) }));
        d.text(eff, t('returnPanel.eff', { pct: p.effPct }));
        d.flag(capLine, 'hidden', p.capped ? null : '');
        d.text(capLine, t('returnPanel.capped', { time: dur(p.capMs) }));
        d.text(collectTxt, t('returnPanel.collect'));
        d.attr(collect, 'aria-label', `${t('returnPanel.collect')} +${ctx.fmt(p.coins)}`);
        d.attr(card, 'aria-label', t('progress.awayTitle'));
      }
      const cu = ctx.catchUp.get();
      const running = !!cu && cu.mode === 'catchup' && cu.total > 0;
      const on = running || performance.now() < holdUntil;
      d.flag(chip, 'hidden', on ? null : '');
      if (running) {
        d.text(chipTxt, t('progress.catchingUp'));
        d.text(chipNum, t('returnPanel.pct', { n: Math.floor((1 - cu.left / cu.total) * 100) }));
      } else if (on) {
        d.text(chipTxt, t('returnPanel.caughtUp', { time: dur(caughtMs) }));
        d.text(chipNum, '');
      }
    },
    destroy() { offCatch(); window.removeEventListener('keydown', onKey, true); card.remove(); chip.remove(); },
  };
}
