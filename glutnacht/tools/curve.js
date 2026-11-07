'use strict';
// Spannungsverlauf (M10): Telemetrie des starken Bots in Zeitabschnitten, je Land gemittelt.
//   node tools/curve.js <läufe> <land:preset:nachtstufe> [weitere …]      Läufe ausführen (PAR parallel, Standard 4)
//   node tools/curve.js --report <roh.jsonl> [weitere …]                  nur auswerten
// Umgebung: OUT=<roh.jsonl> (Läufe anhängen), JSON=<datei.json> (Mittelwerte je Abschnitt), BUCKET=30 (Sekunden),
//   TMAX (Standard: Länge des Landes; danach läuft nur noch der Endbosskampf), DETAIL=480 (bis hier 30-s-Abschnitte,
//   danach je Minute zusammengefasst).
// Die Läufe nutzen tools/balancebot.js mit TELEM (das Spiel bleibt unverändert). Spalten:
//   n Läufe noch am Leben · Stufe am Ende · Aufstiege · nDPS = Σ Schaden × Anzahl / Abklingzeit der Waffen (nominell,
//   ein Ziel) · HP = mittlere Lebenspunkte eines neuen Gegners aus dem Nachschub · TTK = HP / nDPS (s) · Last =
//   Lebenspunkte aller neuen Gegner je s / nDPS (< 1: die Waffen sind dem Nachschub voraus) · Feld = Lebenspunkte
//   aller lebenden Gegner / nDPS (s) · lebend · ≤150 = Gegner in 150 px · nah% = Anteil der Zeit mit einem Gegner
//   in Berührungsnähe (Rand + 40 px) oder einem Geschoss in 80 px · leer% = ohne jede Gefahr in 250 px · K/s Kills ·
//   XP/s · Sch/min Schaden am Helden · Tr/min Treffer · HP% Leben · Gesch/min Gegnergeschosse in 450 px · Boss% Zeit
//   mit lebendem Boss · Ereignisse/Bosse im Abschnitt (aus den Landdaten).
const { execFile } = require('child_process');
const fs = require('fs'), path = require('path');
const HEROES = ['aron', 'mira', 'kael', 'sela', 'brom', 'nyx', 'eira', 'lio', 'ignis'];
const BUCKET = +(process.env.BUCKET || 30);
const DETAIL = +(process.env.DETAIL || 480);
const PAR = +(process.env.PAR || 4);

