/**
 * Feedback sprites for the juice pass (Brief §12.6 E, STYLE_GUIDE §7): tap ring, sparkle, star, tossed hat,
 * scaffold, need plaques (cream-300 plaque with wood-700 outline), the 3-slice "+coins" plaque and the level badge.
 * White/grey parts are tinted at runtime. No text in SVGs.
 */
import { P } from '../../art/palette';
import { shape, flat, strokeP, rr, ell, T, scopedIds, type Sprite } from './kit';

/** thin white ring (tinted at runtime) for taps, ripples and shock rings */
const ring = (): Sprite => ({ name: 'fxRing', w: 48, h: 48, ax: 24, ay: 24,
  body: `<circle cx="24" cy="24" r="21" fill="none" stroke="#ffffff" stroke-width="3.2"/><circle cx="24" cy="24" r="17.6" fill="none" stroke="#ffffff" stroke-width="1" opacity=".45"/>` });

/** four-point sparkle, white core (tinted gold/cream/mint at runtime) */
const sparkle = (): Sprite => ({ name: 'sparkle', w: 16, h: 16, ax: 8, ay: 8,
  body: `<path d="M8 0Q9 7 16 8Q9 9 8 16Q7 9 0 8Q7 7 8 0Z" fill="#ffffff"/><circle cx="8" cy="8" r="1.6" fill="#ffffff"/>` });

