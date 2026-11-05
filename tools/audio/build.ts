/**
 * npm run audio:build   (= tsx tools/audio/build.ts && tsx tools/audio/measure.ts)
 *
 * Builds every id of src/audio/manifest.ts into public/audio/<id>.mp3 from the recorded CC0/CC-BY sources
 * in vendor_raw/audio/ (see tools/audio/sources.ts, docs/AUDIO.md), plus public/audio/loops.json.
 *
 *  SFX:   layers mixed → silence-trimmed → peak −3 dBFS; very transient sounds get a look-ahead limiter
 *         until their RMS reaches the common SFX target (= music RMS + 8 dB) → mono MP3 64 kbps CBR.
 *  Loops: made periodic (cross-fade or circular mix) → −20 LUFS integrated → padded with ±0.25 s of
 *         periodic continuation → mono MP3 (music 72 kbps, ambience 64 kbps). The decoder offset is
 *         measured by decoding the MP3 again (ffmpeg honours the LAME gapless header like Chromium);
 *         loopStart/loopEnd point at the exact period. Because the padding is the loop itself, a
 *         decoder that ignores the encoder delay just shifts the window by ~25 ms – still seamless.
 *  Lo:    MUSIC_LO stand-ins (musicDayLo) run the same loop recipe on the same source (→ same period) and are
 *         encoded as MPEG-2 Layer III 16 kbps / 22.05 kHz mono for the initial bundle (Brief §8.4).
 *
 * Flags: --candidates  also (re)encode the music candidates into qa/audio/candidates/ (not shipped)
 *        --only=id,id  rebuild only these ids (loops.json/report keep the other entries)
 *        --docs        only regenerate licenses/AUDIO_CREDITS.md and the table in docs/AUDIO.md from qa/audio/build.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { SFX, LOOPS, MUSIC, MUSIC_LO, type SoundId } from '../../src/audio/manifest';
import { PACKS, RECIPES, MUSIC_CANDIDATES, type Src, type Recipe, type LoopRecipe, type SfxRecipe, type Pack } from './sources';
import {
  SR, decode, encodeMp3, lufs, db, undb, peak, rms, gain, sec, trimSilence, fadeIn, fadeOut, decayTail,
  varispeed, mix, mixCircular, limit, bandFrames, ncc, probe,
} from './dsp';
import { T } from './thresholds';

const ROOT = new URL('../..', import.meta.url).pathname;
const RAW = ROOT + 'vendor_raw/audio/';
const OUT = ROOT + 'public/audio/';
const QA = ROOT + 'qa/audio/';

/** fallbacks used only if a primary source could not be downloaded (rate limits) – reported in build.json */
const FALLBACK: Partial<Record<SoundId, Recipe>> = {
  kazoo: { kind: 'sfx', layers: [{ pack: 'trumpet', file: 'losetrumpet.wav' }], tail: 0.3, why: 'FALLBACK (kazoo recording unavailable): comedic "wah-wah-wah-waaah" muted trumpet' },
  whistle: { kind: 'sfx', layers: [{ pack: 'whistleOga', file: 'whistle_1.wav' }, { pack: 'whistleOga', file: 'whistle_3.wav', at: 0.26 }], why: 'FALLBACK (referee whistle unavailable): two short whistle blows "fweet-fweet"' },
};

const srcPath = (s: Src) => RAW + (PACKS[s.pack] as Pack).dir + '/' + s.file;
const available = (r: Recipe) => r.layers.every(l => existsSync(srcPath(l)));

/** decode one layer; every layer is peak-normalised first so recipe gains (gainDb) are relative to the layer's own peak */
function loadLayer(s: Src): Float32Array {
  let x = decode(srcPath(s), { start: s.start, dur: s.dur, filter: s.filter });
  x = gain(x, 1 / (peak(x) || 1));
  if (s.rate && s.rate !== 1) x = varispeed(x, s.rate);
  if (s.fadeIn) fadeIn(x, s.fadeIn);
  if (s.fadeOut) fadeOut(x, s.fadeOut);
  return x;
}

