'use strict';
// Kamera-Rig: Zielpunkt, Abstand, Drehung (yaw) und Neigung (pitch) mit weicher Dämpfung
class CameraRig {
  constructor(camera, opts = {}) {
    this.cam = camera;
    this.target = new THREE.Vector3(0, 0, 0);
    this.goal = { x: 0, z: 0, dist: opts.dist || 28, yaw: opts.yaw !== undefined ? opts.yaw : Math.PI / 4, pitch: opts.pitch || 0.95 };
    this.cur = Object.assign({}, this.goal);
    this.bounds = { x0: -20, x1: 20, z0: -20, z1: 20 };
    this.minDist = 8; this.maxDist = 70;
    this.shake = 0;
  }
  setBounds(x0, z0, x1, z1) { this.bounds = { x0, x1, z0, z1 }; this.clamp(); }
  clamp() {
    const g = this.goal, b = this.bounds;
    g.x = Math.max(b.x0, Math.min(b.x1, g.x));
    g.z = Math.max(b.z0, Math.min(b.z1, g.z));
    g.dist = Math.max(this.minDist, Math.min(this.maxDist, g.dist));
    g.pitch = Math.max(0.55, Math.min(1.35, g.pitch));
  }
  // Verschieben in Bildschirmrichtung (dx, dy in Pixeln)
  panPixels(dx, dy, viewH) {
    const scale = (this.cur.dist * 2 * Math.tan(this.cam.fov * Math.PI / 360)) / viewH;
    const cy = Math.cos(this.cur.yaw), sy = Math.sin(this.cur.yaw);
    // Bildschirm-rechts = (cos yaw, -sin yaw) ; Bildschirm-oben (in die Tiefe) = (-sin yaw, -cos yaw)
    const k = scale / Math.sin(this.cur.pitch) ** 0.35;
    this.goal.x -= (dx * cy + dy * sy) * k;
    this.goal.z -= (-dx * sy + dy * cy) * k;
    this.clamp();
  }
  zoom(f) { this.goal.dist *= f; this.clamp(); }
  rotate(dyaw, dpitch = 0) { this.goal.yaw += dyaw; this.goal.pitch += dpitch; this.clamp(); }
  focus(x, z, dist) { this.goal.x = x; this.goal.z = z; if (dist) this.goal.dist = dist; this.clamp(); }
  update(dt) {
    const k = 1 - Math.exp(-dt * 10);
    const c = this.cur, g = this.goal;
    c.x += (g.x - c.x) * k; c.z += (g.z - c.z) * k;
    c.dist += (g.dist - c.dist) * k;
    let dy = g.yaw - c.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    c.yaw += dy * k; c.pitch += (g.pitch - c.pitch) * k;
    this.target.set(c.x, 0, c.z);
    const h = Math.sin(c.pitch) * c.dist, r = Math.cos(c.pitch) * c.dist;
    let sx = 0, sz = 0;
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 2); sx = (Math.random() - 0.5) * this.shake * 0.4; sz = (Math.random() - 0.5) * this.shake * 0.4; }
    this.cam.position.set(c.x + Math.sin(c.yaw) * r + sx, h, c.z + Math.cos(c.yaw) * r + sz);
    this.cam.lookAt(c.x + sx, 0, c.z + sz);
  }
}
