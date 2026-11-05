// Helligkeit je Land: unverwundbarer Held (ohne Trefferblitz), Level-ups und Truhen automatisch, Bild bei Spielzeit T.
// (Brightness per land at game time T; plan M3 target: mean 55–80, at least 5 % of pixels above 128.)
//   node tools/qa/lum.js [länder=graveyard,ashwood,frostlake,ruins,nightheart] [T=30] [--target=datei.html] [--out=ordner]
// Ausgabe je Land: mittlere Luminanz (wie PIL „L“), Anteil heller Pixel, Darstellungsstufe; PNGs im Ausgabeordner.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const opt = k => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const pos = process.argv.slice(2).filter(a => !a.startsWith('--'));
const LANDS = (pos[0] || 'graveyard,ashwood,frostlake,ruins,nightheart').split(','), T = +(pos[1] || 30);
const TARGET = path.resolve(opt('target') || path.join(ROOT, 'index.html'));
const OUT = path.resolve(opt('out') || path.join(__dirname, 'out', 'lum'));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  let bad = 0;
  for (const st of LANDS) {
    const ctx = await browser.newContext({ viewport: { width: 907, height: 510 }, deviceScaleFactor: 1, locale: 'en-US' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto('file://' + TARGET);
    await page.waitForFunction(() => window.Glutnacht && window.Glutnacht.ready);
    await page.evaluate(s => {
      Store.data.stats.runs = 3; Store.data.stageSel = s;
      Store.data.stages = { graveyard: 3, ashwood: 3, frostlake: 3, ruins: 3, nightheart: 0 };
      UI.startRun('aron');
    }, st);
    await page.waitForFunction(() => Game.state === 'play');
    await page.evaluate(() => { Game.run.stats.maxHp = Game.run.p.hp = 1e9; Game.hurtPlayer = () => {}; });
    for (let i = 0; i < 3000; i++) {
      const t = await page.evaluate(() => {
        const G = Game;
        if (G.state === 'levelup' && UI.cur === 'levelup') { UI.hide(); G.chooseLevel(G.lastLevelOptions[0]); }
        if (G.state === 'chest') { UI.hide(); G.closeChest(); }
        return G.state === 'play' ? G.run.t : -1;
      });
      if (t >= T) break;
      await page.waitForTimeout(100);
    }
    const buf = await page.screenshot({ path: path.join(OUT, 'land-' + st + '.png') });
    const lum = await page.evaluate(async b64 => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let sum = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; sum += L; if (L > 128) b++; }
      return { mean: +(sum / (d.length / 4)).toFixed(1), brightPct: +(b / (d.length / 4) * 100).toFixed(1) };
    }, buf.toString('base64'));
    const info = await page.evaluate(() => ({ t: +Game.run.t.toFixed(0), quality: Render.quality, state: Game.state }));
    const ok = lum.mean >= 55 && lum.mean <= 80 && lum.brightPct >= 5;
    if (!ok) bad++;
    console.log((ok ? 'OK   ' : 'TIEF ') + st.padEnd(11), JSON.stringify({ ...info, ...lum, errors: errs }));
    if (errs.length) bad++;
    await ctx.close();
  }
  await browser.close();
  console.log(bad ? bad + ' Land/Länder außerhalb des Ziels' : 'alle Länder im Ziel');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
