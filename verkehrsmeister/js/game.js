'use strict';
// ---------------------------------------------------------------------------
// Spielzustand: Zeit, Geld, Zufriedenheit, Ziele, Bauaktionen, Speichern
// ---------------------------------------------------------------------------

class FX {
  constructor() { this.parts = []; this.texts = []; }
  add(p) { if (this.parts.length < 600) this.parts.push(p); }
  puff(x, y, color, size = 1) {
    for (let k = 0; k < 8 * size; k++) {
      const a = Math.random() * Math.PI * 2, s = 0.2 + Math.random() * 0.5;
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.7 + Math.random() * 0.5, r: 0.08 + Math.random() * 0.08 * size, color, kind: 'smoke' });
    }
  }
  build(x, y) {
    for (let k = 0; k < 14; k++) {
      const a = Math.random() * Math.PI * 2, s = 0.4 + Math.random() * 0.6;
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.6 + Math.random() * 0.4, r: 0.07 + Math.random() * 0.06, color: '#d6cbb3', kind: 'smoke' });
    }
  }
  crash(x, y) {
    for (let k = 0; k < 18; k++) {
      const a = Math.random() * Math.PI * 2, s = 0.8 + Math.random() * 1.6;
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.35 + Math.random() * 0.4, r: 0.03, color: k % 2 ? '#fbbf24' : '#f97316', kind: 'spark' });
    }
    this.puff(x, y, '#64748b', 1.5);
  }
  text(x, y, str, color) { if (this.texts.length < 60) this.texts.push({ x, y, str, color: color || '#16a34a', life: 0, max: 1.6 }); }
  update(dt) {
    for (const p of this.parts) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; if (p.kind === 'smoke') p.r += dt * 0.12; }
    this.parts = this.parts.filter(p => p.life < p.max);
    for (const t of this.texts) { t.life += dt; t.y -= dt * 0.5; }
    this.texts = this.texts.filter(t => t.life < t.max);
  }
}

const ACHIEVEMENTS = [
  { id: 'road', name: 'Spatenstich', desc: 'Baue deine erste Straße.' },
  { id: 'trips100', name: 'Pendlerprofi', desc: '100 erfolgreiche Fahrten in einem Spiel.' },
  { id: 'trips1000', name: 'Verkehrsader', desc: '1.000 erfolgreiche Fahrten in einem Spiel.' },
  { id: 'trips5000', name: 'Lebensnerv der Stadt', desc: '5.000 erfolgreiche Fahrten in einem Spiel.' },
  { id: 'light', name: 'Rot – Gelb – Grün', desc: 'Stelle deine erste Ampel auf.' },
  { id: 'greenwave', name: 'Grüne Welle', desc: 'Drei Ampeln mit eingestelltem Versatz.' },
  { id: 'smart', name: 'Mitdenkende Ampel', desc: 'Schalte eine Ampel auf adaptive Steuerung.' },
  { id: 'round5', name: 'Kreiselkönig', desc: 'Fünf Kreisverkehre gleichzeitig.' },
  { id: 'bridge10', name: 'Brückenbauer', desc: 'Zehn Brückenfelder gebaut.' },
  { id: 'tunnel', name: 'Durch den Berg', desc: 'Baue einen Tunnel.' },
  { id: 'bus', name: 'Bitte einsteigen', desc: 'Richte eine Buslinie ein.' },
  { id: 'pax500', name: 'ÖPNV-Held', desc: '500 Busfahrgäste in einem Spiel.' },
  { id: 'happy90', name: 'Stadt der Glücklichen', desc: 'Zufriedenheit über 90 % nach mindestens 300 Fahrten.' },
  { id: 'rescue10', name: 'Freie Rettungsgasse', desc: '10 erfolgreiche Rettungseinsätze.' },
  { id: 'rich', name: 'Volle Stadtkasse', desc: '150.000 € in der Kasse.' },
  { id: 'noacc', name: 'Null Unfälle', desc: 'Ein ganzer Tag ohne Unfall mit mindestens 400 Fahrten.' },
  { id: 'pop500', name: 'Großstadt', desc: '500 Einwohner in einer Stadt.' },
  { id: 'campaign', name: 'Verkehrsmeister', desc: 'Schließe alle Kampagnen-Level ab.' },
  { id: 'stars', name: 'Musterplaner', desc: 'Hole drei Sterne in einem Kampagnen-Level.' },
];

