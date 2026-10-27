'use strict';
// ---------------------------------------------------------------------------
// Automatischer Planer für die Kulisse hinter dem Menü: verbindet neue Häuser
// und Ziele mit dem Netz ihrer Farbe (kürzester Bauweg)
// ---------------------------------------------------------------------------

class AutoPlanner {
  constructor(game) { this.g = game; this.t = 0; this.heap = new MinHeap(1024); }

  path(from, targets) {
    const g = this.g, w = g.world, n = w.n;
    const dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1);
    const heap = this.heap; heap.clear();
    const tset = new Set(targets);
    dist[from] = 0; heap.push(0, from);
    while (heap.n) {
      const i = heap.pop();
      if (heap.lastKey > dist[i]) continue;
      if (tset.has(i) && i !== from) { const p = []; let k = i; while (k >= 0) { p.push(k); k = prev[k]; } return p.reverse(); }
      for (let d = 0; d < 4; d++) {
        const j = w.gnb(i, d);
        if (j < 0) continue;
        const ri = w.roadInfo(j);
        if (!ri.ok || ri.kind === 'tunnel' || (ri.kind === 'bridge' && g.inv.bridges <= 0)) continue;
        if ((w.up[i] >> d) & 1 || (w.up[j] >> OPP[d]) & 1) continue;
        if (w.rail[j] && ((w.rail[j] === 1) === (d === 0 || d === 2))) continue;
        const c = ri.kind === 'exists' ? 0.3 : ri.kind === 'bridge' ? 4 : 1 + (w.accOf[j] >= 0 && !tset.has(j) ? 3 : 0);
        const nd = dist[i] + c;
        if (nd < dist[j]) { dist[j] = nd; prev[j] = i; heap.push(nd, j); }
      }
    }
    return null;
  }

  netOf(acc) {
    const w = this.g.world;
    w.ensureComponents();
    if (!w.link[acc]) return [acc];
    const c = w.comp[acc], out = [];
    for (let i = 0; i < w.n; i++) if (w.road[i] && w.comp[i] === c) out.push(i);
    return out;
  }

  step(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1.2;
    const g = this.g, w = g.world;
    g.inv.roads = Math.max(g.inv.roads, 40);
    w.ensureComponents();
    for (const b of g.city.houses.concat(g.city.dests)) {
      const same = b.kind === 'house' ? g.city.dests.filter(d => d.pi === b.pi) : g.city.houses.filter(h => h.pi === b.pi);
      if (!same.length) continue;
      const comp = w.link[b.acc] ? w.comp[b.acc] : -2;
      if (same.some(o => w.link[o.acc] && w.comp[o.acc] === comp)) continue;
      let targets = [];
      for (const o of same) targets = targets.concat(this.netOf(o.acc));
      const p = this.path(b.acc, targets);
      if (p) { g.buildPath(p); w.ensureComponents(); return; }
    }
    // Engstellen entschärfen
    for (const pr of g.city.problems) if (pr.kind === 'junction' && pr.J.type === 'auto') { g.inv.lights = Math.max(1, g.inv.lights); g.useTool('light', pr.J.i); }
  }
}
