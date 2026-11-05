'use strict';
// Spieldaten: Waffen, Passive, Gegner, Wellen, Bosse, Charaktere, Schmiede, Erfolge.


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
    evo: { with: 'hourglass', name: 'Arkansturm', desc: 'Dauerfeuer, das mehr Gegner durchdringt.', stats: { cd: -0.75, pierce: 2, dmg: 8 } },
  },
  whip: {
    name: 'Klinge', desc: 'Schlägt nach dem nächsten Gegner.',
    base: { dmg: 15, cd: 1.25, amount: 1, area: 1.05, pierce: 99, speed: 1, dur: 1 },
    levels: [
      { amount: 1, t: 'Schlägt auch nach hinten' }, { dmg: 8, t: '+8 Schaden' }, { area: 0.15, t: '+15 % Fläche' },
      { dmg: 8, t: '+8 Schaden' }, { area: 0.15, t: '+15 % Fläche' }, { dmg: 12, t: '+12 Schaden' },
      { cd: -0.25, t: '−0,25 s Abklingzeit' },
    ],
    evo: { with: 'heart', name: 'Blutklinge', desc: 'Riesige Schläge, jeder Treffer heilt.', stats: { area: 0.35, dmg: 20, amount: 1 } },
  },
  orbit: {
    name: 'Schutzkugeln', desc: 'Kugeln kreisen um dich.',
    base: { dmg: 14, cd: 2.6, amount: 2, area: 1, speed: 1, dur: 3, pierce: 99 },
    levels: [
      { amount: 1, t: '+1 Kugel' }, { speed: 0.3, area: 0.15, t: '+30 % Drehtempo, +15 % Fläche' }, { dur: 0.5, dmg: 8, t: '+0,5 s Wirkdauer, +8 Schaden' },
      { amount: 1, t: '+1 Kugel' }, { speed: 0.3, area: 0.15, t: '+30 % Drehtempo, +15 % Fläche' }, { dmg: 12, t: '+12 Schaden' },
      { amount: 1, t: '+1 Kugel' },
    ],
    evo: { with: 'candle', name: 'Sternenkranz', desc: 'Die Kugeln verschwinden nie mehr.', stats: { dmg: 15, area: 0.2 } },
  },
  aura: {
    name: 'Glutaura', desc: 'Verbrennt alles in deiner Nähe.',
    base: { dmg: 8, cd: 0.7, amount: 1, area: 1, speed: 1, dur: 1, pierce: 99 },
    levels: [
      { area: 0.2, dmg: 2, t: '+20 % Fläche, +2 Schaden' }, { cd: -0.1, dmg: 1, t: '−0,1 s Abklingzeit, +1 Schaden' }, { area: 0.2, t: '+20 % Fläche' },
      { dmg: 3, t: '+3 Schaden' }, { area: 0.2, cd: -0.1, t: '+20 % Fläche, −0,1 s Abklingzeit' }, { dmg: 3, t: '+3 Schaden' },
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
      { dmg: 6, t: '+6 Schaden' }, { amount: 1, t: '+1 Sichel' }, { area: 0.2, t: '+20 % Fläche' },
      { speed: 80, dmg: 6, t: 'Fliegt schneller, +6 Schaden' }, { amount: 1, t: '+1 Sichel' }, { dmg: 10, t: '+10 Schaden' },
      { amount: 1, cd: -0.3, t: '+1 Sichel, −0,3 s Abklingzeit' },
    ],
    evo: { with: 'wing', name: 'Sturmsichel', desc: 'Viele riesige Sicheln fliegen weit hinaus und kehren zurück.', stats: { amount: 2, area: 0.4, dmg: 15, cd: -0.4 } },
  },
  fire: {
    name: 'Feuerflasche', desc: 'Hinterlässt brennende Pfützen.',
    base: { dmg: 7, cd: 3, amount: 1, area: 1, speed: 1, dur: 2.6, pierce: 99 },
    levels: [
      { amount: 1, t: '+1 Flasche' }, { dmg: 3, area: 0.15, t: '+3 Schaden, +15 % Fläche' }, { dur: 0.6, t: '+0,6 s Brenndauer' },
      { amount: 1, t: '+1 Flasche' }, { dmg: 4, area: 0.15, t: '+4 Schaden, +15 % Fläche' }, { cd: -0.6, t: '−0,6 s Abklingzeit' },
      { amount: 1, dmg: 4, t: '+1 Flasche, +4 Schaden' },
    ],
    evo: { with: 'might', name: 'Höllenfeuer', desc: 'Riesige Feuerfelder, die lange brennen.', stats: { area: 0.3, dmg: 8, dur: 1, amount: 1 } },
  },
  nova: {
    name: 'Frostnova', desc: 'Eisring, der Gegner verlangsamt.',
    base: { dmg: 16, cd: 4.2, amount: 1, area: 1, speed: 1, dur: 2.2, pierce: 99 },
    levels: [
      { area: 0.2, t: '+20 % Fläche' }, { dmg: 10, t: '+10 Schaden' }, { cd: -0.6, t: '−0,6 s Abklingzeit' },
      { area: 0.2, dur: 0.5, t: '+20 % Fläche, längere Kälte' }, { dmg: 12, t: '+12 Schaden' }, { cd: -0.6, t: '−0,6 s Abklingzeit' },
      { amount: 1, t: 'Zweiter Ring' },
    ],
    evo: { with: 'armor', name: 'Ewiges Eis', desc: 'Friert Gegner ein, Bosse werden stark verlangsamt.', stats: { dmg: 20, area: 0.3, cd: -0.6 } },
  },
  knives: {
    name: 'Dolche', desc: 'Schnelle Würfe auf den nächsten Gegner.',
    base: { dmg: 8, cd: 0.85, amount: 1, area: 1, speed: 650, dur: 1, pierce: 1 },
    levels: [
      { amount: 1, t: '+1 Dolch' }, { amount: 1, dmg: 3, t: '+1 Dolch, +3 Schaden' }, { pierce: 1, t: 'Durchdringt 1 Gegner mehr' },
      { amount: 1, t: '+1 Dolch' }, { dmg: 5, t: '+5 Schaden' }, { amount: 1, t: '+1 Dolch' },
      { pierce: 1, dmg: 5, t: 'Durchdringt mehr, +5 Schaden' },
    ],
    evo: { with: 'clover', name: 'Tausend Klingen', desc: 'Ein endloser Strom von Dolchen, die oft kritisch treffen.', stats: { cd: -0.65, crit: 0.25, pierce: 1 } },
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
  elixir:    { name: 'Elixier', desc: '+0,25 Leben/s', max: 5, per: { regen: 0.25 } },
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
  // Fernkämpfer (M9): ranged = Angriffsart, band = Wunschabstand, cd = Abklingzeit (s), wind = Ausholen (s),
  // retreat = Rückzugstempo (Anteil), strafe = Seitwärtstempo (Anteil)
  spitter: { name: 'Spucker', hp: 28, speed: 62, dmg: 9, xp: 3, r: 14, kb: 0.8, ranged: 'spit', band: [190, 260], cd: [3.0, 3.8], wind: 0.45, retreat: 0.6, strafe: 0.35 },
  cinder:  { name: 'Aschenkessel', hp: 40, speed: 44, dmg: 10, xp: 4, r: 15, kb: 0.6, ranged: 'mortar', band: [260, 340], cd: [4.6, 5.6], wind: 0.55, retreat: 0.6, strafe: 0 },
  moth:    { name: 'Nadelmotte', hp: 22, speed: 96, dmg: 12, xp: 3, r: 13, kb: 1.2, ranged: 'needle', band: [280, 380], cd: [4.6, 5.4], wind: 0.9, retreat: 0.6, strafe: 0.3 },
  bell:    { name: 'Totenglocke', hp: 80, speed: 34, dmg: 11, xp: 6, r: 17, kb: 0.4, ranged: 'ring', band: [220, 320], cd: [5.0, 6.0], wind: 0.7, retreat: 0, strafe: 0.2 },
  wraith:  { name: 'Irrlicht', hp: 55, speed: 116, dmg: 13, xp: 4, r: 14, kb: 0.9 },
  brute:   { name: 'Oger', hp: 150, speed: 46, dmg: 20, xp: 8, r: 23, kb: 0.3 },
  golem:   { name: 'Golem', hp: 380, speed: 40, dmg: 26, xp: 15, r: 29, kb: 0.15 },
};

