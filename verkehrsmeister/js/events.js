'use strict';
// ---------------------------------------------------------------------------
// Ereignisse: Baustellen, Krankenwagen, Bahnübergänge, Klappbrücke, Schnee, Messe
// ---------------------------------------------------------------------------

class Events {
  constructor(game) {
    this.g = game;
    this.w = game.world;
    this.rng = new RNG(game.seed * 31 + 17);
    this.works = [];          // {i, t (Restzeit Sperrung) , warn (Vorwarnzeit)}
    this.amb = null;          // {v, route, t0, ideal, preT}
    this.trains = [];         // je Linie {line, t, closed, x}
    this.ships = [];
    this.snow = false;
    this.lastWorksDay = 0;
    this.lastAmbWeek = 0;
    this.lastFairWeek = 0;
    const m = game.def.mech || {};
    if (m.rails && this.w.railLines) {
      this.w.railLines.forEach((L, k) => this.trains.push({ line: L, k, phase: 7 + k * 9, closed: false, pos: -10, dir: k % 2 ? -1 : 1 }));
    }
    if (m.drawbridge) this.ships.push({ phase: 0, open: false, pos: -4 });
  }

  // Tageswechsel: neue Ereignisse planen
  onNewDay() {
    const g = this.g;
    // Schnee
    if (g.def.mech && g.def.mech.snow) {
      const was = this.snow;
      this.snow = g.dayIndex > 1 && this.rng.chance(0.4);
      if (this.snow !== was) g.fx.push({ t: 'snow', on: this.snow });
      if (this.snow) g.fx.push({ t: 'toast', text: 'Schneetag: alle fahren 20 % langsamer.', icon: 'snow' });
    }
    // Baustelle ab Woche 2 (bei Dauerbaustelle jeden Tag)
    const every = g.mods.daily === 'baustelle';
    if ((g.week >= 2 || every) && (every || this.rng.chance(0.5)) && g.dayIndex !== this.lastWorksDay) {
      const i = this.pickWorksTile();
      if (i >= 0) { this.lastWorksDay = g.dayIndex; this.works.push({ i, warn: CFG.dayLen * 0.5, t: CFG.dayLen }); g.fx.push({ t: 'works', i, phase: 'warn' }); g.fx.push({ t: 'toast', text: 'Baustelle angekündigt – die Straße wird bald gesperrt.', icon: 'works', at: i }); }
    }
    // Krankenwagen ab Woche 2, jede zweite Woche
    if (g.week >= 2 && g.week % 2 === 0 && g.day === 3 && this.lastAmbWeek !== g.week) {
      this.lastAmbWeek = g.week;
      this.ambPending = 8 + this.rng.range(0, 6);
    }
    // Messe
    if (g.def.mech && g.def.mech.fair && g.week >= 2 && g.day === 3 && this.lastFairWeek !== g.week) {
      this.lastFairWeek = g.week;
      this.fairPending = 6;
    }
  }

  pickWorksTile() {
    const w = this.w;
    const cands = [];
    for (let i = 0; i < w.n; i++) {
      if (!w.road[i] || w.isJ[i] || w.accOf[i] >= 0 || w.closed[i] || w.up[i]) continue;
      if (w.flags[i] & (F_BRIDGE | F_TUNNEL | F_CROSSING)) continue;
      if (popcount4(w.link[i]) !== 2) continue;
      cands.push({ i, f: w.flowCnt[i] + this.rng.next() * 5 });
    }
    cands.sort((a, b) => b.f - a.f);
    // nur sperren, wenn alle Häuser/Ziele weiter erreichbar bleiben
    for (let k = 0; k < Math.min(12, cands.length); k++) {
      const i = cands[k].i;
      if (this.keepsConnected(i)) return i;
    }
    return -1;
  }

