/**
 * npx tsx tools/audio/measure.ts   (runs automatically at the end of `npm run audio:build`)
 *
 * Measures the shipped files in public/audio/ (decoded with ffmpeg exactly as shipped) and writes
 * qa/audio/levels.json: per id peak / RMS dBFS, LUFS (loops + music), duration, bytes, bitrate, sha1,
 * and for loops the RMS jump across the loop seam (loops.json points). tests/unit/audio-assets.test.ts
 * asserts the Brief §8.3/§8.4 thresholds from this report and re-hashes the files to prove it is fresh.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { SFX, LOOPS, MUSIC, MUSIC_LO, INITIAL, INITIAL_MUSIC, type SoundId } from '../../src/audio/manifest';
import { decode, lufs, probe, peak, rms, db, sec, SR } from './dsp';
import { T } from './thresholds';

const ROOT = new URL('../..', import.meta.url).pathname;
const DIR = ROOT + 'public/audio/';

export interface Level {
  id: SoundId; kind: 'sfx' | 'loop' | 'music' | 'musicLo'; file: string; bytes: number; sha1: string;
  durationSec: number; kbps: number; channels: number; sampleRate: number; codec: string;
  peakDb: number; rmsDb: number; lufs?: number;
  loop?: { loopStart: number; loopEnd: number; periodSec: number; seamJumpDb: number; seamStepRatio: number };
}
export interface Report {
  generatedBy: string; thresholds: typeof T; sounds: Level[]; missing: SoundId[];
  summary: {
    sfxRmsMedianDb: number; sfxRmsMinDb: number; sfxRmsMaxDb: number; musicRmsMedianDb: number; sfxOverMusicDb: number;
    initialCount: number; initialBytes: number; initialMusicBytes: number; audioBytes: number; maxMusicBytes: number; maxSeamJumpDb: number;
  };
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function measure(): Report {
  const loops: Record<string, { loopStart: number; loopEnd: number }> = existsSync(DIR + 'loops.json') ? JSON.parse(readFileSync(DIR + 'loops.json', 'utf8')) : {};
  const sounds: Level[] = []; const missing: SoundId[] = [];
  const all: [SoundId, Level['kind']][] = [...SFX.map(i => [i, 'sfx'] as [SoundId, 'sfx']), ...LOOPS.map(i => [i, 'loop'] as [SoundId, 'loop']), ...MUSIC.map(i => [i, 'music'] as [SoundId, 'music']), ...MUSIC_LO.map(i => [i, 'musicLo'] as [SoundId, 'musicLo'])];
  for (const [id, kind] of all) {
    const file = DIR + id + '.mp3';
    if (!existsSync(file)) { missing.push(id); continue; }
    const buf = readFileSync(file);
    const pr = probe(file);
    const y = decode(file);
    const lv: Level = {
      id, kind, file: 'public/audio/' + id + '.mp3', bytes: buf.length, sha1: createHash('sha1').update(buf).digest('hex'),
      durationSec: r2(y.length / SR), kbps: Math.round(pr.bitRate / 1000), channels: pr.channels, sampleRate: pr.sampleRate, codec: pr.codec,
      peakDb: r2(db(peak(y))), rmsDb: r2(db(rms(y))),
    };
    if (kind !== 'sfx') {
      const lp = loops[id];
      if (lp) {
        const s = sec(lp.loopStart), e = sec(lp.loopEnd), w = sec(T.seamWindowMs / 1000);
        const period = y.slice(s, e);
        lv.rmsDb = r2(db(rms(period)));
        lv.peakDb = r2(db(peak(period)));
        const two = new Float32Array(period.length * 2); two.set(period); two.set(period, period.length);
        lv.lufs = r2(lufs(two));
        const before = Math.max(-80, db(rms(y, e - w, e))), after = Math.max(-80, db(rms(y, s, s + w)));
        // step across the seam relative to the typical sample-to-sample step around it
        let typ = 0; for (let i = e - w; i < e - 1; i++) typ += Math.abs(y[i + 1] - y[i]); typ /= Math.max(1, w - 1);
        const step = Math.abs(y[s] - y[e - 1]);
        lv.loop = { loopStart: lp.loopStart, loopEnd: lp.loopEnd, periodSec: r2(lp.loopEnd - lp.loopStart), seamJumpDb: r2(Math.abs(before - after)), seamStepRatio: r2(step / (typ + 1e-9)) };
      } else {
        lv.lufs = r2(lufs(y));
      }
    }
    sounds.push(lv);
  }
  const sfx = sounds.filter(s => s.kind === 'sfx'), music = sounds.filter(s => s.kind === 'music');
  const sfxMed = median(sfx.map(s => s.rmsDb)), musMed = music.length ? median(music.map(s => s.rmsDb)) : NaN;
  const initial = sounds.filter(s => INITIAL.includes(s.id));
  const audioBytes = readdirSync(DIR).reduce((n, f) => n + statSync(DIR + f).size, 0);
  return {
    generatedBy: 'tools/audio/measure.ts', thresholds: T, sounds, missing,
    summary: {
      sfxRmsMedianDb: r2(sfxMed), sfxRmsMinDb: r2(Math.min(...sfx.map(s => s.rmsDb))), sfxRmsMaxDb: r2(Math.max(...sfx.map(s => s.rmsDb))),
      musicRmsMedianDb: r2(musMed), sfxOverMusicDb: r2(sfxMed - musMed),
      initialCount: initial.length, initialBytes: initial.reduce((n, s) => n + s.bytes, 0),
      initialMusicBytes: sounds.filter(s => INITIAL_MUSIC.includes(s.id)).reduce((n, s) => n + s.bytes, 0), audioBytes,
      maxMusicBytes: Math.max(0, ...music.map(s => s.bytes)),
      maxSeamJumpDb: Math.max(0, ...sounds.filter(s => s.loop).map(s => s.loop!.seamJumpDb)),
    },
  };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  process.stdout.on('error', () => { /* tolerate a closed pipe (e.g. `| head`) – the report is already written */ });
  const rep = measure();
  mkdirSync(ROOT + 'qa/audio', { recursive: true });
  writeFileSync(ROOT + 'qa/audio/levels.json', JSON.stringify(rep, null, 2) + '\n');
  const s = rep.summary;
  console.log(`levels.json: ${rep.sounds.length} files, missing ${rep.missing.length}; SFX RMS median ${s.sfxRmsMedianDb} (${s.sfxRmsMinDb}…${s.sfxRmsMaxDb}) dBFS, music RMS median ${s.musicRmsMedianDb} → +${s.sfxOverMusicDb} dB; initial ${s.initialCount} files ${s.initialBytes} B; audio total ${s.audioBytes} B; max seam jump ${s.maxSeamJumpDb} dB`);
  for (const l of rep.sounds) console.log(`${l.id.padEnd(16)} ${l.kind.padEnd(7)} ${String(l.bytes).padStart(7)} B ${l.durationSec.toFixed(2).padStart(6)}s ${l.kbps}k pk ${l.peakDb.toFixed(1).padStart(5)} rms ${l.rmsDb.toFixed(1).padStart(6)}${l.lufs !== undefined ? ` LUFS ${l.lufs.toFixed(1)}` : ''}${l.loop ? ` seam ${l.loop.seamJumpDb} dB step×${l.loop.seamStepRatio}` : ''}`);
}