class Game {
  constructor(cfg) {
    const level = cfg.level;
    this.level = level;
    this.mode = level.demo ? 'demo' : level.sandbox ? 'sandbox' : level.endless ? 'endless' : 'campaign';
    this.seed = cfg.seed !== undefined ? cfg.seed : level.seed;
    const save = cfg.save;
    this.world = save ? World.deserialize(save.world) : generateWorld(level, this.seed);
    this.time = 0;
    this.startMin = (level.startHour !== undefined ? level.startHour : 6) * 60;
    this.money = level.money;
    this.tripRating = 72; this.penaltyV = 0; this.satisfaction = 72;
    this.lowSatT = 0; this.lowMoneyT = 0;
    this.speed = 1; this.paused = false; this.over = false; this.won = false;
    this.buildVersion = 0; this.stopVersion = 0;
    this.stats = { trips: 0, busPax: 0, accidents: 0, rescues: 0, gaveUp: 0, income: 0, spent: 0, built: 0, durSum: 0, ratingSum: 0, failed: 0 };
    this.statsDay = this.freshDay();
    this.statsHour = { trips: 0, ratingSum: 0, durSum: 0, failed: 0 };
    this.history = [];
    this.days = [];
    this.notes = [];
    this.noteId = 1;
    this.throttle = {};
    this.fx = new FX();
    this.audio = (typeof AUDIO !== 'undefined') ? AUDIO : { play() {} };
    this.traffic = new Traffic(this);
    this.city = new City(this);
    this.undoStack = [];
    this.failWhy = {};
    this.demandRamp = 1;
    this.acc = 0;
    this.onNote = null; this.onEnd = null; this.onAchievement = null;
    this.achieved = new Set(Store.get('vm_ach', []));
    this.counters = { lights: 0, smart: 0 };
    if (save) this.applySave(save);
    else setupLevel(this);
    this.world.computeComponents();
    this.lastHour = this.hourAbs;
    this.lastDay = this.dayIndex;
    this.achT = 0;
  }

  freshDay() { return { trips: 0, ratingSum: 0, busPax: 0, accidents: 0, income: 0, failed: 0 }; }

  get minutes() { return this.startMin + this.time * CFG.minPerSec; }
  get hour() { return Math.floor(this.minutes / 60) % 24; }
  get hourAbs() { return Math.floor(this.minutes / 60); }
  get dayIndex() { return Math.floor(this.minutes / 1440); }
  get weekday() { return this.dayIndex % 7; }
  get sandbox() { return this.mode === 'sandbox'; }

  population() { let p = 0; for (const b of this.world.buildings) if (!b.dead) p += b.pop; return p; }
  jobsTotal() { let p = 0; for (const b of this.world.buildings) if (!b.dead) p += b.jobs; return p; }

  // ---- Benachrichtigungen ----------------------------------------------------------
  notify(text, kind = 'info', tile = -1) {
    const n = { id: this.noteId++, text, kind, tile, min: this.minutes };
    this.notes.push(n);
    if (this.notes.length > 60) this.notes.shift();
    if (this.onNote) this.onNote(n);
    return n;
  }
  notifyThrottled(key, text, kind, tile) {
    const t = this.throttle[key] || -1e9;
    if (this.time - t < 40) return;
    this.throttle[key] = this.time;
    this.notify(text, kind, tile);
  }

