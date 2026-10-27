'use strict';
// ---------------------------------------------------------------------------
// Fahrzeugdarstellung über InstancedMesh (sehr viele Autos, ein Draw-Call je Typ)
// ---------------------------------------------------------------------------

class Fleet3D {
  constructor(engine, max = 700) {
    this.engine = engine;
    this.max = max;
    this.kinds = {};
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.1 });
    for (const k of ['car', 'amb']) {
      const n = k === 'car' ? max : 8;
      const mesh = new THREE.InstancedMesh(carGeometry(k), mat, n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      // Instanzfarben vor count = 0 anlegen (sonst Länge 0)
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.userData.max = n;
      engine.scene.add(mesh);
      this.kinds[k] = mesh;
    }
    const glowGeo = new THREE.PlaneGeometry(0.16, 0.16);
    glowGeo.rotateX(-Math.PI / 2);
    this.glowTex = Fleet3D.makeGlowTexture();
    const glow = (c, op) => new THREE.MeshBasicMaterial({ map: this.glowTex, color: col(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: op });
    this.headMat = glow('#fff1c2', 0);
    this.head = this.glowMesh(glowGeo, this.headMat, max);
    this.brakeMat = glow('#ff3030', 0.9);
    this.brake = this.glowMesh(glowGeo, this.brakeMat, max);
    this.sirenMat = glow('#4d8bff', 1);
    this.siren = this.glowMesh(glowGeo, this.sirenMat, 16);
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1);
    this.e = new THREE.Euler();
    this.colCache = new Map();
  }

  glowMesh(geo, mat, n) {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.count = 0; m.frustumCulled = false;
    this.engine.scene.add(m);
    return m;
  }

  static makeGlowTexture() {
    const s = 64, cv = document.createElement('canvas'); cv.width = cv.height = s;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(cv);
  }

  color(hex) {
    let c = this.colCache.get(hex);
    if (!c) { c = col(hex); this.colCache.set(hex, c); }
    return c;
  }

  // items: {x, y (Kachel), a, y3d, pitch3d, slope, kind3d, color, braking, v, len, scale3d, siren}
  update(items, night, count, time) {
    const n = { car: 0, amb: 0 };
    let nh = 0, nb = 0, ns = 0;
    const m = this.m, q = this.q, p = this.p, s = this.s, e = this.e;
    const blink = Math.floor(time * 6) % 2;
    for (let k = 0; k < count; k++) {
      const v = items[k];
      if (v.hidden) continue;
      const kind = v.kind3d === 'amb' ? 'amb' : 'car';
      const mesh = this.kinds[kind];
      if (n[kind] >= mesh.userData.max) continue;
      const idx = n[kind]++;
      const sc = v.scale3d === undefined ? 1 : v.scale3d;
      const y0 = v.y3d || 0;
      p.set(v.x, y0, v.y);
      e.set(0, -v.a, (v.pitch3d || 0) + (v.slope || 0), 'YXZ');
      q.setFromEuler(e);
      s.set(sc, sc, sc);
      m.compose(p, q, s);
      mesh.setMatrixAt(idx, m);
      mesh.setColorAt(idx, this.color(v.color));
      const ca = Math.cos(v.a), sa = Math.sin(v.a);
      const L = v.len * 0.5 * sc;
      if (night > 0.15 && nh < this.max && sc >= 1) {
        p.set(v.x + ca * (L + 0.18), y0 + 0.02, v.y + sa * (L + 0.18));
        s.set(1.6, 1, 1.6); q.identity();
        m.compose(p, q, s);
        this.head.setMatrixAt(nh++, m);
      }
      if (v.braking && nb < this.max && sc >= 1) {
        p.set(v.x - ca * (L + 0.02), y0 + 0.1, v.y - sa * (L + 0.02));
        s.set(0.7, 1, 0.7); q.identity();
        m.compose(p, q, s);
        this.brake.setMatrixAt(nb++, m);
      }
      if (v.siren && ns < 16) {
        p.set(v.x + ca * 0.05 + (blink ? -sa : sa) * 0.04, y0 + 0.27, v.y + sa * 0.05 + (blink ? ca : -ca) * 0.04);
        s.set(2.2, 1, 2.2); q.identity();
        m.compose(p, q, s);
        this.siren.setMatrixAt(ns++, m);
      }
    }
    for (const k in this.kinds) {
      const mesh = this.kinds[k];
      mesh.count = n[k];
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }
    this.head.count = nh; this.head.instanceMatrix.needsUpdate = true;
    this.headMat.opacity = Math.min(0.85, night * 1.2);
    this.brake.count = nb; this.brake.instanceMatrix.needsUpdate = true;
    this.siren.count = ns; this.siren.instanceMatrix.needsUpdate = true;
  }
}
