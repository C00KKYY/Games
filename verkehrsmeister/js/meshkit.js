'use strict';
// Kleine Werkzeugkiste für prozedurale Low-Poly-Geometrie (ohne BufferGeometryUtils)

function col(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }

// Sammelt Dreiecke mit Farbe und baut daraus eine BufferGeometry
class GeoBuilder {
  constructor() { this.pos = []; this.nor = []; this.col = []; }
  tri(a, b, c, color, flat = true) {
    const P = this.pos, N = this.nor, C = this.col;
    P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    let nx = 0, ny = 1, nz = 0;
    if (flat) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    }
    for (let k = 0; k < 3; k++) { N.push(nx, ny, nz); C.push(color.r, color.g, color.b); }
  }
  quad(a, b, c, d, color) { this.tri(a, b, c, color); this.tri(a, c, d, color); }
  // Flaches Polygon in Höhe y (Punkte [x,z] gegen den Uhrzeigersinn von oben gesehen egal – Normale wird nach oben gezwungen)
  poly(pts, y, color) {
    const tris = THREE.ShapeUtils.triangulateShape(pts.map(p => new THREE.Vector2(p[0], p[1])), []);
    for (const t of tris) {
      const a = pts[t[0]], b = pts[t[1]], c = pts[t[2]];
      // Wicklung so wählen, dass die Normale nach oben zeigt
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (cross > 0) this.tri([a[0], y, a[1]], [c[0], y, c[1]], [b[0], y, b[1]], color, false);
      else this.tri([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], color, false);
    }
  }
  rect(x0, z0, x1, z1, y, color) { this.poly([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y, color); }
  // Kreisring-Sektor (für Kurven) in Höhe y
  arcBand(cx, cz, r0, r1, a0, a1, y, color, seg = 10) {
    for (let i = 0; i < seg; i++) {
      const t0 = a0 + (a1 - a0) * i / seg, t1 = a0 + (a1 - a0) * (i + 1) / seg;
      const p = (r, t) => [cx + Math.cos(t) * r, y, cz + Math.sin(t) * r];
      const A = p(r0, t0), B = p(r1, t0), Cc = p(r1, t1), D = p(r0, t1);
      // nach oben zeigende Normale erzwingen
      this.tri(A, B, Cc, color, false); this.tri(A, Cc, D, color, false);
      this.tri(A, Cc, B, color, false); this.tri(A, D, Cc, color, false);
    }
  }
  disc(cx, cz, r, y, color, seg = 20) {
    for (let i = 0; i < seg; i++) {
      const t0 = i / seg * Math.PI * 2, t1 = (i + 1) / seg * Math.PI * 2;
      this.tri([cx, y, cz], [cx + Math.cos(t1) * r, y, cz + Math.sin(t1) * r], [cx + Math.cos(t0) * r, y, cz + Math.sin(t0) * r], color, false);
    }
  }
  // Quader (Achsen-ausgerichtet)
  box(x0, y0, z0, x1, y1, z1, color, opts = {}) {
    const c = color, top = opts.top || c, side = opts.side || c;
    const v = (x, y, z) => [x, y, z];
    // oben
    this.quad(v(x0, y1, z0), v(x0, y1, z1), v(x1, y1, z1), v(x1, y1, z0), top);
    if (!opts.noSides) {
      this.quad(v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1), side); // +z
      this.quad(v(x1, y0, z0), v(x0, y0, z0), v(x0, y1, z0), v(x1, y1, z0), side); // -z
      this.quad(v(x1, y0, z1), v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1), side); // +x
      this.quad(v(x0, y0, z0), v(x0, y0, z1), v(x0, y1, z1), v(x0, y1, z0), side); // -x
    }
  }
  // Satteldach über Rechteck, First entlang x (along=true) oder z
  gable(x0, z0, x1, z1, y, h, color, along) {
    const sh = color.clone().multiplyScalar(0.78);
    if (along) {
      const zm = (z0 + z1) / 2;
      this.quad([x0, y, z0], [x0, y + h, zm], [x1, y + h, zm], [x1, y, z0], color);
      this.quad([x1, y, z1], [x1, y + h, zm], [x0, y + h, zm], [x0, y, z1], sh);
      this.tri([x0, y, z0], [x0, y, z1], [x0, y + h, zm], sh);
      this.tri([x1, y, z1], [x1, y, z0], [x1, y + h, zm], sh);
    } else {
      const xm = (x0 + x1) / 2;
      this.quad([x1, y, z0], [xm, y + h, z0], [xm, y + h, z1], [x1, y, z1], color);
      this.quad([x0, y, z1], [xm, y + h, z1], [xm, y + h, z0], [x0, y, z0], sh);
      this.tri([x1, y, z0], [x0, y, z0], [xm, y + h, z0], sh);
      this.tri([x0, y, z1], [x1, y, z1], [xm, y + h, z1], sh);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
  get empty() { return this.pos.length === 0; }
}
