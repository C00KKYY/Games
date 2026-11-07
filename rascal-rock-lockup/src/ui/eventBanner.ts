/**
 * Shenanigan banner (Brief §3.12, docs/M5_DESIGN.md §12.8): while a director event runs, a small non-blocking chip under
 * the topbar – food fight: tumult meter (director.ts foodFightMeter01, fills in 20 s) + "Tap the brawlers!" + count of
 * brawlers left; spoon tunnel: "Catch the escapee!" + number on the run; Cat Burglar announced / on the next ferry;
 * ruckus (no button: nothing to tap, just the reason and the time left). A tap on a chip flies the camera to the event
 * (ctx.focusTile). Never a modal, never pauses, hidden during the tutorial.
 * Also: the morning-VIP teaser plaque at the dock (vip.ts vipBoard: "Tomorrow: the infamous Cat Burglar arrives!"),
 * and the shared M5 layout pass (m5kit.ts: --m5-top / --m5-bot, rail and banner visibility).
 * Owner: ui-m5. Texts: src/i18n/parts/eventBanner.{en,de}.json.
 */
import type { UICtx, Component } from './ctx';
import { AF, type Agent } from '../sim/types';
import { domKit, WRITE_MS } from './buildbar';
import { banners, bar, layoutVars, syncBanners, syncRail } from './m5kit';
import { foodFightMeter01 } from '../sim/director';
import { vipBoard } from '../sim/vip';
import { roomById } from '../sim/world';
import { DIRECTOR } from '../content/balance';
import { FERRY_POS } from '../content/site1';
import { VIP_BOARD_TOP } from '../render/progressView';

const LAYOUT_MS = 500;

