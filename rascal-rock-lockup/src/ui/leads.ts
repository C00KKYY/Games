/**
 * Warden's Office leads (Brief §3.11; docs/M5_DESIGN.md §12.2). Owner: ui-m5.
 *  - Opened by tapping the Warden's Office in the world (the room selection is turned into this panel) and from the
 *    "Warden's Office" card in the staff menu (staffMenu.ts).
 *  - 2 slots: locked with "Unlocks at 3★ / 4★", free (the candidates with what they automate and how often the player
 *    did it by hand), or filled (who, what, wage).
 *  - Hire dialog in the panel: "You tapped 34 times today. From now on, Olli handles it." (real counts from hireInfo),
 *    fee, wage, +10 % offline earnings → cmd.hireLead.
 *  - Never opens by itself: reaching the slot's star level shows a toast and a dot on the staff button.
 * Non-pausing. Texts: src/i18n/parts/leads.{en,de}.json + progress.lead*.
 */
import type { UICtx, Component } from './ctx';
import type { LeadId } from '../sim/types';
import { domKit, WRITE_MS } from './buildbar';
import { panelShell, dot } from './m5kit';
import { LEAD_OFFLINE_PP, leadDef } from '../content/progress';
import { hireInfo, slotOpen, slotStars, leadsForSite } from '../sim/leads';
import { roomById } from '../sim/world';

const GRIP_ICON = { horn: 'ferry', crates: 'crate' } as const;

/** a free slot is open and a lead could be hired (dot on the staff button until the office was opened) */
export const leadSlotWaiting = (ctx: UICtx) => ctx.w.leads.slots.some((s, k) => s === null && slotOpen(ctx.w, k)) && leadsForSite(ctx.w).some(l => !ctx.w.leads.slots.includes(l.id));

