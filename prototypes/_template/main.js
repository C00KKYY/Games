// Grundgerüst: Canvas mit DPR-Skalierung, fester Zeitschritt (unabhängig von 60/144/165 Hz),
// Eingabe für Maus/Touch/Tastatur, WebAudio mit Unlock und Mute, Speicherstand, SDK-Hooks.
// Für jedes neue Spiel kopieren und ersetzen, was nicht gebraucht wird.
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- Audio ----------
  const audio = {
    ctx: null, master: null, userMuted: CG.load('mute', false),
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.apply();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    apply() { if (this.master) this.master.gain.value = (CG.muted || this.userMuted) ? 0 : 0.5; },
    beep(freq = 440, dur = 0.08, type = 'square', vol = 0.3) {
      if (!this.ctx || CG.muted || this.userMuted) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur);
    },
  };
  CG.onMuteChange(() => audio.apply());
  // iOS: resume nur innerhalb einer Benutzergeste
  ['pointerdown', 'touchend', 'keydown'].forEach((ev) =>
    window.addEventListener(ev, () => audio.ensure(), { passive: true }));

  // ---------- Eingabe ----------
  const input = { x: 0, y: 0, down: false, pressed: false, keys: new Set() };
  canvas.addEventListener('pointerdown', (e) => { input.x = e.clientX; input.y = e.clientY; input.down = true; input.pressed = true; });
  window.addEventListener('pointermove', (e) => { input.x = e.clientX; input.y = e.clientY; });
  window.addEventListener('pointerup', () => { input.down = false; });
  window.addEventListener('keydown', (e) => {
    // Escape nicht belegen (beendet Vollbild); event.code ist layoutunabhängig
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    input.keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));

  // ---------- Spielzustand ----------
  const save = CG.load('save', { best: 0 });
  const state = { mode: 'play', t: 0, score: 0, paused: false };

  function startRun() {
    state.mode = 'play'; state.t = 0; state.score = 0;
    CG.gameplayStart();
  }
  function endRun() {
    state.mode = 'over';
    CG.gameplayStop();
    if (state.score > save.best) { save.best = state.score; CG.save('save', save); CG.happytime(); }
    // Midgame-Werbung nur zwischen Runden, nie während des Spiels:
    // CG.requestAd('midgame', { pause: () => (state.paused = true), resume: () => (state.paused = false) });
  }

  const STEP = 1 / 120; // fester Zeitschritt
  function update(dt) {
    state.t += dt;
    if (state.mode === 'play') {
      state.score += dt;
      if (input.pressed) audio.beep(660);
    } else if (state.mode === 'over' && input.pressed) {
      startRun();
    }
    input.pressed = false;
  }

  function render() {
    ctx.fillStyle = '#16161d'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = `bold ${Math.max(18, Math.min(W, H) * 0.06)}px system-ui`;
    ctx.fillText(state.mode === 'play' ? 'Score ' + Math.floor(state.score) : 'Tap to play', W / 2, H / 2);
  }

  // Tab nicht sichtbar → Spiel einfrieren (kein gameplayStop, laut CrazyGames-Vorgabe)
  document.addEventListener('visibilitychange', () => { last = performance.now(); });

  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!state.paused) {
      acc += dt;
      while (acc >= STEP) { update(STEP); acc -= STEP; }
    }
    render();
    requestAnimationFrame(frame);
  }

  (async () => {
    CG.loadingStart();
    await CG.init();
    audio.apply();
    CG.loadingStop();
    startRun(); // direkt ins Gameplay (höchstens 1 Klick erlaubt)
    requestAnimationFrame(frame);
  })();
})();
