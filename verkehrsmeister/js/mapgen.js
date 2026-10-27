'use strict';
// ---------------------------------------------------------------------------
// Kartengenerierung für die sechs Städte
// ---------------------------------------------------------------------------

function startBounds(def, W, H) {
  const s = def.startSize || 14;
  const x0 = Math.floor((W - s) / 2), y0 = Math.floor((H - s) / 2);
  return { x0, y0, x1: x0 + s, y1: y0 + s };
}

function generateCity(def, seed) {
  const W = def.size, H = def.size;
  const world = new World(W, H, seed);
  const rng = new RNG(seed);
  const m = def.terrain || {};
  const cx = W / 2, cy = H / 2;
  const T = world.terrain;
  const set = (x, y, t) => { if (world.inb(x, y)) T[world.idx(x, y)] = t; };
  const get = (x, y) => world.inb(x, y) ? T[world.idx(x, y)] : -1;
  const distC = (x, y) => Math.max(Math.abs(x + 0.5 - cx), Math.abs(y + 0.5 - cy));
  // Grundgelände + Felder
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const f = fbm(x / 7, y / 7, seed + 11, 3);
    T[world.idx(x, y)] = (m.fields && f > 1 - m.fields * 0.8) ? T_FIELD : T_GRASS;
  }
  // Berge (Fels-Cluster), Zentrum größtenteils frei
  if (m.rocks) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const f = fbm(x / 5.5, y / 5.5, seed + 23, 3);
      const dc = distC(x, y);
      const th = 1 - m.rocks * 0.9 + (dc < 5 ? 0.35 : dc < 8 ? 0.12 : 0);
      if (f > th) set(x, y, T_ROCK);
    }
    // Einzelne Felsen entfernen (sehen wie Pickel aus)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (get(x, y) !== T_ROCK) continue;
      let k = 0;
      for (let d = 0; d < 4; d++) if (get(x + DX[d], y + DY[d]) === T_ROCK) k++;
      if (k === 0) set(x, y, T_GRASS);
    }
  }
  // Bach / Fluss als mäandernde Linie
  const meander = (width, vertical, offset) => {
    let p = (vertical ? cx : cy) + offset;
    const len = vertical ? H : W;
    let prev = Math.round(p);
    for (let t = 0; t < len; t++) {
      p += (fbm(t / 6, offset * 3.1, seed + 41, 2) - 0.5) * 1.3;
      p = clamp(p, (vertical ? cx : cy) + offset - 5, (vertical ? cx : cy) + offset + 5);
      const q = Math.round(p);
      // 4-zusammenhängend machen
      const lo = Math.min(prev, q), hi = Math.max(prev, q);
      for (let k = lo; k <= hi; k++) for (let w2 = 0; w2 < width; w2++) vertical ? set(k + w2, t, T_WATER) : set(t, k + w2, T_WATER);
      prev = q;
    }
  };
  if (m.brook) meander(1, rng.chance(0.5), rng.chance(0.5) ? 3 : -4);
  if (m.river) meander(2, rng.chance(0.5), rng.chance(0.5) ? 5 : -6);
  // Kanäle (Hafenstadt): breiter Schifffahrtskanal + schmale Seitenkanäle
  if (m.canals) {
    const yc = Math.floor(cy) + 2;
    for (let x = 0; x < W; x++) for (let k = 0; k < 2; k++) { set(x, yc + k, T_WATER); world.canal[world.idx(x, yc + k)] = 1; }
    for (const xc of [Math.floor(cx) - 5, Math.floor(cx) + 6]) {
      for (let y = 0; y < yc; y++) set(xc, y, T_WATER);
    }
    const xs = Math.floor(cx) + 1;
    for (let y = yc + 2; y < H; y++) set(xs, y, T_WATER);
  }
  if (m.coast) for (let y = H - 3; y < H; y++) for (let x = 0; x < W; x++) set(x, y + (fbm(x / 4, 1, seed, 2) > 0.6 ? -1 : 0), T_WATER);
  // Seen
  if (m.lakes) {
    for (let k = 0; k < m.lakes; k++) {
      let lx = 0, ly = 0;
      for (let tries = 0; tries < 50; tries++) {
        lx = rng.int(4, W - 5); ly = rng.int(4, H - 5);
        if (distC(lx, ly) > 6) break;
      }
      const r = rng.range(2, 3.3);
      for (let y = Math.floor(ly - r - 1); y <= ly + r + 1; y++) for (let x = Math.floor(lx - r - 1); x <= lx + r + 1; x++) {
        const d = Math.hypot(x - lx, y - ly) + (fbm(x / 2, y / 2, seed + k, 2) - 0.5) * 1.4;
        if (d < r && distC(x, y) > 4) set(x, y, T_WATER);
      }
    }
  }
  // Wald
  if (m.forest) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = get(x, y);
    if (t !== T_GRASS && t !== T_FIELD) continue;
    const f = fbm(x / 5, y / 5, seed + 31, 3);
    const dc = distC(x, y);
    if (f > 1 - m.forest * 0.85 + (dc < 4 ? 0.25 : 0)) set(x, y, T_FOREST);
  }
  // Sand am Ufer
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (get(x, y) !== T_GRASS) continue;
    let nearW = false;
    for (let d = 0; d < 4; d++) if (get(x + DX[d], y + DY[d]) === T_WATER) nearW = true;
    if (nearW && hash2(x, y, seed + 7) < 0.3) set(x, y, T_SAND);
  }
  // Gleise (Ruhrstadt)
  if (m.rails) {
    const lines = [];
    lines.push({ vert: true, at: Math.floor(cx) + 4 });
    if (m.rails > 1) lines.push({ vert: false, at: Math.floor(cy) - 5 });
    for (const L of lines) {
      for (let t = 0; t < (L.vert ? H : W); t++) {
        const x = L.vert ? L.at : t, y = L.vert ? t : L.at;
        const i = world.idx(x, y);
        world.rail[i] = world.rail[i] ? 3 : (L.vert ? 1 : 2);
        if (T[i] === T_FOREST || T[i] === T_ROCK) T[i] = T_GRASS;
      }
    }
    world.railLines = lines;
  }
  // Startbereich: keine Felsen direkt in der Mitte
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (distC(x, y) < 2.5 && get(x, y) === T_ROCK) set(x, y, T_GRASS);
  world.bounds = startBounds(def, W, H);
  // Autobahnring (Hauptstadt): vorgebaute schnelle Ringstraße
  if (def.mech && def.mech.ring) {
    const r0 = Math.floor(cx) - 8, r1 = Math.floor(cx) + 7;
    const ring = [];
    for (let x = r0; x <= r1; x++) { ring.push(world.idx(x, r0)); }
    for (let y = r0 + 1; y <= r1; y++) ring.push(world.idx(r1, y));
    for (let x = r1 - 1; x >= r0; x--) ring.push(world.idx(x, r1));
    for (let y = r1 - 1; y > r0; y--) ring.push(world.idx(r0, y));
    for (const i of ring) { if (world.rail[i]) world.rail[i] = 0; world.placeRoad(i); world.road[i] = 2; world.free[i] = 1; }
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k], b = ring[(k + 1) % ring.length];
      for (let d = 0; d < 4; d++) if (world.gnb(a, d) === b) world.connect(a, d);
    }
    world.refreshAll();
  }
  return world;
}
