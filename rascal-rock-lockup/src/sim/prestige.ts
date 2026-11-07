/**
 * Transfer (prestige), golden keys, perks, completion percentage (Brief §3.17, docs/M5_DESIGN.md §6). Owner: sim-progress.
 *  - transfer resets coins, rooms and staff of the site; the site stays "completed"; keys = floor(k·sqrt(L/C)) + star bonus
 *  - in v1-M5 the only available target is site 1 again (a fresh run with perks); M6 makes site 2 available
 *  - perks cost 2–6 keys (content/progress.ts PERKS), effects in effects.ts
 *  - reportGameCompletedPercentage: completionPercent(w), emitted as 'completion' after each inspection pass; the app
 *    also reports it on load
 */
import { keysFor } from '../content/balance';
import { PERKS, COMPLETION, siteDef } from '../content/progress';
import type { World, CommandResult, PerkId } from './types';
import { emit } from './world';
import { startCapitalBonus } from './effects';

export const completionPercent = (w: World) => Math.min(100, w.prestige.completedSites.length * COMPLETION.percentPerSite);

/** keys a transfer gives right now (0 before the site was passed) */
export const transferKeys = (w: World) => (w.inspection.best >= 1 ? keysFor(w.stats.lifetimeCoins, w.inspection.best) : 0);

/** target sites the transfer dialog may offer: available in this build and unlocked (site n needs site n−1 completed) */
export function transferTargets(w: World): number[] {
  const out: number[] = [];
  for (let s = 1; s <= w.prestige.completedSites.length + 1; s++) if (siteDef(s).id === s && siteDef(s).available && (s === 1 || w.prestige.completedSites.includes(s - 1))) out.push(s);
  return out;
}

/** called by inspection.ts when a result has ≥ 1★ */
export function onInspectionPassed(w: World, stars: number) {
  const P = w.prestige;
  P.bestStars[w.site] = Math.max(P.bestStars[w.site] ?? 0, stars);
  if (!P.completedSites.includes(w.site)) {
    P.completedSites.push(w.site); P.completedSites.sort((a, b) => a - b);
    emit(w, 'siteCompleted', { site: w.site, stars, next: w.site + 1 });
  }
  emit(w, 'completion', { percent: completionPercent(w) });
}

/**
 * cmd.transfer – reasons: notPassed, busy (inspection walking), locked (target not available/unlocked).
 * `fresh(seed)` builds the new site run (sim.ts passes newGame, avoids an import cycle).
 */
export function transfer(w: World, toSite: number, fresh: (seed: number, site: number) => World): CommandResult {
  if (w.inspection.best < 1) return { ok: false, reason: 'notPassed' };
  if (w.inspection.phase === 'walking') return { ok: false, reason: 'busy' };
  if (!transferTargets(w).includes(toSite)) return { ok: false, reason: 'locked' };
  const keys = transferKeys(w), from = w.site;
  const keep = {
    keys: w.keys + keys,
    prestige: { ...w.prestige, transfers: w.prestige.transfers + 1, keysEarned: w.prestige.keysEarned + keys, lifetimeCoins: w.prestige.lifetimeCoins + w.stats.lifetimeCoins },
    mail: w.mail, vip: w.vip, wall: w.wall, taps: w.taps,
    events: w.events, eventSeq: w.eventSeq, debug: w.debug, speed: w.speed,
  };
  const n = fresh(w.seed + 7919 * (w.prestige.transfers + 1), toSite);
  const cache = { ...n.cache, evCursor: w.eventSeq };
  Object.assign(w, n, keep, { cache, site: toSite, firstSession: false });
  applyTransferRunBeats(w);
  w.coins += startCapitalBonus(w);
  emit(w, 'keysEarned', { n: keys, source: 'transfer' });
  emit(w, 'transfer', { fromSite: from, toSite, keys, transfers: w.prestige.transfers });
  return { ok: true, cost: -keys };
}

/**
 * Scripted beats of a transfer run (docs/M5_DESIGN.md §6): the player knows the game, so the run starts after the
 * tutorial – no pointers, no Earl script, no scripted 3:00 spoon tunnel and no scripted
 * 10:00 food fight. The normal director runs instead; its food-fight/ruckus lock counts from the run start
 * (tutorialEndMs = 0 → locked for DIRECTOR.lockAfterTutorialSec). Unlocks that the tutorial grants are granted here;
 * the optional Wash Hut goal of the skip path is offered (the new lockup has none).
 * Earl himself (ferry.ts spawns him for the first passenger of a run) and the first-release happytime are guarded in
 * ferry.ts via prestige.transfers (integrator).
 */
export function applyTransferRunBeats(w: World) {
  w.tutorial = { active: false, step: 4, skipped: false, done: true };
  const d = w.director.data;
  d.tutorialEndMs = 0;
  d.tunnelDone = 1;   // no scripted tutorial tunnel at 3:00
  d.foodDone = 1;     // no scripted food fight at 10:00 (the director may still roll one after the lock)
  d.transferRun = 1;
  // the fresh lockup has no Wash Hut (the tutorial builds it on the first run): the clipboard's optional wash goal
  // comes first, like on the skip path – otherwise the first goal ignores the red hygiene stage (M5 integration flow)
  if (!w.rooms.some(r => r.type === 'wash')) d.skippedNoWash = 1;
  w.unlocked.workshop = true;
}

/** cmd.buyPerk – reasons: invalid, max, keys */
export function buyPerk(w: World, id: PerkId): CommandResult {
  const def = PERKS.find(p => p.id === id);
  if (!def) return { ok: false, reason: 'invalid' };
  const lvl = w.prestige.perks[id] ?? 0;
  if (lvl >= def.max) return { ok: false, reason: 'max' };
  const cost = def.costs[lvl];
  if (w.keys < cost) return { ok: false, reason: 'keys', cost };
  w.keys -= cost;
  w.prestige.perks[id] = lvl + 1;
  emit(w, 'perkBought', { id, level: lvl + 1, cost });
  return { ok: true, cost };
}

/** next level cost or null at max (perk menu) */
export const perkNextCost = (w: World, id: PerkId) => { const d = PERKS.find(p => p.id === id)!; const l = w.prestige.perks[id] ?? 0; return l >= d.max ? null : d.costs[l]; };
