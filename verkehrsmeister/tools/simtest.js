// Headless-Test der Simulation mit einem einfachen Bau-Bot.
//   node tools/simtest.js [stadt-id] [wochen] [seed]
// Der Bot verbindet neue Häuser mit dem Netz ihres Ziels, setzt Ampeln/Kreisel an
// Engstellen und nimmt Karten. Gibt Punktestand, Fahrzeugzahlen und Invarianten-Fehler aus.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', 'js');
const FILES = ['util.js', 'config.js', 'world.js', 'geometry.js', 'junction.js', 'pathfinding.js', 'traffic.js', 'mapgen.js', 'city.js', 'events.js', 'game.js'];

function load() {
  const ctx = { console, Math, JSON, Date };
  vm.createContext(ctx);
  let src = FILES.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
  src += '\n;this.__api = { Game, CFG, CITIES, CARDS, PALETTE, T_WATER, T_ROCK, DX, DY, OPP, F_BRIDGE, MinHeap, conflictTable };';
  vm.runInContext(src, ctx, { filename: 'bundle.js' });
  return ctx.__api;
}

function checkInvariants(g) {
  const tr = g.traffic;
  let problems = 0;
  for (let k = 0; k < tr.lanes.length; k++) {
    const L = tr.lanes[k];
    if (!L) continue;
    for (let q = 0; q < L.length; q++) {
      const v = L[q];
      if (v.dead) { problems++; console.log('Toter in Spur', v.id); }
      if (v.t * 4 + v.h !== k) { problems++; console.log('Falsche Spur', v.id); }
      if (q > 0) {
        const ld = L[q - 1];
        if (ld.s - v.s < (ld.len + v.len) * 0.5 - 0.06) { problems++; if (problems < 5) console.log('Überlappung', ld.id, v.id); }
      }
    }
  }
  for (const d of g.city.dests) if (d.assigned > d.pins || d.assigned < 0) { problems++; console.log('Zuweisung kaputt', d.id, d.pins, d.assigned); }
  let cars = 0, home = 0;
  for (const h of g.city.houses) { cars += h.cars; home += h.home + h.queue.length; }
  const onRoad = tr.vehicles.filter(v => !v.emergency).length;
  let parked = 0;
  for (const d of g.city.dests) parked += d.outQ.length;
  if (home + onRoad + parked !== cars) { problems++; console.log('Autozahl stimmt nicht', { cars, home, onRoad, parked }); }
  return problems;
}

// Kürzester Bauweg (Dijkstra): bestehende Straßen billig, neue Kacheln teurer, Wasser/Fels nur als Brücke/Tunnel
function botPath(api, g, from, targets) {
  const w = g.world, n = w.n;
  const dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1);
  const heap = new api.MinHeap(1024);
  dist[from] = 0; heap.push(0, from);
  const tset = new Set(targets);
  while (heap.n) {
    const i = heap.pop();
    if (heap.lastKey > dist[i]) continue;
    if (tset.has(i) && i !== from) {
      const p = []; let k = i; while (k >= 0) { p.push(k); k = prev[k]; } return p.reverse();
    }
    for (let d = 0; d < 4; d++) {
      const j = w.gnb(i, d);
      if (j < 0) continue;
      const ri = w.roadInfo(j);
      if (!ri.ok) continue;
      if (w.up[i] && ((w.up[i] >> d) & 1)) continue;
      if (w.up[j] && ((w.up[j] >> api.OPP[d]) & 1)) continue;
      if (w.rail[j] && ((w.rail[j] === 1) === (d === 0 || d === 2))) continue;
      let c = ri.kind === 'exists' ? 0.3 : ri.kind === 'road' ? 1 : ri.kind === 'crossing' ? 1.5 : ri.kind === 'bridge' ? (g.inv.bridges > 0 ? 3 : 99) : (g.inv.tunnels > 0 ? 4 : 99);
      if (w.accOf[j] >= 0 && !tset.has(j)) c += 3;
      const nd = dist[i] + c;
      if (nd < dist[j]) { dist[j] = nd; prev[j] = i; heap.push(nd, j); }
    }
  }
  return null;
}

