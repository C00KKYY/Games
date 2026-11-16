#!/usr/bin/env node
'use strict';
// Compares the Roblox bot batch (tools/balance.sh output) with the web game's README table (M10, strong bot,
// 25-min limit). `--rows` prints the configurations (land forge heat), one per line.
//   node tools/balance-table.js <dir> [players]
const fs = require('fs');
const path = require('path');

// web README (glutnacht/README.md, "Siegquoten des starken Bots", M10): wins, runs, CI, median death, first hit
const WEB = [
  ['graveyard', 'none', 0, 'Alter Friedhof', 46, 144, '25–40 %', 7.9, 75],
  ['ashwood', 'none', 0, 'Aschenwald', 9, 72, '7–22 %', 7.1, 80],
  ['ashwood', 'light', 0, 'Aschenwald', 16, 72, '14–33 %', 8.2, 64],
  ['frostlake', 'light', 0, 'Eissee', 7, 36, '10–35 %', 10.3, 85],
  ['frostlake', 'mid', 0, 'Eissee', 31, 72, '32–55 %', 11.7, 85],
  ['ruins', 'mid', 0, 'Burgruine', 14, 72, '12–30 %', 10.0, 79],
  ['ruins', 'light', 0, 'Burgruine', 4, 72, '2–13 %', 8.2, 86],
  ['nightheart', 'mid', 0, 'Herz der Nacht', 4, 72, '2–13 %', 8.0, 65],
  ['nightheart', 'max', 0, 'Herz der Nacht', 37, 72, '40–63 %', 15.6, 71],
  ['graveyard', 'max', 5, 'Alter Friedhof, Nachtstufe 5', 52, 144, '29–44 %', 7.8, 59],
];

if (process.argv[2] === '--rows') {
  for (const r of WEB) console.log(r[0], r[1], r[2]);
  process.exit(0);
}
const dir = process.argv[2] || 'build/balance';
const players = process.argv[3] || '1';
// two-proportion z test (pooled), two-sided p
function zTest(a, n, b, m) {
  const p = (a + b) / (n + m), se = Math.sqrt(p * (1 - p) * (1 / n + 1 / m));
  return se > 0 ? (a / n - b / m) / se : 0;
}
console.log('| Land | Forge | Roblox sim: wins | 95 % | Web: wins | 95 % | z | Median death (sim / web) | First hit (sim / web) | Level @1/4/8 min |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const [land, forge, heat, name, ww, wn, wci, wd, wf] of WEB) {
  const f = path.join(dir, `${land}-${forge}-${heat}-p${players}.txt`);
  if (!fs.existsSync(f)) { console.log(`| ${name} | ${forge} | (missing) |`); continue; }
  const line = fs.readFileSync(f, 'utf8').split('\n').find(l => l.startsWith('== '));
  if (!line) { console.log(`| ${name} | ${forge} | (no result) |`); continue; }
  const m = line.match(/(\d+)\/(\d+) wins = (\d+) % \(95 %: (\d+)-(\d+) %\), open (\d+), median death ([\d.na]+) min, first hit ([\d.na]+) s, level @1\/4\/8 min ([^,]+),/);
  const [, w, n, pc, lo, hi, , md, fh, lv] = m;
  const z = zTest(+w, +n, ww, wn);
  console.log(`| ${name} | ${forge} | **${pc} %** (${w}/${n}) | ${lo}–${hi} % | ${Math.round(100 * ww / wn)} % (${ww}/${wn}) | ${wci} | ${z.toFixed(1)} | ${md} / ${wd} min | ${fh} / ${wf} s | ${lv} |`);
}
