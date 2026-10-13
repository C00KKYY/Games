'use strict';
// ---------------------------------------------------------------------------
// Start: verbindet Spiel, Darstellung, Oberfläche und Eingabe
// ---------------------------------------------------------------------------

class App {
  constructor() {
    this.cv = document.getElementById('view');
    this.renderer = new Renderer(this.cv);
    this.ui = new UI(this);
    this.input = new Input(this, this.cv);
    this.game = null;
    this.inGame = false;
    this.follow = null;
    this.errShown = false;
    this.hornT = 0;
    AUDIO.enabled = this.ui.settings.sound;
    AUDIO.volume = this.ui.settings.volume;
    window.addEventListener('resize', () => this.renderer.resize());
    this.last = performance.now();
    requestAnimationFrame(t => this.frame(t));
  }

  boot(data) {
    if (data && data.save) {
      const g = Game.fromSave(data.save);
      if (g) { this.beginGame(g, false); return; }
    }
    this.toMenu();
  }

  toMenu() {
    this.inGame = false;
    this.follow = null;
    this.startDemo();
    this.ui.showMenu();
  }

  startDemo() {
    const g = new Game({ level: DEMO_LEVEL });
    g.onNote = null;
    for (let k = 0; k < 500; k++) g.step(CFG.dt);
    this.game = g;
    this.renderer.setGame(g);
    this.renderer.overlay = 'none';
    this.renderer.selected = null;
    this.renderer.cam.z *= 1.35;
    this.demoT = 0;
  }

  wire(g) {
    g.onNote = n => this.ui.addNote(n);
    g.onEnd = info => { this.ui.showEnd(info); };
    g.onAchievement = a => this.ui.achievementToast(a);
    g.onAutosave = () => { if (this.ui.settings.autosave && !g.over) Store.set('vm_save_auto', g.serialize()); };
    g.onEdit = () => { this.ui.miniDirty = true; };
  }

  frameCamera(g) {
    const bs = g.world.buildings.filter(b => !b.dead && b.cat !== 'gate');
    if (!bs.length) return;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const b of bs) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
    const r = this.renderer;
    const pw = x1 - x0 + 6, ph = y1 - y0 + 6;
    const narrow = r.W < 760;
    const z = clamp(Math.min((r.W - (narrow ? 16 : 120)) / pw, (r.H - (narrow ? 200 : 140)) / ph), r.minZoom(), 56);
    r.centerOn((x0 + x1) / 2, (y0 + y1) / 2, z);
  }

  beginGame(g, intro) {
    this.ui.closeModals();
    this.game = g;
    this.inGame = true;
    this.follow = null;
    this.wire(g);
    this.renderer.setGame(g);
    this.renderer.overlay = 'none';
    this.renderer.selected = null;
    this.ui.enterGame(g);
    this.frameCamera(g);
    if (intro && g.mode === 'campaign') {
      g.paused = true;
      this.ui.showIntro(g, () => { g.paused = false; this.ui.updateHUD(); if (g.level.tutorial) this.ui.startTutorial(); });
    } else if (intro) {
      this.ui.toast(g.mode === 'sandbox' ? 'Freies Bauen' : 'Endlosmodus', g.mode === 'sandbox' ? 'Viel Spaß beim Planen! Geld spielt keine Rolle.' : 'Verbinde die Gebäude und halte die Stadt am Laufen.');
    }
  }

  startLevel(level) {
    const g = new Game({ level });
    this.beginGame(g, true);
  }

  startEndless(mapId, seed, sandbox) {
    const level = endlessLevel(mapId, seed, sandbox);
    const g = new Game({ level, seed });
    this.beginGame(g, true);
  }

  loadSlot(key) {
    const o = Store.get(key);
    if (!o) { this.ui.toast('Nicht gefunden', 'Dieser Spielstand existiert nicht mehr.', 'bad'); return; }
    let g = null;
    try { g = Game.fromSave(o); } catch (e) { console.error(e); }
    if (!g) { this.ui.toast('Fehler', 'Der Spielstand konnte nicht geladen werden.', 'bad'); return; }
    this.beginGame(g, false);
    g.paused = true;
    this.ui.toast('Spielstand geladen', g.level.name + ' · Tag ' + (g.dayIndex + 1) + '. Drücke Leertaste zum Fortsetzen.');
    this.ui.updateHUD();
  }

  frame(t) {
    const dt = Math.min(0.1, Math.max(0, (t - this.last) / 1000));
    this.last = t;
    try {
      const g = this.game;
      if (g) {
        g.tick(dt);
        g.fx.update(dt);
        this.input.update(dt);
        if (this.follow) {
          const v = g.traffic.byId.get(this.follow);
          if (v) { const c = this.renderer.cam; c.x += (v.x - c.x) * Math.min(1, dt * 4); c.y += (v.y - c.y) * Math.min(1, dt * 4); }
          else this.follow = null;
        }
        if (!this.inGame) {
          // Kamerafahrt durch die Demo-Stadt
          this.demoT += dt;
          const w = g.world, c = this.renderer.cam;
          c.x = w.w / 2 + Math.sin(this.demoT * 0.05) * w.w * 0.22;
          c.y = w.h / 2 + Math.cos(this.demoT * 0.037) * w.h * 0.18;
        } else if (!g.paused) {
          // Hupen bei Stau
          this.hornT -= dt;
          if (this.hornT <= 0) {
            this.hornT = 3 + Math.random() * 5;
            let stuck = 0;
            for (const v of g.traffic.vehicles) if (v.stuck > 12 && this.renderer.inView(v.x, v.y)) stuck++;
            if (stuck > 4 && Math.random() < 0.6) AUDIO.play('horn');
          }
        }
        AUDIO.setTraffic(this.inGame && !g.paused ? Math.min(1, g.traffic.vehicles.length / 220) : 0);
      }
      this.renderer.draw(dt);
      this.ui.update(dt);
    } catch (e) {
      console.error(e);
      if (!this.errShown) { this.errShown = true; this.ui.toast('Interner Fehler', String(e && e.message || e), 'bad'); }
    }
    requestAnimationFrame(tt => this.frame(tt));
  }
}

(function start() {
  const app = new App();
  window.VM_APP = app;
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) {
    try { hot.snapshot(() => (app.inGame && app.game && !app.game.over && app.game.mode !== 'demo') ? { save: app.game.serialize() } : {}); } catch (e) { /* optional */ }
  }
  const boot = data => app.boot(data || {});
  if (hot && hot.ready) hot.ready(boot); else boot(hot && hot.data ? hot.data : {});
})();
