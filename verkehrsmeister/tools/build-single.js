// Bündelt das Spiel in eine einzelne HTML-Datei.
//   node tools/build-single.js <ausgabe.html>          -> vollständiges Dokument, Three.js eingebettet
//   node tools/build-single.js <ausgabe.html> --cdn    -> Three.js vom CDN (kleinere Datei)
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const out = process.argv[2] || path.join(ROOT, 'dist', 'verkehrsmeister.html');
const cdn = process.argv.includes('--cdn');
const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [...index.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
const js = scripts
  .filter(s => !(cdn && s.startsWith('vendor/')))
  .map(s => `// ---- ${s}\n` + fs.readFileSync(path.join(ROOT, s), 'utf8'))
  .join('\n;\n')
  .replace(/<\/script/gi, '<\\/script');
const pre = cdn ? `<script src="${THREE_CDN}"></script>\n` : '';
const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800&family=Barlow+Condensed:wght@600;700;800&display=swap">';
const body = '<div id="app">\n  <canvas id="view" aria-label="Spielwelt"></canvas>\n  <canvas id="overlay" aria-hidden="true"></canvas>\n  <div id="ui"></div>\n</div>';
const html = `<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>Verkehrsmeister 3D</title>\n${fonts}\n<style>\n${css}\n</style>\n</head>\n<body>\n${body}\n${pre}<script>\n${js}\n</script>\n</body>\n</html>\n`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('geschrieben:', out, (html.length / 1024).toFixed(0) + ' KB');
