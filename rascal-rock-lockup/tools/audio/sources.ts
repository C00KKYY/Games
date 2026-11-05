/**
 * Audio source registry (Brief §8.1/§8.2): every shipped sound id → recorded source file(s) + recipe.
 * Each pack's "License(s)" field was read on its source page (proof copies in qa/audio/license-proof/).
 * Only CC0 and CC-BY 3.0/4.0 are allowed; CC-BY needs the credit line in licenses/AUDIO_CREDITS.md.
 * Files live in vendor_raw/audio/<pack.dir>/ (gitignored, downloaded once, read as data only).
 */
import type { SoundId } from '../../src/audio/manifest';

export type License = 'CC0-1.0' | 'CC-BY-3.0' | 'CC-BY-4.0';

export interface Pack {
  dir: string;
  title: string;
  author: string;
  page: string;
  /** direct download(s) as found on the page */
  download: string[];
  license: License;
  /** licence file shipped inside the download, if any (relative to dir) */
  licenseFile?: string;
  /** exact credit line (required for CC-BY) */
  credit?: string;
}

const OGA = 'https://opengameart.org/content/';
const OGAF = 'https://opengameart.org/sites/default/files/';
const FMA = 'https://freemusicarchive.org/music/holiznacc0/';

export const PACKS = {
  kInterface: { dir: 'kenney_interfaceSounds', title: 'Interface Sounds (Kenney)', author: 'Kenney (kenney.nl)', page: OGA + 'interface-sounds', download: [OGAF + 'kenney_interfaceSounds.zip'], license: 'CC0-1.0', licenseFile: 'License.txt' },
  kUi: { dir: 'kenney_ui-pack', title: 'UI Pack 2.0 (Kenney)', author: 'Kenney (kenney.nl)', page: OGA + 'ui-pack', download: [OGAF + 'kenney_ui-pack.zip'], license: 'CC0-1.0', licenseFile: 'License.txt' },
  kRpg: { dir: 'RPGsounds_Kenney', title: '50 RPG sound effects (Kenney)', author: 'Kenney (kenney.nl)', page: OGA + '50-rpg-sound-effects', download: [OGAF + 'RPGsounds_Kenney.zip'], license: 'CC0-1.0', licenseFile: 'license.txt' },
  kJingles: { dir: 'jingleSounds_Kenney', title: '85 short music jingles (Kenney)', author: 'Kenney (kenney.nl)', page: OGA + '85-short-music-jingles', download: [OGAF + 'jingleSounds_Kenney.zip'], license: 'CC0-1.0', licenseFile: 'license.txt' },
  rdRpg: { dir: '80-CC0-RPG-SFX_0', title: '80 CC0 RPG SFX', author: 'rubberduck', page: OGA + '80-cc0-rpg-sfx', download: [OGAF + '80-CC0-RPG-SFX_0.zip'], license: 'CC0-1.0' },
  rdWood: { dir: '100-CC0-wood-metal-SFX', title: '100 CC0 metal and wood SFX', author: 'rubberduck', page: OGA + '100-cc0-metal-and-wood-sfx', download: [OGAF + '100-CC0-wood-metal-SFX.zip'], license: 'CC0-1.0' },
  rdSfx: { dir: '100-CC0-SFX_0', title: '100 CC0 SFX', author: 'rubberduck', page: OGA + '100-cc0-sfx', download: [OGAF + '100-CC0-SFX_0.zip'], license: 'CC0-1.0' },
  rdLoops: { dir: 'sfx_loops', title: '30 CC0 SFX loops', author: 'rubberduck', page: OGA + '30-cc0-sfx-loops', download: [OGAF + 'sfx_loops.zip'], license: 'CC0-1.0' },
  rdMud: { dir: '25-CC0-mud-sfx', title: '25 CC0 mud SFX', author: 'rubberduck', page: OGA + '25-cc0-mud-sfx', download: [OGAF + '25-CC0-mud-sfx.zip'], license: 'CC0-1.0' },
  swishes: { dir: 'swishes', title: 'Swishes Sound Pack', author: 'artisticdude', page: OGA + 'swishes-sound-pack', download: [OGAF + 'swishes.zip'], license: 'CC0-1.0' },
  squish: { dir: 'squish-sounds-effects', title: 'Squish sounds effects', author: 'EZduzziteh', page: OGA + 'squish-sounds-effects', download: [OGAF + 'squish_04.mp3'], license: 'CC0-1.0' },
  pops3: { dir: '3pops', title: '3 pop sounds', author: 'wubitog', page: OGA + '3-pop-sounds', download: [OGAF + '3pops.zip'], license: 'CC0-1.0' },
  pop: { dir: 'pop', title: 'Pop', author: '0f9ran', page: OGA + 'pop', download: [OGAF + 'pop_.wav'], license: 'CC0-1.0' },
  pops: { dir: 'pop-sounds', title: 'Pop sounds', author: 'cogitollc', page: OGA + 'pop-sounds', download: [OGAF + 'pop3.ogg', OGAF + 'pop4.ogg', OGAF + 'pop9.ogg', OGAF + 'pop10.ogg'], license: 'CC0-1.0' },
  steam: { dir: 'steam-whistle', title: 'Steam whistle', author: 'bart', page: OGA + 'steam-whistle', download: [OGAF + 'steamwhistle_0.wav'], license: 'CC0-1.0' },
  fanfare: { dir: 'classic-fanfare-lick', title: 'Classic fanfare lick', author: 'fvcalderan', page: OGA + 'classic-fanfare-lick', download: [OGAF + 'fanfare_3.ogg'], license: 'CC0-1.0' },
  applause: { dir: 'applause-in-a-large-hall-or-church', title: 'Applause in a large hall or church', author: 'eXpl0it3r', page: OGA + 'applause-in-a-large-hall-or-church', download: [OGAF + 'applause-clapping-church-crowd-immersive.wav'], license: 'CC0-1.0' },
  waves: { dir: 'beach-ocean-waves', title: 'Beach ocean waves', author: 'jasinski (submitted by qubodup)', page: OGA + 'beach-ocean-waves', download: [1, 2, 3, 4].map(i => `${OGAF}wave_0${i}_cc0-18363__jasinski__alkaibeach.flac`), license: 'CC0-1.0' },
  gulls: { dir: 'solo-seagull-sound-effects', title: 'Solo seagull sound effects', author: 'Rango Mango', page: OGA + 'solo-seagull-sound-effects', download: [OGAF + 'Seagull%20Ambient%201.wav', '…'], license: 'CC0-1.0' },
  crowd: { dir: 'crowd-shoutingspeaking-ambience', title: 'Crowd shouting/speaking ambience', author: 'StarNinjas', page: OGA + 'crowd-shoutingspeaking-ambience', download: [OGAF + 'crowd_shouting_0.ogg'], license: 'CC0-1.0' },
  cutlery: { dir: 'cutlery-sounds', title: 'Cutlery sounds', author: 'TinyWorlds', page: OGA + 'cutlery-sounds', download: [OGAF + 'fork_on_dish_01.ogg', '…'], license: 'CC0-1.0' },
  crickets: { dir: 'crickets-ambient-noise-loopable', title: 'Crickets ambient noise (loopable)', author: 'Wolfgang_', page: OGA + 'crickets-ambient-noise-loopable', download: [OGAF + 'crickets_1.mp3'], license: 'CC0-1.0' },
  kazoo: { dir: 'wm-kazoo', title: 'NoiseCollector KazooA.wav', author: 'NoiseCollector (freesound.org, via Wikimedia Commons)', page: 'https://commons.wikimedia.org/wiki/File:NoiseCollector_KazooA.wav', download: ['https://upload.wikimedia.org/wikipedia/commons/6/69/NoiseCollector_KazooA.wav'], license: 'CC-BY-3.0', credit: '"KazooA" by NoiseCollector (freesound.org), CC BY 3.0 – edited (trimmed, pitch-shifted, levelled)' },
  whistle: { dir: 'wm-referee-whistle', title: '218318 splicesound referee-whistle-blow-gymnasium.wav', author: 'SpliceSound (freesound.org, via Wikimedia Commons)', page: 'https://commons.wikimedia.org/wiki/File:218318_splicesound_referee-whistle-blow-gymnasium.wav', download: ['https://upload.wikimedia.org/wikipedia/commons/7/7d/218318_splicesound_referee-whistle-blow-gymnasium.wav'], license: 'CC0-1.0' },
  whistleOga: { dir: 'whistles', title: 'Whistles', author: 'dklon', page: OGA + 'whistles', download: [OGAF + 'whistles.zip'], license: 'CC-BY-3.0', credit: '"Whistles" by dklon (opengameart.org/content/whistles), CC BY 3.0 – edited (levelled)' },
  trumpet: { dir: 'game-over-trumpet-sfx', title: 'Game over trumpet SFX', author: '0new4y', page: OGA + 'game-over-trumpet-sfx', download: [OGAF + 'losetrumpet.wav'], license: 'CC0-1.0' },
  holizna: { dir: 'fma-holiznacc0', title: 'HoliznaCC0 tracks (Free Music Archive)', author: 'HoliznaCC0', page: FMA, download: [], license: 'CC0-1.0' },
} satisfies Record<string, Pack>;
export type PackId = keyof typeof PACKS;

