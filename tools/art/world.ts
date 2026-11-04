/** World sprites: tiles, walls, furniture, props. 1 tile = 32 units. */
import { P } from '../../art/palette';
import { T, shape, strokeP, rr, ell, contactShadow, rng, type Sprite, type Tone } from './kit';

const S = 32;
const tile = (name: string, body: string): Sprite => ({ name, w: S, h: S, ax: 0, ay: 0, body, pad: 0 });

// ---------------------------------------------------------------- floors
function grass(v: number): Sprite {
  const r = rng(100 + v);
  let b = `<rect width="32" height="32" fill="${P.sage500}"/>`;
  // soft patches of light / dark grass (kept off the edges for seamless tiling)
  for (let i = 0; i < 2; i++) {
    const x = 6 + r() * 20, y = 6 + r() * 20;
    b += `<ellipse cx="${x}" cy="${y}" rx="${4 + r() * 4}" ry="${2.5 + r() * 2}" fill="${r() < 0.5 ? P.sage300 : P.sage700}" opacity="${0.25 + r() * 0.15}"/>`;
  }
  for (let i = 0; i < 4 + v; i++) {
    const x = 4 + r() * 24, y = 5 + r() * 23;
    b += strokeP(`M${x - 1.6} ${y}L${x} ${y - 2.6}L${x + 1.6} ${y}`, i % 3 ? P.sage700 : P.sage300, 1, 'round', 0.8);
  }
  if (v === 3) { // tiny flowers
    for (let i = 0; i < 2; i++) { const x = 6 + r() * 20, y = 6 + r() * 20; b += `<circle cx="${x}" cy="${y}" r="1.3" fill="${i ? P.cream500 : P.gold500}" stroke="${P.sage700}" stroke-width=".6"/>`; }
  }
  return tile(`grass${v}`, b);
}

function paving(v: number): Sprite {
  const r = rng(200 + v);
  let b = `<rect width="32" height="32" fill="${P.stone500}"/>`;
  const stones = [[1, 1, 14, 9], [17, 1, 14, 9], [1, 12, 9, 8], [12, 12, 10, 8], [24, 12, 7, 8], [1, 22, 15, 9], [18, 22, 13, 9]];
  for (const [x, y, w, h] of stones) {
    const tone = r() < 0.33 ? T.stoneLight : { ...T.stoneLight, base: P.cream700, hi: P.cream300 };
    b += shape(rr(x + 0.5, y + 0.5, w - 1, h - 1, 2.5), tone, { s: 1.5, h: 1, lw: 0, noLine: true });
  }
  void v;
  return tile(`paving${v}`, b);
}

function sand(v: number): Sprite {
  const r = rng(300 + v);
  let b = `<rect width="32" height="32" fill="${P.wood300}"/>`;
  for (let i = 0; i < 10; i++) b += `<circle cx="${2 + r() * 28}" cy="${2 + r() * 28}" r="${0.5 + r() * 0.7}" fill="${r() < 0.5 ? P.wood500 : P.cream500}" opacity=".7"/>`;
  b += `<ellipse cx="${8 + r() * 16}" cy="${8 + r() * 16}" rx="7" ry="3" fill="${P.cream500}" opacity=".25"/>`;
  return tile(`sand${v}`, b);
}

function planks(v: number, tone: Tone = T.wood): Sprite {
  const r = rng(400 + v);
  let b = `<rect width="32" height="32" fill="${tone.sh}"/>`;
  for (let i = 0; i < 4; i++) {
    const y = i * 8;
    const off = ((i * 13 + v * 7) % 24) + 4;
    const light = (i + v) % 2 === 0;
    const pt = { ...tone, base: light ? tone.base : mix(tone.base, tone.sh, 0.25) };
    b += shape(rr(0.5, y + 0.6, off - 1, 6.8, 1), pt, { s: 1.2, h: 0.8, lw: 0, noLine: true });
    b += shape(rr(off + 0.5, y + 0.6, 31 - off, 6.8, 1), pt, { s: 1.2, h: 0.8, lw: 0, noLine: true });
    if (r() < 0.5) b += `<circle cx="${off + 3}" cy="${y + 4}" r=".7" fill="${tone.line}" opacity=".5"/>`;
    if (r() < 0.3) b += strokeP(`M${4 + r() * 10} ${y + 3.5}h${4 + r() * 6}`, tone.sh, 0.6, 'round', 0.6);
  }
  return tile(`planks${v}`, b);
}

function concrete(v: number): Sprite {
  const r = rng(500 + v);
  let b = `<rect width="32" height="32" fill="${P.stone300}"/>`;
  b += `<rect x="0.5" y="0.5" width="31" height="31" fill="none" stroke="${P.stone500}" stroke-width="1"/>`;
  for (let i = 0; i < 5; i++) b += `<circle cx="${3 + r() * 26}" cy="${3 + r() * 26}" r="${0.4 + r() * 0.8}" fill="${P.stone500}" opacity=".6"/>`;
  if (v === 1) b += strokeP('M6 22l5-3 4 2', P.stone500, 0.7, 'round', 0.7);
  return tile(`concrete${v}`, b);
}

