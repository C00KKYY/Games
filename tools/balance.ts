/**
 * npm run balance [-- --minutes 30 --seeds 9 --bases 11,500,1000]
 * Brief §4.1–4.3, §12.9 H1/H1b/H2/H3 + key calibration (§3.17). Runs the bots headless and checks:
 *  - H1: every pacing row (casual median ±20 %, optimal ≤ 35 % faster), tempo rules §4.3 over the first 15 min
 *        (something new every ≤ 120 s, never > 45 s without affordable purchase or goal, no runaway), income mix and
 *        wage share at 15 and 30 min (§3.8), Ruf sources per minute
 *  - H1b: optimal bot with a good layout reaches the inspection ≥ 25 % faster than with a random layout
 *  - H2: naive (cheapest-first) ≥ 30 % slower to the inspection than the heuristic bot; random bot < 2★ in 30 min;
 *        ≥ 1 escape attempt and ≥ 1 food fight in 30 min
 *  - H3: first inspection possible for casual at 22–30 min, progression continues afterwards
 *  - keys: casual 4–6 base keys at the first inspection, with 2★ exactly 2 perks
 * Writes qa/balance.md + qa/balance.csv. Exit code 1 on failures.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { runBot, type BotReport, type Profile } from './bots';
import { keysFor } from '../src/content/balance';
import { PERKS } from '../src/content/progress';

/** pacing rows: milestone key → [lo, hi] real seconds (Brief §4.2) */
export const PACING: { key: string; label: string; lo: number; hi: number; upTo: number }[] = [
  { key: 'release1', label: 'Erste Entlassung (Earl)', lo: 35, hi: 70, upTo: 10 },
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
  { key: 'project1', label: 'Erstes Projekt gestartet', lo: 540, hi: 600, upTo: 15 },
  { key: 'foodFight1', label: 'Essensschlacht', lo: 600, hi: 630, upTo: 15 },
  { key: 'parcel1', label: 'Parzelle 2', lo: 720, hi: 840, upTo: 15 },
  { key: 'mailVisible', label: 'Tagespost-Icon', lo: 720, hi: 840, upTo: 15 },
  { key: 'star3', label: '3★', lo: 840, hi: 960, upTo: 30 },
  { key: 'lead1', label: 'Erste Leitung eingestellt', lo: 840, hi: 960, upTo: 30 },
  { key: 'milestone:workshop15', label: 'Kernraum Lv15', lo: 960, hi: 1200, upTo: 30 },
  { key: 'parcel2', label: 'Parzelle 3', lo: 1200, hi: 1440, upTo: 30 },
  { key: 'inspectionReady', label: 'Inspektion möglich (H3)', lo: 1320, hi: 1800, upTo: 30 },
  { key: 'inspection1', label: 'Inspektion ausgerufen', lo: 1320, hi: 1800, upTo: 30 },
];

/** minutes covered by the tempo rule (Brief §4.3: first 15 minutes) */
export const TEMPO_MIN = Number(process.env.TEMPO_MIN ?? 15);
/** Brief §3.8 target corridors */
export const MIX = { release: [0.4, 0.5], crates: [0.3, 0.4], boardMax: 0.2, wages: [0.2, 0.35] } as const;

export interface Row {
  key: string; label: string; lo: number; hi: number; casual: number | null; optimal: number | null;
  /** casual median per seed base */
  perBase: (number | null)[];
  /** seeds whose casual time lies outside ±20 % (informative; the brief's criterion is the median) */
  badSeeds: number; ok: boolean; note: string;
}

