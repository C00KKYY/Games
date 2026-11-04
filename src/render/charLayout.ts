/** Character layer layout relative to the feet point (0,0). Shared by the runtime and the art preview. */
export type Dir = 'S' | 'N' | 'E' | 'W';
export interface LayerPos { x: number; y: number }
export const CHAR = {
  footY: -1, footX: 3.5,
  legY: -9, legX: 3.2,
  bodyY: -7,
  shoulderY: -22.5, shoulderX: 8.4, shoulderXE: 1.2,
  neckY: -21,
  tailS: { x: 6, y: -12 }, tailN: { x: 0, y: -12 }, tailE: { x: -5, y: -12 },
  height: 40,
} as const;