export interface Src {
  pack: PackId;
  file: string;
  /** seconds into the source */
  start?: number;
  dur?: number;
  /** varispeed (pitch+speed) factor */
  rate?: number;
  gainDb?: number;
  /** offset in the mix, seconds */
  at?: number;
  /** extra ffmpeg -af filter applied while decoding (data only, e.g. lowpass) */
  filter?: string;
  /** the exact source page of this file when the pack page is only an index (music: the FMA track page) */
  page?: string;
  /** fade lengths (s) applied to the layer before mixing */
  fadeIn?: number;
  fadeOut?: number;
}

export interface SfxRecipe {
  kind: 'sfx';
  layers: Src[];
  /** optional max length (s) before the end fade */
  maxDur?: number;
  /** add an exponential decay over the last N seconds (sustained sounds → natural tail) */
  tail?: number;
  why: string;
}
export interface LoopRecipe {
  kind: 'loop' | 'music';
  /**
   * 'segment': one continuous recording; [start, start+len] is made periodic by cross-fading the
   *            following `xfade` seconds into its head. For music `len` is searched in lenRange so the
   *            loop point lands on a musically similar frame (bar-aligned in practice).
   * 'circular': scattered recorded events mixed into a circular buffer of `len` seconds.
   */
  mode: 'segment' | 'circular';
  layers: Src[];
  start?: number;
  len: number;
  lenRange?: [number, number];
  xfade?: number;
  /** tame the transients of a sparse bed by this many dB (look-ahead limiter) before loudness normalisation */
  preLimitDb?: number;
  why: string;
}
export type Recipe = SfxRecipe | LoopRecipe;

