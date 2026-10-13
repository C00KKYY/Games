'use strict';
// ---------------------------------------------------------------------------
// Kreuzungssteuerung: rechts vor links, Vorfahrtsschilder, Ampel, Kreisverkehr
// ---------------------------------------------------------------------------

const ALL_TURNS = (1 << TT_STRAIGHT) | (1 << TT_RIGHT) | (1 << TT_LEFT) | (1 << TT_UTURN);
const SR_TURNS = (1 << TT_STRAIGHT) | (1 << TT_RIGHT);
const L_TURNS = (1 << TT_LEFT) | (1 << TT_UTURN);
const JTYPE_NAME = { auto: 'Rechts vor links', priority: 'Vorfahrtsstraße', light: 'Ampel', roundabout: 'Kreisverkehr' };

class Junction {
  constructor(world, i) {
    this.w = world; this.i = i;
    this.type = 'auto';
    this.occ = [];          // zugelassene Fahrzeuge {v, m, h, d}
    this.appr = [];         // Annäherungen in diesem Schritt
    this.mainArms = 0;      // Seiten (Arme) der Hauptstraße
    this.light = null;
    this.off = false;       // Stromausfall
    this.waitEma = new Float32Array(4);
    this.passCnt = 0;       // Durchfahrten seit letzter Stunde
    this.flowHr = 0;        // Durchfahrten pro Spielstunde (geglättet)
    this.demand = 0; this.demandNear = 0;
    this.lastGrant = 0;
    this.accidents = 0;
    this.offMask = -1;
    if (!world.junctions) world.junctions = new Set();
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
    // Einfahrtsrichtungen: von Seite s kommend fährt man mit Richtung OPP[s]
    let inMask = 0;
    for (let s = 0; s < 4; s++) {
      const j = w.nb(i, s);
      if (j >= 0 && w.road[j] && ((w.out[j] >> OPP[s]) & 1)) inMask |= 1 << OPP[s];
    }
    this.inMask = inMask;
    if (this.type === 'priority') this.mainArms &= this.arms;
    if (this.type === 'priority' && popcount4(this.mainArms) < 2) this.mainArms = this.defaultMain();
    // Zugelassene Fahrzeuge, deren Bewegung nicht mehr möglich ist, behalten ihre Zulassung (sie werden umgeleitet)
  }

  // ---- Typwechsel ---------------------------------------------------------------
  setType(t) {
    if (t === this.type) return;
    this.type = t;
    if (t === 'light' && !this.light) this.light = this.makeLight('axis');
    if (t === 'priority') this.mainArms = this.defaultMain();
    if (t !== 'light') this.light = null;
    this.onTopologyChange();
  }

  defaultMain() {
    const w = this.w, i = this.i, a = this.arms;
    const ns = ((a >> 0) & 1) + ((a >> 2) & 1), ew = ((a >> 1) & 1) + ((a >> 3) & 1);
    const cls = s => { const j = w.nb(i, s); return j >= 0 ? w.road[j] : 0; };
    const nsCls = cls(0) + cls(2), ewCls = cls(1) + cls(3);
    if (ns === 2 && (ew < 2 || nsCls >= ewCls)) return 0b0101;
    if (ew === 2) return 0b1010;
    // Abknickende Vorfahrt als Notlösung
    let m = 0, c = 0;
    for (let s = 0; s < 4 && c < 2; s++) if ((a >> s) & 1) { m |= 1 << s; c++; }
    return m;
  }

  cycleMain() {
    // Reihenfolge möglicher Hauptstraßen (Paare von Armen)
    const pairs = [0b0101, 0b1010, 0b0011, 0b0110, 0b1100, 0b1001];
    const valid = pairs.filter(p => (p & this.arms) === p);
    if (!valid.length) return;
    const k = valid.indexOf(this.mainArms);
    this.mainArms = valid[(k + 1) % valid.length];
  }

  isMain(h) { return this.type === 'priority' && ((this.mainArms >> OPP[h]) & 1) === 1; }

  // ---- Ampel ---------------------------------------------------------------------
  makeLight(preset) {
    return { phases: this.presetPhases(preset), offset: 0, smart: false, idx: 0, stage: 0, t: 0, rem: 0 };
  }