const CHARS = {
  aron:  { name: 'Aron', title: 'der Wächter', weapon: 'whip', color: '#4f8cff', bonus: { maxHp: 20, armor: 1 }, text: '+20 Leben, +1 Rüstung' },
  mira:  { name: 'Mira', title: 'die Magierin', weapon: 'wand', color: '#b05cff', bonus: { cooldown: -0.1 }, text: '−10 % Abklingzeit' },
  kael:  { name: 'Kael', title: 'der Jäger', weapon: 'knives', color: '#3fdc7a', bonus: { speedMul: 0.15, projSpeed: 0.1 }, text: '+15 % Lauftempo, +10 % Geschosstempo', unlock: 'lvl20' },
  sela:  { name: 'Sela', title: 'die Priesterin', weapon: 'aura', color: '#ffd34f', bonus: { regen: 0.4, maxHp: 10 }, text: '+0,4 Leben/s, +10 Leben', unlock: 't10' },
  brom:  { name: 'Brom', title: 'der Schmied', weapon: 'sickle', color: '#ff8a3c', bonus: { might: 0.15, speedMul: -0.05 }, text: '+15 % Schaden, etwas langsamer', unlock: 'kills3000' },
  nyx:   { name: 'Nyx', title: 'die Sturmhexe', weapon: 'lightning', color: '#5ce1ff', bonus: { area: 0.1, luck: 0.2 }, text: '+10 % Fläche, +20 % Glück', unlock: 'evo1' },
  eira:  { name: 'Eira', title: 'die Frostwächterin', weapon: 'nova', color: '#9fd8ff', bonus: { armor: 1, magnetMul: 0.3 }, text: '+1 Rüstung, +30 % Sammelradius', unlock: 'boss_bonelord' },
  lio:   { name: 'Lio', title: 'der Glückspilz', weapon: 'orbit', color: '#7cffb2', bonus: { luck: 0.3, greed: 0.25 }, text: '+30 % Glück, +25 % Gold', unlock: 'gold2000' },
  ignis: { name: 'Ignis', title: 'der Brandstifter', weapon: 'fire', color: '#ff4f4f', bonus: { duration: 0.2, might: 0.1 }, text: '+20 % Wirkdauer, +10 % Schaden', unlock: 'win' },
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
  { id: 'dur', name: 'Beständigkeit', icon: 'candle', max: 2, cost: 300, per: { duration: 0.1 }, text: '+10 % Wirkdauer' },
  { id: 'luck', name: 'Glück', icon: 'clover', max: 3, cost: 350, per: { luck: 0.1 }, text: '+10 % Glück' },
  { id: 'reroll', name: 'Neu würfeln', icon: 'dice', max: 4, cost: 200, per: { rerolls: 1 }, text: '+1 Neuwurf pro Lauf' },
  { id: 'skip', name: 'Überspringen', icon: 'skip', max: 3, cost: 120, per: { skips: 1 }, text: '+1 Überspringen pro Lauf' },
  { id: 'banish', name: 'Verbannen', icon: 'banish', max: 3, cost: 280, per: { banish: 1 }, text: '+1 Verbannen pro Lauf' },
  { id: 'amount', name: 'Mehrfachschuss', icon: 'mirror', max: 1, cost: 2400, per: { amount: 1 }, text: '+1 Geschoss für alle Waffen' },
  { id: 'revival', name: 'Wiedergeburt', icon: 'revive', max: 1, cost: 2000, per: { revival: 1 }, text: 'Einmal pro Lauf mit halbem Leben wiederauferstehen' },
];

