'use strict';
// ---------------------------------------------------------------------------
// Spielzustand: Zeit (Tag/Woche), Inventar, Bauen/Abreißen, Werkzeuge, Karten,
// Undo, Niederlage und Wertung
// ---------------------------------------------------------------------------

class Game {
  constructor(def, opts = {}) {
    this.def = def;
    this.opts = opts;
    this.seed = opts.seed || def.seed;
    this.world = generateCity(def, this.seed);
    this.mods = {};
    this.world.mods = this.mods;
    if (opts.daily) this.mods.daily = opts.daily;
    if (this.mods.daily === 'rush') this.mods.rush = true;
    this.world.emit = (t, d) => this.onEmit(t, d);
    this.inv = Object.assign({}, CFG.start, def.start || {});
    if (this.mods.daily === 'rvl') { this.inv.lights = 0; this.inv.rounds = 0; }
    this.maxVehicles = opts.mobile ? 300 : CFG.maxVehicles;
    this.time = 0;
    this.phase = 'day';
    this.dayT = 0; this.nightT = 0;
    this.day = 1; this.week = 1; this.dayIndex = 1;
    this.hour = 6;
    this.score = 0; this.weekScore = 0;
    this.stopT = 0;
    this.fx = [];
    this.undoStack = [];
    this.over = false;
    this.weekLog = [];
    this.cardsTaken = {};
    this.traffic = new Traffic(this);
    this.city = new City(this);
    this.events = new Events(this);
    if (!opts.empty) this.city.setup();
    this.events.onNewDay();
    this.stats = { built: 0, maxCombo: 0, saved: 0 };
  }

  get bounds() { return this.world.bounds; }

  addScore(n) {
    this.score += n; this.weekScore += n;
  }

  // ---- Zeit ---------------------------------------------------------------------------
  step(dt) {
    if (this.over || this.phase === 'week') return;
    this.time += dt;
    if (this.stopT > 0) this.stopT -= dt;
    if (this.phase === 'day') {
      this.dayT += dt;
      this.hour = 6 + 16 * this.dayT / CFG.dayLen;
      if (this.dayT >= CFG.dayLen) { this.phase = 'night'; this.nightT = 0; }
    } else if (this.phase === 'night') {
      this.nightT += dt;
      this.hour = 22 + 8 * this.nightT / CFG.nightLen;
      if (this.nightT >= CFG.nightLen) {
        this.hour = 6;
        if (this.day >= CFG.workDays) { this.weekEnd(); return; }
        this.day++; this.dayIndex++; this.dayT = 0; this.phase = 'day';
        this.events.onNewDay();
        this.fx.push({ t: 'newday' });
      }
    }
    this.events.step(dt);
    this.city.step(dt);
    if (this.over) return;
    this.traffic.step(dt);
  }

  // ---- Woche ------------------------------------------------------------------------
  weekEnd() {
    this.phase = 'week';
    let worst = null;
    for (const J of this.world.junctions) if (!worst || (J.weekWait || 0) > (worst.weekWait || 0)) worst = J;
    const summary = {
      week: this.week, trips: this.weekScore, total: this.score,
      worst: worst && worst.weekWait > 20 ? { i: worst.i, wait: worst.weekWait, cause: worst.cause || (worst.type === 'auto' ? 'rvl' : worst.type === 'light' ? 'light' : worst.type === 'roundabout' ? 'round' : 'main') } : null,
      houses: this.city.houses.length, dests: this.city.dests.length,
    };
    this.weekLog.push(summary);
    for (const J of this.world.junctions) J.weekWait = 0;
    summary.cards = this.mods.skipCard ? [] : this.drawCards(3);
    this.mods.skipCard = false;
    this.pendingWeek = summary;
    this.fx.push({ t: 'weekend', summary });
  }

