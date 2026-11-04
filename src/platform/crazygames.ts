/**
 * The ONLY file that touches window.CrazyGames.SDK (Brief §9.2, §9.3).
 * - init in parallel with asset loading, with timeout (8 s on *.crazygames.com, else 2 s)
 * - buffers gameplayStart/Stop until init resolves, suppresses duplicates
 * - every call wrapped in try/catch (environment 'disabled' throws on every call)
 */
import type { Env, Platform, PlatformInfo, Storage } from './platform';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnySDK = any;

export function createPlatform(opts: { timeoutMs?: number } = {}): Platform {
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
      const env: Env = safe(() => sdk.environment, 'disabled');
      if (env === 'disabled') { info = fallbackInfo('disabled'); return info; }
      initOk = true;
      const si = safe(() => sdk.user.systemInfo, null);
      info = {
        env,
        locale: String(si?.locale ?? navigator.language ?? 'en').toLowerCase(),
        device: si?.device?.type ?? fallbackInfo(env).device,
        app: si?.applicationType ?? 'web',
        offline: !!safe(() => sdk.game.isOfflineMode, false),
      };
      mute = !!safe(() => sdk.game.settings.muteAudio, false);
      safe(() => sdk.game.addSettingsChangeListener((s: any) => {
        const m = !!s?.muteAudio; if (m !== mute) { mute = m; muteFns.forEach(f => f(m)); }
      }), undefined);
      flush();
      return info;
    }
    if (res === 'timeout' && onCG) {
      // keep waiting in the background: late init switches to the real save (Brief §9.2.4)
      attempt.then(r => { if (r === 'ok') { lateInit(); } });
    }
    info = fallbackInfo(sdk ? 'disabled' : 'mock');
    return info;
  })();

  const lateListeners: (() => void)[] = [];
  const lateInit = () => {
    const env: Env = safe(() => sdk.environment, 'disabled');
    if (env === 'disabled') return;
    initOk = true; info = { ...info, env };
    flush();
    lateListeners.forEach(f => f());
  };

  const platform: Platform & { onLateInit(fn: () => void): void } = {
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
    storage(): Storage | null {
      if (initOk && info.env === 'crazygames') {
        return {
          get: k => safe(() => sdk.data.getItem(k), null),
          set: (k, v) => {
            try { sdk.data.setItem(k, v); return { ok: true }; }
            catch (e: any) { console.warn('[platform] data.setItem', e); return { ok: false, code: String(e?.code ?? 'other') }; }
          },
        };
      }
      if (onCG && !initOk) return null; // locked mode: never save before init on CrazyGames
      return {
        get: k => safe(() => localStorage.getItem(k), null),
        set: (k, v) => { try { localStorage.setItem(k, v); return { ok: true }; } catch { return { ok: false, code: 'localStorage' }; } },
      };
    },
  };
  return platform;
}