function shopPrice(item, save) {
  const lvl = save.shop[item.id] || 0;
  let bought = 0;
  for (const k in save.shop) bought += save.shop[k];
  return Math.round(item.cost * (lvl + 1) * (1 + 0.05 * bought) / 5) * 5;
}

// Erstattungswert eines Spielstands ohne Buchführung: günstigste mögliche Kaufreihenfolge,
// damit nie mehr erstattet wird, als bezahlt wurde.
function shopRefundValue(shop) {
  let back = 0;
  const tmp = { shop: {} };
  for (const it of SHOP.slice().sort((a, b) => b.cost - a.cost)) {
    const lvl = shop[it.id] || 0;
    for (let i = 0; i < lvl; i++) { back += shopPrice(it, tmp); tmp.shop[it.id] = (tmp.shop[it.id] || 0) + 1; }
  }
  return back;
}

// Nachtstufen (Schwierigkeit) – je Land freigeschaltet.
const HEAT = [
  { name: 'Normal', hp: 1, speed: 1, rate: 1, dmg: 1, gold: 1 },
  { name: 'Nachtstufe 1', hp: 1.25, speed: 1.05, rate: 1.1, dmg: 1.1, gold: 1.3 },
  { name: 'Nachtstufe 2', hp: 1.5, speed: 1.1, rate: 1.2, dmg: 1.2, gold: 1.6 },
  { name: 'Nachtstufe 3', hp: 1.9, speed: 1.15, rate: 1.3, dmg: 1.3, gold: 2.0 },
  { name: 'Nachtstufe 4', hp: 2.4, speed: 1.2, rate: 1.4, dmg: 1.4, gold: 2.5 },
  { name: 'Nachtstufe 5', hp: 3.0, speed: 1.25, rate: 1.5, dmg: 1.5, gold: 3.2 },
];

