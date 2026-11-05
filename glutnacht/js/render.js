'use strict';
// Zeichnet die Spielwelt auf das Canvas. Kamera folgt dem Spieler.

// Abgerundetes Rechteck als Pfad (ohne ctx.roundRect, das ältere Safaris nicht kennen)
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// Der Held wird größer gezeichnet, als sein Trefferkreis ist (nur Darstellung, r bleibt 12)
const PLAYER_DRAW_SCALE = 1.25;
// Kleinster Zoom: Held und Gegner bleiben auch auf Handys groß genug (vorher 0.55)
const MIN_ZOOM = 0.8;

// Darstellungsstufen: Auflösung des Spiel-Canvas (rs) und der Lichtkarte (lm, Anteil der CSS-Pixel).
// Fällt die Bildrate im Spiel unter 42 fps, wird auf Probe zurückgeschaltet (siehe autoQuality).
// sprites: Partikel als Kenney-Funken (sonst gebündelte Quadrate); shadows: Schatten unter Gegnern.
// Die Lichtkarte ist weich, daher genügt ihr wenig Auflösung; die teuren Schritte (Canvas-Auflösung) kommen zuletzt.
const QUALITY = [
  { rs: 1, lm: 0.4, gemLights: true, sprites: true, shadows: true },
  { rs: 1, lm: 0.3, gemLights: false, sprites: true, shadows: false },
  { rs: 0.8, lm: 0.28, gemLights: false, sprites: true, shadows: false },
  { rs: 0.68, lm: 0.25, gemLights: false, sprites: false, shadows: false },
  { rs: 0.52, lm: 0.22, gemLights: false, sprites: false, shadows: false },
  { rs: 0.38, lm: 0.2, gemLights: false, sprites: false, shadows: false }, // letzter Ausweg (unscharf)
];
// Umgebungslicht je Land: die Lichtkarte wird mit dieser Farbe gefüllt und mit der Szene multipliziert
// (#ffffff = unverändert). Lichtquellen (Glut des Helden, Kohlebecken, Geschosse …) hellen sie auf.
const AMBIENT = { graveyard: '#66769e', ashwood: '#8a6c74', frostlake: '#647ca4', ruins: '#74708c', nightheart: '#8e7ec8' };
const AMBIENT_DEFAULT = '#7880a6';

