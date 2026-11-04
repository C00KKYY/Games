import { Application, Culler } from 'pixi.js';
import type { Platform } from './platform/platform';
import { loadAtlas } from './render/atlas';
import { Camera } from './render/camera';
import { createSpike } from './spike';
import { mountHudSketch } from './ui/hudSketch';
import { attachInput } from './ui/input';
import { rclock } from './render/rclock';

export async function startGame(platform: Platform, setBoot: (p: number) => void) {
  const params = new URLSearchParams(location.search);
  const app = new Application();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  try {
    await app.init({ preference: ['webgl'] as never, powerPreference: 'low-power', resizeTo: window, resolution: dpr, autoDensity: true, background: 0x33908a, antialias: false });
  } catch (e) {
    console.error(e);
    document.getElementById('boot')?.insertAdjacentHTML('beforeend', '<p style="font:600 16px system-ui;color:#f8f0de;max-width:80vw;text-align:center">Your browser could not start WebGL. Please enable hardware acceleration or try another browser.</p>');
    return;
  }
  const canvas = app.canvas as HTMLCanvasElement;
  canvas.id = 'world';
  document.getElementById('app')!.appendChild(canvas);
  setBoot(0.35);
  const cam = new Camera();
  await Promise.all([loadAtlas(dpr, cam.maxZoom, p => setBoot(0.35 + p * 0.45)), document.fonts.load('700 20px Fredoka').catch(() => undefined)]);
  setBoot(0.85);

  const spike = createSpike(app, cam, params);
  const hud = mountHudSketch(document.getElementById('app')!, params);
  const applyView = () => {
    cam.inset = hud.insets();
    cam.setView(window.innerWidth, window.innerHeight);
  };
  applyView();
  const frame0 = () => {
    if (params.get('cam') === 'wide') cam.fit(-3 * 32, 7 * 32, 26 * 32, 24 * 32, 0); else spike.frameStart();
    if (params.has('z')) { cam.zoom = cam.targetZoom = Number(params.get('z')); cam.x = Number(params.get('cx') ?? cam.x / 32) * 32; cam.y = Number(params.get('cy') ?? cam.y / 32) * 32; cam.clamp(); }
  };
  frame0();
  window.addEventListener('resize', () => { applyView(); frame0(); });
  attachInput(canvas, cam);

  const frame = (dt: number) => {
    rclock.t += dt;
    cam.update(dt);
    cam.apply(spike.container);
    spike.update(dt);
    hud.update(spike.hour);
    Culler.shared.cull(spike.world.ground, app.screen, false);
  };
  if (params.has('capture')) {
    // deterministic capture: fixed 1/30 s steps driven by the capture tool (Brief §15.3)
    app.ticker.stop();
    (window as unknown as Record<string, unknown>).__step = (n = 1) => { for (let i = 0; i < n; i++) frame(1 / 30); app.render(); };
  } else app.ticker.add(t => frame(Math.min(0.1, t.deltaMS / 1000)));
  await platform.ready;
  setBoot(1);
  document.getElementById('boot')?.classList.add('gone');
  platform.gameplayStart();
  (window as unknown as Record<string, unknown>).__game = { app, cam, spike };
}
