/**
 * Character layers (STYLE_GUIDE §5). Origin conventions:
 *  - legs/arms: anchor at the joint (top centre)
 *  - body: anchor at the bottom centre (hip line)
 *  - head: anchor at the neck (bottom centre)
 * Tintable layers are greyscale (T.grey); faces/fur are full colour.
 */
import { P } from '../../art/palette';
import { T, shape, flat, strokeP, rr, ell, type Sprite, type Tone } from './kit';

type Dir = 'S' | 'N' | 'E';
const spr = (name: string, w: number, h: number, ax: number, ay: number, body: string): Sprite => ({ name, w, h, ax, ay, body, pad: 2 });

// ---------------------------------------------------------------- body (tintable overall)
function body(dir: Dir): Sprite {
  const w = dir === 'E' ? 13 : 16, h = 17;
  let b = shape(rr(0, 0, w, h, dir === 'E' ? 6 : 7), T.grey, { s: 2.5, h: 1.2 });
  if (dir === 'S') {
    b += strokeP(`M${w / 2 - 3.5} 0.8L${w / 2} 4.5L${w / 2 + 3.5} 0.8`, '#7a7a7a', 1.2);      // collar
    b += `<rect x="${w / 2 + 1.5}" y="7" width="4" height="3.4" rx="0.8" fill="#bdbdbd" stroke="#6e6e6e" stroke-width=".8"/>`; // pocket
  } else if (dir === 'N') {
    b += strokeP(`M${w / 2} 2V${h - 2}`, '#a8a8a8', 0.8);
    b += `<rect x="${w / 2 - 4}" y="3.5" width="8" height="5" rx="1" fill="#f0f0f0" stroke="#7a7a7a" stroke-width=".8"/>`; // number patch (no text)
    b += `<path d="M${w / 2 - 2.5} 6h1.5M${w / 2 + 0.5} 6h2" stroke="#7a7a7a" stroke-width="1"/>`;
  } else {
    b += strokeP(`M${w / 2 + 2} 0.8L${w / 2 + 4} 4`, '#7a7a7a', 1.1);
  }
  return spr(`body_${dir}`, w, h, w / 2, h, b);
}
/** stripes overlay, clipped to body shape; tinted at runtime */
function stripes(dir: Dir): Sprite {
  const w = dir === 'E' ? 13 : 16, h = 17;
  const clip = `<clipPath id="sc${dir}"><path d="${rr(1, 1, w - 2, h - 2, dir === 'E' ? 5.5 : 6.5)}"/></clipPath>`;
  let lines = '';
  for (let y = 5.5; y < h; y += 4) lines += `<rect x="0" y="${y}" width="${w}" height="1.9" fill="#ffffff"/>`;
  return spr(`stripes_${dir}`, w, h, w / 2, h, `<defs>${clip}</defs><g clip-path="url(#sc${dir})" opacity=".95">${lines}</g>`);
}
const leg = (): Sprite => spr('leg', 5, 8, 2.5, 0, shape(rr(0, 0, 5, 8, 2.4), T.grey, { s: 1.5, h: 0.8, lw: 1.5 }));
const foot = (): Sprite => spr('foot', 7, 4, 3.5, 2, shape(ell(3.5, 2, 3.5, 2), T.ink, { s: 1, h: 0.6, lw: 1.2 }));
const arm = (): Sprite => spr('arm', 4.6, 9, 2.3, 0, shape(rr(0, 0, 4.6, 9, 2.3), T.grey, { s: 1.4, h: 0.8, lw: 1.4 }));
const paw = (): Sprite => spr('paw', 4.6, 4.6, 2.3, 2.3, shape(ell(2.3, 2.3, 2.3, 2.3), T.grey, { s: 1, h: 0.6, lw: 1.2 }));