  presetPhases(preset) {
    const inM = this.inMask || 0b1111;
    const has = h => (inM >> h) & 1;
    const allow = (hs, turns) => { const a = [0, 0, 0, 0]; for (const h of hs) if (has(h)) a[h] = turns; return a; };
    const ns = [0, 2], ew = [1, 3];
    const nsAny = has(0) || has(2), ewAny = has(1) || has(3);
    let ph = [];
    if (preset === 'left') {
      if (nsAny) { ph.push({ g: 14, allow: allow(ns, SR_TURNS) }); ph.push({ g: 7, allow: allow(ns, L_TURNS) }); }
      if (ewAny) { ph.push({ g: 14, allow: allow(ew, SR_TURNS) }); ph.push({ g: 7, allow: allow(ew, L_TURNS) }); }
    } else if (preset === 'each') {
      for (let h = 0; h < 4; h++) if (has(h)) ph.push({ g: 9, allow: allow([h], ALL_TURNS) });
    } else {
      if (nsAny) ph.push({ g: 15, allow: allow(ns, ALL_TURNS) });
      if (ewAny) ph.push({ g: 15, allow: allow(ew, ALL_TURNS) });
    }
    if (!ph.length) ph.push({ g: 15, allow: [ALL_TURNS, ALL_TURNS, ALL_TURNS, ALL_TURNS] });
    return ph;
  }

  cycleLen() {
    const L = this.light;
    let c = 0;
    for (const p of L.phases) c += p.g + CFG.yellow + CFG.allRed;
    return c;
  }

  updateLight(now, dt) {
    const L = this.light;
    if (!L || !L.phases.length) return;
    if (!L.smart) {
      const cyc = this.cycleLen();
      let tc = ((now + L.offset) % cyc + cyc) % cyc;
      for (let k = 0; k < L.phases.length; k++) {
        const g = L.phases[k].g, seg = g + CFG.yellow + CFG.allRed;
        if (tc < seg) {
          L.idx = k;
          if (tc < g) { L.stage = 0; L.t = tc; L.rem = g - tc; }
          else if (tc < g + CFG.yellow) { L.stage = 1; L.t = tc - g; L.rem = g + CFG.yellow - tc; }
          else { L.stage = 2; L.t = tc - g - CFG.yellow; L.rem = seg - tc; }
          break;
        }
        tc -= seg;
      }
      return;
    }
    // Adaptive Steuerung
    L.t += dt;
    if (L.idx >= L.phases.length) { L.idx = 0; L.stage = 0; L.t = 0; }
    const ph = L.phases[L.idx];
    if (L.stage === 0) {
      const other = this.demand & ~(1 << L.idx);
      const near = (this.demandNear >> L.idx) & 1;
      const maxG = Math.max(ph.g * 1.8, 12);
      if (L.t >= 4.5 && other && (!near || L.t >= maxG)) { L.stage = 1; L.t = 0; }
      L.rem = Math.max(0, maxG - L.t);
    } else if (L.stage === 1) {
      if (L.t >= CFG.yellow) { L.stage = 2; L.t = 0; }
      L.rem = CFG.yellow - L.t;
    } else {
      if (L.t >= CFG.allRed) {
        const n = L.phases.length;
        let next = (L.idx + 1) % n;
        for (let k = 1; k <= n; k++) {
          const c = (L.idx + k) % n;
          if ((this.demand >> c) & 1) { next = c; break; }
        }
        L.idx = next; L.stage = 0; L.t = 0;
      }
      L.rem = CFG.allRed - L.t;
    }
  }

  lightActive() { return this.type === 'light' && !this.off && this.light && this.light.phases.length > 0; }

