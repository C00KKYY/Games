'use strict';
// ---------------------------------------------------------------------------
// Level-Definitionen und Kartengenerierung
// ---------------------------------------------------------------------------

const ALL_TOOLS = ['inspect', 'road', 'oneway', 'highway', 'bulldoze', 'light', 'priority', 'roundabout', 'stop', 'busline'];

const LEVELS = [
  {
    id: 'l1', name: 'Lindenau', sub: 'Erste Schritte', w: 36, h: 24, seed: 1101,
    map: { forest: 0.3, rocks: 0, river: null, lakes: 0, fields: 0.25 },
    layout: 'split', start: { house: 5, office: 1 }, gates: 0,
    money: 10000, demand: 1.5, growth: 70, maxBuildings: 22,
    types: ['house', 'office', 'shop'], specials: {},
    events: {}, weather: { sun: 3, cloud: 1 },
    tools: ['inspect', 'road', 'bulldoze'],
    goals: [{ type: 'trips', n: 60 }],
    tutorial: true, grace: 120,
    intro: 'Willkommen im Rathaus von Lindenau! Als neue Verkehrsplanerin bzw. neuer Verkehrsplaner verbindest du Wohnhäuser mit Arbeitsplätzen. Ziehe Straßen von den Einfahrten der Häuser zum Bürogebäude. Jede Fahrt, die gut ankommt, macht die Bürger zufriedener.',
  },
  {
    id: 'l2', name: 'Brückenfeld', sub: 'Am Fluss', w: 44, h: 28, seed: 2202,
    map: { forest: 0.35, rocks: 0, river: { orient: 'v', width: 2 }, lakes: 0, fields: 0.2 },
    layout: 'river', start: { house: 8, office: 2, shop: 1 }, gates: 0,
    money: 16000, demand: 1.1, growth: 60, maxBuildings: 45,
    types: ['house', 'office', 'shop'], specials: {},
    events: {}, weather: { sun: 4, cloud: 2, rain: 1 },
    tools: ['inspect', 'road', 'oneway', 'bulldoze'],
    goals: [{ type: 'trips', n: 250 }, { type: 'sat', n: 55 }],
    grace: 90,
    intro: 'Der Fluss teilt Brückenfeld: Die Menschen wohnen im Westen, arbeiten aber im Osten. Brücken sind teuer – plane sie klug. Neu: Einbahnstraßen. Sie haben nur eine Spur, erzeugen aber weniger Konflikte an Kreuzungen.',
  },
  {
    id: 'l3', name: 'Altstadt Kreuzberg', sub: 'Rechts vor links', w: 44, h: 28, seed: 3303,
    map: { forest: 0.2, rocks: 0, river: null, lakes: 0, fields: 0.2 },
    layout: 'town', start: { house: 14, office: 3, shop: 2 }, gates: 2, preRoads: 'grid',
    money: 20000, demand: 1.1, growth: 55, maxBuildings: 60, through: 30,
    types: ['house', 'apartment', 'office', 'shop'], specials: {},
    events: { accidents: true }, weather: { sun: 4, cloud: 2, rain: 1 },
    tools: ['inspect', 'road', 'oneway', 'bulldoze', 'light', 'priority'],
    goals: [{ type: 'days', n: 2 }, { type: 'trips', n: 400 }, { type: 'sat', n: 50 }],
    grace: 90,
    intro: 'In der Altstadt gilt überall rechts vor links. Das ist sicher, aber bei viel Verkehr staut es sich schnell – und es kracht öfter. Setze Vorfahrtsschilder auf Hauptachsen und Ampeln an die großen Kreuzungen. Im Info-Fenster einer Ampel kannst du Phasen und Grünzeiten einstellen.',
  },
  {
    id: 'l4', name: 'Hügelheim', sub: 'Kreisel & Tunnel', w: 48, h: 30, seed: 4404,
    map: { forest: 0.35, rocks: 0.32, river: null, lakes: 1, fields: 0.15 },
    layout: 'mixed', start: { house: 10, office: 2, shop: 2 }, gates: 2,
    money: 26000, demand: 1.15, growth: 50, maxBuildings: 70, through: 35,
    types: ['house', 'apartment', 'office', 'shop'], specials: {},
    events: { accidents: true, works: true }, weather: { sun: 4, cloud: 2, rain: 1, fog: 1 },
    tools: ['inspect', 'road', 'oneway', 'bulldoze', 'light', 'priority', 'roundabout'],
    goals: [{ type: 'trips', n: 700 }, { type: 'sat', n: 60 }],
    grace: 80,
    intro: 'Hügelheim liegt zwischen Felsen. Tunnel sind möglich, aber kostspielig. Neu: Kreisverkehre – wer im Kreis fährt, hat Vorfahrt. Sie sind günstig im Unterhalt, sicher und bei mittlerem Verkehr unschlagbar.',
  },
  {
    id: 'l5', name: 'Hafen Nordstrand', sub: 'Gewerbe & Lieferverkehr', w: 50, h: 32, seed: 5505,
    map: { forest: 0.25, rocks: 0.08, river: null, lakes: 0, coast: 'e', fields: 0.2 },
    layout: 'split', start: { house: 12, office: 2, industry: 2, shop: 2 }, gates: 3,
    money: 30000, demand: 1.15, growth: 45, maxBuildings: 85, through: 30, inCommute: 18, outCommute: 0.6,
    types: ['house', 'apartment', 'office', 'shop', 'industry'], specials: { hospital: 140 },
    events: { accidents: true, works: true, ambulance: true }, weather: { sun: 3, cloud: 2, rain: 2, fog: 1 },
    tools: ['inspect', 'road', 'oneway', 'highway', 'bulldoze', 'light', 'priority', 'roundabout'],
    goals: [{ type: 'trips', n: 1000 }, { type: 'money', n: 40000 }],
    grace: 80,
    intro: 'Der Hafen brummt: Fabriken schicken LKW zu den Geschäften, Pendler kommen von außerhalb. Neu: Schnellstraßen – fast doppelt so schnell, aber teurer. Ziehe sie auch über bestehende Straßen, um sie auszubauen.',
  },
  {
    id: 'l6', name: 'Neustadt am Main', sub: 'Pendlerstrom', w: 54, h: 34, seed: 6606,
    map: { forest: 0.25, rocks: 0.1, river: { orient: 'h', width: 2 }, lakes: 0, fields: 0.25 },
    layout: 'river', start: { house: 14, office: 3, industry: 1, shop: 2 }, gates: 4,
    money: 34000, demand: 1.2, growth: 42, maxBuildings: 100, through: 60, inCommute: 30, outCommute: 0.8,
    types: ['house', 'apartment', 'office', 'shop', 'industry'], specials: { hospital: 120, firestation: 180 },
    events: { accidents: true, works: true, outage: true, fire: true, ambulance: true }, weather: { sun: 3, cloud: 2, rain: 2, fog: 1, snow: 1 },
    tools: ['inspect', 'road', 'oneway', 'highway', 'bulldoze', 'light', 'priority', 'roundabout'],
    goals: [{ type: 'days', n: 3 }, { type: 'trips', n: 1500 }, { type: 'sat', n: 55 }],
    grace: 75,
    intro: 'Neustadt ist Durchgangsstation für Tausende Pendler. Vier Ortseingänge, ein Fluss, Stromausfälle und Brände warten. Tipp: Koordiniere Ampeln mit dem Versatz-Regler zu einer Grünen Welle und halte Feuerwehr und Rettungswagen die Wege frei.',
  },
  {
    id: 'l7', name: 'Seestadt', sub: 'Bus & Bahn', w: 52, h: 34, seed: 7707,
    map: { forest: 0.25, rocks: 0.05, river: null, lakes: 2, bigLake: true, fields: 0.15 },
    layout: 'ring', start: { house: 16, office: 3, shop: 3 }, gates: 2,
    money: 36000, demand: 1.25, growth: 40, maxBuildings: 110, through: 25, inCommute: 15,
    types: ['house', 'apartment', 'office', 'shop', 'industry'], specials: { hospital: 140, firestation: 220, mall: 260 },
    events: { accidents: true, works: true, fire: true, ambulance: true }, weather: { sun: 3, cloud: 2, rain: 2, fog: 1 },
    tools: ALL_TOOLS,
    goals: [{ type: 'bus', n: 300 }, { type: 'trips', n: 1500 }, { type: 'sat', n: 55 }],
    grace: 75,
    intro: 'Rund um den See wird es eng. Neu: Busse! Setze Haltestellen in Wohngebiete und an Arbeitsplätze und verbinde sie mit einer Buslinie. Jeder Fahrgast ist ein Auto weniger auf der Straße.',
  },
  {
    id: 'l8', name: 'Metropole Rheinhafen', sub: 'Die große Stadt', w: 70, h: 44, seed: 8808,
    map: { forest: 0.25, rocks: 0.18, river: { orient: 'v', width: 3 }, lakes: 1, fields: 0.2 },
    layout: 'river', start: { house: 20, office: 4, industry: 2, shop: 3 }, gates: 4,
    money: 45000, demand: 1.3, growth: 34, maxBuildings: 200, through: 60, inCommute: 30, outCommute: 0.8,
    types: ['house', 'apartment', 'tower', 'office', 'shop', 'industry'], specials: { hospital: 120, firestation: 200, mall: 300, stadium: 420 },
    events: { accidents: true, works: true, outage: true, fire: true, ambulance: true, stadium: true }, weather: { sun: 3, cloud: 2, rain: 2, fog: 1, snow: 1 },
    tools: ALL_TOOLS,
    goals: [{ type: 'days', n: 5 }, { type: 'pop', n: 700 }, { type: 'sat', n: 55 }],
    grace: 70,
    intro: 'Die Königsdisziplin: eine wachsende Großstadt mit Fluss, Hügeln, Stadion und Einkaufszentrum. Halte fünf Tage durch und lass die Stadt auf 700 Einwohner wachsen – ohne dass sie im Stau erstickt.',
  },
];

