/**
 * Game app: sim + renderer + DOM UI wired through one UICtx (docs/UI_DESIGN.md), plus saving (Brief §9.2, §9.7).
 * Dev params: ?bot=casual|optimal, ?warp=<s>, ?speed=n, ?seed=n, ?debug, ?lang=de, ?capture,
 *   ?fresh (ignore an existing save, start a new game that overwrites it), ?nosave (no load, no save).
 *   ?bot / ?warp / ?capture imply ?nosave (deterministic sandboxes never touch the player's save).
 *
 * World replacement (late SDK init with an existing save, Brief §9.2.4): the UICtx object, its stores and the audio
 * component live for the whole session; everything bound to one World (SimView, overlay, stepper, all other
 * components) is a "generation" that is torn down and re-mounted on the new world behind a cross-fade.
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
import { DEFAULT_SETTINGS, SLOT_KEYS, type Settings } from './save/serialize';
import { SaveStore, Autosave, type LoadOutcome } from './save/store';
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
import { assetUrl } from './platform/assets';

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

/** sim events that count as an important action → save soon (debounced ≤ 1 write / 2 s, Brief §9.7) */
const SAVE_EVENTS = new Set(['build', 'built', 'upgrade', 'release', 'objective', 'hire', 'demolish', 'resize', 'star', 'unlock', 'loan', 'loanRepaid']);
const FADE_MS = 320;

export interface App { readonly w: World; ctx: UICtx; input: { ownsPointer: boolean; onPanStart(): void }; frame(dt: number): void; readonly container: Container; readonly groundCull: Container; frameStart(): void; insets(): { top: number; bottom: number; left: number; right: number } }

/** one World with everything bound to it */
interface Gen { w: World; view: SimView; overlay: Container; stepper: Stepper; bot: { step(): void } | null; comps: Component[]; offs: (() => void)[] }

