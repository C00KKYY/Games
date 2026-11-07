/**
 * Mayor's daily mail (Brief §3.16, §5.3; docs/M5_DESIGN.md §12.3). Owner: ui-m5.
 *  - Quiet HUD icon in the rail once w.mail.visible (session 1: not before minute 12 – the sim decides), with a dot
 *    badge from mailBadge() (new day unseen or a task to claim). Never a popup, never opens by itself.
 *  - Panel: the 3 tasks of the day with progress (taskProgress), reward and Claim → cmd.claimMail; the key streak
 *    (every 3 completed mail days → 1 golden key); all claimed → "New mail tomorrow" with a countdown to local
 *    midnight from ctx.clock. Opening marks the day as seen (cmd.seeMail).
 * Non-pausing. Texts: src/i18n/parts/mail.{en,de}.json + progress.mail.*.
 */
import type { UICtx, Component } from './ctx';
import { domKit, WRITE_MS } from './buildbar';
import { panelShell, rail, bar, dot } from './m5kit';
import { MAIL, MAIL_POOL } from '../content/retention';
import { mailBadge, mailAllClaimed, taskProgress } from '../sim/mail';
import { M5_ICON } from './m5icons';

const DAY_MS = 86_400_000;

export function mountMail(ctx: UICtx): Component {
  const d = domKit(ctx);
  const { t } = ctx;
  const shell = panelShell(ctx, d, 'mail', { icon: M5_ICON.mail, cls: 'ml' });

  // rail icon
  const btn = d.button('m5-rbtn ml-btn', rail(ctx), () => ctx.panel.set(ctx.panel.get() === 'mail' ? null : 'mail'));
  btn.style.order = '3';
  d.img(ctx.icon(M5_ICON.mail), btn);
  const badge = dot(d, btn);
  btn.hidden = true;
  d.tip(btn, () => ({ title: t('mail.title'), body: mailBadge(ctx.w) ? t('mail.tipNew') : mailAllClaimed(ctx.w) ? t('progress.mailTomorrow') : t('mail.tip') }));

  // panel
  const intro = d.h('p', 'm5-p', shell.body);
  interface TaskEls { el: HTMLElement; txt: HTMLElement; prog: ReturnType<typeof bar>; num: HTMLElement; rew: HTMLElement; rewNum: HTMLElement; claim: HTMLButtonElement; claimTxt: HTMLElement; state: HTMLElement }
  const list = d.h('div', 'ml-list', shell.body);
  const tasks: TaskEls[] = [0, 1, 2].map(i => {
    const el = d.h('div', 'ml-task', list);
    const txt = d.h('span', 'ml-txt', el);
    const pr = d.h('span', 'ml-prog', el);
    const prog = bar(d, pr);
    const num = d.h('span', 'ml-num', pr);
    const side = d.h('span', 'ml-side', el);
    const rew = d.h('span', 'ml-rew', side);
    d.img(ctx.icon('coin'), rew);
    const rewNum = d.h('span', '', rew);
    const claim = d.button('m5-btn gold ml-claim', side, () => {
      const r = ctx.cmd.claimMail(ctx.w, i);
      if (!r.ok) { ctx.feedback(r); return; }
      ctx.sound('coin1');
      shell.dirty();
    });
    d.img(ctx.icon('coin'), claim);
    const claimTxt = d.h('span', '', claim);
    const state = d.h('span', 'pb-state good', side);
    d.tip(claim, () => {
      const tk = ctx.w.mail.tasks[i];
      return { title: t('mail.claim'), body: tk ? t('mail.claimBody', { n: ctx.fmt(tk.reward) }) : t('mail.tip') };
    });
    return { el, txt, prog, num, rew, rewNum, claim, claimTxt, state };
  });
  const streak = d.h('div', 'ml-streak', shell.body);
  const slots = [0, 1, 2].map(() => { const s = d.h('span', 'ml-keyslot', streak); d.img(ctx.icon(M5_ICON.key), s); return s; });
  const streakTxt = d.h('span', 'ml-streak-txt', streak);
  const tomorrow = d.h('p', 'ml-tomorrow', shell.body);

  const taskText = (id: string, n: number) => t(`progress.mail.${MAIL_POOL.find(p => p.id === id) ? id : 'release'}`, { n: ctx.fmt(n) });
  const untilMidnight = () => {
    const now = ctx.clock.now(), tz = ctx.clock.tzOffsetMin?.(now) ?? 0;
    const local = now + tz * 60_000;
    return DAY_MS - (((local % DAY_MS) + DAY_MS) % DAY_MS);
  };
  const hm = (ms: number) => { const m = Math.max(1, Math.ceil(ms / 60_000)); return t('mail.hm', { h: Math.floor(m / 60), m: m % 60 }); };

  const off = ctx.panel.on(v => {
    if (v === 'mail' && ctx.w.mail.visible && ctx.w.mail.day > ctx.w.mail.seenDay) ctx.cmd.seeMail(ctx.w);
  });
  const offEv = ctx.onEvent(e => {
    if (e.type === 'mailDayComplete' && Number(e.key)) ctx.toast(t('mail.keyToast'), { kind: 'good', icon: M5_ICON.key, ms: 4000 });
  });

  const render = () => {
    const w = ctx.w, m = w.mail;
    d.text(shell.title, t('mail.title'));
    d.text(shell.sub, t('mail.sub', { n: MAIL.tasksPerDay }));
    d.text(intro, t('mail.intro'));
    tasks.forEach((el, i) => {
      const tk = m.tasks[i];
      d.flag(el.el, 'hidden', tk ? null : '');
      if (!tk) return;
      const p = taskProgress(w, tk);
      const done = tk.done || p >= tk.target;
      d.text(el.txt, taskText(tk.id, tk.target));
      el.prog.set(tk.target ? p / tk.target : 0);
      d.text(el.num, `${ctx.fmt(p)}/${ctx.fmt(tk.target)}`);
      d.text(el.rewNum, `+${ctx.fmt(tk.reward)}`);
      d.cls(el.el, 'claimed', tk.claimed);
      d.flag(el.claim, 'hidden', done && !tk.claimed ? null : '');
      d.text(el.claimTxt, t('mail.claim'));
      d.attr(el.claim, 'aria-label', `${t('mail.claim')} +${ctx.fmt(tk.reward)} – ${taskText(tk.id, tk.target)}`);
      d.flag(el.rew, 'hidden', done && !tk.claimed ? '' : null);
      d.flag(el.state, 'hidden', tk.claimed ? null : '');
      d.text(el.state, t('mail.claimed'));
    });
    const s = Math.max(0, Math.min(MAIL.keyEveryDays, m.streak));
    slots.forEach((el, k) => d.cls(el, 'on', k < s));
    d.text(streakTxt, t('mail.streak', { n: s, total: MAIL.keyEveryDays }));
    const all = mailAllClaimed(w);
    d.flag(tomorrow, 'hidden', all || !m.tasks.length ? null : '');
    d.text(tomorrow, m.tasks.length ? t('mail.tomorrow', { time: hm(untilMidnight()) }) : t('mail.first'));
  };

  let acc = WRITE_MS;
  return {
    update(dt) {
      acc += dt * 1000;
      if (acc >= WRITE_MS) {
        acc = 0;
        const w = ctx.w;
        d.flag(btn, 'hidden', w.mail.visible ? null : '');
        const b = mailBadge(w);
        d.flag(badge, 'hidden', b ? null : '');
        d.cls(btn, 'on', ctx.panel.get() === 'mail');
        d.attr(btn, 'aria-label', b ? `${t('mail.title')} – ${t('mail.tipNew')}` : t('mail.title'));
      }
      if (shell.tick(dt)) render();
    },
    destroy() { off(); offEv(); shell.destroy(); btn.remove(); },
  };
}
