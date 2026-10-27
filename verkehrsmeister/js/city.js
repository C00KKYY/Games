'use strict';
// ---------------------------------------------------------------------------
// Stadtleben: Häuser und Ziele entstehen, Aufträge (Pins), Disposition der
// Autos, Rückfahrten, Kombos und die Diagnose der Engstellen
// ---------------------------------------------------------------------------

const CAUSES = {
  rvl: { title: 'Rechts vor links bremst', tip: 'Bei Querverkehr muss jeder fast anhalten. Per Wisch Vorfahrt geben, einen Kreisel oder eine Ampel setzen.' },
  side: { title: 'Nebenstraße kommt nicht raus', tip: 'Ampel oder Kreisel setzen – oder per Wisch die Vorfahrt in die andere Richtung drehen.' },
  main: { title: 'Zu viele kreuzende Ströme', tip: 'Kreisel setzen, den Verkehr auf eine zweite Route verteilen oder eine Autobahn darüberlegen.' },
  light: { title: 'Ampel bremst', tip: 'Per Wisch die Hauptachse festlegen (doppelt Grün) – oder einen Kreisel probieren.' },
  round: { title: 'Kreisel ist voll', tip: 'Zweite Route bauen, damit sich der Verkehr verteilt.' },
  spill: { title: 'Rückstau von vorn', tip: 'Die Straße hinter der Kreuzung ist voll. Engstelle weiter vorne entschärfen, Kreuzungen nicht so dicht setzen oder eine Umgehung bauen.' },
  exit: { title: 'Parkplatz verstopft', tip: 'Beide Zufahrten des Ziels anschließen und Kreuzungen direkt davor vermeiden.' },
  detour: { title: 'Großer Umweg', tip: 'Eine direktere Straße zu den Häusern bauen.' },
  nocon: { title: 'Keine Verbindung', tip: 'Ziel mit Häusern derselben Farbe verbinden.' },
  nocar: { title: 'Kein freies Auto', tip: 'Mehr Häuser dieser Farbe anschließen.' },
  jam: { title: 'Autos stecken im Stau', tip: 'Es waren genug Autos unterwegs, aber sie kamen nicht durch. Die markierten Kreuzungen auf dem Weg entschärfen oder eine zweite Route bauen.' },
  gate: { title: 'Schranke staut', tip: 'Eine Umgehung ohne Bahnübergang bzw. Klappbrücke bauen.' },
};

// Ursache einer Kreuzung aus den gesammelten Blockiergründen
function junctionCause(J) {
  const w = J.why;
  const spill = w[4] + w[7], yieldT = w[5] + w[6], box = w[3], red = w[2];
  const m = Math.max(spill, yieldT, box, red);
  if (m <= 0) return J.type === 'auto' ? 'rvl' : J.type === 'light' ? 'light' : J.type === 'roundabout' ? 'round' : 'main';
  if (m === spill) return 'spill';
  if (m === red) return 'light';
  if (m === yieldT) return J.type === 'priority' ? 'side' : 'rvl';
  return J.type === 'roundabout' ? 'round' : 'main';
}

class City {
  constructor(game) {
    this.g = game;
    this.w = game.world;
    this.rng = new RNG(game.seed * 13 + 5);
    this.houses = [];
    this.dests = [];
    this.colors = [];
    this.pending = [];
    this.houseT = 6;
    this.dispatchT = 0;
    this.diagT = 0;
    this.honkT = 0;
    this.combo = 0; this.lastDeliver = -10;
    this.cleanRun = 0;
    this.nextDestDay = CFG.firstDestDay;
    this.destsMade = 0;
    this.extraCars = {};
    this.problems = [];
    this.fieldT = 0;
  }

  get pf() { return this.g.traffic.pf; }

