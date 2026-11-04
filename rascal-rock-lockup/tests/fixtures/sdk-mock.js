// CrazyGames SDK v3 mock for tests. Records every call to window.__sdkCalls.
// Config via window.__sdkMockConfig = { initDelay, neverResolve, env, locale, muteAudio, data }
(function () {
  const cfg = Object.assign({ initDelay: 50, neverResolve: false, env: 'crazygames', locale: 'en-US', muteAudio: false, device: 'desktop' }, window.__sdkMockConfig || {});
  const calls = (window.__sdkCalls = []);
  const t0 = performance.now();
  let inited = false;
  const rec = (n, a) => calls.push({ n, a, t: Math.round(performance.now() - t0), inited });
  const store = Object.assign({}, cfg.data || {});
  let listeners = [];
  const settings = { muteAudio: !!cfg.muteAudio, disableChat: false };
  const guard = (n) => { if (!inited) rec('BEFORE_INIT:' + n); };
  const SDK = {
    get environment() { return cfg.env; },
    init() {
      rec('init');
      if (cfg.neverResolve) return new Promise(() => {});
      return new Promise((r) => setTimeout(() => { inited = true; r(); }, cfg.initDelay));
    },
    game: {
      gameplayStart() { guard('gameplayStart'); rec('gameplayStart'); },
      gameplayStop() { guard('gameplayStop'); rec('gameplayStop'); },
      happytime() { guard('happytime'); rec('happytime'); },
      loadingStart() { rec('loadingStart'); }, loadingStop() { rec('loadingStop'); },
      reportGameCompletedPercentage(p) { guard('report'); rec('reportGameCompletedPercentage', p); },
      setGameContext(c) { rec('setGameContext', c); }, clearGameContext() { rec('clearGameContext'); },
      get settings() { return settings; },
      addSettingsChangeListener(fn) { listeners.push(fn); },
      removeSettingsChangeListener(fn) { listeners = listeners.filter((f) => f !== fn); },
      get isOfflineMode() { return false; },
    },
    data: {
      getItem(k) { guard('getItem'); rec('getItem', k); return k in store ? store[k] : null; },
      setItem(k, v) { guard('setItem'); rec('setItem', k); store[k] = String(v); },
      removeItem(k) { delete store[k]; }, clear() { for (const k in store) delete store[k]; },
    },
    user: { get systemInfo() { return { locale: cfg.locale, device: { type: cfg.device }, applicationType: 'web', countryCode: 'US', os: {}, browser: {} }; }, isUserAccountAvailable: false },
    ad: { requestAd(t) { rec('requestAd', t); }, hasAdblock() { rec('hasAdblock'); return Promise.resolve(false); } },
  };
  window.__sdkMock = { store, setMute(m) { settings.muteAudio = m; listeners.forEach((f) => f(settings)); } };
  window.CrazyGames = { SDK };
})();