  // 0 = rot, 1 = gelb, 2 = grün
  sigFor(h, tt) {
    const L = this.light;
    const ph = L.phases[L.idx];
    if (!ph) return 0;
    const ok = (ph.allow[h] >> tt) & 1;
    if (!ok) return 0;
    return L.stage === 0 ? 2 : (L.stage === 1 ? 1 : 0);
  }
  // Anzeige pro Zufahrt: Hauptsignal und ob Linkspfeil geschützt ist
  signalHead(h) {
    if (!this.lightActive()) return null;
    const L = this.light, ph = L.phases[L.idx];
    const a = ph ? ph.allow[h] : 0;
    const anyGo = (a & SR_TURNS) !== 0, leftGo = (a & (1 << TT_LEFT)) !== 0;
    const col = L.stage === 0 ? 2 : (L.stage === 1 ? 1 : 0);
    const oncoming = ph ? ph.allow[OPP[h]] & SR_TURNS : 0;
    return {
      main: anyGo ? col : 0,
      left: leftGo ? col : 0,
      leftProtected: leftGo && !oncoming,
    };
  }

  // ---- Entscheidung ---------------------------------------------------------------
  conflicts(m1, m2) { return this.conf[m1 * 16 + m2] === 1; }

  occConflict(r) {
    for (let k = 0; k < this.occ.length; k++) {
      const o = this.occ[k];
      if (o.v !== r.v && this.conf[r.m * 16 + o.m]) return true;
    }
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
    if (k < 0 || !w.road[k] || w.closed[k]) return false;
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

  // Ist Bewegung r durch Signale / Belegung hart blockiert?
  hardBlocked(r, traffic) {
    if (this.w.closed[this.i]) return true;
    if (this.lightActive() && !r.v.emergency) {
      const sg = this.sigFor(r.h, r.tt);
      if (sg === 0) return true;
      if (sg === 1) {
        const stopDist = r.v.v * r.v.v / (2 * 3.2) + 0.05;
        if (r.dist > stopDist || r.v.v < 0.3) return true;
      }
    }
    if (this.type === 'roundabout') { if (this.ringBlocked(r)) return true; }
    else if (this.occConflict(r)) return true;
    if (!this.exitOk(r, traffic)) return true;
    return false;
  }

  rvl(a, r) {
    const rel = (a.h - r.h + 4) & 3;
    if (rel === 2) return (r.tt === TT_LEFT || r.tt === TT_UTURN) && (a.tt === TT_STRAIGHT || a.tt === TT_RIGHT);
    if (rel === 3) return true; // a kommt von rechts
    return false;
  }

  hasPriority(a, r) {
    if (a.v.emergency && !r.v.emergency) return true;
    if (r.v.emergency) return false;
    if (this.type === 'roundabout') return false;
    if (this.lightActive()) {
      if (this.sigFor(a.h, a.tt) === 0) return false;
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
    const A = this.appr;
    for (let k = 0; k < A.length; k++) {
      const a = A[k];
      if (a.v === r.v || a.granted || a.hard) continue;
      if (this.type !== 'roundabout' && !this.conf[r.m * 16 + a.m]) continue;
      if (!a.isReq && a.tta > CFG.yieldWindow * (a.v.emergency ? 2.5 : 1)) continue;
      if (this.lightActive() && !a.v.emergency && this.sigFor(a.h, a.tt) === 0) continue;
      if (this.hasPriority(a, r)) return true;
    }
    return false;
  }

  // Probelauf für Folgekreuzung (Kette direkt benachbarter Kreuzungen)
  canAcceptDry(r, traffic) {
    if (this.w.closed[this.i]) return false;
    if (this.lightActive() && !r.v.emergency && this.sigFor(r.h, r.tt) !== 2) return false;
    if (this.type === 'roundabout') { if (this.ringBlocked(r)) return false; }
    else if (this.occConflict(r)) return false;
    if (!this.exitOk(r, traffic)) return false;
    // wartenden, bevorrechtigten Fahrzeugen den Vortritt lassen
    for (const a of this.appr) {
      if (!a.isReq || a.granted || a.v === r.v) continue;
      if (this.type !== 'roundabout' && !this.conf[r.m * 16 + a.m]) continue;
      if (this.hasPriority(a, r)) return false;
    }
    return true;
  }

  // Folgekreuzungen (direkt benachbart) entlang der Route – Freigabe nur für die ganze Kette
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
      if (!c) c = pool[depth] = { v: null, h: 0, d: 0, m: 0, tt: 0, dist: 0, tta: 0, exitDrive: false, isReq: true, granted: false, hard: false, ri2: 0, wait: 0 };
      c.v = v; c.h = dir; c.d = nd; c.m = dir * 4 + nd; c.tt = turnOf(dir, nd);
      c.dist = dist; c.tta = r.tta + depth + 1; c.ri2 = ri + 1;
      c.exitDrive = (k === v.goal && nd === v.goalDrive);
      out.push({ J: w.jc[k], r: c });
      if (c.exitDrive) break;
      tile = k; dir = nd; ri++; dist += 1;
    }
    return out;
  }

