/** qa/char-preview.png – assembled characters (8x) for art review */
import { chromium } from 'playwright';
import { allSprites } from './art-build';
import { CHAR } from '../src/render/charLayout';
import { P } from '../art/palette';
import type { Sprite } from './art/kit';

const ROOT = new URL('..', import.meta.url).pathname;
const sp = new Map(allSprites().map(s => [s.name, s]));
const tintFilter = (id: string, hex: string) => {
  const n = parseInt(hex.slice(1), 16); const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  return `<filter id="${id}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${r} 0 0 0 0 0 ${g} 0 0 0 0 0 ${b} 0 0 0 0 0 1 0"/></filter>`;
};
let fid = 0; const defs: string[] = [];
function put(name: string, x: number, y: number, tint?: string, flip = false): string {
  const s = sp.get(name) as Sprite; if (!s) throw new Error(name);
  let f = '';
  if (tint) { const id = 'tf' + fid++; defs.push(tintFilter(id, tint)); f = ` filter="url(#${id})"`; }
  const inner = `<g transform="translate(${-s.ax} ${-s.ay})">${s.body}</g>`;
  return `<g transform="translate(${x} ${y})${flip ? ' scale(-1 1)' : ''}"${f}>${inner}</g>`;
}
const SEC = { low: [P.gold700, P.cream500], mid: [P.teal700, P.teal300], high: [P.brick700, P.coral500] } as const;
function char(species: string, dir: 'S' | 'N' | 'E' | 'W', overall: string, stripe: string | null, furPaw: string, acc?: string, tail?: string): string {
  const d = dir === 'W' ? 'E' : dir; const flip = dir === 'W';
  const g: string[] = [];
  g.push(put('foot', -CHAR.footX, CHAR.footY), put('foot', CHAR.footX, CHAR.footY));
  if (d === 'E') { g.push(put('leg', -1.5, CHAR.legY, overall), put('leg', 1.8, CHAR.legY, overall)); }
  else { g.push(put('leg', -CHAR.legX, CHAR.legY, overall), put('leg', CHAR.legX, CHAR.legY, overall)); }
  if (tail && d !== 'N') g.push(put(`tail_${tail}_E`, d === 'E' ? CHAR.tailE.x : CHAR.tailS.x, CHAR.tailE.y, undefined, d === 'S'));
  if (d === 'E') g.push(put('arm', -CHAR.shoulderXE - 1, CHAR.shoulderY, overall));
  g.push(put(`body_${d}`, 0, CHAR.bodyY, overall));
  if (stripe) g.push(put(`stripes_${d}`, 0, CHAR.bodyY, stripe));
  if (tail && d === 'N') g.push(put(`tail_${tail}_N`, CHAR.tailN.x, CHAR.tailN.y));
  if (d !== 'E') { for (const sx of [-1, 1]) { const x = sx * (CHAR.shoulderX + 0.6), r = sx * 0.16; g.push(`<g transform="translate(${x} ${CHAR.shoulderY}) rotate(${r * 57.3})"><g transform="translate(${-x} ${-CHAR.shoulderY})">${put('arm', x, CHAR.shoulderY, overall)}</g></g>`, put('paw', x - Math.sin(r) * 8.4, CHAR.shoulderY + Math.cos(r) * 8.4, furPaw)); } }
  else { g.push(put('arm', CHAR.shoulderXE + 1, CHAR.shoulderY, overall), put('paw', CHAR.shoulderXE + 1, CHAR.shoulderY + 9, furPaw)); }
  g.push(put(`head_${species}_${d}`, d === 'E' ? 1 : 0, CHAR.neckY));
  if (acc) { const an = `acc_${acc}_${d === 'N' && (acc === 'glasses' || acc === 'bandage') ? 'S' : d}`; if (!(d === 'N' && (acc === 'glasses' || acc === 'bandage'))) g.push(put(an, d === 'E' ? 1 : 0, acc === 'scarf' ? CHAR.neckY : CHAR.neckY, acc === 'beanie' ? P.sage500 : acc === 'scarf' ? P.teal500 : undefined)); }
  return `<g${flip ? ' transform="scale(-1 1)"' : ''}>${g.join('')}</g>`;
}
const rows: [string, string, string | null, string, string?, string?][] = [
  ['raccoon', SEC.low[0], SEC.low[1], P.ink700, undefined, 'raccoon'],
  ['raccoon', SEC.mid[0], SEC.mid[1], P.ink700, 'beanie', 'raccoon'],
  ['weasel', SEC.high[0], SEC.high[1], P.wood500, 'glasses', 'weasel'],
  ['weasel', SEC.low[0], SEC.low[1], P.wood500, 'scarf', 'weasel'],
  ['bear', P.cream300, null, P.wood700, 'chef'],
  ['bulldog', P.ink700, null, P.brick500, 'guardcap'],
  ['beaver', P.gold700, null, P.wood500],
  ['badger', P.ink500, null, P.stone700],
];
let body = '';
rows.forEach((r, i) => (['S', 'E', 'N', 'W'] as const).forEach((d, j) => {
  body += `<g transform="translate(${30 + j * 44} ${50 + i * 52})"><ellipse cx="1.5" cy="1" rx="9" ry="3" fill="${P.ink900}" opacity=".22"/>${char(r[0], d, r[1], r[2], r[3], r[4], r[5])}</g>`;
}));
const W = 200, H = 50 + rows.length * 52;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 6}" height="${H * 6}" viewBox="0 0 ${W} ${H}"><defs>${defs.join('')}</defs><rect width="${W}" height="${H}" fill="${P.sage500}"/>${body}</svg>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W * 6, height: H * 6 } });
  await p.setContent(`<body style="margin:0">${svg}</body>`); await p.screenshot({ path: ROOT + 'qa/char-preview.png' }); await b.close();
})();
