/**
 * M5 art (docs/M5_DESIGN.md §13, owner art-m5): Cat Burglar (cat + top hat), goose inspector, held items (clipboard,
 * whistle, mop, horn), visible results of the 12 projects, dock teaser board, site-2 silhouette, brawl dust,
 * parcel line, inspection/perk/key feedback sprites and the M5 HUD icons.
 * Style rules as in kit.ts: 2-tone shapes, own-ramp outlines, light from the top left, no text, palette only.
 * Every group runs on its own id range (scopedIds) so the ids of the M4 sprites stay unchanged.
 */
import { P } from '../../art/palette';
import { T, shape, flat, strokeP, rr, ell, contactShadow, scopedIds, type Sprite, type Tone } from './kit';
import { spr, eye, eyeSide, smirk, type Dir } from './chars';

// ================================================================ characters
/** cat ear (pointy, coral inner ear) */
function catEar(x: number, top: number, front: boolean): string {
  return shape(`M${x - 3.8} ${top + 3.4}L${x - 0.6} ${top - 4.8}L${x + 3.4} ${top + 2.4}Z`, T.ink, { s: 1.5, h: 0.8, lw: 1.5 })
    + (front ? flat(`M${x - 1.9} ${top + 1.8}L${x - 0.6} ${top - 1.9}L${x + 1.4} ${top + 1.4}Z`, P.coral700) : '');
}
const CAT = { w: 17, h: 14 };
/** cat burglar head: ink-700 fur, cream muzzle, ink-900 burglar mask, gold eyes, whiskers */
function catHead(dir: Dir): Sprite {
  const { w, h } = CAT;
  const head = `M${-w / 2} ${-h * 0.42}Q${-w / 2} ${-h} 0 ${-h}Q${w / 2} ${-h} ${w / 2} ${-h * 0.42}Q${w / 2 - 1} 0 0 0Q${-w / 2 + 1} 0 ${-w / 2} ${-h * 0.42}Z`;
  let b = '';
  if (dir === 'E') {
    const hw = w * 0.42, sn = 3.2;
    b += catEar(-1, -h + 1, true);
    b += shape(`M${-hw} ${-h * 0.45}Q${-hw} ${-h} ${hw * 0.2} ${-h}Q${hw + 1} ${-h} ${hw + 1.2} ${-h * 0.6}L${hw + sn} ${-h * 0.36}Q${hw + sn + 1} ${-h * 0.2} ${hw + sn - 1} ${-h * 0.1}Q${hw} 0.4 0 0Q${-hw} 0 ${-hw} ${-h * 0.45}Z`, T.ink, { s: 2.5, h: 1.2 });
    b += `<path d="M-1.5 -9.4Q3 -10.6 ${hw + 2.4} -8.6L${hw + 2.2} -5.6Q3 -7 -1.5 -5.8Z" fill="${P.ink900}"/>`;           // mask
    b += shape(ell(hw + sn * 0.35, -h * 0.17, sn * 0.6 + 1.4, 2.2), T.cream, { s: 1, h: 0.5, lw: 1 });
    b += flat(`M${hw + sn - 1.4} ${-h * 0.36}L${hw + sn + 0.6} ${-h * 0.36}L${hw + sn - 0.4} ${-h * 0.26}Z`, P.coral500);
    b += eyeSide(hw * 0.55 + 0.4, -7.4, P.ink900, P.gold500);
    b += strokeP(`M${hw + 1.6} -2.6L${hw + 6.5} -3.4M${hw + 1.6} -1.8L${hw + 6.2} -1.2`, P.cream300, 0.6, 'round', 0.9);
    const W = w + sn + 8;
    return spr('head_cat_E', W, h + 8, w * 0.5 + 2, h + 8, `<g transform="translate(${w * 0.5 + 2} ${h + 8})">${b}</g>`);
  }
  for (const x of [-w / 2 + 3.2, w / 2 - 3.2]) b += catEar(x, -h + 1, dir === 'S');
  b += shape(head, T.ink, { s: 2.5, h: 1.2 });
  if (dir === 'N') {
    b += strokeP('M-3.6 -11.2Q0 -12.4 3.6 -11.2', P.ink500, 1, 'round', 0.8);
    return spr('head_cat_N', w + 4, h + 8, (w + 4) / 2, h + 8, `<g transform="translate(${(w + 4) / 2} ${h + 8})">${b}</g>`);
  }
  // burglar mask: a band across the eyes with two pointed tails
  b += `<path d="M${-w / 2 + 0.8} -8.8Q0 -10.6 ${w / 2 - 0.8} -8.8L${w / 2 - 1.4} -5.4Q0 -6.6 ${-w / 2 + 1.4} -5.4Z" fill="${P.ink900}"/>`;
  b += shape(ell(0, -3.1, 4.6, 3), T.cream, { s: 1.2, h: 0.6, lw: 1.2 });
  b += flat('M-1.5 -5.2H1.5L0 -3.8Z', P.coral500, P.brick900, 0.6);
  b += smirk(0.4, -2.2, P.wood700);
  b += eye(-3.6, -7.2, P.ink900, false, P.gold500) + eye(3.6, -7.2, P.ink900, true, P.gold500);
  b += strokeP('M-4.2 -3.4L-8.8 -4.2M-4.2 -2.4L-8.6 -1.8M4.2 -3.4L8.8 -4.2M4.2 -2.4L8.6 -1.8', P.cream300, 0.6, 'round', 0.9);
  return spr('head_cat_S', w + 4, h + 8, (w + 4) / 2, h + 8, `<g transform="translate(${(w + 4) / 2} ${h + 8})">${b}</g>`);
}
function catBlink(dir: 'S' | 'E'): Sprite {
  const { w, h } = CAT;
  if (dir === 'S') {
    let b = '';
    for (const x of [-3.6, 3.6]) b += `<ellipse cx="${x}" cy="-7.2" rx="1.9" ry="1.6" fill="${P.ink900}"/>` + strokeP(`M${x - 1.6} -7.1Q${x} -6.3 ${x + 1.6} -7.1`, P.gold700, 1);
    return spr('blink_cat_S', w + 4, h + 8, (w + 4) / 2, h + 8, `<g transform="translate(${(w + 4) / 2} ${h + 8})">${b}</g>`);
  }
  const x = w * 0.42 * 0.55 + 0.4;
  const b = `<ellipse cx="${x}" cy="-7.4" rx="1.6" ry="1.5" fill="${P.ink900}"/>` + strokeP(`M${x - 1.3} -7.3Q${x} -6.6 ${x + 1.3} -7.4`, P.gold700, 1);
  return spr('blink_cat_E', w + 3.2 + 8, h + 8, w * 0.5 + 2, h + 8, `<g transform="translate(${w * 0.5 + 2} ${h + 8})">${b}</g>`);
}
/** long curled cat tail with a cream tip (N = seen from behind, E = profile) */
function catTail(dir: 'N' | 'E'): Sprite {
  const d = dir === 'N' ? 'M-1.8 0Q-5 8 -2 14Q1 19 5 15Q6.5 13 4.6 12.4Q2.4 14.6 1 12Q-1 8 1.8 0Z' : 'M0 -1.6Q-9 -1 -12 6Q-13 10 -9.6 9.6Q-9 7.4 -10 6.6Q-7.6 2.6 0 2Z';
  let b = shape(d, T.ink, { s: 1.5, h: 0.8, lw: 1.4 });
  b += dir === 'N' ? `<path d="M2.4 13.2Q4.2 15.4 5.4 14.2Q6.4 13 4.6 12.4Q3.4 13.8 2.4 13.2Z" fill="${P.cream500}"/>` : `<path d="M-10.6 6.6Q-12.4 9.8 -9.6 9.6Q-9.2 7.8 -9.8 6.8Z" fill="${P.cream500}"/>`;
  const w = 32, h = 24;
  return spr(`tail_cat_${dir}`, w, h, w / 2, 4, `<g transform="translate(${w / 2} 4)">${b}</g>`);
}
/** the Cat Burglar's top hat: maroon felt, gold band, slightly cocked (anchor = neck point like every head accessory) */
function topHat(dir: Dir): Sprite {
  const tilt = dir === 'E' ? -6 : dir === 'S' ? -9 : 9;
  let b = shape(rr(-6, -27, 12, 13.5, 2), T.brick, { s: 2, h: 1 });
  b += `<rect x="-6" y="-17.4" width="12" height="2.8" fill="${P.gold500}" stroke="${P.wood900}" stroke-width=".7"/>`;
  b += shape(rr(-9.5, -15, 19, 3, 1.4), T.brick, { s: 1, h: 0.6, lw: 1.3 });
  if (dir !== 'N') b += `<rect x="${dir === 'E' ? 1.5 : -3.6}" y="-17.6" width="2.2" height="3.2" rx=".6" fill="${P.cream300}" stroke="${P.wood700}" stroke-width=".5"/>`; // calling card in the band
  return spr(`acc_tophat_${dir}`, 28, 32, 14, 32, `<g transform="translate(14 32) rotate(${tilt} 0 -14)">${b}</g>`);
}

