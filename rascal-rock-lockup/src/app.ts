/**
 * Game app: sim + renderer + DOM UI wired through one UICtx (docs/UI_DESIGN.md).
 * Dev params: ?bot=casual|optimal, ?warp=<s>, ?speed=n, ?seed=n, ?debug, ?lang=de, ?capture
 */
import { Container, type Application } from 'pixi.js';
import './ui/hud.css';
import type { Platform } from './platform/platform';
import type { Camera } from './render/camera';
import { SimView } from './render/simView';
import { newGame, Stepper, cmd, tick } from './sim/sim';
import type { World, CommandResult, SimEvent } from './sim/types';
import { t, fmtNum, setLang, getLang, langFromLocale, type Lang, type Key } from './i18n/i18n';
import { Store, type UICtx, type Component, type Selection, type Tool } from './ui/ctx';
import { DEFAULT_SETTINGS, type Settings } from './save/serialize';
import { mountTooltips } from './ui/tooltips';
import { mountToasts } from './ui/toasts';
import { mountTopbar } from './ui/topbar';
import { mountClipboard } from './ui/clipboard';
import { mountBuildbar } from './ui/buildbar';
import { mountBuildMenu } from './ui/buildMenu';
import { mountStaffMenu } from './ui/staffMenu';
import { mountPanels } from './ui/panels';
import { mountModals } from './ui/modals';
import { mountTools } from './ui/tools';
import { mountTutorial } from './ui/tutorial';
import { mountJuice } from './render/juice';
import { mountAudio, type Audio } from './audio/audio';

/** every CommandResult reason the sim returns (src/sim/rooms.ts, src/sim/sim.ts cmd) → its localised message */
const REASON_KEY: Record<string, Key> = {
  // placement (PlaceReason) and shared ones
  tooSmall: 'place.tooSmall', tooLarge: 'place.tooLarge', outside: 'place.outside', overlap: 'place.overlap',
  blocksPath: 'place.blocksPath', onRoad: 'place.onRoad', coins: 'place.coins', locked: 'place.locked',
  // room commands
  noRoom: 'overlays.reason.noRoom', unchanged: 'overlays.reason.unchanged', invalid: 'overlays.reason.invalid',
  max: 'panels.maxLevel', lastOfType: 'tools.reason.lastOfType', tooLate: 'tools.reason.tooLate',
  // taps, loan
  noFerry: 'overlays.reason.noFerry', cooldown: 'tools.reason.cooldown', empty: 'overlays.reason.empty',
  none: 'overlays.reason.none', open: 'overlays.reason.open',
};

export interface App { w: World; ctx: UICtx; input: { ownsPointer: boolean; onPanStart(): void }; frame(dt: number): void; container: Container; groundCull: Container; frameStart(): void; insets(): { top: number; bottom: number; left: number; right: number } }

