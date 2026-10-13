'use strict';
// ---------------------------------------------------------------------------
// Spielkonstanten und Balancing
// ---------------------------------------------------------------------------

const CFG = {
  dt: 1 / 20,              // Simulationsschritt in Sekunden
  minPerSec: 2,            // Spielminuten pro Simulationssekunde (1 Tag = 12 Min bei 1x)
  laneOff: 0.18,           // Fahrspur-Versatz von der Straßenmitte (Rechtsverkehr)
  roadSpeed: [0, 1.9, 3.3], // Kacheln/s je Straßenklasse (1 = Stadtstraße, 2 = Schnellstraße)
  turnSpeed: [99, 0.95, 0.6, 1.25], // nach Abbiegeart
  roundSpeed: 1.05,
  driveSpeed: 0.75,
  worksSpeed: 0.45,        // Faktor auf Baustellen
  gap: 0.07,               // Mindestabstand zwischen Fahrzeugen
  stuckLimit: 75,          // Sekunden bis ein festgefahrenes Fahrzeug aufgibt
  yieldWindow: 2.1,        // Sekunden: so nah muss ein bevorrechtigtes Fahrzeug sein
  yellow: 2.5, allRed: 1.5,
  maxVehicles: 900,
  ringR: 0.32,

  cost: {
    road: 120, oneway: 110, highway: 380,
    bridge: 900, tunnel: 1500, forest: 40,
    light: 1500, smart: 2500, priority: 250, roundabout: 2200,
    stop: 400, bus: 2600, building: 0,
  },
  upkeep: { // pro Tag
    road: 3, highway: 8, bridge: 18, tunnel: 28,
    light: 45, smart: 80, roundabout: 20, priority: 2, stop: 8, bus: 110,
  },
  refund: 0.35,
  towCost: 600,
  worksRushCost: 450,
  powerFixCost: 900,
};

// Nachfragekurven je Stunde (0–23)
const CURVES = {
  commute: [0.02, 0.01, 0.01, 0.01, 0.06, 0.3, 0.8, 1.0, 0.75, 0.3, 0.14, 0.1, 0.1, 0.12, 0.12, 0.1, 0.08, 0.06, 0.05, 0.04, 0.03, 0.03, 0.02, 0.02],
  shop: [0.01, 0, 0, 0, 0, 0.02, 0.05, 0.15, 0.35, 0.6, 0.75, 0.8, 0.85, 0.7, 0.65, 0.75, 0.95, 1.0, 0.85, 0.55, 0.3, 0.12, 0.05, 0.02],
  leisure: [0.1, 0.05, 0.02, 0.01, 0.01, 0.01, 0.03, 0.05, 0.1, 0.2, 0.3, 0.4, 0.45, 0.45, 0.5, 0.55, 0.65, 0.8, 1.0, 1.0, 0.85, 0.6, 0.35, 0.2],
  delivery: [0, 0, 0, 0, 0.1, 0.4, 0.8, 1.0, 1.0, 0.9, 0.85, 0.8, 0.7, 0.75, 0.8, 0.7, 0.5, 0.3, 0.1, 0.05, 0, 0, 0, 0],
  through: [0.15, 0.1, 0.08, 0.08, 0.15, 0.4, 0.8, 1.0, 0.85, 0.6, 0.55, 0.55, 0.6, 0.6, 0.65, 0.75, 0.95, 1.0, 0.8, 0.55, 0.4, 0.3, 0.25, 0.2],
};
const CURVE_SUM = {};
for (const k in CURVES) CURVE_SUM[k] = CURVES[k].reduce((a, b) => a + b, 0);

// Wochentagsfaktoren [Mo..So]
const WEEK = {
  commute: [1, 1, 1, 1, 0.95, 0.3, 0.15],
  shop: [0.9, 0.9, 0.9, 0.95, 1.1, 1.5, 0.25],
  leisure: [0.8, 0.8, 0.85, 0.9, 1.2, 1.5, 1.5],
  delivery: [1, 1, 1, 1, 1, 0.4, 0.05],
  through: [1, 1, 1, 1, 1.1, 0.8, 0.7],
};

// Fahrzeugtypen
const VT = {
  car: { name: 'PKW', len: 0.30, wid: 0.165, acc: 1.8, vf: 1.0 },
  van: { name: 'Lieferwagen', len: 0.36, wid: 0.18, acc: 1.5, vf: 0.95 },
  truck: { name: 'LKW', len: 0.50, wid: 0.2, acc: 0.95, vf: 0.78 },
  bus: { name: 'Linienbus', len: 0.58, wid: 0.2, acc: 1.0, vf: 0.85 },
  ambulance: { name: 'Rettungswagen', len: 0.36, wid: 0.18, acc: 2.3, vf: 1.3, emergency: true },
  firetruck: { name: 'Löschfahrzeug', len: 0.50, wid: 0.2, acc: 1.7, vf: 1.2, emergency: true },
};
const CAR_COLORS = ['#e94b3c', '#2f6db5', '#f2b134', '#3fa66b', '#ffffff', '#2b2d33', '#8d99ae', '#c2410c', '#7c3aed', '#0e7490', '#e5e7eb', '#9f1239', '#facc15', '#475569'];

