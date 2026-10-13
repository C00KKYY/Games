'use strict';
// ---------------------------------------------------------------------------
// Stadt: Verkehrsnachfrage, Rückfahrten, Wachstum, Ereignisse, Busse
// ---------------------------------------------------------------------------

const STOP_NAMES = ['Marktplatz', 'Rathaus', 'Am Park', 'Schulstraße', 'Lindenallee', 'Kirchweg', 'Gartenstraße', 'Bahnhofstraße', 'Mühlenweg', 'Am Brunnen', 'Rosenhof', 'Feldstraße', 'Ahornweg', 'Hafenkante', 'Uferstraße', 'Brückenplatz', 'Am Stadion', 'Klinikum', 'Gewerbepark', 'Lerchenberg', 'Waldrand', 'Kastanienplatz', 'Am Anger', 'Sonnenhang', 'Birkenweg', 'Theaterplatz', 'Neue Mitte', 'Postamt', 'Wasserturm', 'Eichendorffstraße', 'Goethestraße', 'Schillerplatz', 'Am Kreisel', 'Hauptstraße', 'Talstraße'];
const GATE_NAMES = ['Richtung Hamburg', 'Richtung München', 'Richtung Köln', 'Richtung Berlin', 'Richtung Stuttgart', 'Richtung Leipzig', 'Richtung Dresden', 'Richtung Hannover', 'Richtung Frankfurt', 'Richtung Nürnberg', 'Richtung Bremen', 'Richtung Kassel'];
const LINE_COLORS = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];
const COMPANY = ['Kröger AG', 'Lindner & Söhne', 'Nordwerk', 'Hansen Logistik', 'Brandt Technik', 'Vogel Medien', 'Steinmetz GmbH', 'Ostwind Energie', 'Falke Software', 'Rheinblick Versicherung', 'Weber Druck', 'Krause Bau'];

class City {
  constructor(game) {
    this.g = game;
    this.w = game.world;
    this.rng = new RNG(game.seed * 13 + 5);
    this.returns = [];        // sortiert nach Zeit absteigend (pop vom Ende)
    this.growthT = 0;
    this.accidents = [];      // {tile, t, total, wrecks:[{x,y,a,color}], amb}
    this.fires = [];          // {b, t, deadline, truck}
    this.outages = [];        // {tiles:[...], t}
    this.stops = new Map();   // tile -> {tile, name, waiting:[], served}
    this.lines = [];
    this.lineId = 1;
    this.weather = 'sun';
    this.weatherT = 60 * 8 / CFG.minPerSec * 60 / 60;
    this.nextWeather = 200;
    this.accCooldown = 60;
    this.worksT = 300;
    this.outageT = 900;
    this.fireT = 400;
    this.ambT = 300;
    this.stadium = null;      // {start, end, fans, announced}
    this.stadiumNext = -1;
    this.lists = null; this.listsVer = -1; this.bCount = -1;
    this.pendingBuses = [];
    this.usedStopNames = new Set();
    this.buildPax = 0;
    this.passengersToday = 0;
  }

  get level() { return this.g.level; }

  // ---- Gebäudelisten ---------------------------------------------------------------
  refreshLists() {
    const n = this.w.buildings.length;
    if (this.lists && this.bCount === n && this.listsVer === this.g.buildVersion) return this.lists;
    const L = { res: [], job: [], shop: [], leisure: [], delivery: [], gate: [], industry: [], hospital: [], fire: [], stadium: [], all: [] };
    for (const b of this.w.buildings) {
      if (b.dead) continue;
      L.all.push(b);
      const bt = BT[b.type];
      if (b.cat === 'res') L.res.push(b);
      if (b.cat === 'gate') { L.gate.push(b); continue; }
      if (bt.jobs) L.job.push(b);
      if (b.type === 'shop' || b.type === 'mall') { L.shop.push(b); L.delivery.push(b); }
      if (b.type === 'office') L.delivery.push(b);
      if (b.type === 'mall' || b.type === 'shop' || b.type === 'stadium' || b.type === 'hospital') L.leisure.push(b);
      if (b.type === 'industry') L.industry.push(b);
      if (b.type === 'hospital') L.hospital.push(b);
      if (b.type === 'firestation') L.fire.push(b);
      if (b.type === 'stadium') L.stadium.push(b);
    }
    this.lists = L; this.bCount = n; this.listsVer = this.g.buildVersion;
    return L;
  }

  attract(b, cat) {
    if (cat === 'job') return b.cat === 'gate' ? 0 : BT[b.type].jobs;
    if (cat === 'shop') return b.type === 'mall' ? 40 : 10;
    if (cat === 'leisure') {
      if (b.type === 'stadium') return this.stadium && this.stadium.pre ? 400 : 4;
      if (b.type === 'mall') return 22;
      if (b.type === 'hospital') return 5;
      return 6;
    }
    if (cat === 'delivery') return b.type === 'mall' ? 3 : (b.type === 'office' ? 0.6 : 1);
    if (cat === 'gate') return 1;
    return 1;
  }

  pickDest(origin, cat, decay) {
    const w = this.w;
    w.ensureComponents();
    const comp = w.comp[origin.acc];
    if (comp < 0) return null;
    const L = this.refreshLists();
    let list = L[cat] || [];
    const ox = origin.ax, oy = origin.ay;
    let tot = 0;
    const cand = this._cand || (this._cand = []), wts = this._wts || (this._wts = []);
    cand.length = 0; wts.length = 0;
    const add = (b, wgt) => {
      if (b === origin || b.dead || b.acc === origin.acc || !w.road[b.acc] || w.comp[b.acc] !== comp) return;
      const d = Math.abs(b.ax - ox) + Math.abs(b.ay - oy);
      const x = wgt * Math.exp(-d / decay);
      if (x <= 0) return;
      cand.push(b); wts.push(x); tot += x;
    };
    let exists = 0;
    for (const b of list) { if (b !== origin && !b.dead) exists++; add(b, this.attract(b, cat)); }
    if (cat === 'job' && origin.cat === 'res' && this.level.outCommute) for (const gb of L.gate) { exists++; add(gb, this.level.outCommute * 12); }
    this.lastPickExists = exists > 0;
    if (!cand.length) return null;
    let r = this.rng.next() * tot;
    for (let k = 0; k < cand.length; k++) { r -= wts[k]; if (r <= 0) return cand[k]; }
    return cand[cand.length - 1];
  }

