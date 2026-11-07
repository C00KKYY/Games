/**
 * M5 art contact sheet: every new M5 sprite and HUD icon on one page, rendered at the given viewport.
 *   npx tsx tools/art/m5-sheet.ts            → qa/m5/art/m5-sprites-1280x720.png + m5-sprites-907x510.png
 * Sprites sit on grass and on cream (to judge both backgrounds); scale adapts so everything fits one screen.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { svgDoc, resetIds } from './kit';
import { m5Sprites, m5Icons } from './m5';
import { P } from '../../art/palette';

const ROOT = new URL('../..', import.meta.url).pathname;
const OUT = ROOT + 'qa/m5/art/';

async function main() {
  resetIds();
  const sprites = m5Sprites(), icons = m5Icons();
  mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  for (const [W, H] of [[1280, 720], [907, 510]] as const) {
    const scale = W >= 1200 ? 1.35 : 0.95;
    const cell = (s: { name: string }, svg: string, bg: string) =>
      `<figure><div class="img" style="background:${bg}">${svg}</div><figcaption>${s.name}</figcaption></figure>`;
    const big = sprites.filter(s => s.w * s.h > 3000), small = sprites.filter(s => s.w * s.h <= 3000);
    const html = `<html><body style="margin:0;width:${W}px;height:${H}px;overflow:hidden;background:${P.cream500};font:${W >= 1200 ? 11 : 9}px monospace;color:${P.ink900}">
      <style>figure{display:inline-flex;flex-direction:column;align-items:center;margin:2px 3px;vertical-align:bottom}.img{padding:2px;border:1px solid ${P.cream700};border-radius:3px;line-height:0}figcaption{margin-top:1px}</style>
      <div style="padding:4px">${small.map(s => cell(s, svgDoc(s, scale * 1.6), s.name.startsWith('held') || s.name.startsWith('head') || s.name.startsWith('acc') || s.name.startsWith('blink') || s.name.startsWith('tail') || s.name === 'footGoose' ? P.sage500 : P.sage300)).join('')}
      ${icons.map(s => cell(s, svgDoc(s, W >= 1200 ? 1.6 : 1.2), P.cream300)).join('')}</div>
      <div style="padding:0 4px">${big.map(s => cell(s, svgDoc(s, scale * (s.h > 100 ? 0.75 : 1)), s.name === 'beam' ? P.ink700 : P.sage300)).join('')}</div>
      </body></html>`;
    const p = await b.newPage({ viewport: { width: W, height: H } });
    await p.setContent(html);
    await p.screenshot({ path: `${OUT}m5-sprites-${W}x${H}.png` });
    await p.close();
    console.log(`${OUT}m5-sprites-${W}x${H}.png`);
  }
  await b.close();
}
main().catch(e => { console.error(e); process.exit(1); });