// ---------------------------------------------------------------- shared face bits
/** half-lidded adult eye: small oval, pupil, heavy lid line */
const eye = (x: number, y: number, lid: string, raised = false, white: string = P.cream300) =>
  `<ellipse cx="${x}" cy="${y}" rx="1.45" ry="1.15" fill="${white}"/><circle cx="${x + 0.15}" cy="${y + 0.25}" r="0.78" fill="${P.ink900}"/>`
  + `<path d="M${x - 1.7} ${y - (raised ? 0.7 : 0.15)}Q${x} ${y - (raised ? 1.9 : 1.0)} ${x + 1.7} ${y - (raised ? 0.5 : 0.1)}" stroke="${lid}" stroke-width="1.15" fill="none" stroke-linecap="round"/>`
  + `<path d="M${x - 1.6} ${y - 0.2}Q${x} ${y - 1.2} ${x + 1.6} ${y - 0.1}L${x + 1.6} ${y - 1.6}L${x - 1.6} ${y - 1.6}Z" fill="${lid}" opacity=".55"/>`;
const eyeSide = (x: number, y: number, lid: string, white: string = P.cream300) =>
  `<ellipse cx="${x}" cy="${y}" rx="1.1" ry="1.1" fill="${white}"/><circle cx="${x + 0.4}" cy="${y + 0.25}" r="0.72" fill="${P.ink900}"/>`
  + `<path d="M${x - 1.3} ${y - 0.1}Q${x} ${y - 1.1} ${x + 1.4} ${y - 0.2}" stroke="${lid}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`;
const smirk = (x: number, y: number, c: string) => strokeP(`M${x - 1.6} ${y}Q${x} ${y + 0.9} ${x + 1.8} ${y - 0.5}`, c, 0.9);

interface Species {
  id: string;
  fur: Tone; furDark: Tone; muzzle: Tone;
  lid: string;
  ear: 'pointy' | 'round' | 'small' | 'fold';
  head: { w: number; h: number };
  extraS?: (w: number, h: number) => string;  // markings front
  extraN?: (w: number, h: number) => string;
  extraE?: (w: number, h: number) => string;
  snoutE: number;  // snout length in profile
}

const SPECIES: Record<string, Species> = {
  raccoon: {
    id: 'raccoon', fur: T.stone, furDark: T.stoneDark, muzzle: T.stoneLight, lid: P.ink900, ear: 'pointy', head: { w: 17, h: 13 }, snoutE: 4.5,
    extraS: (w) => `<path d="M${-w / 2 + 1.5} -7.8Q-4 -10.2 0 -7.6Q4 -10.2 ${w / 2 - 1.5} -7.8L${w / 2 - 2.2} -4.6Q3.6 -6.6 0 -4.4Q-3.6 -6.6 ${-w / 2 + 2.2} -4.6Z" fill="${P.ink900}"/>`
      + strokeP(`M-6 -10.2Q-4 -11.3 -2 -10.4M2 -10.9Q4 -12.2 6 -10.6`, P.cream300, 1.1),
    extraE: () => `<path d="M-2 -8.6Q2 -10 6.5 -8L6.5 -5Q2 -6.6 -2 -5.2Z" fill="${P.ink900}"/>` + strokeP('M0 -10.6Q2.5 -11.8 5 -10.6', P.cream300, 1.1),
  },
  weasel: {
    id: 'weasel', fur: T.wood, furDark: T.woodDark, muzzle: T.cream, lid: P.wood900, ear: 'small', head: { w: 14, h: 14 }, snoutE: 5.5,
    extraS: () => `<path d="M-4.2 -2.5Q0 1.2 4.2 -2.5Q3 -5.4 0 -5.2Q-3 -5.4 -4.2 -2.5Z" fill="${P.cream500}"/>`,
  },
  bear: {
    id: 'bear', fur: T.woodDark, furDark: { ...T.woodDark, base: P.wood900 }, muzzle: T.woodLight, lid: P.wood900, ear: 'round', head: { w: 19, h: 15 }, snoutE: 4,
  },
  bulldog: {
    id: 'bulldog', fur: T.brickLight, furDark: T.brick, muzzle: T.cream, lid: P.brick900, ear: 'fold', head: { w: 19, h: 14 }, snoutE: 3,
    extraS: () => strokeP('M-5 -1.5Q-6.5 1.4 -3.6 1.6M5 -1.5Q6.5 1.4 3.6 1.6', P.brick900, 0.9),
  },
  beaver: {
    id: 'beaver', fur: T.wood, furDark: T.woodDark, muzzle: T.woodLight, lid: P.wood900, ear: 'small', head: { w: 17, h: 14 }, snoutE: 4,
    extraS: () => `<rect x="-1.6" y="-2.4" width="3.2" height="2.6" rx=".6" fill="${P.cream300}" stroke="${P.wood700}" stroke-width=".6"/>`,
  },
  badger: {
    id: 'badger', fur: T.stoneDark, furDark: T.stoneDark, muzzle: T.cream, lid: P.ink900, ear: 'small', head: { w: 17, h: 14 }, snoutE: 5,
    extraS: () => `<path d="M-2.6 -14.6Q0 -15.4 2.6 -14.6L1.8 -3.5L-1.8 -3.5Z" fill="${P.cream300}"/>` + `<path d="M-8 -9Q-5 -12 -3.6 -10L-3 -4L-6.8 -4Z M8 -9Q5 -12 3.6 -10L3 -4L6.8 -4Z" fill="${P.cream500}" opacity=".9"/>`,
  },
};