  keepsConnected(block) {
    const w = this.w;
    w.ensureComponents();
    const before = new Map();
    const blds = this.g.city.houses.concat(this.g.city.dests).filter(b => w.link[b.acc]);
    for (const b of blds) before.set(b, w.comp[b.acc]);
    // BFS ohne die gesperrte Kachel
    const seen = new Int32Array(w.N).fill(-1);
    let c = 0;
    for (const b of blds) {
      if (seen[b.acc] >= 0) continue;
      const st = [b.acc]; seen[b.acc] = c;
      while (st.length) {
        const k = st.pop();
        for (let d = 0; d < 4; d++) {
          if (!((w.link[k] >> d) & 1)) continue;
          const j = w.nb(k, d);
          if (j < 0 || j === block || seen[j] >= 0) continue;
          seen[j] = c; st.push(j);
        }
      }
      c++;
    }
    // Zwei Gebäude, die vorher zusammenhingen, müssen es weiterhin tun
    for (const a of blds) for (const b of blds) {
      if (a === b || before.get(a) !== before.get(b)) continue;
      if (seen[a.acc] !== seen[b.acc]) return false;
    }
    return true;
  }

  step(dt) {
    const g = this.g, w = this.w;
    // Baustellen
    for (let k = this.works.length - 1; k >= 0; k--) {
      const s = this.works[k];
      if (!w.road[s.i]) { this.works.splice(k, 1); w.closed[s.i] = 0; g.fx.push({ t: 'works', i: s.i, phase: 'end' }); continue; }
      if (s.warn > 0) {
        s.warn -= dt;
        if (s.warn <= 0) { w.closed[s.i] = 1; g.traffic.onTilesChanged([s.i]); g.fx.push({ t: 'works', i: s.i, phase: 'closed' }); }
      } else {
        s.t -= dt;
        if (s.t <= 0) { w.closed[s.i] = 0; this.works.splice(k, 1); g.traffic.onTilesChanged([s.i]); g.fx.push({ t: 'works', i: s.i, phase: 'end' }); }
      }
    }
    // Krankenwagen
    if (this.ambPending !== undefined && g.phase === 'day') {
      this.ambPending -= dt;
      if (this.ambPending <= 0) { this.ambPending = undefined; this.prepareAmbulance(); }
    }
    if (this.amb && this.amb.preT > 0) {
      this.amb.preT -= dt;
      if (this.amb.preT <= 0) this.launchAmbulance();
    }
    // Messe
    if (this.fairPending !== undefined && g.phase === 'day') {
      this.fairPending -= dt;
      if (this.fairPending <= 0) { this.fairPending = undefined; this.startFair(); }
    }
    // Züge
    for (const T of this.trains) {
      const period = 20;
      const ph = ((g.time + T.phase) % period);
      const bell = ph > period - 7 && ph < period - 4;
      const closed = ph >= period - 4;
      if (bell && !T.bell) g.fx.push({ t: 'bell', line: T.line });
      T.bell = bell;
      if (closed !== T.closed) {
        T.closed = closed;
        this.setGate(i => w.rail[i] && (T.line.vert ? w.tx(i) === T.line.at : w.ty(i) === T.line.at) && (w.flags[i] & F_CROSSING), closed);
      }
      // Zugposition entlang der Linie (Kacheln), fährt während der Sperrung durch
      const tt = ph - (period - 5.5);
      T.pos = tt > 0 ? -6 + tt / 6.5 * (w.w + 12) : -50;
    }
    // Schiff fährt gleichmäßig den Kanal entlang; jede Klappbrücke öffnet nur, solange es in der Nähe ist
    if (this.ships.length && this.drawKey !== w.topo) {
      this.drawKey = w.topo;
      this.drawTiles = [];
      for (let i = 0; i < w.n; i++) if (w.road[i] && (w.flags[i] & F_DRAW)) this.drawTiles.push(i);
    }
    for (const S of this.ships) {
      const period = 30;
      const ph = (g.time + S.phase) % period;
      S.pos = -4 + ph / period * (w.w + 8);
      let any = false;
      for (const i of this.drawTiles) {
        const tx = w.tx(i) + 0.5;
        const open = S.pos > tx - 6 && S.pos < tx + 2;
        if (open) any = true;
        w.gate[i] = open ? 1 : 0;
      }
      if (any && !S.open) g.fx.push({ t: 'horn' });
      S.open = any;
    }
    g.traffic.speedMul = (this.snow ? 0.8 : 1) * (g.mods.daily === 'schnee' ? 0.85 : 1);
  }

