/**
 * M3 UI acceptance tests – Brief §12.3 B3 (contrast), B4 (touch targets), B5 (no fullscreen, no external links),
 * B6 (user-select) and §12.5 D5 (every button has a label/icon and a tooltip). The hotkey half of D5 is a unit test
 * (tests/unit/hotkeys.test.ts), D7 lives in tests/unit/i18n.test.ts.
 *
 * Runs with the project config or any config that sets baseURL (relative URLs only). Every page goes through
 * helpers.setup() (SDK mock, foreign-request guard) and helpers.gotoGame().
 *
 * States ("all main states", docs/UI_DESIGN.md §3): one page per viewport, the states are entered one after the other
 * through the runtime hooks (window.__ctx) or real clicks where no hook exists (clipboard list, topbar stage list):
 *   base · rooms menu · staff menu · room panel · rascal panel · build tool · demolish tool · settings · help ·
 *   clipboard goal list · topbar stage list (only exists at collapse level 6, i.e. narrow widths)
 * The game is paused after loading so the bot/sim cannot change the HUD between measurements.
 */
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setup, gotoGame, SDK_URL } from './helpers';

/** mid-game state: casual bot, 300 s warped (rooms, staff, agents exist) */
const MID = 'bot=casual&warp=300';

type StateName = 'base' | 'rooms' | 'staff' | 'room' | 'rascal' | 'build' | 'demolish' | 'settings' | 'help' | 'clipList' | 'stageList';
const ALL_STATES: StateName[] = ['base', 'rooms', 'staff', 'room', 'rascal', 'build', 'demolish', 'settings', 'help', 'clipList', 'stageList'];

// ---------------------------------------------------------------------------------------------------------- states
const ctxEval = <T>(page: Page, fn: (ctx: any) => T) => page.evaluate(`(${fn.toString()})(window.__ctx)`) as Promise<T>;

async function visible(page: Page, sel: string) {
  return page.evaluate(s => [...document.querySelectorAll(s)].some(e => e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && e.getBoundingClientRect().width > 0), sel);
}

/** back to the plain HUD: nothing open, no tool, no selection */
async function reset(page: Page) {
  await page.mouse.move(2, 2);
  await ctxEval(page, ctx => { ctx.closeModal(); ctx.menu.set(null); ctx.tool.set({ kind: 'none' }); ctx.selection.set(null); });
  // the clipboard list/card and the topbar stage list close on Esc (capture phase) – nothing else reacts to a bare Esc now
  for (let i = 0; i < 3; i++) {
    if (!(await visible(page, '.cb-list, .tb-list')) && !(await page.evaluate(() => !!document.querySelector('.cb--open, .cb-card.open')))) break;
    await page.keyboard.press('Escape');
  }
  await ctxEval(page, ctx => { ctx.selection.set(null); ctx.menu.set(null); });
  await page.waitForTimeout(150);
}

/** enter a state; returns false when the state does not exist at this viewport (e.g. stage list above collapse level 6) */
async function enter(page: Page, s: StateName): Promise<boolean> {
  switch (s) {
    case 'base': break;
    case 'rooms': case 'staff':
      await ctxEval(page, ctx => ctx.menu.set(null));
      await page.evaluate(m => (window as any).__ctx.menu.set(m), s);
      await expect.poll(() => visible(page, `.bb-menu--${s}`), { message: `${s} menu opens` }).toBe(true);
      break;
    case 'room':
      await ctxEval(page, ctx => {
        const rooms = ctx.w.rooms as { id: number; type: string }[];
        const r = rooms.find(x => x.type === 'workshop') ?? rooms.find(x => x.type === 'bunk') ?? rooms[0];
        ctx.selection.set({ kind: 'room', id: r.id });
      });
      await expect.poll(() => visible(page, '.pn'), { message: 'room panel opens' }).toBe(true);
      break;
    case 'rascal':
      await ctxEval(page, ctx => {
        const a = (ctx.w.agents as { id: number; kind: string; flags: number }[]).find(x => x.kind === 'rascal' && !(x.flags & (4 | 64)));
        if (a) ctx.selection.set({ kind: 'agent', id: a.id });
      });
      await expect.poll(() => visible(page, '.pn'), { message: 'rascal panel opens' }).toBe(true);
      break;
    case 'build': {
      await ctxEval(page, ctx => ctx.tool.set({ kind: 'build', type: 'bunk' }));
      const vp = page.viewportSize()!;
      await page.mouse.move(vp.width / 2, vp.height / 2);
      await page.mouse.move(vp.width / 2 + 10, vp.height / 2 + 6);
      break;
    }
    case 'demolish': await ctxEval(page, ctx => ctx.tool.set({ kind: 'demolish' })); break;
    case 'settings': case 'help':
      await page.evaluate(m => (window as any).__ctx.openModal(m), s);
      await expect.poll(() => visible(page, '.ov-modal'), { message: `${s} modal opens` }).toBe(true);
      break;
    case 'clipList':
      // compact: the chip expands the card first
      if (!(await visible(page, '.cb-more'))) await page.locator('.cb-chip').click();
      await expect.poll(() => visible(page, '.cb-more'), { message: 'clipboard card shows "all goals"' }).toBe(true);
      await page.locator('.cb-more').click();
      await expect.poll(() => visible(page, '.cb-list'), { message: 'clipboard goal list opens' }).toBe(true);
      break;
    case 'stageList':
      if (!(await visible(page, '.tb .flow .sum'))) return false;
      await page.locator('.tb .flow .sum').click();
      await expect.poll(() => visible(page, '.tb-list'), { message: 'topbar stage list opens' }).toBe(true);
      break;
  }
  await page.mouse.move(2, 2);           // no hover tooltip in the measurement
  await page.waitForTimeout(450);        // open animations (≤ .18 s) and throttled DOM writes (≤ 10/s)
  return true;
}

