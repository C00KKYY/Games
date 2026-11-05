/**
 * Project Board (Brief §3.13, docs/M5_DESIGN.md §2). Owner: sim-progress.
 * One project at a time, paid in coins, timer in real ms at 1x (counts down by tickMs per tick, so 2x halves it and
 * pause stops it) that CONTINUES OFFLINE (advanceProjects with the away time). Effects: src/sim/effects.ts.
 */
import { PROJECTS, PROJECT_UNLOCK_STARS, projectDef } from '../content/progress';
import type { World, CommandResult, ProjectId } from './types';
import { emit, spend, starsOf, roomsOf } from './world';
import { tickMs } from './time';

export type ProjectCard =
  | { state: 'done' }
  | { state: 'running'; leftMs: number; progress01: number }
  /** startable right now (coins may still be missing → `affordable`) */
  | { state: 'available'; affordable: boolean }
  /** another project runs */
  | { state: 'busy' }
  /** board locked (< 2★) */
  | { state: 'locked'; stars: number }
  /** needs a built room of this type */
  | { state: 'needsRoom'; room: string };

export const projectsUnlocked = (w: World) => starsOf(w.ruf) >= PROJECT_UNLOCK_STARS;

/** card state for the board UI (pure read) */
export function projectCard(w: World, id: ProjectId): ProjectCard {
  const def = projectDef(id);
  if (w.projects.done[id]) return { state: 'done' };
  const run = w.projects.running;
  if (run?.id === id) return { state: 'running', leftMs: run.leftMs, progress01: 1 - run.leftMs / run.totalMs };
  if (!projectsUnlocked(w)) return { state: 'locked', stars: PROJECT_UNLOCK_STARS };
  if (def.requires && !roomsOf(w, def.requires).some(r => r.built)) return { state: 'needsRoom', room: def.requires };
  if (run) return { state: 'busy' };
  return { state: 'available', affordable: w.coins >= def.cost };
}

/** cmd.startProject – reasons: invalid, locked, done, busy, noRoom, coins */
export function startProject(w: World, id: ProjectId): CommandResult {
  const def = PROJECTS.find(p => p.id === id);
  if (!def) return { ok: false, reason: 'invalid' };
  if (!projectsUnlocked(w)) return { ok: false, reason: 'locked' };
  if (w.projects.done[id]) return { ok: false, reason: 'done' };
  if (w.projects.running) return { ok: false, reason: 'busy' };
  if (def.requires && !roomsOf(w, def.requires).some(r => r.built)) return { ok: false, reason: 'noRoom' };
  if (!spend(w, 'project', def.cost)) return { ok: false, reason: 'coins', cost: def.cost };
  w.projects.running = { id, leftMs: def.sec * 1000, totalMs: def.sec * 1000 };
  emit(w, 'projectStart', { id, cost: def.cost, sec: def.sec });
  return { ok: true, cost: def.cost };
}

/** per tick: count the running project down by the real ms this tick stands for */
export function projectsTick(w: World) {
  const run = w.projects.running;
  if (!run) return;
  run.leftMs -= tickMs(w.t - 1);
  if (run.leftMs <= 0) finishProject(w);
}

/** away time (offline formula path, Brief §3.15 "Projekt-Timer laufen weiter"); resim paths tick normally */
export function advanceProjects(w: World, ms: number) {
  const run = w.projects.running;
  if (!run || !(ms > 0)) return;
  run.leftMs -= ms;
  if (run.leftMs <= 0) finishProject(w);
}

function finishProject(w: World) {
  const run = w.projects.running!;
  w.projects.done[run.id] = true;
  w.projects.running = null;
  emit(w, 'projectDone', { id: run.id });
}
