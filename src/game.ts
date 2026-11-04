import { Application, Culler } from 'pixi.js';
import type { Platform } from './platform/platform';
import { loadAtlas } from './render/atlas';
import { Camera } from './render/camera';
import { createSpike } from './spike';
import { mountHudSketch } from './ui/hudSketch';
import { attachInput } from './ui/input';
import { rclock } from './render/rclock';
import { SimView } from './render/simView';
import { newGame, Stepper } from './sim/sim';
import { hourOf } from './sim/time';
import type { Camera as Cam } from './render/camera';
import type { Application as App } from 'pixi.js';

/** sim-driven scene (dev: ?sim, ?bot=casual|optimal, ?speed=2, ?seed=n) – becomes the default in M3 */
async function createSimScene(app: App, cam: Cam, params: URLSearchParams) {
  const w = newGame(Number(params.get('seed') ?? 1), { debug: params.has('debug') });
  w.speed = Number(params.get('speed') ?? 1);
  const view = new SimView(app, w);
  const stepper = new Stepper(w);
  let bot: { step(): void } | null = null;
  if (params.get('bot')) { const m = await import('../tools/bots'); bot = new m.BotDriver(w, { profile: params.get('bot') as 'casual', seed: 1 }); }
  // dev: ?warp=<seconds> simulates ahead before the first frame
  const warp = Number(params.get('warp') ?? 0) * 1000;
  if (warp > 0) { const { tick } = await import('./sim/sim'); while (w.rtMs < warp) { tick(w); bot?.step(); } }
  cam.bounds = { x0: -5 * 32, y0: -3 * 32, x1: 37 * 32, y1: 33 * 32 };
  (window as unknown as Record<string, unknown>).__sim = w;
  return {
    world: view.world, container: view.container,
    frameStart: () => cam.fit(-3.2 * 32, 10.0 * 32, 18.4 * 32, 23.6 * 32, 4),
    get hour() { return hourOf(w.t); },
    setNight(_h: number) { /* sim owns the clock */ },
    update(dt: number) {
      const before = stepper.ticks;
      stepper.frame(dt * 1e6);
      if (bot) for (let i = before; i < stepper.ticks; i++) bot.step();
      view.update(dt);
    },
  };
}

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

  const simMode = params.has('sim');
  const spike = simMode ? await createSimScene(app, cam, params) : createSpike(app, cam, params);
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
