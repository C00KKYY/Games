'use strict';
// ---------------------------------------------------------------------------
// Routensuche: A* auf (Kachel, Einfahrtsrichtung) und Kostenfelder je Ziel
// ---------------------------------------------------------------------------

const TURN_LEN = [1.0, 0.62, 1.3, 1.15];

class Pathfinder {
  constructor(world) {
    this.w = world;
    const N = world.N * 4;
    this.g = new Float32Array(N);
    this.from = new Int32Array(N);
    this.stamp = new Uint32Array(N);
    this.done = new Uint32Array(N);
    this.cur = 0;
    this.heap = new MinHeap(4096);
    this.fieldHeap = new MinHeap(2048);
    this.fields = new Map();
  }

  speed(tile) {
    const w = this.w;
    let v = CFG.roadSpeed[w.road[tile]] || 2;
    if (w.road[tile] === 1 && w.mods && w.mods.tempo) v *= w.mods.tempo;
    return v;
  }

  edgeCost(tile, h, d, freeFlow) {
    const w = this.w;
    const tt = turnOf(h, d);
    let v = this.speed(tile);
    if (tt !== TT_STRAIGHT) v = Math.min(v, CFG.turnSpeed[tt]);
    let c = TURN_LEN[tt] / v;
    if (!freeFlow) c *= w.cong[tile];
    if (w.isJ[tile]) {
      const J = w.jc[tile];
      if (J) c += freeFlow ? 0.4 : J.penalty(h, d);
    }
    return c;
  }

  // Ausfahrtsrichtungen ab Kachel s (eingefahren mit h) bis zur Kachel goal. null = unerreichbar.
  find(s, h, goal, opt) {
    const w = this.w;
    if (s === goal) return [];
    this.cur++;
    if (this.cur > 4e9) { this.stamp.fill(0); this.done.fill(0); this.cur = 1; }
    const cur = this.cur;
    const W = w.w;
    const gx = w.tx(goal), gy = w.ty(goal);
    const hk = 1 / CFG.roadSpeed[2];
    const heap = this.heap;
    heap.clear();
    const st0 = s * 4 + h;
    this.g[st0] = 0; this.stamp[st0] = cur; this.from[st0] = -1;
    heap.push(0, st0);
    const freeFlow = opt && opt.freeFlow;
    const limit = (opt && opt.limit) || 80000;
    let expanded = 0, found = -1;
    const road = w.road, closed = w.closed, n = w.n;
    while (heap.n > 0) {
      const st = heap.pop();
      if (this.done[st] === cur) continue;
      this.done[st] = cur;
      const tile = st >> 2, hh = st & 3;
      if (tile === goal) { found = st; break; }
      if (++expanded > limit) break;
      const ex = w.exits(tile, hh);
      if (!ex) continue;
      const gBase = this.g[st];
      for (let d = 0; d < 4; d++) {
        if (!((ex >> d) & 1)) continue;
        const j = w.nb(tile, d);
        if (j < 0 || !road[j]) continue;
        const ns = j * 4 + d;
        if (this.done[ns] === cur) continue;
        const c = gBase + this.edgeCost(tile, hh, d, freeFlow) + (closed[j] ? 60 : 0);
        if (this.stamp[ns] !== cur || c < this.g[ns]) {
          this.g[ns] = c; this.stamp[ns] = cur; this.from[ns] = st;
          const jg = j >= n ? j - n : j;
          const hd = (Math.abs(jg % W - gx) + Math.abs(((jg / W) | 0) - gy)) * hk;
          heap.push(c + hd, ns);
        }
      }
    }
    if (found < 0) return null;
    this.lastCost = this.g[found];
    const route = [];
    let st = found;
    while (this.from[st] >= 0) { route.push(st & 3); st = this.from[st]; }
    route.reverse();
    return route;
  }

  // Kostenfeld: Fahrzeit von jeder Kachel bis zur Kachel goal (rückwärts, ohne Wenderegeln)
  field(goal) {
    const w = this.w;
    let f = this.fields.get(goal);
    if (f && f.version === w.topo) return f.dist;
    if (!f) { f = { dist: new Float64Array(w.N), version: -1 }; this.fields.set(goal, f); }
    const dist = f.dist;
    dist.fill(Infinity);
    f.version = w.topo;
    if (!w.road[goal]) return dist;
    const heap = this.fieldHeap;
    heap.clear();
    dist[goal] = 0;
    heap.push(0, goal);
    while (heap.n > 0) {
      const j = heap.pop();
      const dj = heap.lastKey;
      if (dj > dist[j]) continue;
      const lk = w.link[j];
      for (let d = 0; d < 4; d++) {
        if (!((lk >> d) & 1)) continue;
        const i = w.nb(j, d);
        if (i < 0 || !w.road[i] || !((w.out[i] >> OPP[d]) & 1)) continue;
        let c = 1 / this.speed(i) + (w.isJ[i] ? 0.6 : 0) + (w.closed[i] ? 60 : 0);
        c *= 0.5 + 0.5 * w.cong[i];
        const nd = dj + c;
        if (nd < dist[i]) { dist[i] = nd; heap.push(nd, i); }
      }
    }
    return dist;
  }

  dropField(goal) { this.fields.delete(goal); }

  routeTime(s, h, route) {
    const w = this.w;
    let t = 0, tile = s, hh = h;
    for (let k = 0; k < route.length; k++) {
      const d = route[k];
      t += this.edgeCost(tile, hh, d, true);
      tile = w.nb(tile, d); hh = d;
      if (tile < 0) break;
    }
    return t;
  }
}
