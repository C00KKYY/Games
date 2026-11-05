'use strict';
// Balance-Bot für Ember Night: starker Ausweich-Bot, misst Siegquote und Werte je Minute.
//   node tools/balancebot.js <held> <nachtstufe> <läufe> <preset> [land] [tmax]
//   preset: none | light | mid | max ; land: graveyard | ashwood | frostlake | ruins | nightheart
//   env BOT=weak nutzt den alten simtest-Bot, PATCH=<datei.json> ersetzt Codestellen ([[alt, neu], …]).
// Prints one JSON line per run with per-minute stats.
const fs = require('fs'), path = require('path'), vm = require('vm');

const JSDIR = process.env.JSDIR || path.join(__dirname, '..', 'js');
const STAGE = process.argv[6] || 'ashwood';
const FILES = ['util.js', 'lang.js', 'data.js', 'game.js', 'weapons.js'];

function rep(src, a, b) { if (!src.includes(a)) throw new Error('patch miss: ' + a); return src.split(a).join(b); }

function load() {
  const mem = {};
  const ctx = { console, Math, JSON, Date, Map, Set, localStorage: { getItem: k => mem[k] || null, setItem: (k, v) => { mem[k] = v; } } };
  vm.createContext(ctx);
  let src = FILES.map(f => fs.readFileSync(path.join(JSDIR, f), 'utf8')).join('\n;\n');
  // Instrumentation (does not change game rules)
  src = rep(src, 'if (d < rr) this.hurtPlayer(e.dmg);', 'if (d < rr) { this._src = e.boss ? "boss" : (e.elite ? "elite" : e.swarm ? "swarm" : "contact"); this.hurtPlayer(e.dmg); }');
  src = rep(src, 'this.hurtPlayer(s.dmg);', 'this._src = "shot"; this.hurtPlayer(s.dmg);');
  src = rep(src, 'this.hurtPlayer(t.dmg);', '{ this._src = "slam"; this.hurtPlayer(t.dmg); }');
  src = rep(src, 'p.hp -= taken;', 'p.hp -= taken; if (r.M) { r.M.taken += taken; r.M.src[this._src || "?"] = (r.M.src[this._src || "?"] || 0) + taken; } (r.hits = r.hits || []).push([Math.round(r.t * 10) / 10, this._src, Math.round(taken), Math.round(p.hp)]); if (r.hits.length > 25) r.hits.shift();');
  src = rep(src, 'r.dmgBy[wid] = (r.dmgBy[wid] || 0) + Math.min(dmg, Math.max(0, e.hp));',
    'r.dmgBy[wid] = (r.dmgBy[wid] || 0) + Math.min(dmg, Math.max(0, e.hp)); if (r.M) { if (e.boss) r.M.bossDmg += Math.min(dmg, Math.max(0, e.hp)); else { r.M.dmg += Math.min(dmg, Math.max(0, e.hp)); if (wid !== "bomb" && wid !== "revive") r.M.raw += dmg; } }');
  src = rep(src, '    r.enemies.push(e);\n    return e;', '    r.enemies.push(e); if (r.M) { r.M.spawnHp += hp; r.M.spawnN++; }\n    return e;');
  src = rep(src, '      shootT: rand(1.5, 3), ranged: !!d.ranged,', '      shootT: rand(1.5, 3), ranged: !!d.ranged, born: r.t,');
  src = rep(src, '    e.dead = true;\n    r.kills++;', '    e.dead = true; if (r.M && !e.swarm && !e.boss) { r.M.life += r.t - e.born; r.M.lifeN++; r.M.dd += Math.hypot(e.x - r.p.x, e.y - r.p.y); }\n    r.kills++;');
  src = rep(src, 'if (alive >= cap) { r.spawnAcc = 0; break; }', 'if (alive >= cap) { r.spawnAcc = 0; if (r.M) r.M.capped++; break; }');
  if (process.env.PATCH) for (const [a, b] of JSON.parse(fs.readFileSync(process.env.PATCH, 'utf8'))) src = rep(src, a, b);
  src += '\n;this.__api = { Game, Store, Hooks, WEAPONS, PASSIVES, CHARS, HEAT, SHOP, ENEMIES, fmtTime, xpFor };';
  vm.runInContext(src, ctx, { filename: 'bundle.js' });
  return ctx.__api;
}

