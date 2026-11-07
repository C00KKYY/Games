/** Tutorial steps, Warden's Clipboard (10 objectives, 7 mandatory) and unlocks (Brief §3.16, §4.2, §6.2). */
import { RUF, STARS } from '../content/balance';
import { AF, type World } from './types';
import { roomsOf, emit, earn, addRuf, starsOf } from './world';
import { totalBeds } from './ferry';
import { rascals } from './agents';
import { FOLLOWUPS, type FollowupId } from '../content/progress';

export interface ObjectiveDef { id: string; mandatory: boolean; target: number; progress: (w: World) => number; unlocks?: string[]; onlyIfSkipped?: boolean }

export const OBJECTIVES: ObjectiveDef[] = [
  // only after a skipped tutorial without a Wash Hut (Brief §6.2); otherwise counted as done without reward
  { id: 'wash', mandatory: false, target: 1, progress: w => roomsOf(w, 'wash').filter(r => r.built).length, onlyIfSkipped: true },
  { id: 'workshop', mandatory: true, target: 1, progress: w => roomsOf(w, 'workshop').filter(r => r.built).length, unlocks: ['classroom'] },
  { id: 'classroom', mandatory: true, target: 1, progress: w => roomsOf(w, 'classroom').filter(r => r.built).length },
  { id: 'guard', mandatory: true, target: 1, progress: w => roomsOf(w, 'guard').filter(r => r.built).length },
  { id: 'beds12', mandatory: false, target: 12, progress: w => totalBeds(w), unlocks: ['yard'] },
  { id: 'yard', mandatory: false, target: 1, progress: w => roomsOf(w, 'yard').filter(r => r.built).length },
  { id: 'canteen5', mandatory: false, target: 5, progress: w => Math.max(0, ...roomsOf(w, 'canteen').map(r => r.level)) },
  { id: 'beds24', mandatory: true, target: 24, progress: w => totalBeds(w) },
  // Lv15 before release 15 (balance pass M5): pacing §4.2 puts the core room Lv15 at 16:00–20:00, the 15th release
  // comes with the inspection at 22–28 min; in the old order the clipboard asked for Lv15 last (casual 27:30)
  { id: 'workshop15', mandatory: true, target: 15, progress: w => Math.max(0, ...roomsOf(w, 'workshop').map(r => r.level)) },
  { id: 'release15', mandatory: true, target: 15, progress: w => w.stats.released },
  // catching is not something the player can start (the director sends the escapes): last on the clipboard, so the
  // current goal is always one the player can work on (Brief §4.3 "verfolgbares Ziel"); it still completes any time
  { id: 'catch3', mandatory: true, target: 3, progress: w => w.stats.caught },
];

export interface ObjState { done: Record<string, boolean>; current: number }
export const objState = (w: World): ObjState => w.obj;
export const mandatoryDone = (w: World) => OBJECTIVES.filter(o => o.mandatory).every(o => objState(w).done[o.id]);
export const objectiveReward = (n: number) => 100 + 40 * n;

/**
 * "Es gibt immer ein aktuelles Ziel" (Brief §3.16, docs/M5_DESIGN.md §4): the first open clipboard objective, and once
 * all are done a follow-up (content/progress.ts FOLLOWUPS) – call the inspection, reach 2★ / 3★ on it, transfer.
 * null only while the tutorial runs (the tutorial step is the goal widget then, D4). Pure read for clipboard/bots.
 */
export type Goal =
  | { kind: 'objective'; id: string; k: number; progress: number; target: number; mandatory: boolean }
  | { kind: 'followup'; id: FollowupId; progress: number; target: number };
export function currentGoal(w: World): Goal | null {
  if (!w.tutorial.done) return null;
  const st = objState(w);
  const k = OBJECTIVES.findIndex(o => !st.done[o.id] && !(o.onlyIfSkipped && !w.director.data.skippedNoWash));
  if (k >= 0) { const o = OBJECTIVES[k]; return { kind: 'objective', id: o.id, k, progress: Math.min(o.target, o.progress(w)), target: o.target, mandatory: o.mandatory }; }
  const best = w.inspection.best;
  const id: FollowupId = best < 1 ? FOLLOWUPS[0] : best < 2 ? FOLLOWUPS[1] : best < 3 ? FOLLOWUPS[2] : FOLLOWUPS[3];
  const progress = id === 'callInspection' ? (w.inspection.phase === 'idle' ? 0 : 1) : id === 'transfer' ? 0 : best;
  const target = id === 'callInspection' || id === 'transfer' ? 1 : id === 'stars2' ? 2 : 3;
  return { kind: 'followup', id, progress, target };
}