async function load(page: Page, query = MID) {
  const guard = await setup(page);
  await gotoGame(page, query);
  await ctxEval(page, ctx => ctx.setPaused(true));
  await page.waitForTimeout(200);
  return guard;
}

/** run `fn` in every state; returns the list of states actually visited */
async function eachState(page: Page, states: StateName[], fn: (s: StateName) => Promise<void>): Promise<StateName[]> {
  const done: StateName[] = [];
  for (const s of states) {
    await reset(page);
    if (!(await enter(page, s))) continue;
    await fn(s);
    done.push(s);
  }
  await reset(page);
  return done;
}

// ---------------------------------------------------------------------------------------------------------- in-page probe
interface TextItem { where: string; text: string; kind: 'panel' | 'world'; ratio: number; fg: string; bg: string; alpha: number; plaque: boolean; shadow: boolean }
interface CtlItem {
  where: string; comp: string; tag: string; w: number; h: number; disabled: boolean;
  text: string; icon: boolean; aria: string; tip: string;
  inPanel: boolean; nonText: { ok: boolean; how: string; best: number };
}
interface Probe { texts: TextItem[]; ctls: CtlItem[]; links: string[]; fsMentions: string[]; userSelect: { where: string; v: string }[]; unparsed: string[] }

/**
 * Measures the HUD (everything under `.hud`) in the page. Definitions (B3, WCAG 2.x formulas):
 *  - Visible: `checkVisibility({opacityProperty, visibilityProperty})`, non-empty box, not fully clipped by an ancestor
 *    with overflow ≠ visible, inside the viewport.
 *  - Backdrop of a text node: the background layers of its ancestors up to `.hud` (background-color, then the colour stops of a
 *    background-image gradient – with the midpoints between consecutive stops – each multiplied by the cumulative CSS
 *    opacity), innermost first, until the layers are fully opaque. An ancestor only counts when the text's centre lies
 *    inside its border box (absolutely positioned badges that stick out of their parent do not use its colour).
 *    The composite alpha A of these layers decides the class:
 *      A ≥ 0.9  → "panel text": text colour (alpha × cumulative opacity) composited over every candidate background
 *                 colour (all stop combinations, any remaining transparency composited over black AND over white, i.e. the
 *                 unknown world behind) – the WORST ratio counts and must be ≥ 4.5:1.
 *      A < 0.9  → "text over the world": must have a plaque (A ≥ 0.5) or a text-shadow / -webkit-text-stroke.
 *  - Native `disabled` controls are exempt (WCAG 1.4.3 "inactive user interface component"); aria-disabled locked cards
 *    are NOT exempt, they show the unlock reason and must be readable.
 *  - Important non-text UI (B3 ≥ 3:1, WCAG 1.4.11): every visible, enabled button / [role=button] whose own parent sits on a
 *    panel (A ≥ 0.9). Its boundary must be perceivable against the panel colour P (worst candidate):
 *      a) its own background (composited over P) vs P ≥ 3:1, or
 *      b) a border (≥ 1 px, style ≠ none) or a hard box-shadow edge (blur 0, spread ≥ 1 px or offset ≥ 2 px) whose
 *         colour vs P ≥ 3:1, or
 *      c) a text label (then the text itself is the identifying part and is held to 4.5:1 by the text rule), or
 *      d) icon-only: the icon glyph – the button's <img> rasterised in a canvas over the button colour – has ≥ 3:1
 *         against that colour on at least 20 % of its opaque (alpha ≥ .5) pixels.
 */
