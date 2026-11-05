/* eslint-disable @typescript-eslint/no-explicit-any -- in-page probes read untyped window hooks */
/**
 * G2 video (Brief §13.3 G2): the first 60 s of a fresh game at 907×510, played like the self-review player (taps where
 * the tutorial ring is after a 1 s reaction time, real mouse clicks). After the tutorial it closes the canteen panel and
 * builds what the clipboard asks for (the Knitting Nook) through the real UI: Rooms → card → drag on the map. Deterministic capture: ?capture=1, one
 * window.__step(1) (1/30 s of game time) and one screenshot per video frame, piped to ffmpeg (H.264, 30 fps).
 * Headless Chromium records no sound, so the game's own audio log is written next to the video: every voice the mixer
 * started (window.__audioLog, mapped to the video frame it started in) and, once per second, the running loops with their
 * targets. tools/selfreview/mix-audio.ts mixes the shipped MP3s from that log and muxes them into the mp4.
 * Not part of `npm run qa`; run by hand:
 *   PW_PORT=<preview port> SR_SPEC=video.spec.ts VID_OUT=<dir> npx playwright test -c tools/selfreview/pw.config.ts --workers=1
 */
import { test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setup, gotoGame } from '../../tests/e2e/helpers';
import { instr, hook, snap, tapAt, tileToScreen, type Win } from '../../tests/e2e/accept-kit';

const OUT = process.env.VID_OUT ?? 'test-results/video';
const SECS = Number(process.env.VID_SECS ?? 60);
const LANG = process.env.VID_LANG ?? 'en';

test.use({ viewport: { width: 907, height: 510 }, deviceScaleFactor: 1 });
test(`first ${SECS} s video @ 907x510`, async ({ page }) => {
  test.setTimeout(3_600_000);
  mkdirSync(OUT, { recursive: true });
  await page.addInitScript(instr);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await setup(page);
  await gotoGame(page, `capture=1&lang=${LANG}`, 0);
  await hook(page);
  const frames = SECS * 30;
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${OUT}/video-only.mp4`], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frameT: number[] = [];
  const loops: { f: number; loops: { id: string; target: number }[] }[] = [];
  let ringKey = '', ringSince = -1;
  const clicks: { f: number; what: string }[] = [];
  // the mixer keeps only its last 200 log entries: harvest every 15 frames
  const log: { id: string; t: number; src: string; skip: string | null; cut: string | null }[] = [];
  const harvest = async () => {
    const since = log.length ? log[log.length - 1].t : -1;
    log.push(...await page.evaluate(t0 => ((window as unknown as Win).__audioLog as any[]).filter(e => e.t > t0).map(e => ({ id: e.id, t: e.t, src: e.src, skip: e.skip ?? null, cut: e.cut ?? null })), since));
  };
  // after the tutorial: Esc (close the panel), then Rooms → Knitting Nook → drag a 4×4 (same spot the casual bot picks)
  let doneAt = -1, built = false, escaped = false, wantBuild = false;
  const center = (sel: string) => page.evaluate(q => { const el = document.querySelector(q); if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; }, sel);
  const stepCap = async () => { // one frame of game time + its video frame (used while the hands are busy)
    frameT.push(await page.evaluate(() => { const g = window as unknown as Win; const t0 = performance.now(); g.__step(1); return t0; }));
    const buf = await page.screenshot({ type: 'jpeg', quality: 92, timeout: 90_000 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  };
  for (let i = 0; i < frames; i++) {
    if (wantBuild && !built) {
      built = true;
      const rb = await center('.bb-rooms');
      if (rb) {
        await page.mouse.move(rb.x, rb.y); await stepCap(); i++;
        await page.mouse.click(rb.x, rb.y); clicks.push({ f: i, what: 'rooms' });
        for (let k = 0; k < 20; k++) { await stepCap(); i++; }
        const card = await center('.bb-card[data-room="workshop"]');
        if (card) {
          await page.mouse.move(card.x, card.y); for (let k = 0; k < 8; k++) { await stepCap(); i++; }
          await page.mouse.click(card.x, card.y); clicks.push({ f: i, what: 'card' });
          for (let k = 0; k < 15; k++) { await stepCap(); i++; }
          const a = await tileToScreen(page, 5.5, 11.5), b = await tileToScreen(page, 7.5, 13.5);
          if (a.canvas && b.canvas) {
            await page.mouse.move(a.x, a.y); for (let k = 0; k < 8; k++) { await stepCap(); i++; }
            await page.mouse.down();
            for (let k = 1; k <= 12; k++) { await page.mouse.move(a.x + (b.x - a.x) * k / 12, a.y + (b.y - a.y) * k / 12); await stepCap(); i++; }
            await page.mouse.up(); clicks.push({ f: i, what: 'drag-build' });
            await page.mouse.move(450, 300);
          }
        }
      }
    }
    const t = await page.evaluate(() => { const g = window as unknown as Win; const t0 = performance.now(); g.__step(1); return t0; });
    frameT.push(t);
    if (i % 15 === 0) await harvest();
    if (i % 30 === 0) loops.push({ f: i, loops: await page.evaluate(() => (window as unknown as Win).__audio.debug().loops) });
    if (i % 6 === 0) {
      const s = await snap(page);
      if (s.done && doneAt < 0) doneAt = s.rt;
      if (doneAt >= 0 && !escaped && s.rt - doneAt >= 2500) { escaped = true; await page.keyboard.press('Escape'); clicks.push({ f: i, what: 'esc' }); }
      if (doneAt >= 0 && !built && s.rt - doneAt >= 5000) wantBuild = true;
      if (s.active && s.ring) {
        const k = `${s.step}:${Math.round(s.ring.x / 30)},${Math.round(s.ring.y / 30)}`;
        if (k !== ringKey) { ringKey = k; ringSince = s.rt; }
        if (s.rt - ringSince >= 1000 && s.ring.x >= 0 && s.ring.y >= 0 && s.ring.x < 907 && s.ring.y < 510) {
          const c = await tapAt(page, s.ring.x, s.ring.y, `ring-step${s.step}`);
          clicks.push({ f: i, what: c.what });
          ringSince = s.rt + 1500;
        }
      }
    }
    const buf = await page.screenshot({ type: 'jpeg', quality: 92, timeout: 90_000 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 300 === 0) console.log(`[video] frame ${i}/${frames}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await harvest();
  const voices = log.filter(e => !e.skip).map(e => {
    let f = frameT.findIndex(t => t > e.t) - 1;
    if (f < 0) f = e.t >= frameT[frameT.length - 1] ? frameT.length - 1 : 0;
    return { id: e.id, f, cut: e.cut };
  });
  writeFileSync(`${OUT}/audio-log.json`, JSON.stringify({ fps: 30, frames, voices, loops, clicks, skipped: log.filter(e => e.skip).length, errors }, null, 1));
  console.log(`[video] ${frames} frames, ${voices.length} voices, ${clicks.length} clicks (${clicks.map(c => `${c.what}@${(c.f / 30).toFixed(1)}s`).join(' ')}), errors ${errors.length}`);
});
