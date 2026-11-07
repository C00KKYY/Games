/**
 * Rooms menu (docs/UI_DESIGN.md §3): overlay card above the build bar, open while ctx.menu === 'rooms'.
 * One card per buildable room type: icon, name, price rule + price at minimum size, minimum size, capacity rule,
 * staff role, lock + reason. Click → ctx.tool.set({kind:'build', type}) and the menu closes.
 */
import type { UICtx, Component } from './ctx';
import { ROOM_ICON, ROLE_ICON } from './ctx';
import { ROOMS, roomCost, roomSlots, RATE, NEEDS, ECON, GUARD_RADIUS, PARCELS, type RoomType } from '../content/balance';
import { OBJECTIVES } from '../sim/objectives';
import { domKit, menuShell, BUILDABLE } from './buildbar';
import { buildGoal } from './guide';

/** window event: open the Rooms menu with the land card in view (tools.ts sends it on a tap on a "for sale" sign) */
export const SHOW_LAND_EVENT = 'rrl-show-land';

interface Card {
  type: RoomType; b: HTMLButtonElement; name: HTMLElement; why: HTMLElement; goal: HTMLElement; cost: HTMLElement; costNum: HTMLElement; from: HTMLElement;
  size: HTMLElement; cap: HTMLElement; staff: HTMLElement; staffIc: HTMLImageElement; staffTxt: HTMLElement; lock: HTMLElement; lockTxt: HTMLElement;
}