export function mountLeads(ctx: UICtx): Component {
  const d = domKit(ctx);
  const { t } = ctx;
  const shell = panelShell(ctx, d, 'leads', { icon: 'warden', cls: 'ld' });
  const leadName = (id: LeadId) => `${hireInfo(ctx.w, id).name} · ${t(`progress.lead.${id}`)}`;

  const intro = d.h('p', 'm5-p ld-intro', shell.body);
  // slots view
  const slotsEl = d.h('div', 'ld-slots', shell.body);
  interface SlotEls { el: HTMLElement; head: HTMLElement; line: HTMLElement; why: HTMLElement; whyTxt: HTMLElement; cands: HTMLElement }
  const slots: SlotEls[] = [0, 1].map(() => {
    const el = d.h('div', 'ld-slot', slotsEl);
    const head = d.h('div', 'ld-slot-h', el);
    const line = d.h('p', 'm5-p', el);
    const why = d.h('div', 'm5-why', el);
    d.img(ctx.icon('lock'), why);
    const whyTxt = d.h('span', '', why);
    const cands = d.h('div', 'ld-cands', el);
    return { el, head, line, why, whyTxt, cands };
  });
  interface CandEls { id: LeadId; el: HTMLElement; name: HTMLElement; fx: HTMLElement; btn: HTMLButtonElement; btnTxt: HTMLElement }
  const cands = new Map<LeadId, CandEls>();
  const candFor = (id: LeadId): CandEls => {
    let c = cands.get(id);
    if (c) return c;
    const el = d.h('div', 'ld-cand');
    const name = d.h('span', 'ld-cand-name', el);
    const fx = d.h('span', 'ld-cand-fx', el);
    const btn = d.button('m5-btn ld-hire', el, () => { confirm = id; shell.dirty(); });
    d.img(ctx.icon(GRIP_ICON[leadDef(id).grip]), btn);
    const btnTxt = d.h('span', '', btn);
    d.tip(btn, () => {
      const i = hireInfo(ctx.w, id);
      return { title: t('leads.hireTitle', { name: leadName(id) }), body: `${t(`progress.leadFx.${id}`)}.\n${t('leads.terms', { fee: ctx.fmt(i.fee), wage: ctx.fmt(i.wage), pp: Math.round(LEAD_OFFLINE_PP * 100) })}` };
    });
    c = { id, el, name, fx, btn, btnTxt };
    cands.set(id, c);
    return c;
  };

  // confirm view ("You tapped 34 times today …")
  const conf = d.h('div', 'ld-confirm', shell.body);
  const quote = d.h('p', 'ld-quote', conf);
  const terms = d.h('p', 'm5-p', conf);
  const row = d.h('div', 'm5-btnrow', conf);
  const yes = d.button('m5-btn gold ld-yes', row, () => hire());
  d.img(ctx.icon('coin'), yes);
  const yesTxt = d.h('span', '', yes);
  const back = d.button('m5-btn ghost ld-back', row, () => { confirm = null; shell.dirty(); });
  const backTxt = d.h('span', '', back);
  d.tip(yes, () => (confirm ? { title: t('leads.hireTitle', { name: leadName(confirm) }), body: t('leads.terms', { fee: ctx.fmt(hireInfo(ctx.w, confirm).fee), wage: ctx.fmt(hireInfo(ctx.w, confirm).wage), pp: Math.round(LEAD_OFFLINE_PP * 100) }) } : { title: t('leads.title') }));
  d.tip(back, () => ({ title: t('leads.back'), body: t('leads.backBody') }));

  let confirm: LeadId | null = null;
  function hire() {
    if (!confirm) return;
    const id = confirm;
    const r = ctx.cmd.hireLead(ctx.w, id);
    if (!r.ok) { ctx.feedback(r); return; }
    ctx.sound('hire');
    confirm = null; shell.dirty();
  }

  // ------------------------------------------------------------------ office tap → this panel; dot on the staff button
  let pendingOffice = false;
  const offs = [
    ctx.selection.on(v => {
      if (v?.kind !== 'room') return;
      const r = roomById(ctx.w, v.id);
      if (r?.type === 'office' && ctx.w.tutorial.done) pendingOffice = true; // handled in update(): never re-enter the store from its own listener
    }),
    ctx.panel.on(v => { if (v === 'leads') seenWaiting = true; if (v !== 'leads') confirm = null; }),
    ctx.onEvent(e => {
      if (e.type === 'star') {
        const s = Number(e.stars) || 0;
        const k = [0, 1].find(i => slotStars(ctx.w, i) === s);
        if (k !== undefined && ctx.w.leads.slots[k] === null) { seenWaiting = false; ctx.toast(t('leads.slotToast', { n: k + 1 }), { kind: 'good', icon: 'warden', ms: 4200 }); }
      } else if (e.type === 'leadHired') {
        const id = String(e.id) as LeadId;
        ctx.toast(t(`leads.hired.${id}`, { name: hireInfo(ctx.w, id).name }), { kind: 'good', icon: 'warden', ms: 3800 });
      }
    }),
  ];
  let seenWaiting = !leadSlotWaiting(ctx);
  const staffBtn = ctx.root.querySelector<HTMLElement>('.bb-staff');
  const staffDot = staffBtn ? dot(d, staffBtn) : null;
  staffDot?.setAttribute('hidden', '');

  const render = () => {
    const w = ctx.w;
    d.text(shell.title, t('leads.title'));
    d.text(shell.sub, t('leads.sub'));
    d.text(intro, t('leads.intro', { pp: Math.round(LEAD_OFFLINE_PP * 100) }));
    d.flag(slotsEl, 'hidden', confirm ? '' : null);
    d.flag(conf, 'hidden', confirm ? null : '');
    if (confirm) {
      const i = hireInfo(w, confirm);
      d.text(quote, t(i.tapsToday === 1 ? 'leads.quoteOne' : 'leads.quote', { n: i.tapsToday, name: i.name }));
      d.text(terms, `${t(`progress.leadFx.${confirm}`)}. ${t('leads.terms', { fee: ctx.fmt(i.fee), wage: ctx.fmt(i.wage), pp: Math.round(LEAD_OFFLINE_PP * 100) })}`);
      d.text(yesTxt, t('leads.hireFor', { fee: ctx.fmt(i.fee) }));
      d.cls(yes, 'bad', w.coins < i.fee);
      d.attr(yes, 'aria-label', `${t('leads.hireFor', { fee: ctx.fmt(i.fee) })} – ${leadName(confirm)}`);
      d.text(backTxt, t('leads.back'));
      d.attr(back, 'aria-label', t('leads.back'));
      return;
    }
    const free = leadsForSite(w).filter(l => !w.leads.slots.includes(l.id)).map(l => l.id);
    const firstFree = w.leads.slots.findIndex((s, k) => s === null && slotOpen(w, k));
    slots.forEach((s, k) => {
      const id = w.leads.slots[k] ?? null, open = slotOpen(w, k);
      d.cls(s.el, 'filled', !!id);
      d.cls(s.el, 'locked', !id && !open);
      if (id) {
        const i = hireInfo(w, id);
        d.text(s.head, t('leads.slotHired', { n: k + 1, name: leadName(id) }));
        d.text(s.line, `${t(`progress.leadFx.${id}`)}. ${t('leads.wage', { wage: ctx.fmt(i.wage) })}`);
      } else if (!open) {
        d.text(s.head, t('leads.slot', { n: k + 1 }));
        d.text(s.line, t('leads.slotLockedBody'));
        d.text(s.whyTxt, t('leads.unlocksAt', { s: slotStars(w, k) }));
      } else {
        d.text(s.head, t('leads.slotFree', { n: k + 1 }));
        d.text(s.line, k === firstFree ? t('leads.pick') : t('leads.next'));
      }
      d.flag(s.line, 'hidden', null);
      d.flag(s.why, 'hidden', !id && !open ? null : '');
      // candidates live under the first open free slot (cmd.hireLead fills that one)
      const show = !id && k === firstFree;
      d.flag(s.cands, 'hidden', show && free.length ? null : '');
      if (show) for (const lid of free) {
        const c = candFor(lid);
        if (c.el.parentElement !== s.cands) s.cands.appendChild(c.el);
        const i = hireInfo(w, lid);
        d.text(c.name, leadName(lid));
        d.text(c.fx, `${t(`progress.leadFx.${lid}`)} · ${t(`leads.taps.${i.grip}`, { n: i.tapsToday })}`);
        d.text(c.btnTxt, t('leads.hireBtn', { fee: ctx.fmt(i.fee) }));
        d.attr(c.btn, 'aria-label', `${t('leads.hireBtn', { fee: ctx.fmt(i.fee) })} – ${leadName(lid)}`);
      }
    });
    for (const [lid, c] of cands) if (!free.includes(lid) || firstFree < 0) c.el.remove();
  };

  let acc = WRITE_MS;
  return {
    update(dt) {
      if (pendingOffice) { pendingOffice = false; ctx.selection.set(null); ctx.panel.set('leads'); }
      acc += dt * 1000;
      if (acc >= WRITE_MS && staffDot) {
        acc = 0;
        const waiting = ctx.w.tutorial.done && leadSlotWaiting(ctx) && !seenWaiting;
        d.flag(staffDot, 'hidden', waiting ? null : '');
      }
      if (shell.tick(dt)) render();
    },
    destroy() { for (const o of offs) o(); shell.destroy(); staffDot?.remove(); },
  };
}
