'use strict';
// ---------------------------------------------------------------------------
// Fahrwege innerhalb einer Kachel (Bezier / Kreisverkehr) und Konflikttabellen
// ---------------------------------------------------------------------------

const PATH_DS = 0.02;
const SIDE_ANG = [90, 0, 270, 180]; // Seitenwinkel (math. Orientierung) für N, O, S, W
const RING_IN = 35, RING_OUT = 35;

class Path {
  constructor(pts) {
    // pts: dichte Polylinie [[x,y],...]
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    const L = cum[cum.length - 1];
    const n = Math.max(2, Math.ceil(L / PATH_DS) + 1);
    this.len = L;
    this.n = n;
    this.xs = new Float32Array(n);
    this.ys = new Float32Array(n);
    this.as = new Float32Array(n);
    let k = 0;
    for (let i = 0; i < n; i++) {
      const s = Math.min(L, i * PATH_DS);
      while (k < cum.length - 2 && cum[k + 1] < s) k++;
      const seg = cum[k + 1] - cum[k];
      const t = seg > 1e-9 ? (s - cum[k]) / seg : 0;
      this.xs[i] = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t;
      this.ys[i] = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t;
    }
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      this.as[i] = Math.atan2(this.ys[b] - this.ys[a], this.xs[b] - this.xs[a]);
    }
    this.cum = cum;
  }
  // Position bei Weglänge s in Kachelkoordinaten (0..1)
  pos(s, out) {
    let f = s / PATH_DS;
    if (f < 0) f = 0;
    const max = this.n - 1;
    if (f >= max) { out.x = this.xs[max]; out.y = this.ys[max]; out.a = this.as[max]; return out; }
    const i = f | 0, t = f - i;
    out.x = this.xs[i] + (this.xs[i + 1] - this.xs[i]) * t;
    out.y = this.ys[i] + (this.ys[i + 1] - this.ys[i]) * t;
    let a0 = this.as[i], a1 = this.as[i + 1];
    let da = a1 - a0;
    if (da > Math.PI) da -= Math.PI * 2; else if (da < -Math.PI) da += Math.PI * 2;
    out.a = a0 + da * t;
    return out;
  }
}

function edgePoint(side, heading, off) {
  const cx = 0.5 + DX[side] * 0.5, cy = 0.5 + DY[side] * 0.5;
  const r = (heading + 1) & 3;
  return [cx + DX[r] * off, cy + DY[r] * off];
}

function bezierPts(p0, p1, p2, p3, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
  }
  return out;
}

function ringPt(phiDeg) {
  const p = phiDeg * Math.PI / 180;
  return [0.5 + CFG.ringR * Math.cos(p), 0.5 - CFG.ringR * Math.sin(p)];
}
function ringTan(phiDeg) {
  const p = phiDeg * Math.PI / 180;
  return [-Math.sin(p), -Math.cos(p)];
}

const PATH_CACHE = new Map();

