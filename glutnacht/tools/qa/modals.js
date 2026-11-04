// Bildschirmfotos der Dialoge im Ruhezustand, Kapitel-Banner und deutsche Browsersprache.
// (Screenshots of modals in their settled state + chapter banner + German locale.)
//   node tools/qa/modals.js [--target=datei.html] [--out=ordner]
'use strict';
const { chromium, devices } = require('playwright');
const path = require('path');
const opt = k => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const URL = 'file://' + path.resolve(opt('target') || path.join(__dirname, '..', '..', 'index.html'));
const OUT = path.resolve(opt('out') || path.join(__dirname, 'out')) + '/modals/';
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  for (const [name, opt] of [['d907', { viewport: { width: 907, height: 510 } }], ['iphone-land', devices['iPhone 13 landscape']], ['iphone-port', devices['iPhone 13']]]) {
    const ctx = await browser.newContext({ ...opt, locale: 'en-US' });
    const page = await ctx.newPage();
    await page.goto(URL);
    await page.waitForSelector('[data-act="play"]');
    await page.click('[data-act="play"]', { force: true });
    await page.waitForTimeout(400);
    if (name === 'iphone-land') {
      const m = await page.evaluate(() => { const s = document.getElementById('screen'); const b = document.querySelector('[data-act="storyok"]').getBoundingClientRect(); return { scrollH: s.scrollHeight, clientH: s.clientHeight, btnBottom: b.bottom, vh: innerHeight }; });
      console.log('story modal iphone-land', JSON.stringify(m));
    }
    await page.click('[data-act="storyok"]', { force: true });
    await page.waitForTimeout(350);
    await page.screenshot({ path: OUT + name + '-chapter-banner.png' });
    // force a level-up and a chest
    await page.evaluate(() => { Game.gainXp(Game.run.xpNext); });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: OUT + name + '-levelup-settled.png' });
    const lv = await page.evaluate(() => ({ cur: UI.cur, cards: [...document.querySelectorAll('.card')].map(c => { const b = c.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; }), scroll: [document.getElementById('screen').scrollHeight, innerHeight] }));
    console.log(name, 'levelup', JSON.stringify(lv));
    await page.keyboard.press('Digit1');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await page.screenshot({ path: OUT + name + '-pause.png' });
    await ctx.close();
  }
  const ctx = await browser.newContext({ viewport: { width: 907, height: 510 }, locale: 'de-DE' });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForSelector('[data-act="play"]');
  await page.waitForTimeout(300);
  console.log('de-DE browser locale ->', await page.evaluate(() => LANG));
  await page.screenshot({ path: OUT + 'd907-de-menu.png' });
  await browser.close();
})();