const GOOSE_W: Tone = { hi: P.cream300, base: P.cream500, sh: P.stone300, line: P.stone700 };
/** goose inspector head: long cream neck, small head, gold beak, pince-nez (anchor = neck point) */
function gooseHead(dir: Dir): Sprite {
  let b = '';
  if (dir === 'E') {
    b += shape('M-2.6 1Q-3.2 -6 -1.4 -10Q0 -13 -0.6 -15L3.4 -15.6Q4.4 -11 2.4 -7.6Q1.4 -4.4 2.6 1Z', GOOSE_W, { s: 1.5, h: 0.8, lw: 1.4 });
    b += shape(ell(1.8, -17, 5, 4.4), GOOSE_W, { s: 1.6, h: 0.9, lw: 1.4 });
    b += shape('M5.6 -18.4Q9.8 -18.6 11.4 -16.6Q9.6 -15.2 5.8 -15.4Z', T.gold, { s: 0.8, h: 0.5, lw: 1.1 });
    b += strokeP('M6.6 -16.6H9.6', P.gold700, 0.6);
    b += eyeSide(3.4, -18.2, P.stone700);
    b += `<circle cx="3.6" cy="-18" r="1.9" fill="none" stroke="${P.ink900}" stroke-width=".7"/>` + strokeP('M5.4 -18.4L5.8 -16.8M1.8 -18.2Q0 -14 0.6 -11', P.gold700, 0.5, 'round', 0.9);
    return spr('head_goose_E', 22, 26, 9, 24, `<g transform="translate(9 24)">${b}</g>`);
  }
  b += shape('M-3.6 1Q-3.4 -6 -2.6 -12H2.6Q3.4 -6 3.6 1Z', GOOSE_W, { s: 1.4, h: 0.8, lw: 1.4 });   // neck, wider at the base
  b += shape('M-5.6 -15.4Q-5.6 -21.2 0 -21.2Q5.6 -21.2 5.6 -15.4Q5.4 -11.4 0 -11.2Q-5.4 -11.4 -5.6 -15.4Z', GOOSE_W, { s: 1.6, h: 0.9, lw: 1.4 });
  if (dir === 'N') {
    b += strokeP('M-2.6 -19.4Q0 -20.6 2.6 -19.4', P.cream300, 1, 'round', 0.9);
    return spr('head_goose_N', 18, 26, 9, 24, `<g transform="translate(9 24)">${b}</g>`);
  }
  b += shape('M-2.4 -14.6Q0 -15.8 2.4 -14.6L1.5 -10.6Q0 -9.6 -1.5 -10.6Z', T.gold, { s: 0.8, h: 0.5, lw: 1.1 });
  b += strokeP('M-1.4 -12.6Q0 -12 1.4 -12.6', P.gold700, 0.6);
  b += eye(-2.4, -17, P.stone700, false) + eye(2.4, -17, P.stone700, true);
  // pince-nez + chain
  b += `<g fill="none" stroke="${P.ink900}" stroke-width=".7"><circle cx="-2.4" cy="-16.8" r="1.9"/><circle cx="2.4" cy="-16.8" r="1.9"/></g>` + strokeP('M-0.6 -17.2H0.6', P.ink900, 0.7);
  b += strokeP('M4.2 -16.4Q5.2 -12 3 -9', P.gold700, 0.5, 'round', 0.9);
  return spr('head_goose_S', 18, 26, 9, 24, `<g transform="translate(9 24)">${b}</g>`);
}
function gooseBlink(dir: 'S' | 'E'): Sprite {
  if (dir === 'S') {
    let b = '';
    for (const x of [-2.4, 2.4]) b += `<ellipse cx="${x}" cy="-17" rx="1.6" ry="1.4" fill="${P.cream500}"/>` + strokeP(`M${x - 1.4} -16.9Q${x} -16.2 ${x + 1.4} -16.9`, P.stone700, 0.9);
    return spr('blink_goose_S', 18, 26, 9, 24, `<g transform="translate(9 24)">${b}</g>`);
  }
  const b = `<ellipse cx="3.4" cy="-18.2" rx="1.3" ry="1.2" fill="${P.cream500}"/>` + strokeP('M2.3 -18.1Q3.4 -17.5 4.5 -18.1', P.stone700, 0.9);
  return spr('blink_goose_E', 22, 26, 9, 24, `<g transform="translate(9 24)">${b}</g>`);
}
/** goose tail feathers (behind the coat) */
function gooseTail(dir: 'N' | 'E'): Sprite {
  const d = dir === 'N' ? 'M-4 0Q-5 5 0 8Q5 5 4 0Z' : 'M0 -2Q-6 -3 -8.6 1Q-6 3.2 0 2.4Z';
  return spr(`tail_goose_${dir}`, 32, 24, 16, 4, `<g transform="translate(16 4)">${shape(d, GOOSE_W, { s: 1.2, h: 0.7, lw: 1.3 })}${dir === 'N' ? strokeP('M-1.6 2V6M1.6 2V6', P.stone300, 0.7) : ''}</g>`);
}
/** orange webbed foot (replaces the shoe sprite for the goose) */
const footGoose = (): Sprite => spr('footGoose', 8, 4.6, 4, 2.2, shape('M0.4 3.6L2 0.6Q4 -0.2 6 0.6L7.6 3.6Q5.6 4.6 4 3.6Q2.4 4.6 0.4 3.6Z', T.gold, { s: 0.8, h: 0.5, lw: 1.1 }));

