/**
 * The ONLY file that touches window.CrazyGames.SDK (Brief §9.2, §9.3).
 * - init in parallel with asset loading, with timeout (8 s on *.crazygames.com, else 2 s)
 * - buffers gameplayStart/Stop until init resolves, suppresses duplicates
 * - every call wrapped in try/catch (environment 'disabled' throws on every call)
 */
import type { Env, Platform, PlatformInfo, SaveState, Storage } from './platform';
import { localKV, sdkKV, type StorageKind } from './storage';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnySDK = any;

/** after the boot timeout on crazygames.com, a still-pending init counts as failed (for the player message) after this */
const GIVE_UP_MS = 30_000;

export function createPlatform(opts: { timeoutMs?: number; giveUpMs?: number } = {}): Platform & { storageKind(): StorageKind | null } {
  const calls: Platform['calls'] = [];
  const t0 = performance.now();
  const rec = (name: string, args?: unknown) => calls.push({ name, t: Math.round(performance.now() - t0), args });
  const onCG = /(^|\.)crazygames\.com$/.test(location.hostname);
  const timeoutMs = opts.timeoutMs ?? (onCG ? 8000 : 2000);

  let sdk: AnySDK = null;
  let initOk = false;
  let wantPlaying: boolean | null = null; // buffered desired state
  let sentPlaying: boolean | null = null;
  let mute = false;
  const muteFns: ((m: boolean) => void)[] = [];

  const fallbackInfo = (env: Env): PlatformInfo => ({
    env,
    locale: (navigator.language || 'en').toLowerCase(),
    device: matchMedia('(pointer: coarse)').matches ? (Math.min(screen.width, screen.height) > 600 ? 'tablet' : 'mobile') : 'desktop',
    app: 'web',
    offline: false,
  });
  let info: PlatformInfo = fallbackInfo('mock');

  const safe = <T>(fn: () => T, dflt: T): T => { try { return fn(); } catch (e) { console.warn('[platform]', e); return dflt; } };

  const flush = () => {
    if (!initOk || wantPlaying === null || wantPlaying === sentPlaying) return;
    sentPlaying = wantPlaying;
    rec(wantPlaying ? 'gameplayStart' : 'gameplayStop');
    safe(() => (wantPlaying ? sdk.game.gameplayStart() : sdk.game.gameplayStop()), undefined);
  };

  let saveState: SaveState = 'ok';
  const lateListeners: (() => void)[] = [];
  const failListeners: (() => void)[] = [];
  const fail = () => {
    if (saveState !== 'locked') return;
    saveState = 'failed';
    console.warn('[platform] SDK init did not succeed – progress is not saved this session');
    failListeners.forEach(f => safe(f, undefined));
  };

  const sdkScriptReady: Promise<void> = (window as any).__cgSdkReady ?? Promise.resolve();

  const ready: Promise<PlatformInfo> = (async () => {
    const timeout = new Promise<'timeout'>(r => setTimeout(() => r('timeout'), timeoutMs));
    const attempt = (async () => {
      await sdkScriptReady;
      sdk = (window as any).CrazyGames?.SDK ?? null;
      if (!sdk) return 'nosdk' as const;
      rec('init');
      await sdk.init();
      return 'ok' as const;
    })().catch(e => { console.warn('[platform] init failed', e); return 'error' as const; });
    const res = await Promise.race([attempt, timeout]);
    if (res === 'ok') {
      if (!applyInit(false)) { info = fallbackInfo('disabled'); if (onCG) saveState = 'failed'; }
      return info;
    }
    if (res === 'timeout' && onCG) {
      // locked mode: keep waiting in the background – a late init switches to the real save (Brief §9.2.4)
      saveState = 'locked';
      const giveUp = setTimeout(() => { if (saveState === 'locked') fail(); }, opts.giveUpMs ?? GIVE_UP_MS);
      void attempt.then(r => {
        clearTimeout(giveUp);
        if (r === 'ok' && applyInit(true)) { lateListeners.forEach(f => safe(f, undefined)); return; }
        fail();
      });
    } else if (onCG) saveState = 'failed'; // no SDK (adblock) or init threw: play on without saving
    info = fallbackInfo(sdk ? 'disabled' : 'mock');
    return info;
  })();

  /**
   * init resolved: read the environment, system info and mute state, register the settings listener, send the
   * buffered gameplay state. A late init keeps the boot locale – the language is fixed at boot (Brief §9.2.6).
   */
  function applyInit(late: boolean): boolean {
    const env: Env = safe(() => sdk.environment, 'disabled');
    if (env === 'disabled') return false;
    initOk = true;
    saveState = 'ok';
    const si = safe(() => sdk.user.systemInfo, null);
    const base = late ? info : fallbackInfo(env);
    info = {
      env,
      locale: late ? info.locale : String(si?.locale ?? navigator.language ?? 'en').toLowerCase(),
      device: si?.device?.type ?? base.device,
      app: si?.applicationType ?? 'web',
      offline: !!safe(() => sdk.game.isOfflineMode, false),
    };
    const m0 = !!safe(() => sdk.game.settings.muteAudio, false);
    if (m0 !== mute) { mute = m0; muteFns.forEach(f => f(m0)); }
    safe(() => sdk.game.addSettingsChangeListener((s: any) => {
      const m = !!s?.muteAudio; if (m !== mute) { mute = m; muteFns.forEach(f => f(m)); }
    }), undefined);
    flush();
    return true;
  }

  const local = localKV(() => (typeof localStorage === 'undefined' ? null : localStorage));
  let sdkStore: ReturnType<typeof sdkKV> | null = null;
  const currentStorage = (): (Storage & { kind: StorageKind }) | null => {
    if (initOk && info.env === 'crazygames') return (sdkStore ??= sdkKV(() => sdk.data, local));
    if (onCG) return null; // locked / failed mode: never touch storage before (or without) init on CrazyGames
    return local;
  };

  const platform: Platform & { storageKind(): StorageKind | null } = {
    ready,
    get initOk() { return initOk; },
    calls,
    info: () => info,
    gameplayStart() { wantPlaying = true; flush(); },
    gameplayStop() { wantPlaying = false; flush(); },
    happytime() { if (!initOk) return; rec('happytime'); safe(() => sdk.game.happytime(), undefined); },
    reportProgress(p) { if (!initOk) return; rec('reportGameCompletedPercentage', p); safe(() => sdk.game.reportGameCompletedPercentage(Math.max(0, Math.min(100, Math.round(p)))), undefined); },
    setContext(ctx) { if (!initOk) return; safe(() => sdk.game.setGameContext(ctx), undefined); },
    muted: () => mute,
    onMuteChange(fn) { muteFns.push(fn); },
    onLateInit(fn) { lateListeners.push(fn); },
    onSaveFailed(fn) { failListeners.push(fn); },
    saveState: () => saveState,
    storage: () => currentStorage(),
    storageKind: () => currentStorage()?.kind ?? null,
  };
  return platform;
}
