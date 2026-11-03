'use strict';
// Führt den Balance-Bot parallel für mehrere Konfigurationen aus und fasst zusammen.
//   node tools/balance-batch.js <läufe> <land:preset:nachtstufe> [weitere …]
//   z. B. node tools/balance-batch.js 12 ashwood:none:0 ashwood:light:0
const { execFile } = require('child_process');
const path = require('path');
const HEROES = ['aron', 'mira', 'kael', 'sela', 'brom', 'nyx', 'eira', 'lio', 'ignis'];
const n = +process.argv[2];
const specs = process.argv.slice(3).map(s => { const [stage, preset, heat] = s.split(':'); return { stage, preset, heat: +heat || 0, res: [] }; });
const jobs = [];
for (const sp of specs) for (let i = 0; i < n; i++) jobs.push({ sp, hero: HEROES[i % HEROES.length] });
const PAR = +(process.env.PAR || require('os').cpus().length);
let next = 0, running = 0;
function run() {
  while (running < PAR && next < jobs.length) {
    const j = jobs[next++]; running++;
    execFile('node', [path.join(__dirname, 'balancebot.js'), j.hero, j.sp.heat, 1, j.sp.preset, j.sp.stage], { maxBuffer: 1 << 26 }, (err, out) => {
      running--;
      try { j.sp.res.push(JSON.parse(out.trim().split('\n').pop())); } catch (e) { console.error('Fehler', j.hero, err && err.message); }
      if (next >= jobs.length && running === 0) report(); else run();
    });
  }
}
function report() {
  for (const sp of specs) {
    const R = sp.res, wins = R.filter(r => r.won), deaths = R.filter(r => !r.won).map(r => r.t / 60).sort((a, b) => a - b);
    const med = deaths.length ? deaths[Math.floor(deaths.length / 2)].toFixed(1) : '-';
    const lv = m => { const v = R.map(r => r.mins.find(x => x.m === m)).filter(Boolean); return v.length ? Math.round(v.reduce((a, x) => a + x.lvl, 0) / v.length) : '-'; };
    const tk = m => { const v = R.map(r => r.mins.find(x => x.m === m)).filter(Boolean); return v.length ? Math.round(v.reduce((a, x) => a + x.taken, 0) / v.length) : '-'; };
    console.log(`${sp.stage} ${sp.preset} N${sp.heat}: Siege ${wins.length}/${R.length} (${Math.round(wins.length / R.length * 100)} %), Tod Median ${med} min [${deaths.map(d => d.toFixed(1)).join(' ')}]` +
      `  Stufe m3/m6/m9/m12: ${lv(3)}/${lv(6)}/${lv(9)}/${lv(12)}  Schaden/min m3/m6/m9/m12: ${tk(3)}/${tk(6)}/${tk(9)}/${tk(12)}` +
      `  Siege: ${wins.map(r => r.char).join(',')}`);
    if (process.env.OUT) require('fs').appendFileSync(process.env.OUT, R.map(r => JSON.stringify(r)).join('\n') + '\n');
  }
}
run();
