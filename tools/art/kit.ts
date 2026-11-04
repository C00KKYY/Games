/**
 * Art kit – the style rules of docs/STYLE_GUIDE.md as code.
 * Every shape: outline (900 of own ramp, 2 u), base fill, bottom-right shadow crescent,
 * one top-left highlight edge. Light from top-left. No text, no pure black/white.
 */
import { P } from '../../art/palette';

export interface Tone { hi: string; base: string; sh: string; line: string }

export const T = {
  wood: { hi: P.wood300, base: P.wood500, sh: P.wood700, line: P.wood900 },
  woodDark: { hi: P.wood500, base: P.wood700, sh: P.wood900, line: P.wood900 },
  woodLight: { hi: P.cream500, base: P.wood300, sh: P.wood500, line: P.wood700 },
  teal: { hi: P.teal300, base: P.teal500, sh: P.teal700, line: P.teal900 },
  tealDark: { hi: P.teal500, base: P.teal700, sh: P.teal900, line: P.teal900 },
  sage: { hi: P.sage300, base: P.sage500, sh: P.sage700, line: P.sage900 },
  sageDark: { hi: P.sage500, base: P.sage700, sh: P.sage900, line: P.sage900 },
  brick: { hi: P.brick500, base: P.brick700, sh: P.brick900, line: P.brick900 },
  brickLight: { hi: '#d07a5c', base: P.brick500, sh: P.brick700, line: P.brick900 },
  stone: { hi: P.stone300, base: P.stone500, sh: P.stone700, line: P.stone900 },
  stoneDark: { hi: P.stone500, base: P.stone700, sh: P.stone900, line: P.stone900 },
  stoneLight: { hi: P.cream300, base: P.stone300, sh: P.stone500, line: P.stone700 },
  cream: { hi: P.cream300, base: P.cream500, sh: P.cream700, line: P.wood700 },
  ink: { hi: P.ink500, base: P.ink700, sh: P.ink900, line: P.ink900 },
  gold: { hi: '#f4d07a', base: P.gold500, sh: P.gold700, line: P.wood900 },
  coral: { hi: '#ec8b78', base: P.coral500, sh: P.coral700, line: P.brick900 },
  mint: { hi: '#93dcb9', base: P.mint500, sh: P.mint700, line: P.sage900 },
  /** greyscale tone for tintable layers (multiply tint) */
  grey: { hi: '#ffffff', base: '#e0e0e0', sh: '#a8a8a8', line: '#4a4a4a' },
  greyDark: { hi: '#bdbdbd', base: '#9a9a9a', sh: '#6e6e6e', line: '#3a3a3a' },
} satisfies Record<string, Tone>;

let uid = 0;
const id = (p: string) => `${p}${(uid++).toString(36)}`;
export const resetIds = () => { uid = 0; };

export interface ShadeOpts { s?: number; h?: number; lw?: number; noLine?: boolean; noHi?: boolean; shOpacity?: number; transform?: string }

/** The core style primitive. `d` = SVG path. */
export function shape(d: string, t: Tone, o: ShadeOpts = {}): string {
  const s = o.s ?? 3, h = o.h ?? 1.5, lw = o.lw ?? 2;
  const c = id('c'), m = id('m');
  const tr = o.transform ? ` transform="${o.transform}"` : '';
  return `<g${tr}><defs><clipPath id="${c}"><path d="${d}"/></clipPath>`
    + `<mask id="${m}" maskUnits="userSpaceOnUse" x="-999" y="-999" width="3000" height="3000"><rect x="-999" y="-999" width="3000" height="3000" fill="#fff"/><path d="${d}" transform="translate(${h} ${h})" fill="#000"/></mask></defs>`
    + `<g clip-path="url(#${c})"><path d="${d}" fill="${t.sh}"/><path d="${d}" transform="translate(${-s} ${-s})" fill="${t.base}"${o.shOpacity !== undefined ? '' : ''}/>`
    + (o.noHi ? '' : `<path d="${d}" fill="${t.hi}" mask="url(#${m})"/>`)
    + `</g>`
    + (o.noLine ? '' : `<path d="${d}" fill="none" stroke="${t.line}" stroke-width="${lw}" stroke-linejoin="round"/>`)
    + `</g>`;
}

/** flat fill, no shading (for small details) */
export const flat = (d: string, fill: string, line?: string, lw = 2) =>
  `<path d="${d}" fill="${fill}"${line ? ` stroke="${line}" stroke-width="${lw}" stroke-linejoin="round"` : ''}/>`;

export const strokeP = (d: string, color: string, w = 2, cap = 'round', opacity = 1) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="${cap}" stroke-linejoin="round"${opacity < 1 ? ` opacity="${opacity}"` : ''}/>`;

/** rounded rect path */
export function rr(x: number, y: number, w: number, h: number, r = 3): string {
  r = Math.min(r, w / 2, h / 2);
  return `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;
}
export function ell(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
}
/** soft elliptical contact shadow (STYLE_GUIDE §2) */
export function contactShadow(cx: number, cy: number, w: number, opacity = 0.22): string {
  const f = id('f');
  return `<defs><filter id="${f}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${Math.max(0.8, w * 0.05)}"/></filter></defs>`
    + `<ellipse cx="${cx + 1.5}" cy="${cy + 1.5}" rx="${w * 0.45}" ry="${w * 0.15}" fill="${P.ink900}" opacity="${opacity}" filter="url(#${f})"/>`;
}

export interface Sprite { name: string; w: number; h: number; ax: number; ay: number; body: string; pad?: number }

export const svgDoc = (s: Sprite, scale = 1) => {
  const pad = s.pad ?? 2;
  const W = s.w + pad * 2, H = s.h + pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * scale}" height="${H * scale}" viewBox="${-pad} ${-pad} ${W} ${H}">${s.body}</svg>`;
};

/** deterministic pseudo random for decorative variation */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
