'use strict';
// ---------------------------------------------------------------------------
// App: Hauptschleife, Spielstart, Ereignisse an Szene/UI/Ton verteilen,
// Fortschritt (Rekorde, Medaillen, Rang, Tageschallenge)
// ---------------------------------------------------------------------------

const SAVE_KEY = 'verkehrsmeister3d.v1';

class App {
  constructor() {
    this.view = document.getElementById('view');
    this.ovCanvas = document.getElementById('overlay');
    this.engine = new Engine(this.view);
    this.overlay = new Overlay(this.ovCanvas, this.engine);
    this.ui = new UI(this, document.getElementById('ui'));
    this.input = new Input(this, this.view);
    this.game = null; this.scene = null;
    this.speed = 1; this.paused = false; this.acc = 0; this.slow = 0; this.slowT = 0;
    this.overT = -1;
    this.progress = Object.assign({ cities: {}, total: 0, daily: {}, tutDone: false, settings: {} }, Store.get(SAVE_KEY, {}));
    const st = this.progress.settings;
    AUDIO.enabled = st.sound !== false; AUDIO.musicOn = st.music !== false;
    this.ui.setSound(AUDIO.enabled);
    this.quality = st.quality === undefined ? 2 : st.quality;
    this.applyQuality();
    this.frameEma = 16; this.slowFrames = 0;
    this.mobile = matchMedia('(pointer: coarse)').matches;
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.last = performance.now();
    // Erststart: direkt ins erste Spiel mit Tutorial, sonst Menü
    if (!this.progress.tutDone && !Object.keys(this.progress.cities).length) {
      this.startCity('kleinbuettel', { tutorial: true });
    } else {
      this.startCity('kleinbuettel', { attract: true });
      this.ui.showMenu();
    }
    requestAnimationFrame(t => this.loop(t));
  }

  resize() {
    this.engine.resize();
    this.overlay.resize();
    this.input._rect = null;
  }

  saveProgress() { Store.set(SAVE_KEY, this.progress); }
  saveSettings() { this.progress.settings = { sound: AUDIO.enabled, music: AUDIO.musicOn, quality: this.quality }; this.saveProgress(); }

  applyQuality() {
    const r = this.engine.renderer;
    r.setPixelRatio(this.quality === 2 ? Math.min(2, window.devicePixelRatio || 1) : 1);
    r.shadowMap.enabled = this.quality >= 1;
    this.engine.sun.castShadow = this.quality >= 1;
    this.engine.sun.shadow.mapSize.set(this.quality === 2 ? 2048 : 1024, this.quality === 2 ? 2048 : 1024);
    if (this.engine.sun.shadow.map) { this.engine.sun.shadow.map.dispose(); this.engine.sun.shadow.map = null; }
    this.engine.resize();
  }
  toggleQuality() { this.quality = (this.quality + 2) % 3; this.applyQuality(); this.saveSettings(); }
  toggleSound() { AUDIO.init(); AUDIO.setEnabled(!AUDIO.enabled); this.ui.setSound(AUDIO.enabled); this.saveSettings(); }

