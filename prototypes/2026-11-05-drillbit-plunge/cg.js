// CrazyGames-SDK-Wrapper. Funktioniert auch außerhalb von crazygames.com
// (dort ist das SDK "disabled" und würde bei jedem Aufruf werfen).
// Alle Aufrufe sind abgesichert; Werbung ruft auf fremden Domains sofort onDone auf.
(function () {
  const log = (...a) => console.info('[cg]', ...a);
  let sdk = null;
  let ready = false;
  let inGameplay = false;
  const muteListeners = [];

  const CG = {
    environment: 'none',
    muted: false,

    async init() {
      try {
        if (window.CrazyGames && window.CrazyGames.SDK) {
          // Timeout: init darf das Spiel niemals blockieren (z. B. offline, file://, fremde Domain)
          await Promise.race([
            window.CrazyGames.SDK.init(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('init timeout')), 3000)),
          ]);
          sdk = window.CrazyGames.SDK;
          CG.environment = sdk.environment;
          ready = CG.environment === 'crazygames' || CG.environment === 'local';
          if (ready) {
            const s = sdk.game.settings || {};
            CG.muted = !!s.muteAudio;
            sdk.game.addSettingsChangeListener((ns) => {
              CG.muted = !!ns.muteAudio;
              muteListeners.forEach((f) => f(CG.muted));
            });
          }
        }
      } catch (e) {
        log('SDK nicht verfügbar:', e && e.message);
      }
      log('environment =', CG.environment);
    },

    onMuteChange(fn) { muteListeners.push(fn); },

    _call(path, ...args) {
      log(path.join('.'));
      if (!ready) return;
      try {
        let o = sdk;
        for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
        return o[path[path.length - 1]](...args);
      } catch (e) { log('Fehler', path.join('.'), e && e.message); }
    },

    loadingStart() { CG._call(['game', 'loadingStart']); },
    loadingStop() { CG._call(['game', 'loadingStop']); },
    gameplayStart() {
      if (inGameplay) return;
      inGameplay = true;
      window.__cgGameplayStarted = (window.__cgGameplayStarted || 0) + 1; // für Tests
      CG._call(['game', 'gameplayStart']);
    },
    gameplayStop() {
      if (!inGameplay) return;
      inGameplay = false;
      CG._call(['game', 'gameplayStop']);
    },
    happytime() { CG._call(['game', 'happytime']); },

    // type: 'midgame' | 'rewarded'. onDone(success:boolean) kommt immer genau einmal.
    // pause/resume: Spiel pausieren + stummschalten bzw. fortsetzen.
    requestAd(type, { pause, resume, onDone } = {}) {
      let finished = false;
      const done = (ok) => {
        if (finished) return;
        finished = true;
        if (resume) resume();
        if (onDone) onDone(ok);
      };
      if (!ready) { done(false); return; }
      try {
        sdk.ad.requestAd(type, {
          adStarted: () => { if (pause) pause(); },
          adFinished: () => done(true),
          adError: (err) => { log('adError', err && err.code); done(false); },
        });
      } catch (e) { done(false); }
    },

    // Sprache: Systemsprache, Rückfall Englisch
    locale() {
      try {
        const sys = ready && sdk.user && sdk.user.systemInfo;
        if (sys && sys.locale) return sys.locale.slice(0, 2);
      } catch (e) { /* ignorieren */ }
      return (navigator.language || 'en').slice(0, 2);
    },
  };

  // Abgesicherter Speicher
  CG.save = function (key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* privat/blockiert */ }
  };
  CG.load = function (key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  };

  window.CG = CG;
})();
