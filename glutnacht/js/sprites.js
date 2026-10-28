'use strict';
// Prozedural gezeichnete Sprites und Icons (keine Bilddateien).

const Sprites = (() => {
  // Auflösungsfaktor: passend zur Pixeldichte, damit beim Zeichnen kaum skaliert werden muss
  const SC = Math.min(2, Math.max(1, (window.devicePixelRatio || 1) * 1.2));
  const cache = new Map();

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * SC); c.height = Math.ceil(h * SC);
    const g = c.getContext('2d');
    g.scale(SC, SC);
    return { c, g };
  }

  function eyes(g, x, y, gap, r, col, pupil) {
    for (const s of [-1, 1]) {
      g.fillStyle = col || '#fff';
      g.beginPath(); g.ellipse(x + s * gap, y, r, r * 1.15, 0, 0, TAU); g.fill();
      if (pupil !== false) {
        g.fillStyle = pupil || '#111';
        g.beginPath(); g.arc(x + s * gap + r * 0.2, y + r * 0.15, r * 0.55, 0, TAU); g.fill();
      }
    }
  }

  function glowEyes(g, x, y, gap, r, col) {
    g.save();
    g.shadowColor = col; g.shadowBlur = r * 3;
    g.fillStyle = col;
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(x + s * gap, y, r * 1.2, r * 0.8, 0, 0, TAU); g.fill(); }
    g.restore();
  }

  function radial(g, x, y, r, c0, c1) {
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    gr.addColorStop(0, c0); gr.addColorStop(1, c1);
    return gr;
  }

  // Gegner: gezeichnet um (0,0) mit Basisradius R
  const ENEMY_DRAW = {
    bat(g, R, f) {
      const flap = f ? -0.5 : 0.35;
      g.fillStyle = '#4b2a8c';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * R * 0.4, 0);
        g.quadraticCurveTo(s * R * 1.2, -R * (0.9 + flap), s * R * 1.6, -R * (0.2 + flap));
        g.lineTo(s * R * 1.25, R * 0.1); g.lineTo(s * R * 1.0, -R * 0.05); g.lineTo(s * R * 0.75, R * 0.25);
        g.closePath(); g.fill();
      }
      g.fillStyle = radial(g, 0, 0, R * 0.7, '#a07cff', '#5a34b0');
      g.beginPath(); g.arc(0, 0, R * 0.62, 0, TAU); g.fill();
      g.fillStyle = '#5a34b0';
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * R * 0.2, -R * 0.5); g.lineTo(s * R * 0.45, -R * 0.95); g.lineTo(s * R * 0.5, -R * 0.35); g.fill(); }
      glowEyes(g, 0, -R * 0.08, R * 0.24, R * 0.13, '#ff4060');
      g.fillStyle = '#fff';
      g.beginPath(); g.moveTo(-R * 0.12, R * 0.22); g.lineTo(-R * 0.06, R * 0.36); g.lineTo(0, R * 0.22); g.fill();
      g.beginPath(); g.moveTo(R * 0.12, R * 0.22); g.lineTo(R * 0.06, R * 0.36); g.lineTo(0, R * 0.22); g.fill();
    },
    slime(g, R, f) {
      const sq = f ? 0.9 : 1.04;
      g.save(); g.scale(1 / sq, sq);
      g.fillStyle = radial(g, 0, 0, R * 1.1, '#9dffbe', '#1f9d52');
      g.beginPath();
      g.moveTo(-R, R * 0.6);
      g.bezierCurveTo(-R * 1.15, -R * 0.6, -R * 0.4, -R * 1.05, 0, -R * 1.0);
      g.bezierCurveTo(R * 0.4, -R * 1.05, R * 1.15, -R * 0.6, R, R * 0.6);
      g.quadraticCurveTo(0, R * 0.85, -R, R * 0.6);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.beginPath(); g.ellipse(-R * 0.4, -R * 0.55, R * 0.22, R * 0.12, -0.6, 0, TAU); g.fill();
      eyes(g, 0, -R * 0.15, R * 0.3, R * 0.17, '#fff', '#0d3a1f');
      g.restore();
    },
    skel(g, R, f) {
      const lean = f ? 1 : -1;
      g.strokeStyle = '#d9d2bb'; g.lineWidth = R * 0.14; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, R * 0.1); g.lineTo(0, R * 0.8); g.stroke();
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-R * 0.35, R * (0.25 + i * 0.18)); g.lineTo(R * 0.35, R * (0.25 + i * 0.18)); g.stroke(); }
      g.beginPath(); g.moveTo(0, R * 0.8); g.lineTo(-R * 0.3, R * 1.05 + lean * R * 0.05); g.moveTo(0, R * 0.8); g.lineTo(R * 0.3, R * 1.05 - lean * R * 0.05); g.stroke();
      g.beginPath(); g.moveTo(-R * 0.35, R * 0.25); g.lineTo(-R * 0.75, R * (0.45 + lean * 0.15)); g.moveTo(R * 0.35, R * 0.25); g.lineTo(R * 0.75, R * (0.45 - lean * 0.15)); g.stroke();
      g.fillStyle = radial(g, 0, -R * 0.35, R * 0.75, '#ffffff', '#cfc6aa');
      g.beginPath(); g.arc(0, -R * 0.35, R * 0.62, 0, TAU); g.fill();
      g.fillRect(-R * 0.35, -R * 0.1, R * 0.7, R * 0.3);
      g.fillStyle = '#1a1420';
      g.beginPath(); g.ellipse(-R * 0.24, -R * 0.38, R * 0.17, R * 0.2, 0, 0, TAU); g.ellipse(R * 0.24, -R * 0.38, R * 0.17, R * 0.2, 0, 0, TAU); g.fill();
      g.fillStyle = '#ff5a3c';
      g.beginPath(); g.arc(-R * 0.22, -R * 0.36, R * 0.06, 0, TAU); g.arc(R * 0.22, -R * 0.36, R * 0.06, 0, TAU); g.fill();
      g.fillStyle = '#1a1420';
      for (let i = -1; i <= 1; i++) g.fillRect(i * R * 0.13 - R * 0.03, R * 0.02, R * 0.06, R * 0.14);
    },
    ghost(g, R, f) {
      g.globalAlpha = 0.88;
      g.fillStyle = radial(g, 0, -R * 0.2, R * 1.2, '#f2feff', '#6fcbe8');
      g.beginPath();
      g.moveTo(-R * 0.85, R * 0.7);
      g.lineTo(-R * 0.85, -R * 0.1);
      g.arc(0, -R * 0.1, R * 0.85, Math.PI, 0);
      g.lineTo(R * 0.85, R * 0.7);
      const n = 4, w = R * 1.7 / n;
      for (let i = 0; i < n; i++) {
        const x = R * 0.85 - i * w;
        g.quadraticCurveTo(x - w / 2, R * (f ? 1.05 : 0.75), x - w, R * (f ? 0.7 : 0.95));
      }
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = '#1b2440';
      g.beginPath(); g.ellipse(-R * 0.3, -R * 0.2, R * 0.15, R * 0.22, 0, 0, TAU); g.ellipse(R * 0.3, -R * 0.2, R * 0.15, R * 0.22, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(0, R * 0.2, R * 0.12, R * (f ? 0.16 : 0.1), 0, 0, TAU); g.fill();
    },
    ghoul(g, R, f) {
      const arm = f ? 0.15 : -0.1;
      g.fillStyle = '#5d4a33';
      for (const s of [-1, 1]) {
        g.beginPath(); g.ellipse(s * R * 0.85, R * (0.35 + arm * s), R * 0.25, R * 0.4, s * 0.4, 0, TAU); g.fill();
      }
      g.fillStyle = radial(g, 0, 0, R * 1.05, '#b5976c', '#5e4a30');
      g.beginPath(); g.ellipse(0, R * 0.1, R * 0.9, R * 0.85, 0, 0, TAU); g.fill();
      g.fillStyle = '#4a3a26';
      g.beginPath(); g.ellipse(0, -R * 0.55, R * 0.55, R * 0.3, 0, Math.PI, 0); g.fill();
      glowEyes(g, 0, -R * 0.2, R * 0.3, R * 0.14, '#9dff4f');
      g.fillStyle = '#2a1d10';
      g.beginPath(); g.ellipse(0, R * 0.3, R * 0.35, R * 0.15, 0, 0, TAU); g.fill();
      g.fillStyle = '#efe6c9';
      for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * R * 0.12 - R * 0.05, R * 0.2); g.lineTo(i * R * 0.12, R * 0.33); g.lineTo(i * R * 0.12 + R * 0.05, R * 0.2); g.fill(); }
    },
    spitter(g, R, f) {
      g.fillStyle = '#2f8a3a';
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * 0.6 + i * 0.45;
        g.beginPath(); g.ellipse(Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8 + R * 0.2, R * 0.45, R * 0.18, a, 0, TAU); g.fill();
      }
      g.fillStyle = radial(g, 0, 0, R, '#ffd27a', '#e0661c');
      g.beginPath(); g.arc(0, 0, R * 0.85, 0, TAU); g.fill();
      g.fillStyle = '#ff7a2f';
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.4;
        g.beginPath(); g.moveTo(Math.cos(a - 0.12) * R * 0.8, Math.sin(a - 0.12) * R * 0.8); g.lineTo(Math.cos(a) * R * 1.15, Math.sin(a) * R * 1.15); g.lineTo(Math.cos(a + 0.12) * R * 0.8, Math.sin(a + 0.12) * R * 0.8); g.fill();
      }
      g.fillStyle = '#3a0c0c';
      g.beginPath(); g.ellipse(0, R * 0.25, R * 0.4, R * (f ? 0.32 : 0.14), 0, 0, TAU); g.fill();
      eyes(g, 0, -R * 0.3, R * 0.28, R * 0.14, '#fff', '#300');
    },
    wraith(g, R, f) {
      const sway = f ? 0.15 : -0.15;
      g.fillStyle = radial(g, 0, 0, R * 1.3, '#ff9ab3', '#a3123c');
      g.beginPath();
      g.moveTo(0, -R * 1.05);
      g.bezierCurveTo(R * 0.95, -R * 0.6, R * 0.9, R * 0.4, R * (0.3 + sway), R * 1.1);
      g.lineTo(R * sway, R * 0.75);
      g.lineTo(-R * (0.3 - sway), R * 1.1);
      g.bezierCurveTo(-R * 0.9, R * 0.4, -R * 0.95, -R * 0.6, 0, -R * 1.05);
      g.fill();
      g.fillStyle = '#250612';
      g.beginPath(); g.ellipse(0, -R * 0.2, R * 0.5, R * 0.45, 0, 0, TAU); g.fill();
      glowEyes(g, 0, -R * 0.22, R * 0.2, R * 0.1, '#ffe14f');
    },
    brute(g, R, f) {
      const st = f ? 0.06 : -0.06;
      g.fillStyle = '#7a2420';
      for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * R * 0.4, R * (0.85 + st * s), R * 0.25, R * 0.18, 0, 0, TAU); g.fill(); }
      g.fillStyle = radial(g, 0, 0, R * 1.1, '#ff7a6a', '#8f2722');
      g.beginPath(); g.ellipse(0, 0, R * 0.95, R * 0.88, 0, 0, TAU); g.fill();
      g.fillStyle = '#f4ecd0';
      for (const s of [-1, 1]) {
        g.beginPath(); g.moveTo(s * R * 0.45, -R * 0.65); g.quadraticCurveTo(s * R * 0.9, -R * 1.0, s * R * 0.75, -R * 1.25); g.quadraticCurveTo(s * R * 0.65, -R * 0.95, s * R * 0.25, -R * 0.75); g.fill();
      }
      g.fillStyle = '#2a0808';
      g.save(); g.lineWidth = R * 0.1; g.strokeStyle = '#2a0808';
      g.beginPath(); g.moveTo(-R * 0.5, -R * 0.35); g.lineTo(-R * 0.12, -R * 0.2); g.moveTo(R * 0.5, -R * 0.35); g.lineTo(R * 0.12, -R * 0.2); g.stroke(); g.restore();
      glowEyes(g, 0, -R * 0.1, R * 0.27, R * 0.09, '#ffde4f');
      g.beginPath(); g.ellipse(0, R * 0.32, R * 0.42, R * 0.17, 0, 0, TAU); g.fill();
      g.fillStyle = '#f4ecd0';
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * R * 0.3, R * 0.3); g.lineTo(s * R * 0.24, R * 0.05); g.lineTo(s * R * 0.16, R * 0.3); g.fill(); }
    },
    golem(g, R, f) {
      const pts = [[-0.9, -0.3], [-0.6, -0.85], [0.05, -1.0], [0.7, -0.75], [0.95, -0.1], [0.8, 0.6], [0.2, 0.95], [-0.5, 0.9], [-0.95, 0.4]];
      g.fillStyle = '#4b5568';
      for (const s of [-1, 1]) { g.beginPath(); g.arc(s * R * 1.0, R * (0.2 + (f ? 0.08 : -0.08) * s), R * 0.32, 0, TAU); g.fill(); }
      g.fillStyle = radial(g, 0, 0, R * 1.1, '#aab6cc', '#4c566b');
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x * R, y * R) : g.moveTo(x * R, y * R)));
      g.closePath(); g.fill();
      g.save();
      g.strokeStyle = '#5ff2ff'; g.shadowColor = '#5ff2ff'; g.shadowBlur = R * 0.4; g.lineWidth = R * 0.06;
      g.beginPath(); g.moveTo(-R * 0.5, R * 0.1); g.lineTo(-R * 0.2, R * 0.3); g.lineTo(-R * 0.3, R * 0.6);
      g.moveTo(R * 0.3, R * 0.2); g.lineTo(R * 0.55, R * 0.45); g.moveTo(R * 0.1, -R * 0.75); g.lineTo(R * 0.25, -R * 0.55);
      g.stroke(); g.restore();
      glowEyes(g, 0, -R * 0.25, R * 0.3, R * 0.12, '#5ff2ff');
    },
    night(g, R, f) {
      g.save();
      g.fillStyle = '#1b0f3a';
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * TAU + (f ? 0.15 : 0);
        g.beginPath(); g.moveTo(Math.cos(a - 0.2) * R * 0.8, Math.sin(a - 0.2) * R * 0.8); g.lineTo(Math.cos(a) * R * 1.35, Math.sin(a) * R * 1.35); g.lineTo(Math.cos(a + 0.2) * R * 0.8, Math.sin(a + 0.2) * R * 0.8); g.fill();
      }
      g.fillStyle = radial(g, 0, 0, R, '#6b4cff', '#140a30');
      g.beginPath(); g.arc(0, 0, R * 0.95, 0, TAU); g.fill();
      const ey = [[0, -0.1, 0.28], [-0.5, -0.35, 0.14], [0.5, -0.35, 0.14], [-0.45, 0.35, 0.12], [0.45, 0.35, 0.12], [0, 0.55, 0.1]];
      for (const [x, y, s] of ey) {
        g.fillStyle = '#fff';
        g.beginPath(); g.ellipse(x * R, y * R, s * R, s * R * (f ? 0.5 : 0.9), 0, 0, TAU); g.fill();
        g.fillStyle = '#ff2050';
        g.beginPath(); g.arc(x * R, y * R, s * R * 0.45, 0, TAU); g.fill();
      }
      g.restore();
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

  // variant: 0 normal, 1 Blitz (weiß), 2 vereist (blau)
  function enemy(type, frame, variant) {
    const key = 'e' + type + frame + variant;
    let c = cache.get(key);
    if (c) return c;
    if (variant) {
      const base = enemy(type, frame, 0);
      c = variant === 1 ? tintVariant(base, '#ffffff', 0.6) : tintVariant(base, '#7fd8ff', 0.5);
      c.size = base.size;
    } else {
      const R = BASE_R[type] || ENEMIES[type].r;
      const size = R * 3.4;
      const cv = canvas(size, size);
      cv.g.translate(size / 2, size / 2);
      ENEMY_DRAW[type](cv.g, R, frame);
      c = cv.c;
      c.size = size;
    }
    cache.set(key, c);
    return c;
  }

  function baseR(type) { return BASE_R[type] || ENEMIES[type].r; }

  // Spieler: Kapuzengestalt in Charakterfarbe
  function player(color, frame, flash) {
    const key = 'p' + color + frame + (flash ? 1 : 0);
    let c = cache.get(key);
    if (c) return c;
    if (flash) {
      const base = player(color, frame, false);
      c = tintVariant(base, '#ffffff', 0.8);
      c.size = base.size;
      cache.set(key, c);
      return c;
    }
    const R = 13, size = 46;
    const cv = canvas(size, size), g = cv.g;
    g.translate(size / 2, size / 2 + 2);
    const step = frame === 1 ? 3 : frame === 2 ? -3 : 0;
    g.fillStyle = '#20172e';
    g.beginPath(); g.ellipse(-5 + step, R * 0.95, 4, 3, 0, 0, TAU); g.ellipse(5 - step, R * 0.95, 4, 3, 0, 0, TAU); g.fill();
    // Umhang
    const cg = g.createLinearGradient(0, -R, 0, R);
    cg.addColorStop(0, shade(color, 30)); cg.addColorStop(1, shade(color, -40));
    g.fillStyle = cg;
    g.beginPath();
    g.moveTo(-R * 0.9, R * 0.95);
    g.quadraticCurveTo(-R * 1.0, -R * 0.2, -R * 0.55, -R * 0.75);
    g.quadraticCurveTo(0, -R * 1.45, R * 0.55, -R * 0.75);
    g.quadraticCurveTo(R * 1.0, -R * 0.2, R * 0.9, R * 0.95);
    g.quadraticCurveTo(0, R * 1.15, -R * 0.9, R * 0.95);
    g.fill();
    // Gesicht
    g.fillStyle = '#120c1c';
    g.beginPath(); g.ellipse(R * 0.12, -R * 0.35, R * 0.48, R * 0.42, 0, 0, TAU); g.fill();
    g.save(); g.shadowColor = '#fff6c8'; g.shadowBlur = 6; g.fillStyle = '#fff6c8';
    g.beginPath(); g.ellipse(-R * 0.05, -R * 0.38, 2.2, 2.8, 0, 0, TAU); g.ellipse(R * 0.35, -R * 0.38, 2.2, 2.8, 0, 0, TAU); g.fill();
    g.restore();
    // Gürtel/Schärpe
    g.fillStyle = 'rgba(255,230,160,0.85)';
    g.fillRect(-R * 0.75, R * 0.25, R * 1.5, 2.5);
    c = cv.c;
    c.size = size;
    cache.set(key, c);
    return c;
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = clamp((n >> 16) + amt, 0, 255), g = clamp(((n >> 8) & 255) + amt, 0, 255), b = clamp((n & 255) + amt, 0, 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  const GEM_COLORS = ['#4fc3ff', '#5dff8f', '#ff5a6e', '#d36bff'];
  function gemTier(v) { return v < 3 ? 0 : v < 12 ? 1 : v < 60 ? 2 : 3; }
  function gem(tier) {
    const key = 'g' + tier;
    let c = cache.get(key);
    if (c) return c;
    const s = 6 + tier * 1.5, size = s * 5;
    const cv = canvas(size, size), g = cv.g;
    g.translate(size / 2, size / 2);
    const col = GEM_COLORS[tier];
    g.shadowColor = col; g.shadowBlur = s * 1.5;
    g.fillStyle = col;
    g.beginPath(); g.moveTo(0, -s * 1.3); g.lineTo(s * 0.8, 0); g.lineTo(0, s * 1.3); g.lineTo(-s * 0.8, 0); g.closePath(); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath(); g.moveTo(0, -s * 1.3); g.lineTo(s * 0.8, 0); g.lineTo(0, -s * 0.1); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.beginPath(); g.moveTo(0, s * 1.3); g.lineTo(-s * 0.8, 0); g.lineTo(0, s * 0.1); g.closePath(); g.fill();
    c = cv.c; c.size = size;
    cache.set(key, c);
    return c;
  }

  // Aufsammelbares und Requisiten; nutzt die Icon-Zeichnungen
  function item(kind) {
    const key = 'i' + kind;
    let c = cache.get(key);
    if (c) return c;
    const size = kind === 'chest' ? 44 : 30;
    const cv = canvas(size, size), g = cv.g;
    g.translate(size / 2, size / 2);
    g.scale(size / 64, size / 64);
    drawIcon(g, kind === 'bag' ? 'bag' : kind);
    c = cv.c; c.size = size;
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
    cv.g.translate(size / 2, size / 2);
    cv.g.scale(size / 64 * 0.92, size / 64 * 0.92);
    drawIcon(cv.g, id);
    u = cv.c.toDataURL();
    cache.set(key, u);
    return u;
  }

  function playerURL(color, size) {
    const key = 'pu' + color + size;
    let u = cache.get(key);
    if (u) return u;
    const src = player(color, 0, false);
    const c = document.createElement('canvas');
    c.width = c.height = size * 2;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0, c.width, c.height);
    u = c.toDataURL();
    cache.set(key, u);
    return u;
  }

  // ---------- Boden & Deko ----------
  function groundTile() {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#1d2a2b';
    g.fillRect(0, 0, S, S);
    const rnd = mulberry(1234);
    for (let i = 0; i < 900; i++) {
      const x = rnd() * S, y = rnd() * S;
      g.fillStyle = rnd() < 0.5 ? 'rgba(60,90,70,0.18)' : 'rgba(10,20,25,0.25)';
      g.fillRect(x, y, 2 + rnd() * 3, 2 + rnd() * 3);
    }
    for (let i = 0; i < 12; i++) {
      const x = rnd() * S, y = rnd() * S, r = 20 + rnd() * 40;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rnd() < 0.5 ? 'rgba(50,80,60,0.18)' : 'rgba(30,40,60,0.18)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.save(); g.translate(ox, oy); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.restore(); }
    }
    g.strokeStyle = 'rgba(90,140,90,0.35)'; g.lineWidth = 1.2;
    for (let i = 0; i < 70; i++) {
      const x = rnd() * S, y = rnd() * S;
      g.beginPath();
      for (let k = -1; k <= 1; k++) { g.moveTo(x + k * 2, y); g.lineTo(x + k * 3.5, y - 4 - rnd() * 3); }
      g.stroke();
    }
    return c;
  }

  const DECOS = ['grave', 'rock', 'mush', 'bones', 'flower', 'stump', 'cross'];
  function deco(kind) {
    const key = 'd' + kind;
    let c = cache.get(key);
    if (c) return c;
    const size = 48;
    const cv = canvas(size, size), g = cv.g;
    g.translate(size / 2, size / 2 + 6);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(0, 10, 14, 4, 0, 0, TAU); g.fill();
    if (kind === 'grave') {
      g.fillStyle = lg(g, -18, 10, '#7d8798', '#4a5262');
      g.beginPath(); g.moveTo(-10, 10); g.lineTo(-10, -8); g.arc(0, -8, 10, Math.PI, 0); g.lineTo(10, 10); g.closePath(); g.fill();
      g.fillStyle = 'rgba(20,20,30,0.5)'; g.fillRect(-1.5, -12, 3, 12); g.fillRect(-5, -8, 10, 3);
    } else if (kind === 'rock') {
      g.fillStyle = lg(g, -12, 10, '#6b7385', '#3c4252');
      g.beginPath(); g.moveTo(-14, 10); g.lineTo(-11, -4); g.lineTo(-2, -10); g.lineTo(9, -6); g.lineTo(14, 10); g.closePath(); g.fill();
    } else if (kind === 'mush') {
      for (const [x, s, c] of [[-6, 1, '#e8384f'], [6, 0.7, '#ff7a3c']]) {
        g.fillStyle = '#efe6c9'; g.fillRect(x - 2 * s, -2 * s, 4 * s, 12 * s);
        g.fillStyle = c; g.beginPath(); g.arc(x, -2 * s, 8 * s, Math.PI, 0); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(x - 3 * s, -5 * s, 1.5, 0, TAU); g.arc(x + 3 * s, -4 * s, 1.2, 0, TAU); g.fill();
      }
    } else if (kind === 'bones') {
      g.strokeStyle = '#d8d0b8'; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-10, 6); g.lineTo(8, -2); g.moveTo(-8, -4); g.lineTo(10, 6); g.stroke();
      g.fillStyle = '#e8e2cf'; g.beginPath(); g.arc(-2, -6, 5, 0, TAU); g.fill();
    } else if (kind === 'flower') {
      for (const [x, y, c] of [[-6, 2, '#b48cff'], [5, -3, '#7cf0ff'], [0, 6, '#ff9ad5']]) {
        g.strokeStyle = '#3f7a4a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 8); g.stroke();
        g.fillStyle = c; for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; g.beginPath(); g.arc(x + Math.cos(a) * 2.5, y + Math.sin(a) * 2.5, 2, 0, TAU); g.fill(); }
        g.fillStyle = '#ffe14f'; g.beginPath(); g.arc(x, y, 1.5, 0, TAU); g.fill();
      }
    } else if (kind === 'stump') {
      g.fillStyle = '#5a3a22'; g.fillRect(-10, -6, 20, 16);
      g.fillStyle = '#8a6040'; g.beginPath(); g.ellipse(0, -6, 10, 4, 0, 0, TAU); g.fill();
      g.strokeStyle = '#5a3a22'; g.lineWidth = 1; g.beginPath(); g.ellipse(0, -6, 5, 2, 0, 0, TAU); g.stroke();
    } else if (kind === 'cross') {
      g.fillStyle = '#6a4a30'; g.fillRect(-2.5, -16, 5, 26); g.fillRect(-9, -10, 18, 4);
    }
    c = cv.c; c.size = size;
    cache.set(key, c);
    return c;
  }

  function brazier() {
    const key = 'brazier';
    let c = cache.get(key);
    if (c) return c;
    const size = 40;
    const cv = canvas(size, size), g = cv.g;
    g.translate(size / 2, size / 2 + 6);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(0, 12, 14, 4, 0, 0, TAU); g.fill();
    g.fillStyle = '#3c3f4c'; g.fillRect(-3, 0, 6, 12); g.fillRect(-9, 10, 18, 3);
    g.fillStyle = lg(g, -6, 4, '#8a8fa3', '#4a4e5e');
    g.beginPath(); g.moveTo(-13, -4); g.lineTo(13, -4); g.lineTo(8, 4); g.lineTo(-8, 4); g.closePath(); g.fill();
    c = cv.c; c.size = size;
    cache.set(key, c);
    return c;
  }

  return { enemy, baseR, player, playerURL, gem, gemTier, GEM_COLORS, item, iconURL, drawIcon, groundTile, deco, DECOS, brazier, shade };
})();