  // ---- Start ------------------------------------------------------------------------
  setup() {
    const def = this.g.def;
    const first = def.firstColor !== undefined ? def.firstColor : (def.id === 'kleinbuettel' ? 0 : this.rng.int(0, PALETTE.length - 1));
    this.colors.push(first);
    const b = this.w.bounds;
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    // erstes Ziel nahe der Mitte
    let d = null;
    for (let r = 1; r < 6 && !d; r++) d = this.findDestSpot(first, cx + this.rng.range(-r, r), cy + this.rng.range(-r, r), true);
    if (!d) d = this.findDestSpot(first, cx, cy, false);
    const dest = this.place({ kind: 'dest', pi: first, x: d.x, y: d.y, dir: d.dir, seed: this.rng.int(1, 1e9) }, true);
    dest.ramp = 0.35;
    // zwei Häuser
    for (let k = 0; k < 2; k++) {
      const h = this.findHouseSpot(first, dest, k === 0 ? 4.5 : 5.5);
      if (h) this.place({ kind: 'house', pi: first, x: h.x, y: h.y, dir: h.dir, seed: this.rng.int(1, 1e9) }, true);
    }
    if (def.colors && def.colors > 1) {
      for (let c = 1; c < Math.min(def.colors, 2); c++) this.newColorDest(true);
    }
  }

  // ---- Platzsuche ----------------------------------------------------------------------
  findDestSpot(pi, tx, ty, strict) {
    const w = this.w, b = w.bounds;
    let best = null, bestS = -1e9;
    for (let k = 0; k < 160; k++) {
      const x = this.rng.int(b.x0, b.x1 - 2), y = this.rng.int(b.y0, b.y1 - 2);
      const dir = this.rng.int(0, 3);
      if (!w.footprintOk('dest', x, y, dir)) continue;
      if (this.pendingBlocks(x, y, 2)) continue;
      const L = this.landComp(), ta = new Building(-1, 'dest', pi, x, y, dir, 1);
      const ca = L.comp[w.idx(ta.ax, ta.ay)];
      if (ca < 0 || L.size[ca] < 14) continue;
      let s = -Math.hypot(x + 1 - tx, y + 1 - ty) * (strict ? 2 : 0.6);
      if (this.dests.length && L.comp[this.dests[0].acc] !== ca) s -= 1.5;
      let minD = 99;
      for (const o of this.dests) minD = Math.min(minD, Math.hypot(o.cx - x - 1, o.cy - y - 1));
      for (const o of this.houses) if (Math.hypot(o.cx - x - 1, o.cy - y - 1) < 2) s -= 3;
      if (this.dests.length) { if (minD < 4.5) continue; s -= Math.abs(minD - 7) * 0.8; }
      // nicht direkt an den Rand
      const edge = Math.min(x - b.x0, y - b.y0, b.x1 - x - 2, b.y1 - y - 2);
      if (edge < 1) s -= 3;
      s += this.rng.next() * 2;
      if (s > bestS) { bestS = s; best = { x, y, dir }; }
    }
    return best;
  }

  findHouseSpot(pi, near, ideal) {
    const w = this.w, b = w.bounds;
    let best = null, bestS = -1e9;
    const R = 3 + Math.min(6, this.g.week + 2);
    for (let k = 0; k < 140; k++) {
      const x = Math.round(near.cx - 0.5 + this.rng.range(-R, R)), y = Math.round(near.cy - 0.5 + this.rng.range(-R, R));
      if (!w.inb(x, y) || !w.inBounds(x, y)) continue;
      const dir = this.rng.int(0, 3);
      if (!w.footprintOk('house', x, y, dir)) continue;
      if (this.pendingBlocks(x, y, 1)) continue;
      const dd = Math.hypot(x + 0.5 - near.cx, y + 0.5 - near.cy);
      if (dd < 2.2) continue;
      let s = -Math.abs(dd - ideal) + this.rng.next() * 2.5;
      const ax = x + DX[dir], ay = y + DY[dir];
      const a = w.idx(ax, ay);
      const L = this.landComp(), ca = L.comp[a];
      if (ca < 0 || L.size[ca] < 10) continue;
      if (near.acc !== undefined && near.acc >= 0 && L.comp[near.acc] !== ca) s -= this.g.inv.bridges + this.g.inv.tunnels > 0 ? 1.5 : 4;
      if (w.road[a] && w.link[a]) s += 1.2;
      else for (let d = 0; d < 4; d++) { const j = w.gnb(a, d); if (j >= 0 && w.road[j] && w.link[j]) { s += 0.6; break; } }
      // Nachbarschaften: gleiche Farbe in der Nähe bevorzugen
      for (const o of this.houses) {
        const od = Math.abs(o.x - x) + Math.abs(o.y - y);
        if (od <= 2) s += o.pi === pi ? 0.5 : -0.8;
      }
      // zum Ziel ausgerichtete Einfahrt
      const toward = Math.hypot(ax + 0.5 - near.cx, ay + 0.5 - near.cy) < dd ? 0.6 : 0;
      s += toward;
      if (s > bestS) { bestS = s; best = { x, y, dir }; }
    }
    return best;
  }

