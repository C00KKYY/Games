/**
 * Characters (G2 feedback "no big appeal", docs/G2_FEEDBACK.md; Brief §4.2 row 0:04–0:15 "Strafakten-Kärtchen ploppen
 * kurz auf", §2.1 rap sheets):
 *  - Arrival cards: a small paper rap sheet pops over a rascal stepping off the ferry – name · species, the offence, case
 *    and sentence. Every passenger of the first ferry, then the first two of each ferry, and always the Cat Burglar.
 *    The petty offender (content/balance SENTENCE.petty) gets a red PETTY stamp. At most 4 on screen, 3.2 s each.
 *  - Release lines: the rascal leaving through the Parole Gate says one line (Earl and the petty offender have their own,
 *    paying off their files). At most one per 20 s, apart from those two.
 * World-anchored, non-interactive (pointer-events: none, aria-hidden – the rascal panel carries the same facts), never
 * over the clipboard, the tutorial bubble or the HUD bars: a card that would cover one of them waits invisible.
 * Positions follow the camera every frame (transform only); texts are written once per card.
 */
import './arrivalCards.css';
import type { UICtx, Component } from './ctx';
import type { Agent, World } from '../sim/types';
import { AF } from '../sim/types';
import { OFFENCES, SPECIES_NAME, RELEASE_QUOTES } from '../content/gags';
import { SENTENCE } from '../content/balance';

const TILE = 32;
const CARD_MS = 3200, QUOTE_MS = 2800, QUOTE_GAP_MS = 20000;
const FIRST_FERRY = 4, PER_FERRY = 2, MAX_CARDS = 4;

interface Pop { el: HTMLElement; id: number; until: number; kind: 'card' | 'quote'; x: number; y: number; w: number; h: number; tf: string; hid: boolean; out: boolean }

export const isPetty = (a: Pick<Agent, 'sentence' | 'flags'>) => !(a.flags & (AF.earl | AF.vip)) && a.sentence === SENTENCE.petty;
/** the line a released rascal says (Earl / petty offender fixed, else from the pool by id) */
export function quoteFor(a: Pick<Agent, 'id' | 'sentence' | 'flags'>, lang: 'en' | 'de'): string {
  if (a.flags & AF.earl) return RELEASE_QUOTES.earl[lang];
  if (isPetty(a)) return RELEASE_QUOTES.petty[lang];
  const pool = RELEASE_QUOTES.pool;
  return pool[(a.id * 7) % pool.length][lang];
}