// ---------------------------------------------------------------- held items (anchor = grip point at the right paw)
const heldClipboard = (): Sprite => spr('held_clipboard', 10, 12, 1.5, 6,
  shape(rr(0, 0.5, 9.5, 11.5, 1.4), T.wood, { s: 1.2, h: 0.7, lw: 1.2 }) + `<rect x="1.6" y="2.6" width="6.3" height="8" rx=".6" fill="${P.cream300}"/>`
  + shape(rr(2.8, -0.6, 4, 2.6, 0.8), T.stone, { s: 0.6, h: 0.4, lw: 0.9 }) + strokeP('M2.8 5H7M2.8 7H6.4M2.8 9H5.6', P.ink500, 0.6)
  + strokeP('M5 8.4L6 9.4L7.8 7.2', P.mint700, 0.8));
const heldWhistle = (): Sprite => spr('held_whistle', 10, 11, 5, 0,
  strokeP('M1 0Q2.6 5 5 6.8Q7.4 5 9 0', P.coral700, 0.9) + shape(rr(2.6, 6.2, 5.6, 3.2, 1.4), T.gold, { s: 0.8, h: 0.5, lw: 1 }) + `<circle cx="7.4" cy="7.8" r=".9" fill="${P.wood900}"/>`);
const heldMop = (): Sprite => spr('held_mop', 9, 26, 3, 8,
  shape(rr(2, 0, 2.4, 20, 1.1), T.woodLight, { s: 0.6, h: 0.4, lw: 1 })
  + shape('M0 19.6H6.6L8.6 25.4Q4.6 26.6 3.2 25.6Q1.8 26.6 -1.6 25.4Z', T.cream, { s: 1, h: 0.6, lw: 1.1 }) + strokeP('M1 21.4L0.4 25M3.3 21.4V25.4M5.6 21.4L6.6 25', P.cream700, 0.6));
const heldHorn = (): Sprite => spr('held_horn', 12, 8, 1.5, 4.5,
  shape('M0 3.4H5L10.8 0.4Q12 4 10.8 7.6L5 4.8H0Z', T.gold, { s: 1, h: 0.6, lw: 1.1 }) + `<ellipse cx="11.2" cy="4" rx=".9" ry="3" fill="${P.gold700}"/>` + `<rect x="-0.6" y="3" width="2" height="2.2" rx=".6" fill="${P.wood900}"/>`);

// ================================================================ project props
/** 1 mattresses: same frame as bunkBed (32x64, anchor bottom-left) – thick mattress, quilted patchwork duvet, plump pillow */
function bunkBedPlus(): Sprite {
  let b = contactShadow(16, 58, 30, 0.2);
  b += shape(rr(2, 6, 28, 54, 3), T.woodDark, { s: 2 });
  b += shape(rr(3, 8, 26, 50, 4), T.cream, { s: 2, h: 1, lw: 1.5 });                       // thick mattress
  b += strokeP('M5 56.4H27', P.teal500, 1.4, 'butt', 0.9) + strokeP('M5 54.4H27', P.teal300, 1, 'butt', 0.8); // ticking edge
  b += shape(rr(3.5, 24, 25, 31, 4), T.teal, { s: 2.6, h: 1.3, lw: 1.5 });                  // puffy quilted duvet
  for (const [x, y] of [[4.5, 25], [16, 33], [4.5, 41], [16, 49]]) b += `<rect x="${x}" y="${y}" width="11.5" height="7.6" rx="2" fill="${P.teal300}" opacity=".7"/>`;
  b += strokeP('M4 32.8H28M4 40.8H28M4 48.8H28M16 25V54', P.cream500, 0.8, 'butt', 0.75);   // stitching
  b += shape(rr(4, 47, 24, 6, 2.6), T.gold, { s: 1.2, h: 0.6, lw: 1.2 });                    // folded throw at the foot
  b += shape(rr(4.5, 22, 23, 5, 2.4), T.cream, { s: 1.2, h: 0.8, lw: 1.3 });                // turned-down sheet
  b += shape(rr(5, 9.5, 22, 12, 5.5), T.cream, { s: 2, h: 1.2, lw: 1.5 });                  // plump pillow
  b += strokeP('M9 13Q16 11.6 23 13', P.cream300, 1.4, 'round', 0.9);
  b += shape(rr(1, 0, 30, 9, 2.5), T.wood, { s: 2 });
  b += `<circle cx="16" cy="4.5" r="2" fill="${P.gold500}" stroke="${P.wood900}" stroke-width=".8"/>`;     // brass knob
  b += shape(rr(1, 56, 30, 8, 2), T.wood, { s: 2 });
  return { name: 'bunkBedPlus', w: 32, h: 64, ax: 0, ay: 64, body: b };
}
/** 2 recipe book: open cookbook on a little stand (sits on the counter top) */
function cookbook(): Sprite {
  let b = shape(rr(4, 9, 10, 3, 1), T.woodDark, { s: 0.8, h: 0.5, lw: 1.1 });
  b += shape('M1 3Q5 1 9 3.4Q13 1 17 3V11Q13 9.4 9 11.4Q5 9.4 1 11Z', T.brickLight, { s: 1.2, h: 0.7, lw: 1.2 });
  b += `<path d="M2.4 3.6Q5.4 2.4 8.4 4.2V10Q5.4 8.6 2.4 9.6Z M9.6 4.2Q12.6 2.4 15.6 3.6V9.6Q12.6 8.6 9.6 10Z" fill="${P.cream300}"/>`;
  b += strokeP('M3.6 5.4H7.2M3.6 7H6.6M10.8 5.4H14.4M10.8 7H13.2', P.ink500, 0.6) + `<circle cx="13" cy="8.4" r=".9" fill="${P.coral500}"/>`;
  b += strokeP('M9 3.4V13.4', P.gold500, 1, 'butt');
  return { name: 'cookbook', w: 18, h: 14, ax: 9, ay: 13, body: b };
}
/** 3 Form 27-B: tray of forms + golden stamp for the booth counter */
function formTray(): Sprite {
  let b = shape(rr(0, 5, 14, 7, 1.5), T.wood, { s: 1, h: 0.6, lw: 1.2 });
  for (let i = 0; i < 3; i++) b += `<rect x="${1.6 + i * 0.5}" y="${2.6 + i * 1.2}" width="10.4" height="5" rx=".6" fill="${P.cream300}" stroke="${P.wood700}" stroke-width=".5"/><rect x="${1.6 + i * 0.5}" y="${2.6 + i * 1.2}" width="10.4" height="1.3" fill="${P.coral500}" opacity=".7"/>`;
  b += shape(rr(17, 7, 9, 5, 1.2), T.gold, { s: 1, h: 0.6, lw: 1.1 });                       // stamp base
  b += shape(rr(19.6, 0, 3.8, 7.4, 1.6), T.woodDark, { s: 0.8, h: 0.5, lw: 1.1 });            // handle
  b += shape(ell(21.5, 0.6, 2.8, 1.8), T.gold, { s: 0.6, h: 0.4, lw: 1 });
  return { name: 'formTray', w: 26, h: 13, ax: 13, ay: 12, body: b };
}
/** 5 bubble bath: one soap bubble (spawned rising from every shower) */
const bubble = (): Sprite => ({ name: 'bubble', w: 10, h: 10, ax: 5, ay: 5,
  body: `<circle cx="5" cy="5" r="4.3" fill="${P.teal300}" fill-opacity=".28" stroke="${P.teal300}" stroke-width="1.1"/><path d="M2.6 4Q3 2.4 4.6 2" stroke="${P.cream300}" stroke-width="1.1" fill="none" stroke-linecap="round"/><circle cx="6.8" cy="7" r=".7" fill="${P.cream300}" opacity=".8"/>` });
