// Grafik-Spike (Plan M5): feste, wiederholbare Szenen für den Vergleich der Grafikstile A und B.
// (Art spike: deterministic scenes so that spike A and spike B screenshots are directly comparable.)
//
//   node tools/qa/spike.js [--name=B] [--out=/tmp/claude-0/overhaul/spikes/B] [--target=index.html] [--base=<git-ref>]
//   node tools/qa/spike.js --compare=A,B [--root=/tmp/claude-0/overhaul/spikes] [--to=bild.png]   (Vergleichsbild nebeneinander)
//
// Ablauf: Math.random wird vor dem Laden fest gesät, das Spiel startet normal (Friedhof, Aron), dann wird die
// Spiellogik angehalten (Game.update leer) und die Szene von Hand aufgebaut: ~20 Gegner, 1 Elite, 6 Edelsteine,
// 1 Truhe, 2 Kohlebecken, Magiegeschosse, Hieb, Schutzkugeln, Schadenszahlen, HUD. Render.draw läuft mit fester
// Zeit und dt = 0 (eingefrorenes Bild), Darstellungsstufe fest auf 0.
//
// Bilder (in --out): spike-X-907-play.png, spike-X-iphone-land.png, spike-X-boss.png, spike-X-lands.png (5 Ausschnitte
// 400×300), spike-X-menu.png, spike-X-levelup.png, spike-X-gray.png; dazu spike-X-metrics.json.
// Messwerte: mittlere Luminanz (wie PIL „L“) und Anteil Pixel > 128 je Bild, Heldenhöhe in Bildschirmpixeln bei 907
// (sichtbare Figur, Alpha-Umriss des Sprites × Zeichenmaßstab × Zoom), zusätzliche base64-Größe in assets/ gegenüber --base.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const opt = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const NAME = opt('name', 'B');
const OUT = path.resolve(opt('out', '/tmp/claude-0/overhaul/spikes/' + NAME));
const TARGET = path.resolve(opt('target', path.join(ROOT, 'index.html')));
const BASE = opt('base', '479bfa2');
const SEED = 20261105;
const FIXED_T = 12.34; // feste Render-Zeit (Flackern, Schwingen)

