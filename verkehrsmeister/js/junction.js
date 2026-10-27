'use strict';
// ---------------------------------------------------------------------------
// Kreuzungssteuerung: rechts vor links, Vorfahrt (per Wisch), adaptive Ampel,
// Kreisverkehr und Polizei-Einsatz (befristet, regelt alles von Hand)
// ---------------------------------------------------------------------------

const JTYPE_NAME = { auto: 'Rechts vor links', priority: 'Vorfahrtsstraße', light: 'Ampel', roundabout: 'Kreisverkehr' };

class Junction {
  constructor(world, i) {
    this.w = world; this.i = i;
    this.type = 'auto';
    this.occ = [];
    this.appr = [];
    this.mainArms = 0;
    this.lightMain = -1;       // 0 = Nord-Süd, 1 = West-Ost bekommt doppelt Grün
    this.light = null;
    this.police = 0;           // Restzeit Polizei-Einsatz
    this.waitEma = new Float32Array(4);
    this.waitH = new Float32Array(4);   // aufsummierte Wartezeit je Zufahrt (für Diagnose)
    this.why = new Float32Array(8);     // Wartezeit je Blockiergrund (für Diagnose)
    this.waitAcc = 0;
    this.pass = 0;
    this.demand = 0; this.demandNear = 0; this.extDemand = 0;
    this.offMask = -1;
    world.junctions.add(this);
    this.onTopologyChange();
  }

  destroy() {
    for (const o of this.occ) { const k = o.v.grants.indexOf(this.i); if (k >= 0) o.v.grants.splice(k, 1); }
    this.occ.length = 0;
    this.w.junctions.delete(this);
  }

  onTopologyChange() {
    const w = this.w, i = this.i;
    this.offMask = w.two[i];
    this.conf = conflictTable(this.offMask);
    this.arms = w.link[i];
    let inMask = 0;
    for (let s = 0; s < 4; s++) {
      if (!((w.link[i] >> s) & 1)) continue;
      const j = w.nb(i, s);
      if (j >= 0 && w.road[j] && ((w.out[j] >> OPP[s]) & 1)) inMask |= 1 << OPP[s];
    }
    this.inMask = inMask;
    if (this.type === 'priority') {
      this.mainArms &= this.arms;
      if (popcount4(this.mainArms) < 2) this.mainArms = this.defaultMain();
    }
    if (this.light) this.light.phases = this.lightPhases();
  }

  setType(t) {
    if (t === this.type) return;
    const prevMain = this.type === 'priority' ? this.mainArms : 0;
    this.type = t;
    if (t === 'light') {
      this.light = { phases: [], idx: 0, stage: 0, t: 0 };
      this.light.phases = this.lightPhases();
      if (prevMain) this.lightMain = (prevMain & 0b0101) === 0b0101 ? 0 : ((prevMain & 0b1010) === 0b1010 ? 1 : -1);
    } else this.light = null;
    if (t === 'priority' && popcount4(this.mainArms & this.arms) < 2) this.mainArms = this.defaultMain();
    this.onTopologyChange();
  }

  defaultMain() {
    const a = this.arms;
    const ns = ((a >> 0) & 1) + ((a >> 2) & 1), ew = ((a >> 1) & 1) + ((a >> 3) & 1);
    if (ns === 2 && ew < 2) return 0b0101;
    if (ew === 2 && ns < 2) return 0b1010;
    if (ns === 2) return 0b0101;
    let m = 0, c = 0;
    for (let s = 0; s < 4 && c < 2; s++) if ((a >> s) & 1) { m |= 1 << s; c++; }
    return m;
  }

  // Vorfahrt per Wisch: Fahrt von Seite a nach Seite b wird Hauptstraße
  setMain(a, b) {
    if (this.type === 'roundabout') return false;
    if (!((this.arms >> a) & 1) || !((this.arms >> b) & 1) || a === b) return false;
    if (this.type === 'light') { this.lightMain = a & 1 ? 1 : 0; return true; }
    this.type = 'priority';
    this.mainArms = (1 << a) | (1 << b);
    this.onTopologyChange();
    return true;
  }

