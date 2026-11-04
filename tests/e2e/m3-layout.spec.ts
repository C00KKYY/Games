/* eslint-disable @typescript-eslint/no-explicit-any -- in-page probes read untyped window hooks (__sim, __ctx, __game) and Pixi internals */
/**
 * M3 layout acceptance tests – Brief §12.3 B1 (screenshot matrix + DOM audit), B2 (canvas backing store), B7 (800×450).
 * Sizes from docs/UI_DESIGN.md §5. Runs with the project config or any config that sets baseURL (relative URLs only).
 *
 * Output:
 *  - qa/m3/b1/<lang>/<screen>-<w>x<h>.png  – the 3 single images per screen that are reviewed visually (800×450, 907×510, 1920×1080)
 *  - qa/tmp/m3-b1/<lang>/…                 – the other 7 sizes; qa/tmp/ is already gitignored, so the repo only keeps the
 *                                            reviewed singles and the montages, while the full matrix stays on disk locally
 *  - qa/m3/montage-<lang>.png               – one ffmpeg `tile` montage per language (rows = screens, columns = sizes)
 *  - qa/m3/b1-audit.json                    – the measured DOM audit per screenshot (written by the montage test)
 */
import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setup, gotoGame } from './helpers';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const QA = join(ROOT, 'qa/m3');
const QA_TMP = join(ROOT, 'qa/tmp/m3-b1');

/** docs/UI_DESIGN.md §5 Prüfgrößen (DPR 1) */
const SIZES: [number, number][] = [[907, 510], [1216, 684], [1077, 606], [821, 462], [1366, 768], [1920, 1080], [1536, 864], [1280, 720], [800, 450], [1080, 607]];
const KEEP = new Set(['800x450', '907x510', '1920x1080']);
const LANGS = ['en', 'de'] as const;
/** mid-game state for panels/menus: casual bot, 300 s warped */
const MID = 'bot=casual&warp=300';

interface Screen { name: string; query: string; prep?: (page: Page) => Promise<void>; check?: string }
const SCREENS: Screen[] = [
  { name: 'gameplay-start', query: '' },
  { name: 'gameplay', query: MID },
  { name: 'buildbar-rooms', query: MID, prep: p => p.evaluate(() => (window as any).__ctx.menu.set('rooms')), check: '.bb-menu--rooms' },
  { name: 'staff-menu', query: MID, prep: p => p.evaluate(() => (window as any).__ctx.menu.set('staff')), check: '.bb-menu--staff' },
  {
    name: 'room-panel', query: MID, check: '.pn',
    prep: p => p.evaluate(() => {
      const ctx = (window as any).__ctx;
      const rooms = ctx.w.rooms as { id: number; type: string }[];
      const r = rooms.find(x => x.type === 'workshop') ?? rooms.find(x => x.type === 'bunk');
      if (!r) throw new Error('no room to select');
      ctx.selection.set({ kind: 'room', id: r.id });
    }),
  },
  {
    name: 'rascal-panel', query: MID, check: '.pn',
    prep: p => p.evaluate(() => {
      const ctx = (window as any).__ctx;
      const a = (ctx.w.agents as { id: number; kind: string; flags: number }[]).find(x => x.kind === 'rascal' && !(x.flags & (4 | 64)));
      if (!a) throw new Error('no rascal to select');
      ctx.selection.set({ kind: 'agent', id: a.id });
    }),
  },
  { name: 'settings', query: MID, prep: p => p.evaluate(() => (window as any).__ctx.openModal('settings')), check: '.ov-modal' },
  { name: 'help', query: MID, prep: p => p.evaluate(() => (window as any).__ctx.openModal('help')), check: '.ov-modal' },
];
/** Brief §12.3 B1 screens whose systems do not exist yet – reported as pending, never faked */
const PENDING = [
  ['project board (Projekttafel)', 'M5: projects system'],
  ['return panel (Rückkehr-Panel)', 'M6: return / offline progress'],
  ['inspection result (Inspektionsergebnis)', 'M5: inspections'],
  ['transfer (Versetzung)', 'M6: transfer to the next site'],
] as const;

