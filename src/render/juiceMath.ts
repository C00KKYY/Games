/**
 * Pure juice helpers (no Pixi, testable in Node): where a new floating "+coins" plaque goes.
 * A night skip pays many incomes in one frame – without merging they pile into a tower of plaques.
 */

/** the part of a live plaque the placement looks at (world units; `t` = seconds since it (re)started) */
export interface PlaqueSlot { on: boolean; t: number; x: number; y: number; amount: number; src: string; level: number }

/** plaques from the same source that started less than this ago are merged (summed amount, restarted pop) */
export const MERGE_S = 0.3;
/** at most this many plaques stack at one spot; more are merged into the stack */
export const STACK_MAX = 3;
/** a plaque this young still blocks its slot in the stack (it has not risen out of the way yet) */
export const STACK_S = 0.6;
/** same spot: horizontal / vertical distance (world units, base point before the lift) */
export const STACK_DX = 48, STACK_DY = 20;

export type PlaqueAction =
  | { kind: 'merge'; index: number }
  | { kind: 'new'; level: number }
  | { kind: 'replace'; index: number; level: number };

/**
 * Decide what a new plaque of `amount` from `src` at (x, y) does:
 * - merge into a live plaque of the same source and sign that started < MERGE_S ago at the same spot (newest wins);
 * - else take the lowest free level of the stack at that spot (0 … STACK_MAX−1);
 * - stack full: merge into its newest plaque of the same sign, else replace its oldest plaque (keeping that level).
 */
export function placePlaque(list: readonly PlaqueSlot[], src: string, x: number, y: number, amount: number): PlaqueAction {
  const sign = Math.sign(amount);
  let merge = -1, sameSign = -1, oldest = -1;
  const used = new Set<number>();
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    if (!q.on || q.t >= STACK_S || Math.abs(q.x - x) >= STACK_DX || Math.abs(q.y - y) >= STACK_DY) continue;
    used.add(q.level);
    const same = Math.sign(q.amount) === sign;
    if (same && q.src === src && q.t < MERGE_S && (merge < 0 || q.t < list[merge].t)) merge = i;
    if (same && (sameSign < 0 || q.t < list[sameSign].t)) sameSign = i;
    if (oldest < 0 || q.t > list[oldest].t) oldest = i;
  }
  if (merge >= 0) return { kind: 'merge', index: merge };
  for (let l = 0; l < STACK_MAX; l++) if (!used.has(l)) return { kind: 'new', level: l };
  if (sameSign >= 0) return { kind: 'merge', index: sameSign };
  return { kind: 'replace', index: oldest, level: list[oldest].level };
}
