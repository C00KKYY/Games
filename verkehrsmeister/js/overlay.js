'use strict';
// ---------------------------------------------------------------------------
// 2D-Einblendungen über der 3D-Welt: Ziel-Plaketten mit Aufträgen und Ring,
// Engstellen-Schilder, schwebende Texte, Randpfeile, Hinweise
// ---------------------------------------------------------------------------

class Overlay {
  constructor(canvas, engine) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.e = engine;
    this.floats = [];
    this.dpr = 1;
    this.time = 0;
    this.hint = null;     // {x, y, z, text} Tutorial-Hinweis an einer Weltposition
    this.marks = [];      // zusätzliche Markierungen {x,y,z,color,label,t}
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    const w = this.cv.clientWidth, h = this.cv.clientHeight;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
  }

  float(x, y, z, text, color, opt = {}) {
    this.floats.push({ x, y, z, text, color, t: 0, max: opt.max || 1.1, size: opt.size || 16, rise: opt.rise === undefined ? 34 : opt.rise, bold: opt.bold !== false, stroke: opt.stroke !== false });
    if (this.floats.length > 80) this.floats.shift();
  }

  // Zoomfaktor für Größen: weiter weg → kleiner
  zf() { return clamp(30 / this.e.rig.cur.dist, 0.65, 1.35) * clamp(Math.min(this.cv.clientWidth, this.cv.clientHeight) / 700, 0.78, 1); }

  draw(game, dt, ui) {
    this.time += dt;
    const ctx = this.ctx, dpr = this.dpr;
    const W = this.cv.width / dpr, H = this.cv.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!game) return;
    const zf = this.zf();
    const city = game.city;
    const S = this.safe || { top: 90, bottom: H - 90 };
    // unverbundene Häuser (dezent markiert, sobald sie ein paar Sekunden stehen)
    for (const h of city.houses) {
      if (h.conn || game.time - h.born < 4 || !city.dests.some(d => d.pi === h.pi)) continue;
      const sp = this.e.project(h.ax + 0.5, 0.12, h.ay + 0.5);
      if (sp.behind || sp.x < -20 || sp.x > W + 20 || sp.y < -20 || sp.y > H + 20) continue;
      const r = 6 * zf, a = 0.55 + 0.35 * Math.sin(this.time * 3 + h.id);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = PALETTE[h.pi].hex; ctx.lineWidth = 2.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(sp.x, sp.y, r + 3, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = PALETTE[h.pi].hex;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // Engstellen-Schilder (ohne Überlappung, im Bild gehalten)
    if (!game.over) this.placeSigns(ctx, city.problems, zf, W, S);
    // Ziele
    const offs = [];
    for (const d of city.dests) {
      const roof = (d._roof || 0.8);
      const sp = this.e.project(d.cx, roof + 0.95, d.cy);
      const base = this.e.project(d.cx, 0, d.cy);
      const vis = p => !p.behind && p.x > 20 && p.x < W - 20 && p.y > S.top - 30 && p.y < S.bottom;
      const fresh = game.time - d.born < 20;
      if (!vis(sp) && !vis(base) && (fresh || d.pins > d.cap * 0.6 || d.ring > 0)) offs.push({ d, sp });
      if (!sp.behind) this.destBadge(ctx, d, sp.x, sp.y, zf, game);
    }
    // angekündigte Ziele außerhalb des Bildes ebenfalls anzeigen
    for (const p of city.pending) {
      if (p.kind !== 'dest') continue;
      const sp = this.e.project(p.x + 1, 0, p.y + 1);
      if (sp.behind || sp.x < 20 || sp.x > W - 20 || sp.y < S.top - 30 || sp.y > S.bottom) offs.push({ d: { pi: p.pi, ring: 0 }, sp });
    }
    for (const o of offs) this.edgeArrow(ctx, o.d, o.sp, W, H);
    // Ankündigungen neuer Ziele
    for (const p of city.pending) {
      if (p.kind !== 'dest') continue;
      const sp = this.e.project(p.x + 1, 1.4, p.y + 1);
      if (sp.behind) continue;
      ctx.save();
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(this.time * 6);
      this.pill(ctx, sp.x, sp.y, 'Neu: ' + PALETTE[p.pi].name, PALETTE[p.pi].hex, '#fff', 13);
      ctx.restore();
    }
    // Krankenwagen-Ziel
    const A = game.events.amb;
    if (A) {
      const h = A.target;
      const sp = this.e.project(h.x + 0.5, 0.9, h.y + 0.5);
      if (!sp.behind) {
        ctx.save();
        const pulse = 1 + 0.15 * Math.sin(this.time * 8);
        ctx.translate(sp.x, sp.y); ctx.scale(pulse, pulse);
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#e5484d'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e5484d'; ctx.fillRect(-2.5, -8, 5, 16); ctx.fillRect(-8, -2.5, 16, 5);
        ctx.restore();
      }
    }
    // Hinweis (Tutorial)
    if (this.hint) {
      const sp = this.e.project(this.hint.x, this.hint.z || 0.3, this.hint.y);
      if (!sp.behind) {
        const bob = Math.sin(this.time * 4) * 5;
        ctx.save();
        ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#1b1f27'; ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y - 8 + bob); ctx.lineTo(sp.x - 11, sp.y - 26 + bob); ctx.lineTo(sp.x - 4, sp.y - 26 + bob); ctx.lineTo(sp.x - 4, sp.y - 44 + bob);
        ctx.lineTo(sp.x + 4, sp.y - 44 + bob); ctx.lineTo(sp.x + 4, sp.y - 26 + bob); ctx.lineTo(sp.x + 11, sp.y - 26 + bob); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    }
    // schwebende Texte
    for (let k = this.floats.length - 1; k >= 0; k--) {
      const f = this.floats[k];
      f.t += dt;
      if (f.t >= f.max) { this.floats.splice(k, 1); continue; }
      const sp = f.screen ? { x: f.x, y: f.y } : this.e.project(f.x, f.z, f.y);
      if (sp.behind) continue;
      const u = f.t / f.max;
      const a = u < 0.15 ? u / 0.15 : 1 - Math.max(0, (u - 0.6) / 0.4);
      const sc = u < 0.15 ? 0.6 + 0.4 * (u / 0.15) * 1.15 : 1;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(sp.x, sp.y - f.rise * u);
      ctx.scale(sc, sc);
      ctx.font = `${f.bold ? 800 : 600} ${f.size}px "Barlow Condensed", "Barlow", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (f.stroke) { ctx.lineWidth = Math.max(3, f.size / 5); ctx.strokeStyle = 'rgba(20,24,32,0.85)'; ctx.lineJoin = 'round'; ctx.strokeText(f.text, 0, 0); }
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
  }

  pill(ctx, x, y, text, bg, fg, size) {
    ctx.font = `700 ${size}px "Barlow", sans-serif`;
    const w = ctx.measureText(text).width + 16, h = size + 10;
    ctx.fillStyle = bg;
    this.rr(ctx, x - w / 2, y - h / 2, w, h, h / 2); ctx.fill();
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
  }

  rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  destBadge(ctx, d, x, y, zf, game) {
    const P = PALETTE[d.pi];
    const r = 15 * zf;
    const danger = d.ring > 0;
    ctx.save();
    // Schatten
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.arc(x + 1.5, y + 2.5, r + 2, 0, Math.PI * 2); ctx.fill();
    // Grund
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3 * zf; ctx.strokeStyle = P.hex; ctx.stroke();
    ctx.save();
    ctx.translate(x - r, y - r);
    drawIcon(ctx, P.icon, r * 2, P.hex);
    ctx.restore();
    // Überlaufring
    if (danger) {
      const shake = d.ring > 0.7 ? Math.sin(this.time * 40) * 1.5 * zf : 0;
      ctx.lineWidth = 5 * zf; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(229,72,77,0.25)';
      ctx.beginPath(); ctx.arc(x + shake, y, r + 6 * zf, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = d.ring > 0.7 && Math.floor(this.time * 6) % 2 ? '#ff8a8a' : '#e5484d';
      ctx.beginPath(); ctx.arc(x + shake, y, r + 6 * zf, -Math.PI / 2, -Math.PI / 2 + d.ring * Math.PI * 2); ctx.stroke();
    }
    // Aufträge als Punkte
    const cap = d.cap;
    const big = cap > 9;
    const dotR = 4.2 * zf, gap = 10.5 * zf;
    const yy = y + r + 10 * zf;
    if (big) {
      this.pill(ctx, x, yy + 2, d.pins + ' / ' + cap, d.pins > cap ? '#e5484d' : P.hex, '#fff', Math.round(12 * zf));
    } else {
      const shown = Math.min(d.pins, cap);
      const n = cap;
      const x0 = x - (n - 1) * gap / 2;
      for (let k = 0; k < n; k++) {
        ctx.beginPath(); ctx.arc(x0 + k * gap, yy, dotR, 0, Math.PI * 2);
        if (k < shown) { ctx.fillStyle = P.hex; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#ffffff'; ctx.stroke(); }
        else { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.stroke(); }
      }
      if (d.pins > cap) {
        const extra = d.pins - cap;
        this.pill(ctx, x0 + n * gap + 8 * zf, yy, '+' + extra, '#e5484d', '#fff', Math.round(12 * zf));
      }
    }
    if (d.parking) { ctx.font = `800 ${Math.round(11 * zf)}px "Barlow", sans-serif`; ctx.fillStyle = '#2f6fdb'; ctx.textAlign = 'center'; ctx.fillText('P', x + r * 0.95, y - r * 0.85); }
    ctx.restore();
  }

  // Schilder nach Dringlichkeit platzieren, ohne sich zu überdecken
  placeSigns(ctx, probs, zf, W, S) {
    const placed = [];
    ctx.font = `700 ${Math.round(12 * zf)}px "Barlow", sans-serif`;
    for (const p of probs) {
      const c = CAUSES[p.cause];
      const sp = this.e.project(p.x, p.kind === 'dest' ? 0.4 : 0.55, p.y);
      if (!c || sp.behind) { p.screen = null; continue; }
      const w = ctx.measureText(c.title).width + 34 * zf, h = 22 * zf;
      const dir = p.kind === 'dest' ? 1 : -1;
      let x = clamp(sp.x, w / 2 + 6, W - w / 2 - 6);
      let y = p.kind === 'dest' ? sp.y + 40 * zf : sp.y - 18 * zf;
      for (let k = 0; k < 6; k++) {
        if (!placed.some(r => Math.abs(r.x - x) < (r.w + w) / 2 + 4 && Math.abs(r.y - y) < (r.h + h) / 2 + 3)) break;
        y += dir * (h + 4 * zf);
      }
      y = clamp(y, S.top + h / 2, S.bottom - h / 2);
      placed.push({ x, y, w, h });
      this.problemSign(ctx, p, zf, x, y, sp);
    }
  }

  problemSign(ctx, p, zf, x, y, sp) {
    const c = CAUSES[p.cause];
    ctx.save();
    const bob = Math.sin(this.time * 3 + p.x) * 2;
    ctx.translate(x, y + bob);
    ctx.font = `700 ${Math.round(12 * zf)}px "Barlow", sans-serif`;
    const tw = ctx.measureText(c.title).width;
    const w = tw + 34 * zf, h = 22 * zf;
    ctx.fillStyle = 'rgba(25,28,36,0.88)';
    this.rr(ctx, -w / 2, -h / 2, w, h, 6 * zf); ctx.fill();
    // Warndreieck
    const tx = -w / 2 + 13 * zf, s = 8 * zf;
    ctx.fillStyle = '#ffb020';
    ctx.beginPath(); ctx.moveTo(tx, -s); ctx.lineTo(tx + s, s * 0.8); ctx.lineTo(tx - s, s * 0.8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1b1f27'; ctx.fillRect(tx - 1, -s * 0.35, 2, s * 0.6); ctx.fillRect(tx - 1, s * 0.4, 2, 2);
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(c.title, -w / 2 + 25 * zf, 1);
    // Stiel zur Kreuzung
    if (p.kind !== 'dest') { ctx.strokeStyle = 'rgba(25,28,36,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(sp.x - x, sp.y - y - bob); ctx.stroke(); }
    ctx.restore();
    p.screen = { x, y, w, h };
  }

  edgeArrow(ctx, d, sp, W, H) {
    // auf dem Strahl zum Ziel bleiben, aber innerhalb des freien Bereichs zwischen HUD und Werkzeugleiste
    const S = this.safe || { top: 90, bottom: H - 90 };
    const m = 30, cx = W / 2, ccy = (S.top + S.bottom) / 2;
    let dx = sp.x - cx, dy = sp.y - ccy;
    if (sp.behind) { dx = -dx; dy = -dy; }
    const hx = W / 2 - m, hy = (S.bottom - S.top) / 2 - 4;
    const k = Math.min(hx / Math.max(1e-3, Math.abs(dx)), hy / Math.max(1e-3, Math.abs(dy)));
    const x = cx + dx * k, y = ccy + dy * k;
    const a = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(x, y);
    const pulse = 1 + 0.12 * Math.sin(this.time * 7);
    ctx.scale(pulse, pulse);
    ctx.rotate(a);
    // Tropfenform zeigt eindeutig zum Ziel
    ctx.fillStyle = d.ring > 0 ? '#e5484d' : PALETTE[d.pi].hex;
    ctx.beginPath(); ctx.arc(-3, 0, 14, Math.PI * 0.25, Math.PI * 1.75); ctx.lineTo(17, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-5, -6.5); ctx.lineTo(-2, 0); ctx.lineTo(-5, 6.5); ctx.closePath(); ctx.fill();
    ctx.restore();
    d._edge = { x, y };
  }
}
