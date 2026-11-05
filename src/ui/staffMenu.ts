/**
 * Staff menu (docs/UI_DESIGN.md §3): overlay card above the build bar, open while ctx.menu === 'staff'.
 * Per role: icon, name, number hired, what one does (numbers), wage per day of one more, "Hire +1 (fee)" → cmd.hire.
 * The hire button is aria-disabled with the reason when cmd.hire would refuse for lack of a room (sim.ts cmd.hire).
 */
import type { UICtx, Component } from './ctx';
import { ROLE_ICON } from './ctx';
import { ROOMS, RATE, GUARD_RADIUS, STAFF_ROOM, levelMult, type StaffRole, type RoomType } from '../content/balance';
import { staffOf, hireFee, defaultRoomFor, cartCapacity } from '../sim/staff';
import { roomsOf, roomById } from '../sim/world';
import { domKit, menuShell, nextWage, wagesPerDay } from './buildbar';

const ROLES: StaffRole[] = ['cook', 'janitor', 'teacher', 'foreman', 'guard', 'clerk', 'carter'];
/** janitor cleaning per game hour at staff level 1 (staff.ts staffTick: 30 · levelMult · PER_TICK · 4) */
const JANITOR_CLEAN_PER_H = 30 * 4;

interface Row {
  role: StaffRole; el: HTMLElement; name: HTMLElement; count: HTMLElement; does: HTMLElement; wage: HTMLElement; wageNum: HTMLElement;
  btn: HTMLButtonElement; btnTxt: HTMLElement; why: HTMLElement; whyTxt: HTMLElement;
}