  // ---- Geld & Zufriedenheit ------------------------------------------------------------
  addMoney(amount, label, x, y) {
    this.money += amount;
    if (amount > 0) { this.stats.income += amount; this.statsDay.income += amount; }
    if (label && x !== undefined) this.fx.text(x, y, (amount >= 0 ? '+' : '') + fmtMoney(amount), amount >= 0 ? '#15803d' : '#b91c1c');
  }
  spend(amount, label) {
    if (this.sandbox) return true;
    if (this.money < amount) {
      this.notifyThrottled('money', 'Nicht genug Geld! Dir fehlen ' + fmtMoney(amount - this.money) + '.', 'danger');
      this.audio.play('error');
      return false;
    }
    this.money -= amount;
    this.stats.spent += amount;
    return true;
  }
  canAfford(amount) { return this.sandbox || this.money >= amount; }

  rateTrip(rating, purpose, building, v, dur) {
    const fail = purpose === 'queue' || purpose === 'gaveup' || purpose === 'noroute' || purpose === 'bus-cancel' || purpose === 'bus-wait';
    const k = fail ? (purpose === 'queue' ? 0.02 : 0.035) : 0.022;
    this.tripRating += (rating - this.tripRating) * k;
    if (fail) { this.stats.failed++; this.statsDay.failed++; this.statsHour.failed++; this.failWhy[purpose] = (this.failWhy[purpose] || 0) + 1; return; }
    this.stats.trips++; this.statsDay.trips++; this.statsHour.trips++;
    this.stats.ratingSum += rating; this.statsDay.ratingSum += rating; this.statsHour.ratingSum += rating;
    if (dur) { this.stats.durSum += dur; this.statsHour.durSum += dur; }
    if (v && !this.sandbox) {
      let inc = (2 + 0.35 * v.dist) * (rating >= 50 ? 1 : 0.6);
      if (purpose === 'through') inc += 2;
      if (v.type === 'truck' || v.type === 'van') inc += 3;
      this.addMoney(Math.round(inc * 10) / 10);
    }
  }

  penalize(points) {
    this.penaltyV = Math.max(-10, this.penaltyV + points);
  }

  upkeep() {
    const c = this.world.countRoads();
    let u = c.road * CFG.upkeep.road + c.hw * CFG.upkeep.highway + c.bridge * CFG.upkeep.bridge + c.tunnel * CFG.upkeep.tunnel + c.stops * CFG.upkeep.stop;
    for (const J of this.world.junctions || []) {
      if (J.type === 'light') u += J.light && J.light.smart ? CFG.upkeep.smart : CFG.upkeep.light;
      else if (J.type === 'roundabout') u += CFG.upkeep.roundabout;
      else if (J.type === 'priority') u += CFG.upkeep.priority;
    }
    let buses = 0;
    for (const l of this.city.lines) buses += l.buses.size;
    u += buses * CFG.upkeep.bus;
    return Math.round(u);
  }

  taxes() {
    const f = 0.4 + this.satisfaction / 100;
    return Math.round((this.population() * 7 + this.jobsTotal() * 5) * f);
  }

  // ---- Simulation ---------------------------------------------------------------------------
  tick(realDt) {
    if (this.paused || this.over) return 0;
    this.acc += Math.min(0.25, realDt) * this.speed;
    let steps = 0;
    const maxSteps = 12;
    const t0 = performance.now();
    while (this.acc >= CFG.dt && steps < maxSteps) {
      this.step(CFG.dt);
      this.acc -= CFG.dt;
      steps++;
      if (this.over) break;
      if (performance.now() - t0 > 28) break;
    }
    if (this.acc > CFG.dt * 6) this.acc = CFG.dt * 6;
    return steps;
  }

  step(dt) {
    this.time += dt;
    this.traffic.step(dt, this.time);
    this.city.update(dt);
    // Zufriedenheit
    if (this.mode !== 'demo') {
      const unc = this.city.unconnectedCount(this.level.grace || 80);
      this.penaltyV += 0.03 * unc * dt;
      this.penaltyV *= Math.exp(-dt / 110);
      this.satisfaction = clamp(this.tripRating - this.penaltyV, 0, 100);
    }
    // Stunden- und Tageswechsel
    const ha = this.hourAbs;
    if (ha !== this.lastHour) { this.lastHour = ha; this.onHour(); }
    const day = this.dayIndex;
    if (day !== this.lastDay) { this.lastDay = day; this.onDay(); }
    if (this.mode === 'endless' && this.level.ramp) this.demandRamp = 1 + Math.min(1.2, this.dayIndex * 0.08);
    // Ende prüfen
    if (this.mode === 'campaign' || this.mode === 'endless') this.checkEnd(dt);
    this.achT += dt;
    if (this.achT > 2) { this.achT = 0; this.checkAchievements(); }
  }

