#!/usr/bin/env node
'use strict';
// Differential reference for the combat port: runs scripted scenarios with the WEB game's own code (glutnacht/js)
// and writes per-step digests to tests/ref/parity.json. tests/parity.spec.luau runs the same scenarios with the Luau
// sim and compares step by step (docs/DESIGN.md, "Implementation status": R2 parity harness).
//   node tools/ref-sim.js [path/to/glutnacht]
//
// Both sides draw "random" numbers from the same scripted sequence u(n) = frac(0.137 + n * 0.6180339887498949), so
// every decision that consumes randomness in the same order produces the same result. Purely cosmetic random calls of
// the web game (particles, floating damage numbers, dash sparks) are removed from the web code before it runs; the
// Luau sim does not have them either.
//
// Scenarios:
//   boss:<stage>:<id>     the boss stands 260 px from the hero, skillT 0.4, runs SECS_BOSS seconds (all skills cycle)
//   ranged:<type>:<elite>:<t0>   one ranged enemy, SECS_RANGED seconds
//   weapon:<id>:<level>:<evo>    the hero with one weapon against a fixed grid of dummies, SECS_WEAPON seconds
// The hero walks a fixed pattern (see input()). Recorded every REC steps: digest numbers (see digest()).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.resolve(process.argv[2] || path.join(ROOT, '..', 'glutnacht'));
const read = f => fs.readFileSync(path.join(WEB, f), 'utf8');

const DT = 1 / 60, REC = 6;
const SECS_BOSS = 32, SECS_RANGED = 14, SECS_WEAPON = 8, RUN_SECS = +(process.env.RUN_SECS || 400), RUN_REC = 30;

// ---------- web code without cosmetic randomness ----------
function patch(src, from, to) {
  if (src.indexOf(from) < 0) throw new Error('patch target not found: ' + from);
  return src.split(from).join(to);
}
let game = read('js/game.js');
game = patch(game, 'if (Math.random() < 0.6) this.part(', 'if (false) this.part(');
game = patch(game, 'this.text(e.x + rand(-6, 6), e.y - e.r - 4,', 'this.text(e.x, e.y - e.r - 4,');
game = patch(game, 'if (Math.random() < 0.5) this.part(f.x', 'if (false) this.part(f.x');
game = patch(game, "this.part(t.x + ca * d, t.y + sa * d, k % 2 ? '#ff3d5a' : '#120a18', rand(-50, 50), rand(-50, 50), 0.45, rand(3, 6));", '');
game = patch(game, 'bob: Math.random() * 6 });\n  },\n\n  drop(', 'bob: 0 });\n  },\n\n  drop(');
game = patch(game, "kind, v: v || 0, mag: false, sp: 0, bob: Math.random() * 6 });", "kind, v: v || 0, mag: false, sp: 0, bob: 0 });");

const src = [read('js/util.js'), read('js/lang.js'), read('js/data.js'), game, read('js/weapons.js'),
  'this.__out = { Game, Store, defaultSave, ENEMIES, STAGES, WEAPONS, WEAPON_FN, Grid, HEAT };'].join('\n;\n');

let rn = 0;
const U = () => { const x = 0.137 + rn * 0.6180339887498949; rn++; return x - Math.floor(x); };
const ScriptedMath = Object.create(Math);
ScriptedMath.random = U;
// Math.hypot (V8) and sqrt(x*x + y*y) (the Luau sim) can differ in the last bit; crowds amplify that. The reference
// uses the Luau formula so that runs stay bit-comparable (no gameplay meaning).
ScriptedMath.hypot = (x, y) => Math.sqrt(x * x + y * y);
const ctx = { console, Math: ScriptedMath, Object, Array, JSON, Number, String, Set, Map, localStorage: undefined };
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: 'glutnacht-bundle.js' });
const W = ctx.__out;
const G = W.Game;
for (const k of ['part', 'burst', 'text']) G[k] = () => {};
G.view.top = 70; // the Roblox sim's fixed HUD band (Tuning.VIEW_TOP)

// ---------- scripted hero input: walk a slow loop with pauses ----------
function input(i) {
  const t = i * DT;
  if (t % 5 > 4.2) return [0, 0];
  const a = t * 0.55;
  return [Math.cos(a), Math.sin(a)];
}

function newRun(stageId, heat, hero) {
  W.Store.data = W.defaultSave();
  rn = 0;
  const r = G.newRun(hero || 'aron', heat, stageId);
  r.enemies.length = 0;
  r.p.hp = 1e6;
  rn = 0; // both sides restart the sequence after setup
  return r;
}

