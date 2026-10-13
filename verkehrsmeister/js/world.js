'use strict';
// ---------------------------------------------------------------------------
// Welt: Gelände, Straßennetz, Gebäude
// ---------------------------------------------------------------------------

class Building {
  constructor(id, type, x, y, dir, seed) {
    const bt = BT[type];
    this.id = id;
    this.type = type;
    this.cat = bt.cat;
    this.x = x; this.y = y; this.w = bt.w; this.h = bt.h;
    this.dir = dir;          // Richtung der Einfahrt (vom Gebäude zur Straße)
    this.seed = seed;
    // Einfahrtskachel (Gebäudekachel an der Tür) und Zufahrtskachel (Straße davor)
    const ox = (dir === 0 || dir === 2) ? Math.floor((this.w - 1) / 2) : (dir === 1 ? this.w - 1 : 0);
    const oy = (dir === 1 || dir === 3) ? Math.floor((this.h - 1) / 2) : (dir === 2 ? this.h - 1 : 0);
    this.dx = x + ox; this.dy = y + oy;
    this.ax = this.dx + DX[dir]; this.ay = this.dy + DY[dir];
    this.acc = -1; // wird von World gesetzt
    const r = new RNG(seed);
    if (this.cat === 'res') this.color = r.pick(HOUSE_COLORS);
    else if (type === 'office') this.color = r.pick(OFFICE_COLORS);
    else if (type === 'shop' || type === 'mall') this.color = r.pick(SHOP_COLORS);
    else this.color = '#9aa5b1';
    this.queue = [];        // wartende Fahrten (Abfahrt)
    this.present = 0;       // anwesende Besucher/Beschäftigte
    this.sent = 0; this.recv = 0; this.failed = 0;
    this.rateSum = 0; this.rateN = 0;
    this.unconnected = 0;   // Zeit ohne Anschluss (Sim-Sekunden)
    this.noRoute = 0;       // Zeit, seit zuletzt keine Route gefunden wurde
    this.fire = null;
    this.born = 0;
    this.name = '';
    this.dead = false;
    this.acc_ = {};         // Akkumulatoren der Nachfrage
  }
  get pop() { return BT[this.type].pop || 0; }
  get jobs() { return BT[this.type].jobs || 0; }
  center() { return { x: this.x + this.w / 2, y: this.y + this.h / 2 }; }
  contains(x, y) { return x >= this.x && x < this.x + this.w && y >= this.y && y < this.y + this.h; }
}

class World {
  constructor(w, h, seed) {
    this.w = w; this.h = h; this.seed = seed;
    const n = w * h;
    this.n = n;
    this.terrain = new Uint8Array(n);
    this.variant = new Uint8Array(n);
    this.road = new Uint8Array(n);     // 0 keine, 1 Stadtstraße, 2 Schnellstraße
    this.out = new Uint8Array(n);      // ausgehende Verbindungen (Bitmaske)
    this.link = new Uint8Array(n);     // physische Verbindungen (abgeleitet)
    this.two = new Uint8Array(n);      // Seiten mit Gegenverkehr (abgeleitet)
    this.flags = new Uint8Array(n);
    this.drive = new Uint8Array(n);    // Seiten mit Gebäude-Einfahrt
    this.bld = new Int32Array(n).fill(-1);
    this.resv = new Int32Array(n).fill(-1);
    this.isJ = new Uint8Array(n);
    this.jc = new Array(n).fill(null);
    this.closed = new Uint8Array(n);   // Unfall: gesperrt
    this.works = new Float32Array(n);  // Baustelle: Restzeit
    this.comp = new Int32Array(n).fill(-1);
    // Verkehrsmessung
    this.cong = new Float32Array(n).fill(1);
    this.spdSum = new Float32Array(n);
    this.spdN = new Float32Array(n);
    this.flow = new Float32Array(n);   // geglättete Durchfahrten pro Stunde
    this.flowCnt = new Uint16Array(n);
    this.buildings = [];
    this.version = 1;
    this.dirty = new Set();
    this.listeners = [];
    for (let i = 0; i < n; i++) this.variant[i] = Math.floor(hash2(i % w, (i / w) | 0, seed) * 256);
  }

  idx(x, y) { return y * this.w + x; }
  tx(i) { return i % this.w; }
  ty(i) { return (i / this.w) | 0; }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  nb(i, d) { // Nachbarindex oder -1
    const x = i % this.w + DX[d], y = ((i / this.w) | 0) + DY[d];
    return (x < 0 || y < 0 || x >= this.w || y >= this.h) ? -1 : y * this.w + x;
  }
  isRoad(i) { return i >= 0 && this.road[i] > 0; }

