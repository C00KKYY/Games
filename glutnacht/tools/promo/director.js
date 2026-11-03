'use strict';
// Regie für das Werbevideo. Läuft im Spiel (wird vom Aufnahme-Skript eingefügt) und
// rechnet jedes Bild in Videozeit: Spiel, Ausweich-Bot, Overlay-Texte und CSS-Animationen.

const Promo = {
  t: 0, sceneT: 0, texts: [], allow: false, flashT: -1, punchT: -1, tap: null, endVariant: 'bio', link: '',

  init(opts) {
    this.endVariant = opts.endVariant || 'bio';
    this.link = opts.link || '';
    setLang('en');
    Store.data.settings.dmgNums = true;
    Store.data.settings.shake = true;
    // Modale nur, wenn die Regie sie will; keine Erfolgsmeldungen, kein Schaden am Helden
    const oL = Game.openLevelUp.bind(Game), oC = Game.openChest.bind(Game);
    Game.openLevelUp = () => { if (this.allow) oL(); else Game.run.pendingLevels = 0; };
    Game.openChest = () => { if (this.allow) oC(); else Game.run.pendingChests = 0; };
    Game.hurtPlayer = () => {};
    Game.checkAchievements = () => {};
    Hooks.achievement = () => {};
    Hooks.sfx = () => {};
    document.getElementById('pausebtn').style.display = 'none';
    document.getElementById('toasts').style.display = 'none';
    const st = document.createElement('style');
    st.textContent = `
      #promo { position: absolute; inset: 0; pointer-events: none; z-index: 50; overflow: hidden; }
      #promo .pt { position: absolute; left: 0; right: 0; text-align: center; font-family: 'Lilita One', Impact, sans-serif;
        color: #fff; line-height: 1.02; letter-spacing: 1px; -webkit-text-stroke: 9px #14051f; paint-order: stroke fill;
        filter: drop-shadow(0 6px 0 rgba(10, 2, 20, 0.9)) drop-shadow(0 0 22px rgba(255, 120, 40, 0.55)); padding: 0 34px; }
      #promo .pt span { display: inline-block; white-space: pre; }
      #promo .hl { background: linear-gradient(180deg, #fff3b0 10%, #ffb13b 50%, #ff4b1f 92%); -webkit-background-clip: text; background-clip: text; color: transparent; }
      #promo .vi { background: linear-gradient(180deg, #ffffff 10%, #c9b3ff 55%, #8a5cff 92%); -webkit-background-clip: text; background-clip: text; color: transparent; }
      #promo .flash { position: absolute; inset: 0; background: #fff6e0; opacity: 0; }
      #promo .tap { position: absolute; width: 90px; height: 90px; margin: -45px 0 0 -45px; border-radius: 50%;
        border: 6px solid #fff; box-shadow: 0 0 24px #fff; opacity: 0; }
      #promo .end { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; padding-bottom: 120px; }
      #promo .end .logo { font-size: 112px; }
      #promo .sub { font-family: 'Nunito', sans-serif; font-weight: 900; font-size: 30px; color: #fff; text-shadow: 0 3px 0 #14051f, 0 0 18px rgba(0,0,0,0.8); }
      #promo .pill { min-width: 340px; min-height: 76px; padding: 14px 34px; border-radius: 999px; display: flex; align-items: center; justify-content: center;
        font-family: 'Lilita One', Impact, sans-serif; font-size: 36px; color: #2a0e00; letter-spacing: 1px;
        background: linear-gradient(180deg, #ffb057, #ff6a2b); border: 3px solid #ffd39a; box-shadow: 0 6px 0 #9c3a0a, 0 0 40px rgba(255, 120, 40, 0.7); }
      #promo .small { font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 22px; color: #e3d8ff; text-shadow: 0 2px 0 #14051f; }
      #game { transform-origin: 50% 50%; }
    `;
    document.head.appendChild(st);
    this.ov = document.createElement('div');
    this.ov.id = 'promo';
    document.getElementById('app').appendChild(this.ov);
  },

  // ---------- Hilfen für Szenen ----------
  setZoom(z) {
    Render.zoom = z;
    Game.view.hw = Render.W / 2 / z;
    Game.view.hh = Render.H / 2 / z;
  },

  fresh(char, t, weapons, passives, opts) {
    opts = opts || {};
    UI.hide();
    this.allow = false;
    Game.newRun(char, 0);
    const r = Game.run;
    r.t = t;
    r.bossIdx = opts.bossIdx !== undefined ? opts.bossIdx : BOSSES.filter(b => b.t <= t).length;
    r.eventIdx = EVENTS.filter(e => e.t <= t).length;
    r.eliteT = 999;
    r.weapons = [];
    for (const [id, lvl, evo] of weapons) { const w = Game.addWeapon(id); w.level = lvl; w.evo = !!evo; Game.refreshWeapon(w); }
    for (const [id, lvl] of passives || []) r.passives.push({ id, level: lvl });
    Game.refreshStats();
    r.p.hp = r.stats.maxHp;
    Game.state = 'play';
    UI.el.hud.hidden = opts.hud === false;
    UI.hudSig = '';
    UI.lastHud = {};
    Render.resize();
    if (opts.zoom) this.setZoom(opts.zoom);
    return r;
  },

  spawnRing(types, n, r0, r1) {
    const r = Game.run, p = r.p;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, d = r0 + Math.random() * (r1 - r0);
      Game.spawnEnemy(types[i % types.length], p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
    }
  },

  prewarm(sec) {
    const n = Math.round(sec * 60);
    for (let i = 0; i < n; i++) { this.bot(); Game.update(1 / 60); }
  },

  // Ausweich-Bot wie im Simulator, mit etwas Kreisbewegung
  bot() {
    const r = Game.run;
    if (!r) return;
    const p = r.p;
    let fx = 0, fy = 0;
    for (const e of r.enemies) {
      if (e.dead) continue;
      const dx = p.x - e.x, dy = p.y - e.y, d2 = dx * dx + dy * dy;
      const R = e.boss ? 240 : 85 + e.r;
      if (d2 > R * R) continue;
      const d = Math.sqrt(d2) || 1, w = (1 - d / R) * (e.boss ? 4 : 1) / d;
      fx += dx * w; fy += dy * w;
    }
    for (const t of r.tele) {
      const dx = p.x - t.x, dy = p.y - t.y, d2 = dx * dx + dy * dy;
      if (t.kind === 'circle' && d2 < 150 * 150) { fx += dx * 8 / Math.max(50, d2); fy += dy * 8 / Math.max(50, d2); }
    }
    let best = null, bd = 1e12;
    for (const g of r.gems) { const d = (g.x - p.x) ** 2 + (g.y - p.y) ** 2; if (d < bd) { bd = d; best = g; } }
    if (best) { const dx = best.x - p.x, dy = best.y - p.y, d = Math.hypot(dx, dy) || 1; fx += dx / d * 0.3; fy += dy / d * 0.3; }
    fx += Math.cos(r.t * 0.6) * 0.25; fy += Math.sin(r.t * 0.6) * 0.25;
    const l = Math.hypot(fx, fy) || 1;
    Game.input.x = fx / l; Game.input.y = fy / l;
  },

  // Text einblenden. *Wort* = orange, _Wort_ = violett, | = Zeilenumbruch.
  // t0/t1 in Szenenzeit, y in % der Bildhöhe, size in px.
  say(text, t0, t1, y, size) {
    const el = document.createElement('div');
    el.className = 'pt';
    el.style.top = y + '%';
    el.style.fontSize = size + 'px';
    el.innerHTML = text.split(' ').map(w => {
      if (w === '|') return '<br>';
      let cls = 'w';
      if (/^\*.*\*$/.test(w)) { cls += ' hl'; w = w.slice(1, -1); } else if (/^_.*_$/.test(w)) { cls += ' vi'; w = w.slice(1, -1); }
      return '<span class="' + cls + '">' + w + '</span>';
    }).join('<span> </span>');
    this.ov.appendChild(el);
    this.texts.push({ el, t0, t1 });
  },

  clearTexts() {
    for (const x of this.texts) x.el.remove();
    this.texts = [];
    const end = this.ov.querySelector('.end');
    if (end) end.remove();
  },

  cut() { this.sceneT = 0; this.flashT = 0; this.punchT = 0; this.clearTexts(); },

  tapAt(sel, t) {
    const b = document.querySelector(sel);
    if (!b) return;
    const rc = b.getBoundingClientRect();
    if (!this.tap) { this.tap = document.createElement('div'); this.tap.className = 'tap'; this.ov.appendChild(this.tap); }
    this.tap.style.left = (rc.left + rc.width * 0.5) + 'px';
    this.tap.style.top = (rc.top + rc.height * 0.5) + 'px';
    this.tapT0 = t;
  },

  endCard() {
    UI.hide();
    UI.el.hud.hidden = true;
    UI.el.bossbar.hidden = true;
    Game.state = 'menu';
    Game.run = null;
    Render.resize();
    const d = document.createElement('div');
    d.className = 'end';
    d.innerHTML = '<div class="logo pe" data-t="0.05"><span>Ember</span><span>Night</span></div>' +
      '<div class="sub pe" data-t="0.55">Play free in your browser</div>' +
      '<div class="pill pe" data-t="0.95">' + (this.endVariant === 'bio' ? 'LINK IN BIO' : this.link) + '</div>' +
      '<div class="small pe" data-t="1.35">No download · Phone &amp; PC</div>';
    this.ov.appendChild(d);
  },

  // ---------- Drehbuch ----------
  // Jede Szene: Dauer, Aufbau und Ereignisse in Szenenzeit. Gesamtlänge ≈ 22,6 s.
  SCENES: [
    { // Haken: sofort Chaos
      dur: 2.4,
      setup(P) {
        P.fresh('nyx', 760, [['lightning', 8, 1], ['orbit', 8, 1], ['wand', 8, 1], ['fire', 8, 1], ['nova', 8, 1], ['whip', 8, 1]],
          [['might', 5], ['lens', 5], ['candle', 5], ['hourglass', 5], ['heart', 5], ['armor', 5]], { hud: false, zoom: 0.95 });
        P.spawnRing(['brute', 'wraith', 'golem', 'ghoul', 'skel', 'wraith'], 330, 180, 640);
        P.prewarm(1.2);
        P.say('1 HERO.', 0.12, 2.3, 17, 74);
        P.say('*10,000* *MONSTERS.*', 0.75, 2.3, 27, 64);
      },
    },
    { // ruhiger Anfang, erste Karte
      dur: 3.0,
      setup(P) {
        P.fresh('aron', 6, [['whip', 1]], [], {});
        P.spawnRing(['bat', 'slime', 'bat'], 14, 160, 420);
        P.prewarm(1.0);
        P.say('It starts _small…_', 0.12, 1.15, 22, 60);
      },
      events: [
        [1.2, P => {
          const opts = [{ kind: 'weapon', id: 'lightning', level: 1, isNew: true }, { kind: 'weapon', id: 'whip', level: 2 }, { kind: 'passive', id: 'might', level: 1, isNew: true }];
          Game.state = 'levelup';
          Game.lastLevelOptions = opts;
          UI.levelUp(opts);
        }],
        [1.3, P => P.say('Pick *upgrades*', 1.3, 2.85, 6.5, 52)],
        [2.25, P => P.tapAt('[data-act="pick"][data-i="0"]', P.t)],
        [2.55, P => { UI.hide(); Game.applyOption(Game.lastLevelOptions[0]); Game.state = 'play'; }],
      ],
    },
    { // Ausbau
      dur: 3.0,
      setup(P) {
        P.fresh('mira', 300, [['wand', 6], ['orbit', 5], ['lightning', 5], ['knives', 5], ['sickle', 4]], [['might', 2], ['lens', 2], ['hourglass', 2]], {});
        P.spawnRing(['skel', 'ghost', 'ghoul', 'bat', 'spitter'], 150, 150, 600);
        P.prewarm(1.4);
        P.say('Stack your *weapons*', 0.12, 2.9, 20, 60);
      },
    },
    { // Entwicklung
      dur: 3.0,
      setup(P) {
        P.fresh('aron', 420, [['whip', 8], ['lightning', 6], ['nova', 5]], [['heart', 3], ['might', 2]], {});
        P.spawnRing(['ghoul', 'wraith', 'skel', 'brute'], 140, 150, 600);
        P.prewarm(1.0);
      },
      events: [
        [0.25, P => { P.allow = true; Game.run.pendingChests = 1; Game.openChest(); P.allow = false; }],
        [0.35, P => P.say('Then *EVOLVE* them', 0.35, 1.95, 6.5, 52)],
        [1.95, P => { UI.hide(); Game.state = 'play'; }],
        [2.0, P => P.say('_Blood_ _Blade_', 2.0, 2.95, 22, 58)],
      ],
    },
    { // Boss
      dur: 3.6,
      setup(P) {
        P.fresh('brom', 719.0, [['sickle', 8, 1], ['fire', 6], ['lightning', 6], ['whip', 6]], [['wing', 5], ['might', 3], ['armor', 3]], { bossIdx: 3 });
        P.spawnRing(['brute', 'wraith', 'ghoul', 'golem'], 120, 200, 620);
        P.prewarm(0.2);
      },
      events: [
        [0.9, P => {
          const b = Game.run.bosses[0];
          if (b) { b.x = Game.run.p.x + 170; b.y = Game.run.p.y - 230; b.skillIdx = 0; b.skillT = 0.35; }
        }],
        [1.15, P => P.say('A *BOSS* every | 3 minutes', 1.15, 3.5, 30, 54)],
      ],
    },
    { // Höhepunkt: Die Nacht
      dur: 3.6,
      setup(P) {
        P.fresh('ignis', 899.3, [['fire', 8, 1], ['wand', 8, 1], ['lightning', 8, 1], ['orbit', 8, 1], ['nova', 8, 1], ['knives', 8, 1]],
          [['might', 5], ['lens', 5], ['candle', 5], ['clover', 5], ['wing', 5], ['hourglass', 5]], { bossIdx: 4 });
        P.spawnRing(['wraith', 'brute', 'golem', 'bat', 'ghoul', 'ghost'], 300, 170, 650);
        P.prewarm(0.4);
        P.say('Survive *15* minutes.', 0.15, 3.5, 30, 56);
      },
      events: [
        [0.75, P => {
          const b = Game.run.bosses.find(x => x.boss.final);
          if (b) { b.x = Game.run.p.x - 120; b.y = Game.run.p.y - 300; }
        }],
        [1.7, P => P.say('_If_ _you_ _can._', 1.7, 3.5, 40, 64)],
      ],
    },
    { // Endkarte
      dur: 4.0,
      setup(P) { P.endCard(); },
    },
  ],

  sceneIdx: -1,
  events: [],

  // Ein Bild weiter; wechselt Szenen und löst Ereignisse aus
  tick(dt) {
    if (this.sceneIdx < 0 || this.sceneT >= this.SCENES[this.sceneIdx].dur - 1e-6) {
      this.sceneIdx++;
      if (this.sceneIdx >= this.SCENES.length) return false;
      const sc = this.SCENES[this.sceneIdx];
      if (this.tap) this.tap.style.opacity = 0;
      this.cut();
      sc.setup(this);
      this.events = (sc.events || []).slice();
      this.sceneT = 0;
    }
    while (this.events.length && this.sceneT >= this.events[0][0] - 1e-6) this.events.shift()[1](this);
    this.step(dt);
    return true;
  },

  totalFrames(fps) { return Math.round(this.SCENES.reduce((a, s) => a + s.dur, 0) * fps); },

  // ---------- pro Bild ----------
  ease(x) { const c1 = 1.70158, c3 = c1 + 1; x = Math.min(1, Math.max(0, x)); return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },

  step(dt) {
    const r = Game.run;
    if (r && Game.state === 'play') {
      this.bot();
      Game.update(dt / 2);
      Game.update(dt / 2);
    }
    Render.draw(dt);
    UI.updateHud();
    this.t += dt;
    this.sceneT += dt;
    this.frame();
  },

  frame() {
    const st = this.sceneT;
    // Texte: Wörter springen gestaffelt ein, am Ende kurz größer und weg
    for (const x of this.texts) {
      const words = x.el.querySelectorAll('.w');
      const out = Math.max(0, (st - x.t1) / 0.16);
      words.forEach((w, i) => {
        const k = (st - x.t0 - i * 0.07) / 0.28;
        const s = k <= 0 ? 0 : this.ease(k);
        w.style.opacity = k <= 0 || out >= 1 ? 0 : Math.min(1, k * 2) * (1 - out);
        w.style.transform = 'translateY(' + ((1 - Math.min(1, s)) * 30) + 'px) scale(' + (0.4 + s * 0.6 + out * 0.2) + ') rotate(' + ((1 - Math.min(1, s)) * -6) + 'deg)';
      });
    }
    // Endkarte
    this.ov.querySelectorAll('.pe').forEach(el => {
      const k = (st - +el.dataset.t) / 0.4;
      const s = k <= 0 ? 0 : this.ease(k);
      el.style.opacity = k <= 0 ? 0 : Math.min(1, k * 2);
      el.style.transform = 'scale(' + (0.5 + s * 0.5) + ')';
      if (el.classList.contains('pill') && k > 1) el.style.transform = 'scale(' + (1 + Math.sin((st - +el.dataset.t) * 6) * 0.035) + ')';
    });
    // Schnitt: kurzer Blitz und Zoom-Stoß
    if (!this.flashEl) { this.flashEl = document.createElement('div'); this.flashEl.className = 'flash'; this.ov.appendChild(this.flashEl); }
    this.flashEl.style.opacity = this.flashT >= 0 && this.sceneT < 0.14 ? (0.75 * (1 - this.sceneT / 0.14)) : 0;
    const pk = Math.min(1, this.sceneT / 0.35);
    document.getElementById('game').style.transform = 'scale(' + (1 + (1 - this.ease(pk)) * 0.08) + ')';
    // Tipp-Kreis
    if (this.tap) {
      const k = (this.t - this.tapT0) / 0.45;
      this.tap.style.opacity = k < 0 || k > 1 ? 0 : 1 - k;
      this.tap.style.transform = 'scale(' + (0.4 + k * 0.9) + ')';
    }
    this.syncAnims();
  },

  // CSS-Animationen der Oberfläche in Videozeit statt Echtzeit abspielen
  syncAnims() {
    const now = this.t * 1000;
    for (const a of document.getAnimations()) {
      if (a.__t0 === undefined) a.__t0 = now;
      a.pause();
      a.currentTime = now - a.__t0;
    }
  },
};