  // Landflächen innerhalb der Ortsgrenze (Straßen und Brücken verbinden), für faire Bauplätze
  landComp() {
    const w = this.w, b = w.bounds;
    const key = w.version + ':' + b.x0 + ',' + b.y0 + ',' + b.x1 + ',' + b.y1;
    if (this._lc && this._lcKey === key) return this._lc;
    const n = w.n, comp = new Int32Array(n).fill(-1), size = [];
    const pass = i => {
      const x = w.tx(i), y = w.ty(i);
      if (!w.inBounds(x, y)) return false;
      if (w.road[i]) return true;
      if (w.bld[i] >= 0) return false;
      const t = w.terrain[i];
      return t !== T_WATER && t !== T_ROCK;
    };
    const st = [];
    let c = 0;
    for (let i = 0; i < n; i++) {
      if (comp[i] >= 0 || !pass(i)) continue;
      comp[i] = c; st.push(i); let sz = 0;
      while (st.length) {
        const k = st.pop(); sz++;
        for (let d = 0; d < 4; d++) { const j = w.gnb(k, d); if (j >= 0 && comp[j] < 0 && pass(j)) { comp[j] = c; st.push(j); } }
      }
      size.push(sz); c++;
    }
    this._lc = { comp, size }; this._lcKey = key;
    return this._lc;
  }

  pendingBlocks(x, y, s) {
    for (const p of this.pending) {
      const ps = p.kind === 'dest' ? 2 : 1;
      if (x < p.x + ps + 1 && x + s + 1 > p.x && y < p.y + ps + 1 && y + s + 1 > p.y) return true;
    }
    return false;
  }

  // ---- Platzieren (mit Ankündigung) ---------------------------------------------------
  announce(spec) {
    spec.t = CFG.announce;
    this.pending.push(spec);
    this.g.fx.push({ t: 'announce', spec });
  }

  place(spec, instant) {
    const w = this.w;
    if (!w.footprintOk(spec.kind, spec.x, spec.y, spec.dir)) return null;
    const b = w.addBuilding(spec.kind, spec.pi, spec.x, spec.y, spec.dir, spec.seed);
    b.born = this.g.time;
    if (b.kind === 'house') {
      b.cars = b.home = CFG.carsPerHouse + (this.extraCars[b.pi] || 0);
      this.houses.push(b);
    } else {
      b.ramp = 0;
      this.dests.push(b);
    }
    // ein neuer Einfahrtsstummel ändert keine bestehende Route – nur Fahrzeuge auf der Kachel prüfen
    if (this.g.traffic.vehicles.length && (this.g.traffic.vehiclesOnTile(b.acc).length || (b.acc2 >= 0 && this.g.traffic.vehiclesOnTile(b.acc2).length))) this.g.traffic.onTilesChanged([b.acc]);
    this.g.fx.push({ t: 'drop', b, instant: !!instant });
    return b;
  }

