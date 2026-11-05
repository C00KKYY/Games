// Erzeugt assets/audio.js aus den CC0-Aufnahmen in assets/audio/ (Herkunft: assets/CREDITS-audio.txt).
//   node tools/build-audio.js
// Jede mp3 wird als base64 (ohne data:-Präfix) in window.ASSET_DATA.audio abgelegt. Die Datei wird per
// <script> geladen (kein fetch, funktioniert auch über file://) und von tools/build-single.js eingebettet.
// Für die Musik werden zusätzlich Encoder-Verzögerung und Auffüllung aus dem LAME-/Info-Kopf gelesen:
// js/audio.js setzt damit loopStart/loopEnd, auch wenn ein Browser (Safari) die Auffüllung nicht entfernt.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'audio');
const OUT = path.join(ROOT, 'assets', 'audio.js');

// Liest Rahmenzahl, Verzögerung und Auffüllung aus dem Xing/Info- und LAME-Kopf einer mp3 (null, wenn keiner da ist)
function lameInfo(b) {
  let o = 0;
  if (b.slice(0, 3).toString() === 'ID3') o = 10 + ((b[6] & 127) << 21 | (b[7] & 127) << 14 | (b[8] & 127) << 7 | (b[9] & 127));
  const win = b.slice(o, o + 200).toString('latin1');
  let p = win.indexOf('Info');
  if (p < 0) p = win.indexOf('Xing');
  if (p < 0) return null;
  p += o;
  const flags = b.readUInt32BE(p + 4);
  let q = p + 8, frames = 0;
  if (flags & 1) { frames = b.readUInt32BE(q); q += 4; }
  if (flags & 2) q += 4;
  if (flags & 4) q += 100;
  if (flags & 8) q += 4;
  const d = b.slice(q + 21, q + 24);
  const delay = (d[0] << 4) | (d[1] >> 4), pad = ((d[1] & 15) << 8) | d[2];
  // Abtastrate aus dem ersten Rahmenkopf (MPEG-1 Layer III: 44100/48000/32000)
  const rate = [44100, 48000, 32000][(b[o + 2] >> 2) & 3] || 44100;
  return { frames, delay, pad, rate, samples: frames * 1152 - delay - pad };
}

const out = { sfx: {}, music: {} };
let total = 0, raw = 0;
for (const kind of ['sfx', 'music']) {
  const dir = path.join(SRC, kind);
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.mp3')).sort()) {
    const b = fs.readFileSync(path.join(dir, f));
    const b64 = b.toString('base64');
    const id = f.replace(/\.mp3$/, '');
    raw += b.length; total += b64.length;
    if (kind === 'sfx') out.sfx[id] = b64;
    else {
      const li = lameInfo(b) || {};
      out.music[id] = { rate: li.rate || 44100, samples: li.samples || 0, delay: li.delay || 0, pad: li.pad || 0, b64 };
    }
  }
}

const js = '// Erzeugt von tools/build-audio.js aus assets/audio/ (CC0, Herkunft in assets/CREDITS-audio.txt) - nicht von Hand bearbeiten.\n' +
  'window.ASSET_DATA = window.ASSET_DATA || {};\n' +
  'window.ASSET_DATA.audio = ' + JSON.stringify(out) + ';\n' +
  '// Steht in index.html nach js/audio.js (der Start wartet nicht auf diese Datei): Bescheid geben\n' +
  "if (typeof Sfx !== 'undefined' && Sfx.onData) Sfx.onData();\n";
fs.writeFileSync(OUT, js);
console.log(OUT + ': ' + Object.keys(out.sfx).length + ' Effekte, ' + Object.keys(out.music).length + ' Musikstücke, ' +
  (raw / 1048576).toFixed(2) + ' MB mp3, ' + (total / 1048576).toFixed(2) + ' MB base64 (' + total + ' Zeichen)');
for (const [id, m] of Object.entries(out.music)) console.log('  ' + id + ': ' + (m.samples / m.rate).toFixed(3) + ' s (Verzögerung ' + m.delay + ', Auffüllung ' + m.pad + ')');
