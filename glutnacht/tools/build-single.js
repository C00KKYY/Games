// Bündelt das Spiel in eine einzige HTML-Datei (CSS, JS und Schriften inline).
//   node tools/build-single.js [ausgabe.html]             -> vollständige HTML-Datei
//   node tools/build-single.js <ausgabe.html> --fragment  -> ohne <html>/<head>/<body> (für Einbettungen;
//     die Gastseite muss UTF-8 und viewport-fit=cover deklarieren)
//   node tools/build-single.js --crazygames               -> dist/crazygames/index.html
//     (eine einzige Datei mit CrazyGames-SDK v3 und eingebetteten Schriftlizenzen; CrazyGames nimmt
//     keine Archive, die Datei wird direkt in die Upload-Zone gezogen)
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const crazy = args.includes('--crazygames');
const SDK_TAG = '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>';

function build() {
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (m, f) => {
    let css = fs.readFileSync(path.join(ROOT, f), 'utf8');
    // Schriften als data:-URI einbetten, damit die Datei ohne Nachladen auskommt
    css = css.replace(/url\(\.\.\/(fonts\/[^)]+\.woff2)\)/g, (mm, ff) =>
      'url(data:font/woff2;base64,' + fs.readFileSync(path.join(ROOT, ff)).toString('base64') + ')');
    return '<style>\n' + css + '</style>';
  });
  html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (m, f) =>
    '<script>\n' + fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/<\/script/gi, '<\\/script') + '</script>');
  // Das SDK muss vor dem Spielcode geladen werden
  if (crazy) html = html.replace('<script>', SDK_TAG + '\n<script>');
  // Die Schriften stecken in der Datei, also gehören ihre Lizenzen (SIL OFL) auch hinein
  const lic = fs.readdirSync(path.join(ROOT, 'fonts')).filter(f => f.endsWith('.txt'))
    .map(f => '=== ' + f + ' ===\n' + fs.readFileSync(path.join(ROOT, 'fonts', f), 'utf8')).join('\n');
  html = html.replace('</body>', '<script type="text/plain" id="font-licenses">\n' + lic.replace(/<\//g, '<\\/') + '</script>\n</body>');
  if (fragment) {
    html = html
      .replace(/<!doctype html>\s*/i, '')
      .replace(/<\/?(html|body)[^>]*>\s*/gi, '')
      .replace(/<\/?head>\s*/gi, '')
      .replace(/<meta charset="utf-8">\s*/i, '')
      .replace(/<meta name="viewport"[^>]*>\s*/i, '')
      .replace(/<meta name="(description|theme-color)"[^>]*>\s*/gi, '')
      .replace('<div id="app">', '<div id="app" lang="en">');
  }
  return html;
}

const html = build();
if (crazy) {
  const dir = path.join(ROOT, 'dist', 'crazygames');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  console.log(path.join(dir, 'index.html') + ': ' + Math.round(html.length / 1024) + ' KB');
} else {
  const out = args.find(a => !a.startsWith('--')) || path.join(ROOT, 'dist', 'glutnacht.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(out + ': ' + Math.round(html.length / 1024) + ' KB');
}