  newColorDest(instant) {
    const maxC = this.g.def.maxColors || CFG.maxColors;
    let pi;
    const unused = [];
    for (let k = 0; k < PALETTE.length; k++) if (this.colors.indexOf(k) < 0) unused.push(k);
    if (this.colors.length < maxC && unused.length) { pi = this.rng.pick(unused); this.colors.push(pi); }
    else {
      // Farbe mit den meisten Häusern pro Ziel
      let best = -1;
      for (const c of this.colors) {
        const nh = this.houses.filter(h => h.pi === c).length, nd = this.dests.filter(d => d.pi === c).length;
        const s = nh / (nd + 0.5) + this.rng.next();
        if (s > best) { best = s; pi = c; }
      }
    }
    const b = this.w.bounds;
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const spot = this.findDestSpot(pi, cx + this.rng.range(-6, 6), cy + this.rng.range(-6, 6), false);
    if (!spot) return false;
    const spec = { kind: 'dest', pi, x: spot.x, y: spot.y, dir: spot.dir, seed: this.rng.int(1, 1e9) };
    const isNew = !this.dests.some(d => d.pi === pi) && !this.pending.some(p => p.kind === 'dest' && p.pi === pi);
    if (instant) this.place(spec, true); else this.announce(spec);
    this.destsMade++;
    if (!instant && this.dests.length) {
      const L = this.landComp(), tb = new Building(-1, 'dest', pi, spot.x, spot.y, spot.dir, 1);
      const ca = L.comp[this.w.idx(tb.ax, tb.ay)];
      const g = this.g;
      if (!this.dests.some(d => L.comp[d.acc] === ca) && g.inv.bridges + g.inv.tunnels === 0) {
        const rock = this.w.terrain.some((t, i) => t === T_ROCK && this.w.inBounds(this.w.tx(i), this.w.ty(i)));
        if (rock && !this.w.terrain.some((t, i) => t === T_WATER && this.w.inBounds(this.w.tx(i), this.w.ty(i)))) g.inv.tunnels++; else g.inv.bridges++;
        g.fx.push({ t: 'toast', text: 'Das neue Ziel liegt abseits – dafür gibt es ein Bauteil (Brücke/Tunnel) dazu.', icon: 'bridge' });
      }
    }
    // neue Farbe: gleich zwei Häuser dazu
    if (isNew) {
      const fake = { cx: spot.x + 1, cy: spot.y + 1 };
      for (let k = 0; k < 2; k++) {
        const h = this.findHouseSpot(pi, fake, 4 + k);
        if (h) { const hs = { kind: 'house', pi, x: h.x, y: h.y, dir: h.dir, seed: this.rng.int(1, 1e9) }; if (instant) this.place(hs, true); else { this.announce(hs); hs.t += 1 + k; } }
      }
    }
    return true;
  }

  spawnHouse() {
    const cols = this.colors.filter(c => this.dests.some(d => d.pi === c));
    if (!cols.length) return;
    // Farbe nach Bedarf: offene Aufträge gegenüber Autos
    const pi = this.rng.weighted(cols, c => {
      let pins = 0, cars = 0;
      for (const d of this.dests) if (d.pi === c) pins += d.pins + 2.5 + d.ramp * 2;
      for (const h of this.houses) if (h.pi === c) cars += h.cars;
      return Math.pow(pins / (cars + 2), 1.3) + 0.15;
    });
    const ds = this.dests.filter(d => d.pi === pi);
    const near = this.rng.pick(ds);
    const spot = this.findHouseSpot(pi, near, 4.5 + this.rng.range(0, 3));
    if (!spot) return;
    this.announce({ kind: 'house', pi, x: spot.x, y: spot.y, dir: spot.dir, seed: this.rng.int(1, 1e9) });
  }

  addCarsForColor(pi, n) {
    this.extraCars[pi] = (this.extraCars[pi] || 0) + n;
    for (const h of this.houses) if (h.pi === pi) { h.cars += n; h.home += n; }
  }

  // ---- Wellen ------------------------------------------------------------------------
  wave(hour, dest) {
    // Morgen- und Abendwelle mit weichen Kanten, abends ruhiger
    const e = (a, b) => smoothstep(a - 0.4, a + 0.4, hour) * (1 - smoothstep(b - 0.4, b + 0.4, hour));
    let f = 1 +(CFG.waveMorning - 1) * e(7, 9.5) + (CFG.waveEvening - 1) * e(16, 19) + (CFG.waveNight - 1) * smoothstep(18.6, 19.4, hour);
    if (this.g.mods.rush) f = 1 + (f - 1) * 1.3;
    if (dest && dest.flex) f = 1 + (f - 1) * 0.5;
    return f;
  }