  setGate(pred, on) {
    const w = this.w;
    for (let i = 0; i < w.n; i++) if (w.road[i] && pred(i)) w.gate[i] = on ? 1 : 0;
  }

  // ---- Krankenwagen ---------------------------------------------------------------
  prepareAmbulance() {
    const g = this.g, w = this.w, city = g.city;
    const base = city.dests.find(d => d.pi === 1 && w.link[d.acc]) || city.dests.filter(d => w.link[d.acc]).sort((a, b) => b.delivered - a.delivered)[0];
    if (!base) return;
    // fernes, erreichbares Haus
    const cands = city.houses.filter(h => w.link[h.acc]).map(h => ({ h, d: Math.abs(h.ax - base.ax) + Math.abs(h.ay - base.ay) })).filter(o => o.d >= 5).sort((a, b) => b.d - a.d).slice(0, 6);
    for (const c of cands) {
      const route = g.traffic.pf.find(base.acc2, base.dir, c.h.acc);
      if (!route) continue;
      route.push(OPP[c.h.dir]);
      this.amb = { base, target: c.h, route, preT: 5, v: null };
      g.fx.push({ t: 'ambulance', phase: 'warn', amb: this.amb });
      g.fx.push({ t: 'toast', text: 'Notruf! Gleich fährt ein Krankenwagen – halte ihm den Weg frei.', icon: 'amb' });
      return;
    }
  }

  launchAmbulance() {
    const g = this.g, A = this.amb;
    const v = g.traffic.trySpawn(A.base, A.target.acc, OPP[A.target.dir], 'amb', true, [A.base.acc2, A.base.acc]);
    if (!v) { A.preT = 0.5; return; }
    v.color = '#ffffff';
    v.house = A.target; v.dest = null; v.leg = 'amb';
    A.v = v; A.t0 = g.time; A.ideal = Math.max(4, g.traffic.pf.routeTime(A.base.acc2, A.base.dir, A.route) * 0.75 + 2);
    g.fx.push({ t: 'ambulance', phase: 'go', amb: A });
  }

  ambulanceArrived(v) {
    const g = this.g, A = this.amb;
    if (!A || A.v !== v) return;
    const dt = g.time - A.t0;
    if (dt <= A.ideal * 1.8) {
      g.addScore(25);
      g.fx.push({ t: 'ambulance', phase: 'saved', amb: A, time: dt });
    } else {
      A.base.ring = Math.min(0.95, A.base.ring + 0.25);
      g.fx.push({ t: 'ambulance', phase: 'late', amb: A, time: dt });
    }
    this.amb = null;
  }

  ambulanceLost(v) {
    if (this.amb && this.amb.v === v) { this.g.fx.push({ t: 'ambulance', phase: 'late', amb: this.amb }); this.amb = null; }
  }

  // ---- Messe ------------------------------------------------------------------------
  startFair() {
    const g = this.g, city = g.city;
    const d = city.dests.filter(x => g.world.link[x.acc]).sort((a, b) => b.delivered - a.delivered)[0];
    if (!d) return;
    d.fair = 90; d.fairPins = 15; d.cap = (d.parking ? 9 : CFG.pinCap) + 15;
    g.fx.push({ t: 'toast', text: 'Messe! 15 Aufträge auf einmal für ' + PALETTE[d.pi].name + '.', icon: 'fair', at: d.acc });
    g.fx.push({ t: 'fair', b: d });
  }
}