interface BuildInfo {
  id: SoundId; kind: Recipe['kind']; why: string; fallback: boolean;
  sources: { pack: string; file: string; page: string; license: string; author: string }[];
  processing: string[];
  loop?: { periodSec: number; padSec: number; offsetSamples: number; encoderDelaySamples: number; xfadeSec?: number; mode: string; similarity?: number };
}

// ------------------------------------------------------------------ SFX
/** never squash a sound by more than this – if a sound still misses the RMS window, its recipe needs a tighter trim */
const MAX_GR = 15;
/** max tanh shape factor k for the final saturation stage (k = 3 ≈ hard-ish clip of the spikes) */
const MAX_SAT = 3;
/** where inside the brief's 6–10 dB window the SFX median is placed */
const SFX_OVER_MUSIC = 7;
/** max crest-dependent deviation from the SFX RMS centre (inside the brief's ±3 dB) */
const CREST_SPREAD = 2.2;
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/** build + encode, then close the loop on the *encoded* RMS (LAME's low-pass removes up to ~2 dB of crackle energy) */
function buildSfx(id: SoundId, r: SfxRecipe, targetRmsDb: number, info: BuildInfo): void {
  const out = OUT + id + '.mp3';
  let aim = targetRmsDb, steps: string[] = [];
  for (let it = 0; it < 4; it++) {
    steps = [];
    processSfx({ ...r, id } as SfxRecipe & { id: string }, aim, steps);
    const err = db(rms(decode(out))) - targetRmsDb;
    if (Math.abs(err) <= 0.35) break;
    aim -= err;
  }
  info.processing.push(...steps);
}

function processSfx(r: SfxRecipe, targetRmsDb: number, processing: string[]): void {
  const info = { processing };
  const raw = mix(r.layers.map(l => ({ x: loadLayer(l), at: l.at ?? 0, gainDb: l.gainDb ?? 0 })));
  const P = undb(T.sfxPeakDb);
  const shape = (trimDb: number): Float32Array => {
    let x = trimSilence(raw, trimDb, 2);
    if (r.maxDur && x.length > sec(r.maxDur)) { x = x.slice(0, sec(r.maxDur)); fadeOut(x, 0.25); }
    if (r.tail) decayTail(x, r.tail, -36);
    fadeIn(x, 0.001); fadeOut(x, Math.min(trimDb > -40 ? 0.12 : 0.03, x.length / SR / 4)); // longer fade where a tail was cut
    return gain(x, P / peak(x));
  };
  let trimDb = -40;
  let y = shape(trimDb);
  if (r.maxDur && raw.length > sec(r.maxDur)) info.processing.push(`cut to ${r.maxDur}s`);
  if (r.tail) info.processing.push(`decay tail ${r.tail}s`);
  // too quiet: try a tighter tail trim first (the quiet tail adds length but no loudness)
  for (const t of [-30, -24]) {
    if (db(rms(y)) >= targetRmsDb - 0.3) break;
    const y2 = shape(t);
    if (db(rms(y2)) > db(rms(y)) + 0.5) { y = y2; trimDb = t; }
  }
  info.processing.push(`silence trim at ${trimDb} dB`);
  // Each stage scans its parameter on a fine grid and takes the *smallest* setting that reaches the target,
  // so a sound only gets as much processing as it needs.
  const hit = (z: Float32Array) => db(rms(z)) >= targetRmsDb - 0.1;
  const norm = (z: Float32Array) => gain(z, P / peak(z));
  if (!hit(y)) { // transient: look-ahead limiter (shaves the attack spike, 12 ms release)
    const base = y; let gr = 0, z = y;
    for (gr = 0.25; gr <= MAX_GR; gr += 0.25) { z = norm(limit(base, P * undb(-gr), 1.5, 12)); if (hit(z)) break; }
    y = z; info.processing.push(`look-ahead limiter ${Math.min(gr, MAX_GR).toFixed(1)} dB on the attack`);
  }
  if (!hit(y)) { // sparse clinks: gentle saturation of what is left of the spikes
    // z = tanh(k·u)/tanh(k), u = x/peak: k → 0 is linear; k = 1 rounds the peaks by ~2.4 dB
    const base = y; let k = 0, z = y;
    for (k = 0.1; k <= MAX_SAT + 1e-9; k += 0.1) { const t = Math.tanh(k); const w = new Float32Array(base.length); for (let i = 0; i < w.length; i++) w[i] = Math.tanh(k * base[i] / P) / t; z = norm(w); if (hit(z)) break; }
    y = z; info.processing.push(`soft saturation k=${Math.min(k, MAX_SAT).toFixed(1)}`);
  }
  if (db(rms(y)) > targetRmsDb + 0.6) { // sustained tone: exponential decay envelope over the body
    const base = y; let depth = 0, z = y; const n = base.length, s0 = Math.min(sec(0.03), Math.floor(n * 0.2));
    for (depth = 0.5; depth <= 40; depth += 0.5) { const k = Math.log(undb(-depth)); z = base.slice(); for (let i = s0; i < n; i++) z[i] *= Math.exp(k * (i - s0) / (n - s0)); z = norm(z); if (db(rms(z)) <= targetRmsDb + 0.3) break; }
    y = z; info.processing.push(`decay envelope −${Math.min(depth, 40).toFixed(1)} dB over the body`);
  }
  info.processing.push('peak −3 dBFS', `mono MP3 ${T.sfxKbps} kbps CBR`);
  encodeVerified(y, OUT + (r as SfxRecipe & { id: string }).id + '.mp3', T.sfxKbps, T.sfxPeakDb);
}