  // ---- Simulation --------------------------------------------------------------------
  step(dt) {
    const g = this.g;
    const day = g.phase === 'day';
    // Ankündigungen
    for (let k = this.pending.length - 1; k >= 0; k--) {
      const p = this.pending[k];
      p.t -= dt;
      if (p.t <= 0) {
        this.pending.splice(k, 1);
        const b = this.place(p);
        if (!b && p.kind === 'house') {
          // Platz inzwischen belegt: neuen suchen
          const near = this.dests.find(d => d.pi === p.pi);
          if (near) { const s = this.findHouseSpot(p.pi, near, 4); if (s) this.announce({ kind: 'house', pi: p.pi, x: s.x, y: s.y, dir: s.dir, seed: p.seed }); }
        } else if (!b && p.kind === 'dest') {
          const s = this.findDestSpot(p.pi, p.x, p.y, false);
          if (s) this.announce({ kind: 'dest', pi: p.pi, x: s.x, y: s.y, dir: s.dir, seed: p.seed });
        }
      }
    }
    if (day) {
      // neue Häuser
      this.houseT -= dt;
      if (this.houseT <= 0) {
        this.houseT = Math.max(CFG.houseEveryMin, CFG.houseEvery * Math.pow(CFG.houseWeekFactor, g.week - 1)) * this.rng.range(0.8, 1.2);
        this.spawnHouse();
      }
      // neues Ziel an Tag 3, 7, 11 …
      if (g.dayIndex >= this.nextDestDay && g.dayT > 6) {
        this.nextDestDay += CFG.destEveryDays;
        this.newColorDest(false);
      }
    }
    // Aufträge
    const week = g.week;
    const grow = (1 + CFG.pinWeekGrowth * (week - 1)) * (g.mods.pactDemand && g.mods.pactWeek === week ? g.mods.pactDemand : 1);
    for (const d of this.dests) {
      d.ramp = Math.min(1, d.ramp + dt / 25);
      if (d.fair > 0) {
        d.fair -= dt;
        if (d.fairPins > 0) { const add = Math.min(d.fairPins, dt * 2); d.fairAcc = (d.fairAcc || 0) + add; d.fairPins -= add; while (d.fairAcc >= 1) { d.fairAcc--; d.pins++; } }
        if (d.fair <= 0) {
          d.cap = d.parking ? 9 : CFG.pinCap;
          d.fairPins = 0;
          // Besucher ohne Auto gehen nach Hause
          d.pins = Math.min(d.pins, Math.max(d.cap, d.assigned));
          g.fx.push({ t: 'toast', text: 'Die Messe ist vorbei.', icon: 'fair' });
        }
      }
      if (day && g.stopT <= 0) {
        d.pinAcc += (1 / CFG.pinEvery + CFG.pinPerHouse * Math.min(14, d.nh || 0)) * grow * this.wave(g.hour, d) * (0.35 + 0.65 * d.ramp) * dt;
        while (d.pinAcc >= 1) { d.pinAcc -= 1; d.pins++; g.fx.push({ t: 'pin', b: d }); }
      }
      // Überlaufring
      if (d.pins > d.cap) {
        const was = d.ring;
        d.ring += dt / CFG.ringTime;
        if (was < 0.5 && d.ring >= 0.5) g.fx.push({ t: 'warn', b: d });
        if (d.ring >= 1) { d.ring = 1; if (this.noFail) { d.pins = d.cap; d.ring = 0.5; } else { g.gameOver(d); return; } }
      } else d.ring = Math.max(0, d.ring - dt * CFG.ringDrain / CFG.ringTime);
    }
    // Disposition
    this.dispatchT -= dt;
    if (this.dispatchT <= 0) { this.dispatchT = 0.2; this.dispatch(); }
    this.fieldT -= dt;
    if (this.fieldT <= 0) { this.fieldT = 5; this.pf.fields.clear(); }
    this.departures(dt);
    // Hupen
    this.honkT -= dt;
    if (this.honkT <= 0) {
      this.honkT = 0.35;
      const V = g.traffic.vehicles;
      if (V.length) {
        const v = V[(this.rng.next() * V.length) | 0];
        if (v.wait > 4 && v.v < 0.05 && v.stuck > 4 && this.rng.chance(0.5)) g.fx.push({ t: 'honk', x: v.x, y: v.y, z: v.y3d });
      }
    }
    this.diagT -= dt;
    if (this.diagT <= 0) { this.diagT = 1; this.diagnose(); }
  }