const shotPath = (lang: string, screen: string, w: number, h: number) =>
  join(KEEP.has(`${w}x${h}`) ? join(QA, 'b1', lang) : join(QA_TMP, lang), `${screen}-${w}x${h}.png`);
const auditPath = (lang: string, screen: string) => join(QA_TMP, 'audit', `${lang}-${screen}.json`);

interface Audit {
  blocks: { root: string; box: [number, number, number, number] }[];
  overlap: string[]; clipped: string[]; offscreen: string[]; small: string[]; running: string[];
  hudArea: number; textNodes: number;
}

/**
 * DOM audit of the HUD, evaluated in the page. Definitions:
 *  - Visible element: `checkVisibility({opacityProperty, visibilityProperty})` is true and its box, clipped by every
 *    ancestor inside `.hud` with overflow ≠ visible, has a non-zero area (.hud/#app/body are not used as clips, so a
 *    box leaving the viewport stays measurable).
 *  - HUD block (overlap check a): every direct child of `.hud` that does not carry `data-overlay`. Elements with
 *    `data-overlay` (and their descendants) are excluded everywhere in the overlap check. A block's footprint is the
 *    bounding box of everything it actually paints – elements with a background colour/image, a visible border or
 *    box-shadow, replaced elements (img/svg/canvas/input) and own text – clipped by ancestor overflow. Transparent
 *    layout wrappers (e.g. the full-screen tools layer `.tl` or the clipboard wrapper `.cb`) therefore count only with
 *    what they draw. Two footprints overlapping by more than 0.5 px in both axes is a failure.
 *  - Clipped text (b): a visible element with text in its subtree whose computed overflow on an axis is hidden/clip and
 *    whose scroll size exceeds its client size by more than 1 px on that axis (this includes text-overflow: ellipsis
 *    and line-clamp). overflow:auto/scroll are intentional scroll containers and are not flagged.
 *  - Off-screen (b): any visible element under `.hud` (overlays included) whose clipped box leaves the viewport by
 *    more than 1 px.
 *  - Small text (c): any visible, non-whitespace text node whose parent's computed font-size is below 12 px.
 *  - Running text (d): text nodes are grouped by their nearest non-inline ancestor (the text block). A text block whose
 *    words (whitespace-separated tokens containing a letter or digit) number ≥ 6 is running text; every text node in it
 *    must be ≥ 14 px.
 *  - hudArea: area of the union of all painted boxes of the HUD blocks (opaque HUD), used for B7.
 */
