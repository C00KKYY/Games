'use strict';
// Spieldaten: Waffen, Passive, Gegner, Wellen, Bosse, Charaktere, Schmiede, Erfolge.

const RUN_LENGTH = 900; // 15 Minuten bis zum Endboss

// Waffen: base = Stufe 1, levels[i] gilt beim Erreichen von Stufe i+2.
const WEAPONS = {
  wand: {
    name: 'Magiegeschoss', desc: 'Schießt auf den nächsten Gegner.',
    base: { dmg: 10, cd: 1.15, amount: 1, speed: 420, pierce: 1, area: 1, dur: 1.6 },
    levels: [
      { amount: 1, t: '+1 Geschoss' }, { cd: -0.2, t: '−0,2 s Abklingzeit' }, { amount: 1, t: '+1 Geschoss' },
      { dmg: 10, t: '+10 Schaden' }, { amount: 1, t: '+1 Geschoss' }, { pierce: 1, t: 'Durchdringt 1 Gegner mehr' },
      { dmg: 10, t: '+10 Schaden' },
    ],
    evo: { with: 'hourglass', name: 'Arkansturm', desc: 'Ununterbrochenes Dauerfeuer, durchdringt mehr.', stats: { cd: -0.75, pierce: 2, dmg: 8 } },
  },
  whip: {
    name: 'Klinge', desc: 'Schlägt nach dem nächsten Gegner.',
    base: { dmg: 15, cd: 1.25, amount: 1, area: 1.05, pierce: 99, speed: 1, dur: 1 },
    levels: [
      { amount: 1, t: 'Schlägt auch nach hinten' }, { dmg: 6, t: '+6 Schaden' }, { area: 0.15, t: '+15 % Fläche' },
      { dmg: 6, t: '+6 Schaden' }, { area: 0.15, t: '+15 % Fläche' }, { dmg: 8, t: '+8 Schaden' },
      { cd: -0.25, t: '−0,25 s Abklingzeit' },
    ],
    evo: { with: 'heart', name: 'Blutklinge', desc: 'Riesige Schläge, jeder Treffer heilt.', stats: { area: 0.35, dmg: 15, amount: 1 } },
  },
  orbit: {
    name: 'Schutzkugeln', desc: 'Kugeln kreisen um dich.',
    base: { dmg: 10, cd: 3.2, amount: 2, area: 1, speed: 1, dur: 3, pierce: 99 },
    levels: [
      { amount: 1, t: '+1 Kugel' }, { speed: 0.3, area: 0.15, t: '+30 % Drehtempo, +15 % Fläche' }, { dur: 0.5, dmg: 5, t: '+0,5 s Dauer, +5 Schaden' },
      { amount: 1, t: '+1 Kugel' }, { speed: 0.3, area: 0.15, t: '+30 % Drehtempo, +15 % Fläche' }, { dmg: 8, t: '+8 Schaden' },
      { amount: 1, t: '+1 Kugel' },
    ],
    evo: { with: 'candle', name: 'Sternenkranz', desc: 'Die Kugeln verschwinden nie mehr.', stats: { dmg: 10, area: 0.2 } },
  },
  aura: {
    name: 'Glutaura', desc: 'Verbrennt alles in deiner Nähe.',
    base: { dmg: 8, cd: 0.7, amount: 1, area: 1, speed: 1, dur: 1, pierce: 99 },
    levels: [
      { area: 0.2, dmg: 2, t: '+20 % Fläche, +2 Schaden' }, { cd: -0.1, dmg: 1, t: 'Schneller, +1 Schaden' }, { area: 0.2, t: '+20 % Fläche' },
      { dmg: 3, t: '+3 Schaden' }, { area: 0.2, cd: -0.1, t: '+20 % Fläche, schneller' }, { dmg: 3, t: '+3 Schaden' },
      { area: 0.2, dmg: 3, t: '+20 % Fläche, +3 Schaden' },
    ],
    evo: { with: 'elixir', name: 'Lebensquell', desc: 'Größer, verlangsamt Gegner und heilt dich.', stats: { area: 0.4, dmg: 6 } },
  },
  lightning: {
    name: 'Blitz', desc: 'Trifft zufällige Gegner in der Nähe.',
    base: { dmg: 22, cd: 2.5, amount: 2, area: 1, speed: 1, dur: 1, pierce: 99 },
    levels: [
      { amount: 1, t: '+1 Blitz' }, { dmg: 10, area: 0.2, t: '+10 Schaden, +20 % Fläche' }, { amount: 1, t: '+1 Blitz' },
      { cd: -0.4, t: '−0,4 s Abklingzeit' }, { amount: 1, t: '+1 Blitz' }, { dmg: 15, t: '+15 Schaden' },
      { amount: 1, area: 0.2, t: '+1 Blitz, +20 % Fläche' },
    ],
    evo: { with: 'lens', name: 'Donnerkeil', desc: 'Blitze springen auf weitere Gegner über.', stats: { dmg: 15, amount: 2 } },
  },
  sickle: {
    name: 'Sichel', desc: 'Fliegt hinaus und kehrt zurück.',
    base: { dmg: 14, cd: 1.9, amount: 1, area: 1, speed: 430, dur: 1, pierce: 99 },
    levels: [
      { dmg: 6, t: '+6 Schaden' }, { amount: 1, t: '+1 Sichel' }, { area: 0.2, t: '+20 % Größe' },
      { speed: 80, dmg: 6, t: 'Schneller, +6 Schaden' }, { amount: 1, t: '+1 Sichel' }, { dmg: 10, t: '+10 Schaden' },
      { amount: 1, cd: -0.3, t: '+1 Sichel, schneller' },
    ],
    evo: { with: 'wing', name: 'Sturmsichel', desc: 'Viele riesige Sicheln kreisen weit hinaus.', stats: { amount: 2, area: 0.4, dmg: 15, cd: -0.4 } },
  },
  fire: {
    name: 'Feuerflasche', desc: 'Hinterlässt brennende Pfützen.',
    base: { dmg: 7, cd: 3, amount: 1, area: 1, speed: 1, dur: 2.6, pierce: 99 },
    levels: [
      { amount: 1, t: '+1 Flasche' }, { dmg: 3, area: 0.15, t: '+3 Schaden, +15 % Fläche' }, { dur: 0.6, t: '+0,6 s Brenndauer' },
      { amount: 1, t: '+1 Flasche' }, { dmg: 4, area: 0.15, t: '+4 Schaden, +15 % Fläche' }, { cd: -0.6, t: '−0,6 s Abklingzeit' },
      { amount: 1, dmg: 4, t: '+1 Flasche, +4 Schaden' },
    ],
    evo: { with: 'might', name: 'Höllenfeuer', desc: 'Riesige Feuerfelder, die lange brennen.', stats: { area: 0.5, dmg: 8, dur: 2, amount: 1 } },
  },
  nova: {
    name: 'Frostnova', desc: 'Eisring, der Gegner verlangsamt.',
    base: { dmg: 16, cd: 4.2, amount: 1, area: 1, speed: 1, dur: 2.2, pierce: 99 },
    levels: [
      { area: 0.2, t: '+20 % Fläche' }, { dmg: 10, t: '+10 Schaden' }, { cd: -0.6, t: '−0,6 s Abklingzeit' },
      { area: 0.2, dur: 0.5, t: '+20 % Fläche, längere Kälte' }, { dmg: 12, t: '+12 Schaden' }, { cd: -0.6, t: '−0,6 s Abklingzeit' },
      { amount: 1, t: 'Zweiter Ring' },
    ],
    evo: { with: 'armor', name: 'Ewiges Eis', desc: 'Friert Gegner komplett ein.', stats: { dmg: 20, area: 0.3, cd: -0.6 } },
  },
  knives: {
    name: 'Dolche', desc: 'Schnelle Würfe auf den nächsten Gegner.',
    base: { dmg: 8, cd: 0.85, amount: 1, area: 1, speed: 650, dur: 1, pierce: 1 },
    levels: [
      { amount: 1, t: '+1 Dolch' }, { amount: 1, dmg: 3, t: '+1 Dolch, +3 Schaden' }, { pierce: 1, t: 'Durchdringt 1 Gegner mehr' },
      { amount: 1, t: '+1 Dolch' }, { dmg: 5, t: '+5 Schaden' }, { amount: 1, t: '+1 Dolch' },
      { pierce: 1, dmg: 5, t: 'Durchdringt mehr, +5 Schaden' },
    ],
    evo: { with: 'clover', name: 'Tausend Klingen', desc: 'Ein endloser Strom kritischer Klingen.', stats: { cd: -0.65, crit: 0.25, pierce: 1 } },
  },
};
const WEAPON_MAX = 8;

