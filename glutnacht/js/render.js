'use strict';
// Zeichnet die Spielwelt auf das Canvas. Kamera folgt dem Spieler.

const Render = {
  cv: null, ctx: null, dpr: 1, W: 0, H: 0, zoom: 1,
  cam: { x: 0, y: 0 }, base: { x: 0, y: 0 }, shake: 0, flash: 0, time: 0,
  pattern: null, vignette: null, hurtVig: null, spr: {}, list: [], embers: [],

  init(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    const tile = Sprites.groundTile();
    this.pattern = this.ctx.createPattern(tile, 'repeat');
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
    for (let i = 0; i < 40; i++) this.embers.push({ x: Math.random(), y: Math.random(), s: rand(1, 3), v: rand(10, 40), ph: rand(0, TAU) });
    this.resize();
  },

  // Leuchtpunkt: heller Kern (c0), farbiger Hof (c1), transparent am Rand
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
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth, H = window.innerHeight;
    this.dpr = dpr; this.W = W; this.H = H;
    this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr);
    this.cv.style.width = W + 'px'; this.cv.style.height = H + 'px';
    // Hochformat-Handys: die Höhe als zweite Untergrenze, sonst wird alles winzig
    this.zoom = clamp(Math.max(Math.min(W, H) / 660, H > W ? H / 1200 : 0), 0.55, 1.4);
    Game.view.hw = W / 2 / this.zoom;
    Game.view.hh = H / 2 / this.zoom;
    this.vignette = this.makeVignette(W, H, 'rgba(6,2,20,0)', 'rgba(6,2,20,0.78)', 0.32);
    this.hurtVig = this.makeVignette(W, H, 'rgba(255,0,40,0)', 'rgba(255,0,40,0.55)', 0.45);
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
    if (inRun) { this.cam.x = r.p.x; this.cam.y = r.p.y; }
    else { this.cam.x += 18 * dt; this.cam.y += 7 * dt; }
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

    if (inRun) this.drawWorld(r, vx0, vy0, vx1, vy1);

    // Bildschirm-Ebene
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(this.vignette, 0, 0, this.W, this.H);
    if (inRun) this.drawScreenFx(r, dt);
    else this.drawEmbers(dt);
  },

  drawDecor(x0, y0, x1, y1) {
    const ctx = this.ctx, C = 150;
    for (let cx = Math.floor(x0 / C); cx <= Math.floor(x1 / C); cx++) {
      for (let cy = Math.floor(y0 / C); cy <= Math.floor(y1 / C); cy++) {
        if (hash2(cx, cy, 3) > 0.2) continue;
        const kind = Sprites.DECOS[Math.floor(hash2(cx, cy, 4) * Sprites.DECOS.length)];
        const s = Sprites.deco(kind);
        const x = (cx + 0.1 + hash2(cx, cy, 5) * 0.8) * C, y = (cy + 0.1 + hash2(cx, cy, 6) * 0.8) * C;
        ctx.drawImage(s, x - s.size / 2, y - s.size / 2, s.size, s.size);
      }
    }
  },

  inView(x, y, m) {
    const hw = Game.view.hw + m, hh = Game.view.hh + m;
    return Math.abs(x - this.cam.x) < hw && Math.abs(y - this.cam.y) < hh;
  },

  drawWorld(r, x0, y0, x1, y1) {
    const ctx = this.ctx, t = this.time, p = r.p;

    // Kohlebecken
    for (const pr of r.propList) {
      if (!this.inView(pr.x, pr.y, 60)) continue;
      const b = Sprites.brazier();
      ctx.drawImage(b, pr.x - b.size / 2, pr.y - b.size / 2, b.size, b.size);
    }

    // Bodeneffekte (additiv)
    ctx.globalCompositeOperation = 'lighter';
    for (const pr of r.propList) {
      if (!this.inView(pr.x, pr.y, 120)) continue;
      const fl = 0.85 + Math.sin(t * 13 + pr.x) * 0.1 + Math.sin(t * 7.3 + pr.y) * 0.05;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(this.spr.light, pr.x - 100 * fl, pr.y - 100 * fl, 200 * fl, 200 * fl);
      ctx.globalAlpha = 1;
      ctx.drawImage(this.spr.flame, pr.x - 14 * fl, pr.y - 30 * fl, 28 * fl, 34 * fl);
    }
    for (const f of r.fx) {
      if (f.kind !== 'pool') continue;
      const a = Math.min(1, (f.life - f.t) * 3, f.t * 6);
      const fl = 1 + Math.sin(t * 20 + f.x) * 0.04;
      ctx.globalAlpha = a;
      const s = f.rad * 2.3 * fl;
      ctx.drawImage(f.evo ? this.spr.poolEvo : this.spr.pool, f.x - s / 2, f.y - s / 2 * 0.75, s, s * 0.75);
    }
    ctx.globalAlpha = 1;
    for (const w of r.weapons) {
      if (w.id !== 'aura' || !w.rad) continue;
      w.pulse = Math.max(0, (w.pulse || 0) - 1 / 60 * 3);
      const R = w.rad * (1 + w.pulse * 0.06);
      const gr = ctx.createRadialGradient(p.x, p.y, R * 0.2, p.x, p.y, R);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(0.75, w.evo ? 'rgba(120,255,170,0.06)' : 'rgba(255,140,40,0.06)');
      gr.addColorStop(0.97, w.evo ? 'rgba(200,255,150,' + (0.22 + w.pulse * 0.2) + ')' : 'rgba(255,190,90,' + (0.2 + w.pulse * 0.2) + ')');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, TAU); ctx.fill();
    }
    for (const f of r.fx) {
      if (f.kind !== 'nova') continue;
      const k = f.t / f.life;
      ctx.strokeStyle = f.freeze ? 'rgba(200,250,255,' + (1 - k) + ')' : 'rgba(127,216,255,' + (1 - k) + ')';
      ctx.lineWidth = 14 * (1 - k) + 2;
      ctx.beginPath(); ctx.arc(f.x, f.y, Math.max(1, f.rad), 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(127,216,255,' + (0.12 * (1 - k)) + ')';
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

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

    // Edelsteine und Gegenstände
    for (const g of r.gems) {
      if (!this.inView(g.x, g.y, 20)) continue;
      const s = Sprites.gem(Sprites.gemTier(g.v));
      const by = Math.sin(t * 4 + g.bob) * 2;
      ctx.drawImage(s, g.x - s.size / 2, g.y - s.size / 2 + by, s.size, s.size);
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

    // Schatten
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    const list = this.list;
    list.length = 0;
    for (const e of r.enemies) {
      if (e.dead || !this.inView(e.x, e.y, e.r + 30)) continue;
      list.push(e);
      ctx.moveTo(e.x + e.r, e.y + e.r * 0.85);
      ctx.ellipse(e.x, e.y + e.r * 0.85, e.r, e.r * 0.32, 0, 0, TAU);
    }
    ctx.moveTo(p.x + 11, p.y + 13);
    ctx.ellipse(p.x, p.y + 13, 11, 4, 0, 0, TAU);
    ctx.fill();

    // Gegner und Spieler, nach y sortiert
    list.push(p);
    list.sort((a, b) => a.y - b.y);
    for (const e of list) {
      if (e === p) this.drawPlayer(r);
      else this.drawEnemy(e, p);
    }

    // Geschosse, Waffeneffekte (additiv)
    ctx.globalCompositeOperation = 'lighter';
    for (const s of r.shots) {
      if (!this.inView(s.x, s.y, 40)) continue;
      if (s.kind === 'bolt') {
        const sp = s.evo ? this.spr.boltEvo : this.spr.bolt;
        const sz = 22 * (s.r / 7);
        for (let k = 3; k >= 0; k--) {
          ctx.globalAlpha = k ? 0.25 / k : 1;
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
    for (const w of r.weapons) {
      if (w.id !== 'orbit' || w.active <= 0 || !w.orbs) continue;
      const sp = w.evo ? this.spr.orbEvo : this.spr.orb;
      const sz = 40 * w.st.area;
      for (let i = 0; i < w.orbs.length; i += 2) ctx.drawImage(sp, w.orbs[i] - sz / 2, w.orbs[i + 1] - sz / 2, sz, sz);
    }
    for (const f of r.fx) {
      const k = f.t / f.life;
      if (f.kind === 'slash') {
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.a);
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = f.evo ? '#ff5a6e' : '#e8f6ff';
        ctx.lineWidth = 16 * (1 - k) + 2;
        ctx.beginPath(); ctx.arc(0, 0, f.rad * (0.7 + k * 0.25), -0.95, 0.95); ctx.stroke();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(0, 0, f.rad * (0.85 + k * 0.25), -0.8, 0.8); ctx.stroke();
        ctx.restore();
      } else if (f.kind === 'zap') {
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = f.evo ? '#fff9a8' : '#bff4ff';
        ctx.lineWidth = 4 * (1 - k) + 1;
        ctx.beginPath();
        let x = f.x + rand(-20, 20), y = f.y - 320;
        ctx.moveTo(x, y);
        while (y < f.y) { y += rand(25, 45); x += rand(-18, 18); ctx.lineTo(y >= f.y ? f.x : x, Math.min(y, f.y)); }
        ctx.stroke();
        ctx.drawImage(this.spr.orb, f.x - f.rad * 1.5, f.y - f.rad * 1.5, f.rad * 3, f.rad * 3);
      } else if (f.kind === 'arc') {
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#fff9a8';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(f.x, f.y);
        for (let i = 1; i < 6; i++) { const q = i / 6; ctx.lineTo(lerp(f.x, f.x2, q) + rand(-10, 10), lerp(f.y, f.y2, q) + rand(-10, 10)); }
        ctx.lineTo(f.x2, f.y2);
        ctx.stroke();
      } else if (f.kind === 'boom') {
        ctx.globalAlpha = (1 - k) * 0.8;
        ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.rad * (0.4 + k * 0.6), 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const s of r.eshots) {
      if (!this.inView(s.x, s.y, 20)) continue;
      const sz = s.r * 3.4;
      ctx.drawImage(this.spr.eshot, s.x - sz / 2, s.y - sz / 2, sz, sz);
    }
    // Partikel
    for (const q of r.parts) {
      ctx.globalAlpha = Math.min(1, q.life / q.max * 1.5);
      ctx.fillStyle = q.color;
      const s = q.size * (0.5 + q.life / q.max * 0.5);
      ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Schadenszahlen
    if (Store.data.settings.dmgNums) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      for (const tx of r.texts) {
        const k = tx.t / 0.7;
        const pop = tx.t < 0.08 ? 1 + (0.08 - tx.t) * 6 : 1;
        ctx.globalAlpha = 1 - k * k;
        ctx.font = 'bold ' + Math.round(13 * tx.scale * pop) + 'px "Lilita One", Impact, sans-serif';
        ctx.strokeText(tx.txt, tx.x, tx.y);
        ctx.fillStyle = tx.color;
        ctx.fillText(tx.txt, tx.x, tx.y);
      }
      ctx.globalAlpha = 1;
    }
  },

  drawEnemy(e, p) {
    const ctx = this.ctx;
    const frame = Math.floor(e.anim * 5 + e.id) % 2;
    const variant = e.flash > 0 ? 1 : (e.slowT > 0 || e.freezeT > 0) ? 2 : 0;
    const spr = Sprites.enemy(e.type, frame, variant);
    const sc = e.r / Sprites.baseR(e.type);
    const size = spr.size * sc;
    const flip = e.swarm ? e.sdx < 0 : p.x < e.x;
    const bob = e.freezeT > 0 ? 0 : Math.sin(e.anim * 9 + e.id) * e.r * 0.06;
    if (e.elite || e.boss) {
      ctx.globalCompositeOperation = 'lighter';
      const gs = e.r * 3.2 * (1 + Math.sin(this.time * 5) * 0.06);
      ctx.drawImage(e.boss ? this.spr.boltEvo : this.spr.light, e.x - gs / 2, e.y - gs / 2, gs, gs);
      ctx.globalCompositeOperation = 'source-over';
    }
    // direkt per setTransform statt save/restore (spürbar schneller bei hunderten Gegnern)
    const k = this.dpr * this.zoom, B = this.base;
    ctx.setTransform(flip ? -k : k, 0, 0, k, B.x + k * e.x, B.y + k * (e.y + bob));
    ctx.drawImage(spr, -size / 2, -size / 2, size, size);
    ctx.setTransform(k, 0, 0, k, B.x, B.y);
    if (e.boss && e.type === 'slime') {
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
    ctx.translate(p.x, p.y + (p.moving ? Math.abs(Math.sin(p.walk * Math.PI / 2)) * -2 : 0));
    if (p.face < 0) ctx.scale(-1, 1);
    if (blink) ctx.globalAlpha = 0.45;
    ctx.drawImage(spr, -spr.size / 2, -spr.size / 2, spr.size, spr.size);
    ctx.restore();
    ctx.globalAlpha = 1;
    // Lebensleiste
    const w = 40, k = Math.max(0, p.hp / r.stats.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(p.x - w / 2 - 1, p.y + 19, w + 2, 8);
    ctx.fillStyle = k > 0.5 ? '#5dff8f' : k > 0.25 ? '#ffd34f' : '#ff5a6e';
    ctx.fillRect(p.x - w / 2, p.y + 20, w * k, 6);
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
    // Einstiegshilfe in den ersten Läufen
    if (Store.data.stats.runs <= 2 && r.t < 40) {
      let txt = null;
      if (!r.moved) txt = Input.touch ? 'Gedrückt halten und ziehen zum Laufen' : 'WASD / Pfeiltasten zum Laufen';
      else if (r.level === 1 && r.t > 6) txt = 'Sammle die blauen Edelsteine!';
      if (txt) {
        const s = this.toScreen(p.x, p.y);
        ctx.globalAlpha = 0.75 + Math.sin(this.time * 5) * 0.25;
        ctx.font = '19px "Lilita One", Impact, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(txt, s.x, s.y + 70);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(txt, s.x, s.y + 70);
        ctx.globalAlpha = 1;
      }
    }
    Input.drawJoystick(ctx);
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