function ears(sp: Species, w: number, h: number, dir: Dir): string {
  const top = -h + 1, xs = dir === 'E' ? [-1.5] : [-w / 2 + 3.2, w / 2 - 3.2];
  let b = '';
  for (const x of xs) {
    if (sp.ear === 'pointy') b += shape(`M${x - 3.8} ${top + 3}L${x - 1} ${top - 4.6}L${x + 3.4} ${top + 2}Z`, sp.fur, { s: 1.5, h: 0.8, lw: 1.5 }) + (dir !== 'N' ? flat(`M${x - 1.8} ${top + 1.6}L${x - 0.9} ${top - 1.8}L${x + 1.3} ${top + 1.2}Z`, P.ink700) : '');
    else if (sp.ear === 'round') b += shape(ell(x, top + 0.4, 3.6, 3.4), sp.fur, { s: 1.5, h: 0.8, lw: 1.5 }) + (dir !== 'N' ? `<circle cx="${x}" cy="${top + 0.8}" r="1.7" fill="${P.wood500}"/>` : '');
    else if (sp.ear === 'small') b += shape(ell(x, top + 1.4, 2.6, 2.4), sp.fur, { s: 1, h: 0.6, lw: 1.4 }) + (dir !== 'N' ? `<circle cx="${x}" cy="${top + 1.6}" r="1.1" fill="${sp.furDark.sh}"/>` : '');
    else b += shape(`M${x - 3.6} ${top + 1}Q${x} ${top - 2.6} ${x + 3.6} ${top + 1}L${x + (x < 0 ? -1 : 1) * 3.8} ${top + 5}Z`, sp.furDark, { s: 1, h: 0.6, lw: 1.4 });
  }
  return b;
}

