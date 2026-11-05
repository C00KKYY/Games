'use strict';
// Prozedural gezeichnete Sprites und Icons (keine Bilddateien).
//
// Stilregeln (STYLE, Grafik-Spike B): ein Hauptlicht von oben links (45°) für alle Verläufe, eine gemeinsame
// Palette mit dreistufigen Rampen [Schatten, Mitte, Licht] je Farbton, ein dunkler Umriss (#120a18, 2,5 px) um
// jede Silhouette, 1 px Glanzkante oben links und eine leichte Abdunklung nach unten rechts. Umriss, Glanzkante
// und Abdunklung setzt finish() einheitlich auf jedes fertige Bild; die Zeichenfunktionen malen nur Formen
// und Farben. Kontaktschatten: Figuren bekommen ihn von render.js, Deko und Kohlebecken tragen ihn selbst.

const STYLE = {
  ink: '#120a18', outline: 2.5, rim: 1,
  rimColor: 'rgba(255,246,226,0.62)',
  shadeTop: 'rgba(255,240,214,0.10)', shadeBottom: 'rgba(18,10,24,0.40)',
  ramp: {
    violet: ['#3a1c6c', '#7748cc', '#c8acff'],
    slime: ['#12603a', '#33bb66', '#b8ffcc'],
    bone: ['#857660', '#d8cdb0', '#fffaec'],
    ghost: ['#3a86ac', '#98dcf2', '#f6feff'],
    flesh: ['#3e4834', '#82906a', '#cbd6ae'],
    crimson: ['#5e0c28', '#c42a50', '#ff9fb8'],
    ogre: ['#621a18', '#c4463a', '#ffa08a'],
    stone: ['#323a4c', '#69748c', '#b6c1d6'],
    leaf: ['#1c5228', '#3c9446', '#a2e48e'],
    ember: ['#a02c16', '#ff8636', '#ffe28c'],
    gold: ['#8a4e0c', '#eeb026', '#fff2aa'],
    iron: ['#262a36', '#575e74', '#a6aec4'],
    wood: ['#3a2212', '#784828', '#bc8656'],
    moss: ['#24402c', '#4c7a48', '#8cbc78'],
    red: ['#7a0c1e', '#e0283e', '#ff9aa6'],
    sky: ['#1a5a9e', '#3fa6ff', '#bfe6ff'],
    night: ['#140a30', '#4a32b6', '#a08aff'],
    orange: ['#8a3010', '#ee7a26', '#ffd486'],
  },
  eye: { white: '#fffbf0', red: '#ff3b4e', green: '#a8ff4c', yellow: '#ffe14f', cyan: '#5ff2ff', warm: '#fff1c2' },
};

