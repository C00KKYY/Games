// Bündelt das Spiel in eine einzige HTML-Datei (CSS und JS inline).
//   node tools/build-single.js [ausgabe.html]             -> vollständige HTML-Datei
//   node tools/build-single.js <ausgabe.html> --fragment  -> ohne <html>/<head>/<body> (für Einbettungen)
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const out = args.find(a => !a.startsWith('--')) || path.join(ROOT, 'glutnacht.html');
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (m, f) =>
  '<style>\n' + fs.readFileSync(path.join(ROOT, f), 'utf8') + '</style>');
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (m, f) =>
  '<script>\n' + fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/<\/script/gi, '<\\/script') + '</script>');

if (fragment) {
  html = html
    .replace(/<!doctype html>\s*/i, '')
    .replace(/<\/?(html|body)[^>]*>\s*/gi, '')
    .replace(/<\/?head>\s*/gi, '')
    .replace(/<meta charset="utf-8">\s*/i, '')
    .replace(/<meta name="viewport"[^>]*>\s*/i, '');
}

fs.writeFileSync(out, html);
console.log(out + ': ' + Math.round(html.length / 1024) + ' KB');