export function mountEventBanner(ctx: UICtx): Component {
  const d = domKit(ctx);
  const { t } = ctx;
  const stack = banners(ctx);

  const chip = (cls: string, icon: string, button: boolean) => {
    const el = button ? d.button(`m5-ban ${cls}`, stack, () => go(el)) : d.h('div', `m5-ban quiet ${cls}`, stack);
    d.img(ctx.icon(icon), el);
    const txt = d.h('span', 'm5-ban-txt', el);
    const num = d.h('span', 'm5-ban-num', el);
    el.hidden = true;
    return { el, txt, num };
  };
  const food = chip('bad ev-food', 'meal', true);
  const meter = bar(d, food.el, 'coral');
  food.el.insertBefore(meter.el, food.num);
  const tunnel = chip('bad ev-tunnel', 'gate', true);
  const vip = chip('ev-vip', 'ferry', true);
  const ruckus = chip('ev-ruckus', 'mood', false);

  // world plaque at the dock: the morning-VIP teaser (Brief §5.4) – text only, no button
  const plaque = d.h('div', 'm5-plaque');
  plaque.dataset.overlay = '1';
  plaque.hidden = true;
  // G2: the brief headline stays word for word; a sub-line says it means the player's tomorrow, not the next game day
  const plaqueMain = d.h('span', 'm5-plaque-main', plaque);
  const plaqueSub = d.h('span', 'm5-plaque-sub', plaque);
  ctx.root.appendChild(plaque);

  const escapees = (): Agent[] => ctx.w.agents.filter(a => a.state === 'escaping');
  const brawlers = () => ctx.w.agents.filter(a => a.state === 'brawling').length;
  const foodRoom = () => roomById(ctx.w, ctx.w.director.data.foodRoom ?? -1);
  const vipComing = () => !!ctx.w.director.data.vipNext;

  function go(el: HTMLElement) {
    if (el === food.el) { const r = foodRoom(); if (r) ctx.focusTile(r.x + r.w / 2, r.y + r.h / 2); return; }
    if (el === tunnel.el) {
      const es = escapees();
      // nearest to the current view centre first, the next tap cycles to the next one
      if (es.length) { const a = es[cycle++ % es.length]; ctx.focusTile(a.x, a.y, Math.max(ctx.cam.zoom, 1.2)); }
      return;
    }
    if (el === vip.el) ctx.focusTile(FERRY_POS.x + 1.5, FERRY_POS.y - 1.5);
  }
  let cycle = 0;

  d.tip(food.el, () => ({ title: t('eventBanner.foodTitle'), body: t('eventBanner.foodBody', { sec: DIRECTOR.foodFightFillSec }) }));
  d.tip(tunnel.el, () => ({ title: t('eventBanner.tunnelTitle'), body: t('eventBanner.tunnelBody') }));
  d.tip(vip.el, () => ({ title: t('eventBanner.vipTitle'), body: t('eventBanner.vipBody') }));

  let acc = WRITE_MS, lay = LAYOUT_MS;
  const render = () => {
    const w = ctx.w;
    const tut = !w.tutorial.done;
    // food fight
    const isFood = !tut && w.director.active === 'food';
    d.flag(food.el, 'hidden', isFood ? null : '');
    if (isFood) {
      const n = brawlers();
      meter.set(foodFightMeter01(w));
      d.text(food.txt, t('eventBanner.food'));
      d.text(food.num, t('eventBanner.left', { n }));
      d.attr(food.el, 'aria-label', `${t('eventBanner.food')} – ${t('eventBanner.left', { n })}. ${t('eventBanner.flyTo')}`);
    }
    // escapees (spoon tunnel or any escape attempt)
    const es = tut ? [] : escapees();
    d.flag(tunnel.el, 'hidden', es.length ? null : '');
    if (es.length) {
      d.text(tunnel.txt, t('eventBanner.tunnel'));
      d.text(tunnel.num, es.length > 1 ? `×${es.length}` : '');
      d.attr(tunnel.el, 'aria-label', `${t('eventBanner.tunnel')} (${es.length}). ${t('eventBanner.flyTo')}`);
    }
    // Cat Burglar on the next ferry (director VIP or morning VIP)
    const v = !tut && vipComing();
    d.flag(vip.el, 'hidden', v ? null : '');
    if (v) {
      d.text(vip.txt, t('eventBanner.vip'));
      d.text(vip.num, '');
      d.attr(vip.el, 'aria-label', `${t('eventBanner.vip')}. ${t('eventBanner.flyTo')}`);
    }
    // ruckus: an explanation only (nothing to tap)
    const rk = !tut && w.director.active === 'ruckus';
    d.flag(ruckus.el, 'hidden', rk ? null : '');
    if (rk) {
      const left = Math.max(0, Math.ceil((DIRECTOR.ruckusDurationSec * 1000 - (w.rtMs - w.director.activeSinceMs)) / 1000));
      d.text(ruckus.txt, t('eventBanner.ruckus'));
      d.text(ruckus.num, t('eventBanner.sec', { n: left }));
    }
    // dock plaque (world-anchored): hidden / teaser / ready
    // a Cat Burglar announced for the next ferry or already on the island (director VIP): "Tomorrow …" would contradict
    // the banner – the board keeps its poster, the text plaque waits
    const vipNow = !!w.director.data.vipNext || w.agents.some(a => a.kind === 'vip' && !(a.flags & AF.gone));
    const board0 = tut ? 'hidden' : vipBoard(w);
    const board = board0 === 'teaser' && vipNow ? 'hidden' : board0;
    let showPlaque = board !== 'hidden';
    if (showPlaque) {
      d.text(plaqueMain, t(board === 'ready' ? 'progress.vip.ready' : 'progress.vip.teaser'));
      d.text(plaqueSub, board === 'ready' ? '' : t('progress.vip.teaserSub'));
      d.cls(plaqueSub, 'm5-hide-sub', board === 'ready');
      d.cls(plaque, 'ready', board === 'ready');
      // the text of the dock board art-m5 draws (render/progressView.ts): anchored on top of the board
      const p = ctx.cam.worldToScreen(VIP_BOARD_TOP.x * 32, VIP_BOARD_TOP.y * 32 - 4);
      const pw = plaque.offsetWidth || 160, ph = plaque.offsetHeight || 40;
      const x = Math.round(p.x - pw / 2), y = Math.round(p.y - ph);
      const top = parseFloat(ctx.root.style.getPropertyValue('--m5-top')) || 44, bot = parseFloat(ctx.root.style.getPropertyValue('--m5-bot')) || 0;
      // only while the dock itself is on screen; never under the top bar / build bar
      showPlaque = x > 4 && x + pw < window.innerWidth - 4 && y > top + 4 && y + ph < window.innerHeight - bot - 4;
      // …and never under a banner chip or the clipboard
      for (const el of ctx.root.querySelectorAll<HTMLElement>(':scope > .m5-banners:not([hidden]), .cb-card, .cb-chip, .m5-ret:not([hidden]), .m5p:not([hidden]), .tu-jit.on, .bb-menu:not([hidden])')) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && x < r.right && x + pw > r.left && y < r.bottom && y + ph > r.top) showPlaque = false;
      }
      if (showPlaque) d.style(plaque, 'transform', `translate3d(${x}px,${y}px,0)`);
    }
    d.flag(plaque, 'hidden', showPlaque ? null : '');
    syncBanners(ctx, d);
    syncRail(ctx, d);
  };

  layoutVars(ctx);
  return {
    update(dt) {
      lay += dt * 1000;
      if (lay >= LAYOUT_MS) { lay = 0; layoutVars(ctx); }
      acc += dt * 1000;
      if (acc < WRITE_MS) return;
      acc = 0;
      render();
    },
    destroy() { stack.remove(); plaque.remove(); ctx.root.querySelector(':scope > .m5-rail')?.remove(); },
  };
}
