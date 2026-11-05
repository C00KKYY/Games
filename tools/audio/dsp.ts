/**
 * Tiny DSP kit for the audio build (Brief §8.3). All audio is handled as mono Float32Array at SR.
 * ffmpeg is only used to decode source files and to encode/measure MP3s; it is always given
 * file paths as arguments – nothing from vendor_raw/ is ever executed.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const SR = 44100;
export const FFMPEG = process.env.FFMPEG ?? '/usr/bin/ffmpeg';
export const FFPROBE = process.env.FFPROBE ?? '/usr/bin/ffprobe';

function run(cmd: string, args: string[], input?: Buffer): { stdout: Buffer; stderr: string } {
  const r = spawnSync(cmd, args, { input, maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed:\n${r.stderr?.toString().slice(-2000)}`);
  return { stdout: r.stdout, stderr: r.stderr.toString() };
}

/** decode any file to mono float at SR. `filter` is an optional extra ffmpeg -af chain (e.g. a lowpass). */
export function decode(file: string, opts: { start?: number; dur?: number; filter?: string } = {}): Float32Array {
  const args = ['-v', 'error'];
  if (opts.start) args.push('-ss', String(opts.start));
  if (opts.dur) args.push('-t', String(opts.dur));
  args.push('-i', file, '-ac', '1', '-ar', String(SR));
  if (opts.filter) args.push('-af', opts.filter);
  args.push('-f', 'f32le', '-');
  const { stdout } = run(FFMPEG, args);
  const out = new Float32Array(stdout.byteLength / 4);
  new Uint8Array(out.buffer).set(stdout.subarray(0, out.length * 4));
  return out;
}

/** encode mono float to CBR MP3 (bit-exact flags → reproducible output). */
export function encodeMp3(x: Float32Array, out: string, kbps: number): void {
  const buf = Buffer.from(x.buffer, x.byteOffset, x.byteLength);
  run(FFMPEG, ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', '-',
    '-c:a', 'libmp3lame', '-b:a', `${kbps}k`, '-ar', String(SR), '-ac', '1',
    '-map_metadata', '-1', '-id3v2_version', '0', '-write_id3v1', '0',
    '-fflags', '+bitexact', '-flags:a', '+bitexact', out], buf);
}