const PRESETS = {
  none: {},
  light: { might: 2, maxhp: 1, armor: 1, regen: 2, greed: 2 },
  human3: { might: 1, maxhp: 1, regen: 1 },
  mid: { might: 4, armor: 2, maxhp: 2, regen: 3, greed: 3, growth: 2, magnet: 1, speed: 1, reroll: 2, cd: 1, area: 1, skip: 1 },
};

// ---------------------------------------------------------------- strong movement bot
const NDIR = 24;
const DIRS = [];
for (let i = 0; i < NDIR; i++) DIRS.push([Math.cos(i / NDIR * Math.PI * 2), Math.sin(i / NDIR * Math.PI * 2)]);
DIRS.push([0, 0]);
const TAUS = [0.1, 0.22, 0.38, 0.58, 0.85, 1.2];
const TW = JSON.parse(process.env.TW || '[1, 0.7, 0.4, 0.15, 0.05, 0.02]');
const BS = { lastDir: 0, near: [], tgt: null };

function strongBot(api) {
  const { Game } = api;
  const r = Game.run, p = r.p, sp = r.stats.speed;
  const pr = p.r;
  const hpFrac = p.hp / r.stats.maxHp;
  // nearby enemies
  const near = BS.near; near.length = 0;
  let cxs = 0, cys = 0, cw = 0;
  for (const e of r.enemies) {
    if (e.dead) continue;
    const dx = e.x - p.x, dy = e.y - p.y, d2 = dx * dx + dy * dy;
    if (d2 < 460 * 460) { e._d2 = d2; near.push(e); }
    if (d2 < 700 * 700) { const w = (e.boss ? 6 : 1); cxs += dx * w; cys += dy * w; cw += w; }
  }
  if (near.length > 70) { near.sort((a, b) => a._d2 - b._d2); near.length = 70; }
  // precompute goal vectors
  const goals = BS.goals || (BS.goals = []); goals.length = 0;
  // gem target: best cluster value / distance (cells of 160 px)
  const cells = BS.cells || (BS.cells = new Map()); cells.clear();
  for (const gm of r.gems) {
    if (gm.mag) continue;
    const k = Math.floor(gm.x / 160) * 100000 + Math.floor(gm.y / 160);
    let c = cells.get(k); if (!c) { c = { v: 0, x: 0, y: 0 }; cells.set(k, c); }
    c.v += gm.v; c.x += gm.x * gm.v; c.y += gm.y * gm.v;
  }
  let tgt = null, tbest = 0;
  for (const c of cells.values()) {
    const x = c.x / c.v, y = c.y / c.v, d = Math.hypot(x - p.x, y - p.y);
    let sc = c.v / (d + 150);
    if (BS.tgt && Math.hypot(x - BS.tgt[0], y - BS.tgt[1]) < 160) sc *= 1.5; // hysteresis
    if (sc > tbest) { tbest = sc; tgt = [x, y, d]; }
  }
  BS.tgt = tgt;
  if (tgt) {
    const d = tgt[2] || 1;
    goals.push((tgt[0] - p.x) / d, (tgt[1] - p.y) / d, 0.6 + 2.0 * hpFrac * hpFrac, 1);
  }
  for (const it of r.pickups) {
    const dx = it.x - p.x, dy = it.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (d > 1400) continue;
    let v = 0;
    if (it.kind === 'chest') v = 3; else if (it.kind === 'magnet') v = 1.5;
    else if (it.kind === 'heart') v = hpFrac < 0.75 ? 2.5 * (1 - hpFrac) + 0.3 : 0.05;
    else if (it.kind === 'bomb') v = 0.8; else v = 0.25;
    goals.push(dx / d, dy / d, v * 200 / (d + 200), 1);
  }
  for (const pr2 of r.propList) {
    const dx = pr2.x - p.x, dy = pr2.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (d > 600) continue;
    goals.push(dx / d, dy / d, 0.4 * 200 / (d + 200), 1);
  }
  // preferred boss distance: melee-ish builds must get close to hurt the boss
  let melee = 0;
  for (const w of r.weapons) if (w.id === 'whip' || w.id === 'aura' || w.id === 'orbit' || w.id === 'nova') melee++;
  // rough burst damage per second (to judge which enemies die before they reach us)
  let burst = 0;
  for (const w of r.weapons) burst += w.st.dmg * Math.max(1, w.st.amount) / Math.max(0.3, w.st.cd);
  let close = 0;
  for (const e of near) if (e._d2 < 170 * 170) close++;
  const caution = (1 - hpFrac);
  const scores = new Float64Array(DIRS.length);
  for (let di = 0; di < DIRS.length; di++) {
    const [ux, uy] = DIRS[di];
    let danger = 0;
    // 1) Enemies: predicted chase positions
    for (const e of near) {
      const es = (e.freezeT > 0 ? 0 : e.speed * e.slowF);
      const rr = e.r + pr + (e.boss ? 26 : 10) + caution * 8;
      const kf = e.boss || e.elite ? 1 : Math.min(1, Math.max(0.2, e.hp / (burst * 0.5 + 1)));
      const dmgW = (0.6 + e.dmg / 12 + (e.boss ? 3 : 0)) * kf;
      for (let k = 0; k < TAUS.length; k++) {
        const t = TAUS[k];
        const px = p.x + ux * sp * t, py = p.y + uy * sp * t;
        let ex, ey;
        if (e.swarm) { ex = e.x + e.sdx * es * t; ey = e.y + e.sdy * es * t; }
        else if (e.boss && e.mode === 'dash') { ex = e.x + Math.cos(e.dashA) * 560 * Math.min(t, e.modeT); ey = e.y + Math.sin(e.dashA) * 560 * Math.min(t, e.modeT); }
        else if (e.boss && e.mode === 'windup') {
          const td = Math.max(0, t - e.modeT);
          ex = e.x + Math.cos(e.dashA) * 560 * Math.min(td, 0.6); ey = e.y + Math.sin(e.dashA) * 560 * Math.min(td, 0.6);
        } else {
          const dx = px - e.x, dy = py - e.y, d = Math.hypot(dx, dy) || 1;
          const step = Math.min(d, es * t);
          ex = e.x + dx / d * step; ey = e.y + dy / d * step;
        }
        const d = Math.hypot(px - ex, py - ey);
        if (d < rr + 20) {
          const pen = d < rr ? 1 + (rr - d) / rr : (rr + 20 - d) / 20 * 0.25;
          danger += pen * dmgW * TW[k];
        }
      }
    }
    // 2) Enemy shots
    for (const s of r.eshots) {
      const rr = s.r + pr + 8;
      for (let k = 0; k < TAUS.length; k++) {
        const t = TAUS[k];
        if (t > s.life) break;
        const px = p.x + ux * sp * t, py = p.y + uy * sp * t;
        const sx = s.x + s.vx * t, sy = s.y + s.vy * t;
        const d = Math.hypot(px - sx, py - sy);
        if (d < rr + 14) danger += (d < rr ? 2 : 0.4) * (0.6 + s.dmg / 10) / (1 + t);
      }
    }
    // 3) Telegraphs
    for (const tl of r.tele) {
      const rem = tl.life - tl.t;
      if (tl.kind === 'circle') {
        const t = Math.min(rem, 1.0);
        const px = p.x + ux * sp * t, py = p.y + uy * sp * t;
        const d = Math.hypot(px - tl.x, py - tl.y);
        const rr = tl.rad + pr + 14;
        if (d < rr) danger += (4 + (rr - d) / 20) * (0.6 + tl.dmg / 12);
      } else if (tl.kind === 'line') {
        const ca = Math.cos(tl.a), sa = Math.sin(tl.a);
        const e = tl.follow;
        const wd = (e ? e.r : 40) + pr + 22;
        for (const t of [rem, rem + 0.2, rem + 0.4]) {
          const tt = Math.min(t, 1.2);
          const px = p.x + ux * sp * tt, py = p.y + uy * sp * tt;
          const rx = px - tl.x, ry = py - tl.y;
          const along = rx * ca + ry * sa, perp = Math.abs(-rx * sa + ry * ca);
          if (along > -60 && along < 420 && perp < wd) danger += 3 + (wd - perp) / 15;
        }
      }
    }
    // 4) Clearance / crowd: how open is this direction?
    let crowd = 0, clear = 600;
    if (di < NDIR) {
      for (const e of near) {
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
        const along = dx * ux + dy * uy;
        const w = (e.boss ? 5 : 1) * (0.5 + e.dmg / 15);
        if (along > 0) {
          const perp = Math.abs(-dx * uy + dy * ux);
          if (perp < e.r + pr + 18) clear = Math.min(clear, along);
          if (d < 320) crowd += w * (along / d) * (along / d) / Math.max(60, d);
        }
      }
    } else { // standing still: crowd is everything around
      for (const e of near) { const d = Math.hypot(e.x - p.x, e.y - p.y) || 1; crowd += 0.5 * (e.boss ? 5 : 1) / Math.max(60, d); }
      clear = 200;
    }
    let sc = -danger * 10 - crowd * 4 + Math.min(clear, 400) / 400 * 1.0;
    const T = BS.terms ? (BS.terms[di] = { danger: -danger * 10, crowd: -crowd * 4, clear: Math.min(clear, 400) / 400, boss: 0, goals: 0 }) : null;
    const sc0 = sc;
    // bosses: keep a comfortable distance
    for (const b of r.bosses) {
      if (b.dead) continue;
      const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1;
      const busy = b.mode !== 'chase';
      const want = busy || hpFrac < 0.5 || close > 8 ? 260 : (melee >= 1 ? b.r + 75 : 200);
      const c = (dx * ux + dy * uy) / d;
      if (d < want) sc -= c * (want - d) / 60;
      else if (d < want + 300) sc += c * Math.min(1, (d - want) / 120) * 0.8;
    }
    if (T) T.boss = sc - sc0;
    const sc1 = sc;
    // 5) Goals: gems, chests, hearts, magnets
    if (di < NDIR) {
      for (let i = 0; i < goals.length; i += 4) {
        const c = goals[i] * ux + goals[i + 1] * uy;
        if (c > 0) sc += goals[i + 2] * c * c;
      }
      if (T) T.goals = sc - sc1;
      // orbit the horde: tangential preference around enemy centroid
      if (cw > 0) {
        const cl = Math.hypot(cxs, cys) || 1, tx = -cys / cl, ty = cxs / cl;
        sc += 0.25 * (tx * ux + ty * uy);
      }
      // continuity
      if (BS.lastDir < NDIR) { const [lx, ly] = DIRS[BS.lastDir]; sc += 0.35 * (lx * ux + ly * uy); }
    } else sc -= 0.3;
    scores[di] = sc;
  }
  let best = 0;
  for (let i = 1; i < DIRS.length; i++) if (scores[i] > scores[best]) best = i;
  BS.lastDir = best;
  Game.input.x = DIRS[best][0]; Game.input.y = DIRS[best][1];
}