export function mountArrivalCards(ctx: UICtx): Component {
  const w: World = ctx.w;
  const layer = document.createElement('div');
  layer.className = 'ac';
  layer.dataset.overlay = '';
  layer.setAttribute('aria-hidden', 'true');
  ctx.root.appendChild(layer);
  const lang = () => (ctx.lang() === 'de' ? 'de' : 'en') as 'en' | 'de';

  let clock = 0, lastQuote = -1e9, perFerry = 0;
  const pops: Pop[] = [];
  const queue: number[] = [];         // agent ids waiting for a free card slot

  const el = (cls: string, parent: HTMLElement, text = '') => { const e = document.createElement('span'); e.className = cls; e.textContent = text; parent.appendChild(e); return e; };

  function card(a: Agent) {
    const c = document.createElement('div');
    c.className = 'ac-card' + (ctx.compact.get() ? ' ac--compact' : '');
    const off = OFFENCES[a.crime % OFFENCES.length][lang()];
    const sp = SPECIES_NAME[a.species]?.[lang()] ?? a.species;
    if (ctx.compact.get()) el('ac-line', c, `${a.name} · ${off}`);
    else {
      el('ac-name', c, `${a.name} · ${sp}`);
      el('ac-off', c, off);
      el('ac-meta num', c, ctx.t('arrivalCards.meta', { n: a.caseNo, s: Math.round(a.sentence) }));
    }
    if (isPetty(a)) el('ac-stamp', c, ctx.t('arrivalCards.petty'));
    else if (a.flags & AF.vip) el('ac-stamp ac-stamp--vip', c, ctx.t('arrivalCards.vip'));
    layer.appendChild(c);
    pops.push({ el: c, id: a.id, until: clock + CARD_MS, kind: 'card', x: -1e4, y: -1e4, w: c.offsetWidth, h: c.offsetHeight, tf: '', hid: false, out: false });
  }
  function quote(a: Agent) {
    const q = document.createElement('div');
    q.className = 'ac-quote';
    el('ac-qtxt', q, quoteFor(a, lang()));
    layer.appendChild(q);
    pops.push({ el: q, id: a.id, until: clock + QUOTE_MS, kind: 'quote', x: -1e4, y: -1e4, w: q.offsetWidth, h: q.offsetHeight, tf: '', hid: false, out: false });
  }

  const off = ctx.onEvent(e => {
    if (e.type === 'ferryDock') perFerry = 0;
    if (e.type === 'arrive' && typeof e.id === 'number') {
      const a = w.agents.find(x => x.id === e.id);
      if (!a) return;
      const vip = !!(a.flags & AF.vip);
      perFerry++;
      if (w.stats.arrived <= FIRST_FERRY || perFerry <= PER_FERRY || vip) queue.push(a.id);
    }
    if (e.type === 'release' && typeof e.id === 'number') {
      const a = w.agents.find(x => x.id === e.id);
      if (!a) return;
      const special = !!(a.flags & AF.earl) || isPetty(a);
      if (!special && clock - lastQuote < QUOTE_GAP_MS) return;
      lastQuote = clock;
      // the card of the same rascal (if any) makes room
      for (const p of pops) if (p.id === a.id) p.until = Math.min(p.until, clock);
      quote(a);
    }
  });

  type R = { l: number; t: number; r: number; b: number };
  const hit = (a: R, b: R) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  let obst: R[] = [], obstAcc = 1e9;
  const obstacles = () => [...ctx.root.querySelectorAll<HTMLElement>('[data-hud="top"], [data-hud="bottom"], .cb-card, .cb-chip, .tu-bub.on, .tu-ghost.on, .tu-jit.on, .pn:not([hidden]), .bb-menu:not([hidden]), .m5-banners:not([hidden]), .m5p:not([hidden]), .m5-plaque:not([hidden]), .m5-ret:not([hidden]), .m5-rbtn:not([hidden]), .m5-edge:not([hidden])')]
    .concat([...document.querySelectorAll<HTMLElement>('.ov-toasts > .ov-toast.in')])
    .map(e => e.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0).map(r => ({ l: r.left - 4, t: r.top - 4, r: r.right + 4, b: r.bottom + 4 }));

  return {
    update(dt) {
      clock += dt * 1000;
      // start queued cards while there is room
      while (queue.length && pops.filter(p => p.kind === 'card').length < MAX_CARDS) {
        const a = w.agents.find(x => x.id === queue[0]); queue.shift();
        if (a && (a.state === 'arriving' || a.state === 'walking' || a.state === 'waitingDock' || a.state === 'idle' || a.state === 'using')) card(a);
      }
      obstAcc += dt * 1000;
      if (obstAcc >= 100) { obstAcc = 0; obst = pops.length ? obstacles() : []; }
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i];
        const a = w.agents.find(x => x.id === p.id);
        if (clock >= p.until + 250 || !a) { p.el.remove(); pops.splice(i, 1); continue; }
        if (clock >= p.until && !p.out) { p.out = true; p.el.classList.add('out'); }
        const s = ctx.cam.worldToScreen(a.x * TILE, (a.y - 1.25) * TILE);
        const ew = p.w, eh = p.h;
        // stack cards that would sit on top of each other (several rascals on the dock)
        let y = s.y - eh;
        for (const o of pops) if (o !== p && o.x > -1e3 && pops.indexOf(o) < i && Math.abs(o.x - s.x) < ew * 0.8 && Math.abs(o.y - y) < eh) y = o.y - eh - 4;
        const box = { l: s.x - ew / 2, t: y, r: s.x + ew / 2, b: y + eh };
        const blocked = box.l < 0 || box.t < 0 || box.r > innerWidth || box.b > innerHeight || obst.some(o => hit(box, o));
        p.x = s.x; p.y = y;
        const tf = `translate(${Math.round(box.l)}px,${Math.round(box.t)}px)`;
        if (tf !== p.tf) { p.tf = tf; p.el.style.transform = tf; }
        if (blocked !== p.hid) { p.hid = blocked; p.el.classList.toggle('hid', blocked); }
      }
    },
    destroy() { off(); layer.remove(); },
  };
}
