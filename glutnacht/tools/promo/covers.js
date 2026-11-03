// Rendert die drei Titelbilder für das Portal: 1920x1080, 800x1200, 800x800 (PNG).
//   node tools/promo/covers.js  -> dist/promo/cover-landscape.png, cover-portrait.png, cover-square.png
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'dist', 'promo');
const SIZES = { landscape: [960, 540], portrait: [400, 600], square: [400, 400] };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const [layout, [w, h]] of Object.entries(SIZES)) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, locale: 'en-US' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await page.goto('file://' + path.join(ROOT, 'index.html'));
    await page.waitForFunction(() => window.Glutnacht && document.fonts.status === 'loaded');
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'director.js'), 'utf8') + '\nwindow.Promo = Promo;' });
    await page.evaluate(l => { Promo.init({}); Promo.cover(l); }, layout);
    const file = path.join(OUT, 'cover-' + layout + '.png');
    await page.screenshot({ path: file });
    if (errors.length) console.log(layout, 'Fehler:', errors);
    console.log(file);
    await page.close();
  }
  await browser.close();
})();