  dispatch() {
    const w = this.w, now = this.g.time;
    const order = this.dests.slice().sort((a, b) => (b.ring - a.ring) || ((b.pins - b.assigned) - (a.pins - a.assigned)));
    for (const d of order) {
      let need = d.pins - d.assigned;
      if (need <= 0) continue;
      if (!w.road[d.acc]) continue;
      const field = this.pf.field(d.acc);
      while (need > 0) {
        let best = null, bc = Infinity;
        for (const h of this.houses) {
          if (h.pi !== d.pi || h.home <= 0 || (h.blockT && h.blockT > now)) continue;
          const c = field[h.acc] + h.queue.length * 1.5;
          if (c < bc) { bc = c; best = h; }
        }
        if (!best || !isFinite(bc)) break;
        best.home--;
        best.queue.push({ dest: d, t: now });
        d.assigned++;
        need--;
      }
    }
  }

  departures(dt) {
    const g = this.g, tr = g.traffic, now = g.time;
    for (const h of this.houses) {
      if (!h.queue.length) continue;
      const q = h.queue[0];
      const d = q.dest;
      const v = tr.trySpawn(h, [d.acc, d.acc2], OPP[d.dir], 'car', h.queue.length >= 2 || now - q.t > 3);
      if (v) {
        h.queue.shift();
        v.house = h; v.dest = d; v.leg = 'out'; v.color = PALETTE[h.pi].hex;
        g.fx.push({ t: 'depart', b: h });
      } else if (v === null) {
        // keine Route: Auftrag zurückgeben, Haus kurz sperren
        h.queue.shift();
        h.home++; d.assigned--;
        h.blockT = now + 4;
      }
    }
    const w = this.w;
    for (const d of this.dests) {
      if (!d.outQ.length) { d.hold = false; w.holdT[d.acc2] = 0; continue; }
      const q = d.outQ[0];
      if (q.t > now) continue;
      // Ausfahrt bekommt kurz Vorrang, wenn schon länger Autos auf dem Parkplatz warten
      // (höchstens 2 s am Stück, danach 2,5 s Pause, damit kein Kreis-Stau entsteht)
      // bei langer Schlange darf mehrere Sekunden am Stück ausgefahren werden
      if (d.hold) {
        if (now > d.holdStart + (d.outQ.length >= 3 ? 4.5 : 2)) { d.hold = false; d.holdCool = now + 1.5; }
      } else if (now - Math.max(q.t, d.lastOut || 0) > 0.8 && now > (d.holdCool || 0)) {
        d.hold = true; d.holdStart = now;
      }
      w.holdT[d.acc2] = d.hold ? 1 : 0;
      const hs = q.house;
      const v = tr.trySpawn(d, hs.acc, OPP[hs.dir], 'car', d.outQ.length >= 2 || now - q.t > 2, [d.acc2, d.acc]);
      if (v) {
        d.outQ.shift();
        d.lastOut = now;
        if (d.hold && d.outQ.length < 2) { d.hold = false; d.holdCool = now + 1; }
        w.holdT[d.acc2] = d.hold ? 1 : 0;
        v.house = hs; v.dest = d; v.leg = 'back'; v.color = PALETTE[hs.pi].hex;
      } else if (v === null && now - q.t > 15) {
        // Rückweg dauerhaft abgeschnitten: Auto fährt „über Feldwege“ heim
        d.outQ.shift(); hs.home++;
      }
    }
  }

  intakeBlocked(v) { return false; }

  onArrive(v) {
    const g = this.g;
    if (v.emergency) { g.events.ambulanceArrived(v); return; }
    if (v.leg === 'out') {
      const d = v.dest;
      d.pins = Math.max(0, d.pins - 1);
      d.assigned = Math.max(0, d.assigned - 1);
      d.delivered++;
      d.intakeT = g.time + CFG.intakeEvery;
      g.addScore(1);
      // Kombo
      if (g.time - this.lastDeliver < CFG.comboWindow) this.combo++; else this.combo = 1;
      this.lastDeliver = g.time;
      const clean = v.stops === 0;
      if (clean) this.cleanRun++; else this.cleanRun = 0;
      g.fx.push({ t: 'deliver', b: d, combo: this.combo, clean });
      if (clean && this.cleanRun > 0 && this.cleanRun % CFG.greenWave === 0) g.fx.push({ t: 'greenwave', n: this.cleanRun });
      if (this.combo > 0 && this.combo % 10 === 0) g.fx.push({ t: 'confetti', b: d, combo: this.combo });
      d.outQ.push({ house: v.house, t: g.time + CFG.dwell });
    } else {
      v.house.home++;
      g.fx.push({ t: 'home', b: v.house });
    }
  }