const ENDLESS_MAPS = [
  { id: 'e_river', name: 'Flusstal', map: { forest: 0.3, rocks: 0.1, river: { orient: 'v', width: 2 }, lakes: 0, fields: 0.2 }, layout: 'river' },
  { id: 'e_coast', name: 'Küstenstadt', map: { forest: 0.25, rocks: 0.08, coast: 's', lakes: 0, fields: 0.2 }, layout: 'mixed' },
  { id: 'e_hills', name: 'Bergland', map: { forest: 0.4, rocks: 0.35, lakes: 1, fields: 0.1 }, layout: 'mixed' },
  { id: 'e_lake', name: 'Seenplatte', map: { forest: 0.3, rocks: 0.05, lakes: 3, bigLake: true, fields: 0.2 }, layout: 'ring' },
  { id: 'e_plain', name: 'Flachland', map: { forest: 0.2, rocks: 0, lakes: 0, fields: 0.4 }, layout: 'split' },
];

function endlessLevel(mapId, seed, sandbox) {
  const m = ENDLESS_MAPS.find(e => e.id === mapId) || ENDLESS_MAPS[0];
  return {
    id: (sandbox ? 'sandbox_' : 'endless_') + m.id, name: m.name, sub: sandbox ? 'Freies Bauen' : 'Endlos', w: 64, h: 40, seed: seed,
    map: m.map, layout: m.layout, start: { house: 12, office: 2, shop: 1, industry: 1 }, gates: 3,
    money: sandbox ? 1e9 : 40000, demand: 1.15, growth: sandbox ? 50 : 38, maxBuildings: 260, through: 40, inCommute: 20, outCommute: 0.6,
    types: ['house', 'apartment', 'tower', 'office', 'shop', 'industry'], specials: { hospital: 120, firestation: 180, mall: 280, stadium: 400 },
    events: { accidents: true, works: true, outage: true, fire: true, ambulance: true, stadium: true }, weather: { sun: 3, cloud: 2, rain: 2, fog: 1, snow: 1 },
    tools: sandbox ? ALL_TOOLS.concat(['place']) : ALL_TOOLS,
    goals: [], endless: !sandbox, sandbox: !!sandbox, grace: 80, ramp: true,
  };
}