/** five-point gold star (stars, milestones) */
function star(): Sprite {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 6.2 : 13, a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(14 + Math.cos(a) * r).toFixed(2)} ${(14.5 + Math.sin(a) * r).toFixed(2)}`);
  }
  return { name: 'fxStar', w: 28, h: 28, ax: 14, ay: 14, body: shape(`M${pts.join('L')}Z`, T.gold, { s: 2.2, h: 1.2, lw: 1.8 }) };
}

/** a rascal's flat cap, tossed on release (PEGI ok: a hat in the air) */
function hat(): Sprite {
  let b = shape('M2 15Q3 6 12 5Q21 5 22 12L26 13Q27 16 22 16H4Q2 16 2 15Z', T.wood, { s: 2, h: 1, lw: 1.6 });
  b += strokeP('M5 12.5Q12 10.5 21 12', P.wood700, 1.1, 'round', 0.8);
  b += shape(ell(12, 6.2, 1.8, 1.2), T.woodDark, { s: 0.6, h: 0, lw: 1 });
  return { name: 'hatToss', w: 28, h: 18, ax: 14, ay: 10, body: b };
}

/** scaffold frame standing at a room corner while it is being built */
function scaffold(): Sprite {
  let b = shape(rr(1, 2, 4, 40, 1), T.woodLight, { s: 1, h: 0.6, lw: 1.3 }) + shape(rr(19, 2, 4, 40, 1), T.woodLight, { s: 1, h: 0.6, lw: 1.3 });
  b += shape(rr(0, 12, 24, 4, 1), T.wood, { s: 1, h: 0.5, lw: 1.3 }) + shape(rr(0, 28, 24, 4, 1), T.wood, { s: 1, h: 0.5, lw: 1.3 });
  b += strokeP('M4 16L20 28M20 16L4 28', P.wood700, 1.4);
  b += shape(rr(-2, 40, 28, 3, 1), T.stone, { s: 0.6, h: 0, lw: 1 });
  return { name: 'scaffold', w: 24, h: 44, ax: 12, ay: 43, body: b, pad: 3 };
}

/** need plaque: cream-300 bubble with wood-700 outline and a little tail, icon on top (32 u, shown at ≥ 14 px) */
const plaque = () => flat('M16 1.5C24.3 1.5 30.5 7.6 30.5 15.2C30.5 22.6 24.6 28.4 17.6 28.9L16 33L14.4 28.9C7.4 28.4 1.5 22.6 1.5 15.2C1.5 7.6 7.7 1.5 16 1.5Z', P.cream300, P.wood700, 2);
function needIcon(name: string, icon: string): Sprite { return { name, w: 32, h: 34, ax: 16, ay: 33, body: plaque() + icon }; }
const needHunger = () => needIcon('needHunger',
  shape('M6.5 14H25.5Q25 23 16 23.5Q7 23 6.5 14Z', T.brickLight, { s: 1.6, h: 0.8, lw: 1.4 })
  + shape(rr(5.5, 12.4, 21, 3, 1.4), T.cream, { s: 0.6, h: 0, lw: 1.2 })
  + strokeP('M12 10Q10.5 8 12 6M16 10Q14.5 7.5 16 5M20 10Q18.5 8 20 6', P.stone500, 1.2, 'round', 0.9));
const needEnergy = () => needIcon('needEnergy',
  shape('M18.5 5.5Q11 7 11 15Q11 23 19.5 24.5Q14 26.5 9.5 23Q5.5 19.5 6 14Q6.5 7.5 12.5 5.5Q15.5 4.6 18.5 5.5Z', T.gold, { s: 1.6, h: 0.8, lw: 1.4 })
  + strokeP('M19 9H24L19 15H24', P.ink700, 1.6) + strokeP('M21.5 17.5H25L21.5 21.5H25', P.ink500, 1.3));
const needHygiene = () => needIcon('needHygiene',
  shape('M14 4.5Q20.5 12.5 20.5 17Q20.5 23.5 14 23.5Q7.5 23.5 7.5 17Q7.5 12.5 14 4.5Z', T.teal, { s: 1.6, h: 0.9, lw: 1.4 })
  + shape(ell(22.5, 10.5, 3, 3), T.cream, { s: 0.8, h: 0.4, lw: 1.1 }) + shape(ell(24, 18.5, 2, 2), T.cream, { s: 0.6, h: 0.3, lw: 1 }));
const needFun = () => needIcon('needFun',
  shape(ell(16, 15, 8.6, 8.6), T.coral, { s: 2, h: 1, lw: 1.5 })
  + strokeP('M8 13.5Q16 18.5 24 13.5M16 6.5V23.5', P.cream300, 1.4, 'round', 0.95));

/** 3-slice plaque for floating "+coins" numbers: left cap with a coin, stretchable middle, right cap (pad 0 → extruded) */
const H = 24;
const capL = (): Sprite => ({ name: 'plqL', w: 26, h: H, ax: 26, ay: 12, pad: 0,
  body: `<path d="M26 1H12A11 11 0 0 0 12 23H26Z" fill="${P.cream300}"/><path d="M26 1.1H12A10.9 10.9 0 0 0 12 22.9H26" fill="none" stroke="${P.wood700}" stroke-width="2"/>`
    + shape(ell(12.5, 12, 7, 7), T.gold, { s: 1.8, h: 1, lw: 1.4 }) + `<rect x="11.2" y="8.4" width="2.6" height="7.2" rx="1" fill="${P.gold700}"/>` });
const mid = (): Sprite => ({ name: 'plqM', w: 4, h: H, ax: 0, ay: 12, pad: 0,
  body: `<rect x="0" y="1" width="4" height="22" fill="${P.cream300}"/><path d="M0 1.1H4M0 22.9H4" stroke="${P.wood700}" stroke-width="2"/>` });
const capR = (): Sprite => ({ name: 'plqR', w: 12, h: H, ax: 0, ay: 12, pad: 0,
  body: `<path d="M0 1H1A11 11 0 0 1 1 23H0Z" fill="${P.cream300}"/><path d="M0 1.1H1A10.9 10.9 0 0 1 1 22.9H0" fill="none" stroke="${P.wood700}" stroke-width="2"/>` });

/** gold level badge (the level number is BitmapText on top) */
const badge = (): Sprite => ({ name: 'lvlBadge', w: 34, h: 34, ax: 17, ay: 17,
  body: shape(ell(17, 17, 15, 15), T.gold, { s: 2.4, h: 1.2, lw: 2 }) + `<circle cx="17" cy="17" r="10.5" fill="${P.cream300}" stroke="${P.gold700}" stroke-width="1.4"/>` });

/** escapee marker (spoon tunnel, Brief §3.12): coral-500 bubble, brick-900 outline (STYLE_GUIDE §2), cream "!" – shown at the need-icon size */
const alertMark = (): Sprite => ({ name: 'alertMark', w: 32, h: 34, ax: 16, ay: 33,
  body: shape('M16 1.5C24.3 1.5 30.5 7.6 30.5 15.2C30.5 22.6 24.6 28.4 17.6 28.9L16 33L14.4 28.9C7.4 28.4 1.5 22.6 1.5 15.2C1.5 7.6 7.7 1.5 16 1.5Z', T.coral, { s: 1.8, h: 1, lw: 2 })
    + `<path d="M13.6 6.4H18.4L17.5 18.6H14.5Z" fill="${P.cream300}" stroke="${P.brick900}" stroke-width="1.2" stroke-linejoin="round"/>`
    + `<circle cx="16" cy="23" r="2.6" fill="${P.cream300}" stroke="${P.brick900}" stroke-width="1.2"/>` });

export function fxSprites(): Sprite[] {
  // own id range: each sprite is its own SVG document, so ids only need to be unique per sprite
  return scopedIds(1e6, () => [ring(), sparkle(), star(), hat(), scaffold(), needHunger(), needEnergy(), needHygiene(), needFun(), capL(), mid(), capR(), badge(), alertMark()]);
}
