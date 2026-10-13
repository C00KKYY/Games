// Einfacher Spiel-Bot für Balance-Tests: node tools/bot.js [levelId|all] [tage]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', 'js');
const FILES = ['util.js', 'config.js', 'world.js', 'geometry.js', 'pathfinding.js', 'junction.js', 'traffic.js', 'city.js', 'mapgen.js', 'game.js'];

function load() {
  const ctx = { console, performance: { now: () => Number(process.hrtime.bigint()) / 1e6 }, Math, JSON, Date, btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary') };
  vm.createContext(ctx);
  const src = FILES.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n') + '\n;this.__api = { Game, LEVELS, endlessLevel, CFG, MinHeap, T_WATER, T_ROCK, T_FOREST, popcount4, turnOf, conflictTable };';
  vm.runInContext(src, ctx, { filename: 'bundle.js' });
  return ctx.__api;
}

// Kürzester Bauweg von Kachel a zu irgendeiner Straße der Hauptkomponente
function connectPath(api, g, a, targetComp) {
  const w = g.world;
  const N = w.n;
  const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
  const heap = new api.MinHeap(1024);
  dist[a] = 0; heap.push(0, a);
  while (heap.n) {
    const i = heap.pop();
    const d0 = heap.lastKey;
    if (d0 > dist[i]) continue;
    if (i !== a && w.road[i] && w.comp[i] === targetComp) {
      const p = []; let k = i; while (k >= 0) { p.push(k); k = prev[k]; }
      return p.reverse();
    }
    for (let d = 0; d < 4; d++) {
      const j = w.nb(i, d);
      if (j < 0 || w.bld[j] >= 0) continue;
      // Keine Zufahrtsfelder anderer Gebäude überbauen? doch: ist Straße sowieso nötig
      let c = 1;
      const t = w.terrain[j];
      if (w.road[j]) c = 0.6; else if (t === api.T_WATER) c = 9; else if (t === api.T_ROCK) c = 12; else if (t === api.T_FOREST) c = 1.3;
      // Kreuzungen vermeiden, die an Einfahrten hängen
      if (w.drive[j] && !w.road[j]) c += 0.5;
      const nd = d0 + c;
      if (nd < dist[j]) { dist[j] = nd; prev[j] = i; heap.push(nd, j); }
    }
  }
  return null;
}

function mainComp(g) {
  const w = g.world;
  w.ensureComponents();
  const cnt = new Map();
  for (const b of w.buildings) if (!b.dead && w.road[b.acc]) { const c = w.comp[b.acc]; cnt.set(c, (cnt.get(c) || 0) + 1); }
  let best = -1, bn = -1;
  for (const [c, n] of cnt) if (n > bn) { bn = n; best = c; }
  return best;
}

// Rasternetz im Bereich der Bebauung (wie ein vernünftiger Spieler)
function gridTick(api, g, opts) {
  const w = g.world;
  const bs = w.buildings.filter(b => !b.dead && b.cat !== 'gate');
  if (!bs.length) return;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const b of bs) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  const sp = opts.spacing || 5;
  x0 = Math.max(1, x0 - 2); y0 = Math.max(1, y0 - 2); x1 = Math.min(w.w - 2, x1 + 2); y1 = Math.min(w.h - 2, y1 + 2);
  const lines = [];
  for (let y = y0 + ((sp - (y0 % sp)) % sp); y <= y1; y += sp) lines.push(['h', y]);
  for (let x = x0 + ((sp - (x0 % sp)) % sp); x <= x1; x += sp) lines.push(['v', x]);
  for (const [o, c] of lines) {
    let seg = [];
    const flush = () => { if (seg.length > 1) g.buildRoad(seg, 'road'); seg = []; };
    const n = o === 'h' ? x1 - x0 + 1 : y1 - y0 + 1;
    for (let k = 0; k < n; k++) {
      const x = o === 'h' ? x0 + k : c, y = o === 'h' ? c : y0 + k;
      const i = w.idx(x, y);
      if (w.bld[i] >= 0 || (!w.road[i] && g.money < 3000)) { flush(); continue; }
      seg.push(i);
    }
    flush();
  }
}

