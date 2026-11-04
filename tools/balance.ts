/**
 * npm run balance [-- --minutes 10 --seeds 3]
 * Runs casual + optimal bots headless and checks the pacing table (Brief §4.2, casual ±20 %, optimal ≤ 35 % faster)
 * and the tempo rules (§4.3). Writes qa/balance.md + qa/balance.csv. Exit code 1 on failures.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { runBot, type BotReport } from './bots';

/** pacing rows: milestone key → [lo, hi] real seconds (Brief §4.2) */
export const PACING: { key: string; label: string; lo: number; hi: number; upTo: number }[] = [
  { key: 'release1', label: 'Erste Entlassung (Earl)', lo: 35, hi: 90, upTo: 10 },
  { key: 'tutorialDone', label: 'Tutorial-Ende', lo: 70, hi: 90, upTo: 10 },
  { key: 'built:workshop', label: 'Strickstube steht', lo: 90, hi: 135, upTo: 10 },
  { key: 'tunnel1', label: 'Gescripteter Löffel-Tunnel', lo: 180, hi: 210, upTo: 10 },
  { key: 'star1', label: '1★', lo: 180, hi: 210, upTo: 10 },
  { key: 'built:classroom', label: 'Klassenzimmer gebaut', lo: 210, hi: 270, upTo: 10 },
  { key: 'built:guard', label: 'Wachposten gebaut', lo: 270, hi: 330, upTo: 10 },
  { key: 'obj:beds12', label: 'Zellen vergrößert (12 Betten)', lo: 330, hi: 390, upTo: 10 },
  { key: 'built:yard', label: 'Hof gebaut', lo: 390, hi: 450, upTo: 10 },
  { key: 'release4', label: '4. Entlassung', lo: 450, hi: 540, upTo: 10 },
  { key: 'milestone:canteen5', label: 'Kantine Lv5 (Meilenstein)', lo: 450, hi: 540, upTo: 10 },
  { key: 'star2', label: '2★ / Projekttafel', lo: 450, hi: 540, upTo: 10 },
  { key: 'foodFight1', label: 'Essensschlacht', lo: 600, hi: 630, upTo: 15 },
  { key: 'parcel1', label: 'Parzelle 2', lo: 720, hi: 840, upTo: 15 },
  { key: 'star3', label: '3★ / erste Leitung', lo: 840, hi: 960, upTo: 30 },
  { key: 'milestone:workshop15', label: 'Kernraum Lv15', lo: 960, hi: 1200, upTo: 30 },
  { key: 'inspectionReady', label: 'Inspektion möglich', lo: 1320, hi: 1800, upTo: 30 },
];

export interface Row { key: string; label: string; lo: number; hi: number; casual: number | null; optimal: number | null; ok: boolean; note: string }

export function evaluate(minutes: number, seeds: number[]) {
  const casual = seeds.map(s => runBot({ profile: 'casual', seed: s, minutes }));
  const optimal = seeds.map(s => runBot({ profile: 'optimal', seed: s, minutes }));
  const med = (rs: BotReport[], k: string) => { const v = rs.map(r => r.milestones[k]).filter(x => x !== undefined).sort((a, b) => a - b); return v.length === rs.length ? v[Math.floor(v.length / 2)] : null; };
  const rows: Row[] = [];
  for (const p of PACING.filter(p => p.upTo <= minutes || p.hi <= minutes * 60)) {
    if (p.lo > minutes * 60) continue;
    const c = med(casual, p.key), o = med(optimal, p.key);
    let ok = true; const notes: string[] = [];
    if (c === null) { ok = false; notes.push('casual: nie erreicht'); }
    else if (c < p.lo * 0.8 || c > p.hi * 1.2) { ok = false; notes.push(`casual außerhalb ±20 %`); }
    if (c !== null && o !== null && o < c * 0.65) { ok = false; notes.push('optimal > 35 % schneller'); }
    rows.push({ key: p.key, label: p.label, lo: p.lo, hi: p.hi, casual: c, optimal: o, ok, note: notes.join('; ') });
  }
  // §4.3 tempo rules on the casual bot
  const tempo: string[] = [];
  for (const r of casual) {
    const nt = r.newThings.filter(t => t <= Math.min(900, minutes * 60)).sort((a, b) => a - b);
    let maxGap = 0; for (let i = 1; i < nt.length; i++) maxGap = Math.max(maxGap, nt[i] - nt[i - 1]);
    if (maxGap > 120) tempo.push(`seed ${r.seed}: Lücke ${maxGap} s ohne Neues (> 120)`);
    const idle = Math.max(0, ...r.idleGaps);
    if (idle > 45) tempo.push(`seed ${r.seed}: ${idle.toFixed(0)} s ohne leistbaren Kauf (> 45)`);
  }
  return { rows, tempo, casual, optimal };
}

