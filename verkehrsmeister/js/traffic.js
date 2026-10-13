'use strict';
// ---------------------------------------------------------------------------
// Verkehrssimulation: Fahrzeuge, Folgeverhalten, Spuren, Spawnen, Umleiten
// ---------------------------------------------------------------------------

const DEC = 3.0;        // komfortable Verzögerung (Planung)
const HARD_DEC = 9.0;   // maximale Verzögerung

function safeV(gap, vl) { return gap <= 0 ? 0 : Math.sqrt(vl * vl + 2 * DEC * gap); }

class Vehicle {
  constructor(id, type, rng) {
    const vt = VT[type];
    this.id = id;
    this.type = type;
    this.vt = vt;
    this.len = vt.len; this.wid = vt.wid; this.acc = vt.acc * rng.range(0.9, 1.1); this.vf = vt.vf * rng.range(0.93, 1.05);
    this.emergency = !!vt.emergency;
    this.color = type === 'car' ? rng.pick(CAR_COLORS) : (type === 'van' ? rng.pick(['#ffffff', '#f1f5f9', '#fbbf24', '#e2e8f0']) : (type === 'truck' ? rng.pick(['#f97316', '#2563eb', '#16a34a', '#dc2626', '#64748b']) : '#ffffff'));
    this.t = -1; this.h = 0; this.d = 0; this.p = null; this.s = 0; this.v = 0;
    this.route = []; this.ri = 0;
    this.grants = [];
    this.lane = null;
    this.inDrive = false;
    this.x = 0; this.y = 0; this.a = 0;
    this.from = null; this.to = null; this.goal = -1; this.goalDrive = -1;
    this.purpose = ''; this.t0 = 0; this.ideal = 1; this.dist = 0;
    this.wait = 0; this.reqWait = 0; this.stuck = 0; this.rerouteT = 0;
    this.braking = false; this.blink = 0;
    this.vlim = 1;
    this.dwell = 0; this.bus = null; this.pax = 0;
    this.dead = false;
    this.needRoute = false;
    this.ap = { v: this, h: 0, d: 0, m: 0, tt: 0, dist: 0, tta: 0, isReq: false, granted: false, hard: false, wait: 0, exitDrive: false, d2: -1, ri2: 0, prio: 0 };
    this.ghost = 0;
    this.age = 0;
    this.home = null;
  }
}