function headS(sp: Species): Sprite {
  const { w, h } = sp.head;
  let b = ears(sp, w, h, 'S');
  b += shape(`M${-w / 2} ${-h * 0.42}Q${-w / 2} ${-h} 0 ${-h}Q${w / 2} ${-h} ${w / 2} ${-h * 0.42}Q${w / 2 - 1} 0 0 0Q${-w / 2 + 1} 0 ${-w / 2} ${-h * 0.42}Z`, sp.fur, { s: 2.5, h: 1.2 });
  b += sp.extraS?.(w, h) ?? '';
  // muzzle
  const mw = sp.id === 'bear' ? 5.2 : sp.id === 'bulldog' ? 6 : 4.4;
  b += shape(ell(0, -3.2, mw, 3.1), sp.muzzle, { s: 1.2, h: 0.6, lw: 1.2 });
  b += flat(ell(0, -4.7, 1.7, 1.15), P.ink900);
  b += smirk(0.4, -2.2, sp.lid);
  // eyes (half-lidded, one brow raised → smug)
  const ey = sp.id === 'raccoon' ? -6.4 : -7.2, ex = sp.id === 'weasel' ? 3 : 3.6;
  const white = sp.id === 'raccoon' ? P.stone300 : P.cream300;
  b += eye(-ex, ey, sp.lid, false, white) + eye(ex, ey, sp.lid, true, white);
  return spr(`head_${sp.id}_S`, w + 4, h + 8, (w + 4) / 2, h + 8, `<g transform="translate(${(w + 4) / 2} ${h + 8})">${b}</g>`);
}
function headN(sp: Species): Sprite {
  const { w, h } = sp.head;
  let b = ears(sp, w, h, 'N');
  b += shape(`M${-w / 2} ${-h * 0.42}Q${-w / 2} ${-h} 0 ${-h}Q${w / 2} ${-h} ${w / 2} ${-h * 0.42}Q${w / 2 - 1} 0 0 0Q${-w / 2 + 1} 0 ${-w / 2} ${-h * 0.42}Z`, sp.fur, { s: 2.5, h: 1.2 });
  if (sp.id === 'raccoon') b += strokeP(`M-4 -10Q0 -11.5 4 -10`, P.stone700, 1.2, 'round', 0.8);
  if (sp.id === 'badger') b += `<path d="M-2.4 -${h - 0.6}H2.4L1.6 -2H-1.6Z" fill="${P.cream300}"/>`;
  return spr(`head_${sp.id}_N`, w + 4, h + 8, (w + 4) / 2, h + 8, `<g transform="translate(${(w + 4) / 2} ${h + 8})">${b}</g>`);
}
function headE(sp: Species): Sprite {
  const { w, h } = sp.head;
  const hw = w * 0.42, sn = sp.snoutE;
  let b = ears(sp, w, h, 'E');
  b += shape(`M${-hw} ${-h * 0.45}Q${-hw} ${-h} ${hw * 0.2} ${-h}Q${hw + 1} ${-h} ${hw + 1.2} ${-h * 0.6}L${hw + sn} ${-h * 0.36}Q${hw + sn + 1} ${-h * 0.2} ${hw + sn - 1} ${-h * 0.1}Q${hw} ${0.4} 0 0Q${-hw} 0 ${-hw} ${-h * 0.45}Z`, sp.fur, { s: 2.5, h: 1.2 });
  b += sp.extraE?.(w, h) ?? '';
  b += shape(ell(hw + sn * 0.4, -h * 0.18, sn * 0.6 + 1, 2.1), sp.muzzle, { s: 1, h: 0.5, lw: 1 });
  b += flat(ell(hw + sn - 0.6, -h * 0.34, 1.3, 1), P.ink900);
  b += eyeSide(hw * 0.55, sp.id === 'raccoon' ? -6.6 : -7.4, sp.lid, sp.id === 'raccoon' ? P.stone300 : P.cream300);
  b += strokeP(`M${hw + 1} ${-h * 0.08}Q${hw + 2.5} ${0.3} ${hw + 4} ${-h * 0.12}`, sp.lid, 0.9);
  const W = w + sn + 6;
  return spr(`head_${sp.id}_E`, W, h + 8, w * 0.5 + 2, h + 8, `<g transform="translate(${w * 0.5 + 2} ${h + 8})">${b}</g>`);
}
/** blink overlay: fur-coloured patch + closed lid line, placed over the eyes */
function blink(sp: Species, dir: 'S' | 'E'): Sprite {
  const { w, h } = sp.head;
  const furC = sp.id === 'raccoon' ? P.ink900 : sp.fur.base;
  let b = '';
  if (dir === 'S') {
    const ey = sp.id === 'raccoon' ? -6.4 : -7.2, ex = sp.id === 'weasel' ? 3 : 3.6;
    for (const x of [-ex, ex]) b += `<ellipse cx="${x}" cy="${ey}" rx="1.9" ry="1.6" fill="${furC}"/>` + strokeP(`M${x - 1.6} ${ey + 0.1}Q${x} ${ey + 0.9} ${x + 1.6} ${ey + 0.1}`, sp.id === 'raccoon' ? P.stone500 : sp.lid, 1);
    return spr(`blink_${sp.id}_S`, w + 4, h + 8, (w + 4) / 2, h + 8, `<g transform="translate(${(w + 4) / 2} ${h + 8})">${b}</g>`);
  }
  const hw = w * 0.42, ey = sp.id === 'raccoon' ? -6.6 : -7.4;
  b += `<ellipse cx="${hw * 0.55}" cy="${ey}" rx="1.6" ry="1.5" fill="${furC}"/>` + strokeP(`M${hw * 0.55 - 1.3} ${ey + 0.1}Q${hw * 0.55} ${ey + 0.8} ${hw * 0.55 + 1.3} ${ey}`, sp.id === 'raccoon' ? P.stone500 : sp.lid, 1);
  const W = w + sp.snoutE + 6;
  return spr(`blink_${sp.id}_E`, W, h + 8, w * 0.5 + 2, h + 8, `<g transform="translate(${w * 0.5 + 2} ${h + 8})">${b}</g>`);
}