  markDirty(i) {
    const x = i % this.w, y = (i / this.w) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (this.inb(x + dx, y + dy)) this.dirty.add((y + dy) * this.w + x + dx);
    }
  }
  bump() { this.version++; }

  // ---- Bauprüfungen ---------------------------------------------------------
  // Liefert Kosten und Art, um auf Kachel i eine Straße der Klasse cls zu bauen
  roadBuildInfo(i, cls) {
    if (i < 0) return { ok: false, reason: 'Außerhalb der Karte' };
    if (this.bld[i] >= 0) return { ok: false, reason: 'Gebäude im Weg' };
    const t = this.terrain[i];
    const base = cls === 2 ? CFG.cost.highway : CFG.cost.road;
    if (this.road[i]) {
      if (this.road[i] === cls) return { ok: true, cost: 0, kind: 'exists' };
      // Aus- oder Rückbau
      const diff = (cls === 2 ? CFG.cost.highway - CFG.cost.road : 0);
      return { ok: true, cost: Math.max(0, diff), kind: 'upgrade' };
    }
    let cost = base, kind = 'road';
    if (t === T_WATER) { cost += CFG.cost.bridge * (cls === 2 ? 1.4 : 1); kind = 'bridge'; }
    else if (t === T_ROCK) { cost += CFG.cost.tunnel * (cls === 2 ? 1.4 : 1); kind = 'tunnel'; }
    else if (t === T_FOREST) cost += CFG.cost.forest;
    return { ok: true, cost: Math.round(cost), kind };
  }

  roadValue(i) { // Wert einer bestehenden Straße für Erstattung
    if (!this.road[i]) return 0;
    let v = this.road[i] === 2 ? CFG.cost.highway : CFG.cost.road;
    if (this.flags[i] & F_BRIDGE) v += CFG.cost.bridge;
    if (this.flags[i] & F_TUNNEL) v += CFG.cost.tunnel;
    return v;
  }

  // ---- Straßenbau -----------------------------------------------------------
  placeRoad(i, cls) {
    const t = this.terrain[i];
    this.road[i] = cls;
    if (t === T_WATER) this.flags[i] |= F_BRIDGE;
    else if (t === T_ROCK) this.flags[i] |= F_TUNNEL;
    else if (t === T_FOREST) this.terrain[i] = T_GRASS;
    this.markDirty(i);
  }

  // Verbindung zwischen a und Nachbar in Richtung d herstellen.
  // mode: 'two' = beidseitig, 'one' = nur a -> b
  connect(a, d, mode) {
    const b = this.nb(a, d);
    if (b < 0 || !this.road[a] || !this.road[b]) return false;
    if (mode === 'one') {
      this.out[a] |= (1 << d);
      this.out[b] &= ~(1 << OPP[d]);
    } else {
      this.out[a] |= (1 << d);
      this.out[b] |= (1 << OPP[d]);
    }
    return true;
  }

  disconnect(a, d) {
    const b = this.nb(a, d);
    this.out[a] &= ~(1 << d);
    if (b >= 0) this.out[b] &= ~(1 << OPP[d]);
  }

  removeRoad(i) {
    if (!this.road[i]) return 0;
    const val = this.roadValue(i);
    for (let d = 0; d < 4; d++) {
      const j = this.nb(i, d);
      if (j >= 0) this.out[j] &= ~(1 << OPP[d]);
    }
    this.out[i] = 0;
    this.road[i] = 0;
    this.flags[i] &= ~(F_BRIDGE | F_TUNNEL | F_STOP);
    this.works[i] = 0;
    this.closed[i] = 0;
    if (this.jc[i]) { this.jc[i].destroy(); this.jc[i] = null; }
    this.isJ[i] = 0;
    this.markDirty(i);
    return val;
  }

  // Nach Änderungen: abgeleitete Daten für Kachel i und Nachbarn neu berechnen
  refresh(i) {
    const list = [i];
    for (let d = 0; d < 4; d++) { const j = this.nb(i, d); if (j >= 0) list.push(j); }
    for (const k of list) this.refreshTile(k);
    this.bump();
  }

  refreshTile(i) {
    let link = 0, two = 0;
    if (this.road[i]) {
      for (let d = 0; d < 4; d++) {
        const j = this.nb(i, d);
        if (j < 0 || !this.road[j]) { this.out[i] &= ~(1 << d); continue; }
        const o = (this.out[i] >> d) & 1, inn = (this.out[j] >> OPP[d]) & 1;
        if (o || inn) link |= (1 << d);
        if (o && inn) two |= (1 << d);
      }
    } else {
      this.out[i] = 0;
    }
    const changed = this.link[i] !== link || this.two[i] !== two;
    this.link[i] = link; this.two[i] = two;
    const deg = popcount4(link);
    const ctl = this.jc[i];
    const wantJ = this.road[i] && (deg >= 3 || (ctl && ctl.type === 'roundabout' && deg >= 2));
    if (wantJ) {
      if (!ctl) this.jc[i] = new Junction(this, i);
      else if (changed) ctl.onTopologyChange();
      this.isJ[i] = 1;
    } else {
      if (ctl) { ctl.destroy(); this.jc[i] = null; }
      this.isJ[i] = 0;
    }
    if (this.road[i] && this.flags[i] & F_STOP && (deg !== 2 || this.isJ[i])) {
      // Haltestellen nur auf normalen Streckenstücken
      if (this.isJ[i]) this.flags[i] &= ~F_STOP;
    }
    if (changed) this.markDirty(i);
  }

  // Erlaubte Ausfahrten an Kachel i, wenn mit Richtung h eingefahren
  exits(i, h) {
    const out = this.out[i];
    const ctl = this.jc[i];
    if (ctl && ctl.type === 'roundabout') return out;
    let m = out & ~(1 << OPP[h]);
    if (!m) m = out & (1 << OPP[h]);
    if (ctl && ctl.noLeft && ((ctl.noLeft >> h) & 1)) {
      const nl = m & ~(1 << ((h + 3) & 3));
      if (nl) m = nl;
    }
    return m;
  }

  // Fahrspurversatz-Index für Seite s der Kachel i (1 = Gegenverkehr, 0 = mittig)
  sideOff(i, s) { return (this.two[i] >> s) & 1; }
  offMask(i) { return this.two[i]; }

  // ---- Gebäude --------------------------------------------------------------
  footprintOk(type, x, y, dir, opts = {}) {
    const bt = BT[type];
    const tmp = new Building(-1, type, x, y, dir, 1);
    for (let yy = y; yy < y + bt.h; yy++) for (let xx = x; xx < x + bt.w; xx++) {
      if (!this.inb(xx, yy)) return false;
      const i = this.idx(xx, yy);
      if (this.road[i] || this.bld[i] >= 0 || this.resv[i] >= 0) return false;
      const t = this.terrain[i];
      if (t === T_WATER || t === T_ROCK) return false;
      if (t === T_FOREST && !opts.allowForest) return false;
      if (!opts.allowEdge && (xx === 0 || yy === 0 || xx === this.w - 1 || yy === this.h - 1)) return false;
    }
    if (!this.inb(tmp.ax, tmp.ay)) return false;
    const a = this.idx(tmp.ax, tmp.ay);
    if (this.bld[a] >= 0) return false;
    if (this.resv[a] >= 0 && !opts.shareAccess) return false;
    const ta = this.terrain[a];
    if (!this.road[a] && (ta === T_WATER || ta === T_ROCK)) return false;
    if (this.road[a] && this.road[a] === 2 && !opts.allowHighway) return false;
    if (this.road[a] && this.isJ[a] && this.jc[a] && this.jc[a].type === 'roundabout') return false;
    // Zufahrtskachel darf keine Tür eines anderen Gebäudes blockieren (keine doppelte Einfahrt auf derselben Seite)
    return true;
  }

  addBuilding(type, x, y, dir, seed, opts = {}) {
    const b = new Building(this.buildings.length, type, x, y, dir, seed);
    this.buildings.push(b);
    for (let yy = y; yy < y + b.h; yy++) for (let xx = x; xx < x + b.w; xx++) {
      const i = this.idx(xx, yy);
      this.bld[i] = b.id;
      if (this.terrain[i] === T_FOREST) this.terrain[i] = T_GRASS;
      this.markDirty(i);
    }
    b.acc = this.idx(b.ax, b.ay);
    if (!this.road[b.acc]) this.resv[b.acc] = b.id;
    this.drive[b.acc] |= (1 << OPP[dir]);
    this.markDirty(b.acc);
    if (this.jc[b.acc]) this.jc[b.acc].onTopologyChange();
    this.bump();
    return b;
  }

  removeBuilding(b) {
    if (b.dead) return;
    b.dead = true;
    for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) {
      const i = this.idx(xx, yy);
      this.bld[i] = -1;
      this.markDirty(i);
    }
    if (this.resv[b.acc] === b.id) this.resv[b.acc] = -1;
    // Einfahrt nur entfernen, wenn kein anderes Gebäude dieselbe Seite nutzt
    let still = false;
    for (const o of this.buildings) if (!o.dead && o.acc === b.acc && OPP[o.dir] === OPP[b.dir]) still = true;
    if (!still) this.drive[b.acc] &= ~(1 << OPP[b.dir]);
    this.markDirty(b.acc);
    this.bump();
  }

  buildingAt(x, y) {
    if (!this.inb(x, y)) return null;
    const id = this.bld[this.idx(x, y)];
    return id >= 0 ? this.buildings[id] : null;
  }

  liveBuildings() { return this.buildings.filter(b => !b.dead); }

  isConnected(b) { return this.road[b.acc] > 0 && this.link[b.acc] !== 0; }

  // ---- Netzzusammenhang -----------------------------------------------------
  computeComponents() {
    const comp = this.comp;
    comp.fill(-1);
    let c = 0;
    const stack = [];
    for (let i = 0; i < this.n; i++) {
      if (!this.road[i] || comp[i] >= 0) continue;
      comp[i] = c; stack.push(i);
      while (stack.length) {
        const k = stack.pop();
        const l = this.link[k];
        for (let d = 0; d < 4; d++) {
          if (!((l >> d) & 1)) continue;
          const j = this.nb(k, d);
          if (j >= 0 && comp[j] < 0 && this.road[j]) { comp[j] = c; stack.push(j); }
        }
      }
      c++;
    }
    this.compCount = c;
    this.compVersion = this.version;
  }

  ensureComponents() { if (this.compVersion !== this.version) this.computeComponents(); }

  // ---- Statistik ------------------------------------------------------------
  countRoads() {
    let road = 0, hw = 0, bridge = 0, tunnel = 0, one = 0, stops = 0;
    for (let i = 0; i < this.n; i++) {
      if (!this.road[i]) continue;
      if (this.road[i] === 2) hw++; else road++;
      if (this.flags[i] & F_BRIDGE) bridge++;
      if (this.flags[i] & F_TUNNEL) tunnel++;
      if (this.flags[i] & F_STOP) stops++;
      if (this.link[i] !== this.two[i]) one++;
    }
    return { road, hw, bridge, tunnel, one, stops };
  }

  // ---- Serialisierung -------------------------------------------------------
  serialize() {
    return {
      w: this.w, h: this.h, seed: this.seed,
      terrain: u8ToB64(this.terrain), road: u8ToB64(this.road), out: u8ToB64(this.out), flags: u8ToB64(this.flags),
      buildings: this.buildings.map(b => b.dead ? null : {
        type: b.type, x: b.x, y: b.y, dir: b.dir, seed: b.seed, sent: b.sent, recv: b.recv, failed: b.failed,
        rateSum: b.rateSum, rateN: b.rateN, born: b.born, name: b.name, present: b.present,
      }),
      jc: this.jc.map((c, i) => c && (c.type !== 'auto' || c.noLeft) ? Object.assign({ i }, c.serialize()) : null).filter(Boolean),
    };
  }

  static deserialize(o) {
    const w = new World(o.w, o.h, o.seed);
    w.terrain.set(b64ToU8(o.terrain));
    w.road.set(b64ToU8(o.road));
    w.out.set(b64ToU8(o.out));
    w.flags.set(b64ToU8(o.flags));
    // Gebäude (IDs werden neu vergeben, tote übersprungen)
    for (const bo of o.buildings) {
      if (!bo) continue;
      const b = w.addBuilding(bo.type, bo.x, bo.y, bo.dir, bo.seed);
      b.sent = bo.sent || 0; b.recv = bo.recv || 0; b.failed = bo.failed || 0;
      b.rateSum = bo.rateSum || 0; b.rateN = bo.rateN || 0; b.born = bo.born || 0; b.name = bo.name || '';
    }
    for (let i = 0; i < w.n; i++) w.refreshTile(i);
    for (const co of o.jc) {
      let c = w.jc[co.i];
      if (!c && co.type === 'roundabout' && w.road[co.i]) { c = w.jc[co.i] = new Junction(w, co.i); w.isJ[co.i] = 1; }
      if (c) c.deserialize(co);
    }
    for (let i = 0; i < w.n; i++) w.refreshTile(i);
    w.bump();
    return w;
  }
}
