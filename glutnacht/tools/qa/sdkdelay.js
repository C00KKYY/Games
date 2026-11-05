// Start mit einem gefälschten CrazyGames-SDK v3: langsames Skript, langsames oder hängendes init(),
// Sprache aus dem SDK, später Wechsel des Speicherorts (Cloud-Spielstand).
// (Boot with a fake CrazyGames SDK v3 served at the real SDK URL; checks splash, menu time,
//  loadingStart/Stop, SDK locale and the late save attach.)
//
//   node tools/qa/sdkdelay.js [--target=crazygames.html] [--out=ordner] [--only=T,A,B]
//
// Ohne --target wird der CrazyGames-Build frisch nach <out>/sdk-delay/cg-index.html gebaut.
// Die Seite wird über Playwright-Routen unter http://game.test/ ausgeliefert, das SDK unter seiner
// echten Adresse abgefangen. Es wird nichts aus dem Netz geladen.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const opt = k => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const OUT = path.join(path.resolve(opt('out') || path.join(__dirname, 'out')), 'sdk-delay');
fs.mkdirSync(OUT, { recursive: true });
let TARGET = opt('target');
if (!TARGET) {
  TARGET = path.join(OUT, 'cg-index.html');
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build-single.js'), TARGET, '--crazygames'], { stdio: 'inherit' });
}
const HTML = fs.readFileSync(TARGET, 'utf8');
const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
const SAVE_KEY = 'glutnacht.v1';

// Spielstand für die Tests: Gold und Spielzeit als Erkennungszeichen
const save = (gold, playTime, lang) => JSON.stringify({
  gold, saveVersion: 3, shop: {}, shopSpent: 0, giftGiven: true, chars: ['aron', 'mira'], achievements: {}, evolved: {},
  stats: { kills: 10, runs: 1, bestTime: 60, bestLevel: 3, bestKills: 10, wins: 0, evolutions: 0, bossKills: 0, chests: 0, goldEarned: gold, playTime },
  bosses: {}, stages: {}, stageSel: 'graveyard', stageHeat: {}, storySeen: { graveyard: true, premise: true }, lastChar: 'aron',
  settings: { sfx: true, music: true, dmgNums: true, shake: true, lang: lang || null },
});

// Gefälschtes SDK. initMs < 0: init() kommt nie zurück.
const stub = c => `(function(){
window.__sdkLog = window.__sdkLog || [];
const L = m => window.__sdkLog.push([Math.round(performance.now()), m]);
const remote = ${JSON.stringify(c.remote || null)};
window.CrazyGames = { SDK: {
  environment: 'crazygames',
  init() { L('init called'); return ${c.initMs < 0 ? 'new Promise(() => {})' : `new Promise(r => setTimeout(() => { L('init resolved'); r(); }, ${c.initMs}))`}; },
  game: { settings: { muteAudio: false }, addSettingsChangeListener() {},
    loadingStart() { L('loadingStart'); }, loadingStop() { L('loadingStop'); },
    gameplayStart() { L('gameplayStart'); }, gameplayStop() { L('gameplayStop'); }, happytime() {} },
  user: { systemInfo: { locale: ${JSON.stringify(c.locale || 'en-US')}, countryCode: 'XX', device: { type: 'desktop' }, applicationType: 'web' } },
  data: { _m: remote ? { '${SAVE_KEY}': remote } : {}, getItem(k) { return k in this._m ? this._m[k] : null; }, setItem(k, v) { L('data.setItem'); this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } },
} };
L('sdk script executed');
})();`;

const VARIANTS = {
  T: { desc: 'SDK schnell (Skript 100 ms, init 300 ms)', dl: 100, initMs: 300, strip: true },
  A: { desc: 'init 3 s', dl: 50, initMs: 3000, strip: true },
  B: { desc: 'Skript 1,5 s + init 3 s', dl: 1500, initMs: 3000, strip: true },
  C: { desc: 'init kommt nie zurück', dl: 50, initMs: -1, strip: true },
  N: { desc: 'SDK-Skript kommt nie an', dl: -1, initMs: 0, strip: true },
  LDE: { desc: 'Browser en-US, SDK de-DE', dl: 50, initMs: 200, locale: 'de-DE', browser: 'en-US', expectLang: 'de' },
  LEN: { desc: 'Browser de-DE, SDK en-US', dl: 50, initMs: 200, locale: 'en-US', browser: 'de-DE', expectLang: 'en' },
  LSAVE: { desc: 'SDK de-DE, gespeichert en', dl: 50, initMs: 200, locale: 'de-DE', remote: save(10, 100, 'en'), expectLang: 'en' },
  LATEMENU: { desc: 'SDK spät (4 s) im Menü: Cloud-Stand übernehmen', dl: 50, initMs: 4000, remote: save(777, 500) },
  LATERUN: { desc: 'SDK spät (4 s) im Lauf: erst im Menü übernehmen', dl: 50, initMs: 4000, remote: save(777, 500), run: true },
  LATELOCAL: { desc: 'SDK spät, lokaler Stand reicher: lokal gewinnt', dl: 50, initMs: 4000, remote: save(777, 500), local: save(555, 9999) },
};
const only = opt('only') ? opt('only').split(',') : null;
const SHOTS = [100, 200, 300, 500, 800, 1200, 1600, 2000, 2500, 3000, 4000, 5000];