function tail(sp: 'raccoon' | 'weasel', dir: 'N' | 'E'): Sprite {
  let b = '';
  if (sp === 'raccoon') {
    const d = dir === 'N' ? 'M-3 0Q-6 6 -3 13Q0 17 3 13Q6 6 3 0Z' : 'M0 -2Q-8 -2 -12 3Q-14 8 -10 9Q-6 8 0 4Z';
    b += shape(d, T.stone, { s: 2, h: 1, lw: 1.5 });
    const rings = dir === 'N' ? 'M-4.6 4h9.2v2.4h-9.2zM-4.8 9h9.6v2.4h-9.6z' : 'M-4.5 -2l2.4 0 -1 8 -2.4 -.6zM-9.5 0l2.4 .6 -1.6 7.6 -2.2 -.8z';
    b += `<g clip-path="url(#tc${dir})"><path d="${rings}" fill="${P.ink900}"/></g><defs><clipPath id="tc${dir}"><path d="${d}"/></clipPath></defs>`;
  } else {
    const d = dir === 'N' ? 'M-2 0Q-4 6 -1.5 11Q1 13.5 2 10.5Q3 5 2 0Z' : 'M0 -1Q-7 0 -10.5 4.5Q-11.5 7 -9 6.4Q-5 3.6 0 3Z';
    b += shape(d, T.wood, { s: 1.5, h: 0.8, lw: 1.4 });
    b += dir === 'N' ? `<path d="M-1.8 8.5Q0 14 2 10.5L1.9 8.5Z" fill="${P.wood900}"/>` : `<path d="M-8.6 4.6Q-12 7.4 -9 6.4L-7.6 4.2Z" fill="${P.wood900}"/>`;
  }
  const w = 32, h = 24;
  return spr(`tail_${sp}_${dir}`, w, h, w / 2, 4, `<g transform="translate(${w / 2} 4)">${b}</g>`);
}