  drawCards(n) {
    const rank = this.opts.rank || 0;
    const w = this.world;
    let hasRock = false, hasWater = false;
    for (let i = 0; i < w.n; i++) { if (w.terrain[i] === T_ROCK) hasRock = true; if (w.terrain[i] === T_WATER) hasWater = true; }
    const pool = CARDS.filter(c => {
      if (c.pact && rank < 1) return false;
      if (c.once && this.cardsTaken[c.id]) return false;
      if (this.mods.daily === 'rvl' && (c.id === 'lights' || c.id === 'round' || c.id === 'fest')) return false;
      if (c.id === 'tunnel' && !hasRock) return false;
      if (c.id === 'bridges' && !hasWater) return false;
      if (c.id === 'highway' && this.week < 2) return false;
      if (c.id === 'police' && this.mods.policeMax) return false;
      return true;
    });
    const weight = c => c.id === 'roads' ? 3 : c.id === 'lights' || c.id === 'round' ? 2.2 : c.id === 'highway' ? 1.6 : c.pact ? 0.7 : 1;
    const out = [];
    const rng = new RNG(this.seed * 7 + this.week * 101);
    while (out.length < n && pool.length) {
      const c = rng.weighted(pool, weight);
      out.push(c); pool.splice(pool.indexOf(c), 1);
    }
    return out;
  }

  // Karte wählen (target = Ziel-Gebäude bei Karten mit Ziel)
  chooseCard(card, target) {
    if (card) {
      if (card.target && !target) return false;
      card.apply(this, target);
      this.cardsTaken[card.id] = (this.cardsTaken[card.id] || 0) + 1;
      if (card.id === 'fest') this.mods.pactWeek = this.week + 1;
      this.fx.push({ t: 'card', card });
    }
    this.nextWeek();
    return true;
  }

  nextWeek() {
    this.week++; this.day = 1; this.dayIndex++; this.dayT = 0; this.phase = 'day';
    this.weekScore = 0;
    this.inv.roads += this.mods.daily === 'sparsam' ? 10 : CFG.weekRoads;
    this.inv.police = Math.min(this.mods.policeMax || CFG.policeMax, this.inv.police + 1);
    // Ortsgrenze wächst
    const b = this.world.bounds, W = this.world.w, H = this.world.h;
    const nb = { x0: Math.max(0, b.x0 - 2), y0: Math.max(0, b.y0 - 2), x1: Math.min(W, b.x1 + 2), y1: Math.min(H, b.y1 + 2) };
    const grew = nb.x0 !== b.x0 || nb.x1 !== b.x1 || nb.y0 !== b.y0 || nb.y1 !== b.y1;
    this.world.bounds = nb;
    this.pendingWeek = null;
    this.undoStack.length = 0;
    this.events.onNewDay();
    this.fx.push({ t: 'newweek', grew });
  }

  // ---- Niederlage ------------------------------------------------------------------
  gameOver(dest) {
    if (this.over) return;
    this.over = true;
    this.lostAt = dest;
    const w = this.world;
    const top = [...w.junctions].filter(J => (J.totalWait || 0) > 15).sort((a, b) => b.totalWait - a.totalWait).slice(0, 3)
      .map(J => ({ i: J.i, x: w.tx(J.i), y: w.ty(J.i), wait: J.totalWait, cause: J.cause || (J.type === 'auto' ? 'rvl' : J.type === 'light' ? 'light' : J.type === 'roundabout' ? 'round' : 'main') }));
    this.report = {
      city: this.def, score: this.score, week: this.week, day: this.day, dest, cause: dest.cause || 'nocar', top,
      houses: this.city.houses.length, dests: this.city.dests.length, stats: this.stats,
    };
    this.fx.push({ t: 'gameover', report: this.report });
  }

  medal() {
    const m = this.def.medals;
    let k = -1;
    for (let i = 0; i < m.length; i++) if (this.score >= m[i]) k = i;
    return k;
  }

  // ---- Undo -------------------------------------------------------------------------
  pushUndo() {
    this.undoStack.push({ world: this.world.snapshot(), inv: Object.assign({}, this.inv) });
    if (this.undoStack.length > 10) this.undoStack.shift();
  }

