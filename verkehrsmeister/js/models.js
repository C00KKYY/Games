'use strict';
// ---------------------------------------------------------------------------
// Low-Poly-Modelle: Häuser, Ziele, Fahrzeuge, Pins, Symbole
// ---------------------------------------------------------------------------


// Symbole als Canvas-Textur (einmal pro Farbe)
const ICON_TEX = {};
function drawIcon(ctx, kind, s, colr) {
  ctx.save();
  ctx.translate(s / 2, s / 2);
  ctx.fillStyle = colr; ctx.strokeStyle = colr;
  ctx.lineWidth = s * 0.09; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const r = s * 0.3;
  if (kind === 'brot') {
    ctx.beginPath(); ctx.ellipse(0, s * 0.03, r * 1.1, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = s * 0.05;
    for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(k * r * 0.5 - r * 0.15, -r * 0.35); ctx.lineTo(k * r * 0.5 + r * 0.15, r * 0.35); ctx.stroke(); }
  } else if (kind === 'kreuz') {
    ctx.fillRect(-r * 0.3, -r, r * 0.6, r * 2); ctx.fillRect(-r, -r * 0.3, r * 2, r * 0.6);
  } else if (kind === 'koffer') {
    ctx.fillRect(-r, -r * 0.45, r * 2, r * 1.3);
    ctx.lineWidth = s * 0.07; ctx.strokeRect(-r * 0.4, -r * 0.8, r * 0.8, r * 0.4);
  } else if (kind === 'blatt') {
    ctx.beginPath(); ctx.moveTo(0, -r * 1.1); ctx.quadraticCurveTo(r * 1.1, -r * 0.2, 0, r * 1.05); ctx.quadraticCurveTo(-r * 1.1, -r * 0.2, 0, -r * 1.1); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = s * 0.04; ctx.beginPath(); ctx.moveTo(0, -r * 0.7); ctx.lineTo(0, r * 0.9); ctx.stroke();
  } else if (kind === 'stern') {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r * 1.1; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  } else if (kind === 'zahnrad') {
    ctx.beginPath();
    for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, rr = k % 2 ? r * 0.8 : r * 1.1; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function iconTexture(pi) {
  if (ICON_TEX[pi]) return ICON_TEX[pi];
  const s = 128;
  const cv = document.createElement('canvas'); cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.47, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = s * 0.05; ctx.strokeStyle = PALETTE[pi].hex; ctx.stroke();
  drawIcon(ctx, PALETTE[pi].icon, s, PALETTE[pi].hex);
  const tex = new THREE.CanvasTexture(cv);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  ICON_TEX[pi] = tex;
  return tex;
}

const MAT_VC = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
let _matVC = null;
function matVC() { return _matVC || (_matVC = MAT_VC()); }
const WINDOW_MAT = new THREE.MeshStandardMaterial({ color: 0x223044, emissive: 0xffc56a, emissiveIntensity: 0, roughness: 0.4 });

// Wohnhaus (1x1). dir = Richtung der Einfahrt (0 N, 1 O, 2 S, 3 W). Lokale Koordinaten: Kachel 0..1
function makeHouse(pi, dir, seed) {
  const r = new RNG(seed);
  const g = new THREE.Group();
  const B = new GeoBuilder();
  const wall = col(['#f4efe6', '#efe6d6', '#f6f1ea', '#e9e1d3'][r.int(0, 3)]);
  const roof = col(PALETTE[pi].hex);
  const ins = 0.16;
  // Grundstück
  B.rect(0.04, 0.04, 0.96, 0.96, 0.004, col('#a4d07e'));
  // Haus etwas von der Einfahrt weg
  const hx0 = ins, hz0 = ins, hx1 = 1 - ins, hz1 = 1 - ins;
  const wallH = 0.3 + r.next() * 0.06;
  // Einfahrt-Bereich freilassen: Haus nach hinten versetzen
  const off = 0.08;
  const ox = -DX[dir] * off, oz = -DY[dir] * off;
  B.box(hx0 + ox, 0, hz0 + oz, hx1 + ox, wallH, hz1 + oz, wall, { top: wall.clone().multiplyScalar(0.9) });
  B.gable(hx0 + ox - 0.04, hz0 + oz - 0.04, hx1 + ox + 0.04, hz1 + oz + 0.04, wallH, 0.22, roof, dir === 1 || dir === 3);
  // Tür zur Einfahrt
  const door = col('#6b4b34');
  const cx = 0.5 + ox, cz = 0.5 + oz;
  const fx = cx + DX[dir] * (0.5 - ins + 0.002), fz = cz + DY[dir] * (0.5 - ins + 0.002);
  if (DX[dir]) B.box(fx - 0.01, 0, fz - 0.06, fx + 0.01, 0.15, fz + 0.06, door);
  else B.box(fx - 0.06, 0, fz - 0.01, fx + 0.06, 0.15, fz + 0.01, door);
  // Zufahrt
  const dc = col('#b9b4aa');
  const ex = 0.5 + DX[dir] * 0.5, ez = 0.5 + DY[dir] * 0.5;
  if (DX[dir]) B.rect(Math.min(cx + DX[dir] * 0.34, ex), 0.4, Math.max(cx + DX[dir] * 0.34, ex), 0.6, 0.008, dc);
  else B.rect(0.4, Math.min(cz + DY[dir] * 0.34, ez), 0.6, Math.max(cz + DY[dir] * 0.34, ez), 0.008, dc);
  const mesh = new THREE.Mesh(B.geometry(), matVC());
  mesh.castShadow = true; mesh.receiveShadow = true;
  g.add(mesh);
  // Fenster (leuchten nachts)
  const wgeo = new THREE.BoxGeometry(0.07, 0.06, 0.01);
  for (const side of [0, 1, 2, 3]) {
    if (side === dir) continue;
    const win = new THREE.Mesh(wgeo, WINDOW_MAT);
    const px = cx + DX[side] * (0.5 - ins + 0.004), pz = cz + DY[side] * (0.5 - ins + 0.004);
    win.position.set(px, wallH * 0.62, pz);
    win.rotation.y = DX[side] ? Math.PI / 2 : 0;
    g.add(win);
  }
  // Farbsymbol auf dem Dach
  return g;
}

// Ziel (2x2): großes Gebäude mit Parkplatz. dir = Seite der Einfahrt.
function makeDestination(pi, dir, seed) {
  const r = new RNG(seed);
  const g = new THREE.Group();
  const B = new GeoBuilder();
  const base = col(PALETTE[pi].hex);
  const light = col(PALETTE[pi].light);
  const wall = col('#f3efe7');
  // Grundstück 2x2
  B.rect(0.05, 0.05, 1.95, 1.95, 0.004, col('#b8c9a6'));
  // Parkplatz an der Einfahrtseite (halbe Fläche), Gebäude auf der anderen Hälfte
  // lokales System: Einfahrt nach "unten" (+z) bauen, danach drehen
  const P = new GeoBuilder();
  P.rect(0.12, 1.02, 1.88, 1.92, 0.01, col('#9aa0a6'));
  for (let k = 0; k < 5; k++) P.rect(0.3 + k * 0.34, 1.08, 0.32 + k * 0.34, 1.42, 0.014, col('#f2f2f2'));
  // Gebäude
  const H = 0.55 + r.next() * 0.25;
  P.box(0.18, 0, 0.14, 1.82, H, 0.98, wall, { top: light });
  P.box(0.18, H, 0.14, 1.82, H + 0.05, 0.98, base);
  // Markise/Fassadenband in Farbe
  P.box(0.16, H * 0.55, 0.97, 1.84, H * 0.62, 1.03, base);
  // Eingang
  P.box(0.85, 0, 0.97, 1.15, 0.24, 0.99, col('#30343a'));
  // Dachaufbauten
  P.box(1.3, H + 0.05, 0.3, 1.6, H + 0.17, 0.55, col('#c9c9c9'));
  // Einfahrt-Stummel bis zur Kante
  P.rect(0.12, 1.9, 1.88, 2.0, 0.012, col('#9aa0a6'));
  // in die richtige Richtung drehen: lokales "unten" (+z, dir=2) -> dir
  const rot = [Math.PI, Math.PI / 2, 0, -Math.PI / 2][dir];
  const geo = P.geometry();
  geo.translate(-1, 0, -1); geo.rotateY(rot); geo.translate(1, 0, 1);
  const m2 = new THREE.Mesh(geo, matVC());
  m2.castShadow = true; m2.receiveShadow = true;
  g.add(m2);
  const m1 = new THREE.Mesh(B.geometry(), matVC());
  m1.receiveShadow = true;
  g.add(m1);
  g.userData.roofY = H;
  g.userData.lot = { x: 1 + DX[dir] * 0.45, z: 1 + DY[dir] * 0.45 };
  return g;
}

// Fahrzeug-Geometrie (Länge entlang +x), Vertexfarben: Karosserie weiß (Instanzfarbe färbt), Scheiben dunkel
function carGeometry(kind) {
  const B = new GeoBuilder();
  const white = col('#ffffff'), glass = col('#2a3a4f'), tire = col('#222222'), light = col('#fff1b8'), tail = col('#ff4d4d');
  if (kind === 'amb') {
    B.box(-0.18, 0.03, -0.085, 0.12, 0.22, 0.085, white);
    B.box(0.12, 0.03, -0.08, 0.19, 0.15, 0.08, white);
    B.box(0.15, 0.1, -0.07, 0.192, 0.14, 0.07, glass);
    B.box(-0.181, 0.1, -0.086, 0.121, 0.13, 0.086, col('#e5484d'));
    B.box(0.02, 0.22, -0.05, 0.08, 0.25, 0.05, col('#3b82f6'));
  } else if (kind === 'truck') {
    B.box(-0.24, 0.03, -0.09, 0.12, 0.25, 0.09, col('#e8e8e8'));
    B.box(0.13, 0.03, -0.085, 0.25, 0.2, 0.085, white);
    B.box(0.2, 0.12, -0.075, 0.252, 0.18, 0.075, glass);
  } else if (kind === 'bus') {
    B.box(-0.28, 0.03, -0.095, 0.28, 0.24, 0.095, white);
    B.box(-0.25, 0.14, -0.097, 0.25, 0.2, 0.097, glass);
    B.box(0.27, 0.12, -0.08, 0.282, 0.2, 0.08, glass);
  } else {
    B.box(-0.15, 0.03, -0.075, 0.15, 0.1, 0.075, white);
    B.box(-0.08, 0.1, -0.065, 0.07, 0.16, 0.065, white);
    B.box(0.06, 0.105, -0.06, 0.075, 0.155, 0.06, glass);
    B.box(-0.085, 0.105, -0.06, -0.075, 0.155, 0.06, glass);
    B.box(0.149, 0.06, -0.06, 0.153, 0.085, -0.035, light);
    B.box(0.149, 0.06, 0.035, 0.153, 0.085, 0.06, light);
    B.box(-0.153, 0.06, -0.06, -0.149, 0.085, -0.035, tail);
    B.box(-0.153, 0.06, 0.035, -0.149, 0.085, 0.06, tail);
  }
  // Räder (dunkle Klötzchen)
  const L = kind === 'bus' ? 0.2 : kind === 'truck' ? 0.17 : 0.1;
  for (const sx of [-L, L]) for (const sz of [-1, 1]) B.box(sx - 0.035, 0, sz * 0.075 - 0.02, sx + 0.035, 0.05, sz * 0.075 + 0.02, tire);
  return B.geometry();
}

// Auftrags-Pin (kleiner Wegweiser-Stecker)
function pinGeometry() {
  const B = new GeoBuilder();
  const w = col('#ffffff');
  B.box(-0.012, 0, -0.012, 0.012, 0.16, 0.012, col('#666666'));
  // Kopf (Oktaeder-artig)
  const y = 0.22, r = 0.07;
  const top = [0, y + r, 0], bot = [0, y - r, 0];
  const ring = [[r, y, 0], [0, y, r], [-r, y, 0], [0, y, -r]];
  for (let k = 0; k < 4; k++) {
    const a = ring[k], b = ring[(k + 1) % 4];
    B.tri(a, top, b, w); B.tri(b, bot, a, w);
  }
  return B.geometry();
}

// Polizist mit Kelle (lokal um 0,0)
function makePolice() {
  const B = new GeoBuilder();
  const blue = col('#1e3a8a'), skin = col('#f1c9a5'), white = col('#ffffff'), hat = col('#f8fafc');
  B.box(-0.035, 0, -0.025, -0.008, 0.1, 0.025, blue);
  B.box(0.008, 0, -0.025, 0.035, 0.1, 0.025, blue);
  B.box(-0.045, 0.1, -0.035, 0.045, 0.22, 0.035, col('#facc15'));
  B.box(-0.03, 0.22, -0.03, 0.03, 0.27, 0.03, skin);
  B.box(-0.038, 0.27, -0.038, 0.038, 0.3, 0.038, hat);
  B.box(-0.03, 0.3, -0.03, 0.03, 0.32, 0.03, blue);
  // Arm mit Kelle
  B.box(0.045, 0.18, -0.012, 0.13, 0.205, 0.012, col('#facc15'));
  B.box(0.13, 0.17, -0.004, 0.18, 0.22, 0.004, white);
  B.box(0.14, 0.18, -0.006, 0.17, 0.21, 0.006, col('#e5484d'));
  const m = new THREE.Mesh(B.geometry(), matVC());
  m.castShadow = true;
  return m;
}

// Leitkegel
function coneGeometry() {
  const B = new GeoBuilder();
  const o = col('#f97316'), w = col('#ffffff');
  B.box(-0.05, 0, -0.05, 0.05, 0.015, 0.05, col('#222222'));
  const seg = 6, r0 = 0.035, h = 0.13;
  for (let k = 0; k < seg; k++) {
    const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
    const c = k % 2 ? o : o;
    B.tri([Math.cos(a0) * r0, 0.015, Math.sin(a0) * r0], [0, 0.015 + h, 0], [Math.cos(a1) * r0, 0.015, Math.sin(a1) * r0], c);
  }
  B.box(-0.026, 0.06, -0.026, 0.026, 0.075, 0.026, w);
  return B.geometry();
}

// Zug (Lok + Wagen), entlang +x, Länge ~ 3 Kacheln
function makeTrain() {
  const g = new THREE.Group();
  const B = new GeoBuilder();
  const red = col('#c0392b'), dark = col('#2d2d33'), glass = col('#2a3a4f'), grey = col('#9aa3ad');
  B.box(-0.45, 0.05, -0.16, 0.45, 0.34, 0.16, red);
  B.box(0.3, 0.2, -0.161, 0.42, 0.3, 0.161, glass);
  B.box(-0.45, 0, -0.14, 0.45, 0.05, 0.14, dark);
  for (let k = 1; k <= 3; k++) {
    const x0 = -0.45 - k * 0.98, x1 = x0 + 0.92;
    B.box(x0, 0.05, -0.15, x1, 0.32, 0.15, k % 2 ? grey : col('#e5e7eb'));
    B.box(x0, 0, -0.13, x1, 0.05, 0.13, dark);
    for (let q = 0; q < 4; q++) B.box(x0 + 0.08 + q * 0.21, 0.18, -0.151, x0 + 0.2 + q * 0.21, 0.27, 0.151, glass);
  }
  const m = new THREE.Mesh(B.geometry(), matVC());
  m.castShadow = true;
  g.add(m);
  return g;
}

// Frachtschiff entlang +x
function makeShip() {
  const B = new GeoBuilder();
  const hull = col('#1f4e79'), deck = col('#d6d0c4'), red = col('#c0392b'), white = col('#ffffff');
  B.box(-0.9, -0.12, -0.28, 0.75, 0.12, 0.28, hull);
  B.tri([0.75, 0.12, -0.28], [1.05, 0.12, 0], [0.75, 0.12, 0.28], hull);
  B.tri([0.75, -0.12, -0.28], [0.75, 0.12, -0.28], [1.05, 0.12, 0], hull);
  B.tri([0.75, 0.12, 0.28], [0.75, -0.12, 0.28], [1.05, 0.12, 0], hull);
  B.box(-0.88, 0.12, -0.26, 0.74, 0.14, 0.26, deck);
  const cc = [col('#e5484d'), col('#2f6fdb'), col('#f5b700'), col('#1f9d55')];
  for (let k = 0; k < 4; k++) B.box(-0.4 + k * 0.28, 0.14, -0.2, -0.16 + k * 0.28, 0.32, 0.2, cc[k]);
  B.box(-0.85, 0.14, -0.2, -0.55, 0.5, 0.2, white);
  B.box(-0.8, 0.5, -0.06, -0.7, 0.64, 0.06, red);
  const m = new THREE.Mesh(B.geometry(), matVC());
  m.castShadow = true;
  return m;
}
