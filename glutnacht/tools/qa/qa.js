// QA-Lauf: frisches Profil, Startzeiten, Klicks bis zum Spiel, 60 s Spiel mit Bildschirmfotos alle 3 s.
// (QA run: fresh profile, boot timings, clicks to gameplay, 60 s of play with screenshots every 3 s.)
//   node tools/qa/qa.js <profil> [cpuDrossel] [sekunden] [--target=datei.html] [--out=ordner]
//   Profile: d907 d1280 iphone-land iphone-port d907-long d907-de
//   --target: zu prüfende HTML-Datei (Standard: index.html im Spielordner, per file://)
//   --out: Ausgabeordner (Standard: tools/qa/out); je Profil ein Unterordner mit result.json und PNGs
'use strict';
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const opt = k => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const TARGET = path.resolve(opt('target') || path.join(ROOT, 'index.html'));
const URL = 'file://' + TARGET;
const OUT = path.resolve(opt('out') || path.join(__dirname, 'out'));
const posArgs = process.argv.slice(2).filter(a => !a.startsWith('--'));
const PROFILES = {
  'd907': { viewport: { width: 907, height: 510 }, deviceScaleFactor: 1, locale: 'en-US' },
  'd1280': { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'en-US' },
  'iphone-land': { ...devices['iPhone 13 landscape'], locale: 'en-US' },
  'iphone-port': { ...devices['iPhone 13'], locale: 'en-US' },
  'd907-long': { viewport: { width: 907, height: 510 }, deviceScaleFactor: 1, locale: 'en-US' },
  'd907-de': { viewport: { width: 907, height: 510 }, deviceScaleFactor: 1, locale: 'de-DE' },
};