class Traffic {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    const n = this.world.n;
    this.lanes = new Array(n * 4).fill(null);
    this.drv = new Uint8Array(n);
    this.vehicles = [];
    this.byId = new Map();
    this.nextId = 1;
    this.pf = new Pathfinder(this.world);
    this.rng = new RNG(game.seed * 7 + 3);
    this.tmp = { x: 0, y: 0, a: 0 };
    this.measT = 0;
    this.lastVersion = this.world.version;
    this.rerouteCursor = 0;
    this.spawnCursor = 0;
    this.speedMul = 1;
    this.stats = { spawned: 0, arrived: 0, gaveUp: 0 };
  }

  lane(i, h) {
    const k = i * 4 + h;
    let L = this.lanes[k];
    if (!L) L = this.lanes[k] = [];
    return L;
  }

  movLimit(tile, h, d, P, v) {
    const w = this.world;
    let road = CFG.roadSpeed[w.road[tile]] || 1.9;
    if (w.works[tile] > 0) road *= CFG.worksSpeed;
    let lim = road * v.vf;
    if (P.round) lim = Math.min(lim, CFG.roundSpeed);
    else if (P.turn !== TT_STRAIGHT) lim = Math.min(lim, CFG.turnSpeed[P.turn]);
    const lk = w.link[tile];
    if (!((lk >> OPP[h]) & 1) || !((lk >> d) & 1)) lim = Math.min(lim, CFG.driveSpeed);
    return lim * this.speedMul;
  }

  // ---- Fahrten erzeugen ----------------------------------------------------------
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
    this.byId.set(v.id, v);
    this.updatePos(v);
    this.stats.spawned++;
    return v;
  }

  // Prüft, ob an der Zufahrtskachel a gerade Platz zum Ausparken ist
  spawnFree(a) {
    const w = this.world;
    if (w.closed[a]) return false;
    if (this.drv[a] > 0) return false;
    for (let h = 0; h < 4; h++) { const L = this.lanes[a * 4 + h]; if (L && L.length) return false; }
    if (w.isJ[a] && w.jc[a] && w.jc[a].occ.length) return false;
    const lk = w.link[a];
    for (let s = 0; s < 4; s++) {
      if (!((lk >> s) & 1)) continue;
      const j = w.nb(a, s);
      const toA = OPP[s];
      for (let h = 0; h < 4; h++) {
        const L = this.lanes[j * 4 + h];
        if (!L) continue;
        for (let k = 0; k < L.length; k++) {
          const o = L[k];
          if (o.d === toA && o.p.len - o.s < 0.75) return false;
        }
      }
    }
    return true;
  }

  // Lücke zum Ausparken: Bewegung (h -> d) auf Kachel a für ein Fahrzeug der Länge len
  spawnGap(a, h, d, len, impatient) {
    const w = this.world;
    if (w.closed[a] || this.drv[a] > 0) return false;
    const m = h * 4 + d;
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
        if (o.d === d) { if (o.s < o.p.len * 0.75) return false; continue; }
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
        if (!L) continue;
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
      if (w.closed[k]) return false;
      // Reißverschluss: Ungeduldige fädeln auch in eine stehende Kolonne ein
      if (!impatient) {
        const L = this.lanes[k * 4 + d];
        if (L && L.length) { const last = L[L.length - 1]; if (last.s - last.len * 0.5 < len + 0.12) return false; }
      }
    }
    return true;
  }

  // Fahrt von Gebäude b starten (falls möglich). trip: {to, goal, goalDrive, purpose, vtype, t0}
  trySpawnTrip(b) {
    const w = this.world;
    const trip = b.queue[0];
    const a = b.acc;
    if (!w.road[a] || !w.link[a]) return false;
    if (this.vehicles.length >= CFG.maxVehicles) return false;
    const h = b.dir;
    if (a === trip.goal) return this.failTrip(b, trip, 'same');
    if (!trip.route || trip.rv !== w.version) {
      const route = this.pf.find(a, h, trip.goal);
      if (!route || !route.length) { b.queue.shift(); this.game.city.onNoRoute(b, trip); return false; }
      if (trip.goalDrive >= 0) route.push(trip.goalDrive);
      else route.push(this.anyExit(trip.goal, route[route.length - 1]));
      trip.route = route; trip.rv = w.version;
    }
    const route = trip.route;
    if (!this.spawnGap(a, h, route[0], VT[trip.vtype].len, b.queue.length >= 4)) return false;
    b.queue.shift();
    const v = this.spawnVehicle(trip.vtype, a, h, route[0], route, 1);
    v.from = b; v.to = trip.to; v.goal = trip.goal; v.goalDrive = trip.goalDrive;
    v.purpose = trip.purpose; v.t0 = this.game.time; v.queued = trip.t0;
    v.home = trip.home || null;
    v.event = trip.event || null;
    v.task = trip.task || null;
    v.emergencyStart = this.game.time;
    if (trip.task) trip.task.vehicle = v;
    if (v.emergency && !trip.task) v.emergency = false; // Rückfahrt ohne Blaulicht
    const md = Math.abs(w.tx(a) - w.tx(trip.goal)) + Math.abs(w.ty(a) - w.ty(trip.goal));
    v.dist = md;
    v.ideal = (md * 1.25 + 2) / (CFG.roadSpeed[1] * v.vf) + 3;
    b.sent++;
    return true;
  }

  failTrip(b, trip) { b.queue.shift(); return false; }

  anyExit(tile, h) {
    const ex = this.world.exits(tile, h);
    if ((ex >> h) & 1) return h;
    for (let d = 0; d < 4; d++) if ((ex >> d) & 1) return d;
    return h;
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
    this.byId.delete(v.id);
    this.game.city.onVehicleRemoved(v, reason);
  }

  // ---- Planung: Anmeldung an der nächsten Kreuzung --------------------------------
  plan(v) {
    const ap = v.ap;
    ap.isReq = false;
    if (v.dwell > 0) return;
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
        if (ap.isReq) v.reqWait += CFG.dt;
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
    if (v.dwell > 0) {
      v.dwell -= dt; v.v = 0; v.braking = true;
      if (v.dwell <= 0) this.game.city.busDepart(v);
      return;
    }
    let vcap = v.vlim;
    let hard = Infinity;
    let cb = false;
    const L = v.lane;
    const idx = L[0] === v ? 0 : L.indexOf(v);
    let blink = 0;
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
          if (v.goalDrive < 0) vcap = Math.min(vcap, safeV(dist - v.p.len * 0.5 + 0.05, 0.2));
          break;
        }
        if (v.bus && tile === v.bus.stopTile && !v.bus.served && tile === v.t) {
          const g = v.p.len * 0.5 - v.s;
          vcap = Math.min(vcap, safeV(g, 0));
          if (g < 0.04 && v.v < 0.25) { this.game.city.busArrive(v); return; }
          break;
        }
        const j = w.nb(tile, dir);
        const nd = v.route[ri];
        const stopDist = dist - v.len * 0.5 - 0.02;
        if (j < 0 || nd === undefined || w.closed[j] || (w.isJ[j] && v.grants.indexOf(j) < 0) || (!w.isJ[j] && this.drv[j] > 0 && this.drvBlocks(j, dir, nd))) {
          vcap = Math.min(vcap, safeV(stopDist, 0));
          if (n === 0) hard = Math.min(hard, v.p.len - v.len * 0.5 - 0.01);
          if (j >= 0 && w.closed[j]) cb = true;
          break;
        }
        if (n === 0 && nd !== dir) blink = turnOf(dir, nd) === TT_LEFT ? -1 : (turnOf(dir, nd) === TT_RIGHT ? 1 : 0);
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
        if (v.bus && j === v.bus.stopTile && !v.bus.served) {
          vcap = Math.min(vcap, safeV(dist + P2.len * 0.5, 0));
          break;
        }
        const lim = this.movLimit(j, dir, nd, P2, v);
        if (lim < vcap) vcap = Math.min(vcap, Math.sqrt(lim * lim + 2 * DEC * Math.max(0, dist - v.len * 0.3)));
        dist += P2.len;
        if (dist > 3.2) break;
        tile = j; dir = nd; ri++;
      }
    }
    if (v.p.turn !== TT_STRAIGHT && v.s < v.p.len * 0.6) blink = v.p.turn === TT_LEFT ? -1 : (v.p.turn === TT_RIGHT ? 1 : 0);
    v.blink = blink;
    // Geometrische Sicherheitsprüfung in Kreuzungen und Kreisverkehren
    if (v.ghost > 0) v.ghost -= dt;
    else if (w.isJ[v.t] || v.inDrive || this.drv[v.t] > 0) vcap = Math.min(vcap, this.coneCheck(v));
    // Geschwindigkeit
    const v0 = v.v;
    if (vcap > v.v) v.v = Math.min(vcap, v.v + v.acc * dt);
    else v.v = Math.max(vcap, v.v - HARD_DEC * dt);
    if (v.v < 0) v.v = 0;
    let ns = v.s + v.v * dt;
    if (ns > hard) { ns = Math.max(v.s, hard); v.v = Math.min(v.v, Math.max(0, (ns - v.s) / dt)); }
    v.braking = v.v < v0 - 0.01 || v.v < 0.05;
    v.s = ns;
    // Wartezeiten
    v.closureBlock = cb && v.v < 0.15;
    if (v.v < 0.06) { v.wait += dt; v.stuck += v.closureBlock ? dt * 0.2 : dt; }
    else if (v.v > 0.3) v.stuck = 0;
    // Messung
    w.spdSum[v.t] += Math.min(1, v.v / Math.max(0.3, v.vlim));
    w.spdN[v.t] += 1;
    // Kachelwechsel
    let guard = 0;
    while (v.s >= v.p.len && guard++ < 3) {
      if (v.t === v.goal && v.d === v.goalDrive) { this.arrive(v); return; }
      const j = w.nb(v.t, v.d);
      if (j < 0 || !w.road[j] || w.closed[j] || (w.isJ[j] && v.grants.indexOf(j) < 0)) {
        v.s = v.p.len - 0.001; v.v = 0; break;
      }
      this.enterTile(v, j);
      if (v.dead) return;
    }
    if (v.goalDrive < 0 && v.t === v.goal && v.s >= v.p.len * 0.45) { this.arrive(v); return; }
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
      // Zulassung an dieser Kreuzung auf neue Bewegung umschreiben
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
    if (w.isJ[old] && w.jc[old]) this.game.city.onJunctionPass(w.jc[old], v);
  }

  // Route ab Kachel tile (eingefahren mit h) zum Ziel des Fahrzeugs; inkl. Endausfahrt
  routeFrom(v, tile, h) {
    if (v.bus) return this.game.city.busRouteFrom(v, tile, h);
    if (v.goal < 0) return null;
    let r;
    if (tile === v.goal) r = [];
    else r = this.pf.find(tile, h, v.goal);
    if (!r) return null;
    if (v.goalDrive >= 0) r.push(v.goalDrive);
    else r.push(this.anyExit(v.goal, r.length ? r[r.length - 1] : h));
    return r;
  }

  // Neue Route berechnen, bereits zugesagte Kreuzungen bleiben erhalten
  reroute(v) {
    const w = this.world;
    if (v.dead || v.dwell > 0) return;
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
    // Startzustand nach dem letzten festen Schritt
    let st = v.t, sh = v.d;
    let tile = w.nb(st, sh), head = sh;
    for (let k = v.ri; k < keep; k++) {
      const d = v.route[k];
      if (tile < 0) break;
      if (tile === v.goal && (d === v.goalDrive || v.goalDrive < 0)) return;
      st = tile; sh = d;
      tile = w.nb(tile, d); head = d;
    }
    if (tile < 0 || !w.road[tile]) return;
    const r = this.routeFrom(v, tile, head);
    if (!r) return;
    v.route = v.route.slice(0, keep).concat(r);
  }

  // Blockiert ein ausparkendes Fahrzeug auf Kachel j die Bewegung (H -> D)?
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

  // Fahrzeuge, die in gleicher Richtung vorausfahren (Kreuzungen, Kreisverkehr)
  coneCheck(v) {
    const w = this.world;
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
    const t = this.tmp;
    v.p.pos(v.s, t);
    const W = this.world.w;
    v.x = (v.t % W) + t.x;
    v.y = ((v.t / W) | 0) + t.y;
    v.a = t.a;
  }

  arrive(v) {
    this.removeFromLane(v);
    this.releaseAll(v);
    v.dead = true;
    v.deadReason = 'arrive';
    this.byId.delete(v.id);
    this.stats.arrived++;
    this.game.city.onArrive(v);
  }

  // ---- Netzänderungen ---------------------------------------------------------------
  onTilesChanged(tiles) {
    const w = this.world;
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
          if (!okExit || !okEntry) { this.kill(v, 'demolish'); continue; }
          const np = pathAt(w, t, v.h, v.d);
          if (np !== v.p) { const f = v.s / v.p.len; v.p = np; v.s = Math.min(np.len, f * np.len); this.updatePos(v); }
          v.vlim = this.movLimit(t, v.h, v.d, v.p, v);
        }
      }
      // Neue Kreuzung: Fahrzeuge auf der Kachel als zugelassen eintragen
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
    this.markAllReroute();
  }

  markAllReroute() {
    for (const v of this.vehicles) v.needRoute = true;
  }

  // ---- Hauptschritt -------------------------------------------------------------------
  step(dt, now) {
    const w = this.world;
    const js = w.junctions;
    if (js) for (const J of js) if (J.type === 'light' && J.light) J.updateLight(now, dt);
    const V = this.vehicles;
    for (let k = 0; k < V.length; k++) if (!V[k].dead) this.plan(V[k]);
    if (js) for (const J of js) J.decide(this, now);
    for (let k = 0; k < V.length; k++) { const v = V[k]; if (!v.dead) this.move(v, dt); }
    // Aufgeben / Umleiten
    let budget = 14;
    for (let k = 0; k < V.length; k++) {
      const v = V[k];
      if (v.dead) continue;
      if (v.stuck > CFG.stuckLimit && !v.bus) { this.kill(v, 'stuck'); continue; }
      if (v.stuck > 8 && v.age - v.rerouteT > 10 && budget > 0) { v.rerouteT = v.age; this.reroute(v); budget--; }
    }
    if (V.length) {
      let n = Math.min(V.length, 40);
      while (n-- > 0) {
        this.rerouteCursor = (this.rerouteCursor + 1) % V.length;
        const v = V[this.rerouteCursor];
        if (v && !v.dead && v.needRoute) { v.needRoute = false; this.reroute(v); }
      }
    }
    // Tote Fahrzeuge entfernen
    let alive = 0;
    for (let k = 0; k < V.length; k++) if (!V[k].dead) V[alive++] = V[k];
    V.length = alive;
    // Messwerte (1x pro Sekunde)
    this.measT += dt;
    if (this.measT >= 1) {
      this.measT = 0;
      const cong = w.cong, sS = w.spdSum, sN = w.spdN;
      for (let i = 0; i < w.n; i++) {
        if (sN[i] > 0) {
          const r = sS[i] / sN[i];
          const target = clamp(1 / Math.max(0.14, r), 1, 7);
          cong[i] = cong[i] * 0.8 + target * 0.2;
          sS[i] = 0; sN[i] = 0;
        } else if (cong[i] > 1) cong[i] = Math.max(1, cong[i] * 0.93);
      }
    }
  }

  vehiclesOnTile(t) {
    const out = [];
    for (let h = 0; h < 4; h++) { const L = this.lanes[t * 4 + h]; if (L) for (const v of L) out.push(v); }
    return out;
  }

  // Anzahl wartender Fahrzeuge vor einer Kreuzung je Zufahrt
  queueAt(J) {
    const w = this.world, res = [0, 0, 0, 0];
    for (let s = 0; s < 4; s++) {
      if (!((J.inMask >> OPP[s]) & 1)) continue;
      let tile = w.nb(J.i, s), cnt = 0, dir = OPP[s];
      for (let n = 0; n < 6 && tile >= 0 && w.road[tile] && !w.isJ[tile]; n++) {
        let c = 0;
        for (let h = 0; h < 4; h++) { const L = this.lanes[tile * 4 + h]; if (L) for (const v of L) if (v.d === dir && v.v < 0.3) c++; }
        if (!c) break;
        cnt += c;
        // stromaufwärts
        let up = -1;
        for (let d = 0; d < 4; d++) { if (d === dir) continue; if ((w.link[tile] >> d) & 1) { up = d; break; } }
        if (up < 0) break;
        tile = w.nb(tile, up); dir = OPP[up];
      }
      res[OPP[s]] = cnt;
    }
    return res;
  }
}