function bathTiles(v: number): Sprite {
  let b = `<rect width="32" height="32" fill="${P.cream700}"/>`;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const c = (x + y + v) % 2 === 0 ? P.cream300 : P.teal300;
    b += `<rect x="${x * 8 + 0.6}" y="${y * 8 + 0.6}" width="6.8" height="6.8" rx="1" fill="${c}"/>`;
  }
  return tile(`bath${v}`, b);
}

function carpet(v: number): Sprite {
  let b = `<rect width="32" height="32" fill="${P.brick700}"/>`;
  b += `<rect x="2" y="2" width="28" height="28" fill="none" stroke="${P.brick500}" stroke-width="1" opacity=".6"/>`;
  b += `<path d="M16 8l8 8-8 8-8-8z" fill="none" stroke="${P.gold700}" stroke-width="1" opacity="${v ? 0.5 : 0.8}"/>`;
  return tile(`carpet${v}`, b);
}

function water(v: number): Sprite {
  const r = rng(600 + v);
  let b = `<rect width="32" height="32" fill="${P.teal500}"/>`;
  for (let i = 0; i < 2; i++) b += `<ellipse cx="${6 + r() * 20}" cy="${6 + r() * 20}" rx="${6 + r() * 5}" ry="${2 + r()}" fill="${P.teal700}" opacity=".22"/>`;
  return tile(`water${v}`, b);
}

// ---------------------------------------------------------------- water fx
const wave = (): Sprite => ({ name: 'wave', w: 18, h: 5, ax: 9, ay: 3, body: strokeP('M1 3.5q4-3 8 0t8 0', P.teal300, 1.6), pad: 1 });
const foam = (): Sprite => ({ name: 'foam', w: 32, h: 8, ax: 0, ay: 0, pad: 0,
  body: `<path d="M0 0H32V3.5Q28 6 24 4T16 4.5T8 4T0 4.5Z" fill="${P.cream300}" opacity=".85"/><path d="M2 6.5q3 1.2 6 0M18 6.6q3 1 6 0" stroke="${P.cream300}" stroke-width="1" fill="none" opacity=".6" stroke-linecap="round"/>` });
const shore = (): Sprite => ({ name: 'shore', w: 32, h: 10, ax: 0, ay: 0, pad: 0,
  body: `<path d="M0 0H32V6Q24 9 16 7T0 7Z" fill="${P.wood500}"/><path d="M0 0H32V3Q24 5.5 16 4T0 4Z" fill="${P.wood300}"/>` });

// ---------------------------------------------------------------- walls (thickness 8, height 16)
const brickFront = (w: number) => {
  let b = shape(rr(0, 8, w, 16, 1), T.brickLight, { s: 2, h: 0, noHi: true, lw: 2 });
  for (let row = 0; row < 3; row++) {
    const y = 8 + 5 + row * 4.5;
    b += strokeP(`M1.5 ${y}H${w - 1.5}`, P.brick700, 0.8, 'butt', 0.55);
    const off = row % 2 ? 4 : 0;
    for (let x = 6 + off; x < w - 2; x += 8) b += strokeP(`M${x} ${y - 4.2}V${y}`, P.brick700, 0.8, 'butt', 0.45);
  }
  // AO at foot
  b += `<rect x="1" y="21" width="${w - 2}" height="2" fill="${P.brick900}" opacity=".35"/>`;
  return b;
};
const cap = (x: number, y: number, w: number, h: number) => shape(rr(x, y, w, h, 1.5), T.stoneLight, { s: 1.5, h: 1, lw: 2 });

const wallH = (): Sprite => ({ name: 'wallH', w: 32, h: 24, ax: 0, ay: 24, pad: 1, body: brickFront(32) + cap(-1, 0, 34, 9) });
const wallV = (): Sprite => ({ name: 'wallV', w: 8, h: 32, ax: 4, ay: 0, pad: 1, body: cap(0, -1, 8, 34) });
const wallPost = (): Sprite => ({ name: 'wallPost', w: 10, h: 26, ax: 5, ay: 25, pad: 1,
  body: shape(rr(0.5, 9, 9, 16, 1.5), T.brickLight, { s: 2, h: 0, noHi: true }) + `<rect x="1.5" y="22" width="7" height="2" fill="${P.brick900}" opacity=".35"/>` + cap(0, 0, 10, 10) });