// Gebäudetypen
const BT = {
  house: { name: 'Einfamilienhaus', cat: 'res', w: 1, h: 1, pop: 4, trips: { commute: 13, shop: 6, leisure: 3 } },
  apartment: { name: 'Mehrfamilienhaus', cat: 'res', w: 1, h: 1, pop: 12, trips: { commute: 28, shop: 11, leisure: 6 } },
  tower: { name: 'Wohnturm', cat: 'res', w: 2, h: 2, pop: 40, trips: { commute: 70, shop: 26, leisure: 13 } },
  office: { name: 'Bürogebäude', cat: 'work', w: 2, h: 2, jobs: 60 },
  shop: { name: 'Geschäfte', cat: 'shop', w: 2, h: 1, jobs: 8, attract: 1 },
  industry: { name: 'Fabrik', cat: 'work', w: 2, h: 2, jobs: 45, trucks: 10 },
  mall: { name: 'Einkaufszentrum', cat: 'shop', w: 3, h: 2, jobs: 30, attract: 4 },
  hospital: { name: 'Krankenhaus', cat: 'service', w: 2, h: 2, jobs: 25, attract: 0.6 },
  firestation: { name: 'Feuerwache', cat: 'service', w: 2, h: 1, jobs: 6 },
  stadium: { name: 'Stadion', cat: 'leisure', w: 3, h: 3, jobs: 10, attract: 1.5 },
  gate: { name: 'Ortseingang', cat: 'gate', w: 1, h: 1 },
};

const HOUSE_COLORS = ['#e76f51', '#f4a261', '#e9c46a', '#2a9d8f', '#d95d76', '#8ab17d', '#5b8fd1', '#b5838d', '#ef8354', '#6d9dc5'];
const OFFICE_COLORS = ['#5b7db1', '#4a6fa5', '#6b8fbf', '#3d5a80', '#577590'];
const SHOP_COLORS = ['#e07a5f', '#81b29a', '#f2cc8f', '#c97b84', '#9c89b8', '#f08a5d'];

// Terrain
const T_GRASS = 0, T_WATER = 1, T_FOREST = 2, T_ROCK = 3, T_SAND = 4, T_FIELD = 5;
const TERRAIN_NAME = ['Wiese', 'Wasser', 'Wald', 'Fels', 'Sand', 'Feld'];

// Kachel-Flags
const F_BRIDGE = 1, F_TUNNEL = 2, F_STOP = 4;

// Wetter
const WEATHER = {
  sun: { name: 'Sonnig', speed: 1.0, acc: 1.0, icon: 'sun' },
  cloud: { name: 'Bewölkt', speed: 1.0, acc: 1.0, icon: 'cloud' },
  rain: { name: 'Regen', speed: 0.86, acc: 1.7, icon: 'rain' },
  fog: { name: 'Nebel', speed: 0.76, acc: 2.0, icon: 'fog' },
  snow: { name: 'Schnee', speed: 0.66, acc: 2.8, icon: 'snow' },
};

// Werkzeuge
const TOOLS = [
  { id: 'inspect', name: 'Auswählen', key: 'Q', desc: 'Kreuzungen, Gebäude und Fahrzeuge anklicken, um Details zu sehen und Einstellungen zu ändern.' },
  { id: 'road', name: 'Straße', key: 'R', desc: 'Zweispurige Stadtstraße (50 km/h). Ziehen, um Straßen zu bauen. Über Wasser entstehen Brücken, durch Fels Tunnel.' },
  { id: 'oneway', name: 'Einbahnstraße', key: 'E', desc: 'Einspurig in Zugrichtung. Weniger Konflikte an Kreuzungen. Über bestehende Straßen ziehen, um sie umzuwandeln.' },
  { id: 'highway', name: 'Schnellstraße', key: 'T', desc: 'Schnelle Straße (90 km/h). Teurer im Bau und Unterhalt. Über bestehende Straßen ziehen zum Ausbauen.' },
  { id: 'bulldoze', name: 'Abriss', key: 'X', desc: 'Straßen und Haltestellen abreißen. Du bekommst einen Teil der Baukosten zurück.' },
  { id: 'light', name: 'Ampel', key: 'L', desc: 'Ampel auf eine Kreuzung setzen. Phasen, Dauer und Versatz (Grüne Welle) im Info-Fenster einstellen.' },
  { id: 'priority', name: 'Vorfahrt', key: 'V', desc: 'Vorfahrtsschilder: eine Hauptrichtung hat Vorfahrt, Nebenstraßen warten. Erneut klicken wechselt die Hauptrichtung.' },
  { id: 'roundabout', name: 'Kreisverkehr', key: 'K', desc: 'Kreisverkehr: Wer im Kreis fährt, hat Vorfahrt. Sehr flüssig bei mittlerem Verkehr.' },
  { id: 'stop', name: 'Haltestelle', key: 'B', desc: 'Bushaltestelle auf ein gerades Straßenstück setzen. Häuser und Ziele im Umkreis von 4 Feldern nutzen sie.' },
  { id: 'busline', name: 'Buslinie', key: 'N', desc: 'Haltestellen der Reihe nach anklicken, mit Enter oder Klick auf die erste Haltestelle abschließen. Busse fahren im Kreis.' },
  { id: 'place', name: 'Gebäude', key: 'G', desc: 'Nur im freien Spiel: Gebäude platzieren.', sandbox: true },
];