const Sprites = (() => {
  // Auflösungsfaktor: passend zur Pixeldichte, damit beim Zeichnen kaum skaliert werden muss
  let SC = Math.min(2, Math.max(1, (window.devicePixelRatio || 1) * 1.2));
  let cache = new Map();
  const R_ = STYLE.ramp;

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * SC); c.height = Math.ceil(h * SC);
    const g = c.getContext('2d');
    g.scale(SC, SC);
    return { c, g };
  }
  function blank(c) { const n = document.createElement('canvas'); n.width = c.width; n.height = c.height; return n; }

  // ---------- Stil-Werkzeuge ----------
  // Kugel-Verlauf einer Rampe: Licht oben links, Schatten unten rechts
  function sph(g, x, y, r, ramp, k) {
    k = k || 0.42;
    const gr = g.createRadialGradient(x - r * 0.42, y - r * 0.48, r * 0.04, x - r * 0.12, y - r * 0.14, r * 1.18);
    gr.addColorStop(0, ramp[2]); gr.addColorStop(k, ramp[1]); gr.addColorStop(1, ramp[0]);
    return gr;
  }
  // Linearer Verlauf entlang der Lichtrichtung (oben links -> unten rechts) über ein Rechteck
  function lin(g, x0, y0, x1, y1, ramp) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, ramp[2]); gr.addColorStop(0.45, ramp[1]); gr.addColorStop(1, ramp[0]);
    return gr;
  }
  function ell(g, x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
  function circ(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
  function poly(g, pts, s) { s = s || 1; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * s, y * s) : g.moveTo(x * s, y * s))); g.closePath(); }
  function inkLine(g, w, a) { g.strokeStyle = a === undefined ? STYLE.ink : 'rgba(18,10,24,' + a + ')'; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; }
  // Glanzpunkt (Specular) oben links
  function glint(g, x, y, r, a) { g.fillStyle = 'rgba(255,255,255,' + (a || 0.85) + ')'; ell(g, x, y, r, r * 0.7, -0.6); g.fill(); }

  // Großes Comic-Auge: Umriss, Weiß, Iris, Pupille, Glanz; lx/ly = Blickrichtung (-1..1)
  function eye(g, x, y, r, iris, lx, ly) {
    lx = lx || 0; ly = ly || 0;
    g.fillStyle = STYLE.ink; ell(g, x, y, r * 1.22, r * 1.32); g.fill();
    g.fillStyle = STYLE.eye.white; ell(g, x, y, r, r * 1.1); g.fill();
    const ix = x + lx * r * 0.32, iy = y + ly * r * 0.3;
    g.fillStyle = iris; circ(g, ix, iy, r * 0.62); g.fill();
    g.fillStyle = STYLE.ink; circ(g, ix, iy, r * 0.3); g.fill();
    g.fillStyle = '#ffffff'; circ(g, ix - r * 0.26, iy - r * 0.3, r * 0.22); g.fill();
  }
  // Leuchtauge in dunkler Höhle
  function glowEye(g, x, y, r, col, socket) {
    if (socket !== false) { g.fillStyle = STYLE.ink; ell(g, x, y, r * 1.45, r * 1.3); g.fill(); }
    g.save(); g.shadowColor = col; g.shadowBlur = r * 3 * SC;
    g.fillStyle = col; ell(g, x, y, r, r * 0.86); g.fill(); g.restore();
    g.fillStyle = '#ffffff'; ell(g, x - r * 0.22, y - r * 0.22, r * 0.42, r * 0.36); g.fill();
  }
  function fang(g, x, y, w, h, col) { g.fillStyle = col || '#fffaec'; g.beginPath(); g.moveTo(x - w / 2, y); g.lineTo(x, y + h); g.lineTo(x + w / 2, y); g.closePath(); g.fill(); }

  // Einheitliche Nachbearbeitung eines fertigen Bildes: Abdunklung entlang des Lichts, Glanzkante oben links,
  // dunkler Umriss außen. Nur deckende Teile (Alpha > th) zählen zur Silhouette – weiche Leuchthöfe nicht.
  // o: { w: Umriss in Weltpixeln, rim, shade, th, ink, rimColor }
  function finish(c, o) {
    o = o || {};
    const W = c.width, H = c.height, g = c.getContext('2d');
    const src = g.getImageData(0, 0, W, H), d = src.data;
    const m = blank(c), mg = m.getContext('2d'), md = mg.createImageData(W, H), mm = md.data;
    const th = o.th || 100;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    // weiche Schwelle (th ± 48): die Kantenglättung des Originals bleibt erhalten, Leuchthöfe fallen weg
    for (let i = 3, p = 0; i < d.length; i += 4, p++) {
      const a = d[i];
      if (a <= th - 48) continue;
      mm[i] = a >= th + 48 ? 255 : ((a - th + 48) * 2.66) | 0;
      if (a <= th) continue;
      const x = p % W, y = (p / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) return c;
    mg.putImageData(md, 0, 0);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    // 1. Abdunklung nach unten rechts (nur auf der Figur)
    if (o.shade !== false) {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, STYLE.shadeTop); gr.addColorStop(0.45, 'rgba(0,0,0,0)'); gr.addColorStop(1, o.shadeBottom || STYLE.shadeBottom);
      g.globalCompositeOperation = 'source-atop'; g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    // 2. Glanzkante: Silhouette minus nach unten rechts verschobene Silhouette
    if (o.rim !== false) {
      const rc = blank(c), rg = rc.getContext('2d'), s = Math.max(1, (o.rimW || STYLE.rim) * SC * 1.15);
      rg.drawImage(m, 0, 0);
      rg.globalCompositeOperation = 'source-in'; rg.fillStyle = o.rimColor || STYLE.rimColor; rg.fillRect(0, 0, W, H);
      rg.globalCompositeOperation = 'destination-out'; rg.drawImage(m, s, s);
      g.globalCompositeOperation = 'source-atop'; g.drawImage(rc, 0, 0);
    }
    // 3. Umriss hinter die Figur
    const ow = (o.w === undefined ? STYLE.outline : o.w) * SC;
    if (ow > 0) {
      const oc = blank(c), og = oc.getContext('2d');
      og.drawImage(m, 0, 0);
      og.globalCompositeOperation = 'source-in'; og.fillStyle = o.ink || STYLE.ink; og.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'destination-over';
      // Kreis aus verschobenen Kopien; bei großen Umrissen (Titelbilder) mehr Kopien, damit keine Stufen entstehen
      const n = clamp(Math.ceil(ow * 3), 16, 72);
      for (let i = 0; i < n; i++) { const a = i / n * TAU; g.drawImage(oc, Math.cos(a) * ow, Math.sin(a) * ow); }
      const n2 = Math.max(8, n >> 1);
      for (let i = 0; i < n2; i++) { const a = (i + 0.5) / n2 * TAU; g.drawImage(oc, Math.cos(a) * ow * 0.55, Math.sin(a) * ow * 0.55); }
    }
    g.restore();
    return c;
  }

  // Weicher Kontaktschatten (für Deko, die keinen Schatten von render.js bekommt), hinter das Bild
  function contactShadow(g, x, y, rx, ry) {
    g.save();
    g.globalCompositeOperation = 'destination-over';
    const gr = g.createRadialGradient(x, y, 0, x, y, rx);
    gr.addColorStop(0, 'rgba(8,4,14,0.42)'); gr.addColorStop(0.65, 'rgba(8,4,14,0.26)'); gr.addColorStop(1, 'rgba(8,4,14,0)');
    g.fillStyle = gr; g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y);
    circ(g, x, y, rx); g.fill();
    g.restore();
  }

  // Gegner: gezeichnet um (0,0) mit Basisradius R; Blick nach rechts (render.js spiegelt)
  const ENEMY_DRAW = {
    bat(g, R, f) {
      const flap = f ? -0.55 : 0.3, V = R_.violet;
      // Flügel: Haut mit Knochenstreben, gezackter Unterrand
      for (const s of [-1, 1]) {
        const tipX = s * R * 1.62, tipY = -R * (0.78 + flap);
        g.fillStyle = lin(g, 0, -R, s * R * 1.4, R * 0.4, ['#2a1250', '#5a2fa6', '#9a74e8']);
        g.beginPath();
        g.moveTo(s * R * 0.35, -R * 0.22);
        g.quadraticCurveTo(s * R * 0.95, -R * (0.95 + flap * 0.8), tipX, tipY);
        g.quadraticCurveTo(s * R * 1.5, -R * (0.15 + flap * 0.4), s * R * 1.42, R * (0.28 - flap * 0.2));
        g.quadraticCurveTo(s * R * 1.22, R * (0.04 - flap * 0.15), s * R * 1.06, R * (0.3 - flap * 0.15));
        g.quadraticCurveTo(s * R * 0.9, R * (0.08 - flap * 0.1), s * R * 0.72, R * (0.34 - flap * 0.1));
        g.quadraticCurveTo(s * R * 0.55, R * 0.12, s * R * 0.35, R * 0.3);
        g.closePath(); g.fill();
        inkLine(g, R * 0.07, 0.55);
        g.beginPath();
        g.moveTo(s * R * 0.4, -R * 0.12); g.lineTo(s * R * 1.06, R * (0.26 - flap * 0.15));
        g.moveTo(s * R * 0.42, -R * 0.16); g.lineTo(s * R * 1.42, R * (0.24 - flap * 0.2));
        g.stroke();
      }
      // Ohren
      for (const s of [-1, 1]) {
        g.fillStyle = sph(g, s * R * 0.32, -R * 0.62, R * 0.4, V);
        g.beginPath(); g.moveTo(s * R * 0.12, -R * 0.45); g.lineTo(s * R * 0.42, -R * 1.08); g.lineTo(s * R * 0.58, -R * 0.36); g.closePath(); g.fill();
        g.fillStyle = '#ff8fb6'; g.beginPath(); g.moveTo(s * R * 0.24, -R * 0.5); g.lineTo(s * R * 0.41, -R * 0.88); g.lineTo(s * R * 0.48, -R * 0.45); g.closePath(); g.fill();
      }
      // Körper
      g.fillStyle = sph(g, 0, 0, R * 0.68, V);
      ell(g, 0, R * 0.02, R * 0.64, R * 0.6); g.fill();
      // Bauchfell
      g.fillStyle = 'rgba(200,170,255,0.35)'; ell(g, 0, R * 0.3, R * 0.32, R * 0.24); g.fill();
      // Augen und Zähne
      eye(g, -R * 0.24, -R * 0.08, R * 0.2, STYLE.eye.red, 0.6, 0.1);
      eye(g, R * 0.26, -R * 0.08, R * 0.2, STYLE.eye.red, 0.6, 0.1);
      fang(g, -R * 0.1, R * 0.24, R * 0.12, R * 0.17); fang(g, R * 0.12, R * 0.24, R * 0.12, R * 0.17);
    },
    slime(g, R, f) {
      const sq = f ? 0.88 : 1.05, S = R_.slime;
      g.save(); g.scale(1 / sq, sq);
      // Körper mit Tropfen am Boden
      g.fillStyle = sph(g, -R * 0.1, -R * 0.15, R * 1.15, S, 0.4);
      g.beginPath();
      g.moveTo(-R * 1.02, R * 0.62);
      g.bezierCurveTo(-R * 1.18, -R * 0.55, -R * 0.45, -R * 1.08, R * 0.05, -R * 1.04);
      g.bezierCurveTo(R * 0.55, -R * 1.02, R * 1.18, -R * 0.5, R * 1.02, R * 0.62);
      g.quadraticCurveTo(R * 0.86, R * 0.86, R * 0.62, R * 0.74);
      g.quadraticCurveTo(R * 0.5, R * 0.98, R * 0.32, R * 0.78);
      g.quadraticCurveTo(0, R * 0.9, -R * 0.42, R * 0.8);
      g.quadraticCurveTo(-R * 0.62, R * 1.0, -R * 0.74, R * 0.78);
      g.quadraticCurveTo(-R * 0.92, R * 0.84, -R * 1.02, R * 0.62);
      g.fill();
      // Innenleben: Kern und Bläschen
      g.fillStyle = 'rgba(16,90,52,0.35)'; ell(g, R * 0.15, R * 0.35, R * 0.62, R * 0.32); g.fill();
      g.fillStyle = 'rgba(220,255,230,0.55)';
      circ(g, -R * 0.52, R * 0.32, R * 0.08); g.fill(); circ(g, R * 0.58, R * 0.1, R * 0.06); g.fill(); circ(g, R * 0.42, R * 0.46, R * 0.05); g.fill();
      // Glanz
      g.fillStyle = 'rgba(255,255,255,0.75)'; ell(g, -R * 0.5, -R * 0.55, R * 0.26, R * 0.13, -0.7); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.9)'; circ(g, -R * 0.2, -R * 0.78, R * 0.06); g.fill();
      // Gesicht
      eye(g, -R * 0.26, -R * 0.2, R * 0.23, '#2a8a4e', 0.55, 0.15);
      eye(g, R * 0.34, -R * 0.2, R * 0.23, '#2a8a4e', 0.55, 0.15);
      inkLine(g, R * 0.09);
      g.beginPath(); g.arc(R * 0.06, R * 0.12, R * (f ? 0.2 : 0.15), 0.25, Math.PI - 0.25); g.stroke();
      g.restore();
    },
    skel(g, R, f) {
      const lean = f ? 1 : -1, B = R_.bone;
      // Schwert (hinter dem Körper in der vorderen Hand)
      g.save(); g.translate(R * 0.72, R * 0.42); g.rotate(-0.5 + lean * 0.12);
      g.fillStyle = lin(g, -R * 0.1, -R * 1.1, R * 0.1, 0, ['#5a5f70', '#a9b0c2', '#eef2ff']);
      g.beginPath(); g.moveTo(-R * 0.09, -R * 0.12); g.lineTo(-R * 0.09, -R * 0.92); g.lineTo(0, -R * 1.08); g.lineTo(R * 0.09, -R * 0.92); g.lineTo(R * 0.09, -R * 0.12); g.closePath(); g.fill();
      g.fillStyle = '#8a5a2b'; g.fillRect(-R * 0.26, -R * 0.14, R * 0.52, R * 0.1);
      g.fillStyle = '#5a3a1e'; g.fillRect(-R * 0.06, -R * 0.04, R * 0.12, R * 0.28);
      g.restore();
      // Beine und Arme (Knochen)
      g.strokeStyle = B[1]; g.lineWidth = R * 0.16; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-R * 0.14, R * 0.72); g.lineTo(-R * 0.3, R * 1.08 + lean * R * 0.05);
      g.moveTo(R * 0.14, R * 0.72); g.lineTo(R * 0.3, R * 1.08 - lean * R * 0.05);
      g.moveTo(-R * 0.36, R * 0.24); g.lineTo(-R * 0.7, R * (0.52 + lean * 0.12));
      g.moveTo(R * 0.36, R * 0.24); g.lineTo(R * 0.72, R * (0.46 - lean * 0.1));
      g.stroke();
      g.fillStyle = B[2]; for (const [x, y] of [[-R * 0.7, R * (0.52 + lean * 0.12)], [R * 0.72, R * (0.46 - lean * 0.1)]]) { circ(g, x, y, R * 0.11); g.fill(); }
      // Brustkorb
      g.fillStyle = sph(g, 0, R * 0.42, R * 0.45, B);
      g.beginPath(); g.moveTo(-R * 0.38, R * 0.16); g.quadraticCurveTo(-R * 0.44, R * 0.62, -R * 0.12, R * 0.76); g.lineTo(R * 0.12, R * 0.76); g.quadraticCurveTo(R * 0.44, R * 0.62, R * 0.38, R * 0.16); g.closePath(); g.fill();
      g.fillStyle = 'rgba(18,10,24,0.75)';
      for (let i = 0; i < 2; i++) { const y = R * (0.32 + i * 0.18); g.fillRect(-R * 0.3, y, R * 0.22, R * 0.07); g.fillRect(R * 0.08, y, R * 0.22, R * 0.07); }
      // großer Schädel
      g.fillStyle = sph(g, 0, -R * 0.42, R * 0.78, B);
      g.beginPath(); g.arc(0, -R * 0.44, R * 0.72, Math.PI * 0.82, Math.PI * 2.18);
      g.quadraticCurveTo(R * 0.5, R * 0.08, R * 0.32, R * 0.12); g.lineTo(-R * 0.32, R * 0.12); g.quadraticCurveTo(-R * 0.5, R * 0.08, -R * 0.58, -R * 0.02);
      g.closePath(); g.fill();
      // Augenhöhlen mit Glut
      g.fillStyle = STYLE.ink;
      ell(g, -R * 0.27, -R * 0.42, R * 0.2, R * 0.23, 0.15); g.fill(); ell(g, R * 0.29, -R * 0.42, R * 0.2, R * 0.23, -0.15); g.fill();
      glowEye(g, -R * 0.24, -R * 0.4, R * 0.08, '#ff5a3c', false); glowEye(g, R * 0.32, -R * 0.4, R * 0.08, '#ff5a3c', false);
      g.fillStyle = STYLE.ink; g.beginPath(); g.moveTo(R * 0.02, -R * 0.2); g.lineTo(-R * 0.06, -R * 0.06); g.lineTo(R * 0.1, -R * 0.06); g.closePath(); g.fill();
      inkLine(g, R * 0.06);
      g.beginPath(); g.moveTo(-R * 0.26, R * 0.02); g.lineTo(R * 0.26, R * 0.02); g.stroke();
      for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * R * 0.12, -R * 0.04); g.lineTo(i * R * 0.12, R * 0.1); g.stroke(); }
    },
    ghost(g, R, f) {
      const G = R_.ghost;
      g.save();
      g.globalAlpha = 0.93;
      g.fillStyle = sph(g, -R * 0.1, -R * 0.35, R * 1.25, G, 0.45);
      g.beginPath();
      g.moveTo(-R * 0.9, R * 0.62);
      g.lineTo(-R * 0.92, -R * 0.15);
      g.arc(0, -R * 0.15, R * 0.92, Math.PI, 0);
      g.lineTo(R * 0.9, R * 0.62);
      const n = 4, w = R * 1.8 / n;
      for (let i = 0; i < n; i++) {
        const x = R * 0.9 - i * w;
        g.quadraticCurveTo(x - w / 2, R * (f ^ (i & 1) ? 1.12 : 0.78), x - w, R * (f ? 0.68 : 0.96) - (i === n - 1 ? R * 0.3 : 0));
      }
      g.closePath(); g.fill();
      // Ärmchen
      g.fillStyle = G[1];
      ell(g, -R * 0.92, R * 0.12, R * 0.2, R * 0.13, f ? -0.6 : -0.2); g.fill();
      ell(g, R * 0.94, R * 0.06, R * 0.2, R * 0.13, f ? 0.2 : 0.6); g.fill();
      g.restore();
      // Gesicht: große dunkle Augen mit Glanz, offener Mund
      g.fillStyle = '#1b2440';
      ell(g, -R * 0.24, -R * 0.24, R * 0.18, R * 0.27); g.fill(); ell(g, R * 0.36, -R * 0.24, R * 0.18, R * 0.27); g.fill();
      g.fillStyle = '#ffffff'; circ(g, -R * 0.29, -R * 0.33, R * 0.07); g.fill(); circ(g, R * 0.31, -R * 0.33, R * 0.07); g.fill();
      g.fillStyle = '#1b2440'; ell(g, R * 0.07, R * 0.18, R * 0.13, R * (f ? 0.19 : 0.12)); g.fill();
      g.fillStyle = 'rgba(255,140,190,0.35)'; ell(g, -R * 0.48, 0, R * 0.12, R * 0.07); g.fill(); ell(g, R * 0.6, 0, R * 0.12, R * 0.07); g.fill();
    },
    ghoul(g, R, f) {
      const arm = f ? 0.14 : -0.1, F = R_.flesh;
      // Arme mit Klauen (hängen nach vorne)
      for (const s of [-1, 1]) {
        g.fillStyle = sph(g, s * R * 0.86, R * 0.3, R * 0.5, F);
        ell(g, s * R * 0.84, R * (0.32 + arm * s), R * 0.24, R * 0.46, s * 0.35); g.fill();
        g.fillStyle = '#f2e6c8';
        for (let k = -1; k <= 1; k++) fang(g, s * R * (0.98 + k * 0.1) - s * R * 0.04, R * (0.7 + arm * s) + Math.abs(k) * -R * 0.03, R * 0.08, R * 0.16);
      }
      // Rumpf, gebeugt
      g.fillStyle = sph(g, 0, R * 0.05, R * 1.0, F);
      g.beginPath(); g.ellipse(0, R * 0.15, R * 0.86, R * 0.8, 0, 0, TAU); g.fill();
      // Lendentuch
      g.fillStyle = '#4a2a52';
      g.beginPath(); g.moveTo(-R * 0.6, R * 0.6); g.lineTo(R * 0.6, R * 0.6); g.lineTo(R * 0.42, R * 0.92); g.lineTo(R * 0.15, R * 0.78); g.lineTo(-R * 0.1, R * 0.95); g.lineTo(-R * 0.4, R * 0.8); g.closePath(); g.fill();
      // Rippen angedeutet
      inkLine(g, R * 0.05, 0.35);
      for (let i = 0; i < 2; i++) { g.beginPath(); g.arc(R * 0.05, R * (0.45 + i * 0.12), R * 0.4, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
      // Kopf: Wulst mit Augen
      g.fillStyle = sph(g, R * 0.05, -R * 0.42, R * 0.62, F);
      ell(g, R * 0.05, -R * 0.4, R * 0.62, R * 0.48); g.fill();
      g.fillStyle = F[0]; g.beginPath(); g.ellipse(R * 0.05, -R * 0.56, R * 0.58, R * 0.16, 0, Math.PI, 0); g.fill();
      glowEye(g, -R * 0.2, -R * 0.42, R * 0.13, STYLE.eye.green);
      glowEye(g, R * 0.32, -R * 0.42, R * 0.13, STYLE.eye.green);
      // Maul
      g.fillStyle = '#2a0e10'; ell(g, R * 0.08, -R * 0.08, R * 0.34, R * (f ? 0.15 : 0.11)); g.fill();
      for (let i = -2; i <= 2; i++) fang(g, R * 0.08 + i * R * 0.13, -R * 0.15, R * 0.09, R * 0.11, '#f2e6c8');
    },
    spitter(g, R, f) {
      const L = R_.leaf, O = R_.orange;
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * 0.6 + i * 0.45;
        g.fillStyle = sph(g, Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8 + R * 0.2, R * 0.45, L);
        ell(g, Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8 + R * 0.2, R * 0.46, R * 0.2, a); g.fill();
      }
      g.fillStyle = O[1];
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.4;
        g.beginPath(); g.moveTo(Math.cos(a - 0.14) * R * 0.78, Math.sin(a - 0.14) * R * 0.78); g.lineTo(Math.cos(a) * R * 1.18, Math.sin(a) * R * 1.18); g.lineTo(Math.cos(a + 0.14) * R * 0.78, Math.sin(a + 0.14) * R * 0.78); g.fill();
      }
      g.fillStyle = sph(g, 0, 0, R * 0.9, O);
      circ(g, 0, 0, R * 0.85); g.fill();
      g.fillStyle = '#3a0c0c'; ell(g, R * 0.1, R * 0.28, R * 0.4, R * (f ? 0.32 : 0.15)); g.fill();
      if (f) { g.fillStyle = '#b6ff4f'; circ(g, R * 0.1, R * 0.32, R * 0.14); g.fill(); }
      eye(g, -R * 0.22, -R * 0.28, R * 0.18, '#7a2a0c', 0.5, 0);
      eye(g, R * 0.36, -R * 0.28, R * 0.18, '#7a2a0c', 0.5, 0);
    },
    wraith(g, R, f) {
      const sway = f ? 0.15 : -0.15, C = R_.crimson;
      g.fillStyle = sph(g, -R * 0.1, -R * 0.4, R * 1.4, C, 0.4);
      g.beginPath();
      g.moveTo(0, -R * 1.1);
      g.bezierCurveTo(R * 0.98, -R * 0.62, R * 0.95, R * 0.35, R * (0.55 + sway), R * 1.1);
      g.lineTo(R * (0.22 + sway), R * 0.8);
      g.lineTo(R * (0.02 + sway), R * 1.14);
      g.lineTo(-R * (0.18 - sway), R * 0.82);
      g.lineTo(-R * (0.5 - sway), R * 1.1);
      g.bezierCurveTo(-R * 0.95, R * 0.35, -R * 0.98, -R * 0.62, 0, -R * 1.1);
      g.fill();
      // Kapuzenrand und dunkles Gesicht
      g.fillStyle = C[0]; ell(g, R * 0.05, -R * 0.2, R * 0.56, R * 0.5); g.fill();
      g.fillStyle = '#1a0410'; ell(g, R * 0.08, -R * 0.16, R * 0.46, R * 0.42); g.fill();
      glowEye(g, -R * 0.1, -R * 0.2, R * 0.11, STYLE.eye.yellow, false);
      glowEye(g, R * 0.27, -R * 0.2, R * 0.11, STYLE.eye.yellow, false);
      // Klauenhände
      g.fillStyle = '#e8d8f0';
      for (const s of [-1, 1]) { ell(g, s * R * 0.72, R * (0.3 + sway * s), R * 0.13, R * 0.09); g.fill(); }
    },
    brute(g, R, f) {
      const st = f ? 0.06 : -0.06, O = R_.ogre;
      g.fillStyle = O[0];
      for (const s of [-1, 1]) { ell(g, s * R * 0.4, R * (0.85 + st * s), R * 0.27, R * 0.19); g.fill(); }
      // Fäuste
      for (const s of [-1, 1]) { g.fillStyle = sph(g, s * R * 0.92, R * 0.3, R * 0.3, O); circ(g, s * R * 0.9, R * (0.3 - st * s), R * 0.28); g.fill(); }
      g.fillStyle = sph(g, 0, 0, R * 1.05, O);
      ell(g, 0, 0, R * 0.95, R * 0.88); g.fill();
      // Hörner
      for (const s of [-1, 1]) {
        g.fillStyle = lin(g, s * R * 0.3, -R * 1.2, s * R * 0.8, -R * 0.6, R_.bone);
        g.beginPath(); g.moveTo(s * R * 0.45, -R * 0.65); g.quadraticCurveTo(s * R * 0.9, -R * 1.0, s * R * 0.75, -R * 1.28); g.quadraticCurveTo(s * R * 0.62, -R * 0.95, s * R * 0.22, -R * 0.76); g.fill();
      }
      // Gürtel
      g.fillStyle = '#4a2a14'; g.fillRect(-R * 0.82, R * 0.42, R * 1.64, R * 0.14);
      g.fillStyle = R_.gold[1]; g.fillRect(-R * 0.1, R * 0.4, R * 0.2, R * 0.18);
      // Stirn, Augen, Hauer
      inkLine(g, R * 0.1);
      g.beginPath(); g.moveTo(-R * 0.52, -R * 0.4); g.lineTo(-R * 0.1, -R * 0.22); g.moveTo(R * 0.52, -R * 0.4); g.lineTo(R * 0.14, -R * 0.22); g.stroke();
      glowEye(g, -R * 0.26, -R * 0.12, R * 0.1, STYLE.eye.yellow);
      glowEye(g, R * 0.3, -R * 0.12, R * 0.1, STYLE.eye.yellow);
      g.fillStyle = '#2a0808'; ell(g, R * 0.02, R * 0.2, R * 0.44, R * 0.15); g.fill();
      for (const s of [-1, 1]) { g.fillStyle = '#fff6dc'; g.beginPath(); g.moveTo(s * R * 0.32, R * 0.28); g.lineTo(s * R * 0.24, R * -0.02); g.lineTo(s * R * 0.14, R * 0.28); g.fill(); }
    },
    golem(g, R, f) {
      const pts = [[-0.9, -0.3], [-0.6, -0.85], [0.05, -1.0], [0.7, -0.75], [0.95, -0.1], [0.8, 0.6], [0.2, 0.95], [-0.5, 0.9], [-0.95, 0.4]];
      const S = R_.stone;
      for (const s of [-1, 1]) { g.fillStyle = sph(g, s * R, R * 0.2, R * 0.36, S); circ(g, s * R * 1.0, R * (0.2 + (f ? 0.08 : -0.08) * s), R * 0.34); g.fill(); }
      g.fillStyle = sph(g, 0, -R * 0.1, R * 1.1, S);
      poly(g, pts, R); g.fill();
      // Facetten: helle Kante oben links, dunkle unten rechts
      g.fillStyle = 'rgba(220,230,255,0.22)';
      g.beginPath(); g.moveTo(-0.9 * R, -0.3 * R); g.lineTo(-0.6 * R, -0.85 * R); g.lineTo(0.05 * R, -R); g.lineTo(-0.1 * R, -0.55 * R); g.lineTo(-0.55 * R, -0.25 * R); g.closePath(); g.fill();
      g.fillStyle = 'rgba(18,10,24,0.25)';
      g.beginPath(); g.moveTo(0.95 * R, -0.1 * R); g.lineTo(0.8 * R, 0.6 * R); g.lineTo(0.2 * R, 0.95 * R); g.lineTo(0.3 * R, 0.45 * R); g.closePath(); g.fill();
      g.save();
      g.strokeStyle = '#5ff2ff'; g.shadowColor = '#5ff2ff'; g.shadowBlur = R * 0.4 * SC; g.lineWidth = R * 0.07; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-R * 0.5, R * 0.1); g.lineTo(-R * 0.2, R * 0.3); g.lineTo(-R * 0.3, R * 0.6);
      g.moveTo(R * 0.3, R * 0.2); g.lineTo(R * 0.55, R * 0.45); g.moveTo(R * 0.1, -R * 0.75); g.lineTo(R * 0.25, -R * 0.55);
      g.stroke(); g.restore();
      glowEye(g, -R * 0.24, -R * 0.25, R * 0.12, STYLE.eye.cyan);
      glowEye(g, R * 0.34, -R * 0.25, R * 0.12, STYLE.eye.cyan);
    },
    night(g, R, f) {
      const N = R_.night;
      g.fillStyle = '#1b0f3a';
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * TAU + (f ? 0.15 : 0);
        g.beginPath(); g.moveTo(Math.cos(a - 0.2) * R * 0.8, Math.sin(a - 0.2) * R * 0.8); g.lineTo(Math.cos(a) * R * 1.35, Math.sin(a) * R * 1.35); g.lineTo(Math.cos(a + 0.2) * R * 0.8, Math.sin(a + 0.2) * R * 0.8); g.fill();
      }
      g.fillStyle = sph(g, 0, 0, R, N);
      circ(g, 0, 0, R * 0.95); g.fill();
      const ey = [[0, -0.1, 0.28], [-0.5, -0.35, 0.14], [0.5, -0.35, 0.14], [-0.45, 0.35, 0.12], [0.45, 0.35, 0.12], [0, 0.55, 0.1]];
      for (const [x, y, s] of ey) {
        g.fillStyle = STYLE.ink; ell(g, x * R, y * R, s * R * 1.2, s * R * (f ? 0.6 : 1.08)); g.fill();
        g.fillStyle = '#fff'; ell(g, x * R, y * R, s * R, s * R * (f ? 0.5 : 0.9)); g.fill();
        g.fillStyle = '#ff2050'; circ(g, x * R, y * R, s * R * 0.45); g.fill();
      }
    },
  };

  const BASE_R = { night: 30 };

  function tintVariant(src, color, alpha) {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // Krone der Bosse (Boss-Aussehen = Gegner-Sprite + Tönung + Größe + Krone); Oberkante des Kopfes je Typ in R
  const CROWN_AT = { slime: [0.05, -0.98], skel: [0, -1.12], wraith: [0.02, -1.0], golem: [0.02, -0.95], brute: [0, -0.86], ghoul: [0.05, -0.84], bat: [0, -0.62], ghost: [0, -1.04], spitter: [0, -1.1] };
  function crown(g, type, R, f, lvl) {
    const at = CROWN_AT[type];
    if (!at) return;
    let y = at[1] * R;
    if (type === 'slime') y *= f ? 0.88 : 1.05;
    const x = at[0] * R, w = R * (lvl > 1 ? 0.56 : 0.46), h = R * (lvl > 1 ? 0.5 : 0.36), n = lvl > 1 ? 5 : 3;
    g.save(); g.translate(x, y + h * 0.15); g.rotate(-0.08);
    g.fillStyle = lin(g, -w, -h, w, h * 0.3, R_.gold);
    g.beginPath(); g.moveTo(-w, 0);
    for (let i = 0; i <= n; i++) {
      const px = -w + i * 2 * w / n;
      g.lineTo(px, -h * (i % 2 === 0 || n === 3 ? 1 : 0.62));
      if (i < n) g.lineTo(px + w / n, -h * 0.38);
    }
    g.lineTo(w, 0); g.quadraticCurveTo(0, h * 0.22, -w, 0); g.closePath(); g.fill();
    g.fillStyle = 'rgba(138,78,12,0.55)'; g.fillRect(-w, -h * 0.22, 2 * w, h * 0.16);
    const gem = lvl > 1 ? R_.red : R_.sky;
    g.fillStyle = sph(g, 0, -h * 0.2, h * 0.3, gem); circ(g, 0, -h * 0.18, h * 0.2); g.fill();
    for (let i = 0; i <= n; i += 2) { const px = -w + i * 2 * w / n; g.fillStyle = sph(g, px, -h, h * 0.12, R_.gold); circ(g, px, -h * (n === 3 || i % 2 === 0 ? 1 : 0.62), h * 0.11); g.fill(); }
    glint(g, -w * 0.55, -h * 0.55, h * 0.1, 0.8);
    g.restore();
  }
  function drawEnemyBody(g, type, R, frame, boss) {
    ENEMY_DRAW[type](g, R, frame);
    if (boss) crown(g, type, R, frame, boss);
  }

  // variant: 0 normal, 1 Blitz (weiß), 2 vereist (blau); tint: Farbtönung je Gebiet (oder null);
  // boss: 0 kein Boss, 1 Boss (kleine Krone), 2 Endboss (große Krone)
  function enemy(type, frame, variant, tint, boss) {
    boss = boss || 0;
    const key = 'e' + type + frame + variant + (tint || '') + (boss ? 'b' + boss : '');
    let c = cache.get(key);
    if (c) return c;
    if (variant) {
      const base = enemy(type, frame, 0, tint, boss);
      c = variant === 1 ? tintVariant(base, '#ffffff', 0.8) : tintVariant(base, '#7fd8ff', 0.5);
      c.size = base.size;
    } else {
      // Tönung nur auf die Farben, der Umriss bleibt dunkel: ungetöntes Bild ohne Umriss tönen, dann umranden
      const R = baseR(type), size = enemySize(type);
      const cv = canvas(size, size);
      cv.g.translate(size / 2, size / 2); cv.g.scale(ENEMY_VIS, ENEMY_VIS);
      drawEnemyBody(cv.g, type, R, frame, boss);
      c = tint ? tintVariant(cv.c, tint, 0.38) : cv.c;
      c.size = size;
      finish(c);
    }
    cache.set(key, c);
    return c;
  }

  // Boss-Bild in scharfer Hochauflösung (Faktor nach Bossgröße, höchstens 3); render.js baut sie beim Laden des
  // Landes im Voraus, damit das Erscheinen des Bosses nicht ruckelt
  function bossLevel(def) { return def && def.final ? 2 : 1; }
  function bossSprite(type, r, frame, variant, tint, lvl) {
    const k = Math.min(3, Math.ceil(r / baseR(type)));
    const fn = () => enemy(type, frame, variant, tint, type === 'night' ? 0 : lvl);
    return k > 1 ? hires('boss' + type + frame + variant + (tint || '') + lvl, k, fn) : fn();
  }

  function baseR(type) { return BASE_R[type] || ENEMIES[type].r; }
  // Gegner werden etwas größer gezeichnet als ihr Trefferkreis (nur Darstellung, r bleibt gleich)
  const ENEMY_VIS = 1.15;
  function enemySize(type) { return baseR(type) * 3.6 * ENEMY_VIS + 8; }

  // Helden: Kapuzengestalt in Charakterfarbe mit großem Kopf, Glut-Schal und der Glut in der Hand; jeder Held hat eine
  // eigene Silhouette (Kopfbedeckung, Rücken, Kragen). Kasten 72×72, Mitte (0,0); Füße unten bei y = +17,4 (render.js:
  // Schatten und Lebensleiste), Glut bei (9,6 | −3,8).
  const HERO_BOX = 72;
  // Held aus Kennung ('aron') oder – für ältere Aufrufer – aus der Farbe ('#4f8cff')
  function heroOf(k) {
    if (CHARS[k]) return { id: k, color: CHARS[k].color };
    for (const id in CHARS) if (CHARS[id].color === k) return { id, color: k };
    return { id: 'aron', color: k && k[0] === '#' ? k : CHARS.aron.color };
  }
  function drawHero(g, color, frame, kind) {
    const C = [shade(color, -78), shade(color, -12), shade(color, 66)];
    const H = [shade(color, -60), shade(color, 12), shade(color, 96)];
    const E = R_.ember, I = R_.iron;
    const step = frame === 1 ? 2.6 : frame === 2 ? -2.6 : 0;
    // Stiefel
    g.fillStyle = sph(g, 0, 14, 6, ['#1c1426', '#3a2c48', '#6a5a7e']);
    ell(g, -4.4 + step, 15.2, 3.7, 2.3); g.fill(); ell(g, 4.4 - step, 15.2, 3.7, 2.3); g.fill();
    g.save(); g.translate(0, frame ? -0.7 : 0);
    const fl = frame === 1 ? 1.5 : frame === 2 ? -0.8 : 0;
    // Rücken: Rundschild (Aron), Köcher mit Dolchen (Kael), Hammer (Brom)
    if (kind === 'aron') {
      g.fillStyle = sph(g, -10, 2, 8, R_.iron); circ(g, -10.5, 3, 7.4); g.fill();
      g.fillStyle = sph(g, -10, 2, 5.5, C); circ(g, -10.5, 3, 5); g.fill();
      g.fillStyle = sph(g, -11, 2, 2, R_.gold); circ(g, -10.5, 3, 1.7); g.fill();
    } else if (kind === 'kael') {
      g.save(); g.translate(-8, 1); g.rotate(-0.42);
      for (const x of [-2.2, 0.6, 3.2]) { g.fillStyle = lin(g, x - 1, -17, x + 1, -10, ['#5a6276', '#c8d0e0', '#ffffff']); poly(g, [[x - 1.1, -10], [x, -17], [x + 1.1, -10]]); g.fill(); }
      g.fillStyle = lin(g, -4, -10, 4, 10, ['#3a2212', '#8a5a2e', '#c89058']); roundRect(g, -4.2, -10.5, 8.4, 19, 2.5); g.fill();
      g.fillStyle = R_.gold[1]; g.fillRect(-4.2, -8, 8.4, 1.6); g.fillRect(-4.2, 4, 8.4, 1.6);
      g.restore();
    } else if (kind === 'brom') {
      g.save(); g.translate(-9, 2); g.rotate(-0.55);
      g.fillStyle = lin(g, -1.3, -6, 1.3, 14, R_.wood); g.fillRect(-1.3, -6, 2.6, 19);
      g.fillStyle = lin(g, -6, -12, 6, -5, I); roundRect(g, -6.2, -12.5, 12.4, 7, 1.5); g.fill();
      g.restore();
    }
    // Schal-Ende flattert nach hinten (links); Eira trägt stattdessen einen Pelzkragen
    if (kind !== 'eira') {
      g.fillStyle = lin(g, -14, -6, -3, 2, E);
      g.beginPath(); g.moveTo(-3, -5.5); g.quadraticCurveTo(-9, -6 + fl, -15.5, -3 + fl); g.lineTo(-13, -1 + fl); g.lineTo(-15, 1.5 + fl);
      g.quadraticCurveTo(-9, 0.5, -3, -1.5); g.closePath(); g.fill();
    }
    // Umhang mit gewelltem Saum (Brom breiter, Sela als langes Gewand)
    g.save();
    if (kind === 'brom') g.scale(1.16, 1);
    g.fillStyle = sph(g, -1, 1, 15, C, 0.38);
    g.beginPath();
    g.moveTo(-6.8, -5.5);
    g.quadraticCurveTo(-9.2, 3, -11.8, 13.4);
    g.quadraticCurveTo(-8, 15.8, -4, 14.2);
    g.quadraticCurveTo(0, 16.2, 4, 14.2);
    g.quadraticCurveTo(8, 15.8, 11.8, 13.4);
    g.quadraticCurveTo(9.2, 3, 6.8, -5.5);
    g.closePath(); g.fill();
    // Falten
    inkLine(g, 0.9, 0.35);
    g.beginPath(); g.moveTo(-2, 0); g.quadraticCurveTo(-3.5, 7, -4.5, 13.4); g.moveTo(3.5, 2); g.quadraticCurveTo(4.5, 8, 5.5, 13.6); g.stroke();
    // Brustzeichen
    if (kind === 'sela') { g.fillStyle = lin(g, -2, -4, 2, 14, R_.gold); g.fillRect(-1.5, -3, 3, 16.5); g.fillRect(-4.5, 8.5, 9, 2.4); }
    if (kind === 'brom') { g.fillStyle = lin(g, -6, 0, 6, 14, ['#3a2212', '#6a4426', '#a87a4e']); g.beginPath(); g.moveTo(-6, 3); g.lineTo(6, 3); g.lineTo(7, 14); g.lineTo(-7, 14); g.closePath(); g.fill(); }
    g.restore();
    // Gürtel mit Schnalle
    g.fillStyle = '#3a2416'; g.beginPath(); g.moveTo(-8.6, 4); g.lineTo(8.6, 4); g.lineTo(8.9, 6.4); g.lineTo(-8.9, 6.4); g.closePath(); g.fill();
    g.fillStyle = lin(g, -1.6, 3.6, 1.6, 6.8, R_.gold); g.fillRect(-1.7, 3.5, 3.4, 3.3);
    if (kind === 'nyx') { g.save(); g.shadowColor = '#7cf0ff'; g.shadowBlur = 4 * SC; g.fillStyle = '#e8ffff'; poly(g, [[1.5, -2.5], [-2.4, 2.6], [0, 2.6], [-1.6, 6.5], [2.8, 0.8], [0.6, 0.8], [2.4, -2.5]]); g.fill(); g.restore(); }
    if (kind === 'lio') { g.fillStyle = R_.leaf[1]; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; circ(g, 3.5 + Math.cos(a) * 1.5, 0 + Math.sin(a) * 1.5, 1.4); g.fill(); } }
    // Kragen: Glut-Schal (Pelz bei Eira)
    if (kind === 'eira') {
      g.fillStyle = sph(g, -2, -6, 9, ['#8aa6c0', '#e6f2ff', '#ffffff'], 0.45);
      for (const [x, y, r] of [[-6, -4.4, 3.4], [-2, -3.6, 3.6], [2.4, -3.8, 3.6], [6.4, -4.6, 3.2], [0.4, -5.6, 3.4]]) { circ(g, x, y, r); g.fill(); }
    } else {
      g.fillStyle = sph(g, 0, -4.5, 8.5, E, 0.45);
      ell(g, 0.5, -4.4, 8.2, 3.3); g.fill();
    }
    // Kopf: Kapuze mit nach hinten fallender Spitze (nicht bei Hut, Mütze, Helm, Pilzhut)
    const hood = kind === 'aron' || kind === 'nyx' || kind === 'ignis' || kind === 'sela' || kind === 'eira';
    let HH = H;
    if (kind === 'sela') HH = ['#a89870', '#f2e8cc', '#fffdf4'];
    g.fillStyle = sph(g, -2, -14, 12.5, HH, 0.4);
    if (hood) {
      g.beginPath();
      if (kind === 'sela') { g.moveTo(-7.5, -18); g.quadraticCurveTo(-15, -14, -13.5, -1); g.quadraticCurveTo(-10, -6, -8.6, -9); }
      else { g.moveTo(-6.5, -19.5); g.quadraticCurveTo(-12.5, -23.5, -16, -18.8); g.quadraticCurveTo(-11.5, -17.2, -9.2, -13.5); }
      g.closePath(); g.fill();
    }
    circ(g, 0.3, -12.2, 10.4); g.fill();
    // Gesichtsöffnung mit Schatten der Krempe
    const fg = g.createLinearGradient(0, -17, 0, -4);
    fg.addColorStop(0, '#07040c'); fg.addColorStop(1, '#2a1c3a');
    g.fillStyle = fg; ell(g, 2.6, -10.6, 7.2, 6.3, 0.05); g.fill();
    if (kind === 'sela') { g.strokeStyle = lin(g, -4, -17, 9, -4, R_.gold); g.lineWidth = 1.3; ell(g, 2.6, -10.6, 7.6, 6.7, 0.05); g.stroke(); }
    // leuchtende Augen
    const eyeC = kind === 'nyx' || kind === 'eira' ? '#bff8ff' : STYLE.eye.warm, eyeG = kind === 'nyx' || kind === 'eira' ? '#5ce1ff' : '#ffb057';
    g.save(); g.shadowColor = eyeG; g.shadowBlur = 5 * SC; g.fillStyle = eyeC;
    ell(g, 0.2, -10.6, 1.9, 2.7); g.fill(); ell(g, 5.6, -10.6, 1.9, 2.7); g.fill();
    g.restore();
    g.fillStyle = '#ffffff'; circ(g, -0.2, -11.6, 0.75); g.fill(); circ(g, 5.2, -11.6, 0.75); g.fill();
    // Kopfbedeckung
    if (kind === 'mira') {
      const hr = [shade(color, -70), shade(color, -20), shade(color, 60)];
      g.fillStyle = sph(g, -4, -26, 13, hr, 0.4);
      g.beginPath(); g.moveTo(-8.5, -19.5); g.bezierCurveTo(-7, -26, -8.5, -31, -15, -33.5); g.bezierCurveTo(-4, -33, 3, -27.5, 8, -19.5); g.closePath(); g.fill();
      g.fillStyle = sph(g, -3, -21, 15, hr, 0.45); ell(g, 0.5, -19.2, 14.5, 3.4, -0.06); g.fill();
      g.fillStyle = lin(g, -8, -24, 8, -20, R_.gold); poly(g, [[-8.2, -20.4], [7.6, -20.4], [6.6, -23.2], [-7.6, -23.2]]); g.fill();
      g.save(); g.translate(-0.5, -21.8); g.fillStyle = '#fff6c0'; star(g, 4, 2.2, 0.8); g.fill(); g.restore();
    } else if (kind === 'kael') {
      const cr = [shade(color, -110), shade(color, -60), shade(color, 0)];
      g.fillStyle = sph(g, -2, -22, 13, cr, 0.4);
      g.beginPath(); g.moveTo(-11.2, -14.5); g.quadraticCurveTo(-10, -25, 1, -24.6); g.quadraticCurveTo(10, -24, 13, -16); g.quadraticCurveTo(15.5, -14, 16.5, -13); g.quadraticCurveTo(8, -15.5, 1, -16.6); g.quadraticCurveTo(-6, -16.5, -11.2, -14.5); g.closePath(); g.fill();
      g.fillStyle = lin(g, -20, -30, -4, -20, R_.red);
      g.beginPath(); g.moveTo(-4, -21.5); g.quadraticCurveTo(-11, -30, -21, -29); g.quadraticCurveTo(-14, -25, -5.5, -19); g.closePath(); g.fill();
      inkLine(g, 0.7, 0.45); g.beginPath(); g.moveTo(-5, -20.5); g.quadraticCurveTo(-12, -27, -20, -28.6); g.stroke();
    } else if (kind === 'sela') {
      g.save(); g.shadowColor = '#ffe27a'; g.shadowBlur = 6 * SC;
      g.strokeStyle = lin(g, -9, -30, 9, -24, R_.gold); g.lineWidth = 2.4; ell(g, 0.5, -27, 8.6, 2.6); g.stroke(); g.restore();
    } else if (kind === 'brom') {
      g.fillStyle = sph(g, -2, -18, 12, I, 0.42);
      g.beginPath(); g.arc(0.3, -14.6, 10.9, Math.PI, 0); g.closePath(); g.fill();
      g.fillStyle = lin(g, -12, -16, 12, -13, I); ell(g, 0.3, -14.4, 12.6, 2.4); g.fill();
      g.fillStyle = sph(g, 0, -26, 2.5, R_.gold); circ(g, 0.3, -25.3, 2); g.fill();
      // Bart
      g.fillStyle = sph(g, 2, -6, 9, ['#6a2c10', '#c0602a', '#f4a464'], 0.45);
      g.beginPath(); g.moveTo(-4.4, -8.6); g.quadraticCurveTo(-6.4, 0.5, 1.4, 4.2); g.quadraticCurveTo(10, 1, 9.8, -8.6); g.quadraticCurveTo(3, -5.6, -4.4, -8.6); g.closePath(); g.fill();
      inkLine(g, 0.7, 0.4); g.beginPath(); g.moveTo(1, -5); g.lineTo(1.4, 2.6); g.moveTo(4.6, -5.2); g.lineTo(5.4, 1.6); g.stroke();
    } else if (kind === 'nyx') {
      g.save(); g.shadowColor = '#5ce1ff'; g.shadowBlur = 5 * SC;
      g.fillStyle = lin(g, -8, -33, 8, -20, ['#1a6a9a', '#5ce1ff', '#eaffff']);
      poly(g, [[-7.5, -19.5], [-10.5, -29], [-4.2, -24.5], [-2.2, -33], [1.8, -24.6], [7.2, -30.5], [7, -20.5]]); g.fill();
      g.restore();
    } else if (kind === 'eira') {
      const sh = [[-7, -20.5, 4.4], [-3.6, -22.4, 6.6], [0.4, -23.2, 8.6], [4.4, -22.4, 6.2], [7.6, -20.4, 4]];
      for (const [x, y, h] of sh) {
        g.fillStyle = lin(g, x - 2, y - h, x + 2, y, R_.ghost);
        poly(g, [[x - 1.9, y + 1], [x - 1.2, y - h * 0.6], [x, y - h], [x + 1.2, y - h * 0.6], [x + 1.9, y + 1]]); g.fill();
      }
      g.fillStyle = lin(g, -8, -21, 8, -18, ['#3a86ac', '#bfe6ff', '#ffffff']); ell(g, 0.4, -19.6, 8.6, 1.9); g.fill();
      g.save(); g.shadowColor = '#7fd8ff'; g.shadowBlur = 4 * SC; g.fillStyle = '#e8fbff'; circ(g, 0.4, -20, 1.5); g.fill(); g.restore();
    } else if (kind === 'lio') {
      g.fillStyle = sph(g, -3, -26, 18, R_.red, 0.42);
      g.beginPath(); g.moveTo(-15.5, -15.5); g.quadraticCurveTo(-15, -32, 1, -32); g.quadraticCurveTo(17, -32, 16.5, -15.5); g.quadraticCurveTo(1, -19.5, -15.5, -15.5); g.closePath(); g.fill();
      g.fillStyle = '#fff6e6';
      for (const [x, y, r] of [[-8, -22, 2.6], [0, -27.5, 2.2], [7.5, -23, 2.8], [-1.5, -20.5, 1.6], [12, -18.6, 1.4], [-12.4, -18, 1.3]]) { ell(g, x, y, r, r * 0.8); g.fill(); }
      g.fillStyle = 'rgba(255,240,220,0.55)'; g.beginPath(); g.moveTo(-15.5, -15.5); g.quadraticCurveTo(1, -19.5, 16.5, -15.5); g.quadraticCurveTo(1, -17.3, -15.5, -15.5); g.fill();
    } else if (kind === 'ignis') {
      g.save(); g.shadowColor = '#ff8a2a'; g.shadowBlur = 6 * SC;
      g.fillStyle = lin(g, -6, -34, 6, -18, E);
      g.beginPath(); g.moveTo(-8, -19.5); g.quadraticCurveTo(-11, -27, -6.5, -31); g.quadraticCurveTo(-5.5, -26, -3, -25.5); g.quadraticCurveTo(-3.5, -31, 1.5, -35);
      g.quadraticCurveTo(1, -28.5, 4, -26.5); g.quadraticCurveTo(5.5, -29.5, 8.5, -30); g.quadraticCurveTo(10, -24.5, 7.6, -19.5); g.closePath(); g.fill();
      g.fillStyle = '#fff2b0'; ell(g, 0, -23, 2.4, 3.2); g.fill();
      g.restore();
    }
    // Schulterstück (Aron)
    if (kind === 'aron') { g.fillStyle = sph(g, 5, -4, 6, R_.iron, 0.4); g.beginPath(); g.arc(5.6, -2.2, 5, Math.PI * 1.05, Math.PI * 2.1); g.closePath(); g.fill(); g.fillStyle = R_.gold[1]; circ(g, 5.6, -4.4, 0.9); g.fill(); }
    // Hand mit der Glut
    g.fillStyle = sph(g, 8.8, -1.2, 3.2, C); circ(g, 8.6, -1.4, 3); g.fill();
    g.save(); g.shadowColor = '#ff9a3c'; g.shadowBlur = 7 * SC;
    g.fillStyle = sph(g, 9.6, -3.8, 3, E, 0.3); circ(g, 9.6, -3.8, 2.7); g.fill();
    g.restore();
    g.fillStyle = '#fffbe0'; circ(g, 8.9, -4.6, 0.9); g.fill();
    g.restore();
  }
  // id: Held ('aron' …) oder Farbe (ältere Aufrufer)
  function player(id, frame, flash) {
    const h = heroOf(id);
    const key = 'p' + h.id + h.color + frame + (flash ? 1 : 0);
    let c = cache.get(key);
    if (c) return c;
    if (flash) {
      const base = player(id, frame, false);
      c = tintVariant(base, '#ffffff', 0.8);
      c.size = base.size;
      cache.set(key, c);
      return c;
    }
    const size = HERO_BOX;
    const cv = canvas(size, size), g = cv.g;
    g.translate(size / 2, size / 2);
    drawHero(g, h.color, frame, h.id);
    c = cv.c;
    c.size = size;
    finish(c);
    cache.set(key, c);
    return c;
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = clamp((n >> 16) + amt, 0, 255), g = clamp(((n >> 8) & 255) + amt, 0, 255), b = clamp((n & 255) + amt, 0, 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function rampOf(hex) { return [shade(hex, -90), hex, shade(hex, 110)]; }

  const GEM_COLORS = ['#4fc3ff', '#5dff8f', '#ff5a6e', '#d36bff'];
  // Edelstein: geschliffener Kristall, Facetten nach dem Licht (oben links hell), dunkler Umriss, sanfter Hof
  function gemTier(v) { return v < 3 ? 0 : v < 12 ? 1 : v < 60 ? 2 : 3; }
  function gem(tier) {
    const key = 'g' + tier;
    let c = cache.get(key);
    if (c) return c;
    const s = 6.4 + tier * 1.5, size = s * 5;
    const cv = canvas(size, size), g = cv.g;
    g.translate(size / 2, size / 2);
    const col = GEM_COLORS[tier], ramp = rampOf(col);
    const T = -s * 1.3, B = s * 1.3, w = s * 0.86, m = -s * 0.2;
    // Facetten: oben links / oben rechts / unten links / unten rechts, Tafel in der Mitte
    const face = (pts, fill) => { g.fillStyle = fill; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
    face([[0, T], [-w, m], [0, m + s * 0.1]], ramp[2]);
    face([[0, T], [w, m], [0, m + s * 0.1]], col);
    face([[-w, m], [0, B], [0, m + s * 0.1]], col);
    face([[w, m], [0, B], [0, m + s * 0.1]], ramp[0]);
    g.fillStyle = 'rgba(255,255,255,0.9)'; ell(g, -s * 0.32, -s * 0.55, s * 0.17, s * 0.1, -0.9); g.fill();
    c = cv.c; c.size = size;
    finish(c, { w: 1.6, rimColor: 'rgba(255,255,255,0.75)', shade: false });
    // Hof hinter dem Stein
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-over';
    const h = c.width / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, hexA(col, 0.55)); gr.addColorStop(0.45, hexA(col, 0.22)); gr.addColorStop(1, hexA(col, 0));
    g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height); g.restore();
    cache.set(key, c);
    return c;
  }

  // Aufsammelbares und Requisiten; nutzt die Icon-Zeichnungen
  function item(kind) {
    const key = 'i' + kind;
    let c = cache.get(key);
    if (c) return c;
    const size = kind === 'chest' ? 46 : 32;
    const cv = canvas(size, size), g = cv.g;
    g.translate(size / 2, size / 2);
    g.scale(size / 72, size / 72);
    drawIcon(g, kind === 'bag' ? 'bag' : kind);
    c = cv.c; c.size = size;
    finish(c, { w: kind === 'chest' ? 2.2 : 1.8 });
    cache.set(key, c);
    return c;
  }

  // ---------- Icons (64×64 um den Mittelpunkt) ----------
  function star(g, n, r0, r1) {
    g.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r1 : r0;
      i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
  }

  function heartPath(g, s) {
    g.beginPath();
    g.moveTo(0, s * 0.85);
    g.bezierCurveTo(-s * 1.4, -s * 0.1, -s * 0.7, -s * 1.1, 0, -s * 0.4);
    g.bezierCurveTo(s * 0.7, -s * 1.1, s * 1.4, -s * 0.1, 0, s * 0.85);
  }

  function lg(g, y0, y1, c0, c1) { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, c0); gr.addColorStop(1, c1); return gr; }
  function radial(g, x, y, r, c0, c1) {
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    gr.addColorStop(0, c0); gr.addColorStop(1, c1);
    return gr;
  }
  const ICONS = {
    wand(g) {
      g.strokeStyle = '#8a5a2b'; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-18, 20); g.lineTo(6, -4); g.stroke();
      g.shadowColor = '#c08cff'; g.shadowBlur = 12;
      g.fillStyle = '#e0c4ff'; g.save(); g.translate(10, -10); star(g, 5, 16, 7); g.fill(); g.restore();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(10, -10, 4, 0, TAU); g.fill();
    },
    whip(g) {
      g.save(); g.rotate(-0.78);
      g.fillStyle = lg(g, -28, 10, '#ffffff', '#9fb4d6');
      g.beginPath(); g.moveTo(0, -30); g.lineTo(7, -22); g.lineTo(6, 10); g.lineTo(-6, 10); g.lineTo(-7, -22); g.closePath(); g.fill();
      g.fillStyle = '#ffd34f'; g.fillRect(-14, 10, 28, 5);
      g.fillStyle = '#7a3e1d'; g.fillRect(-4, 15, 8, 13);
      g.fillStyle = '#ffd34f'; g.beginPath(); g.arc(0, 30, 4, 0, TAU); g.fill();
      g.restore();
    },
    orbit(g) {
      g.strokeStyle = 'rgba(140,220,255,0.5)'; g.lineWidth = 2;
      g.beginPath(); g.arc(0, 0, 20, 0, TAU); g.stroke();
      g.fillStyle = '#5c8cff'; g.beginPath(); g.arc(0, 0, 7, 0, TAU); g.fill();
      g.shadowColor = '#7cf0ff'; g.shadowBlur = 10;
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * TAU - 0.5;
        g.fillStyle = radial(g, Math.cos(a) * 20, Math.sin(a) * 20, 9, '#ffffff', '#3fc8ff');
        g.beginPath(); g.arc(Math.cos(a) * 20, Math.sin(a) * 20, 8, 0, TAU); g.fill();
      }
    },
    aura(g) {
      const gr = g.createRadialGradient(0, 0, 4, 0, 0, 28);
      gr.addColorStop(0, 'rgba(255,240,150,0.9)'); gr.addColorStop(0.6, 'rgba(255,140,40,0.55)'); gr.addColorStop(1, 'rgba(255,60,20,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 28, 0, TAU); g.fill();
      g.strokeStyle = '#ffb13b'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 20, 0, TAU); g.stroke();
      g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill();
    },
    lightning(g) {
      g.shadowColor = '#7cf0ff'; g.shadowBlur = 12;
      g.fillStyle = lg(g, -28, 28, '#ffffff', '#5ce1ff');
      g.beginPath(); g.moveTo(6, -28); g.lineTo(-14, 4); g.lineTo(-1, 4); g.lineTo(-8, 28); g.lineTo(16, -6); g.lineTo(3, -6); g.lineTo(12, -28); g.closePath(); g.fill();
    },
    sickle(g) {
      g.fillStyle = lg(g, -26, 20, '#ffffff', '#a8b4c8');
      g.beginPath(); g.arc(0, 0, 24, -2.6, 1.0); g.arc(5, -3, 17, 1.0, -2.6, true); g.closePath(); g.fill();
      g.fillStyle = '#7a3e1d'; g.save(); g.rotate(0.7); g.fillRect(-3, 8, 6, 22); g.restore();
    },
    fire(g) {
      g.fillStyle = 'rgba(160,220,255,0.35)';
      g.beginPath(); g.moveTo(-6, -24); g.lineTo(6, -24); g.lineTo(6, -12); g.quadraticCurveTo(20, -6, 20, 10); g.quadraticCurveTo(20, 26, 0, 26); g.quadraticCurveTo(-20, 26, -20, 10); g.quadraticCurveTo(-20, -6, -6, -12); g.closePath(); g.fill();
      g.fillStyle = '#ff6a2b';
      g.beginPath(); g.moveTo(-17, 6); g.quadraticCurveTo(-17, 24, 0, 24); g.quadraticCurveTo(17, 24, 17, 6); g.closePath(); g.fill();
      g.fillStyle = '#8a5a2b'; g.fillRect(-5, -30, 10, 7);
      g.shadowColor = '#ffb13b'; g.shadowBlur = 10; g.fillStyle = '#ffd34f';
      g.beginPath(); g.moveTo(0, -30); g.quadraticCurveTo(8, -38, 2, -46); g.quadraticCurveTo(-6, -38, 0, -30); g.fill();
    },
    nova(g) {
      g.strokeStyle = '#bfefff'; g.lineWidth = 4; g.lineCap = 'round';
      g.shadowColor = '#7fd8ff'; g.shadowBlur = 10;
      for (let i = 0; i < 6; i++) {
        g.save(); g.rotate(i * Math.PI / 3);
        g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -26); g.moveTo(0, -16); g.lineTo(-7, -22); g.moveTo(0, -16); g.lineTo(7, -22); g.stroke();
        g.restore();
      }
    },
    knives(g) {
      for (const [x, rot] of [[-12, -0.3], [0, 0], [12, 0.3]]) {
        g.save(); g.translate(x, 6); g.rotate(rot);
        g.fillStyle = lg(g, -26, 0, '#ffffff', '#9fb4d6');
        g.beginPath(); g.moveTo(0, -28); g.lineTo(5, -6); g.lineTo(-5, -6); g.closePath(); g.fill();
        g.fillStyle = '#3a2a4a'; g.fillRect(-6, -6, 12, 4);
        g.fillStyle = '#7a3e1d'; g.fillRect(-2.5, -2, 5, 12);
        g.restore();
      }
    },
    might(g) {
      g.fillStyle = '#ff5a3c';
      g.beginPath(); g.moveTo(0, -28); g.lineTo(18, -6); g.lineTo(8, -6); g.lineTo(8, 24); g.lineTo(-8, 24); g.lineTo(-8, -6); g.lineTo(-18, -6); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(-3, -4, 4, 26);
    },
    armor(g) {
      g.fillStyle = lg(g, -28, 28, '#d8e2f0', '#6b7a95');
      g.beginPath(); g.moveTo(0, -28); g.lineTo(22, -18); g.quadraticCurveTo(22, 14, 0, 28); g.quadraticCurveTo(-22, 14, -22, -18); g.closePath(); g.fill();
      g.fillStyle = '#ffd34f'; g.beginPath(); g.moveTo(0, -18); g.lineTo(12, -11); g.quadraticCurveTo(12, 8, 0, 18); g.quadraticCurveTo(-12, 8, -12, -11); g.closePath(); g.fill();
    },
    heart(g) {
      g.shadowColor = '#ff5a6e'; g.shadowBlur = 10;
      g.fillStyle = lg(g, -24, 24, '#ff8a9a', '#d41e3c');
      heartPath(g, 24); g.fill();
      g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.ellipse(-10, -8, 5, 3, -0.6, 0, TAU); g.fill();
    },
    boots(g) {
      g.fillStyle = '#8a5a2b';
      g.beginPath(); g.moveTo(-12, -26); g.lineTo(6, -26); g.lineTo(6, 6); g.lineTo(24, 12); g.quadraticCurveTo(26, 24, 18, 24); g.lineTo(-14, 24); g.closePath(); g.fill();
      g.fillStyle = '#ffd34f'; g.fillRect(-12, -26, 18, 6);
      g.fillStyle = '#e8f6ff';
      g.beginPath(); g.moveTo(-14, -14); g.lineTo(-28, -22); g.lineTo(-24, -8); g.lineTo(-30, -4); g.lineTo(-14, -2); g.closePath(); g.fill();
    },
    magnet(g) {
      g.lineWidth = 12; g.strokeStyle = '#e8384f';
      g.beginPath(); g.arc(0, 0, 16, Math.PI, 0, true); g.stroke();
      g.beginPath(); g.moveTo(-16, 0); g.lineTo(-16, -16); g.moveTo(16, 0); g.lineTo(16, -16); g.stroke();
      g.fillStyle = '#dfe6ef'; g.fillRect(-22, -26, 12, 10); g.fillRect(10, -26, 12, 10);
    },
    hourglass(g) {
      g.fillStyle = '#8a5a2b'; g.fillRect(-20, -28, 40, 6); g.fillRect(-20, 22, 40, 6);
      g.fillStyle = 'rgba(200,235,255,0.45)';
      g.beginPath(); g.moveTo(-15, -22); g.lineTo(15, -22); g.lineTo(2, 0); g.lineTo(15, 22); g.lineTo(-15, 22); g.lineTo(-2, 0); g.closePath(); g.fill();
      g.fillStyle = '#ffd34f';
      g.beginPath(); g.moveTo(-8, -12); g.lineTo(8, -12); g.lineTo(1, -2); g.lineTo(-1, -2); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(-13, 21); g.lineTo(13, 21); g.lineTo(0, 9); g.closePath(); g.fill();
    },
    lens(g) {
      g.strokeStyle = '#ffd34f'; g.lineWidth = 6;
      g.beginPath(); g.arc(-4, -4, 17, 0, TAU); g.stroke();
      g.fillStyle = 'rgba(140,220,255,0.45)'; g.beginPath(); g.arc(-4, -4, 14, 0, TAU); g.fill();
      g.lineWidth = 8; g.strokeStyle = '#8a5a2b'; g.lineCap = 'round';
      g.beginPath(); g.moveTo(9, 9); g.lineTo(24, 24); g.stroke();
    },
    mirror(g) {
      for (const [x, y, c] of [[-8, -6, '#7cf0ff'], [8, 6, '#c08cff']]) {
        g.fillStyle = c; g.globalAlpha = 0.9;
        g.beginPath(); g.moveTo(x, y - 20); g.lineTo(x + 14, y); g.lineTo(x, y + 20); g.lineTo(x - 14, y); g.closePath(); g.fill();
      }
      g.globalAlpha = 1;
    },
    clover(g) {
      g.fillStyle = '#3fdc7a';
      for (let i = 0; i < 4; i++) {
        g.save(); g.rotate(i * Math.PI / 2 + Math.PI / 4);
        g.translate(0, -12); heartPath(g, 12); g.fill();
        g.restore();
      }
      g.strokeStyle = '#2a8a4a'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(6, 18, 2, 28); g.stroke();
    },
    elixir(g) {
      g.fillStyle = 'rgba(200,235,255,0.4)';
      g.beginPath(); g.arc(0, 8, 18, 0, TAU); g.fill();
      g.fillRect(-6, -22, 12, 16);
      g.fillStyle = '#ff4f9a'; g.beginPath(); g.arc(0, 8, 15, -0.2, Math.PI + 0.2); g.fill();
      g.fillStyle = '#8a5a2b'; g.fillRect(-7, -28, 14, 8);
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(-7, 2, 3, 0, TAU); g.fill();
    },
    candle(g) {
      g.fillStyle = lg(g, -10, 26, '#fff8e6', '#d8c8a0');
      g.fillRect(-9, -8, 18, 34);
      g.shadowColor = '#ffb13b'; g.shadowBlur = 14;
      g.fillStyle = '#ffd34f';
      g.beginPath(); g.moveTo(0, -10); g.quadraticCurveTo(10, -20, 0, -32); g.quadraticCurveTo(-10, -20, 0, -10); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, -16, 3, 5, 0, 0, TAU); g.fill();
    },
    wing(g) {
      g.fillStyle = '#e8f6ff';
      for (let i = 0; i < 4; i++) {
        g.beginPath(); g.ellipse(-4 + i * 6, -10 + i * 9, 22 - i * 3, 6, -0.5, 0, TAU); g.fill();
      }
      g.fillStyle = '#9fd8ff'; g.beginPath(); g.ellipse(-14, -14, 8, 6, 0, 0, TAU); g.fill();
    },
    growth(g) {
      g.fillStyle = '#4fc3ff'; g.save(); g.scale(1.4, 1.4);
      g.beginPath(); g.moveTo(0, -14); g.lineTo(9, 0); g.lineTo(0, 14); g.lineTo(-9, 0); g.closePath(); g.fill(); g.restore();
      g.fillStyle = '#5dff8f'; g.beginPath(); g.moveTo(18, -26); g.lineTo(26, -14); g.lineTo(10, -14); g.closePath(); g.fill();
    },
    coin(g) {
      g.fillStyle = '#c98a14'; g.beginPath(); g.arc(0, 2, 20, 0, TAU); g.fill();
      g.fillStyle = lg(g, -20, 20, '#fff1a8', '#f0b528'); g.beginPath(); g.arc(0, 0, 20, 0, TAU); g.fill();
      g.strokeStyle = '#c98a14'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 14, 0, TAU); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(-7, -8, 5, 3, -0.6, 0, TAU); g.fill();
    },
    bag(g) {
      g.fillStyle = lg(g, -16, 28, '#c79a5c', '#7a5428');
      g.beginPath(); g.moveTo(-8, -16); g.quadraticCurveTo(-26, 4, -20, 22); g.quadraticCurveTo(0, 30, 20, 22); g.quadraticCurveTo(26, 4, 8, -16); g.closePath(); g.fill();
      g.fillStyle = '#5a3a18'; g.fillRect(-10, -20, 20, 6);
      g.fillStyle = '#ffd34f'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 0, 8);
    },
    bomb(g) {
      g.fillStyle = radial(g, 0, 6, 22, '#6a6a80', '#121218'); g.beginPath(); g.arc(0, 6, 20, 0, TAU); g.fill();
      g.fillStyle = '#3a3a48'; g.fillRect(-6, -18, 12, 8);
      g.strokeStyle = '#c9a36a'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -18); g.quadraticCurveTo(6, -26, 12, -24); g.stroke();
      g.shadowColor = '#ffd34f'; g.shadowBlur = 10; g.fillStyle = '#fff3a0'; g.save(); g.translate(14, -25); star(g, 5, 7, 3); g.fill(); g.restore();
    },
    chest(g) {
      g.shadowColor = '#ffd34f'; g.shadowBlur = 16;
      g.fillStyle = '#7a4520'; g.fillRect(-26, -6, 52, 30);
      g.shadowBlur = 0;
      g.fillStyle = lg(g, -24, -4, '#b56a30', '#7a4520');
      g.beginPath(); g.moveTo(-26, -4); g.quadraticCurveTo(-26, -24, 0, -24); g.quadraticCurveTo(26, -24, 26, -4); g.closePath(); g.fill();
      g.fillStyle = '#ffd34f';
      g.fillRect(-26, -6, 52, 5); g.fillRect(-22, -24, 5, 48); g.fillRect(17, -24, 5, 48);
      g.fillRect(-6, -4, 12, 12);
      g.fillStyle = '#3a1d0a'; g.fillRect(-2, 0, 4, 5);
    },
    revive(g) {
      g.shadowColor = '#ffe27a'; g.shadowBlur = 12;
      g.strokeStyle = '#ffe27a'; g.lineWidth = 4; g.beginPath(); g.ellipse(0, -20, 14, 5, 0, 0, TAU); g.stroke();
      g.fillStyle = lg(g, -10, 28, '#fffbe8', '#ffd34f');
      g.beginPath(); g.moveTo(-4, -10); g.lineTo(4, -10); g.lineTo(4, 2); g.lineTo(16, 2); g.lineTo(16, 10); g.lineTo(4, 10); g.lineTo(4, 28); g.lineTo(-4, 28); g.lineTo(-4, 10); g.lineTo(-16, 10); g.lineTo(-16, 2); g.lineTo(-4, 2); g.closePath(); g.fill();
    },
    dice(g) {
      g.fillStyle = '#f4f0ff'; g.beginPath(); g.roundRect ? g.roundRect(-22, -22, 44, 44, 9) : g.rect(-22, -22, 44, 44); g.fill();
      g.fillStyle = '#3a2a6a';
      for (const [x, y] of [[-11, -11], [11, -11], [0, 0], [-11, 11], [11, 11]]) { g.beginPath(); g.arc(x, y, 4.5, 0, TAU); g.fill(); }
    },
    skip(g) {
      g.fillStyle = '#9fd8ff';
      g.beginPath(); g.moveTo(-24, -18); g.lineTo(0, 0); g.lineTo(-24, 18); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(-2, -18); g.lineTo(22, 0); g.lineTo(-2, 18); g.closePath(); g.fill();
      g.fillRect(22, -18, 5, 36);
    },
    banish(g) {
      g.strokeStyle = '#ff5a6e'; g.lineWidth = 7;
      g.beginPath(); g.arc(0, 0, 22, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(-15, -15); g.lineTo(15, 15); g.stroke();
    },
    skull(g) {
      g.fillStyle = '#efe8d2'; g.beginPath(); g.arc(0, -4, 20, 0, TAU); g.fill(); g.fillRect(-12, 8, 24, 14);
      g.fillStyle = '#1a1420'; g.beginPath(); g.ellipse(-8, -4, 6, 7, 0, 0, TAU); g.ellipse(8, -4, 6, 7, 0, 0, TAU); g.fill();
      g.fillRect(-7, 14, 3, 8); g.fillRect(-1.5, 14, 3, 8); g.fillRect(4, 14, 3, 8);
    },
    clock(g) {
      g.strokeStyle = '#e8f0ff'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 22, 0, TAU); g.stroke();
      g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -14); g.moveTo(0, 0); g.lineTo(10, 6); g.stroke();
    },
    trophy(g) {
      g.fillStyle = lg(g, -26, 20, '#fff1a8', '#e0a020');
      g.beginPath(); g.moveTo(-18, -24); g.lineTo(18, -24); g.quadraticCurveTo(18, 6, 0, 8); g.quadraticCurveTo(-18, 6, -18, -24); g.fill();
      g.strokeStyle = '#e0a020'; g.lineWidth = 4;
      g.beginPath(); g.arc(-18, -14, 8, Math.PI / 2, Math.PI * 1.5); g.stroke(); g.beginPath(); g.arc(18, -14, 8, -Math.PI / 2, Math.PI / 2); g.stroke();
      g.fillStyle = '#e0a020'; g.fillRect(-4, 8, 8, 10); g.fillRect(-14, 18, 28, 7);
    },
    lock(g) {
      g.strokeStyle = '#9aa3b8'; g.lineWidth = 6; g.beginPath(); g.arc(0, -8, 12, Math.PI, 0); g.stroke();
      g.fillStyle = '#c7cede'; g.fillRect(-18, -8, 36, 30);
      g.fillStyle = '#3a3f50'; g.beginPath(); g.arc(0, 4, 5, 0, TAU); g.fill(); g.fillRect(-2, 4, 4, 10);
    },
  };


  // Neu gezeichnete Icons nach STYLE (Rampen, Licht oben links); der Umriss kommt aus finish()
  Object.assign(ICONS, {
    whip(g) {
      g.save(); g.rotate(-0.78);
      g.fillStyle = lin(g, -8, -30, 8, 10, ['#5a6276', '#bcc6dc', '#ffffff']);
      g.beginPath(); g.moveTo(0, -33); g.lineTo(7.5, -24); g.lineTo(7, 9); g.lineTo(-7, 9); g.lineTo(-7.5, -24); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.moveTo(0, -33); g.lineTo(-7.5, -24); g.lineTo(-7, 9); g.lineTo(-2.5, 9); g.lineTo(-2.5, -23); g.closePath(); g.fill();
      g.fillStyle = 'rgba(40,48,70,0.45)'; g.fillRect(-0.9, -22, 1.8, 29);
      g.fillStyle = lin(g, -16, 8, 16, 16, R_.gold); g.beginPath(); g.moveTo(-16, 9); g.lineTo(16, 9); g.lineTo(13, 15.5); g.lineTo(-13, 15.5); g.closePath(); g.fill();
      g.fillStyle = lin(g, -4, 15, 4, 28, R_.wood); g.fillRect(-4, 15, 8, 13);
      inkLine(g, 1.6, 0.5); for (let y = 18; y < 28; y += 3.5) { g.beginPath(); g.moveTo(-4, y); g.lineTo(4, y + 2); g.stroke(); }
      g.fillStyle = sph(g, 0, 31, 5, R_.gold); circ(g, 0, 31, 4.8); g.fill();
      g.restore();
    },
    wand(g) {
      g.save(); g.translate(-5, 7); g.rotate(-0.78 + Math.PI / 2);
      g.fillStyle = lin(g, -3, -6, 3, 30, R_.wood); g.fillRect(-3.4, -4, 6.8, 30);
      g.fillStyle = lin(g, -4, -6, 4, 0, R_.gold); g.fillRect(-4.4, -7, 8.8, 5);
      g.restore();
      g.save(); g.translate(9, -9);
      g.shadowColor = '#c08cff'; g.shadowBlur = 12;
      g.fillStyle = sph(g, 0, 0, 17, R_.violet, 0.35); star(g, 5, 17.5, 7.5); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(255,255,255,0.85)'; star(g, 5, 7, 3.2); g.fill();
      g.restore();
      g.fillStyle = '#fff3ff'; for (const [x, y, r] of [[-14, -18, 2.4], [24, 8, 2], [-4, -26, 1.6]]) { g.save(); g.translate(x, y); star(g, 4, r * 2, r * 0.6); g.fill(); g.restore(); }
    },
    orbit(g) {
      g.strokeStyle = 'rgba(140,220,255,0.6)'; g.lineWidth = 2.5;
      g.beginPath(); g.arc(0, 0, 20, 0, TAU); g.stroke();
      g.fillStyle = sph(g, 0, 0, 8, R_.sky); circ(g, 0, 0, 7); g.fill();
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * TAU - 0.5, x = Math.cos(a) * 20, y = Math.sin(a) * 20;
        g.fillStyle = sph(g, x, y, 10, ['#1c64b8', '#3fc8ff', '#f2fdff']); circ(g, x, y, 9); g.fill();
        glint(g, x - 3, y - 3.4, 2.4);
      }
    },
    might(g) {
      g.fillStyle = lin(g, -18, -28, 18, 24, R_.red);
      g.beginPath(); g.moveTo(0, -29); g.lineTo(20, -5); g.lineTo(9, -5); g.lineTo(9, 25); g.lineTo(-9, 25); g.lineTo(-9, -5); g.lineTo(-20, -5); g.closePath(); g.fill();
      g.fillStyle = 'rgba(122,12,30,0.55)'; g.beginPath(); g.moveTo(0, -29); g.lineTo(20, -5); g.lineTo(9, -5); g.lineTo(9, 25); g.lineTo(2, 25); g.lineTo(2, -5); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(-5.5, -4, 3.2, 26);
    },
    heart(g) {
      g.fillStyle = sph(g, -4, -6, 30, R_.red, 0.42);
      heartPath(g, 25); g.fill();
      glint(g, -11, -9, 5.5, 0.8); glint(g, -4, -14, 2, 0.8);
    },
    lightning(g) {
      g.shadowColor = '#7cf0ff'; g.shadowBlur = 10;
      g.fillStyle = lin(g, -14, -28, 16, 28, ['#1a78aa', '#5ce1ff', '#f4ffff']);
      g.beginPath(); g.moveTo(7, -30); g.lineTo(-15, 5); g.lineTo(-1, 5); g.lineTo(-9, 30); g.lineTo(17, -7); g.lineTo(3, -7); g.lineTo(13, -30); g.closePath(); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.moveTo(7, -30); g.lineTo(-15, 5); g.lineTo(-9, 5); g.lineTo(9.5, -30); g.closePath(); g.fill();
    },
    hourglass(g) {
      g.fillStyle = 'rgba(210,240,255,0.5)';
      g.beginPath(); g.moveTo(-15, -22); g.lineTo(15, -22); g.quadraticCurveTo(14, -6, 3, 0); g.quadraticCurveTo(14, 6, 15, 22); g.lineTo(-15, 22); g.quadraticCurveTo(-14, 6, -3, 0); g.quadraticCurveTo(-14, -6, -15, -22); g.closePath(); g.fill();
      g.fillStyle = lin(g, -10, -14, 10, 22, R_.gold);
      g.beginPath(); g.moveTo(-9, -11); g.lineTo(9, -11); g.lineTo(1.5, -2); g.lineTo(-1.5, -2); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(-13, 21); g.lineTo(13, 21); g.quadraticCurveTo(6, 9, 0, 8); g.quadraticCurveTo(-6, 9, -13, 21); g.fill();
      g.fillRect(-0.8, -2, 1.6, 10);
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(-11, -19, 2.5, 9);
      for (const y of [-29, 21]) { g.fillStyle = lin(g, -21, y, 21, y + 8, R_.wood); g.fillRect(-21, y, 42, 8); }
      g.fillStyle = lin(g, -21, -22, -17, 22, R_.wood); g.fillRect(-20, -22, 3.5, 44); g.fillRect(16.5, -22, 3.5, 44);
    },
    skull(g) {
      g.fillStyle = sph(g, 0, -4, 22, R_.bone); circ(g, 0, -5, 20); g.fill();
      g.beginPath(); g.moveTo(-13, 5); g.lineTo(13, 5); g.lineTo(11, 22); g.lineTo(-11, 22); g.closePath(); g.fill();
      g.fillStyle = STYLE.ink; ell(g, -8, -4, 6.5, 7.5, 0.15); g.fill(); ell(g, 8, -4, 6.5, 7.5, -0.15); g.fill();
      g.beginPath(); g.moveTo(0, 4); g.lineTo(-3, 10); g.lineTo(3, 10); g.closePath(); g.fill();
      g.fillRect(-7, 14, 2.5, 8); g.fillRect(-1.25, 14, 2.5, 8); g.fillRect(4.5, 14, 2.5, 8);
      glint(g, -9, -18, 4, 0.6);
    },
    coin(g) {
      g.fillStyle = R_.gold[0]; circ(g, 1.5, 2.5, 21); g.fill();
      g.fillStyle = sph(g, 0, 0, 22, R_.gold); circ(g, 0, 0, 20.5); g.fill();
      g.strokeStyle = 'rgba(138,78,12,0.8)'; g.lineWidth = 2.5; circ(g, 0, 0, 14.5); g.stroke();
      g.fillStyle = 'rgba(138,78,12,0.7)'; star(g, 5, 9, 4); g.fill();
      glint(g, -8, -10, 5, 0.75);
    },
    chest(g) {
      g.save(); g.shadowColor = '#ffd34f'; g.shadowBlur = 16;
      g.fillStyle = lin(g, -26, -4, 26, 26, R_.wood); g.fillRect(-27, -5, 54, 30); g.restore();
      g.fillStyle = sph(g, -6, -20, 34, R_.wood, 0.45);
      g.beginPath(); g.moveTo(-27, -3); g.quadraticCurveTo(-27, -26, 0, -26); g.quadraticCurveTo(27, -26, 27, -3); g.closePath(); g.fill();
      inkLine(g, 1.5, 0.45); for (const y of [7, 16]) { g.beginPath(); g.moveTo(-26, y); g.lineTo(26, y); g.stroke(); }
      const gold = lin(g, -27, -26, 27, 25, R_.gold);
      g.fillStyle = gold; g.fillRect(-27, -6, 54, 5); g.fillRect(-23, -25, 5.5, 50); g.fillRect(17.5, -25, 5.5, 50);
      g.fillStyle = sph(g, 0, 2, 9, R_.gold); g.beginPath(); g.moveTo(-7, -4); g.lineTo(7, -4); g.lineTo(7, 7); g.quadraticCurveTo(0, 12, -7, 7); g.closePath(); g.fill();
      g.fillStyle = '#2a1206'; circ(g, 0, 1.5, 2.2); g.fill(); g.fillRect(-1, 2, 2, 5);
    },
    bomb(g) {
      g.fillStyle = sph(g, 0, 6, 22, R_.iron, 0.4); circ(g, 0, 6, 20); g.fill();
      glint(g, -8, -3, 5, 0.6);
      g.fillStyle = lin(g, -7, -19, 7, -10, R_.iron); g.fillRect(-7, -19, 14, 9);
      g.strokeStyle = '#c9a36a'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, -19); g.quadraticCurveTo(6, -27, 12, -25); g.stroke();
      g.save(); g.shadowColor = '#ffd34f'; g.shadowBlur = 10; g.fillStyle = '#fff3a0'; g.translate(14, -26); star(g, 5, 8, 3.2); g.fill(); g.restore();
    },
    aura(g) {
      const gr = g.createRadialGradient(0, 0, 3, 0, 0, 31);
      gr.addColorStop(0, 'rgba(255,226,140,0.5)'); gr.addColorStop(0.6, 'rgba(255,120,40,0.22)'); gr.addColorStop(1, 'rgba(255,80,20,0)');
      g.fillStyle = gr; circ(g, 0, 0, 31); g.fill();
      for (let i = 0; i < 8; i++) {
        g.save(); g.rotate(i * TAU / 8 + 0.2);
        g.fillStyle = lin(g, -5, -30, 5, -14, R_.ember);
        g.beginPath(); g.moveTo(-5.5, -15); g.quadraticCurveTo(-6, -24, 0, -30); g.quadraticCurveTo(5, -23, 5.5, -15); g.closePath(); g.fill();
        g.restore();
      }
      g.strokeStyle = R_.ember[1]; g.lineWidth = 5; circ(g, 0, 0, 17); g.stroke();
      g.strokeStyle = 'rgba(255,240,180,0.7)'; g.lineWidth = 1.6; g.beginPath(); g.arc(0, 0, 17, Math.PI * 0.95, Math.PI * 1.6); g.stroke();
      g.fillStyle = sph(g, 0, 0, 9, R_.ember, 0.35); circ(g, 0, 0, 8); g.fill();
      glint(g, -2.5, -3, 2.2);
    },
    magnet(g) {
      g.lineCap = 'butt';
      g.lineWidth = 13; g.strokeStyle = lin(g, -22, -20, 22, 22, R_.red);
      g.beginPath(); g.moveTo(-16, -14); g.lineTo(-16, 0); g.arc(0, 0, 16, Math.PI, 0, true); g.lineTo(16, -14); g.stroke();
      g.fillStyle = lin(g, -22, -28, 22, -14, ['#5a6276', '#c8d0e0', '#ffffff']); g.fillRect(-22.5, -27, 13, 12); g.fillRect(9.5, -27, 13, 12);
      g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 20, Math.PI * 0.95, Math.PI * 0.6, true); g.stroke();
    },
    bag(g) {
      g.fillStyle = sph(g, -4, 4, 28, ['#5a3816', '#a8763e', '#e4b878']);
      g.beginPath(); g.moveTo(-8, -15); g.quadraticCurveTo(-27, 4, -21, 22); g.quadraticCurveTo(0, 30, 21, 22); g.quadraticCurveTo(27, 4, 8, -15); g.closePath(); g.fill();
      g.fillStyle = sph(g, 0, -22, 10, ['#5a3816', '#a8763e', '#e4b878']); g.beginPath(); g.moveTo(-8, -15); g.lineTo(-13, -26); g.lineTo(0, -21); g.lineTo(13, -26); g.lineTo(8, -15); g.closePath(); g.fill();
      g.fillStyle = '#4a2a10'; g.fillRect(-10, -17, 20, 4);
      g.fillStyle = sph(g, 0, 8, 9, R_.gold); circ(g, 0, 8, 8.5); g.fill();
      g.fillStyle = 'rgba(138,78,12,0.7)'; g.save(); g.translate(0, 8); star(g, 5, 5, 2.2); g.fill(); g.restore();
    },
  });

  // Zweite Runde (M6): die übrigen Symbole nach STYLE – Rampen, Licht oben links, Glanzpunkt; Umriss aus finish()
  const STEEL = ['#4a5266', '#b4bed4', '#ffffff'], GLASS = ['rgba(120,170,210,0.55)', 'rgba(200,235,255,0.5)', 'rgba(255,255,255,0.85)'];
  Object.assign(ICONS, {
    sickle(g) {
      g.save(); g.rotate(0.15);
      g.fillStyle = lin(g, -4, 6, 4, 30, R_.wood); g.save(); g.rotate(0.7); roundRect(g, -3.4, 4, 6.8, 26, 2.5); g.fill();
      g.fillStyle = lin(g, -4, 2, 4, 8, R_.gold); g.fillRect(-4.2, 2, 8.4, 4.5); g.restore();
      g.fillStyle = lin(g, -24, -26, 24, 16, STEEL);
      g.beginPath(); g.arc(0, 0, 26, -2.75, 1.0); g.quadraticCurveTo(14, 4, 9, -1); g.arc(4, -4, 17, 0.55, -2.6, true); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(0, 0, 24.5, -2.65, -1.2); g.arc(1.5, -2, 21, -1.2, -2.6, true); g.closePath(); g.fill();
      g.restore();
    },
    fire(g) {
      // Feuerflasche: Glaskolben mit glühendem Inhalt, Korken, Flamme
      g.fillStyle = sph(g, -4, 2, 26, ['#7a1606', '#ff6a2b', '#ffd27a'], 0.45);
      g.beginPath(); g.arc(0, 9, 17, -0.15, Math.PI + 0.15); g.closePath(); g.fill();
      g.fillStyle = GLASS[1]; g.beginPath(); g.moveTo(-6, -22); g.lineTo(6, -22); g.lineTo(6, -11); g.quadraticCurveTo(20, -5, 20, 10); g.quadraticCurveTo(20, 27, 0, 27); g.quadraticCurveTo(-20, 27, -20, 10); g.quadraticCurveTo(-20, -5, -6, -11); g.closePath(); g.fill();
      g.fillStyle = sph(g, -4, 2, 26, ['#7a1606', '#ff6a2b', '#ffd27a'], 0.45); g.beginPath(); g.moveTo(-18.6, 6); g.quadraticCurveTo(-18.6, 25.4, 0, 25.4); g.quadraticCurveTo(18.6, 25.4, 18.6, 6); g.quadraticCurveTo(0, 2, -18.6, 6); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.ellipse(-11, 0, 3, 8, 0.4, 0, TAU); g.fill();
      g.fillStyle = lin(g, -6, -29, 6, -21, R_.wood); g.fillRect(-6.5, -29, 13, 8);
      g.save(); g.shadowColor = '#ffb13b'; g.shadowBlur = 10; g.fillStyle = lin(g, -4, -46, 4, -30, R_.ember);
      g.beginPath(); g.moveTo(-3, -29); g.quadraticCurveTo(-9, -37, 1, -47); g.quadraticCurveTo(1, -40, 6, -36); g.quadraticCurveTo(7, -31, 3, -29); g.closePath(); g.fill(); g.restore();
    },
    nova(g) {
      g.save(); g.shadowColor = '#7fd8ff'; g.shadowBlur = 8;
      for (let i = 0; i < 6; i++) {
        g.save(); g.rotate(i * Math.PI / 3);
        g.fillStyle = lin(g, -4, -29, 4, 0, ['#3a86c8', '#9fe2ff', '#ffffff']);
        g.beginPath(); g.moveTo(-3, 0); g.lineTo(-3, -18); g.lineTo(-10, -24); g.lineTo(-7.5, -27); g.lineTo(-2, -22); g.lineTo(0, -30); g.lineTo(2, -22); g.lineTo(7.5, -27); g.lineTo(10, -24); g.lineTo(3, -18); g.lineTo(3, 0); g.closePath(); g.fill();
        g.restore();
      }
      g.restore();
      g.fillStyle = sph(g, 0, 0, 9, ['#3a86c8', '#bfefff', '#ffffff']); circ(g, 0, 0, 8); g.fill();
      glint(g, -2.5, -3, 2);
    },
    knives(g) {
      for (const [x, rot] of [[-13, -0.32], [13, 0.32], [0, 0]]) {
        g.save(); g.translate(x, 6); g.rotate(rot);
        g.fillStyle = lin(g, -6, -30, 6, -6, STEEL);
        g.beginPath(); g.moveTo(0, -31); g.lineTo(5.5, -7); g.lineTo(-5.5, -7); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.moveTo(0, -31); g.lineTo(-5.5, -7); g.lineTo(-1, -7); g.closePath(); g.fill();
        g.fillStyle = lin(g, -7, -8, 7, -3, R_.gold); g.fillRect(-7, -7.5, 14, 4.5);
        g.fillStyle = lin(g, -3, -3, 3, 11, R_.wood); g.fillRect(-2.8, -3, 5.6, 13);
        g.fillStyle = sph(g, 0, 12, 3, R_.gold); circ(g, 0, 12, 2.8); g.fill();
        g.restore();
      }
    },
    armor(g) {
      g.fillStyle = lin(g, -22, -28, 22, 28, STEEL);
      g.beginPath(); g.moveTo(0, -29); g.lineTo(23, -19); g.quadraticCurveTo(23, 14, 0, 29); g.quadraticCurveTo(-23, 14, -23, -19); g.closePath(); g.fill();
      g.fillStyle = 'rgba(18,10,24,0.25)'; g.beginPath(); g.moveTo(0, -29); g.lineTo(23, -19); g.quadraticCurveTo(23, 14, 0, 29); g.closePath(); g.fill();
      g.fillStyle = lin(g, -12, -18, 12, 18, R_.sky); g.beginPath(); g.moveTo(0, -19); g.lineTo(13, -12); g.quadraticCurveTo(13, 8, 0, 19); g.quadraticCurveTo(-13, 8, -13, -12); g.closePath(); g.fill();
      g.fillStyle = lin(g, -3, -16, 3, 16, R_.gold); g.fillRect(-2.6, -16, 5.2, 32); g.fillRect(-11, -5, 22, 5);
      glint(g, -12, -16, 4, 0.7);
    },
    boots(g) {
      g.fillStyle = sph(g, -6, -10, 34, R_.wood, 0.45);
      g.beginPath(); g.moveTo(-13, -24); g.lineTo(7, -24); g.lineTo(7, 4); g.quadraticCurveTo(25, 8, 25, 18); g.lineTo(25, 23); g.lineTo(-15, 23); g.quadraticCurveTo(-15, 0, -13, -24); g.closePath(); g.fill();
      g.fillStyle = lin(g, -15, 18, 25, 26, ['#1c1426', '#3a2c48', '#6a5a7e']); g.fillRect(-15, 19, 40, 6);
      g.fillStyle = lin(g, -14, -27, 8, -20, R_.gold); g.fillRect(-14, -27, 22, 6);
      g.fillStyle = sph(g, -22, -12, 12, ['#8ab8e0', '#e8f6ff', '#ffffff']);
      g.beginPath(); g.moveTo(-13, -16); g.quadraticCurveTo(-26, -26, -31, -20); g.quadraticCurveTo(-25, -17, -29, -11); g.quadraticCurveTo(-22, -11, -26, -4); g.quadraticCurveTo(-18, -5, -13, -6); g.closePath(); g.fill();
      inkLine(g, 1.6, 0.45); for (const y of [-14, -6, 2]) { g.beginPath(); g.moveTo(1, y); g.lineTo(7, y + 2); g.stroke(); }
    },
    lens(g) {
      g.lineCap = 'round'; g.lineWidth = 9; g.strokeStyle = lin(g, 8, 8, 26, 26, R_.wood); g.beginPath(); g.moveTo(10, 10); g.lineTo(25, 25); g.stroke();
      g.fillStyle = sph(g, -5, -5, 22, ['#3a86c8', '#9fe2ff', '#f2fdff'], 0.5); circ(g, -5, -5, 15); g.fill();
      g.lineWidth = 6; g.strokeStyle = lin(g, -22, -22, 12, 12, R_.gold); circ(g, -5, -5, 17); g.stroke();
      glint(g, -11, -11, 4.5, 0.85); glint(g, -3, -14, 1.6, 0.8);
    },
    mirror(g) {
      for (const [x, y, ramp] of [[-8, -5, ['#1a7898', '#5ce8ff', '#e6feff']], [8, 6, ['#5a2a9e', '#b88cff', '#f4ecff']]]) {
        g.fillStyle = ramp[1]; poly(g, [[x, y - 22], [x + 14, y], [x, y + 22], [x - 14, y]]); g.fill();
        g.fillStyle = ramp[2]; poly(g, [[x, y - 22], [x - 14, y], [x - 2, y]]); g.fill();
        g.fillStyle = ramp[0]; poly(g, [[x, y + 22], [x + 14, y], [x + 2, y]]); g.fill();
        glint(g, x - 4, y - 8, 2.2, 0.8);
      }
    },
    clover(g) {
      g.strokeStyle = lin(g, 0, 0, 6, 28, R_.leaf); g.lineWidth = 4.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(7, 18, 3, 29); g.stroke();
      for (let i = 0; i < 4; i++) {
        g.save(); g.rotate(i * Math.PI / 2 + Math.PI / 4);
        g.translate(0, -12.5); g.fillStyle = sph(g, -3, -3, 15, R_.leaf, 0.45); heartPath(g, 12.5); g.fill();
        g.restore();
      }
      g.fillStyle = 'rgba(28,82,40,0.6)'; circ(g, 0, 0, 3); g.fill();
      glint(g, -13, -12, 3, 0.6);
    },
    elixir(g) {
      const pink = ['#7a0c44', '#ff4f9a', '#ffc2de'];
      g.fillStyle = GLASS[1]; circ(g, 0, 9, 19); g.fill(); g.fillRect(-6.5, -21, 13, 16);
      g.fillStyle = sph(g, -4, 6, 20, pink, 0.45); g.beginPath(); g.arc(0, 9, 17, -0.25, Math.PI + 0.25); g.quadraticCurveTo(0, 3, 16.5, 4.8); g.fill();
      g.fillStyle = 'rgba(255,220,240,0.7)'; for (const [x, y, r] of [[-5, 14, 2.4], [6, 18, 1.8], [2, 9, 1.4]]) { circ(g, x, y, r); g.fill(); }
      g.fillStyle = lin(g, -7, -29, 7, -20, R_.wood); g.fillRect(-7.5, -29, 15, 8);
      g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.ellipse(-10, 2, 3, 7, 0.45, 0, TAU); g.fill();
    },
    candle(g) {
      g.fillStyle = lin(g, -12, 20, 12, 30, R_.gold); g.beginPath(); g.ellipse(0, 25, 17, 5, 0, 0, TAU); g.fill();
      g.fillStyle = lin(g, -10, -8, 10, 26, ['#c8b48a', '#fff4dc', '#ffffff']); g.fillRect(-9, -8, 18, 32);
      g.fillStyle = '#fff8ea'; g.beginPath(); g.moveTo(3, -8); g.quadraticCurveTo(5, 0, 3.5, 6); g.quadraticCurveTo(2, 0, 1, -8); g.fill();
      g.fillStyle = '#3a2416'; g.fillRect(-1, -12, 2, 5);
      g.save(); g.shadowColor = '#ffb13b'; g.shadowBlur = 14; g.fillStyle = lin(g, -6, -34, 6, -12, R_.ember);
      g.beginPath(); g.moveTo(0, -11); g.quadraticCurveTo(10, -20, 0, -34); g.quadraticCurveTo(-10, -20, 0, -11); g.fill(); g.restore();
      g.fillStyle = '#fffbe8'; g.beginPath(); g.ellipse(0, -17, 2.8, 4.6, 0, 0, TAU); g.fill();
    },
    wing(g) {
      const W = ['#5a8ab8', '#e8f6ff', '#ffffff'];
      for (let i = 3; i >= 0; i--) {
        g.fillStyle = sph(g, -10 + i * 5, -14 + i * 8, 24, W, 0.5);
        g.beginPath(); g.ellipse(-3 + i * 6, -9 + i * 9, 23 - i * 3.5, 6.5, -0.5, 0, TAU); g.fill();
        inkLine(g, 1, 0.3); g.beginPath(); g.moveTo(-18 + i * 7, -2 + i * 9); g.lineTo(10 + i * 4, -16 + i * 8.5); g.stroke();
      }
      g.fillStyle = sph(g, -15, -15, 9, R_.sky); ell(g, -14, -14, 8, 6.5); g.fill();
      glint(g, -17, -17, 2.2, 0.8);
    },
    growth(g) {
      g.fillStyle = lin(g, -13, -20, 13, 20, rampOf('#4fc3ff'));
      poly(g, [[-2, -20], [11, 0], [-2, 20], [-15, 0]]); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.65)'; poly(g, [[-2, -20], [-15, 0], [-4, 0]]); g.fill();
      g.fillStyle = 'rgba(18,40,90,0.35)'; poly(g, [[-2, 20], [11, 0], [0, 0]]); g.fill();
      g.fillStyle = lin(g, 12, -30, 26, -12, R_.slime); poly(g, [[19, -30], [28, -16], [22, -16], [22, -4], [16, -4], [16, -16], [10, -16]]); g.fill();
    },
    revive(g) {
      g.save(); g.shadowColor = '#ffe27a'; g.shadowBlur = 10;
      g.strokeStyle = lin(g, -14, -24, 14, -16, R_.gold); g.lineWidth = 4; g.beginPath(); g.ellipse(0, -22, 14, 5, 0, 0, TAU); g.stroke(); g.restore();
      g.fillStyle = lin(g, -16, -10, 16, 28, ['#c08a1c', '#ffe27a', '#fffbe8']);
      g.beginPath(); g.moveTo(-4.5, -11); g.lineTo(4.5, -11); g.lineTo(4.5, 1); g.lineTo(17, 1); g.lineTo(17, 10); g.lineTo(4.5, 10); g.lineTo(4.5, 29); g.lineTo(-4.5, 29); g.lineTo(-4.5, 10); g.lineTo(-17, 10); g.lineTo(-17, 1); g.lineTo(-4.5, 1); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(-4.5, -11, 2.4, 40); g.fillRect(-17, 1, 30, 2.2);
    },
    dice(g) {
      g.fillStyle = lin(g, -22, -22, 22, 22, ['#8a7ab8', '#e8e2ff', '#ffffff']); roundRect(g, -22, -22, 44, 44, 9); g.fill();
      g.fillStyle = 'rgba(58,42,106,0.25)'; roundRect(g, -6, -6, 28, 28, 7); g.fill();
      for (const [x, y] of [[-11, -11], [11, -11], [0, 0], [-11, 11], [11, 11]]) { g.fillStyle = '#3a2a6a'; circ(g, x, y, 4.6); g.fill(); g.fillStyle = 'rgba(255,255,255,0.35)'; circ(g, x + 1, y + 1.4, 1.6); g.fill(); }
      glint(g, -15, -15, 3.5, 0.8);
    },
    skip(g) {
      const S = R_.sky;
      g.fillStyle = lin(g, -24, -18, 0, 18, S); poly(g, [[-25, -18], [-1, 0], [-25, 18]]); g.fill();
      g.fillStyle = lin(g, -2, -18, 22, 18, S); poly(g, [[-3, -18], [21, 0], [-3, 18]]); g.fill();
      g.fillStyle = lin(g, 22, -18, 28, 18, S); g.fillRect(22, -18, 6, 36);
      g.fillStyle = 'rgba(255,255,255,0.55)'; poly(g, [[-25, -18], [-1, 0], [-21, -10]]); g.fill(); poly(g, [[-3, -18], [21, 0], [1, -10]]); g.fill();
    },
    banish(g) {
      g.lineWidth = 8; g.strokeStyle = lin(g, -24, -24, 24, 24, R_.red);
      circ(g, 0, 0, 21); g.stroke();
      g.lineCap = 'butt'; g.beginPath(); g.moveTo(-14.5, -14.5); g.lineTo(14.5, 14.5); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 23, Math.PI * 1.0, Math.PI * 1.45); g.stroke();
    },
    clock(g) {
      g.fillStyle = sph(g, 0, 0, 26, ['#2a2244', '#4a3c78', '#8a7ac8'], 0.5); circ(g, 0, 0, 22); g.fill();
      g.lineWidth = 4.5; g.strokeStyle = lin(g, -22, -22, 22, 22, R_.gold); circ(g, 0, 0, 22); g.stroke();
      g.fillStyle = '#fff6dc'; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; circ(g, Math.cos(a) * 16, Math.sin(a) * 16, i % 3 ? 1 : 1.8); g.fill(); }
      g.strokeStyle = '#fff6dc'; g.lineWidth = 3.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -12.5); g.moveTo(0, 0); g.lineTo(9, 5.5); g.stroke();
      g.fillStyle = R_.gold[1]; circ(g, 0, 0, 2.6); g.fill();
      glint(g, -10, -12, 3.5, 0.5);
    },
    trophy(g) {
      const Gd = R_.gold;
      g.lineWidth = 4.5; g.strokeStyle = lin(g, -26, -22, 26, 0, Gd);
      g.beginPath(); g.arc(-18, -13, 8, Math.PI / 2, Math.PI * 1.5); g.stroke(); g.beginPath(); g.arc(18, -13, 8, -Math.PI / 2, Math.PI / 2); g.stroke();
      g.fillStyle = sph(g, -6, -18, 28, Gd, 0.42);
      g.beginPath(); g.moveTo(-18, -24); g.lineTo(18, -24); g.quadraticCurveTo(18, 6, 0, 8); g.quadraticCurveTo(-18, 6, -18, -24); g.fill();
      g.fillStyle = lin(g, -4, 8, 4, 18, Gd); g.fillRect(-4, 7, 8, 11);
      g.fillStyle = lin(g, -15, 17, 15, 27, R_.wood); roundRect(g, -15, 17, 30, 9, 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.65)'; g.beginPath(); g.ellipse(-9, -14, 3, 7, 0.15, 0, TAU); g.fill();
      g.fillStyle = 'rgba(138,78,12,0.65)'; g.save(); g.translate(1, -10); star(g, 5, 7, 3); g.fill(); g.restore();
    },
    lock(g) {
      g.lineWidth = 6.5; g.strokeStyle = lin(g, -14, -24, 14, -6, STEEL); g.beginPath(); g.arc(0, -8, 12, Math.PI, 0); g.lineTo(12, -6); g.moveTo(-12, -6); g.lineTo(-12, -8); g.stroke();
      g.fillStyle = sph(g, -8, -4, 34, R_.gold, 0.45); roundRect(g, -19, -8, 38, 31, 5); g.fill();
      g.fillStyle = '#2a1206'; circ(g, 0, 4, 5); g.fill(); g.beginPath(); g.moveTo(-2.4, 4); g.lineTo(2.4, 4); g.lineTo(3.4, 15); g.lineTo(-3.4, 15); g.closePath(); g.fill();
      glint(g, -12, -3, 3, 0.65);
    },
  });

  function drawIcon(g, id) {
    const fn = ICONS[id];
    if (!fn) return;
    g.save(); fn(g); g.restore();
  }

  function iconURL(id, size) {
    size = size || 64;
    const key = 'u' + id + size;
    let u = cache.get(key);
    if (u) return u;
    const cv = canvas(size, size);
    cv.c.size = size;
    cv.g.translate(size / 2, size / 2);
    cv.g.scale(size / 64 * 0.86, size / 64 * 0.86);
    drawIcon(cv.g, id);
    finish(cv.c, { w: clamp(size / 64 * 3, 1.3, 3), rimW: size >= 48 ? 1.2 : 0.8 });
    u = cv.c.toDataURL();
    cache.set(key, u);
    return u;
  }

  // Bildnis für die Heldenauswahl: Ausschnitt um die Figur (Kopfbedeckung bis Stiefel), scharf in Zielgröße;
  // locked: dunkle Silhouette des Helden
  function playerURL(id, size, locked) {
    const key = 'pu' + id + size + (locked ? 'L' : '');
    let u = cache.get(key);
    if (u) return u;
    const crop = 56, k = size * 2 / (crop * SC);
    const src = hires('pu' + id, Math.max(1, k), () => player(id, 0, false));
    const f = src.width / HERO_BOX, sx = (HERO_BOX - crop) / 2 * f, sy = (HERO_BOX - crop) / 2 * f - 7 * f;
    const c = document.createElement('canvas');
    c.width = c.height = size * 2;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, sx, sy, crop * f, crop * f, 0, 0, c.width, c.height);
    if (locked) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(30,24,46,0.94)'; g.fillRect(0, 0, c.width, c.height); }
    u = c.toDataURL();
    cache.set(key, u);
    return u;
  }

  // ---------- Boden & Deko ----------
  // Stein-, Eis-, Riss- und Kristallmuster je Land: Voronoi-Zellen auf dem Torus (nahtlos), pro Pixel gerechnet.
  // Fase: Zellrand zum Licht (oben links) hell, abgewandt dunkel; Fuge dunkel oder hell (Eisriss) oder glühend.
  const VORO = {
    ruins: { n: 11, jit: 0.85, holes: 0.12, stone: '#9a917c', cover: 0.55, vary: 0.22, bevel: 0.30, bw: 6, dome: 0.16, mw: 2.0, mortar: '#211c16', moss: '#4a6a32', mossP: 0.18 },
    frostlake: { n: 5, jit: 0.9, holes: 0, stone: '#8ec0e8', cover: 0.32, vary: 0.16, bevel: 0.22, bw: 9, dome: 0.10, mw: 1.1, mortar: '#f2fbff', halo: '#16304e', hw: 3.2, sheen: 0.16 },
    ashwood: { n: 7, jit: 0.9, holes: 0, stone: '#4a3632', cover: 0.35, vary: 0.18, bevel: 0.18, bw: 7, dome: 0.12, mw: 1.8, mortar: '#120a08', glow: '#ff6a1e', glowP: 0.26, gw: 6 },
    nightheart: { n: 6, jit: 0.75, holes: 0, stone: '#5a46a8', cover: 0.38, vary: 0.2, bevel: 0.30, bw: 6, dome: 0.0, mw: 1.6, mortar: '#140c2e', glow: '#9a7cff', glowP: 0.28, gw: 6, sheen: 0.22 },
  };
  function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function voronoi(g, S, o, rnd) {
    const N = o.n, cs = S / N, M = N * N;
    const px = new Float32Array(M), py = new Float32Array(M), vv = new Float32Array(M), ang = new Float32Array(M), hole = new Uint8Array(M);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      px[k] = (i + 0.5 + (rnd() - 0.5) * o.jit) * cs; py[k] = (j + 0.5 + (rnd() - 0.5) * o.jit) * cs;
      vv[k] = rnd(); ang[k] = rnd() * TAU; hole[k] = rnd() < o.holes ? 1 : 0;
    }
    const img = g.getImageData(0, 0, S, S), d = img.data;
    const st = rgb(o.stone), mo = rgb(o.mortar), gl = o.glow ? rgb(o.glow) : null, ha = o.halo ? rgb(o.halo) : null, ms = o.moss ? rgb(o.moss) : null;
    const Lx = -0.7071, Ly = -0.7071;
    for (let y = 0; y < S; y++) {
      const cy = Math.floor(y / cs);
      for (let x = 0; x < S; x++) {
        const cx = Math.floor(x / cs);
        let d1 = 1e9, d2 = 1e9, k1 = 0, k2 = 0, x1 = 0, y1 = 0, x2 = 0, y2 = 0;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const gx = cx + ox, gy = cy + oy, wi = (gx + N) % N, wj = (gy + N) % N, k = wj * N + wi;
          const qx = px[k] + (gx - wi) * cs, qy = py[k] + (gy - wj) * cs;
          const dd = (qx - x) * (qx - x) + (qy - y) * (qy - y);
          if (dd < d1) { d2 = d1; k2 = k1; x2 = x1; y2 = y1; d1 = dd; k1 = k; x1 = qx; y1 = qy; }
          else if (dd < d2) { d2 = dd; k2 = k; x2 = qx; y2 = qy; }
        }
        const ex = x2 - x1, ey = y2 - y1, el = Math.sqrt(ex * ex + ey * ey) || 1;
        const e = (d2 - d1) / (2 * el); // Abstand zur Zellgrenze
        const i = (y * S + x) * 4;
        let r = d[i], gg = d[i + 1], b = d[i + 2];
        if (!hole[k1] || !hole[k2]) {
          if (!hole[k1]) {
            const f = 1 + (vv[k1] - 0.5) * o.vary;
            r = (r + (st[0] - r) * o.cover) * f; gg = (gg + (st[1] - gg) * o.cover) * f; b = (b + (st[2] - b) * o.cover) * f;
            // Wölbung zur Zellmitte und Schimmer entlang einer Richtung je Zelle
            const rd = Math.sqrt(d1) / cs;
            let l = -rd * o.dome * 120;
            if (o.sheen) l += ((x - x1) * Math.cos(ang[k1]) + (y - y1) * Math.sin(ang[k1])) / cs * o.sheen * 120;
            // Fase
            if (e < o.bw) { const kk = 1 - e / o.bw; l += (ex / el * Lx + ey / el * Ly) * kk * kk * o.bevel * 255; }
            r += l; gg += l; b += l;
          } else if (e < o.bw) { const l = -(1 - e / o.bw) * 40; r += l; gg += l; b += l; }
          // Fuge
          if (ha && e < o.hw) { const t = 1 - e / o.hw; r += (ha[0] - r) * t * 0.6; gg += (ha[1] - gg) * t * 0.6; b += (ha[2] - b) * t * 0.6; }
          if (e < o.mw) {
            const t = Math.min(1, (o.mw - e) / 1.1);
            let m = mo;
            if (ms && ((vv[k1] + vv[k2]) * 7.3) % 1 < o.mossP) m = ms;
            r += (m[0] - r) * t; gg += (m[1] - gg) * t; b += (m[2] - b) * t;
          }
          if (gl && ((vv[k1] + vv[k2]) * 13.7) % 1 < o.glowP && e < o.gw) {
            const t = 1 - e / o.gw, t2 = t * t * t;
            r += gl[0] * t2 * 0.75; gg += gl[1] * t2 * 0.75; b += gl[2] * t2 * 0.75;
            if (e < 1.1) { r += 70; gg += 50; b += 30; }
          }
        }
        d[i] = r; d[i + 1] = gg; d[i + 2] = b;
      }
    }
    g.putImageData(img, 0, 0);
    return { px, py, hole, N, cs };
  }

  // Bodenkachel 512×512 (nahtlos), je Land eigene Struktur: Friedhof Wiese mit Erdflecken und Trittplatten,
  // Aschenwald rissige Erde mit glühenden Spalten, Eissee Eisschollen mit hellen Rissen und Schneewehen, Burgruine
  // Kopfsteinpflaster mit Lücken und Moos, Herz der Nacht Kristallplatten mit leuchtenden Adern.
  const GROUND_DEF = { base: '#1d2a2b', speckle: ['#3c5a46', '#0a1419'], grass: '#5a8c5a' };
  function hexA(hex, a) {
    if (hex[0] !== '#') return hex;
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function mix(h1, h2, k) {
    const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    const c = s => Math.round((a >> s & 255) * (1 - k) + (b >> s & 255) * k);
    return '#' + ((1 << 24) + (c(16) << 16) + (c(8) << 8) + c(0)).toString(16).slice(1);
  }
  function groundTile(p, id) {
    p = Object.assign({}, GROUND_DEF, p || {});
    const [A, Bd, glintC] = p.speckle || GROUND_DEF.speckle;
    const base = p.base, grass = p.grass;
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d', { willReadFrequently: true });
    let seed = 1234;
    for (const ch of String(id || '')) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rndBase = mulberry(seed);
    let rnd = rndBase;
    // an allen 9 Kachel-Lagen zeichnen, damit nichts an der Naht abreißt; jede Kopie bekommt denselben Zufall
    const wrap = (x, y, r, fn) => {
      const sd = (rndBase() * 4294967296) >>> 0;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        const X = x + ox, Y = y + oy;
        if (X + r < 0 || Y + r < 0 || X - r > S || Y - r > S) continue;
        rnd = mulberry(sd);
        g.save(); g.translate(X, Y); fn(); g.restore();
      }
      rnd = rndBase;
    };
    const blob = (r, col, a) => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, hexA(col, a)); gr.addColorStop(0.55, hexA(col, a * 0.6)); gr.addColorStop(1, hexA(col, 0)); g.fillStyle = gr; circ(g, 0, 0, r); g.fill(); };
    const blobPath = (r, n, j) => { g.beginPath(); const ph = rnd() * TAU, ph2 = rnd() * TAU; for (let i = 0; i <= n; i++) { const a = i / n * TAU, rr = r * (1 + j * (0.6 * Math.sin(a * 2 + ph) + 0.4 * Math.sin(a * 3 + ph2)) * 0.5); i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); };
    const isGrave = !id || id === 'graveyard';

    g.fillStyle = base; g.fillRect(0, 0, S, S);
    // 1. große, weiche Helligkeitsinseln
    const lights = [];
    for (let i = 0; i < 16; i++) {
      const x = rnd() * S, y = rnd() * S, r = 90 + rnd() * 120, light = i % 2 === 0;
      if (light) lights.push([x, y, r]);
      wrap(x, y, r, () => blob(r, light ? A : Bd, light ? 0.2 : 0.16));
    }
    // 2. Erdflecken mit unregelmäßigem, dunklerem Rand
    const dirt = id === 'frostlake' ? '#22385a' : id === 'nightheart' ? '#241a44' : id === 'ashwood' ? '#2a1c18' : mix(Bd, '#4a3424', 0.5);
    for (let i = 0; i < (isGrave ? 7 : 5); i++) {
      const x = rnd() * S, y = rnd() * S, r = 22 + rnd() * 30;
      wrap(x, y, r * 1.4, () => {
        const gr = g.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r * 1.2);
        gr.addColorStop(0, hexA(mix(dirt, '#a08060', 0.3), isGrave ? 0.5 : 0.2)); gr.addColorStop(0.75, hexA(dirt, isGrave ? 0.45 : 0.2)); gr.addColorStop(1, hexA(dirt, isGrave ? 0.2 : 0.08));
        g.fillStyle = gr; blobPath(r * 1.15, 32, 0.45); g.fill();
      });
    }
    // Wiese: Grasflecken in hellerem und dunklerem Grün
    if (isGrave) for (let i = 0; i < 22; i++) {
      const x = rnd() * S, y = rnd() * S, r = 18 + rnd() * 34, lt = i % 2;
      wrap(x, y, r * 1.4, () => { g.fillStyle = hexA(lt ? mix(grass, A, 0.5) : mix(Bd, base, 0.4), lt ? 0.16 : 0.22); blobPath(r, 30, 0.6); g.fill(); });
    }
    // 3. Muster je Land
    if (VORO[id]) voronoi(g, S, VORO[id], rndBase);
    // 4. feine Körnung (Wiese: dichtes, kurzes Gras als Textur)
    if (isGrave) {
      for (let i = 0; i < 5200; i++) {
        const x = rnd() * S, y = rnd() * S, k = rnd(), h = 2.5 + rnd() * 3.5, l = (rnd() - 0.5) * 2.4;
        g.strokeStyle = k < 0.45 ? hexA(mix(grass, Bd, 0.55), 0.38) : k < 0.85 ? hexA(mix(grass, base, 0.35), 0.32) : hexA(mix(grass, '#ffffff', 0.25), 0.3);
        g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y - h); g.stroke();
      }
    } else {
      for (let i = 0; i < 1800; i++) {
        const x = rnd() * S, y = rnd() * S, k = rnd(), s = 1 + rnd() * 1.8;
        g.fillStyle = k < 0.5 ? hexA(A, 0.16) : hexA(Bd, 0.22);
        g.fillRect(x, y, s, s);
      }
    }
    // 5. große Bodenbilder je Land
    const stone = mix(base, '#c8c4b4', 0.38), stoneD = mix(base, '#0a0810', 0.5), stoneL = mix(base, '#ffffff', 0.45);
    const slab = (w, h, rot) => {
      g.rotate(rot);
      g.fillStyle = hexA(stoneD, 0.55); roundRect(g, -w / 2 + 1.5, -h / 2 + 2, w, h, 4); g.fill();
      g.fillStyle = hexA(stone, 0.62); roundRect(g, -w / 2, -h / 2, w, h, 4); g.fill();
      g.strokeStyle = hexA(stoneL, 0.4); g.lineWidth = 1.4; g.beginPath(); g.moveTo(-w / 2 + 2, h / 2 - 2); g.lineTo(-w / 2 + 2, -h / 2 + 2); g.lineTo(w / 2 - 2, -h / 2 + 2); g.stroke();
      if (rnd() < 0.6) { const cx = (rnd() - 0.5) * w * 0.5; g.strokeStyle = hexA(stoneD, 0.6); g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx, -h / 2); g.lineTo(cx + (rnd() - 0.5) * w * 0.3, (rnd() - 0.5) * h * 0.4); g.lineTo(cx + (rnd() - 0.5) * w * 0.4, h / 2); g.stroke(); }
    };
    if (id === 'frostlake') {
      // Schneewehen: weiche, helle Flächen mit klarer Oberkante
      for (let i = 0; i < 5; i++) {
        const x = rnd() * S, y = rnd() * S, r = 16 + rnd() * 20;
        wrap(x, y, r * 1.5, () => {
          g.scale(1.6, 0.8);
          g.fillStyle = 'rgba(16,40,70,0.25)'; g.translate(1.5, 2.5); blobPath(r, 30, 0.5); g.fill(); g.translate(-1.5, -2.5);
          const gr = g.createLinearGradient(-r, -r, r, r); gr.addColorStop(0, 'rgba(244,252,255,0.62)'); gr.addColorStop(1, 'rgba(170,206,236,0.45)');
          g.fillStyle = gr; blobPath(r, 30, 0.5); g.fill();
        });
      }
      // eingefrorene Blasen
      for (let i = 0; i < 26; i++) { const x = rnd() * S, y = rnd() * S, r = 1.5 + rnd() * 3; wrap(x, y, r + 2, () => { g.strokeStyle = 'rgba(230,248,255,0.5)'; g.lineWidth = 1; circ(g, 0, 0, r); g.stroke(); g.fillStyle = 'rgba(255,255,255,0.6)'; circ(g, -r * 0.35, -r * 0.35, r * 0.3); g.fill(); }); }
    } else if (id === 'ashwood') {
      for (let i = 0; i < 7; i++) { const x = rnd() * S, y = rnd() * S, r = 26 + rnd() * 30; wrap(x, y, r * 1.2, () => blob(r * 1.2, '#9a908a', 0.2)); }
      for (let i = 0; i < 14; i++) {
        const x = rnd() * S, y = rnd() * S, l = 12 + rnd() * 16, a = rnd() * TAU;
        wrap(x, y, l, () => { g.rotate(a); g.strokeStyle = 'rgba(14,8,6,0.75)'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(-l / 2, 0); g.lineTo(l / 2, 0); g.moveTo(0, 0); g.lineTo(l * 0.25, -l * 0.25); g.stroke(); g.strokeStyle = 'rgba(255,120,40,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(l * 0.1, 0.5); g.lineTo(l * 0.4, 0.5); g.stroke(); });
      }
    } else if (id === 'nightheart') {
      for (let i = 0; i < 14; i++) {
        const x = rnd() * S, y = rnd() * S, n = 2 + Math.floor(rnd() * 3);
        wrap(x, y, 20, () => {
          for (let k = 0; k < n; k++) {
            const h = 9 + rnd() * 9, w = h * 0.4, ox = (k - n / 2) * 5.5, rot = (k - n / 2) * 0.35;
            g.save(); g.translate(ox, 0); g.rotate(rot);
            g.fillStyle = 'rgba(12,6,30,0.6)'; g.beginPath(); g.moveTo(1.5, 1.5); g.lineTo(w + 1.5, -h * 0.4 + 1.5); g.lineTo(1.5, -h + 1.5); g.lineTo(-w + 1.5, -h * 0.4 + 1.5); g.closePath(); g.fill();
            g.fillStyle = 'rgba(160,130,255,0.8)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, -h * 0.4); g.lineTo(0, -h); g.lineTo(-w, -h * 0.4); g.closePath(); g.fill();
            g.fillStyle = 'rgba(232,220,255,0.85)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(-w, -h * 0.4); g.lineTo(0, -h); g.closePath(); g.fill();
            g.restore();
          }
        });
      }
    } else if (id === 'ruins') {
      // umgestürzte Säulentrommeln
      for (let i = 0; i < 2; i++) {
        const x = rnd() * S, y = rnd() * S, rot = rnd() * TAU;
        wrap(x, y, 30, () => { g.rotate(rot); g.fillStyle = 'rgba(20,16,10,0.4)'; roundRect(g, -20, -9, 42, 21, 5); g.fill(); g.fillStyle = hexA(mix(base, '#e0d8c0', 0.5), 0.9); roundRect(g, -21, -10, 40, 19, 5); g.fill(); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(-19, -9, 36, 3); inkLine(g, 1, 0.35); for (const xx of [-10, 0, 10]) { g.beginPath(); g.moveTo(xx, -9); g.lineTo(xx, 8); g.stroke(); } g.fillStyle = hexA(mix(base, '#c8c0a8', 0.4), 1); ell(g, 19, -0.5, 4.5, 9.5); g.fill(); });
      }
    } else {
      // Friedhof: verwitterte Grabplatten im Gras und Laub, Trittsteine
      for (let i = 0; i < 4; i++) {
        const x = rnd() * S, y = rnd() * S, rot = (rnd() - 0.5) * 0.6;
        wrap(x, y, 40, () => { slab(48, 30, rot); g.fillStyle = hexA(grass, 0.35); g.rotate(-rot); for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse((rnd() - 0.5) * 40, (rnd() - 0.2) * 24, 6 + rnd() * 6, 3 + rnd() * 2, 0, 0, TAU); g.fill(); } });
      }
      for (let i = 0; i < 3; i++) {
        let x = rnd() * S, y = rnd() * S; const a = rnd() * TAU;
        for (let k = 0; k < 4; k++) { x += Math.cos(a) * 24 + (rnd() - 0.5) * 8; y += Math.sin(a) * 24 + (rnd() - 0.5) * 8; const r = 7 + rnd() * 4; wrap(x, y, r + 3, () => { g.fillStyle = hexA(stoneD, 0.55); ell(g, 1.2, 1.6, r, r * 0.7); g.fill(); g.fillStyle = hexA(stone, 0.75); ell(g, 0, 0, r, r * 0.7); g.fill(); g.fillStyle = hexA(stoneL, 0.35); ell(g, -r * 0.3, -r * 0.25, r * 0.5, r * 0.3); g.fill(); }); }
      }
      for (let i = 0; i < 8; i++) {
        const x = rnd() * S, y = rnd() * S;
        wrap(x, y, 16, () => { for (let k = 0; k < 5; k++) { g.save(); g.translate((rnd() - 0.5) * 20, (rnd() - 0.5) * 14); g.rotate(rnd() * TAU); g.fillStyle = ['rgba(170,104,48,0.65)', 'rgba(130,74,40,0.6)', 'rgba(190,140,60,0.6)'][k % 3]; ell(g, 0, 0, 3.8, 1.9); g.fill(); g.restore(); } });
      }
    }
    // 6. Kiesel: Schatten unten rechts, Körper, Licht oben links
    for (let i = 0; i < 34; i++) {
      const x = rnd() * S, y = rnd() * S, r = 1.6 + rnd() * 2.6;
      wrap(x, y, r + 2, () => {
        g.fillStyle = hexA(Bd, 0.65); ell(g, 0.8, 0.9, r, r * 0.72); g.fill();
        g.fillStyle = hexA(mix(A, base, 0.3), 0.85); ell(g, 0, 0, r, r * 0.72); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.22)'; ell(g, -r * 0.3, -r * 0.3, r * 0.45, r * 0.3); g.fill();
      });
    }
    // 7. Grasbüschel, gehäuft in den hellen Inseln (Eis: Raureif-Halme, Asche: verkohlte Halme)
    const bladeD = hexA(mix(grass, Bd, 0.6), 0.6), bladeM = hexA(grass, 0.62), bladeL = hexA(mix(grass, '#ffffff', 0.35), 0.58);
    const tufts = id === 'ruins' ? 30 : id === 'frostlake' ? 10 : isGrave ? 60 : 38;
    for (let i = 0; i < tufts; i++) {
      const L = lights[i % lights.length], a = rnd() * TAU, d = Math.sqrt(rnd()) * L[2] * 0.7;
      const x = L[0] + Math.cos(a) * d, y = L[1] + Math.sin(a) * d, n = 3 + Math.floor(rnd() * 3), h = 9 + rnd() * 6;
      wrap(x, y, h + 4, () => {
        for (let k = 0; k < n; k++) {
          const bx = (k - (n - 1) / 2) * 3, lean = (k - (n - 1) / 2) * 2.2 + (rnd() - 0.5) * 2, hh = h * (0.65 + rnd() * 0.45);
          const blade = (ox, oy, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(bx - 1.9 + ox, oy); g.quadraticCurveTo(bx + lean * 0.3 - 0.6 + ox, -hh * 0.55 + oy, bx + lean + ox, -hh + oy); g.quadraticCurveTo(bx + lean * 0.3 + 1 + ox, -hh * 0.45 + oy, bx + 1.9 + ox, oy); g.closePath(); g.fill(); };
          blade(0.9, 0.6, bladeD); blade(0, 0, rnd() < 0.3 ? bladeL : bladeM);
        }
        if (isGrave && rnd() < 0.35) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,240,200,0.85)' : 'rgba(200,170,255,0.85)'; circ(g, (rnd() - 0.5) * 6, -h * 0.75, 1.5); g.fill(); }
      });
    }
    // 8. Funkeln (Glut, Kristallstaub, Eisglitzern)
    const gl = glintC || (id === 'frostlake' ? '#ffffff' : null);
    if (gl) {
      for (let i = 0; i < 46; i++) {
        const x = rnd() * S, y = rnd() * S, r = 0.8 + rnd() * 1.2;
        wrap(x, y, 6, () => { blob(r * 4, gl, 0.25); g.fillStyle = hexA(gl, 0.9); circ(g, 0, 0, r); g.fill(); });
      }
    }
    return c;
  }

  const DECOS = ['grave', 'rock', 'mush', 'bones', 'flower', 'stump', 'cross'];
  // Deko: gezeichnet mit Bodenpunkt y = +10, um 1,25 vergrößert (Kasten 60); tint: Farbtönung je Land (verkohlt, bereift …) oder leer.
  // Die Tönung trifft nur die Farben; Umriss und Schatten bleiben dunkel.
  const DECO_DRAW = {
    grave(g) {
      const S = R_.stone;
      g.fillStyle = '#2a2018'; ell(g, 0, 10, 13, 3.6); g.fill();
      g.save(); g.rotate(-0.07);
      g.fillStyle = lin(g, -11, -22, 11, 10, S);
      g.beginPath(); g.moveTo(-10.5, 10); g.lineTo(-10.5, -9); g.arc(0, -9, 10.5, Math.PI, 0); g.lineTo(10.5, 10); g.closePath(); g.fill();
      g.fillStyle = 'rgba(18,10,24,0.32)'; g.beginPath(); g.moveTo(6, 10); g.lineTo(6, -8); g.arc(0, -9, 6.5, -0.2, 0, false); g.lineTo(10.5, -9); g.lineTo(10.5, 10); g.closePath(); g.fill();
      // eingemeißeltes Kreuz: dunkle Rille, helle Unterkante
      g.fillStyle = 'rgba(18,10,24,0.55)'; g.fillRect(-1.6, -14, 3.2, 14); g.fillRect(-5.6, -10, 11.2, 3.2);
      g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(-1.6, 0, 3.2, 1); g.fillRect(1.6, -10, 4, 0.9);
      // abgeplatzte Ecke, Moos
      g.fillStyle = 'rgba(18,10,24,0.4)'; g.beginPath(); g.moveTo(7, -15); g.lineTo(10.6, -12); g.lineTo(9, -10); g.closePath(); g.fill();
      g.fillStyle = 'rgba(92,140,72,0.85)'; ell(g, -7.5, 8, 4.5, 2.6); g.fill(); ell(g, -3.5, 9.4, 3.2, 1.8); g.fill(); ell(g, -9.6, -10, 1.8, 3.4, 0.4); g.fill();
      g.restore();
    },
    cross(g) {
      const W = R_.wood;
      g.fillStyle = '#2a2018'; ell(g, 0, 10, 11, 3.4); g.fill();
      g.fillStyle = lin(g, -3, -20, 3, 10, W); g.fillRect(-2.9, -19, 5.8, 29);
      g.fillStyle = lin(g, -11, -13, 11, -7, W); g.fillRect(-10.5, -13, 21, 5.4);
      g.fillStyle = 'rgba(18,10,24,0.35)'; g.fillRect(1.2, -7.6, 1.7, 17.6);
      g.fillStyle = '#c8ccd8'; circ(g, 0, -10.3, 1); g.fill();
      g.strokeStyle = 'rgba(120,150,90,0.8)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-3, 4); g.quadraticCurveTo(-6, 7, -4, 10); g.stroke();
    },
    rock(g) {
      const S = R_.stone;
      g.fillStyle = sph(g, -2, -4, 18, S, 0.45);
      poly(g, [[-14, 10], [-12.5, -3], [-5, -11], [5, -10], [12.5, -4], [14.5, 10]]); g.fill();
      g.fillStyle = 'rgba(230,236,255,0.24)'; poly(g, [[-12.5, -3], [-5, -11], [1, -7], [-6, -1]]); g.fill();
      g.fillStyle = 'rgba(18,10,24,0.28)'; poly(g, [[5, -10], [12.5, -4], [14.5, 10], [5, 10], [6, -1]]); g.fill();
      g.fillStyle = 'rgba(92,140,72,0.75)'; ell(g, -6, -9, 4.5, 2.2, -0.5); g.fill(); ell(g, -11, 8, 3.5, 2); g.fill();
    },
    mush(g) {
      for (const [x, s, ramp] of [[-6, 1, R_.red], [6, 0.7, R_.orange]]) {
        g.fillStyle = lin(g, x - 2 * s, -2 * s, x + 2 * s, 10, R_.bone); g.fillRect(x - 2.2 * s, -2 * s, 4.4 * s, 12 * s);
        g.fillStyle = sph(g, x, -4 * s, 9 * s, ramp); g.beginPath(); g.arc(x, -2 * s, 8.5 * s, Math.PI, 0); g.quadraticCurveTo(x, 0, x - 8.5 * s, -2 * s); g.fill();
        g.fillStyle = '#fff6e6'; circ(g, x - 3.5 * s, -6 * s, 1.7 * s); g.fill(); circ(g, x + 3 * s, -5 * s, 1.3 * s); g.fill(); circ(g, x - 0.5 * s, -9 * s, 1.1 * s); g.fill();
      }
    },
    bones(g) {
      const B = R_.bone;
      const bone = (x0, y0, x1, y1) => {
        g.strokeStyle = B[1]; g.lineWidth = 3.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        g.fillStyle = B[2]; for (const [x, y] of [[x0, y0], [x1, y1]]) { circ(g, x - 1, y - 1, 2); g.fill(); circ(g, x + 1, y + 1, 2); g.fill(); }
      };
      bone(-11, 7, 9, -1); bone(-9, -3, 11, 7);
      g.fillStyle = sph(g, -2, -7, 6.5, B); circ(g, -2, -6, 5.6); g.fill(); g.fillRect(-5.5, -3, 7, 4);
      g.fillStyle = STYLE.ink; circ(g, -4.2, -6, 1.5); g.fill(); circ(g, 0.4, -6, 1.5); g.fill();
    },
    flower(g) {
      for (const [x, y, c] of [[-6, 2, '#b48cff'], [5, -3, '#7cf0ff'], [0, 6, '#ff9ad5']]) {
        g.strokeStyle = R_.leaf[1]; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 8); g.stroke();
        g.fillStyle = R_.leaf[1]; ell(g, x + 2.2, y + 5.5, 2, 1, -0.5); g.fill();
        const ramp = rampOf(c);
        for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; g.fillStyle = sph(g, x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 2.6, ramp); circ(g, x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 2.1); g.fill(); }
        g.fillStyle = '#ffe14f'; circ(g, x, y, 1.6); g.fill();
      }
    },
    stump(g) {
      const W = R_.wood;
      g.fillStyle = lin(g, -11, -6, 11, 10, W);
      g.beginPath(); g.moveTo(-10.5, -6); g.lineTo(-11, 8); g.quadraticCurveTo(-13, 11, -9, 10.5); g.lineTo(9, 10.5); g.quadraticCurveTo(13, 11, 11, 8); g.lineTo(10.5, -6); g.closePath(); g.fill();
      inkLine(g, 1, 0.4); for (const x of [-5, 1, 6]) { g.beginPath(); g.moveTo(x, -3); g.lineTo(x + 0.5, 9); g.stroke(); }
      g.fillStyle = sph(g, -2, -8, 11, ['#8a5a32', '#c89058', '#f0c890']); ell(g, 0, -6, 10.5, 4.2); g.fill();
      g.strokeStyle = 'rgba(110,64,30,0.7)'; g.lineWidth = 0.9; ell(g, 0.5, -6, 6, 2.3); g.stroke(); ell(g, 0.5, -6, 2.6, 1); g.stroke();
    },
  };
  // Landeigene Note auf der Oberkante (Silhouette minus nach unten verschobene Silhouette): Schnee (Eissee), Glut
  // (Aschenwald), Moos (Burgruine), Kristallschimmer (Herz der Nacht)
  const DECO_CAP = {
    frostlake: { col: 'rgba(250,254,255,0.95)', d: 3.2, tintA: 0.3 },
    ashwood: { col: 'rgba(255,128,48,0.85)', d: 1.3, tintA: 0.55 },
    ruins: { col: 'rgba(110,150,70,0.8)', d: 2.2, tintA: 0.38 },
    nightheart: { col: 'rgba(190,170,255,0.8)', d: 1.4, tintA: 0.42 },
  };
  function topCap(c, col, d) {
    const m = blank(c), mg = m.getContext('2d');
    mg.drawImage(c, 0, 0);
    mg.globalCompositeOperation = 'source-in'; mg.fillStyle = col; mg.fillRect(0, 0, m.width, m.height);
    mg.globalCompositeOperation = 'destination-out'; mg.drawImage(c, 0, d * SC);
    const g = c.getContext('2d');
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop'; g.drawImage(m, 0, 0); g.restore();
  }
  function deco(kind, tint, land) {
    const cap = DECO_CAP[land];
    const key = 'd' + kind + (tint || '') + (cap ? land : '');
    let c = cache.get(key);
    if (c) return c;
    const size = 60, k = 1.25;
    const cv = canvas(size, size), g = cv.g;
    g.translate(size / 2, size / 2 + 7.5); g.scale(k, k);
    (DECO_DRAW[kind] || DECO_DRAW.rock)(g);
    c = cv.c; c.size = size;
    if (tint) { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = cap ? cap.tintA : 0.38; g.fillStyle = tint; g.fillRect(0, 0, c.width, c.height); g.restore(); }
    if (cap && kind !== 'flower' && !(land === 'ruins' && kind === 'mush')) topCap(c, cap.col, cap.d);
    finish(c, { w: 2.2 });
    contactShadow(g, 2, 10.5, 16, 5);
    cache.set(key, c);
    return c;
  }

  // Kohlebecken: eiserne Schale auf drei Beinen mit glühender Kohle (Flammen zeichnet render.js darüber)
  function brazier() {
    const key = 'brazier';
    let c = cache.get(key);
    if (c) return c;
    const size = 46;
    const cv = canvas(size, size), g = cv.g;
    g.translate(size / 2, size / 2 + 6);
    const I = R_.iron;
    g.strokeStyle = I[1]; g.lineWidth = 2.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-6, 2); g.lineTo(-10, 12.5); g.moveTo(6, 2); g.lineTo(10, 12.5); g.moveTo(0, 3); g.lineTo(0, 13); g.stroke();
    g.fillStyle = lin(g, -14, -6, 14, 6, I);
    g.beginPath(); g.moveTo(-14, -4); g.lineTo(14, -4); g.quadraticCurveTo(12, 5, 0, 5.5); g.quadraticCurveTo(-12, 5, -14, -4); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(-12, -3, 7, 1.4);
    // glühende Kohle
    g.save(); g.shadowColor = '#ff7a2a'; g.shadowBlur = 6 * SC;
    g.fillStyle = sph(g, -2, -6, 12, R_.ember, 0.35); ell(g, 0, -4.4, 12.5, 3.4); g.fill(); g.restore();
    g.fillStyle = '#3a1608'; for (const [x, y] of [[-6, -4.4], [3, -5.2], [8, -4]]) { circ(g, x, y, 1.5); g.fill(); }
    g.fillStyle = '#fff2b0'; for (const [x, y] of [[-2, -5.6], [5.5, -4.6]]) { circ(g, x, y, 0.9); g.fill(); }
    c = cv.c; c.size = size;
    finish(c, { w: 2.2 });
    contactShadow(g, 2, 12.5, 15, 3.8);
    cache.set(key, c);
    return c;
  }

  // Höhere Auflösung für Standbilder (z. B. Titelbilder); leert den Zwischenspeicher
  function setScale(s) { SC = s; cache.clear(); hiCache.clear(); }

  // Hochauflösende Fassung eines Sprites (z. B. für das Titelbild): fn läuft mit Faktor k über der normalen
  // Auflösung und eigenem Zwischenspeicher, das Ergebnis wird unter key gemerkt. .size bleibt in Weltpixeln.
  const hiCache = new Map();
  function hires(key, k, fn) {
    let c = hiCache.get(key + '@' + k);
    if (c) return c;
    const oc = cache, os = SC;
    cache = new Map(); SC = os * k;
    try { c = fn(); } finally { cache = oc; SC = os; }
    hiCache.set(key + '@' + k, c);
    return c;
  }

  // Start: Grafiken bereitstellen (der Start wartet darauf, höchstens 2,5 s). Derzeit ist alles prozedural
  // und wird bei Bedarf gezeichnet – hier hängt sich später ein Bild-Atlas an.
  function load() { return Promise.resolve(); }

  return { load, setScale, hires, tintVariant, enemy, bossSprite, bossLevel, enemySize, ENEMY_VIS, baseR, player, playerURL, heroOf, HERO_BOX, ICON_IDS: Object.keys(ICONS), gem, gemTier, GEM_COLORS, item, iconURL, drawIcon, groundTile, deco, DECOS, brazier, shade, STYLE };
})();