// ---------- Szene im Browser ----------
// Läuft im Seitenkontext (Zugriff auf die globalen Spielobjekte)
function pageSetup() {
  window.__spike = {
    freeze(T) {
      if (Render.__od) return;
      const od = Render.draw;
      Render.__od = od;
      Render.draw = function () { this.time = T; this.shake = 0; this.flash = 0; return od.call(this, 0); };
    },
    unfreeze() { if (Render.__od) { Render.draw = Render.__od; Render.__od = null; } },
    // Lauf starten, Logik anhalten, Grundzustand
    start(stageId) {
      const d = Store.data;
      d.stats.runs = 5; d.stageSel = stageId || 'graveyard';
      d.storySeen = { premise: true, graveyard: true, ashwood: true, frostlake: true, ruins: true, nightheart: true };
      d.stages = { graveyard: 3, ashwood: 3, frostlake: 3, ruins: 3, nightheart: 0 };
      d.settings.dmgNums = true;
      UI.startRun('aron');
      Game.update = () => {};
      Render.setQuality(0, true);
      clearTimeout(UI.bannerT); UI.el.banner.className = ''; UI.el.toasts.innerHTML = '';
      const r = Game.run;
      r.t = 30; r.level = 7; r.xp = Math.round(r.xpNext * 0.62); r.kills = 143; r.gold = 37;
      r.enemies.length = 0; r.gems.length = 0; r.pickups.length = 0; r.shots.length = 0; r.fx.length = 0;
      r.parts.length = 0; r.texts.length = 0; r.tele.length = 0; r.eshots.length = 0;
      r.props.clear(); r.propList.length = 0;
      Render.corpses.length = 0; Render.vfx.length = 0; Render.lvlFx = null;
      const p = r.p; p.x = 0; p.y = 0; p.face = 1; p.moving = true; p.walk = 0.6; p.iframe = 0; p.flash = 0;
      p.hp = r.stats.maxHp * 0.82;
      return r;
    },
    enemy(type, x, y, anim, opts) {
      const e = Game.spawnEnemy(type, x, y);
      e.anim = anim || 0;
      if (opts && opts.elite) { e.elite = true; e.r *= 1.55; e.hp = e.maxHp * 0.7; }
      return e;
    },
    play() {
      const S = this, r = S.start('graveyard'), p = r.p;
      // Waffen: Hieb (Start), Magiegeschoss, Schutzkugeln; Passive
      Game.applyOption({ kind: 'weapon', id: 'whip' }); Game.applyOption({ kind: 'weapon', id: 'whip' });
      Game.applyOption({ kind: 'weapon', id: 'wand' }); Game.applyOption({ kind: 'weapon', id: 'wand' });
      Game.applyOption({ kind: 'weapon', id: 'orbit' });
      Game.applyOption({ kind: 'passive', id: 'might' }); Game.applyOption({ kind: 'passive', id: 'heart' }); Game.applyOption({ kind: 'passive', id: 'heart' });
      p.hp = r.stats.maxHp * 0.82;
      const E = [
        ['bat', -262, -150, 0.1], ['bat', -205, -196, 0.3], ['bat', 300, -172, 0.05], ['bat', -340, 58, 0.25],
        ['slime', 182, 112, 0], ['slime', 246, 160, 0.2], ['slime', -152, 158, 0.1],
        ['skel', 152, -58, 0], ['skel', -176, -20, 0.2], ['skel', 336, 40, 0.1], ['skel', -92, 196, 0.25],
        ['ghost', -286, -10, 0], ['ghost', 52, -196, 0.2], ['ghost', 410, -86, 0.1],
        ['ghoul', 118, 206, 0], ['ghoul', -390, 170, 0.2], ['ghoul', 262, -60, 0.1],
        ['bat', 420, 120, 0.15], ['slime', -420, -60, 0.05],
      ];
      for (const [t, x, y, a] of E) S.enemy(t, x, y, a);
      S.enemy('ghoul', -196, -112, 0.1, { elite: true });
      // Edelsteine gemischter Stufen (Aufploppen schon vorbei)
      for (const [x, y, v] of [[-58, 92, 1], [-26, 122, 2], [84, 62, 5], [-124, 84, 8], [40, 142, 20], [-210, 108, 80]]) r.gems.push({ x, y, v, mag: false, sp: 0, bob: x * 0.1, _b: -10 });
      r.pickups.push({ x: 206, y: -150, kind: 'chest', v: 0, mag: false, sp: 0, bob: 1 });
      // Kohlebecken
      for (const [x, y] of [[-330, -200], [402, 196]]) { const pr = { key: x + ',' + y, x, y, r: 14 }; r.props.set(pr.key, pr); r.propList.push(pr); }
      // Magiegeschosse auf Gegner zu
      for (const [x, y, tx, ty] of [[66, -24, 152, -58], [-104, -12, -176, -20], [32, -112, 52, -196]]) {
        const a = Math.atan2(ty - y, tx - x);
        r.shots.push({ kind: 'bolt', x, y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, r: 7, dmg: 1, pierce: 1, life: 1, t: 0.2, hit: [], wid: 'wand', color: '#b48cff', evo: false });
      }
      // Hieb nach rechts, Schutzkugeln
      r.fx.push({ kind: 'slash', x: 0, y: 0, a: -0.18, rad: 112 * r.stats.area, t: 0.06, life: 0.22, evo: false });
      const ow = r.weapons.find(w => w.id === 'orbit');
      ow.active = 1; ow.orbs = [];
      for (let i = 0; i < 3; i++) { const a = 0.9 + i / 3 * Math.PI * 2; ow.orbs.push(Math.cos(a) * 92, Math.sin(a) * 92); }
      // Schadenszahlen und Funken
      for (const [x, y, txt, col, sc, t] of [[150, -86, 14, '#ffffff', 1, 0.2], [-176, -48, 12, '#ffffff', 1, 0.3], [266, -96, 31, '#ffd34f', 1.6, 0.15], [44, -222, 9, '#ffffff', 1, 0.25], [-150, -96, 22, '#ffffff', 1, 0.1]]) r.texts.push({ x, y, txt: String(txt), color: col, scale: sc, t });
      const rnd = mulberry(7);
      for (const [x, y, col] of [[150, -58, '#e8e2cf'], [-176, -20, '#e8e2cf'], [262, -60, '#9dff4f']]) {
        for (let i = 0; i < 9; i++) { const a = rnd() * 6.28, v = 30 + rnd() * 50; r.parts.push({ x: x + Math.cos(a) * v * 0.4, y: y + Math.sin(a) * v * 0.4, vx: 0, vy: 0, life: 0.2 + rnd() * 0.3, max: 0.5, size: 2 + rnd() * 3, color: col }); }
      }
      this.freeze(window.__FIXED_T);
    },
    boss() {
      const S = this, r = S.start('graveyard'), p = r.p;
      Game.applyOption({ kind: 'weapon', id: 'aura' }); Game.applyOption({ kind: 'weapon', id: 'aura' });
      Game.applyOption({ kind: 'weapon', id: 'wand' });
      r.t = 362;
      const def = STAGES[0].bosses.find(b => b.id === 'bonelord');
      const pos = Game.spawnPos; Game.spawnPos = () => ({ x: 210, y: -40 });
      const b = Game.spawnBoss(def, 1);
      Game.spawnPos = pos;
      b.anim = 0.1; b.hp = b.maxHp * 0.64;
      clearTimeout(UI.bannerT); UI.el.banner.className = '';
      r.tele.push({ kind: 'circle', x: 36, y: 46, rad: 100, t: 0.55, life: 1.05, dmg: 1 });
      for (const [x, y, a] of [[90, -150, 0], [330, 90, 0.2], [-160, -90, 0.1], [-220, 120, 0.3], [380, -140, 0.15], [-40, 200, 0.05]]) S.enemy('skel', x, y, a);
      for (const [x, y, a] of [[-330, -160, 0], [-300, 40, 0.2]]) S.enemy('bat', x, y, a);
      const aw = r.weapons.find(w => w.id === 'aura'); aw.rad = 82 * r.stats.area; aw.pulse = 0.3;
      for (const [x, y, v] of [[-80, 70, 2], [-130, 30, 5], [60, 150, 20]]) r.gems.push({ x, y, v, mag: false, sp: 0, bob: x, _b: -10 });
      r.texts.push({ x: 196, y: -98, txt: '47', color: '#ffd34f', scale: 1.6, t: 0.15 }, { x: 236, y: -70, txt: '18', color: '#ffffff', scale: 1, t: 0.3 });
      r.shots.push({ kind: 'bolt', x: 120, y: -22, vx: 400, vy: -40, r: 7, dmg: 1, pierce: 1, life: 1, t: 0.2, hit: [], wid: 'wand', color: '#b48cff', evo: false });
      UI.el.bossbar.hidden = false;
      this.freeze(window.__FIXED_T);
    },
    // Land-Ausschnitt: Held auf einer Stelle mit viel Deko (Deko liegt per Hash in 150er-Zellen)
    land(id) {
      const S = this;
      this.unfreeze();
      const r = S.start(id);
      const st = STAGES.find(s => s.id === id);
      r.stage = st; Render.setStage(st);
      let best = null;
      for (let cx = -30; cx <= 30; cx++) for (let cy = -30; cy <= 30; cy++) {
        let n = 0;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) if (hash2(cx + i, cy + j, 3) <= 0.2) n++;
        if (!best || n > best.n) best = { n, cx, cy };
      }
      const p = r.p; p.x = (best.cx + 1.5) * 150; p.y = (best.cy + 1.0) * 150 + 10; p.moving = false;
      const pr = { key: 'b', x: p.x + 150, y: p.y - 70, r: 14 }; r.props.set(pr.key, pr); r.propList.push(pr);
      const pool = Object.keys((st.waves && st.waves[0] && st.waves[0].pool) || { bat: 1, slime: 1 });
      S.enemy(pool[0], p.x - 150, p.y + 40, 0.1); S.enemy(pool[1] || pool[0], p.x + 120, p.y + 70, 0.2);
      UI.el.hud.hidden = true;
      this.freeze(window.__FIXED_T);
      return best.n;
    },
    levelup() {
      this.play();
      const opts = [
        { kind: 'weapon', id: 'lightning', level: 1, isNew: true },
        { kind: 'weapon', id: 'whip', level: 4 },
        { kind: 'passive', id: 'hourglass', level: 1, isNew: true },
        { kind: 'passive', id: 'heart', level: 3 },
      ];
      Game.state = 'levelup';
      Game.lastLevelOptions = opts;
      UI.levelUp(opts);
    },
    // Heldenhöhe: sichtbarer Alpha-Umriss des Sprites in Bildschirmpixeln (CSS)
    heroHeight() {
      const ch = CHARS[Game.run ? Game.run.char : 'aron'];
      const spr = Sprites.player(ch.color, 0, false);
      const g = spr.getContext('2d'), d = g.getImageData(0, 0, spr.width, spr.height).data;
      let y0 = -1, y1 = -1;
      for (let y = 0; y < spr.height; y++) {
        for (let x = 0; x < spr.width; x++) if (d[(y * spr.width + x) * 4 + 3] > 40) { if (y0 < 0) y0 = y; y1 = y; break; }
      }
      const SC = spr.width / spr.size;
      return +((y1 - y0 + 1) / SC * PLAYER_DRAW_SCALE * Render.zoom).toFixed(1);
    },
    async lum(b64) {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let sum = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; sum += L; if (L > 128) b++; }
      return { mean: +(sum / (d.length / 4)).toFixed(1), brightPct: +(b / (d.length / 4) * 100).toFixed(1) };
    },
    async gray(b64) {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.filter = 'grayscale(1)'; g.drawImage(img, 0, 0);
      return c.toDataURL('image/png').split(',')[1];
    },
    // Bilder (base64) zu einem Streifen bzw. Raster zusammensetzen, mit Beschriftung
    async compose(list, cols, labels, cellW, cellH, pad, title) {
      const imgs = await Promise.all(list.map(async b => { const im = new Image(); im.src = 'data:image/png;base64,' + b; await im.decode(); return im; }));
      const rows = Math.ceil(imgs.length / cols), top = title ? 40 : 0;
      const c = document.createElement('canvas');
      c.width = cols * cellW + (cols + 1) * pad; c.height = top + rows * (cellH + 26) + (rows + 1) * pad;
      const g = c.getContext('2d');
      g.fillStyle = '#0b0714'; g.fillRect(0, 0, c.width, c.height);
      g.font = '20px "Lilita One", sans-serif'; g.fillStyle = '#ffd39a'; g.textBaseline = 'top';
      if (title) g.fillText(title, pad, 10);
      imgs.forEach((im, i) => {
        const x = pad + (i % cols) * (cellW + pad), y = top + pad + Math.floor(i / cols) * (cellH + 26 + pad);
        g.fillStyle = '#e8e0ff'; g.font = '16px "Lilita One", sans-serif'; g.fillText(labels[i] || '', x, y);
        const k = Math.min(cellW / im.width, cellH / im.height);
        g.drawImage(im, x, y + 24, im.width * k, im.height * k);
      });
      return c.toDataURL('image/png').split(',')[1];
    },
  };
}