function stepWeb(r, i, withWeapons) {
  const dt = DT, p = r.p, s = r.stats;
  r.t += dt;
  const [ix, iy] = input(i);
  const il = Math.hypot(ix, iy);
  p.moving = il > 0.05;
  p.vx = p.vy = 0;
  if (p.slowT > 0) p.slowT -= dt;
  if (p.moving) {
    const k = Math.min(1, il) * (p.slowT > 0 ? 0.55 : 1);
    p.dirX = ix / il; p.dirY = iy / il;
    p.vx = p.dirX * s.speed * k; p.vy = p.dirY * s.speed * k;
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  if (p.iframe > 0) p.iframe -= dt;
  if (p.flash > 0) p.flash -= dt;
  const g = G.grid;
  g.clear();
  for (const e of r.enemies) if (!e.dead) g.insert(e);
  G.updateEnemies(dt);
  if (withWeapons) for (const w of r.weapons) W.WEAPON_FN[w.id].update(w, r, dt);
  G.updateShots(dt);
  G.updateEnemyShots(dt);
  G.updateFx(dt);
  const en = r.enemies;
  for (let k = en.length - 1; k >= 0; k--) if (en[k].dead) { en[k] = en[en.length - 1]; en.pop(); }
}

// digest: hero x, y, hp; enemies n, Σx, Σy, Σhp; eshots n, Σx, Σy; tele n, Σlife, Σx; haz n; shots n; Σ enemy damage
function digest(r) {
  const p = r.p;
  let ex = 0, ey = 0, eh = 0, sx = 0, sy = 0, tl = 0, tx = 0;
  for (const e of r.enemies) { ex += e.x; ey += e.y; eh += Math.max(0, e.hp); }
  for (const s of r.eshots) { sx += s.x; sy += s.y; }
  for (const t of r.tele) { tl += t.life; tx += t.x; }
  return [p.x, p.y, p.hp, r.enemies.length, ex, ey, eh, r.eshots.length, sx, sy, r.tele.length, tl, tx, r.haz.length, r.shots.length]
    .map(v => Math.round(v * 1e6) / 1e6);
}

// debug: DUMP=<scenario>:<fromStep>:<toStep> prints the state of those steps (compare with tests/parity.luau)
const DUMP = process.env.DUMP ? (a => [a.slice(0, -2).join(':'), +a[a.length - 2], +a[a.length - 1]])(process.env.DUMP.split(':')) : null;
const f3 = process.env.FULL ? v => String(v) : v => (Math.round(v * 1000) / 1000).toFixed(3);
function dump(r, i, b) {
  console.log(`step ${i} rn=${rn} boss mode=${b.mode} skillIdx=${b.skillIdx} skillT=${f3(b.skillT)} x=${f3(b.x)} y=${f3(b.y)} hero ${f3(r.p.x)},${f3(r.p.y)} hp=${f3(r.p.hp)} if=${f3(r.p.iframe)}`);
  console.log('  E ' + r.enemies.map(e => `${e.type}${f3(e.x)},${f3(e.y)}`).join(' '));
  console.log('  S ' + r.eshots.map(e => `${f3(e.x)},${f3(e.y)}`).join(' '));
  console.log('  T ' + r.tele.map(t => `${t.kind}${f3(t.x)},${f3(t.y)} ${f3(t.t)}/${f3(t.life)}`).join(' '));
}

const out = { dt: DT, rec: REC, scenarios: [] };

// ---------- bosses ----------
for (const st of W.STAGES) {
  for (const def of st.bosses) {
    for (const heat of [0, 3]) {
      const r = newRun(st.id, heat);
      r.t = def.t;
      const e = G.spawnBoss(def, 1);
      e.x = r.p.x + 260; e.y = r.p.y + 80;
      e.hp = e.maxHp = 1e9;
      e.skillT = 0.4;
      rn = 0;
      const rec = [];
      const n = Math.round(SECS_BOSS / DT);
      for (let i = 0; i < n; i++) {
        stepWeb(r, i, false);
        if ((i + 1) % REC === 0) rec.push(digest(r));
        if (DUMP && DUMP[0] === `boss:${st.id}:${def.id}:h${heat}` && i + 1 >= DUMP[1] && i + 1 <= DUMP[2]) dump(r, i + 1, e);
      }
      out.scenarios.push({ kind: 'boss', name: `boss:${st.id}:${def.id}:h${heat}`, stage: st.id, boss: def.id, heat, t0: def.t, rec });
    }
  }
}

// ---------- ranged enemies ----------
for (const type of ['spitter', 'cinder', 'moth', 'bell']) {
  for (const elite of [false, true]) {
    for (const t0 of [100, 300]) {
      const r = newRun('ruins', 0);
      r.t = t0;
      const e = G.spawnEnemy(type, r.p.x + 300, r.p.y + 120);
      if (elite) {
        e.elite = true;
        e.hp = e.maxHp = Math.max(160, e.maxHp * 14);
        e.r *= 1.55; e.xp *= 8; e.kb *= 0.3; e.dmg *= 1.4; e.speed *= 0.95;
      }
      e.hp = e.maxHp = 1e9;
      e.shootT = 0.5;
      rn = 0;
      const rec = [];
      const n = Math.round(SECS_RANGED / DT);
      for (let i = 0; i < n; i++) {
        stepWeb(r, i, false);
        if ((i + 1) % REC === 0) rec.push(digest(r));
      }
      out.scenarios.push({ kind: 'ranged', name: `ranged:${type}:${elite ? 'elite' : 'plain'}:${t0}`, stage: 'ruins', type, elite, t0, rec });
    }
  }
}

// ---------- weapons against dummies ----------
const DUMMY = [];
for (let gx = -4; gx <= 4; gx++) for (let gy = -3; gy <= 3; gy++) if (gx || gy) DUMMY.push([gx * 70 + 13, gy * 70 + 7]);
for (const wid of Object.keys(W.WEAPONS)) {
  for (const [level, evo] of [[1, false], [4, false], [8, false], [8, true]]) {
    const r = newRun('graveyard', 0);
    r.weapons.length = 0;
    const w = G.addWeapon(wid);
    w.level = level; w.evo = evo;
    G.refreshWeapon(w);
    r.t = 60;
    for (const [dx, dy] of DUMMY) {
      const e = G.spawnEnemy('golem', r.p.x + dx, r.p.y + dy);
      e.speed = 0; e.hp = e.maxHp = 1e7; e.dmg = 0;
    }
    rn = 0;
    const rec = [];
    const n = Math.round(SECS_WEAPON / DT);
    for (let i = 0; i < n; i++) {
      stepWeb(r, i, true);
      if ((i + 1) % REC === 0) rec.push(digest(r));
    }
    out.scenarios.push({ kind: 'weapon', name: `weapon:${wid}:${level}:${evo}`, stage: 'graveyard', weapon: wid, level, evo, t0: 60, dummies: DUMMY, rec });
  }
}

// ---------- director: waves, rangedFrom/rangedCap, elites, bosses, events, countdown and surge ----------
// Enemies do not move or fight here (no chaos): the hero walks the pattern, every enemy is removed 6 s after it
// appeared, and the per-step digest sums the spawned enemies' properties. Runs the whole land plus 30 s.
function directorDigest(r) {
  let x = 0, y = 0, hp = 0, sp = 0, xp = 0, dmg = 0, rr = 0, el = 0, bo = 0, sw = 0, ra = 0, ph = 0;
  for (const e of r.enemies) {
    x += e.x; y += e.y; hp += e.maxHp; sp += e.speed; xp += e.xp; dmg += e.dmg; rr += e.r;
    if (e.elite) el++; if (e.boss) bo++; if (e.swarm) sw++; if (e.ranged && !e.boss) ra++;
  }
  for (const c of r.cdList) ph += c.ph;
  return [r.enemies.length, x, y, hp, sp, xp, dmg, rr, el, bo, sw, ra, r.cdIdx, ph, r.eventIdx, r.bossIdx, r.spawnAcc, r.eliteN]
    .map(v => Math.round(v * 1e6) / 1e6);
}
for (const st of W.STAGES) {
  for (const heat of [0, 3, 5]) {
    const r = newRun(st.id, heat);
    const born = new Map();
    const rec = [];
    const n = Math.round((st.minutes * 60 + 30) / DT);
    for (let i = 0; i < n; i++) {
      const dt = DT, p = r.p, s = r.stats;
      r.t += dt;
      const [ix, iy] = input(i);
      const il = Math.hypot(ix, iy);
      p.moving = il > 0.05;
      p.vx = p.vy = 0;
      if (p.moving) {
        p.dirX = ix / il; p.dirY = iy / il;
        p.vx = p.dirX * s.speed; p.vy = p.dirY * s.speed;
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      let ra = 0;
      for (const e of r.enemies) if (e.ranged && !e.boss) ra++;
      r.rangedAlive = ra;
      G.director(dt);
      for (const e of r.enemies) if (!born.has(e)) born.set(e, r.t);
      const en = r.enemies;
      for (let k = en.length - 1; k >= 0; k--) {
        if (r.t - born.get(en[k]) >= 6) { en[k].dead = true; born.delete(en[k]); en[k] = en[en.length - 1]; en.pop(); }
      }
      if ((i + 1) % (REC * 10) === 0) rec.push(directorDigest(r));
    }
    out.scenarios.push({ kind: 'director', name: `director:${st.id}:h${heat}`, stage: st.id, heat, rec, every: REC * 10 });
  }
}

// ---------- whole solo runs (Game.update): weapons, enemies, pickups, level-ups (first card), chests ----------
// The main loop of main.js at a steady 60 fps: dialogs are answered between frames, then the 0.45-s ramp. Crowds
// amplify last-bit differences of sin/cos between V8 and Luau, so these runs agree exactly only for a while; the spec
// compares them up to the first pure position drift (see tests/parity.spec.luau).
function runDigest(r) {
  let ex = 0, ey = 0, eh = 0, wl = 0;
  for (const e of r.enemies) { ex += e.x; ey += e.y; eh += Math.max(0, e.hp); }
  for (const w of r.weapons) wl += w.level + (w.evo ? 10 : 0);
  let pl = 0;
  for (const pa of r.passives) pl += pa.level;
  return [r.p.x, r.p.y, r.p.hp, r.level, r.xp, r.gold, r.kills, r.enemies.length, ex, ey, eh, r.gems.length,
    r.pickups.length, wl, pl, r.shots.length, r.eshots.length, r.tele.length, r.weapons.length]
    .map(v => Math.round(v * 1e6) / 1e6);
}
// god: the hero cannot be hit (i-frames every frame), so the run lasts RUN_SECS (countdown, surge, bosses, chests)
const RUNS = [['graveyard', 'aron', 0, false], ['graveyard', 'mira', 0, false], ['ashwood', 'kael', 0, false],
  ['frostlake', 'aron', 3, false], ['ruins', 'mira', 0, false], ['nightheart', 'aron', 5, false],
  ['graveyard', 'aron', 0, true], ['ashwood', 'mira', 0, true], ['frostlake', 'kael', 3, true], ['ruins', 'aron', 0, true],
  ['nightheart', 'mira', 5, true]];
for (const [stageId, hero, heat, god] of RUNS) {
  W.Store.data = W.defaultSave();
  rn = 0;
  const r = G.newRun(hero, heat, stageId);
  const rec = [], RS = 0.45;
  let prevSt = G.state, resume = 0;
  const n = Math.round(RUN_SECS / DT);
  for (let i = 0; i < n && !r.over; i++) {
    // one frame of main.js; a dialog shows for one frame and is answered with the first card before the next one
    if (god) r.p.iframe = 1e9;
    const st = G.state;
    if (st === 'play' && st !== prevSt && (prevSt === 'levelup' || prevSt === 'chest') && (r.eshots.length || r.tele.length)) resume = RS;
    prevSt = st;
    const [ix, iy] = input(i);
    G.input.x = ix; G.input.y = iy;
    if (st === 'play') {
      let gdt = DT;
      if (resume > 0) { gdt = DT * (0.3 + 0.7 * (1 - resume / RS)); resume = Math.max(0, resume - DT); }
      G.update(gdt);
    } else {
      resume = 0;
      if (st === 'levelup') G.chooseLevel(G.lastLevelOptions[0]);
      else if (st === 'chest') G.closeChest();
    }
    if ((i + 1) % RUN_REC === 0) rec.push(runDigest(r));
    if (DUMP && DUMP[0] === `run:${stageId}:${hero}:h${heat}${god ? ':god' : ''}` && i + 1 >= DUMP[1] && i + 1 <= DUMP[2]) {
      console.log(`step ${i + 1} st=${G.state} rn=${rn} t=${f3(r.t)} ` + runDigest(r).map(f3).join(' '));
      console.log('  P ' + r.pickups.map(e => `${e.kind}${f3(e.x)},${f3(e.y)}`).join(' '));
      if (process.env.FULL) console.log('  E ' + r.enemies.map(e => `${e.id}:${e.x.toPrecision(17)},${e.y.toPrecision(17)}`).join(' '));
    }
  }
  out.scenarios.push({ kind: 'run', name: `run:${stageId}:${hero}:h${heat}${god ? ':god' : ''}`, stage: stageId, hero, heat, god, rec, every: RUN_REC });
}

const file = path.join(ROOT, 'tests/ref/parity.json');
fs.writeFileSync(file, JSON.stringify(out) + '\n');
console.log('wrote tests/ref/parity.json:', out.scenarios.length, 'scenarios,', fs.statSync(file).size, 'bytes');