  isMain(h) { return this.type === 'priority' && ((this.mainArms >> OPP[h]) & 1) === 1; }

  // ---- Ampel (adaptiv, zwei Achsen) -----------------------------------------------
  lightPhases() {
    const inM = this.inMask || 0b1111;
    const ph = [];
    if ((inM & 0b0101)) ph.push({ axis: 0, hs: inM & 0b0101 });
    if ((inM & 0b1010)) ph.push({ axis: 1, hs: inM & 0b1010 });
    if (!ph.length) ph.push({ axis: 0, hs: 0b1111 });
    return ph;
  }

  lightTimes() {
    const gw = this.w.mods && this.w.mods.greenWave;
    return { yellow: gw ? 0.6 : CFG.yellow, allRed: gw ? 0.2 : CFG.allRed };
  }

  updateLight(dt) {
    const L = this.light;
    if (!L || !L.phases.length) return;
    const T = this.lightTimes();
    L.t += dt;
    if (L.idx >= L.phases.length) { L.idx = 0; L.stage = 0; L.t = 0; }
    const ph = L.phases[L.idx];
    if (L.stage === 0) {
      const main = this.lightMain === ph.axis, side = this.lightMain >= 0 && !main;
      const minG = main ? 5 : 2.5, maxG = main ? 22 : (side ? 8 : 11);
      const other = this.demand & ~(1 << L.idx);
      const near = (this.demandNear >> L.idx) & 1;
      if (L.t >= minG && other && (!near || L.t >= maxG)) { L.stage = 1; L.t = 0; }
    } else if (L.stage === 1) {
      if (L.t >= T.yellow) { L.stage = 2; L.t = 0; }
    } else if (L.t >= T.allRed) {
      const n = L.phases.length;
      let next = (L.idx + 1) % n;
      for (let k = 1; k <= n; k++) { const c = (L.idx + k) % n; if ((this.demand >> c) & 1) { next = c; break; } }
      L.idx = next; L.stage = 0; L.t = 0;
    }
  }

  lightActive() { return this.type === 'light' && this.police <= 0 && this.light && this.light.phases.length > 0; }

  // 0 = rot, 1 = gelb, 2 = grün
  sigFor(h) {
    const L = this.light, ph = L.phases[L.idx];
    if (!ph || !((ph.hs >> h) & 1)) return 0;
    return L.stage === 0 ? 2 : (L.stage === 1 ? 1 : 0);
  }

  // ---- Entscheidung ------------------------------------------------------------------
  occConflict(r) {
    const pol = this.police > 0;
    for (let k = 0; k < this.occ.length; k++) {
      const o = this.occ[k];
      if (o.v === r.v || !this.conf[r.m * 16 + o.m]) continue;
      // Polizei winkt durch: wer seinen Kreuzungspunkt schon passiert hat, stört nicht mehr
      if (pol && o.v.t === this.i && o.v.s > o.v.p.len * 0.55) continue;
      return true;
    }
    return false;
  }

  // Rechts vor links: bei Querverkehr erst fast anhalten, dann einfahren („kurzes Zögern“)
  hesitate(r) {
    if (this.type !== 'auto' || this.police > 0 || r.v.emergency || r.v.v < 0.12) return false;
    for (const a of this.appr) if (a.v !== r.v && a.h !== r.h && a.tta < 2.0) return true;
    for (const o of this.occ) if (o.v !== r.v && o.h !== r.h && o.v.t === this.i) return true;
    return false;
  }

