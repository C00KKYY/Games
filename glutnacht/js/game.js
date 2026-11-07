'use strict';
// Spiellogik ohne DOM. Oberfläche, Klang und Rendering hängen sich über Hooks an.

const Hooks = {
  levelUp() {}, chest() {}, gameOver() {}, victory() {}, banner() {}, achievement() {},
  sfx() {}, shake() {}, happy() {}, kill() {},
};

// Grundkurve der Gegner-Lebenspunkte über die Spielminute m (ohne Nachtstufe und Land-Faktor): bis Minute 3 fast
// linear, danach deutlich schneller (sonst wird es ab Minute 4–5 zu leicht).
function hpCurve(m) {
  const q = Math.max(0, m - 3);
  return 1 + 0.12 * m + 0.012 * m * m + 0.22 * q + 0.125 * q * q;
}
// M10: Brücke zwischen 1:15 und 4:00 – statt Plateau und Sprung an der 4:00-Grenze ein gleichmäßiger (geometrischer)
// Anstieg; nie unter der alten Kurve, vor 1:15 und ab 4:00 identisch mit ihr.
const HP_BRIDGE_A = 1.25, HP_BRIDGE_B = 4;
function hpCurveBridged(m) {
  const h = hpCurve(m);
  if (m <= HP_BRIDGE_A || m >= HP_BRIDGE_B) return h;
  const a = hpCurve(HP_BRIDGE_A), b = hpCurve(HP_BRIDGE_B);
  return Math.max(h, a * Math.pow(b / a, (m - HP_BRIDGE_A) / (HP_BRIDGE_B - HP_BRIDGE_A)));
}

const ENEMY_COLORS = {
  bat: '#8a5cff', slime: '#46e07f', skel: '#efe8d2', ghost: '#a8ecff', ghoul: '#9c7a52',
  spitter: '#ff9a3c', wraith: '#ff4f7b', brute: '#d0453f', golem: '#8c9cb8', night: '#6b4cff',
  cinder: '#c04cff', moth: '#e8d8b0', bell: '#d0a040',
};

// Fernkampf (M9): Obergrenzen für Gegnergeschosse, Warnzeichen und Pfützen. Eine Salve, die nicht mehr passt,
// wird gar nicht erst angekündigt (ein Warnzeichen lügt nie); nur eine laufende Boss-Spirale lässt einzelne
// Schüsse über der harten Grenze aus.
const ESHOT_CAP = 120, ESHOT_CAP_BOSS = 160, TELE_CAP = 32, HAZ_CAP = 8;
const DEG = Math.PI / 180;

const PROP_CHUNK = 620;
// Langsame Gegner sind in den ersten drei Minuten etwas schneller (sonst läuft man ihnen mühelos davon).
const EARLY_SPEED = 0.2;