  chainOk(list, traffic) {
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

  // Notventil: echte Patt-Situationen nach langer Wartezeit auflösen
  forceable(r) {
    const w = this.w;
    if (w.closed[this.i]) return false;
    if (w.isJ[r.v.t] && r.v.t !== this.i && r.wait > 7) return true;
    if (r.wait > 22) {
      for (const o of this.occ) if (o.v.v > 0.05 || o.v.stuck < 6) return false;
      return true;
    }
    return false;
  }

  decide(traffic, now) {
    const A = this.appr;
    // Nachfrage für adaptive Ampeln
    if (this.type === 'light' && this.light) {
      let dem = 0, near = 0;
      const ph = this.light.phases;
      for (const a of A) {
        for (let p = 0; p < ph.length; p++) {
          if ((ph[p].allow[a.h] >> a.tt) & 1) { dem |= 1 << p; if (a.tta < 3.2) near |= 1 << p; }
        }
      }
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
      // nach neuen Zulassungen erneut prüfen
      if (this.type === 'roundabout' ? this.ringBlocked(r) : this.occConflict(r)) { r.hard = true; continue; }
      if (!this.exitOk(r, traffic)) { r.hard = true; continue; }
      if (this.mustYield(r)) {
        if (!yieldOnly || r.wait > yieldOnly.wait) yieldOnly = r;
        continue;
      }
      const ch = this.chainInfo(r);
      if (ch.length && !this.chainOk(ch, traffic)) { r.hard = true; continue; }
      this.grant(r, ch);
      any = true;
    }
    // Notventil für festgefahrene Situationen
    for (const r of R) {
      if (r.granted || !this.forceable(r)) continue;
      const ch = this.chainInfo(r);
      this.grant(r, ch);
      r.v.ghost = 3;
      any = true;
      break;
    }
    // Patt auflösen (z. B. vier Fahrzeuge bei rechts vor links)
    if (!any && yieldOnly && this.occ.length === 0 && yieldOnly.wait > 0.9) {
      const ch = this.chainInfo(yieldOnly);
      if (!ch.length || this.chainOk(ch, traffic)) this.grant(yieldOnly, ch);
    }
    A.length = 0;
  }

  release(v) {
    for (let k = 0; k < this.occ.length; k++) {
      if (this.occ[k].v === v) { this.occ.splice(k, 1); break; }
    }
    this.passCnt++;
  }

  // Erwartete Zusatzzeit für die Routenplanung
  penalty(h, d) {
    const tt = turnOf(h, d);
    let p;
    if (this.type === 'roundabout') p = 0.5;
    else if (this.lightActive()) p = 2.2;
    else if (this.type === 'priority') p = this.isMain(h) ? 0.15 : 1.0;
    else p = 0.8;
    if (tt === TT_LEFT) p += 0.45;
    if (tt === TT_UTURN) p += 2;
    return p + Math.min(30, this.waitEma[h]) * 0.8;
  }

  // ---- Speichern -------------------------------------------------------------------
  serialize() {
    const o = { type: this.type };
    if (this.type === 'priority') o.main = this.mainArms;
    if (this.light) o.light = { phases: this.light.phases.map(p => ({ g: p.g, allow: p.allow.slice() })), offset: this.light.offset, smart: this.light.smart, paid: !!this.light.paid };
    return o;
  }
  deserialize(o) {
    this.type = o.type;
    if (o.type === 'priority') this.mainArms = o.main;
    if (o.light) {
      this.light = { phases: o.light.phases.map(p => ({ g: p.g, allow: p.allow.slice() })), offset: o.light.offset || 0, smart: !!o.light.smart, paid: !!o.light.paid || !!o.light.smart, idx: 0, stage: 0, t: 0, rem: 0 };
    }
    this.onTopologyChange();
  }
}