export const median = (v: number[]) => { const s = v.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
/** true median of a milestone; a seed that never reached it counts as +∞ */
export const medMs = (rs: BotReport[], k: string) => { const m = median(rs.map(r => r.milestones[k] ?? Infinity)); return Number.isFinite(m) ? m : null; };

export function mix(inc: Record<string, number>, spend: Record<string, number>) {
  const tot = (inc.release ?? 0) + (inc.crates ?? 0) + (inc.board ?? 0);
  const all = Object.entries(inc).filter(([k]) => k !== 'loan').reduce((s, [, v]) => s + v, 0);
  // wage share = wages OWED at the day ends (a broke bot pays only what it has, spend.wages hid that – balance pass M5)
  return { release: (inc.release ?? 0) / tot, crates: (inc.crates ?? 0) / tot, board: (inc.board ?? 0) / tot, wages: (spend.wagesDue ?? spend.wages ?? 0) / all };
}
export const mixOk = (m: ReturnType<typeof mix>) =>
  m.release >= MIX.release[0] && m.release <= MIX.release[1] && m.crates >= MIX.crates[0] && m.crates <= MIX.crates[1] && m.board <= MIX.boardMax && m.wages >= MIX.wages[0] && m.wages <= MIX.wages[1];

/** §4.3 tempo rules for one casual run */
export function tempoOf(r: BotReport, minutes: number) {
  const end = Math.min(TEMPO_MIN * 60, minutes * 60);
  const nt = [0, ...r.newThings.filter(t => t <= end)].sort((a, b) => a - b);
  let maxGap = 0, gapAt = 0;
  for (let i = 1; i < nt.length; i++) if (nt[i] - nt[i - 1] > maxGap) { maxGap = nt[i] - nt[i - 1]; gapAt = nt[i - 1]; }
  if (end - nt[nt.length - 1] > maxGap) { maxGap = end - nt[nt.length - 1]; gapAt = nt[nt.length - 1]; }
  const idle = Math.max(0, ...r.idleGaps);
  // runaway = coins above everything on offer for longer than a reaction (> 30 s in one stretch)
  return { maxGap, gapAt, idle, noSink: r.noSinkMax, ok: maxGap <= 120 && idle <= 45 && r.noSinkMax <= 30 };
}

/** casual base keys at the first inspection, and how many perks (cheapest first) they buy with the 2★ bonus */
export function keysOf(r: BotReport) {
  if (r.lifeAtCall < 0) return null;
  const base = keysFor(r.lifeAtCall, 0), with2 = keysFor(r.lifeAtCall, 2);
  const costs = PERKS.map(p => p.costs[0]).sort((a, b) => a - b);
  let left = with2, perks = 0; for (const c of costs) { if (c > left) break; left -= c; perks++; }
  return { base, with2, perks, life: r.lifeAtCall };
}

export function evaluate(minutes: number, bases: number[][]) {
  const seeds = bases.flat();
  const run = (profile: Profile, s: number, extra: Partial<Parameters<typeof runBot>[0]> = {}) => runBot({ profile, seed: s, minutes, ...extra });
  const casual = seeds.map(s => run('casual', s));
  const optimal = seeds.map(s => run('optimal', s));
  const rows: Row[] = [];
  for (const p of PACING) {
    if (p.upTo > minutes && p.hi > minutes * 60) continue;
    const c = medMs(casual, p.key), o = medMs(optimal, p.key);
    const perBase = bases.map(b => medMs(casual.filter(r => b.includes(r.seed)), p.key));
    const badSeeds = casual.filter(r => { const v = r.milestones[p.key]; return v === undefined || v < p.lo * 0.8 || v > p.hi * 1.2; }).length;
    let ok = true; const notes: string[] = [];
    if (c === null) { ok = false; notes.push('casual: nie erreicht'); }
    else if (c < p.lo * 0.8 || c > p.hi * 1.2) { ok = false; notes.push('casual außerhalb ±20 %'); }
    // §4.1 optimal ≤ 35 % faster: from the first free play phase on (≥ 3:00); tutorial rows are reaction-gated (BALANCE.md)
    if (p.lo >= 180 && c !== null && o !== null && o < c * 0.65) { ok = false; notes.push('optimal > 35 % schneller'); }
    rows.push({ key: p.key, label: p.label, lo: p.lo, hi: p.hi, casual: c, optimal: o, perBase, badSeeds, ok, note: notes.join('; ') });
  }
  const tempo = casual.map(r => ({ seed: r.seed, ...tempoOf(r, minutes) }));
  const mixes = casual.map(r => ({ seed: r.seed, m15: r.at15 ? mix(r.at15.income, r.at15.spend) : null, m30: mix(r.income, r.spend) }));
  const mixMed = (k: 'm15' | 'm30') => {
    const ms = mixes.map(x => x[k]).filter(Boolean) as ReturnType<typeof mix>[];
    return { release: median(ms.map(m => m.release)), crates: median(ms.map(m => m.crates)), board: median(ms.map(m => m.board)), wages: median(ms.map(m => m.wages)) };
  };
  // Ruf sources per minute (casual median, per source, minutes 0–15 and 15–30)
  const srcs = [...new Set(casual.flatMap(r => Object.keys(r.rufBy)))].sort();
  const rufRate = srcs.map(k => ({
    k,
    a: median(casual.map(r => (r.rufMin[14]?.[k] ?? 0) / 15)),
    b: median(casual.map(r => ((r.rufMin[29]?.[k] ?? r.rufBy[k] ?? 0) - (r.rufMin[14]?.[k] ?? 0)) / 15)),
  }));
  return { rows, tempo, mixes, mix15: mixMed('m15'), mix30: mixMed('m30'), rufRate, casual, optimal, seeds };
}

/** H1b, H2, H3 and the key calibration; `long` minutes so that a slow bot still gets a finite inspection time */
export function evaluateH(seeds: number[], casual: BotReport[], long = 45) {
  const inspAt = (r: BotReport) => r.milestones.inspectionReady ?? Infinity;
  const optLong = seeds.map(s => runBot({ profile: 'optimal', seed: s, minutes: long }));
  const optRand = seeds.map(s => runBot({ profile: 'optimal', seed: s, minutes: long, layout: 'random' }));
  const naive = seeds.map(s => runBot({ profile: 'naive', seed: s, minutes: long }));
  const random = seeds.map(s => runBot({ profile: 'random', seed: s, minutes: 30 }));
  const casLong = seeds.map(s => runBot({ profile: 'casual', seed: s, minutes: long }));
  const good = median(optLong.map(inspAt)), rnd = median(optRand.map(inspAt)), nai = median(naive.map(inspAt));
  const h1b = { good, random: rnd, ok: good <= rnd * 0.75 };
  const h2naive = { heuristic: good, naive: nai, ok: nai >= good * 1.3 };
  const random2 = random.filter(r => r.final.maxStars >= 2).length;
  // "Ein Zufalls-Bot erreicht in 30 min nicht 2★": judged on the median run like every bot criterion; seeds that do reach
  // 2★ are counted in the report (honest outliers, e.g. a random run that happened to build a workshop and a classroom)
  const h2random = { seeds: random.length, reached2: random2, maxStarsMed: median(random.map(r => r.final.maxStars)), ok: median(random.map(r => r.final.maxStars)) < 2 };
  const noTunnel = casual.filter(r => r.pressure.tunnels < 1).length, noFight = casual.filter(r => r.pressure.foodFights < 1).length;
  const h2pressure = {
    tunnels: median(casual.map(r => r.pressure.tunnels)), escaped: median(casual.map(r => r.final.escaped)),
    seedsWithEscape: casual.filter(r => r.final.escaped >= 1).length, foodFights: median(casual.map(r => r.pressure.foodFights)),
    noTunnel, noFight, ok: noTunnel === 0 && noFight === 0,
  };
  const ready = casual.map(r => r.milestones.inspectionReady ?? Infinity);
  const h3Med = median(ready);
  // "progression continues": after the first call there is still Ruf growth, and the bot keeps buying / passes later
  const after = casLong.map(r => {
    const call = r.milestones.inspection1; if (call === undefined) return null;
    const m = r.world.stats.minute; const at = m[Math.min(m.length - 1, Math.ceil(call / 60))];
    return { seed: r.seed, call, rufGain: r.final.ruf - (at?.ruf ?? r.final.ruf), passed: r.milestones.inspectionPassed ?? null, best: r.world.inspection.best };
  });
  const h3 = {
    median: h3Med, inWindow: ready.filter(t => t >= 1320 && t <= 1800).length, inTol: ready.filter(t => t >= 1320 * 0.8 && t <= 1800 * 1.2).length, n: ready.length,
    after, ok: h3Med >= 1320 * 0.8 && h3Med <= 1800 * 1.2 && after.every(a => a !== null && a.rufGain > 0),
  };
  const keys = casual.map(r => ({ seed: r.seed, k: keysOf(r) }));
  const kv = keys.map(x => x.k).filter(Boolean) as NonNullable<ReturnType<typeof keysOf>>[];
  const keyRes = {
    baseMed: median(kv.map(k => k.base)), lifeMed: median(kv.map(k => k.life)), perksMed: median(kv.map(k => k.perks)),
    out: keys.filter(x => !x.k || x.k.base < 4 || x.k.base > 6).length, wrongPerks: keys.filter(x => !x.k || x.k.perks !== 2).length, n: keys.length,
    ok: kv.length > 0 && median(kv.map(k => k.base)) >= 4 && median(kv.map(k => k.base)) <= 6 && median(kv.map(k => k.perks)) === 2,
  };
  return { h1b, h2naive, h2random, h2pressure, h3, keys: keyRes, optLong, optRand, naive, random, casLong };
}

export const fmt = (s: number | null) => { if (s === null || !Number.isFinite(s)) return '—'; const r = Math.round(s); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; };
const pct = (v: number) => `${(v * 100).toFixed(0)} %`;

if (process.argv[1]?.endsWith('balance.ts')) {
  const args = process.argv.slice(2);
  // a missing flag must not read args[0] (indexOf −1 + 1) – that gave NaN seeds
  const arg = (k: string, d: number) => { const i = args.indexOf(k); const v = i >= 0 ? Number(args[i + 1]) : NaN; return Number.isFinite(v) ? v : d; };
  const argS = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
  const minutes = arg('--minutes', 30);
  const nSeeds = arg('--seeds', 9);
  const baseList = argS('--bases', String(arg('--base', NaN) || '11,500,1000')).split(',').map(Number).filter(Number.isFinite);
  const bases = baseList.map(b => Array.from({ length: nSeeds }, (_, k) => b + k * 17));
  const t0 = Date.now();
  const ev = evaluate(minutes, bases);
  const H = minutes >= 30 ? evaluateH(ev.seeds, ev.casual) : null;
  const L: string[] = [];
  L.push(`# Balance-Report (${minutes} min, ${ev.seeds.length} Seeds, Basen ${baseList.join(' / ')}) – ${new Date().toISOString().slice(0, 16)}`, '');
  L.push(`Seeds: ${bases.map(b => b.join(', ')).join(' | ')}`, '');
  L.push('## H1 Pacing-Tabelle (§4.2): Casual-Median ±20 %, Optimal ≤ 35 % schneller', '');
  L.push(`| Zeile | Soll | Casual (Median ${ev.seeds.length}) | je Basis | Seeds außerhalb ±20 % | Optimal (Median) | ok | Hinweis |`, '|---|---|---|---|---|---|---|---|');
  for (const r of ev.rows) L.push(`| ${r.label} | ${fmt(r.lo)}–${fmt(r.hi)} | ${fmt(r.casual)} | ${r.perBase.map(fmt).join(' / ')} | ${r.badSeeds}/${ev.seeds.length} | ${fmt(r.optimal)} | ${r.ok ? '✅' : '❌'} | ${r.note} |`);
  const tBad = ev.tempo.filter(t => !t.ok);
  L.push('', `## H1 Taktung (§4.3, erste ${TEMPO_MIN} min, Casual)`, '');
  L.push(`- Neues spätestens alle 120 s: ${ev.tempo.filter(t => t.maxGap > 120).length}/${ev.tempo.length} Seeds verletzt (Median größte Lücke ${median(ev.tempo.map(t => t.maxGap))} s, Maximum ${Math.max(...ev.tempo.map(t => t.maxGap))} s)`);
  L.push(`- nie > 45 s ohne leistbaren Kauf/verfolgbares Ziel: ${ev.tempo.filter(t => t.idle > 45).length}/${ev.tempo.length} Seeds verletzt (Maximum ${Math.max(...ev.tempo.map(t => t.idle)).toFixed(0)} s)`);
  L.push(`- kein Runaway (Coins > 30 s am Stück über dem teuersten Kauf im Angebot): ${ev.tempo.filter(t => t.noSink > 30).length}/${ev.tempo.length} Seeds verletzt (längste Strecke ${Math.max(...ev.tempo.map(t => t.noSink))} s)`);
  for (const t of tBad) L.push(`  - seed ${t.seed}: Lücke ${t.maxGap} s ab ${fmt(t.gapAt)}, Leerlauf ${t.idle.toFixed(0)} s, ohne Senke ${t.noSink} s`);
  L.push('', '## H1 Einnahmenmix und Lohnanteil (§3.8, Casual-Median)', '');
  L.push('| Zeitpunkt | Entlassungen (40–50 %) | Kisten (30–40 %) | Kostgeld (≤ 20 %) | Löhne (20–35 %) | Seeds im Korridor |', '|---|---|---|---|---|---|');
  for (const [lab, k, m] of [['15:00', 'm15', ev.mix15], ['30:00', 'm30', ev.mix30]] as const) {
    const n = ev.mixes.filter(x => x[k] && mixOk(x[k]!)).length;
    L.push(`| ${lab} | ${pct(m.release)} | ${pct(m.crates)} | ${pct(m.board)} | ${pct(m.wages)} | ${n}/${ev.mixes.length} |`);
  }
  L.push('', '## H1 Ruf-Quellen pro Minute (Casual-Median)', '', '| Quelle | Ruf/min 0–15 | Ruf/min 15–30 |', '|---|---|---|');
  for (const r of ev.rufRate) L.push(`| ${r.k} | ${r.a.toFixed(1)} | ${r.b.toFixed(1)} |`);
  if (H) {
    L.push('', '## H1b / H2 / H3 / Schlüssel', '');
    L.push(`- **H1b** Optimal, gutes Layout ${fmt(H.h1b.good)} vs. Zufallslayout ${fmt(H.h1b.random)} (Median bis „Inspektion möglich", 45-min-Läufe; Soll gut ≤ 75 % von zufällig): ${H.h1b.ok ? '✅' : '❌'}`);
    L.push(`- **H2** Naiv-Bot ${fmt(H.h2naive.naive)} vs. Heuristik (Optimal) ${fmt(H.h2naive.heuristic)} bis zur Inspektion (Soll ≥ +30 %): ${H.h2naive.ok ? '✅' : '❌'}`);
    L.push(`- **H2** Zufalls-Bot: ${H.h2random.reached2}/${H.h2random.seeds} Seeds erreichen in 30 min 2★ (Median höchster Stern ${H.h2random.maxStarsMed}★; Soll < 2★): ${H.h2random.ok ? '✅' : '❌'}`);
    L.push(`- **H2** Druckzustände (Casual, 30 min): Ausbruchsversuche Median ${H.h2pressure.tunnels} (Seeds ohne: ${H.h2pressure.noTunnel}), gelungene Ausbrüche Median ${H.h2pressure.escaped} (${H.h2pressure.seedsWithEscape}/${ev.seeds.length} Seeds ≥ 1), Essensschlachten Median ${H.h2pressure.foodFights} (Seeds ohne: ${H.h2pressure.noFight}): ${H.h2pressure.ok ? '✅' : '❌'}`);
    L.push(`- **H3** Inspektion möglich (Casual): Median ${fmt(H.h3.median)}; ${H.h3.inWindow}/${H.h3.n} Seeds in 22:00–30:00, ${H.h3.inTol}/${H.h3.n} in ±20 %; danach Ruf-Zuwachs bis 45:00 in ${H.h3.after.filter(a => a && a.rufGain > 0).length}/${H.h3.n} Seeds, bestanden (≥ 1★) bis 45:00 in ${H.h3.after.filter(a => a && a.passed !== null).length}/${H.h3.n}: ${H.h3.ok ? '✅' : '❌'}`);
    L.push(`- **Schlüssel** (k/C): Casual Lebenszeit-Coins beim ersten Ausrufen Median ${(H.keys.lifeMed / 1000).toFixed(1)} K → Basis-Schlüssel Median ${H.keys.baseMed} (Soll 4–6; Seeds außerhalb ${H.keys.out}/${H.keys.n}), mit 2★ Perks Median ${H.keys.perksMed} (Soll 2; abweichend ${H.keys.wrongPerks}/${H.keys.n}): ${H.keys.ok ? '✅' : '❌'}`);
  }
  L.push('', '## Casual-Bot: Endstand je Seed', '');
  for (const r of ev.casual) {
    const m = mix(r.income, r.spend);
    L.push(`- seed ${r.seed}: coins ${r.final.coins}, Ruf ${r.final.ruf} (${r.final.stars}★), entlassen ${r.final.released}, Schlingel ${r.final.rascals}/${r.final.beds} Betten, gefangen ${r.final.caught}, entkommen ${r.final.escaped}, Tunnel ${r.pressure.tunnels}, Essensschlachten ${r.pressure.foodFights}, Teleports ${r.final.teleports} · Mix Entl. ${pct(m.release)} / Kisten ${pct(m.crates)} / Kost ${pct(m.board)} · Löhne ${pct(m.wages)}`);
  }
  L.push('', `## Ruf-Quellen und Coins pro Minute (Casual, Seed ${ev.casual[0].seed})`, '');
  const srcs = ev.rufRate.map(r => r.k);
  L.push(`| min | coins | Ruf | entlassen | Schlingel | Betten | Laune | ${srcs.join(' | ')} |`, `|${'---|'.repeat(7 + srcs.length)}`);
  const c0 = ev.casual[0];
  c0.minutes.forEach((m, i) => {
    const prev = i ? c0.rufMin[i - 1] : {}; const cur = c0.rufMin[i] ?? {};
    L.push(`| ${m.m} | ${m.coins} | ${m.ruf} | ${m.released} | ${m.rascals} | ${m.beds} | ${m.mood} | ${srcs.map(k => (cur[k] ?? 0) - (prev[k] ?? 0)).join(' | ')} |`);
  });
  mkdirSync('qa', { recursive: true });
  writeFileSync('qa/balance.md', L.join('\n') + '\n');
  writeFileSync('qa/balance.csv', ['profile,seed,minute,coins,ruf,released,rascals,beds,mood', ...[...ev.casual, ...ev.optimal].flatMap(r => r.minutes.map(m => [r.profile, r.seed, m.m, m.coins, m.ruf, m.released, m.rascals, m.beds, m.mood].join(',')))].join('\n') + '\n');
  console.log(L.slice(0, L.findIndex(l => l.startsWith('## Casual-Bot'))).join('\n'));
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  const hOk = !H || (H.h1b.ok && H.h2naive.ok && H.h2random.ok && H.h2pressure.ok && H.h3.ok && H.keys.ok);
  const mixOkMed = (m: typeof ev.mix15) => mixOk(m);
  process.exit(ev.rows.every(r => r.ok) && !tBad.length && hOk && mixOkMed(ev.mix15) && mixOkMed(ev.mix30) ? 0 : 1);
}