// original weak bot from tools/simtest.js
function weakBot(api) {
  const { Game } = api;
  const r = Game.run, p = r.p;
  let fx = 0, fy = 0;
  for (const e of r.enemies) {
    if (e.dead) continue;
    const dx = p.x - e.x, dy = p.y - e.y; const d2 = dx * dx + dy * dy;
    const R = e.boss ? 220 : 80 + e.r; if (d2 > R * R) continue;
    const d = Math.sqrt(d2) || 1; const w = (1 - d / R) * (e.boss ? 4 : 1) / d; fx += dx * w; fy += dy * w;
  }
  for (const s of r.eshots) { const dx = p.x - s.x, dy = p.y - s.y, d2 = dx * dx + dy * dy; if (d2 < 14400) { fx += dx * 3 / Math.max(100, d2); fy += dy * 3 / Math.max(100, d2); } }
  for (const t of r.tele) if (t.kind === 'circle') { const dx = p.x - t.x, dy = p.y - t.y, d2 = dx * dx + dy * dy; if (d2 < 22500) { fx += dx * 8 / Math.max(50, d2); fy += dy * 8 / Math.max(50, d2); } }
  let best = null, bd = 1e12;
  for (const g of r.gems) { const d = (g.x - p.x) ** 2 + (g.y - p.y) ** 2; if (d < bd) { bd = d; best = g; } }
  for (const g of r.pickups) { const d = (g.x - p.x) ** 2 + (g.y - p.y) ** 2 - 200000; if (d < bd) { bd = d; best = g; } }
  if (best) { const dx = best.x - p.x, dy = best.y - p.y, d = Math.hypot(dx, dy) || 1; fx += dx / d * 0.35; fy += dy / d * 0.35; }
  fx += Math.cos(r.t * 0.25) * 0.15; fy += Math.sin(r.t * 0.25) * 0.15;
  const l = Math.hypot(fx, fy) || 1; Game.input.x = fx / l; Game.input.y = fy / l;
}

