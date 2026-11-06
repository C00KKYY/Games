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
      im.onload = () => { img[k] = im; cache.clear(); tints.clear(); res(); };
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

  // Eingefärbte Fassung als Canvas mit Kantenlänge size (Farbe × Helligkeit des Originals).
  // Zwischenspeicher verschachtelt (Größe → Name → Farbe), damit ein Aufruf je Bild keine Schlüssel-Zeichenkette
  // erzeugt (hunderte Aufrufe je Bild).
  const tints = new Map();
  function tint(name, color, size) {
    let bySize = tints.get(size);
    if (!bySize) { bySize = new Map(); tints.set(size, bySize); }
    let byName = bySize.get(name);
    if (!byName) { byName = new Map(); bySize.set(name, byName); }
    let c = byName.get(color);
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
    byName.set(color, c);
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
  const lights = new Map();
  function light(color) {
    let c = lights.get(color);
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
    lights.set(color, c);
    return c;
  }

  // Feste Färbungen der Spielgrafik schon beim Laden bauen (nicht beim ersten Auftauchen im Spiel)
  const WARM = [['scorch', '#160603', 64], ['flame1', '#ffb35a', 64], ['flame1', '#ff9a3c', 64], ['flame2', '#ff7ce0', 64], ['flame1', '#ff9ad8', 64],
    ['ring', '#ffd34f', 128], ['ring', '#ff8a5c', 128], ['ring', '#ffa04a', 128], ['ring', '#8dffb4', 128], ['twirl1', '#ffa04a', 128], ['twirl2', '#ffa04a', 128],
    ['ringThick', '#7fd8ff', 128], ['ringThick', '#c8faff', 128], ['trace', '#a77cff', 64], ['trace', '#ff7cf5', 64], ['halo', '#3fc8ff', 64], ['halo', '#ffd34f', 64],
    ['slash', '#8fd0ff', 128], ['slash', '#ff3a5a', 128], ['slash', '#ffffff', 128], ['bolt1', '#5fc8ff', 128], ['bolt2', '#5fc8ff', 128], ['bolt1', '#e8fbff', 128],
    ['bolt2', '#e8fbff', 128], ['zapHit', '#d8f8ff', 64], ['boltH', '#fff9a8', 128], ['flare', '#ffe9a8', 64], ['star', '#fff1b8', 64]];
  function warm() {
    for (const [n, c, s] of WARM) tint(n, c, s);
    for (const c of ['#4fc3ff', '#5dff8f', '#ff5a6e', '#d36bff']) tint('trace', c, 64);
  }

  return { load, has, tint, raw, light, warm };
})();
