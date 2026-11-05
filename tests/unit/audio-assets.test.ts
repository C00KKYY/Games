/**
 * G-tests for the shipped audio files (Brief §8.3, §8.4, §12.8).
 *
 * Reads qa/audio/levels.json – the measurement report of the real files in public/audio/, written by
 * tools/audio/measure.ts (part of `npm run audio:build`). The report is proven fresh by re-hashing every
 * file: if a file changed without re-running the build/measure step, the sha1 check fails.
 * Regenerate:  npm run audio:build   (or only re-measure: npx tsx tools/audio/measure.ts)
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { SFX, LOOPS, MUSIC, MUSIC_LO, LO_OF, INITIAL, INITIAL_MUSIC } from '../../src/audio/manifest';
import { T } from '../../tools/audio/thresholds';
import type { Report } from '../../tools/audio/measure';

const ROOT = new URL('../..', import.meta.url).pathname;
const REPORT = ROOT + 'qa/audio/levels.json';
const rep: Report = JSON.parse(readFileSync(REPORT, 'utf8'));
const byId = new Map(rep.sounds.map(s => [s.id as string, s]));
const sfx = rep.sounds.filter(s => s.kind === 'sfx');
const beds = rep.sounds.filter(s => s.kind !== 'sfx');
/** shipped music + ambience (the low-quality stand-ins are a separate class, Brief §8.4, tested below) */
const full = beds.filter(s => s.kind !== 'musicLo');
const lows = rep.sounds.filter(s => s.kind === 'musicLo');
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

describe('audio assets: files & report', () => {
  it('every manifest id has public/audio/<id>.mp3 and a report entry', () => {
    for (const id of [...SFX, ...LOOPS, ...MUSIC, ...MUSIC_LO]) {
      expect(existsSync(`${ROOT}public/audio/${id}.mp3`), `${id}.mp3`).toBe(true);
      expect(byId.has(id), `report entry ${id}`).toBe(true);
    }
    expect(rep.missing).toEqual([]);
  });

  it('report is fresh: sha1 and size of every file match (else run `npm run audio:build`)', () => {
    for (const s of rep.sounds) {
      const buf = readFileSync(ROOT + s.file);
      expect(buf.length, s.id).toBe(s.bytes);
      expect(createHash('sha1').update(buf).digest('hex'), `${s.id} changed after measuring`).toBe(s.sha1);
    }
  });

  it('no stray audio files: every shipped mp3 is a manifest id', () => {
    const ids = new Set<string>([...SFX, ...LOOPS, ...MUSIC, ...MUSIC_LO]);
    for (const f of readdirSync(ROOT + 'public/audio')) {
      if (f === 'loops.json') continue;
      expect(f.endsWith('.mp3') && ids.has(f.slice(0, -4)), f).toBe(true);
    }
  });
});

describe('audio assets: SFX levels (Brief §8.3)', () => {
  it('mono MP3 at ~64 kbps', () => {
    for (const s of sfx) {
      expect(s.codec, s.id).toBe('mp3');
      expect(s.channels, s.id).toBe(1);
      expect(s.kbps, s.id).toBeGreaterThanOrEqual(T.sfxKbpsRange[0]);
      expect(s.kbps, s.id).toBeLessThanOrEqual(T.sfxKbpsRange[1]);
    }
  });
  it('peak −3 dBFS ±1', () => {
    for (const s of sfx) expect(Math.abs(s.peakDb - T.sfxPeakDb), `${s.id} peak ${s.peakDb}`).toBeLessThanOrEqual(T.sfxPeakTol);
  });
  it('RMS within ±3 dB of each other (each within ±3 dB of the SFX median, total spread ≤ 6 dB)', () => {
    const m = median(sfx.map(s => s.rmsDb));
    for (const s of sfx) expect(Math.abs(s.rmsDb - m), `${s.id} rms ${s.rmsDb} vs median ${m}`).toBeLessThanOrEqual(T.sfxRmsTol);
    expect(rep.summary.sfxRmsMaxDb - rep.summary.sfxRmsMinDb).toBeLessThanOrEqual(2 * T.sfxRmsTol);
  });
  it('SFX RMS sits 6–10 dB above the music', () => {
    const d = median(sfx.map(s => s.rmsDb)) - median(beds.filter(s => s.kind === 'music').map(s => s.rmsDb));
    expect(d).toBeGreaterThanOrEqual(T.sfxOverMusic[0]);
    expect(d).toBeLessThanOrEqual(T.sfxOverMusic[1]);
  });
});

