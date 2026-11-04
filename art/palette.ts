/** Palette – single source (docs/STYLE_GUIDE.md §1). 31 colours. */
export const P = {
  wood900: '#4a3022', wood700: '#7a4e33', wood500: '#a8713f', wood300: '#d39c63',
  teal900: '#14424a', teal700: '#226b6e', teal500: '#33908a', teal300: '#66b9a8',
  sage900: '#33502f', sage700: '#52763f', sage500: '#779a52', sage300: '#a3bf75',
  brick900: '#5e2b23', brick700: '#8f4030', brick500: '#b85d40',
  stone900: '#3e3c42', stone700: '#6b6771', stone500: '#9b96a1', stone300: '#c6c0c7',
  cream700: '#e3d3b2', cream500: '#efe3c8', cream300: '#f8f0de',
  ink900: '#1f2b3e', ink700: '#36485f', ink500: '#5b6e89',
  gold700: '#b37f1d', gold500: '#e8b13a',
  coral700: '#a93e34', coral500: '#df6450',
  mint700: '#2f8a68', mint500: '#5fc39a',
} as const;
export type PaletteKey = keyof typeof P;
export const PALETTE_HEX: string[] = Object.values(P);
/** ramps ordered dark → light, used for gradient tolerance in tests */
export const RAMPS: string[][] = [
  [P.wood900, P.wood700, P.wood500, P.wood300],
  [P.teal900, P.teal700, P.teal500, P.teal300],
  [P.sage900, P.sage700, P.sage500, P.sage300],
  [P.brick900, P.brick700, P.brick500],
  [P.stone900, P.stone700, P.stone500, P.stone300],
  [P.cream700, P.cream500, P.cream300],
  [P.ink900, P.ink700, P.ink500],
  [P.gold700, P.gold500], [P.coral700, P.coral500], [P.mint700, P.mint500],
];