const fmt = (s: number | null) => (s === null ? '—' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);

function mix(r: BotReport) {
  const i = r.income; const tot = (i.release ?? 0) + (i.crates ?? 0) + (i.board ?? 0);
  const all = Object.values(i).reduce((s, v) => s + v, 0);
  return { release: (i.release ?? 0) / tot, crates: (i.crates ?? 0) / tot, board: (i.board ?? 0) / tot, wages: (r.spend.wages ?? 0) / all };
}

if (process.argv[1]?.endsWith('balance.ts')) {
  const args = process.argv.slice(2);
  const minutes = Number(args[args.indexOf('--minutes') + 1] || 10);
  const nSeeds = Number(args[args.indexOf('--seeds') + 1] || 3);
  const seeds = Array.from({ length: nSeeds }, (_, k) => 11 + k * 17);
  const t0 = Date.now();
  const { rows, tempo, casual, optimal } = evaluate(minutes, seeds);
  const lines: string[] = [];
  lines.push(`# Balance-Report (${minutes} min, Seeds ${seeds.join(', ')}) – ${new Date().toISOString().slice(0, 16)}`, '');
  lines.push('| Zeile | Soll | Casual (Median) | Optimal (Median) | ok | Hinweis |', '|---|---|---|---|---|---|');
  for (const r of rows) lines.push(`| ${r.label} | ${fmt(r.lo)}–${fmt(r.hi)} | ${fmt(r.casual)} | ${fmt(r.optimal)} | ${r.ok ? '✅' : '❌'} | ${r.note} |`);
  lines.push('', '## Taktung (§4.3)', tempo.length ? tempo.map(t => '- ' + t).join('\n') : '- ok');
  lines.push('', '## Casual-Bot: Endstand je Seed');
  for (const r of casual) {
    const m = mix(r);
    lines.push(`- seed ${r.seed}: coins ${r.final.coins}, Ruf ${r.final.ruf} (${r.final.stars}★), entlassen ${r.final.released}, Schlingel ${r.final.rascals}/${r.final.beds} Betten, gefangen ${r.final.caught}, entkommen ${r.final.escaped}, Teleports ${r.final.teleports} · Mix Entl. ${(m.release * 100).toFixed(0)} % / Kisten ${(m.crates * 100).toFixed(0)} % / Kost ${(m.board * 100).toFixed(0)} % · Löhne ${(m.wages * 100).toFixed(0)} %`);
    lines.push(`  - Ruf-Quellen: ${Object.entries(r.rufBy).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  }
  lines.push('', '## Ruf/Coins pro Minute (Casual, erster Seed)', '', '| min | coins | Ruf | entlassen | Schlingel | Betten | Laune |', '|---|---|---|---|---|---|---|');
  for (const m of casual[0].minutes) lines.push(`| ${m.m} | ${m.coins} | ${m.ruf} | ${m.released} | ${m.rascals} | ${m.beds} | ${m.mood} |`);
  mkdirSync('qa', { recursive: true });
  writeFileSync('qa/balance.md', lines.join('\n'));
  writeFileSync('qa/balance.csv', ['profile,seed,minute,coins,ruf,released,rascals,beds,mood', ...[...casual, ...optimal].flatMap(r => r.minutes.map(m => [r.profile, r.seed, m.m, m.coins, m.ruf, m.released, m.rascals, m.beds, m.mood].join(',')))].join('\n'));
  console.log(lines.slice(0, rows.length + 12).join('\n'));
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(rows.every(r => r.ok) && !tempo.length ? 0 : 1);
}
