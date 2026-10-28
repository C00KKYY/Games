'use strict';
// Kleine Helfer, Speicherstand und räumliches Raster.

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

function weightedPick(entries) {
  // entries: [[wert, gewicht], ...]
  let sum = 0;
  for (const e of entries) sum += e[1];
  let r = Math.random() * sum;
  for (const e of entries) {
    r -= e[1];
    if (r <= 0) return e[0];
  }
  return entries[entries.length - 1][0];
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60), r = s % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
}

function fmtNum(n) {
  n = Math.floor(n);
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' Mio.';
  if (n >= 1e4) return (n / 1e3).toFixed(1).replace('.', ',') + 'k';
  return n.toLocaleString('de-DE');
}

// Deterministischer Hash für Chunk-Dekoration.
function hash2(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + (s || 0) * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Räumliches Hash-Raster für Kollisionen.
class Grid {
  constructor(cell) {
    this.cs = cell;
    this.cells = new Map();
    this.used = [];
  }
  clear() {
    for (const a of this.used) a.length = 0;
    this.used.length = 0;
    if (this.cells.size > 6000) this.cells.clear();
  }
  insert(e) {
    const k = (Math.floor(e.x / this.cs) + 32768) * 65536 + (Math.floor(e.y / this.cs) + 32768);
    let a = this.cells.get(k);
    if (!a) { a = []; this.cells.set(k, a); }
    if (a.length === 0) this.used.push(a);
    a.push(e);
  }
  query(x, y, r, out) {
    out.length = 0;
    const cs = this.cs;
    const x0 = Math.floor((x - r) / cs), x1 = Math.floor((x + r) / cs);
    const y0 = Math.floor((y - r) / cs), y1 = Math.floor((y + r) / cs);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const a = this.cells.get((cx + 32768) * 65536 + (cy + 32768));
        if (a) for (let i = 0; i < a.length; i++) out.push(a[i]);
      }
    }
    return out;
  }
}

const SAVE_KEY = 'glutnacht.v1';

function defaultSave() {
  return {
    gold: 0,
    saveVersion: 2,
    shop: {},
    shopSpent: 0,
    giftGiven: false,
    chars: ['aron', 'mira'],
    achievements: {},
    evolved: {},
    stats: {
      kills: 0, runs: 0, bestTime: 0, bestLevel: 0, bestKills: 0, wins: 0,
      evolutions: 0, bossKills: 0, chests: 0, goldEarned: 0, playTime: 0,
    },
    bosses: {},
    heatUnlocked: 0,
    heat: 0,
    lastChar: 'aron',
    settings: { sfx: true, music: true, dmgNums: true, shake: true },
  };
}

const Store = {
  data: null,
  load() {
    let d = null;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) d = JSON.parse(raw);
    } catch (e) { d = null; }
    const def = defaultSave();
    if (!d || typeof d !== 'object') d = def;
    const ver = d.saveVersion || 1;
    for (const k in def) if (d[k] === undefined) d[k] = def[k];
    if (!d.shop || typeof d.shop !== 'object') d.shop = {};
    if (ver < 2) {
      // Stände von vor der Buchführung: mindestens den günstigsten möglichen Kaufpreis erstattbar machen
      // (damals galten 8 % Preisanstieg, die Rechnung mit 5 % liegt sicher darunter)
      d.shopSpent = Math.max(Number.isFinite(d.shopSpent) ? d.shopSpent : 0, shopRefundValue(d.shop));
      d.giftGiven = d.stats.runs > 0;
      d.saveVersion = 2;
    }
    for (const k in def.stats) if (d.stats[k] === undefined) d.stats[k] = def.stats[k];
    for (const k in def.settings) if (d.settings[k] === undefined) d.settings[k] = def.settings[k];
    this.data = d;
    return d;
  },
  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* privat/gesperrt */ }
  },
  reset() {
    this.data = defaultSave();
    this.save();
  },
};