  onHour() {
    const w = this.world;
    const h = this.statsHour;
    this.history.push({
      h: this.hourAbs - 1,
      trips: h.trips, rating: h.trips ? h.ratingSum / h.trips : null, dur: h.trips ? h.durSum / h.trips * CFG.minPerSec : null,
      failed: h.failed, sat: this.satisfaction, money: this.money, veh: this.traffic.vehicles.length,
    });
    if (this.history.length > 24 * 14) this.history.shift();
    this.statsHour = { trips: 0, ratingSum: 0, durSum: 0, failed: 0 };
    for (let i = 0; i < w.n; i++) {
      if (w.flowCnt[i] || w.flow[i] > 0.01) { w.flow[i] = w.flow[i] * 0.55 + w.flowCnt[i] * 0.45; w.flowCnt[i] = 0; }
    }
    for (const J of w.junctions || []) { J.flowHr = J.flowHr * 0.5 + J.passCnt * 0.5; J.passCnt = 0; }
    if (this.mode !== 'demo' && this.hour % 3 === 0 && this.onAutosave) this.onAutosave();
  }

  onDay() {
    if (this.mode === 'demo') return;
    const tax = this.sandbox ? 0 : this.taxes();
    const up = this.sandbox ? 0 : this.upkeep();
    this.money += tax - up;
    this.stats.income += tax;
    const d = this.statsDay;
    const rep = { day: this.dayIndex - 1, trips: d.trips, rating: d.trips ? d.ratingSum / d.trips : 0, tax, upkeep: up, income: d.income, accidents: d.accidents, busPax: d.busPax, failed: d.failed, sat: this.satisfaction, pop: this.population() };
    this.days.push(rep);
    if (d.accidents === 0 && d.trips >= 400) this.unlock('noacc');
    this.statsDay = this.freshDay();
    for (const l of this.city.lines) l.paxDay = 0;
    if (this.onDayReport) this.onDayReport(rep);
    if (!this.sandbox) this.notify('Tagesabschluss ' + WEEKDAYS[rep.day % 7] + ': ' + fmtInt(rep.trips) + ' Fahrten, Steuern +' + fmtMoney(tax) + ', Unterhalt −' + fmtMoney(up) + '.', 'money');
  }

  goalStatus() {
    const res = [];
    for (const g of this.level.goals || []) {
      let cur = 0, label = '', done = false, fmt = fmtInt;
      if (g.type === 'trips') { cur = this.stats.trips; label = 'Erfolgreiche Fahrten'; done = cur >= g.n; }
      else if (g.type === 'sat') { cur = this.satisfaction; label = 'Zufriedenheit mind. ' + g.n + ' %'; done = cur >= g.n; fmt = x => Math.round(x) + ' %'; }
      else if (g.type === 'days') { cur = this.dayIndex; label = g.n + ' Tage durchhalten'; done = cur >= g.n; fmt = x => x + ''; }
      else if (g.type === 'money') { cur = this.money; label = 'Stadtkasse'; done = cur >= g.n; fmt = fmtMoney; }
      else if (g.type === 'bus') { cur = this.stats.busPax; label = 'Busfahrgäste'; done = cur >= g.n; }
      else if (g.type === 'pop') { cur = this.population(); label = 'Einwohner'; done = cur >= g.n; }
      res.push({ type: g.type, label, cur, target: g.n, done, fmt, live: g.type === 'sat' });
    }
    return res;
  }

