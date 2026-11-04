/** Debug invariants, checked every tick when world.debug (Brief §9.4, SIM_DESIGN §10). Violations are collected, not thrown. */
import { Ground } from '../content/site1';
import type { World } from './types';
import { idx } from './pathfield';
import { isResident } from './agents';
import { emit } from './world';

export const violations: string[] = [];
export function checkInvariants(w: World) {
  const bad = (m: string) => { if (violations.length < 200) violations.push(`t=${w.t} ${m}`); emit(w, 'invariant', { m }); };
  if (!Number.isFinite(w.coins) || w.coins < 0) bad(`coins ${w.coins}`);
  if (!Number.isFinite(w.ruf)) bad(`ruf ${w.ruf}`);
  const beds = new Set<string>();
  for (const a of w.agents) {
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) bad(`agent ${a.id} pos NaN`);
    for (const k of ['hunger', 'energy', 'hygiene', 'fun'] as const) if (!Number.isFinite(a.needs[k]) || a.needs[k] < 0 || a.needs[k] > 100) bad(`agent ${a.id} need ${k}=${a.needs[k]}`);
    if (!Number.isFinite(a.reform)) bad(`agent ${a.id} reform NaN`);
    const tx = Math.floor(a.x), ty = Math.floor(a.y);
    if (tx >= 0 && ty >= 0 && tx < w.grid.w && ty < w.grid.h && w.grid.ground[idx(tx, ty)] === Ground.Water && a.kind !== 'cart' && a.state !== 'arriving' && a.state !== 'waitingDock') bad(`agent ${a.id} (${a.kind}/${a.state}) in water at ${tx},${ty}`);
    if (isResident(a)) { const k = a.bed + ':' + a.bedSlot; if (beds.has(k)) bad(`bed ${k} double-booked`); beds.add(k); }
  }
  for (const r of w.rooms) for (let i = 0; i < r.slotUser.length; i++) {
    const id = r.slotUser[i]; if (!id) continue;
    const a = w.agents.find(x => x.id === id);
    if (!a || a.act?.roomId !== r.id || a.act.slot !== i) { if (!(a && r.type === 'bunk')) bad(`room ${r.id} slot ${i} held by stale agent ${id}`); }
  }
}