const DEMO_LEVEL = {
  id: 'demo', name: 'Demo', w: 46, h: 28, seed: 4242,
  map: { forest: 0.3, rocks: 0.05, river: { orient: 'v', width: 2 }, lakes: 0, fields: 0.25 },
  layout: 'demo', start: {}, gates: 0, money: 0, demand: 2.2, growth: 0, maxBuildings: 0, through: 0,
  types: [], specials: {}, events: {}, weather: { sun: 1 }, tools: [], goals: [], demo: true,
};

// ---------------------------------------------------------------------------

function generateWorld(level, seed) {
  const W = level.w, H = level.h;
  const world = new World(W, H, seed);
  const rng = new RNG(seed);
  const m = level.map || {};
  const n = W * H;
  // Grundgelände
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const f = fbm(x / 9, y / 9, seed + 11, 3);
    world.terrain[i] = (m.fields && f > 1 - m.fields * 0.75) ? T_FIELD : T_GRASS;
  }
  // Wald
  if (m.forest) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const f = fbm(x / 7, y / 7, seed + 31, 4);
    if (f > 1 - m.forest * 0.7) world.terrain[y * W + x] = T_FOREST;
  }
  // Fels / Hügel
  if (m.rocks) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const f = fbm(x / 8, y / 8, seed + 57, 4);
    const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
    const cx = Math.abs(x - W / 2) / (W / 2), cy = Math.abs(y - H / 2) / (H / 2);
    const centerPenalty = Math.max(0, 0.35 - Math.max(cx, cy)) * 0.6;
    if (f - centerPenalty > 1 - m.rocks * 0.62 && edge > 0) world.terrain[y * W + x] = T_ROCK;
  }
  // Küste
  if (m.coast) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let d;
      if (m.coast === 'e') d = (W - 1 - x); else if (m.coast === 'w') d = x; else if (m.coast === 's') d = (H - 1 - y); else d = y;
      const shore = 5 + fbm(x / 6, y / 6, seed + 91, 3) * 5;
      const i = y * W + x;
      if (d < shore - 1.6) world.terrain[i] = T_WATER;
      else if (d < shore) world.terrain[i] = T_SAND;
    }
  }
  // Seen
  const lakes = m.lakes || 0;
  for (let k = 0; k < lakes; k++) {
    const big = m.bigLake && k === 0;
    const cx = big ? W / 2 + rng.range(-2, 2) : rng.range(W * 0.2, W * 0.8);
    const cy = big ? H / 2 + rng.range(-1, 1) : rng.range(H * 0.2, H * 0.8);
    const r = big ? Math.min(W, H) * 0.2 : rng.range(2.2, 3.8);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x - cx) / (big ? 1.35 : 1.15), dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy) + (fbm(x / 4, y / 4, seed + 200 + k, 2) - 0.5) * 2.6;
      const i = y * W + x;
      if (d < r) world.terrain[i] = T_WATER;
      else if (d < r + 0.9 && world.terrain[i] !== T_WATER && rng.chance(0.5)) world.terrain[i] = T_SAND;
    }
  }
  // Fluss
  if (m.river) {
    const vert = m.river.orient === 'v';
    const len = vert ? H : W, span = vert ? W : H;
    let pos = span * rng.range(0.45, 0.55);
    const wdt = m.river.width || 2;
    for (let t = 0; t < len; t++) {
      pos += (fbm(t / 6, 3.3, seed + 300, 2) - 0.5) * 1.3;
      pos = clamp(pos, span * 0.35, span * 0.65);
      const p0 = Math.round(pos - wdt / 2);
      for (let k = -1; k <= wdt; k++) {
        const c = p0 + k;
        if (c < 0 || c >= span) continue;
        const x = vert ? c : t, y = vert ? t : c;
        const i = y * W + x;
        if (k === -1 || k === wdt) { if (world.terrain[i] !== T_WATER && rng.chance(0.35)) world.terrain[i] = T_SAND; }
        else world.terrain[i] = T_WATER;
      }
    }
    world.riverPos = pos;
  }
  // Kartenrand: Felsen am Rand vermeiden für Ortseingänge (Fels wird zu Wald)
  for (let i = 0; i < n; i++) {
    const x = i % W, y = (i / W) | 0;
    if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && world.terrain[i] === T_ROCK) world.terrain[i] = T_FOREST;
  }
  return world;
}

