// CrazyGames SDK v3 mock for tests. Records every call to window.__sdkCalls.
// Config via window.__sdkMockConfig = {
//   initDelay (ms, default 50), neverResolve, initError (init rejects), env, locale, muteAudio, device,
//   data: { key: value } – pre-filled data module (e.g. an existing save),
//   dataError: 'dataModuleDisabled' | 'dataLimitExcedeed' | 'other' – every data call throws { code } (like the SDK),
//   persist: true – mirror the data module into sessionStorage['__sdkMockData'] so a page reload keeps it
//                   (the real data module is server/guest-storage backed and survives reloads)
// }
// window.__sdkMock = { store, storeAtInit (JSON snapshot taken when init resolves), dataWrites: [{k, len, t, inited}], setMute(m) }
(function () {
  const cfg = Object.assign({ initDelay: 50, neverResolve: false, initError: false, env: 'crazygames', locale: 'en-US', muteAudio: false, device: 'desktop', dataError: null, persist: false }, window.__sdkMockConfig || {});
  const calls = (window.__sdkCalls = []);
  const t0 = performance.now();
  let inited = false;
  const rec = (n, a) => calls.push({ n, a, t: Math.round(performance.now() - t0), inited });
  const PKEY = '__sdkMockData';
  let persisted = null;
  if (cfg.persist) { try { persisted = JSON.parse(sessionStorage.getItem(PKEY) || 'null'); } catch { persisted = null; } }
  const store = Object.assign({}, persisted || cfg.data || {});
  const sync = () => { if (cfg.persist) { try { sessionStorage.setItem(PKEY, JSON.stringify(store)); } catch { /* ignore */ } } };
  const dataWrites = [];
  let listeners = [];
  const settings = { muteAudio: !!cfg.muteAudio, disableChat: false };
  const guard = (n) => { if (!inited) rec('BEFORE_INIT:' + n); };
  const dataFail = () => { if (cfg.dataError) { const e = new Error(cfg.dataError); e.code = cfg.dataError; throw e; } };
  const SDK = {
    get environment() { return cfg.env; },
    init() {
      rec('init');
      if (cfg.neverResolve) return new Promise(() => {});
      return new Promise((r, j) => setTimeout(() => {
        if (cfg.initError) { j(new Error('mock init failed')); return; }
        window.__sdkMock.storeAtInit = JSON.stringify(store); // exact data module content the moment init resolves
        inited = true; r();
      }, cfg.initDelay));
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
      getItem(k) { guard('getItem'); rec('getItem', k); dataFail(); return k in store ? store[k] : null; },
      setItem(k, v) {
        guard('setItem'); rec('setItem', k); dataFail();
        store[k] = String(v); dataWrites.push({ k, len: String(v).length, t: Math.round(performance.now() - t0), inited }); sync();
      },
      removeItem(k) { guard('removeItem'); rec('removeItem', k); dataFail(); delete store[k]; sync(); },
      clear() { guard('clear'); rec('clear'); dataFail(); for (const k in store) delete store[k]; sync(); },
    },
    user: { get systemInfo() { return { locale: cfg.locale, device: { type: cfg.device }, applicationType: 'web', countryCode: 'US', os: {}, browser: {} }; }, isUserAccountAvailable: false },
    ad: { requestAd(t) { rec('requestAd', t); }, hasAdblock() { rec('hasAdblock'); return Promise.resolve(false); } },
  };
  window.__sdkMock = { store, dataWrites, setMute(m) { settings.muteAudio = m; listeners.forEach((f) => f(settings)); } };
  window.CrazyGames = { SDK };
})();
