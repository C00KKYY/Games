'use strict';
// ---------------------------------------------------------------------------
// Gelände als schwebendes Diorama: Boden, Wasser, Berge, Bäume, Inselränder
// ---------------------------------------------------------------------------

const TCOL = {
  grass: ['#8fc46a', '#94c86d', '#89bf65', '#9acc72'],
  field: ['#d8c76a', '#cdbb5c'],
  sand: '#e6d39b',
  forestFloor: '#7cb35c',
  waterBed: '#6fa9b8',
  water: '#4fb3dd',
  rock: ['#a59a8a', '#978c7c', '#b2a898'],
  snow: '#f4f6f8',
  earth: ['#7a5a3c', '#6a4c33', '#5a402b'],
  tree: ['#3f8f4a', '#4a9a52', '#367f41', '#5aa85c'],
  trunk: '#7a5236',
};

const WATER_Y = -0.08, BED_Y = -0.32;

class Terrain3D {
  constructor(engine) {
    this.engine = engine;
    this.group = new THREE.Group();
    engine.scene.add(this.group);
    this.matVC = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    this.matWater = new THREE.MeshStandardMaterial({ color: col(TCOL.water), roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.82 });
    this.matTree = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    this.matLine = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    this.waterTime = 0;
  }

  dispose() {
    for (const c of [...this.group.children]) { this.group.remove(c); if (c.geometry && !c.geometry.userData.shared) c.geometry.dispose(); }
  }