export async function createApp(app: Application, cam: Camera, platform: Platform, params: URLSearchParams): Promise<App> {
  // ------------------------------------------------------------------ save read (platform.ready has resolved: §9.2.4)
  const sandbox = params.has('bot') || params.has('warp') || params.has('capture') || params.has('nosave');
  const store = new SaveStore(() => (sandbox ? null : platform.storage()));
  const loaded: LoadOutcome = params.has('fresh') ? { kind: 'none' } : store.load();
  const startSettings: Settings = loaded.kind === 'ok' ? loaded.settings : { ...DEFAULT_SETTINGS };
  const w0 = loaded.kind === 'ok' ? loaded.world : newGame(Number(params.get('seed') ?? 1), { debug: params.has('debug') });
  if (loaded.kind === 'ok') w0.debug = params.has('debug');
  const initSpeed = (x: World) => { x.speed = params.has('speed') ? Number(params.get('speed')) : x.speed > 0 ? x.speed : 1; };
  if (loaded.kind === 'ok') initSpeed(w0); else w0.speed = Number(params.get('speed') ?? 1);
  // language fixed at boot: ?lang > the player's saved choice > SDK locale (a late SDK locale never switches it, §9.2.6)
  const lang: Lang = (params.get('lang') as Lang) ?? startSettings.lang ?? langFromLocale(platform.info().locale);
  setLang(lang === 'de' ? 'de' : 'en');
  document.documentElement.lang = getLang();

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
  /** while a generation mounts, every onEvent / store subscription is recorded so a world swap can drop it */
  let track: (() => void)[] | null = null;
  const tracked = <T>(st: Store<T>): Store<T> => {
    const on = st.on.bind(st);
    st.on = fn => { const off = on(fn); track?.push(off); return off; };
    return st;
  };
  const panned = tracked(new Store(0));
  const input = { ownsPointer: false, onPanStart: () => panned.set(panned.get() + 1) };

  const ctx: UICtx = {
    w: w0, cmd, t, lang: getLang, fmt: fmtNum, cam, root,
    icon: (n: string) => assetUrl(`ui/${n}.svg`),
    selection: tracked(new Store<Selection>(null)),
    tool: tracked(new Store<Tool>({ kind: 'none' })),
    menu: tracked(new Store<'rooms' | 'staff' | null>(null)),
    canvas: app.canvas as HTMLCanvasElement,
    overlay: new Container(),
    compact: tracked(compact),
    touch: matchMedia('(pointer: coarse)').matches,
    toast: (text, opts) => late.toasts?.toast(text, opts),
    tip: (el, c) => late.tip?.tip(el, c),
    focusTile(x, y, z) { fly.on = true; fly.x = x * 32; fly.y = y * 32; fly.z = z ?? Math.max(cam.zoom, 1); },
    sound: (name: string) => late.audio?.play(name),
    setPaused(p) {
      if (p === paused) return;
      paused = p;
      if (p) { speedBeforePause = ctx.w.speed || 1; ctx.w.speed = 0; platform.gameplayStop(); }
      else { ctx.w.speed = speedBeforePause; platform.gameplayStart(); }
    },
    paused: () => paused,
    openModal(name) { late.modals?.open(name); },
    closeModal() { late.modals?.close(); },
    feedback(r: CommandResult, message?: string) {
      if (r.ok) return; ctx.sound('deny');
      const key = (r.reason && REASON_KEY[r.reason]) || 'place.overlap'; // unknown reason → generic "something is in the way"
      ctx.toast(message ?? t(key), { kind: 'bad', ms: 1800 });
    },
    onEvent(fn) {
      subs.push(fn);
      const off = () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); };
      track?.push(off);
      return off;
    },
    input,
    panned,
    settings: tracked(new Store<Settings>(startSettings)),
    setLang(l: Lang) { setLang(l); document.documentElement.lang = l; ctx.settings.set({ ...ctx.settings.get(), lang: l }); },
  };

  // ------------------------------------------------------------------ autosave (Brief §9.7)
  const autosave = new Autosave(() => {
    if (!store.available()) return false;
    // a save made while paused keeps the speed the player will resume with
    const w = ctx.w, sp = w.speed;
    if (paused) w.speed = speedBeforePause;
    const r = store.save(w, ctx.settings.get());
    w.speed = sp;
    return r.ok;
  }, performance.now());
  ctx.settings.on(() => autosave.request()); // settings live in the save doc – persist on change
  ctx.onEvent(e => { if (SAVE_EVENTS.has(e.type)) autosave.request(); });
  const flushSave = () => {
    if (swapping) return;
    if (store.externallyCleared()) { store.clear(); return; } // "Reset progress" wiped the slots and reloads: stay wiped
    autosave.flush(performance.now());
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
  window.addEventListener('pagehide', flushSave);

  // ------------------------------------------------------------------ generations
  let evSeen = 0;
  let swapping = false;
  late.audio = mountAudio(ctx, platform); // session-long: reads ctx.w live, keeps its AudioContext across a world swap

  const mountGen = (w: World, bot: { step(): void } | null): Gen => {
    ctx.w = w;
    const view = new SimView(app, w);
    const overlay = new Container();
    view.world.root.addChild(overlay); // world space, above everything
    ctx.overlay = overlay;
    evSeen = w.eventSeq;
    const offs: (() => void)[] = [];
    track = offs;
    try {
      late.tip = mountTooltips(ctx);
      late.toasts = mountToasts(ctx);
      late.modals = mountModals(ctx);
      const comps: Component[] = [late.tip, late.toasts, mountTopbar(ctx), mountClipboard(ctx), mountBuildbar(ctx), mountBuildMenu(ctx), mountStaffMenu(ctx), mountPanels(ctx), late.modals, mountTools(ctx), mountTutorial(ctx), mountJuice(ctx, view), late.audio!];
      (window as unknown as Record<string, unknown>).__sim = w;
      (window as unknown as Record<string, unknown>).__view = view; // test hook (E): agent views (walk phase, facing)
      return { w, view, overlay, stepper: new Stepper(w), bot, comps, offs };
    } finally { track = null; }
  };
  const unmountGen = (g: Gen) => {
    for (const c of g.comps) if (c !== late.audio) { try { c.destroy?.(); } catch (e) { console.warn('[app] destroy', e); } }
    for (const off of g.offs.splice(0)) off();
    root.replaceChildren(); // safety net for a component without destroy()
    app.stage.removeChild(g.view.world.root);
    g.view.world.root.destroy({ children: true }); // shared atlas textures stay alive
  };

  let bot: { step(): void } | null = null;
  if (params.get('bot')) { const m = await import('../tools/bots'); bot = new m.BotDriver(w0, { profile: params.get('bot') as 'casual', seed: 1 }); }
  const warp = Number(params.get('warp') ?? 0) * 1000;
  if (warp > 0) while (w0.rtMs < warp) { tick(w0); bot?.step(); }
  let gen = mountGen(w0, bot);

  (window as unknown as Record<string, unknown>).__ctx = ctx;
  // test hook (D5): the tooltip content actually bound to an element through ctx.tip (null when none is bound)
  (window as unknown as Record<string, unknown>).__tipOf = (el: HTMLElement) => late.tip?.contentOf(el) ?? null;

  /** cross-fade to another world (late init found a save): fade in, rebuild the generation, fade out */
  const replaceWorld = async (nw: World, settings: Settings) => {
    if (swapping) return;
    swapping = true;
    const fade = document.createElement('div');
    fade.dataset.overlay = 'save-fade';
    fade.setAttribute('aria-hidden', 'true');
    fade.style.cssText = `position:fixed;inset:0;z-index:45;background:#33908a;opacity:0;transition:opacity ${FADE_MS}ms ease-out;pointer-events:auto`;
    document.body.appendChild(fade);
    void fade.offsetWidth;
    fade.style.opacity = '1';
    await new Promise(r => setTimeout(r, FADE_MS + 30));
    try {
      if (paused) { paused = false; platform.gameplayStart(); }
      unmountGen(gen);
      ctx.selection.set(null); ctx.tool.set({ kind: 'none' }); ctx.menu.set(null);
      input.ownsPointer = false; fly.on = false;
      initSpeed(nw);
      if (!params.get('lang') && settings.lang && settings.lang !== getLang()) { setLang(settings.lang); document.documentElement.lang = settings.lang; }
      ctx.settings.set(settings);
      gen = mountGen(nw, null);
    } catch (e) { console.error('[app] world swap failed', e); }
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    fade.style.opacity = '0';
    setTimeout(() => fade.remove(), FADE_MS + 50);
    swapping = false;
    ctx.toast(t('save.restored'), { kind: 'good', ms: 3500 });
  };

  // ------------------------------------------------------------------ save state messages + late init (Brief §9.2.4)
  if (loaded.kind === 'ok' && loaded.damaged) ctx.toast(t('save.damagedOne'), { kind: 'info', ms: 4000 });
  if (loaded.kind === 'corrupt') ctx.toast(t('save.damagedAll'), { kind: 'info', ms: 4000 });
  if (!sandbox && platform.saveState() === 'failed') ctx.toast(t('save.unavailable'), { kind: 'info', ms: 3500 });
  platform.onSaveFailed(() => { if (!sandbox) ctx.toast(t('save.unavailable'), { kind: 'info', ms: 3500 }); });
  platform.onLateInit(() => {
    if (sandbox) return;
    const r = store.load();
    if (r.kind === 'ok') { void replaceWorld(r.world, r.settings).then(() => { if (r.damaged) ctx.toast(t('save.damagedOne'), { kind: 'info', ms: 4000 }); }); return; }
    if (r.kind === 'corrupt') ctx.toast(t('save.damagedAll'), { kind: 'info', ms: 4000 });
    autosave.flush(performance.now()); // no save yet: saving starts now
  });

  /** "Reset progress" (settings modal): wipe both slots, never save again this session, reload */
  const resetProgress = () => {
    store.clear();
    try { for (const k of SLOT_KEYS) localStorage.removeItem(k); } catch { /* blocked storage */ }
    location.reload();
  };
  ctx.resetProgress = resetProgress;
  (window as unknown as Record<string, unknown>).__save = {
    store, autosave,
    flush: () => autosave.flush(performance.now()),
    state: () => ({ saveState: platform.saveState(), available: store.available(), seq: store.seq, writes: store.writes, bytes: store.lastBytes, error: store.lastError, sandbox, loaded: loaded.kind }),
  };

  // dispatch every new sim event exactly once (events are a ring of EVENT_CAP; eventSeq counts all ever emitted)
  const dispatch = () => {
    const w = gen.w;
    const n = Math.min(w.events.length, w.eventSeq - evSeen);
    evSeen = w.eventSeq;
    if (n <= 0) return;
    for (const e of w.events.slice(w.events.length - n)) for (const f of subs.slice()) f(e);
  };

  const insets = () => {
    const top = Math.max(0, ...[...root.querySelectorAll<HTMLElement>('[data-hud="top"]')].map(e => e.getBoundingClientRect().bottom)) + 2;
    const bottoms = [...root.querySelectorAll<HTMLElement>('[data-hud="bottom"]')].map(e => e.getBoundingClientRect().top);
    const bottom = bottoms.length ? window.innerHeight - Math.min(...bottoms) + 2 : 0;
    // wide layouts: the Warden's Clipboard card stands permanently top-left – frame the island right of it, so the first
    // rooms (the tutorial's one-tap Wash Hut spot, the ferry) never start under the card. Compact layouts show a chip.
    let left = 0;
    if (!compact.get()) {
      const card = root.querySelector<HTMLElement>('.cb-card')?.getBoundingClientRect();
      if (card && card.width > 0 && card.left < window.innerWidth / 3) left = Math.round(card.right + 8);
    }
    return { top, bottom, left, right: 0 };
  };

  return {
    get w() { return gen.w; },
    get container() { return gen.view.container; },
    get groundCull() { return gen.view.world.ground; },
    ctx, input, insets,
    frameStart: () => cam.fit(-3.2 * 32, 10.0 * 32, 18.4 * 32, 23.6 * 32, 4),
    frame(dt: number) {
      if (fly.on) {
        const k = Math.min(1, dt * 5);
        cam.x += (fly.x - cam.x) * k; cam.y += (fly.y - cam.y) * k; cam.zoom += (fly.z - cam.zoom) * k; cam.targetZoom = cam.zoom;
        if (Math.hypot(fly.x - cam.x, fly.y - cam.y) < 1 && Math.abs(fly.z - cam.zoom) < 0.01) fly.on = false;
      }
      const g = gen;
      const before = g.stepper.ticks;
      g.stepper.frame(dt * 1e6);
      if (g.bot) for (let i = before; i < g.stepper.ticks; i++) g.bot.step();
      g.view.update(dt);
      dispatch();
      for (const c of g.comps) c.update(dt);
      if (!swapping) autosave.pump(performance.now());
    },
  };
}