  onVehicleRemoved(v, reason) {
    if (v.emergency) { this.g.events.ambulanceLost(v); return; }
    if (v.leg === 'out' && v.dest) v.dest.assigned = Math.max(0, v.dest.assigned - 1);
    if (v.house) v.house.home++;
    this.g.fx.push({ t: 'poof', x: v.x, y: v.y, z: v.y3d, reason });
  }

  // ---- Diagnose ----------------------------------------------------------------------
  // Jedes Haus erzeugt Bedarf an seinem nächstgelegenen Ziel seiner Farbe – angeschlossen oder nicht
  assignDemand() {
    for (const d of this.dests) { d.nh = 0; d.nhc = 0; }
    for (const h of this.houses) {
      h.conn = false;
      let best = null, bc = Infinity;
      for (const d of this.dests) {
        if (d.pi !== h.pi) continue;
        const c = Math.abs(d.cx - h.x - 0.5) + Math.abs(d.cy - h.y - 0.5);
        if (c < bc) { bc = c; best = d; }
      }
      if (best) best.nh++;
      if (!this.w.link[h.acc]) continue;
      for (const d of this.dests) {
        if (d.pi !== h.pi || !this.w.link[d.acc]) continue;
        if (isFinite(this.pf.field(d.acc)[h.acc])) { h.conn = true; d.nhc++; break; }
      }
    }
  }

  diagnose() {
    const w = this.w, g = this.g;
    this.assignDemand();
    const probs = [];
    for (const J of w.junctions) {
      J.score = (J.score || 0) * 0.82 + J.waitAcc;
      J.totalWait = (J.totalWait || 0) + J.waitAcc;
      J.weekWait = (J.weekWait || 0) + J.waitAcc;
      J.waitAcc = 0;
      for (let h = 0; h < 4; h++) J.waitH[h] *= 0.9;
      for (let k = 0; k < 8; k++) J.why[k] *= 0.88;
      if (J.score < 5) continue;
      if (J.police > 0) continue;
      const cause = junctionCause(J);
      J.cause = cause;
      probs.push({ kind: 'junction', J, i: J.i, x: w.tx(J.i) + 0.5, y: w.ty(J.i) + 0.5, sev: J.score, cause });
    }
    // Schranken/Klappbrücken
    const gw = w.gateWait;
    if (gw) for (const [i, v] of gw) {
      const nv = v * 0.82;
      if (nv < 0.3) { gw.delete(i); continue; }
      gw.set(i, nv);
      if (nv > 5) probs.push({ kind: 'gate', i, x: w.tx(i) + 0.5, y: w.ty(i) + 0.5, sev: nv, cause: 'gate' });
    }
    // Ziele
    for (const d of this.dests) {
      d.cause = null;
      const open = d.pins - d.assigned;
      if (d.pins === 0) continue;
      const field = this.pf.field(d.acc);
      let reach = 0, free = 0, bestRatio = Infinity;
      for (const h of this.houses) {
        if (h.pi !== d.pi) continue;
        const c = field[h.acc];
        if (!isFinite(c)) continue;
        reach++;
        if (h.home > 0) free++;
        const md = Math.abs(h.ax - d.ax) + Math.abs(h.ay - d.ay);
        bestRatio = Math.min(bestRatio, c / (md / CFG.roadSpeed[1] + 1.5));
      }
      d.waitQ = d.outQ.length;
      if (!reach) d.cause = 'nocon';
      else if (d.outQ.length >= 4) d.cause = 'exit';
      else if (open > 0 && !free) d.cause = 'nocar';
      else if (bestRatio > 2.6 && d.pins > 3) d.cause = 'detour';
      else if (open <= 0 && d.pins > d.cap) d.cause = 'jam';
      if (d.cause && (d.pins > 3 || d.ring > 0)) probs.push({ kind: 'dest', b: d, x: d.cx, y: d.cy, sev: 6 + d.pins * 2 + d.ring * 30, cause: d.cause });
    }
    probs.sort((a, b) => b.sev - a.sev);
    this.problems = probs.slice(0, 3);
  }
}
