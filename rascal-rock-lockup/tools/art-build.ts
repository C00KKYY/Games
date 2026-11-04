/**
 * npm run art:build
 * 1. generates all SVG sources into art/svg/ (from tools/art/*.ts – style rules as code)
 * 2. rasterises them in Chromium at @1x and @2x, shelf-packs into ≤2048² pages,
 *    extrudes tile edges (no seams), writes public/atlas/atlas@{1,2}x[-n].webp (lossless) + .json
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { svgDoc, resetIds, type Sprite } from './art/kit';
import { worldSprites } from './art/world';
import { charSprites } from './art/chars';
import { uiIcons, wardenPortrait } from './art/ui';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = ROOT + 'public/atlas/';
const SVG = ROOT + 'art/svg/';
const PAGE = 2048, GUTTER = 2;

export function allSprites(): Sprite[] {
  resetIds();
  const list = [...worldSprites(), ...charSprites()];
  const seen = new Set<string>();
  for (const s of list) { if (seen.has(s.name)) throw new Error('duplicate sprite ' + s.name); seen.add(s.name); }
  return list;
}

interface Placed { s: Sprite; x: number; y: number; w: number; h: number; page: number }

function pack(sprites: Sprite[], scale: number): Placed[] {
  const items = sprites.map(s => {
    const pad = s.pad ?? 2;
    return { s, w: Math.ceil((s.w + pad * 2) * scale), h: Math.ceil((s.h + pad * 2) * scale) };
  }).sort((a, b) => b.h - a.h);
  const out: Placed[] = [];
  let page = 0, x = GUTTER, y = GUTTER, rowH = 0;
  for (const it of items) {
    if (x + it.w + GUTTER > PAGE) { x = GUTTER; y += rowH + GUTTER; rowH = 0; }
    if (y + it.h + GUTTER > PAGE) { page++; x = GUTTER; y = GUTTER; rowH = 0; }
    out.push({ s: it.s, x, y, w: it.w, h: it.h, page });
    x += it.w + GUTTER; rowH = Math.max(rowH, it.h);
  }
  return out;
}

async function main() {
  const sprites = allSprites();
  rmSync(SVG, { recursive: true, force: true }); mkdirSync(SVG, { recursive: true });
  for (const s of sprites) writeFileSync(SVG + s.name + '.svg', svgDoc(s, 1));
  mkdirSync(OUT, { recursive: true });
  // UI icons as standalone SVG files (DOM UI)
  const UI = ROOT + 'public/ui/';
  rmSync(UI, { recursive: true, force: true }); mkdirSync(UI, { recursive: true });
  const heads = new Map(sprites.map(s => [s.name, s]));
  for (const s of [...uiIcons(), wardenPortrait(heads)]) writeFileSync(UI + s.name + '.svg', svgDoc(s, 1));

  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const scale of [1, 2]) {
    const placed = pack(sprites, scale);
    const pages = Math.max(...placed.map(p => p.page)) + 1;
    if (pages > 3) throw new Error(`atlas @${scale}x needs ${pages} pages (> 3)`);
    for (let pg = 0; pg < pages; pg++) {
      const mine = placed.filter(p => p.page === pg);
      const usedH = Math.max(...mine.map(p => p.y + p.h)) + GUTTER;
      const H = Math.min(PAGE, 1 << Math.ceil(Math.log2(usedH)));
      const payload = mine.map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h, tile: (p.s.pad ?? 2) === 0, svg: svgDoc(p.s, scale) }));
      const png: string = await page.evaluate(async ({ payload, W, H }) => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d')!;
        for (const it of payload) {
          const img = new Image();
          img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(it.svg)));
          await img.decode();
          g.drawImage(img, it.x, it.y, it.w, it.h);
          if (it.tile) { // extrude 1px into the gutter so bilinear sampling never bleeds
            g.drawImage(c, it.x, it.y, it.w, 1, it.x, it.y - 1, it.w, 1);
            g.drawImage(c, it.x, it.y + it.h - 1, it.w, 1, it.x, it.y + it.h, it.w, 1);
            g.drawImage(c, it.x, it.y - 1, 1, it.h + 2, it.x - 1, it.y - 1, 1, it.h + 2);
            g.drawImage(c, it.x + it.w - 1, it.y - 1, 1, it.h + 2, it.x + it.w, it.y - 1, 1, it.h + 2);
          }
        }
        return c.toDataURL('image/png');
      }, { payload, W: PAGE, H });
      const base = `atlas@${scale}x${pg ? '-' + pg : ''}`;
      const tmp = ROOT + `qa/tmp/${base}.png`;
      mkdirSync(ROOT + 'qa/tmp', { recursive: true });
      writeFileSync(tmp, Buffer.from(png.split(',')[1], 'base64'));
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-c:v', 'libwebp', '-lossless', '1', '-compression_level', '6', OUT + base + '.webp']);
      const frames: Record<string, unknown> = {};
      for (const p of mine) {
        const pad = p.s.pad ?? 2;
        frames[p.s.name] = {
          frame: { x: p.x, y: p.y, w: p.w, h: p.h }, rotated: false, trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: p.w, h: p.h }, sourceSize: { w: p.w, h: p.h },
          anchor: { x: (pad + p.s.ax) / (p.s.w + pad * 2), y: (pad + p.s.ay) / (p.s.h + pad * 2) },
        };
      }
      writeFileSync(OUT + base + '.json', JSON.stringify({ frames, meta: { image: base + '.webp', format: 'RGBA8888', size: { w: PAGE, h: H }, scale: String(scale) } }));
      console.log(`${base}: ${mine.length} sprites, ${PAGE}x${H}`);
    }
  }
  await browser.close();
  if (!existsSync(OUT + 'atlas@1x.json')) throw new Error('atlas missing');
}

if (process.argv[1]?.endsWith('art-build.ts')) main().catch(e => { console.error(e); process.exit(1); });