/** integrated loudness (EBU R128 / ITU-R BS.1770 via ffmpeg ebur128) of a file. */
export function lufsOfFile(file: string): number {
  const { stderr } = run(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-']);
  const m = /Integrated loudness:\s*I:\s*(-?[\d.]+|-inf)\s*LUFS/.exec(stderr);
  if (!m) throw new Error('no ebur128 result for ' + file);
  return m[1] === '-inf' ? -Infinity : Number(m[1]);
}

/** loudness of PCM (written to a temp wav). */
export function lufs(x: Float32Array): number {
  const dir = mkdtempSync(join(tmpdir(), 'rrl-audio-'));
  try {
    const f = join(dir, 'm.wav');
    writeFileSync(f, wav(x));
    return lufsOfFile(f);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

export function wav(x: Float32Array): Buffer {
  const b = Buffer.alloc(44 + x.length * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 4, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(3, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(32, 34);
  b.write('data', 36); b.writeUInt32LE(x.length * 4, 40);
  Buffer.from(x.buffer, x.byteOffset, x.byteLength).copy(b, 44);
  return b;
}

/** bitRate = the stream's (CBR) bit rate; for tiny files the container average would be inflated by the Xing header frame */
export function probe(file: string): { duration: number; bitRate: number; channels: number; sampleRate: number; startTime: number; codec: string } {
  const { stdout } = run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration,bit_rate:stream=channels,sample_rate,start_time,codec_name,bit_rate', '-of', 'json', file]);
  const j = JSON.parse(stdout.toString());
  const s = j.streams[0];
  return { duration: Number(j.format.duration), bitRate: Number(s.bit_rate ?? j.format.bit_rate), channels: s.channels, sampleRate: Number(s.sample_rate), startTime: Number(s.start_time ?? 0), codec: s.codec_name };
}

// ---------- levels ----------
export const db = (v: number) => (v > 1e-9 ? 20 * Math.log10(v) : -180);
export const undb = (d: number) => Math.pow(10, d / 20);
export function peak(x: Float32Array, a = 0, b = x.length): number { let m = 0; for (let i = a; i < b; i++) { const v = Math.abs(x[i]); if (v > m) m = v; } return m; }
export function rms(x: Float32Array, a = 0, b = x.length): number { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); }
export function gain(x: Float32Array, g: number): Float32Array { const y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) y[i] = x[i] * g; return y; }

// ---------- editing ----------
export const sec = (s: number) => Math.round(s * SR);
export function slice(x: Float32Array, a: number, b: number): Float32Array { return x.slice(Math.max(0, a), Math.min(x.length, b)); }

/** trim leading/trailing material below thresholdDb relative to the peak; keeps `padMs` before onset. */
export function trimSilence(x: Float32Array, thresholdDb = -50, padMs = 3): Float32Array {
  const t = peak(x) * undb(thresholdDb);
  let a = 0; while (a < x.length && Math.abs(x[a]) < t) a++;
  let b = x.length - 1; while (b > a && Math.abs(x[b]) < t) b--;
  return x.slice(Math.max(0, a - sec(padMs / 1000)), Math.min(x.length, b + 1));
}

export function fadeIn(x: Float32Array, s: number): Float32Array { const n = Math.min(x.length, sec(s)); for (let i = 0; i < n; i++) x[i] *= Math.sin((i / n) * Math.PI / 2) ** 2; return x; }
export function fadeOut(x: Float32Array, s: number): Float32Array { const n = Math.min(x.length, sec(s)); for (let i = 0; i < n; i++) x[x.length - 1 - i] *= Math.sin((i / n) * Math.PI / 2) ** 2; return x; }
/** exponential decay over the last `s` seconds down to `toDb` (used to give sustained one-shots a natural tail). */
export function decayTail(x: Float32Array, s: number, toDb = -40): Float32Array {
  const n = Math.min(x.length, sec(s)); const k = Math.log(undb(toDb));
  for (let i = 0; i < n; i++) x[x.length - n + i] *= Math.exp(k * (i / n));
  return x;
}

/** linear-interpolation resample by `rate` (>1 = higher & shorter). Used for small pitch variations of recorded layers. */
export function varispeed(x: Float32Array, rate: number): Float32Array {
  if (rate === 1) return x;
  const n = Math.floor(x.length / rate); const y = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = i * rate; const k = Math.floor(p); const f = p - k; y[i] = (x[k] ?? 0) * (1 - f) + (x[k + 1] ?? 0) * f; }
  return y;
}

export interface Layer { x: Float32Array; at?: number; gainDb?: number }
/** mix layers at offsets (seconds) into one buffer. */
export function mix(layers: Layer[]): Float32Array {
  const len = Math.max(...layers.map(l => sec(l.at ?? 0) + l.x.length));
  const y = new Float32Array(len);
  for (const l of layers) { const o = sec(l.at ?? 0); const g = undb(l.gainDb ?? 0); for (let i = 0; i < l.x.length; i++) y[o + i] += l.x[i] * g; }
  return y;
}
/** mix layers into a circular buffer of length L samples – the result loops seamlessly by construction. */
export function mixCircular(L: number, layers: Layer[]): Float32Array {
  const y = new Float32Array(L);
  for (const l of layers) { const o = sec(l.at ?? 0); const g = undb(l.gainDb ?? 0); for (let i = 0; i < l.x.length; i++) y[(o + i) % L] += l.x[i] * g; }
  return y;
}

/** one-pole filters (cheap tone shaping for ambience beds). */
export function lowpass(x: Float32Array, hz: number): Float32Array { const a = 1 - Math.exp(-2 * Math.PI * hz / SR); const y = new Float32Array(x.length); let s = 0; for (let i = 0; i < x.length; i++) { s += a * (x[i] - s); y[i] = s; } return y; }
export function highpass(x: Float32Array, hz: number): Float32Array { const l = lowpass(x, hz); const y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) y[i] = x[i] - l[i]; return y; }

/**
 * Look-ahead peak limiter: gain never lets |x| exceed `ceiling`; attack = look-ahead window, smooth release.
 * Used to bring the crest factor of very transient SFX (clicks, coins) down so their RMS matches the set.
 */
export function limit(x: Float32Array, ceiling: number, lookMs = 1.5, releaseMs = 60): Float32Array {
  const la = Math.max(1, sec(lookMs / 1000));
  const need = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); need[i] = v > ceiling ? ceiling / v : 1; }
  // running minimum over the look-ahead window (centered ahead), then release smoothing
  const g = new Float32Array(x.length);
  const rel = Math.exp(-1 / Math.max(1, sec(releaseMs / 1000)));
  let cur = 1;
  for (let i = 0; i < x.length; i++) {
    let m = 1; for (let k = i; k < Math.min(x.length, i + la); k++) if (need[k] < m) m = need[k];
    cur = m < cur ? m : m + (cur - m) * rel;
    g[i] = cur;
  }
  const y = new Float32Array(x.length);
  // apply with a la-sample delay compensation: gain ramp starts before the peak
  for (let i = 0; i < x.length; i++) y[i] = x[i] * g[i];
  for (let i = 0; i < y.length; i++) if (Math.abs(y[i]) > ceiling) y[i] = Math.sign(y[i]) * ceiling; // safety for ramp edges
  return y;
}

// ---------- spectral helpers ----------
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len; const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/** log-band magnitude frames (24 bands, 1024 FFT, hop 512) used for musical loop-point search. */
export function bandFrames(x: Float32Array, hop = 512): Float32Array[] {
  const n = 1024; const frames: Float32Array[] = [];
  const edges = Array.from({ length: 25 }, (_, i) => Math.round(2 * Math.pow(256, i / 24)));
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let p = 0; p + n <= x.length; p += hop) {
    for (let i = 0; i < n; i++) { re[i] = x[p + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / n)); im[i] = 0; }
    fft(re, im);
    const f = new Float32Array(24);
    for (let b = 0; b < 24; b++) { let s = 0; for (let k = edges[b]; k < Math.max(edges[b] + 1, edges[b + 1]); k++) s += Math.hypot(re[k], im[k]); f[b] = Math.log(1e-6 + s); }
    frames.push(f);
  }
  return frames;
}

/** normalized cross-correlation of x[a..a+n] vs x[b..b+n]. */
export function ncc(x: Float32Array, a: number, b: number, n: number): number {
  let s = 0, sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { const u = x[a + i], v = x[b + i]; s += u * v; sa += u * u; sb += v * v; }
  return s / Math.sqrt(sa * sb + 1e-12);
}

/** mulberry32 – deterministic placement of scattered ambience events. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