  ringBlocked(r) {
    const w = this.w, i = this.i;
    if (this.occ.length >= 4) return true;
    const P = pathAt(w, i, r.h, r.d);
    const phiIn = P.phiIn;
    const toDeg = 180 / Math.PI / CFG.ringR;
    for (let k = 0; k < this.occ.length; k++) {
      const o = this.occ[k];
      if (o.v === r.v) continue;
      if (o.h === r.h && o.v.t !== i) continue;
      let phiC, rem;
      if (o.v.t === i && o.v.p && o.v.p.round) {
        const op = o.v.p;
        if (o.v.s > op.ringS1) continue;
        if (o.v.s >= op.ringS0) { phiC = op.phiIn + (o.v.s - op.ringS0) * toDeg; rem = op.phiOut - phiC; }
        else { phiC = op.phiIn; rem = op.phiOut - op.phiIn; }
      } else {
        const oP = pathAt(w, i, o.h, o.d);
        phiC = oP.phiIn; rem = oP.phiOut - oP.phiIn;
      }
      const delta = degNorm(phiIn - phiC);
      if (delta <= 0 && delta > -40) return true;
      if (delta > 0 && delta < 150 && rem > delta - 12) return true;
    }
    return false;
  }

  exitOk(r, traffic) {
    if (r.exitDrive) return true;
    const w = this.w;
    const k = w.nb(this.i, r.d);
    if (k < 0 || !w.road[k] || w.closed[k] || w.gate[k]) return false;
    const L = traffic.lanes[k * 4 + r.d];
    let free = 1.0;
    if (L && L.length) { const last = L[L.length - 1]; free = last.s - last.len * 0.5; }
    if (!w.isJ[k] && traffic.drv[k] > 0 && traffic.drvBlocks(k, r.d, r.d2 >= 0 ? r.d2 : r.d)) free = Math.min(free, 0);
    for (let q = 0; q < this.occ.length; q++) {
      const o = this.occ[q];
      if (o.d === r.d && o.v !== r.v && o.v.t !== k) free -= o.v.len + CFG.gap;
    }
    return free - CFG.gap >= r.v.len;
  }

  // Ziel lässt gerade Autos vom Parkplatz ausfahren: Einfahrende warten
  heldOut(r) {
    const w = this.w;
    if (r.v.emergency) return false;
    if (w.holdT[this.i]) return true;
    if (r.exitDrive) return false;
    const k = w.nb(this.i, r.d);
    return k >= 0 && w.holdT[k] === 1;
  }

  // Blockiergründe (für die Diagnose): 1 gesperrt, 2 Rot, 3 Kreuzung belegt, 4 Ausfahrt voll, 5 Zögern, 6 Vorfahrt achten, 7 Folgekreuzung
  hardBlocked(r, traffic) {
    r.why = 0;
    if (this.w.closed[this.i] || this.heldOut(r)) { r.why = 1; return true; }
    if (this.lightActive() && !r.v.emergency) {
      const sg = this.sigFor(r.h);
      if (sg === 0) { r.why = 2; return true; }
      if (sg === 1) {
        const stopDist = r.v.v * r.v.v / (2 * 3.2) + 0.05;
        if (r.dist > stopDist || r.v.v < 0.3) { r.why = 2; return true; }
      }
    }
    if (this.type === 'roundabout') { if (this.ringBlocked(r)) { r.why = 3; return true; } }
    else if (this.occConflict(r)) { r.why = 3; return true; }
    if (!this.exitOk(r, traffic)) { r.why = 4; return true; }
    if (this.hesitate(r)) { r.why = 5; return true; }
    return false;
  }

  rvl(a, r) {
    const rel = (a.h - r.h + 4) & 3;
    if (rel === 2) return (r.tt === TT_LEFT || r.tt === TT_UTURN) && (a.tt === TT_STRAIGHT || a.tt === TT_RIGHT);
    if (rel === 3) return true;
    return false;
  }

  hasPriority(a, r) {
    if (a.v.emergency && !r.v.emergency) return true;
    if (r.v.emergency) return false;
    if (this.type === 'roundabout') return false;
    if (this.lightActive()) {
      if (this.sigFor(a.h) === 0) return false;
      return this.rvl(a, r);
    }
    if (this.type === 'priority') {
      const ma = this.isMain(a.h), mr = this.isMain(r.h);
      if (ma && !mr) return true;
      if (!ma && mr) return false;
    }
    return this.rvl(a, r);
  }