// ---------------------------------------------------------------- build choices
const WTIER = JSON.parse(process.env.WTIER || 'null') || { lightning: 10, whip: 9, sickle: 9, aura: 8, nova: 7, fire: 7, orbit: 6, knives: 6, wand: 5 };
const MAXW = +(process.env.MAXW || 4);
function scoreOpt(api, o) {
  const { Game, WEAPONS } = api;
  const r = Game.run;
  const partners = new Set(r.weapons.map(w => WEAPONS[w.id].evo.with));
  if (o.kind === 'weapon') {
    if (!o.isNew) {
      let s = 80 + WTIER[o.id] + o.level * 0.5;
      if (o.level === 8 && Game.hasPassive(WEAPONS[o.id].evo.with)) s += 10;
      return s;
    }
    if (r.weapons.length < MAXW) return 86 + WTIER[o.id];
    return 50 + WTIER[o.id];
  }
  if (o.kind === 'passive') {
    const id = o.id;
    const core = { might: 74, hourglass: 72, mirror: 76, heart: 70, armor: 62 };
    let s;
    if (partners.has(id)) s = Math.max(core[id] || 0, 78);
    else s = core[id] || ({ lens: 52, clover: 45, elixir: 46, magnet: 44, boots: 40, candle: 38, wing: 35 })[id] || 30;
    if (o.isNew && !partners.has(id) && !core[id]) {
      // keep passive slots for evo partners
      const freeSlots = 6 - r.passives.length;
      const missing = [...partners].filter(x => !Game.hasPassive(x)).length + Math.max(0, MAXW - r.weapons.length);
      if (freeSlots - 1 < missing) s -= 30;
    }
    return s;
  }
  return 1;
}
function chooseStrong(api, opts) {
  const { Game } = api;
  const r = Game.run;
  let sorted = opts.slice().sort((a, b) => scoreOpt(api, b) - scoreOpt(api, a));
  let tries = 0;
  while (scoreOpt(api, sorted[0]) < 40 && tries++ < 3) {
    if (r.banishes > 0) {
      const bad = sorted.find(o => o.isNew && scoreOpt(api, o) < 40);
      if (bad) { const n = Game.banish(bad); if (n) { sorted = n.slice().sort((a, b) => scoreOpt(api, b) - scoreOpt(api, a)); continue; } }
    }
    if (r.rerolls > 0) { const n = Game.reroll(); sorted = n.slice().sort((a, b) => scoreOpt(api, b) - scoreOpt(api, a)); continue; }
    if (r.skips > 0 && scoreOpt(api, sorted[0]) < 20) return null;
    break;
  }
  return sorted[0];
}
function chooseWeak(api, opts) {
  const { Game, WEAPONS } = api; const r = Game.run;
  const evoNeeds = new Set(r.weapons.map(w => WEAPONS[w.id].evo.with));
  const score = o => { if (o.kind === 'weapon' && !o.isNew) return 100 + o.level; if (o.kind === 'passive' && evoNeeds.has(o.id)) return 80; if (o.kind === 'weapon' && o.isNew) return 60; if (o.kind === 'passive') return 40 + (o.id === 'might' ? 5 : 0); return 0; };
  return opts.slice().sort((a, b) => score(b) - score(a))[0];
}