export function mountStaffMenu(ctx: UICtx): Component {
  const d = domKit(ctx);
  const { t } = ctx;
  const shell = menuShell(ctx, d, 'staff', 'staff', 'buildbar.staffTitle');
  const row = d.h('div', 'bb-row', shell.body);
  const wagesEl = d.h('span', 'bb-wages', shell.extra);
  d.img(ctx.icon('coin'), wagesEl, 'bb-li');
  const wagesTxt = d.h('span', 'num', wagesEl);
  d.tip(wagesEl, () => ({ title: t('buildbar.wages', { n: ctx.fmt(Math.round(wagesPerDay(ctx))) }), body: t('buildbar.wageBody') }));

  /** null = hire allowed; otherwise the localised reason (mirrors the room checks in sim.ts cmd.hire) */
  const blocked = (role: StaffRole): string | null => {
    if (role === 'janitor') return null;
    const type: RoomType = STAFF_ROOM[role];
    const all = roomsOf(ctx.w, type);
    if (role === 'clerk' || role === 'carter') return all.length ? null : t(`buildbar.needs.${type}`);
    if (all.some(r => r.built)) return null;
    return all.length ? t('buildbar.building', { room: t(`room.${type}`) }) : t(`buildbar.needs.${type}`);
  };
  const does = (role: StaffRole) => {
    const type = STAFF_ROOM[role];
    switch (role) {
      case 'cook': case 'teacher': case 'foreman': return t(`buildbar.does.${role}`, { n: ROOMS[type].perStaff ?? 0 });
      case 'janitor': return t('buildbar.does.janitor', { n: Math.round(JANITOR_CLEAN_PER_H * levelMult(1)) });
      case 'guard': return t('buildbar.does.guard', { n: GUARD_RADIUS });
      case 'clerk': return t('buildbar.does.clerk', { n: RATE.gateSecPerRelease });
      case 'carter': return t('buildbar.does.carter', { n: cartCapacity(ctx.w) });
    }
  };
  const more = (role: StaffRole) => (role === 'foreman' ? t('buildbar.more.foreman', { n: Math.round(RATE.workshopNoForemanFactor * 100) }) : t(`buildbar.more.${role}`));
  const wageOf = (role: StaffRole) => Math.round(nextWage(ctx, role, defaultRoomFor(ctx.w, role)));

  const rows: Row[] = ROLES.map(role => {
    const el = d.h('div', 'bb-card bb-role', row);
    el.dataset.role = role;
    const top = d.h('span', 'bb-card-top', el);
    const plaque = d.h('span', 'bb-plaque', top);
    d.img(ctx.icon(ROLE_ICON[role]), plaque);
    const count = d.h('span', 'bb-count num', plaque);
    const name = d.h('span', 'bb-name', top);
    const desc = d.h('span', 'bb-does', el);
    const wage = d.h('span', 'bb-line', el);
    d.img(ctx.icon('coin'), wage, 'bb-li');
    const wageNum = d.h('span', '', wage);
    const btn = d.button('bb-hire', el, () => {
      const why = blocked(role);
      if (why) { ctx.toast(why, { kind: 'info', icon: ROLE_ICON[role], ms: 2200 }); return; }
      // success is confirmed by toasts.ts on the sim 'hire' event (same toast as the room panel's Hire +1)
      ctx.feedback(ctx.cmd.hire(ctx.w, role));
    });
    d.img(ctx.icon('coin'), btn, 'bb-li');
    const btnTxt = d.h('span', '', btn);
    const why = d.h('span', 'bb-why', el);
    d.img(ctx.icon('lock'), why, 'bb-lock-ic');
    const whyTxt = d.h('span', '', why);
    d.tip(count, () => ({ title: t(`staff.${role}`), body: t('buildbar.hiredLbl', { n: staffOf(ctx.w, role).length }) }));
    d.tip(btn, () => {
      const reason = blocked(role);
      const fee = ctx.fmt(hireFee(role)), wg = ctx.fmt(wageOf(role));
      const rid = defaultRoomFor(ctx.w, role);
      const room = rid ? roomById(ctx.w, rid) : undefined;
      const pay = room ? t('buildbar.hireBody', { fee, wage: wg, room: t(`room.${room.type}`) }) : t('buildbar.hireBodyRoam', { fee, wage: wg });
      const lines = [`${does(role)}.`, more(role), pay];
      if (reason) lines.unshift(`${t('buildbar.locked')}: ${reason}`);
      else if (ctx.w.coins < hireFee(role)) lines.push(t('buildbar.short', { n: ctx.fmt(Math.ceil(hireFee(role) - ctx.w.coins)) }));
      return { title: t('buildbar.hire', { fee }) + ' · ' + t(`staff.${role}`), body: lines.join('\n') };
    });
    return { role, el, name, count, does: desc, wage, wageNum, btn, btnTxt, why, whyTxt };
  });

  const render = () => {
    const w = ctx.w;
    d.text(shell.sub, t('buildbar.staffSub', { n: staffOf(w).length }));
    d.text(wagesTxt, t('buildbar.wages', { n: ctx.fmt(Math.round(wagesPerDay(ctx))) }));
    for (const r of rows) {
      const n = staffOf(w, r.role).length;
      const fee = hireFee(r.role);
      const reason = blocked(r.role);
      const name = t(`staff.${r.role}`);
      d.text(r.name, name);
      d.text(r.count, `×${n}`);
      d.attr(r.count, 'aria-label', t('buildbar.hiredLbl', { n }));
      d.cls(r.count, 'zero', n === 0);
      d.text(r.does, does(r.role));
      d.text(r.wageNum, t('buildbar.wage', { n: ctx.fmt(wageOf(r.role)) }));
      d.text(r.btnTxt, t('buildbar.hire', { fee: ctx.fmt(fee) }));
      d.cls(r.btn, 'bad', !reason && w.coins < fee);
      d.cls(r.btn, 'locked', !!reason);
      d.attr(r.btn, 'aria-disabled', reason ? 'true' : 'false');
      d.attr(r.btn, 'aria-label', reason ? `${t('buildbar.hire', { fee: ctx.fmt(fee) })} – ${name}: ${reason}` : `${t('buildbar.hire', { fee: ctx.fmt(fee) })} – ${name}`);
      d.cls(r.why, 'bb-hide', !reason);
      d.cls(r.el, 'locked', !!reason);
      if (reason) d.text(r.whyTxt, reason);
    }
  };

  return {
    update(dt) { if (shell.tick(dt)) { render(); shell.fit(); } },
    destroy() { shell.destroy(); },
  };
}
