'use strict';
// Effekt-Grafiken: Kenney Particle Pack und Smoke Particles (CC0, Herkunft in assets/CREDITS-art.txt).
// Die Bilder stecken als data:-URI in window.ASSET_DATA.fx (assets/fx.js, erzeugt von tools/build-fx.js) –
// kein fetch, daher auch über file:// und im Einzeldatei-Build. Graustufen-Sprites sind weiß mit Alpha und
// werden hier eingefärbt und zwischengespeichert. Fehlt ein Bild, entsteht ein weicher Leuchtpunkt als Ersatz.

const FxArt = (() => {
  const img = {};
  const cache = new Map();

  function load() {
    const src = (typeof window !== 'undefined' && window.ASSET_DATA && window.ASSET_DATA.fx) || {};
    return Promise.all(Object.keys(src).map(k => new Promise(res => {
      const im = new Image();
      im.onload = () => { img[k] = im; cache.clear(); res(); };
      im.onerror = () => res();
      im.src = src[k];
    })));
  }

  function has(name) { return !!img[name]; }

  function softDot(size, color) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d'), h = size / 2;
    const gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, color); gr.addColorStop(0.35, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.8; g.fillStyle = gr; g.fillRect(0, 0, size, size);
    return c;
  }

  // Eingefärbte Fassung als Canvas mit Kantenlänge size (Farbe × Helligkeit des Originals)
  function tint(name, color, size) {
    const key = name + color + size;
    let c = cache.get(key);
    if (c) return c;
    const im = img[name];
    if (!im) c = softDot(size, color);
    else {
      c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(im, 0, 0, size, size);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, size, size);
    }
    cache.set(key, c);
    return c;
  }

  // Farbiges Original (Explosion, Blitzlicht) oder Ersatz
  function raw(name, fallback) {
    if (img[name]) return img[name];
    const key = 'raw' + name;
    let c = cache.get(key);
    if (!c) { c = softDot(64, fallback || '#ffcf80'); cache.set(key, c); }
    return c;
  }

  // Lichtfleck für die Lichtkarte: weicher, fast quadratischer Abfall, Farbe = Lichtfarbe
  function light(color) {
    const key = 'L' + color;
    let c = cache.get(key);
    if (c) return c;
    const S = 64, h = S / 2;
    c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const n = parseInt(color.slice(1), 16), rgb = (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255);
    const gr = g.createRadialGradient(h, h, 0, h, h, h);
    for (const [s, a] of [[0, 1], [0.2, 0.86], [0.4, 0.6], [0.6, 0.32], [0.8, 0.1], [1, 0]]) gr.addColorStop(s, 'rgba(' + rgb + ',' + a + ')');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    cache.set(key, c);
    return c;
  }

  return { load, has, tint, raw, light };
})();