async function hudProbe(): Promise<Probe> {
  type RGBA = [number, number, number, number];
  const out: Probe = { texts: [], ctls: [], links: [], fsMentions: [], userSelect: [], unparsed: [] };
  const hud = document.querySelector('.hud') as HTMLElement;
  const vw = innerWidth, vh = innerHeight;
  const parse = (s: string): RGBA | null => {
    const m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
    if (!m) { if (s !== 'transparent') out.unparsed.push(s); return s === 'transparent' ? [0, 0, 0, 0] : null; }
    let a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    if (!isFinite(a)) a = 1;
    return [+m[1], +m[2], +m[3], a];
  };
  const colorsIn = (s: string) => (s.match(/rgba?\([^)]*\)/g) ?? []).map(parse).filter((c): c is RGBA => !!c);
  const over = (top: RGBA, a: number, bot: RGBA): RGBA => [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1];
  const lum = (c: RGBA) => {
    const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (a: RGBA, b: RGBA) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = (c: RGBA) => '#' + c.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  const desc = (el: Element) => {
    const parts: string[] = [];
    for (let e: Element | null = el; e && e !== hud && parts.length < 3; e = e.parentElement) {
      const c = typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      parts.unshift(e.tagName.toLowerCase() + c);
    }
    return parts.join(' > ');
  };
  const clipped = (el: Element, r: DOMRect) => {
    let x0 = Math.max(0, r.left), y0 = Math.max(0, r.top), x1 = Math.min(vw, r.right), y1 = Math.min(vh, r.bottom);
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const b = p.getBoundingClientRect();
      if (cs.overflowX !== 'visible') { x0 = Math.max(x0, b.left); x1 = Math.min(x1, b.right); }
      if (cs.overflowY !== 'visible') { y0 = Math.max(y0, b.top); y1 = Math.min(y1, b.bottom); }
    }
    return x1 - x0 < 1 || y1 - y0 < 1;
  };
  const isVis = (el: Element) => {
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !clipped(el, r);
  };
  const opacityChain = (el: Element) => { let o = 1; for (let e: Element | null = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o; };

  interface Layer { colors: RGBA[] }
  /** background layers from `el` outwards (innermost first) until opaque; cx/cy = point that must lie inside the box */
  const layersOf = (el: Element, cx: number, cy: number) => {
    const layers: Layer[] = [];
    let transmit = 1;
    // only HUD elements count: behind `.hud` lies the world canvas (body/html colours are never visible behind HUD text)
    for (let e: Element | null = el; e && e !== hud.parentElement && transmit > 0.001; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const b = e.getBoundingClientRect();
      if (cx < b.left - 0.5 || cx > b.right + 0.5 || cy < b.top - 0.5 || cy > b.bottom + 0.5) continue;
      const op = opacityChain(e);
      const own: Layer[] = [];
      const bg = parse(cs.backgroundColor);
      if (bg && bg[3] > 0) own.push({ colors: [[bg[0], bg[1], bg[2], bg[3] * op]] });
      if (cs.backgroundImage !== 'none' && /gradient/.test(cs.backgroundImage)) {
        const st = colorsIn(cs.backgroundImage);
        const all: RGBA[] = [];
        st.forEach((c, i) => { all.push([c[0], c[1], c[2], c[3] * op]); const n = st[i + 1]; if (n) all.push([(c[0] + n[0]) / 2, (c[1] + n[1]) / 2, (c[2] + n[2]) / 2, ((c[3] + n[3]) / 2) * op]); });
        if (all.length) own.push({ colors: all });
      }
      // painting order inside one element: background-color below the gradient → innermost-first list gets gradient first
      for (const l of own.reverse()) { layers.push(l); transmit *= 1 - Math.min(...l.colors.map(c => c[3])); }
    }
    return { layers, alpha: 1 - transmit };
  };
  /** every candidate colour of the composite (outermost layer first), over a black and a white world */
  const candidates = (layers: Layer[]): RGBA[] => {
    let cand: RGBA[] = [[0, 0, 0, 1], [255, 255, 255, 1]];
    for (let i = layers.length - 1; i >= 0; i--) {
      const next: RGBA[] = [];
      for (const c of cand) for (const l of layers[i].colors) next.push(over(l, l[3], c));
      const seen = new Set<string>();
      cand = next.filter(c => { const k = c.slice(0, 3).map(v => Math.round(v)).join(','); if (seen.has(k)) return false; seen.add(k); return true; });
    }
    return cand;
  };

  // ---- text
  const walker = document.createTreeWalker(hud, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const txt = (n.textContent ?? '').trim();
    if (!txt) continue;
    const el = n.parentElement!;
    if (el.closest('[disabled]')) continue;
    if (!isVis(el)) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || clipped(el, r)) continue;
    const cs = getComputedStyle(el);
    const fg0 = parse(cs.color); if (!fg0) continue;
    const fgA = fg0[3] * opacityChain(el);
    const { layers, alpha } = layersOf(el, r.left + r.width / 2, r.top + r.height / 2);
    const shadow = (cs.textShadow !== 'none' && colorsIn(cs.textShadow).some(c => c[3] > 0.2)) || parseFloat((cs as any).webkitTextStrokeWidth || '0') > 0;
    const item: TextItem = { where: desc(el), text: txt.slice(0, 40), kind: alpha >= 0.9 ? 'panel' : 'world', ratio: 0, fg: hex(fg0), bg: '', alpha: Math.round(alpha * 100) / 100, plaque: alpha >= 0.5, shadow };
    let worst = Infinity, worstBg: RGBA = [0, 0, 0, 1];
    for (const b of candidates(layers)) { const rr = ratio(over(fg0, fgA, b), b); if (rr < worst) { worst = rr; worstBg = b; } }
    item.ratio = Math.round(worst * 100) / 100; item.bg = hex(worstBg);
    out.texts.push(item);
  }

  // ---- controls
  const ctlSel = 'button, [role="button"], input, select, textarea, [role="slider"], [role="tab"], [role="checkbox"], [role="switch"], a[href]';
  const imgs: Promise<void>[] = [];
  for (const el of hud.querySelectorAll<HTMLElement>(ctlSel)) {
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const top = [...hud.children].find(c => c.contains(el)) as HTMLElement;
    const comp = (typeof top.className === 'string' ? top.className.trim().split(/\s+/)[0] : '') || top.tagName.toLowerCase();
    const disabled = (el as HTMLButtonElement).disabled === true;
    const it: CtlItem = {
      where: desc(el), comp, tag: el.tagName.toLowerCase() + (el.getAttribute('type') ? `[${el.getAttribute('type')}]` : ''),
      w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, disabled,
      text: (el.innerText ?? '').trim().replace(/\s+/g, ' ').slice(0, 40),
      icon: !!el.querySelector('img, svg') || getComputedStyle(el).backgroundImage.includes('url('),
      aria: (el.getAttribute('aria-label') ?? '').trim(), tip: el.getAttribute('data-tip') ?? '',
      inPanel: false, nonText: { ok: true, how: 'n/a', best: 0 },
    };
    out.ctls.push(it);
    if (disabled || !/^(BUTTON)$/.test(el.tagName) && el.getAttribute('role') !== 'button') continue;
    if (clipped(el, r)) continue;
    // ---- B3 non-text contrast
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const parent = el.parentElement!;
    const pl = layersOf(parent, cx, cy);
    if (pl.alpha < 0.9) continue;
    it.inPanel = true;
    const P = candidates(pl.layers);
    const cs = getComputedStyle(el);
    const op = opacityChain(el);
    const own = layersOf(el, cx, cy).layers.slice(0, Math.max(0, layersOf(el, cx, cy).layers.length - pl.layers.length));
    let best = 0, how = '';
    // a) background
    if (own.length) {
      let w = Infinity;
      for (const p of P) for (const b of candidates([...own, { colors: [p] }])) w = Math.min(w, ratio(b, p));
      if (w > best) { best = w; how = 'background'; }
    }
    // b) border / hard shadow edge
    const edges: RGBA[] = [];
    for (const s of ['Top', 'Right', 'Bottom', 'Left'] as const) {
      if (parseFloat((cs as any)[`border${s}Width`]) >= 1 && (cs as any)[`border${s}Style`] !== 'none') { const c = parse((cs as any)[`border${s}Color`]); if (c) edges.push(c); }
    }
    if (cs.boxShadow !== 'none') {
      for (const part of cs.boxShadow.split(/,(?![^(]*\))/)) {
        const c = colorsIn(part)[0]; if (!c) continue;
        const nums = part.replace(/rgba?\([^)]*\)/, '').match(/-?[\d.]+px/g)?.map(parseFloat) ?? [];
        const [ox = 0, oy = 0, blur = 0, spread = 0] = nums;
        if (blur === 0 && (spread >= 1 || Math.abs(ox) >= 2 || Math.abs(oy) >= 2)) edges.push(c);
      }
    }
    for (const e of edges) {
      let w = Infinity;
      for (const p of P) w = Math.min(w, ratio(over(e, e[3] * op, p), p));
      if (w > best) { best = w; how = 'edge'; }
    }
    if (best >= 3) { it.nonText = { ok: true, how, best: Math.round(best * 100) / 100 }; continue; }
    // c) text label
    if (it.text) { it.nonText = { ok: true, how: 'text label', best: Math.round(best * 100) / 100 }; continue; }
    // d) icon glyph
    const im = el.querySelector('img') as HTMLImageElement | null;
    const btnBg = candidates([...own, ...pl.layers]);
    if (im && im.complete && im.naturalWidth > 0) {
      const ir = im.getBoundingClientRect();
      imgs.push((async () => {
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(ir.width)); c.height = Math.max(1, Math.round(ir.height));
        const g = c.getContext('2d', { willReadFrequently: true })!;
        g.drawImage(im, 0, 0, c.width, c.height);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        const io = opacityChain(im);
        let worstShare = 1;
        for (const b of btnBg) {
          let n = 0, good = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 128) continue; n++;
            const px: RGBA = [d[i], d[i + 1], d[i + 2], 1];
            if (ratio(over(px, (d[i + 3] / 255) * io, b), b) >= 3) good++;
          }
          worstShare = Math.min(worstShare, n ? good / n : 0);
        }
        it.nonText = { ok: worstShare >= 0.2, how: `icon glyph ${Math.round(worstShare * 100)}% px ≥ 3:1`, best: Math.round(best * 100) / 100 };
      })());
    } else it.nonText = { ok: false, how: 'no boundary, no text, no icon', best: Math.round(best * 100) / 100 };
  }
  await Promise.all(imgs);

  // ---- B5: links and fullscreen mentions (labels, tips, text, titles)
  for (const a of document.querySelectorAll<HTMLAnchorElement | HTMLAreaElement>('a[href], area[href]')) {
    const u = new URL(a.getAttribute('href')!, location.href);
    if (u.origin !== location.origin) out.links.push(u.href);
  }
  for (const f of document.querySelectorAll<HTMLFormElement>('form[action]')) { const u = new URL(f.action, location.href); if (u.origin !== location.origin) out.links.push('form:' + u.href); }
  const fs = /full\s*-?\s*screen|vollbild/i;
  for (const el of document.querySelectorAll<HTMLElement>('body *')) {
    for (const v of [el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('data-tip'), el.children.length === 0 ? el.textContent : null]) if (v && fs.test(v)) out.fsMentions.push(`${desc(el)}: ${v.slice(0, 60)}`);
  }

  // ---- B6: user-select on body, .hud and every visible HUD element except form fields
  const us = (el: Element) => { const cs = getComputedStyle(el) as any; return (cs.userSelect || cs.webkitUserSelect || '') as string; };
  out.userSelect.push({ where: 'body', v: us(document.body) }, { where: '.hud', v: us(hud) });
  for (const el of hud.querySelectorAll('*')) {
    if (el.matches('input, textarea, select, [contenteditable="true"]') || !isVis(el)) continue;
    out.userSelect.push({ where: desc(el), v: us(el) });
  }
  return out;
}

