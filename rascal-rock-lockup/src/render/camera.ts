/** Camera: pan with inertia, zoom to cursor, clamped bounds (Brief §6.3). Pure math + a Pixi container transform. */
import type { Container } from 'pixi.js';

export class Camera {
  x = 0; y = 0; zoom = 1;          // world point at screen centre, zoom
  vx = 0; vy = 0;                  // inertia (world units / s)
  targetZoom = 1; zoomAnchor: { sx: number; sy: number } | null = null;
  minZoom = 0.5; maxZoom = 1.5;
  bounds = { x0: 0, y0: 0, x1: 1000, y1: 1000 };
  viewW = 800; viewH = 450;
  /** screen-space insets (HUD) so "centre" is the centre of the free play area */
  inset = { top: 0, bottom: 0, left: 0, right: 0 };

  setView(w: number, h: number) { this.viewW = w; this.viewH = h; this.clamp(); }
  centreScreen() { return { x: this.inset.left + (this.viewW - this.inset.left - this.inset.right) / 2, y: this.inset.top + (this.viewH - this.inset.top - this.inset.bottom) / 2 }; }
  screenToWorld(sx: number, sy: number) { const c = this.centreScreen(); return { x: this.x + (sx - c.x) / this.zoom, y: this.y + (sy - c.y) / this.zoom }; }
  worldToScreen(wx: number, wy: number) { const c = this.centreScreen(); return { x: (wx - this.x) * this.zoom + c.x, y: (wy - this.y) * this.zoom + c.y }; }

  panBy(dxScreen: number, dyScreen: number) { this.x -= dxScreen / this.zoom; this.y -= dyScreen / this.zoom; this.clamp(); }
  zoomAt(factor: number, sx: number, sy: number) {
    this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.targetZoom * factor));
    this.zoomAnchor = { sx, sy };
  }
  /** fit a world rect into the free play area */
  fit(x0: number, y0: number, x1: number, y1: number, margin = 8) {
    const w = this.viewW - this.inset.left - this.inset.right - margin * 2, h = this.viewH - this.inset.top - this.inset.bottom - margin * 2;
    this.zoom = this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, Math.min(w / (x1 - x0), h / (y1 - y0))));
    this.x = (x0 + x1) / 2; this.y = (y0 + y1) / 2; this.clamp();
  }
  update(dt: number) {
    if (Math.abs(this.targetZoom - this.zoom) > 1e-4) {
      const c = this.centreScreen();
      const ax = this.zoomAnchor?.sx ?? c.x, ay = this.zoomAnchor?.sy ?? c.y;
      const before = this.screenToWorld(ax, ay);
      this.zoom += (this.targetZoom - this.zoom) * Math.min(1, dt * 14);
      const after = this.screenToWorld(ax, ay);
      this.x += before.x - after.x; this.y += before.y - after.y;
    }
    if (this.vx || this.vy) {
      this.x += this.vx * dt; this.y += this.vy * dt;
      const f = Math.exp(-dt * 6); this.vx *= f; this.vy *= f;
      if (Math.hypot(this.vx, this.vy) < 4) this.vx = this.vy = 0;
    }
    this.clamp();
  }
  clamp() {
    const hw = (this.viewW - this.inset.left - this.inset.right) / 2 / this.zoom, hh = (this.viewH - this.inset.top - this.inset.bottom) / 2 / this.zoom;
    const b = this.bounds;
    this.x = b.x1 - b.x0 < hw * 2 ? (b.x0 + b.x1) / 2 : Math.max(b.x0 + hw, Math.min(b.x1 - hw, this.x));
    this.y = b.y1 - b.y0 < hh * 2 ? (b.y0 + b.y1) / 2 : Math.max(b.y0 + hh, Math.min(b.y1 - hh, this.y));
  }
  apply(c: Container) {
    const s = this.centreScreen();
    c.scale.set(this.zoom);
    c.position.set(Math.round((s.x - this.x * this.zoom) * 2) / 2, Math.round((s.y - this.y * this.zoom) * 2) / 2);
  }
}
