/* eslint-disable @typescript-eslint/no-explicit-any -- in-page probes read untyped window hooks and CSSStyleDeclaration by name */
/**
 * M3 UI acceptance tests – Brief §12.3 B3 (contrast), B4 (touch targets), B5 (no fullscreen, no external links),
 * B6 (user-select) and §12.5 D5 (every button has a label/icon and a tooltip). The hotkey half of D5 is a unit test
 * (tests/unit/hotkeys.test.ts), D7 lives in tests/unit/i18n.test.ts.
 *
 * Runs with the project config or any config that sets baseURL (relative URLs only). Every page goes through
 * helpers.setup() (SDK mock, foreign-request guard) and helpers.gotoGame().
 *
 * States (tests/e2e/states.ts): one page per viewport, the states are entered one after the other through the runtime
 * hooks (window.__ctx) or real input where no hook exists:
 *   base · rooms menu · staff menu · room panel · rascal panel · build tool · demolish tool · settings · help ·
 *   clipboard goal list · topbar stage list (only exists at collapse level 6, i.e. narrow widths) ·
 *   the confirmation sub-states: room-panel demolish confirm, canvas demolish bubble, touch build ✓ / ✕, settings
 *   reset confirm · and for B3/B4/D5 the transient layers (hover tooltip, toasts).
 * Every page loads the mid-game bot state; B3, B4 and D5 also run a fresh-game (tutorial) pass, so the tutorial
 * clipboard (step 1/4, Skip) is measured too. The game is paused after loading so the HUD holds still.
 */
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setup, gotoGame, SDK_URL } from './helpers';
import { MID, ALL_STATES, TRANSIENT, TUTORIAL_STATES, type StateName, load, reset, enter, eachState, visible } from './states';

// ---------------------------------------------------------------------------------------------------------- in-page probe
interface TextItem { where: string; text: string; kind: 'panel' | 'world'; ratio: number; fg: string; bg: string; alpha: number; plaque: boolean; shadow: boolean; shadowRatio: number; disabled: boolean }
interface CtlItem {
  where: string; comp: string; tag: string; w: number; h: number; disabled: boolean;
  text: string; icon: boolean; aria: string; tip: string; tipTitle: string | null;
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
 *      A < 0.9  → "text over the world": must have a readable plaque – A ≥ 0.5 AND the same worst-case ratio over a
 *                 black and a white world ≥ 4.5:1 – or a shadow: a text-shadow (alpha > 0.2) / -webkit-text-stroke whose
 *                 colour has ≥ 3:1 against the text colour (a same-hue shadow does not separate text from the world).
 *  - No exemption for disabled controls (the brief has none): natively disabled and aria-disabled controls are held to
 *    the same rules; a disabled button must additionally explain itself in its tooltip (D5 resolves the bound tooltip).
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
  /** the part of `r` that is actually painted: viewport ∩ every clipping ancestor (overflow ≠ visible) */
  const visibleRect = (el: Element, r: DOMRect) => {
    let x0 = Math.max(0, r.left), y0 = Math.max(0, r.top), x1 = Math.min(vw, r.right), y1 = Math.min(vh, r.bottom);
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const b = p.getBoundingClientRect();
      if (cs.overflowX !== 'visible') { x0 = Math.max(x0, b.left); x1 = Math.min(x1, b.right); }
      if (cs.overflowY !== 'visible') { y0 = Math.max(y0, b.top); y1 = Math.min(y1, b.bottom); }
    }
    return { x0, y0, x1, y1 };
  };
  const clipped = (el: Element, r: DOMRect) => { const v = visibleRect(el, r); return v.x1 - v.x0 < 1 || v.y1 - v.y0 < 1; };
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
    if (!isVis(el)) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || clipped(el, r)) continue;
    const cs = getComputedStyle(el);
    const fg0 = parse(cs.color); if (!fg0) continue;
    const fgA = fg0[3] * opacityChain(el);
    // backdrop at the centre of the painted part (a row half scrolled out of a modal body is judged where it is visible)
    const vr = visibleRect(el, r);
    const { layers, alpha } = layersOf(el, (vr.x0 + vr.x1) / 2, (vr.y0 + vr.y1) / 2);
    // shadow / stroke colours that actually separate the glyphs from the world: ≥ 3:1 against the text colour
    const sep: RGBA[] = [];
    if (cs.textShadow !== 'none') for (const c of colorsIn(cs.textShadow)) if (c[3] > 0.2) sep.push(c);
    if (parseFloat((cs as any).webkitTextStrokeWidth || '0') > 0) { const c = parse((cs as any).webkitTextStrokeColor); if (c && c[3] > 0.2) sep.push(c); }
    const shadowRatio = sep.length ? Math.max(...sep.map(c => ratio([fg0[0], fg0[1], fg0[2], 1], over(c, c[3], [fg0[0], fg0[1], fg0[2], 1])))) : 0;
    const item: TextItem = {
      where: desc(el), text: txt.slice(0, 40), kind: alpha >= 0.9 ? 'panel' : 'world', ratio: 0, fg: hex(fg0), bg: '', alpha: Math.round(alpha * 100) / 100,
      plaque: alpha >= 0.5, shadow: shadowRatio >= 3, shadowRatio: Math.round(shadowRatio * 100) / 100, disabled: !!el.closest('[disabled], [aria-disabled="true"]'),
    };
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
      // D5: the tooltip content actually bound through ctx.tip (src/app.ts test hook) – null when nothing is bound,
      // '' when the content function returns no title (or throws: tooltips.ts catches that and yields null)
      tipTitle: typeof (window as any).__tipOf === 'function' ? (() => { const c = (window as any).__tipOf(el); return c ? String(c.title ?? '').trim() : null; })() : null,
      inPanel: false, nonText: { ok: true, how: 'n/a', best: 0 },
    };
    out.ctls.push(it);
    if (!/^(BUTTON)$/.test(el.tagName) && el.getAttribute('role') !== 'button') continue;
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
/** the one URL the PixiJS console banner prints (node_modules/pixi.js: sayHello) */
const PIXI_BANNER = 'http://www.pixijs.com/';

