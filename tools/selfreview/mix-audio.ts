/**
 * Mixes the sound track of the G2 video from the game's own audio log (tools/selfreview/video.spec.ts writes it): every
 * voice the mixer started, at the video frame it started in, plus the running loops (music, ambience beds) from their
 * first second on, with the default settings volumes × bus trims of src/audio/mixer.ts. An approximation of what a
 * player hears (loop points, ducking and per-voice volume are not modelled) – headless Chromium records no audio.
 *   npx tsx tools/selfreview/mix-audio.ts <dir with audio-log.json + video-only.mp4> <out.mp4>
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { DEFAULT_SETTINGS } from '../../src/save/serialize';
import { MUSIC, MUSIC_LO, LOOPS } from '../../src/audio/manifest';

const [dir = 'test-results/video', out = 'qa/g2/first-60s.mp4'] = process.argv.slice(2);
const log = JSON.parse(readFileSync(`${dir}/audio-log.json`, 'utf8')) as {
  fps: number; frames: number; voices: { id: string; f: number; cut: string | null }[]; loops: { f: number; loops: { id: string; target: number }[] }[];
};
const dur = log.frames / log.fps;
const TRIM = { music: 0.8, sfx: 1, ambience: 0.9 };
const musicSet = new Set<string>([...MUSIC, ...MUSIC_LO]), loopSet = new Set<string>(LOOPS);
const busGain = (id: string) => (musicSet.has(id) ? DEFAULT_SETTINGS.music * TRIM.music : loopSet.has(id) ? DEFAULT_SETTINGS.ambience * TRIM.ambience : DEFAULT_SETTINGS.sfx * TRIM.sfx);
const file = (id: string) => `public/audio/${id}.mp3`;

const args: string[] = ['-y', '-loglevel', 'error'];
const chains: string[] = [];
let n = 0;
// loops: from the first sample they run at, at the target of that sample (1.5 s fade-in), until they stop or the end
const loopSpans = new Map<string, { from: number; to: number; target: number }>();
for (const s of log.loops) {
  const t = s.f / log.fps;
  for (const L of s.loops) {
    const sp = loopSpans.get(L.id);
    if (!sp && L.target > 0.01) loopSpans.set(L.id, { from: t, to: dur, target: L.target });
    else if (sp) { if (L.target > 0.01) sp.to = dur; sp.target = Math.max(sp.target, L.target); }
  }
  for (const [id, sp] of loopSpans) if (!s.loops.some(L => L.id === id && L.target > 0.01) && sp.to === dur && t > sp.from) sp.to = t;
}
for (const [id, sp] of loopSpans) {
  if (!existsSync(file(id))) continue;
  args.push('-stream_loop', '-1', '-i', file(id));
  const len = Math.max(0.1, sp.to - sp.from);
  chains.push(`[${n}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${len.toFixed(3)},afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, len - 1).toFixed(3)}:d=1,volume=${(busGain(id) * sp.target).toFixed(3)},adelay=${Math.round(sp.from * 1000)}:all=1[a${n}]`);
  n++;
}
for (const v of log.voices) {
  if (musicSet.has(v.id) || loopSet.has(v.id) || !existsSync(file(v.id))) continue;
  args.push('-i', file(v.id));
  const cut = v.cut ? ',atrim=0:0.03' : '';
  chains.push(`[${n}:a]aresample=48000,aformat=channel_layouts=stereo${cut},volume=${busGain(v.id).toFixed(3)},adelay=${Math.round((v.f / log.fps) * 1000)}:all=1[a${n}]`);
  n++;
}
const mix = `${chains.join(';')};${Array.from({ length: n }, (_, k) => `[a${k}]`).join('')}amix=inputs=${n}:normalize=0:duration=longest,atrim=0:${dur.toFixed(3)},alimiter=limit=0.89[mix]`;
args.push('-i', `${dir}/video-only.mp4`, '-filter_complex', mix, '-map', `${n}:v`, '-map', '[mix]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out);
const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
console.log(`mixed ${loopSpans.size} loops (${[...loopSpans.keys()].join(', ')}) + ${log.voices.filter(v => !musicSet.has(v.id) && !loopSet.has(v.id)).length} voices → ${out} (exit ${r.status})`);
process.exit(r.status ?? 1);
