'use strict';
// ---------------------------------------------------------------------------
// 3D-Szene eines laufenden Spiels: verbindet Spielzustand mit den 3D-Bausteinen
// (Gelände, Straßen, Gebäude, Fahrzeuge, Ampeln, Polizei, Baustellen, Züge,
// Schiffe, Klappbrücken, Partikel, Bauvorschau, Stau-Färbung)
// ---------------------------------------------------------------------------

const PREVIEW_COL = {
  road: '#ffffff', exists: '#cfe8ff', bridge: '#5ab0ff', tunnel: '#c49a6c', crossing: '#ffe08a',
  bad: '#ff4d4d', swipe: '#ffd23f', erase: '#ff6b5b', highway: '#3b82f6', tool: '#ffffff', toolBad: '#ff4d4d',
};

// Nur den benutzten Teil der Instanzpuffer hochladen; leere Puffer gar nicht
function flushInst(mesh, n, color) {
  mesh.count = n;
  if (n === 0 && mesh.userData.lastN === 0) return;
  mesh.userData.lastN = n;
  const m = mesh.instanceMatrix;
  m.updateRange.offset = 0; m.updateRange.count = Math.max(1, n) * 16; m.needsUpdate = true;
  if (color && mesh.instanceColor) { const c = mesh.instanceColor; c.updateRange.offset = 0; c.updateRange.count = Math.max(1, n) * 3; c.needsUpdate = true; }
}

// Geometrien und eigene Materialien eines entfernten Objekts freigeben (geteilte Materialien bleiben)
function disposeObj(o) {
  o.traverse(c => {
    if (c.geometry && !c.geometry.userData.shared) c.geometry.dispose();
    if (c.material && !c.material.userData.shared && c.material !== WINDOW_MAT) c.material.dispose();
  });
}

class Scene3D {
  constructor(engine, game) {
    this.e = engine;
    this.g = game;
    this.w = game.world;
    this.root = new THREE.Group();
    engine.scene.add(this.root);
    this.terrain = new Terrain3D(engine);
    this.roads = new Roads3D(engine);
    this.fleet = new Fleet3D(engine, game.maxVehicles + 900);
    this.bmeshes = new Map();
    this.pendingMeshes = new Map();
    this.roadVersion = -1;
    this.boundsKey = '';
    this.items = [];
    this.time = 0;
    this.preview = null;
    this.hover = -1;
    this.selected = null;
    this.night = 0;
    this.snowOn = false;
    this.initInstanced();
    this.initMovers();
    this.rebuildAll();
    const b = this.w.bounds;
    const cx = (b.x0 + b.x1) / 2, cz = (b.y0 + b.y1) / 2;
    engine.rig.focus(cx, cz, 13 + (b.x1 - b.x0) * 0.95);
    engine.rig.cur.x = cx; engine.rig.cur.z = cz; engine.rig.cur.dist = engine.rig.goal.dist + 12;
    engine.rig.setBounds(-2, -2, this.w.w + 2, this.w.h + 2);
  }

  dispose() {
    const S = this.e.scene;
    const freeGeo = o => o.traverse(c => { if (c.geometry) c.geometry.dispose(); });
    S.remove(this.root); freeGeo(this.root);
    this.terrain.dispose(); S.remove(this.terrain.group);
    S.remove(this.roads.group); freeGeo(this.roads.group);
    for (const k in this.fleet.kinds) { S.remove(this.fleet.kinds[k]); this.fleet.kinds[k].geometry.dispose(); }
    for (const m of [this.fleet.head, this.fleet.brake, this.fleet.siren]) { S.remove(m); m.geometry.dispose(); m.material.dispose(); }
    this.fleet.glowTex.dispose();
  }

  // ---- Instanzierte Helfer -----------------------------------------------------------
  instanced(geo, mat, max, shadow) {
    const m = new THREE.InstancedMesh(geo, mat, max);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
    m.count = 0;
    m.frustumCulled = false;
    if (shadow) m.castShadow = true;
    this.root.add(m);
    return m;
  }