  checkEnd(dt) {
    if (this.over) return;
    const fail = this.level.fail || 18;
    if (this.satisfaction < fail && this.stats.trips + this.stats.failed > 25) this.lowSatT += dt; else this.lowSatT = Math.max(0, this.lowSatT - dt * 2);
    if (this.money < -15000) this.lowMoneyT += dt; else this.lowMoneyT = 0;
    if (this.lowSatT > 45) { this.end(false, 'sat'); return; }
    if (this.lowMoneyT > 30) { this.end(false, 'money'); return; }
    if (this.mode === 'campaign') {
      const gs = this.goalStatus();
      if (gs.length && gs.every(g => g.done)) this.end(true);
    }
  }

  end(won, reason) {
    this.over = true; this.won = won;
    let stars = 0;
    if (won) {
      stars = 1 + (this.satisfaction >= 70 ? 1 : 0) + (this.satisfaction >= 85 ? 1 : 0);
      const prog = Store.get('vm_progress', {});
      prog[this.level.id] = Math.max(prog[this.level.id] || 0, stars);
      Store.set('vm_progress', prog);
      if (stars === 3) this.unlock('stars');
      if (LEVELS.every(l => prog[l.id])) this.unlock('campaign');
      this.audio.play('win');
    } else this.audio.play('lose');
    this.endInfo = { won, reason, stars };
    if (this.onEnd) this.onEnd(this.endInfo);
  }

  // ---- Erfolge ----------------------------------------------------------------------------
  unlock(id) {
    if (this.mode === 'demo' || this.achieved.has(id)) return;
    this.achieved.add(id);
    Store.set('vm_ach', [...this.achieved]);
    const a = ACHIEVEMENTS.find(x => x.id === id);
    if (a && this.onAchievement) this.onAchievement(a);
    this.audio.play('achievement');
  }

  checkAchievements() {
    if (this.mode === 'demo') return;
    const s = this.stats;
    if (s.trips >= 100) this.unlock('trips100');
    if (s.trips >= 1000) this.unlock('trips1000');
    if (s.trips >= 5000) this.unlock('trips5000');
    if (s.busPax >= 500) this.unlock('pax500');
    if (s.rescues >= 10) this.unlock('rescue10');
    if (this.money >= 150000 && !this.sandbox) this.unlock('rich');
    if (this.satisfaction >= 90 && s.trips >= 300) this.unlock('happy90');
    let lights = 0, wave = 0, smart = 0, round = 0;
    for (const J of this.world.junctions || []) {
      if (J.type === 'light') { lights++; if (J.light && J.light.offset) wave++; if (J.light && J.light.smart) smart++; }
      if (J.type === 'roundabout') round++;
    }
    if (lights) this.unlock('light');
    if (wave >= 3) this.unlock('greenwave');
    if (smart) this.unlock('smart');
    if (round >= 5) this.unlock('round5');
    const c = this.world.countRoads();
    if (c.road + c.hw > 0 && this.stats.built > 0) this.unlock('road');
    if (c.bridge >= 10) this.unlock('bridge10');
    if (c.tunnel >= 1) this.unlock('tunnel');
    if (this.city.lines.length) this.unlock('bus');
    if (this.population() >= 500) this.unlock('pop500');
  }

  // ---- Bauaktionen -------------------------------------------------------------------------
  snapshot(tiles) {
    const w = this.world, set = new Set();
    for (const t of tiles) { set.add(t); for (let d = 0; d < 4; d++) { const j = w.nb(t, d); if (j >= 0) set.add(j); } }
    const snap = [];
    for (const i of set) snap.push({ i, road: w.road[i], out: w.out[i], flags: w.flags[i], terrain: w.terrain[i], jc: w.jc[i] ? w.jc[i].serialize() : null, stop: this.city.stops.get(i) ? this.city.stops.get(i).name : null });
    return snap;
  }

