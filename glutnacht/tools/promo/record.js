// Rendert das Werbevideo (Hochformat 1080x1920, 30 fps) aus echten Spielszenen.
//   node tools/promo/record.js                      -> dist/promo/ember-night-promo.mp4 (Endkarte "LINK IN BIO")
//   node tools/promo/record.js --link "crazygames.com/game/ember-night"
//                                                   -> zusätzlich ember-night-promo-link.mp4 mit diesem Link
//   node tools/promo/record.js --blank              -> zusätzlich eine Fassung mit leerem Link-Feld
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

async function render(variant, link, file) {
  const frames = path.join(OUT, 'frames-' + variant);
  fs.rmSync(frames, { recursive: true, force: true });
  fs.mkdirSync(frames, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, locale: 'en-US' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Normale Spielschleife abschalten: die Regie rechnet jedes Bild selbst
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.waitForFunction(() => window.Glutnacht && document.fonts.status === 'loaded');
  await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'director.js'), 'utf8') + '\nwindow.Promo = Promo;' });
  await page.evaluate(o => Promo.init(o), { endVariant: variant, link: link || '' });
  const total = await page.evaluate(f => Promo.totalFrames(f), FPS);
  for (let i = 0; ; i++) {
    const more = await page.evaluate(dt => Promo.tick(dt), 1 / FPS);
    if (!more) break;
    await page.screenshot({ path: path.join(frames, String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 93 });
    if (i % 60 === 0) process.stdout.write(`  ${variant}: ${i}/${total}\r`);
  }
  await browser.close();
  if (errors.length) console.log('Fehler im Spiel:', errors);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, '%05d.jpg'),
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', file]);
  fs.rmSync(frames, { recursive: true, force: true });
  console.log(file + ': ' + Math.round(fs.statSync(file).size / 1024) + ' KB');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await render('bio', '', path.join(OUT, 'ember-night-promo.mp4'));
  if (linkArg) await render('link', linkArg, path.join(OUT, 'ember-night-promo-link.mp4'));
  if (args.includes('--blank')) await render('link', '', path.join(OUT, 'ember-night-promo-blank.mp4'));
})();