const name = posArgs[0] || 'd907';
const cpu = +(posArgs[1] || 1);
const PLAY_SECONDS = +(posArgs[2] || 60);
if (!PROFILES[name]) { console.error('unbekanntes Profil: ' + name); process.exit(2); }
const dir = path.join(OUT, name + (cpu > 1 ? '-cpu' + cpu : ''));
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext(PROFILES[name]);
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
  if (cpu > 1) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  }
  // Boot instrumentation: canvas brightness sampling + menu appearance, all in page time
  await page.addInitScript(() => {
    window.__qa = { marks: {}, frames: [] };
    const mark = (k) => { if (!(k in window.__qa.marks)) window.__qa.marks[k] = performance.now(); };
    document.addEventListener('DOMContentLoaded', () => mark('domContentLoaded'));
    window.addEventListener('load', () => mark('load'));
    if (document.fonts) document.fonts.ready.then(() => mark('fontsReady'));
    new PerformanceObserver(l => { for (const e of l.getEntries()) mark(e.name); }).observe({ type: 'paint', buffered: true });
    const poll = () => {
      const scr = document.getElementById('screen');
      if (scr && scr.querySelector('[data-act="play"]')) mark('menuInDom');
      const cv = document.getElementById('game');
      if (cv && cv.width > 0) {
        try {
          const s = document.createElement('canvas'); s.width = 32; s.height = 18;
          const g = s.getContext('2d'); g.drawImage(cv, 0, 0, 32, 18);
          const d = g.getImageData(0, 0, 32, 18).data; let sum = 0;
          for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
          const lum = sum / (d.length / 4) / 3;
          if (lum > 1 && !('canvasNonBlack' in window.__qa.marks)) mark('canvasNonBlack');
          if (window.__qa.frames.length < 400) window.__qa.frames.push([Math.round(performance.now()), +lum.toFixed(1)]);
        } catch (e) { /* ignore */ }
      }
      if (!window.__qa.marks.menuInDom || performance.now() < 8000) requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  });

  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'commit' });
  // boot filmstrip every 150 ms for 1.5 s
  for (let i = 0; i < 10; i++) {
    try { await page.screenshot({ path: path.join(dir, 'boot-' + String(i * 150).padStart(4, '0') + 'ms.png') }); } catch (e) { /* not yet paintable */ }
    await page.waitForTimeout(150);
  }
  await page.waitForSelector('[data-act="play"]', { state: 'visible', timeout: 20000 });
  const bootWall = Date.now() - t0;
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(dir, '01-menu.png') });

  const menuInfo = await page.evaluate(() => ({
    marks: window.__qa.marks,
    lang: LANG,
    menuText: document.getElementById('screen').innerText,
    menuWords: document.getElementById('screen').innerText.split(/\s+/).filter(Boolean).length,
    playBtn: (() => { const b = document.querySelector('[data-act="play"]').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })(),
    logoBox: (() => { const b = document.querySelector('.logo').getBoundingClientRect(); return { y: b.y, h: b.height }; })(),
    menuScroll: (() => { const s = document.getElementById('screen'); return { scrollH: s.scrollHeight, clientH: s.clientHeight }; })(),
    zoom: Render.zoom, dpr: Render.dpr,
  }));

  // Click 1: PLAY
  const clicks = [];
  const tClick1 = Date.now();
  await page.click('[data-act="play"]', { force: true });
  clicks.push('PLAY');
  await page.waitForTimeout(500);
  const afterPlay = await page.evaluate(() => ({ state: Game.state, cur: UI.cur, text: UI.cur ? document.getElementById('screen').innerText : '' }));
  await page.screenshot({ path: path.join(dir, '02-after-play.png') });
  let storyWords = 0;
  if (afterPlay.cur === 'story') {
    storyWords = afterPlay.text.split(/\s+/).filter(Boolean).length;
    await page.click('[data-act="storyok"]', { force: true });
    clicks.push('STORY OK');
  }
  const tGameplay = Date.now();
  await page.waitForTimeout(200);
  const hudInfo = await page.evaluate(() => {
    const q = s => document.querySelector(s);
    const cs = (s) => { const e = q(s); if (!e) return null; const c = getComputedStyle(e); const b = e.getBoundingClientRect(); return { font: c.fontSize, color: c.color, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    return {
      timer: cs('#timer'), xp: cs('#xp'), xplvl: cs('#xplvl'), counters: cs('#counters'), slot: cs('#wslots .slot'), pslot: cs('#pslots .slot'),
      slotNum: cs('#wslots .slot span'), pause: cs('#pausebtn'), banner: cs('#banner'),
      zoom: Render.zoom, viewWorld: { w: Game.view.hw * 2, h: Game.view.hh * 2 },
      // Spritekasten wie in der Grundmessung (46 Welteinheiten) und sichtbare Figur (Alpha-Umriss), beide in CSS-px
      playerOnScreenPx: 46 * (typeof PLAYER_DRAW_SCALE === 'number' ? PLAYER_DRAW_SCALE : 1) * Render.zoom,
      playerVisiblePx: (() => {
        const c = Sprites.player(CHARS[Game.run.char].color, 0, false), g = c.getContext('2d');
        const d = g.getImageData(0, 0, c.width, c.height).data; let y0 = -1, y1 = -1;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 40) { if (y0 < 0) y0 = y; y1 = y; break; }
        return (y1 - y0 + 1) / c.width * c.size * (typeof PLAYER_DRAW_SCALE === 'number' ? PLAYER_DRAW_SCALE : 1) * Render.zoom;
      })(),
      slotNumBg: (() => { const e = q('#wslots .slot span'); return e ? getComputedStyle(e).backgroundColor : null; })(),
      goldVisible: (() => { const e = q('#goldc'); return !!(e && e.offsetParent); })(),
    };
  });
  // Schadenszahlen: tatsächliche Schriftgröße auf dem Bildschirm (Welt-Ebene, Transform ≠ dpr) mitschreiben
  await page.evaluate(() => {
    const ctx = Render.ctx, f = ctx.fillText.bind(ctx), q = window.__qa.dmgFont = { min: 1e9, max: 0, n: 0 };
    ctx.fillText = (txt, x, y, mw) => {
      const a = ctx.getTransform().a / Render.dpr;
      if (Math.abs(a - 1) > 1e-3 && /^\d+$/.test(String(txt))) {
        const px = parseFloat(ctx.font.match(/([\d.]+)px/)[1]) * a;
        q.min = Math.min(q.min, px); q.max = Math.max(q.max, px); q.n++;
      }
      return mw === undefined ? f(txt, x, y) : f(txt, x, y, mw);
    };
  });

  // Instrument game events
  await page.evaluate(() => {
    const ev = window.__qa.events = [];
    const now = () => ({ wall: Math.round(performance.now()), gt: Game.run ? +Game.run.t.toFixed(1) : 0 });
    const wrap = (k) => { const f = Hooks[k]; Hooks[k] = (...a) => { ev.push({ k, ...now(), a: k === 'banner' ? a : k === 'sfx' ? a[0] : k === 'shake' ? a[0] : k === 'levelUp' ? a[0].map(o => o.id || o.kind) : k === 'chest' ? { evolved: a[0].evolved, items: a[0].items.length } : k === 'achievement' ? a[0].name : undefined }); return f(...a); }; };
    ['banner', 'levelUp', 'chest', 'achievement', 'shake', 'happy', 'gameOver', 'victory'].forEach(wrap);
    const sf = Hooks.sfx; const sfxCount = window.__qa.sfx = {};
    Hooks.sfx = (n, a) => { sfxCount[n] = (sfxCount[n] || 0) + 1; return sf(n, a); };
  });

  // Bot: walk in a slowly rotating direction (like a casual player circling), pick card 1 on level-ups.
  const dirs = [['KeyD'], ['KeyD', 'KeyS'], ['KeyS'], ['KeyA', 'KeyS'], ['KeyA'], ['KeyA', 'KeyW'], ['KeyW'], ['KeyD', 'KeyW']];
  let held = [];
  const setKeys = async (ks) => { for (const k of held) if (!ks.includes(k)) await page.keyboard.up(k); for (const k of ks) if (!held.includes(k)) await page.keyboard.down(k); held = ks; };
  const samples = [];
  const start = Date.now();
  let levelupFit = null;
  let nextShot = 0, di = 0, nextDir = 0, firstLevelShot = false, firstChestShot = false;
  while (true) {
    const el = (Date.now() - start) / 1000;
    if (el > PLAY_SECONDS + 2) break;
    const st = await page.evaluate(() => {
      const r = Game.run;
      if (!r) return { state: Game.state };
      let onScreen = 0;
      for (const e of r.enemies) if (!e.dead && Render.inView(e.x, e.y, 0)) onScreen++;
      let gemsOnScreen = 0;
      for (const g of (r.gems || [])) if (Render.inView(g.x, g.y, 0)) gemsOnScreen++;
      return { state: Game.state, cur: UI.cur, t: +r.t.toFixed(1), level: r.level, kills: r.kills, hp: Math.round(r.p.hp), maxHp: r.stats.maxHp, enemies: r.enemies.length, onScreen, gemsOnScreen, weapons: r.weapons.map(w => w.id + w.level).join(','), passives: r.passives.map(p => p.id + p.level).join(','), fx: r.fx.length, texts: r.texts.length };
    });
    if (st.cur === 'levelup') {
      if (!firstLevelShot) {
        firstLevelShot = true;
        await page.waitForTimeout(450);
        await page.screenshot({ path: path.join(dir, 'first-levelup.png') });
        levelupFit = await page.evaluate(() => { const s = document.getElementById('screen'), m = s.firstElementChild.getBoundingClientRect(); return { scrollH: s.scrollHeight, clientH: s.clientHeight, top: Math.round(m.top), bottom: Math.round(m.bottom), vh: innerHeight }; });
      }
      await page.waitForTimeout(420);
      await page.keyboard.press('Digit1');
      clicks.push('levelup-pick@' + st.t);
      continue;
    }
    if (st.cur === 'chest') {
      if (!firstChestShot) { firstChestShot = true; await page.waitForTimeout(1500); await page.screenshot({ path: path.join(dir, 'first-chest.png') }); }
      await page.waitForTimeout(420);
      await page.keyboard.press('Enter');
      continue;
    }
    if (st.state === 'over') { samples.push({ el, ...st, note: 'GAME OVER' }); await page.screenshot({ path: path.join(dir, 'gameover.png') }); break; }
    if (el >= nextDir) { await setKeys(dirs[di % 8]); di++; nextDir = el + 2.2; }
    if (el >= nextShot) {
      const f = path.join(dir, 'play-' + String(Math.round(nextShot)).padStart(2, '0') + 's.png');
      await page.screenshot({ path: f });
      samples.push({ el: +el.toFixed(1), shot: path.basename(f), ...st });
      nextShot += 3;
    }
    await page.waitForTimeout(100);
  }
  await setKeys([]);
  const tail = await page.evaluate(() => ({ events: window.__qa.events, sfx: window.__qa.sfx, frames: window.__qa.frames.slice(0, 60), dmgFont: window.__qa.dmgFont }));
  const result = {
    profile: name, cpu, target: TARGET, bootWallMs: bootWall, menu: menuInfo, clicksBeforeGameplay: clicks.filter(c => !c.startsWith('levelup')), storyWords,
    storyText: afterPlay.text, msFromFirstClickToGameplay: tGameplay - tClick1, hud: hudInfo, samples, events: tail.events, sfx: tail.sfx,
    canvasLum: tail.frames, logs, levelPicks: clicks.filter(c => c.startsWith('levelup')),
    wordsBeforeGameplay: menuInfo.menuWords + storyWords, dmgFontScreenPx: tail.dmgFont, levelupFit,
  };
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(result, null, 1));
  console.log(JSON.stringify({ profile: name, cpu, marks: menuInfo.marks, bootWall, lang: menuInfo.lang, clicks: result.clicksBeforeGameplay, storyWords, menuWords: menuInfo.menuWords, menuScroll: menuInfo.menuScroll, zoom: menuInfo.zoom,
    playerBoxPx: +hudInfo.playerOnScreenPx.toFixed(1), playerVisiblePx: +hudInfo.playerVisiblePx.toFixed(1), dmgFontPx: tail.dmgFont, timerY: hudInfo.timer && hudInfo.timer.y,
    slotNumFont: hudInfo.slotNum && hudInfo.slotNum.font, xplvlFont: hudInfo.xplvl && hudInfo.xplvl.font, levelupFit, errors: logs.filter(l => /error/i.test(l)) }));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
