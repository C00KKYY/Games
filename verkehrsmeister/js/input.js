'use strict';
// ---------------------------------------------------------------------------
// Bedienung: Maus, Touch, Tastatur → Bauen, Abreißen, Werkzeuge, Kamera
// ---------------------------------------------------------------------------

class Input {
  constructor(app, canvas) {
    this.app = app;
    this.cv = canvas;
    this.tool = 'road';
    this.drag = null;          // laufende Aktion
    this.pointers = new Map();
    this.gesture = null;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, inside: false };
    canvas.addEventListener('pointerdown', e => this.down(e));
    window.addEventListener('pointermove', e => this.move(e));
    window.addEventListener('pointerup', e => this.up(e));
    window.addEventListener('pointercancel', e => this.cancel(e));
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => this.wheel(e), { passive: false });
    canvas.addEventListener('pointerleave', () => { this.mouse.inside = false; if (this.app.scene) this.app.scene.hover = -1; });
    window.addEventListener('keydown', e => this.keydown(e));
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  get game() { return this.app.game; }
  get scene() { return this.app.scene; }

  setTool(t) {
    if (this.tool === t && t !== 'road') t = 'road';
    this.tool = t;
    this.cancelDrag();
    this.app.ui.onTool(t);
    AUDIO.play('tool');
  }

  // ---- Kachel-Hilfen -------------------------------------------------------------------
  tileAt(e) { return this.scene ? this.scene.pickTile(e.clientX - this.rect().left, e.clientY - this.rect().top) : -1; }
  rect() { return this._rect || (this._rect = this.cv.getBoundingClientRect()); }

  // Gebäudekacheln auf ihre Zufahrt abbilden
  snap(t, from) {
    const w = this.game.world;
    if (t < 0) return t;
    const b = w.bld[t] >= 0 ? w.buildings[w.bld[t]] : null;
    if (!b) return t;
    if (b.kind === 'house') return b.acc;
    if (from === undefined || from < 0) return b.acc;
    const d1 = Math.abs(w.tx(from) - w.tx(b.acc)) + Math.abs(w.ty(from) - w.ty(b.acc));
    const d2 = Math.abs(w.tx(from) - w.tx(b.acc2)) + Math.abs(w.ty(from) - w.ty(b.acc2));
    return d2 < d1 ? b.acc2 : b.acc;
  }

  extendPath(path, t) {
    const w = this.game.world;
    if (t < 0 || !path.length) return;
    const last = path[path.length - 1];
    if (t === last) return;
    const k = path.indexOf(t);
    if (k >= 0) { path.length = k + 1; return; }
    let x = w.tx(last), y = w.ty(last);
    const tx = w.tx(t), ty = w.ty(t);
    let guard = 0;
    while ((x !== tx || y !== ty) && guard++ < 80) {
      const dx = tx - x, dy = ty - y;
      // Hauptachse zuerst, aber nicht durch Gebäude
      let nx = x, ny = y;
      const first = Math.abs(dx) >= Math.abs(dy);
      if (first) nx += Math.sign(dx); else ny += Math.sign(dy);
      if (w.bld[w.idx(nx, ny)] >= 0 && (first ? dy : dx) !== 0) {
        nx = x; ny = y;
        if (first) ny += Math.sign(dy); else nx += Math.sign(dx);
      }
      x = nx; y = ny;
      const i = w.idx(x, y);
      const kk = path.indexOf(i);
      if (kk >= 0) path.length = kk + 1; else path.push(i);
      if (path.length > 70) break;
    }
  }

  // ---- Zeiger ----------------------------------------------------------------------------
  setMouse(e) { const r = this.rect(); this.mouse.x = e.clientX - r.left; this.mouse.y = e.clientY - r.top; }

  down(e) {
    if (!this.game) return;
    AUDIO.init(); AUDIO.resume();
    this._rect = null;
    this.setMouse(e);
    this.cv.setPointerCapture && this.cv.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (this.pointers.size >= 2) { this.cancelDrag(); this.startGesture(); return; }
    const t = this.tileAt(e);
    const sx = e.clientX, sy = e.clientY;
    if (e.button === 1 || (e.button === 0 && (e.shiftKey || e.altKey)) || this.tool === 'pan') { this.drag = { kind: 'pan', sx, sy, lx: sx, ly: sy }; return; }
    if (this.game.over || this.app.blocked()) return;
    if (e.button === 2 || this.tool === 'erase') { this.drag = { kind: 'erase', path: t >= 0 ? [t] : [], sx, sy, moved: false }; this.updatePreview(); return; }
    if (e.button !== 0) return;
    if (this.app.ui.targeting) { this.drag = { kind: 'target', t, sx, sy }; return; }
    if (this.tool === 'road') {
      const s = this.snap(t);
      this.drag = { kind: 'road', path: s >= 0 ? [s] : [], sx, sy, moved: false, start: t };
      this.updatePreview();
    } else if (this.tool === 'highway') {
      this.drag = { kind: 'highway', s: t, path: t >= 0 ? [t] : [], d: -1, sx, sy, moved: false };
      this.updatePreview();
    } else {
      this.drag = { kind: 'tool', t, sx, sy };
    }
  }

  move(e) {
    if (!this.game) return;
    const r = this.rect();
    this.mouse.x = e.clientX - r.left; this.mouse.y = e.clientY - r.top;
    this.mouse.inside = e.target === this.cv;
    const p = this.pointers.get(e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    if (this.gesture) { this.updateGesture(); return; }
    const t = this.tileAt(e);
    if (this.scene) {
      this.scene.hover = t;
      this.scene.hoverColor = this.hoverColor(t);
    }
    const D = this.drag;
    if (!D) { this.app.ui.hoverInfo(t, this.mouse); return; }
    if (D.kind === 'pan') {
      this.app.engine.rig.panPixels(e.clientX - D.lx, e.clientY - D.ly, this.app.engine.H);
      D.lx = e.clientX; D.ly = e.clientY;
      return;
    }
    if (Math.hypot(e.clientX - D.sx, e.clientY - D.sy) > 6) D.moved = true;
    if (D.kind === 'road') {
      if (!D.path.length) { const s = this.snap(t); if (s >= 0) D.path.push(s); }
      else this.extendPath(D.path, this.snap(t, D.path[D.path.length - 1]));
      this.updatePreview();
    } else if (D.kind === 'erase') {
      if (!D.path.length) { if (t >= 0) D.path.push(t); } else this.extendPath(D.path, t);
      this.updatePreview();
    } else if (D.kind === 'highway' && D.s >= 0 && t >= 0) {
      const w = this.game.world;
      const dx = w.tx(t) - w.tx(D.s), dy = w.ty(t) - w.ty(D.s);
      const path = [D.s];
      let d = -1;
      if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) d = dx > 0 ? 1 : 3;
      else if (dy !== 0) d = dy > 0 ? 2 : 0;
      if (d >= 0) {
        const n = Math.min(CFG.highwayMax + 1, Math.abs(d & 1 ? dx : dy));
        let g = D.s;
        for (let k = 0; k < n; k++) { g = w.gnb(g, d); if (g < 0) break; path.push(g); }
      }
      D.path = path; D.d = d;
      this.updatePreview();
    }
  }

  up(e) {
    if (!this.game) return;
    if (e.target === this.cv || this.pointers.has(e.pointerId)) this.setMouse(e);
    const had = this.pointers.has(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.gesture) { if (this.pointers.size < 2) this.gesture = null; return; }
    if (!had) return;
    const D = this.drag;
    this.drag = null;
    if (!D) return;
    const g = this.game;
    if (D.kind === 'pan') return;
    if (D.kind === 'target') { if (D.t >= 0) this.app.ui.pickTarget(D.t); this.clearPreview(); return; }
    if (D.kind === 'road') {
      if (!D.moved || D.path.length < 2) { this.clearPreview(); this.app.inspect(this.tileAt(e), this.mouse); return; }
      const res = g.buildPath(D.path);
      this.app.afterAction(res);
    } else if (D.kind === 'erase') {
      if (D.path.length) { if (g.erasePath(D.path)) AUDIO.play('erase'); }
    } else if (D.kind === 'highway') {
      if (D.d >= 0 && D.path.length >= 2) g.buildHighway(D.path, D.d);
      else if (!D.moved) this.app.inspect(this.tileAt(e), this.mouse);
    } else if (D.kind === 'tool') {
      if (D.t >= 0) {
        const tool = this.tool;
        if (g.useTool(tool, D.t)) {
          AUDIO.play(tool === 'police' ? 'police' : 'device');
          if (tool === 'police' && g.inv.police <= 0) this.setTool('road');
          else if (tool === 'light' && g.inv.lights <= 0) this.setTool('road');
          else if (tool === 'round' && g.inv.rounds <= 0) this.setTool('road');
        }
      }
    }
    this.clearPreview();
  }

  cancel(e) { this.pointers.delete(e.pointerId); if (this.pointers.size < 2) this.gesture = null; this.cancelDrag(); }

  cancelDrag() { this.drag = null; this.clearPreview(); }

  clearPreview() { if (this.scene) this.scene.preview = null; this.app.ui.costHint(null); }

  hoverColor(t) {
    const g = this.game;
    if (!g || t < 0) return '#ffffff';
    if (this.tool === 'light' || this.tool === 'round' || this.tool === 'police') return g.world.jc[t] ? '#22e06a' : '#ff4d4d';
    if (this.tool === 'erase') return '#ff6b5b';
    return '#ffffff';
  }

  updatePreview() {
    const D = this.drag, g = this.game, sc = this.scene;
    if (!D || !sc) return;
    if (D.kind === 'road') {
      if (D.path.length < 2) { sc.preview = { items: D.path.map(i => ({ i, kind: 'tool' })) }; this.app.ui.costHint(null); return; }
      const plan = g.planPath(D.path);
      sc.preview = plan;
      if (D.path.length !== D._lastLen) {
        if (D._lastLen && D.path.length > D._lastLen) AUDIO.play('click');
        D._lastLen = D.path.length;
      }
      this.app.ui.costHint(plan, this.mouse);
    } else if (D.kind === 'erase') {
      sc.preview = { items: D.path.map(i => ({ i, kind: 'erase' })) };
      this.app.ui.costHint({ erase: true, n: D.path.filter(i => g.world.road[i] || g.world.hasElev(i)).length }, this.mouse);
    } else if (D.kind === 'highway') {
      const w = g.world;
      const chk = D.path.length >= 2 ? w.highwayCheck(D.path, D.d) : { ok: false, reason: 'Ziehen: gerade Linie' };
      const items = D.path.map((i, k) => ({ i: (k === 0 || k === D.path.length - 1) ? i : i + w.n, kind: chk.ok ? 'highway' : (chk.bad === k ? 'bad' : 'highway') }));
      if (!chk.ok) for (const it of items) it.kind = 'bad';
      if (g.inv.highways <= 0) for (const it of items) it.kind = 'bad';
      sc.preview = { items };
      this.app.ui.costHint({ highway: true, ok: chk.ok && g.inv.highways > 0, reason: g.inv.highways <= 0 ? 'Keine Autobahn im Inventar' : chk.reason, n: Math.max(0, D.path.length - 2) }, this.mouse);
    }
  }

  // ---- Gesten (zwei Finger) ------------------------------------------------------------
  startGesture() {
    const P = [...this.pointers.values()];
    const a = P[0], b = P[1];
    this.gesture = { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) };
  }
  updateGesture() {
    const P = [...this.pointers.values()];
    if (P.length < 2) return;
    const a = P[0], b = P[1], G = this.gesture;
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
    const rig = this.app.engine.rig;
    rig.panPixels(cx - G.cx, cy - G.cy, this.app.engine.H);
    if (G.d > 10 && d > 10) rig.zoom(G.d / d);
    let da = ang - G.ang;
    if (da > Math.PI) da -= Math.PI * 2; else if (da < -Math.PI) da += Math.PI * 2;
    rig.rotate(-da);
    Object.assign(G, { cx, cy, d, ang });
  }

  wheel(e) {
    e.preventDefault();
    const rig = this.app.engine.rig;
    const lineMode = e.deltaMode !== 0;
    const pinch = e.ctrlKey;
    if (pinch) { rig.zoom(Math.exp(e.deltaY * 0.01)); return; }
    if (!lineMode && Math.abs(e.deltaY) < 40 && (Math.abs(e.deltaX) > 0 || e.deltaY % 1 !== 0)) {
      rig.panPixels(-e.deltaX, -e.deltaY, this.app.engine.H);
      return;
    }
    const dy = lineMode ? e.deltaY * 33 : e.deltaY;
    rig.zoom(Math.exp(clamp(dy, -200, 200) * 0.0012));
  }

  // ---- Tastatur ----------------------------------------------------------------------------
  keydown(e) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    const app = this.app;
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (this.game && !app.blocked() && this.game.undo()) AUDIO.play('undo'); return; }
    if (k === 'escape') { if (app.ui.onEscape()) return; this.setTool('road'); return; }
    if (app.blocked() && k !== ' ') return;
    this.keys.add(k);
    switch (k) {
      case ' ': e.preventDefault(); app.togglePause(); break;
      case 'tab': e.preventDefault(); app.cycleSpeed(); break;
      case '1': this.setTool('road'); break;
      case '2': this.setTool('light'); break;
      case '3': this.setTool('round'); break;
      case '4': this.setTool('highway'); break;
      case 'p': this.setTool('police'); break;
      case 'x': this.setTool('erase'); break;
      case 'q': app.engine.rig.rotate(Math.PI / 2); break;
      case 'e': app.engine.rig.rotate(-Math.PI / 2); break;
      case 'f': if (this.game) app.useStop(); break;
      case '+': case '=': app.engine.rig.zoom(0.85); break;
      case '-': app.engine.rig.zoom(1.18); break;
      default: break;
    }
  }

  // Kamera-Bewegung per Tastatur (jedes Bild)
  update(dt) {
    const rig = this.app.engine.rig;
    let dx = 0, dy = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy -= 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx += 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx -= 1;
    if (dx || dy) rig.panPixels(dx * 700 * dt, dy * 700 * dt, this.app.engine.H);
  }
}