  undo() {
    const s = this.undoStack.pop();
    if (!s) return false;
    const changed = this.world.restore(s.world);
    this.inv = s.inv;
    this.traffic.onTilesChanged(changed);
    this.fx.push({ t: 'rebuild', all: true });
    this.fx.push({ t: 'sfx', name: 'undo' });
    return true;
  }

  onEmit(t, d) {
    if (t === 'refund' && !this._restoring) {
      if (d.type === 'light') this.inv.lights++;
      if (d.type === 'roundabout') this.inv.rounds++;
    } else if (t === 'valve') this.fx.push({ t: 'valve', i: d.i });
  }

  // ---- Bauen --------------------------------------------------------------------------
  // Liefert eine Vorschau: je Kachel {i, kind, ok}, plus Kosten, ob es reicht, und ob es eine Wisch-Vorfahrt ist
  planPath(tiles) {
    const w = this.world;
    const res = { items: [], roads: 0, bridges: 0, tunnels: 0, ok: true, reason: '', swipe: null, buildable: 0 };
    if (!tiles.length) return res;
    // Wisch über bestehende Straßen durch eine Kreuzung → Vorfahrt
    if (tiles.length >= 3 && tiles.every(i => w.road[i])) {
      let linked = true;
      for (let k = 0; k + 1 < tiles.length; k++) {
        const d = this.dirBetween(tiles[k], tiles[k + 1]);
        if (d < 0 || !((w.link[tiles[k]] >> d) & 1) || w.nb(tiles[k], d) !== tiles[k + 1]) { linked = false; break; }
      }
      if (linked) {
        const js = [];
        for (let k = 1; k + 1 < tiles.length; k++) if (w.isJ[tiles[k]]) js.push(k);
        if (js.length) {
          res.swipe = js.map(k => ({ i: tiles[k], a: this.dirBetween(tiles[k], tiles[k - 1]), b: this.dirBetween(tiles[k], tiles[k + 1]) }));
          for (const i of tiles) res.items.push({ i, kind: 'swipe', ok: true });
          return res;
        }
      }
    }
    let inv = { roads: this.inv.roads, bridges: this.inv.bridges, tunnels: this.inv.tunnels };
    let k = 0;
    const n = tiles.length;
    while (k < n) {
      const i = tiles[k];
      const ri = w.roadInfo(i);
      if (!ri.ok) { res.ok = false; res.reason = ri.reason; for (let q = k; q < n; q++) res.items.push({ i: tiles[q], kind: 'bad', ok: false }); break; }
      // Verbindung zum Vorgänger prüfen
      if (k > 0) {
        const p = tiles[k - 1], d = this.dirBetween(p, i);
        if (d < 0 || (w.road[p] && w.nb(p, d) !== i) || (w.road[i] && w.nb(i, OPP[d]) !== p)) { res.ok = false; res.reason = 'Autobahnrampe im Weg'; for (let q = k; q < n; q++) res.items.push({ i: tiles[q], kind: 'bad', ok: false }); break; }
        if (!this.straightOk(tiles, k)) { res.ok = false; res.reason = 'Brücken, Tunnel und Bahnübergänge nur gerade'; for (let q = k; q < n; q++) res.items.push({ i: tiles[q], kind: 'bad', ok: false }); break; }
      }
      if (ri.kind === 'bridge' || ri.kind === 'tunnel') {
        // ganzer Abschnitt
        let e = k;
        while (e + 1 < n && w.roadInfo(tiles[e + 1]).kind === ri.kind) e++;
        const len = e - k + 1;
        const max = ri.kind === 'bridge' ? CFG.bridgeMax : CFG.tunnelMax;
        const key = ri.kind === 'bridge' ? 'bridges' : 'tunnels';
        let straight = true;
        const d0 = k > 0 ? this.dirBetween(tiles[k - 1], tiles[k]) : (e > k ? this.dirBetween(tiles[k], tiles[k + 1]) : -1);
        for (let q = k; q <= e + 1 && q < n; q++) if (q > 0 && this.dirBetween(tiles[q - 1], tiles[q]) !== d0) straight = false;
        if (len > max || !straight || inv[key] <= 0) {
          res.ok = false;
          res.reason = len > max ? (ri.kind === 'bridge' ? 'Brücken höchstens ' + max + ' Felder' : 'Tunnel höchstens ' + max + ' Felder') : !straight ? (ri.kind === 'bridge' ? 'Brücken nur gerade' : 'Tunnel nur gerade') : (ri.kind === 'bridge' ? 'Keine Brücke mehr im Inventar' : 'Kein Tunnel im Inventar');
          for (let q = k; q < n; q++) res.items.push({ i: tiles[q], kind: 'bad', ok: false });
          break;
        }
        inv[key]--; res[key]++;
        for (let q = k; q <= e; q++) res.items.push({ i: tiles[q], kind: ri.kind, ok: true });
        k = e + 1;
        continue;
      }
      if (ri.kind === 'exists') { res.items.push({ i, kind: 'exists', ok: true }); k++; continue; }
      if (inv.roads <= 0) { res.ok = false; res.reason = 'Keine Straßen mehr – neue gibt es zum Wochenende'; res.outOfRoads = true; for (let q = k; q < n; q++) res.items.push({ i: tiles[q], kind: 'bad', ok: false }); break; }
      inv.roads--; res.roads++;
      res.items.push({ i, kind: ri.kind, ok: true });
      k++;
    }
    res.buildable = res.items.filter(it => it.ok).length;
    return res;
  }

