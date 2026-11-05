'use strict';
// Anbindung an Spieleportale. Derzeit: CrazyGames-SDK v3, nur aktiv, wenn dessen Skript geladen
// wurde (CrazyGames-Build). Ohne SDK tut jede Funktion nichts – das Spiel läuft normal weiter.
//
// Das SDK-Skript wird asynchron geladen (tools/build-single.js setzt window.__cgSdk, ein Promise, das
// beim onload/onerror des Skripts erfüllt wird). Der Start wartet höchstens 2,5 s darauf (main.js).
// Kommt das SDK später, übernimmt lateAttach() den Speicherort, ohne einen Spielstand zu überschreiben.

const Platform = {
  sdk: null,
  playing: false,
  booted: false, // Spiel läuft schon (Startfrist abgelaufen) – Speicherort nur noch über lateAttach()
  loading: false, // loadingStart() gemeldet, loadingStop() steht noch aus
  pendingAttach: false, // SDK kam während eines Laufs – Speicherort erst im Menü wechseln

  async init() {
    try { await this.initSdk(); } finally { Sfx.releasePlatform(); } // Ton erst, wenn die Stummschaltung bekannt ist
  },

  async initSdk() {
    // Im CrazyGames-Build lädt das Skript asynchron: auf dessen onload/onerror warten
    if (window.__cgSdk) { try { await window.__cgSdk; } catch (e) { /* Skript fehlt – ohne SDK weiter */ } }
    const sdk = window.CrazyGames && window.CrazyGames.SDK;
    if (!sdk) return;
    try {
      await sdk.init();
      // Außerhalb von CrazyGames (und localhost) ist das SDK deaktiviert und jeder Aufruf wirft
      if (sdk.environment === 'disabled') return;
      this.sdk = sdk;
      // Ladephase melden – aber nie mehr, wenn das Menü schon steht (sonst bliebe sie für immer offen)
      if (!this.booted) {
        this.call(s => s.game.loadingStart());
        this.loading = true;
      }
      const applyMute = () => this.call(s => Sfx.setPlatformMute(s.game.settings.muteAudio));
      applyMute();
      this.call(s => s.game.addSettingsChangeListener(applyMute));
      this.playing = false;
      this.setPlaying(Game.state === 'play');
      // Spielstand über das Data Module (bei eingeloggten Spielern geräteübergreifend)
      if (sdk.data) {
        if (!this.booted) this.adoptCloudSave();
        else this.lateAttach();
      }
    } catch (e) {
      this.sdk = null;
    }
  },

  // Speicherort auf das Data Module umstellen. Ein Browser-Spielstand (frühere Version oder eine Sitzung,
  // in der das SDK zu spät kam) wird übernommen, wenn es in der Cloud keinen gibt oder er mehr Spielzeit hat.
  // Ein schon übernommener, seitdem unveränderter Browser-Stand wird nicht noch einmal verglichen (sonst
  // käme z. B. ein in den Einstellungen gelöschter Stand zurück). Gelöscht wird nichts: Gäste speichert
  // das SDK selbst im localStorage.
  adoptCloudSave() {
    const data = this.sdk && this.sdk.data;
    if (!data) return;
    let local = null, remote = null, merged = null;
    try { local = localStorage.getItem(SAVE_KEY); merged = localStorage.getItem(SAVE_KEY + '.merged'); } catch (e) { local = null; }
    try { remote = data.getItem(SAVE_KEY); } catch (e) { remote = null; }
    const sig = local && playTimeOf(local) + ':' + local.length;
    if (local && sig !== merged) {
      if (!remote || playTimeOf(local) > playTimeOf(remote)) {
        try { data.setItem(SAVE_KEY, local); } catch (e) { return; } // Cloud nicht beschreibbar: im Browser bleiben
      }
      try { localStorage.setItem(SAVE_KEY + '.merged', sig); } catch (e) { /* egal */ }
    }
    Store.backend = data;
  },

  // SDK kam nach der Startfrist: im Menü sofort umstellen, während eines Laufs erst bei der Rückkehr ins Menü
  lateAttach() {
    if (!this.sdk || !this.sdk.data || Store.backend) return;
    if (Game.run || Game.state !== 'menu') { this.pendingAttach = true; return; }
    this.pendingAttach = false;
    this.adoptCloudSave();
    Store.load();
    setLang(Store.data.settings.lang || detectLang(this.locale()));
    Sfx.applySettings();
    if (!Store.data.settings.music) Sfx.stopMusic();
    UI.selChar = Store.data.lastChar;
    UI.hudSig = ''; UI.lastHud = {};
    if (UI.cur && ['menu', 'map', 'shop', 'ach', 'chars', 'opts'].includes(UI.cur)) UI.show(UI.cur);
  },

  // Aus UI.toMenu(): aufgeschobenen Wechsel nachholen (Game.run ist dort schon null)
  attachPending() {
    if (this.pendingAttach) this.lateAttach();
  },

  call(fn) {
    if (!this.sdk) return;
    try { fn(this.sdk); } catch (e) { /* SDK-Fehler dürfen das Spiel nie stören */ }
  },

  // Sprache der Plattform (z. B. "de-DE"); null ohne SDK
  locale() {
    let l = null;
    this.call(s => { l = (s.user && s.user.systemInfo && s.user.systemInfo.locale) || null; });
    return l;
  },

  // Gerätetyp laut Plattform: "desktop", "tablet", "mobile" oder null
  deviceType() {
    let t = null;
    this.call(s => { t = (s.user && s.user.systemInfo && s.user.systemInfo.device && s.user.systemInfo.device.type) || null; });
    return t;
  },

  // Spiel ist geladen und zeigt das Menü – beendet die gemeldete Ladephase (genau einmal)
  loaded() {
    if (!this.loading) return;
    this.loading = false;
    this.call(s => s.game.loadingStop());
  },

  // Wird jedes Bild mit dem aktuellen Zustand aufgerufen; meldet nur Wechsel
  setPlaying(on) {
    if (on === this.playing) return;
    this.playing = on;
    this.call(s => (on ? s.game.gameplayStart() : s.game.gameplayStop()));
  },

  // Besondere Glücksmomente (Boss besiegt, Sieg) – sparsam verwenden
  happy() { this.call(s => s.game.happytime()); },
};

// Gesamtspielzeit eines gespeicherten Stands (für „reicherer Stand gewinnt“); kaputt oder leer = -1
function playTimeOf(raw) {
  try { const d = JSON.parse(raw); return (d && d.stats && +d.stats.playTime) || 0; } catch (e) { return -1; }
}