const PASSIVES = {
  might:     { name: 'Kraft', desc: '+10 % Schaden', max: 5, per: { might: 0.1 } },
  armor:     { name: 'Panzer', desc: '+1 Rüstung (weniger Schaden)', max: 5, per: { armor: 1 } },
  heart:     { name: 'Herz', desc: '+20 % max. Leben', max: 5, per: { maxHpMul: 0.2 } },
  boots:     { name: 'Stiefel', desc: '+10 % Lauftempo', max: 5, per: { speedMul: 0.1 } },
  magnet:    { name: 'Magnet', desc: '+40 % Sammelradius', max: 5, per: { magnetMul: 0.4 } },
  hourglass: { name: 'Sanduhr', desc: '−8 % Abklingzeit', max: 5, per: { cooldown: -0.08 } },
  lens:      { name: 'Linse', desc: '+10 % Fläche', max: 5, per: { area: 0.1 } },
  mirror:    { name: 'Spiegel', desc: '+1 Geschoss für alle Waffen', max: 2, per: { amount: 1 } },
  clover:    { name: 'Kleeblatt', desc: '+10 % Glück, +3 % Krit', max: 5, per: { luck: 0.1, crit: 0.03 } },
  elixir:    { name: 'Elixier', desc: '+0,25 Leben pro Sekunde', max: 5, per: { regen: 0.25 } },
  candle:    { name: 'Kerze', desc: '+12 % Wirkdauer', max: 5, per: { duration: 0.12 } },
  wing:      { name: 'Flügel', desc: '+12 % Geschosstempo', max: 5, per: { projSpeed: 0.12 } },
};
const MAX_WEAPONS = 6, MAX_PASSIVES = 6;