  // Brücke/Tunnel/Bahnübergang: an Kachel k darf der Weg nicht abknicken
  straightOk(tiles, k) {
    const w = this.world;
    const i = tiles[k], p = tiles[k - 1];
    const d = this.dirBetween(p, i);
    const strict = j => (w.road[j] ? (w.flags[j] & (F_BRIDGE | F_TUNNEL | F_CROSSING)) : (w.terrain[j] === T_WATER || w.terrain[j] === T_ROCK || w.rail[j]));
    // Knick an p?
    if (k >= 2 && strict(p) && this.dirBetween(tiles[k - 2], p) !== d) return false;
    if (strict(p)) { const lk = w.road[p] ? w.link[p] : 0; const ax = (d & 1) ? 0b1010 : 0b0101; if (lk & ~ax) return false; }
    if (strict(i)) { const lk = w.road[i] ? w.link[i] : 0; const ax = (d & 1) ? 0b1010 : 0b0101; if (lk & ~ax) return false; }
    // Bahn: quer zum Gleis
    const rl = j => w.rail[j];
    const vert = d === 0 || d === 2;
    if (rl(i) && ((rl(i) === 1) === vert)) return false;
    if (rl(p) && ((rl(p) === 1) === vert)) return false;
    return true;
  }

  dirBetween(a, b) {
    const w = this.world;
    const ax = w.tx(a), ay = w.ty(a), bx = w.tx(b), by = w.ty(b);
    for (let d = 0; d < 4; d++) if (ax + DX[d] === bx && ay + DY[d] === by) return d;
    return -1;
  }