// ---------------------------------------------------------------- main
const api = load();
const [charId, heatS, nS, preset] = process.argv.slice(2);
const heat = +heatS, n = +nS;
const TMAX = +(process.argv[7] || 1080);
const weak = process.env.BOT === 'weak';
for (let i = 0; i < n; i++) {
  const { Game, Hooks, Store, SHOP } = api;
  Store.load();
  Store.data.shop = {};
  if (preset === 'max') for (const it of SHOP) Store.data.shop[it.id] = it.max;
  else Object.assign(Store.data.shop, PRESETS[preset] || {});
  let over = null, pending = null;
  Hooks.levelUp = o => { pending = o; }; Hooks.chest = () => {}; Hooks.victory = () => {}; Hooks.gameOver = s => { over = s; };
  const r = Game.newRun(charId, heat, STAGE);
  const newM = () => ({ taken: 0, src: {}, dmg: 0, raw: 0, bossDmg: 0, spawnHp: 0, spawnN: 0, capped: 0, aliveSum: 0, frames: 0, kills0: r.kills, life: 0, lifeN: 0, dd: 0 });
  r.M = newM();
  const mins = [];
  const dt = 1 / 60; let frame = 0, curMin = 0, revT = null; const startRev = r.revivals;
  const bk = {}; const t0 = Date.now(); let evoT = []; const early = {};
  while (!over && r.t < TMAX) {
    if (Game.state === 'levelup') {
      const o = weak ? chooseWeak(api, Game.lastLevelOptions) : chooseStrong(api, Game.lastLevelOptions);
      if (o === null) Game.skipLevel(); else Game.chooseLevel(o);
      continue;
    }
    if (Game.state === 'chest') { const ec = r.evolvedCount; Game.closeChest(); continue; }
    if (Game.state === 'victory') { Game.endRun(true); break; }
    if (weak) weakBot(api); else if (frame % 3 === 0) strongBot(api);
    frame++;
    const ec = r.evolvedCount;
    Game.update(dt);
    if (r.evolvedCount > ec) evoT.push(Math.round(r.t));
    r.M.aliveSum += r.enemies.length; r.M.frames++;
    // Frühphase: Gegner im Bild bei 10/30/60 s, Stufe bei 60 s, erster Treffer
    for (const T of [2, 10, 30, 60]) if (early['scr' + T] === undefined && r.t >= T) {
      const hw = Game.view.hw, hh = Game.view.hh;
      early['scr' + T] = r.enemies.filter(e => !e.dead && Math.abs(e.x - r.p.x) < hw && Math.abs(e.y - r.p.y) < hh).length;
      if (T === 60) { early.lvl60 = r.level; early.gold60 = r.gold; early.chest60 = r.chestsOpened + r.pendingChests; }
    }
    for (const b of r.bosses) if (b.dead && !bk[b.boss.id]) bk[b.boss.id] = Math.round(r.t);
    if (revT === null && r.revivals < startRev) revT = Math.round(r.t);
    const m = Math.floor(r.t / 60);
    if (process.env.DIAG && frame % 600 === 0 && r.t > 100 && r.t < 300) {
      const ds = r.gems.map(g => Math.hypot(g.x - r.p.x, g.y - r.p.y)).sort((a, b) => a - b);
      const q = f => Math.round(ds[Math.floor(f * (ds.length - 1))] || 0);
      const en = r.enemies.map(e => Math.hypot(e.x - r.p.x, e.y - r.p.y)).sort((a, b) => a - b);
      BS.terms = []; strongBot(api); const tb = BS.terms; BS.terms = null;
      const fmt = i => i + ':' + Object.entries(tb[i]).map(([k, v]) => k[0] + v.toFixed(2)).join(' ');
      let ti = 0; if (BS.tgt) { const a = Math.atan2(BS.tgt[1] - r.p.y, BS.tgt[0] - r.p.x); ti = ((Math.round(a / (Math.PI * 2) * 24) % 24) + 24) % 24; }
      console.error('  chosen', fmt(BS.lastDir), ' | toward tgt', fmt(ti), ' goalsN', BS.goals.length / 4, 'pickups', r.pickups.map(x => x.kind).join(','));
      console.error(Math.round(r.t), 'gems', ds.length, 'q10/50/90', q(0.1), q(0.5), q(0.9), 'enemies', en.length, 'near<150', en.filter(d => d < 150).length, 'tgt', BS.tgt && BS.tgt.map(Math.round), 'p', Math.round(r.p.x), Math.round(r.p.y), 'in', Game.input.x.toFixed(2), Game.input.y.toFixed(2));
    }
    if (m > curMin) {
      const M = r.M;
      mins.push({ m: curMin, lvl: r.level, hp: Math.round(r.p.hp), maxHp: r.stats.maxHp, taken: Math.round(M.taken), src: M.src, dps: Math.round(M.dmg / 60), raw: Math.round(M.raw / 60), bossDmg: Math.round(M.bossDmg), spawnHp: Math.round(M.spawnHp), spawnN: M.spawnN, kills: r.kills - M.kills0, alive: Math.round(M.aliveSum / Math.max(1, M.frames)), capped: M.capped, life: +(M.life / Math.max(1, M.lifeN)).toFixed(1), dd: Math.round(M.dd / Math.max(1, M.lifeN)), nW: r.weapons.length, evo: r.evolvedCount, gems: r.gems.length, gemV: Math.round(r.gems.reduce((a, g) => a + g.v, 0)), gemMax: Math.round(r.gems.reduce((a, g) => Math.max(a, g.v), 0)), gemMaxD: Math.round(r.gems.reduce((a, g) => g.v > a[0] ? [g.v, Math.hypot(g.x - r.p.x, g.y - r.p.y)] : a, [0, 0])[1]) });
      r.M = newM(); curMin = m;
    }
    if (Date.now() - t0 > 300000) break;
  }
  const wl = {}; for (const w of r.weapons) wl[w.id] = w.level + (w.evo ? '*' : '');
  let tot = 0; for (const k in r.dmgBy) tot += r.dmgBy[k];
  const dshare = {}; for (const k in r.dmgBy) dshare[k] = +(r.dmgBy[k] / tot).toFixed(2);
  console.log(JSON.stringify({ char: charId, stage: STAGE, heat, preset, bot: weak ? 'weak' : 'strong', t: Math.round(r.t), won: !!r.won, lvl: r.level, kills: r.kills, bk, evoT, revT, weapons: wl, passives: r.passives.map(p => p.id + p.level).join(' '), dshare, ms: Date.now() - t0, hits: r.won ? undefined : r.hits, early: Object.assign(early, { firstHit: r.firstHit === null ? null : +r.firstHit.toFixed(1) }), bossAlive: r.bosses.filter(b => !b.dead).map(b => b.boss.id + ':' + Math.round(b.hp / b.maxHp * 100) + '%').join(','), mins }));
}
