'use strict';
// ---------------------------------------------------------------------------
// Konstanten, Balancing, Karten (Upgrades) und Städte
// ---------------------------------------------------------------------------

// Gelände
const T_GRASS = 0, T_WATER = 1, T_FOREST = 2, T_ROCK = 3, T_SAND = 4, T_FIELD = 5;
// Kachel-Flags
const F_BRIDGE = 1, F_TUNNEL = 2, F_CROSSING = 4, F_DRAW = 8, F_RAMP = 16;

const CFG = {
  dt: 1 / 20,                 // Simulationsschritt (20 Hz)
  laneOff: 0.18,
  roadSpeed: [0, 2.0, 5.0],   // Stadtstraße / Autobahn (Kacheln pro Sekunde)
  turnSpeed: [99, 1.0, 0.65, 1.3],
  roundSpeed: 1.15,
  driveSpeed: 1.2,
  gap: 0.07,
  yieldWindow: 2.1,
  yellow: 2.0, allRed: 1.2,
  ringR: 0.32,
  maxVehicles: 450,
  elevH: 0.62,                // Höhe der Autobahn-Hochstraße

  // Zeit
  dayLen: 40,                 // Sekunden für 06:00–22:00
  nightLen: 1.2,              // Überblendung 22:00–06:00
  workDays: 5,

  // Aufträge / Druck
  pinCap: 6,                  // ab dem 7. Stecker füllt sich der Ring
  ringTime: 35,               // Sekunden bis Stillstand
  ringDrain: 2,               // Abbau doppelt so schnell
  pinEvery: 7,                // Grundbedarf: Sekunden pro Auftrag je Ziel (Woche 1)
  pinWeekGrowth: 0.12,
  pinPerHouse: 0.025,         // zusätzlicher Bedarf je angeschlossenem Haus (Aufträge/s)
  waveMorning: 1.8, waveEvening: 2.0, waveNight: 0.6,
  intakeEvery: 0.5,           // Ziel nimmt 1 Auto pro 0,5 s auf
  carsPerHouse: 2,

  // Wachstum
  houseEvery: 11, houseEveryMin: 6, houseWeekFactor: 0.9,
  destEveryDays: 4,
  maxColors: 5,
  announce: 5,                // Schatten-Ankündigung in Sekunden

  // Inventar
  start: { roads: 40, lights: 1, bridges: 1, tunnels: 0, rounds: 0, highways: 0, police: 2, stops: 0 },
  weekRoads: 20,
  policeMax: 3,
  policeTime: 15,
  bridgeMax: 4, tunnelMax: 5, highwayMax: 8,

  // Kombo
  comboWindow: 2.5,
  greenWave: 10,
};