// ---------------------------------------------------------------- accessories & role headwear (anchor = neck point of head sprite)
function beanie(dir: Dir): Sprite {
  const b = dir === 'E'
    ? shape('M-7 -11Q-7 -17.5 0 -17.5Q7 -17.5 8 -11.5Z', T.grey, { s: 1.5, h: 0.8, lw: 1.4 }) + shape(rr(-7.6, -12.4, 16, 3, 1.4), T.greyDark, { s: 1, lw: 1.2 })
    : shape('M-8 -11Q-8 -18 0 -18Q8 -18 8 -11Z', T.grey, { s: 1.5, h: 0.8, lw: 1.4 }) + shape(rr(-8.6, -12.4, 17.2, 3, 1.4), T.greyDark, { s: 1, lw: 1.2 }) + `<circle cx="0" cy="-18.4" r="2" fill="#f0f0f0" stroke="#6e6e6e" stroke-width=".8"/>`;
  return spr(`acc_beanie_${dir}`, 24, 24, 12, 24, `<g transform="translate(12 24)">${b}</g>`);
}
function glasses(dir: 'S' | 'E'): Sprite {
  const b = dir === 'S'
    ? `<g fill="${P.cream300}" fill-opacity=".25" stroke="${P.ink900}" stroke-width="1"><rect x="-6.2" y="-8.4" width="4.6" height="3.4" rx="1"/><rect x="1.6" y="-8.4" width="4.6" height="3.4" rx="1"/></g>` + strokeP('M-1.6 -7h3.2', P.ink900, 0.9)
    : `<rect x="1.6" y="-8.6" width="4" height="3.2" rx="1" fill="${P.cream300}" fill-opacity=".25" stroke="${P.ink900}" stroke-width="1"/>` + strokeP('M1.6 -7.4L-3.4 -8', P.ink900, 0.9);
  return spr(`acc_glasses_${dir}`, 24, 24, 12, 24, `<g transform="translate(12 24)">${b}</g>`);
}
function scarf(dir: Dir): Sprite {
  let b = shape(rr(-8, -2.4, 16, 4.4, 2.2), T.grey, { s: 1.2, h: 0.6, lw: 1.3 });
  if (dir === 'S') b += shape(rr(2.4, 0.8, 3.6, 7, 1.4), T.grey, { s: 1, lw: 1.2 });
  if (dir === 'E') b += shape(rr(-7, 0.6, 3.6, 7, 1.4), T.grey, { s: 1, lw: 1.2 });
  return spr(`acc_scarf_${dir}`, 24, 24, 12, 12, `<g transform="translate(12 12)">${b}</g>`);
}
function bandage(dir: 'S' | 'E'): Sprite {
  const x = dir === 'S' ? 4.4 : 0.5;
  const b = `<g transform="translate(${x} -11.2) rotate(-24)"><rect x="-3.2" y="-1.2" width="6.4" height="2.4" rx="1" fill="${P.cream500}" stroke="${P.wood700}" stroke-width=".7"/><rect x="-1.2" y="-1.2" width="2.4" height="2.4" fill="${P.cream700}"/></g>`;
  return spr(`acc_bandage_${dir}`, 24, 24, 12, 24, `<g transform="translate(12 24)">${b}</g>`);
}
function chefHat(dir: Dir): Sprite {
  const b = shape('M-7 -14Q-11 -18 -8 -22Q-6 -26 -2 -24Q0 -28 4 -25Q9 -26 9 -21Q11 -17 7 -14Z', T.cream, { s: 1.8, h: 1 }) + shape(rr(-7.5, -15.4, 15, 4, 1.6), T.stoneLight, { s: 1, lw: 1.3 });
  return spr(`acc_chef_${dir}`, 26, 30, 13, 30, `<g transform="translate(13 30)">${dir === 'E' ? `<g transform="translate(1 0)">${b}</g>` : b}</g>`);
}
function guardCap(dir: Dir): Sprite {
  const brim = dir === 'S' ? shape(rr(-7, -12.2, 14, 3, 1.2), T.ink, { s: 1, lw: 1.2 }) : dir === 'E' ? shape('M2 -12.4H11Q11 -9.6 4 -9.6Z', T.ink, { s: 1, lw: 1.2 }) : '';
  const b = shape('M-8 -11Q-8 -17.6 0 -17.6Q8 -17.6 8 -11Z', T.ink, { s: 1.5, h: 0.8, lw: 1.4 }) + brim + (dir !== 'N' ? `<circle cx="${dir === 'E' ? 3 : 0}" cy="-14.6" r="1.6" fill="${P.gold500}" stroke="${P.wood900}" stroke-width=".7"/>` : '');
  return spr(`acc_guardcap_${dir}`, 26, 26, 13, 26, `<g transform="translate(13 26)">${b}</g>`);
}