  restore(snap) {
    const w = this.world;
    const tiles = snap.map(s => s.i);
    for (const s of snap) {
      if (!s.road && w.road[s.i]) w.removeRoad(s.i);
      w.road[s.i] = s.road; w.out[s.i] = s.out; w.flags[s.i] = s.flags & ~F_STOP; w.terrain[s.i] = s.terrain;
      w.markDirty(s.i);
    }
    for (const s of snap) w.refreshTile(s.i);
    for (const s of snap) {
      if (s.jc && w.jc[s.i]) w.jc[s.i].deserialize(s.jc);
      else if (s.jc && s.jc.type === 'roundabout' && w.road[s.i]) { w.jc[s.i] = new Junction(w, s.i); w.jc[s.i].deserialize(s.jc); w.isJ[s.i] = 1; }
      else if (!s.jc && w.jc[s.i] && w.jc[s.i].type !== 'auto') w.jc[s.i].setType('auto');
      if (s.stop && !this.city.stops.has(s.i) && w.road[s.i]) this.city.addStop(s.i, s.stop);
      if (!s.stop && this.city.stops.has(s.i)) this.city.removeStop(s.i);
    }
    for (const s of snap) w.refreshTile(s.i);
    w.bump();
    this.onWorldEdit(tiles);
  }

  pushUndo(label, snap, cost) {
    this.undoStack.push({ label, snap, cost, t: this.time });
    if (this.undoStack.length > 25) this.undoStack.shift();
  }

  undo() {
    const u = this.undoStack.pop();
    if (!u) { this.notify('Nichts zum Rückgängigmachen.', 'info'); return false; }
    this.restore(u.snap);
    if (!this.sandbox) { this.money += u.cost; this.stats.spent -= Math.max(0, u.cost); }
    this.notify('Rückgängig: ' + u.label + (u.cost && !this.sandbox ? ' (' + (u.cost > 0 ? '+' : '') + fmtMoney(u.cost) + ')' : ''), 'info');
    this.audio.play('undo');
    return true;
  }

  onWorldEdit(tiles, silent) {
    this.world.bump();
    this.traffic.onTilesChanged(tiles);
    if (this.onEdit) this.onEdit(tiles);
  }

  // Werkzeugklasse für Straßenbau
  roadPlan(path, tool) {
    const w = this.world;
    let cost = 0, valid = 0, reason = '';
    const kinds = [];
    for (let k = 0; k < path.length; k++) {
      const i = path[k];
      const cls = tool === 'highway' ? 2 : (tool === 'oneway' ? (w.road[i] || 1) : 1);
      const info = w.roadBuildInfo(i, cls);
      if (!info.ok) { reason = info.reason; break; }
      if (tool === 'road' && w.road[i] === 2) info.cost = 0; // Rückbau kostenlos
      cost += info.cost;
      kinds.push(info.kind);
      valid++;
    }
    // Verbindungen ohne Kosten; Einbahn-Umwandlung kostet nichts
    return { cost: Math.round(cost), valid, reason, kinds };
  }