const probe = (page: Page) => page.evaluate(hudProbe);
/** measurements: attached to the test report; also written to $M3UI_DUMP/<name> when that env var names a directory */
const attach = async (info: TestInfo, name: string, data: unknown) => {
  const body = JSON.stringify(data, null, 1);
  if (process.env.M3UI_DUMP) { mkdirSync(process.env.M3UI_DUMP, { recursive: true }); writeFileSync(join(process.env.M3UI_DUMP, name), body); }
  await info.attach(name, { body, contentType: 'application/json' });
};
const uniq = (xs: string[]) => [...new Set(xs)];

// ---------------------------------------------------------------------------------------------------------- B3
test.describe('B3 contrast (EN)', () => {
  for (const [w, h] of [[1280, 720], [800, 450]] as const) {
    test(`B3 text ≥ 4.5:1 on panels, UI ≥ 3:1, world text has plaque/shadow @ ${w}x${h}`, async ({ page }, info) => {
      await page.setViewportSize({ width: w, height: h });
      await load(page, MID + '&lang=en');
      const fails: string[] = [], log: Record<string, unknown> = {};
      let panelTexts = 0, worldTexts = 0;
      // the brief's states (base, rooms menu, room panel, settings) plus the build tool: its cursor label is the DOM text
      // that sits over the world
      await eachState(page, ['base', 'rooms', 'room', 'settings', 'build'], async s => {
        // scroll containers (modal body, panel body, menu rows) are walked page by page so text below the fold is measured too
        const pages: Probe[] = [];
        for (let step = 0; step < 12; step++) {
          pages.push(await probe(page));
          const more = await page.evaluate(() => {
            let moved = false;
            for (const el of document.querySelectorAll<HTMLElement>('.hud *')) {
              const cs = getComputedStyle(el);
              if (!/(auto|scroll)/.test(cs.overflowY + cs.overflowX) || !el.checkVisibility()) continue;
              if (el.scrollHeight > el.clientHeight + 1 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) { el.scrollTop += Math.max(20, el.clientHeight * 0.8); moved = true; }
              else if (el.scrollWidth > el.clientWidth + 1 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) { el.scrollLeft += Math.max(20, el.clientWidth * 0.8); moved = true; }
            }
            return moved;
          });
          if (!more) break;
          await page.waitForTimeout(200);
        }
        log[s] = pages;
        for (const p of pages) {
          for (const u of p.unparsed) fails.push(`[${s}] unparsable colour ${u}`);
          for (const t of p.texts) {
            if (t.kind === 'panel') { panelTexts++; if (t.ratio < 4.5) fails.push(`[${s}] text ${t.ratio}:1 < 4.5 – "${t.text}" ${t.fg} on ${t.bg} – ${t.where}`); }
            else { worldTexts++; if (!t.plaque && !t.shadow) fails.push(`[${s}] world text without plaque/shadow (bg alpha ${t.alpha}) – "${t.text}" – ${t.where}`); }
          }
          for (const c of p.ctls) if (c.inPanel && !c.nonText.ok) fails.push(`[${s}] UI ${c.nonText.how} (best edge ${c.nonText.best}:1 < 3) – ${c.where}`);
        }
      });
      await attach(info, `b3-${w}x${h}.json`, log);
      expect(panelTexts, 'panel texts were measured').toBeGreaterThan(20);
      info.annotations.push({ type: 'measured', description: `${panelTexts} panel text nodes, ${worldTexts} world text nodes` });
      expect(uniq(fails)).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------------------------------------- B4
const TOUCH_SIZES = [
  { name: 'phone 844x390', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true },
  { name: 'tablet 1024x768', viewport: { width: 1024, height: 768 }, isMobile: false, hasTouch: true },
  { name: 'tablet 1180x820', viewport: { width: 1180, height: 820 }, isMobile: false, hasTouch: true },
];
test.describe('B4 touch targets ≥ 44×44', () => {
  for (const sz of TOUCH_SIZES) {
    test.describe(sz.name, () => {
      test.use({ viewport: sz.viewport, isMobile: sz.isMobile, hasTouch: sz.hasTouch });
      test(`B4 every visible control ≥ 44×44 CSS px in all states @ ${sz.name}`, async ({ page }, info) => {
        await load(page);
        expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'touch emulation active').toBe(true);
        const fails: string[] = [], log: Record<string, unknown> = {};
        let n = 0;
        const visited = await eachState(page, ALL_STATES, async s => {
          const p = await probe(page);
          log[s] = p.ctls;
          for (const c of p.ctls) { n++; if (c.w < 44 || c.h < 44) fails.push(`[${s}] ${c.w}×${c.h} – ${c.where}${c.aria ? ` "${c.aria}"` : c.text ? ` "${c.text}"` : ''}`); }
        });
        await attach(info, `b4-${sz.viewport.width}x${sz.viewport.height}.json`, { visited, log });
        expect(n).toBeGreaterThan(20);
        expect(uniq(fails)).toEqual([]);
      });
    });
  }
  test('B4 the topbar stage list was covered at the phone size', async ({ browser }) => {
    const c = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
    const page = await c.newPage();
    await load(page);
    expect(await enter(page, 'stageList'), 'stage list reachable at 844×390 (collapse level 6)').toBe(true);
    await c.close();
  });
});

// ---------------------------------------------------------------------------------------------------------- D5
test.describe('D5 every button has a label/icon and a tooltip', () => {
  for (const [w, h] of [[1280, 720], [800, 450]] as const) {
    test(`D5 buttons in all states @ ${w}x${h}`, async ({ page }, info) => {
      await page.setViewportSize({ width: w, height: h });
      await load(page);
      const fails: string[] = [], log: Record<string, unknown> = {};
      let n = 0;
      await eachState(page, ALL_STATES, async s => {
        const p = await probe(page);
        log[s] = p.ctls;
        for (const c of p.ctls) {
          if (!c.tag.startsWith('button')) continue;   // [role=button] below; form fields are not buttons
          n++;
          const label = !!c.text || c.icon || !!c.aria;
          if (!label) fails.push(`[${s}] no text, icon or aria-label – ${c.where}`);
          if (!c.tip.trim()) fails.push(`[${s}] no data-tip (tooltip) – ${c.where}${c.aria ? ` "${c.aria}"` : c.text ? ` "${c.text}"` : ''}`);
          // UI contract (docs/UI_DESIGN.md §2): icon-only buttons need an accessible name
          if (!c.text && !c.aria) fails.push(`[${s}] icon-only button without aria-label – ${c.where}`);
        }
        // [role=button] elements are buttons too
        const roleBtns = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.hud [role="button"]')]
          .filter(e => e.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
          .map(e => ({ tip: e.dataset.tip ?? '', named: !!(e.innerText.trim() || e.querySelector('img,svg') || e.getAttribute('aria-label')?.trim()), cls: e.className })));
        for (const r of roleBtns) { n++; if (!r.named || !r.tip) fails.push(`[${s}] [role=button].${r.cls}: named=${r.named} tip="${r.tip}"`); }
      });
      await attach(info, `d5-${w}x${h}.json`, log);
      expect(n).toBeGreaterThan(20);
      expect(uniq(fails)).toEqual([]);
    });
  }

  test('D5 hovering one button per component shows a tooltip with text @ 1280x720', async ({ page }) => {
    await load(page);
    const fails: string[] = [];
    const seen = new Set<string>();
    for (const s of ALL_STATES) {
      await reset(page);
      if (!(await enter(page, s))) continue;
      // first visible, unclipped, uncovered button of every component not sampled yet
      const samples = await page.evaluate(() => {
        const hud = document.querySelector('.hud')!;
        const res: { comp: string; what: string; x: number; y: number }[] = [];
        const all = [...hud.querySelectorAll<HTMLElement>('button[data-tip], [role="button"][data-tip]')];
        all.forEach((el, idx) => {
          if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return;
          const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return;
          const x = r.left + r.width / 2, y = r.top + r.height / 2;
          if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return;
          const hit = document.elementFromPoint(x, y); if (!hit || !el.contains(hit)) return;
          const top = [...hud.children].find(c => c.contains(el)) as HTMLElement;
          const comp = (top.className.trim().split(/\s+/)[0] || top.tagName) + (el.closest('.ov-modal') ? ':modal' : el.closest('[data-overlay]') && top !== el.closest('[data-overlay]') ? ':' + (el.closest('[data-overlay]') as HTMLElement).className.split(/\s+/)[0] : '');
          if (!res.some(q => q.comp === comp)) res.push({ comp, what: `#${idx} ${el.tagName.toLowerCase()}.${el.className.trim().split(/\s+/).join('.')} "${el.getAttribute('aria-label') ?? el.innerText.trim().slice(0, 30)}"`, x, y });
        });
        return res;
      });
      for (const sm of samples) {
        if (seen.has(sm.comp)) continue;
        seen.add(sm.comp);
        await page.mouse.move(sm.x, sm.y);
        const ok = await expect.poll(() => page.evaluate(() => {
          const t = document.querySelector('.ov-tip.on') as HTMLElement | null;
          return t && t.checkVisibility({ opacityProperty: true, visibilityProperty: true }) ? (t.querySelector('.ov-tip-title')?.textContent ?? '').trim() : '';
        }), { timeout: 2000 }).not.toBe('').then(() => true, () => false);
        if (!ok) fails.push(`[${s}] no tooltip after hovering ${sm.comp} button ${sm.what}`);
        await page.mouse.move(2, 2);
        await page.waitForTimeout(150);
      }
    }
    expect([...seen].length, `components sampled: ${[...seen].join(', ')}`).toBeGreaterThanOrEqual(5);
    expect(fails).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------- B5
test.describe('B5 no fullscreen button, no external links', () => {
  test('B5 DOM: no off-origin link and no fullscreen control in any state (EN + DE)', async ({ page }) => {
    const fails: string[] = [];
    for (const lang of ['en', 'de']) {
      const guard = await load(page, `${MID}&lang=${lang}`);
      await eachState(page, ALL_STATES, async s => {
        const p = await probe(page);
        for (const l of p.links) fails.push(`[${lang}/${s}] external link ${l}`);
        for (const m of p.fsMentions) fails.push(`[${lang}/${s}] fullscreen mention ${m}`);
      });
      for (const u of guard.foreign) if (u !== SDK_URL) fails.push(`[${lang}] foreign request ${u}`);
      await page.unroute('**/*');
    }
    expect(uniq(fails)).toEqual([]);
  });

  test('B5 bundle: no requestFullscreen, no http(s) URLs except w3.org namespaces and the CrazyGames SDK', async ({ page, request }) => {
    // crawl the built app from the server (works for any baseURL / outDir): index.html → scripts/styles → static imports
    // and dynamic chunks referenced from the JS
    await setup(page);
    await gotoGame(page, '', 0);
    const base = page.url();
    const queue = [new URL('/', base).href], seen = new Set<string>(), files: { url: string; body: string }[] = [];
    // add every resource the running page loaded, too
    for (const u of await page.evaluate(() => performance.getEntriesByType('resource').map(e => e.name))) if (/\.(m?js|css|html)(\?|$)/.test(u)) queue.push(u);
    while (queue.length) {
      const u = queue.shift()!;
      const url = new URL(u, base);
      if (url.origin !== new URL(base).origin || seen.has(url.pathname)) continue;
      seen.add(url.pathname);
      const res = await request.get(url.href);
      if (!res.ok()) continue;
      const body = await res.text();
      files.push({ url: url.pathname, body });
      for (const m of body.matchAll(/(?:src|href)=["']([^"']+\.(?:m?js|css))["']/g)) queue.push(new URL(m[1], url).href);
      for (const m of body.matchAll(/["'`](\.{0,2}\/?(?:assets\/)?[\w.-]+\.m?js)["'`]/g)) queue.push(new URL(m[1], url).href);
    }
    const js = files.filter(f => f.url.endsWith('.js'));
    expect(js.length, 'JS chunks found').toBeGreaterThan(1);
    expect(files.some(f => f.url === '/' || f.url.endsWith('.html')), 'index.html crawled').toBe(true);
    const fails: string[] = [];
    for (const f of files) {
      for (const m of f.body.matchAll(/(?:request|webkitRequest|mozRequest|msRequest)Full[sS]creen/g)) fails.push(`${f.url}: ${m[0]}`);
      for (const m of f.body.matchAll(/https?:\/\/[^\s"'`)<>\\]+/g)) {
        const u = m[0];
        if (/^https?:\/\/www\.w3\.org\//.test(u)) continue;            // XML/SVG namespaces
        if (u === SDK_URL) continue;                                     // CrazyGames SDK v3 (loaded by the platform layer)
        // A string that is only ever printed to the console is not a link (never rendered, never requested) – e.g. the
        // PixiJS "hello" banner. Exempt exactly that: within ±450 chars of the URL there is a console.log/info call and
        // none of the sinks that could turn it into a link or request (href, location, open(, fetch(, src=, innerHTML,
        // XMLHttpRequest, sendBeacon, import(, <a).
        const win = f.body.slice(Math.max(0, m.index! - 450), m.index! + u.length + 450);
        if (/console\.(?:log|info)\(/.test(win) && !/href|location|\.open\(|fetch\(|\.src\s*=|innerHTML|XMLHttpRequest|sendBeacon|import\(|<a[\s>]/i.test(win)) continue;
        fails.push(`${f.url}: ${u}  …${f.body.slice(Math.max(0, m.index! - 60), m.index! + u.length + 20).replace(/\s+/g, ' ')}…`);
      }
    }
    expect(uniq(fails)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------- B6
test('B6 user-select is none on body, .hud and every visible HUD element (form fields excluded)', async ({ page }) => {
  await load(page);
  const fails: string[] = [];
  let n = 0;
  await eachState(page, ALL_STATES, async s => {
    const p = await probe(page);
    for (const u of p.userSelect) { n++; if (u.v !== 'none') fails.push(`[${s}] user-select: ${u.v} – ${u.where}`); }
    // representative elements must be among the measured ones
    if (s === 'base') for (const sel of ['body', '.hud', 'div.topbar', 'button']) expect(p.userSelect.some(u => u.where === sel || u.where.includes(sel)), `measured ${sel}`).toBe(true);
  });
  expect(n).toBeGreaterThan(50);
  expect(uniq(fails)).toEqual([]);
});
