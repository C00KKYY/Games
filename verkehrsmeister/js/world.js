'use strict';
// ---------------------------------------------------------------------------
// Welt: Gelände, Straßennetz (Boden + Hochstraßen-Ebene), Gebäude
// Kachelindizes 0..n-1 = Boden, n..2n-1 = Hochstraße über derselben Kachel.
// ---------------------------------------------------------------------------

const ELEV_H = 0.62;   // Fahrbahnhöhe der Autobahn

class Building {
  constructor(id, kind, pi, x, y, dir, seed) {
    this.id = id;
    this.kind = kind;            // 'house' | 'dest'
    this.pi = pi;                // Farbe (Index in PALETTE)
    this.x = x; this.y = y;
    this.w = this.h = kind === 'dest' ? 2 : 1;
    this.dir = dir;              // Richtung vom Gebäude zur Straße
    this.seed = seed;
    this.dx = x + (dir === 1 ? this.w - 1 : 0);
    this.dy = y + (dir === 2 ? this.h - 1 : 0);
    this.ax = this.dx + DX[dir]; this.ay = this.dy + DY[dir];
    this.acc = -1;
    // Ziele: zweite Kachel vor der Front = Ausfahrt
    this.sideDir = (dir === 0 || dir === 2) ? 1 : 2;
    this.ax2 = this.ax + DX[this.sideDir]; this.ay2 = this.ay + DY[this.sideDir];
    this.acc2 = -1;
    this.born = 0;
    // Haus
    this.cars = 0; this.home = 0; this.queue = [];
    // Ziel
    this.pins = 0; this.assigned = 0; this.ring = 0; this.cap = CFG.pinCap;
    this.pinAcc = 0; this.intakeT = 0; this.outQ = []; this.delivered = 0;
    this.ramp = 0; this.fair = 0; this.flex = false; this.parking = false;
    this.cause = null; this.noConnT = 0; this.waitQ = 0;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  contains(x, y) { return x >= this.x && x < this.x + this.w && y >= this.y && y < this.y + this.h; }
}

class World {
  constructor(w, h, seed) {
    this.w = w; this.h = h; this.seed = seed;
    const n = w * h, N = n * 2;
    this.n = n; this.N = N;
    // nur Boden
    this.terrain = new Uint8Array(n);
    this.variant = new Uint8Array(n);
    this.bld = new Int32Array(n).fill(-1);
    this.rail = new Uint8Array(n);     // 1 = Gleis Nord-Süd, 2 = Gleis West-Ost
    this.canal = new Uint8Array(n);    // Schifffahrtskanal (Klappbrücken)
    this.up = new Uint8Array(n);       // Bodenkachel: Seiten, deren Nachbar die Hochstraße ist (Auffahrt)
    this.down = new Uint8Array(n);     // Hochkachel (über Boden g): Seiten, deren Nachbar am Boden liegt
    this.accOf = new Int32Array(n).fill(-1); // Zufahrtskachel eines Gebäudes
    this.free = new Uint8Array(n);     // gratis entstandene Kachel (Rampe, Ring): beim Abriss keine Erstattung
    // beide Ebenen
    this.road = new Uint8Array(N);     // 0 keine, 1 Stadtstraße, 2 Autobahn
    this.out = new Uint8Array(N);
    this.link = new Uint8Array(N);
    this.two = new Uint8Array(N);
    this.flags = new Uint8Array(N);
    this.drive = new Uint8Array(N);
    this.isJ = new Uint8Array(N);
    this.jc = new Array(N).fill(null);
    this.closed = new Uint8Array(N);   // Baustelle: gesperrt (Routen meiden)
    this.gate = new Uint8Array(N);     // Schranke/Klappbrücke: kurz zu (Routen ignorieren)
    this.holdT = new Uint8Array(N);    // Ausfahrt eines Ziels kurz freihalten
    this.comp = new Int32Array(N).fill(-1);
    this.cong = new Float32Array(N).fill(1);
    this.spdSum = new Float32Array(N);
    this.spdN = new Float32Array(N);
    this.waitAcc = new Float32Array(n); // Wartezeit je Bodenkachel (Stau-Report)
    this.flowCnt = new Uint16Array(N);
    this.buildings = [];
    this.highways = [];
    this.junctions = new Set();
    this.version = 1;
    this.topo = 1;        // ändert sich nur, wenn sich Verbindungen ändern (Routen-Caches)
    this.bounds = { x0: 0, y0: 0, x1: w, y1: h };
    for (let i = 0; i < n; i++) this.variant[i] = Math.floor(hash2(i % w, (i / w) | 0, seed) * 256);
  }