describe('audio assets: music & ambience (Brief §8.3)', () => {
  it('mono MP3 at 64–80 kbps', () => {
    expect(full.length).toBe(LOOPS.length + MUSIC.length);
    for (const s of full) {
      expect(s.codec, s.id).toBe('mp3');
      expect(s.channels, s.id).toBe(1);
      expect(s.kbps, s.id).toBeGreaterThanOrEqual(T.loopKbpsRange[0]);
      expect(s.kbps, s.id).toBeLessThanOrEqual(T.loopKbpsRange[1]);
    }
  });
  it('integrated loudness −20 LUFS ±2', () => {
    for (const s of beds) expect(Math.abs((s.lufs ?? -99) - T.loopLufs), `${s.id} ${s.lufs} LUFS`).toBeLessThanOrEqual(T.loopLufsTol);
  });
  it('each music loop ≤ 0.9 MB', () => {
    for (const s of beds.filter(b => b.kind === 'music')) expect(s.bytes, s.id).toBeLessThanOrEqual(T.musicMaxBytes);
  });
  it('low-quality stand-ins (Brief §8.4): mono, 16–24 kbps, < 200 KB, same period + loop start as the full track, level-matched', () => {
    const loops = JSON.parse(readFileSync(ROOT + 'public/audio/loops.json', 'utf8')) as Record<string, { loopStart: number; loopEnd: number }>;
    expect(lows.map(s => s.id).sort()).toEqual([...MUSIC_LO].sort());
    for (const s of lows) {
      const fullId = MUSIC.find(m => LO_OF[m] === s.id)!;
      const f = byId.get(fullId)!;
      expect(fullId, s.id).toBeTruthy();
      expect(s.codec, s.id).toBe('mp3');
      expect(s.channels, s.id).toBe(1);
      expect(s.kbps, s.id).toBeGreaterThanOrEqual(T.loKbpsRange[0]);
      expect(s.kbps, s.id).toBeLessThanOrEqual(T.loKbpsRange[1]);
      expect(s.bytes, s.id).toBeLessThan(T.loMaxBytes);
      // Brief §8.3 loudness window applies unchanged, and the cross-fade must not jump in level
      expect(Math.abs((s.lufs ?? -99) - T.loopLufs), `${s.id} ${s.lufs} LUFS`).toBeLessThanOrEqual(T.loopLufsTol);
      expect(Math.abs((s.lufs ?? -99) - (f.lufs ?? 99)), `${s.id} vs ${fullId} LUFS`).toBeLessThanOrEqual(T.loLufsMatch);
      // phase-locked hand-over: identical period, same loop start
      const a = loops[s.id], b = loops[fullId];
      expect(Math.abs((a.loopEnd - a.loopStart) - (b.loopEnd - b.loopStart)), `${s.id} period`).toBeLessThanOrEqual(T.loPeriodTolSec);
      expect(Math.abs(a.loopStart - b.loopStart), `${s.id} loopStart`).toBeLessThanOrEqual(T.loPeriodTolSec);
    }
  });
  it('seamless loops: loops.json has valid points and the RMS jump across the seam is < 6 dB', () => {
    const loops = JSON.parse(readFileSync(ROOT + 'public/audio/loops.json', 'utf8')) as Record<string, { loopStart: number; loopEnd: number }>;
    for (const s of beds) {
      const lp = loops[s.id];
      expect(lp, `loops.json ${s.id}`).toBeTruthy();
      expect(lp.loopEnd).toBeGreaterThan(lp.loopStart);
      expect(lp.loopStart).toBeGreaterThanOrEqual(0);
      expect(lp.loopEnd).toBeLessThanOrEqual(s.durationSec + 0.01);
      expect(s.loop, s.id).toBeTruthy();
      expect(s.loop!.loopStart).toBe(lp.loopStart);
      expect(s.loop!.seamJumpDb, `${s.id} seam`).toBeLessThan(T.seamMaxJumpDb);
    }
  });
});

describe('audio assets: budgets (Brief §8.4)', () => {
  it('initial (tutorial) bundle: ≤ 12 sounds, ≤ 250 KB – also with music loop 1 (low quality) included', () => {
    expect(INITIAL.length).toBeLessThanOrEqual(T.initialMaxCount);
    const bytes = INITIAL.reduce((n, id) => n + (byId.get(id)?.bytes ?? Infinity), 0);
    expect(bytes).toBeLessThanOrEqual(T.initialMaxBytes);
    expect(rep.summary.initialBytes).toBe(bytes);
    // Brief §8.4: "… plus Musik-Loop 1 in niedriger Qualität" – held to the same 250 KB together (stricter than the brief)
    expect(INITIAL_MUSIC).toEqual(['musicDayLo']);
    const music = INITIAL_MUSIC.reduce((n, id) => n + (byId.get(id)?.bytes ?? Infinity), 0);
    expect(rep.summary.initialMusicBytes).toBe(music);
    expect(bytes + music).toBeLessThanOrEqual(T.initialMaxBytes);
  });
  it('all shipped audio stays well inside the 8 MB build (≤ half of it)', () => {
    expect(rep.summary.audioBytes).toBeLessThanOrEqual(T.buildMaxBytes / 2);
  });
});

describe('audio assets: licences (Brief §8.1)', () => {
  const build = JSON.parse(readFileSync(ROOT + 'qa/audio/build.json', 'utf8')) as { sounds: { id: string; sources: { license: string; page: string; author: string }[] }[] };
  const credits = readFileSync(ROOT + 'licenses/AUDIO_CREDITS.md', 'utf8');
  it('every shipped sound has only CC0 / CC-BY 3.0 / CC-BY 4.0 sources, each listed with its page in AUDIO_CREDITS.md', () => {
    expect(build.sounds.map(s => s.id).sort()).toEqual([...SFX, ...LOOPS, ...MUSIC, ...MUSIC_LO].sort());
    for (const s of build.sounds) {
      expect(s.sources.length, s.id).toBeGreaterThan(0);
      for (const src of s.sources) {
        expect(['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0'], `${s.id} ${src.license}`).toContain(src.license);
        expect(credits.includes(src.page), `${s.id}: ${src.page} in AUDIO_CREDITS.md`).toBe(true);
      }
    }
  });
  it('CC-BY sources carry an attribution line', () => {
    const attrib = credits.split('## CC0 sources')[0];
    for (const s of build.sounds) for (const src of s.sources) if (src.license !== 'CC0-1.0') expect(attrib.includes(src.page), `${s.id} attribution`).toBe(true);
  });
});