  buildPath(tiles) {
    const w = this.world;
    const plan = this.planPath(tiles);
    if (plan.swipe) {
      let n = 0;
      for (const s of plan.swipe) { const J = w.jc[s.i]; if (J && this.mods.daily !== 'rvl' && J.setMain(s.a, s.b)) n++; }
      if (n) {
        this.world.bump();
        this.fx.push({ t: 'rebuild' });
        this.fx.push({ t: 'priority', tiles: plan.swipe.map(s => s.i) });
      }
      return { ok: n > 0, swipe: true };
    }
    const okItems = [];
    for (const it of plan.items) { if (!it.ok) break; okItems.push(it); }
    if (!okItems.length) { if (plan.reason) this.fx.push({ t: 'deny', text: plan.reason, i: tiles[0] }); return { ok: false, reason: plan.reason }; }
    // Nichts Neues? (nur eine einzelne bestehende Kachel)
    const placed = [];
    let newLinks = 0;
    for (let k = 0; k + 1 < okItems.length; k++) {
      const a = okItems[k].i, b = okItems[k + 1].i, d = this.dirBetween(a, b);
      if (!(w.road[a] && w.road[b] && ((w.out[a] >> d) & 1))) newLinks++;
    }
    const newTiles = okItems.filter(it => it.kind !== 'exists').length;
    if (!newTiles && !newLinks) return { ok: false };
    this.pushUndo();
    for (const it of okItems) {
      if (it.kind !== 'exists') { w.placeRoad(it.i); placed.push(it.i); }
    }
    this.inv.roads -= plan.roads; this.inv.bridges -= plan.bridges; this.inv.tunnels -= plan.tunnels;
    // nur so viele Ressourcen abbuchen wie tatsächlich verbaut (plan zählt bis zum ersten Fehler)
    const touched = new Set();
    for (let k = 0; k + 1 < okItems.length; k++) {
      const a = okItems[k].i, b = okItems[k + 1].i, d = this.dirBetween(a, b);
      w.connect(a, d);
      touched.add(a); touched.add(b);
    }
    for (const it of okItems) touched.add(it.i);
    for (const i of touched) w.refresh(i);
    this.traffic.onTilesChanged([...touched]);
    this.stats.built += placed.length;
    this.fx.push({ t: 'built', placed, tiles: okItems.map(it => it.i) });
    if (!plan.ok && plan.reason) this.fx.push({ t: 'deny', text: plan.reason, i: tiles[okItems.length] });
    return { ok: true, placed };
  }

  // Abreißen entlang eines Pfads (Rechtsklick-Ziehen)
  erasePath(tiles) {
    const w = this.world;
    let did = false;
    const touched = new Set();
    const removed = [];
    const pre = () => { if (!did) { this.pushUndo(); did = true; } };
    for (const g of tiles) {
      if (g < 0 || g >= w.n) continue;
      // Autobahn darüber oder Rampe
      const hw = w.hasElev(g) || (w.flags[g] & F_RAMP) ? w.highwayAt(g) : null;
      if (hw) {
        pre();
        for (const m of hw.mid) { touched.add(m + w.n); removed.push(m + w.n); }
        touched.add(hw.a); touched.add(hw.b);
        w.removeHighway(hw);
        this.inv.highways++;
        continue;
      }
      if (!w.road[g]) continue;
      if (w.accOf[g] >= 0) {
        // Einfahrt bleibt, nur Verbindungen lösen
        if (w.link[g]) { pre(); for (let d = 0; d < 4; d++) { const j = w.nb(g, d); if (j >= 0) touched.add(j); w.disconnect(g, d); } touched.add(g); }
        continue;
      }
      pre();
      const f = w.flags[g];
      if (f & (F_BRIDGE | F_TUNNEL)) {
        // ganzen Abschnitt entfernen, ein Bauteil zurück
        const flag = f & F_BRIDGE ? F_BRIDGE : F_TUNNEL;
        const run = [g];
        for (const d of [0, 1, 2, 3]) {
          let j = w.nb(g, d);
          while (j >= 0 && j < w.n && w.road[j] && (w.flags[j] & flag) && ((w.link[w.nb(j, OPP[d])] >> d) & 1)) { run.push(j); j = w.nb(j, d); }
        }
        for (const j of run) { for (let d = 0; d < 4; d++) { const q = w.nb(j, d); if (q >= 0) touched.add(q); } w.removeRoad(j); removed.push(j); touched.add(j); }
        if (flag === F_BRIDGE) this.inv.bridges++; else this.inv.tunnels++;
        continue;
      }
      for (let d = 0; d < 4; d++) { const q = w.nb(g, d); if (q >= 0) touched.add(q); }
      w.removeRoad(g);
      if (w.terrain[g] !== T_WATER) this.inv.roads++;
      removed.push(g); touched.add(g);
    }
    if (!did) return false;
    for (const i of touched) w.refresh(i);
    this.traffic.onTilesChanged([...touched]);
    this.fx.push({ t: 'erased', tiles: removed });
    return true;
  }