  buildRoad(path, tool) {
    const w = this.world;
    if (!path.length) return false;
    const plan = this.roadPlan(path, tool);
    const tiles = path.slice(0, plan.valid);
    if (!tiles.length) { if (plan.reason) this.notify(plan.reason + '.', 'warn'); this.audio.play('error'); return false; }
    // Prüfen, ob überhaupt etwas passiert
    let changes = plan.cost > 0;
    if (!changes) {
      for (let k = 0; k < tiles.length; k++) {
        if (!w.road[tiles[k]]) { changes = true; break; }
        if (tool === 'road' && w.road[tiles[k]] === 2) { changes = true; break; }
        if (k > 0) {
          const d = dirBetween(w, tiles[k - 1], tiles[k]);
          if (d < 0) continue;
          const a = tiles[k - 1], b = tiles[k];
          const ab = (w.out[a] >> d) & 1, ba = (w.out[b] >> OPP[d]) & 1;
          if (tool === 'oneway' ? (!ab || ba) : (!ab || !ba)) { changes = true; break; }
        }
      }
    }
    if (!changes) return false;
    if (!this.spend(plan.cost, 'Straßenbau')) return false;
    const snap = this.snapshot(tiles);
    for (const i of tiles) {
      if (!w.road[i]) w.placeRoad(i, tool === 'highway' ? 2 : 1);
      else if (tool === 'highway') w.road[i] = 2;
      else if (tool === 'road') w.road[i] = 1;
      w.markDirty(i);
    }
    for (let k = 1; k < tiles.length; k++) {
      const d = dirBetween(w, tiles[k - 1], tiles[k]);
      if (d >= 0) w.connect(tiles[k - 1], d, tool === 'oneway' ? 'one' : 'two');
    }
    for (const i of tiles) w.refresh(i);
    // Haltestellen auf jetzt ungeeigneten Kacheln entfernen
    for (const i of tiles) if (this.city.stops.has(i) && (w.isJ[i] || w.road[i] === 2)) this.city.removeStop(i);
    this.stats.built += tiles.length;
    this.pushUndo(tool === 'highway' ? 'Schnellstraße' : tool === 'oneway' ? 'Einbahnstraße' : 'Straße', snap, plan.cost);
    this.onWorldEdit(tiles);
    const last = tiles[tiles.length - 1];
    this.fx.build(w.tx(last) + 0.5, w.ty(last) + 0.5);
    this.audio.play('build');
    if (plan.cost > 0 && !this.sandbox) this.fx.text(w.tx(last) + 0.5, w.ty(last), '−' + fmtMoney(plan.cost), '#b91c1c');
    if (plan.valid < path.length && plan.reason) this.notify(plan.reason + ' – Bau dort gestoppt.', 'warn');
    return true;
  }

  bulldoze(path) {
    const w = this.world;
    const tiles = [];
    let refund = 0;
    for (const i of path) {
      if (w.road[i]) {
        tiles.push(i);
        refund += w.roadValue(i) * CFG.refund;
        const J = w.jc[i];
        if (J && J.type !== 'auto') refund += this.controlCost(J.type) * CFG.refund;
        if (w.flags[i] & F_STOP) refund += CFG.cost.stop * CFG.refund;
      } else if (this.sandbox && w.bld[i] >= 0) {
        const b = w.buildings[w.bld[i]];
        if (b && !b.dead) { this.city.fires = this.city.fires.filter(f => f.b !== b); w.removeBuilding(b); this.buildVersion++; tiles.push(b.acc); }
      }
    }
    if (!tiles.length) return false;
    const snap = this.snapshot(tiles.filter(i => w.road[i]));
    for (const i of tiles) {
      if (!w.road[i]) continue;
      if (this.city.stops.has(i)) this.city.removeStop(i);
      for (const a of this.city.accidents.slice()) if (a.tile === i) this.city.clearAccident(a);
      w.removeRoad(i);
    }
    for (const i of tiles) w.refresh(i);
    refund = Math.round(refund);
    if (!this.sandbox) this.addMoney(refund, 'Abriss', w.tx(tiles[0]) + 0.5, w.ty(tiles[0]));
    this.pushUndo('Abriss', snap, -refund);
    this.onWorldEdit(tiles);
    this.fx.puff(w.tx(tiles[0]) + 0.5, w.ty(tiles[0]) + 0.5, '#a8a29e');
    this.audio.play('demolish');
    return true;
  }

  controlCost(type) {
    if (type === 'light') return CFG.cost.light;
    if (type === 'priority') return CFG.cost.priority;
    if (type === 'roundabout') return CFG.cost.roundabout;
    return 0;
  }

  setControl(i, type) {
    const w = this.world;
    const J = w.jc[i];
    if (!J) { this.notify('Hier ist keine Kreuzung. Steuerungen brauchen mindestens drei Straßenarme.', 'warn'); this.audio.play('error'); return false; }
    if (J.type === type) return false;
    if (type === 'roundabout') {
      if (w.drive[i]) { this.notify('Ein Kreisverkehr geht nicht direkt vor einer Einfahrt.', 'warn'); this.audio.play('error'); return false; }
      if (w.road[i] === 2) { this.notify('Kreisverkehre gehen nicht auf Schnellstraßen.', 'warn'); this.audio.play('error'); return false; }
    }
    const cost = this.controlCost(type);
    if (!this.spend(cost, 'Kreuzung')) return false;
    const snap = this.snapshot([i]);
    const refund = this.controlCost(J.type) * CFG.refund;
    if (refund && !this.sandbox) this.money += refund;
    J.setType(type);
    this.pushUndo(JTYPE_NAME[type], snap, cost - refund);
    w.markDirty(i);
    this.onWorldEdit([i]);
    this.fx.build(w.tx(i) + 0.5, w.ty(i) + 0.5);
    this.audio.play('build');
    return true;
  }