const doorH = (): Sprite => ({ name: 'doorH', w: 32, h: 24, ax: 0, ay: 24, pad: 1,
  body:
    // two jambs + lintel, open doorway
    shape(rr(0, 8, 5, 16, 1), T.brickLight, { s: 1.5, h: 0, noHi: true }) + shape(rr(27, 8, 5, 16, 1), T.brickLight, { s: 1.5, h: 0, noHi: true })
    + shape(rr(4, 6, 24, 5, 1.5), T.wood, { s: 1.5, h: 1 })
    + cap(-1, 0, 7, 9) + cap(26, 0, 7, 9) });
const doorMat = (): Sprite => ({ name: 'doorMat', w: 22, h: 8, ax: 11, ay: 4, pad: 1, body: shape(rr(0, 0, 22, 8, 2), T.sageDark, { s: 1, h: 0.8, lw: 1.5 }) + strokeP('M4 4H18', P.sage500, 1, 'round', 0.7) });

// ---------------------------------------------------------------- fences & markers
const fenceH = (): Sprite => ({ name: 'fenceH', w: 32, h: 16, ax: 0, ay: 16, pad: 1,
  body: shape(rr(0, 5, 32, 3, 1), T.woodLight, { s: 1, h: 0.6, lw: 1.5 }) + shape(rr(0, 10, 32, 3, 1), T.woodLight, { s: 1, h: 0.6, lw: 1.5 })
    + shape(rr(1, 1, 4, 15, 1.5), T.wood, { s: 1.2, h: 0.8, lw: 1.5 }) + shape(rr(17, 1, 4, 15, 1.5), T.wood, { s: 1.2, h: 0.8, lw: 1.5 }) });
const fenceV = (): Sprite => ({ name: 'fenceV', w: 6, h: 40, ax: 3, ay: 40, pad: 1,
  body: shape(rr(1, 0, 4, 32, 1), T.woodLight, { s: 1, h: 0.6, lw: 1.5 }) + shape(rr(0, 26, 6, 14, 1.5), T.wood, { s: 1.2, h: 0.8, lw: 1.5 }) });

// ---------------------------------------------------------------- furniture
function bunkBed(): Sprite {
  // 1 x 2 tiles (N-S), headboard north
  let b = contactShadow(16, 58, 30, 0.2);
  b += shape(rr(2, 6, 28, 54, 3), T.woodDark, { s: 2 });                 // frame
  b += shape(rr(4, 10, 24, 46, 3), T.stoneLight, { s: 2, h: 1, lw: 1.5 }); // mattress
  b += shape(rr(4, 26, 24, 30, 3), T.teal, { s: 2.5, h: 1.2, lw: 1.5 });     // blanket
  b += strokeP('M5 33H27M5 40H27', P.teal300, 1.2, 'butt', 0.8);
  b += shape(rr(7, 12, 18, 9, 4), T.cream, { s: 1.5, h: 1, lw: 1.5 });      // pillow
  b += shape(rr(1, 0, 30, 9, 2.5), T.wood, { s: 2 });                        // headboard
  b += shape(rr(1, 56, 30, 8, 2), T.wood, { s: 2 });                         // footboard front
  return { name: 'bunkBed', w: 32, h: 64, ax: 0, ay: 64, body: b };
}
function benchTable(): Sprite {
  // stage 1: rough wooden bench table, 2 x 1.5 tiles
  let b = contactShadow(32, 44, 62);
  b += shape(rr(2, 2, 60, 7, 2), T.woodDark, { s: 1.5 });     // back bench
  b += shape(rr(0, 12, 64, 20, 3), T.wood, { s: 2.5, h: 1.5 }); // table top
  b += strokeP('M2 18.5H62M2 25H62', P.wood700, 0.9, 'butt', 0.6);
  b += shape(rr(4, 32, 6, 6, 1), T.woodDark, { s: 1 }) + shape(rr(54, 32, 6, 6, 1), T.woodDark, { s: 1 }); // legs
  b += shape(rr(2, 38, 60, 7, 2), T.woodDark, { s: 1.5 });    // front bench
  b += plate(16, 20) + plate(46, 21) + cup(31, 18);
  return { name: 'benchTable', w: 64, h: 46, ax: 0, ay: 46, body: b };
}
function bistroTable(): Sprite {
  // stage 2: round table with checkered cloth, two chairs
  let b = contactShadow(24, 42, 44);
  b += chair(4, 12) + chair(34, 12);
  b += shape(ell(24, 22, 17, 11), T.cream, { s: 2.5, h: 1.5 });
  const c = 'M12 16h4v4h-4zM20 16h4v4h-4zM28 16h4v4h-4zM16 20h4v4h-4zM24 20h4v4h-4zM32 20h3v4h-3zM12 24h4v3h-4zM20 24h4v4h-4zM28 24h4v4h-4z';
  b += `<path d="${c}" fill="${P.coral500}" opacity=".55"/>`;
  b += shape(rr(21, 32, 6, 8, 1.5), T.ink, { s: 1 });
  b += plate(18, 20) + plate(30, 22) + `<circle cx="24" cy="16" r="2.4" fill="${P.gold500}" stroke="${P.wood900}" stroke-width="1"/>`;
  return { name: 'bistroTable', w: 48, h: 44, ax: 0, ay: 44, body: b };
}
const chair = (x: number, y: number) => shape(rr(x, y, 10, 18, 2.5), T.wood, { s: 1.5, h: 1, lw: 1.5 }) + shape(rr(x, y, 10, 5, 2), T.woodDark, { s: 1, lw: 1.5 });
const plate = (x: number, y: number) => `<ellipse cx="${x}" cy="${y}" rx="4.6" ry="3" fill="${P.cream300}" stroke="${P.stone700}" stroke-width="1"/><ellipse cx="${x - 0.5}" cy="${y - 0.3}" rx="2.2" ry="1.3" fill="${P.wood300}"/>`;
const cup = (x: number, y: number) => `<rect x="${x - 2}" y="${y - 3}" width="4" height="5" rx="1" fill="${P.cream300}" stroke="${P.stone700}" stroke-width="1"/>`;