const ki = (f: string, o: Partial<Src> = {}): Src => ({ pack: 'kInterface', file: `Audio/${f}.ogg`, ...o });
const kj = (f: string, o: Partial<Src> = {}): Src => ({ pack: 'kJingles', file: `OGG/jingles_${f.replace(/\d+$/, '')}/jingles_${f}.ogg`, ...o });

const MUSIC_DAY: Omit<LoopRecipe, 'why'> = { kind: 'music', mode: 'segment', start: 20, len: 90, lenRange: [80, 96], xfade: 1.5, layers: [{ pack: 'holizna', file: 'ocean-breeze-lofi-ukulele-peaceful-mp3.mp3', page: FMA + 'public-domain-lofi/ocean-breeze-lofi-ukulele-peaceful-mp3/' }] };

export const RECIPES: Record<SoundId, Recipe> = {
  // ---------- UI ----------
  click: { kind: 'sfx', layers: [ki('toggle_002')], why: 'soft toggle click' },
  hover: { kind: 'sfx', layers: [ki('select_007')], why: 'tiny select tick, the quietest UI cue (runtime plays it low)' },
  panelOpen: { kind: 'sfx', layers: [ki('maximize_001')], why: 'rising glide' },
  panelClose: { kind: 'sfx', layers: [ki('minimize_001')], why: 'falling glide (pair of panelOpen)' },
  deny: { kind: 'sfx', layers: [ki('error_006')], why: 'wobbly low "nuh-uh", not harsh' },
  // ---------- build ----------
  buildStart: { kind: 'sfx', layers: [{ pack: 'rdWood', file: 'wood_hammer_01.ogg' }], why: 'single wooden mallet thunk' },
  hammerLoop: { kind: 'sfx', layers: [{ pack: 'rdWood', file: 'wood_hammer_01.ogg' }, { pack: 'rdWood', file: 'wood_hammer_01.ogg', at: 0.22, rate: 0.94, gainDb: -1.5 }, { pack: 'rdWood', file: 'wood_hammer_01.ogg', at: 0.44, rate: 1.06, gainDb: -0.5 }], why: '"tok-tok-tok": three recorded mallet hits, 0.22 s apart; replays as a hammering rhythm' },
  buildDone: { kind: 'sfx', layers: [{ pack: 'pops', file: 'pop3.ogg' }, ki('confirmation_001', { at: 0.04, gainDb: -4 })], why: '"done" pop + small chime' },
  demolish: { kind: 'sfx', layers: [{ pack: 'rdWood', file: 'wood_misc_07.ogg' }, { pack: 'rdWood', file: 'wood_breaking_02.ogg', at: 0.05, gainDb: -8 }], why: 'wood planks coming apart and clattering down (no debris crash)' },
  // ---------- economy ----------
  upgrade: { kind: 'sfx', layers: [kj('STEEL13')], why: 'steel-drum upward leap (island flavour)' },
  milestone: { kind: 'sfx', layers: [kj('STEEL02')], why: 'steel-drum rising run – milestone fanfare' },
  coin1: { kind: 'sfx', layers: [{ pack: 'pops', file: 'pop4.ogg' }, ki('glass_006', { at: 0.015, gainDb: -4 }), { pack: 'rdRpg', file: 'item_coins_01.ogg', at: 0.01, gainDb: -10, dur: 0.12, fadeOut: 0.06 }], why: 'coin pop 1: pop + glassy ting + a hint of real coins' },
  coin2: { kind: 'sfx', layers: [{ pack: 'pops', file: 'pop9.ogg' }, ki('glass_003', { at: 0.015, gainDb: -4 }), { pack: 'rdRpg', file: 'item_coins_03.ogg', at: 0.01, gainDb: -10, dur: 0.12, fadeOut: 0.06 }], why: 'coin pop 2: pop + glassy ting + a hint of real coins' },
  coin3: { kind: 'sfx', layers: [{ pack: 'pops', file: 'pop10.ogg' }, ki('glass_005', { at: 0.015, gainDb: -4 })], why: 'coin pop 3: pop + glassy ting' },
  crateStack: { kind: 'sfx', layers: [{ pack: 'rdWood', file: 'wood_misc_06.ogg' }], why: 'wooden crate set down on a stack' },
  cartRoll: { kind: 'sfx', layers: [{ pack: 'rdLoops', file: 'rolling.ogg', fadeIn: 0.08 }, { pack: 'rdLoops', file: 'rolling.ogg', at: 0.9, fadeOut: 0.5 }], maxDur: 1.9, why: 'wooden cart rolling off (two passes of a rolling loop, faded)' },
  hire: { kind: 'sfx', layers: [kj('STEEL10')], why: 'short friendly steel-drum rise' },
  objective: { kind: 'sfx', layers: [ki('confirmation_002')], why: 'ascending 4-note chime' },
  // ---------- arrival / release ----------
  ferryHorn: { kind: 'sfx', layers: [{ pack: 'steam', file: 'steamwhistle_0.wav', start: 0.12, dur: 1.15, fadeIn: 0.04 }], tail: 0.45, why: 'friendly three-tone steam-ferry whistle "tooot" with a natural decay' },
  stamp: { kind: 'sfx', layers: [{ pack: 'kRpg', file: 'OGG/bookPlace1.ogg' }], why: 'rubber stamp thump on paper' },
  releaseFanfare: { kind: 'sfx', layers: [{ pack: 'fanfare', file: 'fanfare_3.ogg' }, { pack: 'applause', file: 'applause-clapping-church-crowd-immersive.wav', start: 6, dur: 2.6, at: 0.35, gainDb: -6, fadeIn: 0.3, fadeOut: 1.0 }], maxDur: 3.2, tail: 0.6, why: 'trumpet fanfare lick with applause & cheering underneath' },
  // ---------- events ----------
  tunnelPop: { kind: 'sfx', layers: [{ pack: 'pop', file: 'pop_.wav' }, { pack: 'pops3', file: '3pops/pop1.ogg', at: 0.01, gainDb: -4 }], why: 'cork-like plop when a tunnel breaks through' },
  kazoo: { kind: 'sfx', layers: [{ pack: 'kazoo', file: 'NoiseCollector_KazooA.wav', start: 0, dur: 0.42, fadeOut: 0.05 }, { pack: 'kazoo', file: 'NoiseCollector_KazooA.wav', start: 0, dur: 0.42, rate: 0.8409, at: 0.45, fadeOut: 0.05 }, { pack: 'kazoo', file: 'NoiseCollector_KazooA.wav', start: 0, dur: 0.42, at: 0.9, fadeOut: 0.05 }, { pack: 'kazoo', file: 'NoiseCollector_KazooA.wav', start: 0, dur: 0.5, rate: 0.8409, at: 1.35, fadeOut: 0.2 }], why: 'comedic kazoo "wee-woo wee-woo" alarm (recorded kazoo note, second note a minor third lower) – explicitly not a siren' },
  netSwoosh: { kind: 'sfx', layers: [{ pack: 'swishes', file: 'swishes/swish-7.wav' }, { pack: 'swishes', file: 'swishes/swish-3.wav', at: 0.05, gainDb: -6, rate: 0.9 }], why: 'butterfly-net swoosh (two light swishes)' },
  foodSplat: { kind: 'sfx', layers: [{ pack: 'squish', file: 'squish_04.mp3' }, { pack: 'rdMud', file: 'mud_08.ogg', at: 0.01, gainDb: -3 }], why: 'custard-pie splat (wet squish + soft mud slap)' },
  whistle: { kind: 'sfx', layers: [{ pack: 'whistle', file: '218318_splicesound_referee-whistle-blow-gymnasium.wav' }], maxDur: 1.2, why: 'guard\'s pea whistle' },
  // ---------- inspection / ledger ----------
  inspectStamp: { kind: 'sfx', layers: [{ pack: 'kRpg', file: 'OGG/bookClose.ogg' }, { pack: 'rdWood', file: 'wood_slam_04.ogg', gainDb: -4, rate: 0.9 }], why: 'heavier official stamp (book slam + desk thud)' },
  ledgerRegister: { kind: 'sfx', layers: [{ pack: 'rdRpg', file: 'item_coins_02.ogg', gainDb: -8 }, ki('confirmation_003', { at: 0.08 }), ki('glass_004', { at: 0.1, gainDb: -6 })], why: 'cash-register coin rattle + bright "ka-ching" chime' },
  // ---------- ambience loops ----------
  ambWaves: {
    kind: 'loop', mode: 'circular', len: 13.2,
    layers: [
      { pack: 'waves', file: 'wave_01_cc0-18363__jasinski__alkaibeach.flac', at: 0.2, fadeIn: 0.1, fadeOut: 0.9 },
      { pack: 'waves', file: 'wave_03_cc0-18363__jasinski__alkaibeach.flac', at: 3.6, fadeIn: 0.3, fadeOut: 0.8, gainDb: -1 },
      { pack: 'waves', file: 'wave_04_cc0-18363__jasinski__alkaibeach.flac', at: 5.3, fadeIn: 0.3, fadeOut: 0.9 },
      { pack: 'waves', file: 'wave_02_cc0-18363__jasinski__alkaibeach.flac', at: 8.1, fadeIn: 0.3, fadeOut: 0.8, gainDb: -1 },
      { pack: 'waves', file: 'wave_01_cc0-18363__jasinski__alkaibeach.flac', at: 10.0, fadeIn: 0.3, fadeOut: 0.6, gainDb: -2, rate: 0.94 },
    ],
    why: 'gentle beach wash: five recorded waves, faded and overlapped in a circular 13.2 s buffer (no gap, no audible repeat point)',
  },
  ambGulls: {
    kind: 'loop', mode: 'circular', len: 23.0,
    layers: [
      { pack: 'gulls', file: 'Seagull Ambient 1.wav', at: 1.0, gainDb: -6 },
      { pack: 'gulls', file: 'Seagull Ambient 4.wav', at: 7.5, gainDb: -3 },
      { pack: 'gulls', file: 'Seagull Ambient 6.wav', at: 12.2, gainDb: -8, rate: 1.05 },
      { pack: 'gulls', file: 'Seagull Ambient 5.wav', at: 17.0, gainDb: -4 },
      { pack: 'gulls', file: 'Seagull Big Ambient.wav', at: 21.0, gainDb: -10 },
    ],
    why: 'distant gulls, sparse calls spread over 23 s',
  },
  ambMurmur: {
    kind: 'loop', mode: 'segment', start: 3, len: 18, xfade: 2.5,
    layers: [{ pack: 'crowd', file: 'crowd_shouting_0.ogg', filter: 'highpass=f=120,lowpass=f=900,lowpass=f=900' }],
    why: 'crowd babble low-passed at 900 Hz → indistinct murmur (no intelligible words)',
  },
  ambClatter: {
    kind: 'loop', mode: 'circular', len: 14.0,
    layers: [
      { pack: 'cutlery', file: 'fork_on_dish_01.ogg', at: 0.4, gainDb: -2 },
      { pack: 'rdSfx', file: 'dishes_01.ogg', at: 1.6, gainDb: -6 },
      { pack: 'cutlery', file: 'fork_on_dish_02.ogg', at: 2.9 },
      { pack: 'cutlery', file: 'cup_on_table_01.ogg', at: 3.8, gainDb: -3 },
      { pack: 'cutlery', file: 'pick_cutlery_01.ogg', at: 5.0, gainDb: -5 },
      { pack: 'cutlery', file: 'fork_on_dish_03.ogg', at: 6.9, gainDb: -2 },
      { pack: 'rdSfx', file: 'dishes_03.ogg', at: 7.8, gainDb: -7 },
      { pack: 'rdSfx', file: 'pot_01.ogg', at: 9.1, gainDb: -8 },
      { pack: 'cutlery', file: 'fork_on_dish_01.ogg', at: 10.0, gainDb: -4, rate: 1.06 },
      { pack: 'cutlery', file: 'drop_cutlery_01.ogg', at: 11.2, gainDb: -9 },
      { pack: 'rdSfx', file: 'dishes_04.ogg', at: 12.6, gainDb: -7 },
      { pack: 'cutlery', file: 'fork_on_dish_02.ogg', at: 13.4, gainDb: -3, rate: 0.95 },
    ],
    preLimitDb: 6,
    why: 'canteen clatter: forks, cups and plates scattered over 14 s',
  },
  ambCrickets: {
    kind: 'loop', mode: 'segment', start: 0.5, len: 9.5, xfade: 1.2,
    layers: [{ pack: 'crickets', file: 'crickets_1.mp3' }],
    why: 'night crickets, cross-faded into a 9.5 s seamless bed',
  },
  // ---------- music (CC0, HoliznaCC0 – default choice per mood; candidates in qa/audio/candidates) ----------
  musicDay: { ...MUSIC_DAY, why: 'cosy day: "Ocean Breeze (LoFi, Ukulele, Peaceful)"' },
  // same source + recipe as musicDay (identical loop-length search → identical period); encoded as the 16 kbps stand-in
  musicDayLo: { ...MUSIC_DAY, why: 'low-quality stand-in of musicDay for the initial bundle (Brief §8.4), same source and period' },
  musicEvening: { kind: 'music', mode: 'segment', start: 10, len: 90, lenRange: [80, 96], xfade: 1.5, layers: [{ pack: 'holizna', file: 'ease-into-night-lofi-relax-chill.mp3', page: FMA + 'public-domain-lofi/ease-into-night-lofi-relax-chill/' }], why: 'calm evening: "Ease into Night (Lofi, Relax, Chill)"' },
  musicInspection: { kind: 'music', mode: 'segment', start: 15, len: 90, lenRange: [80, 96], xfade: 1.5, layers: [{ pack: 'holizna', file: 'extra-life-i-never-used.mp3', page: FMA + 'we-drove-all-night-game-soundtrack/extra-life-i-never-used/' }], why: 'tense-but-fun inspection: "Extra Life I Never Used" (game soundtrack)' },
};