// ---------------------------------------------------------------- world icons (on cream plaque)
const plaque = (): Sprite => spr('plaque', 22, 22, 11, 22, shape('M3 1H19Q21 1 21 3V15Q21 17 19 17H14L11 21L8 17H3Q1 17 1 15V3Q1 1 3 1Z', T.cream, { s: 1.5, h: 1, lw: 1.6 }));
const iconPlate = (): Sprite => spr('icon_hunger', 14, 14, 7, 7, `<ellipse cx="7" cy="8" rx="6" ry="4.2" fill="${P.cream300}" stroke="${P.stone700}" stroke-width="1.2"/><ellipse cx="7" cy="7.6" rx="3.4" ry="2.2" fill="${P.wood300}" stroke="${P.wood700}" stroke-width=".8"/>` + strokeP('M2 1.5v4M12 1.5v4', P.stone700, 1.2));
const iconZzz = (): Sprite => spr('icon_energy', 14, 14, 7, 7, `<path d="M2 3h5L2 9h5M8 5h4l-4 5h4" fill="none" stroke="${P.ink700}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`);
const iconDrop = (): Sprite => spr('icon_hygiene', 14, 14, 7, 7, shape('M7 1Q12 7 12 9.2Q12 13 7 13Q2 13 2 9.2Q2 7 7 1Z', T.teal, { s: 1.5, h: 0.8, lw: 1.3 }));
const iconBall = (): Sprite => spr('icon_fun', 14, 14, 7, 7, shape(ell(7, 7, 5.6, 5.6), T.coral, { s: 1.6, h: 0.8, lw: 1.3 }) + strokeP('M2 6Q7 9 12 6M7 1.5V12.5', P.cream300, 1, 'round', 0.9));
const iconCoin = (): Sprite => spr('icon_coin', 14, 14, 7, 7, shape(ell(7, 7, 6, 6), T.gold, { s: 2, h: 1, lw: 1.4 }) + `<rect x="5.6" y="4" width="2.8" height="6" rx="1" fill="${P.gold700}"/>`);
const iconStink = (): Sprite => spr('stink', 16, 14, 8, 14, strokeP('M3 13Q1 10 3 7T3 1M8 13Q6 10 8 7T8 1M13 13Q11 10 13 7T13 1', P.sage300, 1.6, 'round', 0.9));
const iconQuestion = (): Sprite => spr('icon_wait', 14, 14, 7, 7, strokeP('M4.5 5Q4.5 2 7 2Q9.6 2 9.6 4.6Q9.6 6.4 7 7.2V9', P.coral700, 1.8) + `<circle cx="7" cy="12" r="1.2" fill="${P.coral700}"/>`);

export function charSprites(): Sprite[] {
  const out: Sprite[] = [];
  for (const d of ['S', 'N', 'E'] as Dir[]) out.push(body(d), stripes(d), beanie(d), scarf(d), chefHat(d), guardCap(d));
  out.push(leg(), foot(), arm(), paw());
  for (const sp of Object.values(SPECIES)) out.push(headS(sp), headN(sp), headE(sp), blink(sp, 'S'), blink(sp, 'E'));
  out.push(tail('raccoon', 'N'), tail('raccoon', 'E'), tail('weasel', 'N'), tail('weasel', 'E'));
  out.push(glasses('S'), glasses('E'), bandage('S'), bandage('E'));
  out.push(plaque(), iconPlate(), iconZzz(), iconDrop(), iconBall(), iconCoin(), iconStink(), iconQuestion());
  return out;
}
export const SPECIES_IDS = Object.keys(SPECIES);