/** tutorial: 0 horn → 1 wash hut → 2 stamp Earl → 3 upgrade canteen → done */
export const TUTORIAL_STEPS = ['horn', 'wash', 'stamp', 'upgrade'] as const;

export function onEvent(w: World, type: string, data: Record<string, unknown>) {
  if (type === 'release' && data.first) emit(w, 'happytime', { reason: 'firstRelease' });
}

/** tutorial steps are checked against the world state (not single events) so any order of player actions works (review finding) */
export function tutorialTick(w: World) {
  const tu = w.tutorial;
  if (!tu.active) return;
  const before = tu.step;
  for (let guard = 0; guard < 4 && tu.active; guard++) {
    if (tu.step === 0 && (w.ferry.state === 'docked' || w.stats.arrived > 0)) tu.step = 1;
    else if (tu.step === 1 && roomsOf(w, 'wash').some(r => r.built)) tu.step = 2;
    else if (tu.step === 2 && w.stats.released >= 1) tu.step = 3;
    else if (tu.step === 3 && roomsOf(w, 'canteen').some(r => r.level >= 2)) endTutorial(w);
    else break;
  }
  if (tu.active && tu.step !== before) emit(w, 'tutorialStep', { step: tu.step });
}

export function endTutorial(w: World, skipped = false) {
  const tu = w.tutorial;
  if (tu.done) return;
  tu.active = false; tu.done = true; tu.skipped = skipped;
  w.director.data.tutorialEndMs = w.rtMs;
  // the Knitting Nook unlock gets the same celebration as every other unlock (it was silent before)
  if (!w.unlocked.workshop) { w.unlocked.workshop = true; emit(w, 'unlock', { what: 'workshop' }); }
  emit(w, 'tutorialDone', { skipped });
}

/** Skip (Brief §6.2): pointers stop, scripted beats continue – Earl gets 95 % and is released by 2:00 */
export function skipTutorial(w: World) {
  if (!w.tutorial.active) return;
  const earl = rascals(w).find(a => a.flags & AF.earl);
  if (earl) earl.reform = Math.max(earl.reform, earl.sentence * 0.95);
  if (w.ferry.state === 'arriving') w.ferry.tapped = true;
  if (!roomsOf(w, 'wash').length) w.director.data.skippedNoWash = 1;
  endTutorial(w, true);
}

export function objectivesTick(w: World) {
  tutorialTick(w);
  // skip path: Earl gets 95 % as soon as he exists, the last 5 % by 1:30 (released by 2:00)
  if (w.tutorial.skipped) {
    const earl = rascals(w).find(a => a.flags & AF.earl && a.state !== 'leaving');
    if (earl) { earl.reform = Math.max(earl.reform, earl.sentence * 0.95); if (w.rtMs >= 90000 && earl.reform < earl.sentence) earl.reform = earl.sentence; }
  }
  if (!w.tutorial.done) return;
  const st = objState(w);
  OBJECTIVES.forEach((o, k) => {
    if (st.done[o.id]) return;
    if (o.onlyIfSkipped && !w.director.data.skippedNoWash) { st.done[o.id] = true; return; }
    if (o.progress(w) >= o.target) {
      st.done[o.id] = true;
      addRuf(w, 'objective', RUF.objective);
      earn(w, 'objective', objectiveReward(k));
      for (const u of o.unlocks ?? []) { w.unlocked[u] = true; emit(w, 'unlock', { what: u }); }
      emit(w, 'objective', { id: o.id, k });
    }
  });
  st.current = OBJECTIVES.findIndex(o => !st.done[o.id]);
  // star unlocks
  const s = starsOf(w.ruf);
  const unl = (k: string) => { if (!w.unlocked[k]) { w.unlocked[k] = true; emit(w, 'unlock', { what: k }); } };
  if (s >= 2) unl('projects');
  if (s >= 3) { unl('speed3'); unl('supSlot1'); }
  if (s >= 4) unl('supSlot2');
  if (mandatoryDone(w)) unl('inspection');
  void STARS;
}