function counter(stage: number): Sprite {
  // serving counter 2 tiles wide with pot(s)
  let b = contactShadow(32, 40, 64, 0.18);
  b += shape(rr(0, 20, 64, 20, 2), stage >= 2 ? T.brick : T.woodDark, { s: 2 });               // front
  b += shape(rr(-1, 10, 66, 13, 2.5), stage >= 2 ? T.stoneLight : T.wood, { s: 2, h: 1.2 });  // top
  if (stage >= 2) b += strokeP('M8 26v10M24 26v10M40 26v10M56 26v10', P.brick900, 1, 'butt', 0.35);
  b += pot(11, 13, stage >= 2) + pot(53, 13, stage >= 2);
  b += `<rect x="27" y="17" width="10" height="4" rx="1.5" fill="${P.cream300}" stroke="${P.stone700}" stroke-width="1"/>`;
  return { name: `counter${stage}`, w: 64, h: 40, ax: 0, ay: 40, body: b };
}
const pot = (x: number, y: number, copper: boolean) =>
  shape(`M${x - 8} ${y - 6}H${x + 8}V${y + 1}Q${x + 8} ${y + 5} ${x} ${y + 5}Q${x - 8} ${y + 5} ${x - 8} ${y + 1}Z`, copper ? { ...T.coral, base: '#c46a3e', hi: '#e39a62', sh: P.brick700 } : T.stone, { s: 2, h: 1 })
  + `<ellipse cx="${x}" cy="${y - 6}" rx="8" ry="2.6" fill="${P.stone900}"/><ellipse cx="${x}" cy="${y - 5.6}" rx="6.5" ry="1.8" fill="${P.gold500}" opacity=".7"/>`;

function showerStall(): Sprite {
  let b = contactShadow(16, 44, 30, 0.15);
  b += shape(rr(1, 4, 30, 38, 2.5), T.teal, { s: 2 });
  b += shape(rr(4, 8, 24, 30, 2), T.stoneLight, { s: 1.5, h: 1, lw: 1.5 });
  b += `<circle cx="16" cy="23" r="2" fill="${P.stone700}"/>`;
  b += shape(rr(12, 0, 8, 6, 2), T.stone, { s: 1, lw: 1.5 });
  b += strokeP('M2 42H30', P.teal900, 2);
  return { name: 'shower', w: 32, h: 44, ax: 0, ay: 44, body: b };
}

function crate(): Sprite {
  let b = contactShadow(12, 22, 24, 0.2);
  b += shape(rr(1, 9, 22, 13, 1.5), T.wood, { s: 2 });
  b += shape(rr(1, 1, 22, 10, 1.5), T.woodLight, { s: 1.5, h: 1 });
  b += strokeP('M3 15.5H21M12 10V21', P.wood700, 1, 'butt', 0.7);
  b += `<rect x="8" y="3.5" width="8" height="5" rx="1" fill="${P.coral500}" opacity=".8"/>`;
  return { name: 'crate', w: 24, h: 23, ax: 12, ay: 22, body: b };
}
function bollard(): Sprite {
  return { name: 'bollard', w: 10, h: 12, ax: 5, ay: 11, body: contactShadow(5, 11, 10) + shape(rr(1, 3, 8, 8, 2), T.stoneDark, { s: 1.5 }) + shape(ell(5, 3.5, 4, 2.2), T.stone, { s: 1, h: 0.7, lw: 1.5 }) };
}