/** 6 assembly knitting: knit station with a little conveyor belt (same frame as knitStation, 32x30) */
function knitStationPro(): Sprite {
  let b = contactShadow(16, 29, 30, 0.2);
  b += shape(rr(3, 20, 4, 9, 1), T.woodDark, { s: 1, lw: 1.4 }) + shape(rr(25, 20, 4, 9, 1), T.woodDark, { s: 1, lw: 1.4 });
  b += shape(rr(1, 8, 30, 14, 2.5), T.wood, { s: 2, h: 1.2 });
  b += strokeP('M3 14.5H29', P.wood700, 0.8, 'butt', 0.6);
  // conveyor along the back of the table: frame, dark belt, rollers, a yarn ball riding on it
  b += shape(rr(-1, 0, 34, 8.4, 2), T.stoneDark, { s: 1.2, h: 0.6, lw: 1.3 });
  b += `<rect x="1" y="2" width="30" height="4.4" rx="1.4" fill="${P.ink900}"/>`;
  b += strokeP('M5 2.4V6M10 2.4V6M15 2.4V6M20 2.4V6M25 2.4V6', P.ink500, 0.8, 'butt', 0.8);
  b += shape(ell(0.8, 4.2, 2, 2), T.stoneLight, { s: 0.6, h: 0.3, lw: 1 }) + shape(ell(31.2, 4.2, 2, 2), T.stoneLight, { s: 0.6, h: 0.3, lw: 1 });
  b += shape(rr(18, 9, 10, 8, 2), T.gold, { s: 1.2, h: 0.6, lw: 1.2 }) + strokeP('M19 12h8M19 14.5h8', P.gold700, 0.8);
  b += shape(rr(4, 10, 11, 8, 2), T.coral, { s: 1.2, h: 0.6, lw: 1.2 }) + strokeP('M5 13h9M5 15.5h9', P.coral700, 0.8);
  b += strokeP('M13 9L17 16M17 9L14 16', P.stone700, 1.1);
  return { name: 'knitStationPro', w: 32, h: 30, ax: 0, ay: 30, body: b };
}
/** yarn ball riding a conveyor (animated) */
const yarnBall = (): Sprite => ({ name: 'yarnBall', w: 7, h: 7, ax: 3.5, ay: 6,
  body: shape(ell(3.5, 3.5, 3.2, 3.2), T.teal, { s: 1, h: 0.5, lw: 1 }) + strokeP('M1 2.6Q3.5 4.6 6 2.4M2 5.6Q3.6 3 2.4 0.8', P.teal300, 0.6) });
