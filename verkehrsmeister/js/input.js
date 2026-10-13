'use strict';
// ---------------------------------------------------------------------------
// Eingabe: Maus, Touch, Tastatur – Werkzeuge und Kamera
// ---------------------------------------------------------------------------

class Input {
  constructor(app, canvas) {
    this.app = app;
    this.cv = canvas;
    this.pointers = new Map();
    this.drag = null;       // {kind:'pan'|'road'|'bulldoze'|'maybe', ...}
    this.keys = new Set();
    this.pinch = null;
    this.bind();
  }

  get game() { return this.app.game; }
  get ui() { return this.app.ui; }
  get r() { return this.app.renderer; }

  bind() {
    const cv = this.cv;
    cv.addEventListener('pointerdown', e => this.down(e));
    cv.addEventListener('pointermove', e => this.move(e));
    cv.addEventListener('pointerup', e => this.up(e));
    cv.addEventListener('pointercancel', e => this.cancel(e));
    cv.addEventListener('pointerleave', () => { if (!this.drag) { this.r.hover = -1; this.ui.hideCostTip(); } });
    cv.addEventListener('wheel', e => { e.preventDefault(); if (!this.app.inGame) return; const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)); this.r.zoomAt(e.offsetX, e.offsetY, f); }, { passive: false });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => this.key(e));
    window.addEventListener('keyup', e => { this.keys.delete(e.key.toLowerCase()); this.keyUpS(e); });
    window.addEventListener('blur', () => this.keys.clear());
  }

  tileAt(e) {
    const g = this.game;
    if (!g) return -1;
    const p = this.r.toWorld(e.offsetX, e.offsetY);
    const x = Math.floor(p.x), y = Math.floor(p.y);
    return g.world.inb(x, y) ? g.world.idx(x, y) : -1;
  }

  down(e) {
    AUDIO.init(); AUDIO.resume();
    if (!this.app.inGame) return;
    this.cv.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (this.pointers.size === 2) {
      // Zwei Finger: Zoomen und Verschieben, laufende Aktion abbrechen
      this.abortDrag();
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      return;
    }
    const ui = this.ui, g = this.game;
    if (e.button === 1 || e.button === 2) {
      if (e.button === 2 && ui.tool === 'place') { ui.placeDir = (ui.placeDir + 1) & 3; AUDIO.play('click'); return; }
      if (e.button === 2 && ui.tool === 'busline' && ui.lineDraft.length) { ui.lineDraft.pop(); return; }
      this.drag = { kind: 'pan', sx: e.offsetX, sy: e.offsetY, cx: this.r.cam.x, cy: this.r.cam.y, moved: false, button: e.button };
      return;
    }
    const t = this.tileAt(e);
    const tool = ui.tool;
    if (tool === 'road' || tool === 'oneway' || tool === 'highway') {
      if (t < 0) return;
      this.drag = { kind: 'road', path: [t], tool };
      this.updateRoadPreview(e);
    } else if (tool === 'bulldoze') {
      if (t < 0) return;
      this.drag = { kind: 'bulldoze', path: [t], set: new Set([t]) };
      this.r.preview = { tiles: [t], ok: true, valid: 1, tool: 'bulldoze' };
    } else {
      this.drag = { kind: 'maybe', sx: e.offsetX, sy: e.offsetY, cx: this.r.cam.x, cy: this.r.cam.y, tile: t, wx: this.r.toWorld(e.offsetX, e.offsetY) };
    }
    void g;
  }

  move(e) {
    if (!this.app.inGame) return;
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      if (this.pinch.d > 0) this.r.zoomAt(cx, cy, d / this.pinch.d);
      this.r.cam.x -= (cx - this.pinch.cx) / this.r.cam.z;
      this.r.cam.y -= (cy - this.pinch.cy) / this.r.cam.z;
      this.r.clampCam();
      this.pinch = { d, cx, cy };
      return;
    }
    const t = this.tileAt(e);
    this.r.hover = t;
    const d = this.drag;
    if (!d) { this.hoverInfo(e, t); return; }
    if (d.kind === 'pan' || d.kind === 'maybe') {
      const dx = e.offsetX - d.sx, dy = e.offsetY - d.sy;
      if (d.kind === 'maybe' && Math.hypot(dx, dy) > 7) d.kind = 'pan';
      if (d.kind === 'pan') {
        d.moved = true;
        this.r.cam.x = d.cx - dx / this.r.cam.z;
        this.r.cam.y = d.cy - dy / this.r.cam.z;
        this.r.clampCam();
        this.app.follow = null;
      }
      return;
    }
    if (t < 0) return;
    if (d.kind === 'road') {
      this.extendPath(d.path, t);
      this.updateRoadPreview(e);
    } else if (d.kind === 'bulldoze') {
      const last = d.path[d.path.length - 1];
      for (const k of this.line(last, t)) if (!d.set.has(k)) { d.set.add(k); d.path.push(k); }
      if (d.path[d.path.length - 1] !== t) d.path.push(t);
      this.r.preview = { tiles: [...d.set], ok: true, valid: d.set.size, tool: 'bulldoze' };
      const g = this.game;
      let refund = 0;
      for (const i of d.set) if (g.world.road[i]) refund += g.world.roadValue(i) * CFG.refund;
      this.ui.showCostTip(e.offsetX, e.offsetY, refund ? 'Abriss · +' + fmtMoney(refund) : 'Abriss', false);
    }
  }

  up(e) {
    if (!this.app.inGame) return;
    this.pointers.delete(e.pointerId);
    if (this.pinch) { if (this.pointers.size < 2) this.pinch = null; this.drag = null; return; }
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    const g = this.game, ui = this.ui;
    if (d.kind === 'road') {
      if (d.path.length >= 2) g.buildRoad(d.path, d.tool);
      else if (d.path.length === 1 && g.world.road[d.path[0]] && d.tool !== 'oneway') g.buildRoad(d.path, d.tool);
      else ui.flashHint('Halte die Maustaste gedrückt und ziehe von Feld zu Feld, um eine Straße zu bauen.');
      this.r.preview = null;
      ui.hideCostTip();
      ui.tutCheck();
    } else if (d.kind === 'bulldoze') {
      g.bulldoze(d.path);
      this.r.preview = null;
      ui.hideCostTip();
      if (this.r.selected && this.r.selected.kind === 'tile' && !g.world.road[this.r.selected.i]) ui.select(null);
    } else if (d.kind === 'maybe') {
      this.click(d.tile, d.wx, e);
    } else if (d.kind === 'pan' && !d.moved && d.button === 2) {
      // Rechtsklick ohne Ziehen: Werkzeug abbrechen
      if (ui.tool !== 'inspect') ui.setTool('inspect');
    }
  }

  cancel(e) {
    this.pointers.delete(e.pointerId);
    this.pinch = null;
    this.abortDrag();
  }

  abortDrag() {
    this.drag = null;
    this.r.preview = null;
    this.ui.hideCostTip();
  }

  // Klick mit Werkzeug
  click(t, wp, e) {
    const g = this.game, ui = this.ui, w = g.world;
    const tool = ui.tool;
    if (tool === 'inspect') { this.selectAt(t, wp); return; }
    if (t < 0) return;
    if (tool === 'light' || tool === 'priority' || tool === 'roundabout') {
      const J = w.jc[t];
      if (!J) { g.notify('Klicke auf eine Kreuzung (mindestens drei Straßenarme treffen sich).', 'warn'); AUDIO.play('error'); return; }
      if (tool === 'priority' && J.type === 'priority') { J.cycleMain(); w.markDirty(t); g.onWorldEdit([t]); AUDIO.play('click'); }
      else if (J.type !== tool) g.setControl(t, tool);
      ui.select({ kind: 'tile', i: t });
      return;
    }
    if (tool === 'stop') {
      if (g.city.stops.has(t)) { ui.select({ kind: 'tile', i: t }); return; }
      if (!w.road[t]) { g.notify('Haltestellen gehören auf eine Straße.', 'warn'); AUDIO.play('error'); return; }
      if (g.placeStop(t)) ui.select({ kind: 'tile', i: t });
      return;
    }
    if (tool === 'busline') {
      if (!g.city.stops.has(t)) { g.notify('Klicke auf Haltestellen (gelbe Schilder). Setze sie vorher mit dem Haltestellen-Werkzeug (B).', 'warn'); AUDIO.play('error'); return; }
      const dr = ui.lineDraft;
      if (dr.length >= 2 && t === dr[0]) { this.finishLine(); return; }
      if (dr[dr.length - 1] === t) return;
      dr.push(t);
      AUDIO.play('click');
      return;
    }
    if (tool === 'place') {
      const b = g.placeBuildingManual(ui.placeType, w.tx(t), w.ty(t), ui.placeDir);
      if (!b) { AUDIO.play('error'); }
      return;
    }
    void e;
  }

  finishLine() {
    const g = this.game, ui = this.ui;
    const dr = ui.lineDraft;
    if (dr.length < 2) { g.notify('Eine Linie braucht mindestens zwei Haltestellen.', 'warn'); return; }
    if (!g.canAfford(CFG.cost.bus)) { g.notify('Für die Linie brauchst du mindestens einen Bus (' + fmtMoney(CFG.cost.bus) + ').', 'danger'); AUDIO.play('error'); return; }
    const line = g.city.createLine(dr);
    g.city.addBus(line);
    ui.lineDraft = [];
    AUDIO.play('good');
    g.notify(line.name + ' eingerichtet. Im Info-Fenster kannst du weitere Busse kaufen.', 'good', line.stops[0]);
    ui.setTool('inspect', true);
    ui.select({ kind: 'line', line });
  }

  selectAt(t, wp) {
    const g = this.game, ui = this.ui, w = g.world;
    // Fahrzeug in der Nähe?
    let best = null, bd = 0.35 * 0.35;
    for (const v of g.traffic.vehicles) {
      const dd = dist2(v.x, v.y, wp.x, wp.y);
      if (dd < bd) { bd = dd; best = v; }
    }
    if (best) { ui.select({ kind: 'vehicle', id: best.id }); AUDIO.play('click'); return; }
    if (t < 0) { ui.select(null); return; }
    if (w.bld[t] >= 0) { ui.select({ kind: 'building', b: w.buildings[w.bld[t]] }); AUDIO.play('click'); return; }
    if (w.road[t]) { ui.select({ kind: 'tile', i: t }); AUDIO.play('click'); return; }
    // Unfall auf Nachbarfeld (Wracks ragen hinein)
    ui.select(null);
  }

  // Hover: Kosten / Hinweise für Klickwerkzeuge
  hoverInfo(e, t) {
    const g = this.game, ui = this.ui;
    if (!g || t < 0) { ui.hideCostTip(); return; }
    const w = g.world;
    const tool = ui.tool;
    if (tool === 'light' || tool === 'priority' || tool === 'roundabout') {
      const J = w.jc[t];
      if (J) {
        const same = J.type === tool;
        ui.showCostTip(e.offsetX, e.offsetY, same ? (tool === 'priority' ? 'Hauptrichtung wechseln' : JTYPE_NAME[tool] + ' – Einstellungen') : JTYPE_NAME[tool] + ' · ' + fmtMoney(g.controlCost(tool)), !same && !g.canAfford(g.controlCost(tool)));
      } else ui.hideCostTip();
    } else if (tool === 'stop') {
      if (w.road[t] && !w.isJ[t] && w.road[t] !== 2 && !g.city.stops.has(t)) ui.showCostTip(e.offsetX, e.offsetY, 'Haltestelle · ' + fmtMoney(CFG.cost.stop), !g.canAfford(CFG.cost.stop));
      else ui.hideCostTip();
    } else if (tool === 'busline') {
      if (g.city.stops.has(t)) ui.showCostTip(e.offsetX, e.offsetY, ui.lineDraft.length >= 2 && ui.lineDraft[0] === t ? 'Linie abschließen' : 'Haltestelle „' + g.city.stops.get(t).name + '“', false);
      else ui.hideCostTip();
    } else if (tool === 'road' || tool === 'oneway' || tool === 'highway') {
      const info = w.roadBuildInfo(t, tool === 'highway' ? 2 : 1);
      if (!info.ok) ui.showCostTip(e.offsetX, e.offsetY, info.reason, true);
      else if (info.kind === 'bridge' || info.kind === 'tunnel') ui.showCostTip(e.offsetX, e.offsetY, (info.kind === 'bridge' ? 'Brücke' : 'Tunnel') + ' · ' + fmtMoney(info.cost) + '/Feld', false);
      else ui.hideCostTip();
    } else ui.hideCostTip();
  }

  // Pfad um Kachel t erweitern (4er-Nachbarschaft, Zurückziehen löscht)
  extendPath(path, t) {
    const w = this.game.world;
    let last = path[path.length - 1];
    if (t === last) return;
    if (path.length >= 2 && path[path.length - 2] === t) { path.pop(); return; }
    let guard = 0;
    while (last !== t && guard++ < 300) {
      const lx = w.tx(last), ly = w.ty(last), tx = w.tx(t), ty = w.ty(t);
      let nx = lx, ny = ly;
      // Richtung des letzten Segments beibehalten, wenn möglich
      const prev = path.length >= 2 ? path[path.length - 2] : -1;
      const horiz = prev >= 0 ? w.ty(prev) === ly : Math.abs(tx - lx) >= Math.abs(ty - ly);
      if ((horiz && tx !== lx) || ty === ly) nx += Math.sign(tx - lx); else ny += Math.sign(ty - ly);
      const n = w.idx(nx, ny);
      if (path.length >= 2 && path[path.length - 2] === n) path.pop(); else path.push(n);
      last = n;
      if (path.length > 400) break;
    }
  }

  line(a, b) {
    const w = this.game.world, out = [];
    let x0 = w.tx(a), y0 = w.ty(a);
    const x1 = w.tx(b), y1 = w.ty(b);
    let guard = 0;
    while ((x0 !== x1 || y0 !== y1) && guard++ < 300) {
      if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) x0 += Math.sign(x1 - x0); else y0 += Math.sign(y1 - y0);
      out.push(w.idx(x0, y0));
    }
    return out;
  }

  updateRoadPreview(e) {
    const d = this.drag, g = this.game;
    const plan = g.roadPlan(d.path, d.tool);
    this.r.preview = { tiles: d.path.slice(), ok: plan.valid === d.path.length && g.canAfford(plan.cost), valid: plan.valid, tool: d.tool };
    const n = new Set(d.path.slice(0, plan.valid)).size;
    let txt;
    if (plan.valid < d.path.length) txt = plan.reason;
    else {
      const extras = [];
      if (plan.kinds.includes('bridge')) extras.push('Brücke');
      if (plan.kinds.includes('tunnel')) extras.push('Tunnel');
      txt = n + (n === 1 ? ' Feld' : ' Felder') + (extras.length ? ' · ' + extras.join(' + ') : '') + ' · ' + (g.sandbox ? 'kostenlos' : fmtMoney(plan.cost));
    }
    this.ui.showCostTip(e.offsetX, e.offsetY, txt, !this.r.preview.ok);
  }

  // ---- Tastatur ----------------------------------------------------------------------
  key(e) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    const ui = this.ui;
    if (!this.app.inGame) return;
    if (k === 'escape') {
      if (ui.topModalClose()) return;
      if (this.drag) { this.abortDrag(); return; }
      if (ui.tool === 'busline' && ui.lineDraft.length) { ui.lineDraft = []; return; }
      if (ui.tool !== 'inspect') { ui.setTool('inspect'); return; }
      if (this.r.selected) { ui.select(null); return; }
      ui.showPause();
      return;
    }
    if (ui.hasModal()) return;
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); this.game.undo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    this.keys.add(k);
    if (k === ' ') { e.preventDefault(); ui.togglePause(); return; }
    if (k === '1') { ui.setSpeed(1); return; }
    if (k === '2') { ui.setSpeed(2); return; }
    if (k === '3') { ui.setSpeed(4); return; }
    if (k === 'h') { ui.toggleOverlay(); return; }
    if (k === 'm') { ui.toggleSound(); return; }
    if (k === 'enter' && ui.tool === 'busline') { this.finishLine(); return; }
    if (k === '+' || k === '=') { this.r.zoomAt(this.r.W / 2, this.r.H / 2, 1.2); return; }
    if (k === '-') { this.r.zoomAt(this.r.W / 2, this.r.H / 2, 1 / 1.2); return; }
    if (k === 's' && !this.keys.has('shift') && !['w', 'a', 'd'].some(x => this.keys.has(x)) && !e.repeat) {
      // S wird auch zum Scrollen verwendet: nur kurz tippen öffnet die Statistik
      this._sDown = performance.now();
      return;
    }
    const allowed = this.game.level.tools || [];
    for (const t of TOOLS) {
      if (t.key.toLowerCase() === k && allowed.includes(t.id)) { ui.setTool(t.id); return; }
    }
  }

  // Kamerabewegung per Tastatur (pro Frame)
  update(dt) {
    if (!this.app.inGame) return;
    const sp = 14 / Math.max(0.5, this.r.cam.z / 36) * dt;
    let dx = 0, dy = 0;
    const K = this.keys;
    if (K.has('arrowleft') || K.has('a')) dx -= 1;
    if (K.has('arrowright') || K.has('d')) dx += 1;
    if (K.has('arrowup') || K.has('w')) dy -= 1;
    if (K.has('arrowdown') || (K.has('s') && this._sDown && performance.now() - this._sDown > 180)) dy += 1;
    if (dx || dy) { this.r.cam.x += dx * sp; this.r.cam.y += dy * sp; this.r.clampCam(); this.app.follow = null; }
  }

  keyUpS(e) {
    if (e.key.toLowerCase() === 's' && this._sDown) {
      const held = performance.now() - this._sDown;
      this._sDown = 0;
      if (held < 180 && this.app.inGame && !this.ui.hasModal()) this.ui.showStats();
    }
  }
}
