/**
 * Deterministic video capture (Brief §15.3): fixed 1/30 s steps, one screenshot per step, encoded with ffmpeg x264.
 * tsx tools/capture.ts <query> <WxH> <seconds> <out.mp4> [script]
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const [q = '', size = '1280x720', secs = '20', out = 'qa/g1/spike.mp4', script = 'g1'] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const MOCK = readFileSync(new URL('../tests/fixtures/sdk-mock.js', import.meta.url), 'utf8');
const frames = Math.round(Number(secs) * 30);

(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.route('https://sdk.crazygames.com/**', r => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
  await p.goto(`http://localhost:4173/?capture=1&${q}`);
  await p.waitForFunction(() => !!(window as any).__step, null, { timeout: 20000 });
  await p.waitForTimeout(800);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-i', '-', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  // plain string so the bundler cannot inject helpers into browser code
  await p.evaluate(`(() => {
    const script = ${JSON.stringify(script)}, frames = ${frames};
    const g = window.__game; const cam = g.cam;
    const start = { x: cam.x, y: cam.y, z: cam.zoom };
    function ease(t) { return t * t * (3 - 2 * t); }
    window.__hook = function (i) {
      const k = i / frames;
      if (script === 'g1') {
        if (k < 0.4) { const t = ease(k / 0.4); cam.x = start.x - 60 + t * 120; cam.y = start.y; cam.zoom = cam.targetZoom = start.z; }
        else if (k < 0.7) { const t = ease((k - 0.4) / 0.3); cam.x = start.x + 60 + (6.8 * 32 - start.x - 60) * t; cam.y = start.y + (12.6 * 32 - start.y) * t; cam.zoom = cam.targetZoom = start.z + t * 0.55; }
        else { const t = ease((k - 0.7) / 0.3); cam.x = 6.8 * 32 + (start.x + 40 - 6.8 * 32) * t; cam.y = 12.6 * 32 + (start.y + 20 - 12.6 * 32) * t; cam.zoom = cam.targetZoom = start.z + 0.55 - t * 0.7; g.spike.setNight(17.5 + t * 5); }
      }
    };
  })()`);
  for (let i = 0; i < frames; i++) {
    await p.evaluate(`window.__hook(${i}); window.__step(1);`);
    const buf = await p.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await b.close();
  console.log(out);
})();