async function newPage(browser, w, h, extra) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'en-US' }, extra || {}));
  await ctx.addInitScript(([seed, T]) => {
    // fester Zufall ab dem ersten Skript
    let a = seed >>> 0;
    Math.random = function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    window.__FIXED_T = T;
    try { localStorage.clear(); } catch (e) {}
  }, [SEED, FIXED_T]);
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') page.errs.push(m.text()); });
  await page.goto('file://' + TARGET + '?muteAudio=true');
  await page.waitForFunction(() => window.Glutnacht && window.Glutnacht.ready);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(pageSetup);
  return { ctx, page };
}

const b64 = buf => buf.toString('base64');
const settle = page => page.waitForTimeout(250);

function assetDelta() {
  // Zusätzliche base64-Größe: assets/*.js jetzt gegenüber --base
  const dir = path.join(ROOT, 'assets');
  let now = 0, before = 0;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  for (const f of files) {
    now += fs.statSync(path.join(dir, f)).size;
    try { before += +execSync('git cat-file -s ' + BASE + ':glutnacht/assets/' + f, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { /* neu */ }
  }
  let code = 0;
  for (const f of ['js/sprites.js', 'js/render.js', 'js/fx.js']) {
    let b = 0;
    try { b = +execSync('git cat-file -s ' + BASE + ':glutnacht/' + f, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) {}
    code += fs.statSync(path.join(ROOT, f)).size - b;
  }
  return { assetsBytesAdded: now - before, codeBytesAdded: code };
}

async function compare() {
  const names = opt('compare').split(',');
  const root = opt('root', '/tmp/claude-0/overhaul/spikes');
  const shots = ['907-play', 'iphone-land', 'boss', 'lands', 'menu', 'levelup', 'gray'];
  const browser = await chromium.launch();
  const { ctx, page } = await newPage(browser, 800, 600);
  const list = [], labels = [];
  for (const s of shots) for (const n of names) {
    const f = path.join(root, n, 'spike-' + n + '-' + s + '.png');
    if (!fs.existsSync(f)) continue;
    list.push(b64(fs.readFileSync(f))); labels.push(n + ': ' + s);
  }
  const out = await page.evaluate(([l, c, lb]) => __spike.compose(l, c, lb, 907, 510, 16, 'Ember Night – Grafik-Spikes ' + c), [list, names.length, labels]);
  const file = path.resolve(opt('to', path.join(root, 'compare-' + names.join('-') + '.png')));
  fs.writeFileSync(file, Buffer.from(out, 'base64'));
  console.log('Vergleichsbild:', file);
  await ctx.close(); await browser.close();
}

(async () => {
  if (opt('compare')) return compare();
  fs.mkdirSync(OUT, { recursive: true });
  const P = n => path.join(OUT, 'spike-' + NAME + '-' + n + '.png');
  const browser = await chromium.launch();
  const metrics = { name: NAME, target: TARGET, seed: SEED, shots: {} };
  const errors = [];
  const meas = async (page, key, buf) => { metrics.shots[key] = await page.evaluate(b => __spike.lum(b), b64(buf)); };

  // 5. Titelbild (frisches Profil, erster Besuch)
  {
    const { ctx, page } = await newPage(browser, 907, 510);
    await page.waitForFunction(() => Render.keyArtA >= 1, null, { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => __spike.freeze(window.__FIXED_T));
    await page.waitForTimeout(600); // Einblend-Animationen der Oberfläche
    const buf = await page.screenshot({ path: P('menu') });
    await meas(page, 'menu', buf);
    errors.push(...page.errs); await ctx.close();
  }
  // 1. + 7. Spielszene 907×510, Graustufen
  let playBuf;
  {
    const { ctx, page } = await newPage(browser, 907, 510);
    await page.evaluate(() => __spike.play());
    await settle(page);
    playBuf = await page.screenshot({ path: P('907-play') });
    await meas(page, '907-play', playBuf);
    metrics.heroHeight907 = await page.evaluate(() => __spike.heroHeight());
    metrics.zoom907 = await page.evaluate(() => Render.zoom);
    const g = await page.evaluate(b => __spike.gray(b), b64(playBuf));
    fs.writeFileSync(P('gray'), Buffer.from(g, 'base64'));
    metrics.shots.gray = await page.evaluate(b => __spike.lum(b), g);
    // 6. Level-up-Karten
    await page.evaluate(() => { __spike.unfreeze(); __spike.levelup(); });
    await page.waitForTimeout(900);
    const lb = await page.screenshot({ path: P('levelup') });
    await meas(page, 'levelup', lb);
    errors.push(...page.errs); await ctx.close();
  }
  // 2. dieselbe Szene auf dem iPhone quer (844×390)
  {
    const { ctx, page } = await newPage(browser, 844, 390, { isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    await page.evaluate(() => __spike.play());
    await settle(page);
    const buf = await page.screenshot({ path: P('iphone-land') });
    await meas(page, 'iphone-land', buf);
    metrics.heroHeightIphone = await page.evaluate(() => __spike.heroHeight());
    errors.push(...page.errs); await ctx.close();
  }
  // 3. Boss mit Warnkreis und Glutaura
  {
    const { ctx, page } = await newPage(browser, 907, 510);
    await page.evaluate(() => __spike.boss());
    await settle(page);
    const buf = await page.screenshot({ path: P('boss') });
    await meas(page, 'boss', buf);
    errors.push(...page.errs); await ctx.close();
  }
  // 4. Böden und Deko aller 5 Länder (je 400×300 aus der Bildmitte)
  {
    const { ctx, page } = await newPage(browser, 907, 510);
    const crops = [], labels = [];
    metrics.lands = {};
    for (const id of ['graveyard', 'ashwood', 'frostlake', 'ruins', 'nightheart']) {
      const n = await page.evaluate(id => __spike.land(id), id);
      await settle(page);
      const buf = await page.screenshot({ clip: { x: 253, y: 105, width: 400, height: 300 } });
      crops.push(b64(buf)); labels.push(id);
      metrics.lands[id] = Object.assign({ decoCells: n }, await page.evaluate(b => __spike.lum(b), b64(buf)));
    }
    const out = await page.evaluate(([l, lb, nm]) => __spike.compose(l, 3, lb, 400, 300, 12, 'Spike ' + nm + ': Boden und Deko der 5 Länder'), [crops, labels, NAME]);
    fs.writeFileSync(P('lands'), Buffer.from(out, 'base64'));
    errors.push(...page.errs); await ctx.close();
  }
  await browser.close();
  Object.assign(metrics, assetDelta());
  metrics.errors = errors;
  fs.writeFileSync(path.join(OUT, 'spike-' + NAME + '-metrics.json'), JSON.stringify(metrics, null, 2));
  for (const [k, v] of Object.entries(metrics.shots)) console.log(k.padEnd(12), 'Luminanz', String(v.mean).padStart(5), ' hell', v.brightPct + ' %');
  console.log('Held (sichtbar) bei 907:', metrics.heroHeight907, 'px (Zoom ' + metrics.zoom907 + '), iPhone quer:', metrics.heroHeightIphone, 'px');
  console.log('zusätzlich base64 in assets/:', metrics.assetsBytesAdded, 'Bytes; Code (sprites/render/fx):', metrics.codeBytesAdded, 'Bytes');
  console.log('Bilder:', OUT);
  console.log(errors.length ? 'Fehler:\n' + errors.join('\n') : 'keine Fehler');
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