/** 7 speedy carts: the crate cart with racing stripes and a little spoiler */
function cartRacer(): Sprite {
  let b = contactShadow(22, 28, 42);
  b += shape(rr(36, -1, 8, 4, 1.2), T.ink, { s: 0.8, h: 0.4, lw: 1.2 }) + shape(rr(38.5, 2, 2.4, 5, 0.8), T.ink, { s: 0.5, lw: 1 }); // spoiler
  b += shape(rr(2, 6, 40, 16, 3), T.coral, { s: 2.5, h: 1.2 });
  b += `<rect x="3" y="12" width="38" height="2.2" fill="${P.cream300}"/><rect x="3" y="15.6" width="38" height="2.2" fill="${P.cream300}"/>`;
  b += shape(rr(5, 2, 34, 8, 2), T.woodLight, { s: 1.5, lw: 1.5 });
  b += strokeP('M-2 10H1M-3 14H0.6M-2 18H1', P.cream300, 1.2, 'round', 0.9);                       // speed lines
  b += shape(ell(10, 23, 5, 5), T.ink, { s: 1.5, lw: 1.5 }) + shape(ell(34, 23, 5, 5), T.ink, { s: 1.5, lw: 1.5 });
  b += `<circle cx="10" cy="23" r="1.8" fill="${P.gold500}"/><circle cx="34" cy="23" r="1.8" fill="${P.gold500}"/>`;
  return { name: 'cartRacer', w: 44, h: 29, ax: 22, ay: 28, body: b };
}
/** 8 night school: desk with a brass desk lamp (same frame as desk, 32x28) */
function deskLamp(): Sprite {
  let b = contactShadow(16, 27, 28, 0.2);
  b += shape(rr(4, 16, 3, 10, 1), T.ink, { s: 0.8, lw: 1.2 }) + shape(rr(25, 16, 3, 10, 1), T.ink, { s: 0.8, lw: 1.2 });
  b += shape(rr(2, 6, 28, 12, 2.5), T.woodLight, { s: 1.8, h: 1 });
  b += shape(rr(5, 8, 11, 7, 1), T.cream, { s: 1, h: 0, lw: 1 }) + strokeP('M7 10.5h7M7 12.5h5', P.ink500, 0.8);
  b += `<ellipse cx="22.5" cy="11" rx="6.5" ry="3.6" fill="${P.gold500}" opacity=".35"/>`;           // pool of light
  b += shape(ell(24, 12.4, 3.4, 1.6), T.gold, { s: 0.6, h: 0.4, lw: 1 });                              // lamp base
  b += strokeP('M24 12L22 4.6L18.6 2.6', P.gold700, 1.3);
  b += shape('M14.6 1.2L20.4 -1.6L22 3.4L16.4 5.2Z', T.mint, { s: 1, h: 0.6, lw: 1.1 });              // green banker's shade
  b += shape(rr(9, 19, 14, 8, 2), T.brick, { s: 1.2, h: 0.8, lw: 1.3 });
  return { name: 'deskLamp', w: 32, h: 28, ax: 0, ay: 28, body: b, pad: 4 };
}
/** 9 tetherball: pole + rope ring (ball is its own sprite, swung in code) */
function tetherPole(): Sprite {
  let b = contactShadow(7, 49, 18, 0.24);
  b += shape(rr(4, 44, 6, 6, 1.6), T.stoneDark, { s: 1, h: 0.5, lw: 1.2 });
  b += shape(rr(5.6, 3, 2.8, 43, 1.2), T.stoneLight, { s: 0.8, h: 0.5, lw: 1.1 });
  b += shape(ell(7, 3, 2.6, 2.6), T.coral, { s: 0.8, h: 0.5, lw: 1.1 });
  b += strokeP('M5.6 20H8.4M5.6 22H8.4', P.coral500, 1, 'butt');
  return { name: 'tetherPole', w: 14, h: 51, ax: 7, ay: 49, body: b };
}
const tetherBall = (): Sprite => ({ name: 'tetherBall', w: 12, h: 12, ax: 6, ay: 6,
  body: shape(ell(6, 6, 5.2, 5.2), T.gold, { s: 1.6, h: 0.8, lw: 1.3 }) + strokeP('M1.4 5Q6 8 10.6 5M6 1V11', P.cream300, 0.9, 'round', 0.9) });
/** rope of the tetherball: 1 x 1 white line, stretched + rotated in code (tinted) */
const rope = (): Sprite => ({ name: 'rope', w: 2, h: 16, ax: 1, ay: 0, pad: 1, body: `<rect x=".3" y="0" width="1.4" height="16" rx=".7" fill="#ffffff"/>` });
/** 10 suggestion box on a post at the Warden's Office + heart pops */
function suggestionBox(): Sprite {
  let b = contactShadow(9, 33, 14, 0.22);
  b += shape(rr(7, 14, 4, 19, 1), T.woodDark, { s: 0.8, h: 0.5, lw: 1.2 });
  b += shape(rr(0, 4, 18, 13, 2), T.teal, { s: 1.6, h: 0.9, lw: 1.4 });
  b += shape('M-1 5L9 -0.6L19 5Z', T.tealDark, { s: 1, h: 0.6, lw: 1.3 });
  b += `<rect x="4.6" y="7" width="8.8" height="1.8" rx=".9" fill="${P.ink900}"/>`;
  b += shape('M9 15.4C6 13 4.4 11.6 5 10.2Q6 8.6 9 10.4Q12 8.6 13 10.2Q13.6 11.6 9 15.4Z', T.coral, { s: 0.6, h: 0.4, lw: 0.9 });
  b += `<path d="M10.2 3.4L13.4 1.6L14 4.4Z" fill="${P.cream300}" stroke="${P.wood700}" stroke-width=".5"/>`; // a note being posted
  return { name: 'suggestionBox', w: 18, h: 34, ax: 9, ay: 33, body: b };
}
const heart = (): Sprite => ({ name: 'heart', w: 12, h: 11, ax: 6, ay: 6,
  body: shape('M6 10.4C2 7.6 0 5.6 0.6 3.2Q1.6 0.2 6 2.6Q10.4 0.2 11.4 3.2Q12 5.6 6 10.4Z', T.coral, { s: 1, h: 0.6, lw: 1.1 }) });
/** 11 squeaky mops: mop bucket with the mop in it */
function mopBucket(): Sprite {
  let b = contactShadow(9, 20, 18, 0.22);
  b += shape(rr(13, 0, 2.4, 14, 1), T.woodLight, { s: 0.6, h: 0.4, lw: 1 });
  b += shape('M2 8H16L14.6 20H3.4Z', T.gold, { s: 1.4, h: 0.8, lw: 1.3 });
  b += shape(ell(9, 8, 7, 2.2), T.teal, { s: 0.6, h: 0.3, lw: 1.1 });
  b += shape('M10.8 6.8Q13 4.6 16.8 6.6L15.4 8.6Q13 7.6 11.4 8.6Z', T.cream, { s: 0.6, h: 0.4, lw: 1 });
  b += strokeP('M3.4 12H14.6', P.gold700, 0.8) + shape(ell(17.6, 2.4, 1.8, 1.8), T.cream, { s: 0.4, h: 0.2, lw: 0.8 });
  return { name: 'mopBucket', w: 20, h: 21, ax: 9, ay: 20, body: b };
}
/** 12 bigger ferry: same footprint and anchor as the ferry, wider hull, upper deck with a second funnel and railings */
function ferryBig(): Sprite {
  const W = 88, H = 176;
  let b = `<ellipse cx="${W / 2 + 4}" cy="${H - 18}" rx="${W / 2}" ry="14" fill="${P.ink900}" opacity=".25"/>`;
  b += shape('M44 2C68 14 84 42 84 74V158Q84 172 70 172H18Q4 172 4 158V74C4 42 20 14 44 2Z', T.cream, { s: 4, h: 2 });
  b += shape('M44 12C61 22 74 46 74 74V154Q74 162 66 162H22Q14 162 14 154V74C14 46 27 22 44 12Z', T.woodLight, { s: 3, h: 1.5 });
  for (let y = 60; y < 158; y += 9) b += strokeP(`M16 ${y}H72`, P.wood500, 0.8, 'butt', 0.6);
  b += shape(rr(4, 154, 80, 14, 4), T.coral, { s: 2, h: 0 });
  b += strokeP('M8 160H80', P.cream300, 1.6, 'butt', 0.85);
  b += shape(rr(18, 62, 52, 64, 5), T.teal, { s: 3, h: 1.5 });                     // lower cabin roof
  b += shape(rr(24, 72, 40, 40, 4), T.cream, { s: 2.5, h: 1.2 });                   // upper deck
  b += strokeP('M26 76H62M26 108H62M26 76V108M62 76V108', P.wood700, 1.2, 'round', 0.8); // railing
  for (const x of [30, 38, 46, 54]) b += `<rect x="${x}" y="88" width="5" height="6" rx="1" fill="${P.teal700}"/>`;
  b += shape(rr(30, 46, 12, 18, 3), T.coral, { s: 2 }) + `<rect x="30" y="46" width="12" height="4" rx="2" fill="${P.ink900}"/>`;
  b += shape(rr(46, 50, 10, 15, 3), T.coral, { s: 2 }) + `<rect x="46" y="50" width="10" height="3.6" rx="1.8" fill="${P.ink900}"/>`;
  b += shape(ell(44, 138, 7, 7), T.gold, { s: 1.5 }) + shape(ell(44, 138, 3, 3), T.stoneDark, { s: 1, lw: 1 });
  b += strokeP('M8 100v48M80 100v48', P.cream300, 2, 'round', 0.9);
  for (const y of [24, 34, 44]) b += `<path d="M${44 - (y - 12) * 0.55} ${y}h${(y - 12) * 1.1}" stroke="${P.gold500}" stroke-width="1.2" opacity=".9"/>`; // bunting at the bow
  return { name: 'ferryBig', w: W, h: H, ax: W / 2, ay: H, body: b };
}

