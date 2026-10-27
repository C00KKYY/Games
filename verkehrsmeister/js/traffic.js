'use strict';
// ---------------------------------------------------------------------------
// Verkehrssimulation: Fahrzeuge, Folgeverhalten, Spuren, Ausparken, Umleiten
// ---------------------------------------------------------------------------

const DEC = 3.0;        // komfortable Verzögerung (Planung)
const HARD_DEC = 9.0;   // maximale Verzögerung

function safeV(gap, vl) { return gap <= 0 ? 0 : Math.sqrt(vl * vl + 2 * DEC * gap); }

const VT = {
  car: { len: 0.30, acc: 1.9, vf: 1.0, kind3d: 'car' },
  amb: { len: 0.36, acc: 2.4, vf: 1.3, kind3d: 'amb', emergency: true },
};

class Vehicle {
  constructor(id, type, rng) {
    const vt = VT[type];
    this.id = id;
    this.type = type;
    this.len = vt.len; this.acc = vt.acc * rng.range(0.9, 1.1); this.vf = vt.vf * rng.range(0.95, 1.05);
    this.kind3d = vt.kind3d;
    this.emergency = !!vt.emergency;
    this.color = '#ffffff';
    this.t = -1; this.h = 0; this.d = 0; this.p = null; this.s = 0; this.v = 0;
    this.route = []; this.ri = 0;
    this.grants = [];
    this.lane = null;
    this.inDrive = false;
    this.x = 0; this.y = 0; this.a = 0; this.y3d = 0; this.pitch3d = 0;
    this.ox = 0; this.oy = 0; this.oa = 0; this.oz = 0;
    this.goal = -1; this.goalDrive = -1;
    this.house = null; this.dest = null; this.leg = 'out';
    this.t0 = 0; this.ideal = 1;
    this.wait = 0; this.reqWait = 0; this.stuck = 0; this.rerouteT = 0;
    this.stops = 0; this.halted = false;
    this.braking = false;
    this.vlim = 1;
    this.dead = false;
    this.needRoute = false;
    this.ap = { v: this, h: 0, d: 0, m: 0, tt: 0, dist: 0, tta: 0, isReq: false, granted: false, hard: false, wait: 0, exitDrive: false, d2: -1, ri2: 0, prio: 0 };
    this.ghost = 0;
    this.age = 0;
    this.waitTile = -1;
  }
}

