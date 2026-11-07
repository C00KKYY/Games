// Headless-Test der Spiellogik mit einem einfachen Ausweich-Bot.
//   node tools/simtest.js [charakter] [nachtstufe] [läufe] [gebiet]
// Gibt pro Lauf Überlebenszeit, Stufe, Kills, Waffen und Schaden je Waffe aus.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', 'js');
const FILES = ['util.js', 'lang.js', 'data.js', 'game.js', 'weapons.js'];

function load() {
  const mem = {};
  const ctx = {
    console, Math, JSON, Date, Map, Set,
    localStorage: { getItem: k => mem[k] || null, setItem: (k, v) => { mem[k] = v; } },
  };
  vm.createContext(ctx);
  let src = FILES.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
  src += '\n;this.__api = { Game, Store, Hooks, WEAPONS, PASSIVES, STAGES, CHARS, HEAT, fmtTime, hpCurve, tr };';
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

function runOnce(api, charId, heat, log, stage) {
  const { Game, Hooks, Store } = api;
  Store.load();
  let pending = null, chest = false, victory = false, over = null;
  Hooks.levelUp = o => { pending = o; };
  Hooks.chest = () => { chest = true; };
  Hooks.victory = () => { victory = true; };
  Hooks.gameOver = s => { over = s; };
  const r = Game.newRun(charId, heat, stage);
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

// ---------- M10: Countdown und Ansturm (Zeitplan-Regeln, HP-Brücke, Phasen, Pause, Endlosmodus) ----------
function m10Checks(api) {
  const { Game, Hooks, Store, STAGES, HEAT, hpCurve } = api;
  const fail = [];
  const ok = (c, msg) => { if (!c) fail.push(msg); };
  for (const st of STAGES) {
    const id = st.id, surges = st.surges || [];
    // effektive Ereigniszeiten (unsortierte Listen feuern der Reihe nach: frühestens mit dem Vorgänger)
    const evT = [];
    for (const ev of st.events) evT.push(Math.max(ev.t, evT.length ? evT[evT.length - 1] : 0));
    const bossT = st.bosses.map(b => b.t);
    const eliteT = [];
    for (let t = 30; t < st.minutes * 60; t += 60) eliteT.push(t);
    const fb = st.bosses.slice().sort((a, b) => a.t - b.t).find(b => !b.final);
    for (const s of surges) {
      ok(s.t - s.lead >= 85, `${id}: Countdown beginnt vor 85 s (${s.t - s.lead})`);
      for (const [name, m] of [['Beginn', s.t], ['Ende', s.t + s.dur], ['T-10', s.t - 10]]) {
        for (const t of evT) ok(Math.abs(t - m) >= 2.5, `${id}: Ansturm-${name} ${m} s zu nah an Ereignis ${t} s`);
        for (const t of bossT) ok(Math.abs(t - m) >= 2.5, `${id}: Ansturm-${name} ${m} s zu nah an Boss ${t} s`);
        for (const t of eliteT) ok(Math.abs(t - m) >= 2.5, `${id}: Ansturm-${name} ${m} s zu nah an Elite ${t} s`);
      }
      if (fb) {
        ok(s.t + s.dur <= fb.t - 20 - 10, `${id}: Ansturm endet weniger als 10 s vor dem Boss-Countdown`);
        ok(s.t + s.dur < fb.t - 20, `${id}: Ansturm überlappt den Boss-Countdown`);
      }
      for (const k of ['hint', 'text']) ok(api.tr(s[k]) !== undefined, `${id}: ${k} fehlt`);
    }
    // HP-Brücke: bis 75 s und ab 240 s identisch mit der alten Kurve, dazwischen nie darunter
    Store.load();
    Game.newRun('aron', 0, id);
    const base = HEAT[0].hp * st.mult.hp;
    for (let t = 0; t <= 900; t += 0.5) {
      const h = Game.hpMul(t), old = base * hpCurve(t / 60);
      if (t <= 75 || t >= 240) ok(Math.abs(h - old) < 1e-9, `${id}: hpMul(${t}) weicht von der alten Kurve ab`);
      else ok(h >= old - 1e-9, `${id}: hpMul(${t}) unter der alten Kurve`);
    }
  }

  // Phasen, Klänge und Banner in einem echten Lauf je Land (unverwundbarer Held)
  for (const st of STAGES) {
    const s = (st.surges || [])[0];
    if (!s) continue;
    Store.load();
    const log = [];
    const keep = { sfx: Hooks.sfx, banner: Hooks.banner, levelUp: Hooks.levelUp, chest: Hooks.chest };
    Hooks.sfx = n => log.push([Game.run.t, 'sfx', n]);
    Hooks.banner = (t, k) => log.push([Game.run.t, 'banner', t]);
    let pend = null;
    Hooks.levelUp = o => { pend = o; };
    Hooks.chest = () => {};
    const r = Game.newRun('aron', 0, st.id);
    const A = s.t - s.lead, E = s.t + s.dur;
    const marks = [[A - 1, null], [A, 'warn'], [s.t - 0.1, 'warn'], [s.t, 'on'], [E - 0.1, 'on'], [E, null]];
    const step = until => {
      while (r.t < until) {
        if (Game.state === 'levelup') { Game.chooseLevel(pend[0]); continue; }
        if (Game.state === 'chest') { Game.closeChest(); continue; }
        if (Game.state !== 'play') throw new Error(`${st.id}: Zustand ${Game.state} bei ${r.t.toFixed(1)} s`);
        r.p.iframe = 1; r.p.hp = r.stats.maxHp; // unverwundbar
        Game.update(1 / 60);
      }
    };
    for (const [t, ph] of marks) {
      step(t);
      const cs = Game.countdownState();
      const got = cs && cs.kind === 'surge' ? cs.phase : null;
      ok(got === ph, `${st.id}: countdownState bei ${t} s = ${got}, erwartet ${ph}`);
      if (t === A) {
        // Pause: 10 s Echtzeit ohne Fortschritt
        const t0 = r.t, left = cs && cs.left;
        Game.state = 'paused';
        for (let i = 0; i < 600; i++) Game.update(1 / 60);
        Game.state = 'play';
        ok(r.t === t0 && Game.countdownState().left === left, `${st.id}: Pause lässt den Countdown laufen`);
      }
    }
    const at = (kind, name) => log.filter(x => x[1] === kind && x[2] === name).map(x => x[0]);
    const warn = at('sfx', 'warn'), surge = at('sfx', 'surge'), ach = at('sfx', 'achievement');
    ok(warn.length === 1 && Math.abs(warn[0] - A) < 0.05, `${st.id}: warn-Klang ${warn}`);
    ok(surge.length === 1 && Math.abs(surge[0] - s.t) < 0.05, `${st.id}: surge-Klang ${surge}`);
    ok(at('sfx', 'alarm').filter(t => Math.abs(t - s.t) < 0.05).length === 0, `${st.id}: Eröffnung nicht leise`);
    const ticks = at('sfx', 'tick').filter(t => t < s.t + 1);
    ok(ticks.length === 5 && ticks.every((t, i) => Math.abs(t - (s.t - 5 + i)) < 0.05), `${st.id}: Ticks ${ticks.map(t => t.toFixed(2))}`);
    ok(at('banner', api.tr('Mach dich bereit!')).some(t => Math.abs(t - (s.t - 10)) < 0.05), `${st.id}: T-10-Banner fehlt`);
    ok(at('banner', api.tr(s.text)).some(t => Math.abs(t - s.t) < 0.05), `${st.id}: Ansturm-Banner fehlt`);
    ok(at('banner', api.tr('Ansturm überstanden!')).some(t => Math.abs(t - E) < 0.05), `${st.id}: End-Banner fehlt`);
    ok(ach.some(t => Math.abs(t - E) < 0.05), `${st.id}: End-Klang fehlt`);
    // leichter Boss-Countdown: Leiste, drei Ticks, kein warn
    const fb = r.bossList.find(b => !b.final);
    step(fb.t - 20 - 0.5);
    ok(Game.countdownState() === null, `${st.id}: Countdown vor dem Boss-Countdown`);
    step(fb.t - 19.5);
    const bc = Game.countdownState();
    ok(bc && bc.kind === 'boss' && bc.phase === 'warn' && bc.label === fb.name, `${st.id}: Boss-Countdown fehlt`);
    step(fb.t + 0.5);
    const bt = at('sfx', 'tick').filter(t => t > fb.t - 20);
    ok(bt.length === 3 && bt.every((t, i) => Math.abs(t - (fb.t - 3 + i)) < 0.05), `${st.id}: Boss-Ticks ${bt.map(t => t.toFixed(2))}`);
    ok(at('sfx', 'warn').length === 1, `${st.id}: Boss-Countdown mit warn-Klang`);
    ok(Game.countdownState() === null, `${st.id}: Countdown nach dem Boss`);
    // Endlosmodus: nie ein Countdown
    r.t = r.length + 1; r.endless = true; r.won = true;
    const n0 = log.length;
    step(r.length + 30);
    ok(Game.countdownState() === null && !log.slice(n0).some(x => x[1] === 'sfx' && ['warn', 'tick', 'surge'].includes(x[2])), `${st.id}: Countdown im Endlosmodus`);
    Object.assign(Hooks, keep);
  }
  return fail;
}

const api = load();
{
  const t0 = Date.now(), fail = m10Checks(api);
  if (fail.length) { console.log('M10-PRÜFUNG FEHLGESCHLAGEN:\n  ' + fail.join('\n  ')); process.exitCode = 1; }
  else console.log(`M10-Prüfung ok (Zeitplan, HP-Brücke, Phasen, Pause, Endlos; ${Date.now() - t0} ms)`);
}
const charId = process.argv[2] || 'aron';
const heat = +(process.argv[3] || 0);
const n = +(process.argv[4] || 1);
const stage = process.argv[5] || 'graveyard';
for (let i = 0; i < n; i++) runOnce(api, charId, heat, true, stage);