function bot(api, g, rng) {
  const w = g.world;
  w.ensureComponents();
  // Ziele zuerst: mit dem nächsten Netz ihrer Farbe verbinden
  for (const d of g.city.dests) {
    const hs = g.city.houses.filter(h => h.pi === d.pi);
    const comp = w.link[d.acc] ? w.comp[d.acc] : -1;
    if (comp >= 0 && hs.some(h => w.link[h.acc] && w.comp[h.acc] === comp)) continue;
    let targets = [];
    for (const h of hs) {
      if (w.link[h.acc]) { const c = w.comp[h.acc]; for (let i = 0; i < w.n; i++) if (w.road[i] && w.comp[i] === c) targets.push(i); }
      else targets.push(h.acc);
    }
    if (!targets.length) continue;
    const p = botPath(api, g, d.acc, targets);
    if (p) { g.buildPath(p); w.ensureComponents(); }
  }
  // Häuser anschließen
  for (const h of g.city.houses) {
    const dests = g.city.dests.filter(d => d.pi === h.pi);
    if (!dests.length) continue;
    const comp = w.link[h.acc] ? w.comp[h.acc] : -1;
    if (dests.some(d => w.link[d.acc] && w.comp[d.acc] === comp && comp >= 0)) continue;
    // Ziel-Netz
    let targets = [];
    for (const d of dests) {
      if (w.link[d.acc]) { const c = w.comp[d.acc]; for (let i = 0; i < w.n; i++) if (w.road[i] && w.comp[i] === c) targets.push(i); }
      else targets.push(d.acc);
    }
    const p = botPath(api, g, h.acc, targets);
    if (p) { g.buildPath(p); w.ensureComponents(); }
  }
  // Ziele untereinander nicht nötig. Engstellen behandeln
  for (const pr of g.city.problems) {
    if (pr.kind !== 'junction') continue;
    const J = pr.J;
    if (J.type === 'auto' || J.type === 'priority') {
      if (g.inv.rounds > 0 && w.accOf[J.i] < 0 && !w.up[J.i]) g.useTool('round', J.i);
      else if (g.inv.lights > 0) g.useTool('light', J.i);
    }
    if (pr.sev > 15 && g.inv.police > 0 && J.police <= 0) g.useTool('police', J.i);
  }
}

function run(cityId, weeks, seed) {
  const api = load();
  const def = api.CITIES.find(c => c.id === cityId) || api.CITIES[0];
  const g = new api.Game(def, { seed });
  const rng = Math.random;
  const t0 = Date.now();
  let maxV = 0, problems = 0, s = 0;
  let botT = 0;
  const fxCount = {};
  while (!g.over && g.week <= weeks && s < 400000) {
    if (g.phase === 'week') {
      const cards = g.pendingWeek.cards;
      const pick = cards.find(c => c.id === 'round') || cards.find(c => c.id === 'lights') || cards.find(c => c.id === 'roads') || cards.find(c => !c.target) || null;
      console.log(`  Woche ${g.week}: ${g.pendingWeek.trips} Fahrten, gesamt ${g.score}, Karten: ${cards.map(c => c.id).join(',')} → ${pick ? pick.id : '-'} | Inventar ${JSON.stringify(g.inv)}`);
      g.chooseCard(pick, null);
      continue;
    }
    g.step(api.CFG.dt);
    s++;
    for (const f of g.fx) fxCount[f.t] = (fxCount[f.t] || 0) + 1;
    g.fx.length = 0;
    botT -= api.CFG.dt;
    if (botT <= 0) { botT = 1.5; bot(api, g, rng); }
    maxV = Math.max(maxV, g.traffic.vehicles.length);
    if (s % 400 === 0) problems += checkInvariants(g);
    if (s % 2000 === 0) {
      const ds = g.city.dests.map(d => `${api.PALETTE[d.pi].key[0]}${d.pins}/${d.assigned}${d.ring > 0 ? '!' + d.ring.toFixed(2) : ''}${d.cause ? '(' + d.cause + ')' : ''}`).join(' ');
      const conn = g.city.houses.filter(h => h.conn).length;
      console.log(`t=${g.time.toFixed(0)}s W${g.week}T${g.day} ${g.hour.toFixed(1)}h Fz=${g.traffic.vehicles.length} Punkte=${g.score} Häuser=${conn}/${g.city.houses.length} Ziele: ${ds} Straßen=${g.inv.roads}`);
    }
  }
  const ms = Date.now() - t0;
  console.log(`--- ${def.id}: ${s} Schritte in ${ms} ms (${(ms / Math.max(1, s)).toFixed(3)} ms/Schritt), max Fz ${maxV}, Probleme ${problems}, Punkte ${g.score}, Woche ${g.week}${g.over ? ' VERLOREN an ' + api.PALETTE[g.lostAt.pi].name + ' (' + g.report.cause + ')' : ''}`);
  console.log('fx:', JSON.stringify(fxCount));
  return { score: g.score, problems, over: g.over, week: g.week };
}

if (require.main === module) {
  const r = run(process.argv[2] || 'kleinbuettel', +(process.argv[3] || 4), +(process.argv[4] || 0) || undefined);
  process.exit(r.problems ? 1 : 0);
}
module.exports = { run, load, bot };
