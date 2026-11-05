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
  // a transfer run starts after the tutorial (no pointers, no Earl script) – TODO(sim-progress): verify scripted beats
  w.tutorial = { active: false, step: 4, skipped: true, done: true };
  w.director.data.tutorialEndMs = 0;
  w.unlocked.workshop = true;
  w.coins += startCapitalBonus(w);
  emit(w, 'keysEarned', { n: keys, source: 'transfer' });
  emit(w, 'transfer', { fromSite: from, toSite, keys, transfers: w.prestige.transfers });
  return { ok: true, cost: -keys };
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
