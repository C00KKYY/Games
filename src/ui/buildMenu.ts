/**
 * Rooms menu (docs/UI_DESIGN.md §3): overlay card above the build bar, open while ctx.menu === 'rooms'.
 * One card per buildable room type: icon, name, price rule + price at minimum size, minimum size, capacity rule,
 * staff role, lock + reason. Click → ctx.tool.set({kind:'build', type}) and the menu closes.
 */
import type { UICtx, Component } from './ctx';
import { ROOM_ICON, ROLE_ICON } from './ctx';
import { ROOMS, roomCost, roomSlots, RATE, NEEDS, ECON, GUARD_RADIUS, type RoomType } from '../content/balance';
import { OBJECTIVES } from '../sim/objectives';
import { domKit, menuShell, BUILDABLE } from './buildbar';

interface Card {
  type: RoomType; b: HTMLButtonElement; name: HTMLElement; cost: HTMLElement; costNum: HTMLElement; from: HTMLElement;
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
      const goal = t(`obj.${o.id}`);
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
    const cost = d.h('span', 'bb-line bb-cost', b);
    d.img(ctx.icon('coin'), cost, 'bb-li');
    const costNum = d.h('span', 'num', cost);
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
    return { type, b, name, cost, costNum, from, size, cap, staff, staffIc, staffTxt, lock, lockTxt };
  });

  const render = () => {
    const w = ctx.w;
    d.text(shell.sub, ctx.touch ? t('buildbar.roomsHintTouch') : t('buildbar.roomsHint'));
    const tool = ctx.tool.get();
    for (const c of cards) {
      const R = ROOMS[c.type];
      const unlocked = !!w.unlocked[c.type];
      const price = minCost(c.type);
      const poor = unlocked && w.coins < price;
      const name = t(`room.${c.type}`);
      d.text(c.name, name);
      d.text(c.costNum, costRule(c.type));
      d.text(c.from, t('buildbar.from', { n: ctx.fmt(price) }));
      d.cls(c.cost, 'bad', poor);
      d.cls(c.from, 'bad', poor);
      d.text(c.size, t('buildbar.minSize', { w: R.minW, h: R.minH }));
      d.text(c.cap, capRule(c.type));
      d.text(c.staffTxt, R.staff ? t('buildbar.staffNeed', { role: t(`staff.${R.staff}`) }) : t('buildbar.staffNone'));
      d.cls(c.staff, 'bb-muted', !R.staff);
      d.cls(c.staffIc, 'bb-hide', !R.staff);
      d.cls(c.b, 'locked', !unlocked);
      d.cls(c.lock, 'bb-hide', unlocked);
      d.cls(c.b, 'on', tool.kind === 'build' && tool.type === c.type);
      if (!unlocked) d.text(c.lockTxt, lockReason(c.type));
      d.attr(c.b, 'aria-disabled', unlocked ? 'false' : 'true');
      d.attr(c.b, 'aria-label', unlocked
        ? `${name}: ${costRule(c.type)}, ${t('buildbar.from', { n: ctx.fmt(price) })}${poor ? ` – ${t('place.coins')}` : ''}`
        : `${name}: ${t('buildbar.locked')} – ${lockReason(c.type)}`);
    }
  };

  return {
    update(dt) { if (shell.tick(dt)) { render(); shell.fit(); } },
    destroy() { shell.destroy(); },
  };
}
