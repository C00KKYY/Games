'use strict';
// Anbindung an Spieleportale. Derzeit: CrazyGames-SDK v3, nur aktiv, wenn dessen Skript geladen
// wurde (CrazyGames-Build). Ohne SDK tut jede Funktion nichts – das Spiel läuft normal weiter.

const Platform = {
  sdk: null,
  playing: false,

  async init() {
    const sdk = window.CrazyGames && window.CrazyGames.SDK;
    if (!sdk) return;
    try {
      await sdk.init();
      // Außerhalb von CrazyGames (und localhost) ist das SDK deaktiviert und jeder Aufruf wirft
      if (sdk.environment === 'disabled') return;
      this.sdk = sdk;
      const applyMute = () => this.call(s => Sfx.setPlatformMute(s.game.settings.muteAudio));
      applyMute();
      sdk.game.addSettingsChangeListener(applyMute);
      this.playing = false;
      this.setPlaying(Game.state === 'play');
    } catch (e) {
      this.sdk = null;
    }
  },

  call(fn) {
    if (!this.sdk) return;
    try { fn(this.sdk); } catch (e) { /* SDK-Fehler dürfen das Spiel nie stören */ }
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
