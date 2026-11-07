// M10: Countdown-Leiste und Ansturm – Lage, Überlappung und Bilder in allen Zuständen.
// (Countdown bar and surge: layout, overlap and screenshots in every state.)
//   node tools/qa/countdown.js [--target=datei.html] [--out=ordner] [--only=320x568,844x390,1280x720] [--lang=de,en]
// Je Bildschirm und Sprache: volle Ausrüstung (6 + 6), unverwundbarer Held, Spiellogik nur auf Befehl (Standbild),
// dann die Zustände aus der Spezifikation (tools/qa/m10-spec.md §9.4). Geprüft wird per getBoundingClientRect
// (Banner: Textfläche per Range), dass sich #surge, #bossbar, Banner, Zeit, Pauseknopf, Zähler und die Ausrüstungs-
// felder nicht überlappen (> 1 px), der Leistentext nicht überläuft und der Banner über dem Kopf des Helden endet.
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const opt = k => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const URL = 'file://' + path.resolve(opt('target') || path.join(__dirname, '..', '..', 'index.html'));
const OUT = path.resolve(opt('out') || path.join(__dirname, 'out', 'countdown'));
fs.mkdirSync(OUT, { recursive: true });
const VIEWS = {
  '320x568': { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  '844x390': { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  '1280x720': { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
};
const ONLY = (opt('only') || Object.keys(VIEWS).join(',')).split(',');
const LANGS = (opt('lang') || 'de,en').split(',');

(async () => {
  const browser = await chromium.launch();
  let bad = 0;
  for (const vn of ONLY) for (const lang of LANGS) {
    const ctx = await browser.newContext(Object.assign({ locale: lang === 'de' ? 'de-DE' : 'en-US' }, VIEWS[vn]));
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(URL);
    await page.waitForFunction(() => window.Glutnacht && window.Glutnacht.ready);
    await page.evaluate(lang => {
      const d = Store.data; d.stats.runs = 5; d.settings.lang = lang; setLang(lang);
      d.storySeen = { premise: 1, graveyard: 1, ashwood: 1, frostlake: 1, ruins: 1, nightheart: 1 }; Store.save();
      UI.chapterBanner = () => {};
      Store.data.stageSel = 'graveyard'; UI.startRun('aron');
      const r = Game.run;
      for (const id of ['whip', 'orbit', 'aura', 'lightning', 'knives']) if (!r.weapons.some(w => w.id === id)) Game.addWeapon(id);
      for (const id of Object.keys(PASSIVES).slice(0, 6)) r.passives.push({ id, level: 3 });
      Game.refreshStats();
      r.p.hp = r.stats.maxHp;
      const up = Game.update.bind(Game);
      window.__freeze = true;
      Game.update = dt => { if (!window.__freeze) up(dt); };
      // Logik in 1/60-s-Schritten bis zur Zeit t; Aufstiege und Truhen werden still erledigt
      window.__to = t => {
        while (r.t < t) {
          r.p.iframe = 1; r.p.hp = r.stats.maxHp;
          if (Game.state === 'levelup') { UI.hide && UI.hide(); Game.chooseLevel(Game.lastLevelOptions[0]); continue; }
          if (Game.state === 'chest') { UI.hide && UI.hide(); Game.closeChest(); continue; }
          r.pendingLevels = 0; r.pendingChests = 0;
          up(1 / 60);
        }
      };
      window.__jump = t => {
        r.t = t; r.eliteT = 30 + 60 * Math.ceil((t - 30) / 60) - t;
        r.eventIdx = r.stage.events.findIndex(e => e.t >= t); if (r.eventIdx < 0) r.eventIdx = 1e9;
        r.bossIdx = r.bossList.findIndex(b => b.t >= t); if (r.bossIdx < 0) r.bossIdx = 1e9;
        r.enemies.length = 0;
      };
      window.__measure = () => {
        const R = el => { if (!el || el.hidden || getComputedStyle(el).display === 'none') return null; const b = el.getBoundingClientRect(); return b.width && b.height ? { x: b.left, y: b.top, r: b.right, b: b.bottom } : null; };
        const out = {};
        const $ = id => document.getElementById(id);
        out.surge = R($('surge')); out.bossbar = R($('bossbar')); out.timer = R($('timer')); out.pausebtn = R($('pausebtn')); out.counters = R($('counters'));
        document.querySelectorAll('#slots .slot').forEach((s, i) => { out['slot' + i] = R(s); });
        const bn = $('banner');
        if (bn.classList.contains('show') && +getComputedStyle(bn).opacity > 0.05) {
          const rg = document.createRange(); rg.selectNodeContents(bn); const b = rg.getBoundingClientRect();
          out.banner = { x: b.left, y: b.top, r: b.right, b: b.bottom };
          out.bannerText = bn.textContent;
        }
        const t = $('surgetxt');
        out.surgeText = $('surge').hidden ? null : t.textContent;
        out.surgeOverflow = !$('surge').hidden && t.scrollWidth > t.clientWidth + 1;
        out.surgeHead = !$('surge').hidden ? $('surgehead').scrollWidth > $('surge').clientWidth + 1 : false;
        const p = Game.run.p, s = Render.toScreen(p.x, p.y);
        out.heroTop = s.y - 30 * Render.zoom;
        out.state = Game.state; out.t = +Game.run.t.toFixed(2); out.cs = Game.countdownState() && Object.assign({}, Game.countdownState());
        return out;
      };
    }, lang);
    const check = (name, m, extra) => {
      const keys = Object.keys(m).filter(k => m[k] && typeof m[k] === 'object' && 'x' in m[k]);
      const probs = [];
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i], b = keys[j];
        if (a.startsWith('slot') && b.startsWith('slot')) continue;
        const A = m[a], B = m[b];
        const ox = Math.min(A.r, B.r) - Math.max(A.x, B.x), oy = Math.min(A.b, B.b) - Math.max(A.y, B.y);
        if (ox > 1 && oy > 1) probs.push(`${a}×${b} (${ox.toFixed(0)}×${oy.toFixed(0)})`);
      }
      if (m.surgeOverflow || m.surgeHead) probs.push('Leistentext läuft über: ' + m.surgeText);
      if (m.banner && m.banner.b > m.heroTop) probs.push(`Banner unten ${m.banner.b.toFixed(0)} > Held oben ${m.heroTop.toFixed(0)}`);
      if (extra) probs.push(...extra);
      bad += probs.length;
      console.log(`${probs.length ? 'XX' : 'ok'} ${vn} ${lang} ${name}: t=${m.t} ${m.state} bar=${m.surgeText ? JSON.stringify(m.surgeText) : '–'} banner=${m.bannerText ? JSON.stringify(m.bannerText) : '–'}${probs.length ? ' | ' + probs.join('; ') : ''}`);
    };
    const shot = async (name, extra) => {
      await page.waitForTimeout(520); // Banner und Pop-in eingeschwungen
      const m = await page.evaluate(() => window.__measure());
      await page.screenshot({ path: path.join(OUT, `${vn}-${lang}-${name}.png`) });
      check(name, m, extra);
      return m;
    };
    // 1) Countdown erscheint zusammen mit dem Elite-Banner (90 s)
    await page.evaluate(() => { window.__jump(89.9); window.__to(90.5); });
    await shot('1-90s-countdown-elite');
    // 2) T-10-Banner mit Hinweis (110 s)
    await page.evaluate(() => window.__to(110.5));
    await shot('2-110s-getready');
    // 3) Ansturm-Banner (120 s)
    await page.evaluate(() => window.__to(120.3));
    await shot('3-120s-surge-start');
    // 4) mitten im Ansturm (130 s)
    await page.evaluate(() => window.__to(130));
    await shot('4-130s-surge');
    // 5) Ende des Ansturms (145 s)
    await page.evaluate(() => window.__to(145.3));
    await shot('5-145s-surge-end');
    // 6) Elite-Banner bei 150 s, Leiste weg
    await page.evaluate(() => window.__to(150.5));
    const m6 = await shot('6-150s-elite');
    if (m6.surge) { bad++; console.log('XX Leiste bei 150 s noch sichtbar'); }
    // 7) leichter Boss-Countdown mit Umzingelungs-Banner (170 s)
    await page.evaluate(() => window.__to(170.3));
    await shot('7-170s-boss-countdown-ring');
    // 7b) Boss erscheint: Leiste weg, Bossleiste da
    await page.evaluate(() => window.__to(180.6));
    const m7 = await shot('7b-180s-boss');
    if (m7.surge || !m7.bossbar) { bad++; console.log('XX bei 180 s: Leiste ' + !!m7.surge + ', Bossleiste ' + !!m7.bossbar); }
    // 8) Pause während des Countdowns (zweiter Lauf, 100 s): die Leiste bleibt stehen
    await page.evaluate(() => {
      UI.toMenu(); Store.data.stageSel = 'graveyard'; UI.startRun('aron');
      const r = Game.run, up = Game.update;
      for (const id of ['whip', 'orbit', 'aura', 'lightning', 'knives']) if (!r.weapons.some(w => w.id === id)) Game.addWeapon(id);
      for (const id of Object.keys(PASSIVES).slice(0, 6)) r.passives.push({ id, level: 3 });
      Game.refreshStats();
    });
    // __to/__jump hängen am alten Lauf: neu binden
    await page.evaluate(() => {
      const r = Game.run;
      window.__jump = t => { r.t = t; r.eliteT = 30 + 60 * Math.ceil((t - 30) / 60) - t; r.eventIdx = r.stage.events.findIndex(e => e.t >= t); if (r.eventIdx < 0) r.eventIdx = 1e9; r.bossIdx = r.bossList.findIndex(b => b.t >= t); r.enemies.length = 0; };
      window.__run = r;
      window.__jump(99); window.__freeze = false;
    });
    await page.waitForTimeout(1200);
    const before = await page.evaluate(() => { const r = window.__run; r.p.iframe = 9; UI.pause(); return { t: r.t, txt: document.getElementById('surgetxt').textContent }; });
    await page.waitForTimeout(1500);
    const m8 = await shot('8-pause');
    if (Math.abs(m8.t - before.t) > 0.01 || m8.surgeText !== before.txt) { bad++; console.log('XX Countdown läuft in der Pause weiter', JSON.stringify(before), m8.t, m8.surgeText); }
    // 9) Aufstieg während des Countdowns
    await page.evaluate(() => { UI.hide && UI.hide(); Game.state = 'play'; Game.gainXp(window.__run.xpNext); });
    await page.waitForTimeout(900);
    const m9 = await shot('9-levelup');
    if (m9.state !== 'levelup') console.log('  (Hinweis: kein Aufstiegsdialog, Zustand ' + m9.state + ')');
    await page.evaluate(() => { const o = Game.lastLevelOptions; if (Game.state === 'levelup' && o) { Game.chooseLevel(o[0]); UI.hide && UI.hide(); } });
    // 10) Truhe genau über dem Helden außerhalb des Bildes: Pfeil unter der Leiste
    await page.evaluate(() => {
      window.__freeze = true;
      const r = window.__run, p = r.p;
      r.pickups.length = 0;
      r.pickups.push({ kind: 'chest', x: p.x, y: p.y - Game.view.hh - 260, t: 0 });
    });
    await page.waitForTimeout(400);
    const chev = await page.evaluate(() => {
      const r = window.__run, it = r.pickups[0], s = Render.toScreen(it.x, it.y), m = 34, hb = Render.hudBar;
      const ex = clamp(s.x, m, Render.W - m);
      const ey = clamp(s.y, hb && Math.abs(ex - Render.W / 2) < hb.half + 30 ? Math.max(m + 40, hb.bottom + 28) : m + 40, Render.H - m);
      const sb = document.getElementById('surge').getBoundingClientRect();
      return { ex, ey, top: ey - 24, surgeBottom: sb.bottom, visible: !document.getElementById('surge').hidden };
    });
    const extra = chev.visible && chev.top < chev.surgeBottom ? [`Pfeil oben ${chev.top.toFixed(0)} < Leiste unten ${chev.surgeBottom.toFixed(0)}`] : [];
    await shot('10-chest-chevron', extra);
    if (errs.length) { bad += errs.length; console.log('XX Fehler:', errs.join(' | ')); }
    const miss = await page.evaluate(() => [...I18N_MISSES]);
    if (miss.length) { bad += miss.length; console.log('XX I18N_MISSES:', miss.join(' | ')); }
    await ctx.close();
  }
  await browser.close();
  console.log(bad ? `FEHLER: ${bad}` : 'alles ok', '→', OUT);
  process.exitCode = bad ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
