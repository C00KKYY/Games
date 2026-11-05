/**
 * Sound IDs (Brief §8.2). public/audio/<id>.mp3 (SFX mono ~64 kbps), music/ambience loops as listed.
 * `initial: true` = part of the tutorial bundle loaded before gameplayStart (≤ 12 sounds, ≤ 250 KB total, Brief §8.4).
 */
export const SFX = [
  // UI
  'click', 'hover', 'panelOpen', 'panelClose', 'deny',
  // build
  'buildStart', 'hammerLoop', 'buildDone', 'demolish',
  // economy
  'upgrade', 'milestone', 'coin1', 'coin2', 'coin3', 'crateStack', 'cartRoll', 'hire', 'objective',
  // arrival / release
  'ferryHorn', 'stamp', 'releaseFanfare',
  // events
  'tunnelPop', 'kazoo', 'netSwoosh', 'foodSplat', 'whistle',
  // inspection / ledger
  'inspectStamp', 'ledgerRegister',
] as const;
export const LOOPS = ['ambWaves', 'ambGulls', 'ambMurmur', 'ambClatter', 'ambCrickets'] as const;
export const MUSIC = ['musicDay', 'musicEvening', 'musicInspection'] as const;
export type SfxId = typeof SFX[number];
export type LoopId = typeof LOOPS[number];
export type MusicId = typeof MUSIC[number];
export type SoundId = SfxId | LoopId | MusicId;
export const INITIAL: readonly SoundId[] = ['click', 'panelOpen', 'deny', 'ferryHorn', 'stamp', 'releaseFanfare', 'buildStart', 'buildDone', 'coin1', 'upgrade', 'tunnelPop', 'objective'];
/** legacy names used by M3 components via ctx.sound(name) */
export const ALIAS: Record<string, SoundId> = { build: 'buildStart', horn: 'ferryHorn', tap: 'click' };