// Platzierungshilfe für Startgebäude
function placeStartBuilding(game, type, region, rng, opts = {}) {
  const w = game.world, bt = BT[type];
  for (let attempt = 0; attempt < 400; attempt++) {
    const x = rng.int(Math.max(1, region[0]), Math.min(w.w - bt.w - 1, region[2] - bt.w));
    const y = rng.int(Math.max(1, region[1]), Math.min(w.h - bt.h - 1, region[3] - bt.h));
    const dirs = rng.shuffle([0, 1, 2, 3]);
    for (const dir of dirs) {
      if (!w.footprintOk(type, x, y, dir, { allowForest: attempt > 150 })) continue;
      const tmp = new Building(-1, type, x, y, dir, 1);
      if (opts.needRoad && !w.road[w.idx(tmp.ax, tmp.ay)]) continue;
      // Abstand: Zufahrt nicht von drei Seiten blockiert
      const a = w.idx(tmp.ax, tmp.ay);
      let blocked = 0;
      for (let d = 0; d < 4; d++) { const j = w.nb(a, d); if (j < 0 || w.bld[j] >= 0 || w.terrain[j] === T_WATER || w.terrain[j] === T_ROCK) blocked++; }
      if (blocked >= 2 && !w.road[a]) continue;
      // nicht direkt neben anderen Gebäuden kleben (Luft für Straßen)
      if (!opts.dense) {
        let near = 0;
        for (let yy = y - 1; yy <= y + bt.h; yy++) for (let xx = x - 1; xx <= x + bt.w; xx++) if (w.inb(xx, yy) && w.bld[w.idx(xx, yy)] >= 0) near++;
        if (near > (attempt > 200 ? 3 : 1)) continue;
      }
      const b = w.addBuilding(type, x, y, dir, rng.int(1, 1e9));
      if (type === 'office' || type === 'industry') b.name = rng.pick(COMPANY);
      return b;
    }
  }
  return null;
}