function auditHud(): Audit {
  const vw = innerWidth, vh = innerHeight;
  const hud = document.querySelector('.hud') as HTMLElement;
  type R = [number, number, number, number];
  const desc = (el: Element) => {
    const c = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    const txt = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.tagName.toLowerCase()}${c}${txt ? ` "${txt}"` : ''}`;
  };
  const clipOf = (el: Element): R => {
    let r: R = [-1e9, -1e9, 1e9, 1e9];
    // only clipping ancestors INSIDE .hud count – .hud/#app/body clip to the viewport, which is what (b) detects
    for (let p = el.parentElement; p && p !== hud && hud.contains(p); p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const b = p.getBoundingClientRect();
      if (cs.overflowX !== 'visible') r = [Math.max(r[0], b.left), r[1], Math.min(r[2], b.right), r[3]];
      if (cs.overflowY !== 'visible') r = [r[0], Math.max(r[1], b.top), r[2], Math.min(r[3], b.bottom)];
    }
    return r;
  };
  const isect = (a: R, b: R): R => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  const area = (r: R) => Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]);
  const boxOf = (el: Element): R | null => {
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return null;
    const b = el.getBoundingClientRect();
    const r = isect([b.left, b.top, b.right, b.bottom], clipOf(el));
    return area(r) > 0 ? r : null;
  };
  const r1 = (r: R) => r.map(v => Math.round(v * 10) / 10) as R;
  const paints = (el: Element) => {
    if (/^(IMG|SVG|CANVAS|INPUT|SELECT|TEXTAREA|VIDEO)$/i.test(el.tagName)) return true;
    const cs = getComputedStyle(el);
    if (!/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(cs.backgroundColor)) return true;
    if (cs.backgroundImage !== 'none' || cs.boxShadow !== 'none') return true;
    for (const s of ['Top', 'Right', 'Bottom', 'Left'] as const) {
      if (parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none' && !/rgba\(\d+, \d+, \d+, 0\)/.test(cs[`border${s}Color`])) return true;
    }
    return [...el.childNodes].some(n => n.nodeType === 3 && n.textContent!.trim());
  };

  const out: Audit = { blocks: [], overlap: [], clipped: [], offscreen: [], small: [], running: [], hudArea: 0, textNodes: 0 };
  // (a) HUD blocks and their painted footprint
  const painted: R[] = [];
  for (const root of [...hud.children]) {
    if (root.hasAttribute('data-overlay')) continue;
    let fp: R | null = null;
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (el.closest('[data-overlay]')) continue;
      if (!paints(el)) continue;
      const b = boxOf(el);
      if (!b) continue;
      painted.push(b);
      fp = fp ? [Math.min(fp[0], b[0]), Math.min(fp[1], b[1]), Math.max(fp[2], b[2]), Math.max(fp[3], b[3])] : b;
    }
    if (fp) out.blocks.push({ root: desc(root).split(' "')[0], box: r1(fp) });
  }
  for (let i = 0; i < out.blocks.length; i++) for (let j = i + 1; j < out.blocks.length; j++) {
    const o = isect(out.blocks[i].box, out.blocks[j].box);
    if (o[2] - o[0] > 0.5 && o[3] - o[1] > 0.5) out.overlap.push(`${out.blocks[i].root} ${JSON.stringify(out.blocks[i].box)} ∩ ${out.blocks[j].root} ${JSON.stringify(out.blocks[j].box)}`);
  }
  // union area of the painted boxes (coordinate compression), clipped to the viewport
  {
    const rs = painted.map(r => isect(r, [0, 0, vw, vh])).filter(r => area(r) > 0);
    const xs = [...new Set(rs.flatMap(r => [r[0], r[2]]))].sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i++) {
      const x0 = xs[i], x1 = xs[i + 1];
      const iv = rs.filter(r => r[0] <= x0 && r[2] >= x1).map(r => [r[1], r[3]]).sort((a, b) => a[0] - b[0]);
      let len = 0, s = 0, e = 0, open = false;
      for (const [a, b] of iv) {
        if (!open || a > e) { if (open) len += e - s; s = a; e = b; open = true; } else e = Math.max(e, b);
      }
      if (open) len += e - s;
      out.hudArea += len * (x1 - x0);
    }
  }
  // (b) clipped text + off-screen, for every element under .hud (overlays included)
  for (const el of hud.querySelectorAll('*')) {
    const b = boxOf(el);
    if (!b) continue;
    if (b[0] < -1 || b[1] < -1 || b[2] > vw + 1 || b[3] > vh + 1) out.offscreen.push(`${desc(el)} ${JSON.stringify(r1(b))} viewport ${vw}x${vh}`);
    if (!(el.textContent ?? '').trim()) continue;
    const cs = getComputedStyle(el);
    const he = el as HTMLElement;
    if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && he.scrollWidth > he.clientWidth + 1) out.clipped.push(`${desc(el)} x: scrollWidth ${he.scrollWidth} > clientWidth ${he.clientWidth}`);
    if ((cs.overflowY === 'hidden' || cs.overflowY === 'clip') && he.scrollHeight > he.clientHeight + 1) out.clipped.push(`${desc(el)} y: scrollHeight ${he.scrollHeight} > clientHeight ${he.clientHeight}`);
  }
  // (c) + (d) text sizes
  const blocks = new Map<Element, { words: number; nodes: { el: Element; px: number; txt: string }[] }>();
  const tw = document.createTreeWalker(hud, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const txt = n.textContent!.trim();
    if (!txt) continue;
    const el = n.parentElement!;
    if (!boxOf(el)) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    const rr = range.getBoundingClientRect();
    if (rr.width * rr.height <= 0) continue;
    out.textNodes++;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px < 12) out.small.push(`${desc(el)} font-size ${px}px text "${txt.slice(0, 40)}"`);
    let blk: Element = el;
    while (blk !== hud && /^inline|^contents$/.test(getComputedStyle(blk).display) && blk.parentElement) blk = blk.parentElement;
    const e = blocks.get(blk) ?? { words: 0, nodes: [] };
    e.words += txt.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
    e.nodes.push({ el, px, txt });
    blocks.set(blk, e);
  }
  for (const [blk, e] of blocks) if (e.words >= 6) for (const nd of e.nodes) if (nd.px < 14) out.running.push(`${desc(blk)} (${e.words} words) node ${desc(nd.el)} font-size ${nd.px}px`);
  return out;
}

/** annotation that is also printed (the list reporter shows stdout) */
function note(type: string, description: string) {
  test.info().annotations.push({ type, description });
  console.log(`[${type}] ${test.info().title}: ${description}`);
}

async function step(page: Page, n: number) {
  await page.evaluate(k => (window as unknown as { __step(n: number): void }).__step(k), n);
}

async function waitFor(page: Page, sel: string) {
  await page.waitForFunction(s => [...document.querySelectorAll(s)].some(e => e.checkVisibility() && e.getBoundingClientRect().width > 0), sel, { timeout: 10_000 });
}

/**
 * CSS transitions/animations run on wall-clock time, not on __step: under SwiftShader an open/fade-in can still be
 * half-way when a fixed wait ends (seen as half-transparent menus in the montage). Wait until every finite CSS
 * animation has finished (infinite ones such as the bottleneck pulse are ignored).
 */
async function settleCss(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every(a => {
    if (a.playState !== 'running') return true;
    return a.effect?.getComputedTiming().iterations === Infinity;
  }), null, { timeout: 15_000, polling: 100 });
}

test.describe('B1 screenshot matrix', () => {
  test('B1 pending screens (systems from M5/M6 not implemented yet)', async () => {
    for (const [screen, why] of PENDING) test.info().annotations.push({ type: 'pending', description: `${screen} – ${why}` });
    test.skip(true, `pending, not counted as passed: ${PENDING.map(p => p[0]).join(', ')}`);
  });

  test('B1 audit self-check: the DOM audit detects planted defects', async ({ page }) => {
    await setup(page);
    await page.setViewportSize({ width: 800, height: 450 });
    await gotoGame(page, 'lang=en&capture=1', 0);
    await step(page, 45);
    const clean = await page.evaluate(auditHud);
    await page.evaluate(() => {
      const hud = document.querySelector('.hud')!;
      const add = (css: string, text: string, attrs: Record<string, string> = {}) => {
        const d = document.createElement('div'); d.className = 'selfcheck'; d.style.cssText = 'position:absolute;background:#fff;' + css; d.textContent = text;
        for (const [k, v] of Object.entries(attrs)) d.setAttribute(k, v);
        hud.appendChild(d);
      };
      add('left:300px;top:150px;font-size:10px', 'tiny');                                                   // (c)
      add('left:300px;top:180px;font-size:13px;width:400px', 'this is running text with seven words');     // (d)
      add('left:300px;top:220px;font-size:14px;width:40px;overflow:hidden;white-space:nowrap', 'clipped label text'); // (b)
      add('left:780px;top:260px;font-size:14px;width:60px', 'edge');                                       // (b) off-screen
      add('left:10px;top:10px;font-size:14px;width:60px;height:20px', 'over');                             // (a) over the top bar
      add('left:100px;top:10px;font-size:14px;width:60px;height:20px', 'floating', { 'data-overlay': '' }); // ignored by (a)
    });
    const bad = await page.evaluate(auditHud);
    await page.evaluate(() => document.querySelectorAll('.selfcheck').forEach(e => e.remove()));
    expect(bad.small.join('|')).toContain('tiny');
    expect(bad.running.join('|')).toContain('seven words');
    expect(bad.clipped.join('|')).toContain('clipped label');
    expect(bad.offscreen.join('|')).toContain('edge');
    expect(bad.overlap.join('|')).toContain('div.selfcheck [10,10,70,30]');  // block roots are named without text
    expect(bad.overlap.join('|')).not.toContain('[100,10,');                // the data-overlay one (also over the top bar) is ignored
    expect(bad.hudArea).toBeGreaterThan(clean.hudArea);
  });

  for (const lang of LANGS) for (const sc of SCREENS) {
    test(`B1 ${lang} ${sc.name}`, async ({ page }) => {
      test.setTimeout(240_000);
      const guard = await setup(page);
      const results: Record<string, Audit> = {};
      for (const [w, h] of SIZES) {
        await page.setViewportSize({ width: w, height: h });
        // ?capture=1: the ticker is stopped and frames are stepped explicitly (window.__step) – deterministic, and
        // SwiftShader does not burn the CPU between measurements. 45 frames = 1.5 s game time, enough for the
        // throttled DOM writes (≤ 10/s) and the 0.5 s camera-inset refresh.
        await gotoGame(page, `lang=${lang}&capture=1${sc.query ? '&' + sc.query : ''}`, 0);
        await step(page, 45);
        if (sc.prep) { await sc.prep(page); await step(page, 30); }
        if (sc.check) await waitFor(page, sc.check);
        await settleCss(page);
        const file = shotPath(lang, sc.name, w, h);
        mkdirSync(join(file, '..'), { recursive: true });
        await page.screenshot({ path: file });
        const a = await page.evaluate(auditHud);
        results[`${w}x${h}`] = a;
        const at = `${lang} ${sc.name} ${w}x${h}`;
        expect.soft(a.textNodes, `${at}: HUD renders text`).toBeGreaterThan(0);
        expect.soft(a.overlap, `${at}: (a) HUD blocks overlap`).toEqual([]);
        expect.soft(a.clipped, `${at}: (b) clipped text`).toEqual([]);
        expect.soft(a.offscreen, `${at}: (b) element outside the viewport`).toEqual([]);
        expect.soft(a.small, `${at}: (c) text < 12 px`).toEqual([]);
        expect.soft(a.running, `${at}: (d) running text < 14 px`).toEqual([]);
      }
      mkdirSync(join(QA_TMP, 'audit'), { recursive: true });
      writeFileSync(auditPath(lang, sc.name), JSON.stringify(results, null, 1));
      expect(guard.foreign).toEqual([]);
    });
  }

  test('B1 montage per language (ffmpeg tile)', async () => {
    test.setTimeout(240_000);
    const missing: string[] = [];
    for (const lang of LANGS) for (const sc of SCREENS) for (const [w, h] of SIZES) if (!existsSync(shotPath(lang, sc.name, w, h))) missing.push(`${lang}/${sc.name}-${w}x${h}`);
    test.skip(missing.length > 0, `matrix incomplete (run the whole spec): ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ' …' : ''}`);
    // tiles: 320×180 letterboxed (all sizes are ~16:9), 10 columns = sizes, one row per screen
    const TW = 320, TH = 180;
    for (const lang of LANGS) {
      const dir = mkdtempSync(join(tmpdir(), `m3-montage-${lang}-`));
      try {
        let i = 0;
        for (const sc of SCREENS) for (const [w, h] of SIZES) {
          execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', shotPath(lang, sc.name, w, h), '-vf',
            `scale=${TW}:${TH}:force_original_aspect_ratio=decrease:flags=area,pad=${TW}:${TH}:(ow-iw)/2:(oh-ih)/2:color=0x1d2b3a`,
            join(dir, `${String(i++).padStart(3, '0')}.png`)]);
        }
        const out = join(QA, `montage-${lang}.png`);
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '1', '-i', join(dir, '%03d.png'), '-vf', `tile=${SIZES.length}x${SCREENS.length}:padding=4:color=0x1d2b3a`, '-frames:v', '1', out]);
        const mb = statSync(out).size / 1e6;
        note('montage', `${out}: ${mb.toFixed(2)} MB, rows = ${SCREENS.map(s => s.name).join(', ')}; columns = ${SIZES.map(s => s.join('x')).join(', ')}`);
        expect(mb).toBeLessThan(8);
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    // collected audit, for the QA report
    const all: Record<string, unknown> = {};
    for (const lang of LANGS) for (const sc of SCREENS) if (existsSync(auditPath(lang, sc.name))) all[`${lang}/${sc.name}`] = JSON.parse(readFileSync(auditPath(lang, sc.name), 'utf8'));
    writeFileSync(join(QA, 'b1-audit.json'), JSON.stringify(all, null, 1));
  });
});

test.describe('B2 canvas backing store', () => {
  for (const dpr of [1, 1.5, 2, 3]) {
    test(`B2 backing store = CSS size × min(DPR,2) at DPR ${dpr}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: dpr });
      const page = await ctx.newPage();
      try {
        await setup(page);
        await gotoGame(page, 'lang=en', 300);
        const m = await page.evaluate(() => {
          const c = document.querySelector('canvas#world') as HTMLCanvasElement;
          const r = c.getBoundingClientRect();
          return { dpr: devicePixelRatio, cssW: r.width, cssH: r.height, w: c.width, h: c.height };
        });
        const k = Math.min(dpr, 2);
        note('measured', JSON.stringify(m));
        expect(m.dpr).toBe(dpr);
        expect(Math.abs(m.w - m.cssW * k), `canvas.width ${m.w} vs ${m.cssW}×${k}`).toBeLessThanOrEqual(1);
        expect(Math.abs(m.h - m.cssH * k), `canvas.height ${m.h} vs ${m.cssH}×${k}`).toBeLessThanOrEqual(1);
        // also after a resize
        await page.setViewportSize({ width: 907, height: 510 });
        await page.waitForTimeout(400);
        const m2 = await page.evaluate(() => {
          const c = document.querySelector('canvas#world') as HTMLCanvasElement;
          const r = c.getBoundingClientRect();
          return { cssW: r.width, cssH: r.height, w: c.width, h: c.height };
        });
        expect(Math.abs(m2.w - m2.cssW * k), `after resize: canvas.width ${m2.w} vs ${m2.cssW}×${k}`).toBeLessThanOrEqual(1);
        expect(Math.abs(m2.h - m2.cssH * k), `after resize: canvas.height ${m2.h} vs ${m2.cssH}×${k}`).toBeLessThanOrEqual(1);
      } finally { await ctx.close(); }
    });
  }
});