  // ---- Werkzeuge auf Kreuzungen --------------------------------------------------------
  junctionAt(g) { const J = this.world.jc[g]; return J || null; }

  useTool(tool, g) {
    const w = this.world;
    const J = this.junctionAt(g);
    const deny = text => { this.fx.push({ t: 'deny', text, i: g }); return false; };
    if (tool === 'light') {
      if (!J) return deny('Ampeln nur auf Kreuzungen (3 oder 4 Arme)');
      if (J.type === 'light') { this.pushUndo(); J.setType('auto'); this.inv.lights++; this.fx.push({ t: 'device', i: g, kind: 'remove' }); return true; }
      if (this.inv.lights <= 0) return deny('Keine Ampel im Inventar');
      this.pushUndo();
      if (J.type === 'roundabout') { this.inv.rounds++; }
      J.setType('light'); this.inv.lights--;
      w.bump();
      this.fx.push({ t: 'device', i: g, kind: 'light' });
      return true;
    }
    if (tool === 'round') {
      if (!J) return deny('Kreisel nur auf Kreuzungen (3 oder 4 Arme)');
      if (J.type === 'roundabout') { this.pushUndo(); J.setType('auto'); this.inv.rounds++; this.traffic.onTilesChanged([g]); this.fx.push({ t: 'device', i: g, kind: 'remove' }); return true; }
      if (w.accOf[g] >= 0) return deny('Nicht direkt vor einer Einfahrt');
      if (w.up[g]) return deny('Nicht auf einer Autobahnrampe');
      if (this.inv.rounds <= 0) return deny('Kein Kreisel im Inventar');
      this.pushUndo();
      if (J.type === 'light') this.inv.lights++;
      J.setType('roundabout'); this.inv.rounds--;
      w.bump();
      this.traffic.onTilesChanged([g]);
      this.fx.push({ t: 'device', i: g, kind: 'round' });
      return true;
    }
    if (tool === 'police') {
      if (!J) return deny('Die Polizei regelt nur Kreuzungen');
      if (J.police > 0) return deny('Hier steht schon jemand');
      if (this.inv.police <= 0) return deny('Keine Polizei mehr verfügbar');
      this.inv.police--;
      J.police = CFG.policeTime;
      this.fx.push({ t: 'police', i: g });
      return true;
    }
    return false;
  }

  buildHighway(tiles, d) {
    const w = this.world;
    if (this.inv.highways <= 0) { this.fx.push({ t: 'deny', text: 'Keine Autobahn im Inventar (Wochenkarte)', i: tiles[0] }); return false; }
    const chk = w.highwayCheck(tiles, d);
    if (!chk.ok) { this.fx.push({ t: 'deny', text: chk.reason, i: tiles[chk.bad || 0] }); return false; }
    this.pushUndo();
    const hw = w.addHighway(tiles, d);
    this.inv.highways--;
    const touched = tiles.concat(hw.mid.map(g => g + w.n));
    this.traffic.onTilesChanged(touched);
    this.fx.push({ t: 'built', placed: touched, tiles: touched, highway: true });
    return true;
  }

  useStop() {
    if (this.inv.stops <= 0 || this.stopT > 0) return false;
    this.inv.stops--;
    this.stopT = 8;
    this.fx.push({ t: 'toast', text: 'Feierabend-Stopp: 8 Sekunden keine neuen Aufträge.', icon: 'stop' });
    return true;
  }
}