// ================================================================ world: VIP board, site 2, brawl, parcels, feedback
/** dock teaser board for the morning VIP: big notice board with a "wanted"-style poster of the Cat Burglar */
function vipBoard(): Sprite {
  let b = contactShadow(22, 51, 40, 0.24);
  b += shape(rr(6, 26, 4, 25, 1), T.woodDark, { s: 1, lw: 1.4 }) + shape(rr(34, 26, 4, 25, 1), T.woodDark, { s: 1, lw: 1.4 });
  b += shape(rr(0, 2, 44, 30, 2.5), T.wood, { s: 2.4, h: 1.2 });
  b += shape('M-2 3L22 -3L46 3Z', T.woodDark, { s: 1, h: 0.6, lw: 1.4 });
  b += `<rect x="3.5" y="5.5" width="37" height="23" rx="1.5" fill="${P.wood700}"/>`;
  // poster: cream paper, cat silhouette with the top hat, gold frame line
  b += `<g transform="rotate(-3 22 17)"><rect x="12" y="6" width="20" height="21" rx="1" fill="${P.cream300}" stroke="${P.wood700}" stroke-width=".8"/>`
    + `<rect x="13.6" y="7.6" width="16.8" height="17.8" fill="none" stroke="${P.gold500}" stroke-width=".9"/>`
    + `<path d="M15.6 25Q15.6 18.6 19 17.4L17.6 13.4L20.6 15.6Q22 15 23.4 15.6L26.4 13.4L25 17.4Q28.4 18.6 28.4 25Z" fill="${P.ink700}"/>`
    + `<path d="M18.6 16.4Q22 15.4 25.4 16.4L25.2 17.6Q22 16.8 18.8 17.6Z" fill="${P.ink900}"/>`
    + `<rect x="18.4" y="8.8" width="7.2" height="5.6" rx=".8" fill="${P.brick700}"/><rect x="16.6" y="13.6" width="10.8" height="1.6" rx=".6" fill="${P.brick700}"/><rect x="18.4" y="12.2" width="7.2" height="1.1" fill="${P.gold500}"/>`
    + `<circle cx="20.4" cy="18.2" r=".7" fill="${P.gold500}"/><circle cx="23.6" cy="18.2" r=".7" fill="${P.gold500}"/></g>`;
  b += `<circle cx="22" cy="6.4" r="1.2" fill="${P.coral500}" stroke="${P.brick900}" stroke-width=".5"/>`;     // pin
  return { name: 'vipBoard', w: 44, h: 52, ax: 22, ay: 51, body: b };
}
/** pinned tag on the board: rising sun = "tomorrow" (teaser) */
const vipTagSun = (): Sprite => ({ name: 'vipTagSun', w: 14, h: 12, ax: 7, ay: 6,
  body: shape(rr(0, 1, 14, 11, 1.5), T.cream, { s: 0.8, h: 0.5, lw: 1 }) + shape('M3 9A4 4 0 0 1 11 9Z', T.gold, { s: 0.6, h: 0.4, lw: 0.9 }) + strokeP('M7 2.6V3.8M2.8 4.4L3.6 5.2M11.2 4.4L10.4 5.2M1.6 9H12.4', P.gold700, 0.8) });
/** pinned tag on the board: ferry = "on the next ferry" (ready) */
const vipTagFerry = (): Sprite => ({ name: 'vipTagFerry', w: 14, h: 12, ax: 7, ay: 6,
  body: shape(rr(0, 1, 14, 11, 1.5), T.mint, { s: 0.8, h: 0.5, lw: 1 }) + shape('M2 6.6H12L10.8 9.6H3.2Z', T.cream, { s: 0.6, h: 0.3, lw: 0.8 }) + shape(rr(5, 3.6, 4, 3, 0.6), T.coral, { s: 0.4, lw: 0.7 }) + strokeP('M1.6 10.8Q4 10 7 10.8T12.4 10.8', P.cream300, 0.8) });