const ENEMIES = {
  bat:     { name: 'Fledermaus', hp: 5, speed: 108, dmg: 5, xp: 1, r: 10, kb: 1.3 },
  slime:   { name: 'Schleim', hp: 10, speed: 52, dmg: 7, xp: 1, r: 13, kb: 1.0 },
  skel:    { name: 'Skelett', hp: 20, speed: 72, dmg: 10, xp: 2, r: 13, kb: 0.9 },
  ghost:   { name: 'Geist', hp: 15, speed: 92, dmg: 8, xp: 2, r: 13, kb: 1.1 },
  ghoul:   { name: 'Ghul', hp: 48, speed: 50, dmg: 13, xp: 3, r: 16, kb: 0.6 },
  spitter: { name: 'Spucker', hp: 28, speed: 58, dmg: 9, xp: 3, r: 14, kb: 0.8, ranged: true },
  wraith:  { name: 'Irrlicht', hp: 55, speed: 116, dmg: 13, xp: 4, r: 14, kb: 0.9 },
  brute:   { name: 'Oger', hp: 150, speed: 46, dmg: 20, xp: 8, r: 23, kb: 0.3 },
  golem:   { name: 'Golem', hp: 380, speed: 40, dmg: 26, xp: 15, r: 29, kb: 0.15 },
};

// Spawn-Wellen je Minute.
const WAVES = [
  { pool: { bat: 3, slime: 2 }, rate: 1.4, cap: 35 },
  { pool: { bat: 2, slime: 3, skel: 1 }, rate: 2.2, cap: 55 },
  { pool: { slime: 2, skel: 3, ghost: 1 }, rate: 2.8, cap: 75 },
  { pool: { skel: 3, ghost: 2, bat: 2 }, rate: 3.4, cap: 95 },
  { pool: { ghost: 2, ghoul: 2, skel: 2, spitter: 1 }, rate: 4.0, cap: 115 },
  { pool: { ghoul: 3, spitter: 1, bat: 3 }, rate: 4.8, cap: 135 },
  { pool: { ghoul: 2, wraith: 1, skel: 3, spitter: 1 }, rate: 5.4, cap: 155 },
  { pool: { wraith: 2, ghoul: 2, brute: 1 }, rate: 5.8, cap: 175 },
  { pool: { brute: 1, ghost: 3, wraith: 2, spitter: 1 }, rate: 6.4, cap: 195 },
  { pool: { brute: 2, ghoul: 3, wraith: 2 }, rate: 6.8, cap: 215 },
  { pool: { golem: 1, brute: 2, wraith: 3, spitter: 1 }, rate: 7.4, cap: 235 },
  { pool: { golem: 1, wraith: 3, ghoul: 3, bat: 3 }, rate: 8.4, cap: 265 },
  { pool: { golem: 2, brute: 3, wraith: 3 }, rate: 9.0, cap: 290 },
  { pool: { golem: 2, brute: 2, wraith: 4, spitter: 2 }, rate: 10, cap: 315 },
  { pool: { golem: 3, brute: 3, wraith: 4, ghost: 2 }, rate: 11, cap: 340 },
];

