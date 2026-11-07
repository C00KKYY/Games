/**
 * Sim event → sound mapping (Brief §8.2, §12.6). Pure: no DOM, testable in Node.
 * Events reach the mixer through ctx.onEvent in the same frame as the sim tick that emitted them; actions a component
 * already voiced through ctx.sound (horn tap, build, upgrade, hire, demolish) are deduped by the mixer (DEDUPE_MS).
 */
import type { SimEvent } from '../sim/types';
import type { PlayOpts } from './mixer';

export interface Cue { id: string; opts?: PlayOpts }

const COIN_VOL: Record<string, number> = { board: 0.45, crates: 0.8, release: 0.9, objective: 0.8, event: 0.9 };

export function cueFor(e: SimEvent): Cue | null {
  switch (e.type) {
    case 'ferryHorn': return { id: 'ferryHorn', opts: { vol: 0.8 } };
    case 'hornTap': return { id: 'ferryHorn' };
    case 'ferryLeave': return { id: 'ferryHorn', opts: { vol: 0.35, rate: 0.92 } };
    case 'release': return { id: 'releaseFanfare', opts: { vol: e.vip || e.first ? 1 : 0.85 } };
    case 'coins': return { id: 'coin', opts: { vol: COIN_VOL[String(e.kind)] ?? 0.7 } };
    case 'crateSold': return { id: 'crateStack', opts: { vol: 0.7 } };
    case 'cartDepart': return { id: 'cartRoll', opts: { vol: 0.6 } };
    case 'build': case 'resize': return { id: 'buildStart' };
    case 'built': return { id: 'buildDone' };
    case 'upgrade': return { id: 'upgrade' };
    case 'milestone': return { id: 'milestone' };
    case 'star': return { id: 'milestone' };
    case 'tutorialDone': return e.skipped ? null : { id: 'milestone', opts: { vol: 0.8 } };
    case 'unlock': return { id: 'milestone', opts: { vol: 0.8 } };
    case 'objective': return { id: 'objective' };
    case 'parcel': return { id: 'upgrade' };
    case 'tunnel': return { id: 'tunnelPop' };
    case 'escaped': return { id: 'kazoo' };
    case 'caught': return { id: 'netSwoosh' };
    case 'foodFight': return { id: 'foodSplat' };
    case 'foodSolved': return { id: 'buildDone', opts: { vol: 0.7 } };
    case 'foodLost': return { id: 'deny', opts: { vol: 0.7 } };
    case 'ruckus': return { id: 'whistle' };
    case 'calmed': return { id: 'whistle', opts: { vol: 0.6, rate: 1.1 } };
    case 'vipAnnounced': return { id: 'objective', opts: { vol: 0.8 } };
    case 'hire': return { id: 'hire' };
    case 'demolish': return { id: 'demolish' };
    case 'dayEnd': return { id: 'ledgerRegister' };
    case 'loan': case 'loanRepaid': return { id: 'ledgerRegister', opts: { vol: 0.8 } };
    case 'unpaid': return { id: 'deny' };
    // M5 (docs/M5_DESIGN.md §11): existing sounds only
    case 'projectStart': return { id: 'buildStart', opts: { vol: 0.7 } };
    case 'projectDone': return { id: 'objective' };                                   // small fanfare
    case 'leadHired': return { id: 'hire' };
    case 'leadAutoTap': return { id: 'ferryHorn', opts: { vol: 0.75 } };               // Olli taps the horn
    case 'inspectionCalled': return { id: 'whistle', opts: { vol: 0.8, rate: 0.9 } };  // + music switch (audio.ts setMusic)
    case 'inspectorAt': return { id: 'stamp', opts: { vol: 0.55, rate: 1.1 } };
    case 'inspectionResult': return { id: 'inspectStamp' };
    case 'keysEarned': return { id: 'coin', opts: { vol: 0.9, rate: 1.35 } };          // key jingle
    case 'perkBought': return { id: 'upgrade' };
    case 'siteCompleted': case 'transfer': return { id: 'milestone' };
    case 'vipArrived': return { id: 'releaseFanfare', opts: { vol: 0.8, rate: 1.12 } };
    case 'mailClaimed': case 'offlineCollected': return { id: 'coin', opts: { vol: 0.85 } };
    case 'mailDayComplete': return { id: 'objective', opts: { vol: 0.85 } };
    default: return null;
  }
}
