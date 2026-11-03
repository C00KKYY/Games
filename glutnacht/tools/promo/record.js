// Rendert das Werbevideo (Hochformat 1080x1920, 30 fps) aus echten Spielszenen.
//   node tools/promo/record.js                      -> dist/promo/ember-night-promo.mp4 (Endkarte "LINK IN BIO")
//   node tools/promo/record.js --link "crazygames.com/game/ember-night"
//                                                   -> zusätzlich ember-night-promo-link.mp4 mit diesem Link
//   node tools/promo/record.js --blank              -> zusätzlich eine Fassung mit leerem Link-Feld
//   node tools/promo/record.js --story [--lang de]  -> persönliches Video (Testspieler gesucht),
//                                                      dist/promo/ember-night-story-en.mp4 bzw. -de.mp4
//   node tools/promo/record.js --preview [--landscape] -> Portal-Vorschau nach CrazyGames-Regeln: Titelbild als
//                                                      erstes Bild, dann nur Gameplay, kein Ton, Hochformat 2:3 (1080x1620)
//                                                      bzw. 16:9 (1920x1080); dist/promo/ember-night-preview-*.mp4
// Ohne Ton (Musik kommt in der App dazu); Laufzeit etwa 2 Minuten pro Fassung.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'dist', 'promo');
const FPS = 30;
const args = process.argv.slice(2);
const linkArg = args.indexOf('--link') >= 0 ? args[args.indexOf('--link') + 1] : null;
const story = args.includes('--story');
const preview = args.includes('--preview');
const landscape = args.includes('--landscape');
const vlang = args.indexOf('--lang') >= 0 ? args[args.indexOf('--lang') + 1] : 'en';
const script = story ? 'story' : preview ? 'preview' : 'trailer';
const base = story ? 'ember-night-story-' + vlang : preview ? 'ember-night-preview-' + (landscape ? 'landscape' : 'portrait') : 'ember-night-promo';
const VIEW = landscape ? { width: 960, height: 540 } : preview ? { width: 540, height: 810 } : { width: 540, height: 960 };

async function render(variant, link, file) {
  const frames = path.join(OUT, 'frames-' + variant);
  fs.rmSync(frames, { recursive: true, force: true });
  fs.mkdirSync(frames, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2, locale: 'en-US' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Normale Spielschleife abschalten: die Regie rechnet jedes Bild selbst
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.waitForFunction(() => window.Glutnacht && document.fonts.status === 'loaded');
  await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'director.js'), 'utf8') + '\nwindow.Promo = Promo;' });
  await page.evaluate(o => Promo.init(o), { endVariant: variant, link: link || '', script, lang: vlang });
  const total = await page.evaluate(f => Promo.totalFrames(f), FPS);
  let start = 0;
  if (preview) {
    // Erstes Bild = Titelbild (Vorgabe des Portals), 0,8 s lang stehen lassen
    await page.evaluate(l => Promo.cover(l), landscape ? 'landscape' : 'portrait');
    const first = path.join(frames, '00000.jpg');
    await page.screenshot({ path: first, type: 'jpeg', quality: 93 });
    for (start = 1; start < Math.round(0.8 * FPS); start++) fs.copyFileSync(first, path.join(frames, String(start).padStart(5, '0') + '.jpg'));
    await page.evaluate(() => { Sprites.setScale(2); Promo.ov.innerHTML = ''; Promo.flashEl = null; Promo.tap = null; });
  }
  for (let i = start; ; i++) {
    const more = await page.evaluate(dt => Promo.tick(dt), 1 / FPS);
    if (!more) break;
    await page.screenshot({ path: path.join(frames, String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 93 });
    if (i % 60 === 0) process.stdout.write(`  ${variant}: ${i}/${total}\r`);
  }
  await browser.close();
  if (errors.length) console.log('Fehler im Spiel:', errors);
  // Portal-Vorschau ganz ohne Tonspur, TikTok-Fassungen mit stummer Spur (manche Apps verlangen eine)
  const audioIn = preview ? [] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest'];
  const audioOut = preview ? ['-an'] : ['-c:a', 'aac', '-b:a', '128k'];
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, '%05d.jpg'), ...audioIn,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', preview ? '20' : '18', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    ...audioOut, '-movflags', '+faststart', file]);
  fs.rmSync(frames, { recursive: true, force: true });
  console.log(file + ': ' + Math.round(fs.statSync(file).size / 1024) + ' KB');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await render('bio', '', path.join(OUT, base + '.mp4'));
  if (linkArg) await render('link', linkArg, path.join(OUT, base + '-link.mp4'));
  if (args.includes('--blank')) await render('link', '', path.join(OUT, base + '-blank.mp4'));
})();
