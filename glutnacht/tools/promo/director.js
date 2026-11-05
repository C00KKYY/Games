'use strict';
// Regie für das Werbevideo. Läuft im Spiel (wird vom Aufnahme-Skript eingefügt) und
// rechnet jedes Bild in Videozeit: Spiel, Ausweich-Bot, Overlay-Texte und CSS-Animationen.

const Promo = {
  t: 0, sceneT: 0, texts: [], allow: false, flashT: -1, punchT: -1, tap: null, endVariant: 'bio', link: '',

  init(opts) {
    this.endVariant = opts.endVariant || 'bio';
    this.link = opts.link || '';
    this.vlang = opts.lang === 'de' ? 'de' : 'en';
    if (opts.script === 'story') this.SCENES = this.STORY;
    if (opts.script === 'preview') this.SCENES = this.PREVIEW;
    setLang('en');
    Store.data.settings.dmgNums = true;
    Store.data.stats.runs = 10; // keine Einsteiger-Hinweise im Video
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
      #promo .hl { color: #ffad33; }
      #promo .vi { color: #c4a6ff; }
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
      #promo .dim { position: absolute; inset: 0; background: rgba(8, 3, 22, 0.62); }
      #promo .hero { position: absolute; left: 50%; top: 47%; width: 230px; height: 230px; margin-left: -115px; image-rendering: auto;
        filter: drop-shadow(0 0 40px rgba(255, 150, 60, 0.55)); }
      #promo .card { position: absolute; left: 40px; right: 40px; top: 19%; background: rgba(24, 15, 52, 0.96); border: 2px solid rgba(255,255,255,0.12);
        border-radius: 26px; padding: 26px 28px 20px; box-shadow: 0 24px 60px rgba(0,0,0,0.6); }
      #promo .card h3 { margin: 0 0 16px; font-family: 'Lilita One', Impact, sans-serif; font-weight: 400; font-size: 34px; color: #fff; text-align: center; }
      #promo .row { display: flex; align-items: center; gap: 16px; padding: 11px 0; font-family: 'Nunito', sans-serif; font-weight: 900; font-size: 27px; color: #fff; }
      #promo .box { width: 42px; height: 42px; flex: none; border-radius: 10px; border: 4px solid #8f7cc8; display: grid; place-items: center; position: relative; }
      #promo .box .ck { position: absolute; inset: -6px; display: grid; place-items: center; font-family: 'Lilita One', sans-serif; font-size: 44px; color: #5dff8f; text-shadow: 0 0 12px rgba(93,255,143,0.7); }
      #promo .row.open { color: #ffd34f; }
      #promo .row.open .box { border-color: #ff5a6e; }
      #promo .note { font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 24px; color: #ffd34f; text-shadow: 0 2px 0 #14051f; }
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
    Game.newRun(char, 0, opts.stage || 'nightheart');
    const r = Game.run;
    r.t = t;
    r.bossIdx = opts.bossIdx !== undefined ? opts.bossIdx : r.bossList.filter(b => b.t <= t).length;
    r.eventIdx = r.stage.events.filter(e => e.t <= t).length;
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
    // Aufnahmen laufen Bild für Bild (langsam): volle Darstellungsstufe festhalten, keine automatische Rückstufung
    if (Render.setQuality) Render.setQuality(0, true);
    Render.resize();
    this.setZoom(opts.zoom || 1.0);
    return r;
  },

  spawnRing(types, n, r0, r1) {
    const r = Game.run, p = r.p;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, d = r0 + Math.random() * (r1 - r0);
      Game.spawnEnemy(types[i % types.length], p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
    }
  },

  prewarm(sec, still) {
    const n = Math.round(sec * 60);
    for (let i = 0; i < n; i++) {
      if (still) { Game.input.x = 0; Game.input.y = 0; } else this.bot();
      Game.update(1 / 60);
    }
  },

  // Titelbild als eigene Illustration (keine vergrößerte Spielszene, damit nichts unscharf wird):
  // großer Held mit Aura und Schutzkugeln vor einer Horde in drei Tiefenebenen, Titel daneben.
  // layout: landscape | portrait | square. Die Ecke oben links bleibt ruhig (Portal-Label).
  cover(layout) {
    UI.hide(); UI.el.hud.hidden = true; Game.state = 'menu'; Game.run = null;
    Sprites.setScale(10);
    const W = Render.W, H = Render.H, dpr = Render.dpr;
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.cssText = 'position:absolute; inset:0; width:100%; height:100%;';
    const g = cv.getContext('2d');
    const CW = cv.width, CH = cv.height, U = Math.min(CW, CH); // Bezugsgröße
    const rnd = mulberry(7);
    const L = {
      landscape: { hx: 0.3, hy: 0.6, hs: 0.42, tx: 0.72, ty: 0.48, ts: 0.25 },
      portrait: { hx: 0.5, hy: 0.4, hs: 0.36, tx: 0.5, ty: 0.79, ts: 0.25 },
      square: { hx: 0.5, hy: 0.38, hs: 0.36, tx: 0.5, ty: 0.79, ts: 0.21 },
      // itch.io-Titelbild 630×500 (fast quadratisch, Querlayout mit kleinerem Titel)
      itch: { hx: 0.25, hy: 0.6, hs: 0.38, tx: 0.68, ty: 0.48, ts: 0.17 },
    }[layout];
    const hx = L.hx * CW, hy = L.hy * CH, hs = L.hs * U; // Held: Mittelpunkt und Höhe

    // Boden, abgedunkelt, mit Glut- und Violett-Schein
    g.save(); g.scale(dpr * 1.6, dpr * 1.6); g.fillStyle = Render.pattern; g.fillRect(0, 0, CW, CH); g.restore();
    g.fillStyle = 'rgba(10,4,26,0.55)'; g.fillRect(0, 0, CW, CH);
    const glow = (x, y, r, c) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, CW, CH); };
    g.globalCompositeOperation = 'lighter';
    glow(hx, hy, U * 0.75, 'rgba(255,120,40,0.35)');
    glow(L.tx * CW, L.ty * CH, U * 0.7, 'rgba(120,60,255,0.28)');
    g.globalCompositeOperation = 'source-over';

    // Horde: Positionen mit Abstand zum Helden und zum Titel
    const types = ['brute', 'wraith', 'ghoul', 'skel', 'bat', 'golem', 'ghost', 'spitter', 'slime', 'wraith', 'skel', 'bat'];
    const mobs = [];
    for (let i = 0; i < 260 && mobs.length < 120; i++) {
      const x = rnd() * CW * 1.1 - CW * 0.05, y = rnd() * CH * 1.1 - CH * 0.05;
      const dh = Math.hypot((x - hx) / (U * 0.42), (y - hy) / (U * 0.38));
      const dt = Math.hypot((x - L.tx * CW) / (L.ts * U * 2.2), (y - L.ty * CH) / (L.ts * U * 1.1));
      if (dh < 1 || dt < 1) continue;
      if (x < CW * 0.24 && y < CH * 0.2) continue; // Label-Ecke frei lassen
      const depth = Math.min(1, dh / 2.6); // weiter weg = kleiner und dunkler
      mobs.push({ x, y, type: types[i % types.length], depth, frame: i % 2, flip: x > hx });
    }
    mobs.sort((a, b) => a.y - b.y);
    for (const m of mobs) {
      const spr = Sprites.enemy(m.type, m.frame, 0);
      const base = Sprites.baseR(m.type);
      const h = U * (0.06 + base / 30 * 0.11) * (1.25 - m.depth * 0.55);
      g.globalAlpha = 1 - m.depth * 0.45;
      g.save(); g.translate(m.x, m.y); if (m.flip) g.scale(-1, 1);
      g.drawImage(spr, -h / 2, -h / 2, h, h);
      g.restore();
    }
    g.globalAlpha = 1;

    // Aura-Ring und Schutzkugeln um den Helden
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgba(255,190,90,0.55)'; g.lineWidth = U * 0.012;
    g.beginPath(); g.ellipse(hx, hy + hs * 0.08, hs * 0.95, hs * 0.95, 0, 0, TAU); g.stroke();
    glow(hx, hy, hs * 0.95, 'rgba(255,140,40,0.25)');
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + 0.4, ox = hx + Math.cos(a) * hs * 0.95, oy = hy + hs * 0.08 + Math.sin(a) * hs * 0.95;
      g.drawImage(Render.spr.orb, ox - hs * 0.2, oy - hs * 0.2, hs * 0.4, hs * 0.4);
    }
    // Klingenhieb vor dem Helden
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(232,246,255,0.9)'; g.lineWidth = U * 0.022;
    g.beginPath(); g.arc(hx + hs * 0.15, hy, hs * 0.75, -0.75, 0.75); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = U * 0.007;
    g.beginPath(); g.arc(hx + hs * 0.15, hy, hs * 0.86, -0.6, 0.6); g.stroke();
    // Blitz in die Horde
    const bx = hx + (layout === 'landscape' ? -hs * 0.95 : hs * 1.05), by = hy - hs * 0.55;
    g.strokeStyle = '#d8f6ff'; g.lineWidth = U * 0.008;
    g.beginPath(); let x = bx + U * 0.02, y = 0; g.moveTo(x, y);
    while (y < by) { y = Math.min(by, y + U * 0.05); x = bx + (rnd() - 0.5) * U * 0.05; g.lineTo(y >= by ? bx : x, y); }
    g.stroke();
    g.drawImage(Render.spr.orb, bx - U * 0.08, by - U * 0.08, U * 0.16, U * 0.16);
    g.globalCompositeOperation = 'source-over';

    // Held
    const hero = Sprites.player('aron', 0, false), hz = hs * hero.size / 52; // hs bezieht sich auf den alten 52er-Kasten
    g.drawImage(hero, hx - hz / 2, hy - hz / 2, hz, hz);
    // Glut in der Hand leuchtet (wie im Spiel: Flamme additiv über der Hand)
    { const u = hz / hero.size, ex = hx + 9.6 * u, ey = hy - 3.8 * u, fs = 22 * u;
      g.globalCompositeOperation = 'lighter';
      g.drawImage(Render.spr.flame, ex - fs / 2, ey - fs * 0.6, fs, fs);
      g.drawImage(Render.spr.flame, ex - fs / 4, ey - fs * 0.3, fs / 2, fs / 2);
      g.globalCompositeOperation = 'source-over'; }

    // Rand abdunkeln
    const vg = g.createRadialGradient(hx, hy, U * 0.3, hx, hy, Math.hypot(CW, CH) * 0.7);
    vg.addColorStop(0, 'rgba(8,3,22,0)'); vg.addColorStop(1, 'rgba(8,3,22,0.7)');
    g.fillStyle = vg; g.fillRect(0, 0, CW, CH);

    this.ov.innerHTML = '';
    this.ov.appendChild(cv);
    const fs = Math.round(L.ts * Math.min(W, H) * 0.95);
    const t = document.createElement('div');
    t.className = 'logo';
    t.style.cssText = 'position:absolute; left:' + (L.tx * 100 - 50) + '%; width:100%; top:' + (L.ty * 100) + '%; transform:translateY(-50%); text-align:center; font-size:' + fs + 'px; line-height:0.86;';
    t.innerHTML = '<span>Ember</span><span>Night</span>';
    this.ov.appendChild(t);
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
    this.ov.querySelectorAll('.end').forEach(e => e.remove());
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

  menuBg() {
    UI.hide();
    UI.el.hud.hidden = true;
    UI.el.bossbar.hidden = true;
    Game.state = 'menu';
    Game.run = null;
    Render.resize();
  },

  addHtml(html) {
    const d = document.createElement('div');
    d.className = 'end';
    d.style.display = 'block';
    d.innerHTML = html;
    this.ov.appendChild(d);
    return d;
  },

  heroImg(t) {
    return '<img class="hero pe" data-t="' + t + '" data-bob="1" src="' + Sprites.playerURL('aron', 128) + '" alt="">';
  },

  // Checkliste: Einträge [Text, erledigt?], erscheinen nacheinander ab t0
  checklist(title, rows, t0, gap) {
    let h = '<div class="dim"></div><div class="card pe" data-t="' + t0 + '"><h3>' + title + '</h3>';
    rows.forEach(([txt, done], i) => {
      const t = t0 + 0.45 + i * gap;
      h += '<div class="row pe' + (done ? '' : ' open') + '" data-t="' + t + '"' + (done ? '' : ' data-blink="' + (t + 0.4) + '"') + '>' +
        '<div class="box">' + (done ? '<div class="ck pe" data-t="' + (t + 0.25) + '">✓</div>' : '') + '</div><span>' + txt + '</span></div>';
    });
    return this.addHtml(h + '</div>');
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
    const de = this.vlang === 'de';
    d.innerHTML = '<div class="logo pe" data-t="0.05"><span>Ember</span><span>Night</span></div>' +
      '<div class="sub pe" data-t="0.55">' + (de ? 'Kostenlos im Browser spielen' : 'Play free in your browser') + '</div>' +
      '<div class="pill pe" data-t="0.95">' + (this.endVariant === 'bio' ? 'LINK IN BIO' : this.link) + '</div>' +
      '<div class="small pe" data-t="1.35">' + (de ? 'Kein Download · Handy &amp; PC' : 'No download · Phone &amp; PC') + '</div>' +
      (this.endNote ? '<div class="note pe" data-t="1.8">' + this.endNote + '</div>' : '');
    this.ov.appendChild(d);
  },

  // ---------- Drehbuch ----------
  // Jede Szene: Dauer, Aufbau und Ereignisse in Szenenzeit. Gesamtlänge ≈ 22,6 s.
  SCENES: [
    { // Haken: sofort Chaos
      dur: 2.4,
      setup(P) {
        P.fresh('nyx', 760, [['lightning', 8, 1], ['orbit', 8, 1], ['wand', 8, 1], ['fire', 8, 1], ['nova', 8, 1], ['whip', 8, 1]],
          [['might', 5], ['lens', 5], ['candle', 5], ['hourglass', 5], ['heart', 5], ['armor', 5]], { hud: false, zoom: 1.0 });
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
        [1.3, P => P.say('Pick *upgrades*', 1.3, 2.85, 11, 52)],
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
        [0.35, P => P.say('Then *EVOLVE* them', 0.35, 1.95, 11, 52)],
        [1.95, P => { UI.hide(); Game.state = 'play'; }],
        [2.0, P => P.say('_Blood_ _Blade_', 2.0, 2.95, 22, 58)],
      ],
    },
    { // Boss
      dur: 3.6,
      setup(P) {
        P.fresh('brom', 689.0, [['sickle', 8, 1], ['fire', 6], ['lightning', 6], ['whip', 6]], [['wing', 5], ['might', 3], ['armor', 3]]);
        P.spawnRing(['brute', 'wraith', 'ghoul', 'golem'], 120, 200, 620);
        P.prewarm(0.2);
      },
      events: [
        [0.9, P => {
          const b = Game.run.bosses[0];
          if (b) { b.x = Game.run.p.x + 170; b.y = Game.run.p.y - 230; b.skillIdx = 0; b.skillT = 0.35; }
        }],
        [1.15, P => P.say('A *BOSS* in | every land', 1.15, 3.5, 14, 54)],
      ],
    },
    { // Höhepunkt: Die Nacht
      dur: 3.6,
      setup(P) {
        P.fresh('ignis', 899.3, [['fire', 8, 1], ['wand', 8, 1], ['lightning', 8, 1], ['orbit', 8, 1], ['nova', 8, 1], ['knives', 8, 1]],
          [['might', 5], ['lens', 5], ['candle', 5], ['clover', 5], ['wing', 5], ['hourglass', 5]]);
        P.spawnRing(['wraith', 'brute', 'golem', 'bat', 'ghoul', 'ghost'], 300, 170, 650);
        P.prewarm(0.4);
        P.say('Survive *15* minutes.', 0.15, 3.5, 16, 56);
      },
      events: [
        [0.75, P => {
          const b = Game.run.bosses.find(x => x.boss.final);
          if (b) { b.x = Game.run.p.x - 120; b.y = Game.run.p.y - 300; }
        }],
        [1.7, P => P.say('_If_ _you_ _can._', 1.7, 3.5, 44, 64)],
      ],
    },
    { // Endkarte
      dur: 4.0,
      setup(P) { P.endCard(); },
    },
  ],

  // Persönliches Video: allein gebaut, eingereicht, Testspieler gesucht. Texte je Sprache.
  STORY_TEXT: {
    en: {
      pov: '_POV:_', built: 'you built a game | *all* *by* *yourself*',
      what1: '1 hero. | *10,000* monsters.', what2: 'Bosses. Upgrades. | *Evolutions.*',
      listTitle: 'CrazyGames checklist', rows: [['Loads fast', 1], ['Works on mobile', 1], ['In English', 1], ['Tested by someone else', 0]],
      missing: 'One box is *still* *empty…*',
      you: 'That\'s where | *YOU* come in.',
      cta1: 'Play *one* run.', cta2: 'Comment your | *best* *time.*',
      note: 'Every comment helps',
    },
    de: {
      pov: '_POV:_', built: 'du hast ein Spiel | *ganz* *allein* gebaut',
      what1: '1 Held. | *10.000* Monster.', what2: 'Bosse. Upgrades. | *Entwicklungen.*',
      listTitle: 'CrazyGames-Checkliste', rows: [['Lädt schnell', 1], ['Läuft auf dem Handy', 1], ['Auf Englisch', 1], ['Von jemand anderem getestet', 0]],
      missing: 'Ein Kästchen ist | *noch* *leer…*',
      you: 'Genau da kommst | *DU* ins Spiel.',
      cta1: 'Spiel *eine* Runde.', cta2: 'Schreib deine | *Bestzeit* in die Kommentare.',
      note: 'Jeder Kommentar hilft',
    },
  },

  STORY: [
    { dur: 3.2, setup(P) {
      const T = P.STORY_TEXT[P.vlang];
      P.menuBg();
      P.addHtml(P.heroImg(0.1));
      P.say(T.pov, 0.15, 3.1, 13, 58);
      P.say(T.built, 0.55, 3.1, 21, 52);
    } },
    { dur: 3.6, setup(P) {
      const T = P.STORY_TEXT[P.vlang];
      P.fresh('nyx', 760, [['lightning', 8, 1], ['orbit', 8, 1], ['wand', 8, 1], ['fire', 8, 1], ['nova', 8, 1], ['whip', 8, 1]],
        [['might', 5], ['lens', 5], ['candle', 5], ['hourglass', 5], ['heart', 5], ['armor', 5]], { hud: false });
      P.spawnRing(['brute', 'wraith', 'golem', 'ghoul', 'skel', 'wraith'], 300, 180, 640);
      P.prewarm(1.2);
      P.say(T.what1, 0.12, 1.75, 16, 60);
      P.say(T.what2, 1.85, 3.5, 16, 56);
    } },
    { dur: 5.4, setup(P) {
      const T = P.STORY_TEXT[P.vlang];
      P.fresh('aron', 300, [['whip', 6], ['lightning', 5], ['nova', 4]], [['might', 2]], { hud: false });
      P.spawnRing(['skel', 'ghost', 'ghoul', 'bat'], 120, 160, 600);
      P.prewarm(1.0);
      P.checklist(T.listTitle, T.rows, 0.1, 0.55);
      P.say(T.missing, 3.2, 5.3, 60, 50);
    } },
    { dur: 3.0, setup(P) {
      const T = P.STORY_TEXT[P.vlang];
      P.fresh('mira', 40, [['wand', 3], ['orbit', 2]], [], {});
      P.spawnRing(['bat', 'slime', 'skel'], 40, 160, 500);
      P.prewarm(1.0);
      P.say(T.you, 0.12, 2.9, 18, 64);
    } },
    { dur: 3.8, setup(P) {
      const T = P.STORY_TEXT[P.vlang];
      P.fresh('brom', 540.5, [['sickle', 8, 1], ['fire', 6], ['lightning', 6], ['whip', 6]], [['wing', 5], ['might', 3]], {});
      P.spawnRing(['wraith', 'brute', 'ghoul', 'ghost'], 160, 180, 620);
      P.prewarm(0.6);
      P.say(T.cta1, 0.12, 1.7, 16, 60);
      P.say(T.cta2, 1.6, 3.7, 16, 54);
    } },
    { dur: 4.2, setup(P) {
      P.endNote = P.STORY_TEXT[P.vlang].note;
      P.endCard();
    } },
  ],

  // Vorschauvideo für das Portal (Hover-Video): nur Spiel, keine Texte, max. 20 s
  PREVIEW: [
    { dur: 3.5, setup(P) {
      P.fresh('nyx', 760, [['lightning', 8, 1], ['orbit', 8, 1], ['wand', 8, 1], ['fire', 8, 1], ['nova', 8, 1], ['whip', 8, 1]],
        [['might', 5], ['lens', 5], ['candle', 5], ['hourglass', 5], ['heart', 5], ['armor', 5]], {});
      P.spawnRing(['brute', 'wraith', 'golem', 'ghoul', 'skel', 'wraith'], 330, 180, 700);
      P.prewarm(1.2);
    } },
    { dur: 3.2, setup(P) {
      P.fresh('mira', 300, [['wand', 6], ['orbit', 5], ['lightning', 5], ['knives', 5], ['sickle', 4]], [['might', 2], ['lens', 2], ['hourglass', 2]], {});
      P.spawnRing(['skel', 'ghost', 'ghoul', 'bat', 'spitter'], 170, 150, 650);
      P.prewarm(1.4);
    } },
    { dur: 3.3, setup(P) {
      P.fresh('aron', 420, [['whip', 8], ['lightning', 6], ['nova', 5]], [['heart', 3], ['might', 2]], {});
      P.spawnRing(['ghoul', 'wraith', 'skel', 'brute'], 150, 150, 650);
      P.prewarm(1.0);
    }, events: [
      [0.2, P => { P.allow = true; Game.run.pendingChests = 1; Game.openChest(); P.allow = false; }],
      [1.7, P => { UI.hide(); Game.state = 'play'; }],
    ] },
    { dur: 4.0, setup(P) {
      P.fresh('brom', 689.0, [['sickle', 8, 1], ['fire', 6], ['lightning', 6], ['whip', 6]], [['wing', 5], ['might', 3], ['armor', 3]]);
      P.spawnRing(['brute', 'wraith', 'ghoul', 'golem'], 130, 200, 650);
      P.prewarm(0.2);
    }, events: [
      [0.9, P => {
        const b = Game.run.bosses[0];
        if (b) { b.x = Game.run.p.x + 170; b.y = Game.run.p.y - 200; b.skillIdx = 0; b.skillT = 0.35; }
      }],
    ] },
    { dur: 4.0, setup(P) {
      P.fresh('ignis', 899.3, [['fire', 8, 1], ['wand', 8, 1], ['lightning', 8, 1], ['orbit', 8, 1], ['nova', 8, 1], ['knives', 8, 1]],
        [['might', 5], ['lens', 5], ['candle', 5], ['clover', 5], ['wing', 5], ['hourglass', 5]]);
      P.spawnRing(['wraith', 'brute', 'golem', 'bat', 'ghoul', 'ghost'], 320, 170, 700);
      P.prewarm(0.4);
    }, events: [
      [0.75, P => {
        const b = Game.run.bosses.find(x => x.boss.final);
        if (b) { b.x = Game.run.p.x - 140; b.y = Game.run.p.y - 230; }
      }],
    ] },
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
      if (el.dataset.bob && k > 1) el.style.transform = 'translateY(' + (Math.sin(st * 3.2) * 10) + 'px)';
      if (el.dataset.blink && st > +el.dataset.blink) el.style.opacity = 0.45 + 0.55 * (0.5 + 0.5 * Math.cos((st - +el.dataset.blink) * 7));
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