(async () => {
  const browser = await chromium.launch();
  // Hilfsseite zum Auswerten der Bildschirmfotos (mittlere Helligkeit und Streuung)
  const helper = await browser.newPage();
  const stats = async buf => helper.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = 160; c.height = 90;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, 160, 90);
    const d = g.getImageData(0, 0, 160, 90).data; let s = 0, s2 = 0; const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; s += l; s2 += l * l; }
    const m = s / n; return { mean: +m.toFixed(1), std: +Math.sqrt(Math.max(0, s2 / n - m * m)).toFixed(1) };
  }, buf.toString('base64'));

  const res = {};
  for (const [v, c] of Object.entries(VARIANTS)) {
    if (only && !only.includes(v)) continue;
    const ctx = await browser.newContext({ viewport: { width: 907, height: 510 }, locale: c.browser || 'en-US' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.route('http://game.test/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HTML }));
    await page.route(SDK_URL, async route => {
      if (c.dl < 0) return; // hängt für immer
      await new Promise(r => setTimeout(r, c.dl));
      try { await route.fulfill({ status: 200, contentType: 'application/javascript', body: stub(c) }); } catch (e) { /* Seite schon zu */ }
    });
    await page.addInitScript(local => {
      if (local) { try { localStorage.setItem('glutnacht.v1', local); } catch (e) { /* egal */ } }
      window.__m = {};
      const mark = k => { if (!(k in window.__m)) window.__m[k] = Math.round(performance.now()); };
      new PerformanceObserver(l => { for (const e of l.getEntries()) mark(e.name); }).observe({ type: 'paint', buffered: true });
      document.addEventListener('DOMContentLoaded', () => mark('domContentLoaded'));
      const iv = setInterval(() => {
        if (document.querySelector('#screen [data-act="play"]')) mark('menuInDom');
        if (window.Glutnacht && window.Glutnacht.ready !== false) { mark('glutnachtReady'); clearInterval(iv); }
      }, 10);
      // Ton frei (nicht mehr stumm): erst, wenn das SDK seine Stummschaltung gemeldet hat
      const ia = setInterval(() => { if (typeof Sfx !== 'undefined' && !Sfx.muted) { mark('audioOpen'); clearInterval(ia); } }, 10);
    }, c.local || null);
    const t0 = Date.now();
    await page.goto('http://game.test/index.html', { waitUntil: 'commit' });
    const strip = [];
    if (c.strip) {
      for (const t of SHOTS) {
        const wait = t - (Date.now() - t0);
        if (wait > 0) await page.waitForTimeout(wait);
        const at = Date.now() - t0;
        try {
          const buf = await page.screenshot({ timeout: 2000 });
          const f = v + '-' + String(t).padStart(4, '0') + 'ms.png';
          fs.writeFileSync(path.join(OUT, f), buf);
          strip.push({ t, at, file: f, ...(await stats(buf)), menu: await page.evaluate(() => !!document.querySelector('#screen [data-act="play"]')) });
        } catch (e) { strip.push({ t, at, error: e.message.split('\n')[0] }); }
      }
    }
    const r = { desc: c.desc, strip, errors };
    if (c.run) {
      // Sobald das Menü steht: Lauf starten (vor dem späten SDK)
      await page.waitForSelector('#screen [data-act="play"]', { timeout: 8000 });
      await page.click('[data-act="play"]', { force: true });
      await page.waitForTimeout(300);
      await page.evaluate(() => { const b = document.querySelector('[data-act="storyok"]'); if (b) b.click(); });
      r.atRunStart = await page.evaluate(() => ({ state: Glutnacht.Game.state, backend: !!Glutnacht.Store.backend }));
    }
    // Bis nach dem späten SDK warten
    const until = Math.max(c.strip ? 0 : 1500, c.initMs > 0 ? c.dl + c.initMs + 800 : 0);
    const left = until - (Date.now() - t0);
    if (left > 0) await page.waitForTimeout(left);
    if (c.run) {
      r.duringRun = await page.evaluate(() => ({ state: Glutnacht.Game.state, backend: !!Glutnacht.Store.backend, gold: Glutnacht.Store.data.gold }));
      await page.evaluate(() => Glutnacht.UI.toMenu());
      await page.waitForTimeout(100);
    }
    Object.assign(r, await page.evaluate(() => {
      const G = window.Glutnacht, sdk = window.CrazyGames && window.CrazyGames.SDK;
      let local = null; try { local = localStorage.getItem('glutnacht.v1'); } catch (e) { /* egal */ }
      return {
        marks: window.__m, sdk: window.__sdkLog || [], lang: typeof LANG !== 'undefined' ? LANG : null,
        ready: !!(G && G.ready), ui: G && G.UI.cur, backend: !!(G && G.Store.backend), gold: G && G.Store.data.gold,
        goldShown: (document.querySelector('.goldbox span') || {}).textContent || null,
        remoteGold: sdk && sdk.data._m['glutnacht.v1'] ? JSON.parse(sdk.data._m['glutnacht.v1']).gold : null,
        localGold: local ? JSON.parse(local).gold : null,
      };
    }));
    // Prüfungen
    const log = r.sdk.map(x => x[1]);
    const nStart = log.filter(x => x === 'loadingStart').length, nStop = log.filter(x => x === 'loadingStop').length;
    const at = k => (r.sdk.find(x => x[1] === k) || [])[0];
    const menuMs = r.marks.glutnachtReady;
    const firstFlat = strip.find(s => s.std !== undefined);
    const firstNonFlat = strip.find(s => s.std > 4);
    const checks = {
      noErrors: errors.length === 0,
      menuBy2800: menuMs !== undefined && menuMs <= 2800,
      loadingPaired: nStop === nStart && nStart <= 1 && (nStart === 0 || at('loadingStop') >= at('loadingStart')),
    };
    if (c.strip) {
      checks.splashBy300 = !!(firstNonFlat && firstNonFlat.t <= 300);
      if (c.dl >= 300) checks.fcpBeforeSdk = r.marks['first-contentful-paint'] !== undefined && (at('sdk script executed') === undefined || r.marks['first-contentful-paint'] < at('sdk script executed'));
    }
    // Ton bleibt still, bis init() fertig ist (Stummschaltung bekannt); hängt das SDK, bleibt er still
    checks.audioHeld = c.initMs < 0 || c.dl < 0 ? r.marks.audioOpen === undefined : r.marks.audioOpen === undefined || r.marks.audioOpen >= at('init resolved');
    if (v === 'T') { checks.loadingOnce = nStart === 1; checks.backendAtBoot = r.backend; }
    if (c.expectLang) checks.lang = r.lang === c.expectLang;
    if (v === 'LATEMENU') checks.adoptedCloud = r.backend && r.gold === 777 && r.goldShown === '777';
    if (v === 'LATERUN') checks.deferredThenAdopted = r.duringRun && !r.duringRun.backend && r.duringRun.state !== 'menu' && r.backend && r.gold === 777;
    if (v === 'LATELOCAL') checks.localWins = r.backend && r.gold === 555 && r.remoteGold === 555;
    r.loading = { start: nStart, stop: nStop };
    r.firstScreenshot = firstFlat && { t: firstFlat.t, std: firstFlat.std };
    r.firstNonFlatMs = firstNonFlat ? firstNonFlat.t : null;
    r.checks = checks;
    r.ok = Object.values(checks).every(Boolean);
    res[v] = r;
    console.log((r.ok ? 'OK   ' : 'FAIL ') + v.padEnd(10) + c.desc.padEnd(48) +
      ' menu=' + menuMs + 'ms fcp=' + r.marks['first-contentful-paint'] + 'ms splash<=' + r.firstNonFlatMs + 'ms lang=' + r.lang +
      ' loading=' + nStart + '/' + nStop + ' audio=' + r.marks.audioOpen + 'ms ' + JSON.stringify(Object.fromEntries(Object.entries(checks).filter(([, x]) => !x))) + (errors.length ? ' ' + errors.join(' | ') : ''));
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(res, null, 1));
  const bad = Object.keys(res).filter(k => !res[k].ok);
  console.log(bad.length ? 'Fehlgeschlagen: ' + bad.join(', ') : 'alle Varianten OK');
  await browser.close();
  process.exitCode = bad.length ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
