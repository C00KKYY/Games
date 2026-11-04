/** Tutorial steps, Warden's Clipboard (10 objectives, 7 mandatory) and unlocks (Brief §3.16, §4.2, §6.2). */
import { RUF, STARS } from '../content/balance';
import { AF, type World } from './types';
import { roomsOf, emit, earn, addRuf, starsOf } from './world';
import { totalBeds } from './ferry';
import { rascals } from './agents';

export interface ObjectiveDef { id: string; mandatory: boolean; target: number; progress: (w: World) => number; unlocks?: string[] }

export const OBJECTIVES: ObjectiveDef[] = [
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
  const tu = w.tutorial;
  if (tu.active) {
    if (tu.step === 0 && type === 'ferryDock') tu.step = 1;
    else if (tu.step === 1 && type === 'built' && data.rtype === 'wash') tu.step = 2;
    else if (tu.step === 2 && type === 'release') tu.step = 3;
    else if (tu.step === 3 && type === 'upgrade' && roomsOf(w, 'canteen').some(r => r.id === data.roomId)) endTutorial(w);
    if (tu.active) emit(w, 'tutorialStep', { step: tu.step });
  }
  if (type === 'release' && data.first) emit(w, 'happytime', { reason: 'firstRelease' });
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
  w.ferry.tapped = true;
  endTutorial(w, true);
}

export function objectivesTick(w: World) {
  // skip path: Earl's last 5 % by 1:30
  if (w.tutorial.skipped && w.rtMs >= 90000) {
    const earl = rascals(w).find(a => a.flags & AF.earl && a.state !== 'leaving');
    if (earl && earl.reform < earl.sentence) earl.reform = earl.sentence;
  }
  if (!w.tutorial.done) return;
  const st = objState(w);
  OBJECTIVES.forEach((o, k) => {
    if (st.done[o.id]) return;
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