// ---------------------------------------------------------------------------------------------------------- B3
/** fresh game = tutorial (clipboard shows step 1/4 and the Skip button) */
const FRESH = 'lang=en';

async function b3Run(page: Page, info: TestInfo, tag: string, states: StateName[]) {
  const fails: string[] = [], log: Record<string, unknown> = {};
  let panelTexts = 0, worldTexts = 0;
  const visited = await eachState(page, states, async s => {
    // scroll containers (modal body, panel body, menu rows) are walked page by page so text below the fold is measured too
    const pages: Probe[] = [];
    for (let step = 0; step < 12; step++) {
      pages.push(await probe(page));
      if (s === 'tip') break;   // scrolling hides the tooltip (by design): measured on the first page only
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
        if (t.kind === 'panel') { panelTexts++; if (t.ratio < 4.5) fails.push(`[${s}] text ${t.ratio}:1 < 4.5 – "${t.text}" ${t.fg} on ${t.bg} – ${t.where}${t.disabled ? ' (disabled – no exemption)' : ''}`); }
        else {
          worldTexts++;
          const plaqueOk = t.plaque && t.ratio >= 4.5;
          if (!plaqueOk && !t.shadow) fails.push(`[${s}] world text: ${t.plaque ? `plaque (alpha ${t.alpha}) only ${t.ratio}:1 < 4.5 over the world` : `no plaque (alpha ${t.alpha})`} and ${t.shadowRatio ? `shadow only ${t.shadowRatio}:1 < 3 vs the text` : 'no shadow'} – "${t.text}" – ${t.where}`);
        }
      }
      for (const c of p.ctls) if (c.inPanel && !c.nonText.ok) fails.push(`[${s}] UI ${c.nonText.how} (best edge ${c.nonText.best}:1 < 3) – ${c.where}`);
    }
    // the state's own layer was part of the first measured page
    if (s === 'tip') expect(pages[0].texts.some(t => t.where.includes('ov-tip')), 'tooltip text measured').toBe(true);
    if (s === 'toast') expect(pages[0].texts.filter(t => t.where.includes('ov-toast')).length, 'toast texts measured').toBeGreaterThanOrEqual(3);
  });
  await attach(info, `b3-${tag}.json`, { visited, log });
  expect(visited, 'every requested state was entered (except the stage list above collapse level 6)').toEqual(states.filter(s => s !== 'stageList' || visited.includes('stageList')));
  expect(panelTexts, 'panel texts were measured').toBeGreaterThan(20);
  info.annotations.push({ type: 'measured', description: `${panelTexts} panel text nodes, ${worldTexts} world text nodes; states ${visited.join(', ')}` });
  expect(uniq(fails)).toEqual([]);
}

