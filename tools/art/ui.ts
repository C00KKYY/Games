/** UI icons (24x24 grid, STYLE_GUIDE §7) – written as standalone SVG files into public/ui/. */
import { P } from '../../art/palette';
import { T, shape, flat, strokeP, rr, ell, type Sprite } from './kit';

const icon = (name: string, body: string, w = 24, h = 24): Sprite => ({ name, w, h, ax: 0, ay: 0, body, pad: 1 });

export function uiIcons(): Sprite[] {
  return [
    icon('coin', shape(ell(12, 12, 9.5, 9.5), T.gold, { s: 3, h: 1.6 }) + shape(ell(12, 12, 6, 6), { ...T.gold, base: '#f0c457' }, { s: 1.5, h: 0, lw: 1.2 }) + `<rect x="10.4" y="8" width="3.2" height="8" rx="1.2" fill="${P.gold700}"/>`),
    icon('star', shape('M12 2.5L14.8 8.6L21.4 9.3L16.4 13.7L17.9 20.3L12 16.9L6.1 20.3L7.6 13.7L2.6 9.3L9.2 8.6Z', T.gold, { s: 2.5, h: 1.4 })),
    icon('starEmpty', shape('M12 2.5L14.8 8.6L21.4 9.3L16.4 13.7L17.9 20.3L12 16.9L6.1 20.3L7.6 13.7L2.6 9.3L9.2 8.6Z', T.cream, { s: 2, h: 1 })),
    icon('clock', shape(ell(12, 12, 9.5, 9.5), T.cream, { s: 2.5, h: 1.2 }) + strokeP('M12 6.5V12L15.5 14', P.ink900, 2)),
    icon('sun', shape(ell(12, 12, 5.5, 5.5), T.gold, { s: 1.6, h: 1 }) + strokeP('M12 1.8V4.4M12 19.6V22.2M1.8 12H4.4M19.6 12H22.2M4.8 4.8L6.6 6.6M17.4 17.4L19.2 19.2M4.8 19.2L6.6 17.4M17.4 6.6L19.2 4.8', P.gold700, 2)),
    icon('moon', shape('M15 3A9 9 0 1 0 21 15A7 7 0 0 1 15 3Z', T.stoneLight, { s: 2, h: 1.2 })),
    icon('mood', shape(ell(12, 12, 9.5, 9.5), T.mint, { s: 2.5, h: 1.3 }) + `<circle cx="8.8" cy="10" r="1.3" fill="${P.sage900}"/><circle cx="15.2" cy="10" r="1.3" fill="${P.sage900}"/>` + strokeP('M8 14.2Q12 17.6 16 14.2', P.sage900, 1.8)),
    icon('play', shape('M7 4.5L19 12L7 19.5Z', T.cream, { s: 2, h: 1 })),
    icon('fast', shape('M3.5 5L12 12L3.5 19Z', T.cream, { s: 1.6, h: 0.8 }) + shape('M12 5L20.5 12L12 19Z', T.cream, { s: 1.6, h: 0.8 })),
    icon('pause', shape(rr(5, 4.5, 5, 15, 1.5), T.cream, { s: 1.5, h: 0.8 }) + shape(rr(14, 4.5, 5, 15, 1.5), T.cream, { s: 1.5, h: 0.8 })),
    icon('gear', shape('M10.2 2H13.8L14.4 4.8L16.8 5.8L19.2 4.2L21.8 6.8L20.2 9.2L21.2 11.6L24 12.2V12.2L21.2 12.8L20.2 15.2L21.8 17.6L19.2 20.2L16.8 18.6L14.4 19.6L13.8 22.4H10.2L9.6 19.6L7.2 18.6L4.8 20.2L2.2 17.6L3.8 15.2L2.8 12.8L0 12.2V12.2L2.8 11.6L3.8 9.2L2.2 6.8L4.8 4.2L7.2 5.8L9.6 4.8Z', T.stoneLight, { s: 2.5, h: 1.2 }) + shape(ell(12, 12.2, 3.6, 3.6), T.stoneDark, { s: 1, lw: 1.4 })),
    icon('help', shape(ell(12, 12, 9.5, 9.5), T.teal, { s: 2.5, h: 1.2 }) + strokeP('M9 9.4Q9 6.2 12 6.2Q15.2 6.2 15.2 9Q15.2 11 12.2 12V13.8', P.cream300, 2.2) + `<circle cx="12.2" cy="17.4" r="1.5" fill="${P.cream300}"/>`),
    icon('clipboard', shape(rr(4, 3, 16, 20, 2.5), T.wood, { s: 2, h: 1 }) + `<rect x="6.5" y="6" width="11" height="14.5" rx="1" fill="${P.cream300}"/>` + shape(rr(8.5, 1.5, 7, 4.5, 1.5), T.stone, { s: 1, lw: 1.3 }) + strokeP('M8.6 10.5L10 12L12.6 9M14 11H16M8.6 15.5H16', P.ink700, 1.4)),
    // flow-bar stages
    icon('ferry', shape('M2.5 13H21.5L19 19.5H5Z', T.cream, { s: 2, h: 1 }) + shape(rr(7, 7, 10, 6.5, 1.5), T.teal, { s: 1.5, lw: 1.4 }) + shape(rr(13.5, 3.5, 3, 4.5, 1), T.coral, { s: 1, lw: 1.2 }) + strokeP('M2 21.5Q6 20 10 21.5T18 21.5T22 21', P.teal500, 1.6)),
    icon('bed', shape(rr(2.5, 9, 19, 9, 2), T.teal, { s: 2, h: 1 }) + shape(rr(3.5, 7, 7, 5, 2), T.cream, { s: 1, lw: 1.3 }) + shape(rr(2, 4, 3.5, 17, 1.2), T.wood, { s: 1, lw: 1.3 }) + shape(rr(19.5, 12, 2.5, 9, 1), T.wood, { s: 1, lw: 1.3 })),
    icon('meal', `<ellipse cx="12" cy="14" rx="10" ry="6.6" fill="${P.cream300}" stroke="${P.stone700}" stroke-width="1.6"/><ellipse cx="12" cy="13.4" rx="6" ry="3.6" fill="${P.wood300}" stroke="${P.wood700}" stroke-width="1.2"/>` + strokeP('M12 3.5Q10.5 5.5 12 7.2M15.5 3.2Q14 5.2 15.5 7', P.stone500, 1.4)),
    icon('shower', shape('M12 2Q19 10 19 14Q19 21 12 21Q5 21 5 14Q5 10 12 2Z', T.teal, { s: 2.5, h: 1.3 }) + strokeP('M8.6 14.5Q9 17.5 12 18', P.teal300, 1.6)),
    icon('yarn', shape(ell(11, 13, 8.5, 8.5), T.coral, { s: 2.5, h: 1.3 }) + strokeP('M4.5 10Q11 14 17.5 9.5M4 14.5Q11 18.5 18.5 14M8 5.5Q12 12 10.5 21', P.coral700, 1.2) + strokeP('M15 20L22 4M18 21L22.5 9', P.wood700, 1.6)),
    icon('book', shape('M2.5 5Q7 3.5 12 6Q17 3.5 21.5 5V19.5Q17 18 12 20.5Q7 18 2.5 19.5Z', T.brickLight, { s: 2, h: 1 }) + strokeP('M12 6V20.5', P.brick900, 1.6) + strokeP('M5 8.5Q8 7.6 10 8.8M5 12Q8 11 10 12.2M14 8.8Q16 7.6 19 8.5', P.cream300, 1.2)),
    icon('gate', shape(rr(3, 7, 4, 15, 1), T.brickLight, { s: 1.5, lw: 1.4 }) + shape(rr(17, 7, 4, 15, 1), T.brickLight, { s: 1.5, lw: 1.4 }) + shape('M2 8Q12 0 22 8V10.5Q12 3 2 10.5Z', T.wood, { s: 1.5, lw: 1.4 }) + shape(ell(12, 4.6, 3, 3), T.gold, { s: 1, lw: 1.2 })),
    icon('crate', shape(rr(3, 9, 18, 12, 1.5), T.wood, { s: 2 }) + shape(rr(3, 4, 18, 6.5, 1.5), T.woodLight, { s: 1.5, h: 1 }) + strokeP('M5 15H19M12 10V20.5', P.wood700, 1.2)),
    // build bar
    icon('rooms', shape(rr(2.5, 9, 19, 12, 1.5), T.brickLight, { s: 2 }) + shape(rr(1.5, 6, 21, 4.5, 1.5), T.stoneLight, { s: 1.2, lw: 1.4 }) + strokeP('M3.5 13.5H20.5M3.5 17.5H20.5M8 10.5V13.5M15 13.5V17.5M10 17.5V20.5', P.brick900, 1, 'butt', 0.6)),
    icon('staff', shape(ell(12, 13.5, 7.5, 7), T.woodDark, { s: 2, h: 1 }) + shape('M4 9Q4 3 12 3Q20 3 20 9Z', T.ink, { s: 1.5, h: 1 }) + shape(rr(3, 8, 18, 3, 1.2), T.ink, { s: 1, lw: 1.3 }) + `<circle cx="12" cy="6" r="1.4" fill="${P.gold500}"/>` + `<ellipse cx="12" cy="16" rx="3.4" ry="2.4" fill="${P.wood300}"/><circle cx="12" cy="15.2" r="1" fill="${P.ink900}"/>`),
    icon('decor', shape(rr(5, 14, 14, 8, 2), T.woodDark, { s: 1.5 }) + shape('M12 14V8', T.sage, { s: 0 }) + strokeP('M12 15V8.5', P.sage700, 2) + shape(ell(12, 6.5, 4.2, 4.2), T.coral, { s: 1.5, h: 1 }) + `<circle cx="12" cy="6.5" r="1.5" fill="${P.gold500}"/>` + shape('M12 12Q7 12 6.5 8.5Q10.5 8.5 12 12Z', T.sage, { s: 1, lw: 1.2 })),
    icon('projects', shape(rr(2.5, 3.5, 19, 14, 1.5), T.wood, { s: 2 }) + `<rect x="4.5" y="5.5" width="15" height="10" rx="1" fill="${P.sage700}"/>` + strokeP('M7 9H13M7 12H11', P.cream300, 1.4) + shape(rr(14, 8, 3.5, 3.5, 0.8), T.coral, { s: 0.5, lw: 1 }) + strokeP('M7 17.5L5 21.5M17 17.5L19 21.5', P.wood700, 2)),
    icon('demolish', shape('M4 18L13 9L15.5 11.5L6.5 20.5Z', T.woodLight, { s: 1.5, h: 0.8 }) + shape(rr(11, 3, 11, 6.5, 1.5), T.stone, { s: 2, h: 1, transform: 'rotate(45 16.5 6.25)' })),
    icon('close', shape(ell(12, 12, 9.5, 9.5), T.coral, { s: 2.5, h: 1.2 }) + strokeP('M8.2 8.2L15.8 15.8M15.8 8.2L8.2 15.8', P.cream300, 2.4)),
    icon('check', shape(ell(12, 12, 9.5, 9.5), T.mint, { s: 2.5, h: 1.2 }) + strokeP('M7.5 12.2L10.6 15.2L16.6 8.8', P.cream300, 2.6)),
    // locked state & bottleneck finder (raw palette SVG without shape(): adding shape() ids here would renumber warden.svg)
    icon('lock', strokeP('M7.5 11V8a4.5 4.5 0 0 1 9 0v3', P.wood900, 2.6) + `<rect x="4.5" y="10.5" width="15" height="11" rx="2.5" fill="${P.gold500}" stroke="${P.wood900}" stroke-width="1.8"/><circle cx="12" cy="15.6" r="1.7" fill="${P.wood900}"/>`),
    icon('find', strokeP('M15.2 15.2L21 21', P.wood900, 3.4) + `<circle cx="10" cy="10" r="7" fill="${P.teal300}" stroke="${P.teal900}" stroke-width="2"/>` + strokeP('M6.6 9a3.6 3.6 0 0 1 3-3', P.cream300, 1.9) + `<circle cx="10" cy="10" r="2.2" fill="${P.coral500}"/>`),
  ];
}

/** big portrait of the warden (badger with clipboard) for the tutorial bubble & HUD */
export function wardenPortrait(heads: Map<string, Sprite>): Sprite {
  const head = heads.get('head_badger_S')!;
  const body = `<rect x="6" y="34" width="36" height="22" rx="10" fill="${P.ink700}" stroke="${P.ink900}" stroke-width="2"/>`
    + `<path d="M18 34L24 42L30 34" fill="${P.cream300}" stroke="${P.ink900}" stroke-width="1.6"/>`
    + shape(rr(29, 37, 12, 15, 2), T.wood, { s: 1.5, h: 0.8, lw: 1.5 }) + `<rect x="31" y="40" width="8" height="10" fill="${P.cream300}"/>` + strokeP('M32.5 43h5M32.5 46h4', P.ink700, 1);
  return { name: 'warden', w: 48, h: 56, ax: 0, ay: 0, pad: 1,
    body: body + `<g transform="translate(24 38) scale(1.75) translate(${-head.ax} ${-head.ay})">${head.body}</g>` };
}
void flat;