  // ---- Städte, Freischaltungen, Rang -------------------------------------------------------
  cityUnlocked(c) {
    const u = c.unlock;
    if (!u) return true;
    const P = this.progress.cities;
    if (u.city) return !!P[u.city] && (P[u.city].best || 0) >= u.score;
    if (u.bronze) return Object.values(P).filter(p => p.medal >= 0).length >= u.bronze;
    return true;
  }
  unlockText(c) {
    const u = c.unlock;
    if (u.city) return u.score + ' Punkte in ' + CITIES.find(x => x.id === u.city).name;
    if (u.bronze) return u.bronze + '× Bronze';
    return '';
  }
  rankInfo() {
    const t = this.progress.total || 0;
    let k = 0;
    for (let i = 0; i < RANKS.length; i++) if (t >= RANKS[i].at) k = i;
    return { name: RANKS[k].name, idx: k, total: t, next: RANKS[k + 1] || null };
  }
  todayKey() { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  dailyInfo() {
    const key = this.todayKey();
    let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const open = CITIES.filter(c => this.cityUnlocked(c));
    const city = open[h % open.length];
    const mod = DAILY_MODS[(h >>> 4) % DAILY_MODS.length];
    const rec = this.progress.daily[key];
    return { key, seed: (h % 900000) + 1000, city, mod, best: rec ? rec.best : 0 };
  }

  startDaily() {
    const d = this.dailyInfo();
    this.startCity(d.city.id, { daily: d.mod.id, dailySeed: d.seed, dailyKey: d.key });
  }

  startCity(id, opts = {}) {
    const def = CITIES.find(c => c.id === id) || CITIES[0];
    if (this.scene) this.scene.dispose();
    const seed = opts.dailySeed || (opts.attract || opts.tutorial ? def.seed : (def.seed + Math.floor(Math.random() * 1e6)));
    this.game = new Game(def, { seed, daily: opts.daily, dailySeed: opts.dailySeed, dailyKey: opts.dailyKey, rank: this.rankInfo().idx, mobile: this.mobile, tutorial: !!opts.tutorial });
    this.scene = new Scene3D(this.engine, this.game);
    this.scene.onLand = b => AUDIO.play(b.kind === 'dest' ? 'dropBig' : 'drop');
    this.overlay.floats.length = 0;
    this.overlay.hint = null;
    this.ui.onGameStart(this.game);
    this.ui.showInspect(null);
    this.speed = 1; this.ui.setSpeed(1);
    this.setPaused(false);
    this.overT = -1;
    this.attract = !!opts.attract;
    this.auto = this.attract ? new AutoPlanner(this.game) : null;
    if (this.attract) this.game.city.noFail = true;
    if (opts.tutorial) this.ui.startTutorial();
    else if (!opts.attract) this.ui.toast(def.intro, 'flag', { ms: 6500 });
    if (opts.daily) { const m = DAILY_MODS.find(x => x.id === opts.daily); this.ui.toast('Tageschallenge: ' + m.name + ' – ' + m.desc, 'calendar', { ms: 6500 }); }
    this.input.setTool('road');
  }

  blocked() { return this.attract || this.ui.modalOpen || (this.game && this.game.phase === 'week' && !this.ui.targeting); }

  setPaused(p) { this.paused = p; this.ui.setPaused(p); }
  togglePause() { if (this.game && !this.game.over && !this.ui.modalOpen) this.setPaused(!this.paused); }
  cycleSpeed() { this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1; this.ui.setSpeed(this.speed); if (this.paused) this.setPaused(false); }
  useStop() { if (this.game && this.game.useStop()) AUDIO.play('tool'); }

  hudAction(a) {
    AUDIO.init(); AUDIO.resume();
    if (a === 'pause') this.togglePause();
    else if (a === 'speed') this.cycleSpeed();
    else if (a === 'sound') this.toggleSound();
    else if (a === 'menu') this.ui.showMenu();
  }

  focusTile(i) {
    const w = this.game.world;
    this.engine.rig.focus(w.tx(i) + 0.5, w.ty(i) + 0.5, Math.min(this.engine.rig.goal.dist, 18));
  }

  // Klick ohne Ziehen: Stau-Lupe
  inspect(t, mouse) {
    const g = this.game;
    if (!g || t < 0) { this.ui.showInspect(null); return; }
    const w = g.world;
    const p = this.scene.pickPoint(mouse.x, mouse.y);
    let best = null, bd = 0.5;
    if (p) for (const v of g.traffic.vehicles) {
      const d = Math.hypot(v.x - p.x, v.y - p.z);
      if (d < bd) { bd = d; best = v; }
    }
    if (best) { this.scene.selected = best; this.ui.showInspect({ v: best }); AUDIO.play('click'); return; }
    this.scene.selected = null;
    const b = w.bld[t] >= 0 ? w.buildings[w.bld[t]] : null;
    if (b && b.kind === 'dest') { this.ui.showInspect({ d: b }); AUDIO.play('click'); return; }
    if (b) { this.ui.showInspect({ h: b }); AUDIO.play('click'); return; }
    if (w.jc[t]) { this.ui.showInspect({ J: w.jc[t] }); AUDIO.play('click'); return; }
    // Klick auf ein Engstellen-Schild
    for (const pr of g.city.problems) if (pr.screen && Math.abs(mouse.x - pr.screen.x) < pr.screen.w / 2 && Math.abs(mouse.y - pr.screen.y) < pr.screen.h / 2) {
      if (pr.J) this.ui.showInspect({ J: pr.J }); else if (pr.b) this.ui.showInspect({ d: pr.b });
      else { const c = CAUSES[pr.cause]; if (c) this.ui.toast(c.title + ': ' + c.tip, 'works', { ms: 5000 }); }
      return;
    }
    this.ui.showInspect(null);
  }

  afterAction(res) { if (!res || !res.ok) return; }

  // ---- Ereignisse aus dem Spiel ------------------------------------------------------------
  handleFx(f) {
    const g = this.game, w = g.world, ov = this.overlay, ui = this.ui;
    this.scene.onFx(f);
    if (this.attract) return;   // Kulisse hinter dem Menü: keine Meldungen, keine Klänge
    switch (f.t) {
      case 'built': {
        const n = f.placed.length;
        f.placed.forEach((i, k) => setTimeout(() => AUDIO.play('klack', k), k * 35));
        if (!n) AUDIO.play('click');
        break;
      }
      case 'deny': AUDIO.play('deny'); if (f.i !== undefined && f.i >= 0) ov.float(w.tx(f.i) + 0.5, w.ty(f.i) + 0.5, 0.4, f.text, '#ff8a80', { size: 14, max: 1.8, rise: 18 }); break;
      case 'deliver': {
        AUDIO.play('pling', f.combo);
        const d = f.b;
        ov.float(d.cx, d.cy, (d._roof || 0.8) + 1.6, '+1', PALETTE[d.pi].hex, { size: 18 + Math.min(10, f.combo) });
        break;
      }
      case 'greenwave': ui.bigText('GRÜNE WELLE!', 'green'); AUDIO.play('greenwave'); break;
      case 'confetti': AUDIO.play('confetti'); ui.bigText(f.combo + 'er-Kombo!', 'combo', 1200); break;
      case 'honk': AUDIO.play('honk'); if (Math.random() < 0.5) ov.float(f.x, f.y, (f.z || 0) + 0.35, 'Hup!', '#ffffff', { size: 12, max: 0.9, rise: 14 }); break;
      case 'valve': AUDIO.play('valve'); ov.float(w.tx(f.i) + 0.5, w.ty(f.i) + 0.5, 0.5, 'Nach Ihnen!', '#bfe3ff', { size: 13, max: 1.4, rise: 16 }); break;
      case 'warn': {
        AUDIO.play('warn');
        const c = CAUSES[f.b.cause];
        ui.toast(PALETTE[f.b.pi].name + (c ? ': ' + c.title + ' – roter Ring läuft!' : ' ist überlastet – roter Ring läuft!'), 'flag', { cls: 'bad', at: f.b.acc, ms: 5000 });
        break;
      }
      case 'announce':
        if (f.spec.kind === 'dest' && g.time > 1) {
          const P = PALETTE[f.spec.pi];
          ui.toast(`Neues Ziel: ${P.name} – verbinde die ${HOUSE_ADJ[f.spec.pi]} Häuser`, 'flag', { at: w.idx(f.spec.x + 1, f.spec.y + 1), ms: 5500 });
        }
        break;
      case 'newday': AUDIO.play('newday'); break;
      case 'priority': AUDIO.play('priority'); ov.float(w.tx(f.tiles[0]) + 0.5, w.ty(f.tiles[0]) + 0.5, 0.5, 'Vorfahrt!', '#ffd23f', { size: 15 }); break;
      case 'police': ov.float(w.tx(f.i) + 0.5, w.ty(f.i) + 0.5, 0.6, 'Polizei regelt!', '#9cc3ff', { size: 15 }); break;
      case 'bell': if (this.isNear(f.line)) AUDIO.play('bell'); break;
      case 'horn': AUDIO.play('horn'); break;
      case 'toast': ui.toast(f.text, f.icon, { at: f.at }); if (f.icon === 'snow' || f.icon === 'works' || f.icon === 'fair') AUDIO.play('warn'); break;
      case 'works': if (f.phase === 'closed') ov.float(w.tx(f.i) + 0.5, w.ty(f.i) + 0.5, 0.4, 'Gesperrt!', '#ffb020', { size: 14, max: 1.6 }); break;
      case 'ambulance':
        if (f.phase === 'warn') { AUDIO.play('siren'); ui.bigText('NOTRUF!', 'red', 1500); }
        else if (f.phase === 'go') AUDIO.play('siren');
        else if (f.phase === 'saved') { AUDIO.play('saved'); ui.bigText('GERETTET! +25', 'green', 1800); this.slow = 0.35; this.slowT = 1.3; }
        else if (f.phase === 'late') { AUDIO.play('late'); ui.toast('Der Krankenwagen kam zu spät – die Klinik ist sauer.', 'amb', { cls: 'bad' }); }
        break;
      case 'weekend':
        AUDIO.play('week');
        this.engine.rig.goal.dist = Math.min(this.engine.rig.maxDist, this.engine.rig.goal.dist * 1.25 + 4);
        ui.queueWeek(f.summary, 900);
        break;
      case 'newweek':
        ui.bigText('Woche ' + g.week, 'week', 1500);
        if (f.grew) ui.toast('Die Ortsgrenze ist gewachsen – mehr Platz zum Bauen.', 'flag');
        break;
      case 'card': ui.toast('Karte: ' + f.card.name, f.card.icon); break;
      case 'refund': break;
      case 'gameover':
        AUDIO.play('gameover');
        ui.bigText('STILLSTAND!', 'red', 2400);
        this.slow = 0.25; this.slowT = 2;
        this.overT = 2.6;
        this.recordResult(f.report);
        break;
      case 'drop': break;
      case 'sfx': AUDIO.play(f.name); break;
      default: break;
    }
  }

  isNear(line) {
    const r = this.engine.rig.cur;
    if (r.dist > 40) return false;
    const p = line.vert ? Math.abs(r.x - line.at) : Math.abs(r.z - line.at);
    return p < 14;
  }

  recordResult(R) {
    const g = this.game, P = this.progress;
    if (this.attract) { this.lastProg = {}; return; }
    const id = g.def.id;
    const rec = P.cities[id] || (P.cities[id] = { best: 0, medal: -1, plays: 0, board: [] });
    rec.plays++;
    const prog = { newBest: R.score > rec.best };
    const beforeOpen = CITIES.filter(c => this.cityUnlocked(c)).map(c => c.id);
    rec.best = Math.max(rec.best, R.score);
    rec.medal = Math.max(rec.medal === undefined ? -1 : rec.medal, g.medal());
    const before = this.rankInfo().idx;
    P.total = (P.total || 0) + R.score;
    const after = this.rankInfo();
    if (after.idx > before) prog.rankUp = RANKS[after.idx];
    const nowOpen = CITIES.filter(c => this.cityUnlocked(c));
    const fresh = nowOpen.find(c => beforeOpen.indexOf(c.id) < 0);
    if (fresh) { prog.unlocked = fresh.name; prog.unlockedId = fresh.id; }
    const d = new Date();
    const entry = { score: R.score, week: R.week, date: pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.', t: Date.now() };
    let board;
    if (g.opts.dailyKey) {
      const dr = P.daily[g.opts.dailyKey] || (P.daily[g.opts.dailyKey] = { best: 0, board: [] });
      dr.best = Math.max(dr.best, R.score);
      dr.board.push(entry); dr.board.sort((a, b) => b.score - a.score); dr.board.length = Math.min(10, dr.board.length);
      board = dr.board;
      // alte Tage aufräumen
      const keys = Object.keys(P.daily).sort();
      while (keys.length > 14) delete P.daily[keys.shift()];
    } else {
      rec.board = rec.board || [];
      rec.board.push(entry); rec.board.sort((a, b) => b.score - a.score); rec.board.length = Math.min(10, rec.board.length);
      board = rec.board;
    }
    prog.board = board.map(e => Object.assign({ cur: e === entry }, e));
    P.tutDone = true;
    this.saveProgress();
    this.lastProg = prog;
  }

  // ---- Hauptschleife ---------------------------------------------------------------------
  loop(t) {
    requestAnimationFrame(tt => this.loop(tt));
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) return;
    const g = this.game;
    this.input.update(dt);
    if (g) {
      // Zeitlupe
      let scale = 1;
      if (this.slowT > 0) { this.slowT -= dt; scale = this.slow; }
      const running = !this.paused && !this.ui.modalOpen && g.phase !== 'week' && !(this.attract && this.ui.modalOpen);
      if ((running || (this.attract && g.phase !== 'week')) && !g.over) {
        this.acc += dt * scale * (this.attract ? 1 : this.speed);
        let n = 0;
        while (this.acc >= CFG.dt && n < 8) { g.step(CFG.dt); this.acc -= CFG.dt; n++; if (g.over) break; }
        if (this.auto) this.auto.step(dt);
        if (n >= 8) this.acc = 0;
      } else if (g.over && this.slowT > 0) {
        // nach dem Stillstand läuft die Welt in Zeitlupe weiter
        this.acc += dt * scale;
        while (this.acc >= CFG.dt) { g.traffic.step(CFG.dt); this.acc -= CFG.dt; }
      }
      if (g.fx.length) {
        const fx = g.fx.splice(0, g.fx.length);
        for (const f of fx) this.handleFx(f);
      }
      if (this.attract && g.phase === 'week') g.chooseCard(g.pendingWeek.cards.find(c => !c.target) || null);
      if (this.overT > 0) {
        this.overT -= dt;
        if (this.overT <= 0 && this.game === g) this.ui.showReport(g.report, this.lastProg || {});
      }
      const alpha = clamp(this.acc / CFG.dt, 0, 1);
      this.scene.update(dt, alpha);
      AUDIO.setTraffic(Math.min(1, g.traffic.vehicles.length / 120) * (this.engine.rig.cur.dist < 40 ? 1 : 0.5));
    }
    this.engine.rig.update(dt);
    this.engine.render();
    this.overlay.draw(g, dt, this.ui);
    this.ui.update(dt);
    this.autoQuality(dt);
  }

  autoQuality(dt) {
    this.frameEma = this.frameEma * 0.95 + dt * 1000 * 0.05;
    if (this.frameEma > 30 && this.quality > 0) {
      this.slowFrames += dt;
      if (this.slowFrames > 4) { this.quality--; this.applyQuality(); this.slowFrames = 0; this.frameEma = 16; this.ui.toast('Grafik reduziert für flüssigeres Spiel.', 'gear'); }
    } else this.slowFrames = Math.max(0, this.slowFrames - dt);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    window.app = new App();
  } catch (e) {
    console.error(e);
    document.getElementById('ui').innerHTML = '<div class="fatal">Das Spiel konnte nicht starten (WebGL nicht verfügbar?).<br><small>' + String(e && e.message || e) + '</small></div>';
  }
});