/** encode, decode again and correct the gain until the MP3 peak sits within ±0.25 dB of the target (max 6 tries, best kept). */
function encodeVerified(y: Float32Array, out: string, kbps: number, peakTargetDb: number): void {
  let g = 1, bestErr = Infinity, bestG = 1;
  for (let i = 0; i < 6; i++) {
    encodeMp3(gain(y, g), out, kbps);
    const err = db(peak(decode(out))) - peakTargetDb;
    if (Math.abs(err) < Math.abs(bestErr)) { bestErr = err; bestG = g; }
    if (Math.abs(err) <= 0.25) return;
    g *= undb(-err * 0.8);
  }
  encodeMp3(gain(y, bestG), out, kbps);
}

// ------------------------------------------------------------------ loops
function periodic(x: Float32Array, a: number, L: number, X: number): { p: Float32Array; corr: number } {
  if (a + L + X > x.length) throw new Error(`segment exceeds source (${(a + L + X) / SR}s > ${x.length / SR}s)`);
  const p = x.slice(a, a + L);
  const corr = ncc(x, a, a + L, X);
  const linear = corr > 0.6; // correlated material (music on a matching frame) → linear; else equal-power
  for (let i = 0; i < X; i++) {
    const t = i / X;
    const fi = linear ? t : Math.sin(t * Math.PI / 2), fo = linear ? 1 - t : Math.cos(t * Math.PI / 2);
    p[i] = x[a + i] * fi + x[a + L + i] * fo;
  }
  return { p, corr };
}

/** find the loop length in [lmin,lmax] whose end frame looks most like the start frame (band-spectrum cosine). */
function musicLoopLength(x: Float32Array, a: number, lmin: number, lmax: number): { L: number; sim: number } {
  const hop = 512, W = Math.round(3 * SR / hop);
  const region = x.slice(a, Math.min(x.length, a + lmax + sec(3.5)));
  const F = bandFrames(region, hop).map(f => { const m = f.reduce((s, v) => s + v, 0) / f.length; const g = f.map(v => v - m); const n = Math.hypot(...g) || 1; return g.map(v => v / n); });
  let best = -Infinity, bestK = 0;
  for (let k = Math.round(lmin / hop); k <= Math.round(lmax / hop) && k + W < F.length; k++) {
    let s = 0; for (let j = 0; j < W; j++) { const u = F[j], v = F[k + j]; let d = 0; for (let b = 0; b < u.length; b++) d += u[b] * v[b]; s += d; }
    s /= W; if (s > best) { best = s; bestK = k; }
  }
  // sample-accurate refinement: waveform correlation ±1 hop
  let L = bestK * hop, bestC = -Infinity;
  for (let d = -hop; d <= hop; d++) { const c = ncc(x, a, a + bestK * hop + d, 8192); if (c > bestC) { bestC = c; L = bestK * hop + d; } }
  return { L, sim: best };
}