  // ---- Indizes ------------------------------------------------------------------
  idx(x, y) { return y * this.w + x; }
  g(i) { return i >= this.n ? i - this.n : i; }
  tx(i) { return this.g(i) % this.w; }
  ty(i) { return (this.g(i) / this.w) | 0; }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  inBounds(x, y) { const b = this.bounds; return x >= b.x0 && y >= b.y0 && x < b.x1 && y < b.y1; }
  isElev(i) { return i >= this.n; }
  gnb(g, d) {
    const x = g % this.w + DX[d], y = ((g / this.w) | 0) + DY[d];
    return (x < 0 || y < 0 || x >= this.w || y >= this.h) ? -1 : y * this.w + x;
  }
  // Nachbar in Richtung d unter Berücksichtigung der Ebenen
  nb(i, d) {
    const n = this.n;
    if (i < n) {
      const j = this.gnb(i, d);
      if (j < 0) return -1;
      return (this.up[i] >> d) & 1 ? j + n : j;
    }
    const g = i - n, j = this.gnb(g, d);
    if (j < 0) return -1;
    return (this.down[g] >> d) & 1 ? j : j + n;
  }
  isRoad(i) { return i >= 0 && this.road[i] > 0; }
  bump() { this.version++; }

  // Höhe der Fahrbahnkante (für Darstellung): Kachel i, Seite s
  edgeH(i, s) {
    if (i < this.n) return 0;
    return (this.down[i - this.n] >> s) & 1 ? 0 : ELEV_H;
  }
  // Liegt Bodenkachel g unter einer Rampe (erste/letzte Hochkachel)?
  underSlope(g) { return this.road[g + this.n] > 0 && this.down[g] !== 0; }
  hasElev(g) { return this.road[g + this.n] > 0; }

  // ---- Bauprüfungen ---------------------------------------------------------------
  // Was passiert, wenn auf Bodenkachel i eine Straße entsteht?
  roadInfo(i) {
    if (i < 0 || i >= this.n) return { ok: false, reason: 'Außerhalb' };
    const x = this.tx(i), y = this.ty(i);
    if (!this.inBounds(x, y)) return { ok: false, reason: 'Außerhalb der Ortsgrenze' };
    if (this.road[i]) return { ok: true, kind: 'exists' };
    if (this.bld[i] >= 0) return { ok: false, reason: 'Gebäude im Weg' };
    if (this.underSlope(i)) return { ok: false, reason: 'Unter der Autobahnrampe' };
    const t = this.terrain[i];
    if (this.rail[i] && (t === T_WATER || this.rail[i] === 3)) return { ok: false, reason: 'Gleise im Weg' };
    if (t === T_WATER) return { ok: true, kind: 'bridge', canal: !!this.canal[i] };
    if (t === T_ROCK) return { ok: true, kind: 'tunnel' };
    if (this.rail[i]) return { ok: true, kind: 'crossing' };
    return { ok: true, kind: 'road' };
  }