  removeControl(i) {
    const J = this.world.jc[i];
    if (!J || J.type === 'auto') return false;
    const snap = this.snapshot([i]);
    const refund = Math.round(this.controlCost(J.type) * CFG.refund);
    if (!this.sandbox) this.addMoney(refund, 'Rückbau', this.world.tx(i) + 0.5, this.world.ty(i));
    J.setType('auto');
    this.pushUndo('Rückbau', snap, -refund);
    this.world.markDirty(i);
    this.onWorldEdit([i]);
    this.audio.play('demolish');
    return true;
  }

  placeStop(i) {
    const w = this.world;
    if (!w.road[i]) return false;
    if (this.city.stops.has(i)) return false;
    if (w.isJ[i]) { this.notify('Haltestellen gehören auf gerade Straßenstücke, nicht auf Kreuzungen.', 'warn'); this.audio.play('error'); return false; }
    if (w.road[i] === 2) { this.notify('Auf Schnellstraßen sind keine Haltestellen erlaubt.', 'warn'); this.audio.play('error'); return false; }
    if (!this.spend(CFG.cost.stop, 'Haltestelle')) return false;
    this.city.addStop(i);
    this.onWorldEdit([i]);
    this.audio.play('build');
    return true;
  }

  placeBuildingManual(type, x, y, dir) {
    const w = this.world;
    if (!w.footprintOk(type, x, y, dir, { allowForest: true, allowEdge: type === 'gate' })) return null;
    const b = w.addBuilding(type, x, y, dir, Math.floor(Math.random() * 1e9));
    if (type === 'gate') b.name = GATE_NAMES[b.id % GATE_NAMES.length];
    b.born = this.time;
    this.buildVersion++;
    this.onWorldEdit([b.acc]);
    this.fx.build(b.x + b.w / 2, b.y + b.h / 2);
    this.audio.play('build');
    return b;
  }

  // ---- Speichern & Laden -------------------------------------------------------------------
  serialize() {
    return {
      v: 1, levelId: this.level.id, level: (this.mode === 'endless' || this.mode === 'sandbox') ? this.level : null,
      seed: this.seed, time: this.time, startMin: this.startMin, money: this.money,
      tripRating: this.tripRating, penaltyV: this.penaltyV, stats: this.stats, statsDay: this.statsDay,
      history: this.history.slice(-24 * 7), days: this.days, demandRamp: this.demandRamp,
      world: this.world.serialize(), city: this.city.serialize(), savedAt: Date.now(),
    };
  }

  applySave(o) {
    this.time = o.time; this.startMin = o.startMin; this.money = o.money;
    this.tripRating = o.tripRating; this.penaltyV = o.penaltyV;
    Object.assign(this.stats, o.stats || {});
    Object.assign(this.statsDay, o.statsDay || {});
    this.history = o.history || [];
    this.days = o.days || [];
    this.demandRamp = o.demandRamp || 1;
    this.satisfaction = clamp(this.tripRating - this.penaltyV, 0, 100);
    this.city.deserialize(o.city || {});
    this.buildVersion++;
  }

  static fromSave(o) {
    let level = o.level || LEVELS.find(l => l.id === o.levelId);
    if (!level) return null;
    return new Game({ level, seed: o.seed, save: o });
  }
}

function dirBetween(w, a, b) {
  for (let d = 0; d < 4; d++) if (w.nb(a, d) === b) return d;
  return -1;
}