function lamp(): Sprite {
  let b = contactShadow(8, 52, 12);
  b += shape(rr(6, 14, 4, 38, 1.5), T.ink, { s: 1, h: 0.8, lw: 1.5 });
  b += shape(rr(3, 48, 10, 4, 1.5), T.ink, { s: 1, lw: 1.5 });
  b += shape('M2 8L8 2L14 8L12.5 15H3.5Z', T.ink, { s: 1.5, h: 1 });
  b += `<path d="M4.5 9H11.5L10.8 13.5H5.2Z" fill="${P.gold500}"/>`;
  return { name: 'lamp', w: 16, h: 53, ax: 8, ay: 52, body: b };
}
const lightGlow = (): Sprite => ({ name: 'glow', w: 128, h: 128, ax: 64, ay: 64, pad: 0,
  body: `<defs><radialGradient id="g"><stop offset="0" stop-color="#fff2c4" stop-opacity=".95"/><stop offset=".35" stop-color="${P.gold500}" stop-opacity=".45"/><stop offset="1" stop-color="${P.gold500}" stop-opacity="0"/></radialGradient></defs><circle cx="64" cy="64" r="64" fill="url(#g)"/>` });
const firefly = (): Sprite => ({ name: 'firefly', w: 8, h: 8, ax: 4, ay: 4, pad: 0,
  body: `<defs><radialGradient id="f"><stop offset="0" stop-color="#fff2c4"/><stop offset=".5" stop-color="${P.gold500}" stop-opacity=".6"/><stop offset="1" stop-color="${P.gold500}" stop-opacity="0"/></radialGradient></defs><circle cx="4" cy="4" r="4" fill="url(#f)"/>` });

function tree(v: number): Sprite {
  let b = contactShadow(28, 66, 46, 0.25);
  b += shape(rr(23, 40, 10, 26, 3), T.woodDark, { s: 2 });
  if (v === 0) {
    b += shape('M28 4C44 4 54 14 54 28C54 40 46 48 36 49C33 53 23 53 20 49C10 48 2 40 2 28C2 14 12 4 28 4Z', T.sage, { s: 5, h: 2.2 });
    b += `<path d="M14 20q6-6 14-6" stroke="${P.sage300}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"/>`;
    b += `<path d="M38 36q5-3 7-8M18 40q4 2 9 1" stroke="${P.sage700}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".8"/>`;
  } else {
    b += shape('M28 2L50 30H40L52 46H4L16 30H6Z', T.sageDark, { s: 4, h: 2 });
    b += strokeP('M18 26L28 12', P.sage500, 1.8, 'round', 0.9);
  }
  return { name: `tree${v}`, w: 56, h: 68, ax: 28, ay: 66, body: b };
}
function bush(): Sprite {
  return { name: 'bush', w: 30, h: 20, ax: 15, ay: 18, body: contactShadow(15, 18, 28) + shape('M4 16C0 10 4 4 10 5C12 1 20 1 22 5C28 4 31 11 27 16Z', T.sage, { s: 3, h: 1.6 }) };
}
function flowerBed(): Sprite {
  let b = contactShadow(16, 22, 32, 0.18);
  b += shape(rr(1, 6, 30, 16, 3), T.woodDark, { s: 2 });
  b += shape(rr(3, 6, 26, 10, 3), T.sageDark, { s: 1.5, lw: 1.5 });
  const fl = [[8, 9, P.coral500], [14, 7, P.gold500], [20, 10, P.cream300], [25, 8, P.coral500], [11, 12, P.cream300], [18, 13, P.gold500]] as const;
  for (const [x, y, c] of fl) b += `<circle cx="${x}" cy="${y}" r="2.2" fill="${c}" stroke="${P.wood900}" stroke-width=".8"/>`;
  return { name: 'flowerBed', w: 32, h: 23, ax: 16, ay: 22, body: b };
}
function bench(): Sprite {
  let b = contactShadow(20, 20, 40, 0.2);
  b += shape(rr(4, 14, 4, 6, 1), T.ink, { s: 1, lw: 1.5 }) + shape(rr(32, 14, 4, 6, 1), T.ink, { s: 1, lw: 1.5 });
  b += shape(rr(1, 1, 38, 6, 2), T.wood, { s: 1.5, h: 0.8 });
  b += shape(rr(1, 8, 38, 7, 2), T.woodLight, { s: 1.5, h: 0.8 });
  return { name: 'bench', w: 40, h: 21, ax: 20, ay: 20, body: b };
}
function rock(): Sprite {
  return { name: 'rock', w: 26, h: 16, ax: 13, ay: 14, body: contactShadow(13, 14, 24) + shape('M2 13C1 7 6 3 11 3C14 0 22 2 23 7C26 9 25 14 22 14Z', T.stone, { s: 3, h: 1.5 }) };
}