test.describe('B7 at 800×450', () => {
  test.use({ viewport: { width: 800, height: 450 }, deviceScaleFactor: 1 });

  test('B7.1 play area ≥ 70 %', async ({ page }) => {
    await setup(page);
    await gotoGame(page, 'lang=de', 1000); // DE = longest texts
    const m = await page.evaluate(auditHud);
    const vw = 800, vh = 450;
    const insets = await page.evaluate(() => (window as any).__game.cam.inset as { top: number; bottom: number });
    // strict definition: the full-width strips above the bottom edge of data-hud="top" and below the top edge of
    // data-hud="bottom" (= the camera insets, minus the app's 2 px safety margin each) are not play area
    const strips = await page.evaluate(() => {
      const top = Math.max(0, ...[...document.querySelectorAll('[data-hud="top"]')].map(e => e.getBoundingClientRect().bottom));
      const bs = [...document.querySelectorAll('[data-hud="bottom"]')].map(e => e.getBoundingClientRect().top);
      return { top, bottom: bs.length ? innerHeight - Math.min(...bs) : 0 };
    });
    const stripShare = 1 - (strips.top + strips.bottom) / vh;
    // opaque definition: the union of everything the non-overlay HUD blocks paint (see auditHud)
    const opaqueShare = 1 - m.hudArea / (vw * vh);
    note('measured', `strips top ${strips.top.toFixed(1)} px + bottom ${strips.bottom.toFixed(1)} px → play area ${(stripShare * 100).toFixed(1)} %; opaque HUD union ${m.hudArea.toFixed(0)} px² → play area ${(opaqueShare * 100).toFixed(1)} %; cam.inset ${JSON.stringify(insets)}`);
    expect(stripShare).toBeGreaterThanOrEqual(0.7);
    expect(opaqueShare).toBeGreaterThanOrEqual(0.7);
    // HUD budget from docs/UI_DESIGN.md §2
    expect(strips.top, 'top bar incl. flow strip ≤ 40 px').toBeLessThanOrEqual(40);
    const bb = await page.evaluate(() => Math.max(...[...document.querySelectorAll('[data-hud="bottom"]')].map(e => e.getBoundingClientRect().height)));
    expect(bb, 'build bar ≤ 64 px').toBeLessThanOrEqual(64);
    // the clipboard collapses to a chip ≤ 200×40 (and stays visible: D4)
    const chip = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('.cb-chip');
      if (!el || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return null;
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    note('measured', `clipboard chip ${chip ? `${chip.w.toFixed(1)}×${chip.h.toFixed(1)} px` : 'not visible'}`);
    expect(chip, 'clipboard is a visible chip at 800×450').not.toBeNull();
    expect(chip!.w, 'clipboard chip ≤ 200 px wide').toBeLessThanOrEqual(200);
    expect(chip!.h, 'clipboard chip ≤ 40 px tall').toBeLessThanOrEqual(40);
  });

  for (const lang of LANGS) {
    test(`B7.2 starting prison incl. dock fully visible at the initial camera (${lang})`, async ({ page }) => {
      await setup(page);
      await gotoGame(page, `lang=${lang}`, 1000);
      const m = await page.evaluate(auditHud);
      const r = await page.evaluate(() => {
        const g = window as any;
        const w = g.__sim, cam = g.__game.cam;
        const T = 32;
        // start layout = every room present at game start (canteen, bunk block, warden's office, gate, dock/jetty)
        const rooms = (w.rooms as { type: string; x: number; y: number; w: number; h: number }[]).map(r => ({ ...r }));
        const x0 = Math.min(...rooms.map(r => r.x)), y0 = Math.min(...rooms.map(r => r.y));
        const x1 = Math.max(...rooms.map(r => r.x + r.w)), y1 = Math.max(...rooms.map(r => r.y + r.h));
        const a = cam.worldToScreen(x0 * T, y0 * T), b = cam.worldToScreen(x1 * T, y1 * T);
        const dock = rooms.find(r => r.type === 'dock')!;
        const da = cam.worldToScreen(dock.x * T, dock.y * T), db = cam.worldToScreen((dock.x + dock.w) * T, (dock.y + dock.h) * T);
        return { types: rooms.map(r => r.type), tiles: [x0, y0, x1, y1], screen: [a.x, a.y, b.x, b.y], dock: [da.x, da.y, db.x, db.y], zoom: cam.zoom, hasDock: !!dock };
      });
      note('measured', `start rooms ${r.types.join(',')} tiles ${JSON.stringify(r.tiles)} → screen ${JSON.stringify(r.screen.map(v => Math.round(v)))}, dock ${JSON.stringify(r.dock.map(v => Math.round(v)))}, zoom ${r.zoom.toFixed(3)}`);
      expect(r.hasDock).toBe(true);
      expect(r.types).toEqual(expect.arrayContaining(['canteen', 'bunk', 'office', 'gate', 'dock']));
      const [sx0, sy0, sx1, sy1] = r.screen;
      expect(sx0, 'left edge on screen').toBeGreaterThanOrEqual(0);
      expect(sy0, 'top edge on screen').toBeGreaterThanOrEqual(0);
      expect(sx1, 'right edge on screen').toBeLessThanOrEqual(800);
      expect(sy1, 'bottom edge on screen').toBeLessThanOrEqual(450);
      // unobscured: no painted HUD block footprint intersects the start-prison rect
      const hits = m.blocks.filter(b => Math.min(b.box[2], sx1) - Math.max(b.box[0], sx0) > 0.5 && Math.min(b.box[3], sy1) - Math.max(b.box[1], sy0) > 0.5);
      expect(hits, 'HUD blocks covering the starting prison').toEqual([]);
    });
  }

  test('B7.3 a rascal is ≥ 22 px tall at the initial zoom', async ({ page }) => {
    await setup(page);
    // rascals only exist after the first ferry → mid-game state; the camera is the same initial fit (frameStart)
    await gotoGame(page, MID, 1000);
    const r = await page.evaluate(() => {
      const g = window as any;
      const { app, cam } = g.__game;
      const w = g.__sim;
      const T = 32;
      // agent views: Container(eventMode none) → one inner Container with ≥ 12 Sprite parts (src/render/agentsView.ts)
      const views: any[] = [];
      const walk = (c: any) => {
        for (const ch of c.children ?? []) {
          if (ch.children?.length === 1 && (ch.children[0].children?.length ?? 0) >= 12 && ch.eventMode === 'none') views.push(ch);
          else walk(ch);
        }
      };
      walk(app.stage);
      const out: { id: number; state: string; h: number; localH: number }[] = [];
      for (const a of w.agents as any[]) {
        if (a.kind !== 'rascal' || a.flags & (4 | 64)) continue;
        let best: any = null, bd = 3;
        for (const v of views) { const d = Math.hypot(v.position.x - a.x * T, v.position.y - a.y * T); if (d < bd) { bd = d; best = v; } }
        if (!best || !best.visible) continue;
        const b = best.getBounds();
        out.push({ id: a.id, state: a.state, h: b.height, localH: best.getLocalBounds().height * cam.zoom });
      }
      return { zoom: cam.zoom, views: views.length, rascals: out };
    });
    const hs = r.rascals.map(x => x.h).sort((a, b) => a - b);
    note('measured', `zoom ${r.zoom.toFixed(3)}, ${r.views} agent views, rascal heights px ${hs.map(h => h.toFixed(1)).join(', ')}`);
    expect(r.rascals.length).toBeGreaterThan(0);
    // every visible rascal (standing, walking or using a slot) must be ≥ 22 px tall
    expect(hs[0], `smallest rascal ${JSON.stringify(r.rascals.find(x => x.h === hs[0]))}`).toBeGreaterThanOrEqual(22);
  });

  test('B7.4 world labels ≥ 14 px (Pixi text objects)', async ({ page }) => {
    await setup(page);
    await gotoGame(page, MID, 1000);
    const r = await page.evaluate(() => {
      const { app, cam } = (window as any).__game;
      const labels: { text: string; px: number }[] = [];
      const walk = (c: any) => {
        for (const ch of c.children ?? []) {
          // Pixi v8 text classes (Text, BitmapText, HTMLText) are identified by their render pipe – names are minified
          if (['text', 'bitmapText', 'htmlText'].includes(ch.renderPipeId)) {
            const fs = Number(ch.style?.fontSize ?? 0);
            const s = ch.worldTransform ? Math.hypot(ch.worldTransform.a, ch.worldTransform.b) : cam.zoom;
            if (ch.visible) labels.push({ text: String(ch.text).slice(0, 30), px: fs * s });
          }
          walk(ch);
        }
      };
      walk(app.stage);
      return labels;
    });
    if (r.length === 0) {
      // M3 has no Pixi world labels (src/render uses only Sprite/Graphics) – nothing is invented here
      note('note', 'no Pixi Text/BitmapText/HTMLText world labels exist in M3; world-anchored DOM labels (.tl layer, tools.ts) are covered by the B1 font checks');
      expect(r.length).toBe(0);
    }
    for (const l of r) expect(l.px, `world label "${l.text}"`).toBeGreaterThanOrEqual(14);
  });
});
