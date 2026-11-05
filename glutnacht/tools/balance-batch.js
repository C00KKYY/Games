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
let next = 0, running = 0, shown = 0;
function run() {
  while (running < PAR && next < jobs.length) {
    const j = jobs[next++]; running++;
    execFile('node', [path.join(__dirname, 'balancebot.js'), j.hero, j.sp.heat, 1, j.sp.preset, j.sp.stage], { maxBuffer: 1 << 26 }, (err, out) => {
      running--;
      try { j.sp.res.push(JSON.parse(out.trim().split('\n').pop())); } catch (e) { console.error('Fehler', j.hero, err && err.message); }
      j.sp.done = (j.sp.done || 0) + 1;
      // fertige Konfigurationen sofort (in Reihenfolge) ausgeben
      while (shown < specs.length && specs[shown].done === n) report(specs[shown++]);
      run();
    });
  }
}
function report(sp) {
  {
    const R = sp.res, wins = R.filter(r => r.won), deaths = R.filter(r => !r.won).map(r => r.t / 60).sort((a, b) => a - b);
    const med = deaths.length ? deaths[Math.floor(deaths.length / 2)].toFixed(1) : '-';
    const lv = m => { const v = R.map(r => r.mins.find(x => x.m === m)).filter(Boolean); return v.length ? Math.round(v.reduce((a, x) => a + x.lvl, 0) / v.length) : '-'; };
    const tk = m => { const v = R.map(r => r.mins.find(x => x.m === m)).filter(Boolean); return v.length ? Math.round(v.reduce((a, x) => a + x.taken, 0) / v.length) : '-'; };
    console.log(`${sp.stage} ${sp.preset} N${sp.heat}: Siege ${wins.length}/${R.length} (${Math.round(wins.length / R.length * 100)} %), Tod Median ${med} min [${deaths.map(d => d.toFixed(1)).join(' ')}]` +
      `  Stufe m3/m6/m9/m12: ${lv(3)}/${lv(6)}/${lv(9)}/${lv(12)}  Schaden/min m3/m6/m9/m12: ${tk(3)}/${tk(6)}/${tk(9)}/${tk(12)}` +
      `  Siege: ${wins.map(r => r.char).join(',')}`);
    const av = f => { const v = R.map(f).filter(x => x !== null && x !== undefined); return v.length ? (v.reduce((a, x) => a + x, 0) / v.length).toFixed(1) : '-'; };
    const md = f => { const v = R.map(f).filter(x => x !== null && x !== undefined).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : '-'; };
    const tkm = m => av(r => { const x = r.mins.find(y => y.m === m); return x ? x.taken : null; });
    console.log(`   früh: Stufe@60s ${av(r => r.early && r.early.lvl60)}  erster Treffer (Median) ${md(r => r.early && r.early.firstHit)} s` +
      `  Schaden/min m0/m1/m2: ${tkm(0)}/${tkm(1)}/${tkm(2)}  im Bild @2/10/30/60 s: ${av(r => r.early && r.early.scr2)}/${av(r => r.early && r.early.scr10)}/${av(r => r.early && r.early.scr30)}/${av(r => r.early && r.early.scr60)}` +
      `  Truhe bis 60 s: ${R.filter(r => r.early && r.early.chest60 > 0).length}/${R.length}`);
    if (process.env.OUT) require('fs').appendFileSync(process.env.OUT, R.map(r => JSON.stringify(r)).join('\n') + '\n');
  }
}
run();
