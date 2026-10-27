'use strict';
// ---------------------------------------------------------------------------
// Straßen als zusammengefasste 3D-Geometrie: Fahrbahn, Bordstein, Markierung,
// Brücken, Tunnelportale, Kreisverkehre, Ampelmasten (statisch)
// ---------------------------------------------------------------------------

const RCOL = {
  curb: '#dcd8cc', asphalt: '#5c626b', asphaltHw: '#4c525b', mark: '#f4f4ee', yellow: '#f2c200',
  deck: '#cfc8b8', rail: '#8a8070', pillar: '#a59d8e', portal: '#7d7466', portalDark: '#2a2622',
  island: '#7fbf5f', drive: '#b9b4aa',
};
const Y_CURB = 0.012, Y_ASPH = 0.02, Y_MARK = 0.026;

function roadHalf3(w, i, s) {
  const hw = w.road[i] === 2 ? 0.05 : 0;
  return ((w.two[i] >> s) & 1 ? 0.34 : 0.25) + hw;
}

class Roads3D {
  constructor(engine) {
    this.engine = engine;
    this.group = new THREE.Group();
    engine.scene.add(this.group);
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
    this.mat.userData.shared = true;
    this.mesh = null;
    this.hidden = new Set();   // Kacheln, die gerade als Pop-Animation separat gezeigt werden
    this.pops = [];
    this.lightHeads = [];      // dynamische Ampel-Lampen
  }