  mustYield(r) {
    if (this.police > 0) return false;
    const A = this.appr;
    for (let k = 0; k < A.length; k++) {
      const a = A[k];
      if (a.v === r.v || a.granted || a.hard) continue;
      if (this.type !== 'roundabout' && !this.conf[r.m * 16 + a.m]) continue;
      if (!a.isReq && a.tta > CFG.yieldWindow * (a.v.emergency ? 2.5 : 1)) continue;
      if (this.lightActive() && !a.v.emergency && this.sigFor(a.h) === 0) continue;
      if (this.hasPriority(a, r)) return true;
    }
    return false;
  }

  // Anfrage aus einer Kreuzungskette: rote Ampel merkt sich den Bedarf trotzdem
  noteDemand(r) {
    if (!this.lightActive() || r.v.emergency) return;
    const ph = this.light.phases;
    for (let p = 0; p < ph.length; p++) if ((ph[p].hs >> r.h) & 1) this.extDemand |= 1 << p;
  }

  canAcceptDry(r, traffic) {
    if (this.w.closed[this.i] || this.heldOut(r)) return false;
    if (this.lightActive() && !r.v.emergency && this.sigFor(r.h) !== 2) return false;
    if (this.type === 'roundabout') { if (this.ringBlocked(r)) return false; }
    else if (this.occConflict(r)) return false;
    if (!this.exitOk(r, traffic)) return false;
    if (this.police > 0) return true;
    for (const a of this.appr) {
      if (!a.isReq || a.granted || a.v === r.v) continue;
      if (this.type !== 'roundabout' && !this.conf[r.m * 16 + a.m]) continue;
      if (this.hasPriority(a, r)) return false;
    }
    return true;
  }

  chainInfo(r) {
    const w = this.w;
    const out = this._chainList || (this._chainList = []);
    out.length = 0;
    if (r.exitDrive) return out;
    const v = r.v;
    const pool = this._cpool || (this._cpool = []);
    let tile = this.i, dir = r.d, ri = r.ri2, dist = r.dist + 1;
    for (let depth = 0; depth < 4; depth++) {
      const k = w.nb(tile, dir);
      if (k < 0 || !w.isJ[k] || !w.jc[k] || v.grants.indexOf(k) >= 0) break;
      const nd = v.route[ri];
      if (nd === undefined) break;
      let c = pool[depth];
      if (!c) c = pool[depth] = { v: null, h: 0, d: 0, m: 0, tt: 0, dist: 0, tta: 0, exitDrive: false, isReq: true, granted: false, hard: false, ri2: 0, wait: 0, d2: -1 };
      c.v = v; c.h = dir; c.d = nd; c.m = dir * 4 + nd; c.tt = turnOf(dir, nd);
      c.dist = dist; c.tta = r.tta + depth + 1; c.ri2 = ri + 1;
      const d2 = v.route[ri + 1]; c.d2 = d2 === undefined ? -1 : d2;
      c.exitDrive = (k === v.goal && nd === v.goalDrive);
      out.push({ J: w.jc[k], r: c });
      if (c.exitDrive) break;
      tile = k; dir = nd; ri++; dist += 1;
    }
    return out;
  }

  chainOk(list, traffic) {
    for (let k = 0; k < list.length; k++) list[k].J.noteDemand(list[k].r);
    for (let k = 0; k < list.length; k++) if (!list[k].J.canAcceptDry(list[k].r, traffic)) return false;
    return true;
  }

  grant(r, chain) {
    this.occ.push({ v: r.v, m: r.m, h: r.h, d: r.d });
    r.v.grants.push(this.i);
    r.granted = true;
    this.waitEma[r.h] = this.waitEma[r.h] * 0.85 + r.wait * 0.15;
    r.v.reqWait = 0;
    if (chain) for (let k = 0; k < chain.length; k++) {
      const it = chain[k];
      it.J.occ.push({ v: r.v, m: it.r.m, h: it.r.h, d: it.r.d });
      r.v.grants.push(it.J.i);
    }
  }