export function mountBuildMenu(ctx: UICtx): Component {
  const d = domKit(ctx);
  const { t } = ctx;
  const shell = menuShell(ctx, d, 'rooms', 'rooms', 'buildbar.roomsTitle');
  const row = d.h('div', 'bb-row', shell.body);

  /** why a room type is still locked – derived from where the sim sets w.unlocked[type] */
  const lockReason = (type: RoomType): string => {
    const o = OBJECTIVES.find(x => x.unlocks?.includes(type));
    if (o) {
      const goal = t(`obj.${o.id}`);   // the short base wording: the lock line stays a label (< 6 words)
      if (o.target > 1) return t('buildbar.lockObjProg', { goal, p: Math.min(o.target, Math.floor(o.progress(ctx.w))), t: o.target });
      return t('buildbar.lockObj', { goal });
    }
    if (type === 'workshop') return t('buildbar.lockTutorial');      // objectives.ts endTutorial
    if (type === 'guard') return t('buildbar.lockTunnel');           // director.ts startTunnel
    return t('place.locked');
  };
  const minCost = (type: RoomType) => roomCost(type, ROOMS[type].minW, ROOMS[type].minH);
  const costRule = (type: RoomType) => {
    const R = ROOMS[type];
    return R.perTile ? t('buildbar.cost', { base: ctx.fmt(R.baseCost), per: ctx.fmt(R.perTile) }) : t('buildbar.costFlat', { base: ctx.fmt(R.baseCost) });
  };
  const capRule = (type: RoomType) => (type === 'guard' ? t('buildbar.cap.guard', { n: GUARD_RADIUS }) : t(`buildbar.cap.${type}`, { n: ROOMS[type].tilesPerSlot }));
  const effect = (type: RoomType) => {
    const R = ROOMS[type];
    switch (type) {
      case 'bunk': return t('buildbar.eff.bunk', { n: NEEDS.energy.refillPerHourInBed, c: ECON.boardPerBedHour });
      case 'canteen': return t('buildbar.eff.canteen', { n: RATE.canteenMealsPerSeat, s: R.perStaff ?? 0 });
      case 'wash': return t('buildbar.eff.wash', { n: NEEDS.hygiene.refill });
      case 'workshop': return t('buildbar.eff.workshop', { h: Math.round(1 / RATE.workshopCratesPerStation), c: ECON.crateValue, r: RATE.reformWorkshop, s: R.perStaff ?? 0 });
      case 'classroom': return t('buildbar.eff.classroom', { n: RATE.reformClass, s: R.perStaff ?? 0 });
      case 'guard': return t('buildbar.eff.guard', { r: GUARD_RADIUS });
      case 'yard': return t('buildbar.eff.yard', { n: NEEDS.fun.refillPerHourInYard });
      default: return '';
    }
  };
  const smallest = (type: RoomType) => {
    const R = ROOMS[type];
    if (!R.tilesPerSlot) return t('buildbar.smallestFixed', { w: R.minW, h: R.minH, cost: ctx.fmt(minCost(type)) });
    return t('buildbar.smallest', { w: R.minW, h: R.minH, cost: ctx.fmt(minCost(type)), slots: t(`buildbar.slots.${type}`, { n: roomSlots(type, R.minW, R.minH) }) });
  };

  const cards: Card[] = BUILDABLE.map(type => {
    const b = d.button('bb-card', row, () => {
      if (!ctx.w.unlocked[type]) { ctx.toast(lockReason(type), { kind: 'info', icon: ROOM_ICON[type], ms: 2200 }); return; }
      ctx.tool.set({ kind: 'build', type });
      ctx.menu.set(null);
    });
    b.dataset.room = type;
    const top = d.h('span', 'bb-card-top', b);
    const plaque = d.h('span', 'bb-plaque', top);
    d.img(ctx.icon(ROOM_ICON[type] ?? 'rooms'), plaque);
    const name = d.h('span', 'bb-name', top);
    // G2: what the room is FOR, visible without hover (touch never sees the tooltip); the goal room gets a GOAL tag
    const why = d.h('span', 'bb-line bb-why', b);
    const cost = d.h('span', 'bb-line bb-cost', b);
    d.img(ctx.icon('coin'), cost, 'bb-li');
    const costNum = d.h('span', 'num', cost);
    const goal = d.h('span', 'bb-goal', cost);
    goal.setAttribute('aria-hidden', 'true');
    const sizeLine = d.h('span', 'bb-line bb-sizeline', b);
    const size = d.h('span', '', sizeLine);
    const from = d.h('span', 'bb-from', sizeLine);
    const cap = d.h('span', 'bb-line', b);
    const staff = d.h('span', 'bb-line bb-staffline', b);
    const staffIc = d.img(ctx.icon(ROOMS[type].staff ? ROLE_ICON[ROOMS[type].staff!] : 'staff'), staff, 'bb-li');
    const staffTxt = d.h('span', '', staff);
    const lock = d.h('span', 'bb-lock', b);
    d.img(ctx.icon('lock'), lock, 'bb-lock-ic');
    const lockTxt = d.h('span', 'bb-lock-txt', lock);
    d.tip(b, () => {
      const lines = [effect(type), smallest(type), `${costRule(type)} · ${capRule(type)}`];
      if (!ctx.w.unlocked[type]) lines.unshift(`${t('buildbar.locked')}: ${lockReason(type)}`); // reason first when locked
      else {
        const short = minCost(type) - ctx.w.coins;
        if (short > 0) lines.push(t('buildbar.short', { n: ctx.fmt(Math.ceil(short)) }));
        lines.push(ctx.touch ? t('buildbar.roomsHintTouch') : t('buildbar.roomsHint'));
      }
      return { title: t(`room.${type}`), body: lines.join('\n') };
    });
    return { type, b, name, why, goal, cost, costNum, from, size, cap, staff, staffIc, staffTxt, lock, lockTxt };
  });

  // ---- land (Brief §3.1 "Parzellen kaufen", §4.2 12:00–14:00): the next parcel for sale, bought with a two-step tap
  const land = d.h('div', 'bb-card bb-land', row);
  land.dataset.room = 'land';
  const lTop = d.h('span', 'bb-card-top', land);
  const lPlaque = d.h('span', 'bb-plaque', lTop);
  d.img(ctx.icon('rooms'), lPlaque);
  const lName = d.h('span', 'bb-name', lTop);
  const lWhy = d.h('span', 'bb-line bb-why', land);
  const lSize = d.h('span', 'bb-line', land);
  const lBtn = d.button('bb-hire bb-buyland', land, () => {
    const k = nextParcel();
    if (k < 0) return;
    const price = PARCELS[k].price;
    if (ctx.w.coins < price) { ctx.toast(t('buildbar.short', { n: ctx.fmt(Math.ceil(price - ctx.w.coins)) }), { kind: 'info', icon: 'coin', ms: 2200 }); return; }
    if (performance.now() > armedUntil) { armedUntil = performance.now() + 4000; render(); return; }
    armedUntil = 0;
    const r = ctx.cmd.buyParcel(ctx.w, k);
    if (!r.ok) { ctx.feedback(r); return; }
    const p = PARCELS[k];
    ctx.menu.set(null);
    ctx.focusTile(p.x + p.w / 2, p.y + p.h / 2);
  });
  d.img(ctx.icon('coin'), lBtn, 'bb-li');
  const lBtnTxt = d.h('span', '', lBtn);
  let armedUntil = 0;
  /** cheapest parcel not owned yet (-1: all bought) */
  const nextParcel = () => { let best = -1; PARCELS.forEach((p, k) => { if (k > 0 && !ctx.w.parcels[k] && (best < 0 || p.price < PARCELS[best].price)) best = k; }); return best; };
  d.tip(lBtn, () => {
    const k = nextParcel(); if (k < 0) return { title: t('buildbar.land'), body: t('buildbar.landAll') };
    const p = PARCELS[k], short = p.price - ctx.w.coins;
    return { title: t('buildbar.landBuy', { n: ctx.fmt(p.price) }), body: [t('buildbar.landTip', { w: p.w, h: p.h }), short > 0 ? t('buildbar.short', { n: ctx.fmt(Math.ceil(short)) }) : t('buildbar.landConfirmTip')].join('\n') };
  });
  /** open the menu with the land card in view (a tap on a "for sale" sign, tools.ts) */
  let showLand = false;
  const onShowLand = () => { showLand = true; goalShownFor = ''; };
  window.addEventListener(SHOW_LAND_EVENT, onShowLand);
  let goalShownFor = '';

  const render = () => {
    const w = ctx.w;
    d.text(shell.sub, ctx.touch ? t('buildbar.roomsHintTouch') : t('buildbar.roomsHint'));
    const tool = ctx.tool.get();
    const bg = buildGoal(w);
    const goalType = bg && bg.unlocked ? bg.type : null;
    for (const c of cards) {
      const R = ROOMS[c.type];
      const unlocked = !!w.unlocked[c.type];
      const price = minCost(c.type);
      const poor = unlocked && w.coins < price;
      const name = t(`room.${c.type}`);
      d.text(c.name, name);
      d.text(c.why, t(`buildbar.why.${c.type}`));
      d.cls(c.b, 'goal', c.type === goalType);
      d.text(c.goal, t('buildbar.goalTag'));
      d.text(c.costNum, t('buildbar.from', { n: ctx.fmt(price) }));
      d.cls(c.from, 'bb-hide', true);
      d.cls(c.cost, 'bad', poor);
      d.cls(c.from, 'bad', poor);
      d.text(c.size, t('buildbar.minSize', { w: R.minW, h: R.minH }));
      d.cls(c.cap, 'bb-hide', true);   // capacity rule: in the tooltip (G2: the card says what the room is for instead)
      d.text(c.staffTxt, R.staff ? t('buildbar.staffNeed', { role: t(`staff.${R.staff}`) }) : t('buildbar.staffNone'));
      d.cls(c.staff, 'bb-muted', !R.staff);
      d.cls(c.staffIc, 'bb-hide', !R.staff);
      d.cls(c.b, 'locked', !unlocked);
      d.cls(c.lock, 'bb-hide', unlocked);
      d.cls(c.b, 'on', tool.kind === 'build' && tool.type === c.type);
      if (!unlocked) d.text(c.lockTxt, lockReason(c.type));
      d.attr(c.b, 'aria-disabled', unlocked ? 'false' : 'true');
      d.attr(c.b, 'aria-label', unlocked
        ? `${name}: ${t(`buildbar.why.${c.type}`)}. ${costRule(c.type)}, ${t('buildbar.from', { n: ctx.fmt(price) })}${poor ? ` – ${t('place.coins')}` : ''}`
        : `${name}: ${t('buildbar.locked')} – ${lockReason(c.type)}`);
    }
    // land card
    const k = nextParcel();
    d.cls(land, 'bb-hide', k < 0 || !w.tutorial.done);
    if (k >= 0) {
      const p = PARCELS[k], armed = performance.now() < armedUntil;
      d.text(lName, t('buildbar.land'));
      d.text(lWhy, t('buildbar.why.land'));
      d.text(lSize, t('buildbar.landSize', { w: p.w, h: p.h }));
      d.text(lBtnTxt, armed ? t('buildbar.landConfirm', { n: ctx.fmt(p.price) }) : t('buildbar.landBuy', { n: ctx.fmt(p.price) }));
      d.cls(lBtn, 'armed', armed);
      d.cls(lBtn, 'bad', w.coins < p.price);
      d.attr(lBtn, 'aria-label', armed ? t('buildbar.landConfirm', { n: ctx.fmt(p.price) }) : t('buildbar.landBuy', { n: ctx.fmt(p.price) }));
    }
  };
  /** bring the goal card (or the land card after a sign tap) into view once per opening – narrow sheets scroll sideways.
   *  Runs after shell.fit(): the sheet gets narrower beside the clipboard only then. */
  const scrollIn = () => {
    const bg = buildGoal(ctx.w);
    const goalType = bg && bg.unlocked ? bg.type : null;
    if (shell.open()) {
      const want = showLand ? land : goalType ? cards.find(c => c.type === goalType)?.b : null;
      const key = showLand ? 'land' : goalType ?? '';
      if (want && key !== goalShownFor) {
        const sc = want.closest<HTMLElement>('.bb-scroll');
        if (sc) {
          const b = want.getBoundingClientRect(), rb = sc.getBoundingClientRect();
          if (b.width > 0 && (b.left < rb.left - 0.5 || b.right > rb.right + 0.5)) sc.scrollLeft += b.right > rb.right ? b.right - rb.right + 8 : b.left - rb.left - 8;
          else if (b.width > 0) { goalShownFor = key; showLand = false; }
        }
      }
    } else { goalShownFor = ''; if (ctx.menu.get() !== 'rooms') showLand = false; }
  };

  return {
    update(dt) { if (shell.tick(dt)) { render(); shell.fit(); scrollIn(); } },
    destroy() { window.removeEventListener(SHOW_LAND_EVENT, onShowLand); shell.destroy(); },
  };
}
