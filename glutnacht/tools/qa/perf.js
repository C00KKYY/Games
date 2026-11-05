// Leistungsprobe: viele Gegner und Partikel, Bildzeiten per requestAnimationFrame.
// (Performance probe: many enemies and particles, frame times via requestAnimationFrame.)
//   node tools/qa/perf.js [cpuDrossel=6] [gegner=300] [--target=datei.html] [--quality=auto|0|1|2] [--stage=graveyard]
//              [--viewport=907x510] [--shot=datei.png] [--weapons=start|all] [--cap=30] [--hostile]
// Ablauf: frisches Profil, SPIELEN, unverwundbarer Held (Startwaffe; --weapons=all: alle acht auf Stufe 8), Gegner auf Ziel-Anzahl halten
// (unsterblich, damit die Zahl stabil bleibt), Partikel per Game.burst auf ~700 halten, dann 6 s messen.
// quality: auto = automatische Rückstufung erlaubt (Standard), 0…5 = Stufe fest (0 = volles Licht).
// cap: Anzeige auf N fps begrenzt (wie Stromsparmodus auf iPhone/Chrome: requestAnimationFrame liefert nur jedes
// zweite Bild). Erwartung: Nach einer kurzen Probe (billige Stufe, dann eine mit kleinerem Canvas) kehrt die
// automatische Stufe zurück nach oben, weil eine niedrigere Stufe hier nichts bringt.
// hostile (M9): zusätzlich immer 120 Gegnergeschosse (Kugeln und Nadeln), 8 Pfützen und 10 Warnzeichen
// (Kreise mit Kohle, Bahnen, Ziellinien) im Bild.
//   z. B. node tools/qa/perf.js 1 40 --cap=30   (wenig Last, nur die Obergrenze)
'use strict';
const { chromium } = require('playwright');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const opt = k => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const pos = process.argv.slice(2).filter(a => !a.startsWith('--'));
const CPU = +(pos[0] || 6), N = +(pos[1] || 300);
const TARGET = path.resolve(opt('target') || path.join(ROOT, 'index.html'));
const Q = opt('quality') || 'auto';
const STAGE = opt('stage') || 'graveyard';
const [VW, VH] = (opt('viewport') || '907x510').split('x').map(Number);
const ALLW = opt('weapons') === 'all';
const CAP = +(opt('cap') || 0);
const HOSTILE = process.argv.includes('--hostile');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, locale: 'en-US' });
  const page = await ctx.newPage();
  const errs = [];
  if (CAP) {
    await page.addInitScript(cap => {
      const raf = window.requestAnimationFrame.bind(window), step = 1000 / cap;
      let next = 0, open = -1; // open: Zeitstempel des zuletzt durchgelassenen Bildes (gilt für alle Rückrufe darin)
      window.requestAnimationFrame = cb => raf(function f(t) {
        if (t !== open) { if (t + 2 < next) return raf(f); open = t; next = Math.max(next + step, t); }
        cb(t);
      });
    }, CAP);
  }
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('file://' + TARGET);
  await page.waitForFunction(() => window.Glutnacht && window.Glutnacht.ready);
  await page.evaluate(({ stage }) => {
    Store.data.stats.runs = 3; // keine Einstiegshilfen
    Store.data.stageSel = stage;
    UI.startRun('aron');
  }, { stage: STAGE });
  await page.waitForFunction(() => Game.state === 'play');
  await page.evaluate(({ n, q, allw, hostile }) => {
    const r = Game.run;
    if (q !== 'auto' && typeof Render.setQuality === 'function') Render.setQuality(+q, true);
    r.stats.maxHp = r.p.hp = 1e9;
    if (allw) {
      for (const id of ['wand', 'whip', 'orbit', 'aura', 'lightning', 'fire', 'nova', 'knives']) if (!r.weapons.some(w => w.id === id) && WEAPONS[id]) Game.addWeapon(id);
      for (const w of r.weapons) { w.level = 8; Game.refreshWeapon(w); }
    }
    r.eliteT = 1e9; r.eventIdx = 1e9;
    Game.director = () => {};
    // Level-ups und Truhen nicht öffnen (sonst steht das Spiel)
    Game.gainXp = () => {};
    r.pendingChests = 0;
    const types = ['bat', 'slime', 'skel', 'ghost', 'ghoul'];
    window.__keep = () => {
      const p = Game.run.p;
      let alive = 0;
      for (const e of Game.run.enemies) if (!e.dead) { alive++; e.hp = e.maxHp = 1e9; }
      for (let i = alive; i < n; i++) {
        const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 380;
        const e = Game.spawnEnemy(types[i % types.length], p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.6);
        if (e) e.hp = e.maxHp = 1e9;
      }
      for (let k = 0; Game.run.parts.length < 690 && k < 60; k++) Game.burst(p.x + (Math.random() - 0.5) * 700, p.y + (Math.random() - 0.5) * 400, '#ffb13b', 12, 200);
      if (window.__hostile) {
        const r = Game.run, hw = Game.view.hw, hh = Game.view.hh;
        while (r.eshots.length < 120) {
          const x = p.x + (Math.random() - 0.5) * 2 * hw, y = p.y + (Math.random() - 0.5) * 2 * hh, a = Math.random() * Math.PI * 2;
          const needle = r.eshots.length % 6 === 0;
          Game.enemyShot(x, y, Math.cos(a), Math.sin(a), needle ? 460 : 140, 0, needle ? 6 : 8, { life: needle ? 1.2 : 3, kind: needle ? 'needle' : 'orb' });
        }
        while (r.haz.length < 8) Game.addHaz({ kind: r.haz.length % 3 ? 'ember' : 'slow', x: p.x + (Math.random() - 0.5) * 1.6 * hw, y: p.y + (Math.random() - 0.5) * 1.6 * hh, rad: 32, life: 2.6, dmg: 0 });
        const n = { circle: 0, lane: 0, aim: 0 };
        for (const t of r.tele) n[t.kind] = (n[t.kind] || 0) + 1;
        while (n.circle < 5) { r.tele.push({ kind: 'circle', x: p.x + (Math.random() - 0.5) * hw, y: p.y + (Math.random() - 0.5) * hh, rad: 40, t: 0, life: 1.1, dmg: 0, src: 'mortar', small: true, coal: { sx: p.x + hw * 0.6, sy: p.y - hh * 0.5 } }); n.circle++; }
        while (n.lane < 2) { r.tele.push({ kind: 'lane', x: p.x - hw, y: p.y + (Math.random() - 0.5) * hh, a: Math.random() * 0.4, len: 1000, w: 44, t: 0, life: 1.1, dmg: 0 }); n.lane++; }
        while (n.aim < 3) { r.tele.push({ kind: 'aim', x: p.x + hw * 0.7, y: p.y + (Math.random() - 0.5) * hh, a: Math.PI + Math.random() - 0.5, len: 700, lockAt: 0.6, t: Math.random() * 0.9, life: 0.9 }); n.aim++; }
      }
    };
    window.__hostile = hostile;
    window.__keepT = setInterval(window.__keep, 50);
    // Zeitanteile: Spiellogik vs. Zeichnen
    const prof = window.__prof = { upd: 0, draw: 0, hud: 0 };
    const gu = Game.update.bind(Game), rd = Render.draw.bind(Render);
    Game.update = dt => { const t = performance.now(); gu(dt); prof.upd += performance.now() - t; };
    Render.draw = dt => { const t = performance.now(); rd(dt); prof.draw += performance.now() - t; };
    window.__keep();
  }, { n: N, q: Q, allw: ALLW, hostile: HOSTILE });
  if (CPU > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU }); }
  // Einschwingen (auch: automatische Rückstufung bekommt Zeit)
  await page.waitForTimeout(Q === 'auto' ? 9000 : 4000);
  await page.evaluate(() => { window.__prof.upd = window.__prof.draw = 0; });
  const res = await page.evaluate(() => new Promise(res => {
    const t = []; let last = performance.now(); const t0 = last;
    const f = now => {
      t.push(now - last); last = now;
      if (now - t0 < 6000) requestAnimationFrame(f);
      else {
        const s = t.slice().sort((a, b) => a - b), q = k => s[Math.min(s.length - 1, Math.floor(s.length * k))];
        const r = Game.run;
        let onScreen = 0;
        for (const e of r.enemies) if (!e.dead && Render.inView(e.x, e.y, 0)) onScreen++;
        const P = window.__prof, nf = t.length;
        res({ eshots: r.eshots.length, haz: r.haz.length, tele: r.tele.length, qLog: (Render.perf && Render.perf.log || []).slice(-12).join(' '), canvasW: Render.cv.width, updMs: +(P.upd / nf).toFixed(1), drawMs: +(P.draw / nf).toFixed(1), frames: t.length, fps: +(t.length / ((now - t0) / 1000)).toFixed(1), medMs: +q(0.5).toFixed(1), p95Ms: +q(0.95).toFixed(1), maxMs: +s[s.length - 1].toFixed(1),
          enemies: r.enemies.length, onScreen, parts: r.parts.length, quality: Render.quality, state: Game.state });
      }
    };
    requestAnimationFrame(f);
  }));
  const shot = opt('shot');
  if (shot) await page.screenshot({ path: path.resolve(shot) });
  console.log(JSON.stringify({ cpu: CPU, cap: CAP || undefined, hostile: HOSTILE || undefined, target: path.relative(ROOT, TARGET), quality: Q, weapons: ALLW ? 'all' : 'start', viewport: VW + 'x' + VH, ...res, errors: errs }));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