// ---------- Länder (Kapitel) ----------
// Jedes Land: Dauer, Wellen je Minute, Ereignisse, Bosse (final = Land befreit), Boden, Deko,
// Farbtönung einzelner Gegner, Gegner-Modifikatoren (mods: all/je Typ: hp, speed, xp) und
// Faktoren auf Lebenspunkte, Schaden und Spawnrate (mult, per Bot-Simulation abgestimmt).
// Bosse: summon = welcher Gegnertyp beschworen wird; Endboss-HP sind absolut (nicht mit mult skaliert).
// Boss-Fernangriffe (M9): skills nennt sie, cast[skill] gibt die Grundform (prim: fan, lances, rain, spiral, lanes)
// und ihre Werte; 'nova' braucht keinen Eintrag. rangedFrom: ab dieser Sekunde kommen Fernkämpfer im Nachschub.
const STAGES = [
  {
    id: 'graveyard', name: 'Alter Friedhof', minutes: 10,
    intro: 'Hier ruhen die Toten nicht mehr. Halte durch, bis sich der Herr der Gruft zeigt.',
    outro: 'Der Friedhof wird still, und seine Glut glimmt wieder.',
    ground: { base: '#4d6b64', speckle: ['#6e9a7a', '#2a4044'], grass: '#8cc88a' },
    decor: ['grave', 'grave', 'cross', 'bones', 'rock', 'mush', 'stump', 'flower'],
    tints: {  }, mods: {  },
    mult: { hp: 0.95, dmg: 1.0, rate: 1 },
    rangedFrom: 40, // Fernkämpfer im normalen Nachschub erst ab dieser Sekunde
    waves: [
      { pool: { bat: 2, slime: 3, spitter: 1 }, rate: 2.1, cap: 42 },
      { pool: { bat: 3, slime: 2, skel: 2, spitter: 2 }, rate: 3, cap: 65 },
      { pool: { slime: 2, skel: 3, ghost: 2, spitter: 2 }, rate: 3.4, cap: 85 },
      { pool: { skel: 3, ghost: 2, bat: 2, spitter: 1 }, rate: 3.4, cap: 95 },
      { pool: { ghost: 2, ghoul: 2, skel: 2, spitter: 2, bell: 1 }, rate: 4, cap: 115 },
      { pool: { ghoul: 3, spitter: 2, bat: 3, bell: 1 }, rate: 4.8, cap: 135 },
      { pool: { ghoul: 2, wraith: 1, skel: 3, spitter: 2, bell: 1 }, rate: 5.4, cap: 155 },
      { pool: { wraith: 2, ghoul: 2, brute: 1, spitter: 1, bell: 1 }, rate: 5.8, cap: 175 },
      { pool: { brute: 1, ghost: 3, wraith: 2, spitter: 2, bell: 1 }, rate: 6.4, cap: 195 },
      { pool: { brute: 2, ghoul: 3, wraith: 2, bell: 2 }, rate: 6.8, cap: 215 },
    ],
    events: [
      { t: 40, kind: 'arc', type: 'spitter', n: 2, text: 'Spucker in Stellung!' },
      { t: 50, kind: 'ring', type: 'slime', n: 24, text: 'Umzingelt!' },
      { t: 85, kind: 'arc', type: 'spitter', n: 3, text: 'Spucker in Stellung!' },
      { t: 105, kind: 'swarm', type: 'bat', n: 36, text: 'Fledermausschwarm!' },
      { t: 150, kind: 'ring', type: 'skel', n: 28, text: 'Umzingelt!' },
      { t: 240, kind: 'ring', type: 'slime', n: 34, text: 'Umzingelt!' },
      { t: 270, kind: 'arc', type: 'bell', n: 2, text: 'Die Glocken läuten!' },
      { t: 315, kind: 'swarm', type: 'ghost', n: 44, text: 'Geisterzug!' },
      { t: 435, kind: 'ring', type: 'ghoul', n: 36, text: 'Umzingelt!' },
    ],
    bosses: [
      { id: 'slimeking', name: 'Schleimkönig', t: 180, sprite: 'slime', hp: 1400, speed: 60, dmg: 15, r: 46, xp: 100, skills: ['dash', 'glob', 'dash', 'glob'], cast: { glob: { prim: 'rain', v: 'flank', k: 3 } } },
      { id: 'bonelord', name: 'Knochenfürst', t: 360, sprite: 'skel', hp: 4800, speed: 64, dmg: 24, r: 42, xp: 200, skills: ['summon', 'fan', 'dash', 'fan'], cast: { fan: { prim: 'fan', n: 7, spread: 60, spd: 190 } } },
      { id: 'bloodcount', name: 'Blutgraf', t: 600, sprite: 'wraith', hp: 8000, speed: 76, dmg: 30, r: 46, xp: 500, skills: ['nova', 'dash', 'fan', 'summon', 'lances', 'dash'], cast: { fan: { prim: 'fan', n: 9, spread: 80, spd: 200 }, lances: { prim: 'lances' } }, summon: 'bat', final: true },
    ],
  },
  {
    id: 'ashwood', name: 'Aschenwald', minutes: 15,
    intro: 'Der Wald brennt, doch das Feuer wärmt nicht. Bleib in Bewegung – die Schwärme hier sind schnell.',
    outro: 'Die kalten Flammen erlöschen, und an ihrer Stelle brennt deine Glut.',
    ground: { base: '#6e554c', speckle: ['#8c5a3e', '#38282a', '#ff7a3c'], grass: '#ae9484' },
    decor: ['stump', 'stump', 'stump', 'rock', 'bones', 'mush'], decorTint: '#2a1a14',
    tints: { bat: '#ff7a3c', ghost: '#ffb070', wraith: '#ff5a1f', slime: '#ff9a3c', skel: '#4a2e20', ghoul: '#5a3a2a', brute: '#b8502a' }, mods: { all: { hp: 0.9, speed: 1.1 } },
    mult: { hp: 1.15, dmg: 1.15, rate: 1 },
    rangedFrom: 58,
    rangedCd: 1.2, // Abklingzeit der Fernkämpfer ×1,2 (abgestimmt mit dem Balance-Bot)
    waves: [
      { pool: { bat: 4, slime: 1, cinder: 1 }, rate: 2.6, cap: 50 },
      { pool: { bat: 3, ghost: 2, slime: 1, cinder: 1 }, rate: 3.2, cap: 70 },
      { pool: { bat: 3, ghost: 3, skel: 1, cinder: 1 }, rate: 3.6, cap: 88 },
      { pool: { ghost: 3, skel: 2, bat: 3, cinder: 1, moth: 1 }, rate: 3.8, cap: 100 },
      { pool: { ghost: 3, wraith: 1, bat: 3, skel: 1, cinder: 1, moth: 1 }, rate: 4.6, cap: 125 },
      { pool: { wraith: 2, ghost: 3, ghoul: 1, bat: 2, cinder: 1, moth: 1 }, rate: 5.2, cap: 145 },
      { pool: { wraith: 2, ghoul: 2, bat: 4, cinder: 1, moth: 1 }, rate: 5.8, cap: 165 },
      { pool: { wraith: 3, ghost: 3, brute: 1, cinder: 1, moth: 1 }, rate: 6.4, cap: 185 },
      { pool: { wraith: 3, bat: 4, ghoul: 2, spitter: 1, moth: 2, cinder: 1 }, rate: 7, cap: 205 },
      { pool: { wraith: 4, ghost: 2, brute: 1, ghoul: 2, cinder: 1, moth: 1 }, rate: 7.6, cap: 225 },
      { pool: { wraith: 4, bat: 4, brute: 2, moth: 2, cinder: 2 }, rate: 8.2, cap: 250 },
      { pool: { wraith: 4, ghost: 3, ghoul: 2, brute: 1, spitter: 1, cinder: 2, moth: 1 }, rate: 8.8, cap: 270 },
      { pool: { wraith: 5, brute: 2, bat: 3, golem: 1, cinder: 2, moth: 2 }, rate: 9.6, cap: 295 },
      { pool: { wraith: 5, ghost: 3, brute: 2, golem: 1, cinder: 2, moth: 2 }, rate: 10.4, cap: 320 },
      { pool: { wraith: 6, bat: 4, brute: 3, golem: 1, cinder: 3, moth: 2 }, rate: 11.4, cap: 350 },
    ],
    events: [
      { t: 50, kind: 'swarm', type: 'bat', n: 30, text: 'Funkenflug!' },
      { t: 58, kind: 'arc', type: 'cinder', n: 2, text: 'Die Aschenkessel brodeln!' },
      { t: 95, kind: 'arc', type: 'cinder', n: 2, text: 'Die Aschenkessel brodeln!' },
      { t: 165, kind: 'swarm', type: 'ghost', n: 36, text: 'Rauchschwaden!' },
      { t: 210, kind: 'arc', type: 'moth', n: 2, text: 'Nadelmotten schwärmen aus!' },
      { t: 270, kind: 'ring', type: 'bat', n: 40, text: 'Umzingelt!' },
      { t: 345, kind: 'swarm', type: 'wraith', n: 30, text: 'Flammenwand!' },
      { t: 435, kind: 'ring', type: 'ghost', n: 44, text: 'Umzingelt!' },
      { t: 525, kind: 'swarm', type: 'bat', n: 70, text: 'Funkenflug!' },
      { t: 615, kind: 'swarm', type: 'wraith', n: 44, text: 'Flammenwand!' },
      { t: 705, kind: 'ring', type: 'ghoul', n: 40, text: 'Umzingelt!' },
      { t: 780, kind: 'swarm', type: 'ghost', n: 70, text: 'Rauchschwaden!' },
      { t: 860, kind: 'ring', type: 'brute', n: 30, text: 'Die Oger kommen!' },
      { t: 885, kind: 'swarm', type: 'bat', n: 100, text: 'Der Wald brennt …' },
    ],
    bosses: [
      { id: 'smolderer', name: 'Der Schwelende', t: 240, sprite: 'slime', tint: '#ff6a2a', hp: 2600, speed: 70, dmg: 16, r: 44, xp: 120, skills: ['dash', 'rain', 'dash', 'summon', 'rain'], cast: { rain: { prim: 'rain', v: 'scatter', k: 5, rad: 46 } }, summon: 'bat' },
      { id: 'wildfire', name: 'Lauffeuer', t: 540, sprite: 'wraith', tint: '#ffb347', hp: 11000, speed: 92, dmg: 26, r: 40, xp: 300, skills: ['dash', 'spiral', 'dash', 'nova'], cast: { spiral: { prim: 'spiral', arms: 2 } } },
      { id: 'coalheart', name: 'Kohlenherz', t: 900, sprite: 'golem', tint: '#ff5a1f', hp: 90000, speed: 58, dmg: 40, r: 60, xp: 1000, skills: ['slam', 'rain', 'dash', 'summon', 'lanes', 'nova'], cast: { rain: { prim: 'rain', v: 'scatter', k: 7, rad: 54 }, lanes: { prim: 'lanes', pat: 'x' } }, summon: 'bat', final: true },
    ],
  },
  {
    id: 'frostlake', name: 'Eissee', minutes: 15,
    intro: 'Unter dem Eis schläft etwas, das nie erwachen darf. Seine Diener sind langsam, aber zäh.',
    outro: 'Um deine Glut schmilzt das Eis, und der See atmet wieder.',
    ground: { base: '#3e5c84', speckle: ['#6e9ccc', '#1c3458'], grass: '#d8f0ff' },
    decor: ['rock', 'rock', 'rock', 'cross', 'grave', 'bones'], decorTint: '#cfe8ff',
    tints: { slime: '#dff3ff', ghost: '#ffffff', skel: '#dff3ff', ghoul: '#cfe3f0', wraith: '#d6e4ff', brute: '#cfe3f0', golem: '#dff3ff', bat: '#dff3ff', moth: '#eef6ff', bell: '#dff3ff' },
    mods: { all: { hp: 1.4, speed: 0.85, xp: 1.3 }, moth: { hp: 0.75 }, bell: { hp: 0.8 } },
    mult: { hp: 0.9, dmg: 1.15, rate: 1.1 },
    rangedFrom: 45,
    rangedCd: 1.35,
    waves: [
      { pool: { slime: 3, ghost: 2, moth: 1 }, rate: 2.2, cap: 45 },
      { pool: { slime: 3, ghost: 2, skel: 1, moth: 1 }, rate: 2.6, cap: 60 },
      { pool: { ghost: 3, skel: 2, slime: 2, moth: 1 }, rate: 3, cap: 78 },
      { pool: { ghost: 3, ghoul: 1, skel: 2, moth: 1, spitter: 1 }, rate: 3, cap: 85 },
      { pool: { ghoul: 2, ghost: 3, wraith: 1, moth: 1, spitter: 1 }, rate: 3.6, cap: 100 },
      { pool: { ghoul: 3, wraith: 1, skel: 2, spitter: 1, moth: 1, bell: 1 }, rate: 4, cap: 115 },
      { pool: { wraith: 2, ghoul: 3, brute: 1, moth: 1, bell: 1 }, rate: 4.4, cap: 130 },
      { pool: { wraith: 2, ghost: 3, brute: 1, ghoul: 2, bell: 1, moth: 1 }, rate: 4.8, cap: 145 },
      { pool: { brute: 2, wraith: 2, ghoul: 2, spitter: 1, bell: 1, moth: 1 }, rate: 5.2, cap: 160 },
      { pool: { brute: 2, wraith: 3, ghost: 2, golem: 1, bell: 1, moth: 2 }, rate: 5.6, cap: 175 },
      { pool: { brute: 3, wraith: 3, ghoul: 2, golem: 1, bell: 2, moth: 2 }, rate: 6, cap: 190 },
      { pool: { golem: 1, brute: 2, wraith: 4, ghost: 2, moth: 2, bell: 1 }, rate: 6.6, cap: 205 },
      { pool: { golem: 2, brute: 3, wraith: 3, spitter: 1, bell: 2, moth: 1 }, rate: 7, cap: 220 },
      { pool: { golem: 2, brute: 3, wraith: 4, ghoul: 2, moth: 2, bell: 2 }, rate: 7.6, cap: 240 },
      { pool: { golem: 3, brute: 3, wraith: 5, ghost: 2, moth: 2, bell: 2 }, rate: 8.4, cap: 260 },
    ],
    events: [
      { t: 45, kind: 'arc', type: 'moth', n: 2, text: 'Nadelmotten schwärmen aus!' },
      { t: 55, kind: 'swarm', type: 'ghost', n: 26, text: 'Nebel zieht auf!' },
      { t: 85, kind: 'arc', type: 'moth', n: 2, text: 'Nadelmotten schwärmen aus!' },
      { t: 210, kind: 'ring', type: 'slime', n: 34, text: 'Umzingelt!' },
      { t: 330, kind: 'ring', type: 'ghoul', n: 36, text: 'Das Eis bricht!' },
      { t: 400, kind: 'arc', type: 'bell', n: 2, text: 'Die Glocken läuten!' },
      { t: 450, kind: 'swarm', type: 'ghost', n: 50, text: 'Nebel zieht auf!' },
      { t: 585, kind: 'ring', type: 'skel', n: 44, text: 'Das Eis bricht!' },
      { t: 690, kind: 'swarm', type: 'wraith', n: 40, text: 'Irrlichter!' },
      { t: 795, kind: 'ring', type: 'brute', n: 30, text: 'Die Oger kommen!' },
      { t: 880, kind: 'ring', type: 'ghoul', n: 50, text: 'Der See erstarrt …' },
    ],
    bosses: [
      { id: 'hoarfrost', name: 'Raureif', t: 270, sprite: 'slime', tint: '#cfeaff', hp: 3600, speed: 44, dmg: 20, r: 54, xp: 150, skills: ['slam', 'icicle', 'dash', 'icicle'], cast: { icicle: { prim: 'rain', v: 'walk', k: 7 } } },
      { id: 'whitelady', name: 'Die Weiße Frau', t: 570, sprite: 'wraith', tint: '#ffffff', hp: 13000, speed: 64, dmg: 26, r: 42, xp: 320, skills: ['nova', 'summon', 'fan', 'dash', 'nova'], cast: { fan: { prim: 'fan', n: 9, spread: 70, spd: 150 } }, summon: 'ghost' },
      { id: 'drownedking', name: 'Der Ertrunkene König', t: 900, sprite: 'skel', tint: '#5f9ea0', hp: 80000, speed: 56, dmg: 42, r: 60, xp: 1000, skills: ['summon', 'lances', 'slam', 'nova', 'icicle', 'dash'], cast: { lances: { prim: 'lances' }, icicle: { prim: 'rain', v: 'walk', k: 7 } }, summon: 'skel', final: true },
    ],
  },
  {
    id: 'ruins', name: 'Burgruine', minutes: 15,
    intro: 'Diese Feste hielt einst die Nacht auf. Jetzt lauern Spucker hinter jeder Mauer.',
    outro: 'Das alte Leuchtfeuer brennt wieder und strahlt weit ins Land.',
    ground: { base: '#6a624e', speckle: ['#8e8572', '#3a3428'], grass: '#94aa6a' },
    decor: ['rock', 'rock', 'rock', 'grave', 'cross', 'bones', 'stump'],
    tints: { skel: '#c8a060', golem: '#a08a6a', brute: '#8a6a4a', ghoul: '#7a7a5a', slime: '#8a9a5a' }, mods: { skel: { hp: 1.25 }, spitter: { hp: 1.2 }, golem: { speed: 1.1 } },
    mult: { hp: 1.2, dmg: 1.1, rate: 1.1 },
    rangedFrom: 40,
    waves: [
      { pool: { skel: 3, slime: 2, spitter: 1 }, rate: 2.4, cap: 50 },
      { pool: { skel: 3, spitter: 2, bat: 2 }, rate: 3, cap: 70 },
      { pool: { skel: 3, spitter: 2, slime: 2, cinder: 1 }, rate: 3.4, cap: 88 },
      { pool: { skel: 3, spitter: 2, ghoul: 2, cinder: 1 }, rate: 3.6, cap: 95 },
      { pool: { spitter: 2, ghoul: 2, brute: 1, skel: 3, cinder: 1 }, rate: 4.2, cap: 115 },
      { pool: { spitter: 2, brute: 1, skel: 3, bat: 2, cinder: 1, moth: 1 }, rate: 4.8, cap: 135 },
      { pool: { spitter: 2, ghoul: 3, golem: 1, skel: 2, cinder: 1, moth: 1 }, rate: 5.2, cap: 150 },
      { pool: { spitter: 2, brute: 2, skel: 4, cinder: 1, moth: 1 }, rate: 5.8, cap: 170 },
      { pool: { golem: 1, spitter: 2, ghoul: 3, wraith: 1, cinder: 1, moth: 1 }, rate: 6.4, cap: 190 },
      { pool: { golem: 1, brute: 2, spitter: 2, skel: 3, cinder: 1, moth: 1 }, rate: 7, cap: 210 },
      { pool: { golem: 2, spitter: 2, wraith: 2, skel: 2, cinder: 1, moth: 1 }, rate: 7.6, cap: 230 },
      { pool: { golem: 2, brute: 2, spitter: 2, ghoul: 3, cinder: 2, moth: 1 }, rate: 8.2, cap: 250 },
      { pool: { golem: 2, brute: 3, spitter: 2, wraith: 2, cinder: 1, moth: 1 }, rate: 9, cap: 275 },
      { pool: { golem: 3, brute: 2, spitter: 3, wraith: 3, cinder: 1, moth: 1 }, rate: 9.8, cap: 300 },
      { pool: { golem: 3, brute: 3, spitter: 3, wraith: 3, skel: 2, cinder: 1, moth: 1 }, rate: 10.6, cap: 325 },
    ],
    events: [
      { t: 40, kind: 'arc', type: 'spitter', n: 2, text: 'Spucker auf der Mauer!' },
      { t: 55, kind: 'swarm', type: 'bat', n: 32, text: 'Fledermausschwarm!' },
      { t: 80, kind: 'arc', type: 'spitter', n: 3, text: 'Spucker auf der Mauer!' },
      { t: 195, kind: 'ring', type: 'skel', n: 36, text: 'Die Wache rückt an!' },
      { t: 300, kind: 'ring', mix: { spitter: 12, moth: 6 }, text: 'Kreuzfeuer!' },
      { t: 405, kind: 'swarm', type: 'ghost', n: 44, text: 'Geisterzug!' },
      { t: 510, kind: 'ring', type: 'brute', n: 24, text: 'Die Oger kommen!' },
      { t: 600, kind: 'ring', mix: { spitter: 16, cinder: 6, moth: 6 }, text: 'Kreuzfeuer!' },
      { t: 705, kind: 'swarm', type: 'wraith', n: 50, text: 'Irrlichter!' },
      { t: 795, kind: 'ring', type: 'golem', n: 12, text: 'Die Mauern erwachen!' },
      { t: 880, kind: 'ring', type: 'skel', n: 60, text: 'Die Wache rückt an!' },
    ],
    bosses: [
      { id: 'castellan', name: 'Der Burgvogt', t: 240, sprite: 'skel', tint: '#b07040', hp: 3400, speed: 66, dmg: 20, r: 44, xp: 150, skills: ['summon', 'lances', 'dash', 'lances'], cast: { lances: { prim: 'lances' } }, summon: 'skel' },
      { id: 'towerwitch', name: 'Die Turmhexe', t: 510, sprite: 'wraith', tint: '#ffc94f', hp: 11000, speed: 70, dmg: 26, r: 40, xp: 300, skills: ['nova', 'spiral', 'dash', 'nova'], cast: { spiral: { prim: 'spiral', arms: 3 } } },
      { id: 'colossus', name: 'Steinkoloss', t: 900, sprite: 'golem', hp: 110000, speed: 50, dmg: 42, r: 62, xp: 1000, skills: ['slam', 'rain', 'summon', 'lanes', 'nova'], cast: { rain: { prim: 'rain', v: 'scatter', k: 5, rad: 60 }, lanes: { prim: 'lanes', pat: 'fan3' } }, summon: 'skel', final: true },
    ],
  },
  {
    id: 'nightheart', name: 'Herz der Nacht', minutes: 15,
    intro: 'Hinter dir brennt jede Glut, die du entfacht hast. Vor dir wartet nur noch die Nacht.',
    outro: 'Die Nacht zerbricht, und zum ersten Mal seit Ewigkeiten wird es Morgen.',
    ground: { base: '#5a4c86', speckle: ['#7660b2', '#2c2248', '#6b4cff'], grass: '#9682d0' },
    decor: ['cross', 'grave', 'bones', 'bones', 'rock', 'rock', 'flower'], decorTint: '#3a2a6a',
    tints: { bat: '#6b4cff', slime: '#6b4cff', skel: '#8a7cff', ghost: '#9a8cff', ghoul: '#5a3cc0', wraith: '#7a4cff', brute: '#5a3cc0', golem: '#4a3a9a' }, mods: { all: { hp: 1.15, speed: 1.05 } },
    mult: { hp: 1.1, dmg: 1, rate: 1.05 },
    rangedFrom: 40,
    waves: [
      { pool: { bat: 3, ghost: 2, skel: 1, moth: 1 }, rate: 2.8, cap: 55 },
      { pool: { ghost: 3, skel: 2, bat: 2, moth: 1, spitter: 1 }, rate: 3.4, cap: 75 },
      { pool: { skel: 3, ghost: 2, ghoul: 1, spitter: 1, moth: 1 }, rate: 3.8, cap: 92 },
      { pool: { ghoul: 2, wraith: 1, skel: 2, bat: 3, bell: 1, moth: 1, spitter: 1 }, rate: 4, cap: 105 },
      { pool: { wraith: 2, ghoul: 2, spitter: 1, ghost: 2, bell: 1, moth: 1 }, rate: 4.8, cap: 130 },
      { pool: { wraith: 2, brute: 1, ghoul: 2, bat: 3, cinder: 1, moth: 1, bell: 1 }, rate: 5.4, cap: 150 },
      { pool: { wraith: 3, brute: 1, spitter: 1, skel: 3, cinder: 1, bell: 1 }, rate: 6, cap: 170 },
      { pool: { wraith: 3, ghoul: 3, brute: 2, moth: 2, cinder: 1 }, rate: 6.6, cap: 190 },
      { pool: { golem: 1, wraith: 3, ghost: 3, spitter: 1, bell: 1, moth: 1 }, rate: 7.2, cap: 215 },
      { pool: { golem: 1, brute: 2, wraith: 3, ghoul: 3, cinder: 1, moth: 1, bell: 1 }, rate: 7.8, cap: 235 },
      { pool: { golem: 1, brute: 2, wraith: 4, spitter: 2, cinder: 1, moth: 1 }, rate: 8.6, cap: 260 },
      { pool: { golem: 2, brute: 2, wraith: 4, bat: 4, bell: 2, moth: 1 }, rate: 9.4, cap: 285 },
      { pool: { golem: 2, brute: 3, wraith: 4, ghoul: 2, spitter: 1, cinder: 1, moth: 1, bell: 1 }, rate: 10.2, cap: 310 },
      { pool: { golem: 2, brute: 3, wraith: 5, ghost: 3, moth: 2, cinder: 1, bell: 1 }, rate: 11, cap: 335 },
      { pool: { golem: 3, brute: 3, wraith: 5, spitter: 2, bat: 3, moth: 2, bell: 1 }, rate: 12, cap: 360 },
    ],
    events: [
      { t: 40, kind: 'arc', type: 'moth', n: 2, text: 'Nadelmotten schwärmen aus!' },
      { t: 50, kind: 'swarm', type: 'bat', n: 36, text: 'Fledermausschwarm!' },
      { t: 85, kind: 'arc', mix: { moth: 2, spitter: 1 }, text: 'Die Nacht zielt auf dich!' },
      { t: 180, kind: 'ring', type: 'slime', n: 40, text: 'Umzingelt!' },
      { t: 285, kind: 'swarm', type: 'ghost', n: 50, text: 'Geisterzug!' },
      { t: 375, kind: 'ring', mix: { spitter: 10, moth: 8, bell: 6 }, text: 'Kreuzfeuer!' },
      { t: 465, kind: 'swarm', type: 'wraith', n: 50, text: 'Irrlichter!' },
      { t: 570, kind: 'ring', type: 'ghoul', n: 44, text: 'Umzingelt!' },
      { t: 660, kind: 'swarm', type: 'bat', n: 80, text: 'Fledermausschwarm!' },
      { t: 735, kind: 'ring', type: 'brute', n: 34, text: 'Die Oger kommen!' },
      { t: 810, kind: 'swarm', type: 'wraith', n: 70, text: 'Irrlichter!' },
      { t: 855, kind: 'ring', type: 'golem', n: 12, text: 'Die Finsternis schließt sich!' },
      { t: 885, kind: 'swarm', type: 'bat', n: 100, text: 'Die Nacht erwacht …' },
    ],
    bosses: [
      { id: 'nightmare', name: 'Der Nachtmahr', t: 210, sprite: 'wraith', tint: '#4a2cff', hp: 3200, speed: 84, dmg: 22, r: 42, xp: 150, skills: ['dash', 'fan', 'dash', 'nova'], cast: { fan: { prim: 'fan', n: 5, spread: 40, spd: 220 } } },
      { id: 'mooneater', name: 'Mondfresser', t: 450, sprite: 'golem', tint: '#2e2366', hp: 14000, speed: 52, dmg: 32, r: 58, xp: 350, skills: ['slam', 'eclipse', 'summon', 'eclipse'], cast: { eclipse: { prim: 'rain', v: 'track', k: 1 } }, summon: 'ghost' },
      { id: 'starless', name: 'Der Sternlose', t: 690, sprite: 'skel', tint: '#9a8cff', hp: 24000, speed: 66, dmg: 34, r: 48, xp: 450, skills: ['summon', 'starfall', 'nova', 'dash'], cast: { starfall: { prim: 'rain', v: 'stars', k: 9 } }, summon: 'skel' },
      { id: 'night', name: 'Die Nacht', t: 900, sprite: 'night', hp: 190000, speed: 72, dmg: 45, r: 64, xp: 1000, skills: ['dash', 'spiral', 'slam', 'lanes', 'summon', 'nova'], cast: { spiral: { prim: 'spiral', arms: 3 }, lanes: { prim: 'lanes', pat: 'x' } }, summon: 'skel', final: true },
    ],
  },
];