test.describe('B3 contrast (EN)', () => {
  for (const [w, h] of [[1280, 720], [800, 450]] as const) {
    test(`B3 text ≥ 4.5:1 on panels, UI ≥ 3:1, world text has plaque/shadow @ ${w}x${h}`, async ({ page }, info) => {
      await page.setViewportSize({ width: w, height: h });
      await load(page, MID + '&lang=en');
      // every main state, every confirmation sub-state and the transient layers (tooltip, toasts)
      await b3Run(page, info, `${w}x${h}`, [...ALL_STATES, ...TRANSIENT]);
    });
    test(`B3 tutorial (fresh game) @ ${w}x${h}`, async ({ page }, info) => {
      await page.setViewportSize({ width: w, height: h });
      await load(page, FRESH);
      expect(await page.evaluate(() => (window as any).__sim.tutorial.active), 'fresh game runs the tutorial').toBe(true);
      await b3Run(page, info, `tutorial-${w}x${h}`, TUTORIAL_STATES);
    });
  }
});

// ---------------------------------------------------------------------------------------------------------- B4
/** mobile and tablet sizes; 800×450 is the brief's mandatory mobile size, 667×375 the smallest landscape phone */
const TOUCH_SIZES = [
  { name: 'phone 800x450', viewport: { width: 800, height: 450 }, isMobile: true, hasTouch: true, tutorial: true },
  { name: 'phone 667x375', viewport: { width: 667, height: 375 }, isMobile: true, hasTouch: true, tutorial: false },
  { name: 'phone 844x390', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, tutorial: true },
  { name: 'tablet 1024x768', viewport: { width: 1024, height: 768 }, isMobile: false, hasTouch: true, tutorial: false },
  { name: 'tablet 1180x820', viewport: { width: 1180, height: 820 }, isMobile: false, hasTouch: true, tutorial: false },
];
async function b4Run(page: Page, info: TestInfo, tag: string, states: StateName[]) {
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'touch emulation active').toBe(true);
  const fails: string[] = [], log: Record<string, unknown> = {};
  let n = 0;
  const visited = await eachState(page, states, async s => {
    const p = await probe(page);
    log[s] = p.ctls;
    for (const c of p.ctls) { n++; if (c.w < 44 || c.h < 44) fails.push(`[${s}] ${c.w}×${c.h} – ${c.where}${c.aria ? ` "${c.aria}"` : c.text ? ` "${c.text}"` : ''}`); }
  });
  await attach(info, `b4-${tag}.json`, { visited, log });
  expect(n).toBeGreaterThan(20);
  expect(uniq(fails)).toEqual([]);
  return visited;
}
test.describe('B4 touch targets ≥ 44×44', () => {
  for (const sz of TOUCH_SIZES) {
    test.describe(sz.name, () => {
      test.use({ viewport: sz.viewport, isMobile: sz.isMobile, hasTouch: sz.hasTouch });
      test(`B4 every visible control ≥ 44×44 CSS px in all states @ ${sz.name}`, async ({ page }, info) => {
        await load(page);
        await b4Run(page, info, `${sz.viewport.width}x${sz.viewport.height}`, ALL_STATES);
      });
      if (sz.tutorial) {
        test(`B4 tutorial (fresh game) @ ${sz.name}`, async ({ page }, info) => {
          await load(page, FRESH);
          expect(await page.evaluate(() => (window as any).__sim.tutorial.active), 'fresh game runs the tutorial').toBe(true);
          await b4Run(page, info, `tutorial-${sz.viewport.width}x${sz.viewport.height}`, TUTORIAL_STATES);
        });
      }
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
async function d5Run(page: Page, info: TestInfo, tag: string, states: StateName[]) {
  expect(await page.evaluate(() => typeof (window as any).__tipOf), 'test hook window.__tipOf (src/app.ts)').toBe('function');
  const fails: string[] = [], log: Record<string, unknown> = {};
  let n = 0;
  await eachState(page, states, async s => {
    const p = await probe(page);
    log[s] = p.ctls;
    for (const c of p.ctls) {
      if (!c.tag.startsWith('button')) continue;   // [role=button] below; form fields are not buttons
      n++;
      const name = `${c.where}${c.aria ? ` "${c.aria}"` : c.text ? ` "${c.text}"` : ''}`;
      const label = !!c.text || c.icon || !!c.aria;
      if (!label) fails.push(`[${s}] no text, icon or aria-label – ${c.where}`);
      // the contract marker (docs/UI_DESIGN.md §2) AND a tooltip that is really bound through ctx.tip and has a title
      if (!c.tip.trim()) fails.push(`[${s}] no data-tip marker – ${name}`);
      if (c.tipTitle === null) fails.push(`[${s}] no tooltip bound via ctx.tip (or its content function throws) – ${name}`);
      else if (!c.tipTitle) fails.push(`[${s}] tooltip with an empty title – ${name}`);
      // UI contract (docs/UI_DESIGN.md §2): icon-only buttons need an accessible name
      if (!c.text && !c.aria) fails.push(`[${s}] icon-only button without aria-label – ${c.where}`);
    }
    // [role=button] elements are buttons too
    const roleBtns = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.hud [role="button"]')]
      .filter(e => e.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
      .map(e => {
        const c = (window as any).__tipOf(e);
        return { tip: c ? String(c.title ?? '').trim() : '', named: !!(e.innerText.trim() || e.querySelector('img,svg') || e.getAttribute('aria-label')?.trim()), cls: e.className };
      }));
    for (const r of roleBtns) { n++; if (!r.named || !r.tip) fails.push(`[${s}] [role=button].${r.cls}: named=${r.named} bound tooltip title="${r.tip}"`); }
  });
  await attach(info, `d5-${tag}.json`, log);
  expect(n).toBeGreaterThan(20);
  expect(uniq(fails)).toEqual([]);
}
test.describe('D5 every button has a label/icon and a tooltip', () => {
  for (const [w, h] of [[1280, 720], [800, 450]] as const) {
    test(`D5 buttons in all states @ ${w}x${h}`, async ({ page }, info) => {
      await page.setViewportSize({ width: w, height: h });
      await load(page);
      await d5Run(page, info, `${w}x${h}`, ALL_STATES);
    });
  }
  test('D5 buttons in the tutorial (fresh game) @ 800x450', async ({ page }, info) => {
    await page.setViewportSize({ width: 800, height: 450 });
    await load(page, FRESH);
    expect(await page.evaluate(() => (window as any).__sim.tutorial.active), 'fresh game runs the tutorial').toBe(true);
    await d5Run(page, info, 'tutorial-800x450', TUTORIAL_STATES);
  });

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
        }), { timeout: 5000 }).not.toBe('').then(() => true, () => false); // 300 ms hover delay + fade; SwiftShader frames can take > 800 ms
        if (!ok) fails.push(`[${s}] no tooltip after hovering ${sm.comp} button ${sm.what}`);
        await page.mouse.move(2, 2);
        await page.waitForTimeout(150);
      }
    }
    expect([...seen].length, `components sampled: ${[...seen].join(', ')}`).toBeGreaterThanOrEqual(5);
    expect(fails).toEqual([]);
  });

  // The source-level comparison (handled keys ↔ help key table) is tests/unit/hotkeys.test.ts. This checks the RENDERED help
  // overlay: it opens with H and actually shows a key cap for every hotkey the UI contract names (docs/UI_DESIGN.md §4), in
  // both languages (DE key names from overlays.key.*).
  test('D5 the help overlay opens with H and renders every hotkey (EN + DE)', async ({ page }) => {
    const common = ['W', 'A', 'S', 'D', '↑', '←', '↓', '→', 'B', 'O', 'P', 'H', '1', '2', '3', 'Z', 'Cmd', 'Esc'];
    const named: Record<string, string[]> = { en: ['Del', 'Ctrl', 'Shift', 'Space'], de: ['Entf', 'Strg', 'Umschalt', 'Leertaste'] };
    const fails: string[] = [];
    for (const lang of ['en', 'de'] as const) {
      await load(page, `lang=${lang}`);
      await reset(page);
      await page.keyboard.press('h');
      await expect.poll(() => visible(page, '.ov-modal'), { message: `[${lang}] H opens the help overlay` }).toBe(true);
      const caps = await page.evaluate(() => [...document.querySelectorAll('.ov-modal kbd')].map(k => (k.textContent ?? '').trim()));
      const missing = [...common, ...named[lang]].filter(k => !caps.includes(k));
      if (missing.length) fails.push(`[${lang}] help overlay lacks key caps: ${missing.join(' ')}  (rendered: ${[...new Set(caps)].join(' ')})`);
      await page.keyboard.press('h');
      await expect.poll(() => visible(page, '.ov-modal'), { message: `[${lang}] H closes the help overlay again` }).toBe(false);
      await page.unroute('**/*');
    }
    expect(fails).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------- B5
test.describe('B5 no fullscreen button, no external links', () => {
  test('B5 DOM: no off-origin link and no fullscreen control in any state (EN + DE)', async ({ page }) => {
    // 2 languages × 22 states (8 of them M5) in one test: ~115 s under SwiftShader, right at the 120 s default – the time
    // limit is test infrastructure, not a B5 threshold (closer M5: two runs ended at 120 s in state m5Leads/m5Banner)
    test.setTimeout(300_000);
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
        // exactly the PixiJS "hello" console banner (`PixiJS <version> - <renderer> - http://www.pixijs.com/`): printed
        // to the console once, never rendered or requested. Exempt only this exact URL and only next to a console.log call.
        if (u === PIXI_BANNER && /console\.log\(/.test(f.body.slice(Math.max(0, m.index! - 300), m.index! + 800))) continue;
        fails.push(`${f.url}: ${u}  …${f.body.slice(Math.max(0, m.index! - 60), m.index! + u.length + 20).replace(/\s+/g, ' ')}…`);
      }
      // protocol-relative hosts ("//host.tld/…", url(//host…)) and mailto: links
      for (const m of f.body.matchAll(/(?:["'`(=]\s*)\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}(?=[:/?#"'`)\s])/gi)) fails.push(`${f.url}: protocol-relative ${m[0]}  …${f.body.slice(Math.max(0, m.index! - 40), m.index! + m[0].length + 30).replace(/\s+/g, ' ')}…`);
      for (const m of f.body.matchAll(/mailto:[^\s"'`)<>]*/gi)) fails.push(`${f.url}: ${m[0]}`);
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

// ---------------------------------------------------------------------------------------------------------- regressions
// Product findings of the M3 verifier pass (stacking and Esc order); each test reproduces the reported case.
test.describe('M3 regressions: layer stacking and Esc order', () => {
  test('compact: the open clipboard card / goal list is never hidden under the room sheet (800×450)', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 450 });
    await load(page, `${MID}&lang=de`);
    await reset(page);
    await enter(page, 'room');
    await page.locator('.cb-chip').click();
    await expect.poll(() => visible(page, '.cb-more'), { message: 'card expanded' }).toBe(true);
    await expect.poll(() => visible(page, '.pn'), { message: 'the sheet gives way to the expanded card' }).toBe(false);
    await page.locator('.cb-more').click();
    await expect.poll(() => visible(page, '.cb-list'), { message: 'goal list open' }).toBe(true);
    // every goal row is the top-most element at its centre (nothing drawn over the list)
    // (rows are judged where they are painted: inside the list's scroll box and the viewport)
    const covered = await page.evaluate(() => {
      const box = document.querySelector('.cb-items')!.getBoundingClientRect();
      return [...document.querySelectorAll<HTMLElement>('.cb-list .cb-item')].flatMap(e => {
        const r = e.getBoundingClientRect();
        const y0 = Math.max(r.top, box.top, 0), y1 = Math.min(r.bottom, box.bottom, innerHeight);
        if (y1 - y0 < 4) return [];
        const hit = document.elementFromPoint(r.left + r.width / 2, (y0 + y1) / 2);
        return hit && hit.closest('.cb-list') ? [] : [`${(e.innerText || '').trim().slice(0, 30)} → ${hit ? hit.tagName.toLowerCase() + '.' + String(hit.className).split(' ')[0] : 'nothing'}`];
      });
    });
    expect(covered, 'goal rows covered by another layer').toEqual([]);
    // closing the clipboard layers brings the sheet back (selection kept)
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await expect.poll(() => visible(page, '.pn'), { message: 'sheet back after the clipboard closed' }).toBe(true);
  });

  test('a menu or tool opened by hotkey closes the goal list, so one Esc closes what is visible (800×450 and 1280×720)', async ({ page }) => {
    for (const [w, h] of [[800, 450], [1280, 720]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await load(page, `${MID}&lang=de`);
      await reset(page);
      await enter(page, 'clipList');
      await page.keyboard.press('b');
      await expect.poll(() => page.evaluate(() => (window as any).__ctx.menu.get()), { message: `[${w}] B opens the rooms menu` }).toBe('rooms');
      await expect.poll(() => visible(page, '.cb-list'), { message: `[${w}] goal list closed by the menu` }).toBe(false);
      expect(await page.evaluate(() => !!document.querySelector('.cb--open')), `[${w}] compact card closed by the menu`).toBe(false);
      await page.keyboard.press('Escape');
      await expect.poll(() => page.evaluate(() => (window as any).__ctx.menu.get()), { message: `[${w}] one Esc closes the menu` }).toBe(null);
      // the same for a tool (Del → demolish)
      await enter(page, 'clipList');
      await page.keyboard.press('Delete');
      await expect.poll(() => page.evaluate(() => (window as any).__ctx.tool.get().kind), { message: `[${w}] Del picks the demolish tool` }).toBe('demolish');
      await expect.poll(() => visible(page, '.cb-list'), { message: `[${w}] goal list closed by the tool` }).toBe(false);
      await page.unroute('**/*');
    }
  });

  test('Esc while a tooltip is visible only hides the tooltip (1280×720)', async ({ page }) => {
    await load(page, `${MID}&lang=en`);
    await reset(page);
    await enter(page, 'room');
    await page.locator('.bb-bar button[data-tip]').first().hover();
    await expect.poll(() => visible(page, '.ov-tip.on'), { message: 'tooltip shown' }).toBe(true);
    await page.keyboard.press('Escape');
    await expect.poll(() => visible(page, '.ov-tip.on'), { message: 'tooltip hidden' }).toBe(false);
    expect(await page.evaluate(() => (window as any).__ctx.selection.get()?.kind ?? null), 'the room stays selected').toBe('room');
    await page.mouse.move(2, 2);
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => (window as any).__ctx.selection.get()), { message: 'the next Esc deselects' }).toBe(null);
  });
});