// Zeitgesteuerte Ereignisse.
const EVENTS = [
  { t: 105, kind: 'swarm', type: 'bat', n: 36, text: 'Fledermausschwarm!' },
  { t: 270, kind: 'ring', type: 'slime', n: 34, text: 'Umzingelt!' },
  { t: 420, kind: 'swarm', type: 'ghost', n: 44, text: 'Geisterzug!' },
  { t: 615, kind: 'ring', type: 'ghoul', n: 40, text: 'Umzingelt!' },
  { t: 690, kind: 'swarm', type: 'wraith', n: 50, text: 'Irrlichter!' },
  { t: 810, kind: 'ring', type: 'brute', n: 30, text: 'Die Oger kommen!' },
  { t: 860, kind: 'swarm', type: 'bat', n: 90, text: 'Die Nacht erwacht …' },
];

const BOSSES = [
  { id: 'slimeking', name: 'Schleimkönig', t: 180, sprite: 'slime', hp: 1400, speed: 60, dmg: 15, r: 46, xp: 100, skills: ['dash'] },
  { id: 'bonelord', name: 'Knochenfürst', t: 360, sprite: 'skel', hp: 4800, speed: 64, dmg: 24, r: 42, xp: 200, skills: ['summon', 'dash'] },
  { id: 'bloodcount', name: 'Blutgraf', t: 540, sprite: 'wraith', hp: 10000, speed: 78, dmg: 28, r: 42, xp: 300, skills: ['nova', 'dash'] },
  { id: 'colossus', name: 'Steinkoloss', t: 720, sprite: 'golem', hp: 20000, speed: 50, dmg: 36, r: 58, xp: 400, skills: ['slam', 'summon'] },
  { id: 'night', name: 'Die Nacht', t: 900, sprite: 'night', hp: 52000, speed: 72, dmg: 45, r: 64, xp: 1000, skills: ['dash', 'nova', 'slam', 'summon'], final: true },
];

const CHARS = {
  aron:  { name: 'Aron', title: 'der Wächter', weapon: 'whip', color: '#4f8cff', bonus: { maxHp: 20, armor: 1 }, text: '+20 Leben, +1 Rüstung' },
  mira:  { name: 'Mira', title: 'die Magierin', weapon: 'wand', color: '#b05cff', bonus: { cooldown: -0.1 }, text: '−10 % Abklingzeit' },
  kael:  { name: 'Kael', title: 'der Jäger', weapon: 'knives', color: '#3fdc7a', bonus: { speedMul: 0.15, projSpeed: 0.1 }, text: '+15 % Tempo, +10 % Geschosstempo', unlock: 'lvl20' },
  sela:  { name: 'Sela', title: 'die Priesterin', weapon: 'aura', color: '#ffd34f', bonus: { regen: 0.4, maxHp: 10 }, text: '+0,4 Leben/s, +10 Leben', unlock: 't10' },
  brom:  { name: 'Brom', title: 'der Schmied', weapon: 'sickle', color: '#ff8a3c', bonus: { might: 0.15, speedMul: -0.05 }, text: '+15 % Schaden, etwas langsamer', unlock: 'kills3000' },
  nyx:   { name: 'Nyx', title: 'die Sturmhexe', weapon: 'lightning', color: '#5ce1ff', bonus: { area: 0.1, luck: 0.2 }, text: '+10 % Fläche, +20 % Glück', unlock: 'evo1' },
  eira:  { name: 'Eira', title: 'die Frostwächterin', weapon: 'nova', color: '#9fd8ff', bonus: { armor: 1, magnetMul: 0.3 }, text: '+1 Rüstung, +30 % Sammelradius', unlock: 'boss_bonelord' },
  lio:   { name: 'Lio', title: 'der Glückspilz', weapon: 'orbit', color: '#7cffb2', bonus: { luck: 0.3, greed: 0.25 }, text: '+30 % Glück, +25 % Gold', unlock: 'gold2000' },
  ignis: { name: 'Ignis', title: 'der Brandstifter', weapon: 'fire', color: '#ff4f4f', bonus: { duration: 0.2, might: 0.1 }, text: '+20 % Dauer, +10 % Schaden', unlock: 'win' },
};