  build(world) {
    this.gen = (this.gen || 0) + 1;   // Zähler für abhängige Darstellungen (Stau-Färbung)
    if (this.mesh) { this.group.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
    const G = new GeoBuilder();
    for (let i = 0; i < world.N; i++) {
      if (!world.road[i] || this.hidden.has(i)) continue;
      if (i < world.n && (world.flags[i] & F_DRAW)) continue;   // Klappbrücke: eigenes Mesh
      this.tile(G, world, i, 0, 0);
    }
    if (!G.empty) {
      this.mesh = new THREE.Mesh(G.geometry(), this.mat);
      this.mesh.receiveShadow = true;
      this.mesh.castShadow = true;
      this.group.add(this.mesh);
    }
  }

  // Einzelne Kachel (für Pop-Animation) als eigenes Mesh, lokal um die Kachelmitte
  tileMesh(world, i) {
    const G = new GeoBuilder();
    const x = world.tx(i), y = world.ty(i);
    this.tile(G, world, i, -(x + 0.5), -(y + 0.5));
    const m = new THREE.Mesh(G.geometry(), this.mat);
    const h = i >= world.n ? (world.edgeH(i, 0) + world.edgeH(i, 1) + world.edgeH(i, 2) + world.edgeH(i, 3)) / 4 : 0;
    m.position.set(x + 0.5, 0, y + 0.5);
    m.userData.h = h;
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  // Neue Kacheln mit Federeffekt einblenden (gestaffelt entlang des Pfads)
  pop(world, tiles) {
    tiles.forEach((i, k) => {
      if (!world.road[i]) return;
      this.hidden.add(i);
      const m = this.tileMesh(world, i);
      m.scale.set(0.01, 0.01, 0.01);
      this.group.add(m);
      this.pops.push({ i, m, t: -k * 0.035 });
    });
    this.build(world);
  }

  update(dt, world) {
    if (!this.pops.length) return;
    let done = false;
    for (const p of this.pops) {
      p.t += dt;
      const u = clamp(p.t / 0.16, 0, 1);
      // Überschwingen: 0 -> 1.15 -> 1
      const s = u < 0.7 ? (u / 0.7) * 1.15 : 1.15 - (u - 0.7) / 0.3 * 0.15;
      const sc = Math.max(0.01, s);
      p.m.scale.set(sc, sc, sc);
      if (p.t >= 0.16) { p.done = true; done = true; p.m.scale.set(1, 1, 1); }
    }
    // erst neu aufbauen, wenn alle Kacheln fertig aufgeploppt sind
    if (done && this.pops.every(q => q.done)) {
      for (const p of this.pops) { this.group.remove(p.m); p.m.geometry.dispose(); }
      this.pops.length = 0;
      this.hidden.clear();
      this.build(world);
    }
  }

  // ---- Geometrie einer Kachel ----------------------------------------------------
  tile(G, w, i, ox, oz) {
    if (i >= w.n) { this.elevTile(G, w, i, ox, oz); return; }
    const x = w.tx(i) + ox, y = w.ty(i) + oz;
    const lk = w.link[i];
    const deg = popcount4(lk);
    const cx = x + 0.5, cz = y + 0.5;
    const J = w.jc[i];
    const round = J && J.type === 'roundabout';
    const bridge = w.flags[i] & F_BRIDGE, tunnel = w.flags[i] & F_TUNNEL;
    const asph = col(w.road[i] === 2 ? RCOL.asphaltHw : RCOL.asphalt);
    const curb = col(RCOL.curb);
    // Brücke: Deck, Pfeiler, Geländer
    if (bridge) {
      const deck = col(RCOL.deck);
      const hw = 0.46;
      G.box(cx - hw, -0.07, cz - hw, cx + hw, Y_CURB - 0.002, cz + hw, deck, { top: deck });
      // Klappbrücke: kein Mittelpfeiler (die Klappe schwenkt hoch)
      if (!(i < w.n && (w.flags[i] & F_DRAW))) G.box(cx - 0.07, BED_Y, cz - 0.07, cx + 0.07, -0.07, cz + 0.07, col(RCOL.pillar));
      const rail = col(RCOL.rail);
      if (lk === 0b0101) { G.box(cx - hw, 0, y, cx - hw + 0.04, 0.12, y + 1, rail); G.box(cx + hw - 0.04, 0, y, cx + hw, 0.12, y + 1, rail); }
      else if (lk === 0b1010) { G.box(x, 0, cz - hw, x + 1, 0.12, cz - hw + 0.04, rail); G.box(x, 0, cz + hw - 0.04, x + 1, 0.12, cz + hw, rail); }
    }
    // Einfahrten (Gehweg-Überfahrt)
    for (let s = 0; s < 4; s++) {
      if (!((w.drive[i] >> s) & 1)) continue;
      this.arm(G, x, y, s, 0.16, 0, Y_CURB, curb);
      this.arm(G, x, y, s, 0.11, 0, Y_CURB + 0.003, col(RCOL.drive));
    }
    this.shape(G, w, i, x, y, 0.07, Y_CURB, curb, lk, deg, round);
    this.shape(G, w, i, x, y, 0, Y_ASPH, asph, lk, deg, round);
    if (round) {
      G.disc(cx, cz, 0.24, Y_ASPH + 0.004, curb, 20);
      G.disc(cx, cz, 0.21, Y_ASPH + 0.03, col(RCOL.island), 20);
      // gestrichelter Außenring
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; G.arcBand(cx, cz, 0.425, 0.445, a, a + Math.PI / 8, Y_MARK, col(RCOL.mark), 3); }
      // kleiner Baum in der Mitte
      G.box(cx - 0.02, Y_ASPH, cz - 0.02, cx + 0.02, 0.14, cz + 0.02, col(TCOL.trunk));
      const tc = col('#4a9a52');
      for (let k = 0; k < 6; k++) {
        const a0 = k / 6 * Math.PI * 2, a1 = (k + 1) / 6 * Math.PI * 2, r = 0.09;
        G.tri([cx + Math.cos(a0) * r, 0.12, cz + Math.sin(a0) * r], [cx, 0.32, cz], [cx + Math.cos(a1) * r, 0.12, cz + Math.sin(a1) * r], tc);
      }
    }
    if (tunnel) this.portals(G, w, i, x, y, lk);
    if (w.flags[i] & F_CROSSING) this.crossing(G, w, i, x, y);
    if (w.flags[i] & F_RAMP) this.rampSign(G, w, i, x, y);
    this.markings(G, w, i, x, y, lk, deg, J);
  }

  // Bahnübergang: Schienen über die Fahrbahn, Andreaskreuze
  crossing(G, w, i, x, y) {
    const r = w.rail[w.g(i)];
    const rail = col('#3a3a40'), st = col('#c8c8c8');
    const cx = x + 0.5, cz = y + 0.5;
    for (const o of [-0.09, 0.09]) {
      if (r === 1) G.rect(cx + o - 0.012, y, cx + o + 0.012, y + 1, Y_MARK + 0.002, rail);
      else G.rect(x, cz + o - 0.012, x + 1, cz + o + 0.012, Y_MARK + 0.002, rail);
    }
    // Pfosten mit rot-weißem Kreuz an zwei Ecken
    for (const [px, pz] of [[x + 0.06, y + 0.06], [x + 0.94, y + 0.94]]) {
      G.box(px - 0.012, 0, pz - 0.012, px + 0.012, 0.28, pz + 0.012, st);
      G.box(px - 0.06, 0.24, pz - 0.006, px + 0.06, 0.27, pz + 0.006, col('#e5484d'));
      G.box(px - 0.006, 0.2, pz - 0.06, px + 0.006, 0.31, pz + 0.06, col('#ffffff'));
    }
  }

  // Blaues Autobahnschild an der Auffahrt
  rampSign(G, w, i, x, y) {
    const up = w.up[i];
    for (let s = 0; s < 4; s++) {
      if (!((up >> s) & 1)) continue;
      const r = (s + 1) & 3;
      const px = x + 0.5 + DX[s] * 0.3 + DX[r] * 0.46, pz = y + 0.5 + DY[s] * 0.3 + DY[r] * 0.46;
      G.box(px - 0.012, 0, pz - 0.012, px + 0.012, 0.36, pz + 0.012, col('#8a8f96'));
      const vt = DX[s] === 0;   // Fahrtrichtung Nord/Süd → Schild quer (x-Ausdehnung)
      if (vt) { G.box(px - 0.1, 0.3, pz - 0.012, px + 0.1, 0.44, pz + 0.012, col('#1d4ed8')); G.box(px - 0.075, 0.355, pz - 0.014, px + 0.075, 0.375, pz + 0.014, col('#ffffff')); }
      else { G.box(px - 0.012, 0.3, pz - 0.1, px + 0.012, 0.44, pz + 0.1, col('#1d4ed8')); G.box(px - 0.014, 0.355, pz - 0.075, px + 0.014, 0.375, pz + 0.075, col('#ffffff')); }
    }
  }

  // Hochstraße (Autobahn) inkl. Rampen-Steigung, Leitplanken und Pfeiler
  elevTile(G, w, i, ox, oz) {
    const g = i - w.n;
    const x = w.tx(i) + ox, y = w.ty(i) + oz;
    const lk = w.link[i] || w.out[i];
    const vert = (lk & 0b0101) !== 0;
    const s0 = vert ? 0 : 3, s1 = vert ? 2 : 1;
    const h0 = w.edgeH(i, s0), h1 = w.edgeH(i, s1);
    const cx = x + 0.5, cz = y + 0.5;
    const hw = 0.42, th = 0.09;
    const asph = col(RCOL.asphaltHw), deck = col('#b9b2a4'), side = col('#a39c8e'), barrier = col('#d9d9d9'), mark = col(RCOL.mark);
    // Punkte entlang der Achse: a = Kante s0, b = Kante s1; quer = lateral
    const P = (t, lat, h) => vert ? [cx + lat, h, y + t] : [x + t, h, cz + lat];
    const H = t => h0 + (h1 - h0) * t;
    const top = 0.02;
    // Fahrbahn
    G.quad(P(0, -hw, H(0) + top), P(0, hw, H(0) + top), P(1, hw, H(1) + top), P(1, -hw, H(1) + top), asph);
    G.quad(P(0, -hw, H(0) + top), P(1, -hw, H(1) + top), P(1, hw, H(1) + top), P(0, hw, H(0) + top), asph);
    // Unterseite + Seiten
    G.quad(P(0, hw, H(0) - th), P(0, -hw, H(0) - th), P(1, -hw, H(1) - th), P(1, hw, H(1) - th), side);
    for (const lat of [-hw, hw]) {
      G.quad(P(0, lat, H(0) - th), P(1, lat, H(1) - th), P(1, lat, H(1) + top), P(0, lat, H(0) + top), deck);
      G.quad(P(0, lat, H(0) + top), P(1, lat, H(1) + top), P(1, lat, H(1) - th), P(0, lat, H(0) - th), deck);
      // Leitplanke
      const l2 = lat * 0.96;
      G.quad(P(0, l2, H(0) + top), P(1, l2, H(1) + top), P(1, l2, H(1) + 0.09), P(0, l2, H(0) + 0.09), barrier);
      G.quad(P(0, l2, H(0) + 0.09), P(1, l2, H(1) + 0.09), P(1, l2, H(1) + top), P(0, l2, H(0) + top), barrier);
    }
    // Markierung: doppelte Mittellinie, Randlinien
    for (const lat of [-0.03, 0.03, -0.36, 0.36]) {
      const a = lat - 0.01, b = lat + 0.01;
      G.quad(P(0, a, H(0) + top + 0.004), P(0, b, H(0) + top + 0.004), P(1, b, H(1) + top + 0.004), P(1, a, H(1) + top + 0.004), mark);
      G.quad(P(0, a, H(0) + top + 0.004), P(1, a, H(1) + top + 0.004), P(1, b, H(1) + top + 0.004), P(0, b, H(0) + top + 0.004), mark);
    }
    // Damm unter der Rampe bzw. Pfeiler
    if (h0 !== h1) {
      const fill = col('#9c9484');
      for (const lat of [-hw, hw]) {
        G.tri(P(0, lat, 0), P(1, lat, 0), P(1, lat, H(1) - th), fill);
        G.tri(P(0, lat, 0), P(1, lat, H(1) - th), P(1, lat, 0), fill);
        G.tri(P(0, lat, 0), P(1, lat, H(1) - th), P(0, lat, Math.max(0, H(0) - th)), fill);
      }
      const t1 = h1 > h0 ? 1 : 0;
      G.quad(P(t1, -hw, 0), P(t1, hw, 0), P(t1, hw, Math.max(h0, h1) - th), P(t1, -hw, Math.max(h0, h1) - th), fill);
      G.quad(P(t1, hw, 0), P(t1, -hw, 0), P(t1, -hw, Math.max(h0, h1) - th), P(t1, hw, Math.max(h0, h1) - th), fill);
    } else {
      const pill = col(RCOL.pillar);
      const below = w.road[g] || w.terrain[g] === T_WATER;
      const ts = below && w.road[g] ? [0.06, 0.94] : [0.5];
      const yb = w.terrain[g] === T_WATER ? BED_Y : 0;
      for (const t of ts) {
        const p = P(t, 0, 0);
        G.box(p[0] - 0.06, yb, p[2] - 0.06, p[0] + 0.06, h0 - th, p[2] + 0.06, pill);
        if (!w.road[g]) { const a = P(t, -0.3, 0), b = P(t, 0.3, 0); G.box(Math.min(a[0], b[0]) - 0.05, h0 - th - 0.06, Math.min(a[2], b[2]) - 0.05, Math.max(a[0], b[0]) + 0.05, h0 - th, Math.max(a[2], b[2]) + 0.05, pill); }
      }
    }
  }

  // Fahrbahnstück von der Kachelkante bis `inner` vor die Mitte
  arm(G, x, y, s, h, ext, yy, color, inner = 0) {
    const cx = x + 0.5, cz = y + 0.5;
    if (s === 0) G.rect(cx - h, y - ext, cx + h, cz - inner, yy, color);
    else if (s === 2) G.rect(cx - h, cz + inner, cx + h, y + 1 + ext, yy, color);
    else if (s === 1) G.rect(cx + inner, cz - h, x + 1 + ext, cz + h, yy, color);
    else G.rect(x - ext, cz - h, cx - inner, cz + h, yy, color);
  }

  shape(G, w, i, x, y, ext, yy, color, lk, deg, round) {
    const cx = x + 0.5, cz = y + 0.5;
    if (round) {
      // Arme enden im Kreis, damit die Kontur rund bleibt
      G.disc(cx, cz, 0.47 + ext * 0.5, yy, color, 22);
      for (let s = 0; s < 4; s++) if ((lk >> s) & 1) this.arm(G, x, y, s, roadHalf3(w, i, s) + ext, 0, yy, color, 0.3);
      return;
    }
    if (deg === 2 && lk !== 0b0101 && lk !== 0b1010) {
      let s1 = -1, s2 = -1;
      for (let s = 0; s < 4; s++) if ((lk >> s) & 1) { if (s1 < 0) s1 = s; else s2 = s; }
      const h = Math.max(roadHalf3(w, i, s1), roadHalf3(w, i, s2)) + ext;
      const ox = x + (DX[s1] + DX[s2] > 0 ? 1 : 0), oz = y + (DY[s1] + DY[s2] > 0 ? 1 : 0);
      let a0 = Math.atan2(cz + DY[s1] * 0.5 - oz, cx + DX[s1] * 0.5 - ox);
      let a1 = Math.atan2(cz + DY[s2] * 0.5 - oz, cx + DX[s2] * 0.5 - ox);
      let d = a1 - a0;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      G.arcBand(ox, oz, Math.max(0.001, 0.5 - h), 0.5 + h, a0, a0 + d, yy, color, 10);
      return;
    }
    if (deg === 0) { G.rect(cx - 0.3 - ext, cz - 0.3 - ext, cx + 0.3 + ext, cz + 0.3 + ext, yy, color); return; }
    if (deg === 1) {
      let s = 0; for (let k = 0; k < 4; k++) if ((lk >> k) & 1) s = k;
      const h = roadHalf3(w, i, s) + ext;
      this.arm(G, x, y, s, h, 0, yy, color);
      G.disc(cx, cz, h, yy, color, 14);
      return;
    }
    if (deg >= 3) {
      let hw = 0;
      for (let s = 0; s < 4; s++) if ((lk >> s) & 1) hw = Math.max(hw, roadHalf3(w, i, s));
      hw += ext;
      G.rect(cx - hw, cz - hw, cx + hw, cz + hw, yy, color);
    }
    for (let s = 0; s < 4; s++) if ((lk >> s) & 1) this.arm(G, x, y, s, roadHalf3(w, i, s) + ext, 0, yy, color);
  }

  portals(G, w, i, x, y, lk) {
    const cx = x + 0.5, cz = y + 0.5;
    for (let s = 0; s < 4; s++) {
      if (!((lk >> s) & 1)) continue;
      const j = w.nb(i, s);
      if (j < 0 || (w.flags[j] & F_TUNNEL)) continue;
      // Portal an der Kachelkante s
      const px = cx + DX[s] * 0.46, pz = cz + DY[s] * 0.46;
      const c = col(RCOL.portal), dark = col(RCOL.portalDark);
      const hw = 0.42, t = 0.06, hgt = 0.42;
      if (DX[s]) {
        G.box(px - t, 0, pz - hw, px + t, hgt, pz - hw + 0.1, c);
        G.box(px - t, 0, pz + hw - 0.1, px + t, hgt, pz + hw, c);
        G.box(px - t, hgt - 0.1, pz - hw, px + t, hgt, pz + hw, c);
        G.box(px - t * 0.5, 0.02, pz - hw + 0.1, px + t * 0.5, hgt - 0.1, pz + hw - 0.1, dark, { noSides: false });
      } else {
        G.box(px - hw, 0, pz - t, px - hw + 0.1, hgt, pz + t, c);
        G.box(px + hw - 0.1, 0, pz - t, px + hw, hgt, pz + t, c);
        G.box(px - hw, hgt - 0.1, pz - t, px + hw, hgt, pz + t, c);
        G.box(px - hw + 0.1, 0.02, pz - t * 0.5, px + hw - 0.1, hgt - 0.1, pz + t * 0.5, dark);
      }
    }
  }

  markings(G, w, i, x, y, lk, deg, J) {
    const mark = col(RCOL.mark);
    const cx = x + 0.5, cz = y + 0.5;
    if (!w.isJ[i]) {
      if (deg === 2 && (w.two[i] & lk) === lk) {
        const hw = w.road[i] === 2;
        if (lk === 0b0101 || lk === 0b1010) {
          const vert = lk === 0b0101;
          if (hw) {
            for (const o of [-0.03, 0.03]) vert ? G.rect(cx + o - 0.012, y, cx + o + 0.012, y + 1, Y_MARK, mark) : G.rect(x, cz + o - 0.012, x + 1, cz + o + 0.012, Y_MARK, mark);
          } else {
            for (let k = 0; k < 4; k++) {
              const t0 = k * 0.25 + 0.06, t1 = t0 + 0.13;
              vert ? G.rect(cx - 0.016, y + t0, cx + 0.016, y + t1, Y_MARK, mark) : G.rect(x + t0, cz - 0.016, x + t1, cz + 0.016, Y_MARK, mark);
            }
          }
        } else {
          let s1 = -1, s2 = -1;
          for (let s = 0; s < 4; s++) if ((lk >> s) & 1) { if (s1 < 0) s1 = s; else s2 = s; }
          const ox = x + (DX[s1] + DX[s2] > 0 ? 1 : 0), oz = y + (DY[s1] + DY[s2] > 0 ? 1 : 0);
          let a0 = Math.atan2(cz + DY[s1] * 0.5 - oz, cx + DX[s1] * 0.5 - ox);
          let a1 = Math.atan2(cz + DY[s2] * 0.5 - oz, cx + DX[s2] * 0.5 - ox);
          let d = a1 - a0;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          for (let k = 0; k < 3; k++) {
            const t0 = a0 + d * (k / 3 + 0.05), t1 = a0 + d * (k / 3 + 0.22);
            G.arcBand(ox, oz, 0.484, 0.516, t0, t1, Y_MARK, mark, 3);
          }
        }
      }
      // Einbahn-Pfeile
      for (let s = 0; s < 4; s++) {
        if (!((lk >> s) & 1) || ((w.two[i] >> s) & 1) || !((w.out[i] >> s) & 1)) continue;
        const px = cx + DX[s] * 0.22, pz = cz + DY[s] * 0.22;
        const r = (s + 1) & 3;
        const tip = [px + DX[s] * 0.1, Y_MARK, pz + DY[s] * 0.1];
        const bl = [px - DX[s] * 0.05 + DX[r] * 0.08, Y_MARK, pz - DY[s] * 0.05 + DY[r] * 0.08];
        const br = [px - DX[s] * 0.05 - DX[r] * 0.08, Y_MARK, pz - DY[s] * 0.05 - DY[r] * 0.08];
        G.tri(tip, bl, br, mark, false); G.tri(tip, br, bl, mark, false);
      }
      return;
    }
    if (!J) return;
    // Haltelinien / Wartelinien und Schilder
    for (let h = 0; h < 4; h++) {
      if (!((J.inMask >> h) & 1)) continue;
      const side = OPP[h], r = (h + 1) & 3;
      const two = (w.two[i] >> side) & 1;
      const l0 = two ? 0.03 : -0.2, l1 = two ? 0.31 : 0.2;
      const ex = cx + DX[side] * 0.44, ez = cz + DY[side] * 0.44;
      const style = J.type === 'light' ? 'stop' : (J.type === 'priority' && !J.isMain(h)) || J.type === 'roundabout' ? 'yield' : null;
      if (style) {
        const n = style === 'stop' ? 1 : 4;
        for (let k = 0; k < n; k++) {
          const a = l0 + (l1 - l0) * (style === 'stop' ? 0 : k / n), b = style === 'stop' ? l1 : a + (l1 - l0) / n * 0.6;
          const p0x = ex + DX[r] * a, p0z = ez + DY[r] * a, p1x = ex + DX[r] * b, p1z = ez + DY[r] * b;
          const th = style === 'stop' ? 0.03 : 0.022;
          G.rect(Math.min(p0x, p1x) - (DX[side] ? th : 0), Math.min(p0z, p1z) - (DY[side] ? th : 0), Math.max(p0x, p1x) + (DX[side] ? th : 0), Math.max(p0z, p1z) + (DY[side] ? th : 0), Y_MARK, mark);
        }
      }
      // Schildmast an der rechten Ecke
      const sx = cx + DX[side] * 0.56 + DX[r] * 0.46, sz = cz + DY[side] * 0.56 + DY[r] * 0.46;
      // flaches Schild quer zur Zufahrt, dem ankommenden Verkehr zugewandt:
      // pts = Umriss in (seitlich u, Höhe v), n = Abstand vor der Mastebene
      const sign = (pts, c, n) => {
        const P = ([u, v]) => [sx + DX[r] * u - DX[h] * n, v, sz + DY[r] * u - DY[h] * n];
        let mu = 0, mv = 0;
        for (const q of pts) { mu += q[0] / pts.length; mv += q[1] / pts.length; }
        const m = P([mu, mv]);
        for (let k = 0; k < pts.length; k++) {
          const a = P(pts[k]), b = P(pts[(k + 1) % pts.length]);
          G.tri(m, a, b, c); G.tri(m, b, a, c);
        }
      };
      const ngon = (k, rad, v0, rot = 0) => Array.from({ length: k }, (_, q) => [Math.cos(rot + q / k * Math.PI * 2) * rad, v0 + Math.sin(rot + q / k * Math.PI * 2) * rad]);
      if (J.type === 'priority' || J.type === 'roundabout') {
        G.box(sx - 0.012, 0, sz - 0.012, sx + 0.012, 0.3, sz + 0.012, col('#8a8f96'));
        if (J.type === 'roundabout') {
          sign(ngon(14, 0.068, 0.31), col('#1d4ed8'), 0.014);
          sign(ngon(14, 0.046, 0.31), col('#ffffff'), 0.016);
          sign(ngon(14, 0.03, 0.31), col('#1d4ed8'), 0.018);
        } else if (J.isMain(h)) {
          // Vorfahrtstraße: gelbe Raute mit weißem Rand
          sign(ngon(4, 0.078, 0.31), col('#ffffff'), 0.014);
          sign(ngon(4, 0.055, 0.31), col(RCOL.yellow), 0.016);
        } else {
          // Vorfahrt achten: Dreieck mit der Spitze nach unten
          sign([[-0.08, 0.375], [0, 0.235], [0.08, 0.375]], col('#e5484d'), 0.014);
          sign([[-0.045, 0.358], [0, 0.28], [0.045, 0.358]], col('#ffffff'), 0.016);
        }
      } else if (J.type === 'light') {
        G.box(sx - 0.015, 0, sz - 0.015, sx + 0.015, 0.42, sz + 0.015, col('#3a3f46'));
        G.box(sx - 0.05, 0.4, sz - 0.05, sx + 0.05, 0.58, sz + 0.05, col('#2a2e35'));
      }
    }
  }
}