// Upgrade-Karten
const CARDS = [
  { id: 'roads', name: 'Straßenpaket', desc: '+25 Straßenkacheln', icon: 'road', apply: g => { g.inv.roads += 25; } },
  { id: 'lights', name: 'Zwei Ampeln', desc: '+2 Ampeln. Sie schalten selbst nach Bedarf.', icon: 'light', apply: g => { g.inv.lights += 2; } },
  { id: 'round', name: 'Kreisverkehr', desc: '+1 Kreisverkehr: flüssig bei Verkehr aus allen Richtungen.', icon: 'round', apply: g => { g.inv.rounds += 1; } },
  { id: 'highway', name: 'Autobahn', desc: 'Gerade Hochstraße bis 8 Kacheln, überquert alles, Tempo 130.', icon: 'highway', apply: g => { g.inv.highways += 1; } },
  { id: 'tunnel', name: 'Tunnel', desc: '+1 Tunnel durch einen Berg (bis 5 Kacheln).', icon: 'tunnel', apply: g => { g.inv.tunnels += 1; } },
  { id: 'bridges', name: 'Zwei Brücken', desc: '+2 Brücken über Wasser (bis 4 Kacheln).', icon: 'bridge', apply: g => { g.inv.bridges += 2; } },
  { id: 'greenwave', name: 'Grüne Welle', desc: 'Alle Ampeln schalten schneller um: kürzere Gelb- und Räumzeiten.', icon: 'wave', passive: true, once: true, apply: g => { g.mods.greenWave = true; } },
  { id: 'parking', name: 'Parkhaus', desc: 'Ein Ziel deiner Wahl trägt 9 statt 6 Aufträge, bevor es kritisch wird.', icon: 'parking', target: 'dest', apply: (g, b) => { b.cap = 9; b.parking = true; } },
  { id: 'tempo', name: 'Tempo 60', desc: 'Alle Stadtstraßen werden 15 % schneller.', icon: 'tempo', passive: true, once: true, apply: g => { g.mods.tempo = 1.15; } },
  { id: 'flex', name: 'Gleitzeit', desc: 'Ein Ziel deiner Wahl verteilt seine Stoßzeiten: halbe Wellen-Spitzen.', icon: 'clock', target: 'dest', apply: (g, b) => { b.flex = true; } },
  { id: 'second', name: 'Zweitwagen', desc: 'Alle Häuser einer Farbe deiner Wahl bekommen ein drittes Auto.', icon: 'car', target: 'dest', apply: (g, b) => { g.city.addCarsForColor(b.pi, 1); } },
  { id: 'stop', name: 'Feierabend-Stopp', desc: 'Joker: 8 Sekunden lang keine neuen Aufträge. Einmal einsetzbar.', icon: 'stop', apply: g => { g.inv.stops += 1; } },
  { id: 'police', name: 'Verstärkung', desc: '+2 Polizei-Einsätze (Obergrenze steigt auf 5).', icon: 'police', apply: g => { g.inv.police = Math.min(5, g.inv.police + 2); g.mods.policeMax = 5; } },
  { id: 'mega', name: 'Großbaustelle', desc: '+40 Straßenkacheln und +1 Brücke.', icon: 'road', apply: g => { g.inv.roads += 40; g.inv.bridges += 1; } },
  // Pakt-Karten (ab Rang 2)
  { id: 'fest', name: 'Bürgerfest', desc: '+2 Kreisverkehre, aber nächste Woche 25 % mehr Aufträge.', icon: 'round', pact: true, apply: g => { g.inv.rounds += 2; g.mods.pactDemand = 1.25; g.mods.pactWeeks = 1; } },
  { id: 'spar', name: 'Sparhaushalt', desc: '+45 Straßenkacheln, aber nächste Woche keine Karte.', icon: 'road', pact: true, apply: g => { g.inv.roads += 45; g.mods.skipCard = true; } },
];