// ---------------------------------------------------------------- dock & ferry
const dockPlank = (v: number): Sprite => ({ ...planks(v, T.woodLight), name: `dock${v}` });
function ferry(): Sprite {
  // 2.5 tiles wide, 5 tiles long, bow north; seen from above
  const W = 80, H = 168;
  let b = `<ellipse cx="${W / 2 + 4}" cy="${H - 18}" rx="${W / 2}" ry="14" fill="${P.ink900}" opacity=".25"/>`;
  b += shape(`M40 2C62 14 76 40 76 70V150Q76 164 62 164H18Q4 164 4 150V70C4 40 18 14 40 2Z`, T.cream, { s: 4, h: 2 });   // hull top (deck rim)
  b += shape(`M40 12C56 22 66 44 66 70V146Q66 154 58 154H22Q14 154 14 146V70C14 44 24 22 40 12Z`, T.woodLight, { s: 3, h: 1.5 }); // deck
  for (let y = 60; y < 150; y += 9) b += strokeP(`M16 ${y}H64`, P.wood500, 0.8, 'butt', 0.6);
  b += shape(rr(4, 146, 72, 14, 4), T.coral, { s: 2, h: 0 });          // stern band
  b += shape(rr(20, 70, 40, 44, 4), T.teal, { s: 3, h: 1.5 });          // cabin roof
  b += shape(rr(24, 74, 32, 12, 3), T.tealDark, { s: 1.5, lw: 1.5 });
  b += shape(rr(34, 52, 12, 18, 3), T.coral, { s: 2 });                 // funnel
  b += `<rect x="34" y="52" width="12" height="4" rx="2" fill="${P.ink900}"/>`;
  b += shape(ell(40, 128, 7, 7), T.gold, { s: 1.5 });                    // horn
  b += shape(ell(40, 128, 3, 3), T.stoneDark, { s: 1, lw: 1 });
  b += strokeP('M8 100v40M72 100v40', P.cream300, 2, 'round', 0.9);
  return { name: 'ferry', w: W, h: H, ax: W / 2, ay: H, body: b };
}

// ---------------------------------------------------------------- buildings
function office(): Sprite {
  // 3x3 tile footprint house with pitched roof (roof 0..60, front wall 60..96)
  const W = 96, H = 108;
  let b = `<rect x="6" y="94" width="88" height="12" rx="6" fill="${P.ink900}" opacity=".22"/>`;
  b += shape(rr(4, 56, 88, 46, 2), T.cream, { s: 3 });                               // front wall
  b += shape(rr(10, 66, 18, 16, 2), T.tealDark, { s: 1.5, lw: 1.5 }) + strokeP('M19 66v16M10 74h18', P.cream500, 1.2);  // window
  b += shape(rr(68, 66, 18, 16, 2), T.tealDark, { s: 1.5, lw: 1.5 }) + strokeP('M77 66v16M68 74h18', P.cream500, 1.2);
  b += shape(rr(38, 66, 20, 36, 2), T.woodDark, { s: 2 });                           // door
  b += `<circle cx="53" cy="85" r="1.6" fill="${P.gold500}"/>`;
  b += shape('M0 60L10 6H86L96 60Z', T.brick, { s: 4, h: 2 });                        // roof
  for (let y = 16; y < 58; y += 9) b += strokeP(`M${4 + (58 - y) * 0.18} ${y}H${92 - (58 - y) * 0.18}`, P.brick900, 1, 'butt', 0.4);
  b += shape(rr(8, 2, 80, 8, 3), T.brickLight, { s: 1.5, h: 1 });                   // ridge
  b += shape(rr(60, -6, 12, 16, 2), T.stone, { s: 1.5 });                            // chimney
  // clipboard emblem
  b += shape(rr(40, 30, 16, 20, 2), T.woodLight, { s: 1.5, lw: 1.5 }) + `<rect x="43" y="34" width="10" height="13" fill="${P.cream300}"/><rect x="44" y="28" width="8" height="4" rx="1" fill="${P.stone500}" stroke="${P.stone900}" stroke-width="1"/>` + strokeP('M45 38h6M45 41h6M45 44h4', P.ink700, 1);
  return { name: 'office', w: W, h: H, ax: 0, ay: H - 6, body: b, pad: 8 };
}

