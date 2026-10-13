'use strict';
// ---------------------------------------------------------------------------
// A*-Routensuche auf dem Zustandsgraphen (Kachel, Einfahrtsrichtung)
// ---------------------------------------------------------------------------

const TURN_LEN = [1.0, 0.62, 1.3, 1.15];

class Pathfinder {
  constructor(world) {
    this.w = world;
    const N = world.n * 4;
    this.g = new Float32Array(N);
    this.from = new Int32Array(N);
    this.stamp = new Uint32Array(N);
    this.done = new Uint32Array(N);
    this.cur = 0;
    this.heap = new MinHeap(4096);
    this.expandLimit = 60000;
    this.calls = 0;
  }

  edgeCost(tile, h, d, freeFlow) {
    const w = this.w;
    const tt = turnOf(h, d);
    let v = CFG.roadSpeed[w.road[tile]] || 1.9;
    if (w.works[tile] > 0) v *= CFG.worksSpeed;
    if (tt !== TT_STRAIGHT) v = Math.min(v, CFG.turnSpeed[tt]);
    let c = TURN_LEN[tt] / v;
    if (!freeFlow) c *= w.cong[tile];
    if (w.isJ[tile]) {
      const J = w.jc[tile];
      if (J) c += freeFlow ? 0.4 : J.penalty(h, d);
    }
    if (w.flags[tile] & F_STOP) c += 0.3;
    return c;
  }

  // Liefert Ausfahrtsrichtungen ab Kachel s (Einfahrt mit Richtung h) bis zur Kachel vor dem Ziel.
  // Ergebnis: Array, oder null wenn unerreichbar.
  find(s, h, goal, opt) {
    const w = this.w;
    if (s === goal) return [];
    this.calls++;
    this.cur++;
    if (this.cur > 4e9) { this.stamp.fill(0); this.done.fill(0); this.cur = 1; }
    const cur = this.cur;
    const W = w.w;
    const gx = goal % W, gy = (goal / W) | 0;
    const hk = 1 / 3.3;
    const heap = this.heap;
    heap.clear();
    const st0 = s * 4 + h;
    this.g[st0] = 0; this.stamp[st0] = cur; this.from[st0] = -1;
    heap.push(0, st0);
    const freeFlow = opt && opt.freeFlow;
    const limit = (opt && opt.limit) || this.expandLimit;
    let expanded = 0, found = -1;
    const road = w.road, closed = w.closed;
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
      const tx = tile % W, ty = (tile / W) | 0;
      for (let d = 0; d < 4; d++) {
        if (!((ex >> d) & 1)) continue;
        const nx = tx + DX[d], ny = ty + DY[d];
        if (nx < 0 || ny < 0 || nx >= W || ny >= w.h) continue;
        const j = ny * W + nx;
        if (!road[j]) continue;
        const ns = j * 4 + d;
        if (this.done[ns] === cur) continue;
        const c = gBase + this.edgeCost(tile, hh, d, freeFlow) + (closed[j] ? 70 : 0);
        if (this.stamp[ns] !== cur || c < this.g[ns]) {
          this.g[ns] = c; this.stamp[ns] = cur; this.from[ns] = st;
          const hd = (Math.abs(nx - gx) + Math.abs(ny - gy)) * hk;
          heap.push(c + hd, ns);
        }
      }
    }
    this.lastExpanded = expanded;
    if (found < 0) return null;
    this.lastCost = this.g[found];
    const route = [];
    let st = found;
    while (this.from[st] >= 0) { route.push(st & 3); st = this.from[st]; }
    route.reverse();
    return route;
  }

  // Fahrzeit (Sekunden, frei fließend) entlang einer Route
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
