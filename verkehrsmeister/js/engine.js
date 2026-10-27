'use strict';
// ---------------------------------------------------------------------------
// 3D-Grundgerüst: Renderer, Szene, Licht (Tag/Nacht), Kamera, Picking
// ---------------------------------------------------------------------------

class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.outputEncoding = THREE.sRGBEncoding;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.skyTop = col('#a8d8ee');
    this.scene.background = this.skyTop.clone();
    this.scene.fog = new THREE.Fog(this.scene.background, 60, 140);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 400);
    this.rig = new CameraRig(this.camera, { dist: 34, pitch: 0.92, yaw: Math.PI / 4 });
    // Licht
    this.hemi = new THREE.HemisphereLight(col('#ffffff'), col('#7a9a62'), 0.62);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(col('#fff3df'), 0.95);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    const sc = this.sun.shadow.camera;
    sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 120;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.ambientNight = 0;
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.tmpV = new THREE.Vector3();
    this.tmpV2 = new THREE.Vector2();
    this.W = 1; this.H = 1;
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.W = w; this.H = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Tageszeit 0..24 → Sonnenstand, Farben, Helligkeit. Gibt Nacht-Anteil 0..1 zurück.
  setTimeOfDay(hour) {
    const h = ((hour % 24) + 24) % 24;
    // Tageslicht-Kurve
    let day;
    if (h < 4.5) day = 0; else if (h < 6.6) day = smoothstep(4.5, 6.6, h); else if (h < 19) day = 1; else if (h < 22) day = 1 - smoothstep(19, 22, h); else day = 0;
    day = Math.max(0.15, day);
    const golden = (h > 6 && h < 8.5) || (h > 17 && h < 20) ? 1 - Math.min(1, Math.abs(h - (h < 12 ? 7 : 18.5)) / 1.5) : 0;
    const ang = ((h - 6) / 12) * Math.PI; // 0 bei 6 Uhr, PI bei 18 Uhr
    const t = this.rig.target;
    const sx = Math.cos(ang) * 30, sy = Math.max(6, Math.sin(ang) * 34 + 8), sz = 14;
    this.sun.position.set(t.x + sx, sy, t.z + sz);
    this.sun.target.position.copy(t);
    const sunCol = new THREE.Color().lerpColors(col('#9fb4ff'), col('#fff3df'), day);
    if (golden > 0) sunCol.lerp(col('#ffb070'), golden * 0.6);
    this.sun.color.copy(sunCol);
    this.sun.intensity = 0.32 + 0.68 * day;
    this.hemi.intensity = 0.42 + 0.23 * day;
    this.hemi.color.copy(new THREE.Color().lerpColors(col('#5a6aa8'), col('#ffffff'), day));
    const sky = new THREE.Color().lerpColors(col('#26355f'), col('#a8d8ee'), day);
    if (golden > 0) sky.lerp(col('#f2b68a'), golden * 0.35);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);
    this.night = 1 - day;
    return this.night;
  }

  // Bildschirmposition → Punkt auf dem Boden (y=0) oder null
  pickGround(sx, sy) {
    this.tmpV2.set((sx / this.W) * 2 - 1, -(sy / this.H) * 2 + 1);
    this.raycaster.setFromCamera(this.tmpV2, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this.tmpV);
    return hit ? { x: hit.x, z: hit.z } : null;
  }

  // 3D-Punkt → Bildschirm (für HTML-Overlays)
  project(x, y, z) {
    const v = this.tmpV.set(x, y, z).project(this.camera);
    return { x: (v.x + 1) / 2 * this.W, y: (1 - v.y) / 2 * this.H, behind: v.z > 1 };
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