  placeRoad(i) {
    const t = this.terrain[i];
    this.road[i] = 1;
    this.flags[i] &= ~(F_BRIDGE | F_TUNNEL | F_CROSSING | F_DRAW);
    if (t === T_WATER) { this.flags[i] |= F_BRIDGE; if (this.canal[i]) this.flags[i] |= F_DRAW; }
    else if (t === T_ROCK) this.flags[i] |= F_TUNNEL;
    else if (t === T_FOREST) this.terrain[i] = T_GRASS;
    if (this.rail[i]) this.flags[i] |= F_CROSSING;
  }

  // Darf zwischen a und seinem Nachbarn in Richtung d eine Verbindung bestehen?
  linkAllowed(a, d) {
    const b = this.nb(a, d);
    if (b < 0 || !this.road[a] || !this.road[b]) return false;
    if (this.nb(b, OPP[d]) !== a) return false;
    // Bahnübergang: nur quer zum Gleis
    const ra = a < this.n ? this.rail[a] : 0, rb = b < this.n ? this.rail[b] : 0;
    const vert = d === 0 || d === 2;
    if (ra && ((ra === 1) === vert)) return false;
    if (rb && ((rb === 1) === vert)) return false;
    // Tunnel und Brücken nur gerade
    return true;
  }

  connect(a, d) {
    if (!this.linkAllowed(a, d)) return false;
    const b = this.nb(a, d);
    this.out[a] |= (1 << d);
    this.out[b] |= (1 << OPP[d]);
    return true;
  }

  disconnect(a, d) {
    const b = this.nb(a, d);
    this.out[a] &= ~(1 << d);
    if (b >= 0 && this.nb(b, OPP[d]) === a) this.out[b] &= ~(1 << OPP[d]);
  }

  removeRoad(i) {
    if (!this.road[i]) return;
    for (let d = 0; d < 4; d++) this.disconnect(i, d);
    this.out[i] = 0;
    this.road[i] = 0;
    this.flags[i] = 0;
    this.closed[i] = 0; this.gate[i] = 0;
    if (this.jc[i]) { this.dropCtl(this.jc[i]); this.jc[i] = null; }
    this.isJ[i] = 0;
  }

  refresh(i) {
    this.refreshTile(i);
    for (let d = 0; d < 4; d++) { const j = this.nb(i, d); if (j >= 0) this.refreshTile(j); }
    this.bump();
  }

  refreshTile(i) {
    let link = 0, two = 0;
    if (this.road[i]) {
      for (let d = 0; d < 4; d++) {
        const o = (this.out[i] >> d) & 1;
        if (!o) continue;
        const j = this.nb(i, d);
        if (j < 0 || !this.road[j] || this.nb(j, OPP[d]) !== i) { this.out[i] &= ~(1 << d); continue; }
        const inn = (this.out[j] >> OPP[d]) & 1;
        link |= (1 << d);
        if (inn) two |= (1 << d);
      }
    } else this.out[i] = 0;
    const changed = this.link[i] !== link || this.two[i] !== two;
    if (changed) this.topo++;
    this.link[i] = link; this.two[i] = two;
    const deg = popcount4(link);
    const ctl = this.jc[i];
    const wantJ = this.road[i] && i < this.n && (deg >= 3 || (ctl && ctl.type === 'roundabout' && deg >= 2));
    if (wantJ) {
      if (!ctl) this.jc[i] = new Junction(this, i);
      else if (changed) ctl.onTopologyChange();
      this.isJ[i] = 1;
    } else {
      if (ctl) { this.dropCtl(ctl); this.jc[i] = null; }
      this.isJ[i] = 0;
    }
  }

  // Kreuzung verschwindet: Ampel/Kreisel zurück ins Inventar
  dropCtl(ctl) {
    if ((ctl.type === 'light' || ctl.type === 'roundabout') && this.emit) this.emit('refund', ctl);
    ctl.destroy();
  }

  refreshAll() { for (let i = 0; i < this.N; i++) this.refreshTile(i); this.bump(); }