// Straße zwischen zwei Punkten (L-förmig) bauen, kostenlos
function buildFreeRoad(world, pts, cls = 1, mode = 'two') {
  const tiles = [];
  for (let k = 0; k < pts.length - 1; k++) {
    let [x, y] = pts[k];
    const [x1, y1] = pts[k + 1];
    if (!tiles.length) tiles.push(world.idx(x, y));
    while (x !== x1 || y !== y1) {
      if (x !== x1) x += Math.sign(x1 - x); else y += Math.sign(y1 - y);
      tiles.push(world.idx(x, y));
    }
  }
  const ok = [];
  for (const i of tiles) {
    if (world.bld[i] >= 0) { ok.push(false); continue; }
    if (!world.road[i]) world.placeRoad(i, cls);
    ok.push(true);
  }
  for (let k = 1; k < tiles.length; k++) {
    if (!ok[k] || !ok[k - 1]) continue;
    const a = tiles[k - 1], b = tiles[k];
    let d = -1;
    for (let q = 0; q < 4; q++) if (world.nb(a, q) === b) d = q;
    if (d >= 0) world.connect(a, d, mode);
  }
  for (const i of tiles) world.refresh(i);
  return tiles;
}

function placeGates(game, count, rng) {
  const w = game.world;
  const sides = rng.shuffle([0, 1, 2, 3]);
  const gates = [];
  let sideIdx = 0;
  for (let k = 0; k < count; k++) {
    for (let tries = 0; tries < 4; tries++) {
      const side = sides[(sideIdx++) % 4];
      // Position entlang der Seite
      const along = side === 0 || side === 2 ? w.w : w.h;
      let placed = false;
      for (let a = 0; a < 40 && !placed; a++) {
        const p = rng.int(Math.floor(along * 0.2), Math.floor(along * 0.8));
        let x, y, dir;
        if (side === 0) { x = p; y = 0; dir = 2; }
        else if (side === 2) { x = p; y = w.h - 1; dir = 0; }
        else if (side === 3) { x = 0; y = p; dir = 1; }
        else { x = w.w - 1; y = p; dir = 3; }
        // drei Kacheln nach innen müssen bebaubar sein
        let ok = true;
        for (let s = 0; s <= 3; s++) {
          const xx = x + DX[dir] * s, yy = y + DY[dir] * s;
          if (!w.inb(xx, yy)) { ok = false; break; }
          const i = w.idx(xx, yy);
          const t = w.terrain[i];
          if (t === T_WATER || t === T_ROCK || w.bld[i] >= 0 || (s > 0 && w.road[i])) { ok = false; break; }
        }
        if (!ok) continue;
        if (gates.some(g => Math.abs(g.x - x) + Math.abs(g.y - y) < 8)) continue;
        if (!w.footprintOk('gate', x, y, dir, { allowEdge: true, allowForest: true })) continue;
        const b = w.addBuilding('gate', x, y, dir, rng.int(1, 1e9));
        b.name = rng.pick(GATE_NAMES.filter(n => !gates.some(g => g.name === n)));
        const len = rng.int(2, 3);
        const pts = [[b.ax, b.ay], [b.ax + DX[dir] * (len - 1), b.ay + DY[dir] * (len - 1)]];
        buildFreeRoad(w, pts, 1);
        gates.push(b);
        placed = true;
      }
      if (placed) break;
    }
  }
  return gates;
}