function lufsOf(y: Float32Array, start: number, len: number): number { return lufs(tile(y.slice(start, start + len), 2)); }
function tile(p: Float32Array, n: number): Float32Array { const y = new Float32Array(p.length * n); for (let i = 0; i < n; i++) y.set(p, i * p.length); return y; }

/** offset (samples) of the period start inside a decoded file, searched around `expect`; aligns on the loudest 8192-sample window. */
function locate(y: Float32Array, p: Float32Array, expect: number, range = 2600): number {
  const n = Math.min(8192, p.length);
  let w = 0, wE = -1; for (let k = 0; k + n <= p.length; k += 2048) { const e = rms(p, k, k + n); if (e > wE) { wE = e; w = k; } }
  let best = -Infinity, at = 0;
  for (let d = -range; d <= range; d++) {
    const o = expect + w + d; if (o < 0 || o + n > y.length) continue;
    let s = 0, sa = 0, sb = 0; for (let i = 0; i < n; i += 2) { const u = y[o + i], v = p[w + i]; s += u * v; sa += u * u; sb += v * v; }
    const c = s / Math.sqrt(sa * sb + 1e-12); if (c > best) { best = c; at = d; }
  }
  return at;
}

function buildLoop(id: SoundId, r: LoopRecipe, info: BuildInfo, loops: Record<string, { loopStart: number; loopEnd: number }>): void {
  let p: Float32Array;
  if (r.mode === 'circular') {
    // every scattered event gets at least a 5 ms fade-in / 60 ms fade-out so truncated source files cannot click
    p = mixCircular(sec(r.len), r.layers.map(l => ({ x: loadLayer({ fadeIn: 0.005, fadeOut: 0.06, ...l }), at: l.at ?? 0, gainDb: l.gainDb ?? 0 })));
    info.loop = { mode: 'circular mix', periodSec: r.len, padSec: 0, offsetSamples: 0, encoderDelaySamples: 0 };
    info.processing.push(`${r.layers.length} recorded events mixed into a circular ${r.len}s buffer`);
  } else {
    const x = loadLayer(r.layers[0]);
    const a = sec(r.start ?? 0), X = sec(r.xfade ?? 1);
    let L = sec(r.len), sim: number | undefined;
    if (r.lenRange) { const f = musicLoopLength(x, a, sec(r.lenRange[0]), sec(r.lenRange[1])); L = f.L; sim = f.sim; }
    const { p: pp, corr } = periodic(x, a, L, X);
    p = pp;
    info.loop = { mode: 'segment + cross-fade', periodSec: L / SR, padSec: 0, offsetSamples: 0, encoderDelaySamples: 0, xfadeSec: X / SR, similarity: sim };
    info.processing.push(`segment ${(a / SR).toFixed(2)}–${((a + L) / SR).toFixed(2)}s of the source`, `${corr > 0.6 ? 'linear' : 'equal-power'} cross-fade ${(X / SR).toFixed(2)}s of the continuation into the head (seamless period)`);
    if (r.layers[0].filter) info.processing.push(`filter ${r.layers[0].filter}`);
  }
  if (r.preLimitDb) { const t = tile(p, 3); p = limit(t, peak(p) * undb(-r.preLimitDb), 3, 120).slice(p.length, 2 * p.length); info.processing.push(`transient limiter ${r.preLimitDb} dB`); }
  // loudness + peak, closed on the encoded file: integrated LUFS over two decoded periods → target ±0.1;
  // if the decoded MP3 peak would pass −1 dBFS the transients are limited first (sparse beds like the clatter)
  const L = p.length, M = sec(0.25);
  const lo = (MUSIC_LO as readonly string[]).includes(id);
  const kbps = lo ? T.loKbps : r.kind === 'music' ? T.musicKbps : T.ambKbps;
  const out = OUT + id + '.mp3';
  const enc = (x: Float32Array) => (lo ? encodeMp3(x, out, kbps, T.loSampleRate) : encodeMp3(x, out, kbps));
  const padded = new Float32Array(L + 2 * M);
  let limited = 0;
  p = gain(p, undb(T.loopLufsTarget - lufs(tile(p, 2))));
  for (let it = 0; it < 8; it++) {
    padded.set(p.subarray(L - M), 0); padded.set(p, M); padded.set(p.subarray(0, M), M + L);
    enc(padded);
    const y = decode(out);
    const pk = db(peak(y)), I = lufsOf(y, M, L);
    if (pk > -1.2) { const t = tile(p, 3); p = limit(t, peak(p) * undb(-(pk + 1.6)), 3, 120).slice(L, 2 * L); limited += pk + 1.6; continue; }
    if (Math.abs(I - T.loopLufsTarget) <= 0.1) break;
    p = gain(p, undb(T.loopLufsTarget - I));
  }
  if (limited > 0) info.processing.push(`peak limiter ${limited.toFixed(1)} dB (aiming at a decoded MP3 peak ≤ −1 dBFS)`);
  info.processing.push(`integrated loudness → ${T.loopLufsTarget} LUFS`);
  const yTrim = decode(out);
  const off = locate(yTrim, p, M);
  const delay = Math.round(probe(out).startTime * SR); // LAME header encoder delay
  const loopStart = (M + off) / SR;
  loops[id] = { loopStart: +loopStart.toFixed(6), loopEnd: +(loopStart + L / SR).toFixed(6) };
  Object.assign(info.loop!, { padSec: M / SR, offsetSamples: off, encoderDelaySamples: delay });
  info.processing.push(`±0.25s periodic padding, mono MP3 ${kbps} kbps CBR${lo ? ` at ${T.loSampleRate} Hz (low-quality stand-in)` : ''}`, `loop points from re-decode: start ${loops[id].loopStart}s, end ${loops[id].loopEnd}s (encoder delay ${delay} samples)`);
}