function stages() {
  const vm = require('vm'), ctx = { console, Math, JSON, localStorage: { getItem: () => null, setItem() {} } };
  vm.createContext(ctx);
  const dir = path.join(__dirname, '..', 'js');
  vm.runInContext(['util.js', 'lang.js', 'data.js'].map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n;\n') + '\n;this.__S = STAGES;', ctx);
  return ctx.__S;
}
const STAGES = stages();
const stageOf = id => STAGES.find(s => s.id === id);

function runAll(n, specs, done) {
  const jobs = [];
  for (const sp of specs) for (let i = 0; i < n; i++) jobs.push({ sp, hero: HEROES[i % HEROES.length] });
  let next = 0, running = 0, fin = 0;
  const res = [];
  const go = () => {
    while (running < PAR && next < jobs.length) {
      const j = jobs[next++]; running++;
      const tmax = +(process.env.TMAX || stageOf(j.sp.stage).minutes * 60);
      execFile('node', [path.join(__dirname, 'balancebot.js'), j.hero, j.sp.heat, 1, j.sp.preset, j.sp.stage, tmax],
        { maxBuffer: 1 << 26, env: Object.assign({}, process.env, { TELEM: String(BUCKET), WALL: process.env.WALL || '900000' }) }, (err, out) => {
          running--; fin++;
          try {
            const r = JSON.parse(out.trim().split('\n').pop());
            r.tmax = tmax; res.push(r);
            if (process.env.OUT) fs.appendFileSync(process.env.OUT, JSON.stringify(r) + '\n');
          } catch (e) { console.error('Fehler', j.hero, j.sp.stage, err && err.message); }
          if (fin % 8 === 0) console.error(`  ${fin}/${jobs.length}`);
          if (fin === jobs.length) done(res); else go();
        });
    }
  };
  go();
}

const KEYS = ['lv', 'lvUps', 'ndps', 'avgHp', 'ttk', 'load', 'clearT', 'alive', 'aliveN', 'near300', 'near150', 'minD', 'close', 'idle', 'kps', 'xps', 'taken', 'hits', 'hpf', 'shotsNear', 'bossShotsNear',
  'boss', 'atCap', 'boost', 'spawnRate', 'dirRate', 'dps', 'raw', 'scr', 'life', 'dd', 'hpMul', 'eshots', 'nW', 'evo'];

function events(st, a, b) {
  const out = [];
  for (const e of st.events) if (e.t >= a && e.t < b) out.push(`${e.t}s ${e.kind} ${e.mix ? Object.entries(e.mix).map(([k, v]) => k + '×' + v).join('+') : e.type + '×' + e.n}`);
  for (const x of st.bosses) if (x.t >= a && x.t < b) out.push(`${x.t}s BOSS ${x.id}`);
  for (let t = Math.ceil(a / 60) * 60; t < b; t += 60) if (t > 0 && t < st.minutes * 60) out.push(`${t}s Welle ${t / 60 + 1}`);
  if (a <= 30 && 30 < b) out.push('30s Elite'); for (let t = 90; t < st.minutes * 60; t += 60) if (t >= a && t < b) out.push(`${t}s Elite`);
  return out;
}

function aggregate(runs) {
  const groups = {};
  for (const r of runs) { const k = `${r.stage}:${r.preset}:${r.heat}`; (groups[k] || (groups[k] = [])).push(r); }
  const out = {};
  for (const [k, R] of Object.entries(groups)) {
    const st = stageOf(R[0].stage), len = st.minutes * 60;
    const rows = [];
    // 30-s-Abschnitte bis DETAIL, danach Minuten
    const spans = [];
    for (let t = 0; t < Math.min(DETAIL, len); t += BUCKET) spans.push([t, t + BUCKET]);
    for (let t = DETAIL; t < len; t += 60) spans.push([t, t + 60]);
    for (const [a, b] of spans) {
      const bs = [];
      for (const r of R) for (const x of r.buckets || []) if (x.t >= a - 0.5 && x.t < b - 0.5) bs.push(x);
      if (!bs.length) continue;
      const runsIn = new Set(); for (const r of R) if ((r.buckets || []).some(x => x.t >= a - 0.5 && x.t < b - 0.5)) runsIn.add(r);
      const row = { t: a, t1: b, n: runsIn.size, ev: events(st, a, b) };
      for (const key of KEYS) {
        const v = bs.map(x => x[key]).filter(x => x !== null && x !== undefined && isFinite(x));
        row[key] = v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
      }
      // pro Minute statt pro Abschnitt
      for (const key of ['taken', 'hits', 'shotsNear', 'bossShotsNear']) if (row[key] !== null) row[key] *= 60 / BUCKET;
      // Mediane für verrauschte Werte
      const med = key => { const v = bs.map(x => x[key]).filter(x => x !== null && isFinite(x)).sort((p, q) => p - q); return v.length ? v[Math.floor(v.length / 2)] : null; };
      row.takenMed = med('taken') * 60 / BUCKET; row.ttkMed = med('ttk');
      row.hitShare = bs.filter(x => x.hits > 0).length / bs.length; // Anteil der Läufe mit mindestens einem Treffer im Abschnitt
      rows.push(row);
    }
    const deaths = R.filter(r => !r.won && r.t < r.tmax - 1).map(r => r.t).sort((a, b) => a - b);
    out[k] = { stage: R[0].stage, preset: R[0].preset, heat: R[0].heat, runs: R.length, deaths, wins: R.filter(r => r.won).length, rows };
  }
  return out;
}

const f = (x, d) => (x === null || x === undefined ? '–' : x.toFixed(d));
const mmss = t => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
function table(g) {
  const L = [];
  L.push(`### ${g.stage} ${g.preset} N${g.heat} (${g.runs} Läufe; Tode bei ${g.deaths.map(t => mmss(Math.round(t))).join(' ') || '–'})`);
  L.push('');
  L.push('| Zeit | n | Stufe | Aufst. | nDPS | HP | TTK s | Last | Feld s | lebend | ≤150 | nah% | leer% | K/s | XP/s | Sch/min | Tr/min | HP% | Gesch/min | Boss% | Ereignisse |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of g.rows) {
    L.push(`| ${mmss(r.t)} | ${r.n} | ${f(r.lv, 1)} | ${f(r.lvUps, 1)} | ${f(r.ndps, 0)} | ${f(r.avgHp, 0)} | ${f(r.ttk, 2)} | ${f(r.load, 2)} | ${f(r.clearT, 1)} | ${f(r.alive, 0)} | ${f(r.near150, 1)} | ${f(r.close * 100, 0)} | ${f(r.idle * 100, 1)} | ${f(r.kps, 1)} | ${f(r.xps, 1)} | ${f(r.taken, 1)} | ${f(r.hits, 2)} | ${f(r.hpf * 100, 0)} | ${f(r.shotsNear, 0)} | ${f(r.boss * 100, 0)} | ${r.ev.join('; ')} |`);
  }
  return L.join('\n');
}

function main() {
  const a = process.argv.slice(2);
  const finish = runs => {
    const agg = aggregate(runs);
    if (process.env.JSON) fs.writeFileSync(process.env.JSON, JSON.stringify(agg, null, 1));
    for (const g of Object.values(agg)) console.log(table(g) + '\n');
  };
  if (a[0] === '--report') {
    const runs = [];
    for (const file of a.slice(1)) for (const line of fs.readFileSync(file, 'utf8').split('\n')) if (line.trim()) runs.push(JSON.parse(line));
    finish(runs);
  } else {
    const n = +a[0];
    const specs = a.slice(1).map(s => { const [stage, preset, heat] = s.split(':'); return { stage, preset, heat: +heat || 0 }; });
    runAll(n, specs, finish);
  }
}
module.exports = { aggregate, table, events };
if (require.main === module) main();
