'use strict';
// ---------------------------------------------------------------------------
// Darstellung: Gelände, Straßen, Gebäude (gecachte Chunks) + dynamische Ebenen
// ---------------------------------------------------------------------------

const PAL = {
  grass: ['#cde0a3', '#c8dc9d', '#d2e4aa', '#c4d898'],
  field: '#e7dca2', fieldLine: '#d9cc8a',
  sand: '#eee2bb',
  water: '#84c3df', waterDeep: '#77b7d6', waterLine: '#a9d8ec',
  forestFloor: '#bdd693',
  trees: ['#6a9f58', '#5c914d', '#78ad63', '#5f9a5a', '#86b56c'],
  rock: '#c3b9a7', rockDark: '#a89c88', rockLight: '#dcd4c4',
  curb: '#ebe7dc', asphalt: '#6b7078', asphaltHw: '#5a5f68', asphaltJ: '#686d75',
  mark: '#f6f6f0', yellow: '#f2c200', drive: '#a2a8ae',
  bridge: '#cfc6b4', rail: '#7d7465',
};

const CHUNK = 12;
const SCALE_LEVELS = [8, 12, 18, 26, 38, 54, 76, 104];

class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 20, y: 12, z: 36 };
    this.chunks = new Map();
    this.game = null;
    this.frame = 0;
    this.time = 0;
    this.overlay = 'none';
    this.preview = null;     // {tiles:[], ok:bool, tool}
    this.hover = -1;
    this.selected = null;    // {kind:'tile'|'building'|'vehicle'|'line', ...}
    this.showGrid = false;
    this.dpr = 1;
    this.rain = [];
    this.clouds = [];
    this.lineCache = new Map();
    this.resize();
  }

  setGame(g) {
    this.game = g;
    this.chunks.clear();
    this.lineCache.clear();
    const w = g.world;
    this.cam.x = w.w / 2; this.cam.y = w.h / 2;
    this.fitZoom();
  }

  fitZoom() {
    const w = this.game.world;
    const zx = this.W / w.w, zy = this.H / w.h;
    this.cam.z = clamp(Math.min(zx, zy) * 0.95, this.minZoom(), 110);
  }
  minZoom() { const w = this.game ? this.game.world : { w: 40, h: 25 }; return Math.max(6, Math.min(this.W / w.w, this.H / w.h) * (this.W < 760 ? 0.9 : 0.55)); }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    const r = this.cv.getBoundingClientRect();
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
    this.cv.width = Math.round(this.W * dpr);
    this.cv.height = Math.round(this.H * dpr);
  }

  // ---- Koordinaten -----------------------------------------------------------------
  toScreen(x, y) { return { x: (x - this.cam.x) * this.cam.z + this.W / 2, y: (y - this.cam.y) * this.cam.z + this.H / 2 }; }
  toWorld(sx, sy) { return { x: (sx - this.W / 2) / this.cam.z + this.cam.x, y: (sy - this.H / 2) / this.cam.z + this.cam.y }; }
  clampCam() {
    const w = this.game.world;
    this.cam.x = clamp(this.cam.x, 0, w.w);
    this.cam.y = clamp(this.cam.y, 0, w.h);
    this.cam.z = clamp(this.cam.z, this.minZoom(), 110);
  }
  zoomAt(sx, sy, factor) {
    const before = this.toWorld(sx, sy);
    this.cam.z = clamp(this.cam.z * factor, this.minZoom(), 110);
    const after = this.toWorld(sx, sy);
    this.cam.x += before.x - after.x; this.cam.y += before.y - after.y;
    this.clampCam();
  }
  centerOn(x, y, z) { this.cam.x = x; this.cam.y = y; if (z) this.cam.z = z; this.clampCam(); }

  // ---- Chunk-Cache -------------------------------------------------------------------
  processDirty() {
    const w = this.game.world;
    if (!w.dirty.size) return;
    for (const i of w.dirty) {
      const x = i % w.w, y = (i / w.w) | 0;
      const k = Math.floor(x / CHUNK) + ',' + Math.floor(y / CHUNK);
      const c = this.chunks.get(k);
      if (c) c.dirty = true;
    }
    w.dirty.clear();
    this.lineCache.clear();
  }

  chunkScale() {
    const need = this.cam.z * this.dpr;
    for (const s of SCALE_LEVELS) if (s >= need * 0.92) return s;
    return SCALE_LEVELS[SCALE_LEVELS.length - 1];
  }

  renderChunk(cx, cy, scale) {
    const size = CHUNK * scale;
    let c = this.chunks.get(cx + ',' + cy);
    let canvas = c && c.canvas && c.canvas.width === size ? c.canvas : null;
    if (!canvas) { canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size; }
    const g = canvas.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, size, size);
    g.setTransform(scale, 0, 0, scale, -cx * CHUNK * scale, -cy * CHUNK * scale);
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    drawStatic(g, this.game, x0, y0, Math.min(this.game.world.w, x0 + CHUNK), Math.min(this.game.world.h, y0 + CHUNK), scale);
    if (!c) { c = {}; this.chunks.set(cx + ',' + cy, c); }
    c.canvas = canvas; c.scale = scale; c.dirty = false; c.used = this.frame;
    return c;
  }

  trimCache() {
    if (this.chunks.size < 40) return;
    let px = 0;
    for (const c of this.chunks.values()) px += c.canvas.width * c.canvas.height;
    if (px < 22e6) return;
    const arr = [...this.chunks.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [k, c] of arr) {
      if (c.used >= this.frame - 2) break;
      this.chunks.delete(k);
      px -= c.canvas.width * c.canvas.height;
      if (px < 14e6) break;
    }
  }

  // ---- Hauptzeichnung --------------------------------------------------------------
  draw(dt) {
    const g = this.game;
    if (!g) return;
    this.frame++;
    this.time += dt;
    const ctx = this.ctx, dpr = this.dpr, cam = this.cam, w = g.world;
    this.processDirty();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#a9c48d';
    ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    // sichtbarer Bereich
    const tl = this.toWorld(0, 0), br = this.toWorld(this.W, this.H);
    const vx0 = Math.max(0, Math.floor(tl.x) - 1), vy0 = Math.max(0, Math.floor(tl.y) - 1);
    const vx1 = Math.min(w.w, Math.ceil(br.x) + 1), vy1 = Math.min(w.h, Math.ceil(br.y) + 1);
    this.view = { x0: vx0, y0: vy0, x1: vx1, y1: vy1 };
    // Kartenrand (außerhalb)
    ctx.setTransform(cam.z * dpr, 0, 0, cam.z * dpr, (this.W / 2 - cam.x * cam.z) * dpr, (this.H / 2 - cam.y * cam.z) * dpr);
    ctx.fillStyle = '#a9c48d';
    ctx.fillRect(-60, -60, w.w + 120, w.h + 120);
    // Chunks
    const scale = this.chunkScale();
    let budget = 4;
    const cx0 = Math.floor(vx0 / CHUNK), cy0 = Math.floor(vy0 / CHUNK), cx1 = Math.floor((vx1 - 1) / CHUNK), cy1 = Math.floor((vy1 - 1) / CHUNK);
    ctx.imageSmoothingEnabled = true;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      let c = this.chunks.get(cx + ',' + cy);
      if (!c || ((c.dirty || c.scale !== scale) && budget > 0) || (c.dirty && c.scale === scale)) {
        if (!c || c.dirty || budget > 0) { c = this.renderChunk(cx, cy, scale); budget--; }
      }
      c.used = this.frame;
      ctx.drawImage(c.canvas, cx * CHUNK, cy * CHUNK, CHUNK + 0.02, CHUNK + 0.02);
    }
    this.trimCache();
    // Kartenrand
    ctx.strokeStyle = 'rgba(40,60,30,0.35)'; ctx.lineWidth = 0.08;
    ctx.strokeRect(-0.04, -0.04, w.w + 0.08, w.h + 0.08);
    if (this.showGrid) this.drawGrid(ctx);
    // dynamische Ebenen in Kachelkoordinaten
    this.drawWater(ctx);
    if (this.overlay === 'traffic') this.drawHeatmap(ctx);
    this.drawRoadEvents(ctx);
    this.drawBusLines(ctx);
    this.drawPreview(ctx);
    this.drawUnconnected(ctx);
    this.drawSignals(ctx);
    this.drawVehicles(ctx);
    this.drawWrecks(ctx);
    this.drawBuildingDyn(ctx);
    this.drawSelection(ctx);
    this.drawFX(ctx);
    this.drawNight(ctx);
    this.drawWeather(ctx, dt);
    this.drawScreenLabels(ctx);
  }

  inView(x, y, m = 1) { const v = this.view; return x >= v.x0 - m && y >= v.y0 - m && x <= v.x1 + m && y <= v.y1 + m; }

  drawGrid(ctx) {
    const v = this.view;
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1 / this.cam.z;
    ctx.beginPath();
    for (let x = v.x0; x <= v.x1; x++) { ctx.moveTo(x, v.y0); ctx.lineTo(x, v.y1); }
    for (let y = v.y0; y <= v.y1; y++) { ctx.moveTo(v.x0, y); ctx.lineTo(v.x1, y); }
    ctx.stroke();
  }

  drawWater(ctx) {
    // sanftes Glitzern auf dem Wasser
    if (this.cam.z < 14) return;
    const w = this.game.world, v = this.view, t = this.time;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.025;
    ctx.beginPath();
    for (let y = v.y0; y < v.y1; y++) for (let x = v.x0; x < v.x1; x++) {
      const i = y * w.w + x;
      if (w.terrain[i] !== T_WATER || w.road[i]) continue;
      const r = w.variant[i];
      if (r % 3) continue;
      const ph = (t * 0.4 + r / 40) % 1;
      const ox = x + 0.2 + (r % 7) / 12, oy = y + 0.3 + ((r >> 3) % 5) / 9 + Math.sin(ph * Math.PI * 2) * 0.04;
      ctx.moveTo(ox, oy); ctx.quadraticCurveTo(ox + 0.1, oy - 0.05, ox + 0.2, oy);
    }
    ctx.stroke();
  }

  // ---- Verkehrsdichte ---------------------------------------------------------------
  drawHeatmap(ctx) {
    const w = this.game.world, v = this.view;
    for (let y = v.y0; y < v.y1; y++) for (let x = v.x0; x < v.x1; x++) {
      const i = y * w.w + x;
      if (!w.road[i]) continue;
      const c = w.cong[i];
      const f = clamp((c - 1) / 3, 0, 1);
      const col = f < 0.5 ? mixHex('#22c55e', '#facc15', f * 2) : mixHex('#facc15', '#dc2626', (f - 0.5) * 2);
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.65;
      roadShape(ctx, w, i, x, y, 0.5);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Kreuzungen: Wartezeit-Kreise
    for (const J of w.junctions || []) {
      const x = w.tx(J.i), y = w.ty(J.i);
      if (!this.inView(x, y)) continue;
      const m = Math.max(J.waitEma[0], J.waitEma[1], J.waitEma[2], J.waitEma[3]);
      if (m < 2) continue;
      const r = clamp(0.2 + m / 25, 0.2, 0.9);
      ctx.fillStyle = m > 10 ? 'rgba(220,38,38,0.35)' : 'rgba(234,179,8,0.35)';
      ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = m > 10 ? '#b91c1c' : '#a16207';
      ctx.lineWidth = 0.04; ctx.stroke();
    }
  }

  // ---- Baustellen, Unfälle, Sperrungen ---------------------------------------------
  drawRoadEvents(ctx) {
    const g = this.game, w = g.world, city = g.city;
    for (const i of city.workTiles || []) {
      const x = w.tx(i), y = w.ty(i);
      if (!this.inView(x, y)) continue;
      drawWorks(ctx, w, i, x, y, this.time);
    }
    for (const a of city.accidents) {
      const x = w.tx(a.tile), y = w.ty(a.tile);
      if (!this.inView(x, y, 2)) continue;
      // Absperrung
      ctx.save();
      ctx.translate(x + 0.5, y + 0.5);
      const blink = Math.floor(this.time * 3) % 2;
      for (let k = 0; k < 4; k++) {
        if (!((w.link[a.tile] >> k) & 1)) continue;
        ctx.save();
        ctx.rotate(k * Math.PI / 2);
        ctx.fillStyle = '#fff';
        ctx.fillRect(-0.28, -0.47, 0.56, 0.07);
        ctx.fillStyle = '#dc2626';
        for (let s = 0; s < 4; s++) ctx.fillRect(-0.28 + s * 0.14, -0.47, 0.07, 0.07);
        ctx.fillStyle = blink ? '#fbbf24' : '#92400e';
        ctx.beginPath(); ctx.arc(-0.3, -0.44, 0.035, 0, Math.PI * 2); ctx.arc(0.3, -0.44, 0.035, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
    // Stromausfall: blinkendes Gelb
    for (const o of city.outages) {
      for (const i of o.tiles) {
        const x = w.tx(i), y = w.ty(i);
        if (!this.inView(x, y)) continue;
        if (Math.floor(this.time * 2) % 2) {
          ctx.fillStyle = 'rgba(251,191,36,0.28)';
          ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, 0.55, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }

  drawWrecks(ctx) {
    const g = this.game;
    for (const a of g.city.accidents) {
      for (const wr of a.wrecks) {
        if (!this.inView(wr.x, wr.y)) continue;
        drawCar(ctx, wr.x, wr.y, wr.a, VT[wr.type] || VT.car, wr.color, { wreck: true });
      }
      const w = g.world, x = w.tx(a.tile) + 0.5, y = w.ty(a.tile) + 0.5;
      // Warndreieck
      ctx.save(); ctx.translate(x + 0.32, y - 0.32);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 0.035;
      ctx.beginPath(); ctx.moveTo(0, -0.11); ctx.lineTo(0.1, 0.07); ctx.lineTo(-0.1, 0.07); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      if (a.amb) drawCar(ctx, x - 0.3, y + 0.3, 0.3, VT.ambulance, '#ffffff', { siren: true, t: this.time });
      // Rauch
      if (Math.random() < 0.15) g.fx.add({ x: x + (Math.random() - 0.5) * 0.3, y, vx: (Math.random() - 0.5) * 0.1, vy: -0.25, life: 0, max: 1.2, r: 0.06, color: '#6b7280', kind: 'smoke' });
    }
  }

  // ---- Buslinien --------------------------------------------------------------------
  linePath(line) {
    const key = line.id + ':' + line.stops.join(',') + ':' + this.game.world.version;
    let c = this.lineCache.get(line.id);
    if (c && c.key === key) return c.pts;
    const w = this.game.world, pf = this.game.traffic.pf;
    const pts = [];
    for (let k = 0; k < line.stops.length; k++) {
      const a = line.stops[k], b = line.stops[(k + 1) % line.stops.length];
      let best = null;
      for (let h = 0; h < 4; h++) {
        if (!((w.link[a] >> OPP[h]) & 1)) continue;
        const r = pf.find(a, h, b, { freeFlow: true, limit: 8000 });
        if (r && (!best || r.length < best.length)) best = r;
      }
      if (!best) continue;
      let t = a;
      pts.push([w.tx(t) + 0.5, w.ty(t) + 0.5]);
      for (const d of best) { t = w.nb(t, d); pts.push([w.tx(t) + 0.5, w.ty(t) + 0.5]); }
    }
    this.lineCache.set(line.id, { key, pts });
    return pts;
  }

  drawBusLines(ctx) {
    const city = this.game.city;
    const sel = this.selected && this.selected.kind === 'line' ? this.selected.line : null;
    const showAll = this.overlay === 'bus' || (this.game.ui && this.game.ui.tool === 'busline');
    for (const line of city.lines) {
      if (!showAll && line !== sel) continue;
      const pts = this.linePath(line);
      if (pts.length < 2) continue;
      ctx.strokeStyle = line.color;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 0.12;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.setLineDash([0.25, 0.15]);
      ctx.lineDashOffset = -this.time * 0.8;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    // Wartende an Haltestellen
    const w = this.game.world;
    for (const s of city.stops.values()) {
      const x = w.tx(s.tile), y = w.ty(s.tile);
      if (!this.inView(x, y)) continue;
      const n = s.waiting.length;
      if (!n) continue;
      const dots = Math.min(8, Math.ceil(n / 3));
      for (let k = 0; k < dots; k++) {
        ctx.fillStyle = k % 2 ? '#334155' : '#475569';
        ctx.beginPath(); ctx.arc(x + 0.12 + k * 0.1, y + 0.1, 0.04, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // ---- Bauvorschau ------------------------------------------------------------------
  drawPreview(ctx) {
    const p = this.preview;
    const w = this.game.world;
    if (p && p.tiles && p.tiles.length) {
      const col = p.ok ? (p.tool === 'bulldoze' ? 'rgba(220,38,38,0.45)' : 'rgba(37,99,235,0.4)') : 'rgba(220,38,38,0.45)';
      ctx.fillStyle = col;
      for (let k = 0; k < p.tiles.length; k++) {
        const i = p.tiles[k];
        const x = w.tx(i), y = w.ty(i);
        if (p.tool === 'bulldoze') { ctx.fillRect(x + 0.05, y + 0.05, 0.9, 0.9); continue; }
        const bad = k >= p.valid;
        ctx.fillStyle = bad ? 'rgba(220,38,38,0.5)' : col;
        ctx.fillRect(x + 0.18, y + 0.18, 0.64, 0.64);
        if (k > 0) {
          const j = p.tiles[k - 1];
          const xa = w.tx(j), ya = w.ty(j);
          ctx.fillRect(Math.min(x, xa) + 0.18, Math.min(y, ya) + 0.18, Math.abs(x - xa) + 0.64, Math.abs(y - ya) + 0.64);
          if (p.tool === 'oneway' && !bad) {
            ctx.save();
            ctx.translate((x + xa) / 2 + 0.5, (y + ya) / 2 + 0.5);
            ctx.rotate(Math.atan2(y - ya, x - xa));
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.moveTo(0.12, 0); ctx.lineTo(-0.08, -0.12); ctx.lineTo(-0.08, 0.12); ctx.closePath(); ctx.fill();
            ctx.restore();
            ctx.fillStyle = col;
          }
        }
      }
    }
    // Hover-Rahmen
    if (this.hover >= 0 && this.game.ui && this.game.ui.tool !== 'inspect') {
      const x = w.tx(this.hover), y = w.ty(this.hover);
      ctx.strokeStyle = 'rgba(15,23,42,0.55)';
      ctx.lineWidth = 0.04;
      ctx.strokeRect(x + 0.03, y + 0.03, 0.94, 0.94);
      const ui = this.game.ui;
      if (ui.tool === 'place' && ui.placeType) {
        const bt = BT[ui.placeType];
        const ok = w.footprintOk(ui.placeType, x, y, ui.placeDir, { allowForest: true, allowEdge: ui.placeType === 'gate' });
        ctx.fillStyle = ok ? 'rgba(37,99,235,0.35)' : 'rgba(220,38,38,0.35)';
        ctx.fillRect(x, y, bt.w, bt.h);
        const tmp = new Building(-1, ui.placeType, x, y, ui.placeDir, 1);
        ctx.fillStyle = 'rgba(15,23,42,0.5)';
        ctx.fillRect(tmp.ax + 0.3, tmp.ay + 0.3, 0.4, 0.4);
      }
    }
    // Buslinie im Aufbau
    const ui = this.game.ui;
    if (ui && ui.tool === 'busline' && ui.lineDraft && ui.lineDraft.length) {
      ctx.strokeStyle = '#1d4ed8'; ctx.lineWidth = 0.1; ctx.setLineDash([0.2, 0.12]);
      ctx.beginPath();
      ui.lineDraft.forEach((t, k) => { const x = w.tx(t) + 0.5, y = w.ty(t) + 0.5; if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      if (this.hover >= 0) ctx.lineTo(w.tx(this.hover) + 0.5, w.ty(this.hover) + 0.5);
      ctx.stroke(); ctx.setLineDash([]);
      ui.lineDraft.forEach((t, k) => {
        ctx.fillStyle = '#1d4ed8';
        ctx.beginPath(); ctx.arc(w.tx(t) + 0.5, w.ty(t) + 0.5, 0.2, 0, Math.PI * 2); ctx.fill();
      });
    }
  }

  // ---- Nicht angeschlossene Gebäude -------------------------------------------------
  drawUnconnected(ctx) {
    const g = this.game, w = g.world;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
    for (const b of w.buildings) {
      if (b.dead || w.road[b.acc]) continue;
      if (!this.inView(b.ax, b.ay)) continue;
      ctx.strokeStyle = b.unconnected > (g.level.grace || 80) ? `rgba(220,38,38,${0.5 + pulse * 0.5})` : `rgba(30,64,175,${0.4 + pulse * 0.4})`;
      ctx.lineWidth = 0.06;
      ctx.setLineDash([0.12, 0.08]);
      ctx.strokeRect(b.ax + 0.1, b.ay + 0.1, 0.8, 0.8);
      ctx.setLineDash([]);
      // Pfeil zur Einfahrt
      ctx.save();
      ctx.translate(b.ax + 0.5, b.ay + 0.5);
      ctx.rotate([-(Math.PI / 2), 0, Math.PI / 2, Math.PI][OPP[b.dir]]);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath(); ctx.moveTo(0.32, 0); ctx.lineTo(0.12, -0.14); ctx.lineTo(0.12, 0.14); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  // ---- Ampelsignale ------------------------------------------------------------------
  drawSignals(ctx) {
    const g = this.game, w = g.world;
    if (this.cam.z < 9) return;
    for (const J of w.junctions || []) {
      if (J.type !== 'light') continue;
      const x = w.tx(J.i), y = w.ty(J.i);
      if (!this.inView(x, y)) continue;
      for (let h = 0; h < 4; h++) {
        if (!((J.inMask >> h) & 1)) continue;
        // Position: rechts vor der Haltelinie, aus Sicht des Fahrers
        const side = OPP[h], r = (h + 1) & 3;
        const px = x + 0.5 + DX[side] * 0.42 + DX[r] * 0.42;
        const py = y + 0.5 + DY[side] * 0.42 + DY[r] * 0.42;
        let col = '#1f2937', left = null;
        if (J.off || !J.lightActive()) {
          col = Math.floor(this.time * 2) % 2 ? '#fbbf24' : '#3f3f46';
        } else {
          const s = J.signalHead(h);
          col = s.main === 2 ? '#22c55e' : s.main === 1 ? '#fbbf24' : '#ef4444';
          if (s.leftProtected) left = s.left === 2 ? '#22c55e' : s.left === 1 ? '#fbbf24' : '#ef4444';
          else if (!s.main && s.left) col = s.left === 2 ? '#22c55e' : '#fbbf24';
        }
        ctx.fillStyle = '#1f2937';
        ctx.beginPath(); roundRectPath(ctx, px - 0.07, py - 0.07, 0.14, 0.14, 0.03); ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(px, py, 0.045, 0, Math.PI * 2); ctx.fill();
        if (left) {
          const lx = px - DX[r] * 0.14, ly = py - DY[r] * 0.14;
          ctx.fillStyle = '#1f2937';
          ctx.beginPath(); roundRectPath(ctx, lx - 0.06, ly - 0.06, 0.12, 0.12, 0.03); ctx.fill();
          ctx.fillStyle = left;
          ctx.beginPath(); ctx.arc(lx, ly, 0.035, 0, Math.PI * 2); ctx.fill();
        }
        // Lichtschein
        if (this.cam.z > 20) {
          ctx.globalAlpha = 0.25;
          ctx.beginPath(); ctx.arc(px, py, 0.1, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  // ---- Fahrzeuge -------------------------------------------------------------------
  drawVehicles(ctx) {
    const g = this.game;
    const V = g.traffic.vehicles;
    const lod = this.cam.z < 15;
    const t = this.time;
    const night = this.darkness();
    for (let k = 0; k < V.length; k++) {
      const v = V[k];
      if (!this.inView(v.x, v.y)) continue;
      if (lod) {
        ctx.save(); ctx.translate(v.x, v.y); ctx.rotate(v.a);
        ctx.fillStyle = v.color;
        ctx.fillRect(-v.len / 2, -v.wid / 2, v.len, v.wid);
        ctx.restore();
        continue;
      }
      drawCar(ctx, v.x, v.y, v.a, v.vt, v.color, {
        brake: v.braking, blink: v.blink, t, siren: v.emergency, night, bus: v.bus, pax: v.pax, alpha: v.age < 0.4 ? v.age / 0.4 : 1, id: v.id,
      });
    }
  }

  // ---- Gebäude: Rauch, Feuer, Warnungen --------------------------------------------
  drawBuildingDyn(ctx) {
    const g = this.game, w = g.world, t = this.time;
    for (const b of w.buildings) {
      if (b.dead) continue;
      if (!this.inView(b.x + b.w / 2, b.y + b.h / 2, 3)) continue;
      if (b.type === 'industry' && Math.random() < 0.06) {
        const cx = b.x + 1.55, cy = b.y + 0.4;
        g.fx.add({ x: cx, y: cy, vx: 0.15 + Math.random() * 0.1, vy: -0.25, life: 0, max: 2.2, r: 0.08, color: '#cbd5e1', kind: 'smoke' });
      }
      if (b.fire) {
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        for (let k = 0; k < 5; k++) {
          const fx = cx + Math.sin(t * 7 + k * 2) * 0.18 + (k - 2) * 0.08, fy = cy - 0.05 * k;
          const r = 0.12 + 0.05 * Math.sin(t * 11 + k);
          ctx.fillStyle = k % 2 ? 'rgba(249,115,22,0.85)' : 'rgba(250,204,21,0.85)';
          ctx.beginPath(); ctx.arc(fx, fy, r, 0, Math.PI * 2); ctx.fill();
        }
        if (Math.random() < 0.3) g.fx.add({ x: cx, y: cy - 0.2, vx: (Math.random() - 0.5) * 0.2, vy: -0.4, life: 0, max: 1.6, r: 0.1, color: '#374151', kind: 'smoke' });
        // Fortschritt bis zum Abbrennen
        const f = g.city.fires.find(f => f.b === b);
        if (f) drawRing(ctx, cx, b.y - 0.25, 0.18, 1 - f.t / f.deadline, '#dc2626');
      }
      // Warnsymbol: keine Route / Stau an der Ausfahrt
      const warnQueue = b.queue.length >= 6;
      if (b.noRoute > 0 || warnQueue) {
        const cx = b.x + b.w / 2, cy = b.y - 0.15 + Math.sin(t * 3) * 0.04;
        ctx.fillStyle = b.noRoute > 0 ? '#dc2626' : '#f59e0b';
        ctx.beginPath(); ctx.moveTo(cx, cy - 0.2); ctx.lineTo(cx + 0.18, cy + 0.12); ctx.lineTo(cx - 0.18, cy + 0.12); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(cx - 0.02, cy - 0.1, 0.04, 0.12);
        ctx.fillRect(cx - 0.02, cy + 0.05, 0.04, 0.035);
      }
    }
    // Stadion: Flutlicht bei Spiel
    const st = g.city.stadium;
    if (st && g.time >= st.start - 10 && g.time <= st.end) {
      for (const b of g.city.lists ? g.city.lists.stadium : []) {
        ctx.fillStyle = `rgba(255,255,220,${0.25 + 0.1 * Math.sin(t * 2)})`;
        ctx.beginPath(); ctx.ellipse(b.x + 1.5, b.y + 1.5, 1.1, 0.8, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  drawSelection(ctx) {
    const s = this.selected, g = this.game, w = g.world;
    if (!s) return;
    ctx.lineWidth = 0.07;
    ctx.strokeStyle = '#1d4ed8';
    if (s.kind === 'tile') {
      const x = w.tx(s.i), y = w.ty(s.i);
      ctx.setLineDash([0.15, 0.1]); ctx.lineDashOffset = -this.time;
      ctx.strokeRect(x + 0.02, y + 0.02, 0.96, 0.96);
      ctx.setLineDash([]);
    } else if (s.kind === 'building') {
      const b = s.b;
      if (b.dead) { this.selected = null; return; }
      ctx.setLineDash([0.15, 0.1]); ctx.lineDashOffset = -this.time;
      ctx.strokeRect(b.x - 0.05, b.y - 0.05, b.w + 0.1, b.h + 0.1);
      ctx.setLineDash([]);
    } else if (s.kind === 'vehicle') {
      const v = g.traffic.byId.get(s.id);
      if (!v) { this.selected = null; return; }
      // Route
      ctx.strokeStyle = 'rgba(29,78,216,0.7)'; ctx.lineWidth = 0.08; ctx.setLineDash([0.18, 0.12]);
      ctx.beginPath(); ctx.moveTo(v.x, v.y);
      let t = v.t, d = v.d;
      t = w.nb(t, d);
      for (let k = v.ri; k <= v.route.length && t >= 0; k++) {
        ctx.lineTo(w.tx(t) + 0.5, w.ty(t) + 0.5);
        const nd = v.route[k];
        if (nd === undefined) break;
        if (t === v.goal) break;
        t = w.nb(t, nd);
      }
      ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = '#1d4ed8'; ctx.lineWidth = 0.05;
      ctx.beginPath(); ctx.arc(v.x, v.y, 0.32 + 0.04 * Math.sin(this.time * 5), 0, Math.PI * 2); ctx.stroke();
      if (v.to) { ctx.strokeRect(v.to.x - 0.05, v.to.y - 0.05, v.to.w + 0.1, v.to.h + 0.1); }
    }
  }

  drawFX(ctx) {
    const fx = this.game.fx;
    for (const p of fx.parts) {
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = p.kind === 'spark' ? a : a * 0.55;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Bildschirmtexte (Geld, Haltestellen-Namen) im Bildschirmraum
  drawScreenLabels(ctx) {
    const g = this.game, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of g.fx.texts) {
      const p = this.toScreen(t.x, t.y);
      const a = 1 - t.life / t.max;
      ctx.globalAlpha = Math.min(1, a * 1.6);
      ctx.font = '700 13px "Barlow Condensed", "Arial Narrow", sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeText(t.str, p.x, p.y);
      ctx.fillStyle = t.color; ctx.fillText(t.str, p.x, p.y);
    }
    ctx.globalAlpha = 1;
    // Haltestellennamen bei großem Zoom
    if (this.cam.z > 40) {
      const w = g.world;
      ctx.font = '600 11px "Barlow Condensed", "Arial Narrow", sans-serif';
      for (const s of g.city.stops.values()) {
        const x = w.tx(s.tile), y = w.ty(s.tile);
        if (!this.inView(x, y)) continue;
        const p = this.toScreen(x + 0.5, y - 0.12);
        const tw = ctx.measureText(s.name).width + 8;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillRect(p.x - tw / 2, p.y - 8, tw, 16);
        ctx.fillStyle = '#14532d';
        ctx.fillText(s.name, p.x, p.y);
      }
    }
    // Ortseingangs-Namen
    if (this.cam.z > 22) {
      const w = g.world;
      ctx.font = '700 12px "Barlow Condensed", "Arial Narrow", sans-serif';
      for (const b of w.buildings) {
        if (b.dead || b.cat !== 'gate' || !this.inView(b.x, b.y)) continue;
        const p = this.toScreen(b.x + 0.5 + DX[b.dir] * 0.9, b.y + 0.5 + DY[b.dir] * 0.9 - 0.6);
        const tw = ctx.measureText(b.name).width + 10;
        ctx.fillStyle = '#f2c200'; ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5;
        ctx.fillRect(p.x - tw / 2, p.y - 9, tw, 18); ctx.strokeRect(p.x - tw / 2 + 2, p.y - 7, tw - 4, 14);
        ctx.fillStyle = '#111'; ctx.fillText(b.name, p.x, p.y + 1);
      }
    }
  }

  // ---- Tag & Nacht ------------------------------------------------------------------
  darkness() {
    const m = this.game.minutes % 1440;
    const h = m / 60;
    if (h >= 21.5 || h < 4.75) return 0.55;
    if (h >= 19.5) return 0.55 * smoothstep(19.5, 21.5, h);
    if (h < 6.25) return 0.55 * (1 - smoothstep(4.75, 6.25, h));
    return 0;
  }

  drawNight(ctx) {
    const d = this.darkness();
    const g = this.game, dpr = this.dpr;
    if (d <= 0.01) return;
    const m = (g.minutes % 1440) / 60;
    const dusk = (m > 19 && m < 21) || (m > 4.5 && m < 6.5);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = dusk && d < 0.4 ? `rgba(70,40,90,${d})` : `rgba(12,22,58,${d})`;
    ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    ctx.restore();
    // Lichter
    const cam = this.cam;
    ctx.save();
    ctx.setTransform(cam.z * dpr, 0, 0, cam.z * dpr, (this.W / 2 - cam.x * cam.z) * dpr, (this.H / 2 - cam.y * cam.z) * dpr);
    ctx.globalCompositeOperation = 'lighter';
    const w = g.world;
    const k = d / 0.55;
    // Straßenlaternen an Kreuzungen
    for (const J of w.junctions || []) {
      const x = w.tx(J.i) + 0.5, y = w.ty(J.i) + 0.5;
      if (!this.inView(x, y)) continue;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, 0.9);
      gr.addColorStop(0, `rgba(255,214,140,${0.35 * k})`); gr.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = gr; ctx.fillRect(x - 0.9, y - 0.9, 1.8, 1.8);
    }
    // Fenster
    for (const b of w.buildings) {
      if (b.dead || b.cat === 'gate' || !this.inView(b.x, b.y, 2)) continue;
      const r = new RNG(b.seed);
      const n = b.w * b.h * 2;
      ctx.fillStyle = `rgba(255,220,130,${0.55 * k})`;
      for (let q = 0; q < n; q++) {
        if (r.next() < 0.35) continue;
        const fx = b.x + 0.2 + r.next() * (b.w - 0.4), fy = b.y + 0.2 + r.next() * (b.h - 0.4);
        ctx.fillRect(fx, fy, 0.07, 0.05);
      }
    }
    // Scheinwerfer
    if (this.cam.z >= 12) {
      for (const v of g.traffic.vehicles) {
        if (!this.inView(v.x, v.y)) continue;
        const ca = Math.cos(v.a), sa = Math.sin(v.a);
        const fx = v.x + ca * v.len * 0.5, fy = v.y + sa * v.len * 0.5;
        const ex = fx + ca * 0.55, ey = fy + sa * 0.55;
        const gr = ctx.createRadialGradient(fx, fy, 0.01, ex, ey, 0.32);
        gr.addColorStop(0, `rgba(255,240,190,${0.5 * k})`); gr.addColorStop(1, 'rgba(255,240,190,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.moveTo(fx, fy);
        ctx.lineTo(ex - sa * 0.22, ey + ca * 0.22); ctx.lineTo(ex + sa * 0.22, ey - ca * 0.22); ctx.closePath(); ctx.fill();
        if (v.braking) {
          const bx = v.x - ca * v.len * 0.5, by = v.y - sa * v.len * 0.5;
          ctx.fillStyle = `rgba(255,40,40,${0.35 * k})`;
          ctx.beginPath(); ctx.arc(bx, by, 0.09, 0, Math.PI * 2); ctx.fill();
        }
        if (v.emergency) {
          ctx.fillStyle = Math.floor(this.time * 6) % 2 ? `rgba(60,120,255,${0.6 * k})` : `rgba(255,255,255,${0.3 * k})`;
          ctx.beginPath(); ctx.arc(v.x, v.y, 0.4, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  drawWeather(ctx, dt) {
    const g = this.game, dpr = this.dpr;
    const wt = g.city.weather;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Wolkenschatten
    if (wt === 'cloud' || wt === 'rain' || wt === 'snow') {
      if (this.clouds.length < 5) this.clouds.push({ x: Math.random() * 60 - 20, y: Math.random() * 40, r: 3 + Math.random() * 4 });
      const w = g.world;
      for (const c of this.clouds) {
        c.x += dt * 0.25 * (g.paused ? 0 : 1);
        if (c.x - c.r > w.w + 10) { c.x = -c.r - 5; c.y = Math.random() * w.h; }
        const p = this.toScreen(c.x, c.y);
        const R = c.r * this.cam.z;
        const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
        gr.addColorStop(0, 'rgba(30,40,60,0.13)'); gr.addColorStop(1, 'rgba(30,40,60,0)');
        ctx.fillStyle = gr; ctx.fillRect(p.x - R, p.y - R, R * 2, R * 2);
      }
    }
    if (wt === 'rain' || wt === 'snow') {
      const snow = wt === 'snow';
      const target = snow ? 140 : 220;
      while (this.rain.length < target) this.rain.push({ x: Math.random() * this.W, y: Math.random() * this.H, s: 0.6 + Math.random() * 0.6 });
      ctx.fillStyle = snow ? 'rgba(255,255,255,0.18)' : 'rgba(80,100,130,0.12)';
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.strokeStyle = 'rgba(210,225,245,0.55)'; ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      for (const r of this.rain) {
        if (snow) { r.y += dt * 40 * r.s; r.x += Math.sin(this.time + r.s * 9) * dt * 15; ctx.moveTo(r.x + 1.6, r.y); ctx.arc(r.x, r.y, 1.6 * r.s, 0, Math.PI * 2); }
        else { r.y += dt * 520 * r.s; r.x -= dt * 90 * r.s; ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + 3 * r.s, r.y - 13 * r.s); }
        if (r.y > this.H + 10) { r.y = -10; r.x = Math.random() * (this.W + 100); }
        if (r.x < -20) r.x = this.W + 10;
      }
      if (snow) ctx.fill(); else ctx.stroke();
    } else this.rain.length = 0;
    if (wt === 'fog') {
      ctx.fillStyle = 'rgba(225,230,236,0.38)';
      ctx.fillRect(0, 0, this.W, this.H);
      const gr = ctx.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.2, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.7);
      gr.addColorStop(0, 'rgba(235,238,242,0)'); gr.addColorStop(1, 'rgba(235,238,242,0.55)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, this.W, this.H);
    }
    ctx.restore();
  }
}

// ===========================================================================
// Statische Zeichenroutinen (in Kachelkoordinaten)
// ===========================================================================

function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawRing(ctx, x, y, r, f, col) {
  ctx.lineWidth = 0.06;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = col;
  ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(f, 0, 1)); ctx.stroke();
}

function roadHalf(w, i, s) { // halbe Fahrbahnbreite zur Seite s
  const hw = w.road[i] === 2 ? 0.04 : 0;
  return ((w.two[i] >> s) & 1 ? 0.32 : 0.23) + hw;
}

// Fahrbahnfläche einer Kachel als Pfad (für Overlays); expand vergrößert
function roadShape(ctx, w, i, x, y, scale) {
  const lk = w.link[i];
  ctx.beginPath();
  const cx = x + 0.5, cy = y + 0.5;
  const hw = 0.32;
  ctx.rect(cx - hw, cy - hw, hw * 2, hw * 2);
  for (let s = 0; s < 4; s++) {
    if (!((lk >> s) & 1)) continue;
    const h = roadHalf(w, i, s);
    if (s === 0) ctx.rect(cx - h, y, h * 2, 0.5);
    if (s === 2) ctx.rect(cx - h, cy, h * 2, 0.5);
    if (s === 1) ctx.rect(cx, cy - h, 0.5, h * 2);
    if (s === 3) ctx.rect(x, cy - h, 0.5, h * 2);
  }
}

function drawStatic(g, game, x0, y0, x1, y1, scale) {
  const w = game.world;
  // 1) Gelände
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) drawTerrainTile(g, w, x, y, scale);
  // 2) Straßen
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * w.w + x;
    if (w.road[i]) drawRoadBase(g, w, i, x, y);
  }
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * w.w + x;
    if (w.road[i]) drawRoadMarkings(g, game, w, i, x, y, scale);
  }
  // 3) Gebäude (inkl. Nachbarn, die hineinragen)
  for (const b of w.buildings) {
    if (b.dead) continue;
    if (b.x + b.w + 1 < x0 || b.y + b.h + 1 < y0 || b.x - 1 > x1 || b.y - 1 > y1) continue;
    drawBuilding(g, w, b, scale);
  }
}

const GRASS_CACHE = new Map();
function grassColor(w, x, y) {
  const n = fbm(x / 7, y / 7, w.seed + 5, 3);
  const k = Math.round(clamp((n - 0.3) / 0.4, 0, 1) * 6);
  let c = GRASS_CACHE.get(k);
  if (!c) { c = mixHex('#c9dc9f', '#d1e2a9', k / 6); GRASS_CACHE.set(k, c); }
  return c;
}

function drawTerrainTile(g, w, x, y, scale) {
  const i = y * w.w + x;
  const t = w.terrain[i];
  const v = w.variant[i];
  const isW = (xx, yy) => !w.inb(xx, yy) ? w.terrain[w.idx(clamp(xx, 0, w.w - 1), clamp(yy, 0, w.h - 1))] === T_WATER : w.terrain[yy * w.w + xx] === T_WATER;
  const base = t === T_FIELD ? PAL.field : t === T_SAND ? PAL.sand : t === T_FOREST ? PAL.forestFloor : grassColor(w, x, y);
  if (t === T_WATER) {
    // Land darunter, dann Wasser mit gerundeten Ecken
    g.fillStyle = PAL.sand;
    g.fillRect(x, y, 1.02, 1.02);
    const n = isW(x, y - 1), e = isW(x + 1, y), s = isW(x, y + 1), wst = isW(x - 1, y);
    const r = 0.42;
    const rTL = !n && !wst ? r : 0, rTR = !n && !e ? r : 0, rBR = !s && !e ? r : 0, rBL = !s && !wst ? r : 0;
    g.fillStyle = (v & 1) ? PAL.water : PAL.waterDeep;
    g.beginPath();
    g.moveTo(x + rTL, y);
    g.lineTo(x + 1 - rTR, y); if (rTR) g.arcTo(x + 1, y, x + 1, y + rTR, rTR);
    g.lineTo(x + 1, y + 1 - rBR); if (rBR) g.arcTo(x + 1, y + 1, x + 1 - rBR, y + 1, rBR);
    g.lineTo(x + rBL, y + 1); if (rBL) g.arcTo(x, y + 1, x, y + 1 - rBL, rBL);
    g.lineTo(x, y + rTL); if (rTL) g.arcTo(x, y, x + rTL, y, rTL);
    g.closePath();
    g.fill();
    // Wasser über Kachelgrenzen hinaus (Lücken vermeiden)
    if (e) g.fillRect(x + 0.5, y + (rTR ? r : 0), 0.53, 1 - (rTR ? r : 0) - (rBR ? r : 0));
    if (s) g.fillRect(x + (rBL ? r : 0), y + 0.5, 1 - (rBL ? r : 0) - (rBR ? r : 0), 0.53);
    return;
  }
  g.fillStyle = base;
  g.fillRect(x, y, 1.02, 1.02);
  // konkave Ecken zum Wasser
  {
    const n = isW(x, y - 1), e = isW(x + 1, y), s = isW(x, y + 1), wst = isW(x - 1, y);
    const r = 0.3;
    const corner = (cx, cy, sx, sy) => {
      g.fillStyle = PAL.water;
      g.fillRect(sx > 0 ? cx : cx - r, sy > 0 ? cy : cy - r, r, r);
      g.fillStyle = base;
      g.beginPath(); g.arc(cx + sx * r, cy + sy * r, r, 0, Math.PI * 2); g.fill();
    };
    if (n && wst && isW(x - 1, y - 1)) corner(x, y, 1, 1);
    if (n && e && isW(x + 1, y - 1)) corner(x + 1, y, -1, 1);
    if (s && e && isW(x + 1, y + 1)) corner(x + 1, y + 1, -1, -1);
    if (s && wst && isW(x - 1, y + 1)) corner(x, y + 1, 1, -1);
  }
  if (t === T_FIELD && scale > 10) {
    g.strokeStyle = PAL.fieldLine; g.lineWidth = 0.04;
    g.beginPath();
    const vert = (Math.floor(x / 3) + Math.floor(y / 3)) % 2;
    for (let k = 0.15; k < 1; k += 0.22) {
      if (vert) { g.moveTo(x + k, y + 0.04); g.lineTo(x + k, y + 0.96); } else { g.moveTo(x + 0.04, y + k); g.lineTo(x + 0.96, y + k); }
    }
    g.stroke();
  } else if (t === T_FOREST) {
    const r = new RNG(v * 7919 + i);
    const n = 3 + (v % 2);
    for (let k = 0; k < n; k++) {
      const tx = x + 0.22 + r.next() * 0.56, ty = y + 0.22 + r.next() * 0.56, rad = 0.17 + r.next() * 0.1;
      g.fillStyle = 'rgba(45,70,35,0.22)';
      g.beginPath(); g.ellipse(tx + 0.05, ty + 0.06, rad, rad * 0.85, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = PAL.trees[Math.floor(r.next() * PAL.trees.length)];
      g.beginPath(); g.arc(tx, ty, rad, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.beginPath(); g.arc(tx - rad * 0.3, ty - rad * 0.3, rad * 0.45, 0, Math.PI * 2); g.fill();
    }
  } else if (t === T_ROCK) {
    g.fillStyle = PAL.rock;
    g.beginPath(); roundRectPath(g, x + 0.02, y + 0.02, 0.98, 0.98, 0.18); g.fill();
    const r = new RNG(v * 31 + i);
    for (let k = 0; k < 3; k++) {
      const bx = x + 0.2 + r.next() * 0.6, by = y + 0.2 + r.next() * 0.6, br = 0.1 + r.next() * 0.14;
      g.fillStyle = PAL.rockDark;
      g.beginPath(); g.moveTo(bx - br, by + br * 0.6); g.lineTo(bx - br * 0.3, by - br); g.lineTo(bx + br * 0.6, by - br * 0.5); g.lineTo(bx + br, by + br * 0.6); g.closePath(); g.fill();
      g.fillStyle = PAL.rockLight;
      g.beginPath(); g.moveTo(bx - br * 0.3, by - br); g.lineTo(bx + br * 0.6, by - br * 0.5); g.lineTo(bx + br * 0.1, by); g.closePath(); g.fill();
    }
  } else if (t === T_GRASS && scale > 14 && (v % 11) === 0) {
    // einzelner Baum / Busch
    const tx = x + 0.3 + (v % 5) / 10, ty = y + 0.3 + (v % 7) / 14;
    g.fillStyle = 'rgba(45,70,35,0.2)';
    g.beginPath(); g.arc(tx + 0.04, ty + 0.05, 0.13, 0, Math.PI * 2); g.fill();
    g.fillStyle = PAL.trees[v % PAL.trees.length];
    g.beginPath(); g.arc(tx, ty, 0.13, 0, Math.PI * 2); g.fill();
  } else if (t === T_GRASS && scale > 14 && (v % 7) === 0) {
    g.fillStyle = (v & 8) ? '#f4f1d0' : '#f6c6d8';
    for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x + 0.25 + k * 0.2, y + 0.6 + (k % 2) * 0.12, 0.03, 0, Math.PI * 2); g.fill(); }
  }
}

function armRect(g, x, y, s, h, ext) {
  const cx = x + 0.5, cy = y + 0.5;
  if (s === 0) g.rect(cx - h, y - ext, h * 2, 0.5 + ext);
  if (s === 2) g.rect(cx - h, cy, h * 2, 0.5 + ext);
  if (s === 1) g.rect(cx, cy - h, 0.5 + ext, h * 2);
  if (s === 3) g.rect(x - ext, cy - h, 0.5 + ext, h * 2);
}

function drawRoadBase(g, w, i, x, y) {
  const lk = w.link[i];
  const deg = popcount4(lk);
  const cx = x + 0.5, cy = y + 0.5;
  const isRound = w.jc[i] && w.jc[i].type === 'roundabout';
  const bridge = w.flags[i] & F_BRIDGE, tunnel = w.flags[i] & F_TUNNEL;
  const asph = w.road[i] === 2 ? PAL.asphaltHw : PAL.asphalt;
  const curb = 0.07;
  // Brücke: Schatten und Deck
  if (bridge) {
    g.fillStyle = 'rgba(20,50,70,0.25)';
    g.beginPath(); shapeFor(g, w, i, x + 0.07, y + 0.1, 0.1, lk, deg, isRound); g.fill();
    g.fillStyle = PAL.bridge;
    g.beginPath(); shapeFor(g, w, i, x, y, 0.1, lk, deg, isRound); g.fill();
  }
  // Einfahrten (Bürgersteig-Überfahrt)
  for (let s = 0; s < 4; s++) {
    if (!((w.drive[i] >> s) & 1)) continue;
    g.fillStyle = PAL.curb;
    g.beginPath(); armRect(g, x, y, s, 0.17, 0); g.fill();
    g.fillStyle = PAL.drive;
    g.beginPath(); armRect(g, x, y, s, 0.12, 0); g.fill();
  }
  // Bordstein
  g.fillStyle = tunnel ? '#9a917f' : PAL.curb;
  g.beginPath(); shapeFor(g, w, i, x, y, curb, lk, deg, isRound); g.fill();
  // Asphalt
  g.fillStyle = asph;
  g.beginPath(); shapeFor(g, w, i, x, y, 0, lk, deg, isRound); g.fill();
  if (isRound) {
    g.fillStyle = PAL.curb;
    g.beginPath(); g.arc(cx, cy, 0.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8fbf6a';
    g.beginPath(); g.arc(cx, cy, 0.165, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5c914d';
    g.beginPath(); g.arc(cx - 0.03, cy - 0.02, 0.07, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f2b4c8';
    g.beginPath(); g.arc(cx + 0.07, cy + 0.06, 0.025, 0, Math.PI * 2); g.arc(cx + 0.02, cy + 0.09, 0.022, 0, Math.PI * 2); g.fill();
  }
  if (tunnel) {
    g.fillStyle = 'rgba(30,30,35,0.38)';
    g.beginPath(); shapeFor(g, w, i, x, y, 0, lk, deg, isRound); g.fill();
    // Portale am Übergang
    for (let s = 0; s < 4; s++) {
      if (!((lk >> s) & 1)) continue;
      const j = w.nb(i, s);
      if (j >= 0 && !(w.flags[j] & F_TUNNEL)) {
        const h = roadHalf(w, i, s) + 0.08;
        g.save(); g.translate(cx, cy); g.rotate([-Math.PI / 2, 0, Math.PI / 2, Math.PI][s]);
        g.fillStyle = '#5b5346';
        g.fillRect(0.38, -h, 0.12, h * 2);
        g.fillStyle = '#2b2620';
        g.beginPath(); g.ellipse(0.5, 0, 0.06, h * 0.8, 0, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    }
  }
  if (bridge) {
    // Geländer entlang gerader Brücken
    g.strokeStyle = PAL.rail; g.lineWidth = 0.035;
    g.beginPath();
    const hh = 0.42;
    if (lk === 0b0101) { g.moveTo(cx - hh, y); g.lineTo(cx - hh, y + 1); g.moveTo(cx + hh, y); g.lineTo(cx + hh, y + 1); }
    else if (lk === 0b1010) { g.moveTo(x, cy - hh); g.lineTo(x + 1, cy - hh); g.moveTo(x, cy + hh); g.lineTo(x + 1, cy + hh); }
    g.stroke();
  }
}

// Form der Fahrbahn: ext = Verbreiterung (Bordstein)
function shapeFor(g, w, i, x, y, ext, lk, deg, isRound) {
  const cx = x + 0.5, cy = y + 0.5;
  if (isRound) {
    g.arc(cx, cy, 0.45 + ext * 0.6, 0, Math.PI * 2);
    for (let s = 0; s < 4; s++) if ((lk >> s) & 1) armRect(g, x, y, s, roadHalf(w, i, s) + ext, 0);
    return;
  }
  if (deg === 2 && lk !== 0b0101 && lk !== 0b1010) {
    // Kurve: Viertelring um die Ecke
    let s1 = -1, s2 = -1;
    for (let s = 0; s < 4; s++) if ((lk >> s) & 1) { if (s1 < 0) s1 = s; else s2 = s; }
    const h1 = roadHalf(w, i, s1) + ext, h2 = roadHalf(w, i, s2) + ext;
    const h = Math.max(h1, h2);
    // Eckpunkt zwischen den beiden Seiten
    const ox = x + (DX[s1] + DX[s2] > 0 ? 1 : 0), oy = y + (DY[s1] + DY[s2] > 0 ? 1 : 0);
    const R = 0.5;
    const a0 = Math.atan2(cy - oy, cx - ox);
    // Ring zwischen R-h und R+h um die Ecke, nur innerhalb der Kachel
    const startA = Math.atan2((y + 0.5 + DY[s1] * 0.5) - oy, (x + 0.5 + DX[s1] * 0.5) - ox);
    const endA = Math.atan2((y + 0.5 + DY[s2] * 0.5) - oy, (x + 0.5 + DX[s2] * 0.5) - ox);
    let d = endA - startA;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const ccw = d < 0;
    g.arc(ox, oy, R + h, startA, endA, ccw);
    g.arc(ox, oy, Math.max(0.001, R - h), endA, startA, !ccw);
    g.closePath();
    void a0;
    return;
  }
  const hw = deg >= 3 ? 0.32 + ext : 0;
  if (deg >= 3) g.rect(cx - hw, cy - hw, hw * 2, hw * 2);
  if (deg === 0) { g.rect(cx - 0.3 - ext, cy - 0.3 - ext, 0.6 + ext * 2, 0.6 + ext * 2); return; }
  if (deg === 1) {
    let s = 0; for (let k = 0; k < 4; k++) if ((lk >> k) & 1) s = k;
    const h = roadHalf(w, i, s) + ext;
    armRect(g, x, y, s, h, 0);
    g.moveTo(cx + h, cy); g.arc(cx, cy, h, 0, Math.PI * 2);
    return;
  }
  for (let s = 0; s < 4; s++) if ((lk >> s) & 1) armRect(g, x, y, s, roadHalf(w, i, s) + ext, 0);
}

function drawRoadMarkings(g, game, w, i, x, y, scale) {
  if (scale < 11) return;
  const lk = w.link[i];
  const deg = popcount4(lk);
  const cx = x + 0.5, cy = y + 0.5;
  const J = w.jc[i];
  g.strokeStyle = PAL.mark;
  g.fillStyle = PAL.mark;
  if (!w.isJ[i]) {
    if (deg === 2 && (w.two[i] & lk) === lk) {
      // Mittellinie (gestrichelt), auf Schnellstraßen durchgezogen doppelt
      g.lineWidth = w.road[i] === 2 ? 0.025 : 0.035;
      if (w.road[i] !== 2) g.setLineDash([0.13, 0.12]);
      g.beginPath();
      centerLinePath(g, w, i, x, y, lk, 0);
      g.stroke();
      if (w.road[i] === 2) { g.beginPath(); centerLinePath(g, w, i, x, y, lk, 0.035); g.stroke(); g.beginPath(); centerLinePath(g, w, i, x, y, lk, -0.035); g.stroke(); }
      g.setLineDash([]);
    }
    // Einbahnpfeile
    for (let s = 0; s < 4; s++) {
      if (!((lk >> s) & 1) || ((w.two[i] >> s) & 1)) continue;
      if (!((w.out[i] >> s) & 1)) continue; // Pfeil nur in Fahrtrichtung
      g.save(); g.translate(cx + DX[s] * 0.25, cy + DY[s] * 0.25); g.rotate([-Math.PI / 2, 0, Math.PI / 2, Math.PI][s]);
      g.beginPath(); g.moveTo(0.1, 0); g.lineTo(-0.04, -0.09); g.lineTo(-0.01, 0); g.lineTo(-0.04, 0.09); g.closePath();
      g.globalAlpha = 0.9; g.fill(); g.globalAlpha = 1;
      g.restore();
    }
    // Bushaltestelle
    if (w.flags[i] & F_STOP) drawBusStopMark(g, w, i, x, y);
    return;
  }
  // Kreuzung: Haltelinien / Wartelinien und Schilder
  if (!J) return;
  const type = J.type;
  for (let h = 0; h < 4; h++) {
    if (!((J.inMask >> h) & 1)) continue;
    const side = OPP[h];
    const r = (h + 1) & 3;
    const two = (w.two[i] >> side) & 1;
    // Linie quer über die Einfahrtsspur
    const lane0 = two ? 0.02 : -0.2, lane1 = two ? 0.31 : 0.2;
    const ex = cx + DX[side] * 0.47, ey = cy + DY[side] * 0.47;
    const ax = ex + DX[r] * lane0, ay = ey + DY[r] * lane0, bx = ex + DX[r] * lane1, by = ey + DY[r] * lane1;
    let style = null;
    if (type === 'light') style = 'stop';
    else if (type === 'priority' && !J.isMain(h)) style = 'yield';
    else if (type === 'roundabout') style = 'yield';
    if (style) {
      g.lineWidth = style === 'stop' ? 0.06 : 0.045;
      if (style === 'yield') g.setLineDash([0.06, 0.05]);
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      g.setLineDash([]);
    }
    // Schilder an der rechten Ecke
    const sx = cx + DX[side] * 0.56 + DX[r] * 0.44, sy = cy + DY[side] * 0.56 + DY[r] * 0.44;
    if (type === 'priority') {
      if (J.isMain(h)) drawSignPriority(g, sx, sy);
      else drawSignYield(g, sx, sy);
    } else if (type === 'roundabout') drawSignRound(g, sx, sy);
    else if (type === 'light') {
      // Ampelmast (Signal dynamisch)
      g.fillStyle = '#475569';
      g.beginPath(); g.arc(cx + DX[side] * 0.42 + DX[r] * 0.42, cy + DY[side] * 0.42 + DY[r] * 0.42, 0.03, 0, Math.PI * 2); g.fill();
    }
  }
  if (type === 'roundabout') {
    // Pfeile im Kreis
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (let k = 0; k < 4; k++) {
      const a = (k * 90 + 45) * Math.PI / 180;
      const px = cx + Math.cos(a) * 0.32, py = cy - Math.sin(a) * 0.32;
      g.save(); g.translate(px, py); g.rotate(-a - Math.PI / 2);
      g.beginPath(); g.moveTo(0.06, 0); g.lineTo(-0.03, -0.05); g.lineTo(-0.03, 0.05); g.closePath(); g.fill();
      g.restore();
    }
  }
  if (type === 'auto' && scale > 30) {
    // kleiner Hinweis: rechts vor links (Zeichen 102) an einer Ecke
    const sx = cx + 0.44, sy = cy + 0.56;
    void sx; void sy;
  }
}

function centerLinePath(g, w, i, x, y, lk, off) {
  const cx = x + 0.5, cy = y + 0.5;
  if (lk === 0b0101) { g.moveTo(cx + off, y); g.lineTo(cx + off, y + 1); return; }
  if (lk === 0b1010) { g.moveTo(x, cy + off); g.lineTo(x + 1, cy + off); return; }
  let s1 = -1, s2 = -1;
  for (let s = 0; s < 4; s++) if ((lk >> s) & 1) { if (s1 < 0) s1 = s; else s2 = s; }
  const ox = x + (DX[s1] + DX[s2] > 0 ? 1 : 0), oy = y + (DY[s1] + DY[s2] > 0 ? 1 : 0);
  const R = 0.5 + off;
  const startA = Math.atan2((y + 0.5 + DY[s1] * 0.5) - oy, (x + 0.5 + DX[s1] * 0.5) - ox);
  const endA = Math.atan2((y + 0.5 + DY[s2] * 0.5) - oy, (x + 0.5 + DX[s2] * 0.5) - ox);
  let d = endA - startA;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  g.arc(ox, oy, R, startA, endA, d < 0);
}

function drawBusStopMark(g, w, i, x, y) {
  const lk = w.link[i];
  const vert = (lk & 0b0101) === 0b0101 || ((lk & 0b1010) === 0 && (lk & 0b0101));
  g.strokeStyle = PAL.yellow; g.lineWidth = 0.03;
  g.beginPath();
  // Zickzacklinie am rechten Rand beider Fahrtrichtungen
  for (const sgn of [1, -1]) {
    for (let k = 0; k <= 6; k++) {
      const t = 0.15 + k * 0.7 / 6;
      const o = sgn * (0.27 + ((k % 2) ? 0.03 : -0.03));
      const px = vert ? x + 0.5 + o : x + t, py = vert ? y + t : y + 0.5 + o;
      if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
  }
  g.stroke();
  // Schild: grünes H auf gelbem Kreis
  const sx = vert ? x + 0.92 : x + 0.5, sy = vert ? y + 0.5 : y + 0.92;
  g.fillStyle = '#f2c200';
  g.beginPath(); g.arc(sx, sy, 0.1, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#15803d'; g.lineWidth = 0.02; g.stroke();
  g.fillStyle = '#15803d';
  g.fillRect(sx - 0.045, sy - 0.055, 0.022, 0.11); g.fillRect(sx + 0.023, sy - 0.055, 0.022, 0.11); g.fillRect(sx - 0.045, sy - 0.01, 0.09, 0.02);
}

function drawSignPriority(g, x, y) {
  g.save(); g.translate(x, y); g.rotate(Math.PI / 4);
  g.fillStyle = '#fff'; g.fillRect(-0.075, -0.075, 0.15, 0.15);
  g.fillStyle = '#f2c200'; g.fillRect(-0.05, -0.05, 0.1, 0.1);
  g.strokeStyle = '#111'; g.lineWidth = 0.008; g.strokeRect(-0.075, -0.075, 0.15, 0.15);
  g.restore();
}
function drawSignYield(g, x, y) {
  g.fillStyle = '#fff'; g.strokeStyle = '#dc2626'; g.lineWidth = 0.025;
  g.beginPath(); g.moveTo(x - 0.09, y - 0.07); g.lineTo(x + 0.09, y - 0.07); g.lineTo(x, y + 0.09); g.closePath(); g.fill(); g.stroke();
}
function drawSignRound(g, x, y) {
  g.fillStyle = '#1d4ed8';
  g.beginPath(); g.arc(x, y, 0.08, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 0.018;
  g.beginPath(); g.arc(x, y, 0.045, 0.3, Math.PI * 1.7); g.stroke();
}

function drawWorks(ctx, w, i, x, y, t) {
  // Baustelle: Absperrbaken und Kegel auf einer Fahrspur
  const lk = w.link[i];
  const vert = (lk & 0b0101) !== 0;
  ctx.fillStyle = 'rgba(234,88,12,0.22)';
  if (vert) ctx.fillRect(x + 0.5, y + 0.05, 0.3, 0.9); else ctx.fillRect(x + 0.05, y + 0.5, 0.9, 0.3);
  for (let k = 0; k < 4; k++) {
    const px = vert ? x + 0.55 : x + 0.15 + k * 0.23, py = vert ? y + 0.15 + k * 0.23 : y + 0.55;
    ctx.fillStyle = '#f97316';
    ctx.beginPath(); ctx.moveTo(px, py - 0.07); ctx.lineTo(px + 0.05, py + 0.05); ctx.lineTo(px - 0.05, py + 0.05); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(px - 0.025, py - 0.01, 0.05, 0.02);
  }
  const blink = Math.floor(t * 2.5 + x) % 2;
  ctx.fillStyle = blink ? '#fde047' : '#a16207';
  ctx.beginPath(); ctx.arc(vert ? x + 0.75 : x + 0.9, vert ? y + 0.1 : y + 0.75, 0.04, 0, Math.PI * 2); ctx.fill();
  // kleiner Bagger
  ctx.fillStyle = '#facc15';
  const bx = vert ? x + 0.68 : x + 0.5, by = vert ? y + 0.5 : y + 0.68;
  ctx.fillRect(bx - 0.08, by - 0.06, 0.16, 0.12);
  ctx.fillStyle = '#1f2937'; ctx.fillRect(bx - 0.03, by - 0.03, 0.06, 0.06);
}

// ---- Gebäude ------------------------------------------------------------------
function drawBuilding(g, w, b, scale) {
  const x = b.x, y = b.y, bw = b.w, bh = b.h;
  const r = new RNG(b.seed);
  const t = b.type;
  // Zufahrt vom Gebäude zur Straße
  if (t !== 'gate') {
    const dx = b.dx + 0.5, dy = b.dy + 0.5;
    g.fillStyle = PAL.drive;
    const ex = dx + DX[b.dir] * 0.5, ey = dy + DY[b.dir] * 0.5;
    g.beginPath();
    if (DX[b.dir]) g.rect(Math.min(dx, ex), dy - 0.12, Math.abs(ex - dx), 0.24); else g.rect(dx - 0.12, Math.min(dy, ey), 0.24, Math.abs(ey - dy));
    g.fill();
  }
  if (t === 'gate') { drawGate(g, w, b); return; }
  const shadow = (px, py, pw, ph, rr, off) => {
    g.fillStyle = 'rgba(30,40,30,0.22)';
    g.beginPath(); roundRectPath(g, px + off, py + off * 1.3, pw, ph, rr); g.fill();
  };
  if (t === 'house') {
    const ins = 0.14 + r.next() * 0.04;
    const px = x + ins, py = y + ins, pw = 1 - ins * 2, ph = 1 - ins * 2;
    shadow(px, py, pw, ph, 0.04, 0.07);
    // Garten
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(x + 0.04, y + 0.04, 0.92, 0.92);
    const roof = b.color;
    const along = (b.dir === 0 || b.dir === 2); // First parallel zur Straße
    g.fillStyle = roof;
    g.beginPath(); roundRectPath(g, px, py, pw, ph, 0.03); g.fill();
    g.fillStyle = shade(roof, -0.18);
    if (along) g.fillRect(px, py + ph / 2, pw, ph / 2); else g.fillRect(px + pw / 2, py, pw / 2, ph);
    g.strokeStyle = shade(roof, -0.32); g.lineWidth = 0.025;
    g.beginPath();
    if (along) { g.moveTo(px + 0.02, py + ph / 2); g.lineTo(px + pw - 0.02, py + ph / 2); } else { g.moveTo(px + pw / 2, py + 0.02); g.lineTo(px + pw / 2, py + ph - 0.02); }
    g.stroke();
    if (r.next() < 0.6) { g.fillStyle = '#7c6f64'; g.fillRect(px + pw * 0.68, py + ph * 0.15, 0.08, 0.08); }
    if (r.next() < 0.35) { g.fillStyle = '#334155'; g.fillRect(px + pw * 0.15, py + ph * 0.6, 0.16, 0.1); g.fillStyle = '#93c5fd'; g.fillRect(px + pw * 0.16, py + ph * 0.61, 0.14, 0.08); }
  } else if (t === 'apartment') {
    const px = x + 0.08, py = y + 0.08, pw = 0.84, ph = 0.84;
    shadow(px, py, pw, ph, 0.03, 0.12);
    g.fillStyle = shade(b.color, 0.25);
    g.beginPath(); roundRectPath(g, px, py, pw, ph, 0.03); g.fill();
    g.fillStyle = shade(b.color, 0.05);
    g.fillRect(px + 0.05, py + 0.05, pw - 0.1, ph - 0.1);
    g.fillStyle = '#e5e7eb';
    for (let k = 0; k < 3; k++) g.fillRect(px + 0.12 + r.next() * 0.5, py + 0.12 + r.next() * 0.5, 0.1, 0.08);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(px + 0.05, py + 0.05, pw - 0.1, 0.04);
  } else if (t === 'tower') {
    const px = x + 0.18, py = y + 0.18, pw = bw - 0.36, ph = bh - 0.36;
    g.fillStyle = 'rgba(30,40,30,0.25)';
    g.beginPath(); g.moveTo(px + pw, py); g.lineTo(px + pw + 0.35, py + 0.45); g.lineTo(px + pw + 0.35, py + ph + 0.45); g.lineTo(px + 0.35, py + ph + 0.45); g.lineTo(px, py + ph); g.closePath(); g.fill();
    g.fillStyle = '#d4d8de';
    g.beginPath(); roundRectPath(g, px, py, pw, ph, 0.05); g.fill();
    g.fillStyle = shade(b.color, 0.1);
    g.fillRect(px + 0.1, py + 0.1, pw - 0.2, ph - 0.2);
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 0.02;
    g.beginPath(); for (let k = 1; k < 5; k++) { g.moveTo(px + 0.1 + k * (pw - 0.2) / 5, py + 0.1); g.lineTo(px + 0.1 + k * (pw - 0.2) / 5, py + ph - 0.1); } g.stroke();
    g.fillStyle = '#94a3b8'; g.beginPath(); g.arc(px + pw / 2, py + ph / 2, 0.22, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e2e8f0'; g.font = '0.3px sans-serif';
  } else if (t === 'office') {
    const px = x + 0.12, py = y + 0.12, pw = bw - 0.24, ph = bh - 0.24;
    g.fillStyle = 'rgba(30,40,30,0.25)';
    g.beginPath(); roundRectPath(g, px + 0.18, py + 0.24, pw, ph, 0.05); g.fill();
    g.fillStyle = '#cbd5e1';
    g.beginPath(); roundRectPath(g, px, py, pw, ph, 0.05); g.fill();
    g.fillStyle = b.color;
    g.fillRect(px + 0.07, py + 0.07, pw - 0.14, ph - 0.14);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 0.02;
    g.beginPath();
    for (let k = 1; k < 6; k++) { g.moveTo(px + 0.07, py + 0.07 + k * (ph - 0.14) / 6); g.lineTo(px + pw - 0.07, py + 0.07 + k * (ph - 0.14) / 6); }
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.beginPath(); g.moveTo(px + 0.07, py + 0.07); g.lineTo(px + pw * 0.55, py + 0.07); g.lineTo(px + 0.07, py + ph * 0.55); g.closePath(); g.fill();
    g.fillStyle = '#94a3b8'; g.fillRect(px + pw * 0.6, py + ph * 0.55, 0.3, 0.25);
    g.fillStyle = '#64748b'; g.fillRect(px + pw * 0.64, py + ph * 0.6, 0.08, 0.08); g.fillRect(px + pw * 0.75, py + ph * 0.6, 0.08, 0.08);
  } else if (t === 'shop') {
    const px = x + 0.1, py = y + 0.1, pw = bw - 0.2, ph = bh - 0.2;
    shadow(px, py, pw, ph, 0.04, 0.09);
    g.fillStyle = '#f1ece2';
    g.beginPath(); roundRectPath(g, px, py, pw, ph, 0.04); g.fill();
    g.fillStyle = b.color;
    g.fillRect(px + 0.06, py + 0.06, pw - 0.12, ph - 0.12);
    // Markise zur Straße
    const stripe = (sx, sy, sw, sh, vert) => {
      const n = 8;
      for (let k = 0; k < n; k++) {
        g.fillStyle = k % 2 ? '#ffffff' : shade(b.color, -0.25);
        if (vert) g.fillRect(sx, sy + k * sh / n, sw, sh / n); else g.fillRect(sx + k * sw / n, sy, sw / n, sh);
      }
    };
    if (b.dir === 2) stripe(px, py + ph - 0.14, pw, 0.14, false);
    else if (b.dir === 0) stripe(px, py, pw, 0.14, false);
    else if (b.dir === 1) stripe(px + pw - 0.14, py, 0.14, ph, true);
    else stripe(px, py, 0.14, ph, true);
    g.fillStyle = '#e5e7eb'; g.fillRect(px + pw * 0.3, py + ph * 0.35, 0.18, 0.14);
  } else if (t === 'industry') {
    const px = x + 0.1, py = y + 0.1, pw = bw - 0.2, ph = bh - 0.2;
    shadow(px, py, pw, ph, 0.03, 0.12);
    g.fillStyle = '#9aa3ad';
    g.beginPath(); roundRectPath(g, px, py, pw, ph, 0.03); g.fill();
    // Sheddach
    for (let k = 0; k < 5; k++) {
      const sy = py + 0.1 + k * (ph - 0.2) / 5;
      g.fillStyle = '#b8c0c8'; g.fillRect(px + 0.08, sy, pw * 0.6, (ph - 0.2) / 10);
      g.fillStyle = '#7dd3fc'; g.fillRect(px + 0.08, sy + (ph - 0.2) / 10, pw * 0.6, (ph - 0.2) / 20);
    }
    // Schornstein
    g.fillStyle = '#7c2d12'; g.beginPath(); g.arc(x + 1.55, y + 0.4, 0.13, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#292524'; g.beginPath(); g.arc(x + 1.55, y + 0.4, 0.07, 0, Math.PI * 2); g.fill();
    // Container
    const cc = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b'];
    for (let k = 0; k < 3; k++) { g.fillStyle = cc[(b.seed + k) % 4]; g.fillRect(x + 1.32 + (k % 2) * 0.2, y + 0.9 + k * 0.22, 0.3, 0.16); }
  } else if (t === 'mall') {
    const px = x + 0.1, py = y + 0.1, pw = bw - 0.2, ph = bh - 0.2;
    // Parkplatz
    g.fillStyle = '#9ca3af'; g.fillRect(x + 0.05, y + 0.05, bw - 0.1, bh - 0.1);
    g.strokeStyle = '#f3f4f6'; g.lineWidth = 0.02;
    g.beginPath(); for (let k = 0; k < 10; k++) { g.moveTo(x + 0.2 + k * 0.27, y + bh - 0.6); g.lineTo(x + 0.2 + k * 0.27, y + bh - 0.2); } g.stroke();
    for (let k = 0; k < 7; k++) if (r.next() < 0.7) { g.fillStyle = CAR_COLORS[Math.floor(r.next() * CAR_COLORS.length)]; g.fillRect(x + 0.25 + k * 0.38, y + bh - 0.55, 0.14, 0.26); }
    g.fillStyle = 'rgba(30,40,30,0.25)'; g.fillRect(px + 0.15, py + 0.2, pw, ph * 0.55);
    g.fillStyle = '#e5e1d8'; g.beginPath(); roundRectPath(g, px, py, pw, ph * 0.55, 0.06); g.fill();
    g.fillStyle = b.color; g.fillRect(px + 0.1, py + 0.1, pw - 0.2, ph * 0.55 - 0.2);
    g.fillStyle = '#bae6fd'; for (let k = 0; k < 4; k++) g.fillRect(px + 0.3 + k * 0.6, py + 0.25, 0.35, 0.2);
  } else if (t === 'hospital') {
    const px = x + 0.1, py = y + 0.1, pw = bw - 0.2, ph = bh - 0.2;
    shadow(px, py, pw, ph, 0.05, 0.15);
    g.fillStyle = '#f8fafc'; g.beginPath(); roundRectPath(g, px, py, pw, ph, 0.05); g.fill();
    g.fillStyle = '#e2e8f0'; g.fillRect(px + 0.08, py + 0.08, pw - 0.16, ph - 0.16);
    g.fillStyle = '#dc2626';
    g.fillRect(px + pw * 0.5 - 0.08, py + ph * 0.5 - 0.28, 0.16, 0.56);
    g.fillRect(px + pw * 0.5 - 0.28, py + ph * 0.5 - 0.08, 0.56, 0.16);
    g.strokeStyle = '#94a3b8'; g.lineWidth = 0.03;
    g.beginPath(); g.arc(px + pw - 0.3, py + 0.3, 0.18, 0, Math.PI * 2); g.stroke();
  } else if (t === 'firestation') {
    const px = x + 0.08, py = y + 0.1, pw = bw - 0.16, ph = bh - 0.2;
    shadow(px, py, pw, ph, 0.04, 0.1);
    g.fillStyle = '#b91c1c'; g.beginPath(); roundRectPath(g, px, py, pw, ph, 0.04); g.fill();
    g.fillStyle = '#dc2626'; g.fillRect(px + 0.06, py + 0.06, pw - 0.12, ph - 0.12);
    g.fillStyle = '#fef2f2';
    for (let k = 0; k < 3; k++) g.fillRect(px + 0.2 + k * 0.5, py + ph * 0.35, 0.3, 0.3);
  } else if (t === 'stadium') {
    const cx = x + 1.5, cy = y + 1.5;
    g.fillStyle = 'rgba(30,40,30,0.25)';
    g.beginPath(); g.ellipse(cx + 0.15, cy + 0.2, 1.42, 1.32, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#cbd5e1'; g.beginPath(); g.ellipse(cx, cy, 1.42, 1.32, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#94a3b8'; g.beginPath(); g.ellipse(cx, cy, 1.25, 1.12, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4d9a4a'; g.fillRect(cx - 0.85, cy - 0.6, 1.7, 1.2);
    g.fillStyle = '#5aa857'; for (let k = 0; k < 6; k += 2) g.fillRect(cx - 0.85 + k * 0.283, cy - 0.6, 0.283, 1.2);
    g.strokeStyle = '#f8fafc'; g.lineWidth = 0.025;
    g.strokeRect(cx - 0.8, cy - 0.55, 1.6, 1.1);
    g.beginPath(); g.moveTo(cx, cy - 0.55); g.lineTo(cx, cy + 0.55); g.stroke();
    g.beginPath(); g.arc(cx, cy, 0.16, 0, Math.PI * 2); g.stroke();
  }
}

function drawGate(g, w, b) {
  // Straße, die aus der Karte hinausführt
  const x = b.x, y = b.y, dir = b.dir;
  const cx = x + 0.5, cy = y + 0.5;
  g.fillStyle = PAL.curb;
  g.beginPath();
  if (DX[dir]) g.rect(x - 0.5, cy - 0.39, 2, 0.78); else g.rect(cx - 0.39, y - 0.5, 0.78, 2);
  g.fill();
  g.fillStyle = PAL.asphalt;
  g.beginPath();
  if (DX[dir]) g.rect(x - 0.5, cy - 0.32, 2, 0.64); else g.rect(cx - 0.32, y - 0.5, 0.64, 2);
  g.fill();
  g.strokeStyle = PAL.mark; g.lineWidth = 0.035; g.setLineDash([0.13, 0.12]);
  g.beginPath();
  if (DX[dir]) { g.moveTo(x - 0.5, cy); g.lineTo(x + 1, cy); } else { g.moveTo(cx, y - 0.5); g.lineTo(cx, y + 1); }
  g.stroke(); g.setLineDash([]);
  // Ortsschild (gelb mit schwarzem Rand)
  const r = (dir + 1) & 3;
  const sx = cx + DX[r] * 0.47, sy = cy + DY[r] * 0.47;
  g.fillStyle = '#f2c200'; g.fillRect(sx - 0.14, sy - 0.09, 0.28, 0.18);
  g.strokeStyle = '#111'; g.lineWidth = 0.02; g.strokeRect(sx - 0.12, sy - 0.07, 0.24, 0.14);
}

// ---- Fahrzeugzeichnung ------------------------------------------------------------
function drawCar(ctx, x, y, a, vt, color, o) {
  const L = vt.len, Wd = vt.wid;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  if (o.alpha !== undefined && o.alpha < 1) ctx.globalAlpha = o.alpha;
  // Schatten
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); roundRectPath(ctx, -L / 2 + 0.03, -Wd / 2 + 0.035, L, Wd, 0.04); ctx.fill();
  const type = vt === VT.truck ? 'truck' : vt === VT.bus ? 'bus' : vt === VT.van ? 'van' : vt === VT.ambulance ? 'amb' : vt === VT.firetruck ? 'fire' : 'car';
  if (o.wreck) ctx.globalAlpha = 0.85;
  if (type === 'truck') {
    ctx.fillStyle = '#e5e7eb';
    ctx.beginPath(); roundRectPath(ctx, -L / 2, -Wd / 2, L * 0.7, Wd, 0.02); ctx.fill();
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 0.01; ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath(); roundRectPath(ctx, L / 2 - L * 0.27, -Wd / 2, L * 0.27, Wd, 0.04); ctx.fill();
    ctx.fillStyle = '#1e293b'; ctx.fillRect(L / 2 - 0.05, -Wd / 2 + 0.03, 0.03, Wd - 0.06);
  } else if (type === 'bus') {
    ctx.fillStyle = color;
    ctx.beginPath(); roundRectPath(ctx, -L / 2, -Wd / 2, L, Wd, 0.05); ctx.fill();
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(-L / 2 + 0.05, -Wd / 2 + 0.035, L - 0.1, Wd - 0.07);
    ctx.fillStyle = '#1e3a5f';
    for (let k = 0; k < 6; k++) ctx.fillRect(-L / 2 + 0.07 + k * (L - 0.14) / 6, -Wd / 2 + 0.01, (L - 0.14) / 6 - 0.015, 0.025);
    for (let k = 0; k < 6; k++) ctx.fillRect(-L / 2 + 0.07 + k * (L - 0.14) / 6, Wd / 2 - 0.035, (L - 0.14) / 6 - 0.015, 0.025);
    ctx.fillStyle = '#1e293b'; ctx.fillRect(L / 2 - 0.04, -Wd / 2 + 0.03, 0.025, Wd - 0.06);
  } else if (type === 'amb' || type === 'fire') {
    ctx.fillStyle = type === 'amb' ? '#f8fafc' : '#dc2626';
    ctx.beginPath(); roundRectPath(ctx, -L / 2, -Wd / 2, L, Wd, 0.04); ctx.fill();
    if (type === 'amb') { ctx.fillStyle = '#ef4444'; ctx.fillRect(-L / 2, -0.015, L * 0.75, 0.03); ctx.fillStyle = '#f97316'; ctx.fillRect(-L / 2 + 0.02, -Wd / 2, L * 0.6, 0.02); }
    else { ctx.fillStyle = '#d1d5db'; ctx.fillRect(-L / 2 + 0.05, -0.03, L * 0.65, 0.06); ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 0.01; ctx.beginPath(); for (let k = 0; k < 5; k++) { ctx.moveTo(-L / 2 + 0.07 + k * 0.06, -0.03); ctx.lineTo(-L / 2 + 0.07 + k * 0.06, 0.03); } ctx.stroke(); }
    ctx.fillStyle = '#1e293b'; ctx.fillRect(L / 2 - 0.08, -Wd / 2 + 0.025, 0.04, Wd - 0.05);
    if (o.siren) {
      const on = Math.floor((o.t || 0) * 6) % 2;
      ctx.fillStyle = on ? '#3b82f6' : '#bfdbfe'; ctx.fillRect(L / 2 - 0.13, -Wd / 2 + 0.02, 0.04, 0.04);
      ctx.fillStyle = on ? '#bfdbfe' : '#3b82f6'; ctx.fillRect(L / 2 - 0.13, Wd / 2 - 0.06, 0.04, 0.04);
    }
  } else {
    ctx.fillStyle = color;
    ctx.beginPath(); roundRectPath(ctx, -L / 2, -Wd / 2, L, Wd, type === 'van' ? 0.03 : 0.05); ctx.fill();
    // Dach
    ctx.fillStyle = shade(color === '#ffffff' ? '#e5e7eb' : color, -0.18);
    if (type === 'van') ctx.fillRect(-L / 2 + 0.03, -Wd / 2 + 0.025, L * 0.62, Wd - 0.05);
    else ctx.fillRect(-L * 0.18, -Wd / 2 + 0.022, L * 0.42, Wd - 0.044);
    // Scheiben
    ctx.fillStyle = '#26364d';
    ctx.fillRect(L * 0.24, -Wd / 2 + 0.025, 0.045, Wd - 0.05);
    if (type !== 'van') ctx.fillRect(-L * 0.28, -Wd / 2 + 0.03, 0.03, Wd - 0.06);
  }
  if (o.wreck) {
    ctx.strokeStyle = '#111'; ctx.lineWidth = 0.02;
    ctx.beginPath(); ctx.moveTo(L * 0.2, -Wd / 2); ctx.lineTo(L * 0.4, 0); ctx.lineTo(L * 0.15, Wd / 2); ctx.stroke();
  } else {
    // Bremslichter
    if (o.brake) { ctx.fillStyle = '#ef4444'; ctx.fillRect(-L / 2 - 0.005, -Wd / 2 + 0.01, 0.025, 0.035); ctx.fillRect(-L / 2 - 0.005, Wd / 2 - 0.045, 0.025, 0.035); }
    // Blinker
    if (o.blink && Math.floor((o.t || 0) * 3 + (o.id || 0) * 0.37) % 2) {
      ctx.fillStyle = '#fb923c';
      const sy = o.blink > 0 ? Wd / 2 - 0.03 : -Wd / 2 - 0.005;
      ctx.fillRect(L / 2 - 0.035, sy, 0.035, 0.035);
      ctx.fillRect(-L / 2, sy, 0.03, 0.035);
    }
    // Scheinwerfer
    ctx.fillStyle = o.night > 0.1 ? '#fff7d6' : '#fde68a';
    ctx.fillRect(L / 2 - 0.02, -Wd / 2 + 0.015, 0.02, 0.03); ctx.fillRect(L / 2 - 0.02, Wd / 2 - 0.045, 0.02, 0.03);
  }
  ctx.restore();
}
