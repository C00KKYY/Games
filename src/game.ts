import { Application, Culler } from 'pixi.js';
import type { Platform } from './platform/platform';
import { loadAtlas } from './render/atlas';
import { Camera } from './render/camera';
import { attachInput, type InputGate } from './ui/input';
import { rclock } from './render/rclock';
// static imports: Pixi registers its Graphics/mask pipes as module side effects – a lazily loaded scene
// chunk would register them after app.init() and polygons/masks would silently not render
import { createApp } from './app';
import { createSpike } from './spike';
import { mountHudSketch } from './ui/hudSketch';

interface Scene { container: import('pixi.js').Container; frameStart(): void; insets(): { top: number; bottom: number; left: number; right: number }; frame(dt: number): void; groundCull?: import('pixi.js').Container; input?: InputGate }

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
  setBoot(0.8);
  // the language comes from the SDK locale and the save may only be read after init, so wait for init (or its
  // timeout) before building the world and the UI (Brief §9.2.4, §9.2.6). SDK init ran in parallel with the assets.
  await platform.ready;
  setBoot(0.9);

  let scene: Scene;
  if (params.has('spike')) {
    // M1 art-spike reference scene (G1)
    const spike = createSpike(app, cam, params);
    const hud = mountHudSketch(document.getElementById('app')!, params);
    scene = { container: spike.container, frameStart: spike.frameStart, insets: () => hud.insets(), frame: (dt) => { spike.update(dt); hud.update(spike.hour); }, groundCull: spike.world.ground };
  } else {
    const a = await createApp(app, cam, platform, params);
    // getters: the app can replace its world (and with it the scene container) after a late SDK init (Brief §9.2.4)
    scene = { get container() { return a.container; }, frameStart: a.frameStart, insets: a.insets, frame: a.frame, get groundCull() { return a.groundCull; }, input: a.input };
    (window as unknown as Record<string, unknown>).__game = { app, cam, a };
  }

  const applyView = () => { cam.inset = scene.insets(); cam.setView(window.innerWidth, window.innerHeight); };
  applyView();
  const frame0 = () => {
    if (params.get('cam') === 'wide') cam.fit(-3 * 32, 7 * 32, 26 * 32, 24 * 32, 0); else scene.frameStart();
    if (params.has('z')) { cam.zoom = cam.targetZoom = Number(params.get('z')); cam.x = Number(params.get('cx') ?? cam.x / 32) * 32; cam.y = Number(params.get('cy') ?? cam.y / 32) * 32; cam.clamp(); }
  };
  frame0();
  window.addEventListener('resize', () => { applyView(); frame0(); });
  attachInput(canvas, cam, scene.input);
  let insetT = 0;
  const frame = (dt: number) => {
    rclock.t += dt;
    insetT += dt;
    if (insetT > 0.5) { insetT = 0; const i = scene.insets(); if (Math.abs(i.top - cam.inset.top) > 1 || Math.abs(i.bottom - cam.inset.bottom) > 1) { cam.inset = i; cam.clamp(); } }
    cam.update(dt);
    cam.apply(scene.container);
    scene.frame(dt);
    if (scene.groundCull) Culler.shared.cull(scene.groundCull, app.screen, false);
  };
  if (params.has('capture')) {
    app.ticker.stop();
    (window as unknown as Record<string, unknown>).__step = (n = 1) => { for (let i = 0; i < n; i++) frame(1 / 30); app.render(); };
  } else app.ticker.add(tk => frame(Math.min(0.1, tk.deltaMS / 1000)));
  setBoot(1);
  document.getElementById('boot')?.classList.add('gone');
  platform.gameplayStart();
}
