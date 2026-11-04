/**
 * Cover key art (Brief §15.2): built from the game's own SVG parts, rendered in Chromium.
 * tsx tools/covers.ts [bg.png]  → qa/g1/cover_1920x1080.png (+ 800x1200, 800x800)
 * Background = crisp wide render of the island (no blur), characters drawn large as vectors.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { allSprites } from './art-build';
import { CHAR } from '../src/render/charLayout';
import { P } from '../art/palette';
import { T, shape, strokeP, rr, ell, type Sprite } from './art/kit';

const ROOT = new URL('..', import.meta.url).pathname;
const sp = new Map(allSprites().map(s => [s.name, s]));
const bgPath = process.argv[2] ?? ROOT + 'qa/tmp/cover_bg.png';
const fontB64 = readFileSync(ROOT + 'node_modules/@fontsource/fredoka/files/fredoka-latin-700-normal.woff2').toString('base64');

let fid = 0; const defs: string[] = [];
const tint = (hex: string) => {
  const n = parseInt(hex.slice(1), 16); const id = 'ct' + fid++;
  defs.push(`<filter id="${id}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${(n >> 16) / 255} 0 0 0 0 0 ${((n >> 8) & 255) / 255} 0 0 0 0 0 ${(n & 255) / 255} 0 0 0 0 0 1 0"/></filter>`);
  return ` filter="url(#${id})"`;
};
function put(name: string, x: number, y: number, t?: string, extra = ''): string {
  const s = sp.get(name) as Sprite; if (!s) throw new Error(name);
  return `<g transform="translate(${x} ${y})${extra}"${t ? tint(t) : ''}><g transform="translate(${-s.ax} ${-s.ay})">${s.body}</g></g>`;
}
/** full standing character, S view; arms customisable */
function character(species: string, overall: string, stripe: string | null, paw: string, opts: { acc?: string; accT?: string; armL?: number; armR?: number; tail?: string; propR?: string; propL?: string } = {}) {
  const g: string[] = [];
  if (opts.tail) g.push(put(`tail_${opts.tail}_E`, CHAR.tailS.x, CHAR.tailS.y, undefined, ' scale(-1 1)'));
  g.push(put('foot', -CHAR.footX, CHAR.footY), put('foot', CHAR.footX, CHAR.footY));
  g.push(put('leg', -CHAR.legX, CHAR.legY, overall), put('leg', CHAR.legX, CHAR.legY, overall));
  g.push(put('body_S', 0, CHAR.bodyY, overall));
  if (stripe) g.push(put('stripes_S', 0, CHAR.bodyY, stripe));
  const arm = (side: number, rot: number, prop?: string) => {
    const x = side * (CHAR.shoulderX + 0.6), y = CHAR.shoulderY;
    const r = rot * Math.PI / 180, end = 8.4;
    const px = x - Math.sin(r) * end, py = y + Math.cos(r) * end;
    return put('arm', x, y, overall, ` rotate(${rot})`) + (prop ?? '').replace(/PX/g, String(px)).replace(/PY/g, String(py)) + put('paw', px, py, paw);
  };
  g.push(arm(-1, opts.armL ?? 16, opts.propL), arm(1, opts.armR ?? -16, opts.propR));
  g.push(put(`head_${species}_S`, 0, CHAR.neckY));
  if (opts.acc) g.push(put(`acc_${opts.acc}_S`, 0, CHAR.neckY, opts.accT));
  return g.join('');
}
const clipboardProp = `<g transform="translate(PX PY) rotate(-12) translate(-7 -16)">${shape(rr(0, 0, 14, 18, 1.6), T.wood, { s: 1.4, h: 0.8, lw: 1.2 })}<rect x="2" y="2.5" width="10" height="13.5" fill="${P.cream300}"/>${shape(rr(3.5, -1.5, 7, 3.5, 1), T.stone, { s: 0.6, lw: 0.9 })}${strokeP('M3.5 6h7M3.5 9h7M3.5 12h4.5', P.ink700, 0.8)}<path d="M8.5 11.5l1.2 1.2 2.4-2.6" stroke="${P.coral500}" stroke-width="1" fill="none"/></g>`;
const stampProp = `<g transform="translate(PX PY) rotate(14) translate(-5 -14)">${shape(rr(3, 0, 4, 8, 1.6), T.woodDark, { s: 0.8, lw: 1 })}${shape(ell(5, 0.5, 3.2, 2.2), T.woodDark, { s: 0.6, lw: 1 })}${shape(rr(0, 7.5, 10, 4, 1.2), T.coral, { s: 0.8, lw: 1 })}</g>`;