function botTick(api, g, opts) {
  const w = g.world;
  if (opts.grid && (opts._last === undefined || g.hourAbs - opts._last >= 2)) { opts._last = g.hourAbs; gridTick(api, g, opts); }
  w.ensureComponents();
  let mc = mainComp(g);
  const bs = w.buildings.filter(b => !b.dead);
  for (const b of bs) {
    if (mc >= 0 && w.road[b.acc] && w.comp[b.acc] === mc) continue;
    if (mc < 0) {
      // erstes Gebäude: Zufahrt mit dem nächsten anderen Gebäude verbinden
      const other = bs.find(o => o !== b);
      if (!other) return;
      const p = straight(w, b.ax, b.ay, other.ax, other.ay);
      g.buildRoad(p, 'road');
      w.ensureComponents(); mc = mainComp(g);
      continue;
    }
    if (!w.road[b.acc]) g.buildRoad([b.acc], 'road');
    w.ensureComponents();
    const p = connectPath(api, g, b.acc, mc);
    if (p) g.buildRoad(p, 'road');
    w.ensureComponents();
  }
  // Kreuzungen regeln
  if (opts.manage) {
    for (const J of w.junctions) {
      const m = Math.max(...J.waitEma);
      if (J.type === 'auto' && m > 5 && g.level.tools.includes('roundabout') && !w.drive[J.i] && w.road[J.i] !== 2 && g.money > 6000) g.setControl(J.i, 'roundabout');
      else if (J.type === 'auto' && m > 5 && g.level.tools.includes('light') && g.money > 4000) { g.setControl(J.i, 'light'); if (g.money > 8000 && J.light) { g.spend(CFG_SMART(api), 'x'); J.light.smart = true; J.light.paid = true; } }
    }
  }
}
function CFG_SMART(api) { return api.CFG.cost.smart; }

function straight(w, x0, y0, x1, y1) {
  const t = []; let x = x0, y = y0; t.push(w.idx(x, y));
  while (x !== x1 || y !== y1) { if (x !== x1) x += Math.sign(x1 - x); else y += Math.sign(y1 - y); t.push(w.idx(x, y)); }
  return t;
}

function runLevel(api, lv, days, opts) {
  const g = new api.Game({ level: lv });
  let notes = [];
  g.onNote = n => notes.push(n);
  const stepsPerDay = 1440 / api.CFG.minPerSec / api.CFG.dt;
  const t0 = Date.now();
  let won = null, minSat = 100, maxVeh = 0;
  const daily = [];
  for (let s = 0; s < days * stepsPerDay; s++) {
    if (s % 200 === 0) botTick(api, g, opts);
    g.step(api.CFG.dt);
    maxVeh = Math.max(maxVeh, g.traffic.vehicles.length);
    if (s > 2000) minSat = Math.min(minSat, g.satisfaction);
    if (g.over && won === null) { won = g.endInfo; break; }
    if (s % stepsPerDay === stepsPerDay - 1) daily.push({ day: g.dayIndex, sat: g.satisfaction.toFixed(0), money: Math.round(g.money), trips: g.stats.trips, b: g.world.buildings.filter(b => !b.dead).length, pop: g.population(), acc: g.stats.accidents, gave: g.traffic.stats.gaveUp, failed: g.stats.failed, pax: g.stats.busPax });
  }
  const ms = Date.now() - t0;
  const gs = g.goalStatus().map(x => `${x.label}: ${Math.round(x.cur)}/${x.target}${x.done ? '✓' : ''}`).join(' | ');
  console.log(`\n=== ${lv.id} ${lv.name} (${(ms / 1000).toFixed(1)} s) Ende: ${won ? JSON.stringify(won) + ' an Tag ' + g.dayIndex + ' ' + g.hour + 'h' : 'läuft'} minZufr ${minSat.toFixed(0)} maxFz ${maxVeh}`);
  console.log('  Ziele:', gs);
  for (const d of daily) console.log('  ', JSON.stringify(d));
  const kinds = {};
  for (const n of notes) kinds[n.kind] = (kinds[n.kind] || 0) + 1;
  console.log('  Meldungen:', JSON.stringify(kinds), 'A*:', g.traffic.pf.calls, 'Fehlgründe:', JSON.stringify(g.failWhy), 'tripRating', g.tripRating.toFixed(0), 'penalty', g.penaltyV.toFixed(1), 'unconn', g.city.unconnectedCount(g.level.grace || 80));
  if (process.env.WARN) for (const n of notes.filter(n => n.kind === 'warn' || n.kind === 'danger').slice(0, 30)) console.log('    ', n.text);
  return g;
}

if (require.main === module) {
  const api = load();
  const which = process.argv[2] || 'all';
  const days = parseFloat(process.argv[3] || '3');
  const manage = process.argv[4] !== 'nomanage';
  const grid = process.argv[5] === 'grid';
  const levels = which === 'all' ? api.LEVELS : which.startsWith('e_') ? [api.endlessLevel(which, 99, false)] : api.LEVELS.filter(l => l.id === which);
  for (const lv of levels) runLevel(api, lv, days, { manage, grid });
} else module.exports = { load, botTick, runLevel };