function makePath(h, d, oIn, oOut, round) {
  const LO = CFG.laneOff;
  const p0 = edgePoint(OPP[h], h, oIn ? LO : 0);
  const p3 = edgePoint(d, d, oOut ? LO : 0);
  const tt = turnOf(h, d);
  let path;
  if (round) {
    const a = OPP[h];
    const phiIn = SIDE_ANG[a] + RING_IN;
    let phiOut = SIDE_ANG[d] - RING_OUT;
    while (phiOut <= phiIn + 5) phiOut += 360;
    const r0 = ringPt(phiIn), t0 = ringTan(phiIn);
    const entry = bezierPts(p0, [p0[0] + DX[h] * 0.1, p0[1] + DY[h] * 0.1], [r0[0] - t0[0] * 0.07, r0[1] - t0[1] * 0.07], r0, 14);
    const arc = [];
    for (let ph = phiIn + 3; ph < phiOut; ph += 3) arc.push(ringPt(ph));
    const r1 = ringPt(phiOut), t1 = ringTan(phiOut);
    const exit = bezierPts(r1, [r1[0] + t1[0] * 0.07, r1[1] + t1[1] * 0.07], [p3[0] - DX[d] * 0.1, p3[1] - DY[d] * 0.1], p3, 14);
    const pts = entry.concat(arc, exit);
    path = new Path(pts);
    // Ringabschnitt bestimmen
    let l0 = 0;
    for (let i = 1; i < entry.length; i++) l0 += Math.hypot(entry[i][0] - entry[i - 1][0], entry[i][1] - entry[i - 1][1]);
    path.ringS0 = l0;
    path.ringS1 = l0 + CFG.ringR * (phiOut - phiIn) * Math.PI / 180;
    path.phiIn = phiIn; path.phiOut = phiOut;
  } else {
    let p1, p2;
    if (tt === TT_STRAIGHT) {
      p1 = [p0[0] + DX[h] * 0.33, p0[1] + DY[h] * 0.33];
      p2 = [p3[0] - DX[d] * 0.33, p3[1] - DY[d] * 0.33];
    } else if (tt === TT_UTURN) {
      const k = 0.55;
      p1 = [p0[0] + DX[h] * k, p0[1] + DY[h] * k];
      p2 = [p3[0] + DX[h] * k, p3[1] + DY[h] * k];
    } else {
      const corner = DX[h] === 0 ? [p0[0], p3[1]] : [p3[0], p0[1]];
      const k1 = Math.hypot(corner[0] - p0[0], corner[1] - p0[1]) * 0.5523;
      const k2 = Math.hypot(p3[0] - corner[0], p3[1] - corner[1]) * 0.5523;
      p1 = [p0[0] + DX[h] * k1, p0[1] + DY[h] * k1];
      p2 = [p3[0] - DX[d] * k2, p3[1] - DY[d] * k2];
    }
    path = new Path(bezierPts(p0, p1, p2, p3, 40));
  }
  path.h = h; path.d = d; path.turn = tt; path.round = !!round;
  return path;
}

function getPath(h, d, oIn, oOut, round) {
  const key = ((((h * 4 + d) * 2 + oIn) * 2 + oOut) * 2) + (round ? 1 : 0);
  let p = PATH_CACHE.get(key);
  if (!p) { p = makePath(h, d, oIn, oOut, round); PATH_CACHE.set(key, p); }
  return p;
}

function pathAt(world, i, h, d) {
  const round = world.jc[i] && world.jc[i].type === 'roundabout';
  return getPath(h, d, world.sideOff(i, OPP[h]), world.sideOff(i, d), round);
}

// Konflikttabelle für Kreuzungen: 16x16 Bewegungen (h*4+d)
const CONFLICT_CACHE = new Map();
function conflictTable(offMask) {
  let t = CONFLICT_CACHE.get(offMask);
  if (t) return t;
  t = new Uint8Array(256);
  const paths = [];
  for (let m = 0; m < 16; m++) {
    const h = m >> 2, d = m & 3;
    paths.push(getPath(h, d, (offMask >> OPP[h]) & 1, (offMask >> d) & 1, false));
  }
  const TH2 = 0.165 * 0.165;
  for (let a = 0; a < 16; a++) {
    for (let b = a + 1; b < 16; b++) {
      const ha = a >> 2, hb = b >> 2;
      let c = 0;
      if (ha !== hb) {
        const da = a & 3, db = b & 3;
        const ta = turnOf(ha, da), tb = turnOf(hb, db);
        if (ta === TT_LEFT && tb === TT_LEFT && hb === OPP[ha]) c = 0; // Gegenüberliegende Linksabbieger passieren sich
        else {
          const P = paths[a], Q = paths[b];
          outer: for (let i = 0; i < P.n; i += 2) {
            for (let j = 0; j < Q.n; j += 2) {
              if (dist2(P.xs[i], P.ys[i], Q.xs[j], Q.ys[j]) < TH2) { c = 1; break outer; }
            }
          }
        }
      }
      t[a * 16 + b] = c; t[b * 16 + a] = c;
    }
  }
  CONFLICT_CACHE.set(offMask, t);
  return t;
}