/** music candidates offered for the G2 listening choice (not shipped). */
export const MUSIC_CANDIDATES: { mood: 'day' | 'evening' | 'inspection'; title: string; file: string; page: string; isDefault: boolean }[] = [
  { mood: 'day', title: 'Ocean Breeze ( LoFi , Ukulele , Peaceful )', file: 'ocean-breeze-lofi-ukulele-peaceful-mp3.mp3', page: FMA + 'public-domain-lofi/ocean-breeze-lofi-ukulele-peaceful-mp3/', isDefault: true },
  { mood: 'day', title: 'Doodles ( LoFi , Happy )', file: 'doodles-lofi-happy-mp3.mp3', page: FMA + 'public-domain-lofi/doodles-lofi-happy-mp3/', isDefault: false },
  { mood: 'evening', title: 'Ease into Night ( Lofi , Relax , Chill )', file: 'ease-into-night-lofi-relax-chill.mp3', page: FMA + 'public-domain-lofi/ease-into-night-lofi-relax-chill/', isDefault: true },
  { mood: 'inspection', title: 'Extra Life I Never Used', file: 'extra-life-i-never-used.mp3', page: FMA + 'we-drove-all-night-game-soundtrack/extra-life-i-never-used/', isDefault: true },
  { mood: 'inspection', title: 'Side Quest to Nowhere', file: 'side-quest-to-nowhere.mp3', page: FMA + 'we-drove-all-night-game-soundtrack/side-quest-to-nowhere/', isDefault: false },
];