const Render = {
  keyArtOn: false, keyArtA: 0, hintA: 0,
  cv: null, ctx: null, dpr: 1, W: 0, H: 0, zoom: 1,
  cam: { x: 0, y: 0 }, camOffset: { x: 0, y: 0 }, base: { x: 0, y: 0 }, shake: 0, flash: 0, time: 0,
  pattern: null, hurtVig: null, spr: {}, list: [], embers: [],
  // Licht und Effekte (nur Darstellung)
  quality: 0, qAuto: true, perf: { last: 0, acc: 0, ft: [], upBlock: 0, downs: 0, probe: null, capMs: 0, log: [] },
  lm: null, lmG: null, lmVig: null, lmS: 0.5, ambient: AMBIENT_DEFAULT,
  corpses: [], vfx: [], trails: [], tags: [], lvlFx: null, runRef: null,

  init(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.setStage(STAGES[0]);
    this.spr.bolt = this.glowSprite(26, '#ffffff', '#b48cff');
    this.spr.boltEvo = this.glowSprite(30, '#ffffff', '#ff7cf5');
    this.spr.orb = this.glowSprite(40, '#ffffff', '#3fc8ff');
    this.spr.orbEvo = this.glowSprite(44, '#ffffff', '#ffd34f');
    this.spr.eshot = this.glowSprite(30, '#fff1c4', '#ff3d5a');
    this.spr.flame = this.glowSprite(60, 'rgba(255,220,120,0.9)', 'rgba(255,90,20,0)');
    this.spr.pool = this.poolSprite(['rgba(255,220,120,0.55)', 'rgba(255,110,30,0.4)', 'rgba(200,40,10,0)']);
    this.spr.poolEvo = this.poolSprite(['rgba(255,255,220,0.65)', 'rgba(255,90,200,0.45)', 'rgba(140,20,160,0)']);
    this.spr.knife = this.knifeSprite('#e8f6ff');
    this.spr.knifeEvo = this.knifeSprite('#ffe27a');
    this.spr.sickle = this.sickleSprite('#e8f0ff');
    this.spr.sickleEvo = this.sickleSprite('#9dfff0');
    this.spr.light = this.glowSprite(200, 'rgba(255,190,90,0.35)', 'rgba(255,120,30,0)');
    // Glut des Helden: weicher, warmer Schein, der über das Licht hinaus aufhellt (additiv)
    this.spr.ember = this.poolSprite(['rgba(255,176,96,0.5)', 'rgba(255,140,60,0.16)', 'rgba(255,110,40,0)']);
    for (let i = 0; i < 40; i++) this.embers.push({ x: Math.random(), y: Math.random(), s: rand(1, 3), v: rand(10, 40), ph: rand(0, TAU) });
    this.resize();
  },

  // Leuchtpunkt: heller Kern (c0), farbiger Hof (c1), transparent am Rand
  // Boden und Deko eines Landes
  setStage(stage) {
    if (this.stageId === stage.id) return;
    this.stageId = stage.id;
    this.pattern = this.ctx.createPattern(Sprites.groundTile(stage.ground), 'repeat');
    this.decor = stage.decor || Sprites.DECOS;
    this.decorTint = stage.decorTint || null;
    this.ambient = AMBIENT[stage.id] || AMBIENT_DEFAULT;
  },

  glowSprite(size, c0, c1) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, c0); gr.addColorStop(0.22, c0); gr.addColorStop(0.45, c1); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    return c;
  },

  poolSprite(stops) {
    const size = 128, c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, stops[0]); gr.addColorStop(0.6, stops[1]); gr.addColorStop(1, stops[2]);
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    return c;
  },

  knifeSprite(col) {
    const c = document.createElement('canvas');
    c.width = 48; c.height = 16;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(200,240,255,0.25)';
    g.fillRect(0, 6, 24, 4);
    g.fillStyle = col;
    g.beginPath(); g.moveTo(46, 8); g.lineTo(28, 3); g.lineTo(28, 13); g.closePath(); g.fill();
    g.fillStyle = '#3a2a4a'; g.fillRect(25, 2, 3, 12);
    g.fillStyle = '#7a3e1d'; g.fillRect(17, 6, 8, 4);
    return c;
  },

  sickleSprite(col) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.translate(32, 32);
    g.shadowColor = col; g.shadowBlur = 10;
    g.fillStyle = col;
    g.beginPath(); g.arc(0, 0, 24, -2.4, 1.2); g.arc(6, -4, 18, 1.2, -2.4, true); g.closePath(); g.fill();
    return c;
  },

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1) * QUALITY[this.quality].rs;
    const W = window.innerWidth, H = window.innerHeight;
    this.dpr = dpr; this.W = W; this.H = H;
    this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr);
    this.cv.style.width = W + 'px'; this.cv.style.height = H + 'px';
    // Hochformat-Handys: die Höhe als zweite Untergrenze, sonst wird alles winzig
    this.zoom = clamp(Math.max(Math.min(W, H) / 660, H > W ? H / 1200 : 0), MIN_ZOOM, 1.4);
    Game.view.hw = W / 2 / this.zoom;
    Game.view.hh = H / 2 / this.zoom;
    this.hurtVig = this.makeVignette(W, H, 'rgba(255,0,40,0)', 'rgba(255,0,40,0.55)', 0.45);
    this.makeLightMap();
  },

  // Stufe fest setzen (fixed = keine automatische Umschaltung mehr) – für Tests und Einstellungen
  setQuality(q, fixed) {
    this.quality = clamp(Math.round(q), 0, QUALITY.length - 1);
    if (fixed !== undefined) this.qAuto = !fixed;
    this.perf.acc = 0; this.perf.ft.length = 0;
    this.resize();
  },

  // Bildrate im laufenden Spiel messen (je 1,5 s, ohne die langsamsten 10 % der Bilder, damit einzelne Hänger
  // nichts auslösen). Unter 42 fps eine Stufe zurück – aber auf Probe: Bringt die niedrigere Stufe im nächsten
  // Messfenster keine um 10 % kürzere Bildzeit, wird zuerst die nächste Stufe probiert, die die Canvas-Auflösung
  // senkt (die billigen Stufen ohne Auflösungsschritt sparen auf einem ausgelasteten Gerät oft nur wenige Prozent,
  // das allein beweist nichts). Erst wenn auch ein Auflösungsschritt nichts bringt, liegt es nicht an der Grafik,
  // sondern an einer Obergrenze der Anzeige (Stromsparmodus mit 30 Hz, 30-Hz-Bildschirm, gedrosselter Tab): Dann
  // geht es zurück auf die Stufe vor der Probe, und dieser Takt wird als Obergrenze gemerkt (capMs); zurückgeschaltet
  // wird erst wieder, wenn es deutlich langsamer als diese Obergrenze wird. Die reine Rechenzeit in JS taugt dafür
  // nicht als Maß: Das Rastern des Canvas läuft außerhalb von JS (im Profil als „(program)“) und ist bei vielen
  // Figuren der größte Posten.
  // Hochgeschaltet wird nach einer Sperrzeit, wenn die Bildzeit wieder am Ziel liegt (die Sperre wächst mit jeder
  // Rückstufung, damit nichts pendelt).
  autoQuality(active) {
    const P = this.perf, now = performance.now();
    if (!active || !this.qAuto || (typeof document !== 'undefined' && document.hidden)) { P.last = 0; return; }
    if (P.last) { const ft = now - P.last; if (ft < 250) { P.acc += ft; P.ft.push(ft); } }
    P.last = now;
    if (P.acc < 1500) return;
    const ft = P.ft.sort((a, b) => a - b), n = Math.max(1, Math.floor(ft.length * 0.9));
    let sum = 0;
    for (let i = 0; i < n; i++) sum += ft[i];
    const avg = sum / n;
    P.acc = 0; ft.length = 0;
    const last = QUALITY.length - 1, q0 = this.quality;
    // Obergrenze vergessen, sobald es klar schneller läuft (z. B. Stromsparmodus beendet)
    if (P.capMs && avg < P.capMs * 0.8) P.capMs = 0;
    const slowMs = Math.max(1000 / 42, P.capMs * 1.15), goodMs = P.capMs ? P.capMs * 1.05 : 1000 / 56;
    const pr = P.probe;
    P.probe = null;
    const rs = i => QUALITY[i].rs;
    if (pr && this.quality > pr.q && avg > pr.avg * 0.9) {
      // Probe ohne Gewinn. Hat sie die Auflösung nicht gesenkt und ist es noch zu langsam: gleich die nächste
      // Stufe mit kleinerer Canvas-Auflösung probieren (Ausgangsstufe und Messwert der Probe bleiben).
      let nx = this.quality + 1;
      while (nx < last && rs(nx) >= rs(this.quality)) nx++;
      if (rs(this.quality) >= rs(pr.q) && avg > slowMs && nx <= last && rs(nx) < rs(this.quality)) {
        P.probe = pr; this.quality = nx;
      } else if (rs(this.quality) < rs(pr.q)) {
        // Auch weniger Pixel bringen nichts: Obergrenze der Anzeige. Zurück auf die Stufe vor der Probe.
        this.quality = pr.q; P.downs = pr.downs; P.upBlock = pr.upBlock;
        P.capMs = Math.max(P.capMs, pr.avg);
      }
      // sonst: billige Stufe behalten (schadet nicht), es geht ohnehin schon schnell genug
    } else if (avg > slowMs && this.quality < last) {
      // weit darunter (< 24 fps): zwei Stufen auf einmal
      P.probe = { q: this.quality, avg, downs: P.downs, upBlock: P.upBlock };
      this.quality = Math.min(last, this.quality + (avg > 1000 / 24 ? 2 : 1));
      P.downs++; P.upBlock = now + 15000 * P.downs;
    } else if (avg < goodMs && this.quality > 0 && now > P.upBlock) {
      this.quality--; P.upBlock = now + 15000;
    }
    if (P.log.length > 60) P.log.shift();
    P.log.push(Math.round(avg * 10) / 10 + 'ms:q' + q0 + (this.quality !== q0 ? '>' + this.quality : '') + (P.capMs ? ' cap' + Math.round(P.capMs) : ''));
    if (this.quality !== q0) this.resize();
  },

  // Lichtkarte in geringer Auflösung; der Randabfall (Vignette) steckt schon darin
  makeLightMap() {
    const s = QUALITY[this.quality].lm;
    const w = Math.max(1, Math.ceil(this.W * s)), h = Math.max(1, Math.ceil(this.H * s));
    if (!this.lm) this.lm = document.createElement('canvas');
    this.lm.width = w; this.lm.height = h;
    this.lmS = s;
    this.lmG = this.lm.getContext('2d');
    const v = this.lmVig = document.createElement('canvas');
    v.width = w; v.height = h;
    const g = v.getContext('2d'), R = Math.hypot(w, h) / 2;
    const gr = g.createRadialGradient(w / 2, h / 2, R * 0.3, w / 2, h / 2, R);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, '#e2dded'); gr.addColorStop(1, '#7a6e94');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  },

  makeVignette(W, H, c0, c1, inner) {
    const c = document.createElement('canvas');
    const s = 0.5; // halbe Auflösung genügt
    c.width = Math.max(1, Math.round(W * s)); c.height = Math.max(1, Math.round(H * s));
    const g = c.getContext('2d');
    const R = Math.hypot(c.width, c.height) / 2;
    const gr = g.createRadialGradient(c.width / 2, c.height / 2, R * inner, c.width / 2, c.height / 2, R);
    gr.addColorStop(0, c0); gr.addColorStop(1, c1);
    g.fillStyle = gr;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  },

  addShake(a) {
    if (Store.data.settings.shake) this.shake = Math.max(this.shake, a);
  },

  // Welt → Bildschirm
  toScreen(x, y) {
    return { x: (x - this.cam.x) * this.zoom + this.W / 2, y: (y - this.cam.y) * this.zoom + this.H / 2 };
  },

  draw(dt) {
    const ctx = this.ctx, r = Game.run;
    this.time += dt;
    const inRun = r && Game.state !== 'menu';
    if (r && r.stage.id !== this.stageId) this.setStage(r.stage);
    if (r !== this.runRef) { this.runRef = r; this.corpses.length = 0; this.vfx.length = 0; this.lvlFx = null; }
    this.autoQuality(inRun && Game.state === 'play');
    // Effekt-Zeit läuft nur im Spiel (und im kurzen Stopp beim Stufenaufstieg), nicht unter Dialogen
    const L = this.lvlFx;
    this.fxDt = Game.state === 'play' || (L && L.stop > 0) ? dt : 0;
    if (L) { if (L.stop > 0) L.stop -= dt; L.t += this.fxDt; if (L.t > 1.2) this.lvlFx = null; }
    if (inRun) { this.cam.x = r.p.x + this.camOffset.x; this.cam.y = r.p.y + this.camOffset.y; }
    else { const k = 1 - this.keyArtA * 0.85; this.cam.x += 18 * dt * k; this.cam.y += 7 * dt * k; } // vor dem Titelbild fast still
    let sx = 0, sy = 0;
    if (this.shake > 0) {
      sx = rand(-1, 1) * this.shake; sy = rand(-1, 1) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 40);
    }
    const z = this.zoom, d = this.dpr;
    const cx = this.cam.x + sx / z, cy = this.cam.y + sy / z;
    this.base = { x: d * (this.W / 2 - cx * z), y: d * (this.H / 2 - cy * z) };
    ctx.setTransform(d * z, 0, 0, d * z, this.base.x, this.base.y);
    const hw = Game.view.hw + 40, hh = Game.view.hh + 40;
    const vx0 = cx - hw, vy0 = cy - hh, vx1 = cx + hw, vy1 = cy + hh;

    // Boden
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.pattern;
    ctx.fillRect(vx0, vy0, hw * 2, hh * 2);
    this.drawDecor(vx0, vy0, vx1, vy1);

    // Im Spiel setzt drawWorld die Lichtkarte zwischen Figuren und leuchtende Effekte; sonst nur Umgebungslicht
    if (inRun) this.drawWorld(r, vx0, vy0, vx1, vy1);
    else this.drawLightMap(null);

    // Bildschirm-Ebene (die Vignette steckt in der Lichtkarte)
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (inRun) this.drawScreenFx(r, dt);
    else { this.drawKeyArt(dt); this.drawEmbers(dt); }
  },

  drawDecor(x0, y0, x1, y1) {
    const ctx = this.ctx, C = 150;
    for (let cx = Math.floor(x0 / C); cx <= Math.floor(x1 / C); cx++) {
      for (let cy = Math.floor(y0 / C); cy <= Math.floor(y1 / C); cy++) {
        if (hash2(cx, cy, 3) > 0.2) continue;
        const kind = this.decor[Math.floor(hash2(cx, cy, 4) * this.decor.length)];
        const s = Sprites.deco(kind, this.decorTint);
        const x = (cx + 0.1 + hash2(cx, cy, 5) * 0.8) * C, y = (cy + 0.1 + hash2(cx, cy, 6) * 0.8) * C;
        ctx.drawImage(s, x - s.size / 2, y - s.size / 2, s.size, s.size);
      }
    }
  },

  inView(x, y, m) {
    const hw = Game.view.hw + m, hh = Game.view.hh + m;
    return Math.abs(x - this.cam.x) < hw && Math.abs(y - this.cam.y) < hh;
  },

  // Ablauf: (1) Boden-Nahes und Figuren, (2) Lichtkarte multiplizieren, (3) Leuchtendes und Lesbares darüber
  drawWorld(r, x0, y0, x1, y1) {
    const ctx = this.ctx, t = this.time, p = r.p, Q = QUALITY[this.quality];
    const fl = 0.85 + Math.sin(t * 13) * 0.1 + Math.sin(t * 7.3) * 0.05;

    // ---------- (1) beleuchtete Ebene ----------
    // Kohlebecken
    for (const pr of r.propList) {
      if (!this.inView(pr.x, pr.y, 60)) continue;
      const b = Sprites.brazier();
      ctx.drawImage(b, pr.x - b.size / 2, pr.y - b.size / 2, b.size, b.size);
    }
    // Brandflecken unter Feuerpfützen
    for (const f of r.fx) {
      if (f.kind !== 'pool') continue;
      const a = Math.min(1, (f.life - f.t) * 2, f.t * 8), s = f.rad * 2.9;
      ctx.globalAlpha = 0.6 * a;
      ctx.drawImage(FxArt.tint('scorch', '#160603', 64), f.x - s / 2, f.y - s * 0.375, s, s * 0.75);
    }
    // Warmer Schein auf dem Boden: Glut des Helden und Kohlebecken (unter den Figuren, damit sie nicht ausbleichen;
    // dort ist die Lichtkarte weiß, der Schein hellt also über das Licht hinaus auf)
    ctx.globalCompositeOperation = 'lighter';
    const pf = 1 + Math.sin(t * 9) * 0.03 + Math.sin(t * 13.7) * 0.02;
    ctx.globalAlpha = 1;
    ctx.drawImage(this.spr.ember, p.x - 220 * pf, p.y - 220 * pf, 440 * pf, 440 * pf);
    ctx.globalAlpha = 0.4;
    for (const pr of r.propList) {
      if (!this.inView(pr.x, pr.y, 120)) continue;
      const f2 = 0.85 + Math.sin(t * 13 + pr.x) * 0.1 + Math.sin(t * 7.3 + pr.y) * 0.05;
      ctx.drawImage(this.spr.light, pr.x - 100 * f2, pr.y - 100 * f2, 200 * f2, 200 * f2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Schatten
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    const list = this.list;
    list.length = 0;
    this.tags.length = 0;
    for (const e of r.enemies) {
      if (e.dead || !this.inView(e.x, e.y, e.r + 30)) continue;
      list.push(e);
      if (!Q.shadows) continue;
      ctx.moveTo(e.x + e.r, e.y + e.r * 0.85);
      ctx.ellipse(e.x, e.y + e.r * 0.85, e.r, e.r * 0.32, 0, 0, TAU);
    }
    const PS = PLAYER_DRAW_SCALE;
    ctx.moveTo(p.x + 11 * PS, p.y + 15 * PS);
    ctx.ellipse(p.x, p.y + 15 * PS, 11 * PS, 4 * PS, 0, 0, TAU);
    ctx.fill();

    // Gegner und Spieler, nach y sortiert; danach die zerplatzenden Besiegten
    list.push(p);
    list.sort((a, b) => a.y - b.y);
    for (const e of list) {
      if (e === p) this.drawPlayer(r);
      else this.drawEnemy(e, p);
    }
    this.drawCorpses();

    // ---------- (2) Licht ----------
    this.drawLightMap(r);

    // ---------- (3) über dem Licht ----------
    // Boss-Warnungen
    for (const te of r.tele) {
      const k = te.t / te.life;
      ctx.save();
      if (te.kind === 'line') {
        ctx.translate(te.x, te.y); ctx.rotate(te.a);
        ctx.fillStyle = 'rgba(255,40,60,0.15)';
        ctx.fillRect(0, -te.w / 2, te.len, te.w);
        ctx.fillStyle = 'rgba(255,40,60,0.35)';
        ctx.fillRect(0, -te.w / 2, te.len * k, te.w);
      } else {
        ctx.fillStyle = 'rgba(255,60,40,0.14)';
        ctx.beginPath(); ctx.arc(te.x, te.y, te.rad, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,60,40,0.3)';
        ctx.beginPath(); ctx.arc(te.x, te.y, te.rad * k, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,90,60,0.8)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(te.x, te.y, te.rad, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }

    // Edelsteine: springen beim Erscheinen auf, ziehen beim Einsammeln einen Schweif
    const trails = this.trails;
    trails.length = 0;
    for (const g of r.gems) {
      if (g._b === undefined) { g._b = t; g._px = g.x; g._py = g.y; }
      if (!this.inView(g.x, g.y, 20)) { g._px = g.x; g._py = g.y; continue; }
      const tier = Sprites.gemTier(g.v), s = Sprites.gem(tier);
      const age = t - g._b;
      let sc = 1, hop = 0;
      if (age < 0.35) { const k = age / 0.35; sc = k < 0.45 ? 0.3 + k / 0.45 * 1.05 : 1.35 - (k - 0.45) / 0.55 * 0.35; hop = -Math.sin(k * Math.PI) * 9; }
      const by = Math.sin(t * 4 + g.bob) * 2 + hop, sz = s.size * sc;
      ctx.drawImage(s, g.x - sz / 2, g.y - sz / 2 + by, sz, sz);
      if (g.mag && trails.length < 600) {
        const dx = g.x - g._px, dy = g.y - g._py, d = Math.hypot(dx, dy);
        if (d > 0.5 && d < 90) trails.push(g.x, g.y + by, dx / d, dy / d, d, tier);
      }
      g._px = g.x; g._py = g.y;
    }
    for (const it of r.pickups) {
      if (!this.inView(it.x, it.y, 30)) continue;
      const s = Sprites.item(it.kind);
      const by = Math.sin(t * 3 + it.bob) * 3;
      if (it.kind === 'chest') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(it.x, it.y);
        ctx.rotate(t * 0.8);
        ctx.fillStyle = 'rgba(255,210,80,0.18)';
        for (let i = 0; i < 8; i++) {
          ctx.rotate(TAU / 8);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-8, -60); ctx.lineTo(8, -60); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
      ctx.drawImage(s, it.x - s.size / 2, it.y - s.size / 2 + by, s.size, s.size);
    }

    // Leuchtendes (additiv)
    ctx.globalCompositeOperation = 'lighter';
    // Flammen der Kohlebecken (über dem Licht, damit sie wirklich glühen)
    const flame = FxArt.tint('flame1', '#ffb35a', 64);
    for (const pr of r.propList) {
      if (!this.inView(pr.x, pr.y, 120)) continue;
      const f2 = 0.85 + Math.sin(t * 13 + pr.x) * 0.1 + Math.sin(t * 7.3 + pr.y) * 0.05;
      ctx.globalAlpha = 1;
      ctx.drawImage(this.spr.flame, pr.x - 14 * f2, pr.y - 30 * f2, 28 * f2, 34 * f2);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(flame, pr.x - 20 * f2, pr.y - 30 - 22 * f2, 40 * f2, 44 * f2);
    }
    ctx.globalAlpha = 1;
    // Feuerpfützen: Glut und züngelnde Flammen
    for (const f of r.fx) {
      if (f.kind !== 'pool') continue;
      const a = Math.min(1, (f.life - f.t) * 3, f.t * 6);
      const fz = 1 + Math.sin(t * 20 + f.x) * 0.04;
      ctx.globalAlpha = a;
      const s = f.rad * 2.3 * fz;
      ctx.drawImage(f.evo ? this.spr.poolEvo : this.spr.pool, f.x - s / 2, f.y - s / 2 * 0.75, s, s * 0.75);
      const fc = FxArt.tint(f.evo ? 'flame2' : 'flame1', f.evo ? '#ff7ce0' : '#ff9a3c', 64);
      for (let i = 0; i < 5; i++) {
        const an = i * 2.4 + f.x * 0.01, rr = f.rad * (0.15 + (i % 3) * 0.22);
        const ph = (t * 2.2 + i * 0.37) % 1, h = f.rad * (0.55 + 0.25 * Math.sin(i * 3.1)) * (1 - ph * 0.4);
        ctx.globalAlpha = a * Math.sin(ph * Math.PI) * 0.9;
        ctx.drawImage(fc, f.x + Math.cos(an) * rr - h * 0.6, f.y + Math.sin(an) * rr * 0.75 - h * (0.85 + ph * 0.3), h * 1.2, h * 1.3);
      }
    }
    ctx.globalAlpha = 1;
    // Glutaura: Ring und zwei kreisende Wirbel (zwischengespeicherte Sprites statt Verlauf je Bild)
    for (const w of r.weapons) {
      if (w.id !== 'aura' || !w.rad) continue;
      w.pulse = Math.max(0, (w.pulse || 0) - 1 / 60 * 3);
      const R = w.rad * (1 + w.pulse * 0.06), col = w.evo ? '#8dffb4' : '#ffa04a';
      ctx.globalAlpha = 0.13;
      ctx.drawImage(FxArt.light(col), p.x - R * 1.05, p.y - R * 1.05, R * 2.1, R * 2.1);
      ctx.globalAlpha = 0.3 + w.pulse * 0.4;
      const rs = R * 2.9;
      ctx.drawImage(FxArt.tint('ring', col, 128), p.x - rs / 2, p.y - rs / 2, rs, rs);
      ctx.globalAlpha = 0.28;
      this.drawRot(FxArt.tint('twirl1', col, 128), p.x, p.y, t * 1.3, R * 2.3, R * 2.3);
      ctx.globalAlpha = 0.2;
      this.drawRot(FxArt.tint('twirl2', col, 128), p.x, p.y, -t * 0.9 + 2, R * 2.1, R * 2.1);
      this.resetT();
    }
    ctx.globalAlpha = 1;
    // Frostnova: dicker Eisring
    for (const f of r.fx) {
      if (f.kind !== 'nova') continue;
      const k = f.t / f.life, col = f.freeze ? '#c8faff' : '#7fd8ff';
      const R = Math.max(4, f.rad), s = R * 2.36;
      ctx.globalAlpha = 0.16 * (1 - k);
      ctx.drawImage(FxArt.light(col), f.x - R, f.y - R, R * 2, R * 2);
      ctx.globalAlpha = 1 - k * k;
      ctx.drawImage(FxArt.tint('ringThick', col, 128), f.x - s / 2, f.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;

    // Geschosse
    for (const s of r.shots) {
      if (!this.inView(s.x, s.y, 40)) continue;
      if (s.kind === 'bolt') {
        const sp = s.evo ? this.spr.boltEvo : this.spr.bolt;
        const sz = 22 * (s.r / 7), v = Math.hypot(s.vx, s.vy) || 1;
        // Schweif
        const len = sz * 2.6;
        ctx.globalAlpha = 0.85;
        this.drawRot(FxArt.tint('trace', s.evo ? '#ff7cf5' : '#a77cff', 64), s.x - s.vx / v * len * 0.5, s.y - s.vy / v * len * 0.5, Math.atan2(s.vy, s.vx) + Math.PI / 2, sz * 2.4, len * 2);
        this.resetT();
        for (let k = 2; k >= 0; k--) {
          ctx.globalAlpha = k ? 0.3 / k : 1;
          const tx = s.x - s.vx * 0.012 * k, ty = s.y - s.vy * 0.012 * k;
          const kk = 1 - k * 0.15;
          ctx.drawImage(sp, tx - sz * kk / 2, ty - sz * kk / 2, sz * kk, sz * kk);
        }
        ctx.globalAlpha = 1;
      } else if (s.kind === 'knife') {
        ctx.save();
        ctx.translate(s.x, s.y); ctx.rotate(Math.atan2(s.vy, s.vx));
        const k = s.r / 6;
        ctx.drawImage(s.evo ? this.spr.knifeEvo : this.spr.knife, -36 * k, -8 * k, 48 * k, 16 * k);
        ctx.restore();
      } else if (s.kind === 'sickle') {
        ctx.save();
        ctx.translate(s.x, s.y); ctx.rotate(s.spin);
        const sz = s.r * 3.2;
        ctx.drawImage(s.evo ? this.spr.sickleEvo : this.spr.sickle, -sz / 2, -sz / 2, sz, sz);
        ctx.restore();
      } else if (s.kind === 'flask') {
        ctx.globalCompositeOperation = 'source-over';
        const it = Sprites.item('fire');
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.t * 12);
        ctx.drawImage(it, -11, -11, 22, 22);
        ctx.restore();
        ctx.globalCompositeOperation = 'lighter';
      }
    }
    // Schutzkugeln mit Lichthof
    for (const w of r.weapons) {
      if (w.id !== 'orbit' || w.active <= 0 || !w.orbs) continue;
      const sp = w.evo ? this.spr.orbEvo : this.spr.orb;
      const halo = FxArt.tint('halo', w.evo ? '#ffd34f' : '#3fc8ff', 64);
      const sz = 40 * w.st.area, hs = sz * 1.7;
      for (let i = 0; i < w.orbs.length; i += 2) {
        ctx.globalAlpha = 0.55;
        ctx.drawImage(halo, w.orbs[i] - hs / 2, w.orbs[i + 1] - hs / 2, hs, hs);
        ctx.globalAlpha = 1;
        ctx.drawImage(sp, w.orbs[i] - sz / 2, w.orbs[i + 1] - sz / 2, sz, sz);
      }
    }
    for (const f of r.fx) {
      const k = f.t / f.life;
      if (f.kind === 'slash') {
        // Hieb: Kenney-Sichelbogen, außen farbiger Schein, innen weißer Kern
        // Sprite: flacher Bogen „)“ in der Bildmitte, gewölbt nach +x; vor den Helden in Schlagrichtung setzen
        const s = f.rad * (2.0 + k * 0.35), a = 1 - k * k, d = f.rad * (0.62 + k * 0.2);
        const cx = f.x + Math.cos(f.a) * d, cy = f.y + Math.sin(f.a) * d;
        ctx.globalAlpha = a * 0.9;
        this.drawRot(FxArt.tint('slash', f.evo ? '#ff3a5a' : '#8fd0ff', 128), cx, cy, f.a, s * 1.5, s * 1.1);
        ctx.globalAlpha = a;
        this.drawRot(FxArt.tint('slash', '#ffffff', 128), cx, cy, f.a, s, s);
        this.resetT();
      } else if (f.kind === 'zap') {
        // Blitz aus dem Himmel: Kenney-Blitz, alle 60 ms neu gewürfelt (Form und Spiegelung)
        const roll = Math.floor(t / 0.06) + Math.floor(f.x * 0.37 + f.y * 0.11);
        const nm = roll & 1 ? 'bolt1' : 'bolt2', h = 360, w = 130, flip = roll & 2 ? -1 : 1;
        ctx.globalAlpha = (1 - k) * 0.7;
        this.drawRot(FxArt.tint(nm, f.evo ? '#ffd84a' : '#5fc8ff', 128), f.x, f.y - h * 0.46, 0, w * 1.9 * flip, h);
        ctx.globalAlpha = 1 - k;
        this.drawRot(FxArt.tint(nm, f.evo ? '#fffbd0' : '#e8fbff', 128), f.x, f.y - h * 0.46, 0, w * flip, h);
        this.resetT();
        const hs = f.rad * 3.4;
        ctx.drawImage(FxArt.tint('zapHit', f.evo ? '#fff6a0' : '#d8f8ff', 64), f.x - hs / 2, f.y - hs / 2, hs, hs);
        ctx.drawImage(this.spr.orb, f.x - f.rad * 1.5, f.y - f.rad * 1.5, f.rad * 3, f.rad * 3);
      } else if (f.kind === 'arc') {
        const dx = f.x2 - f.x, dy = f.y2 - f.y, len = Math.hypot(dx, dy) || 1;
        const roll = Math.floor(t / 0.06) + Math.floor(f.x * 0.29);
        ctx.globalAlpha = 1 - k;
        this.drawRot(FxArt.tint('boltH', '#fff9a8', 128), (f.x + f.x2) / 2, (f.y + f.y2) / 2, Math.atan2(dy, dx), len * 1.1, 52 * (roll & 1 ? -1 : 1));
        this.resetT();
      } else if (f.kind === 'boom') {
        const warm = f.color === '#ff8a5c', s = f.rad * 2.5 * (0.55 + k * 0.6);
        ctx.globalAlpha = (1 - k) * (1 - k);
        this.drawRot(FxArt.raw(warm ? 'explosion' : 'burst'), f.x, f.y, f.x * 0.1, s, s);
        this.resetT();
        ctx.globalAlpha = (1 - k) * 0.8;
        const rs = f.rad * 2.4 * (0.4 + k * 0.7);
        ctx.drawImage(FxArt.tint('ring', f.color, 128), f.x - rs / 2, f.y - rs / 2, rs, rs);
      }
    }
    ctx.globalAlpha = 1;
    for (const s of r.eshots) {
      if (!this.inView(s.x, s.y, 20)) continue;
      const sz = s.r * 3.4;
      ctx.drawImage(this.spr.eshot, s.x - sz / 2, s.y - sz / 2, sz, sz);
    }
    // Partikel: eingefärbte Funken und weiche Punkte (bei Leistungsmangel einfache Quadrate)
    if (Q.sprites) {
      const ps = r.parts;
      for (let i = 0; i < ps.length; i++) {
        const q = ps[i];
        const sp = q._sp || (q._sp = FxArt.tint(i % 3 ? 'dot' : 'spark', q.color, 32));
        const s = q.size * (0.5 + q.life / q.max * 0.5) * (i % 3 ? 3.2 : 3.6);
        ctx.globalAlpha = Math.min(1, q.life / q.max * 1.5);
        ctx.drawImage(sp, q.x - s / 2, q.y - s / 2, s, s);
      }
    } else {
      // Sparstufe: Quadrate, je Farbe ein einziger Pfad (wenige Zeichenbefehle statt hunderter)
      const paths = this.ppaths || (this.ppaths = new Map());
      for (const pa of paths.values()) pa.n = 0;
      for (const q of r.parts) {
        let pa = paths.get(q.color);
        if (!pa || !pa.n) { if (!pa) { pa = { n: 0 }; paths.set(q.color, pa); } pa.p = new Path2D(); }
        pa.n++;
        const s = q.size * (0.5 + q.life / q.max * 0.5);
        pa.p.rect(q.x - s / 2, q.y - s / 2, s, s);
      }
      ctx.globalAlpha = 0.85;
      for (const [col, pa] of paths) if (pa.n) { ctx.fillStyle = col; ctx.fill(pa.p); }
    }
    // Schweife der angezogenen Edelsteine
    for (let i = 0; i < trails.length; i += 6) {
      const L = clamp(trails[i + 4] * 4, 12, 64), ux = trails[i + 2], uy = trails[i + 3];
      ctx.globalAlpha = 0.8;
      this.drawRot(FxArt.tint('trace', Sprites.GEM_COLORS[trails[i + 5]], 64), trails[i] - ux * L * 0.45, trails[i + 1] - uy * L * 0.45, Math.atan2(uy, ux) + Math.PI / 2, 44, L * 2);
    }
    this.resetT();
    this.drawVfx();
    this.drawLevelFx(p);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Namensschilder der Elitegegner
    if (this.tags.length) {
      const z = this.zoom;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = Math.round(13 / z * 10) / 10 + 'px "Lilita One", Impact, sans-serif';
      ctx.lineWidth = 3.5 / z; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(30,14,0,0.9)';
      ctx.fillStyle = '#ffd34f';
      const label = tr('Elite').toUpperCase();
      for (const e of this.tags) {
        const y = e.y - e.r * 1.2 - 20;
        ctx.strokeText('★ ' + label + ' ★', e.x, y);
        ctx.fillText('★ ' + label + ' ★', e.x, y);
      }
    }

    // Schadenszahlen
    if (Store.data.settings.dmgNums) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Größe in Bildschirmpixeln (mind. 14 px), unabhängig vom Zoom
      const z = this.zoom;
      ctx.lineWidth = 3.5 / z;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      for (const tx of r.texts) {
        const k = tx.t / 0.7;
        const pop = tx.t < 0.08 ? 1 + (0.08 - tx.t) * 6 : 1;
        ctx.globalAlpha = 1 - k * k;
        ctx.font = 'bold ' + Math.ceil(Math.max(14, 13 * tx.scale) * pop / z * 10) / 10 + 'px "Lilita One", Impact, sans-serif';
        ctx.strokeText(tx.txt, tx.x, tx.y);
        ctx.fillStyle = tx.color;
        ctx.fillText(tx.txt, tx.x, tx.y);
      }
      ctx.globalAlpha = 1;
    }
  },

  // Bild um (x, y) zentriert, gedreht um a (Weltkoordinaten); danach resetT() aufrufen
  drawRot(img, x, y, a, w, h) {
    const k = this.dpr * this.zoom, B = this.base, c = Math.cos(a) * k, s = Math.sin(a) * k;
    const fy = h < 0 ? -1 : 1, fx = w < 0 ? -1 : 1;
    this.ctx.setTransform(c * fx, s * fx, -s * fy, c * fy, B.x + k * x, B.y + k * y);
    this.ctx.drawImage(img, -Math.abs(w) / 2, -Math.abs(h) / 2, Math.abs(w), Math.abs(h));
  },
  resetT() {
    const k = this.dpr * this.zoom;
    this.ctx.setTransform(k, 0, 0, k, this.base.x, this.base.y);
  },

  // ---------- Lichtkarte ----------
  // Umgebungsfarbe des Landes, darauf additiv alle Lichtquellen, dann die Vignette; das Ganze wird mit der
  // Szene multipliziert. Halbe (oder geringere) Auflösung, ein einziger Vollbild-Durchgang.
  drawLightMap(r) {
    const g = this.lmG, w = this.lm.width, h = this.lm.height, s = this.lmS;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = this.ambient;
    g.fillRect(0, 0, w, h);
    if (r) {
      g.globalCompositeOperation = 'lighter';
      this.lk = this.zoom * s; this.lox = this.base.x / this.dpr * s; this.loy = this.base.y / this.dpr * s;
      this.addLights(r);
      g.globalAlpha = 1;
    }
    g.globalCompositeOperation = 'multiply';
    g.drawImage(this.lmVig, 0, 0);
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 1;
    ctx.drawImage(this.lm, 0, 0, this.cv.width, this.cv.height);
    ctx.globalCompositeOperation = 'source-over';
    this.resetT();
  },

  light(x, y, rad, color, a) {
    const R = rad * this.lk, X = x * this.lk + this.lox, Y = y * this.lk + this.loy;
    if (X + R < 0 || Y + R < 0 || X - R > this.lm.width || Y - R > this.lm.height || a <= 0.01) return;
    this.lmG.globalAlpha = Math.min(1, a);
    this.lmG.drawImage(FxArt.light(color), X - R, Y - R, R * 2, R * 2);
  },

  addLights(r) {
    const t = this.time, p = r.p, Q = QUALITY[this.quality];
    // Glut des Helden: warm, leicht flackernd
    const fl = 1 + Math.sin(t * 9) * 0.025 + Math.sin(t * 13.7) * 0.02;
    this.light(p.x, p.y - 6, 380 * fl, '#ffb877', 1);
    this.light(p.x, p.y - 6, 150 * fl, '#ffe2b8', 0.75);
    for (const pr of r.propList) {
      const f2 = 0.9 + Math.sin(t * 13 + pr.x) * 0.07 + Math.sin(t * 7.3 + pr.y) * 0.04;
      this.light(pr.x, pr.y - 10, 240 * f2, '#ff9a48', 0.95);
    }
    for (const it of r.pickups) {
      if (it.kind === 'chest') this.light(it.x, it.y, 140, '#ffcf5a', 0.9);
      else this.light(it.x, it.y, 46, '#ffe2a8', 0.45);
    }
    if (Q.gemLights) {
      let n = 0;
      for (const g of r.gems) {
        if (!this.inView(g.x, g.y, 30)) continue;
        this.light(g.x, g.y, 42, Sprites.GEM_COLORS[Sprites.gemTier(g.v)], 0.55);
        if (++n > 90) break;
      }
    }
    for (const s of r.shots) {
      if (s.kind === 'bolt') this.light(s.x, s.y, 64, s.evo ? '#ff7cf5' : '#a77cff', 0.65);
      else if (s.kind === 'flask') this.light(s.x, s.y, 54, '#ff9a48', 0.6);
      else if (s.kind === 'sickle') this.light(s.x, s.y, 54, '#d8f0ff', 0.35);
    }
    for (const w of r.weapons) {
      if (w.id === 'aura' && w.rad) this.light(p.x, p.y, w.rad * 1.15, w.evo ? '#8dffb4' : '#ff9a48', 0.3);
      if (w.id !== 'orbit' || w.active <= 0 || !w.orbs) continue;
      for (let i = 0; i < w.orbs.length; i += 2) this.light(w.orbs[i], w.orbs[i + 1], 84, w.evo ? '#ffd34f' : '#5fd0ff', 0.7);
    }
    for (const f of r.fx) {
      const k = f.t / f.life;
      if (f.kind === 'pool') this.light(f.x, f.y, f.rad * 1.7, f.evo ? '#ff5ad8' : '#ff7a30', Math.min(1, (f.life - f.t) * 3, f.t * 6) * 0.9);
      else if (f.kind === 'nova') this.light(f.x, f.y, Math.max(20, f.rad) * 1.15, '#7fd8ff', (1 - k) * 0.7);
      else if (f.kind === 'zap') this.light(f.x, f.y, 150, '#d8f6ff', 1 - k);
      else if (f.kind === 'arc') this.light((f.x + f.x2) / 2, (f.y + f.y2) / 2, 90, '#fff9a8', (1 - k) * 0.7);
      else if (f.kind === 'boom') this.light(f.x, f.y, f.rad * 1.8, '#ffc070', 1 - k);
      else if (f.kind === 'slash') this.light(f.x + Math.cos(f.a) * f.rad * 0.6, f.y + Math.sin(f.a) * f.rad * 0.6, f.rad * 1.2, '#dff2ff', (1 - k) * 0.35);
    }
    for (const s of r.eshots) this.light(s.x, s.y, 46, '#ff4060', 0.6);
    for (const e of this.list) {
      if (e.elite) this.light(e.x, e.y, 135, '#ffcc50', 0.85);
      else if (e.boss) this.light(e.x, e.y, e.r * 4, '#ff6a7a', 0.55);
    }
    if (this.quality === 0) for (const c of this.corpses) this.light(c.x, c.y, c.r * 3.5, c.col, (1 - c.t / c.life) * 0.6);
    for (const v of this.vfx) this.light(v.x, v.y, v.rad * 2.2, '#ffc070', 1 - v.t / v.life);
    const L = this.lvlFx;
    if (L) { const k = L.t / 1.2; this.light(p.x, p.y, 220 + 420 * Math.sqrt(k), '#ffe6a0', (1 - k) * 0.95); }
  },

  // ---------- Treffer, Tod, Stufenaufstieg ----------
  onKill(e) {
    const r = Game.run;
    if (!r) return;
    const p = r.p;
    if (this.corpses.length < 90 || e.elite || e.boss) {
      this.corpses.push({ type: e.type, tint: e.tint, x: e.x, y: e.y, r: e.r, sc: e.r / Sprites.baseR(e.type), t: 0,
        life: e.boss ? 0.5 : 0.24, flip: e.swarm ? e.sdx < 0 : p.x < e.x, col: ENEMY_COLORS[e.type] || '#ffffff' });
    }
    if (e.boss || e.elite) this.vfx.push({ x: e.x, y: e.y, rad: e.boss ? e.r * 2.6 : e.r * 2.2, t: 0, life: e.boss ? 0.9 : 0.55, boss: !!e.boss });
  },

  // Besiegte: kurz weiß, erst gestreckt, dann flachgedrückt und ausgeblendet (Füße bleiben am Boden)
  drawCorpses() {
    const cs = this.corpses, ctx = this.ctx, k0 = this.dpr * this.zoom, B = this.base;
    for (let i = cs.length - 1; i >= 0; i--) {
      const c = cs[i];
      c.t += this.fxDt;
      const k = c.t / c.life;
      if (k >= 1) { cs[i] = cs[cs.length - 1]; cs.pop(); continue; }
      if (!this.inView(c.x, c.y, c.r + 30)) continue;
      const spr = Sprites.enemy(c.type, 0, 1, c.tint), size = spr.size * c.sc;
      const sx = k < 0.25 ? 1 - k * 0.6 : 0.85 + (k - 0.25) * 1.1, sy = k < 0.25 ? 1 + k * 0.8 : 1.2 - (k - 0.25) * 1.3;
      ctx.globalAlpha = 1 - k * k;
      ctx.setTransform(k0 * sx * (c.flip ? -1 : 1), 0, 0, k0 * sy, B.x + k0 * c.x, B.y + k0 * (c.y + size * 0.35 * (1 - sy)));
      ctx.drawImage(spr, -size / 2, -size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    this.resetT();
  },

  // Explosionen von Elite und Boss (additiv)
  drawVfx() {
    const ctx = this.ctx, vs = this.vfx;
    for (let i = vs.length - 1; i >= 0; i--) {
      const v = vs[i];
      v.t += this.fxDt;
      const k = v.t / v.life;
      if (k >= 1) { vs[i] = vs[vs.length - 1]; vs.pop(); continue; }
      const s = v.rad * 2 * (0.5 + k * 0.8);
      ctx.globalAlpha = (1 - k) * (1 - k);
      this.drawRot(FxArt.raw(v.boss ? 'explosion' : 'burst'), v.x, v.y, v.x * 0.07 + k * 0.6, s, s);
      ctx.globalAlpha = (1 - k) * 0.9;
      const rs = v.rad * 2.6 * (0.3 + k);
      this.drawRot(FxArt.tint('ring', v.boss ? '#ff8a5c' : '#ffd34f', 128), v.x, v.y, 0, rs, rs);
    }
    this.resetT();
  },

  // Stufenaufstieg: 150 ms stehendes Bild, Lichtstoß, zwei Ringe, Stern und Funken; läuft nach den Karten weiter
  levelUp() {
    const r = Game.run;
    if (!r) return;
    this.lvlFx = { t: 0, stop: 0.15 };
  },

  drawLevelFx(p) {
    const L = this.lvlFx;
    if (!L) return;
    const ctx = this.ctx, t = L.t;
    for (const [d, col] of [[0, '#ffe08a'], [0.12, '#fff4d0']]) {
      const k = (t - d) / 0.75;
      if (k <= 0 || k >= 1) continue;
      const rs = 60 + 620 * (1 - (1 - k) * (1 - k));
      ctx.globalAlpha = (1 - k) * 0.95;
      ctx.drawImage(FxArt.tint('ring', col, 128), p.x - rs / 2, p.y - rs / 2, rs, rs);
    }
    const k = Math.min(1, t / 0.6);
    if (k < 1) {
      const fs = 170 * (1 - k * 0.6);
      ctx.globalAlpha = 1 - k;
      this.drawRot(FxArt.tint('flare', '#ffe9a8', 64), p.x, p.y - 8, t * 2, fs, fs);
      const st = FxArt.tint('star', '#fff1b8', 64);
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * TAU + i, d = 30 + 260 * Math.sqrt(k) * (0.6 + (i % 3) * 0.2), ss = 26 * (1 - k) + 6;
        this.drawRot(st, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.8 - 8, t * 3 + i, ss, ss);
      }
      this.resetT();
    }
    ctx.globalAlpha = 1;
  },

  // Waagrecht gespiegelte Fassung eines Sprites (einmal erzeugt, am Sprite gemerkt)
  mirror(c) {
    if (c._mir) return c._mir;
    const m = document.createElement('canvas');
    m.width = c.width; m.height = c.height;
    const g = m.getContext('2d');
    g.translate(c.width, 0); g.scale(-1, 1);
    g.drawImage(c, 0, 0);
    m.size = c.size;
    c._mir = m;
    return m;
  },

  drawEnemy(e, p) {
    const ctx = this.ctx;
    const frame = Math.floor(e.anim * 5 + e.id) % 2;
    const variant = e.flash > 0 ? 1 : (e.slowT > 0 || e.freezeT > 0) ? 2 : 0;
    // Sprite am Gegner merken, solange Bild und Variante gleich bleiben (spart hunderte Nachschlagungen je Bild)
    if (e._rf !== frame || e._rv !== variant || !e._rs) { e._rs = Sprites.enemy(e.type, frame, variant, e.tint); e._rf = frame; e._rv = variant; e._rsc = e.r / Sprites.baseR(e.type); }
    const spr = e._rs, sc = e._rsc;
    const size = spr.size * sc;
    const flip = e.swarm ? e.sdx < 0 : p.x < e.x;
    const bob = e.freezeT > 0 ? 0 : Math.sin(e.anim * 9 + e.id) * e.r * 0.06;
    if (e.boss) {
      ctx.globalCompositeOperation = 'lighter';
      const gs = e.r * 3.2 * (1 + Math.sin(this.time * 5) * 0.06);
      ctx.drawImage(this.spr.boltEvo, e.x - gs / 2, e.y - gs / 2, gs, gs);
      ctx.globalCompositeOperation = 'source-over';
    } else if (e.elite) {
      // Elite: goldener Schein, Ring am Boden, goldener Umriss und Namensschild
      const pu = 1 + Math.sin(this.time * 5) * 0.06;
      ctx.globalCompositeOperation = 'lighter';
      const gs = e.r * 3.4 * pu;
      ctx.drawImage(this.spr.light, e.x - gs / 2, e.y - gs / 2, gs, gs);
      const rw = e.r * 3.6 * pu;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(FxArt.tint('ring', '#ffd34f', 128), e.x - rw / 2, e.y + e.r * 0.8 - rw * 0.2, rw, rw * 0.4);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      const gold = spr._gold || (spr._gold = Sprites.tintVariant(spr, '#ffd34f', 1));
      const os = size * 1.16;
      ctx.drawImage(flip ? this.mirror(gold) : gold, e.x - os / 2, e.y + bob - os / 2 - size * 0.02, os, os);
      this.tags.push(e);
    }
    // gespiegelte Fassung aus dem Zwischenspeicher statt eigener Transformation je Gegner (spürbar schneller bei hunderten)
    ctx.drawImage(flip ? this.mirror(spr) : spr, e.x - size / 2, e.y + bob - size / 2, size, size);
    if (e.boss && e.boss.id === 'slimeking') {
      ctx.save(); ctx.translate(e.x, e.y - e.r * 0.95 + bob);
      ctx.fillStyle = '#ffd34f';
      const w = e.r * 0.8;
      ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(-w / 2, -w * 0.5); ctx.lineTo(-w / 4, -w * 0.25); ctx.lineTo(0, -w * 0.6); ctx.lineTo(w / 4, -w * 0.25); ctx.lineTo(w / 2, -w * 0.5); ctx.lineTo(w / 2, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    if (e.elite && e.hp < e.maxHp) {
      const w = e.r * 1.6;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w, 5);
      ctx.fillStyle = '#ffd34f';
      ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w * Math.max(0, e.hp / e.maxHp), 5);
    }
  },

  drawPlayer(r) {
    const ctx = this.ctx, p = r.p;
    const ch = CHARS[r.char];
    const frame = p.moving ? 1 + (Math.floor(p.walk) % 2) : 0;
    const blink = p.iframe > 0 && Math.floor(this.time * 20) % 2 === 0;
    const spr = Sprites.player(ch.color, frame, p.flash > 0);
    ctx.save();
    const PS = PLAYER_DRAW_SCALE;
    ctx.translate(p.x, p.y + (p.moving ? Math.abs(Math.sin(p.walk * Math.PI / 2)) * -2 : 0));
    ctx.scale(p.face < 0 ? -PS : PS, PS);
    if (blink) ctx.globalAlpha = 0.45;
    ctx.drawImage(spr, -spr.size / 2, -spr.size / 2, spr.size, spr.size);
    ctx.restore();
    ctx.globalAlpha = 1;
    // Lebensleiste
    const w = 40, k = Math.max(0, p.hp / r.stats.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(p.x - w / 2 - 1, p.y + 23, w + 2, 8);
    ctx.fillStyle = k > 0.5 ? '#5dff8f' : k > 0.25 ? '#ffd34f' : '#ff5a6e';
    ctx.fillRect(p.x - w / 2, p.y + 24, w * k, 6);
  },

  drawScreenFx(r, dt) {
    const ctx = this.ctx, p = r.p;
    const k = p.hp / r.stats.maxHp;
    if (k < 0.35) {
      ctx.globalAlpha = (0.35 - k) / 0.35 * (0.7 + Math.sin(this.time * 6) * 0.3);
      ctx.drawImage(this.hurtVig, 0, 0, this.W, this.H);
    }
    if (p.flash > 0) {
      ctx.globalAlpha = p.flash * 1.6;
      ctx.drawImage(this.hurtVig, 0, 0, this.W, this.H);
    }
    ctx.globalAlpha = 1;
    for (const f of r.fx) {
      if (f.kind !== 'flash') continue;
      ctx.globalAlpha = 1 - f.t / f.life;
      ctx.fillStyle = '#fff6dc';
      ctx.fillRect(0, 0, this.W, this.H);
    }
    ctx.globalAlpha = 1;
    // Pfeile zu Truhen und Bossen außerhalb des Sichtfelds
    const marks = [];
    for (const it of r.pickups) if (it.kind === 'chest') marks.push([it.x, it.y, 'chest']);
    for (const b of r.bosses) if (!b.dead) marks.push([b.x, b.y, 'skull']);
    for (const [x, y, icon] of marks) {
      const s = this.toScreen(x, y);
      const m = 34;
      if (s.x > m && s.x < this.W - m && s.y > m && s.y < this.H - m) continue;
      const ex = clamp(s.x, m, this.W - m), ey = clamp(s.y, m + 40, this.H - m);
      const a = Math.atan2(s.y - this.H / 2, s.x - this.W / 2);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.fillStyle = icon === 'chest' ? 'rgba(255,210,80,0.9)' : 'rgba(255,80,100,0.9)';
      ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(24, 0); ctx.lineTo(12, -8); ctx.lineTo(12, 8); ctx.closePath(); ctx.fill();
      ctx.rotate(-a);
      ctx.fillStyle = 'rgba(10,6,25,0.7)';
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.fill();
      const sp = Sprites.item(icon);
      ctx.drawImage(sp, -11, -11, 22, 22);
      ctx.restore();
    }
    // Einstiegshilfe in den ersten Läufen: Tasten- bzw. Wisch-Bild unter dem Helden, verblasst nach dem ersten Schritt
    if (Store.data.stats.runs <= 2 && r.t < 40) {
      const s = this.toScreen(p.x, p.y), y = s.y + 31 * this.zoom + (Input.touch ? 54 : 40); // unter der Lebensleiste
      this.hintA = clamp(this.hintA + (r.moved ? -3 : 3) * dt, 0, 1);
      if (this.hintA > 0) this.drawMoveHint(s.x, y, this.hintA);
      else if (r.moved && r.level === 1 && r.t > 6) {
        const txt = tr('Sammle die blauen Edelsteine!');
        ctx.globalAlpha = 0.75 + Math.sin(this.time * 5) * 0.25;
        ctx.font = '19px "Lilita One", Impact, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(txt, s.x, y);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(txt, s.x, y);
        ctx.globalAlpha = 1;
      }
    } else this.hintA = 0;
    Input.drawJoystick(ctx);
  },

  // Bewegungshinweis ohne Text: WASD- und Pfeiltasten (Tastatur) oder Daumen im Ring (Touch)
  drawMoveHint(cx, cy, a) {
    const ctx = this.ctx, t = this.time;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (Input.touch) {
      const R = 30, ph = t * 2.2;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.fillStyle = 'rgba(10,6,25,0.55)';
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 4; i++) { // Pfeilspitzen am Ring
        const an = i * TAU / 4;
        ctx.save(); ctx.translate(cx + Math.cos(an) * (R + 9), cy + Math.sin(an) * (R + 9)); ctx.rotate(an);
        ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(-3, -5); ctx.lineTo(-3, 5); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      const tx = cx + Math.cos(ph) * R * 0.55, ty = cy + Math.sin(ph) * R * 0.55;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(255,170,80,0.9)'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(tx, ty, 12, 0, TAU); ctx.fill();
    } else {
      const k = 26, g = 4, step = Math.floor(t / 0.45) % 4;
      const key = (x, y, label, down, arrow) => {
        const yy = y + (down ? 2 : 0);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        roundRect(ctx, x, y + 3, k, k, 6); ctx.fill();
        ctx.fillStyle = down ? '#ffb057' : 'rgba(28,18,58,0.92)';
        ctx.strokeStyle = down ? '#ffd39a' : 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
        roundRect(ctx, x, yy, k, k, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = down ? '#2a0e00' : '#ffffff';
        if (arrow !== undefined) {
          ctx.save(); ctx.translate(x + k / 2, yy + k / 2); ctx.rotate(arrow);
          ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -6); ctx.lineTo(-4, 6); ctx.closePath(); ctx.fill();
          ctx.restore();
        } else {
          ctx.font = '16px "Lilita One", Impact, sans-serif';
          ctx.fillText(label, x + k / 2, yy + k / 2 + 1);
        }
      };
      const cw = 3 * k + 2 * g, gap = 22, x0 = cx - cw - gap / 2, x1 = cx + gap / 2, y0 = cy - k - g / 2, y1 = cy + g / 2;
      // Reihenfolge des „Drückens“: oben, links, unten, rechts
      key(x0 + k + g, y0, 'W', step === 0); key(x0, y1, 'A', step === 1); key(x0 + k + g, y1, 'S', step === 2); key(x0 + 2 * (k + g), y1, 'D', step === 3);
      key(x1 + k + g, y0, '', step === 0, -Math.PI / 2); key(x1, y1, '', step === 1, Math.PI); key(x1 + k + g, y1, '', step === 2, Math.PI / 2); key(x1 + 2 * (k + g), y1, '', step === 3, 0);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '15px "Lilita One", Impact, sans-serif';
      ctx.fillText('/', cx, y1 + k / 2);
    }
    ctx.restore();
  },

  // ---------- Titelbild im Menü: Held mit Glut, links; Monster-Schattenrisse mit Glutrand und leuchtenden Augen ----------
  KEYART_EYES: { // Augen relativ zum Radius: [y, Abstand, Größe, Farbe] (wie in Sprites.ENEMY_DRAW)
    bat: [-0.08, 0.24, 0.13, '#ff4060'], ghoul: [-0.2, 0.3, 0.14, '#9dff4f'], wraith: [-0.22, 0.2, 0.1, '#ffe14f'],
    brute: [-0.1, 0.27, 0.09, '#ffde4f'], golem: [-0.25, 0.3, 0.12, '#5ff2ff'],
  },

  keyArtLayout(land) {
    // [Typ, x (Anteil Breite), Fußlinie y (Anteil Höhe), Höhe relativ zum Helden, Blick nach links]
    return land ? [
      ['golem', 1.0, 0.74, 1.25, 1], ['brute', 0.9, 0.97, 1.0, 1], ['ghoul', 0.79, 1.02, 0.7, 1],
      ['wraith', 0.88, 0.5, 0.55, 1], ['bat', 0.93, 0.2, 0.4, 1], ['bat', 0.78, 0.13, 0.32, 1], ['ghoul', 0.0, 1.0, 0.7, 0],
    ] : [
      // Hochformat: Menü füllt die Mitte, die Horde bleibt in den Ecken
      ['brute', 0.9, 1.02, 1.0, 1], ['ghoul', 0.1, 1.02, 0.85, 0], ['wraith', 0.5, 0.11, 0.45, 1],
      ['bat', 0.14, 0.12, 0.45, 0], ['bat', 0.86, 0.17, 0.4, 1],
    ];
  },

  drawKeyArt(dt) {
    this.keyArtA = clamp(this.keyArtA + (this.keyArtOn ? 2.5 : -2.5) * dt, 0, 1);
    const A = this.keyArtA;
    if (A <= 0) return;
    const ctx = this.ctx, W = this.W, H = this.H, t = this.time, d = this.dpr;
    const land = W >= H * 1.15;
    const hh = land ? clamp(H * 0.26, 70, 220) : clamp(H * 0.14, 70, 150); // sichtbare Heldenhöhe in px
    const hx = land ? Math.max(hh * 0.9, W * 0.13) : W * 0.5;
    const gy = land ? H * 0.88 : H - Math.max(18, H * 0.04);
    const fl = 1 + Math.sin(t * 9) * 0.03 + Math.sin(t * 13.7) * 0.02;
    const s = hh / 31; // Spieler-Sprite: rund 31 sichtbare Einheiten hoch, Füße bei +17,4

    // Glut-Schein um den Helden und auf dem Boden
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = A;
    const ex = hx + 9 * s, ey = gy - 21 * s;
    let gr = ctx.createRadialGradient(ex, ey, 0, ex, ey, hh * 2.4 * fl);
    gr.addColorStop(0, 'rgba(255,170,80,0.42)'); gr.addColorStop(0.3, 'rgba(255,110,40,0.16)'); gr.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    // violetter Nebel hinter der Horde
    const mx = land ? W * 0.86 : W * 0.5, my = land ? H * 0.7 : H * 0.15;
    gr = ctx.createRadialGradient(mx, my, 0, mx, my, Math.max(W, H) * 0.45);
    gr.addColorStop(0, 'rgba(110,50,190,0.16)'); gr.addColorStop(1, 'rgba(110,50,190,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';

    // Monster: Glutrand (zum Helden hin versetzt), darüber dunkler Schattenriss, dann Augen
    const list = this.keyArtLayout(land);
    list.forEach(([type, fx, fy, rel, faceL], i) => {
      const R = Sprites.baseR(type), frame = type === 'bat' ? Math.floor(t * 5 + i) % 2 : 0;
      const box = hh * rel * 1.55; // Spritekasten (Figur ist etwas kleiner)
      const sc = box / (R * 3.4);
      const bob = Math.sin(t * (type === 'bat' || type === 'wraith' ? 3 : 1.6) + i * 1.7) * hh * (type === 'bat' || type === 'wraith' ? 0.05 : 0.012);
      const x = fx * W, y = fy * H - box * 0.36 + bob;
      const k = clamp(Math.ceil(box * d / (R * 3.4) / 2), 1, 6);
      const base = Sprites.hires('ka-' + type + frame, k, () => Sprites.enemy(type, frame, 0, null));
      const rim = Sprites.hires('ka-rim-' + type + frame, k, () => Sprites.tintVariant(base, '#ff9a4a', 1));
      const sil = Sprites.hires('ka-sil-' + type + frame, k, () => Sprites.tintVariant(base, '#08040f', 0.9));
      const dirx = Math.sign(hx - x) || 1, off = Math.max(1.5, box * 0.025);
      ctx.save();
      ctx.translate(x, y);
      if (faceL) ctx.scale(-1, 1);
      const lx = dirx * (faceL ? -1 : 1);
      ctx.globalAlpha = A * 0.75;
      ctx.drawImage(rim, -box / 2 + lx * off, -box / 2 - off * 0.6, box, box);
      ctx.globalAlpha = A;
      ctx.drawImage(sil, -box / 2, -box / 2, box, box);
      const e = this.KEYART_EYES[type];
      if (e) {
        ctx.globalCompositeOperation = 'lighter';
        const blink = (Math.sin(t * 0.9 + i * 2.3) > 0.97) ? 0.15 : 1;
        const ey2 = e[0] * R * sc, gx = e[1] * R * sc, er = Math.max(2, e[2] * R * sc);
        const gl = this.eyeGlow(e[3]);
        ctx.globalAlpha = A * blink;
        for (const sx of [-1, 1]) ctx.drawImage(gl, sx * gx - er * 2, ey2 - er * 2, er * 4, er * 4);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
    });

    // Held (schaut nach rechts zur Horde) mit Glut in der Hand
    const ch = CHARS[Store.data.lastChar] || CHARS.aron;
    const p0 = Sprites.player(ch.color, 0, false);
    const k = clamp(Math.ceil(46 * s * d / p0.width), 1, 8);
    const hero = Sprites.hires('ka-hero' + ch.color, k, () => Sprites.player(ch.color, 0, false));
    ctx.globalAlpha = A * 0.5;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(hx, gy, 12 * s, 3.5 * s, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = A;
    const by = Math.sin(t * 1.8) * s * 0.4;
    ctx.drawImage(hero, hx - 23 * s, gy - 17.4 * s - 23 * s + by, 46 * s, 46 * s);
    ctx.globalCompositeOperation = 'lighter';
    const fs = 22 * s * fl;
    ctx.drawImage(this.spr.flame, ex - fs / 2, ey - fs * 0.6 + by, fs, fs);
    ctx.globalAlpha = A * 0.8;
    ctx.drawImage(this.spr.flame, ex - fs / 4, ey - fs * 0.3 + by, fs / 2, fs / 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  },

  eyeGlow(col) {
    const k = 'eye' + col;
    if (!this.spr[k]) this.spr[k] = this.glowSprite(32, '#ffffff', col);
    return this.spr[k];
  },

  drawEmbers(dt) {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    for (const e of this.embers) {
      e.y -= e.v * dt / this.H;
      if (e.y < -0.02) { e.y = 1.02; e.x = Math.random(); }
      const x = (e.x + Math.sin(this.time * 0.8 + e.ph) * 0.01) * this.W, y = e.y * this.H;
      ctx.globalAlpha = 0.5 + Math.sin(this.time * 3 + e.ph) * 0.3;
      ctx.drawImage(this.spr.flame, x - e.s * 3, y - e.s * 3, e.s * 6, e.s * 6);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  },
};