// Stufe 1–10 billiger: mit den Gegnern der ersten Minute 4–5 Aufstiege, danach gleitend zur alten Kurve (ab Stufe 11).
const XP_EARLY = [6, 11, 17, 24, 32, 42, 53, 66, 80, 95];
function xpFor(level) {
  if (level <= XP_EARLY.length) return XP_EARLY[level - 1];
  if (level < 20) return 5 + (level - 1) * 10;
  if (level < 40) return 200 + (level - 20) * 28;
  return 760 + (level - 40) * 40;
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

  newRun(charId, heat, stageId) {
    const save = Store.data;
    const stage = stageById(stageId);
    const r = {
      char: charId, heat: heat || 0, stage, length: stage.minutes * 60,
      // Bosse nach Zeit sortiert, damit sie der Reihe nach erscheinen
      bossList: stage.bosses.slice().sort((a, b) => a.t - b.t), clear: null, t: 0, kills: 0, gold: 0, level: 1, xp: 0, xpNext: xpFor(1),
      p: { x: 0, y: 0, r: 12, hp: 100, dirX: 1, dirY: 0, face: 1, moving: false, iframe: 0, flash: 0, walk: 0, vx: 0, vy: 0, slowT: 0 },
      stats: null,
      weapons: [], passives: [],
      enemies: [], shots: [], eshots: [], gems: [], pickups: [], fx: [], parts: [], texts: [], tele: [],
      props: new Map(), propList: [], broken: new Set(),
      spawnAcc: 0, eliteT: 30, bossIdx: 0, eventIdx: 0, bosses: [],
      pendingLevels: 0, pendingChests: 0,
      rerolls: 0, skips: 0, banishes: 0, banished: new Set(), revivals: 0,
      dmgBy: {}, evolvedCount: 0, firstHit: null, won: false, endless: false, over: false,
      nextId: 1, achT: 0, newAch: [], bossKills: 0, chestsOpened: 0,
      gemCombo: 0, gemComboT: 0, endlessBossT: 0,
      // Fernkampf: Pfützen, Salven-Regie (gleichzeitiges Ausholen), lebende Fernkämpfer, Elite-Zähler
      haz: [], vol: { active: 0, bells: 0, lastStart: -9 }, rangedAlive: 0, eliteN: 0, lastHitSrc: null,
      // M10: Countdowns (Ansturm, leichter Boss-Countdown) der Reihe nach; surgeWave = Gegnermischung im Ansturm
      cdList: null, cdIdx: 0, surgeHits: 0, surgeWave: null, surgeK: null, eliteBanT: 0,
    };
    r.cdList = this.buildCountdowns(r);
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
    this.openingGroup();
    return r;
  },

  // Eine kleine Gruppe gleich zu Beginn im Bild, damit die erste Sekunde nicht leer ist.
  openingGroup() {
    const r = this.run, wv = this.wave(), n = 6;
    const hw = this.view.hw, hh = this.view.hh, a0 = rand(0, TAU);
    for (let i = 0; i < n; i++) {
      // im Bild, aber nicht zu nah (Hochformat: eher oben und unten)
      let a = a0 + i / n * TAU, k = rand(0.62, 0.82);
      for (let j = 0; j < 12 && Math.hypot(Math.cos(a) * hw, Math.sin(a) * hh) * k < 230; j++) a = rand(0, TAU);
      this.spawnEnemy(weightedPick(Object.entries(wv.pool).filter(([t]) => !ENEMIES[t].ranged)), r.p.x + Math.cos(a) * hw * k, r.p.y + Math.sin(a) * hh * k);
    }
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
    p.vx = p.vy = 0;
    if (p.slowT > 0) p.slowT -= dt;
    if (p.moving) {
      // Schleimpfütze (Boss): 0,55-faches Tempo, solange der Held darin steht
      const k = Math.min(1, il) * (p.slowT > 0 ? 0.55 : 1);
      p.dirX = ix / il; p.dirY = iy / il;
      r.moved = true;
      p.vx = p.dirX * s.speed * k; p.vy = p.dirY * s.speed * k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
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
    if (r.over) return;
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
    const st = this.run.stage, m = t / 60;
    // Brücke nur bis Nachtstufe 2: ab Stufe 3 sind die Gegner ohnehin zäh, und mehr Lebenspunkte kosten dort
    // Erfahrung (der Held tötet langsamer, als Nachschub kommt) – Nachtstufe 5 wurde sonst deutlich schwerer
    return HEAT[this.run.heat].hp * st.mult.hp * (st.hpBridge && this.run.heat < 3 ? hpCurveBridged(m) : hpCurve(m));
  },

  // ---------- Countdown und Ansturm (M10) ----------
  // Je Land: Ansturm-Einträge aus stage.surges (Leiste lead s vorher, dann dur s Ansturm) und ein leichter
  // Countdown (nur Leiste, 20 s) vor dem ersten Boss, der nicht der Endboss ist. Nach Startzeit sortiert; was erst
  // nach dem Ende des Landes begänne, entfällt (Endlosmodus: keine Countdowns).
  buildCountdowns(r) {
    const list = [];
    for (const s of r.stage.surges || []) list.push({ kind: 'surge', s, b: null, start: s.t - s.lead, at: s.t, end: s.t + s.dur, ph: 0, last: 0, t10: false });
    const fb = r.bossList.find(b => !b.final);
    if (fb) list.push({ kind: 'boss', s: null, b: fb, start: fb.t - 20, at: fb.t, end: fb.t, ph: 0, last: 0, t10: false });
    return list.filter(c => c.start < r.length).sort((a, b) => a.start - b.start);
  },
  // aktueller Ansturm (Phase „on“) oder null
  surgeNow() {
    const c = this.run.cdList[this.run.cdIdx];
    return c && c.kind === 'surge' && c.ph === 2 ? c : null;
  },
  // läuft nur mit r.t (Zustand play): Pause, Aufstieg, Truhe und Dialoge halten Countdown und Ansturm an
  countdownTick() {
    const r = this.run, L = r.cdList;
    while (r.cdIdx < L.length) {
      const c = L[r.cdIdx];
      if (r.t < c.start) return;
      // nie begonnen und schon ganz vorbei (Zeitsprung in Werkzeugen): still überspringen
      if (c.ph === 0 && r.t >= c.end) { c.ph = 3; r.cdIdx++; continue; }
      if (c.ph === 0) {
        c.ph = 1; c.last = Math.ceil(c.at - r.t);
        if (c.kind === 'surge') Hooks.sfx('warn');
      }
      if (c.ph === 1) {
        if (r.t < c.at) {
          const n = Math.ceil(c.at - r.t);
          if (n !== c.last) { c.last = n; if (n <= (c.kind === 'surge' ? 5 : 3)) Hooks.sfx('tick'); }
          if (c.kind === 'surge' && !c.t10 && r.t >= c.at - 10) { c.t10 = true; Hooks.banner(tr('Mach dich bereit!'), 'event ready', tr(c.s.hint), 2.6); }
          return;
        }
        // Boss-Countdown: Banner und Klang des Bosses selbst sind der Abschluss
        if (c.kind === 'boss') { c.ph = 3; r.cdIdx++; continue; }
        c.ph = 2; this.surgeStart(c);
      }
      if (c.ph === 2) {
        if (r.t < c.end) return;
        c.ph = 3; r.cdIdx++;
        this.surgeEnd(c);
      }
    }
  },
  surgeStart(c) {
    const r = this.run, s = c.s, wv = this.wave();
    // Nahkämpfer der Welle durch die zähe Ansturm-Mischung ersetzen; Fernkämpfer (rangedFrom, rangedCap) bleiben
    const pool = Object.assign({}, s.pool);
    for (const k in wv.pool) if (ENEMIES[k].ranged) pool[k] = wv.pool[k];
    r.surgeWave = { pool, rate: wv.rate, cap: wv.cap };
    r.surgeHits = 0;
    // Erfahrung und Tempo der Ansturm-Gegner; ab Nachtstufe 3 gedämpft und ohne Erfahrungsabzug (dort fehlt sonst
    // Erfahrung: der Held tötet langsamer, als Nachschub kommt)
    const hk = r.heat >= 3;
    r.surgeK = { xp: hk ? 1 : s.xp, speed: hk ? 1 + (s.speed - 1) * 0.7 : s.speed };
    this.runEvent(Object.assign({ text: s.text, quiet: true, surge: r.surgeK }, s.open));
    Hooks.sfx('surge');
    Hooks.shake(6);
  },
  surgeEnd(c) {
    const r = this.run, p = r.p;
    r.surgeWave = null;
    if (r.over || p.hp <= 0) return;
    // Belohnung nur als Gold (Schmiede), keine Stärke im Lauf; ohne Treffer doppelt
    const g = Math.round(c.s.gold * HEAT[r.heat].gold) * (r.surgeHits ? 1 : 2);
    r.gold += g;
    this.text(p.x, p.y - 26, tr('+{0} Gold', g), '#ffd23f', 1.4);
    Hooks.banner(tr('Ansturm überstanden!'), 'win', r.surgeHits ? tr('+{0} Gold', g) : tr('Ohne Treffer! +{0} Gold', g));
    Hooks.sfx('achievement');
  },
  // Lesezugriff für Oberfläche und Werkzeuge: null oder { kind, phase, left, frac, since, icon, tint, label }
  // (ein wiederverwendetes Objekt, die Anzeige fragt jedes Bild)
  countdownState() {
    const r = this.run;
    if (!r || !r.cdList) return null;
    const L = r.cdList, t = r.t;
    for (let i = r.cdIdx; i < L.length; i++) {
      const c = L[i];
      if (t < c.start) return null;
      const on = c.kind === 'surge' && t >= c.at;
      if (t >= (on ? c.end : c.at)) continue;
      const o = this._cds || (this._cds = { kind: '', phase: '', left: 0, frac: 0, since: 0, icon: '', tint: null, label: '' });
      o.kind = c.kind; o.phase = on ? 'on' : 'warn'; o.since = on ? t - c.at : t - c.start;
      o.left = Math.max(0, on ? c.end - t : c.at - t);
      o.frac = clamp(o.left / (on ? c.end - c.at : c.at - c.start), 0, 1);
      if (c.kind === 'surge') {
        o.icon = c.s.icon; o.tint = (r.stage.tints && r.stage.tints[c.s.icon]) || null; o.label = '';
      } else { o.icon = c.b.sprite; o.tint = c.b.tint || null; o.label = c.b.name; }
      return o;
    }
    return null;
  },

  wave() {
    const m = Math.floor(this.run.t / 60), w = this.run.stage.waves;
    return w[Math.min(m, w.length - 1)];
  },

  director(dt) {
    const r = this.run;
    this.countdownTick();
    const heat = HEAT[r.heat];
    const wv = this.wave();
    const extra = r.t > r.length ? 1 + (r.t - r.length) / 120 : 1;
    let rate = wv.rate * heat.rate * r.stage.mult.rate * extra;
    let cap = Math.round(wv.cap * Math.min(1.6, heat.rate) * Math.min(extra, 1.5));
    // Ansturm: mehr Nachschub, höhere Obergrenze, zähe Mischung (ab Nachtstufe 3 gedämpft)
    const sc = this.surgeNow(), surge = sc && sc.s;
    let wvUse = wv;
    if (surge) {
      const k = r.heat >= 3 ? 0.7 : 1;
      rate *= 1 + (surge.rate - 1) * k;
      cap = Math.round(cap * (1 + (surge.cap - 1) * k));
      wvUse = r.surgeWave || wv;
    }
    let alive = 0;
    for (const e of r.enemies) if (!e.swarm && !e.boss) alive++;
    if (alive < cap * 0.35) rate *= 2.2;
    if (r.bosses.some(b => b.boss.final && !b.dead)) rate *= 0.6;
    r.spawnAcc += rate * dt;
    while (r.spawnAcc >= 1) {
      r.spawnAcc -= 1;
      if (alive >= cap) { r.spawnAcc = 0; break; }
      const pos = this.spawnPos();
      const e = this.spawnEnemy(this.pickType(wvUse), pos.x, pos.y);
      if (surge) { e.xp *= r.surgeK.xp; e.speed *= r.surgeK.speed; }
      alive++;
    }

    // Elite
    r.eliteT -= dt;
    if (r.eliteT <= 0) {
      r.eliteT = 60;
      // Der erste Elitegegner ist der schnellste Nahkämpfer der Welle: er kommt sicher heran, die Truhe vor Ablauf der ersten Minute.
      const first = r.t < 60;
      r.eliteN++;
      // ab Minute 3 ist jeder zweite Elitegegner ein Fernkämpfer der Welle (falls die Welle welche hat)
      const rk = r.t >= 180 && r.eliteN % 2 === 0 ? Object.keys(wv.pool).filter(k => ENEMIES[k].ranged) : [];
      const pool = first ? [[Object.keys(wv.pool).filter(k => !ENEMIES[k].ranged).sort((a, b) => ENEMIES[b].speed - ENEMIES[a].speed)[0], 1]]
        : rk.length ? rk.map(k => [k, wv.pool[k]])
        : Object.entries(wv.pool).map(([k, v]) => [k, v * ENEMIES[k].hp]);
      // der erste erscheint sichtbar im Bild, ist schwächer und fast so schnell wie der Held – nicht im oberen Band,
      // wo gleichzeitig das Elite-Banner steht (Winkel −30° … 210°: seitlich oder unterhalb, höchstens 0,3 über dem Helden)
      const a = rand(-Math.PI / 6, Math.PI * 7 / 6), pos = first ? { x: r.p.x + Math.cos(a) * this.view.hw * 0.6, y: r.p.y + Math.sin(a) * this.view.hh * 0.6 } : this.spawnPos();
      const e = this.spawnEnemy(weightedPick(pool), pos.x, pos.y);
      e.elite = true;
      e.hp = e.maxHp = first ? Math.max(90, e.maxHp * 3) : Math.max(160, e.maxHp * 14);
      e.r *= 1.55; e.xp *= 8; e.kb *= 0.3; e.dmg *= 1.4;
      e.speed = first ? Math.max(e.speed, r.stats.speed * 0.9) : e.speed * 0.95;
      // Beginnt gerade eine Countdown-Leiste (1:30: „Starke Gegner kommen!“), kommt der Elite-Banner erst nach
      // deren Einstiegstext – sonst hält man den Elitegegner für die angekündigten starken Gegner
      const cd = r.cdList[r.cdIdx];
      if (cd && cd.kind === 'surge' && Math.abs(r.t - cd.start) < 2) r.eliteBanT = cd.start + 3.2;
      else Hooks.banner(tr('Ein Elitegegner taucht auf – er trägt eine Truhe!'), 'elite');
    }
    if (r.eliteBanT && r.t >= r.eliteBanT) { r.eliteBanT = 0; Hooks.banner(tr('Ein Elitegegner taucht auf – er trägt eine Truhe!'), 'elite'); }

    // Bosse
    const bl = r.bossList;
    if (r.bossIdx < bl.length && r.t >= bl[r.bossIdx].t) {
      this.spawnBoss(bl[r.bossIdx], 1);
      r.bossIdx++;
    }
    if (r.endless) {
      r.endlessBossT -= dt;
      if (r.endlessBossT <= 0) {
        r.endlessBossT = 120;
        const k = 1 + (r.t - r.length) / 120;
        const pool = bl.filter(b => !b.final);
        this.spawnBoss(Object.assign({}, pick(pool.length ? pool : bl), { final: false }), 1.5 + k);
      }
    }

    // Ereignisse
    const ev = r.stage.events;
    while (r.eventIdx < ev.length && r.t >= ev[r.eventIdx].t) {
      this.runEvent(ev[r.eventIdx]);
      r.eventIdx++;
    }
  },

  viewRadius() { return Math.hypot(this.view.hw, this.view.hh); },

  // Abstand vom Helden bis zum Bildrand in Richtung a
  edgeDist(a) {
    const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    return Math.min(c > 1e-6 ? this.view.hw / c : 1e9, s > 1e-6 ? this.view.hh / s : 1e9);
  },
  // im Bild (um inset Weltpixel eingerückt)? Oben zusätzlich unter der Anzeige (view.top: Weltpixel, die Zeit,
  // Bossleiste und -name am oberen Rand verdecken; setzt render.js auf Handys, sonst 0) plus pad
  inViewRect(x, y, inset, pad) {
    const p = this.run.p, dy = y - p.y, hh = this.view.hh;
    if (Math.abs(x - p.x) >= this.view.hw - inset || Math.abs(dy) >= hh - inset) return false;
    return !this.view.top || -dy < hh - this.view.top - (pad || 0);
  },
  clampView(x, y, inset) {
    const p = this.run.p, hw = this.view.hw - inset, hh = this.view.hh - inset;
    return { x: clamp(x, p.x - hw, p.x + hw), y: clamp(y, p.y - hh, p.y + hh) };
  },

  // Gegnertyp für den normalen Nachschub: Fernkämpfer erst ab rangedFrom und höchstens rangedCap gleichzeitig
  pickType(wv) {
    const r = this.run;
    let ent = Object.entries(wv.pool);
    if (r.t < (r.stage.rangedFrom || 0)) ent = ent.filter(([k]) => !ENEMIES[k].ranged);
    let k = weightedPick(ent);
    if (ENEMIES[k].ranged && r.rangedAlive >= this.rangedCap()) {
      const melee = ent.filter(([t]) => !ENEMIES[t].ranged);
      if (melee.length) k = weightedPick(melee);
    }
    return k;
  },
  rangedCap() {
    const r = this.run;
    return Math.round(Math.min(3 + 1.0 * Math.floor(r.t / 60), 14) * HEAT[r.heat].rate);
  },
  // Abklingzeit der Fernkämpfer: kürzer mit Spielzeit und Nachtstufe (nicht das Ausholen, nicht die Warnzeichen)
  cdMul() {
    const r = this.run;
    return Math.max(0.75, 1 - 0.025 * Math.floor(r.t / 60)) * (1 - 0.04 * r.heat) * (r.stage.rangedCd || 1);
  },
  // Geschosstempo mit Nachtstufe, nach oben begrenzt
  eSpeed(base, cap) { return Math.min(cap, base * HEAT[this.run.heat].speed); },

  // Salven-Regie: wie viele Gegner gleichzeitig ausholen dürfen und wie dicht hintereinander
  canWind(e) {
    const r = this.run, v = r.vol, m = Math.floor(r.t / 60);
    let max = m < 2 ? 3 : m < 6 ? 5 : 7;
    const gap = m < 2 ? 0.3 : m < 6 ? 0.2 : 0.14;
    if (r.heat >= 3) max++;
    if (v.active >= max || r.t - v.lastStart < gap) return false;
    if (e.rk === 'ring' && v.bells >= 2) return false;
    return true;
  },

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
    // Land-Modifikatoren: für alle Gegner und je Typ
    const mods = r.stage.mods || {}, ma = mods.all || {}, mt = mods[type] || {};
    const hp = d.hp * this.hpMul(r.t) * (ma.hp || 1) * (mt.hp || 1);
    const e = {
      id: r.nextId++, type, x, y, r: d.r, hp, maxHp: hp,
      speed: d.speed * heat.speed * (ma.speed || 1) * (mt.speed || 1) * rand(0.92, 1.08) * (d.speed < 90 ? 1 + EARLY_SPEED * Math.max(0, 1 - r.t / 180) : 1),
      dmg: d.dmg * heat.dmg * r.stage.mult.dmg * (1 + r.t / 60 * 0.07),
      tint: (r.stage.tints && r.stage.tints[type]) || null,
      xp: d.xp * (ma.xp || 1) * (mt.xp || 1), kb: d.kb, kx: 0, ky: 0, flash: 0, slowT: 0, slowF: 1, freezeT: 0,
      elite: false, boss: null, swarm: false, dead: false, hitT: {}, anim: Math.random() * 10,
      shootT: rand(1.5, 3), ranged: !!d.ranged, rk: d.ranged || null, windT: 0, windMax: 0, windStart: -1,
      side: Math.random() < 0.5 ? -1 : 1, flitT: rand(0, 1.2), flitD: 0, fadeT: 0, teles: null, pend: null,
      // später gesetzte Felder (Schwarm, Boss, Darstellung) schon hier: alle Gegner haben dieselbe Form (hidden
      // class), sonst verwirft V8 die optimierte Gegner-Schleife und legt jede Kommazahl auf dem Heap an
      life: 0, sdx: 0, sdy: 0, skillT: 0, skillIdx: 0, mode: 'chase', modeT: 0, cast: null, dashA: 0,
      _rs: null, _rf: -1, _rv: -1, _rsc: 1,
    };
    r.enemies.push(e);
    return e;
  },

  spawnBoss(def, mult) {
    const r = this.run;
    const pos = this.spawnPos();
    const e = this.spawnEnemy(ENEMIES[def.sprite] ? def.sprite : 'golem', pos.x, pos.y);
    e.boss = def;
    e.type = def.sprite;
    e.tint = def.tint || null;
    // Bosse bekommen nur 60 % des Lebenspunkte-Bonus der Nachtstufe (sonst wird der Endboss zur Wand)
    e.hp = e.maxHp = def.hp * (1 + (HEAT[r.heat].hp - 1) * 0.6) * mult;
    e.r = def.r; e.speed = def.speed * HEAT[r.heat].speed;
    e.dmg = def.dmg * HEAT[r.heat].dmg * r.stage.mult.dmg * (mult > 1 ? 1 + mult * 0.15 : 1);
    e.xp = def.xp; e.kb = 0.05;
    e.skillT = 3; e.skillIdx = 0; e.mode = 'chase'; e.modeT = 0;
    r.bosses.push(e);
    Hooks.banner(tr('{0} erscheint!', tr(def.name)), 'boss');
    Hooks.sfx('boss');
    Hooks.shake(10);
    return e;
  },

  runEvent(ev) {
    const r = this.run, p = r.p;
    Hooks.banner(tr(ev.text), 'event');
    if (!ev.quiet) Hooks.sfx('alarm');
    const vr = this.viewRadius();
    // Eröffnung eines Ansturms (ev.surge = { xp, speed }): weniger Erfahrung, ggf. schneller
    const sg = ev.surge || null;
    if (ev.kind === 'swarm') {
      const a = rand(0, TAU), ca = Math.cos(a), sa = Math.sin(a);
      const cx = p.x - ca * (vr + 60), cy = p.y - sa * (vr + 60);
      for (let i = 0; i < ev.n; i++) {
        const off = rand(-260, 260), back = rand(0, 200);
        const e = this.spawnEnemy(ev.type, cx - sa * off - ca * back, cy + ca * off - sa * back);
        if (sg) { e.xp *= sg.xp; e.speed *= sg.speed; }
        e.swarm = true; e.sdx = ca; e.sdy = sa; e.speed *= 1.35;
        e.life = (vr * 2 + 500) / e.speed;
      }
    } else if (ev.kind === 'arc') {
      // Schützen erscheinen im Bild, verteilt über 120° in Laufrichtung, und schießen frühestens nach 1,6 s
      const types = this.evTypes(ev), n = types.length;
      const mv = p.moving ? Math.atan2(p.dirY, p.dirX) : rand(0, TAU);
      for (let i = 0; i < n; i++) {
        const a = mv + (n > 1 ? i / (n - 1) - 0.5 : 0) * 120 * DEG, R = 0.8 * this.edgeDist(a);
        const e = this.spawnEnemy(types[i], p.x + Math.cos(a) * R, p.y + Math.sin(a) * R);
        if (sg) { e.xp *= sg.xp; e.speed *= sg.speed; }
        e.shootT = rand(1.6, 2.4); e.fadeT = 0.4;
        this.burst(e.x, e.y, '#120a18', 8, 90); this.burst(e.x, e.y, '#ff3d5a', 6, 120);
      }
    } else {
      const types = this.evTypes(ev), n = types.length;
      // gemischte Ringe (mit Schützen) stehen knapp im Bild, sonst wie bisher etwas außerhalb
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU, R = ev.mix ? 0.95 * this.edgeDist(a) : vr * 0.85;
        const e = this.spawnEnemy(types[i], p.x + Math.cos(a) * R, p.y + Math.sin(a) * R);
        if (sg) { e.xp *= sg.xp; e.speed *= sg.speed; }
        if (e.ranged) e.shootT = rand(1.6, 2.6);
      }
    }
  },
  // Gegnertypen eines Ereignisses: type × n oder mix {typ: anzahl} (gemischt verteilt)
  evTypes(ev) {
    if (!ev.mix) return new Array(ev.n).fill(ev.type);
    const out = [], left = Object.assign({}, ev.mix);
    let total = 0;
    for (const k in left) total += left[k];
    // gleichmäßig verteilen: immer den Typ mit dem größten Rest-Anteil
    for (let i = 0; i < total; i++) {
      let best = null, bs = -1;
      for (const k in left) { const sc = left[k] / ev.mix[k]; if (left[k] > 0 && sc > bs) { bs = sc; best = k; } }
      out.push(best); left[best]--;
    }
    return out;
  },

  // ---------- Gegner ----------
  updateEnemies(dt) {
    const r = this.run, p = r.p, g = this.grid;
    const near = this.qbufs[0];
    const reloc = this.viewRadius() * 1.5 + 100;
    const decay = Math.exp(-9 * dt);
    // Salven-Regie: wer holt gerade aus (Bosse beim Zaubern zählen mit), wie viele Fernkämpfer leben
    let act = 0, bells = 0, ra = 0;
    for (const e of r.enemies) {
      if (e.dead) continue;
      if (e.windT > 0 || (e.boss && e.mode === 'cast')) { act++; if (e.rk === 'ring') bells++; }
      if (e.ranged && !e.boss) ra++;
    }
    r.vol.active = act; r.vol.bells = bells; r.rangedAlive = ra;
    for (const e of r.enemies) {
      if (e.dead) continue;
      e.anim += dt;
      if (e.fadeT > 0) e.fadeT -= dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowF = 1; }
      let mx = 0, my = 0;
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      if (e.swarm) {
        e.life -= dt * e.slowF;
        if (e.life <= 0) { e.dead = true; continue; }
        mx = e.sdx * e.speed * e.slowF; my = e.sdy * e.speed * e.slowF;
      } else if (e.boss) {
        const v = this.bossAI(e, dx, dy, d, dt);
        mx = v.x; my = v.y;
      } else {
        const sp = e.speed * e.slowF;
        if (e.rk) {
          const v = this.rangedAI(e, dx, dy, d, dt);
          mx = v.x; my = v.y;
        } else {
          mx = dx / d * sp; my = dy / d * sp;
        }
      }
      if (e.freezeT > 0) {
        e.freezeT -= dt; mx = 0; my = 0;
        // Einfrieren bricht das Ausholen ab
        if (e.windT > 0 && !e.boss) { this.endWind(e); e.shootT = 1.0; }
      }

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
          if (e.windT > 0) this.endWind(e);
        }
      }

      // Kontakt mit Spieler
      const rr = e.r + p.r - 3;
      if (d < rr) this.hurtPlayer(e.dmg, e.boss ? 'boss' : e.elite ? 'elite' : e.swarm ? 'swarm' : 'contact');
    }
  },

  // ---------- Fernkämpfer ----------
  // Bewegung: Wunschabstand D (Band, aber im Bild), darunter zurückweichen, darüber herankommen, dazwischen seitlich.
  // Schießen: Abklingzeit, dann Ausholen mit Warnzeichen (nur im Bild und wenn die Salven-Regie es erlaubt).
  rangedAI(e, dx, dy, d, dt) {
    const r = this.run, def = ENEMIES[e.type], sp = e.speed * e.slowF, out = this._rv || (this._rv = { x: 0, y: 0 });
    out.x = 0; out.y = 0;
    const ux = dx / d, uy = dy / d;
    // verzögerte zweite (dritte) Ringe der Glocke
    if (e.pend) this.pendStep(e, dt);
    if (e.windT > 0) {
      if (!(e.freezeT > 0)) {
        e.windT -= dt * e.slowF;
        if (e.windT <= 0) this.releaseWind(e);
      }
      return out; // beim Ausholen stehen sie still
    }
    const kEdge = e.rk === 'needle' ? 0.85 : 0.8;
    const D = Math.min(def.band[1] - 30, kEdge * this.edgeDist(Math.atan2(-dy, -dx)));
    const retreat = e.elite ? 0 : def.retreat;
    let dir = 0;
    if (d < D - 40) dir = -retreat; else if (d > D + 40) dir = 1;
    if (Math.random() < dt * 0.25) e.side = -e.side;
    let st = def.strafe * e.side;
    if (e.rk === 'needle') { // Motte: alle 1,2 s ein kurzer Seitensprung
      e.flitT -= dt;
      if (e.flitT <= 0) { e.flitT = 1.2; e.flitD = 0.25; e.side = Math.random() < 0.5 ? -1 : 1; }
      if (e.flitD > 0) { e.flitD -= dt; st = 1.4 * e.side; }
    }
    out.x = ux * sp * dir - uy * sp * st; out.y = uy * sp * dir + ux * sp * st;
    if (e.freezeT > 0) return out;
    e.shootT -= dt * e.slowF;
    if (e.shootT <= 0) {
      if (d < def.band[1] + 120 && this.inViewRect(e.x, e.y, 24, 12) && this.canWind(e) && this.capOK(e)) this.startWind(e);
      else e.shootT = 0.3;
    }
    return out;
  },

  // Passt die ganze Salve noch unter die Obergrenzen?
  capOK(e) {
    const r = this.run, el = e.elite;
    const n = { spit: el ? 5 : r.t >= 240 ? 3 : 1, needle: el ? 3 : 1, ring: el ? 36 : 20, mortar: 0 }[e.rk] || 0;
    const nt = { spit: 1, needle: el ? 3 : 1, ring: 1, mortar: el ? 3 : 1 }[e.rk] || 1;
    return r.eshots.length + n <= ESHOT_CAP && r.tele.length + nt <= TELE_CAP;
  },

  // Ziel mit Vorhalt: Spielerposition + Tempo × lead × Flugzeit
  leadAim(x, y, lead, spd) {
    const p = this.run.p;
    if (!lead) return Math.atan2(p.y - y, p.x - x);
    const tt = Math.hypot(p.x - x, p.y - y) / spd;
    return Math.atan2(p.y + p.vy * lead * tt - y, p.x + p.vx * lead * tt - x);
  },

  startWind(e) {
    const r = this.run, def = ENEMIES[e.type];
    e.windT = e.windMax = def.wind; e.windStart = r.t;
    r.vol.active++; r.vol.lastStart = r.t; if (e.rk === 'ring') r.vol.bells++;
    Hooks.sfx('ewind', 0, e.x);
    const el = e.elite, base = { follow: e, own: e, ws: r.t, x: e.x, y: e.y, t: 0, life: def.wind };
    e.teles = [];
    if (e.rk === 'spit') {
      // Keil (Fächer-Umriss) zum Helden, folgt ihm bis 0,15 s vor dem Schuss
      const n = el ? 5 : r.t >= 240 ? 3 : 1, step = (el ? 14 : 16) * DEG, spd = this.eSpeed(170, 210);
      const offs = []; for (let i = 0; i < n; i++) offs.push((i - (n - 1) / 2) * step);
      const dmg = e.dmg * (n > 1 && !el ? 0.8 : el ? 0.8 : 1);
      const tl = Object.assign({ kind: 'charge', wedge: 90, a: this.leadAim(e.x, e.y, 0, spd), lockAt: def.wind - 0.15, lead: 0, spd, offs, sr: e.r * 0.6,
        shots: offs.map(o => ({ a: 0, o, spd, r: 7, dmg, life: 3.5 })) }, base);
      this.aimShots(tl);
      e.teles.push(tl);
    } else if (e.rk === 'needle') {
      // Ziellinie: 0,6 s folgt sie (50 % Vorhalt), dann 0,3 s gesperrt
      const spd = this.eSpeed(460, 520);
      for (const o of el ? [-10 * DEG, 0, 10 * DEG] : [0]) {
        e.teles.push(Object.assign({ kind: 'aim', len: 700, lockAt: 0.6, lead: 0.5, spd, o, a: this.leadAim(e.x, e.y, 0.5, spd) + o, hr: 6, dmg: e.dmg * 0.8 }, base));
      }
    } else if (e.rk === 'ring') {
      // Ladekreis mit den Austrittspunkten beider Ringe (Ring B um einen halben Schritt gedreht, 0,3 s später)
      const n = el ? 12 : 10, rings = el ? 3 : 2, off = rand(0, TAU), step = TAU / n, spd = this.eSpeed(110, 210), shots = [];
      for (let k = 0; k < rings; k++) for (let i = 0; i < n; i++) shots.push({ a: off + (i + (k === 1 ? 0.5 : k === 2 ? 0.25 : 0)) * step, spd, r: 8, dmg: e.dmg * 0.6, life: 4.0, d: k * 0.3 });
      e.teles.push(Object.assign({ kind: 'charge', ring: true, sr: e.r + 18, shots }, base));
    } else if (e.rk === 'mortar') {
      // nur das Ausholen (Bild 2); die Markierung erscheint beim Abschuss und steht 1,1 s
    }
    for (const tl of e.teles) r.tele.push(tl);
  },

  // Winkel der angekündigten Geschosse aus dem Grundwinkel a + Versatz
  aimShots(tl) { if (tl.shots) for (const sh of tl.shots) sh.a = tl.a + sh.o; },

  endWind(e) {
    e.windT = 0; e.windStart = -1;
    if (e.teles) { for (const tl of e.teles) tl.dead = true; e.teles = null; }
  },

  releaseWind(e) {
    const r = this.run, p = r.p, teles = e.teles || [];
    Hooks.sfx('efire', 0, e.x);
    e.shootT = rand(ENEMIES[e.type].cd[0], ENEMIES[e.type].cd[1]) * this.cdMul();
    if (e.rk === 'spit' || e.rk === 'ring') {
      const tl = teles[0];
      if (tl) {
        const later = [];
        for (const sh of tl.shots) {
          const sx = e.x + Math.cos(sh.a) * tl.sr, sy = e.y + Math.sin(sh.a) * tl.sr;
          if (sh.d) later.push({ t: sh.d, sh }); else this.enemyShot(sx, sy, Math.cos(sh.a), Math.sin(sh.a), sh.spd, sh.dmg, sh.r, { life: sh.life, src: e.rk === 'ring' ? 'ring' : 'shot' });
        }
        if (later.length) e.pend = later;
      }
    } else if (e.rk === 'needle') {
      for (const tl of teles) this.enemyShot(e.x + Math.cos(tl.a) * e.r, e.y + Math.sin(tl.a) * e.r, Math.cos(tl.a), Math.sin(tl.a), tl.spd, tl.dmg, tl.hr, { life: 1.6, kind: 'needle', src: 'needle' });
    } else if (e.rk === 'mortar') {
      // Ziel: wo der Held in 0,6 × Flugzeit sein wird, etwas gestreut, im Bild
      const fl = 1.1, sa = rand(0, TAU), sc = rand(0, 30);
      const T = this.clampView(p.x + p.vx * 0.6 * fl + Math.cos(sa) * sc, p.y + p.vy * 0.6 * fl + Math.sin(sa) * sc, 20);
      const pts = e.elite ? [0, 1, 2].map(i => { const a = -Math.PI / 2 + i * TAU / 3; return this.clampView(T.x + Math.cos(a) * 40.4, T.y + Math.sin(a) * 40.4, 20); }) : [T];
      for (const q of pts) {
        r.tele.push({ kind: 'circle', x: q.x, y: q.y, rad: 40, t: 0, life: fl, dmg: e.dmg * 1.0, src: 'mortar', onImpact: 'ember', pdmg: e.dmg * 0.45,
          coal: { sx: e.x, sy: e.y - e.r * 0.7 }, small: true });
      }
    }
    this.endWind(e);
  },

  // verzögerte Geschosse (zweiter/dritter Glockenring)
  pendStep(e, dt) {
    const pd = e.pend;
    for (let i = pd.length - 1; i >= 0; i--) {
      const q = pd[i];
      q.t -= dt;
      if (q.t > 0) continue;
      const sh = q.sh, sr = e.r + 18;
      if (this.run.eshots.length < ESHOT_CAP_BOSS) this.enemyShot(e.x + Math.cos(sh.a) * sr, e.y + Math.sin(sh.a) * sr, Math.cos(sh.a), Math.sin(sh.a), sh.spd, sh.dmg, sh.r, { life: sh.life, src: 'ring' });
      pd.splice(i, 1);
    }
    if (!pd.length) e.pend = null;
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
        // Fernangriffe nur im Bild, nicht zu nah und nur, wenn die ganze Salve unter die Obergrenzen passt
        const cp = this.castParams(e, sk);
        if (cp) {
          if (this.canCast(e, d, cp)) { this.startCast(e, sk, cp); return out; }
          sk = 'dash';
        }
        if (sk === 'dash') {
          e.mode = 'windup'; e.modeT = 0.75; e.dashA = Math.atan2(dy, dx);
          r.tele.push({ kind: 'line', x: e.x, y: e.y, a: e.dashA, len: 520, w: e.r * 1.6, t: 0, life: 0.75, follow: e });
        } else if (sk === 'summon') {
          const type = e.boss.summon || (e.type === 'skel' || e.type === 'night' ? 'skel' : weightedPick(Object.entries(this.wave().pool)));
          const n = e.boss.final ? 12 : 9;
          for (let i = 0; i < n; i++) {
            const a = i / n * TAU;
            this.spawnEnemy(type, e.x + Math.cos(a) * (e.r + 40), e.y + Math.sin(a) * (e.r + 40));
          }
          this.burst(e.x, e.y, '#c9b8ff', 26, 220);
          Hooks.sfx('summon');
        } else if (sk === 'slam') {
          const p = r.p;
          r.tele.push({ kind: 'circle', x: p.x, y: p.y, rad: 100, t: 0, life: 1.05, dmg: e.dmg * 1.2, src: 'area' });
        }
      }
    } else if (e.mode === 'cast') {
      this.castStep(e, dx, dy, d, dt, out);
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

  // ---------- Boss-Fernangriffe: fünf Grundformen (Fächer, Lanzen, Regen, Spirale, Bahnen) und die Nova ----------
  // Parameter je Boss in def.cast[skill] (prim = Grundform); 'nova' braucht keinen Eintrag.
  castParams(e, sk) {
    if (sk === 'nova') return { prim: 'nova', n: e.boss.final ? 22 : 16 };
    const c = e.boss.cast && e.boss.cast[sk];
    return c || null;
  },
  castShots(e, cp) {
    if (cp.prim === 'nova' || cp.prim === 'fan') return cp.n;
    if (cp.prim === 'lances') return 3;
    if (cp.prim === 'spiral') return cp.arms * Math.ceil(2.4 / 0.14);
    return 0;
  },
  canCast(e, d, cp) {
    const r = this.run;
    if (!this.inViewRect(e.x, e.y, 30, e.r * 0.6) || d <= 140) return false;
    const nt = cp.prim === 'rain' ? (cp.k || 1) : cp.prim === 'lanes' ? 3 : cp.prim === 'lances' ? 3 : 1;
    return r.eshots.length + this.castShots(e, cp) <= ESHOT_CAP_BOSS && r.tele.length + nt <= TELE_CAP;
  },
  startCast(e, sk, cp) {
    const r = this.run, p = r.p, prim = cp.prim;
    const wind = { nova: 0.6, fan: 0.6, lances: 0.85, spiral: 0.6, rain: 0, lanes: 0 }[prim];
    const c = e.cast = { k: sk, prim, p: cp, t: 0, wind, dur: 0, q: null, fired: 0 };
    e.mode = 'cast';
    e.windT = e.windMax = wind; e.windStart = r.t;
    e.teles = [];
    const base = { follow: e, own: e, ws: r.t, x: e.x, y: e.y, t: 0, life: wind };
    if (wind) Hooks.sfx('ewind', 0, e.x);
    if (prim === 'nova') {
      // Ladekreis mit den Austrittspunkten (Versatz beim Laden festgelegt)
      const off = rand(0, TAU), spd = this.eSpeed(165, 210), shots = [];
      for (let i = 0; i < cp.n; i++) shots.push({ a: off + i / cp.n * TAU, spd, r: 9, dmg: e.dmg * 0.6, life: 3.5 });
      e.teles.push(Object.assign({ kind: 'charge', ring: true, boss: true, sr: e.r + 10, shots }, base));
    } else if (prim === 'fan') {
      const spd = Math.min(Math.max(210, cp.spd), cp.spd * HEAT[r.heat].speed), offs = [];
      for (let i = 0; i < cp.n; i++) offs.push((cp.n > 1 ? i / (cp.n - 1) - 0.5 : 0) * cp.spread * DEG);
      const tl = Object.assign({ kind: 'charge', wedge: 140, boss: true, a: this.leadAim(e.x, e.y, 0, spd), lockAt: wind - 0.15, lead: 0, spd, sr: e.r * 0.7,
        shots: offs.map(o => ({ a: 0, o, spd, r: 8, dmg: e.dmg * 0.6, life: 3.5 })) }, base);
      this.aimShots(tl);
      e.teles.push(tl);
    } else if (prim === 'lances') {
      const spd = this.eSpeed(520, 560);
      for (const o of [-22 * DEG, 0, 22 * DEG]) e.teles.push(Object.assign({ kind: 'aim', len: 900, lockAt: 0.5, lead: 0.5, spd, o, a: this.leadAim(e.x, e.y, 0.5, spd) + o, hr: 9, dmg: e.dmg * 0.8, boss: true }, base));
    } else if (prim === 'spiral') {
      const off = rand(0, TAU), spd = this.eSpeed(135, 210), shots = [];
      for (let i = 0; i < cp.arms; i++) shots.push({ a: off + i / cp.arms * TAU, spd, r: 8, dmg: e.dmg * 0.5, life: 3.5 });
      c.off = off; c.spd = spd; c.dur = 2.4; c.next = 0;
      e.teles.push(Object.assign({ kind: 'charge', ring: true, boss: true, arms: true, sr: e.r + 10, shots }, base));
    } else if (prim === 'rain') {
      c.q = this.rainPlan(e, cp);
      c.dur = c.q.reduce((m, q) => Math.max(m, q.at), 0) + 0.05;
    } else if (prim === 'lanes') {
      const L = [];
      if (cp.pat === 'x') {
        const a0 = rand(0, Math.PI);
        for (const a of [a0, a0 + Math.PI / 2]) L.push({ x: p.x - Math.cos(a) * 500, y: p.y - Math.sin(a) * 500, a, len: 1000, w: 44, life: 1.1, dmg: e.dmg * 1.0 });
      } else {
        const a0 = Math.atan2(p.y - e.y, p.x - e.x);
        for (const o of [-30, 0, 30]) L.push({ x: e.x, y: e.y, a: a0 + o * DEG, len: 800, w: 50, life: 1.0, dmg: e.dmg * 1.1 });
      }
      for (const l of L) r.tele.push(Object.assign({ kind: 'lane', t: 0 }, l));
      Hooks.sfx('ewind', 0, e.x);
      c.dur = 1.1;
    }
    for (const tl of e.teles) r.tele.push(tl);
  },

  // Plan der Markierungen eines Regens: Zeitpunkt at, Lage beim Erscheinen bestimmt (place)
  rainPlan(e, cp) {
    const q = [], v = cp.v;
    if (v === 'scatter') for (let i = 0; i < cp.k; i++) q.push({ at: i * 0.15, i });
    else if (v === 'flank' || v === 'walk' || v === 'track') q.push({ at: 0, i: 0 });
    else if (v === 'stars') for (let i = 0; i < 9; i++) q.push({ at: i * 0.2, i });
    return q;
  },
  rainPlace(e, cp, i) {
    const r = this.run, p = r.p, v = cp.v, out = [];
    const mk = (x, y, rad, life, dmg, extra) => {
      const c = this.clampView(x, y, 20);
      out.push(Object.assign({ kind: 'circle', x: c.x, y: c.y, rad, t: 0, life, dmg, src: 'area', small: rad < 70 }, extra || {}));
    };
    if (v === 'scatter') {
      if (i === 0) mk(p.x, p.y, cp.rad, 1.0, e.dmg);
      else { const a = rand(0, TAU), dd = rand(90, 240); mk(p.x + Math.cos(a) * dd, p.y + Math.sin(a) * dd, cp.rad, 1.0, e.dmg); }
    } else if (v === 'flank') {
      const a = p.moving ? Math.atan2(p.vy, p.vx) + Math.PI / 2 : rand(0, TAU);
      for (const k of [0, 1, -1]) mk(p.x + Math.cos(a) * 70 * k, p.y + Math.sin(a) * 70 * k, 48, 1.0, e.dmg * 0.8, { onImpact: 'slow' });
    } else if (v === 'walk') {
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      for (let k = 0; k < 7; k++) { const dd = 120 + k * 70; mk(e.x + Math.cos(a) * dd, e.y + Math.sin(a) * dd, 36, 0.75 + 0.12 * k, e.dmg * 0.9); }
    } else if (v === 'stars') {
      if (i % 2 === 0) mk(p.x + p.vx * 0.8 + rand(-20, 20), p.y + p.vy * 0.8 + rand(-20, 20), 32, 0.8, e.dmg * 0.7);
      else { const a = rand(0, TAU), dd = rand(0, 260); mk(p.x + Math.cos(a) * dd, p.y + Math.sin(a) * dd, 32, 0.8, e.dmg * 0.7); }
    } else if (v === 'track') {
      mk(p.x, p.y, 80, 1.6, e.dmg * 1.4, { track: { spd: r.stats.speed * 0.85, until: 0.9 }, small: false });
    }
    return out;
  },

  castStep(e, dx, dy, d, dt, out) {
    const r = this.run, c = e.cast, cp = c.p;
    if (c.prim !== 'spiral') { const sp = e.speed * 0.3 * (e.slowF < 1 ? 0.8 : 1); out.x = dx / d * sp; out.y = dy / d * sp; }
    const k = c.t < c.wind ? (e.slowF || 1) : 1;
    c.t += dt * k;
    if (c.wind && e.windT > 0) {
      e.windT = Math.max(0, c.wind - c.t);
      if (e.windT <= 0) this.castRelease(e);
    }
    const tt = c.t - c.wind;
    if (c.prim === 'rain') {
      for (const q of c.q) if (!q.done && tt >= q.at) {
        q.done = true;
        for (const m of this.rainPlace(e, cp, q.i)) if (r.tele.length < TELE_CAP) r.tele.push(m);
        Hooks.sfx('ewind', 0, e.x);
      }
    } else if (c.prim === 'spiral' && tt >= 0) {
      while (c.next <= tt && c.next < c.dur) {
        const rot = c.off + 120 * DEG * c.next;
        for (let i = 0; i < cp.arms; i++) {
          if (r.eshots.length >= ESHOT_CAP_BOSS) continue; // laufende Spirale: über der harten Grenze einzelne Schüsse auslassen
          const a = rot + i / cp.arms * TAU;
          this.enemyShot(e.x + Math.cos(a) * (e.r + 10), e.y + Math.sin(a) * (e.r + 10), Math.cos(a), Math.sin(a), c.spd, e.dmg * 0.5, 8, { src: 'bossShot' });
        }
        if (c.next === 0) Hooks.sfx('efire', 0, e.x);
        c.next += 0.14;
      }
    }
    if (c.t >= c.wind + c.dur) {
      e.mode = 'chase';
      e.skillT = e.boss.final ? 2.6 : 3.6; // ab dem Ende des Angriffs gezählt
      e.cast = null;
      this.endWind(e);
    }
  },
  castRelease(e) {
    const c = e.cast, teles = e.teles || [];
    if (c.prim === 'nova' || c.prim === 'fan') {
      const tl = teles[0];
      if (tl) for (const sh of tl.shots) this.enemyShot(e.x + Math.cos(sh.a) * tl.sr, e.y + Math.sin(sh.a) * tl.sr, Math.cos(sh.a), Math.sin(sh.a), sh.spd, sh.dmg, sh.r, { src: 'bossShot' });
      Hooks.sfx(c.prim === 'nova' ? 'summon' : 'efire', 0, e.x);
    } else if (c.prim === 'lances') {
      for (const tl of teles) this.enemyShot(e.x + Math.cos(tl.a) * e.r * 0.8, e.y + Math.sin(tl.a) * e.r * 0.8, Math.cos(tl.a), Math.sin(tl.a), tl.spd, tl.dmg, tl.hr, { life: 1.6, kind: 'lance', src: 'bossShot' });
      Hooks.sfx('efire', 0, e.x);
    }
    this.endWind(e);
    e.windT = 0;
  },

  enemyShot(x, y, dx, dy, speed, dmg, rad, o) {
    o = o || {};
    this.run.eshots.push({ x, y, vx: dx * speed, vy: dy * speed, dmg, r: rad, life: o.life || 3.5, kind: o.kind || 'orb', src: o.src || 'shot' });
  },

  // src: Quelle des Treffers (contact, shot, needle, mortar, puddle, ring, bossShot, area, lane …), nur gemerkt
  hurtPlayer(dmg, src) {
    const r = this.run, p = r.p;
    if (p.iframe > 0 || r.over || this.state !== 'play') return;
    r.lastHitSrc = src || null;
    const taken = Math.max(1, dmg - r.stats.armor);
    p.hp -= taken;
    p.iframe = 0.5;
    p.flash = 0.25;
    if (r.firstHit === null) r.firstHit = r.t;
    r.surgeHits++;
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
      Hooks.banner(tr('Wiedergeboren!'), 'event');
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
    Hooks.sfx('hit', 0, e.x);
    if (e.hp <= 0) this.kill(e);
    return dmg;
  },

  kill(e) {
    const r = this.run, save = Store.data;
    e.dead = true;
    if (e.windT > 0 || e.teles) this.endWind(e);
    r.kills++;
    save.stats.kills++;
    const col = ENEMY_COLORS[e.type] || '#fff';
    Hooks.kill(e); // nur Darstellung (Todes-Effekt)
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
      Hooks.happy();
      Hooks.banner(tr('{0} besiegt!', tr(e.boss.name)), 'win');
      if (e.boss.final && !r.won && !r.over) {
        r.won = true;
        // Sieg sofort sichern, falls der Endlosmodus nie regulär endet
        this.recordClear();
        this.checkAchievements();
        Store.save();
        this.state = 'victory';
        Hooks.victory();
      }
      return;
    }
    Hooks.sfx('kill', 0, e.x);
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
        this.hurtPlayer(s.dmg, s.src || 'shot');
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
    // Warnzeichen (Boss und Fernkämpfer). Am Ausholen hängende (own) leben genau so lange wie das Ausholen.
    for (let i = r.tele.length - 1; i >= 0; i--) {
      const t = r.tele[i];
      let gone = !!t.dead;
      if (t.own) {
        const o = t.own;
        if (o.dead || o.windStart !== t.ws || !(o.windT > 0)) gone = true;
        else { t.life = o.windMax; t.t = o.windMax - o.windT; }
      } else t.t += dt;
      if (t.follow) { t.x = t.follow.x; t.y = t.follow.y; }
      if (!gone && t.lockAt !== undefined && t.t < t.lockAt && t.follow) {
        // Ziel nachführen bis zum Sperren
        t.a = this.leadAim(t.x, t.y, t.lead, t.spd) + (t.o || 0);
        this.aimShots(t);
      }
      if (t.track && t.t < t.track.until) {
        // Finsternis: folgt dem Helden mit 85 % seines Tempos, bleibt im Bild
        const dx = p.x - t.x, dy = p.y - t.y, d = Math.hypot(dx, dy), st = Math.min(d, t.track.spd * dt);
        if (d > 0.01) { t.x += dx / d * st; t.y += dy / d * st; }
        const c = this.clampView(t.x, t.y, 20); t.x = c.x; t.y = c.y;
      }
      if (!gone && !t.own && t.t >= t.life) {
        gone = true;
        if (t.kind === 'circle') this.circleImpact(t);
        else if (t.kind === 'lane') this.laneImpact(t);
      }
      if (gone) { r.tele[i] = r.tele[r.tele.length - 1]; r.tele.pop(); }
    }
    // Pfützen: Glut schadet, Schleim bremst
    const hz = r.haz;
    for (let i = hz.length - 1; i >= 0; i--) {
      const h = hz[i];
      h.t += dt;
      if (h.t >= h.life) { hz[i] = hz[hz.length - 1]; hz.pop(); continue; }
      const rr = h.rad + p.r - 4;
      if (dist2(p.x, p.y, h.x, h.y) < rr * rr) {
        if (h.kind === 'ember') this.hurtPlayer(h.dmg, 'puddle');
        else p.slowT = 0.15;
      }
    }
  },

  circleImpact(t) {
    const r = this.run, p = r.p;
    if (dist2(p.x, p.y, t.x, t.y) < (t.rad + p.r) * (t.rad + p.r)) this.hurtPlayer(t.dmg, t.src || 'area');
    if (t.small) {
      r.fx.push({ kind: 'boom', x: t.x, y: t.y, rad: t.rad, t: 0, life: 0.35, color: '#ff3d5a' });
      this.burst(t.x, t.y, '#120a18', 6, 120); this.burst(t.x, t.y, '#ff8a96', 6, 160);
      Hooks.shake(3);
      Hooks.sfx('eimpact', 0, t.x);
    } else {
      r.fx.push({ kind: 'boom', x: t.x, y: t.y, rad: t.rad, t: 0, life: 0.45, color: '#ff8a5c' });
      Hooks.shake(8);
      Hooks.sfx('slam');
    }
    if (t.onImpact === 'ember') this.addHaz({ kind: 'ember', x: t.x, y: t.y, rad: 32, life: 2.6, dmg: t.pdmg || t.dmg * 0.4 });
    else if (t.onImpact === 'slow') this.addHaz({ kind: 'slow', x: t.x, y: t.y, rad: t.rad, life: 3.0, dmg: 0 });
  },

  laneImpact(t) {
    const r = this.run, p = r.p, ca = Math.cos(t.a), sa = Math.sin(t.a);
    const rx = p.x - t.x, ry = p.y - t.y, along = rx * ca + ry * sa, perp = Math.abs(-rx * sa + ry * ca);
    if (along > -p.r && along < t.len + p.r && perp < t.w / 2 + p.r) this.hurtPlayer(t.dmg, 'lane');
    for (let k = 0; k < 14; k++) {
      const d = k / 13 * t.len;
      this.part(t.x + ca * d, t.y + sa * d, k % 2 ? '#ff3d5a' : '#120a18', rand(-50, 50), rand(-50, 50), 0.45, rand(3, 6));
    }
    Hooks.shake(5);
    Hooks.sfx('eimpact', 0, t.x + ca * t.len / 2);
  },

  addHaz(h) {
    const hz = this.run.haz;
    if (hz.length >= HAZ_CAP) {
      // die älteste verblasst, statt plötzlich zu verschwinden
      let old = null;
      for (const o of hz) if (o.life - o.t > 0.3 && (!old || o.t > old.t)) old = o;
      if (old) old.life = old.t + 0.3;
    }
    h.t = 0;
    hz.push(h);
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
        const step = g.sp * dt;
        // Schritt nie über den Spieler hinaus, sonst pendeln schnelle Steine ewig
        if (step >= d) { g.x = p.x; g.y = p.y; } else { g.x += dx / d * step; g.y += dy / d * step; }
        if (d < p.r + 8 || step >= d) {
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
      let reached = false;
      if (it.mag) {
        const d = Math.sqrt(d2) || 1;
        it.sp += 1000 * dt;
        const step = it.sp * dt;
        if (step >= d) { it.x = p.x; it.y = p.y; reached = true; } else { it.x += dx / d * step; it.y += dy / d * step; }
      }
      const reach = p.r + (it.kind === 'chest' ? 22 : 14);
      if (reached || d2 < reach * reach) {
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
      this.text(p.x, p.y - 26, tr('+{0} Gold', v), '#ffd23f', 1);
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
  // Partikel und Schadenszahlen kommen aus einem Vorrat (keine neuen Objekte je Treffer: weniger Speicherbereinigung,
  // die sonst alle paar Sekunden das Spiel für einige ms anhält); _sp ist das zwischengespeicherte Bild der Darstellung
  partPool: [], textPool: [], numStr: [],
  part(x, y, color, vx, vy, life, size) {
    const ps = this.run.parts;
    if (ps.length > 700) return;
    const q = this.partPool.pop() || { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0, size: 0, color: '', _sp: null };
    q.x = x; q.y = y; q.vx = vx; q.vy = vy; q.life = life; q.max = life; q.size = size; q.color = color; q._sp = null;
    ps.push(q);
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
    if (ts.length > 70) this.textPool.push(ts.shift());
    // ganze Zahlen (Schaden) als zwischengespeicherte Zeichenkette
    const ns = this.numStr, s = typeof txt === 'number' && txt >= 0 && txt < 20000 && txt === (txt | 0) ? ns[txt] || (ns[txt] = String(txt)) : String(txt);
    const o = this.textPool.pop() || { x: 0, y: 0, txt: '', color: '', scale: 1, t: 0 };
    o.x = x; o.y = y; o.txt = s; o.color = color; o.scale = scale; o.t = 0;
    ts.push(o);
  },

  updateParticles(dt) {
    const r = this.run;
    const ps = r.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const q = ps[i];
      q.life -= dt;
      if (q.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); if (this.partPool.length < 800) this.partPool.push(q); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt;
      q.vx *= 0.92; q.vy *= 0.92;
    }
    const ts = r.texts;
    for (let i = ts.length - 1; i >= 0; i--) {
      ts[i].t += dt;
      ts[i].y -= 32 * dt;
      if (ts[i].t > 0.7) { if (this.textPool.length < 100) this.textPool.push(ts[i]); ts.splice(i, 1); }
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
    // Frühe Stufen: immer eine neue Waffe anbieten – das sichtbarste Upgrade
    if (r.weapons.length === 1 && r.level <= 4 && out.length && !out.some(o => o.kind === 'weapon' && o.isNew)) {
      const nw = cands.filter(c => c.kind === 'weapon' && c.isNew);
      if (nw.length) out[out.length - 1] = pick(nw);
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
    let any = false;
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
      Hooks.achievement(a);
      any = true;
    }
    if (any) Store.save();
  },

  // Gebiet geschafft: Bestwert, Sterne und Freischaltungen festhalten (für den Siegbildschirm)
  recordClear() {
    const r = this.run, save = Store.data, id = r.stage.id, idx = STAGES.indexOf(r.stage);
    const next = STAGES[idx + 1];
    const starsBefore = stageStars(save, id), heatBefore = stageMaxHeat(save, id);
    const nextBefore = next ? stageUnlocked(save, idx + 1) : true;
    save.stages[id] = Math.max(stageBest(save, id), r.heat);
    save.stats.wins++;
    r.clear = {
      starsBefore, stars: stageStars(save, id),
      newStage: next && !nextBefore ? next : null,
      newHeat: stageMaxHeat(save, id) > heatBefore ? stageMaxHeat(save, id) : 0,
      last: !next,
    };
  },

  continueEndless() {
    const r = this.run;
    if (r.over) return;
    r.endless = true;
    r.endlessBossT = 120;
    this.state = 'play';
    this.afterModal();
  },

  endRun(won) {
    const r = this.run, save = Store.data;
    if (r.ended) return;
    r.ended = true;
    r.over = true;
    // Boni enthalten den Nachtstufen-Faktor bereits (wie das gesammelte Gold)
    const mul = HEAT[r.heat].gold;
    const timeBonus = Math.round(Math.floor(r.t / 60) * 6 * mul);
    const bossBonus = Math.round(r.bossKills * 25 * mul);
    // Startgeschenk: Der erste Lauf reicht immer für eine erste Verbesserung
    const cheapest = Math.min(...SHOP.map(it => shopPrice(it, save)));
    const gift = !save.giftGiven ? Math.max(0, cheapest - save.gold - r.gold - timeBonus - bossBonus) : 0;
    save.giftGiven = true;
    const total = r.gold + timeBonus + bossBonus + gift;
    save.gold += total;
    save.stats.goldEarned += total;
    save.stats.playTime += r.t;
    save.stats.bestTime = Math.max(save.stats.bestTime, r.t);
    save.stats.bestLevel = Math.max(save.stats.bestLevel, r.level);
    save.stats.bestKills = Math.max(save.stats.bestKills, r.kills);
    this.checkAchievements();
    Store.save();
    this.state = 'over';
    Hooks.gameOver({ won: r.won, collected: r.gold, timeBonus, bossBonus, gift, heatMul: mul, total });
  },
};