  initInstanced() {
    const flat = new THREE.PlaneGeometry(1, 1); flat.rotateX(-Math.PI / 2);
    this.prevMesh = this.instanced(flat, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false }), 120);
    this.prevMesh.renderOrder = 5;
    this.congMesh = this.instanced(flat, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }), 1200);
    this.congMesh.renderOrder = 3;
    const lamp = new THREE.BoxGeometry(0.075, 0.12, 0.075);
    this.lampMesh = this.instanced(lamp, new THREE.MeshBasicMaterial({ color: 0xffffff }), 600);
    this.coneMesh = this.instanced(coneGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), 300, true);
    const pbox = new THREE.BoxGeometry(1, 1, 1);
    this.partMesh = this.instanced(pbox, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), 900, false);
    const dot = new THREE.CircleGeometry(0.07, 10); dot.rotateX(-Math.PI / 2);
    this.routeMesh = this.instanced(dot, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false }), 400);
    this.routeMesh.renderOrder = 6;
    this.winMesh = this.instanced(new THREE.BoxGeometry(0.07, 0.06, 0.01), WINDOW_MAT, 1600);
    this.winN = 0;
    // Hover-Rahmen
    const rg = new THREE.RingGeometry(0.5, 0.56, 4, 1); rg.rotateX(-Math.PI / 2); rg.rotateY(Math.PI / 4);
    this.hoverMesh = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
    this.hoverMesh.scale.set(1.41, 1, 1.41);
    this.hoverMesh.visible = false;
    this.root.add(this.hoverMesh);
    // Partikel
    this.parts = [];
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v3 = new THREE.Vector3(); this.s3 = new THREE.Vector3(); this.c = new THREE.Color(); this.eu = new THREE.Euler();
    // Polizei
    this.police = new Map();
    // Schnee
    this.snowMesh = null;
  }

  initMovers() {
    const w = this.w;
    this.trains = [];
    for (const T of this.g.events.trains) {
      const m = makeTrain();
      m.visible = false;
      this.root.add(m);
      this.trains.push({ T, m });
    }
    this.ships = [];
    for (const S of this.g.events.ships) {
      const m = makeShip();
      m.visible = false;
      this.root.add(m);
      // Kanalmitte
      let row = -1;
      for (let y = 0; y < w.h; y++) if (w.canal[w.idx(5, y)]) { row = y; break; }
      this.ships.push({ S, m, z: row + 1 });
    }
    this.barriers = new Map();   // Bahnübergänge
    this.leaves = new Map();     // Klappbrücken
  }

  // ---- Aufbau ------------------------------------------------------------------------
  rebuildAll() {
    const w = this.w;
    this.terrain.build(w, w.bounds);
    this.boundsKey = w.bounds.x0 + ',' + w.bounds.y0 + ',' + w.bounds.x1 + ',' + w.bounds.y1;
    this.roads.build(w);
    this.roadVersion = w.version;
    for (const b of w.buildings) if (!this.bmeshes.has(b.id)) this.addBuilding(b, true);
    this.syncStatic();
  }

  addBuilding(b, instant) {
    if (this.bmeshes.has(b.id)) return;
    const grp = b.kind === 'house' ? makeHouse(b.pi, b.dir, b.seed) : makeDestination(b.pi, b.dir, b.seed);
    grp.position.set(b.x, instant ? 0 : 5, b.y);
    this.root.add(grp);
    if (b.kind === 'dest') b._roof = grp.userData.roofY;
    const rec = { b, grp, vy: 0, land: instant ? 1 : -1, t: 0 };
    this.bmeshes.set(b.id, rec);
    if (instant) this.settle(rec);
    const pm = this.pendingMeshes.get(b.x * 1000 + b.y);
    if (pm) { this.root.remove(pm.grp); disposeObj(pm.grp); this.pendingMeshes.delete(b.x * 1000 + b.y); }
  }

  // gelandetes Gebäude: Fenster als Instanzen eintragen, Matrix einfrieren
  settle(rec) {
    const grp = rec.grp, wins = grp.userData.windows;
    if (wins && !rec.winDone) {
      rec.winDone = true;
      for (const [x, y, z, ry] of wins) {
        if (this.winN >= 1600) break;
        this.v3.set(rec.b.x + x, y, rec.b.y + z); this.eu.set(0, ry, 0); this.q.setFromEuler(this.eu); this.s3.set(1, 1, 1);
        this.m4.compose(this.v3, this.q, this.s3);
        this.winMesh.setMatrixAt(this.winN++, this.m4);
      }
      this.winMesh.count = this.winN;
      this.winMesh.instanceMatrix.needsUpdate = true;
    }
    grp.updateMatrix();
    grp.matrixAutoUpdate = false;
  }

  addPending(spec) {
    const s = spec.kind === 'dest' ? 2 : 1;
    const grp = new THREE.Group();
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.92, s * 0.92), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    sh.position.set(s / 2, 0.03, s / 2);
    grp.add(sh);
    const ring = new THREE.Mesh(new THREE.RingGeometry(s * 0.46, s * 0.5, 4, 1), new THREE.MeshBasicMaterial({ color: col(PALETTE[spec.pi].hex), transparent: true, opacity: 0.8, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.rotation.z = Math.PI / 4;
    ring.scale.set(1.41, 1.41, 1);
    ring.position.set(s / 2, 0.035, s / 2);
    grp.add(ring);
    grp.position.set(spec.x, 0, spec.y);
    this.root.add(grp);
    this.pendingMeshes.set(spec.x * 1000 + spec.y, { grp, spec, sh, ring });
  }

  // Bahnschranken und Klappbrücken an die aktuellen Straßen anpassen
  syncStatic() {
    const w = this.w;
    const wantB = new Set(), wantL = new Set();
    for (let i = 0; i < w.n; i++) {
      if (!w.road[i]) continue;
      if (w.flags[i] & F_CROSSING) wantB.add(i);
      if (w.flags[i] & F_DRAW) wantL.add(i);
    }
    for (const [i, o] of this.barriers) if (!wantB.has(i)) { this.root.remove(o.grp); disposeObj(o.grp); this.barriers.delete(i); }
    for (const i of wantB) if (!this.barriers.has(i)) this.barriers.set(i, this.makeBarrier(i));
    // Klappbrücken nur neu bauen, wenn sich ihre Kachel geändert hat
    for (const [i, o] of this.leaves) if (!wantL.has(i) || o.link !== w.link[i]) { this.root.remove(o.grp); disposeObj(o.grp); this.leaves.delete(i); }
    for (const i of wantL) if (!this.leaves.has(i)) { const o = this.makeLeaf(i); o.link = w.link[i]; this.leaves.set(i, o); }
  }

  makeBarrier(i) {
    const w = this.w, x = w.tx(i), y = w.ty(i);
    const vertRail = w.rail[i] === 1;
    const grp = new THREE.Group();
    const arms = [];
    // zwei Schranken an gegenüberliegenden Ecken, quer zur Fahrbahn
    const pts = vertRail ? [[x + 0.15, y + 0.04, 1], [x + 0.85, y + 0.96, -1]] : [[x + 0.04, y + 0.15, 1], [x + 0.96, y + 0.85, -1]];
    for (const [px, pz, sg] of pts) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.04), new THREE.MeshStandardMaterial({ color: col('#e5e7eb') }));
      post.position.set(px, 0.08, pz);
      grp.add(post);
      const pivot = new THREE.Group();
      pivot.position.set(px, 0.15, pz);
      const B = new GeoBuilder();
      for (let k = 0; k < 6; k++) B.box(k * 0.075, -0.012, -0.012, (k + 1) * 0.075, 0.012, 0.012, col(k % 2 ? '#ffffff' : '#e5484d'));
      const arm = new THREE.Mesh(B.geometry(), matVC());
      arm.castShadow = true;
      pivot.add(arm);
      // Arm zeigt quer über die Fahrbahn
      pivot.rotation.y = vertRail ? (sg > 0 ? -Math.PI / 2 : Math.PI / 2) : (sg > 0 ? 0 : Math.PI);
      grp.add(pivot);
      arms.push(arm);
    }
    this.root.add(grp);
    return { grp, arms, a: 1.3 };
  }

  makeLeaf(i) {
    const w = this.w, x = w.tx(i), y = w.ty(i);
    const lk = w.link[i];
    const vert = (lk & 0b0101) !== 0;   // Straße Nord-Süd über den Kanal
    // Scharnier an der Uferseite
    let hingeS;
    if (vert) hingeS = w.canal[w.idx(x, y - 1)] ? 2 : 0; else hingeS = w.canal[w.idx(x - 1, y)] ? 1 : 3;
    const pivot = new THREE.Group();
    const hx = x + 0.5 + DX[hingeS] * 0.5, hz = y + 0.5 + DY[hingeS] * 0.5;
    pivot.position.set(hx, 0, hz);
    const m = this.roads.tileMesh(w, i);
    m.position.set(x + 0.5 - hx, 0, y + 0.5 - hz);
    pivot.add(m);
    this.root.add(pivot);
    return { grp: pivot, hingeS, a: 0 };
  }

  // ---- Effekte ------------------------------------------------------------------------
  burst(x, y, z, n, color, opt = {}) {
    for (let k = 0; k < n; k++) {
      if (this.parts.length >= 900) break;
      const a = Math.random() * Math.PI * 2, sp = (opt.speed || 1) * (0.4 + Math.random() * 0.8);
      this.parts.push({
        x, y, z, vx: Math.cos(a) * sp, vy: (opt.up || 1.2) * (0.6 + Math.random() * 0.8), vz: Math.sin(a) * sp,
        life: 0, max: (opt.life || 0.8) * (0.7 + Math.random() * 0.6), size: (opt.size || 0.06) * (0.6 + Math.random() * 0.8),
        col: Array.isArray(color) ? color[(Math.random() * color.length) | 0] : color, grav: opt.grav === undefined ? 4 : opt.grav, spin: Math.random() * 6,
      });
    }
  }

  onFx(f) {
    const w = this.w;
    switch (f.t) {
      case 'drop': this.addBuilding(f.b, f.instant); break;
      case 'announce': this.addPending(f.spec); break;
      case 'built':
        this.roads.hidden.clear();
        this.roads.pop(w, f.placed.filter(i => w.road[i] && !(i < w.n && (w.flags[i] & F_DRAW))));
        this.roadVersion = w.version;
        for (const [k, i] of f.placed.entries()) if (k % 2 === 0) this.burst(w.tx(i) + 0.5, i >= w.n ? ELEV_H : 0.05, w.ty(i) + 0.5, 3, '#d8cdb8', { speed: 0.6, up: 0.6, life: 0.5, size: 0.05 });
        this.syncStatic();
        break;
      case 'erased':
        for (const i of f.tiles) this.burst(w.tx(i) + 0.5, 0.05, w.ty(i) + 0.5, 5, '#b9ad98', { speed: 0.8, up: 0.8, life: 0.6, size: 0.06 });
        this.roads.build(w); this.roadVersion = w.version; this.syncStatic();
        break;
      case 'rebuild': this.roads.build(w); this.roadVersion = w.version; this.syncStatic(); break;
      case 'deliver': {
        const d = f.b;
        this.burst(d.cx, 0.6, d.cy, 4 + Math.min(10, f.combo), [PALETTE[d.pi].hex, '#ffffff'], { speed: 0.5, up: 1.8, life: 0.7, size: 0.05, grav: 2 });
        break;
      }
      case 'confetti': {
        const d = f.b;
        this.burst(d.cx, 1, d.cy, 60, ['#e5484d', '#f5b700', '#2f6fdb', '#1f9d55', '#8b5cf6', '#ffffff'], { speed: 1.6, up: 3, life: 1.6, size: 0.06, grav: 3 });
        break;
      }
      case 'poof': this.burst(f.x, (f.z || 0) + 0.1, f.y, 8, '#cfcfcf', { speed: 0.6, up: 0.7, life: 0.6, size: 0.08 }); break;
      case 'device': {
        const i = f.i;
        this.burst(w.tx(i) + 0.5, 0.1, w.ty(i) + 0.5, 10, f.kind === 'light' ? ['#22c55e', '#facc15', '#ef4444'] : f.kind === 'round' ? ['#7fbf5f', '#ffffff'] : '#cfcfcf', { speed: 0.9, up: 1.2, life: 0.7, size: 0.05 });
        this.roads.build(w); this.roadVersion = w.version;
        break;
      }
      case 'priority':
        for (const i of f.tiles) this.burst(w.tx(i) + 0.5, 0.1, w.ty(i) + 0.5, 8, ['#f2c200', '#ffffff'], { speed: 0.8, up: 1, life: 0.6, size: 0.05 });
        this.roads.build(w); this.roadVersion = w.version;
        break;
      case 'newweek': this.rebuildAll(); break;
      case 'snow': this.setSnow(f.on); break;
      case 'gameover': this.e.rig.focus(f.report.dest.cx, f.report.dest.cy, 16); this.e.rig.shake = 1; break;
      default: break;
    }
  }

  setSnow(on) {
    this.snowOn = on;
    if (on && !this.snowMesh) {
      const G = new GeoBuilder(), w = this.w, c = col('#ffffff');
      for (let i = 0; i < w.n; i++) {
        const t = w.terrain[i];
        if (t === T_WATER || t === T_ROCK || w.road[i]) continue;
        G.rect(w.tx(i), w.ty(i), w.tx(i) + 1, w.ty(i) + 1, 0.008, c);
      }
      this.snowMesh = new THREE.Mesh(G.geometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, roughness: 1 }));
      this.snowMesh.receiveShadow = true;
      this.root.add(this.snowMesh);
    }
    if (this.snowMesh) this.snowMesh.visible = on;
  }

  // ---- Bild für Bild --------------------------------------------------------------------
  update(dt, alpha) {
    const g = this.g, w = this.w;
    this.time += dt;
    this.night = this.e.setTimeOfDay(g.hour);
    WINDOW_MAT.emissiveIntensity = Math.min(1, this.night * 1.3);
    const bk = w.bounds.x0 + ',' + w.bounds.y0 + ',' + w.bounds.x1 + ',' + w.bounds.y1;
    if (bk !== this.boundsKey) this.rebuildAll();
    if (w.version !== this.roadVersion && !this.roads.pops.length) { this.roads.build(w); this.roadVersion = w.version; this.syncStatic(); }
    this.roads.update(dt, w);
    this.terrain.update(dt);
    this.updateBuildings(dt);
    this.updateVehicles(alpha);
    this.updateLamps();
    this.updatePolice(dt);
    this.updateCones();
    this.updateMovers(dt);
    this.updatePreview();
    this.updateParticles(dt);
    this.updateCongestion(dt);
    this.updateRoute();
    if (this.snowOn && Math.random() < dt * 40) {
      const r = this.e.rig.target;
      this.parts.push({ x: r.x + (Math.random() - 0.5) * 30, y: 6, z: r.z + (Math.random() - 0.5) * 30, vx: 0.2, vy: -1.2, vz: 0.1, life: 0, max: 5, size: 0.05, col: '#ffffff', grav: 0, spin: 0 });
    }
  }

  updateBuildings(dt) {
    for (const rec of this.bmeshes.values()) {
      const grp = rec.grp;
      if (rec.land < 0) {
        rec.vy -= 22 * dt;
        grp.position.y += rec.vy * dt;
        if (grp.position.y <= 0) {
          grp.position.y = 0; rec.land = 0; rec.t = 0;
          const b = rec.b;
          this.burst(b.cx, 0.05, b.cy, b.kind === 'dest' ? 26 : 12, '#cbbd9f', { speed: 1.4, up: 0.6, life: 0.7, size: 0.07 });
          if (this.onLand) this.onLand(b);
        }
      } else if (rec.land === 0) {
        rec.t += dt;
        const u = Math.min(1, rec.t / 0.35);
        const sq = Math.sin(u * Math.PI) * (1 - u) * 0.35;
        grp.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);
        // Skalierung um die Mitte des Grundstücks
        const s = rec.b.w;
        grp.position.x = rec.b.x - (grp.scale.x - 1) * s / 2;
        grp.position.z = rec.b.y - (grp.scale.z - 1) * s / 2;
        if (u >= 1) { rec.land = 1; grp.scale.set(1, 1, 1); grp.position.set(rec.b.x, 0, rec.b.y); this.settle(rec); }
      }
    }
    for (const pm of this.pendingMeshes.values()) {
      const p = this.g.city.pending.find(q => q.x === pm.spec.x && q.y === pm.spec.y);
      if (!p) { this.root.remove(pm.grp); disposeObj(pm.grp); this.pendingMeshes.delete(pm.spec.x * 1000 + pm.spec.y); continue; }
      const u = 1 - Math.max(0, p.t) / CFG.announce;
      pm.sh.material.opacity = 0.12 + u * 0.35;
      pm.ring.material.opacity = 0.45 + 0.4 * Math.abs(Math.sin(this.time * 4));
    }
  }

  // Fahrzeuge (interpoliert) + parkende Autos
  updateVehicles(alpha) {
    const g = this.g, w = this.w;
    const items = this.items;
    let n = 0;
    const get = () => { let it = items[n]; if (!it) it = items[n] = {}; n++; return it; };
    for (const v of g.traffic.vehicles) {
      const it = get();
      let da = v.a - v.oa;
      if (da > Math.PI) da -= Math.PI * 2; else if (da < -Math.PI) da += Math.PI * 2;
      it.x = v.ox + (v.x - v.ox) * alpha;
      it.y = v.oy + (v.y - v.oy) * alpha;
      it.a = v.oa + da * alpha;
      it.y3d = v.oz + (v.y3d - v.oz) * alpha;
      it.pitch3d = v.pitch3d; it.slope = v.slope;
      it.kind3d = v.kind3d; it.color = v.color; it.braking = v.braking; it.v = v.v; it.len = v.len;
      it.hidden = false; it.siren = v.emergency; it.scale3d = 1;
    }
    // parkende Autos: zu Hause und auf den Parkplätzen der Ziele
    for (const h of g.city.houses) {
      const k = Math.min(3, h.home);
      for (let q = 0; q < k; q++) {
        const it = get();
        const r = (h.dir + 1) & 3;
        const lat = (q - (k - 1) / 2) * 0.2;
        it.x = h.x + 0.5 + DX[h.dir] * 0.3 + DX[r] * lat;
        it.y = h.y + 0.5 + DY[h.dir] * 0.3 + DY[r] * lat;
        it.a = Math.atan2(DY[h.dir], DX[h.dir]) + Math.PI / 2;
        it.y3d = 0; it.pitch3d = 0; it.slope = 0; it.kind3d = 'car'; it.color = PALETTE[h.pi].hex; it.braking = false; it.v = 0; it.len = 0.3; it.hidden = false; it.siren = false; it.scale3d = 0.8;
      }
    }
    for (const d of g.city.dests) {
      const k = Math.min(5, d.outQ.length);
      const r = (d.dir + 1) & 3;
      for (let q = 0; q < k; q++) {
        const it = get();
        const o = d.outQ[q];
        const lat = (q - 2) * 0.34;
        it.x = d.cx + DX[d.dir] * 0.32 + DX[r] * lat;
        it.y = d.cy + DY[d.dir] * 0.32 + DY[r] * lat;
        it.a = Math.atan2(DY[d.dir], DX[d.dir]);
        it.y3d = 0; it.pitch3d = 0; it.slope = 0; it.kind3d = 'car'; it.color = PALETTE[o.house.pi].hex; it.braking = false; it.v = 0; it.len = 0.3; it.hidden = false; it.siren = false; it.scale3d = 0.85;
      }
    }
    items.length = Math.max(items.length, n);
    this.fleet.update(items, this.night, n, this.time);
  }

  updateLamps() {
    const w = this.w, mesh = this.lampMesh;
    let n = 0;
    const blink = Math.floor(this.time * 2) % 2 === 0;
    const RED = this.colOf('#ff2a2a'), YEL = this.colOf('#ffc21a'), GRN = this.colOf('#22e06a'), OFF = this.colOf('#3a3a3a');
    for (const J of w.junctions) {
      if (J.type !== 'light' || !J.light) continue;
      const x = w.tx(J.i), y = w.ty(J.i), cx = x + 0.5, cz = y + 0.5;
      for (let h = 0; h < 4; h++) {
        if (!((J.inMask >> h) & 1) || n >= 600) continue;
        const side = OPP[h], r = (h + 1) & 3;
        const sx = cx + DX[side] * 0.56 + DX[r] * 0.46, sz = cz + DY[side] * 0.56 + DY[r] * 0.46;
        let c;
        if (J.police > 0) c = blink ? YEL : OFF;
        else { const sg = J.sigFor(h); c = sg === 2 ? GRN : sg === 1 ? YEL : RED; }
        // Lampe an der dem Verkehr zugewandten Seite des Gehäuses
        this.v3.set(sx - DX[h] * 0.052, 0.49, sz - DY[h] * 0.052); this.q.identity(); this.s3.set(0.75, 1, 0.75);
        this.m4.compose(this.v3, this.q, this.s3);
        mesh.setMatrixAt(n, this.m4); mesh.setColorAt(n, c); n++;
      }
    }
    flushInst(mesh, n, true);
  }

  updatePolice(dt) {
    const w = this.w;
    const live = new Set();
    for (const J of w.junctions) {
      if (J.police <= 0) continue;
      live.add(J.i);
      let p = this.police.get(J.i);
      if (!p) {
        const grp = new THREE.Group();
        const fig = makePolice();
        grp.add(fig);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.48, 32), new THREE.MeshBasicMaterial({ color: col('#3b82f6'), transparent: true, opacity: 0.6, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
        grp.add(ring);
        grp.position.set(w.tx(J.i) + 0.5, 0, w.ty(J.i) + 0.5);
        this.root.add(grp);
        p = { grp, fig, ring, t: 0 };
        this.police.set(J.i, p);
        this.burst(w.tx(J.i) + 0.5, 0.1, w.ty(J.i) + 0.5, 12, ['#3b82f6', '#ffffff'], { speed: 1, up: 1.4, life: 0.6, size: 0.05 });
      }
      p.t += dt;
      p.fig.rotation.y = Math.floor(p.t / 1.2) % 2 ? 0 : Math.PI / 2;
      p.ring.material.opacity = 0.35 + 0.3 * Math.abs(Math.sin(p.t * 5));
      const rem = J.police / CFG.policeTime;
      p.ring.scale.set(0.6 + rem * 0.4, 0.6 + rem * 0.4, 1);
    }
    for (const [i, p] of this.police) if (!live.has(i)) { this.root.remove(p.grp); disposeObj(p.grp); this.police.delete(i); }
  }

  updateCones() {
    const w = this.w, mesh = this.coneMesh;
    let n = 0;
    const put = (x, z, s) => { if (n >= 300) return; this.v3.set(x, 0.02, z); this.q.identity(); this.s3.set(s, s, s); this.m4.compose(this.v3, this.q, this.s3); mesh.setMatrixAt(n++, this.m4); };
    for (const s of this.g.events.works) {
      const x = w.tx(s.i), y = w.ty(s.i);
      if (s.warn > 0) { put(x + 0.12, y + 0.12, 1); put(x + 0.88, y + 0.88, 1); }
      else for (let k = 0; k < 5; k++) { put(x + 0.18 + k * 0.16, y + 0.18 + k * 0.16, 1.2); put(x + 0.82 - k * 0.16, y + 0.18 + k * 0.16, 1.2); }
    }
    flushInst(mesh, n, false);
  }

  updateMovers(dt) {
    const w = this.w;
    for (const { T, m } of this.trains) {
      const L = T.line;
      const vis = T.pos > -20;
      m.visible = vis;
      if (!vis) continue;
      const len = L.vert ? w.h : w.w;
      const p = T.dir > 0 ? T.pos : len - T.pos;
      if (L.vert) { m.position.set(L.at + 0.5, 0.03, p); m.rotation.y = T.dir > 0 ? -Math.PI / 2 : Math.PI / 2; }
      else { m.position.set(p, 0.03, L.at + 0.5); m.rotation.y = T.dir > 0 ? 0 : Math.PI; }
    }
    for (const { S, m, z } of this.ships) {
      m.visible = S.pos > -20;
      m.position.set(S.pos, WATER_Y + 0.02, z);
    }
    for (const [i, o] of this.barriers) {
      const target = this.w.gate[i] ? 0 : 1.35;
      o.a += (target - o.a) * Math.min(1, dt * 4);
      for (const arm of o.arms) arm.rotation.z = o.a;
    }
    for (const [i, o] of this.leaves) {
      const target = this.w.gate[i] ? 1.05 : 0;
      o.a += (target - o.a) * Math.min(1, dt * 2.5);
      const sgn = (o.hingeS === 0 || o.hingeS === 3) ? -1 : 1;
      if (o.hingeS === 0 || o.hingeS === 2) o.grp.rotation.x = o.a * -sgn;
      else o.grp.rotation.z = o.a * sgn;
    }
  }

  updatePreview() {
    const w = this.w, mesh = this.prevMesh, P = this.preview;
    let n = 0;
    if (P && P.items) {
      for (const it of P.items) {
        if (n >= 120) break;
        const i = it.i;
        const h = i >= w.n ? ELEV_H : 0;
        const pulse = 0.92 + 0.08 * Math.sin(this.time * 8 + n * 0.5);
        this.v3.set(w.tx(i) + 0.5, h + 0.06, w.ty(i) + 0.5); this.q.identity(); this.s3.set(0.86 * pulse, 1, 0.86 * pulse);
        this.m4.compose(this.v3, this.q, this.s3);
        mesh.setMatrixAt(n, this.m4);
        mesh.setColorAt(n, this.colOf(PREVIEW_COL[it.kind] || '#ffffff'));
        n++;
      }
    }
    flushInst(mesh, n, true);
    if (this.hover >= 0 && !(P && P.items && P.items.length > 1)) {
      this.hoverMesh.visible = true;
      this.hoverMesh.position.set(w.tx(this.hover) + 0.5, 0.05, w.ty(this.hover) + 0.5);
      this.hoverMesh.material.color.copy(this.colOf(this.hoverColor || '#ffffff'));
    } else this.hoverMesh.visible = false;
  }

  updateParticles(dt) {
    const mesh = this.partMesh;
    let n = 0;
    const P = this.parts;
    for (let k = P.length - 1; k >= 0; k--) {
      const p = P[k];
      p.life += dt;
      if (p.life >= p.max) { P[k] = P[P.length - 1]; P.pop(); continue; }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.01 && p.grav > 0) { p.y = 0.01; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
    }
    for (const p of P) {
      if (n >= 900) break;
      const f = 1 - p.life / p.max;
      const s = p.size * (0.4 + 0.6 * f);
      this.v3.set(p.x, p.y, p.z);
      this.eu.set(p.spin * p.life, p.spin * p.life * 0.7, 0);
      this.q.setFromEuler(this.eu);
      this.s3.set(s, s, s);
      this.m4.compose(this.v3, this.q, this.s3);
      mesh.setMatrixAt(n, this.m4);
      mesh.setColorAt(n, this.colOf(p.col));
      n++;
    }
    flushInst(mesh, n, true);
  }

  colOf(hex) {
    const cc = this._cc || (this._cc = new Map());
    let c = cc.get(hex);
    if (!c) { c = col(hex); cc.set(hex, c); }
    return c;
  }

  updateCongestion(dt) {
    this.congT = (this.congT || 0) - dt;
    if (this.congT > 0) return;
    this.congT = 0.4;
    const w = this.w, mesh = this.congMesh;
    let n = 0;
    for (let i = 0; i < w.N && n < 1200; i++) {
      if (!w.road[i]) continue;
      const c = w.cong[i];
      if (c < 1.9) continue;
      const f = clamp((c - 1.9) / 2.5, 0, 1);
      const h = i >= w.n ? (w.edgeH(i, 0) + w.edgeH(i, 2) + w.edgeH(i, 1) + w.edgeH(i, 3)) / 4 + 0.05 : 0.031;
      this.v3.set(w.tx(i) + 0.5, h, w.ty(i) + 0.5); this.q.identity(); this.s3.set(0.62, 1, 0.62);
      this.m4.compose(this.v3, this.q, this.s3);
      mesh.setMatrixAt(n, this.m4);
      this.c.copy(this.colOf('#ffb020')).lerp(this.colOf('#ff2020'), f);
      mesh.setColorAt(n, this.c);
      n++;
    }
    flushInst(mesh, n, true);
  }

  // Route des ausgewählten Fahrzeugs bzw. des angekündigten Krankenwagens
  updateRoute() {
    const w = this.w, mesh = this.routeMesh;
    let n = 0;
    const draw = (tile, h, route, ri, color, max) => {
      let t = tile;
      const c = this.colOf(color);
      for (let k = ri; k < route.length && n < max; k++) {
        const d = route[k];
        const j = w.nb(t, d);
        if (j < 0) break;
        const y = j >= w.n ? ELEV_H + 0.05 : 0.05;
        for (let s = 0; s < 3 && n < max; s++) {
          const f = (s + 0.5) / 3;
          this.v3.set(w.tx(t) + 0.5 + DX[d] * f, y, w.ty(t) + 0.5 + DY[d] * f);
          this.q.identity(); this.s3.set(1, 1, 1);
          this.m4.compose(this.v3, this.q, this.s3);
          mesh.setMatrixAt(n, this.m4); mesh.setColorAt(n, c); n++;
        }
        t = j;
      }
    };
    const v = this.selected;
    if (v && !v.dead) draw(v.t, v.h, v.route, v.ri, v.color === '#ffffff' ? '#ff4d4d' : v.color, 300);
    else this.selected = null;
    const A = this.g.events.amb;
    if (A && A.preT > 0 && Math.floor(this.time * 4) % 2 === 0) draw(A.base.acc2, A.base.dir, [A.route[0]].concat(A.route.slice(1)), 0, '#ff3030', 400);
    flushInst(mesh, n, true);
  }

  // Bildschirmposition → Kachel (Boden)
  pickTile(sx, sy) {
    const p = this.e.pickGround(sx, sy);
    if (!p) return -1;
    const x = Math.floor(p.x), y = Math.floor(p.z);
    if (!this.w.inb(x, y)) return -1;
    return this.w.idx(x, y);
  }
  pickPoint(sx, sy) { return this.e.pickGround(sx, sy); }
}