export async function createApp(app: Application, cam: Camera, platform: Platform, params: URLSearchParams): Promise<App> {
  const w = newGame(Number(params.get('seed') ?? 1), { debug: params.has('debug') });
  w.speed = Number(params.get('speed') ?? 1);
  const lang: Lang = (params.get('lang') as Lang) ?? langFromLocale(platform.info().locale);
  setLang(lang === 'de' ? 'de' : 'en');
  document.documentElement.lang = getLang();

  const view = new SimView(app, w);
  const overlay = new Container();
  view.world.root.addChild(overlay); // world space, above everything
  const stepper = new Stepper(w);
  let bot: { step(): void } | null = null;
  if (params.get('bot')) { const m = await import('../tools/bots'); bot = new m.BotDriver(w, { profile: params.get('bot') as 'casual', seed: 1 }); }
  const warp = Number(params.get('warp') ?? 0) * 1000;
  if (warp > 0) while (w.rtMs < warp) { tick(w); bot?.step(); }
  cam.bounds = { x0: -5 * 32, y0: -3 * 32, x1: 37 * 32, y1: 33 * 32 };

  const root = document.createElement('div');
  root.className = 'hud';
  document.getElementById('app')!.appendChild(root);
  const compact = new Store(window.innerWidth <= 900);
  window.addEventListener('resize', () => compact.set(window.innerWidth <= 900));

  let paused = false, speedBeforePause = 1;
  const late: { tip?: ReturnType<typeof mountTooltips>; toasts?: ReturnType<typeof mountToasts>; modals?: ReturnType<typeof mountModals>; audio?: Audio } = {};
  const fly = { on: false, x: 0, y: 0, z: 1 };
  const subs: ((e: SimEvent) => void)[] = [];
  let evSeen = w.eventSeq;
  const panned = new Store(0);
  const input = { ownsPointer: false, onPanStart: () => panned.set(panned.get() + 1) };

  const ctx: UICtx = {
    w, cmd, t, lang: getLang, fmt: fmtNum, cam, root,
    icon: (n: string) => `ui/${n}.svg`,
    selection: new Store<Selection>(null),
    tool: new Store<Tool>({ kind: 'none' }),
    menu: new Store<'rooms' | 'staff' | null>(null),
    canvas: app.canvas as HTMLCanvasElement,
    overlay,
    compact,
    touch: matchMedia('(pointer: coarse)').matches,
    toast: (text, opts) => late.toasts?.toast(text, opts),
    tip: (el, c) => late.tip?.tip(el, c),
    focusTile(x, y, z) { fly.on = true; fly.x = x * 32; fly.y = y * 32; fly.z = z ?? Math.max(cam.zoom, 1); },
    sound: (name: string) => late.audio?.play(name),
    setPaused(p) {
      if (p === paused) return;
      paused = p;
      if (p) { speedBeforePause = w.speed || 1; w.speed = 0; platform.gameplayStop(); }
      else { w.speed = speedBeforePause; platform.gameplayStart(); }
    },
    paused: () => paused,
    openModal(name) { late.modals?.open(name); },
    closeModal() { late.modals?.close(); },
    feedback(r: CommandResult, message?: string) {
      if (r.ok) return;
      const key = (r.reason && REASON_KEY[r.reason]) || 'place.overlap'; // unknown reason → generic "something is in the way"
      ctx.toast(message ?? t(key), { kind: 'bad', ms: 1800 });
    },
    onEvent(fn) { subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; },
    input,
    panned,
    settings: new Store<Settings>({ ...DEFAULT_SETTINGS, lang: getLang() }),
    setLang(l: Lang) { setLang(l); document.documentElement.lang = l; ctx.settings.set({ ...ctx.settings.get(), lang: l }); },
  };
  // dispatch every new sim event exactly once (events are a ring of EVENT_CAP; eventSeq counts all ever emitted)
  const dispatch = () => {
    const n = Math.min(w.events.length, w.eventSeq - evSeen);
    evSeen = w.eventSeq;
    if (n <= 0) return;
    for (const e of w.events.slice(w.events.length - n)) for (const f of subs.slice()) f(e);
  };

  late.audio = mountAudio(ctx, platform);
  late.tip = mountTooltips(ctx);
  late.toasts = mountToasts(ctx);
  late.modals = mountModals(ctx);
  const comps: Component[] = [late.tip, late.toasts, mountTopbar(ctx), mountClipboard(ctx), mountBuildbar(ctx), mountBuildMenu(ctx), mountStaffMenu(ctx), mountPanels(ctx), late.modals, mountTools(ctx), mountTutorial(ctx), mountJuice(ctx, view), late.audio];
  (window as unknown as Record<string, unknown>).__sim = w;
  (window as unknown as Record<string, unknown>).__ctx = ctx;
  // test hook (D5): the tooltip content actually bound to an element through ctx.tip (null when none is bound)
  (window as unknown as Record<string, unknown>).__tipOf = (el: HTMLElement) => late.tip?.contentOf(el) ?? null;

  const insets = () => {
    const top = Math.max(0, ...[...root.querySelectorAll<HTMLElement>('[data-hud="top"]')].map(e => e.getBoundingClientRect().bottom)) + 2;
    const bottoms = [...root.querySelectorAll<HTMLElement>('[data-hud="bottom"]')].map(e => e.getBoundingClientRect().top);
    const bottom = bottoms.length ? window.innerHeight - Math.min(...bottoms) + 2 : 0;
    return { top, bottom, left: 0, right: 0 };
  };

  return {
    w, ctx, input, container: view.container, groundCull: view.world.ground, insets,
    frameStart: () => cam.fit(-3.2 * 32, 10.0 * 32, 18.4 * 32, 23.6 * 32, 4),
    frame(dt: number) {
      if (fly.on) {
        const k = Math.min(1, dt * 5);
        cam.x += (fly.x - cam.x) * k; cam.y += (fly.y - cam.y) * k; cam.zoom += (fly.z - cam.zoom) * k; cam.targetZoom = cam.zoom;
        if (Math.hypot(fly.x - cam.x, fly.y - cam.y) < 1 && Math.abs(fly.z - cam.zoom) < 0.01) fly.on = false;
      }
      const before = stepper.ticks;
      stepper.frame(dt * 1e6);
      if (bot) for (let i = before; i < stepper.ticks; i++) bot.step();
      view.update(dt);
      dispatch();
      for (const c of comps) c.update(dt);
    },
  };
}