  // Höhe eines Berg-Eckpunkts (Ecke zwischen 4 Kacheln)
  cornerH(w, cx, cy) {
    let n = 0, tot = 0;
    for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
      const x = cx + dx, y = cy + dy;
      tot++;
      if (w.inb(x, y) && w.terrain[w.idx(x, y)] === T_ROCK) n++;
    }
    if (n === 4) return 0.55 + hash2(cx, cy, w.seed + 9) * 0.55;
    if (n >= 2) return 0.12;
    return 0;
  }

  build(world, bounds) {
    this.dispose();
    const w = world;
    const G = new GeoBuilder();     // Boden (opak, Vertexfarben)
    const WG = new GeoBuilder();    // Wasseroberfläche
    const inside = (x, y) => !bounds || (x >= bounds.x0 && y >= bounds.y0 && x < bounds.x1 && y < bounds.y1);
    const dim = (c, x, y) => inside(x, y) ? c : c.clone().lerp(col('#9aa39a'), 0.42).multiplyScalar(0.82);
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
      const i = y * w.w + x;
      const t = w.terrain[i], v = w.variant[i];
      if (t === T_WATER) {
        G.rect(x, y, x + 1, y + 1, BED_Y, dim(col(TCOL.waterBed), x, y));
        // Uferwände zu Landkacheln
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d], ny = y + DY[d];
          if (w.inb(nx, ny) && w.terrain[w.idx(nx, ny)] === T_WATER) continue;
          const c = dim(col(TCOL.sand), x, y).clone().multiplyScalar(0.85);
          const ax = d === 1 ? x + 1 : x, az = d === 2 ? y + 1 : y;
          const bx = d === 0 ? x + 1 : d === 3 ? x : ax, bz = d === 1 ? y + 1 : d === 3 ? y + 1 : az;
          const p0 = d === 0 ? [x, y] : d === 1 ? [x + 1, y] : d === 2 ? [x + 1, y + 1] : [x, y + 1];
          const p1 = d === 0 ? [x + 1, y] : d === 1 ? [x + 1, y + 1] : d === 2 ? [x, y + 1] : [x, y];
          void ax; void az; void bx; void bz;
          G.quad([p0[0], 0, p0[1]], [p0[0], BED_Y, p0[1]], [p1[0], BED_Y, p1[1]], [p1[0], 0, p1[1]], c);
        }
        WG.rect(x, y, x + 1, y + 1, WATER_Y, col('#ffffff'));
        continue;
      }
      if (t === T_ROCK) {
        const h00 = this.cornerH(w, x, y), h10 = this.cornerH(w, x + 1, y), h11 = this.cornerH(w, x + 1, y + 1), h01 = this.cornerH(w, x, y + 1);
        // Gipfel in der Mitte
        let nRock = 0;
        for (let d = 0; d < 4; d++) { const nx = x + DX[d], ny = y + DY[d]; if (w.inb(nx, ny) && w.terrain[w.idx(nx, ny)] === T_ROCK) nRock++; }
        const peak = 0.45 + nRock * 0.22 + hash2(x, y, w.seed + 4) * 0.5;
        const cx = x + 0.5 + (hash2(x, y, w.seed + 5) - 0.5) * 0.3, cz = y + 0.5 + (hash2(x, y, w.seed + 6) - 0.5) * 0.3;
        const rc = col(TCOL.rock[v % 3]);
        const tri = (a, b) => {
          const hh = Math.max(a[1], b[1], peak);
          const c = hh > 1.35 ? col(TCOL.snow) : rc.clone().multiplyScalar(0.9 + ((a[0] + b[2]) % 1) * 0.15);
          G.tri(a, b, [cx, peak, cz], dim(c, x, y));
        };
        tri([x, h00, y], [x, h01, y + 1]);
        tri([x, h01, y + 1], [x + 1, h11, y + 1]);
        tri([x + 1, h11, y + 1], [x + 1, h10, y]);
        tri([x + 1, h10, y], [x, h00, y]);
        continue;
      }
      let c;
      if (t === T_FIELD) c = col(TCOL.field[(Math.floor(x / 2) + y) % 2]);
      else if (t === T_SAND) c = col(TCOL.sand);
      else if (t === T_FOREST) c = col(TCOL.forestFloor);
      else c = col(TCOL.grass[v & 3]);
      G.rect(x, y, x + 1, y + 1, 0, dim(c, x, y));
      if (t === T_FIELD && !w.road[i] && w.bld[i] < 0) {
        // Ackerfurchen
        const fc = dim(col('#bfae52'), x, y);
        for (let k = 0; k < 3; k++) G.rect(x + 0.12, y + 0.18 + k * 0.28, x + 0.88, y + 0.26 + k * 0.28, 0.005, fc);
      }
    }
    // Gleise
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
      const i = y * w.w + x, r = w.rail[i];
      if (!r || w.road[i]) continue;
      const water = w.terrain[i] === T_WATER;
      for (const vert of [true, false]) {
        if (!(r === 3 || (r === 1) === vert)) continue;
        const cx = x + 0.5, cz = y + 0.5;
        const R = (a, b, c2, d2, yy, cc) => vert ? G.rect(cx + a, y + c2, cx + b, y + d2, yy, cc) : G.rect(x + c2, cz + a, x + d2, cz + b, yy, cc);
        if (water) {
          const dc = dim(col('#8d8578'), x, y);
          vert ? G.box(cx - 0.26, -0.08, y, cx + 0.26, 0.01, y + 1, dc) : G.box(x, -0.08, cz - 0.26, x + 1, 0.01, cz + 0.26, dc);
          vert ? G.box(cx - 0.05, BED_Y, cz - 0.05, cx + 0.05, -0.08, cz + 0.05, dc) : G.box(cx - 0.05, BED_Y, cz - 0.05, cx + 0.05, -0.08, cz + 0.05, dc);
        } else R(-0.24, 0.24, 0, 1, 0.008, dim(col('#a89f8f'), x, y));
        for (let k = 0; k < 5; k++) R(-0.18, 0.18, k * 0.2 + 0.06, k * 0.2 + 0.12, 0.016, dim(col('#6b4f3a'), x, y));
        for (const o of [-0.09, 0.09]) R(o - 0.014, o + 0.014, 0, 1, 0.026, col('#6e7177'));
      }
    }
    // Inselränder (Erdschichten)
    const H = [0, -0.35, -0.9, -1.6];
    const side = (x0, z0, x1, z1) => {
      for (let k = 0; k < 3; k++) G.quad([x0, H[k], z0], [x0, H[k + 1], z0], [x1, H[k + 1], z1], [x1, H[k], z1], col(TCOL.earth[k]));
    };
    for (let x = 0; x < w.w; x++) { side(x + 1, 0, x, 0); side(x, w.h, x + 1, w.h); }
    for (let y = 0; y < w.h; y++) { side(0, y, 0, y + 1); side(w.w, y + 1, w.w, y); }
    G.rect(0, 0, w.w, w.h, H[3], col(TCOL.earth[2]));
    const ground = new THREE.Mesh(G.geometry(), this.matVC);
    ground.receiveShadow = true;
    ground.castShadow = true;
    this.group.add(ground);
    if (!WG.empty) {
      const water = new THREE.Mesh(WG.geometry(), this.matWater);
      water.receiveShadow = true;
      this.group.add(water);
      this.water = water;
    }
    this.buildTrees(w, bounds);
    this.buildBoundary(w, bounds);
  }

  // nach Bauarbeiten: Bäume unter neuen Straßen/Gebäuden entfernen (bzw. nach Abriss zurückholen)
  rebuildTrees(w, bounds) {
    const key = this.treeKey(w);
    if (key === this._treeKey) return;
    if (this.treeMesh) { this.group.remove(this.treeMesh); this.treeMesh.dispose && this.treeMesh.dispose(); this.treeMesh = null; }
    this.buildTrees(w, bounds);
  }

  treeKey(w) {
    let h = 0;
    for (let i = 0; i < w.n; i++) if (w.road[i] || w.bld[i] >= 0 || w.accOf[i] >= 0 || w.road[i + w.n]) h = (h * 31 + i) | 0;
    return h;
  }

  buildTrees(w, bounds) {
    this._treeKey = this.treeKey(w);
    this.treeMesh = null;
    const pos = [];
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
      const i = y * w.w + x;
      if (w.road[i] || w.bld[i] >= 0 || w.accOf[i] >= 0 || w.rail[i] || w.road[i + w.n]) continue;
      const t = w.terrain[i], v = w.variant[i];
      let n = 0;
      if (t === T_FOREST) n = 2 + (v % 3);
      else if (t === T_GRASS && v % 13 === 0) n = 1;
      const r = new RNG(v * 977 + i);
      for (let k = 0; k < n; k++) pos.push([x + 0.2 + r.next() * 0.6, y + 0.2 + r.next() * 0.6, 0.7 + r.next() * 0.6, r.next()]);
    }
    if (!pos.length) return;
    // Baum: Stamm + zwei Kegel (Low-Poly)
    const B = new GeoBuilder();
    const trunk = col(TCOL.trunk);
    B.box(-0.035, 0, -0.035, 0.035, 0.16, 0.035, trunk);
    const cone = (y0, r, hgt, c) => {
      const seg = 6;
      for (let s = 0; s < seg; s++) {
        const a0 = s / seg * Math.PI * 2, a1 = (s + 1) / seg * Math.PI * 2;
        B.tri([Math.cos(a0) * r, y0, Math.sin(a0) * r], [0, y0 + hgt, 0], [Math.cos(a1) * r, y0, Math.sin(a1) * r], c);
        B.tri([Math.cos(a1) * r, y0, Math.sin(a1) * r], [0, y0, 0], [Math.cos(a0) * r, y0, Math.sin(a0) * r], c);
      }
    };
    cone(0.12, 0.2, 0.32, col('#ffffff'));
    cone(0.3, 0.15, 0.28, col('#ffffff'));
    const geo = this.treeGeo || (this.treeGeo = B.geometry());
    geo.userData.shared = true;
    const mat = this.matTree;
    // Stammfarbe soll erhalten bleiben → Instanzfarbe multipliziert; daher Krone weiß, Instanzfarbe = Grün
    const mesh = new THREE.InstancedMesh(geo, mat, pos.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    pos.forEach((t, k) => {
      p.set(t[0], 0, t[1]);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t[3] * Math.PI * 2);
      s.set(t[2], t[2] * (0.9 + t[3] * 0.3), t[2]);
      m.compose(p, q, s);
      mesh.setMatrixAt(k, m);
      const c = col(TCOL.tree[Math.floor(t[3] * TCOL.tree.length)]);
      const inside = !bounds || (t[0] >= bounds.x0 && t[1] >= bounds.y0 && t[0] < bounds.x1 && t[1] < bounds.y1);
      if (!inside) c.lerp(col('#8a9688'), 0.45);
      mesh.setColorAt(k, c);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.treeMesh = mesh;
  }

  // Ortsgrenze: gelbe Pfosten an den Ecken und eine dezente Linie
  buildBoundary(w, b) {
    if (!b) return;
    const B = new GeoBuilder();
    const c = col('#f2c200'), dark = col('#222222');
    const y = 0.012;
    const lw = 0.05;
    B.rect(b.x0, b.y0 - lw, b.x1, b.y0 + lw, y, c);
    B.rect(b.x0, b.y1 - lw, b.x1, b.y1 + lw, y, c);
    B.rect(b.x0 - lw, b.y0, b.x0 + lw, b.y1, y, c);
    B.rect(b.x1 - lw, b.y0, b.x1 + lw, b.y1, y, c);
    for (const [x, z] of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]) {
      B.box(x - 0.03, 0, z - 0.03, x + 0.03, 0.55, z + 0.03, dark);
      B.box(x - 0.22, 0.42, z - 0.02, x + 0.22, 0.68, z + 0.02, c);
    }
    const mesh = new THREE.Mesh(B.geometry(), this.matLine);
    mesh.castShadow = true;
    this.group.add(mesh);
  }

  update(dt) {
    this.waterTime += dt;
    if (this.water) this.water.position.y = Math.sin(this.waterTime * 1.3) * 0.012;
  }
}