/** site 2 "Gullrock Lighthouse": distant cliff island with a lighthouse (drawn semi-transparent → silhouette) */
function lighthouseIsle(): Sprite {
  const W = 120, H = 132;
  let b = `<ellipse cx="60" cy="122" rx="58" ry="10" fill="${P.teal700}" opacity=".6"/>`;
  b += shape('M4 122Q8 98 24 92Q30 70 52 68Q60 52 74 60Q96 62 104 88Q116 96 116 122Z', T.stoneDark, { s: 5, h: 2 });   // cliff
  b += shape('M14 104Q30 96 44 100Q64 92 84 100Q100 96 108 106L110 112Q60 102 10 112Z', T.sageDark, { s: 2, h: 1, lw: 1.5 }); // grass cap
  b += strokeP('M8 118Q34 112 60 116T114 116', P.cream300, 1.6, 'round', 0.7);                                              // surf
  // lighthouse tower: cream/coral bands
  b += shape('M58 66L62 20H76L80 66Z', T.cream, { s: 3, h: 1.4 });
  b += `<path d="M59.3 52L60.4 40H77.6L78.7 52Z M61.3 30L61.9 24H76.1L76.7 30Z" fill="${P.coral500}"/>`;
  b += shape(rr(59, 12, 20, 10, 2), T.ink, { s: 1.5, h: 0.8, lw: 1.4 });              // lantern room
  b += `<rect x="62" y="14" width="14" height="6" rx="1" fill="${P.ink900}"/>`;
  b += shape('M57 13L69 2L81 13Z', T.brick, { s: 1.5, h: 0.8, lw: 1.4 });
  b += shape(rr(66, 56, 6, 10, 2), T.woodDark, { s: 1, lw: 1.2 });                     // door
  b += shape(rr(28, 84, 18, 12, 1.5), T.cream, { s: 1.6, h: 0.8, lw: 1.3 }) + shape('M26 85L37 77L48 85Z', T.brick, { s: 1, h: 0.6, lw: 1.3 }); // keeper's cottage
  return { name: 'lighthouseIsle', w: W, h: H, ax: 60, ay: 122, body: b, pad: 4 };
}
/** lit lantern window (laid over the dark lantern room once site 2 is unlocked) */
const lanternLit = (): Sprite => ({ name: 'lanternLit', w: 14, h: 6, ax: 7, ay: 3,
  body: `<rect x="0" y="0" width="14" height="6" rx="1" fill="${P.gold500}"/><rect x="1.4" y="1" width="4" height="2" rx=".6" fill="#fff2c4"/>` });
/** lighthouse beam (additive light sprite, rotated in code) */
const beam = (): Sprite => ({ name: 'beam', w: 120, h: 40, ax: 0, ay: 20, pad: 0,
  body: `<defs><linearGradient id="bm" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff2c4" stop-opacity=".9"/><stop offset="1" stop-color="${P.gold500}" stop-opacity="0"/></linearGradient></defs><path d="M0 18L120 0V40L0 22Z" fill="url(#bm)"/>` });

/** food fight: cartoon brawl cloud with little stars (no limbs, no weapons, PEGI 12) */
function brawlCloud(): Sprite {
  let b = shape('M6 26C0 24 0 15 6 14C5 7 13 3 18 7C21 1 31 1 33 7C39 4 46 9 43 15C49 17 48 26 41 27Q24 31 6 26Z', T.cream, { s: 3, h: 1.6, lw: 1.6 });
  b += strokeP('M12 18Q16 13 20 18T28 18M24 23Q28 19 33 23', P.cream700, 1.4, 'round', 0.9);
  const star = (x: number, y: number, r: number) => {
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) { const rr2 = i % 2 ? r * 0.45 : r, a = -Math.PI / 2 + (i * Math.PI) / 5; pts.push(`${(x + Math.cos(a) * rr2).toFixed(2)} ${(y + Math.sin(a) * rr2).toFixed(2)}`); }
    return shape(`M${pts.join('L')}Z`, T.gold, { s: 0.8, h: 0.5, lw: 1 });
  };
  b += star(8, 6, 4) + star(40, 5, 3.4) + star(45, 22, 3) + star(2, 21, 2.8);
  b += `<circle cx="16" cy="10" r="1.6" fill="${P.stone500}"/><circle cx="34" cy="13" r="1.3" fill="${P.stone500}"/>`;
  return { name: 'brawlCloud', w: 48, h: 30, ax: 24, ay: 26, body: b };
}

/** parcel boundary: rope line between short stakes with coral survey flags (horizontal 32 u, vertical 32 u) */
const parcelLineH = (): Sprite => ({ name: 'parcelLineH', w: 32, h: 14, ax: 0, ay: 13,
  body: strokeP('M3 5.6Q16 8.6 29 5.6', P.cream700, 1.4) + strokeP('M3 5.6Q16 8.6 29 5.6', P.wood700, 0.5)
    + shape(rr(1, 3, 4, 10, 1.2), T.woodLight, { s: 0.8, h: 0.5, lw: 1.1 }) + `<path d="M13 7.4L19 7.4L16 11.6Z" fill="${P.coral500}" stroke="${P.brick900}" stroke-width=".6"/>` });
const parcelLineV = (): Sprite => ({ name: 'parcelLineV', w: 8, h: 34, ax: 4, ay: 33,
  body: strokeP('M4 4V31', P.cream700, 1.4) + strokeP('M4 4V31', P.wood700, 0.5)
    + shape(rr(2, 23, 4, 10, 1.2), T.woodLight, { s: 0.8, h: 0.5, lw: 1.1 }) + `<path d="M4 10L7.6 12.4L4 14.8Z" fill="${P.coral500}" stroke="${P.brick900}" stroke-width=".6"/>` });
/** "for sale" sign of a buyable parcel (coin + arrow, no text) */
function saleSign(): Sprite {
  let b = contactShadow(13, 35, 20);
  b += shape(rr(11, 14, 4, 21, 1), T.woodDark, { s: 1, lw: 1.4 });
  b += shape(rr(0, 1, 26, 16, 2), T.woodLight, { s: 1.6, h: 0.9, lw: 1.4 });
  b += shape(ell(8, 9, 5, 5), T.gold, { s: 1.2, h: 0.7, lw: 1.2 }) + `<rect x="6.9" y="6.4" width="2.2" height="5.2" rx=".8" fill="${P.gold700}"/>`;
  b += shape('M14.4 7.6H18.6V5L23.4 9L18.6 13V10.4H14.4Z', T.mint, { s: 0.8, h: 0.5, lw: 1.1 });
  return { name: 'saleSign', w: 26, h: 36, ax: 13, ay: 35, body: b };
}

/** inspection approval seal (stamp moment): coral ring with a check, slightly rough edge */
function stampSeal(): Sprite {
  const pts: string[] = [];
  for (let i = 0; i < 24; i++) { const r = i % 2 ? 13.6 : 15, a = (i * Math.PI) / 12; pts.push(`${(16 + Math.cos(a) * r).toFixed(2)} ${(16 + Math.sin(a) * r).toFixed(2)}`); }
  let b = shape(`M${pts.join('L')}Z`, T.coral, { s: 2, h: 1, lw: 1.6 });
  b += `<circle cx="16" cy="16" r="10.4" fill="none" stroke="${P.cream300}" stroke-width="1.4"/>`;
  b += strokeP('M10.6 16.4L14.6 20.2L21.8 11.8', P.cream300, 2.8);
  return { name: 'stampSeal', w: 32, h: 32, ax: 16, ay: 16, body: b };
}
/** golden key (keys earned, perks) */
function fxKey(): Sprite {
  let b = shape(ell(7, 8, 6, 6), T.gold, { s: 1.6, h: 0.9, lw: 1.4 });
  b += `<circle cx="7" cy="8" r="2.4" fill="${P.wood700}"/>`;
  b += shape('M12 6.6H27V9.6H25V13H22V9.6H20V12H17.6V9.6H12Z', T.gold, { s: 1.2, h: 0.7, lw: 1.3 });
  return { name: 'fxKey', w: 28, h: 15, ax: 14, ay: 8, body: b };
}

