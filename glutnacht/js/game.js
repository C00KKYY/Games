'use strict';
// Spiellogik ohne DOM. Oberfläche, Klang und Rendering hängen sich über Hooks an.

const Hooks = {
  levelUp() {}, chest() {}, gameOver() {}, victory() {}, banner() {}, achievement() {},
  sfx() {}, shake() {},
};

const ENEMY_COLORS = {
  bat: '#8a5cff', slime: '#46e07f', skel: '#efe8d2', ghost: '#a8ecff', ghoul: '#9c7a52',
  spitter: '#ff9a3c', wraith: '#ff4f7b', brute: '#d0453f', golem: '#8c9cb8', night: '#6b4cff',
};

const PROP_CHUNK = 620;

function xpFor(level) {
  if (level < 20) return 5 + (level - 1) * 10;
  if (level < 40) return 200 + (level - 20) * 17;
  return 540 + (level - 40) * 26;
}

const Game = {
  run: null,
  state: 'menu', // menu | play | levelup | chest | paused | over | victory
  grid: new Grid(64),
  input: { x: 0, y: 0 },
  view: { hw: 640, hh: 360 },
  qbufs: [[], [], [], [], [], []],
  qd: 0,
  lastLevelOptions: null,

  newRun(charId, heat) {
    const save = Store.data;
    const r = {
      char: charId, heat: heat || 0, t: 0, kills: 0, gold: 0, level: 1, xp: 0, xpNext: xpFor(1),
      p: { x: 0, y: 0, r: 12, hp: 100, dirX: 1, dirY: 0, face: 1, moving: false, iframe: 0, flash: 0, walk: 0 },
      stats: null,
      weapons: [], passives: [],
      enemies: [], shots: [], eshots: [], gems: [], pickups: [], fx: [], parts: [], texts: [], tele: [],
      props: new Map(), propList: [], broken: new Set(),
      spawnAcc: 0, eliteT: 55, bossIdx: 0, eventIdx: 0, bosses: [],
      pendingLevels: 0, pendingChests: 0,
      rerolls: 0, skips: 0, banishes: 0, banished: new Set(), revivals: 0,
      dmgBy: {}, evolvedCount: 0, firstHit: null, won: false, endless: false, over: false,
      nextId: 1, achT: 0, newAch: [], bossKills: 0, chestsOpened: 0,
      gemCombo: 0, gemComboT: 0, endlessBossT: 0,
    };
    this.run = r;
    r.stats = this.computeStats(r);
    r.p.hp = r.stats.maxHp;
    r.rerolls = r.stats.rerolls;
    r.skips = r.stats.skips;
    r.banishes = r.stats.banish;
    r.revivals = r.stats.revival;
    this.addWeapon(CHARS[charId].weapon);
    save.stats.runs++;
    this.state = 'play';
    return r;
  },

  computeStats(r) {
    const s = {
      maxHp: 100, maxHpMul: 1, speedMul: 1, armor: 0, regen: 0, might: 1, area: 1, cooldown: 1,
      amount: 0, duration: 1, projSpeed: 1, magnetMul: 1, luck: 1, growth: 1, greed: 1, crit: 0.05,
      revival: 0, rerolls: 0, skips: 0, banish: 0,
    };
    const add = (o, mul) => { for (const k in o) if (k in s) s[k] += o[k] * mul; };
    add(CHARS[r.char].bonus, 1);
    const save = Store.data;
    for (const item of SHOP) {
      const lvl = save.shop[item.id] || 0;
      if (lvl) add(item.per, lvl);
    }
    for (const pa of r.passives) add(PASSIVES[pa.id].per, pa.level);
    s.maxHp = Math.round(s.maxHp * s.maxHpMul);
    s.speed = 150 * s.speedMul;
    s.magnet = 70 * s.magnetMul;
    s.cooldown = Math.max(0.45, s.cooldown);
    return s;
  },

  refreshStats() {
    const r = this.run;
    const oldMax = r.stats ? r.stats.maxHp : 0;
    r.stats = this.computeStats(r);
    if (r.stats.maxHp > oldMax && oldMax) r.p.hp += r.stats.maxHp - oldMax;
    r.p.hp = Math.min(r.p.hp, r.stats.maxHp);
    for (const w of r.weapons) this.refreshWeapon(w);
  },

  refreshWeapon(w) {
    const def = WEAPONS[w.id], s = this.run.stats;
    const st = Object.assign({ crit: 0 }, def.base);
    for (let i = 0; i < w.level - 1; i++) {
      const inc = def.levels[i];
      for (const k in inc) if (k !== 't') st[k] = (st[k] || 0) + inc[k];
    }
    if (w.evo) for (const k in def.evo.stats) st[k] = (st[k] || 0) + def.evo.stats[k];
    st.dmg *= s.might;
    st.cd = Math.max(0.1, st.cd * s.cooldown);
    st.amount = Math.max(1, Math.round(st.amount + s.amount));
    st.area *= s.area;
    st.dur *= s.duration;
    st.speed *= s.projSpeed;
    st.crit += s.crit;
    w.st = st;
  },

  addWeapon(id) {
    const w = { id, level: 1, evo: false, cdT: 0.4, burst: 0, burstT: 0, ang: 0, active: 0, st: null };
    this.run.weapons.push(w);
    this.refreshWeapon(w);
    return w;
  },

  hasPassive(id) { return this.run.passives.some(p => p.id === id); },

  canEvolve(w) {
    return !w.evo && w.level >= WEAPON_MAX && this.hasPassive(WEAPONS[w.id].evo.with);
  },

  // ---------- Hauptschleife ----------
  update(dt) {
    const r = this.run;
    if (!r || this.state !== 'play') return;
    r.t += dt;
    const p = r.p, s = r.stats;

    // Spieler
    const ix = this.input.x, iy = this.input.y;
    const il = Math.hypot(ix, iy);
    p.moving = il > 0.05;
    if (p.moving) {
      const k = Math.min(1, il);
      p.dirX = ix / il; p.dirY = iy / il;
      p.x += p.dirX * s.speed * k * dt;
      p.y += p.dirY * s.speed * k * dt;
      p.walk += dt * 10 * k;
      if (Math.abs(p.dirX) > 0.1) p.face = p.dirX > 0 ? 1 : -1;
    }
    if (p.iframe > 0) p.iframe -= dt;
    if (p.flash > 0) p.flash -= dt;
    if (s.regen > 0 && p.hp < s.maxHp) p.hp = Math.min(s.maxHp, p.hp + s.regen * dt);

    this.director(dt);

    // Raster
    const g = this.grid;
    g.clear();
    for (const e of r.enemies) if (!e.dead) g.insert(e);

    this.updateEnemies(dt);
    for (const w of r.weapons) WEAPON_FN[w.id].update(w, r, dt);
    this.updateShots(dt);
    this.updateEnemyShots(dt);
    this.updateFx(dt);
    this.updatePickups(dt);
    this.updateProps();
    this.updateParticles(dt);

    // Tote entfernen
    const en = r.enemies;
    for (let i = en.length - 1; i >= 0; i--) {
      if (en[i].dead) { en[i] = en[en.length - 1]; en.pop(); }
    }

    if (r.over || this.state !== 'play') return;
    r.achT -= dt;
    if (r.achT <= 0) { r.achT = 1; this.checkAchievements(); }

    if (r.pendingLevels > 0) this.openLevelUp();
    else if (r.pendingChests > 0) this.openChest();
  },

  // ---------- Spawns ----------
  hpMul(t) {
    const m = t / 60;
    return HEAT[this.run.heat].hp * (1 + 0.12 * m + 0.012 * m * m);
  },

  wave() {
    const m = Math.floor(this.run.t / 60);
    return WAVES[Math.min(m, WAVES.length - 1)];
  },

  director(dt) {
    const r = this.run;
    const heat = HEAT[r.heat];
    const wv = this.wave();
    const extra = r.t > RUN_LENGTH ? 1 + (r.t - RUN_LENGTH) / 120 : 1;
    let rate = wv.rate * heat.rate * extra;
    const cap = Math.round(wv.cap * Math.min(1.6, heat.rate) * Math.min(extra, 1.5));
    let alive = 0;
    for (const e of r.enemies) if (!e.swarm && !e.boss) alive++;
    if (alive < cap * 0.35) rate *= 2.2;
    if (r.bosses.some(b => b.boss.final && !b.dead)) rate *= 0.6;
    r.spawnAcc += rate * dt;
    while (r.spawnAcc >= 1) {
      r.spawnAcc -= 1;
      if (alive >= cap) { r.spawnAcc = 0; break; }
      const pos = this.spawnPos();
      this.spawnEnemy(weightedPick(Object.entries(wv.pool)), pos.x, pos.y);
      alive++;
    }

    // Elite
    r.eliteT -= dt;
    if (r.eliteT <= 0) {
      r.eliteT = 60;
      const pool = Object.entries(wv.pool).map(([k, v]) => [k, v * ENEMIES[k].hp]);
      const pos = this.spawnPos();
      const e = this.spawnEnemy(weightedPick(pool), pos.x, pos.y);
      e.elite = true;
      e.hp = e.maxHp = Math.max(160, e.maxHp * 14);
      e.r *= 1.55; e.xp *= 8; e.kb *= 0.3; e.dmg *= 1.4; e.speed *= 0.95;
      Hooks.banner('Ein Elitegegner taucht auf – er trägt eine Truhe!', 'elite');
    }

    // Bosse
    if (r.bossIdx < BOSSES.length && r.t >= BOSSES[r.bossIdx].t) {
      this.spawnBoss(BOSSES[r.bossIdx], 1);
      r.bossIdx++;
    }
    if (r.endless) {
      r.endlessBossT -= dt;
      if (r.endlessBossT <= 0) {
        r.endlessBossT = 120;
        const k = 1 + (r.t - RUN_LENGTH) / 120;
        this.spawnBoss(pick(BOSSES.slice(0, 4)), 1.5 + k);
      }
    }

    // Ereignisse
    while (r.eventIdx < EVENTS.length && r.t >= EVENTS[r.eventIdx].t) {
      this.runEvent(EVENTS[r.eventIdx]);
      r.eventIdx++;
    }
  },

  viewRadius() { return Math.hypot(this.view.hw, this.view.hh); },

  spawnPos() {
    const p = this.run.p, hw = this.view.hw + 50, hh = this.view.hh + 50;
    // Zufälliger Punkt auf dem Rand des erweiterten Sichtfelds, bevorzugt in Laufrichtung.
    let side;
    if (p.moving && Math.random() < 0.45) {
      side = Math.abs(p.dirX) > Math.abs(p.dirY) ? (p.dirX > 0 ? 1 : 3) : (p.dirY > 0 ? 2 : 0);
    } else side = randi(0, 3);
    let x, y;
    if (side === 0) { x = rand(-hw, hw); y = -hh; }
    else if (side === 1) { x = hw; y = rand(-hh, hh); }
    else if (side === 2) { x = rand(-hw, hw); y = hh; }
    else { x = -hw; y = rand(-hh, hh); }
    return { x: p.x + x, y: p.y + y };
  },

  spawnEnemy(type, x, y) {
    const r = this.run, d = ENEMIES[type], heat = HEAT[r.heat];
    const hp = d.hp * this.hpMul(r.t);
    const e = {
      id: r.nextId++, type, x, y, r: d.r, hp, maxHp: hp,
      speed: d.speed * heat.speed * rand(0.92, 1.08), dmg: d.dmg * (1 + r.t / 60 * 0.04),
      xp: d.xp, kb: d.kb, kx: 0, ky: 0, flash: 0, slowT: 0, slowF: 1, freezeT: 0,
      elite: false, boss: null, swarm: false, dead: false, hitT: {}, anim: Math.random() * 10,
      shootT: rand(1.5, 3), ranged: !!d.ranged,
    };
    r.enemies.push(e);
    return e;
  },

  spawnBoss(def, mult) {
    const r = this.run;
    const pos = this.spawnPos();
    const e = this.spawnEnemy(def.sprite === 'night' ? 'golem' : def.sprite, pos.x, pos.y);
    e.boss = def;
    e.type = def.sprite;
    e.hp = e.maxHp = def.hp * HEAT[r.heat].hp * mult;
    e.r = def.r; e.speed = def.speed * HEAT[r.heat].speed; e.dmg = def.dmg * (mult > 1 ? 1 + mult * 0.15 : 1);
    e.xp = def.xp; e.kb = 0.05;
    e.skillT = 3; e.skillIdx = 0; e.mode = 'chase'; e.modeT = 0;
    r.bosses.push(e);
    Hooks.banner(def.name + ' erscheint!', 'boss');
    Hooks.sfx('boss');
    Hooks.shake(10);
    return e;
  },

  runEvent(ev) {
    const r = this.run, p = r.p;
    Hooks.banner(ev.text, 'event');
    Hooks.sfx('alarm');
    const vr = this.viewRadius();
    if (ev.kind === 'swarm') {
      const a = rand(0, TAU), ca = Math.cos(a), sa = Math.sin(a);
      const cx = p.x - ca * (vr + 60), cy = p.y - sa * (vr + 60);
      for (let i = 0; i < ev.n; i++) {
        const off = rand(-260, 260), back = rand(0, 200);
        const e = this.spawnEnemy(ev.type, cx - sa * off - ca * back, cy + ca * off - sa * back);
        e.swarm = true; e.sdx = ca; e.sdy = sa; e.speed *= 1.35;
        e.life = (vr * 2 + 500) / e.speed;
      }
    } else {
      const R = vr * 0.85;
      for (let i = 0; i < ev.n; i++) {
        const a = i / ev.n * TAU;
        this.spawnEnemy(ev.type, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R);
      }
    }
  },

  // ---------- Gegner ----------
  updateEnemies(dt) {
    const r = this.run, p = r.p, g = this.grid;
    const near = this.qbufs[0];
    const reloc = this.viewRadius() * 1.5 + 100;
    const decay = Math.exp(-9 * dt);
    for (const e of r.enemies) {
      if (e.dead) continue;
      e.anim += dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowF = 1; }
      let mx = 0, my = 0;
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      if (e.swarm) {
        e.life -= dt;
        if (e.life <= 0) { e.dead = true; continue; }
        mx = e.sdx * e.speed; my = e.sdy * e.speed;
      } else if (e.boss) {
        const v = this.bossAI(e, dx, dy, d, dt);
        mx = v.x; my = v.y;
      } else {
        let sp = e.speed * e.slowF;
        if (e.ranged) {
          let dir = 1;
          if (d < 190) dir = -0.6; else if (d < 260) dir = 0.15;
          mx = dx / d * sp * dir - dy / d * sp * 0.35;
          my = dy / d * sp * dir + dx / d * sp * 0.35;
          e.shootT -= dt;
          if (e.shootT <= 0 && d < 380) {
            e.shootT = rand(3.2, 4.2);
            this.enemyShot(e.x, e.y, dx / d, dy / d, 160, e.dmg, 7);
          }
        } else {
          mx = dx / d * sp; my = dy / d * sp;
        }
      }
      if (e.freezeT > 0) { e.freezeT -= dt; mx = 0; my = 0; }

      // Abstoßung zwischen Gegnern
      if (!e.swarm) {
        g.query(e.x, e.y, e.r + 30, near);
        let sx = 0, sy = 0;
        for (let i = 0; i < near.length; i++) {
          const o = near[i];
          if (o === e || o.dead || o.swarm) continue;
          const ox = e.x - o.x, oy = e.y - o.y;
          const rr = e.r + o.r;
          const d2 = ox * ox + oy * oy;
          if (d2 < rr * rr && d2 > 0.01) {
            const dd = Math.sqrt(d2);
            const push = (rr - dd) / rr;
            const w = e.boss ? 0.1 : (o.boss ? 3 : 1);
            sx += ox / dd * push * w; sy += oy / dd * push * w;
          }
        }
        mx += sx * 90; my += sy * 90;
      }

      e.x += (mx + e.kx) * dt;
      e.y += (my + e.ky) * dt;
      e.kx *= decay; e.ky *= decay;

      // Zu weit weg: neu platzieren
      if (!e.swarm && d > reloc) {
        if (e.boss) {
          const a = Math.atan2(dy, dx);
          e.x = p.x - Math.cos(a) * this.viewRadius(); e.y = p.y - Math.sin(a) * this.viewRadius();
        } else {
          const pos = this.spawnPos();
          e.x = pos.x; e.y = pos.y;
        }
      }

      // Kontakt mit Spieler
      const rr = e.r + p.r - 3;
      if (d < rr) this.hurtPlayer(e.dmg);
    }
  },

  bossAI(e, dx, dy, d, dt) {
    const r = this.run;
    const out = { x: 0, y: 0 };
    if (e.mode === 'chase') {
      const sp = e.speed * (e.slowF < 1 ? 0.8 : 1);
      out.x = dx / d * sp; out.y = dy / d * sp;
      e.skillT -= dt;
      if (e.skillT <= 0) {
        let sk = e.boss.skills[e.skillIdx % e.boss.skills.length];
        if (sk === 'summon' && r.enemies.length > this.wave().cap) sk = 'dash';
        e.skillIdx++;
        e.skillT = e.boss.final ? 2.6 : 3.6;
        if (sk === 'dash') {
          e.mode = 'windup'; e.modeT = 0.75; e.dashA = Math.atan2(dy, dx);
          r.tele.push({ kind: 'line', x: e.x, y: e.y, a: e.dashA, len: 520, w: e.r * 1.6, t: 0, life: 0.75, follow: e });
        } else if (sk === 'summon') {
          const type = e.type === 'skel' || e.type === 'night' ? 'skel' : weightedPick(Object.entries(this.wave().pool));
          const n = e.boss.final ? 12 : 9;
          for (let i = 0; i < n; i++) {
            const a = i / n * TAU;
            this.spawnEnemy(type, e.x + Math.cos(a) * (e.r + 40), e.y + Math.sin(a) * (e.r + 40));
          }
          this.burst(e.x, e.y, '#c9b8ff', 26, 220);
          Hooks.sfx('summon');
        } else if (sk === 'nova') {
          const n = e.boss.final ? 22 : 16;
          const off = rand(0, TAU);
          for (let i = 0; i < n; i++) {
            const a = off + i / n * TAU;
            this.enemyShot(e.x, e.y, Math.cos(a), Math.sin(a), 165, e.dmg * 0.6, 9);
          }
          Hooks.sfx('summon');
        } else if (sk === 'slam') {
          const p = r.p;
          r.tele.push({ kind: 'circle', x: p.x, y: p.y, rad: 100, t: 0, life: 1.05, dmg: e.dmg * 1.2 });
        }
      }
    } else if (e.mode === 'windup') {
      e.modeT -= dt;
      if (e.modeT <= 0) { e.mode = 'dash'; e.modeT = 0.6; Hooks.sfx('dash'); }
    } else if (e.mode === 'dash') {
      e.modeT -= dt;
      out.x = Math.cos(e.dashA) * 560; out.y = Math.sin(e.dashA) * 560;
      if (Math.random() < 0.6) this.part(e.x, e.y, ENEMY_COLORS[e.type], rand(-40, 40), rand(-40, 40), 0.5, rand(3, 6));
      if (e.modeT <= 0) e.mode = 'chase';
    }
    return out;
  },

  enemyShot(x, y, dx, dy, speed, dmg, rad) {
    this.run.eshots.push({ x, y, vx: dx * speed, vy: dy * speed, dmg, r: rad, life: 3.5 });
  },

  hurtPlayer(dmg) {
    const r = this.run, p = r.p;
    if (p.iframe > 0 || r.over) return;
    const taken = Math.max(1, dmg - r.stats.armor);
    p.hp -= taken;
    p.iframe = 0.5;
    p.flash = 0.25;
    if (r.firstHit === null) r.firstHit = r.t;
    Hooks.sfx('hurt');
    Hooks.shake(Math.min(9, 3 + taken * 0.3));
    this.text(p.x, p.y - 20, '-' + Math.round(taken), '#ff5a6e', 1.1);
    if (p.hp <= 0) this.playerDies();
  },

  playerDies() {
    const r = this.run, p = r.p;
    if (r.revivals > 0) {
      r.revivals--;
      p.hp = r.stats.maxHp * 0.5;
      p.iframe = 3;
      this.blast(p.x, p.y, 320, 99999, 'revive');
      this.burst(p.x, p.y, '#ffe27a', 80, 380);
      Hooks.banner('Wiedergeboren!', 'event');
      Hooks.sfx('revive');
      return;
    }
    p.hp = 0;
    r.over = true;
    this.burst(p.x, p.y, '#ff5a6e', 60, 260);
    Hooks.sfx('death');
    this.endRun(false);
  },

  // Schaden in einem Kreis (Hilfsfunktion für alle Waffen)
  inCircle(x, y, rad, fn) {
    const buf = this.qbufs[1 + (this.qd++ % 5)];
    this.grid.query(x, y, rad + 70, buf);
    const list = buf.slice();
    for (const e of list) {
      if (e.dead) continue;
      const rr = rad + e.r;
      if (dist2(x, y, e.x, e.y) <= rr * rr) fn(e);
    }
    this.hitProps(x, y, rad);
  },

  damage(e, amount, wid, kbForce, critBonus, fromX, fromY) {
    if (e.dead) return 0;
    const r = this.run;
    let dmg = amount * rand(0.9, 1.1);
    const crit = Math.random() < (critBonus || 0.05);
    if (crit) dmg *= 2;
    r.dmgBy[wid] = (r.dmgBy[wid] || 0) + Math.min(dmg, Math.max(0, e.hp));
    e.hp -= dmg;
    e.flash = 0.06;
    if (kbForce && e.kb > 0) {
      const fx = fromX === undefined ? r.p.x : fromX, fy = fromY === undefined ? r.p.y : fromY;
      const dx = e.x - fx, dy = e.y - fy;
      const d = Math.hypot(dx, dy) || 1;
      e.kx += dx / d * kbForce * e.kb;
      e.ky += dy / d * kbForce * e.kb;
    }
    this.text(e.x + rand(-6, 6), e.y - e.r - 4, Math.round(dmg), crit ? '#ffd23f' : '#ffffff', crit ? 1.35 : 1);
    Hooks.sfx('hit');
    if (e.hp <= 0) this.kill(e);
    return dmg;
  },

  kill(e) {
    const r = this.run, save = Store.data;
    e.dead = true;
    r.kills++;
    save.stats.kills++;
    const col = ENEMY_COLORS[e.type] || '#fff';
    this.burst(e.x, e.y, col, e.boss ? 60 : e.elite ? 24 : 7, e.boss ? 320 : 150);
    if (e.swarm && Math.random() < 0.5) return;
    if (e.boss) {
      r.bossKills++;
      save.bosses[e.boss.id] = true;
      save.stats.bossKills++;
      for (let i = 0; i < 26; i++) this.dropGem(e.x + rand(-60, 60), e.y + rand(-60, 60), Math.ceil(e.xp / 26));
      for (let i = 0; i < 8; i++) this.drop(e.x + rand(-50, 50), e.y + rand(-50, 50), 'coin', 3);
      this.drop(e.x, e.y, 'chest');
      Hooks.shake(14);
      Hooks.sfx('bossdown');
      Hooks.banner(e.boss.name + ' besiegt!', 'win');
      if (e.boss.final && !r.won) {
        r.won = true;
        this.checkAchievements();
        this.state = 'victory';
        Hooks.victory();
      }
      return;
    }
    Hooks.sfx('kill');
    this.dropGem(e.x, e.y, e.xp);
    if (e.elite) {
      this.drop(e.x, e.y, 'chest');
      for (let i = 0; i < 4; i++) this.drop(e.x + rand(-30, 30), e.y + rand(-30, 30), 'coin', 2);
      return;
    }
    const luck = r.stats.luck;
    const roll = Math.random();
    if (roll < 0.022 * luck) this.drop(e.x, e.y, 'coin', 1);
    else if (roll < 0.022 * luck + 0.0025 * luck) this.drop(e.x, e.y, 'heart');
    else if (roll < 0.022 * luck + 0.0035 * luck) this.drop(e.x, e.y, 'magnet');
    else if (roll < 0.022 * luck + 0.0042 * luck) this.drop(e.x, e.y, 'bomb');
  },

  // Explosion: Bombe, Wiedergeburt
  blast(x, y, rad, dmg, wid) {
    this.inCircle(x, y, rad, e => {
      this.damage(e, e.boss ? Math.min(dmg, 400) : dmg, wid, 400, 0, x, y);
    });
    this.run.fx.push({ kind: 'boom', x, y, rad, t: 0, life: 0.5, color: '#fff3c4' });
  },

  // ---------- Geschosse ----------
  updateShots(dt) {
    const r = this.run, p = r.p, shots = r.shots;
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.t += dt;
      let alive = true;
      if (s.kind === 'flask') {
        const k = s.t / s.T;
        s.x = lerp(s.sx, s.tx, k); s.y = lerp(s.sy, s.ty, k) - Math.sin(k * Math.PI) * 70;
        if (k >= 1) {
          alive = false;
          r.fx.push({ kind: 'pool', x: s.tx, y: s.ty, rad: s.rad, t: 0, life: s.life, tick: 0, dmg: s.dmg, wid: s.wid, evo: s.evo });
          Hooks.sfx('flask');
        }
      } else {
        if (s.kind === 'sickle') {
          s.spin += dt * 14;
          if (!s.back) {
            s.vx -= s.vx0 * 1.7 * dt; s.vy -= s.vy0 * 1.7 * dt;
            if (s.vx * s.vx0 + s.vy * s.vy0 <= 0) s.back = true;
          } else {
            const dx = p.x - s.x, dy = p.y - s.y;
            const d = Math.hypot(dx, dy) || 1;
            s.ret = Math.min(s.speed * 1.4, (s.ret || 60) + 900 * dt);
            s.vx = dx / d * s.ret; s.vy = dy / d * s.ret;
            if (d < 20) alive = false;
          }
        }
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.t > s.life) alive = false;
        if (alive) {
          this.inCircle(s.x, s.y, s.r, e => {
            if (!alive) return;
            if (s.kind === 'sickle') {
              const nt = s.hits.get(e.id);
              if (nt !== undefined && nt > r.t) return;
              s.hits.set(e.id, r.t + 0.45);
              this.damage(e, s.dmg, s.wid, 90, s.crit, s.x, s.y);
            } else {
              if (s.hit.indexOf(e.id) >= 0) return;
              s.hit.push(e.id);
              this.damage(e, s.dmg, s.wid, s.kind === 'knife' ? 60 : 120, s.crit, s.x - s.vx, s.y - s.vy);
              s.pierce--;
              if (s.pierce <= 0) alive = false;
            }
          });
          if (!alive && s.kind !== 'sickle') this.burst(s.x, s.y, s.color || '#fff', 4, 90);
        }
      }
      if (!alive) { shots[i] = shots[shots.length - 1]; shots.pop(); }
    }
  },

  updateEnemyShots(dt) {
    const r = this.run, p = r.p, es = r.eshots;
    for (let i = es.length - 1; i >= 0; i--) {
      const s = es[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      let alive = s.life > 0;
      if (alive && dist2(s.x, s.y, p.x, p.y) < (s.r + p.r) * (s.r + p.r)) {
        this.hurtPlayer(s.dmg);
        alive = false;
      }
      if (!alive) { es[i] = es[es.length - 1]; es.pop(); }
    }
  },

  updateFx(dt) {
    const r = this.run, fx = r.fx, p = r.p;
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      if (f.kind === 'pool') {
        f.tick -= dt;
        if (f.tick <= 0) {
          f.tick = 0.35;
          this.inCircle(f.x, f.y, f.rad, e => this.damage(e, f.dmg, f.wid, 0, r.stats.crit));
        }
        if (Math.random() < 0.5) this.part(f.x + rand(-f.rad, f.rad) * 0.8, f.y + rand(-f.rad, f.rad) * 0.6, pick(['#ff7a2f', '#ffb13b', '#ff4b2b']), rand(-10, 10), rand(-60, -30), 0.5, rand(2, 5));
      } else if (f.kind === 'nova') {
        const k = Math.min(1, f.t / 0.5);
        const rad = f.maxRad * (1 - Math.pow(1 - k, 2));
        f.rad = rad;
        this.inCircle(f.x, f.y, rad, e => {
          if (f.hit.has(e.id)) return;
          f.hit.add(e.id);
          if (f.freeze && !e.boss) e.freezeT = Math.max(e.freezeT, f.slowDur * 0.6);
          e.slowT = Math.max(e.slowT, f.slowDur); e.slowF = 0.45;
          this.damage(e, f.dmg, f.wid, 140, r.stats.crit, f.x, f.y);
        });
      }
      if (f.t >= f.life) { fx[i] = fx[fx.length - 1]; fx.pop(); }
    }
    // Boss-Warnungen
    for (let i = r.tele.length - 1; i >= 0; i--) {
      const t = r.tele[i];
      t.t += dt;
      if (t.follow && t.kind === 'line') { t.x = t.follow.x; t.y = t.follow.y; }
      if (t.t >= t.life) {
        if (t.kind === 'circle') {
          if (dist2(p.x, p.y, t.x, t.y) < (t.rad + p.r) * (t.rad + p.r)) this.hurtPlayer(t.dmg);
          r.fx.push({ kind: 'boom', x: t.x, y: t.y, rad: t.rad, t: 0, life: 0.45, color: '#ff8a5c' });
          Hooks.shake(8);
          Hooks.sfx('slam');
        }
        r.tele[i] = r.tele[r.tele.length - 1]; r.tele.pop();
      }
    }
  },

  // ---------- Aufsammeln ----------
  dropGem(x, y, v) {
    const r = this.run;
    if (r.gems.length > 320) {
      const g = r.gems[0];
      g.v += v;
      return;
    }
    r.gems.push({ x, y, v, mag: false, sp: 0, bob: Math.random() * 6 });
  },

  drop(x, y, kind, v) {
    this.run.pickups.push({ x, y, kind, v: v || 0, mag: false, sp: 0, bob: Math.random() * 6 });
  },

  updatePickups(dt) {
    const r = this.run, p = r.p, s = r.stats;
    const mag2 = s.magnet * s.magnet;
    r.gemComboT -= dt;
    if (r.gemComboT <= 0) r.gemCombo = 0;
    const gems = r.gems;
    for (let i = gems.length - 1; i >= 0; i--) {
      const g = gems[i];
      const dx = p.x - g.x, dy = p.y - g.y, d2 = dx * dx + dy * dy;
      if (!g.mag && d2 < mag2) { g.mag = true; g.sp = -120; }
      if (g.mag) {
        const d = Math.sqrt(d2) || 1;
        g.sp += 1100 * dt;
        g.x += dx / d * g.sp * dt; g.y += dy / d * g.sp * dt;
        if (d < p.r + 8) {
          this.gainXp(g.v);
          r.gemCombo++; r.gemComboT = 0.7;
          Hooks.sfx('gem', r.gemCombo);
          gems[i] = gems[gems.length - 1]; gems.pop();
        }
      }
    }
    const pk = r.pickups;
    for (let i = pk.length - 1; i >= 0; i--) {
      const it = pk[i];
      const dx = p.x - it.x, dy = p.y - it.y, d2 = dx * dx + dy * dy;
      if (it.kind === 'coin' && !it.mag && d2 < mag2) { it.mag = true; it.sp = -100; }
      if (it.mag) {
        const d = Math.sqrt(d2) || 1;
        it.sp += 1000 * dt;
        it.x += dx / d * it.sp * dt; it.y += dy / d * it.sp * dt;
      }
      const reach = p.r + (it.kind === 'chest' ? 22 : 14);
      if (d2 < reach * reach) {
        this.collect(it);
        pk[i] = pk[pk.length - 1]; pk.pop();
      }
    }
  },

  collect(it) {
    const r = this.run, p = r.p;
    if (it.kind === 'coin' || it.kind === 'bag') {
      const v = Math.round((it.kind === 'bag' ? it.v || 15 : it.v || 1) * r.stats.greed * HEAT[r.heat].gold);
      r.gold += v;
      this.text(p.x, p.y - 26, '+' + v + ' Gold', '#ffd23f', 1);
      Hooks.sfx('coin');
    } else if (it.kind === 'heart') {
      const h = Math.min(30, r.stats.maxHp - p.hp);
      p.hp += h;
      this.text(p.x, p.y - 26, '+' + Math.round(h), '#5dff8f', 1.1);
      this.burst(p.x, p.y, '#5dff8f', 14, 140);
      Hooks.sfx('heal');
    } else if (it.kind === 'magnet') {
      for (const g of r.gems) { if (!g.mag) { g.mag = true; g.sp = -60; } }
      for (const c of r.pickups) if (c.kind === 'coin') c.mag = true;
      Hooks.sfx('magnet');
    } else if (it.kind === 'bomb') {
      const hw = this.view.hw, hh = this.view.hh;
      for (const e of r.enemies) {
        if (e.dead || Math.abs(e.x - p.x) > hw + 40 || Math.abs(e.y - p.y) > hh + 40) continue;
        this.damage(e, e.boss ? 300 : 99999, 'bomb', 300);
      }
      r.fx.push({ kind: 'flash', x: p.x, y: p.y, t: 0, life: 0.35 });
      Hooks.shake(16);
      Hooks.sfx('bomb');
    } else if (it.kind === 'chest') {
      r.pendingChests++;
      Hooks.sfx('chestpick');
    }
  },

  gainXp(v) {
    const r = this.run;
    r.xp += v * r.stats.growth;
    while (r.xp >= r.xpNext) {
      r.xp -= r.xpNext;
      r.level++;
      r.xpNext = xpFor(r.level);
      r.pendingLevels++;
    }
  },

  // ---------- Kohlebecken ----------
  updateProps() {
    const r = this.run, p = r.p;
    const cx0 = Math.floor((p.x - this.view.hw - 200) / PROP_CHUNK), cx1 = Math.floor((p.x + this.view.hw + 200) / PROP_CHUNK);
    const cy0 = Math.floor((p.y - this.view.hh - 200) / PROP_CHUNK), cy1 = Math.floor((p.y + this.view.hh + 200) / PROP_CHUNK);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const key = cx + ',' + cy;
        if (r.props.has(key) || r.broken.has(key)) continue;
        if (hash2(cx, cy, 7) > 0.5 || (cx === 0 && cy === 0)) { r.props.set(key, null); continue; }
        const pr = {
          key, x: (cx + 0.15 + hash2(cx, cy, 8) * 0.7) * PROP_CHUNK, y: (cy + 0.15 + hash2(cx, cy, 9) * 0.7) * PROP_CHUNK, r: 14,
        };
        r.props.set(key, pr);
        r.propList.push(pr);
      }
    }
    if (r.props.size > 300) {
      for (const [k, v] of r.props) {
        if (!v || Math.abs(v.x - p.x) > 3000 || Math.abs(v.y - p.y) > 3000) r.props.delete(k);
      }
      r.propList = r.propList.filter(v => r.props.get(v.key) === v);
    }
  },

  hitProps(x, y, rad) {
    const r = this.run, list = r.propList;
    for (let i = list.length - 1; i >= 0; i--) {
      const pr = list[i];
      const rr = rad + pr.r;
      if (dist2(x, y, pr.x, pr.y) > rr * rr) continue;
      list.splice(i, 1);
      r.props.delete(pr.key);
      r.broken.add(pr.key);
      this.burst(pr.x, pr.y, '#ffb13b', 18, 160);
      Hooks.sfx('break');
      const kind = weightedPick([['bag', 40], ['heart', 26], ['magnet', 14], ['bomb', 12], ['coin', 8]]);
      this.drop(pr.x, pr.y, kind, kind === 'bag' ? randi(10, 25) : 2);
    }
  },

  // ---------- Effekte ----------
  part(x, y, color, vx, vy, life, size) {
    const ps = this.run.parts;
    if (ps.length > 700) return;
    ps.push({ x, y, vx, vy, life, max: life, size, color });
  },

  burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), v = rand(0.25, 1) * speed;
      this.part(x, y, color, Math.cos(a) * v, Math.sin(a) * v, rand(0.3, 0.7), rand(2, 5));
    }
  },

  text(x, y, txt, color, scale) {
    const ts = this.run.texts;
    // Bei Gewühl nur noch Krits und Wichtiges zeigen
    if (ts.length > 45 && scale <= 1 && color === '#ffffff') return;
    if (ts.length > 70) ts.shift();
    ts.push({ x, y, txt: String(txt), color, scale, t: 0 });
  },

  updateParticles(dt) {
    const r = this.run;
    const ps = r.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const q = ps[i];
      q.life -= dt;
      if (q.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt;
      q.vx *= 0.92; q.vy *= 0.92;
    }
    const ts = r.texts;
    for (let i = ts.length - 1; i >= 0; i--) {
      ts[i].t += dt;
      ts[i].y -= 32 * dt;
      if (ts[i].t > 0.7) ts.splice(i, 1);
    }
  },

  // ---------- Stufenaufstieg ----------
  buildOptions(count) {
    const r = this.run;
    const cands = [];
    for (const w of r.weapons) {
      if (w.level < WEAPON_MAX && !w.evo) cands.push({ kind: 'weapon', id: w.id, level: w.level + 1, weight: 10 });
    }
    for (const pa of r.passives) {
      if (pa.level < PASSIVES[pa.id].max) cands.push({ kind: 'passive', id: pa.id, level: pa.level + 1, weight: 8 });
    }
    if (r.weapons.length < MAX_WEAPONS) {
      for (const id in WEAPONS) {
        if (!r.weapons.some(w => w.id === id) && !r.banished.has(id)) cands.push({ kind: 'weapon', id, level: 1, isNew: true, weight: 7 });
      }
    }
    if (r.passives.length < MAX_PASSIVES) {
      for (const id in PASSIVES) {
        if (!r.passives.some(p => p.id === id) && !r.banished.has(id)) cands.push({ kind: 'passive', id, level: 1, isNew: true, weight: 6 });
      }
    }
    const out = [];
    while (out.length < count && cands.length) {
      let sum = 0;
      for (const c of cands) sum += c.weight;
      let x = Math.random() * sum, idx = 0;
      for (; idx < cands.length; idx++) { x -= cands[idx].weight; if (x <= 0) break; }
      idx = Math.min(idx, cands.length - 1);
      out.push(cands[idx]);
      cands.splice(idx, 1);
    }
    if (!out.length) {
      out.push({ kind: 'gold', id: 'gold', amount: 25 });
      out.push({ kind: 'heal', id: 'heal', amount: 40 });
    }
    return out;
  },

  optionCount() {
    const luck = this.run.stats.luck;
    return Math.random() < (luck - 1) * 0.6 + 0.05 ? 4 : 3;
  },

  openLevelUp() {
    this.state = 'levelup';
    this.lastLevelOptions = this.buildOptions(this.optionCount());
    Hooks.sfx('levelup');
    Hooks.levelUp(this.lastLevelOptions);
  },

  applyOption(o) {
    const r = this.run;
    if (o.kind === 'weapon') {
      const w = r.weapons.find(x => x.id === o.id);
      if (w) { w.level++; this.refreshWeapon(w); } else this.addWeapon(o.id);
    } else if (o.kind === 'passive') {
      const pa = r.passives.find(x => x.id === o.id);
      if (pa) pa.level++; else r.passives.push({ id: o.id, level: 1 });
      this.refreshStats();
    } else if (o.kind === 'gold') {
      r.gold += o.amount;
    } else if (o.kind === 'heal') {
      r.p.hp = Math.min(r.stats.maxHp, r.p.hp + o.amount);
    }
  },

  chooseLevel(o) {
    const r = this.run;
    this.applyOption(o);
    r.pendingLevels--;
    this.afterModal();
  },

  skipLevel() {
    const r = this.run;
    if (r.skips <= 0) return false;
    r.skips--;
    r.pendingLevels--;
    this.gainXp(0);
    this.afterModal();
    return true;
  },

  reroll() {
    const r = this.run;
    if (r.rerolls <= 0) return null;
    r.rerolls--;
    this.lastLevelOptions = this.buildOptions(this.optionCount());
    return this.lastLevelOptions;
  },

  banish(o) {
    const r = this.run;
    if (r.banishes <= 0 || !o.isNew) return null;
    r.banishes--;
    r.banished.add(o.id);
    this.lastLevelOptions = this.lastLevelOptions.filter(x => x !== o);
    const more = this.buildOptions(6).filter(x => !this.lastLevelOptions.some(y => y.kind === x.kind && y.id === x.id) && x.kind !== 'gold' && x.kind !== 'heal');
    if (more.length) this.lastLevelOptions.push(more[0]);
    if (!this.lastLevelOptions.length) this.lastLevelOptions = this.buildOptions(3);
    return this.lastLevelOptions;
  },

  afterModal() {
    const r = this.run;
    if (r.pendingLevels > 0) this.openLevelUp();
    else if (r.pendingChests > 0) this.openChest();
    else if (!r.over) this.state = 'play';
  },

  // ---------- Truhen ----------
  openChest() {
    const r = this.run, save = Store.data;
    r.pendingChests--;
    r.chestsOpened++;
    save.stats.chests++;
    this.state = 'chest';
    const res = { evolved: null, items: [], gold: 0 };
    const evo = r.weapons.find(w => this.canEvolve(w));
    if (evo) {
      evo.evo = true;
      this.refreshWeapon(evo);
      res.evolved = evo.id;
      r.evolvedCount++;
      save.stats.evolutions++;
      save.evolved[evo.id] = true;
    } else {
      const luck = r.stats.luck;
      const roll = Math.random();
      const n = roll < 0.05 * luck ? 5 : roll < 0.25 * luck ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const cands = [];
        for (const w of r.weapons) if (w.level < WEAPON_MAX && !w.evo) cands.push({ kind: 'weapon', id: w.id, level: w.level + 1 });
        for (const pa of r.passives) if (pa.level < PASSIVES[pa.id].max) cands.push({ kind: 'passive', id: pa.id, level: pa.level + 1 });
        if (!cands.length) break;
        const o = pick(cands);
        this.applyOption(o);
        res.items.push(o);
        // Eine frisch voll ausgebaute Waffe kann sofort entwickelt werden.
        const ev2 = r.weapons.find(w => this.canEvolve(w));
        if (ev2 && !res.evolved && i === n - 1 && n > 1) {
          ev2.evo = true; this.refreshWeapon(ev2); res.evolved = ev2.id;
          r.evolvedCount++; save.stats.evolutions++; save.evolved[ev2.id] = true;
        }
      }
    }
    res.gold = Math.round(randi(15, 40) * r.stats.greed * HEAT[r.heat].gold);
    r.gold += res.gold;
    Hooks.sfx('chest');
    Hooks.chest(res);
  },

  closeChest() { this.afterModal(); },

  // ---------- Erfolge & Laufende ----------
  checkAchievements() {
    const r = this.run, save = Store.data;
    for (const a of ACHIEVEMENTS) {
      if (save.achievements[a.id]) continue;
      let ok = false;
      try { ok = !!a.check(r, save); } catch (e) { ok = false; }
      if (!ok) continue;
      save.achievements[a.id] = true;
      save.gold += a.gold;
      save.stats.goldEarned += a.gold;
      r.newAch.push(a);
      for (const cid in CHARS) {
        if (CHARS[cid].unlock === a.id && save.chars.indexOf(cid) < 0) save.chars.push(cid);
      }
      if (a.id === 'win') save.heatUnlocked = Math.max(save.heatUnlocked, 1);
      Hooks.achievement(a);
    }
  },

  continueEndless() {
    const r = this.run;
    r.endless = true;
    r.endlessBossT = 120;
    this.state = 'play';
    this.afterModal();
  },

  endRun(won) {
    const r = this.run, save = Store.data;
    r.over = true;
    if (r.won && r.heat >= save.heatUnlocked && r.heat < HEAT.length - 1) save.heatUnlocked = r.heat + 1;
    const timeBonus = Math.floor(r.t / 60) * 6;
    const bossBonus = r.bossKills * 25;
    const bonus = Math.round((timeBonus + bossBonus) * HEAT[r.heat].gold);
    const total = r.gold + bonus;
    save.gold += total;
    save.stats.goldEarned += total;
    save.stats.playTime += r.t;
    save.stats.bestTime = Math.max(save.stats.bestTime, r.t);
    save.stats.bestLevel = Math.max(save.stats.bestLevel, r.level);
    save.stats.bestKills = Math.max(save.stats.bestKills, r.kills);
    if (r.won) save.stats.wins++;
    this.checkAchievements();
    Store.save();
    this.state = 'over';
    Hooks.gameOver({ won: r.won, collected: r.gold, timeBonus, bossBonus, heatMul: HEAT[r.heat].gold, total });
  },
};