function setupLevel(game) {
  const level = game.level;
  const w = game.world;
  const rng = new RNG(game.seed * 3 + 1);
  const W = w.w, H = w.h;
  const st = level.start || {};
  if (level.gates) placeGates(game, level.gates, rng);
  // Regionen je Layout
  let resR, jobR, mixR = [3, 3, W - 3, H - 3];
  if (level.layout === 'split') { resR = [3, 3, Math.floor(W * 0.42), H - 3]; jobR = [Math.floor(W * 0.58), 3, W - 3, H - 3]; }
  else if (level.layout === 'river') {
    if (level.map.river && level.map.river.orient === 'h') { resR = [3, 2, W - 3, Math.floor(H * 0.38)]; jobR = [3, Math.floor(H * 0.62), W - 3, H - 2]; }
    else { resR = [2, 3, Math.floor(W * 0.38), H - 3]; jobR = [Math.floor(W * 0.62), 3, W - 2, H - 3]; }
  } else if (level.layout === 'ring') { resR = [2, 2, W - 2, H - 2]; jobR = [2, 2, W - 2, H - 2]; }
  else { resR = mixR; jobR = mixR; }

  if (level.preRoads === 'grid') buildTownGrid(game, rng);
  if (level.layout === 'demo') { buildDemoCity(game, rng); return; }

  const order = [];
  for (const t of ['office', 'industry', 'shop', 'mall', 'hospital']) for (let k = 0; k < (st[t] || 0); k++) order.push(t);
  for (let k = 0; k < (st.house || 0); k++) order.push('house');
  for (const t of order) {
    const res = BT[t].cat === 'res';
    const region = res ? resR : jobR;
    const b = placeStartBuilding(game, t, region, rng, { needRoad: level.preRoads && rng.chance(0.85) });
    if (!b) placeStartBuilding(game, t, mixR, rng);
  }
  for (let i = 0; i < w.n; i++) w.refreshTile(i);
  w.bump();
}