// Rahmengeschichte
const STORY = {
  premise: 'Die Nacht verschlingt die Welt, Land um Land. Nur noch eine Handvoll Helden hütet die Glut. Trag sie durch fünf finstere Länder und hol den Morgen zurück.',
  ending: 'In fünf Ländern glimmt wieder Glut. Der Himmel wird grau, dann golden. Irgendwann kehrt die Nacht zurück – doch nun weiß wieder jemand, wie man ein Feuer entfacht.',
};

function stageById(id) { return STAGES.find(s => s.id === id) || STAGES[0]; }
// Höchste Nachtstufe, auf der das Land befreit wurde (-1 = noch nie)
function stageBest(save, id) { const v = save.stages && save.stages[id]; return typeof v === 'number' ? v : -1; }
// Sterne: geschafft, auf Nachtstufe 1+, auf Nachtstufe 3+
function stageStars(save, id) { const b = stageBest(save, id); return b < 0 ? 0 : b >= 3 ? 3 : b >= 1 ? 2 : 1; }
function stageUnlocked(save, i) { return i === 0 || stageBest(save, STAGES[i - 1].id) >= 0; }
// Höchste wählbare Nachtstufe: eine über der besten geschafften
function stageMaxHeat(save, id) { return Math.min(HEAT.length - 1, stageBest(save, id) + 1); }
function totalStars(save) { return STAGES.reduce((a, s) => a + stageStars(save, s.id), 0); }

