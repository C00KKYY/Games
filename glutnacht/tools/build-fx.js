// Erzeugt assets/fx.js aus den Kenney-Effektgrafiken in assets/src/kenney/ (CC0).
//   node tools/build-fx.js
// Läuft im Chromium-Canvas von Playwright (keine nativen Abhängigkeiten): schrittweise verkleinern,
// bei Graustufen-Sprites die Helligkeit in den Alphakanal legen (weiß + Alpha, damit sie sich zur Laufzeit
// beliebig einfärben und additiv mischen lassen), als data:-URI (PNG bzw. WebP) in window.ASSET_DATA.fx ablegen.
// Die Datei wird per <script> geladen (kein fetch, funktioniert auch über file://) und von
// tools/build-single.js wie der übrige Code eingebettet.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'src', 'kenney');
const OUT = path.join(ROOT, 'assets', 'fx.js');

// Name im Spiel -> [Quelldatei, Kantenlänge, Graustufen?]
const LIST = {
  ring: ['circle_02.png', 128, true],       // Stufenaufstieg, Elite
  ringThick: ['circle_03.png', 128, true],  // Frostnova
  dot: ['circle_05.png', 64, true],         // weicher Punkt (Partikel, Füllungen)
  halo: ['light_01.png', 64, true],         // Schutzkugeln
  slash: ['slash_03.png', 128, true],       // Klinge
  twirl1: ['twirl_01.png', 128, true],      // Glutaura
  twirl2: ['twirl_02.png', 128, true],
  flame1: ['flame_05.png', 64, true],       // Feuerpfütze
  flame2: ['flame_06.png', 64, true],
  scorch: ['scorch_01.png', 64, true],
  zapHit: ['spark_01.png', 64, true],       // Blitz-Einschlag
  bolt1: ['spark_05.png', 128, true],       // senkrechter Blitz
  bolt2: ['spark_06.png', 128, true],
  boltH: ['spark_07.png', 128, true],       // waagrechter Blitz (Kettenblitz)
  spark: ['star_06.png', 32, true],         // Funke (Partikel)
  star: ['star_07.png', 64, true],          // Glitzern
  trace: ['trace_06.png', 64, true],        // Schweif
  flare: ['magic_05.png', 64, true],        // Aufblitzen
  explosion: ['explosion00.png', 128, false],
  burst: ['flash00.png', 128, false],
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const out = {};
  let total = 0;
  for (const [key, [file, size, grey]] of Object.entries(LIST)) {
    const src = 'data:image/png;base64,' + fs.readFileSync(path.join(SRC, file)).toString('base64');
    const url = await page.evaluate(async ({ src, size, grey }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      // Quadratisch einpassen, halbieren bis zur Zielgröße (saubere Verkleinerung)
      let w = Math.max(img.width, img.height);
      let c = document.createElement('canvas');
      c.width = c.height = w;
      c.getContext('2d').drawImage(img, (w - img.width) / 2, (w - img.height) / 2);
      while (w / 2 >= size) {
        const n = document.createElement('canvas');
        n.width = n.height = Math.round(w / 2);
        const g = n.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(c, 0, 0, n.width, n.height);
        c = n; w = n.width;
      }
      if (w !== size) {
        const n = document.createElement('canvas');
        n.width = n.height = size;
        const g = n.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(c, 0, 0, size, size);
        c = n;
      }
      const g = c.getContext('2d');
      if (grey) {
        const id = g.getImageData(0, 0, size, size), d = id.data;
        for (let i = 0; i < d.length; i += 4) {
          const a = d[i + 3] * d[i] / 255; // Helligkeit (R=G=B) mal Deckkraft
          d[i] = d[i + 1] = d[i + 2] = 255;
          d[i + 3] = Math.round(a);
        }
        g.putImageData(id, 0, 0);
      }
      // Farbige Sprites als WebP (Alpha bleibt erhalten, ein Drittel der Größe), Graustufen verlustfrei als PNG
      return grey ? c.toDataURL('image/png') : c.toDataURL('image/webp', 0.85);
    }, { src, size, grey });
    out[key] = url;
    total += url.length;
    console.log(key.padEnd(10) + file.padEnd(18) + size + ' px  ' + (url.length / 1024).toFixed(1) + ' KB');
  }
  await browser.close();
  const js = '// Erzeugt von tools/build-fx.js aus assets/src/kenney/ (Kenney, CC0) - nicht von Hand bearbeiten.\n' +
    'window.ASSET_DATA = window.ASSET_DATA || {};\n' +
    'window.ASSET_DATA.fx = ' + JSON.stringify(out, null, 0).replace(/","/g, '",\n"') + ';\n';
  fs.writeFileSync(OUT, js);
  console.log(path.relative(ROOT, OUT) + ': ' + (js.length / 1024).toFixed(1) + ' KB (base64 ' + (total / 1024).toFixed(1) + ' KB)');
})().catch(e => { console.error(e); process.exit(1); });
