/** Tutorial steps, Warden's Clipboard (10 objectives, 7 mandatory) and unlocks (Brief §3.16, §4.2, §6.2). */
import { RUF, STARS } from '../content/balance';
import { AF, type World } from './types';
import { roomsOf, emit, earn, addRuf, starsOf } from './world';
import { totalBeds } from './ferry';
import { rascals } from './agents';

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
  { id: 'catch3', mandatory: true, target: 3, progress: w => w.stats.caught },
  { id: 'beds24', mandatory: true, target: 24, progress: w => totalBeds(w) },
  { id: 'release15', mandatory: true, target: 15, progress: w => w.stats.released },
  { id: 'workshop15', mandatory: true, target: 15, progress: w => Math.max(0, ...roomsOf(w, 'workshop').map(r => r.level)) },
];

export interface ObjState { done: Record<string, boolean>; current: number }
export const objState = (w: World): ObjState => w.obj;
export const mandatoryDone = (w: World) => OBJECTIVES.filter(o => o.mandatory).every(o => objState(w).done[o.id]);
export const objectiveReward = (n: number) => 100 + 40 * n;

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
  w.unlocked.workshop = true;
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
