'use strict';
// ---------------------------------------------------------------------------
// Grundlegende Helfer: Richtungen, Zufall, Heap, Formatierung, Rauschen
// ---------------------------------------------------------------------------

// Richtungen: 0 = Nord, 1 = Ost, 2 = Süd, 3 = West (Bildschirm: y wächst nach unten)
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const OPP = [2, 3, 0, 1];
const DIR_DE = ['Norden', 'Osten', 'Süden', 'Westen'];
const DIR_SHORT = ['N', 'O', 'S', 'W'];

// Abbiegearten relativ zur Fahrtrichtung
const TT_STRAIGHT = 0, TT_RIGHT = 1, TT_UTURN = 2, TT_LEFT = 3;
const TT_NAME = ['geradeaus', 'rechts', 'wenden', 'links'];

function turnOf(h, d) { return (d - h + 4) & 3; }
function popcount4(m) { return (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1); }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
function angNorm(a) { while (a > Math.PI) a -= Math.PI * 2; while (a <= -Math.PI) a += Math.PI * 2; return a; }
function degNorm(a) { a = a % 360; if (a > 180) a -= 360; if (a <= -180) a += 360; return a; }

// Deterministischer Zufallsgenerator (mulberry32)
class RNG {
  constructor(seed) { this.s = (seed >>> 0) || 1; }
  next() {
    let t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  weighted(items, wf) {
    let tot = 0;
    for (let i = 0; i < items.length; i++) tot += wf(items[i]);
    if (tot <= 0) return null;
    let r = this.next() * tot;
    for (let i = 0; i < items.length; i++) { r -= wf(items[i]); if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
}

// Binärer Min-Heap mit Float-Prioritäten und Int-Werten
class MinHeap {
  constructor(cap = 1024) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
  clear() { this.n = 0; }
  grow() {
    const k = new Float64Array(this.k.length * 2), v = new Int32Array(this.v.length * 2);
    k.set(this.k); v.set(this.v); this.k = k; this.v = v;
  }
  push(key, val) {
    if (this.n >= this.k.length) this.grow();
    let i = this.n++;
    const K = this.k, V = this.v;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (K[p] <= key) break;
      K[i] = K[p]; V[i] = V[p]; i = p;
    }
    K[i] = key; V[i] = val;
  }
  pop() { // gibt Wert zurück, Schlüssel in this.lastKey
    const K = this.k, V = this.v;
    const topV = V[0]; this.lastKey = K[0];
    const n = --this.n;
    if (n > 0) {
      const key = K[n], val = V[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && K[c + 1] < K[c]) c++;
        if (K[c] >= key) break;
        K[i] = K[c]; V[i] = V[c]; i = c;
      }
      K[i] = key; V[i] = val;
    }
    return topV;
  }
}

// Formatierung (deutsch)
function fmtInt(n) {
  const neg = n < 0; n = Math.abs(Math.round(n));
  let s = String(n), out = '';
  while (s.length > 3) { out = '.' + s.slice(-3) + out; s = s.slice(0, -3); }
  return (neg ? '−' : '') + s + out;
}
function fmtMoney(n) { return fmtInt(n) + ' €'; }
function fmtMoneyShort(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',') + ' Mio €';
  if (a >= 1e4) return fmtInt(n / 1000) + ' T€';
  return fmtMoney(n);
}
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function fmtClock(minOfDay) { const m = Math.floor(minOfDay) % 1440; return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60); }
function fmtPct(x) { return Math.round(x) + ' %'; }
function fmtDec(x, d = 1) { return x.toFixed(d).replace('.', ','); }
function fmtDuration(min) {
  min = Math.round(min);
  if (min < 60) return min + ' Min';
  return Math.floor(min / 60) + ' Std ' + pad2(min % 60) + ' Min';
}
const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

// Hash- und Rauschfunktionen für Kartengenerierung und Optik
function hash2(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fbm(x, y, seed, oct = 4) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { s += amp * valueNoise(x * f, y * f, seed + i * 17); norm += amp; amp *= 0.5; f *= 2; }
  return s / norm;
}

// Farb-Helfer
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}
function shade(hex, f) { // f < 0 dunkler, f > 0 heller
  const [r, g, b] = hexToRgb(hex);
  if (f < 0) return rgbToHex(r * (1 + f), g * (1 + f), b * (1 + f));
  return rgbToHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f);
}
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}

// Sicherer Zugriff auf localStorage (kann in Artefakten / privaten Fenstern fehlen)
const Store = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  },
  del(key) { try { localStorage.removeItem(key); } catch (e) { /* egal */ } },
};

// Base64 für Typed Arrays (Spielstände)
function u8ToB64(arr) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < arr.length; i += CH) s += String.fromCharCode.apply(null, arr.subarray(i, i + CH));
  return btoa(s);
}
function b64ToU8(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