function gate(): Sprite {
  // parole gate arch spanning 2 tiles (64) + booth
  const W = 72, H = 84;
  let b = `<ellipse cx="38" cy="80" rx="36" ry="6" fill="${P.ink900}" opacity=".22"/>`;
  b += shape(rr(2, 28, 12, 52, 2), T.brickLight, { s: 2 }) + shape(rr(58, 28, 12, 52, 2), T.brickLight, { s: 2 });
  b += shape('M0 30Q36 -6 72 30V38Q36 6 0 38Z', T.wood, { s: 2.5, h: 1.5 });
  b += shape(ell(36, 14, 11, 11), T.gold, { s: 2, h: 1.2 });
  // open padlock symbol (no text)
  b += shape(rr(31, 13, 10, 8, 1.5), T.stoneDark, { s: 1, lw: 1.2 }) + strokeP('M33 13V9.5a3.5 3.5 0 0 1 7 0', P.stone900, 1.6);
  b += shape(rr(0, 24, 16, 6, 2), T.stoneLight, { s: 1, lw: 1.5 }) + shape(rr(56, 24, 16, 6, 2), T.stoneLight, { s: 1, lw: 1.5 });
  // bunting
  b += strokeP('M14 40Q36 52 58 40', P.wood700, 1);
  const flags = [[19, 43, P.coral500], [27, 46, P.gold500], [36, 47, P.mint500], [45, 46, P.coral500], [53, 43, P.gold500]] as const;
  for (const [x, y, c] of flags) b += `<path d="M${x - 3} ${y - 1}L${x + 3} ${y - 1}L${x} ${y + 5}Z" fill="${c}" stroke="${P.wood900}" stroke-width=".8"/>`;
  return { name: 'gate', w: W, h: H, ax: 0, ay: 80, body: b };
}
function stampDesk(): Sprite {
  let b = contactShadow(18, 30, 34, 0.2);
  b += shape(rr(1, 14, 34, 16, 2), T.woodDark, { s: 2 });
  b += shape(rr(0, 6, 36, 10, 2), T.wood, { s: 1.5, h: 1 });
  b += `<rect x="5" y="7" width="10" height="7" rx="1" fill="${P.cream300}" stroke="${P.stone700}" stroke-width=".8"/>`;
  b += shape(rr(22, 0, 6, 8, 2), T.woodDark, { s: 1, lw: 1.5 }) + shape(rr(19, 7, 12, 4, 1.5), T.coral, { s: 1, lw: 1.5 });
  return { name: 'stampDesk', w: 36, h: 31, ax: 18, ay: 30, body: b };
}
function cart(): Sprite {
  let b = contactShadow(22, 28, 42);
  b += shape(rr(2, 6, 40, 16, 3), T.gold, { s: 2.5, h: 1.2 });
  b += shape(rr(5, 2, 34, 8, 2), T.woodLight, { s: 1.5, lw: 1.5 });
  b += shape(ell(10, 23, 5, 5), T.ink, { s: 1.5, lw: 1.5 }) + shape(ell(34, 23, 5, 5), T.ink, { s: 1.5, lw: 1.5 });
  b += `<circle cx="10" cy="23" r="1.6" fill="${P.stone300}"/><circle cx="34" cy="23" r="1.6" fill="${P.stone300}"/>`;
  return { name: 'cart', w: 44, h: 29, ax: 22, ay: 28, body: b };
}
const sign = (): Sprite => ({ name: 'boardSign', w: 30, h: 34, ax: 15, ay: 33,
  body: contactShadow(15, 33, 20) + shape(rr(13, 14, 4, 20, 1), T.woodDark, { s: 1, lw: 1.5 }) + shape(rr(1, 1, 28, 17, 2), T.wood, { s: 2, h: 1 }) + `<rect x="5" y="4" width="20" height="11" rx="1" fill="${P.cream300}"/>` + strokeP('M8 8h14M8 11.5h9', P.ink500, 1.2) });

// ---------------------------------------------------------------- particles & fx
const puff = (): Sprite => ({ name: 'puff', w: 20, h: 16, ax: 10, ay: 8, body: shape('M3 12C0 9 3 5 6 6C7 2 13 2 14 5C18 4 20 9 17 12Z', T.stoneLight, { s: 2, h: 1, lw: 1.5 }) });
const steam = (): Sprite => ({ name: 'steam', w: 12, h: 12, ax: 6, ay: 6, body: `<circle cx="6" cy="6" r="5" fill="${P.cream300}" opacity=".8"/>` });
const leaf = (): Sprite => ({ name: 'leaf', w: 8, h: 6, ax: 4, ay: 3, body: `<path d="M1 3Q4 -1 7 3Q4 7 1 3Z" fill="${P.sage300}" stroke="${P.sage700}" stroke-width=".8"/>` });
const confetti = (): Sprite => ({ name: 'confetti', w: 6, h: 4, ax: 3, ay: 2, body: `<rect width="6" height="4" rx="1" fill="#ffffff"/>` }); // tinted at runtime
const coin = (): Sprite => ({ name: 'coin', w: 14, h: 14, ax: 7, ay: 7, body: shape(ell(7, 7, 6, 6), T.gold, { s: 2, h: 1.2, lw: 1.5 }) + `<rect x="5.5" y="4" width="3" height="6" rx="1" fill="${P.gold700}"/>` });
const gull = (): Sprite => ({ name: 'gull', w: 20, h: 8, ax: 10, ay: 4, body: strokeP('M1 6Q5 0 10 5Q15 0 19 6', P.cream300, 2.2) + strokeP('M1 6Q5 0 10 5Q15 0 19 6', P.stone700, 0.8) });
const cloudShadow = (): Sprite => ({ name: 'cloudShadow', w: 160, h: 80, ax: 80, ay: 40, pad: 0,
  body: `<defs><filter id="b"><feGaussianBlur stdDeviation="10"/></filter></defs><ellipse cx="80" cy="40" rx="62" ry="22" fill="${P.ink900}" opacity=".12" filter="url(#b)"/>` });

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map(s => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}


