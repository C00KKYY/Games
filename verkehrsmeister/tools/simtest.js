// Headless-Test der Simulation: node tools/simtest.js [szenario] [schritte]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', 'js');
const FILES = ['util.js', 'config.js', 'world.js', 'geometry.js', 'pathfinding.js', 'junction.js', 'traffic.js', 'city.js', 'mapgen.js', 'game.js'];

function load() {
  const ctx = { console, performance: { now: () => Number(process.hrtime.bigint()) / 1e6 }, Math, JSON, Date, btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary') };
  vm.createContext(ctx);
  let src = FILES.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
  src += '\n;this.__api = { Game, LEVELS, DEMO_LEVEL, endlessLevel, CFG, buildFreeRoad, T_GRASS, World, ratingFor };';
  vm.runInContext(src, ctx, { filename: 'bundle.js' });
  return ctx.__api;
}

function checkInvariants(api, g) {
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
        if (ld.s - v.s < (ld.len + v.len) * 0.5 - 0.06) { problems++; if (problems < 5) console.log('Überlappung', ld.id, v.id, ld.s.toFixed(2), v.s.toFixed(2)); }
      }
    }
  }
  return problems;
}

function run(scenario, steps) {
  const api = load();
  let g;
  if (scenario === 'demo') g = new api.Game({ level: api.DEMO_LEVEL });
  else if (scenario.startsWith('l')) {
    const lv = api.LEVELS.find(l => l.id === scenario);
    g = new api.Game({ level: lv });
    autoConnect(api, g);
  } else if (scenario === 'endless') { g = new api.Game({ level: api.endlessLevel('e_river', 77, false) }); autoConnect(api, g); }
  g.onNote = n => { if (process.env.NOTES) console.log('  [' + n.kind + '] ' + n.text); };
  const t0 = Date.now();
  let maxV = 0, problems = 0;
  for (let s = 0; s < steps; s++) {
    g.step(api.CFG.dt);
    maxV = Math.max(maxV, g.traffic.vehicles.length);
    if (s % 500 === 0) problems += checkInvariants(api, g);
    if (s % 2000 === 0) {
      console.log(`t=${g.time.toFixed(0)}s ${pad(g.hour)}:00 Tag ${g.dayIndex} Fz=${g.traffic.vehicles.length} Fahrten=${g.stats.trips} fehl=${g.stats.failed} aufg=${g.traffic.stats.gaveUp} Zufr=${g.satisfaction.toFixed(1)} Geld=${Math.round(g.money)} Geb=${g.world.buildings.filter(b => !b.dead).length}`);
    }
    if (g.over) { console.log('ENDE', JSON.stringify(g.endInfo)); break; }
  }
  const ms = Date.now() - t0;
  console.log(`--- ${scenario}: ${steps} Schritte in ${ms} ms (${(ms / steps).toFixed(3)} ms/Schritt), max Fz ${maxV}, Probleme ${problems}`);
  console.log('Stats', JSON.stringify(g.stats), 'A*-Aufrufe', g.traffic.pf.calls);
  const js = [...(g.world.junctions || [])].map(J => ({ i: J.i, type: J.type, wait: Array.from(J.waitEma).map(x => x.toFixed(1)).join('/'), occ: J.occ.length }));
  js.sort((a, b) => Math.max(...b.wait.split('/').map(Number)) - Math.max(...a.wait.split('/').map(Number)));
  console.log('Kreuzungen (Top 5 Wartezeit):', JSON.stringify(js.slice(0, 5)));
}

function pad(n) { return n < 10 ? '0' + n : '' + n; }

// Einfache "KI": verbindet alle Gebäudezufahrten mit einem Netz (für Tests)
function autoConnect(api, g) {
  const w = g.world;
  const bs = w.buildings.filter(b => !b.dead);
  // Hauptachse durch Kartenmitte
  const my = Math.floor(w.h / 2);
  const tiles = [];
  for (const b of bs) {
    // Zufahrt -> senkrecht zur Hauptachse -> Hauptachse
    const pts = [[b.ax, b.ay], [b.ax, my]];
    tiles.push(pts);
  }
  let minX = Math.min(...bs.map(b => b.ax)), maxX = Math.max(...bs.map(b => b.ax));
  g.money = 1e9;
  const line = [];
  for (let x = minX; x <= maxX; x++) line.push(w.idx(x, my));
  g.buildRoad(line, 'road');
  for (const pts of tiles) {
    const [x0, y0] = pts[0];
    const p = [];
    const step = y0 < my ? 1 : -1;
    for (let y = y0; y !== my + step; y += step) p.push(w.idx(x0, y));
    g.buildRoad(p, 'road');
  }
  g.money = 30000;
}

const scen = process.argv[2] || 'demo';
const steps = parseInt(process.argv[3] || '12000', 10);
run(scen, steps);
