// Bündelt das Spiel in eine einzige HTML-Datei (CSS und JS inline).
//   node tools/build-single.js [ausgabe.html]
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const out = process.argv[2] || path.join(ROOT, 'glutnacht.html');
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (m, f) =>
  '<style>\n' + fs.readFileSync(path.join(ROOT, f), 'utf8') + '</style>');
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (m, f) =>
  '<script>\n' + fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/<\/script/gi, '<\\/script') + '</script>');

fs.writeFileSync(out, html);
console.log(out + ': ' + Math.round(html.length / 1024) + ' KB');