  // Erlaubte Ausfahrten an Kachel i bei Einfahrt mit Richtung h
  exits(i, h) {
    const out = this.out[i];
    const ctl = this.jc[i];
    if (ctl && ctl.type === 'roundabout') return out;
    let m = out & ~(1 << OPP[h]);
    if (!m) m = out & (1 << OPP[h]);
    return m;
  }

  sideOff(i, s) { return (this.two[i] >> s) & 1; }

  // ---- Gebäude --------------------------------------------------------------------
  buildable(g) {
    if (g < 0) return false;
    if (this.road[g] || this.bld[g] >= 0 || this.accOf[g] >= 0 || this.rail[g] || this.hasElev(g)) return false;
    const t = this.terrain[g];
    return t !== T_WATER && t !== T_ROCK;
  }

  footprintOk(kind, x, y, dir) {
    const s = kind === 'dest' ? 2 : 1;
    for (let yy = y; yy < y + s; yy++) for (let xx = x; xx < x + s; xx++) {
      if (!this.inb(xx, yy) || !this.inBounds(xx, yy)) return false;
      if (!this.buildable(this.idx(xx, yy))) return false;
    }
    const tmp = new Building(-1, kind, 0, x, y, dir, 1);
    if (!this.accessOk(tmp.ax, tmp.ay, dir)) return false;
    if (kind === 'dest' && !this.accessOk(tmp.ax2, tmp.ay2, dir)) return false;
    return true;
  }

  accessOk(ax, ay, dir) {
    if (!this.inb(ax, ay) || !this.inBounds(ax, ay)) return false;
    const a = this.idx(ax, ay);
    if (this.bld[a] >= 0 || this.accOf[a] >= 0 || this.hasElev(a) || this.up[a]) return false;
    if (this.road[a]) {
      if (this.flags[a] & (F_BRIDGE | F_TUNNEL | F_CROSSING)) return false;
      if (this.jc[a] && this.jc[a].type === 'roundabout') return false;
      if ((this.link[a] >> OPP[dir]) & 1) return false;
      return true;
    }
    const ta = this.terrain[a];
    return !(ta === T_WATER || ta === T_ROCK || this.rail[a]);
  }

  addBuilding(kind, pi, x, y, dir, seed) {
    const b = new Building(this.buildings.length, kind, pi, x, y, dir, seed);
    this.buildings.push(b);
    for (let yy = y; yy < y + b.h; yy++) for (let xx = x; xx < x + b.w; xx++) {
      const i = this.idx(xx, yy);
      this.bld[i] = b.id;
      if (this.terrain[i] === T_FOREST) this.terrain[i] = T_GRASS;
    }
    const stub = (ax, ay) => {
      const a = this.idx(ax, ay);
      this.accOf[a] = b.id;
      if (!this.road[a]) this.placeRoad(a);   // Einfahrtsstummel gratis
      this.drive[a] |= (1 << OPP[dir]);
      return a;
    };
    b.acc = stub(b.ax, b.ay);
    if (kind === 'dest') {
      b.acc2 = stub(b.ax2, b.ay2);
      this.connect(b.acc, b.sideDir);
      this.refresh(b.acc2);
      if (this.jc[b.acc2]) this.jc[b.acc2].onTopologyChange();
    }
    this.refresh(b.acc);
    if (this.jc[b.acc]) this.jc[b.acc].onTopologyChange();
    return b;
  }

  buildingAt(x, y) {
    if (!this.inb(x, y)) return null;
    const id = this.bld[this.idx(x, y)];
    return id >= 0 ? this.buildings[id] : null;
  }