// ---------------------------------------------------------------- side-on parole gate (road runs W→E through it)
function gatePillar(): Sprite {
  let b = contactShadow(9, 54, 18, 0.25);
  b += shape(rr(2, 14, 14, 40, 2), T.brickLight, { s: 2.5, h: 0, noHi: true });
  for (let y = 22; y < 52; y += 6) b += strokeP(`M3.5 ${y}H14.5`, P.brick700, 0.8, 'butt', 0.5);
  b += `<rect x="3" y="50" width="12" height="3" fill="${P.brick900}" opacity=".35"/>`;
  b += shape(rr(0, 8, 18, 9, 2), T.stoneLight, { s: 1.5, h: 1 });
  b += shape(ell(9, 5, 5, 5), T.gold, { s: 1.5, h: 1, lw: 1.6 });
  return { name: 'gatePillar', w: 18, h: 55, ax: 9, ay: 54, body: b };
}
function gateBeam(): Sprite {
  // vertical (N–S) beam strip seen from above, spans 84 units between the pillar tops; hanging emblem + bunting
  const L = 84;
  let b = shape(rr(3, 0, 12, L, 3), T.wood, { s: 2, h: 1.2 });
  b += strokeP(`M9 4V${L - 4}`, P.wood700, 0.8, 'butt', 0.5);
  const flags = [[16, P.coral500], [28, P.gold500], [56, P.mint500], [68, P.coral500]] as const;
  for (const [y, c] of flags) b += `<path d="M13 ${y - 4}L21 ${y}L13 ${y + 4}Z" fill="${c}" stroke="${P.wood900}" stroke-width=".9"/>`;
  b += strokeP(`M9 ${L / 2 - 6}V${L / 2 + 2}`, P.wood900, 1.4);
  b += shape(ell(9, L / 2 + 13, 13, 13), T.gold, { s: 2.5, h: 1.4 });
  b += shape(ell(9, L / 2 + 13, 9, 9), { ...T.gold, base: '#f0c457' }, { s: 1.5, h: 0, lw: 1.2 });
  b += shape(rr(4.5, L / 2 + 12, 9, 8, 1.5), T.stoneDark, { s: 1, lw: 1.2 }) + strokeP(`M6.5 ${L / 2 + 12}V${L / 2 + 8.5}a2.6 2.6 0 0 1 5.2 0`, P.stone900, 1.6);
  return { name: 'gateBeam', w: 24, h: L + 28, ax: 9, ay: L, body: b };
}
function booth(): Sprite {
  // clerk booth: small cabin with window counter (1.5 x 1.5 tiles)
  const W = 52, H = 62;
  let b = `<rect x="2" y="54" width="50" height="9" rx="4" fill="${P.ink900}" opacity=".22"/>`;
  b += shape(rr(3, 22, 46, 36, 2), T.cream, { s: 2.5 });
  b += shape(rr(9, 28, 34, 14, 2), T.tealDark, { s: 1.5, lw: 1.5 });
  b += shape(rr(6, 40, 40, 5, 1.5), T.wood, { s: 1, h: 0.8, lw: 1.5 });
  b += `<rect x="12" y="38" width="9" height="3" rx=".8" fill="${P.cream300}"/>` + shape(rr(30, 35, 5, 5, 1), T.coral, { s: 0.8, lw: 1 });
  b += shape('M0 24L6 4H46L52 24Z', T.teal, { s: 3, h: 1.6 });
  b += strokeP('M5 14H47', P.teal700, 1, 'butt', 0.6);
  return { name: 'booth', w: W, h: H, ax: 0, ay: H - 4, body: b, pad: 4 };
}

export function worldSprites(): Sprite[] {
  return [
    ...[0, 1, 2, 3].map(grass), ...[0, 1, 2].map(paving), ...[0, 1].map(sand), ...[0, 1, 2].map(v => planks(v)),
    ...[0, 1].map(concrete), ...[0, 1].map(bathTiles), ...[0, 1].map(carpet), ...[0, 1].map(water), ...[0, 1, 2].map(dockPlank),
    wave(), foam(), shore(),
    wallH(), wallV(), wallPost(), doorH(), doorMat(), fenceH(), fenceV(),
    bunkBed(), benchTable(), bistroTable(), counter(1), counter(2), showerStall(), crate(), bollard(), lamp(), lightGlow(), firefly(),
    tree(0), tree(1), bush(), flowerBed(), bench(), rock(), ferry(), office(), gate(), gatePillar(), gateBeam(), booth(), stampDesk(), cart(), sign(),
    puff(), steam(), leaf(), confetti(), coin(), gull(), cloudShadow(),
  ];
}