// Erfolge: check(run, save) wird am Laufende und zwischendurch geprüft.
const ACHIEVEMENTS = [
  { id: 't1', name: 'Erste Nacht', text: 'Überlebe 1 Minute', gold: 20, check: r => r.t >= 60 },
  { id: 't5', name: 'Zähe Seele', text: 'Überlebe 5 Minuten', gold: 60, check: r => r.t >= 300 },
  { id: 't10', name: 'Nachtwache', text: 'Überlebe 10 Minuten', gold: 120, unlock: 'Sela', check: r => r.t >= 600 },
  { id: 'win', name: 'Erste Glut', text: 'Befreie den Alten Friedhof', gold: 300, unlock: 'Ignis', check: r => r.won },
  { id: 'stage3', name: 'Tauwetter', text: 'Befreie den Eissee', gold: 250, check: (r, s) => stageBest(s, 'frostlake') >= 0 },
  { id: 'night', name: 'Morgengrauen', text: 'Besiege Die Nacht', gold: 800, check: (r, s) => stageBest(s, 'nightheart') >= 0 },
  { id: 'stars10', name: 'Sternendeuter', text: 'Sammle 10 Sterne auf der Weltkarte', gold: 300, check: (r, s) => totalStars(s) >= 10 },
  { id: 'stars15', name: 'Volle Glut', text: 'Hole 3 Sterne in allen 5 Ländern', gold: 1500, check: (r, s) => totalStars(s) >= 15 },
  { id: 'lvl10', name: 'Lehrling', text: 'Erreiche Stufe 10', gold: 30, check: r => r.level >= 10 },
  { id: 'lvl20', name: 'Geselle', text: 'Erreiche Stufe 20', gold: 60, unlock: 'Kael', check: r => r.level >= 20 },
  { id: 'lvl40', name: 'Meister', text: 'Erreiche Stufe 40', gold: 150, check: r => r.level >= 40 },
  { id: 'lvl60', name: 'Legende', text: 'Erreiche Stufe 60', gold: 300, check: r => r.level >= 60 },
  { id: 'kill500', name: 'Aufräumer', text: 'Besiege 500 Gegner in einem Lauf', gold: 40, check: r => r.kills >= 500 },
  { id: 'kill2000', name: 'Sturmflut', text: 'Besiege 2000 Gegner in einem Lauf', gold: 120, check: r => r.kills >= 2000 },
  { id: 'kill5000', name: 'Vernichter', text: 'Besiege 5000 Gegner in einem Lauf', gold: 300, check: r => r.kills >= 5000 },
  { id: 'kills3000', name: 'Jäger der Nacht', text: 'Besiege insgesamt 3000 Gegner', gold: 100, unlock: 'Brom', check: (r, s) => s.stats.kills >= 3000 },
  { id: 'kills25k', name: 'Plage', text: 'Besiege insgesamt 25 000 Gegner', gold: 400, check: (r, s) => s.stats.kills >= 25000 },
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
  { id: 'nohit3', name: 'Unberührbar', text: 'Überlebe 3 Minuten ohne Treffer', gold: 80, check: r => r.t >= 180 && r.firstHit === null },
  { id: 'full', name: 'Vollausstattung', text: 'Sammle 6 Waffen und 6 Passive in einem Lauf', gold: 150, check: r => r.weapons.length >= 6 && r.passives.length >= 6 },
  { id: 'heat3', name: 'Tiefe Nacht', text: 'Befreie ein Land auf Nachtstufe 3 oder höher', gold: 500, check: r => r.won && r.heat >= 3 },
  { id: 'heat5', name: 'Ewige Finsternis', text: 'Befreie ein Land auf Nachtstufe 5', gold: 1500, check: r => r.won && r.heat >= 5 },
];
