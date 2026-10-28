// Headless-Test der Spiellogik mit einem einfachen Ausweich-Bot.
//   node tools/simtest.js [charakter] [nachtstufe] [läufe]
// Gibt pro Lauf Überlebenszeit, Stufe, Kills, Waffen und Schaden je Waffe aus.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', 'js');
const FILES = ['util.js', 'data.js', 'game.js', 'weapons.js'];

function load() {
  const mem = {};
  const ctx = {
    console, Math, JSON, Date, Map, Set,
    localStorage: { getItem: k => mem[k] || null, setItem: (k, v) => { mem[k] = v; } },
  };
  vm.createContext(ctx);
  let src = FILES.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
  src += '\n;this.__api = { Game, Store, Hooks, WEAPONS, PASSIVES, BOSSES, CHARS, HEAT, fmtTime };';
  vm.runInContext(src, ctx, { filename: 'bundle.js' });
  return ctx.__api;
}

function bot(api) {
  const { Game } = api;
  const r = Game.run, p = r.p;
  // Abstoßung von Gegnern, Anziehung zu Edelsteinen und Truhen
  let fx = 0, fy = 0;
  for (const e of r.enemies) {
    if (e.dead) continue;
    const dx = p.x - e.x, dy = p.y - e.y;
    const d2 = dx * dx + dy * dy;
    const R = e.boss ? 220 : 80 + e.r;
    if (d2 > R * R) continue;
    const d = Math.sqrt(d2) || 1;
    const w = (1 - d / R) * (e.boss ? 4 : 1) / d;
    fx += dx * w; fy += dy * w;
  }
  for (const s of r.eshots) {
    const dx = p.x - s.x, dy = p.y - s.y, d2 = dx * dx + dy * dy;
    if (d2 < 120 * 120) { fx += dx * 3 / Math.max(100, d2); fy += dy * 3 / Math.max(100, d2); }
  }
  for (const t of r.tele) {
    if (t.kind === 'circle') { const dx = p.x - t.x, dy = p.y - t.y, d2 = dx * dx + dy * dy; if (d2 < 150 * 150) { fx += dx * 8 / Math.max(50, d2); fy += dy * 8 / Math.max(50, d2); } }
  }
  let best = null, bd = 1e12;
  for (const g of r.gems) { const d = (g.x - p.x) ** 2 + (g.y - p.y) ** 2; if (d < bd) { bd = d; best = g; } }
  for (const g of r.pickups) { const d = (g.x - p.x) ** 2 + (g.y - p.y) ** 2 - 200000; if (d < bd) { bd = d; best = g; } }
  if (best) {
    const dx = best.x - p.x, dy = best.y - p.y, d = Math.hypot(dx, dy) || 1;
    fx += dx / d * 0.35; fy += dy / d * 0.35;
  }
  // leichte Kreisbewegung, damit der Bot nicht an Ort bleibt
  fx += Math.cos(r.t * 0.25) * 0.15;
  fy += Math.sin(r.t * 0.25) * 0.15;
  const l = Math.hypot(fx, fy) || 1;
  Game.input.x = fx / l; Game.input.y = fy / l;
}

function choose(api, opts) {
  const { Game, WEAPONS } = api;
  const r = Game.run;
  const evoNeeds = new Set(r.weapons.map(w => WEAPONS[w.id].evo.with));
  const score = o => {
    if (o.kind === 'weapon' && !o.isNew) return 100 + o.level;
    if (o.kind === 'passive' && evoNeeds.has(o.id)) return 80;
    if (o.kind === 'weapon' && o.isNew) return 60;
    if (o.kind === 'passive') return 40 + (o.id === 'might' ? 5 : 0);
    return 0;
  };
  return opts.slice().sort((a, b) => score(b) - score(a))[0];
}

function runOnce(api, charId, heat, log) {
  const { Game, Hooks, Store } = api;
  Store.load();
  let pending = null, chest = false, victory = false, over = null;
  Hooks.levelUp = o => { pending = o; };
  Hooks.chest = () => { chest = true; };
  Hooks.victory = () => { victory = true; };
  Hooks.gameOver = s => { over = s; };
  const r = Game.newRun(charId, heat);
  const dt = 1 / 60;
  let maxEnemies = 0, marks = [];
  let lastMin = -1;
  const t0 = Date.now();
  while (!over && r.t < 1000) {
    if (Game.state === 'levelup') { Game.chooseLevel(choose(api, pending)); continue; }
    if (Game.state === 'chest') { chest = false; Game.closeChest(); continue; }
    if (Game.state === 'victory') { Game.endRun(true); break; }
    bot(api);
    Game.update(dt);
    maxEnemies = Math.max(maxEnemies, r.enemies.length);
    const m = Math.floor(r.t / 60);
    if (m !== lastMin) { lastMin = m; marks.push(`${m}m:L${r.level}/${r.enemies.length}e/${Math.round(r.p.hp)}hp`); }
  }
  const ms = Date.now() - t0;
  if (!r.won) {
    const near = {};
    for (const e of r.enemies) if (!e.dead && Math.hypot(e.x - r.p.x, e.y - r.p.y) < 150) near[e.boss ? e.boss.id : e.type + (e.elite ? '*' : '')] = (near[e.boss ? e.boss.id : e.type] || 0) + 1;
    console.log('  Tod nahe: ' + JSON.stringify(near) + ' eshots=' + r.eshots.length + ' bosse=' + r.bosses.filter(b => !b.dead).map(b => b.boss.id + ':' + Math.round(b.hp)).join(','));
  }
  const dmg = Object.entries(r.dmgBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + '=' + Math.round(v / 1000) + 'k').join(' ');
  console.log(`${charId} h${heat}: ${api.fmtTime(r.t)} ${r.won ? 'SIEG' : 'tot'} L${r.level} kills=${r.kills} gold=${over ? over.total : '?'} maxE=${maxEnemies} bosse=${r.bossKills} evo=${r.evolvedCount} (${ms} ms)`);
  console.log('  Waffen: ' + r.weapons.map(w => w.id + w.level + (w.evo ? '*' : '')).join(' ') + ' | Passiv: ' + r.passives.map(p => p.id + p.level).join(' '));
  console.log('  Schaden: ' + dmg);
  if (log) console.log('  ' + marks.join(' '));
  return r;
}

const api = load();
const charId = process.argv[2] || 'aron';
const heat = +(process.argv[3] || 0);
const n = +(process.argv[4] || 1);
for (let i = 0; i < n; i++) runOnce(api, charId, heat, true);
