/** mulberry32 – the state (not just the seed) lives in the world and is saved (Brief §9.4). */
export function rngNext(w: { rngState: number }): number {
  let a = (w.rngState = (w.rngState + 0x6d2b79f5) | 0);
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
}
export const rngInt = (w: { rngState: number }, lo: number, hi: number) => lo + Math.floor(rngNext(w) * (hi - lo + 1));
export const rngPick = <T>(w: { rngState: number }, arr: readonly T[]): T => arr[Math.floor(rngNext(w) * arr.length)];
export const rngChance = (w: { rngState: number }, p: number) => rngNext(w) < p;