  // ---- Autobahn (Hochstraße) ------------------------------------------------------
  // tiles: Bodenkacheln von Rampe A bis Rampe B in gerader Linie (Richtung d)
  highwayCheck(tiles, d) {
    const L = tiles.length;
    if (L < 4) return { ok: false, reason: 'Mindestens 4 Felder (zwei Rampen)' };
    if (L - 2 > CFG.highwayMax) return { ok: false, reason: 'Höchstens ' + CFG.highwayMax + ' Felder Hochstraße' };
    for (let k = 0; k < L; k++) {
      const g = tiles[k];
      const x = this.tx(g), y = this.ty(g);
      if (!this.inBounds(x, y)) return { ok: false, reason: 'Außerhalb der Ortsgrenze', bad: k };
      if (this.hasElev(g)) return { ok: false, reason: 'Dort ist schon eine Autobahn', bad: k };
      if (k === 0 || k === L - 1) {
        const ri = this.roadInfo(g);
        if (!ri.ok || (ri.kind !== 'road' && ri.kind !== 'exists')) return { ok: false, reason: 'Rampe braucht festen Boden', bad: k };
        if (this.road[g] && (this.flags[g] & (F_BRIDGE | F_TUNNEL | F_CROSSING))) return { ok: false, reason: 'Rampe nicht auf Brücke/Tunnel', bad: k };
        if (this.up[g]) return { ok: false, reason: 'Dort ist schon eine Rampe', bad: k };
        if (this.jc[g] && this.jc[g].type === 'roundabout') return { ok: false, reason: 'Rampe nicht im Kreisel', bad: k };
      } else {
        if (this.bld[g] >= 0) return { ok: false, reason: 'Gebäude im Weg', bad: k };
        if (this.terrain[g] === T_ROCK) return { ok: false, reason: 'Berg im Weg – nimm einen Tunnel', bad: k };
        if ((k === 1 || k === L - 2) && (this.road[g] || this.accOf[g] >= 0 || this.rail[g])) return { ok: false, reason: 'Unter der Rampe muss frei sein', bad: k };
        if (this.up[g]) return { ok: false, reason: 'Rampe im Weg', bad: k };
      }
    }
    return { ok: true };
  }

  addHighway(tiles, d) {
    const n = this.n, L = tiles.length;
    const A = tiles[0], B = tiles[L - 1];
    for (const g of [A, B]) if (!this.road[g]) { this.placeRoad(g); this.free[g] = 1; }
    // bisherige Bodenverbindung der Rampen in Fahrtrichtung kappen
    this.disconnect(A, d); this.disconnect(B, OPP[d]);
    const mid = tiles.slice(1, L - 1);
    for (const g of mid) {
      this.road[g + n] = 2;
      this.flags[g + n] = 0;
      if (this.terrain[g] === T_FOREST) this.terrain[g] = T_GRASS;
    }
    this.up[A] |= 1 << d; this.up[B] |= 1 << OPP[d];
    this.down[mid[0]] |= 1 << OPP[d];
    this.down[mid[mid.length - 1]] |= 1 << d;
    this.flags[A] |= F_RAMP; this.flags[B] |= F_RAMP;
    this.connect(A, d);
    for (let k = 0; k < mid.length; k++) this.connect(mid[k] + n, d);
    const hw = { a: A, b: B, d, mid };
    this.highways.push(hw);
    for (const g of tiles) this.refresh(g);
    for (const g of mid) this.refresh(g + n);
    return hw;
  }

  highwayAt(g) {
    for (const hw of this.highways) if (hw.mid.indexOf(g) >= 0 || hw.a === g || hw.b === g) return hw;
    return null;
  }

  removeHighway(hw) {
    const n = this.n;
    for (const g of hw.mid) this.removeRoad(g + n);
    for (const g of hw.mid) this.down[g] = 0;
    this.up[hw.a] &= ~(1 << hw.d); this.up[hw.b] &= ~(1 << OPP[hw.d]);
    if (!this.up[hw.a]) this.flags[hw.a] &= ~F_RAMP;
    if (!this.up[hw.b]) this.flags[hw.b] &= ~F_RAMP;
    this.out[hw.a] &= ~(1 << hw.d); this.out[hw.b] &= ~(1 << OPP[hw.d]);
    this.highways.splice(this.highways.indexOf(hw), 1);
    for (const g of hw.mid) { this.refresh(g); this.refresh(g + n); }
    this.refresh(hw.a); this.refresh(hw.b);
  }