// Städte: Gelände und Mechaniken
const CITIES = [
  {
    id: 'kleinbuettel', name: 'Kleinbüttel', sub: 'Dorf am Bach', size: 34, seed: 1201,
    terrain: { brook: true, forest: 0.32, rocks: 0.05, fields: 0.22 },
    medals: [300, 700, 1200], unlock: null, tutorial: true, maxColors: 4,
    intro: 'Verbinde die Häuser mit der Bäckerei. Jedes Auto holt einen Auftrag ab.',
  },
  {
    id: 'hafenstadt', name: 'Hafenstadt', sub: 'Kanäle und Klappbrücke', size: 34, seed: 2302,
    terrain: { canals: true, forest: 0.18, rocks: 0, fields: 0.1, coast: true },
    mech: { drawbridge: true }, start: { bridges: 3 },
    medals: [280, 650, 1100], unlock: { city: 'kleinbuettel', score: 150 },
    intro: 'Kanäle zerschneiden die Stadt. Die Klappbrücke am Hafen öffnet alle 30 Sekunden für ein Schiff.',
  },
  {
    id: 'ruhrstadt', name: 'Ruhrstadt', sub: 'Bahnübergänge', size: 34, seed: 3403,
    terrain: { forest: 0.2, rocks: 0.04, fields: 0.15, rails: 2, river: true },
    mech: { rails: true },
    medals: [320, 750, 1300], unlock: { city: 'hafenstadt', score: 150 },
    intro: 'Zwei Bahnstrecken queren die Stadt. Alle 20 Sekunden schließen die Schranken für einen Zug.',
  },
  {
    id: 'alpendorf', name: 'Alpendorf', sub: 'Berge, Tunnel, Schnee', size: 34, seed: 4504,
    terrain: { forest: 0.35, rocks: 0.42, fields: 0.08, brook: true },
    mech: { snow: true }, start: { tunnels: 2 },
    medals: [260, 620, 1050], unlock: { city: 'ruhrstadt', score: 150 },
    intro: 'Zwischen den Gipfeln wird es eng. An Schneetagen fahren alle 20 % langsamer.',
  },
  {
    id: 'messestadt', name: 'Messestadt', sub: 'Messe-Ansturm', size: 34, seed: 5605,
    terrain: { forest: 0.2, rocks: 0.06, fields: 0.25, lakes: 2 },
    mech: { fair: true },
    medals: [340, 800, 1350], unlock: { city: 'alpendorf', score: 150 },
    intro: 'Zur Messe kommen 25 Aufträge auf einmal an ein Ziel. Plane Reserven ein.',
  },
  {
    id: 'hauptstadt', name: 'Hauptstadt', sub: 'Autobahnring', size: 34, seed: 6706,
    terrain: { forest: 0.15, rocks: 0.05, fields: 0.15, river: true },
    mech: { ring: true }, colors: 2, maxColors: 6, startSize: 18,
    medals: [400, 900, 1500], unlock: { bronze: 3 },
    intro: 'Ein schneller Ring umschließt die Stadt. Bis zu sechs Farben, viel Verkehr – die große Bühne.',
  },
];

const DAILY_MODS = [
  { id: 'rvl', name: 'Nur rechts vor links', desc: 'Keine Ampeln, Kreisel oder Vorfahrtsstraßen.' },
  { id: 'baustelle', name: 'Dauerbaustelle', desc: 'Jeden Tag eine neue Baustelle.' },
  { id: 'rush', name: 'Ferienende', desc: 'Stoßzeiten 30 % stärker.' },
  { id: 'sparsam', name: 'Knappe Kassen', desc: 'Nur 10 statt 15 Kacheln pro Woche.' },
  { id: 'schnee', name: 'Wintereinbruch', desc: 'Alle Autos 15 % langsamer.' },
];

const RANKS = [
  { at: 0, name: 'Praktikant' },
  { at: 500, name: 'Verkehrsplaner', unlock: 'Pakt-Karten (stark, aber mit Haken)' },
  { at: 1500, name: 'Oberplaner' },
  { at: 3500, name: 'Amtsleiter' },
  { at: 7000, name: 'Baudezernent' },
  { at: 12000, name: 'Verkehrsminister' },
  { at: 20000, name: 'Verkehrsmeister' },
];

const MEDAL_NAMES = ['Bronze', 'Silber', 'Gold'];

// Farben der Linien (Haus- und Zielfarbe) mit Symbol für Farbfehlsichtige
const PALETTE = [
  { key: 'gelb', name: 'Bäckerei', hex: '#f5b700', light: '#ffe08a', icon: 'brot' },
  { key: 'rot', name: 'Klinik', hex: '#e5484d', light: '#ffb3b5', icon: 'kreuz' },
  { key: 'blau', name: 'Büro', hex: '#2f6fdb', light: '#a9c6ff', icon: 'koffer' },
  { key: 'gruen', name: 'Gärtnerei', hex: '#1f9d55', light: '#9fe0b8', icon: 'blatt' },
  { key: 'lila', name: 'Kino', hex: '#8b5cf6', light: '#d3c2ff', icon: 'stern' },
  { key: 'orange', name: 'Fabrik', hex: '#f0702a', light: '#ffc29e', icon: 'zahnrad' },
];