  // ---- Fahrtwünsche --------------------------------------------------------------------
  queueTrip(from, to, purpose, vtype, extra) {
    if (from.queue.length >= 10) {
      from.failed++;
      this.g.rateTrip(35, 'queue', from);
      return false;
    }
    const t = { to, goal: to.acc, goalDrive: OPP[to.dir], purpose, vtype, t0: this.g.time, home: extra && extra.home, event: extra && extra.event };
    from.queue.push(t);
    return true;
  }

  // Versucht den Weg per Bus; true wenn ein Fahrgast entstanden ist
  tryBus(from, to, purpose, home) {
    if (!this.lines.length) return false;
    const s1 = this.nearStops(from), s2 = this.nearStops(to);
    if (!s1.length || !s2.length) return false;
    for (const line of this.lines) {
      if (!line.buses.size) continue;
      let a = -1, b = -1;
      for (const s of s1) if (line.stops.includes(s)) { a = s; break; }
      if (a < 0) continue;
      for (const s of s2) if (line.stops.includes(s) && s !== a) { b = s; break; }
      if (b < 0) continue;
      const st = this.stops.get(a);
      const p = Math.min(0.7, 0.3 + 0.1 * line.buses.size) * (st.waiting.length > 60 ? 0.25 : 1);
      if (!this.rng.chance(p)) return false;
      const md = Math.abs(from.ax - to.ax) + Math.abs(from.ay - to.ay);
      st.waiting.push({ line: line.id, dest: b, t0: this.g.time, ideal: (md * 1.25 + 2) / CFG.roadSpeed[1] + 9, home: home || from, to, purpose });
      return true;
    }
    return false;
  }

  nearStops(b) {
    if (b._stopsVer === this.g.stopVersion) return b._stops;
    const res = [];
    for (const [tile] of this.stops) {
      const x = this.w.tx(tile), y = this.w.ty(tile);
      const dx = Math.max(b.x - x, 0, x - (b.x + b.w - 1)), dy = Math.max(b.y - y, 0, y - (b.y + b.h - 1));
      if (Math.max(dx, dy) <= 4) res.push(tile);
    }
    b._stops = res; b._stopsVer = this.g.stopVersion;
    return res;
  }

  generate(dt) {
    const g = this.g, lv = this.level;
    const hour = g.hour, wd = g.weekday;
    const hFrac = dt * CFG.minPerSec / 60; // Spielstunden in diesem Schritt
    const dm = (lv.demand || 1) * g.demandRamp;
    const L = this.refreshLists();
    const rng = this.rng;
    for (const b of L.all) {
      if (!this.w.road[b.acc]) continue;
      if (b.fire) continue;
      if (b.cat === 'res') {
        const tr = BT[b.type].trips;
        for (const purpose of ['commute', 'shop', 'leisure']) {
          const exp = tr[purpose] * CURVES[purpose][hour] / CURVE_SUM[purpose] * WEEK[purpose][wd] * dm * hFrac;
          if (exp <= 0 || rng.next() >= exp) continue;
          const cat = purpose === 'commute' ? 'job' : purpose;
          const to = this.pickDest(b, cat, purpose === 'commute' ? 28 : 16);
          if (!to) { if (this.lastPickExists) this.noDest(b); continue; }
          if (this.tryBus(b, to, purpose)) continue;
          this.queueTrip(b, to, purpose, 'car', { home: b });
        }
      } else if (b.type === 'industry') {
        const exp = BT.industry.trucks * CURVES.delivery[hour] / CURVE_SUM.delivery * WEEK.delivery[wd] * dm * hFrac;
        if (exp > 0 && rng.next() < exp) {
          const to = this.pickDest(b, 'delivery', 30);
          if (to) this.queueTrip(b, to, 'delivery', rng.chance(0.7) ? 'truck' : 'van', { home: b });
        }
      } else if (b.cat === 'gate') {
        const thr = (lv.through || 0) * CURVES.through[hour] / CURVE_SUM.through * WEEK.through[wd] * dm * hFrac;
        if (thr > 0 && rng.next() < thr) {
          const to = this.pickDest(b, 'gate', 200);
          if (to) this.queueTrip(b, to, 'through', rng.chance(0.18) ? 'truck' : 'car');
        }
        const inc = (lv.inCommute || 0) * CURVES.commute[hour] / CURVE_SUM.commute * WEEK.commute[wd] * dm * hFrac;
        if (inc > 0 && rng.next() < inc) {
          const to = this.pickDest(b, 'job', 60);
          if (to) this.queueTrip(b, to, 'commute', 'car', { home: b });
        }
        if (!L.industry.length) {
          const dl = 6 * CURVES.delivery[hour] / CURVE_SUM.delivery * WEEK.delivery[wd] * dm * hFrac * Math.min(3, L.shop.length / 2);
          if (dl > 0 && rng.next() < dl) {
            const to = this.pickDest(b, 'delivery', 60);
            if (to) this.queueTrip(b, to, 'delivery', 'van', { home: b });
          }
        }
      }
    }
    // Stadion-Fans
    if (this.stadium && this.stadium.pre && L.stadium.length) {
      const st = L.stadium[0];
      if (this.w.road[st.acc]) {
        const exp = this.stadium.fansPerSec * dt;
        for (let k = 0; k < 3 && rng.next() < exp; k++) {
          const from = rng.pick(L.res);
          if (from && this.w.road[from.acc] && !this.tryBus(from, st, 'event', from)) this.queueTrip(from, st, 'event', 'car', { home: from, event: true });
        }
      }
    }
  }

  noDest(b) {
    b.noRoute = 30;
  }