// ================================================================ HUD icons (public/ui, 24x24)
const icon = (name: string, body: string): Sprite => ({ name, w: 24, h: 24, ax: 0, ay: 0, body, pad: 1 });
export function m5Icons(): Sprite[] {
  return scopedIds(3e6, () => [
    icon('key', shape(ell(7.5, 12, 5.8, 5.8), T.gold, { s: 2, h: 1 }) + `<circle cx="7.5" cy="12" r="2.2" fill="${P.wood700}"/>`
      + shape('M12.4 10.4H22.2V13.6H20.6V17.4H17.6V13.6H16V16.2H13.8V13.6H12.4Z', T.gold, { s: 1.4, h: 0.8, lw: 1.4 })),
    icon('mail', shape(rr(2, 5, 20, 14, 2), T.cream, { s: 2, h: 1 }) + strokeP('M3 6.4L12 13L21 6.4', P.wood700, 1.6)
      + shape(ell(17.5, 15.8, 3.6, 3.6), T.coral, { s: 1, h: 0.6, lw: 1.2 }) + strokeP('M16.3 15.8H18.7', P.cream300, 1.2)),
    icon('inspect', shape(rr(3.5, 4, 13, 17, 2), T.wood, { s: 1.6, h: 0.8 }) + `<rect x="5.6" y="6.6" width="8.8" height="12.2" rx=".8" fill="${P.cream300}"/>`
      + shape(rr(7, 2.4, 6, 3.6, 1.2), T.stone, { s: 0.8, lw: 1.2 }) + strokeP('M7.2 10.4L8.6 11.8L11 9.2M7.2 15.2H12.6', P.ink700, 1.2)
      + shape(ell(17.8, 17.2, 4.6, 4.6), T.coral, { s: 1.2, h: 0.6, lw: 1.3 }) + strokeP('M15.6 17.4L17.2 19L20 15.6', P.cream300, 1.4)),
    icon('lead', shape(ell(11, 14.4, 7.6, 7), T.wood, { s: 2, h: 1 }) + shape(ell(11, 17.4, 3.8, 2.6), T.woodLight, { s: 0.8, h: 0.4, lw: 1.1 })
      + `<ellipse cx="11" cy="15.8" rx="1.4" ry="1" fill="${P.ink900}"/><rect x="9.8" y="18" width="2.4" height="2" rx=".5" fill="${P.cream300}"/>`
      + `<circle cx="8" cy="12.6" r="1" fill="${P.ink900}"/><circle cx="14" cy="12.6" r="1" fill="${P.ink900}"/>`
      + shape('M4 9.6Q4 3.4 11 3.4Q18 3.4 18 9.6Z', T.mint, { s: 1.4, h: 0.8, lw: 1.3 }) + shape(rr(15.6, 12, 7, 9, 1.2), T.cream, { s: 0.8, h: 0.4, lw: 1.1 }) + strokeP('M17.2 15H21M17.2 17.4H20', P.ink500, 0.9)),
    icon('perk', shape('M12 2.4L20.4 7.2V16.8L12 21.6L3.6 16.8V7.2Z', T.teal, { s: 2, h: 1 })
      + shape('M12 6.4L13.7 10.2L17.8 10.6L14.7 13.4L15.6 17.4L12 15.3L8.4 17.4L9.3 13.4L6.2 10.6L10.3 10.2Z', T.gold, { s: 1.2, h: 0.7, lw: 1.2 })),
    icon('transfer', shape(rr(2, 13, 9, 8, 1.2), T.brickLight, { s: 1.2, lw: 1.3 }) + shape('M1 13.6L6.5 9L12 13.6Z', T.stoneLight, { s: 0.8, lw: 1.2 })
      + shape('M15.4 21V10H22V21Z', T.cream, { s: 1.2, lw: 1.3 }) + shape('M14.6 10.6L18.7 4L22.8 10.6Z', T.coral, { s: 0.8, lw: 1.2 })
      + strokeP('M4 7Q9 1.6 15.6 4.6', P.wood900, 1.8) + strokeP('M13.2 2.2L15.8 4.6L12.8 6.6', P.wood900, 1.8)),
    icon('timer', shape(ell(12, 13.4, 8.8, 8.8), T.cream, { s: 2.4, h: 1.2 }) + shape(rr(9.6, 1.6, 4.8, 3, 1), T.stone, { s: 0.8, lw: 1.2 })
      + strokeP('M18.6 5.4L20.4 7.2', P.stone700, 1.8) + `<path d="M12 13.4V6.6A6.8 6.8 0 0 1 18.4 11.2Z" fill="${P.mint500}" opacity=".85"/>` + strokeP('M12 13.4V7.6M12 13.4L15.4 15.2', P.ink900, 1.8)),
  ]);
}

// ================================================================ registry
export function m5Sprites(): Sprite[] {
  return scopedIds(2e6, () => [
    catHead('S'), catHead('N'), catHead('E'), catBlink('S'), catBlink('E'), catTail('N'), catTail('E'), topHat('S'), topHat('N'), topHat('E'),
    gooseHead('S'), gooseHead('N'), gooseHead('E'), gooseBlink('S'), gooseBlink('E'), gooseTail('N'), gooseTail('E'), footGoose(),
    heldClipboard(), heldWhistle(), heldMop(), heldHorn(),
    bunkBedPlus(), cookbook(), formTray(), bubble(), knitStationPro(), yarnBall(), cartRacer(), deskLamp(), tetherPole(), tetherBall(), rope(),
    suggestionBox(), heart(), mopBucket(), ferryBig(),
    vipBoard(), vipTagSun(), vipTagFerry(), lighthouseIsle(), lanternLit(), beam(), brawlCloud(),
    parcelLineH(), parcelLineV(), saleSign(), stampSeal(), fxKey(),
  ]);
}
/** sprite names that are new in M5 (contact sheet, tests) */
export const M5_SPRITES = () => m5Sprites().map(s => s.name);
