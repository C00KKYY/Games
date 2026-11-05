// Kontaktbogen aller Sprites (Plan M6): jeder Held (Laufbilder, Treffer, Bildnis), jeder Gegnertyp (beide Bilder,
// Treffer, vereist, Landtönungen), jedes Boss-Aussehen (Sprite + Tönung, in Bossgröße), Edelsteine, Aufsammelbares,
// Kohlebecken, Deko je Land, alle Symbole und die 5 Böden – als ein PNG zum Durchsehen.
//
//   node tools/qa/contact.js [--out=bild.png] [--target=index.html] [--scale=2]
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const opt = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const OUT = path.resolve(opt('out', path.join(ROOT, 'tools', 'qa', 'out', 'contact.png')));
const TARGET = path.resolve(opt('target', path.join(ROOT, 'index.html')));
const SCALE = +opt('scale', 2);

function build(SCALE) {
  Sprites.setScale(Math.max(2, SCALE * 1.5)); // scharf in Kontaktbogen-Größe
  const W = 1800, pad = 14, lab = 15;
  const sections = [];
  const sec = (title, items, cell) => sections.push({ title, items, cell });
  const S = (c, label, w, h) => ({ c, label, w: w || c.size, h: h || c.size });
  // Helden
  const heroes = [];
  for (const id of Object.keys(CHARS)) {
    for (let f = 0; f < 3; f++) heroes.push(S(Sprites.player(id, f, false), id + ' ' + f));
    heroes.push(S(Sprites.player(id, 0, true), id + ' hit'));
  }
  sec('Helden (Bild 0/1/2, Treffer) – Maßstab ' + SCALE, heroes, 64);
  const portraits = [];
  const imgs = [];
  for (const id of Object.keys(CHARS)) { portraits.push({ url: Sprites.playerURL(id, 96), label: id, w: 96, h: 96 }); portraits.push({ url: Sprites.playerURL(id, 96, true), label: id + ' gesperrt', w: 96, h: 96 }); }
  sec('Bildnisse (Heldenauswahl, 96 px)', portraits, 96);
  // Gegner
  const en = [];
  for (const t of [...Object.keys(ENEMIES), 'night']) {
    en.push(S(Sprites.enemy(t, 0, 0, null), t + ' 0'), S(Sprites.enemy(t, 1, 0, null), t + ' 1'), S(Sprites.enemy(t, 0, 1, null), t + ' hit'), S(Sprites.enemy(t, 0, 2, null), t + ' eis'));
  }
  sec('Gegner (Bild 0/1, Treffer, vereist)', en, 90);
  const tints = [];
  for (const st of STAGES) for (const [t, col] of Object.entries(st.tints || {})) tints.push(S(Sprites.enemy(t, 0, 0, col), st.id.slice(0, 5) + ' ' + t));
  sec('Gegner mit Landtönung', tints, 70);
  // Bosse
  const bo = [];
  for (const st of STAGES) for (const b of st.bosses) {
    const c = Sprites.bossSprite(b.sprite, b.r, 0, 0, b.tint || null, Sprites.bossLevel(b));
    const sc = b.r / Sprites.baseR(b.sprite);
    bo.push(S(c, b.id + ' (' + st.id.slice(0, 5) + ')', c.size * sc * 0.75, c.size * sc * 0.75));
  }
  sec('Bosse (Bossgröße ×0,75)', bo, 0);
  // Gegenstände
  const it = [];
  for (let i = 0; i < 4; i++) it.push(S(Sprites.gem(i), 'gem ' + i));
  for (const k of ['chest', 'heart', 'magnet', 'bomb', 'coin', 'bag', 'fire', 'skull']) it.push(S(Sprites.item(k), k));
  it.push(S(Sprites.brazier(), 'brazier'));
  sec('Edelsteine, Aufsammelbares, Kohlebecken', it, 64);
  const de = [];
  for (const st of STAGES) for (const k of Sprites.DECOS) de.push(S(Sprites.deco(k, st.decorTint || null, st.id), st.id.slice(0, 5) + ' ' + k));
  sec('Deko je Land', de, 64);
  const ic = Sprites.ICON_IDS.map(id => ({ url: Sprites.iconURL(id, 64), label: id, w: 64, h: 64 }));
  sec('Symbole (64 px)', ic, 64);
  const ic2 = Sprites.ICON_IDS.map(id => ({ url: Sprites.iconURL(id, 26), label: '', w: 26, h: 26 }));
  sec('Symbole (26 px, wie im HUD)', ic2, 30);
  const gr = STAGES.map(st => ({ c: Sprites.groundTile(st.ground, st.id), label: st.id, w: 340, h: 340, crop: true }));
  sec('Böden (Ausschnitt 340 px der 512er-Kachel)', gr, 340);

  // Layout
  let y = 40;
  const pos = [];
  for (const s of sections) {
    y += 26;
    let x = pad, rowH = 0;
    for (const it of s.items) {
      const cw = Math.max(s.cell || 0, it.w * (it.url || it.crop ? 1 : SCALE) * (s.cell === 0 ? 1 : 1)), ch = Math.max(s.cell || 0, it.h * (it.url || it.crop ? 1 : SCALE));
      const w = s.cell === 0 ? it.w : cw, h = s.cell === 0 ? it.h : ch;
      if (x + w > W - pad) { x = pad; y += rowH + lab + 8; rowH = 0; }
      pos.push({ s, it, x, y, w, h });
      x += w + 10; rowH = Math.max(rowH, h);
    }
    y += rowH + lab + 14;
  }
  const H = y + 20;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2436'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff'; g.font = 'bold 22px sans-serif'; g.fillText('Ember Night – Kontaktbogen aller Sprites', pad, 28);
  const done = [];
  let lastTitle = null;
  for (const p of pos) {
    if (p.s !== lastTitle) { lastTitle = p.s; g.fillStyle = '#ffd34f'; g.font = 'bold 16px sans-serif'; g.fillText(p.s.title, pad, p.y - 8); }
    // Feld mit hellem und dunklem Halbfeld (Lesbarkeit auf beiden)
    g.fillStyle = '#3a3448'; g.fillRect(p.x, p.y, p.w, p.h);
    g.fillStyle = '#1a1622'; g.fillRect(p.x + p.w / 2, p.y, p.w / 2, p.h);
    const { it } = p;
    if (it.url) {
      done.push(new Promise(res => { const im = new Image(); im.onload = () => { g.drawImage(im, p.x + (p.w - it.w) / 2, p.y + (p.h - it.h) / 2, it.w, it.h); res(); }; im.onerror = res; im.src = it.url; }));
    } else if (it.crop) {
      g.drawImage(it.c, 0, 0, it.w, it.h, p.x, p.y, it.w, it.h);
    } else {
      const k = p.s.cell === 0 ? 1 : SCALE, w = it.w * k, h = it.h * k;
      g.drawImage(it.c, p.x + (p.w - w) / 2, p.y + (p.h - h) / 2, w, h);
    }
    if (it.label) { g.fillStyle = '#cfc8e0'; g.font = '11px sans-serif'; g.fillText(it.label, p.x, p.y + p.h + 12); }
  }
  return Promise.all(done).then(() => c.toDataURL('image/png').split(',')[1]);
}

(async () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('file://' + TARGET + '?muteAudio=true');
  await page.waitForFunction(() => window.Glutnacht && window.Glutnacht.ready);
  const t0 = Date.now();
  const b64 = await page.evaluate(`(${build})(${SCALE})`);
  fs.writeFileSync(OUT, Buffer.from(b64, 'base64'));
  console.log('Kontaktbogen:', OUT, '(' + (Date.now() - t0) + ' ms)');
  console.log(errs.length ? 'Fehler: ' + errs.join(' | ') : 'keine Fehler');
  await browser.close();
})();