  // Notventil: echte Patt-Situationen nach Wartezeit auflösen („Nach Ihnen!“)
  forceable(r) {
    const w = this.w;
    if (w.closed[this.i]) return false;
    if (w.isJ[r.v.t] && r.v.t !== this.i && r.wait > 4) return true;
    if (r.wait > 12) {
      for (const o of this.occ) if (o.v.v > 0.05 || o.v.stuck < 4) return false;
      return true;
    }
    return false;
  }

  decide(traffic, dt) {
    const A = this.appr;
    if (this.police > 0) this.police = Math.max(0, this.police - dt);
    if (this.type === 'light' && this.light) {
      let dem = 0, near = 0;
      const ph = this.light.phases;
      for (const a of A) {
        for (let p = 0; p < ph.length; p++) {
          if ((ph[p].hs >> a.h) & 1) { dem |= 1 << p; if (a.tta < 3.2) near |= 1 << p; }
        }
      }
      dem |= this.extDemand; near |= this.extDemand; this.extDemand = 0;
      this.demand = dem; this.demandNear = near;
    }
    if (!A.length) return;
    const R = this._req || (this._req = []);
    R.length = 0;
    for (const a of A) {
      a.granted = false; a.hard = false;
      if (a.isReq) R.push(a);
    }
    if (!R.length) { A.length = 0; return; }
    for (const r of R) {
      r.prio = (r.v.emergency ? 4 : 0) + (this.isMain(r.h) ? 1 : 0);
      r.hard = this.hardBlocked(r, traffic);
    }
    if (R.length > 1) R.sort((a, b) => (b.prio - a.prio) || (b.wait - a.wait));
    let any = false, yieldOnly = null;
    for (const r of R) {
      if (r.hard) continue;
      if (this.type === 'roundabout' ? this.ringBlocked(r) : this.occConflict(r)) { r.hard = true; r.why = 3; continue; }
      if (!this.exitOk(r, traffic)) { r.hard = true; r.why = 4; continue; }
      if (this.mustYield(r)) {
        r.why = 6;
        if (!yieldOnly || r.wait > yieldOnly.wait) yieldOnly = r;
        continue;
      }
      const ch = this.chainInfo(r);
      if (ch.length && !this.chainOk(ch, traffic)) { r.hard = true; r.why = 7; continue; }
      this.grant(r, ch);
      any = true;
    }
    for (const r of R) {
      if (r.granted || !this.forceable(r)) continue;
      const ch = this.chainInfo(r);
      this.grant(r, ch);
      r.v.ghost = 3;
      any = true;
      if (this.w.emit) this.w.emit('valve', this);
      break;
    }
    if (!any && yieldOnly && this.occ.length === 0 && yieldOnly.wait > 0.9) {
      const ch = this.chainInfo(yieldOnly);
      if (!ch.length || this.chainOk(ch, traffic)) this.grant(yieldOnly, ch);
    }
    // Wartezeit für die Diagnose
    for (const r of R) if (!r.granted) { this.waitAcc += dt; this.waitH[r.h] += dt; this.why[r.why || 0] += dt; }
    A.length = 0;
  }

  release(v) {
    for (let k = 0; k < this.occ.length; k++) {
      if (this.occ[k].v === v) { this.occ.splice(k, 1); break; }
    }
    this.pass++;
  }

  // Erwartete Zusatzzeit für die Routenplanung
  penalty(h, d) {
    const tt = turnOf(h, d);
    let p;
    if (this.police > 0) p = 0.2;
    else if (this.type === 'roundabout') p = 0.45;
    else if (this.lightActive()) p = 1.6;
    else if (this.type === 'priority') p = this.isMain(h) ? 0.1 : 0.9;
    else p = 0.7;
    if (tt === TT_LEFT) p += 0.35;
    if (tt === TT_UTURN) p += 2;
    return p + Math.min(25, this.waitEma[h]) * 0.7;
  }
}