// Vorgebaute Altstadt: Raster aus Straßen mit rechts-vor-links-Kreuzungen
function buildTownGrid(game, rng) {
  const w = game.world, W = w.w, H = w.h;
  const x0 = Math.floor(W * 0.22), x1 = Math.floor(W * 0.78), y0 = Math.floor(H * 0.2), y1 = Math.floor(H * 0.8);
  const xs = [], ys = [];
  for (let x = x0; x <= x1; x += 5) xs.push(x);
  for (let y = y0; y <= y1; y += 4) ys.push(y);
  for (const y of ys) buildFreeRoad(w, [[xs[0], y], [xs[xs.length - 1], y]]);
  for (const x of xs) buildFreeRoad(w, [[x, ys[0]], [x, ys[ys.length - 1]]]);
  // Ortseingänge anbinden
  for (const g of w.buildings.filter(b => b.cat === 'gate')) {
    let ex = g.ax, ey = g.ay;
    for (let s = 0; s < 3; s++) { const nx = ex + DX[g.dir], ny = ey + DY[g.dir]; if (!w.inb(nx, ny) || !w.road[w.idx(nx, ny)]) break; ex = nx; ey = ny; }
    const tx = clamp(ex, xs[0], xs[xs.length - 1]), ty = clamp(ey, ys[0], ys[ys.length - 1]);
    // nächste Rasterlinie
    const nxs = xs.reduce((a, b) => Math.abs(b - ex) < Math.abs(a - ex) ? b : a, xs[0]);
    const nys = ys.reduce((a, b) => Math.abs(b - ey) < Math.abs(a - ey) ? b : a, ys[0]);
    if (g.dir === 1 || g.dir === 3) buildFreeRoad(w, [[ex, ey], [nxs, ey], [nxs, nys]]);
    else buildFreeRoad(w, [[ex, ey], [ex, nys], [nxs, nys]]);
    void tx; void ty;
  }
}

// Demo-Stadt fürs Hauptmenü: komplett angebunden, mit Ampeln und Kreisverkehr
function buildDemoCity(game, rng) {
  const w = game.world, W = w.w, H = w.h;
  const rx = Math.round(w.riverPos || W / 2);
  // Hauptachsen
  const yA = Math.floor(H * 0.3), yB = Math.floor(H * 0.7);
  buildFreeRoad(w, [[2, yA], [W - 3, yA]], 1);
  buildFreeRoad(w, [[2, yB], [W - 3, yB]], 2);
  const cols = [5, 11, 17, rx + 5, rx + 11, W - 6];
  for (const x of cols) if (x > 1 && x < W - 2) buildFreeRoad(w, [[x, 3], [x, H - 4]]);
  // Kreuzungen steuern
  let k = 0;
  for (const J of [...w.junctions]) {
    const kind = k++ % 3;
    if (kind === 0) { J.setType('light'); J.light.smart = true; }
    else if (kind === 1) J.setType('roundabout');
    else J.setType('priority');
  }
  // Gebäude entlang der Straßen
  const types = ['house', 'house', 'house', 'apartment', 'office', 'shop', 'house', 'industry', 'house', 'shop', 'office'];
  for (let n = 0; n < 70; n++) {
    const t = types[n % types.length];
    placeStartBuilding(game, t, [1, 1, W - 1, H - 1], rng, { needRoad: true, dense: true });
  }
  for (let i = 0; i < w.n; i++) w.refreshTile(i);
  w.bump();
}