const SHOP = [
  { id: 'might', name: 'Macht', icon: 'might', max: 5, cost: 120, per: { might: 0.05 }, text: '+5 % Schaden' },
  { id: 'armor', name: 'Rüstung', icon: 'armor', max: 3, cost: 160, per: { armor: 1 }, text: '+1 Rüstung' },
  { id: 'maxhp', name: 'Lebenskraft', icon: 'heart', max: 3, cost: 120, per: { maxHpMul: 0.1 }, text: '+10 % max. Leben' },
  { id: 'regen', name: 'Erholung', icon: 'elixir', max: 5, cost: 120, per: { regen: 0.1 }, text: '+0,1 Leben/s' },
  { id: 'speed', name: 'Tempo', icon: 'boots', max: 2, cost: 200, per: { speedMul: 0.05 }, text: '+5 % Lauftempo' },
  { id: 'magnet', name: 'Anziehung', icon: 'magnet', max: 2, cost: 150, per: { magnetMul: 0.25 }, text: '+25 % Sammelradius' },
  { id: 'growth', name: 'Wachstum', icon: 'growth', max: 5, cost: 180, per: { growth: 0.04 }, text: '+4 % Erfahrung' },
  { id: 'greed', name: 'Gier', icon: 'coin', max: 5, cost: 120, per: { greed: 0.1 }, text: '+10 % Gold' },
  { id: 'cd', name: 'Eile', icon: 'hourglass', max: 2, cost: 450, per: { cooldown: -0.03 }, text: '−3 % Abklingzeit' },
  { id: 'area', name: 'Reichweite', icon: 'lens', max: 2, cost: 300, per: { area: 0.05 }, text: '+5 % Fläche' },
  { id: 'dur', name: 'Ausdauer', icon: 'candle', max: 2, cost: 300, per: { duration: 0.1 }, text: '+10 % Wirkdauer' },
  { id: 'luck', name: 'Glück', icon: 'clover', max: 3, cost: 350, per: { luck: 0.1 }, text: '+10 % Glück' },
  { id: 'reroll', name: 'Neu würfeln', icon: 'dice', max: 4, cost: 200, per: { rerolls: 1 }, text: '+1 Neuwurf pro Lauf' },
  { id: 'skip', name: 'Überspringen', icon: 'skip', max: 3, cost: 120, per: { skips: 1 }, text: '+1 Überspringen pro Lauf' },
  { id: 'banish', name: 'Verbannen', icon: 'banish', max: 3, cost: 280, per: { banish: 1 }, text: '+1 Verbannen pro Lauf' },
  { id: 'amount', name: 'Doppelung', icon: 'mirror', max: 1, cost: 2400, per: { amount: 1 }, text: '+1 Geschoss für alle Waffen' },
  { id: 'revival', name: 'Wiedergeburt', icon: 'revive', max: 1, cost: 2000, per: { revival: 1 }, text: 'Einmal pro Lauf wiederbeleben' },
];

function shopPrice(item, save) {
  const lvl = save.shop[item.id] || 0;
  let bought = 0;
  for (const k in save.shop) bought += save.shop[k];
  return Math.round(item.cost * (lvl + 1) * (1 + 0.08 * bought) / 5) * 5;
}

// Nachtstufen (Schwierigkeit) – freigeschaltet durch Siege.
const HEAT = [
  { name: 'Normal', hp: 1, speed: 1, rate: 1, gold: 1 },
  { name: 'Nachtstufe 1', hp: 1.3, speed: 1.05, rate: 1.15, gold: 1.3 },
  { name: 'Nachtstufe 2', hp: 1.6, speed: 1.1, rate: 1.3, gold: 1.6 },
  { name: 'Nachtstufe 3', hp: 2.0, speed: 1.15, rate: 1.45, gold: 2.0 },
  { name: 'Nachtstufe 4', hp: 2.5, speed: 1.2, rate: 1.6, gold: 2.5 },
  { name: 'Nachtstufe 5', hp: 3.2, speed: 1.25, rate: 1.8, gold: 3.2 },
];