function earlInTunnel() {
  // dirt mound + Earl's head and a paw holding a spoon
  let b = `<ellipse cx="0" cy="6" rx="34" ry="9" fill="${P.ink900}" opacity=".25"/>`;
  b += shape('M-34 6Q-30 -10 -12 -12Q0 -20 14 -12Q32 -10 34 6Z', T.wood, { s: 4, h: 1.6 });
  b += shape(ell(0, -4, 17, 6), { ...T.woodDark, base: P.wood900, sh: P.wood900 }, { s: 1, h: 0, lw: 1.6 });
  b += put('head_raccoon_S', 0, 0);
  b += `<g transform="translate(12 -12) rotate(-28)">${shape(rr(-1.4, -14, 2.8, 15, 1.2), T.stoneLight, { s: 0.8, h: 0.5, lw: 1.1 })}${shape(ell(0, -17, 4, 5.2), T.stoneLight, { s: 1.4, h: 0.8, lw: 1.2 })}</g>`;
  b += put('paw', 12, -11, P.ink700);
  for (const [x, y, r] of [[-26, -2, 2.2], [24, -4, 1.8], [-18, 3, 1.6], [30, 2, 2.4], [-30, 2, 1.4]]) b += `<circle cx="${x}" cy="${y}" r="${r}" fill="${P.wood700}" stroke="${P.wood900}" stroke-width=".8"/>`;
  return b;
}

function title(size: number) {
  const words = 'Rascal Rock Lockup';
  return `<text x="0" y="0" text-anchor="middle" font-family="CoverFredoka" font-weight="700" font-size="${size}" letter-spacing="${size * 0.01}"
    fill="url(#tg)" stroke="${P.teal900}" stroke-width="${size * 0.16}" stroke-linejoin="round" paint-order="stroke" filter="url(#tshadow)">${words}</text>`;
}

function svg(W: number, H: number, layout: 'wide' | 'tall' | 'square') {
  defs.length = 0; fid = 0;
  const badger = character('badger', P.ink700, null, P.stone700, { armL: 34, armR: -30, propL: clipboardProp, propR: stampProp });
  const L = {
    wide: { bx: W * 0.24, by: H * 0.97, bs: 15, ex: W * 0.78, ey: H * 0.9, es: 7.2, tx: W * 0.5, ty: H * 0.2, ts: 150 },
    tall: { bx: W * 0.36, by: H * 0.98, bs: 12.5, ex: W * 0.74, ey: H * 0.75, es: 5.6, tx: W * 0.5, ty: H * 0.14, ts: 92 },
    square: { bx: W * 0.3, by: H * 0.99, bs: 10.5, ex: W * 0.76, ey: H * 0.84, es: 5, tx: W * 0.5, ty: H * 0.16, ts: 84 },
  }[layout];
  const titleBlock = layout === 'wide'
    ? `<g transform="translate(${L.tx} ${L.ty})">${title(L.ts)}</g>`
    : `<g transform="translate(${L.tx} ${L.ty})">${title(L.ts).replace('>Rascal Rock Lockup<', '>Rascal Rock<')}</g><g transform="translate(${L.tx} ${L.ty + L.ts * 1.02})">${title(L.ts).replace('>Rascal Rock Lockup<', '>Lockup<')}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <style>@font-face{font-family:CoverFredoka;src:url(data:font/woff2;base64,${fontB64}) format('woff2');font-weight:700}</style>
    <linearGradient id="tg" x1="0" y1="-1" x2="0" y2="0.1"><stop offset="0" stop-color="${P.cream300}"/><stop offset=".55" stop-color="#f6d27a"/><stop offset="1" stop-color="${P.gold500}"/></linearGradient>
    <filter id="tshadow" x="-10%" y="-30%" width="120%" height="160%"><feDropShadow dx="0" dy="${L.ts * 0.06}" stdDeviation="0" flood-color="${P.teal900}" flood-opacity=".55"/></filter>
    <linearGradient id="vign" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.teal900}" stop-opacity=".55"/><stop offset=".38" stop-color="${P.teal900}" stop-opacity="0"/><stop offset=".75" stop-color="${P.ink900}" stop-opacity="0"/><stop offset="1" stop-color="${P.ink900}" stop-opacity=".45"/></linearGradient>
    <radialGradient id="spot" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="#fff2c4" stop-opacity=".18"/><stop offset="1" stop-color="#fff2c4" stop-opacity="0"/></radialGradient>
    ${defs.join('')}
  </defs>
  <image href="BG" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>
  <rect width="${W}" height="${H}" fill="url(#vign)"/><rect width="${W}" height="${H}" fill="url(#spot)"/>
  <g transform="translate(${L.ex} ${L.ey}) scale(${L.es})">${earlInTunnel()}</g>
  <ellipse cx="${L.bx + 20}" cy="${L.by - 10}" rx="${L.bs * 13}" ry="${L.bs * 3.5}" fill="${P.ink900}" opacity=".3"/>
  <g transform="translate(${L.bx} ${L.by}) scale(${L.bs})">${badger}</g>
  ${titleBlock}
</svg>`;
}

(async () => {
  const bg = 'data:image/png;base64,' + readFileSync(bgPath).toString('base64');
  const b = await chromium.launch();
  for (const [W, H, lay, name] of [[1920, 1080, 'wide', 'cover_1920x1080'], [800, 1200, 'tall', 'cover_800x1200'], [800, 800, 'square', 'cover_800x800']] as const) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    await p.setContent(`<body style="margin:0">${svg(W, H, lay).replace('href="BG"', `href="${bg}"`)}</body>`);
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${ROOT}qa/g1/${name}.png` });
    await p.close();
  }
  await b.close();
  console.log('covers written');
})();
