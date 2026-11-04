/** npm run art:sheet → qa/contact-sheet.png (all sprites, 3x, labelled) + qa/contact-chars.png (assembled characters) */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { svgDoc } from './art/kit';
import { allSprites } from './art-build';
import { P } from '../art/palette';

const ROOT = new URL('..', import.meta.url).pathname;

async function main() {
  const sprites = allSprites();
  const scale = Number(process.env.SCALE ?? 3);
  const cells = sprites.map(s => `<figure><div class="img">${svgDoc(s, scale)}</div><figcaption>${s.name}</figcaption></figure>`).join('');
  const html = `<html><body style="margin:0;background:${P.cream500};font:11px monospace;color:${P.ink900}">
  <style>figure{display:inline-flex;flex-direction:column;align-items:center;margin:6px;vertical-align:top}.img{background:repeating-conic-gradient(#e6dcc6 0 25%,#f2ead8 0 50%) 0 0/12px 12px;padding:4px;border:1px solid ${P.cream700}}</style>
  <div style="padding:8px;width:1900px">${cells}</div></body></html>`;
  mkdirSync(ROOT + 'qa', { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1000 } });
  await p.setContent(html);
  await p.screenshot({ path: ROOT + 'qa/contact-sheet.png', fullPage: true });
  await b.close();
  console.log('qa/contact-sheet.png');
}
main().catch(e => { console.error(e); process.exit(1); });