// Erfolge: check(run, save) wird am Laufende und zwischendurch geprüft.
const ACHIEVEMENTS = [
  { id: 't1', name: 'Erste Nacht', text: 'Überlebe 1 Minute', gold: 20, check: r => r.t >= 60 },
  { id: 't5', name: 'Zähe Seele', text: 'Überlebe 5 Minuten', gold: 60, check: r => r.t >= 300 },
  { id: 't10', name: 'Nachtwache', text: 'Überlebe 10 Minuten', gold: 120, unlock: 'Sela', check: r => r.t >= 600 },
  { id: 'win', name: 'Morgengrauen', text: 'Besiege Die Nacht (15 Minuten)', gold: 300, unlock: 'Ignis + Nachtstufe 1', check: r => r.won },
  { id: 'lvl10', name: 'Lehrling', text: 'Erreiche Stufe 10', gold: 30, check: r => r.level >= 10 },
  { id: 'lvl20', name: 'Geselle', text: 'Erreiche Stufe 20', gold: 60, unlock: 'Kael', check: r => r.level >= 20 },
  { id: 'lvl40', name: 'Meister', text: 'Erreiche Stufe 40', gold: 150, check: r => r.level >= 40 },
  { id: 'lvl60', name: 'Legende', text: 'Erreiche Stufe 60', gold: 300, check: r => r.level >= 60 },
  { id: 'kill500', name: 'Aufräumer', text: '500 Gegner in einem Lauf', gold: 40, check: r => r.kills >= 500 },
  { id: 'kill2000', name: 'Sturmflut', text: '2000 Gegner in einem Lauf', gold: 120, check: r => r.kills >= 2000 },
  { id: 'kill5000', name: 'Vernichter', text: '5000 Gegner in einem Lauf', gold: 300, check: r => r.kills >= 5000 },
  { id: 'kills3000', name: 'Jäger der Nacht', text: 'Insgesamt 3000 Gegner', gold: 100, unlock: 'Brom', check: (r, s) => s.stats.kills >= 3000 },
  { id: 'kills25k', name: 'Plage', text: 'Insgesamt 25 000 Gegner', gold: 400, check: (r, s) => s.stats.kills >= 25000 },
  { id: 'evo1', name: 'Verwandlung', text: 'Entwickle eine Waffe', gold: 100, unlock: 'Nyx', check: (r, s) => s.stats.evolutions >= 1 },
  { id: 'evo3', name: 'Alchemist', text: 'Entdecke 3 Entwicklungen', gold: 200, check: (r, s) => Object.keys(s.evolved).length >= 3 },
  { id: 'evoall', name: 'Großmeister', text: 'Entdecke alle 9 Entwicklungen', gold: 1000, check: (r, s) => Object.keys(s.evolved).length >= 9 },
  { id: 'evo2run', name: 'Doppelschlag', text: '2 Entwicklungen in einem Lauf', gold: 150, check: r => r.evolvedCount >= 2 },
  { id: 'boss_slimeking', name: 'Königsmord', text: 'Besiege den Schleimkönig', gold: 50, check: (r, s) => s.bosses.slimeking },
  { id: 'boss_bonelord', name: 'Knochenbrecher', text: 'Besiege den Knochenfürsten', gold: 100, unlock: 'Eira', check: (r, s) => s.bosses.bonelord },
  { id: 'boss_bloodcount', name: 'Pfählung', text: 'Besiege den Blutgrafen', gold: 150, check: (r, s) => s.bosses.bloodcount },
  { id: 'boss_colossus', name: 'Steinmetz', text: 'Besiege den Steinkoloss', gold: 200, check: (r, s) => s.bosses.colossus },
  { id: 'chest10', name: 'Schatzsucher', text: 'Öffne insgesamt 10 Truhen', gold: 60, check: (r, s) => s.stats.chests >= 10 },
  { id: 'gold2000', name: 'Goldrausch', text: 'Verdiene insgesamt 2000 Gold', gold: 100, unlock: 'Lio', check: (r, s) => s.stats.goldEarned >= 2000 },
  { id: 'nohit3', name: 'Unberührbar', text: '3 Minuten ohne Treffer überleben', gold: 80, check: r => r.t >= 180 && r.firstHit === null },
  { id: 'full', name: 'Vollausstattung', text: '6 Waffen und 6 Passive in einem Lauf', gold: 150, check: r => r.weapons.length >= 6 && r.passives.length >= 6 },
  { id: 'heat3', name: 'Tiefe Nacht', text: 'Gewinne auf Nachtstufe 3', gold: 500, check: r => r.won && r.heat >= 3 },
  { id: 'heat5', name: 'Ewige Finsternis', text: 'Gewinne auf Nachtstufe 5', gold: 1500, check: r => r.won && r.heat >= 5 },
];