// ------------------------------------------------------------------ candidates (not shipped)
function buildCandidates(): void {
  mkdirSync(QA + 'candidates', { recursive: true });
  for (const c of MUSIC_CANDIDATES) {
    const f = RAW + PACKS.holizna.dir + '/' + c.file;
    if (!existsSync(f)) { console.warn('candidate missing', c.file); continue; }
    let x = decode(f, { start: 15, dur: 75 });
    fadeIn(x, 1.5); fadeOut(x, 3);
    x = gain(x, undb(T.loopLufs - lufs(x)));
    if (peak(x) > undb(-1)) x = limit(x, undb(-1.5), 3, 120);
    const out = `${QA}candidates/${c.mood}${c.isDefault ? '-default' : ''}-${c.file.replace(/\.mp3$/, '').replace(/-mp3$/, '')}.mp3`;
    encodeMp3(x, out, 64);
    console.log('candidate', out.replace(ROOT, ''), (probe(out).duration).toFixed(1) + 's');
  }
}

// ------------------------------------------------------------------ docs
function credits(used: Set<string>, infos: BuildInfo[]): string {
  const lines = ['# Audio credits', '', 'Generated by `npm run audio:build` from tools/audio/sources.ts. Every shipped sound in `public/audio/` comes from the sources below.', 'Licence of each source was read from the "License(s)" field of its page (copies in `qa/audio/license-proof/`).', ''];
  const by = [...used].map(k => [k, PACKS[k as keyof typeof PACKS] as Pack] as const);
  const ccby = by.filter(([, p]) => p.license !== 'CC0-1.0');
  lines.push('## Required attributions (CC BY)', '');
  if (ccby.length === 0) lines.push('None – all shipped audio is CC0.');
  for (const [, p] of ccby) lines.push(`- ${p.credit} – ${p.page} – https://creativecommons.org/licenses/by/${p.license.endsWith('4.0') ? '4.0' : '3.0'}/`);
  lines.push('', '## CC0 sources (no attribution required, credited as thanks)', '');
  for (const [, p] of by.filter(([, p]) => p.license === 'CC0-1.0')) lines.push(`- ${p.title} – ${p.author} – ${p.page} – CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/)`);
  lines.push('', '## Per sound (file in public/audio/ → source page → licence)', '');
  for (const i of infos) lines.push(`- \`${i.id}.mp3\` – ${[...new Set(i.sources.map(s => `${s.author}: ${s.page} (${s.license})`))].join('; ')}`);
  lines.push('', '## Licence files shipped with the downloads', '');
  for (const [, p] of by) {
    if (!p.licenseFile) continue;
    const f = RAW + p.dir + '/' + p.licenseFile;
    if (existsSync(f)) lines.push(`### ${p.title} (${p.licenseFile})`, '', '```', readFileSync(f, 'utf8').replace(/\r/g, '').replace(/\t/g, '  ').split('\n').map(l => l.trimEnd()).filter((l, i, a) => l || (a[i - 1] ?? '')).join('\n').trim(), '```', '');
  }
  return lines.join('\n') + '\n';
}