class Traffic {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    const N = this.world.N;
    this.lanes = new Array(N * 4).fill(null);
    this.drv = new Uint8Array(N);
    this.vehicles = [];
    this.nextId = 1;
    this.pf = new Pathfinder(this.world);
    this.rng = new RNG(game.seed * 7 + 3);
    this.tmp = { x: 0, y: 0, a: 0 };
    this.measT = 0;
    this.rerouteCursor = 0;
    this.speedMul = 1;
    this.stats = { spawned: 0, arrived: 0 };
  }

  lane(i, h) {
    const k = i * 4 + h;
    let L = this.lanes[k];
    if (!L) L = this.lanes[k] = [];
    return L;
  }

  movLimit(tile, h, d, P, v) {
    const w = this.world;
    let road = CFG.roadSpeed[w.road[tile]] || 2;
    if (w.road[tile] === 1 && w.mods && w.mods.tempo) road *= w.mods.tempo;
    let lim = road * v.vf;
    if (P.round) lim = Math.min(lim, CFG.roundSpeed);
    else if (P.turn !== TT_STRAIGHT) lim = Math.min(lim, CFG.turnSpeed[P.turn]);
    const lk = w.link[tile];
    if (!((lk >> OPP[h]) & 1) || !((lk >> d) & 1)) lim = Math.min(lim, CFG.driveSpeed);
    if (w.flags[tile] & F_RAMP) lim = Math.min(lim, 2.6);
    return lim * this.speedMul;
  }

  // ---- Fahrzeuge erzeugen ----------------------------------------------------------
  spawnVehicle(type, tile, h, d, route, ri) {
    const v = new Vehicle(this.nextId++, type, this.rng);
    v.t = tile; v.h = h; v.d = d;
    v.route = route; v.ri = ri;
    v.p = pathAt(this.world, tile, h, d);
    v.s = 0; v.v = 0.25;
    v.lane = this.lane(tile, h);
    v.lane.push(v);
    v.inDrive = !((this.world.link[tile] >> OPP[h]) & 1);
    if (v.inDrive) this.drv[tile]++;
    v.vlim = this.movLimit(tile, h, d, v.p, v);
    if (this.world.isJ[tile] && this.world.jc[tile]) {
      this.world.jc[tile].occ.push({ v, m: h * 4 + d, h, d });
      v.grants.push(tile);
    }
    this.vehicles.push(v);
    this.updatePos(v);
    v.ox = v.x; v.oy = v.y; v.oa = v.a; v.oz = v.y3d;
    this.stats.spawned++;
    return v;
  }

  // Lücke zum Ausparken: Bewegung (h -> d) auf Kachel a
  spawnGap(a, h, d, len, impatient) {
    const w = this.world;
    if (w.closed[a]) return false;
    const m = h * 4 + d;
    if (this.drv[a] > 0) {
      // Nachrücken aus derselben Einfahrt in dieselbe Richtung ist erlaubt
      const L = this.lanes[a * 4 + h];
      if (!L) return false;
      for (const o of L) if (o.inDrive && (o.d !== d || o.s < len + 0.16)) return false;
    }
    const conf = conflictTable(w.two[a]);
    if (w.isJ[a] && w.jc[a]) {
      const J = w.jc[a];
      if (J.type === 'roundabout' && J.occ.length) return false;
      for (const o of J.occ) if (conf[m * 16 + o.m]) return false;
    }
    for (let hh = 0; hh < 4; hh++) {
      const L = this.lanes[a * 4 + hh];
      if (!L) continue;
      for (let k = 0; k < L.length; k++) {
        const o = L[k];
        if (o.d === d) { if (o.s < (o.h === h ? len + 0.16 : o.p.len * 0.75)) return false; continue; }
        if (conf[m * 16 + o.h * 4 + o.d]) return false;
      }
    }
    const lk = w.link[a];
    for (let s = 0; s < 4; s++) {
      if (!((lk >> s) & 1)) continue;
      const j = w.nb(a, s);
      const toA = OPP[s];
      for (let hh = 0; hh < 4; hh++) {
        const L = this.lanes[j * 4 + hh];
        if (!L || !L.length || L[0].held) continue;
        for (let k = 0; k < L.length; k++) {
          const o = L[k];
          if (o.d !== toA) continue;
          const rem = o.p.len - o.s;
          if (rem > 1.6) continue;
          if (rem > 0.55 && rem / Math.max(o.v, 0.3) > (impatient ? 0.9 : 1.7)) continue;
          if (impatient && rem > 1.0) continue;
          const nd = o.route[o.ri];
          if (nd === undefined || nd === d || conf[m * 16 + toA * 4 + nd]) return false;
        }
      }
    }
    const k = w.nb(a, d);
    if (k >= 0) {
      if (w.closed[k] || w.gate[k]) return false;
      if (!impatient) {
        const L = this.lanes[k * 4 + d];
        if (L && L.length) { const last = L[L.length - 1]; if (last.s - last.len * 0.5 < len + 0.12) return false; }
      }
    }
    return true;
  }

  // Fahrzeug von Gebäude b losschicken. goals/froms: Kachel oder Liste von Kacheln
  // (Ziele haben zwei gleichwertige Zufahrten). Ergebnis: Fahrzeug, false = gerade keine
  // Lücke, null = keine Route
  trySpawn(b, goals, goalDrive, type, impatient, froms) {
    const w = this.world;
    if (this.vehicles.length >= this.game.maxVehicles) return false;
    const G = Array.isArray(goals) ? goals : [goals];
    const F = froms === undefined ? [b.acc] : (Array.isArray(froms) ? froms : [froms]);
    const h = b.dir;
    const cache = b._routes || (b._routes = new Map());
    let anyRoute = false;
    // Startkacheln reihum probieren, damit beide Ausfahrten genutzt werden
    const n = F.length, off = (b._spawnRot = ((b._spawnRot || 0) + 1) % n);
    for (let q = 0; q < n; q++) {
      const a = F[(q + off) % n];
      if (!w.road[a] || !w.link[a]) continue;
      let best = null;
      for (const goal of G) {
        if (goal === a || !w.road[goal]) continue;
        const key = a * 100000 + goal;
        let c = cache.get(key);
        if (!c || c.v !== w.topo) {
          const r = this.pf.find(a, h, goal);
          c = { v: w.topo, route: r && r.length ? r.concat([goalDrive]) : null, cost: r ? this.pf.lastCost : Infinity };
          cache.set(key, c);
        }
        if (c.route && (!best || c.cost < best.cost)) best = { route: c.route, cost: c.cost, goal };
      }
      if (!best) continue;
      anyRoute = true;
      if (!this.spawnGap(a, h, best.route[0], VT[type].len, impatient)) continue;
      const v = this.spawnVehicle(type, a, h, best.route[0], best.route.slice(), 1);
      v.goal = best.goal; v.goalDrive = goalDrive;
      v.t0 = this.game.time;
      const md = Math.abs(w.tx(a) - w.tx(best.goal)) + Math.abs(w.ty(a) - w.ty(best.goal));
      v.ideal = (md * 1.2 + 1.5) / (CFG.roadSpeed[1] * v.vf) + 2.5;
      return v;
    }
    if (cache.size > 64) cache.clear();
    return anyRoute ? false : null;
  }

  // ---- Entfernen -------------------------------------------------------------------
  removeFromLane(v) {
    const L = v.lane;
    if (L) {
      const k = L[0] === v ? 0 : L.indexOf(v);
      if (k >= 0) L.splice(k, 1);
    }
    if (v.inDrive) { this.drv[v.t] = Math.max(0, this.drv[v.t] - 1); v.inDrive = false; }
    v.lane = null;
  }

  releaseAll(v) {
    const w = this.world;
    for (const g of v.grants) {
      const J = w.jc[g];
      if (J) for (let k = 0; k < J.occ.length; k++) if (J.occ[k].v === v) { J.occ.splice(k, 1); break; }
    }
    v.grants.length = 0;
  }

  kill(v, reason) {
    if (v.dead) return;
    this.removeFromLane(v);
    this.releaseAll(v);
    v.dead = true;
    v.deadReason = reason;
    this.game.city.onVehicleRemoved(v, reason);
  }

  // ---- Planung: Anmeldung an der nächsten Kreuzung --------------------------------
  plan(v) {
    const ap = v.ap;
    ap.isReq = false;
    const L = v.lane;
    if (!L || L[0] !== v) return;
    const w = this.world;
    if (v.inDrive) {
      for (let h = 0; h < 4; h++) {
        const L2 = this.lanes[v.t * 4 + h];
        if (!L2 || L2 === L) continue;
        for (let k = 0; k < L2.length; k++) if (L2[k].d === v.d && !L2[k].inDrive) return;
      }
    }
    let dist = v.p.len - v.s - v.len * 0.5;
    let tile = v.t, dir = v.d, ri = v.ri;
    for (let n = 0; n < 4 && dist < 4.5; n++) {
      if (tile === v.goal && (dir === v.goalDrive || v.goalDrive < 0)) return;
      const j = w.nb(tile, dir);
      if (j < 0) return;
      const nd = v.route[ri];
      if (nd === undefined) return;
      if (w.isJ[j]) {
        if (v.grants.indexOf(j) >= 0) {
          dist += pathAt(w, j, dir, nd).len; tile = j; dir = nd; ri++;
          continue;
        }
        const J = w.jc[j];
        if (!J) return;
        ap.h = dir; ap.d = nd; ap.m = dir * 4 + nd; ap.tt = turnOf(dir, nd);
        ap.dist = dist; ap.tta = dist / Math.max(v.v, 0.35);
        ap.exitDrive = (j === v.goal && nd === v.goalDrive);
        const d2 = v.route[ri + 1];
        ap.d2 = d2 === undefined ? -1 : d2;
        ap.ri2 = ri + 1;
        ap.isReq = dist < Math.max(0.55, v.v * v.v / (2 * DEC) + 0.45);
        ap.wait = v.reqWait;
        ap.granted = false; ap.hard = false;
        J.appr.push(ap);
        if (ap.isReq) { v.reqWait += CFG.dt; v.waitJ = J; }
        return;
      }
      const L2 = this.lanes[j * 4 + dir];
      if (L2 && L2.length) return;
      dist += pathAt(w, j, dir, nd).len;
      tile = j; dir = nd; ri++;
    }
  }

  // ---- Bewegung --------------------------------------------------------------------
  move(v, dt) {
    const w = this.world;
    v.age += dt;
    let vcap = v.vlim;
    let hard = Infinity;
    let cb = false;
    const L = v.lane;
    const idx = L[0] === v ? 0 : L.indexOf(v);
    v.cause = 0; v.held = false;
    if (idx > 0) {
      const ld = L[idx - 1];
      const gap = ld.s - v.s - (ld.len + v.len) * 0.5 - CFG.gap;
      vcap = Math.min(vcap, safeV(gap, ld.v));
      hard = ld.s - (ld.len + v.len) * 0.5 - 0.01;
      cb = ld.closureBlock;
    } else {
      let dist = v.p.len - v.s;
      let tile = v.t, dir = v.d, ri = v.ri;
      for (let n = 0; n < 4; n++) {
        if (tile === v.goal && (dir === v.goalDrive || v.goalDrive < 0)) {
          if (v.leg === 'out' && this.game.city.intakeBlocked(v)) {
            vcap = Math.min(vcap, safeV(dist - v.len * 0.5 - 0.02, 0));
            if (n === 0) hard = Math.min(hard, v.p.len - v.len * 0.5 - 0.01);
            v.cause = 3;
          }
          break;
        }
        const j = w.nb(tile, dir);
        const nd = v.route[ri];
        const stopDist = dist - v.len * 0.5 - 0.02;
        const hold = j >= 0 && w.holdT[j] && !v.emergency && !(w.isJ[j] && v.grants.indexOf(j) >= 0);
        if (j < 0 || nd === undefined || hold || w.closed[j] || w.gate[j] || (w.isJ[j] && v.grants.indexOf(j) < 0) || (!w.isJ[j] && this.drv[j] > 0 && this.drvBlocks(j, dir, nd))) {
          if (hold) { v.cause = 3; v.held = true; }
          vcap = Math.min(vcap, safeV(stopDist, 0));
          if (n === 0) hard = Math.min(hard, v.p.len - v.len * 0.5 - 0.01);
          if (j >= 0 && w.closed[j]) cb = true;
          if (j >= 0 && w.gate[j]) {
            v.cause = 4;
            if (v.v < 0.1) { const gw = w.gateWait || (w.gateWait = new Map()); gw.set(j, (gw.get(j) || 0) + dt * L.length); }
          }
          else if (j >= 0 && w.isJ[j]) v.cause = 1;
          break;
        }
        const L2 = this.lanes[j * 4 + dir];
        if (L2 && L2.length) {
          const ld = L2[L2.length - 1];
          const gap = dist + ld.s - (ld.len + v.len) * 0.5 - CFG.gap;
          vcap = Math.min(vcap, safeV(gap, ld.v));
          if (n === 0) hard = Math.min(hard, v.p.len + ld.s - (ld.len + v.len) * 0.5 - 0.01);
          cb = ld.closureBlock;
          break;
        }
        const P2 = pathAt(w, j, dir, nd);
        const lim = this.movLimit(j, dir, nd, P2, v);
        if (lim < vcap) vcap = Math.min(vcap, Math.sqrt(lim * lim + 2 * DEC * Math.max(0, dist - v.len * 0.3)));
        dist += P2.len;
        if (dist > 3.2) break;
        tile = j; dir = nd; ri++;
      }
    }
    if (v.ghost > 0) v.ghost -= dt;
    else if (w.isJ[v.t] || v.inDrive || this.drv[v.t] > 0) vcap = Math.min(vcap, this.coneCheck(v));
    const v0 = v.v;
    if (vcap > v.v) v.v = Math.min(vcap, v.v + v.acc * dt);
    else v.v = Math.max(vcap, v.v - HARD_DEC * dt);
    if (v.v < 0) v.v = 0;
    let ns = v.s + v.v * dt;
    if (ns > hard) { ns = Math.max(v.s, hard); v.v = Math.min(v.v, Math.max(0, (ns - v.s) / dt)); }
    const dv = v.v - v0;
    v.braking = dv < -0.01 || v.v < 0.05;
    const tp = dv < -0.02 ? -0.07 : (dv > 0.02 ? 0.035 : 0);
    v.pitch3d += (tp - v.pitch3d) * Math.min(1, dt * 8);
    v.s = ns;
    v.closureBlock = cb && v.v < 0.15;
    if (v.v < 0.06) {
      v.wait += dt; v.stuck += v.closureBlock ? dt * 0.2 : dt;
      const g = v.t >= w.n ? v.t - w.n : v.t;
      w.waitAcc[g] += dt;
      if (!v.halted && !v.inDrive && v.age > 1.2) { v.halted = true; v.stops++; }
    } else if (v.v > 0.3) { v.stuck = 0; if (v.v > 0.5) v.halted = false; }
    w.spdSum[v.t] += Math.min(1, v.v / Math.max(0.3, v.vlim));
    w.spdN[v.t] += 1;
    let guard = 0;
    while (v.s >= v.p.len && guard++ < 3) {
      if (v.t === v.goal && v.d === v.goalDrive) { this.arrive(v); return; }
      const j = w.nb(v.t, v.d);
      if (j < 0 || !w.road[j] || w.closed[j] || w.gate[j] || (w.isJ[j] && v.grants.indexOf(j) < 0)) {
        v.s = v.p.len - 0.001; v.v = 0; break;
      }
      this.enterTile(v, j);
      if (v.dead) return;
    }
    this.updatePos(v);
  }

  enterTile(v, j) {
    const w = this.world;
    const old = v.t;
    this.removeFromLane(v);
    if (w.isJ[old] && w.jc[old]) w.jc[old].release(v);
    const gk = v.grants.indexOf(old);
    if (gk >= 0) v.grants.splice(gk, 1);
    v.s -= v.p.len;
    v.t = j; v.h = v.d;
    let nd = v.route[v.ri];
    const valid = nd !== undefined && (((w.out[j] >> nd) & 1) || (j === v.goal && (nd === v.goalDrive || v.goalDrive < 0)));
    if (!valid) {
      const r = this.routeFrom(v, j, v.h);
      if (!r) { v.d = v.h; v.p = pathAt(w, j, v.h, v.h); v.lane = this.lane(j, v.h); v.lane.push(v); this.kill(v, 'noroute'); return; }
      v.route = r; v.ri = 0;
      nd = r[0];
      if (w.isJ[j] && w.jc[j]) for (const o of w.jc[j].occ) if (o.v === v) { o.d = nd; o.m = v.h * 4 + nd; }
    }
    v.ri++;
    v.d = nd;
    v.p = pathAt(w, j, v.h, v.d);
    v.lane = this.lane(j, v.h);
    v.lane.push(v);
    v.vlim = this.movLimit(j, v.h, v.d, v.p, v);
    w.flowCnt[j]++;
    if (v.s > v.p.len) v.s = v.p.len;
  }

  routeFrom(v, tile, h) {
    if (v.goal < 0) return null;
    let r;
    if (tile === v.goal) r = [];
    else r = this.pf.find(tile, h, v.goal);
    if (!r) return null;
    r.push(v.goalDrive);
    return r;
  }

  reroute(v) {
    const w = this.world;
    if (v.dead) return;
    let keep = v.ri, pos = v.ri, t2 = v.t, d2 = v.d;
    if (t2 === v.goal && (d2 === v.goalDrive || v.goalDrive < 0)) return;
    for (let step = 0; step < 5; step++) {
      const j = w.nb(t2, d2);
      if (j < 0) break;
      if (v.grants.indexOf(j) >= 0) keep = pos + 1;
      const nd = v.route[pos];
      if (nd === undefined) break;
      t2 = j; d2 = nd; pos++;
    }
    let tile = w.nb(v.t, v.d), head = v.d;
    for (let k = v.ri; k < keep; k++) {
      const d = v.route[k];
      if (tile < 0) break;
      if (tile === v.goal && (d === v.goalDrive || v.goalDrive < 0)) return;
      tile = w.nb(tile, d); head = d;
    }
    if (tile < 0 || !w.road[tile]) return;
    const r = this.routeFrom(v, tile, head);
    if (!r) return;
    v.route = v.route.slice(0, keep).concat(r);
  }

  drvBlocks(j, H, D) {
    const w = this.world;
    const conf = conflictTable(w.two[j]);
    const m = H * 4 + D;
    const lk = w.link[j];
    for (let h = 0; h < 4; h++) {
      if ((lk >> OPP[h]) & 1) continue;
      const L = this.lanes[j * 4 + h];
      if (!L) continue;
      for (let k = 0; k < L.length; k++) {
        const o = L[k];
        if (!o.inDrive) continue;
        if (o.d === D || (conf[m * 16 + o.h * 4 + o.d] && (o.s < o.p.len * 0.55 || o.v > 0.1))) return true;
      }
    }
    return false;
  }

  coneCheck(v) {
    let cap = Infinity;
    const ca = Math.cos(v.a), sa = Math.sin(v.a);
    const base = v.t * 4;
    for (let h = 0; h < 4; h++) {
      const L = this.lanes[base + h];
      if (!L || L === v.lane) continue;
      for (let k = 0; k < L.length; k++) {
        const o = L[k];
        const dx = o.x - v.x, dy = o.y - v.y;
        if (dx * dx + dy * dy > 0.36) continue;
        const fwd = dx * ca + dy * sa;
        if (fwd <= 0.04) continue;
        const lat = Math.abs(-dx * sa + dy * ca);
        if (lat > 0.17) continue;
        const rel = Math.cos(o.a - v.a);
        if (rel < 0.25) continue;
        const gap = fwd - (o.len + v.len) * 0.5 - 0.03;
        const c = safeV(gap, Math.max(0, o.v * rel));
        if (c < cap) cap = c;
      }
    }
    return cap;
  }

  updatePos(v) {
    const t = this.tmp, w = this.world;
    v.p.pos(v.s, t);
    v.x = w.tx(v.t) + t.x;
    v.y = w.ty(v.t) + t.y;
    v.a = t.a;
    // Höhe (Autobahnrampen)
    if (v.t >= w.n) {
      const e0 = w.edgeH(v.t, OPP[v.h]), e1 = w.edgeH(v.t, v.d);
      const f = clamp(v.s / v.p.len, 0, 1);
      v.y3d = e0 + (e1 - e0) * f + 0.02;
      v.slope = Math.atan2(e1 - e0, v.p.len);
    } else { v.y3d = 0; v.slope = 0; }
  }

  arrive(v) {
    this.removeFromLane(v);
    this.releaseAll(v);
    v.dead = true;
    v.deadReason = 'arrive';
    this.stats.arrived++;
    this.game.city.onArrive(v);
  }

  // ---- Netzänderungen ---------------------------------------------------------------
  onTilesChanged(tiles) {
    const w = this.world;
    w.topo++;
    const set = new Set();
    for (const t of tiles) { set.add(t); for (let d = 0; d < 4; d++) { const j = w.nb(t, d); if (j >= 0) set.add(j); } }
    for (const t of set) {
      for (let h = 0; h < 4; h++) {
        const L = this.lanes[t * 4 + h];
        if (!L || !L.length) continue;
        for (const v of L.slice()) {
          if (!w.road[t]) { this.kill(v, 'demolish'); continue; }
          const okExit = ((w.out[t] >> v.d) & 1) || (t === v.goal && (v.d === v.goalDrive || v.goalDrive < 0));
          const okEntry = v.inDrive || ((w.link[t] >> OPP[v.h]) & 1);
          if (!okExit || !okEntry) {
            // Ausweichen: andere Ausfahrt derselben Kachel nehmen, sonst entfernen
            const ex = w.exits(t, v.h) & w.out[t];
            if (okEntry && ex) {
              let nd = -1;
              for (let d = 0; d < 4; d++) if ((ex >> d) & 1) { nd = d; if (d === v.h) break; }
              v.d = nd;
              v.route = this.routeFrom(v, w.nb(t, nd), nd) || [];
              if (!v.route.length) { this.kill(v, 'demolish'); continue; }
              v.ri = 0;
            } else { this.kill(v, 'demolish'); continue; }
          }
          const np = pathAt(w, t, v.h, v.d);
          if (np !== v.p) { const f = v.s / v.p.len; v.p = np; v.s = Math.min(np.len, f * np.len); this.updatePos(v); }
          v.vlim = this.movLimit(t, v.h, v.d, v.p, v);
        }
      }
      if (w.isJ[t] && w.jc[t]) {
        const J = w.jc[t];
        for (let h = 0; h < 4; h++) {
          const L = this.lanes[t * 4 + h];
          if (!L) continue;
          for (const v of L) {
            if (!J.occ.some(o => o.v === v)) { J.occ.push({ v, m: v.h * 4 + v.d, h: v.h, d: v.d }); if (v.grants.indexOf(t) < 0) v.grants.push(t); }
          }
        }
      }
    }
    for (const v of this.vehicles) v.needRoute = true;
  }

  // ---- Hauptschritt -------------------------------------------------------------------
  step(dt) {
    const w = this.world;
    const V = this.vehicles;
    for (let k = 0; k < V.length; k++) { const v = V[k]; v.ox = v.x; v.oy = v.y; v.oa = v.a; v.oz = v.y3d; }
    for (const J of w.junctions) if (J.type === 'light' && J.light) J.updateLight(dt);
    for (let k = 0; k < V.length; k++) if (!V[k].dead) this.plan(V[k]);
    for (const J of w.junctions) J.decide(this, dt);
    for (let k = 0; k < V.length; k++) { const v = V[k]; if (!v.dead) this.move(v, dt); }
    let budget = 14;
    for (let k = 0; k < V.length; k++) {
      const v = V[k];
      if (v.dead) continue;
      if (v.stuck > 90) { this.kill(v, 'stuck'); continue; }
      if (v.stuck > 6 && v.age - v.rerouteT > 8 && budget > 0) { v.rerouteT = v.age; this.reroute(v); budget--; }
    }
    if (V.length) {
      let n = Math.min(V.length, 40);
      while (n-- > 0) {
        this.rerouteCursor = (this.rerouteCursor + 1) % V.length;
        const v = V[this.rerouteCursor];
        if (v && !v.dead && v.needRoute) { v.needRoute = false; this.reroute(v); }
      }
    }
    let alive = 0;
    for (let k = 0; k < V.length; k++) if (!V[k].dead) V[alive++] = V[k];
    V.length = alive;
    this.measT += dt;
    if (this.measT >= 1) {
      this.measT = 0;
      const cong = w.cong, sS = w.spdSum, sN = w.spdN;
      for (let i = 0; i < w.N; i++) {
        if (sN[i] > 0) {
          const r = sS[i] / sN[i];
          const target = clamp(1 / Math.max(0.14, r), 1, 7);
          cong[i] = cong[i] * 0.75 + target * 0.25;
          sS[i] = 0; sN[i] = 0;
        } else if (cong[i] > 1) cong[i] = Math.max(1, cong[i] * 0.9);
      }
    }
  }

  vehiclesOnTile(t) {
    const out = [];
    for (let h = 0; h < 4; h++) { const L = this.lanes[t * 4 + h]; if (L) for (const v of L) out.push(v); }
    return out;
  }
}