  // ---- Rückfahrten ---------------------------------------------------------------------
  scheduleReturn(t, from, to, purpose, vtype, viaBus) {
    const R = this.returns;
    const item = { t, from: from.id, to: to.id, purpose, vtype, bus: viaBus };
    // binäres Einfügen (absteigend sortiert)
    let lo = 0, hi = R.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (R[mid].t > t) lo = mid + 1; else hi = mid; }
    R.splice(lo, 0, item);
  }

  processReturns() {
    const R = this.returns, now = this.g.time, B = this.w.buildings;
    let n = 0;
    while (R.length && R[R.length - 1].t <= now && n < 40) {
      const it = R.pop(); n++;
      const from = B[it.from], to = B[it.to];
      if (!from || !to || from.dead || to.dead) continue;
      from.present = Math.max(0, from.present - 1);
      if (it.bus && this.tryBus(from, to, 'home', to)) continue;
      this.queueTrip(from, to, 'home', it.vtype, { home: to });
    }
  }

  stayFor(purpose) {
    const r = this.rng, h = 60 / CFG.minPerSec; // Sim-Sekunden pro Spielstunde
    if (purpose === 'commute') return r.range(7.5, 9.5) * h;
    if (purpose === 'shop') return r.range(0.4, 1.5) * h;
    if (purpose === 'leisure') return r.range(1, 3) * h;
    if (purpose === 'delivery') return r.range(0.25, 0.6) * h;
    return 0;
  }

  onArrive(v) {
    const g = this.g;
    const to = v.to;
    if (v.emergency) { this.onEmergencyArrive(v); return; }
    const dur = g.time - v.t0;
    const ratio = dur / v.ideal;
    const rating = ratingFor(ratio);
    g.rateTrip(rating, v.purpose, v.from, v, dur);
    if (to) {
      to.recv++;
      to.rateSum += rating; to.rateN++;
      if (v.home && to !== v.home && to.cat !== 'gate') {
        to.present++;
        if (v.event && this.stadium) this.scheduleReturn(this.stadium.end + this.rng.range(0, 25), to, v.home, 'home', v.type, false);
        else {
          const stay = this.stayFor(v.purpose);
          if (stay > 0) this.scheduleReturn(g.time + stay, to, v.home, 'home', v.type, false);
        }
      }
    }
    if (v.from) { v.from.rateSum += rating; v.from.rateN++; }
  }

  onVehicleRemoved(v, reason) {
    const g = this.g;
    if (reason === 'stuck') {
      g.traffic.stats.gaveUp++;
      g.rateTrip(0, 'gaveup', v.from, v);
      g.notifyThrottled('stuck', 'Ein Fahrer hat im Stau aufgegeben. Prüfe verstopfte Kreuzungen!', 'warn', v.t);
      g.fx.puff(v.x, v.y, '#ef4444');
      if (v.home && v.to && v.home !== v.to) {
        // Person kommt trotzdem irgendwann heim
      }
    } else if (reason === 'noroute') {
      g.rateTrip(10, 'noroute', v.from, v);
      g.fx.puff(v.x, v.y, '#f59e0b');
    } else if (reason === 'demolish') {
      g.fx.puff(v.x, v.y, '#94a3b8');
    }
    if (v.bus) {
      const line = this.lines.find(l => l.id === v.bus.line);
      if (line) line.buses.delete(v.id);
    }
    if (v.emergency && v.task) this.onEmergencyFailed(v);
  }

  onNoRoute(b, trip) {
    b.noRoute = 30;
    b.failed++;
    this.g.rateTrip(5, 'noroute', b);
    this.g.notifyThrottled('noroute' + b.id, (BT[b.type].name) + ': Keine Route zum Ziel! Einbahnstraßen prüfen.', 'warn', b.acc);
  }

  // ---- Wachstum ------------------------------------------------------------------------
  growth(dt) {
    const lv = this.level, g = this.g;
    if (!lv.growth) return;
    const sat = g.satisfaction;
    let speed = sat < 25 ? 0 : sat < 45 ? 0.5 : sat > 75 ? 1.3 : 1;
    this.growthT += dt * speed * CFG.minPerSec;
    if (this.growthT < lv.growth) return;
    this.growthT = 0;
    const L = this.refreshLists();
    const nb = L.all.length - L.gate.length;
    if (nb >= (lv.maxBuildings || 999)) return;
    // Bevölkerung vs. Arbeitsplätze
    let pop = 0, jobs = 0;
    for (const b of L.all) { pop += b.pop; jobs += b.jobs; }
    const r = this.rng;
    const allowed = lv.types || ['house', 'apartment', 'office', 'shop', 'industry'];
    const can = t => allowed.includes(t);
    let type = null;
    // Sondergebäude
    const specials = lv.specials || {};
    for (const t of ['hospital', 'firestation', 'mall', 'stadium']) {
      if (specials[t] && pop >= specials[t] && !L.all.some(b => b.type === t)) { type = t; break; }
    }
    // Aufwertung
    if (!type && can('apartment') && sat > 58 && r.chance(0.16)) {
      const cand = L.res.filter(b => b.type === 'house' && this.w.road[b.acc] && b.rateN > 3 && b.rateSum / b.rateN > 55);
      if (cand.length) {
        const b = r.pick(cand);
        b.type = 'apartment';
        g.buildVersion++;
        this.w.markDirty(this.w.idx(b.x, b.y));
        g.notify('Ein Haus wurde zum Mehrfamilienhaus ausgebaut – mehr Verkehr!', 'info', b.acc);
        return;
      }
    }
    if (!type) {
      const needJobs = jobs < pop * 0.9;
      const opts = [];
      if (can('house')) opts.push(['house', needJobs ? 3 : 6]);
      if (can('apartment')) opts.push(['apartment', pop > 80 ? 2 : 0.5]);
      if (can('tower') && pop > 220) opts.push(['tower', 0.8]);
      if (can('office')) opts.push(['office', needJobs ? 3 : 0.8]);
      if (can('industry')) opts.push(['industry', needJobs ? 1.6 : 0.4]);
      if (can('shop')) opts.push(['shop', L.shop.length < pop / 45 ? 2.2 : 0.5]);
      type = r.weighted(opts, o => o[1])[0];
    }
    const b = this.placeNew(type);
    if (b) {
      b.born = g.time;
      g.buildVersion++;
      g.fx.build(b.x + b.w / 2, b.y + b.h / 2);
      const connected = !!this.w.road[b.acc];
      if (!connected) g.notify('Neu: ' + BT[type].name + ' – verbinde die Einfahrt mit einer Straße!', BT[type].cat === 'res' ? 'info' : 'new', b.acc);
      else if (BT[type].cat !== 'res') g.notify('Neu: ' + BT[type].name + (b.name ? ' (' + b.name + ')' : '') + '.', 'new', b.acc);
      if (type === 'stadium') this.stadiumNext = g.time + 60;
    }
  }

  placeNew(type, near) {
    const w = this.w, r = this.rng, bt = BT[type];
    const L = this.refreshLists();
    const anchors = L.all.filter(b => b.cat !== 'gate');
    const lv = this.level;
    let best = null, bestScore = -1e9;
    for (let attempt = 0; attempt < 140; attempt++) {
      let ax, ay;
      if (near) { ax = near.x; ay = near.y; }
      else if (anchors.length && r.chance(0.8)) { const a = r.pick(anchors); ax = a.x; ay = a.y; }
      else { ax = r.int(2, w.w - 3); ay = r.int(2, w.h - 3); }
      const rad = bt.w > 1 ? 7 : 5;
      const x = clamp(ax + r.int(-rad, rad), 1, w.w - bt.w - 1);
      const y = clamp(ay + r.int(-rad, rad), 1, w.h - bt.h - 1);
      if (lv.zone && !(x >= lv.zone[0] && y >= lv.zone[1] && x + bt.w <= lv.zone[2] && y + bt.h <= lv.zone[3])) continue;
      for (let k = 0; k < 4; k++) {
        const dir = (k + attempt) & 3;
        if (!w.footprintOk(type, x, y, dir)) continue;
        const tmp = new Building(-1, type, x, y, dir, 1);
        const a = w.idx(tmp.ax, tmp.ay);
        let score = r.next() * 2;
        if (w.road[a]) score += w.road[a] === 2 ? -5 : 6 - Math.min(5, w.flow[a] / 15);
        // Nicht direkt an andere Einfahrten kleben
        if (w.drive[a]) score -= 2;
        // Nähe zu Bestand
        let nearB = 0;
        for (let yy = y - 2; yy < y + bt.h + 2; yy++) for (let xx = x - 2; xx < x + bt.w + 2; xx++) if (w.inb(xx, yy) && w.bld[w.idx(xx, yy)] >= 0) nearB++;
        score += Math.min(4, nearB) * 0.5;
        // Platz für weitere Straßen lassen: Zufahrt sollte nicht von 3 Seiten eingeschlossen sein
        let blocked = 0;
        for (let d = 0; d < 4; d++) { const j = w.nb(a, d); if (j < 0 || w.bld[j] >= 0 || w.terrain[j] === T_WATER) blocked++; }
        if (blocked >= 3 && !w.road[a]) score -= 8;
        if (score > bestScore) { bestScore = score; best = { x, y, dir }; }
      }
      if (best && attempt > 50 && bestScore > 6) break;
    }
    if (!best || bestScore < -4) return null;
    const b = w.addBuilding(type, best.x, best.y, best.dir, r.int(1, 1e9));
    if (type === 'office' || type === 'industry') b.name = r.pick(COMPANY);
    this.g.onWorldEdit([b.acc]);
    return b;
  }

  // ---- Ereignisse ------------------------------------------------------------------------
  events(dt) {
    const g = this.g, lv = this.level, r = this.rng;
    const ev = lv.events || {};
    // Wetter
    this.nextWeather -= dt;
    if (this.nextWeather <= 0) {
      this.nextWeather = r.range(200, 420);
      const table = lv.weather || { sun: 1 };
      const keys = Object.keys(table);
      const nw = r.weighted(keys, k => table[k]);
      if (nw !== this.weather) {
        this.weather = nw;
        if (nw !== 'sun' && nw !== 'cloud') g.notify('Wetterumschwung: ' + WEATHER[nw].name + '. Fahrzeuge fahren langsamer, Unfallgefahr steigt.', 'weather');
      }
    }
    g.traffic.speedMul = WEATHER[this.weather].speed;
    // Unfälle
    this.accCooldown -= dt;
    for (let k = this.accidents.length - 1; k >= 0; k--) {
      const a = this.accidents[k];
      a.t -= dt;
      if (a.t <= 0) this.clearAccident(a);
    }
    // Baustellen
    const w = this.w;
    for (const i of this.workTiles || []) {
      if (w.works[i] > 0) { w.works[i] -= dt; if (w.works[i] <= 0) { w.works[i] = 0; w.markDirty(i); g.notify('Baustelle beendet.', 'info', i); } }
    }
    if (this.workTiles) this.workTiles = this.workTiles.filter(i => w.works[i] > 0);
    if (ev.works) {
      this.worksT -= dt;
      if (this.worksT <= 0) { this.worksT = r.range(500, 1100); this.startWorks(); }
    }
    // Stromausfall
    for (let k = this.outages.length - 1; k >= 0; k--) {
      const o = this.outages[k];
      o.t -= dt;
      if (o.t <= 0) this.endOutage(o);
    }
    if (ev.outage) {
      this.outageT -= dt;
      if (this.outageT <= 0) { this.outageT = r.range(900, 1700); this.startOutage(); }
    }
    // Brände
    const L = this.refreshLists();
    if (ev.fire && L.fire.length) {
      this.fireT -= dt;
      if (this.fireT <= 0) { this.fireT = r.range(500, 1000); this.startFire(); }
    }
    for (let k = this.fires.length - 1; k >= 0; k--) {
      const f = this.fires[k];
      f.t += dt;
      if (f.t >= f.deadline) this.burnDown(f);
    }
    // Rettungseinsätze
    if (ev.ambulance && L.hospital.length) {
      this.ambT -= dt;
      if (this.ambT <= 0) { this.ambT = r.range(260, 520); this.emergencyCall(); }
    }
    // Stadion
    if (L.stadium.length && ev.stadium !== false) this.stadiumLogic();
  }

  // Wird bei jeder Kreuzungsdurchfahrt aufgerufen
  onJunctionPass(J, v) {
    const lv = this.level;
    if (!(lv.events && lv.events.accidents)) return;
    if (this.accCooldown > 0 || this.accidents.length >= 2) return;
    let base;
    if (J.type === 'roundabout') base = 1 / 7000;
    else if (J.lightActive()) base = 1 / 9000;
    else if (J.type === 'priority') base = 1 / 3800;
    else base = 1 / 2400;
    // mehr Risiko bei vielen Konflikten: viele Arme, Linksabbieger
    if (J.off) base *= 2.5;
    const p = base * WEATHER[this.weather].acc * (lv.accidentMul || 1) * (v.p && v.p.turn === TT_LEFT ? 1.5 : 1);
    if (this.rng.next() < p) this.startAccident(J.i, v);
  }

  startAccident(tile, v) {
    const g = this.g, w = this.w;
    if (w.closed[tile]) return;
    this.accCooldown = 160;
    w.closed[tile] = 1;
    const wrecks = [];
    // beteiligte Fahrzeuge: das auslösende + ein weiteres in der Kachel
    const onTile = g.traffic.vehiclesOnTile(tile);
    const inv = [v].concat(onTile.filter(o => o !== v && !o.emergency).slice(0, 1));
    for (const o of inv) {
      if (o.dead || o.emergency || o.bus) continue;
      wrecks.push({ x: o.x, y: o.y, a: o.a + this.rng.range(-0.6, 0.6), color: o.color, type: o.type });
      g.traffic.kill(o, 'accident');
    }
    if (!wrecks.length) wrecks.push({ x: w.tx(tile) + 0.5, y: w.ty(tile) + 0.5, a: 0.4, color: '#64748b', type: 'car' });
    const a = { tile, t: this.rng.range(50, 80), total: 0, wrecks, amb: false };
    a.total = a.t;
    this.accidents.push(a);
    g.onWorldEdit([tile], true);
    g.penalize(3, 'accident');
    g.stats.accidents++;
    g.statsDay.accidents++;
    if (w.jc[tile]) w.jc[tile].accidents++;
    g.notify('Unfall auf einer Kreuzung! Die Kreuzung ist gesperrt. Klicke darauf, um den Abschleppdienst zu rufen.', 'danger', tile);
    g.audio.play('crash', w.tx(tile), w.ty(tile));
    g.fx.crash(w.tx(tile) + 0.5, w.ty(tile) + 0.5);
    // Rettungswagen
    const L = this.refreshLists();
    if (L.hospital.length) this.dispatch('ambulance', L.hospital, tile, { accident: a });
  }

  clearAccident(a, paid) {
    const w = this.w;
    const k = this.accidents.indexOf(a);
    if (k >= 0) this.accidents.splice(k, 1);
    w.closed[a.tile] = 0;
    this.g.onWorldEdit([a.tile], true);
    if (paid) this.g.notify('Abschleppdienst hat die Unfallstelle geräumt.', 'info', a.tile);
    else this.g.notify('Unfallstelle geräumt – die Kreuzung ist wieder frei.', 'info', a.tile);
  }

  towAccident(a) {
    if (!this.g.spend(CFG.towCost, 'Abschleppdienst')) return false;
    this.clearAccident(a, true);
    return true;
  }

  // Einsatzfahrzeug losschicken: zu Kachel (Unfall) oder Gebäude
  dispatch(type, bases, target, task) {
    const g = this.g, w = this.w;
    let goal, goalDrive = -1, to = null;
    if (target instanceof Building) { to = target; goal = target.acc; goalDrive = OPP[target.dir]; }
    else {
      // freie Nachbarkachel des Unfallortes
      goal = -1;
      for (let d = 0; d < 4; d++) {
        if (!((w.link[target] >> d) & 1)) continue;
        const j = w.nb(target, d);
        if (j >= 0 && w.road[j] && !w.closed[j]) { goal = j; break; }
      }
      if (goal < 0) return null;
    }
    let best = null, bd = 1e9;
    for (const b of bases) {
      if (!w.road[b.acc]) continue;
      const d = Math.abs(b.ax - w.tx(goal)) + Math.abs(b.ay - w.ty(goal));
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) return null;
    best.queue.unshift({ to, goal, goalDrive, purpose: 'emergency', vtype: type, t0: g.time, task });
    // sofort versuchen
    const before = g.traffic.vehicles.length;
    if (g.traffic.trySpawnTrip(best)) {
      const v = g.traffic.vehicles[g.traffic.vehicles.length - 1];
      v.task = task; v.emergencyStart = g.time;
      if (task) task.vehicle = v;
      g.audio.play('siren', best.ax, best.ay);
      return v;
    }
    // Spawn verzögert: Task an die Warteschlange gehängt
    const q = best.queue[0];
    if (q && q.purpose === 'emergency') q.task = task;
    return null;
  }

  onEmergencyArrive(v) {
    const g = this.g, t = v.task;
    if (!t) return;
    if (t.accident) {
      const a = t.accident;
      if (this.accidents.includes(a)) { a.amb = true; a.t = Math.min(a.t, 14); }
      g.notify('Rettungswagen am Unfallort eingetroffen (' + fmtDuration((g.time - v.emergencyStart) * CFG.minPerSec) + ').', 'good', v.goal);
      g.stats.rescues++;
    } else if (t.fire) {
      const f = t.fire;
      const k = this.fires.indexOf(f);
      if (k >= 0) {
        this.fires.splice(k, 1);
        f.b.fire = null;
        this.w.markDirty(this.w.idx(f.b.x, f.b.y));
        g.addMoney(400, 'Feuerwehr-Bonus', f.b.x + 0.5, f.b.y);
        g.penalize(-2, 'fire-saved');
        g.notify('Feuer gelöscht! Die Feuerwehr war rechtzeitig da.', 'good', f.b.acc);
        g.stats.rescues++;
        g.audio.play('good');
      }
    } else if (t.patient) {
      const dur = g.time - v.emergencyStart;
      if (dur < 45) { g.addMoney(250, 'Rettungseinsatz', v.x, v.y); g.penalize(-1, 'rescue'); g.stats.rescues++; }
      else g.penalize(2, 'rescue-late');
      g.notify('Rettungswagen beim Patienten (' + fmtDuration(dur * CFG.minPerSec) + ').', dur < 45 ? 'good' : 'warn', v.goal);
      // Rückfahrt ins Krankenhaus (ohne Blaulicht)
      if (v.to && v.from) this.scheduleReturn(g.time + 8, v.to, v.from, 'home', 'ambulance');
    }
  }

  onEmergencyFailed(v) {
    this.g.notify('Ein Einsatzfahrzeug ist nicht angekommen!', 'danger', v.t);
    this.g.penalize(3, 'emergency-failed');
  }

  emergencyCall() {
    const L = this.refreshLists();
    const houses = L.res.filter(b => this.w.road[b.acc]);
    if (!houses.length) return;
    const b = this.rng.pick(houses);
    const task = { patient: true };
    const v = this.dispatch('ambulance', L.hospital, b, task);
    if (v) this.g.notify('Notruf: Rettungswagen ist unterwegs.', 'info', b.acc);
  }

  startFire() {
    const L = this.refreshLists();
    const cand = L.all.filter(b => b.cat !== 'gate' && b.type !== 'firestation' && !b.fire && this.w.road[b.acc]);
    if (!cand.length) return;
    const b = this.rng.pick(cand);
    const f = { b, t: 0, deadline: 42 };
    b.fire = f;
    this.fires.push(f);
    this.w.markDirty(this.w.idx(b.x, b.y));
    const v = this.dispatch('firetruck', L.fire, b, { fire: f });
    this.g.notify('Feuer in einem Gebäude! Die Feuerwehr rückt aus – sorge für freie Fahrt.', 'danger', b.acc);
    this.g.audio.play('alarm', b.x, b.y);
    if (!v && !L.fire.some(s => this.w.road[s.acc])) f.deadline = 25;
  }

  burnDown(f) {
    const k = this.fires.indexOf(f);
    if (k >= 0) this.fires.splice(k, 1);
    const b = f.b;
    b.fire = null;
    this.g.notify('Die Feuerwehr kam zu spät – ein Gebäude ist abgebrannt!', 'danger', b.acc);
    this.g.penalize(6, 'burned');
    this.g.fx.puff(b.x + b.w / 2, b.y + b.h / 2, '#475569', 3);
    // Fahrzeuge, die dorthin wollen, werden später umgeleitet bzw. verlieren ihr Ziel
    this.w.removeBuilding(b);
    this.g.buildVersion++;
    this.g.onWorldEdit([b.acc]);
  }

  startWorks() {
    const w = this.w;
    const cand = [];
    for (let i = 0; i < w.n; i++) {
      if (!w.road[i] || w.isJ[i] || w.works[i] > 0 || w.closed[i] || (w.flags[i] & (F_BRIDGE | F_TUNNEL))) continue;
      if (w.flow[i] > 4 || this.rng.chance(0.08)) cand.push(i);
    }
    if (!cand.length) return;
    const i = this.rng.pick(cand);
    w.works[i] = this.rng.range(200, 380);
    w.markDirty(i);
    (this.workTiles || (this.workTiles = [])).push(i);
    this.g.onWorldEdit([i], true);
    this.g.notify('Straßenbauarbeiten: Ein Abschnitt ist nur langsam befahrbar.', 'warn', i);
  }

  rushWorks(i) {
    if (!this.g.spend(CFG.worksRushCost, 'Baustelle beschleunigt')) return false;
    this.w.works[i] = Math.min(this.w.works[i], 8);
    return true;
  }

  startOutage() {
    const w = this.w;
    const lights = [...(w.junctions || [])].filter(J => J.type === 'light' && !J.off);
    if (!lights.length) return;
    const c = this.rng.pick(lights);
    const cx = w.tx(c.i), cy = w.ty(c.i);
    const o = { tiles: [], t: this.rng.range(80, 150), x: cx, y: cy };
    for (const J of lights) {
      if (Math.abs(w.tx(J.i) - cx) + Math.abs(w.ty(J.i) - cy) <= 8) { J.off = true; o.tiles.push(J.i); }
    }
    this.outages.push(o);
    this.g.notify('Stromausfall! ' + o.tiles.length + ' Ampel(n) ausgefallen – dort gilt jetzt rechts vor links.', 'danger', c.i);
    this.g.audio.play('power');
  }

  endOutage(o, paid) {
    const k = this.outages.indexOf(o);
    if (k >= 0) this.outages.splice(k, 1);
    for (const i of o.tiles) if (this.w.jc[i]) this.w.jc[i].off = false;
    this.g.notify(paid ? 'Notstrom aktiviert – Ampeln laufen wieder.' : 'Stromversorgung wiederhergestellt.', 'info', o.tiles[0]);
  }

  fixOutage(o) {
    if (!this.g.spend(CFG.powerFixCost, 'Notstrom')) return false;
    this.endOutage(o, true);
    return true;
  }

  outageAt(tile) { return this.outages.find(o => o.tiles.includes(tile)); }

  stadiumLogic() {
    const g = this.g;
    const minute = g.minutes;
    const day = Math.floor(minute / 1440);
    if (!this.stadium) {
      // Nächstes Spiel planen: Freitag/Samstag oder zufällig
      if (this.stadiumNext < 0) this.stadiumNext = g.time;
      const wd = g.weekday;
      const mod = minute % 1440;
      if (g.time >= this.stadiumNext && mod > 8 * 60 && mod < 12 * 60 && (wd === 4 || wd === 5 || wd === 2) && this.rng.chance(0.004)) {
        const start = (day * 1440 + 19.5 * 60) / CFG.minPerSec;
        const end = (day * 1440 + 21.75 * 60) / CFG.minPerSec;
        const fans = Math.round(90 * (this.level.demand || 1) * g.demandRamp + this.rng.range(0, 40));
        this.stadium = { start, end, fans, preStart: start - 2.5 * 60 / CFG.minPerSec, pre: false, fansPerSec: fans / (2.3 * 60 / CFG.minPerSec) };
        g.notify('Heute 19:30 Uhr: Fußballspiel im Stadion! Rechne ab 17 Uhr mit ' + fans + ' Fans auf den Straßen.', 'event', this.lists.stadium[0].acc);
        g.audio.play('event');
      }
    } else {
      const s = this.stadium;
      s.pre = g.time >= s.preStart && g.time < s.start - 4;
      if (g.time > s.end + 120) { this.stadium = null; this.stadiumNext = g.time + 900; }
    }
  }

  // ---- Busse -----------------------------------------------------------------------------
  stopName() {
    const free = STOP_NAMES.filter(n => !this.usedStopNames.has(n));
    const n = free.length ? this.rng.pick(free) : 'Haltestelle ' + (this.stops.size + 1);
    this.usedStopNames.add(n);
    return n;
  }

  addStop(tile, name) {
    if (this.stops.has(tile)) return null;
    const s = { tile, name: name || this.stopName(), waiting: [], served: 0 };
    this.stops.set(tile, s);
    this.w.flags[tile] |= F_STOP;
    this.w.markDirty(tile);
    this.g.stopVersion++;
    return s;
  }

  removeStop(tile) {
    const s = this.stops.get(tile);
    if (!s) return;
    this.stops.delete(tile);
    this.usedStopNames.delete(s.name);
    this.w.flags[tile] &= ~F_STOP;
    this.w.markDirty(tile);
    for (const p of s.waiting) this.g.rateTrip(15, 'bus-cancel');
    for (const line of this.lines.slice()) {
      const k = line.stops.indexOf(tile);
      if (k >= 0) {
        line.stops.splice(k, 1);
        if (line.stops.length < 2) this.deleteLine(line);
        else this.relinkBuses(line);
      }
    }
    this.g.stopVersion++;
  }

  createLine(stops) {
    if (stops.length < 2) return null;
    const id = this.lineId++;
    const line = { id, name: 'Linie ' + id, color: LINE_COLORS[(id - 1) % LINE_COLORS.length], stops: stops.slice(), buses: new Set(), pax: 0, paxDay: 0 };
    this.lines.push(line);
    this.g.stopVersion++;
    return line;
  }

  deleteLine(line) {
    const k = this.lines.indexOf(line);
    if (k >= 0) this.lines.splice(k, 1);
    for (const id of [...line.buses]) {
      const v = this.g.traffic.byId.get(id);
      if (v) { this.g.addMoney(Math.round(CFG.cost.bus * 0.5), 'Bus verkauft'); v.bus = null; this.g.traffic.kill(v, 'demolish'); }
    }
    line.buses.clear();
    this.pendingBuses = this.pendingBuses.filter(p => p.line !== line.id);
    for (const s of this.stops.values()) s.waiting = s.waiting.filter(p => p.line !== line.id);
    this.g.stopVersion++;
  }

  relinkBuses(line) {
    for (const id of line.buses) {
      const v = this.g.traffic.byId.get(id);
      if (!v) continue;
      v.bus.k = v.bus.k % line.stops.length;
      v.bus.stopTile = line.stops[v.bus.k];
      v.bus.served = false;
      v.needRoute = true;
    }
  }

  addBus(line) {
    if (!this.g.spend(CFG.cost.bus, 'Bus gekauft')) return false;
    this.pendingBuses.push({ line: line.id, t: 0 });
    return true;
  }

  removeBus(line) {
    const id = [...line.buses].pop();
    if (id === undefined) {
      const k = this.pendingBuses.findIndex(p => p.line === line.id);
      if (k >= 0) { this.pendingBuses.splice(k, 1); this.g.addMoney(CFG.cost.bus, 'Bus storniert'); return true; }
      return false;
    }
    const v = this.g.traffic.byId.get(id);
    line.buses.delete(id);
    if (v) {
      // Fahrgäste aussteigen lassen (zählen als abgebrochen)
      for (let k = 0; k < v.pax; k++) this.g.rateTrip(30, 'bus-cancel');
      v.bus = null;
      this.g.traffic.kill(v, 'demolish');
    }
    this.g.addMoney(Math.round(CFG.cost.bus * 0.5), 'Bus verkauft');
    return true;
  }

  // Route eines Busses ab (tile,h): zur nächsten Haltestelle und dann zur übernächsten
  busRouteFrom(v, tile, h) {
    const line = this.lines.find(l => l.id === v.bus.line);
    if (!line) return null;
    const pf = this.g.traffic.pf;
    const A = v.bus.stopTile;
    const nextK = (v.bus.k + 1) % line.stops.length;
    const B = line.stops[nextK];
    let leg1 = tile === A ? [] : pf.find(tile, h, A);
    if (!leg1) return null;
    // Ankunftsrichtung an A
    let head = h, t = tile;
    for (const d of leg1) { t = this.w.nb(t, d); head = d; }
    let leg2 = pf.find(A, head, B);
    if (!leg2) leg2 = [this.g.traffic.anyExit(A, head)];
    if (!leg2.length) leg2 = [this.g.traffic.anyExit(A, head)];
    return leg1.concat(leg2);
  }

  spawnPendingBuses() {
    if (!this.pendingBuses.length) return;
    const tr = this.g.traffic, w = this.w;
    for (let k = this.pendingBuses.length - 1; k >= 0; k--) {
      const pb = this.pendingBuses[k];
      const line = this.lines.find(l => l.id === pb.line);
      if (!line) { this.pendingBuses.splice(k, 1); continue; }
      const s0 = line.stops[0];
      if (!w.road[s0] || !tr.spawnFree(s0)) continue;
      // Einfahrtsrichtung wählen, für die eine Route existiert
      let done = false;
      for (let h = 0; h < 4 && !done; h++) {
        if (!((w.link[s0] >> OPP[h]) & 1)) continue;
        const fake = { bus: { line: line.id, k: 1 % line.stops.length, stopTile: line.stops[1 % line.stops.length], served: false } };
        const ex = w.exits(s0, h);
        for (let d = 0; d < 4 && !done; d++) {
          if (!((ex >> d) & 1)) continue;
          const j = w.nb(s0, d);
          const r = this.busRouteFrom(fake, j, d);
          if (!r) continue;
          const v = tr.spawnVehicle('bus', s0, h, d, r, 0);
          v.s = 0.3; tr.updatePos(v);
          v.bus = fake.bus;
          v.color = line.color;
          v.goal = -2;
          line.buses.add(v.id);
          this.pendingBuses.splice(k, 1);
          done = true;
        }
      }
      if (!done) {
        pb.t++;
        if (pb.t > 400) { this.pendingBuses.splice(k, 1); this.g.addMoney(CFG.cost.bus, 'Bus storniert'); this.g.notify(line.name + ': Keine Route zwischen den Haltestellen!', 'warn', s0); }
      }
    }
  }

  busArrive(v) {
    const g = this.g;
    const st = this.stops.get(v.t);
    v.bus.served = true;
    if (!st) { v.dwell = 0.1; return; }
    const line = this.lines.find(l => l.id === v.bus.line);
    let out = 0, inn = 0;
    // Aussteigen
    if (v.paxList) {
      const keep = [];
      for (const p of v.paxList) {
        if (p.dest === v.t) {
          out++;
          const dur = g.time - p.t0;
          const rating = ratingFor(dur / p.ideal / 1.15);
          g.rateTrip(rating, 'bus', p.home, null, dur);
          g.addMoney(4, null);
          g.stats.busPax++; g.statsDay.busPax++;
          if (line) { line.pax++; line.paxDay++; }
          if (p.to && p.to !== p.home && p.purpose !== 'home') {
            p.to.present++;
            const stay = p.purpose === 'event' && this.stadium ? this.stadium.end - g.time + this.rng.range(0, 20) : this.stayFor(p.purpose);
            if (stay > 0) this.scheduleReturn(g.time + stay, p.to, p.home, 'home', 'car', true);
          }
        } else keep.push(p);
      }
      v.paxList = keep;
    } else v.paxList = [];
    // Einsteigen
    const cap = 40;
    const rest = [];
    for (const p of st.waiting) {
      if (p.line === v.bus.line && v.paxList.length < cap) { v.paxList.push(p); inn++; }
      else rest.push(p);
    }
    st.waiting = rest;
    st.served += inn;
    v.pax = v.paxList.length;
    v.dwell = 1.2 + 0.05 * (out + inn);
  }

  busDepart(v) {
    const line = this.lines.find(l => l.id === v.bus.line);
    if (!line) { this.g.traffic.kill(v, 'demolish'); return; }
    v.bus.k = (v.bus.k + 1) % line.stops.length;
    v.bus.stopTile = line.stops[v.bus.k];
    v.bus.served = false;
    this.g.traffic.reroute(v);
  }

  busUpdate(dt) {
    // Wartende geben irgendwann auf
    const g = this.g;
    this.spawnPendingBuses();
    this._busT = (this._busT || 0) + dt;
    if (this._busT < 1) return;
    this._busT = 0;
    for (const s of this.stops.values()) {
      if (!s.waiting.length) continue;
      const keep = [];
      for (const p of s.waiting) {
        if (g.time - p.t0 > 55) { g.rateTrip(12, 'bus-wait'); }
        else keep.push(p);
      }
      s.waiting = keep;
    }
  }

  // ---- Zyklus ---------------------------------------------------------------------------
  update(dt) {
    this.generate(dt);
    this.processReturns();
    // Abfahrten
    const L = this.refreshLists();
    const tr = this.g.traffic;
    for (const b of L.all) {
      if (b.queue.length) tr.trySpawnTrip(b);
      if (b.noRoute > 0) b.noRoute -= dt;
      if (b.cat !== 'gate') {
        if (!this.w.road[b.acc]) b.unconnected += dt; else b.unconnected = 0;
      }
    }
    this.busUpdate(dt);
    this.growth(dt);
    this.events(dt);
  }

  unconnectedCount(grace) {
    let n = 0;
    const L = this.refreshLists();
    for (const b of L.all) if (b.cat !== 'gate' && b.unconnected > grace) n++;
    return n;
  }

  // ---- Speichern ---------------------------------------------------------------------------
  serialize() {
    const B = this.w.buildings;
    const idMap = new Map(); let n = 0;
    for (const b of B) if (!b.dead) idMap.set(b.id, n++);
    return {
      weather: this.weather,
      stops: [...this.stops.values()].map(s => ({ tile: s.tile, name: s.name })),
      lines: this.lines.map(l => ({ id: l.id, name: l.name, color: l.color, stops: l.stops, buses: l.buses.size + this.pendingBuses.filter(p => p.line === l.id).length, pax: l.pax })),
      lineId: this.lineId,
      works: (this.workTiles || []).map(i => [i, this.w.works[i]]),
      returns: this.returns.filter(r => idMap.has(r.from) && idMap.has(r.to)).map(r => ({ t: r.t, from: idMap.get(r.from), to: idMap.get(r.to), purpose: r.purpose, vtype: r.vtype, bus: r.bus })),
    };
  }

  deserialize(o) {
    this.weather = o.weather || 'sun';
    for (const s of o.stops || []) { this.addStop(s.tile, s.name); }
    for (const lo of o.lines || []) {
      const line = { id: lo.id, name: lo.name, color: lo.color, stops: lo.stops.filter(t => this.stops.has(t)), buses: new Set(), pax: lo.pax || 0, paxDay: 0 };
      if (line.stops.length < 2) continue;
      this.lines.push(line);
      for (let k = 0; k < lo.buses; k++) this.pendingBuses.push({ line: line.id, t: 0 });
    }
    this.lineId = o.lineId || this.lines.length + 1;
    this.workTiles = [];
    for (const [i, t] of o.works || []) { this.w.works[i] = t; this.workTiles.push(i); }
    this.returns = (o.returns || []).map(r => ({ t: r.t, from: r.from, to: r.to, purpose: r.purpose, vtype: r.vtype, bus: r.bus }));
    this.returns.sort((a, b) => b.t - a.t);
  }
}

function ratingFor(ratio) {
  if (ratio <= 1.1) return 100;
  if (ratio <= 1.5) return 100 - (ratio - 1.1) / 0.4 * 18;
  if (ratio <= 2.2) return 82 - (ratio - 1.5) / 0.7 * 30;
  if (ratio <= 3.5) return 52 - (ratio - 2.2) / 1.3 * 34;
  return Math.max(0, 18 - (ratio - 3.5) * 5);
}