function docTable(infos: BuildInfo[]): string {
  const rows = ['| id | kind | source page | licence | original file(s) | processing |', '|---|---|---|---|---|---|'];
  for (const i of infos) {
    const pages = [...new Set(i.sources.map(s => s.page))].map(u => `<${u}>`).join('<br>');
    const lic = [...new Set(i.sources.map(s => s.license))].join(', ');
    const files = i.sources.map(s => `\`${s.file}\``).join('<br>');
    rows.push(`| \`${i.id}\` | ${i.kind}${i.fallback ? ' (fallback)' : ''} | ${pages} | ${lic} | ${files} | ${i.why}; ${i.processing.join('; ')} |`);
  }
  return rows.join('\n');
}

// ------------------------------------------------------------------ main
function main(): void {
  const args = process.argv.slice(2);
  const only = args.find(a => a.startsWith('--only='))?.slice(7).split(',') as SoundId[] | undefined;
  mkdirSync(OUT, { recursive: true }); mkdirSync(QA, { recursive: true });
  if (args.includes('--candidates')) buildCandidates();

  const loopsFile = OUT + 'loops.json';
  const loops: Record<string, { loopStart: number; loopEnd: number }> = only && existsSync(loopsFile) ? JSON.parse(readFileSync(loopsFile, 'utf8')) : {};
  const prev: Record<string, BuildInfo> = only && existsSync(QA + 'build.json') ? Object.fromEntries((JSON.parse(readFileSync(QA + 'build.json', 'utf8')).sounds as BuildInfo[]).map(i => [i.id, i])) : {};
  const infos: Record<string, BuildInfo> = { ...prev };

  const ids: SoundId[] = [...MUSIC, ...MUSIC_LO, ...LOOPS, ...SFX];
  const pick = (id: SoundId): { r: Recipe; fallback: boolean } => {
    const r = RECIPES[id];
    if (available(r)) return { r, fallback: false };
    const fb = FALLBACK[id];
    if (fb && available(fb)) { console.warn(`! ${id}: primary source missing → fallback`); return { r: fb, fallback: true }; }
    throw new Error(`no source available for ${id}: ${r.layers.map(srcPath).filter(f => !existsSync(f)).join(', ')}`);
  };
  const mkInfo = (id: SoundId, r: Recipe, fallback: boolean): BuildInfo => ({
    id, kind: r.kind, why: r.why, fallback, processing: [],
    sources: [...new Map(r.layers.map(l => [l.pack + l.file, l])).values()].map(l => { const p = PACKS[l.pack] as Pack; return { pack: l.pack, file: `${p.dir}/${l.file}`, page: l.page ?? p.page, license: p.license, author: p.author }; }),
  });

  for (const id of [...MUSIC, ...MUSIC_LO, ...LOOPS]) {
    if (only && !only.includes(id)) continue;
    const { r, fallback } = pick(id);
    const info = mkInfo(id, r, fallback);
    buildLoop(id, r as LoopRecipe, info, loops);
    infos[id] = info;
    console.log(`✓ ${id.padEnd(16)} ${info.processing.at(-1)}`);
  }
  // SFX RMS: the set's median sits SFX_OVER_MUSIC dB above the music median (Brief §8.3: 6–10 dB). Inside the
  // ±3 dB window each sound gets a small crest-dependent offset (transients a bit lower, tones a bit higher)
  // so percussive sounds keep their attack instead of being squashed flat.
  const musicRms = MUSIC.map(m => { const l = loops[m]; const y = decode(OUT + m + '.mp3'); return db(rms(y, sec(l.loopStart), sec(l.loopEnd))); }).sort((a, b) => a - b);
  const crest = Object.fromEntries(SFX.map(id => { const x = trimSilence(mix(pick(id).r.layers.map(l => ({ x: loadLayer(l), at: l.at ?? 0, gainDb: l.gainDb ?? 0 }))), -40, 2); return [id, db(peak(x)) - db(rms(x))]; })) as Record<SoundId, number>;
  const cRef = median(Object.values(crest));
  const offset = (id: SoundId) => Math.max(-CREST_SPREAD, Math.min(CREST_SPREAD, 0.5 * (cRef - crest[id])));
  const target = musicRms[1] + SFX_OVER_MUSIC - median(SFX.map(offset));
  console.log(`music RMS ${musicRms.map(v => v.toFixed(1)).join(' / ')} dBFS → SFX RMS centre ${target.toFixed(1)} dBFS (crest ref ${cRef.toFixed(1)} dB)`);
  for (const id of SFX) {
    if (only && !only.includes(id)) continue;
    const { r, fallback } = pick(id);
    const info = mkInfo(id, r, fallback);
    info.processing.push(`RMS target ${(target + offset(id)).toFixed(1)} dBFS (natural crest ${crest[id].toFixed(1)} dB)`);
    buildSfx(id, r as SfxRecipe, target + offset(id), info);
    infos[id] = info;
    console.log(`✓ ${id.padEnd(16)} ${info.processing.join(', ')}`);
  }

  const ordered = ids.map(id => infos[id]).filter(Boolean);
  writeFileSync(loopsFile, JSON.stringify(Object.fromEntries(Object.entries(loops).sort()), null, 2) + '\n');
  writeFileSync(QA + 'build.json', JSON.stringify({ generatedBy: 'tools/audio/build.ts', sfxRmsTargetDb: +target.toFixed(2), sounds: ordered }, null, 2) + '\n');
  writeDocs(ordered);
}

/** licences/AUDIO_CREDITS.md + the per-id table in docs/AUDIO.md (between the audio-table markers) */
function writeDocs(ordered: BuildInfo[]): void {
  const used = new Set(ordered.flatMap(i => i.sources.map(s => s.pack)));
  writeFileSync(ROOT + 'licenses/AUDIO_CREDITS.md', credits(used, ordered));
  const docFile = ROOT + 'docs/AUDIO.md';
  if (existsSync(docFile)) {
    const doc = readFileSync(docFile, 'utf8');
    const s = doc.indexOf('<!-- audio-table:start -->'), e = doc.indexOf('<!-- audio-table:end -->');
    if (s >= 0 && e > s) writeFileSync(docFile, doc.slice(0, s) + '<!-- audio-table:start -->\n' + docTable(ordered) + '\n' + doc.slice(e));
  }
}

if (process.argv.includes('--docs')) writeDocs((JSON.parse(readFileSync(QA + 'build.json', 'utf8')) as { sounds: BuildInfo[] }).sounds);
else main();