  // ---- Netzzusammenhang -------------------------------------------------------------
  computeComponents() {
    const comp = this.comp;
    comp.fill(-1);
    let c = 0;
    const stack = [];
    for (let i = 0; i < this.N; i++) {
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
    this.compVersion = this.version;
  }
  ensureComponents() { if (this.compVersion !== this.version) this.computeComponents(); }

  // ---- Undo -------------------------------------------------------------------------
  snapshot() {
    const jc = [];
    for (const J of this.junctions) jc.push({ i: J.i, type: J.type, main: J.mainArms, lmain: J.lightMain });
    return {
      road: this.road.slice(), out: this.out.slice(), flags: this.flags.slice(), up: this.up.slice(), down: this.down.slice(),
      terrain: this.terrain.slice(), free: this.free.slice(), highways: this.highways.map(h => ({ a: h.a, b: h.b, d: h.d, mid: h.mid.slice() })), jc,
    };
  }

  restore(s) {
    this.topo++;
    const changed = [];
    for (let i = 0; i < this.N; i++) if (this.road[i] !== s.road[i] || this.out[i] !== s.out[i]) changed.push(i);
    for (let i = 0; i < this.N; i++) {
      if (this.road[i] && !s.road[i]) this.removeRoad(i);
    }
    this.road.set(s.road); this.out.set(s.out); this.flags.set(s.flags); this.up.set(s.up); this.down.set(s.down); this.terrain.set(s.terrain); this.free.set(s.free);
    // Seitdem entstandene Gebäude behalten: keine Straße darunter, Einfahrtsstummel wiederherstellen
    for (const b of this.buildings) {
      for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) {
        const i = this.idx(xx, yy);
        if (this.road[i]) { this.road[i] = 0; this.out[i] = 0; this.flags[i] = 0; changed.push(i); }
        if (this.terrain[i] === T_FOREST) this.terrain[i] = T_GRASS;
      }
      for (const a of b.kind === 'dest' ? [b.acc, b.acc2] : [b.acc]) if (!this.road[a]) { this.placeRoad(a); changed.push(a); }
      if (b.kind === 'dest') { this.out[b.acc] |= 1 << b.sideDir; this.out[b.acc2] |= 1 << OPP[b.sideDir]; }
    }
    this.highways = [];
    this.droppedHighways = 0;
    for (const h of s.highways) {
      const tiles = [h.a, h.b].concat(h.mid);
      if (tiles.some(g => this.bld[g] >= 0)) {
        // dort steht inzwischen ein Gebäude: Hochstraße entfällt (Autobahn geht zurück ins Inventar)
        for (const g of h.mid) { this.road[g + this.n] = 0; this.out[g + this.n] = 0; this.flags[g + this.n] = 0; this.down[g] = 0; changed.push(g + this.n); }
        this.up[h.a] &= ~(1 << h.d); this.up[h.b] &= ~(1 << OPP[h.d]);
        this.out[h.a] &= ~(1 << h.d); this.out[h.b] &= ~(1 << OPP[h.d]);
        this.droppedHighways++;
        continue;
      }
      this.highways.push({ a: h.a, b: h.b, d: h.d, mid: h.mid.slice() });
    }
    for (let i = 0; i < this.N; i++) this.refreshTile(i);
    for (const o of s.jc) {
      let J = this.jc[o.i];
      if (!J && o.type === 'roundabout' && this.road[o.i]) { J = this.jc[o.i] = new Junction(this, o.i); this.isJ[o.i] = 1; }
      if (J) { J.setType(o.type); J.mainArms = o.main; J.lightMain = o.lmain; J.onTopologyChange(); }
    }
    for (const J of this.junctions) if (!s.jc.some(o => o.i === J.i)) J.setType('auto');
    for (let i = 0; i < this.N; i++) this.refreshTile(i);
    this.bump();
    return changed;
  }
}
