'use strict';
// Klangeffekte und Musik über WebAudio.
//
// Aufnahmen: CC0-Effekte und -Musik aus assets/audio/ (Herkunft in assets/CREDITS-audio.txt), als base64 in
// assets/audio.js (erzeugt von tools/build-audio.js, per <script> geladen – kein fetch, läuft auch über file://).
// Diese 2 MB stehen in index.html ganz am Ende, damit der Start nicht auf sie wartet; kommen sie nach main.js,
// meldet sich assets/audio.js über Sfx.onData(). Bis dahin (und falls etwas fehlt) spielt der Synthesizer.
// preload() dekodiert in einem OfflineAudioContext (braucht keine Nutzeraktion, keine Warnung in der
// Konsole): alle Effekte sofort, die Menümusik im Hintergrund, Kampf- und Bossmusik erst bei Bedarf; höchstens
// zwei Musikschleifen bleiben dekodiert im Speicher. Der eigentliche AudioContext entsteht bei der ersten
// Nutzeraktion (init/unlock, nötig für iOS und die Autoplay-Regeln der Browser).
//
// Kette: Quelle → Gain (±8 % Lautstärke) → StereoPanner (falls Position bekannt) → Effektbus → Master → Kompressor.
// Der Effektbus speist zusätzlich einen kurzen Hall (Faltung mit erzeugtem Rauschen, 0,8 s, Anteil 0,12).
// Musik: zwei Schleifen, über 1,5 s übergeblendet, je nach Intensität (0 Menü, 1–2 Kampf – bei 1 gedämpft
// durch einen Tiefpass –, 3 Boss); Sieg und Niederlage spielen einen kurzen Abschluss (Sting).
// Fehlt eine Aufnahme (alte Browser, Dekodierfehler), springt der frühere Synthesizer ein (SOUNDS, synthMusic).
// Stummschaltung: Plattform (CrazyGames muteAudio) und ?muteAudio=true haben Vorrang vor den Einstellungen;
// stumm oder unsichtbar wird der AudioContext angehalten.

const Sfx = (() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  let DATA = null; // window.ASSET_DATA.audio, sobald geladen (siehe onData)
  const readData = () => { if (!DATA) DATA = (window.ASSET_DATA && window.ASSET_DATA.audio) || null; return DATA; };
  const FORCE_MUTE = /[?&]muteAudio=(true|1)\b/.test(location.search);

  let ctx = null, master, comp, sfxBus, musicBus, revSend, noiseBuf, analyser = null;
  let decoder = null; // OfflineAudioContext nur zum Dekodieren
  const buf = {}; // Effekt -> AudioBuffer
  const last = {}; // gate(): letzter Zeitpunkt je Effekt
  const active = {}; // gleichzeitig klingende Kopien je Effekt
  let voices = 0;
  const stats = { sampled: 0, synth: 0, dropped: 0, errors: 0 };

  const MASTER = 0.8, MUSIC = 0.5, FADE = 1.5, MAX_COPIES = 6, MAX_VOICES = 40;

  // Lautstärke je Effekt. Abgeleitet aus dem gemessenen Pegel der Datei (ffmpeg volumedetect, mean_volume)
  // und einem Zielpegel nach Rolle: häufige Kampfklänge −31 dB, mittlere −25 dB, seltene Ereignisse −21 dB
  // (gain = 10^((Ziel − Messung)/20), höchstens 1,5). Nach dem Probehören in tools/audio/audition.html anpassen.
  const VOL = {
    hit: 0.33, kill: 0.27, gem: 0.32, coin: 0.2, shoot: 0.15, knife: 0.1, slash: 0.22, throw: 0.13, zap: 0.22, break: 0.31,
    hurt: 0.28, flask: 0.56, orbit: 0.22, dash: 0.35, nova: 1.5, magnet: 0.31, chestpick: 0.54, click: 0.83, deny: 0.26,
    item: 0.22, buy: 1.33, chest_open: 0.5, summon: 0.37, slam: 0.45,
    levelup: 0.39, chest: 1.5, evolve: 0.46, boss: 0.45, bomb: 0.48, death: 0.36, revive: 0.5, alarm: 0.79, achievement: 0.55, heal: 0.44,
    // Countdown und Ansturm (M10): Warnhorn beim Erscheinen der Leiste, Ticks in den letzten Sekunden, Ansturm-Schlag.
    // Der Tick ist ein seltenes Ereignis und muss über Kampfmusik und Treffer hörbar sein: laut und eine Spur höher
    warn: 0.5, tick: 1.4, surge: 0.7,
  };
  // Musikstücke auf etwa −20 LUFS gebracht (gemessen: Menü −24,6, Kampf −13,5, Boss −19,0, Sieg −17,7, Niederlage −13,1)
  const TRACK_VOL = { menu: 1.7, battle: 0.47, boss: 0.89, victory: 0.77, gameover: 0.45 };
  // Mindestabstand in ms (wie bisher)
  const GATE = { hit: 35, kill: 28, gem: 30, coin: 50, shoot: 70, knife: 45, slash: 60, zap: 50, throw: 80, flask: 90, break: 60, hurt: 120,
    ewind: 90, efire: 80, eimpact: 120, tick: 500 };
  // Zufällige Verstimmung in Cent, damit schnelle Wiederholungen nicht mechanisch klingen
  const DETUNE = { hit: 40, kill: 40, shoot: 20, knife: 30, slash: 25, throw: 25, zap: 30, break: 30, flask: 20, coin: 10, hurt: 25, dash: 20, summon: 30 };
  // Edelstein-Kombo: pentatonisch steigend, höchstens +12 Halbtöne
  const GEM_STEPS = [0, 2, 4, 7, 9, 12];
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];

  // ---------- Dekodieren ----------
  function b64ToBuf(b64) {
    const bin = atob(b64), n = bin.length, u = new Uint8Array(n);
    for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }

  function decodeCtx() {
    if (!decoder && OAC) { try { decoder = new OAC(1, 1, 44100); } catch (e) { decoder = null; } }
    return decoder || ctx;
  }

  function decode(b64) {
    return new Promise((res, rej) => {
      const c = decodeCtx();
      if (!c) { rej(new Error('kein AudioContext')); return; }
      let p;
      // Promise-Form, mit Rückruf-Form für altes Safari
      try { p = c.decodeAudioData(b64ToBuf(b64), res, rej); } catch (e) { rej(e); return; }
      if (p && typeof p.then === 'function') p.then(res, rej);
    });
  }

  let preloading = null;
  function preload() {
    if (preloading) return preloading;
    // Daten noch nicht da: sofort weiter, onData() holt das Dekodieren nach.
    // Ohne OfflineAudioContext wird erst mit dem echten Kontext dekodiert (init ruft preload erneut).
    if (!readData() || !DATA.sfx || !decodeCtx()) return Promise.resolve();
    const jobs = Object.keys(DATA.sfx).map(n => decode(DATA.sfx[n]).then(b => { buf[n] = b; }, () => { stats.errors++; }));
    // Menümusik erst nach dem Start dekodieren (sonst bremst atob den Weg ins Menü auf langsamen Geräten);
    // startMusic() holt sie sofort, falls der Spieler schneller ist
    preloading = Promise.all(jobs).then(() => { setTimeout(() => { if (!music.menu) loadTrack('menu').catch(() => {}); }, 1500); });
    return preloading;
  }

  // assets/audio.js wurde nach diesem Skript geladen: jetzt dekodieren; läuft schon Musik vom Synthesizer,
  // wechselt sie auf die Aufnahmen
  function onData() {
    readData();
    preload();
    if (musicOn && !cur && ctx && ctx.currentTime >= holdUntil) { stopSynth(); updateMusic(); }
  }

  // ---------- Kontext, Busse, Freischalten ----------
  function impulse(sec) {
    const rate = ctx.sampleRate, n = Math.floor(rate * sec), ir = ctx.createBuffer(2, n, rate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2);
    }
    return ir;
  }

  function init() {
    if (ctx) { if (wantRunning()) resume(); return; }
    if (!AC) return;
    try { ctx = new AC(); } catch (e) { ctx = null; return; }
    master = ctx.createGain(); master.gain.value = 0;
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
    try {
      const rev = ctx.createConvolver();
      rev.buffer = impulse(0.8);
      revSend = ctx.createGain(); revSend.gain.value = 0.12;
      sfxBus.connect(revSend); revSend.connect(rev); rev.connect(master);
    } catch (e) { revSend = null; }
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // iOS: nach Anruf, Siri o. Ä. steht der Kontext auf "interrupted" – wieder anwerfen bzw. auf die nächste Berührung warten
    ctx.onstatechange = () => {
      if (ctx.state === 'running' || !wantRunning()) return;
      if (ctx.state === 'interrupted') resume();
      armUnlock();
    };
    applySettings();
    if (!decoder && readData()) preload(); // ohne OfflineAudioContext: jetzt mit dem echten Kontext dekodieren
  }

  function wantRunning() { return !muted() && !document.hidden; }

  function resume() {
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return Promise.resolve();
    try { return ctx.resume().catch(() => {}); } catch (e) { return Promise.resolve(); }
  }

  // iOS/Safari und Chrome geben Ton erst nach einer Nutzeraktion frei: bei jeder Geste fortsetzen und einen
  // stillen 1-Sample-Puffer abspielen; die Zuhörer bleiben, bis der Kontext wirklich läuft.
  const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'mousedown', 'click', 'keydown'];
  let unlockArmed = false, onUnlocked = null;
  function fireUnlocked() {
    const cb = onUnlocked;
    onUnlocked = null; // nur beim ersten Freischalten (z. B. Menümusik starten)
    if (cb) cb();
  }
  function unlock() {
    init();
    if (!ctx) return;
    // Stumm (Plattform) oder verborgen: Musik schon vormerken, sie klingt nach dem Aufheben der Stummschaltung;
    // die Zuhörer bleiben, falls der Kontext dann erst mit der nächsten Geste anläuft (iOS)
    if (!wantRunning()) { fireUnlocked(); return; }
    try {
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, 22050);
      s.connect(ctx.destination);
      s.start(0);
    } catch (e) { /* egal */ }
    resume().then(() => {
      if (!ctx || ctx.state !== 'running') return;
      disarmUnlock();
      fireUnlocked();
    });
  }
  function armUnlock(cb) {
    if (cb) onUnlocked = cb;
    if (unlockArmed) return;
    unlockArmed = true;
    for (const ev of UNLOCK_EVENTS) window.addEventListener(ev, unlock, true);
  }
  function disarmUnlock() {
    if (!unlockArmed) return;
    unlockArmed = false;
    for (const ev of UNLOCK_EVENTS) window.removeEventListener(ev, unlock, true);
  }

  // Unsichtbarer Tab: anhalten (spart Akku); wieder sichtbar: fortsetzen
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) { try { ctx.suspend(); } catch (e) { /* egal */ } } else if (wantRunning()) resume().then(() => { if (ctx.state !== 'running') armUnlock(); });
  });

  // ---------- Einstellungen und Stummschaltung ----------
  let platformMuted = false; // z. B. CrazyGames-Einstellung "muteAudio" – hat Vorrang
  // CrazyGames-Build: still, bis das SDK seine Stummschaltung gemeldet hat (oder ohne SDK weitergeht);
  // Notausgang nach 10 s, falls das SDK-Skript nie ankommt
  let platformHold = typeof window !== 'undefined' && !!window.__cgSdk;
  if (platformHold) setTimeout(() => releasePlatform(), 10000);
  let suspendT = 0;
  // Stumm: Plattform, ?muteAudio=true, Warten auf das SDK oder die eigene Gesamt-Stummschaltung (Taste M);
  // Klang und Musik behalten dabei ihre eigenen Schalter
  function muted() { return platformMuted || FORCE_MUTE || platformHold || !!(Store.data && Store.data.settings.mute); }
  function releasePlatform() { if (!platformHold) return; platformHold = false; applySettings(); }

  function setPlatformMute(m) {
    platformMuted = !!m;
    applySettings();
  }

  function applySettings() {
    if (!ctx) return;
    const s = Store.data.settings, now = ctx.currentTime;
    const ramp = (p, v) => { p.cancelScheduledValues(now); p.setTargetAtTime(v, now, 0.02); };
    ramp(master.gain, muted() ? 0 : MASTER);
    ramp(sfxBus.gain, s.sfx ? 1 : 0);
    ramp(musicBus.gain, s.music ? MUSIC : 0);
    clearTimeout(suspendT);
    if (muted()) suspendT = setTimeout(() => { if (ctx && muted()) { try { ctx.suspend(); } catch (e) { /* egal */ } } }, 150);
    else if (!document.hidden) resume().then(() => { if (ctx.state !== 'running') armUnlock(); }); // iOS: ggf. erst mit der nächsten Geste
  }

  function gate(name, ms) {
    const t = performance.now();
    if (last[name] && t - last[name] < ms) return false;
    last[name] = t;
    return true;
  }

  // ---------- Aufnahmen abspielen ----------
  const cents = c => Math.pow(2, c / 1200);

  // Eine Kopie von buf[key]; o: { vol, rate, delay, pan, bus }. false, wenn keine Aufnahme da ist.
  function voice(key, o) {
    const b = buf[key];
    if (!b) return false;
    o = o || {};
    if ((active[key] || 0) >= MAX_COPIES || voices >= MAX_VOICES) { stats.dropped++; return true; }
    try {
      const src = ctx.createBufferSource();
      src.buffer = b;
      const det = DETUNE[key] ? cents((Math.random() * 2 - 1) * DETUNE[key]) : 1;
      src.playbackRate.value = (o.rate || 1) * det;
      const g = ctx.createGain();
      g.gain.value = (o.vol !== undefined ? o.vol : VOL[key] || 0.4) * (1 + (Math.random() * 2 - 1) * 0.08);
      src.connect(g);
      let node = g;
      if (o.pan && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, o.pan));
        g.connect(p); node = p;
      }
      node.connect(o.bus || sfxBus);
      active[key] = (active[key] || 0) + 1; voices++;
      src.onended = () => { active[key]--; voices--; try { node.disconnect(); } catch (e) { /* egal */ } };
      src.start(ctx.currentTime + (o.delay || 0));
      stats.sampled++;
      return true;
    } catch (e) { stats.errors++; return false; }
  }

  // Ereignis -> Aufnahme(n). Standard: gleichnamige Datei.
  const SAMPLED = {
    gem(combo, pan) { return voice('gem', { rate: Math.pow(2, GEM_STEPS[Math.min(GEM_STEPS.length - 1, Math.floor((combo || 0) / 2))] / 12), pan }); },
    chest() { return voice('chest_open') && voice('chest', { delay: 0.12 }); },
    bossdown() { return voice('bomb') && voice('boss', { rate: 0.75, delay: 0.05 }); },
    // Gegner-Fernkampf (M9): vorhandene Aufnahmen, leiser als die eigenen Klänge, nach Ort im Stereobild
    ewind(a, pan) { return voice('zap', { vol: VOL.zap * 0.6, rate: cents(-300), pan }); },
    efire(a, pan) { return voice('throw', { vol: VOL.throw * 0.75, pan }); },
    eimpact(a, pan) { return voice('slam', { vol: VOL.slam * 0.6, pan }); },
    // Countdown und Ansturm (M10): vorhandene Aufnahmen, umgestimmt
    warn() { return voice('summon', { rate: 0.7, vol: VOL.warn }); },
    tick() { return voice('click', { rate: cents(300), vol: VOL.tick }); },
    surge() { return voice('slam', { vol: VOL.slam * VOL.surge / 0.7 }) && voice('alarm', { delay: 0.05, vol: VOL.alarm * VOL.surge / 0.7 }); },
  };

  // ---------- Synthesizer (Ersatz, wenn eine Aufnahme fehlt) ----------
  function tone(o) {
    const t0 = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + o.dur);
    const v = o.vol || 0.2, a = o.attack || 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let node = osc;
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = o.lp;
      osc.connect(f); node = f;
    }
    node.connect(g); g.connect(o.bus || sfxBus);
    osc.start(t0); osc.stop(t0 + o.dur + 0.05);
  }

  function noise(o) {
    const t0 = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = o.rate || 1;
    const f = ctx.createBiquadFilter();
    f.type = o.ftype || 'bandpass';
    f.frequency.setValueAtTime(o.f || 1000, t0);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.dur);
    f.Q.value = o.q || 1;
    const g = ctx.createGain();
    const v = o.vol || 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + o.dur + 0.05);
  }

  const notes = (base, steps, gap, o) => steps.forEach((s, i) => tone(Object.assign({ f: base * Math.pow(2, s / 12), delay: i * gap }, o)));

  // Mindestabstände prüft play() (GATE)
  const SOUNDS = {
    hit() { noise({ f: 2400, q: 0.8, dur: 0.05, vol: 0.06, ftype: 'highpass' }); },
    kill() { tone({ type: 'triangle', f: rand(260, 340), f2: 90, dur: 0.09, vol: 0.09 }); },
    gem(combo) {
      const st = PENTA[Math.min(PENTA.length - 1, Math.floor((combo || 0) / 2))];
      tone({ type: 'sine', f: 660 * Math.pow(2, Math.min(12, st) / 12), dur: 0.08, vol: 0.07 });
    },
    coin() { tone({ type: 'square', f: 988, dur: 0.06, vol: 0.05 }); tone({ type: 'square', f: 1318, dur: 0.12, vol: 0.05, delay: 0.05 }); },
    levelup() { notes(523, [0, 4, 7, 12, 16], 0.07, { type: 'triangle', dur: 0.25, vol: 0.13 }); },
    chestpick() { tone({ type: 'sine', f: 140, f2: 60, dur: 0.25, vol: 0.25 }); },
    chest() { notes(392, [0, 3, 7, 10, 12, 15, 19, 24], 0.06, { type: 'triangle', dur: 0.3, vol: 0.1 }); noise({ f: 6000, q: 2, dur: 0.8, vol: 0.05, delay: 0.3, ftype: 'highpass' }); },
    evolve() {
      notes(262, [0, 7, 12, 16, 19, 24], 0.09, { type: 'sawtooth', dur: 0.6, vol: 0.07, lp: 2400 });
      notes(523, [0, 4, 7, 12], 0.0, { type: 'triangle', dur: 1.4, vol: 0.08, delay: 0.55 });
    },
    item() { tone({ type: 'triangle', f: 880, f2: 1320, dur: 0.15, vol: 0.1 }); },
    hurt() { tone({ type: 'sawtooth', f: 220, f2: 70, dur: 0.18, vol: 0.14, lp: 1200 }); noise({ f: 500, dur: 0.12, vol: 0.12 }); },
    death() { notes(330, [0, -3, -7, -12, -15], 0.14, { type: 'sawtooth', dur: 0.4, vol: 0.12, lp: 1400 }); },
    boss() { tone({ type: 'sawtooth', f: 82, dur: 1.4, vol: 0.18, lp: 500, attack: 0.1 }); tone({ type: 'sawtooth', f: 87, dur: 1.4, vol: 0.12, lp: 400, attack: 0.1 }); noise({ f: 120, dur: 1.2, vol: 0.2, ftype: 'lowpass' }); },
    alarm() { tone({ type: 'square', f: 660, dur: 0.12, vol: 0.06 }); tone({ type: 'square', f: 494, dur: 0.12, vol: 0.06, delay: 0.15 }); tone({ type: 'square', f: 660, dur: 0.12, vol: 0.06, delay: 0.3 }); },
    warn() { tone({ type: 'sawtooth', f: 147, dur: 0.25, vol: 0.09, lp: 700, attack: 0.04 }); tone({ type: 'sawtooth', f: 110, dur: 0.25, vol: 0.09, lp: 600, attack: 0.04, delay: 0.3 }); },
    tick() { tone({ type: 'square', f: 1175, dur: 0.05, vol: 0.08 }); },
    surge() { this.alarm(); noise({ f: 110, dur: 0.6, vol: 0.3, ftype: 'lowpass' }); },
    shoot() { tone({ type: 'sine', f: 900, f2: 500, dur: 0.07, vol: 0.035 }); },
    knife() { noise({ f: 5000, q: 3, dur: 0.04, vol: 0.04 }); },
    slash() { noise({ f: 900, f2: 3500, q: 1.5, dur: 0.13, vol: 0.13 }); },
    zap() { noise({ f: 3000, q: 0.6, dur: 0.18, vol: 0.12, ftype: 'highpass' }); tone({ type: 'square', f: 120, f2: 60, dur: 0.12, vol: 0.06 }); },
    throw() { noise({ f: 600, f2: 1600, q: 2, dur: 0.12, vol: 0.06 }); },
    flask() { noise({ f: 1800, q: 1, dur: 0.08, vol: 0.08, ftype: 'highpass' }); noise({ f: 400, dur: 0.4, vol: 0.08, ftype: 'lowpass' }); },
    nova() { tone({ type: 'sine', f: 1800, f2: 400, dur: 0.4, vol: 0.06 }); noise({ f: 7000, q: 4, dur: 0.35, vol: 0.05 }); },
    orbit() { tone({ type: 'sine', f: 440, f2: 880, dur: 0.25, vol: 0.05 }); },
    heal() { notes(659, [0, 5, 12], 0.06, { type: 'sine', dur: 0.2, vol: 0.09 }); },
    magnet() { tone({ type: 'sine', f: 200, f2: 1600, dur: 0.5, vol: 0.09 }); },
    bomb() { noise({ f: 200, dur: 0.9, vol: 0.4, ftype: 'lowpass' }); tone({ type: 'sine', f: 120, f2: 30, dur: 0.7, vol: 0.3 }); },
    break() { noise({ f: 1200, q: 2, dur: 0.12, vol: 0.12 }); tone({ type: 'triangle', f: 180, f2: 90, dur: 0.1, vol: 0.08 }); },
    summon() { tone({ type: 'sawtooth', f: 110, f2: 220, dur: 0.5, vol: 0.08, lp: 900 }); },
    dash() { noise({ f: 300, f2: 1400, q: 1, dur: 0.35, vol: 0.12 }); },
    slam() { noise({ f: 150, dur: 0.5, vol: 0.3, ftype: 'lowpass' }); tone({ type: 'sine', f: 90, f2: 40, dur: 0.4, vol: 0.25 }); },
    ewind() { tone({ type: 'square', f: 300, f2: 520, dur: 0.18, vol: 0.03 }); },
    efire() { noise({ f: 600, f2: 1600, q: 2, dur: 0.1, vol: 0.04 }); },
    eimpact() { noise({ f: 150, dur: 0.3, vol: 0.14, ftype: 'lowpass' }); },
    bossdown() { this.bomb(); notes(392, [0, 4, 7, 12, 16, 19, 24], 0.08, { type: 'triangle', dur: 0.4, vol: 0.1, delay: 0.3 }); },
    revive() { notes(440, [0, 7, 12, 19, 24], 0.08, { type: 'triangle', dur: 0.5, vol: 0.12 }); },
    click() { tone({ type: 'triangle', f: 700, dur: 0.05, vol: 0.06 }); },
    buy() { notes(784, [0, 4, 7, 12], 0.05, { type: 'square', dur: 0.12, vol: 0.05 }); },
    deny() { tone({ type: 'square', f: 140, dur: 0.15, vol: 0.06 }); },
    achievement() { notes(587, [0, 4, 7, 11, 12], 0.07, { type: 'triangle', dur: 0.35, vol: 0.1 }); },
    victory() { notes(392, [0, 4, 7, 12, 7, 12, 16, 19, 24], 0.12, { type: 'triangle', dur: 0.5, vol: 0.12 }); },
  };

  // Ereignis abspielen. arg: z. B. Edelstein-Kombo; pan: −1 (links) … 1 (rechts), optional.
  function play(name, arg, pan) {
    if (name === 'victory') { sting('victory'); return; } // Sieg = Musik-Abschluss (eigene Regeln für den Bus)
    if (!ctx || ctx.state !== 'running' || !Store.data.settings.sfx || muted()) return;
    if (GATE[name] && !gate(name, GATE[name])) return;
    const fn = SAMPLED[name];
    const ok = fn ? fn(arg, pan) : voice(name, { pan });
    if (ok) return;
    const syn = SOUNDS[name];
    if (syn) { try { syn.call(SOUNDS, arg); stats.synth++; } catch (e) { stats.errors++; } }
  }

  // ---------- Musik ----------
  const music = {}; // id -> AudioBuffer
  const pending = {}; // id -> Promise beim Dekodieren
  const failed = {};
  const LOOPS = ['menu', 'battle', 'boss'];
  let useOrder = []; // zuletzt gebrauchte Schleifen zuletzt
  let musicOn = false, intensity = 0, cur = null, holdUntil = 0, stingNode = null, lpTarget = 0;

  function loadTrack(id) {
    if (music[id]) return Promise.resolve(music[id]);
    if (pending[id]) return pending[id];
    const m = readData() && DATA.music && DATA.music[id];
    if (!m || failed[id]) return Promise.reject(new Error('keine Musik ' + id));
    pending[id] = decode(m.b64).then(b => {
      delete pending[id];
      music[id] = b;
      if (LOOPS.includes(id)) { touch(id); evict(); }
      return b;
    }, e => { delete pending[id]; failed[id] = true; stats.errors++; throw e; });
    return pending[id];
  }

  // Höchstens zwei dekodierte Schleifen behalten (eine Kampfschleife sind ~17 MB); die laufende nie verwerfen
  function touch(id) { useOrder = useOrder.filter(x => x !== id); useOrder.push(id); }
  function evict() {
    const loaded = useOrder.filter(id => music[id]);
    while (loaded.length > 2) {
      const i = loaded.findIndex(id => !cur || id !== cur.id);
      const id = loaded.splice(i, 1)[0];
      delete music[id];
      useOrder = useOrder.filter(x => x !== id);
    }
  }

  // Schleifengrenzen: Chrome entfernt Encoder-Verzögerung und Auffüllung selbst (Dauer = Nennlänge);
  // bleibt mehr übrig (z. B. Safari), wird die Verzögerung übersprungen und genau die Nennlänge geschleift.
  function loopBounds(id, b) {
    const m = DATA.music[id], nominal = m.samples / m.rate;
    if (!nominal || b.duration - nominal < 0.005) return [0, b.duration];
    const start = Math.min(b.duration - nominal, (m.delay + 529) / m.rate);
    return [start, start + nominal];
  }

  const trackFor = i => (i <= 0 ? 'menu' : i >= 3 ? 'boss' : 'battle');
  const lowpassFor = i => (i <= 1 ? 900 : 18000);

  function fadeOutCur(sec) {
    if (!cur) return;
    const now = ctx.currentTime, g = cur.g.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.setTargetAtTime(0, now, sec / 4);
    try { cur.src.stop(now + sec + 0.3); } catch (e) { /* egal */ }
    cur = null;
  }

  function crossTo(id) {
    const b = music[id];
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.loop = true;
    const [ls, le] = loopBounds(id, b);
    src.loopStart = ls; src.loopEnd = le;
    const g = ctx.createGain();
    g.gain.value = 0;
    let node = src, f = null;
    if (id === 'battle') {
      f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.Q.value = 0.7;
      lpTarget = lowpassFor(intensity);
      f.frequency.value = lpTarget;
      src.connect(f); node = f;
    }
    node.connect(g); g.connect(musicBus);
    const now = ctx.currentTime;
    g.gain.setTargetAtTime(TRACK_VOL[id] || 0.6, now, FADE / 4);
    fadeOutCur(FADE);
    src.start(now, ls);
    cur = { id, src, g, f };
    touch(id);
  }

  // Jedes Bild aus main.js: passende Schleife sicherstellen (wechselt nur bei Änderung)
  function updateMusic() {
    if (!ctx || !musicOn || synthOn) return;
    if (ctx.currentTime < holdUntil) return;
    const id = trackFor(intensity);
    if (cur && cur.id === id) {
      if (cur.f) {
        const t = lowpassFor(intensity);
        if (t !== lpTarget) { lpTarget = t; cur.f.frequency.setTargetAtTime(t, ctx.currentTime, 0.8); }
      }
      return;
    }
    if (music[id]) { crossTo(id); return; }
    if (failed[id]) { if (!cur) startSynth(); return; }
    if (!pending[id]) loadTrack(id).then(() => updateMusic(), () => updateMusic());
  }

  // Die Bossmusik vorab dekodieren, während ein Dialog das Spiel anhält (UI.show: Stufenaufstieg, Truhe, Pause). Das
  // Umwandeln aus base64 läuft im Hauptthread und kostete sonst im Bild, in dem der Boss erscheint, einige ms. Nur
  // wenn die Kampfmusik schon läuft: verdrängt wird dann die Menümusik, nie die laufende.
  function warmBoss() {
    if (!ctx || !musicOn || synthOn || !cur || cur.id !== 'battle' || music.boss || pending.boss || failed.boss) return;
    loadTrack('boss').catch(() => {});
  }

  function startMusic() {
    if (!ctx) return;
    // Ein noch klingender Abschluss (Sieg/Niederlage) weicht der neuen Musik
    if (stingNode) { stopSting(0.6); holdUntil = 0; }
    musicOn = true;
    if (!readData() || !DATA.music) startSynth();
    else { stopSynth(); updateMusic(); }
  }

  // Blendet aus statt abzuschneiden; ein laufender Abschluss klingt zu Ende
  function stopMusic() {
    musicOn = false;
    if (ctx) fadeOutCur(1.2);
    stopSynth();
  }

  function setIntensity(v) {
    intensity = v;
    if (musicOn) updateMusic();
  }

  function stopSting(sec) {
    const s = stingNode;
    stingNode = null;
    if (!s || !s.src) return; // noch beim Dekodieren: der Start unterbleibt (Token abgelöst)
    const now = ctx.currentTime, g = s.g.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.setTargetAtTime(0, now, sec / 4);
    try { s.src.stop(now + sec + 0.3); } catch (e) { /* egal */ }
  }

  // Kurzer Abschluss (victory, gameover): Schleife ausblenden, Stück einmal spielen, danach (z. B. Endlosmodus)
  // geht updateMusic() wieder zur passenden Schleife über. Musik aus, Effekte an: über den Effektbus.
  function sting(id) {
    if (!ctx || ctx.state !== 'running' || muted()) return;
    const s = Store.data.settings;
    const bus = s.music ? musicBus : s.sfx ? sfxBus : null;
    if (!bus) return;
    const m = readData() && DATA.music && DATA.music[id];
    if (!m || failed[id]) {
      if (id === 'victory' && SOUNDS.victory) { SOUNDS.victory(); stats.synth++; }
      return;
    }
    const len = m.samples / m.rate || 10;
    holdUntil = ctx.currentTime + len + 0.4;
    fadeOutCur(0.6);
    stopSynth(true);
    stopSting(0.3);
    const token = {};
    stingNode = token;
    loadTrack(id).then(b => {
      if (stingNode !== token || !ctx) return; // inzwischen abgelöst
      const src = ctx.createBufferSource();
      src.buffer = b;
      const g = ctx.createGain();
      g.gain.value = (TRACK_VOL[id] || 0.6) * (bus === sfxBus ? MUSIC : 1);
      src.connect(g); g.connect(bus);
      const now = ctx.currentTime;
      src.start(now, loopBounds(id, b)[0]);
      holdUntil = now + len + 0.4;
      token.src = src; token.g = g;
      src.onended = () => {
        if (stingNode === token) stingNode = null;
        delete music[id]; // Abschlüsse nicht im Speicher halten
        if (musicOn) { if (synthWanted) startSynth(); else updateMusic(); }
      };
      stats.sampled++;
    }, () => { if (stingNode === token) stingNode = null; holdUntil = 0; });
  }

  // ---------- Synthesizer-Musik (Ersatz ohne Aufnahmen) ----------
  // Dunkle Schleife in a-Moll; Intensität steigt mit der Spielzeit.
  const CHORDS = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]]; // Am F Dm E
  const ARP = [0, 1, 2, 1, 0, 2, 1, 2];
  let synthOn = false, synthWanted = false, nextT = 0, step = 0, timer = null;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function schedule() {
    if (!ctx || !synthOn) return;
    const spb = 60 / 104 / 2; // Achtel
    while (nextT < ctx.currentTime + 0.15) {
      const bar = Math.floor(step / 8) % CHORDS.length, s = step % 8;
      const ch = CHORDS[bar], dl = nextT - ctx.currentTime;
      if (s % 2 === 0) tone({ type: 'triangle', f: mtof(ch[0] - 24), dur: spb * 1.8, vol: 0.22, bus: musicBus, delay: dl });
      if (s === 0) for (const n of ch) tone({ type: 'sawtooth', f: mtof(n - 12), dur: spb * 7.5, vol: 0.03, lp: 700, attack: 0.3, bus: musicBus, delay: dl });
      if (intensity >= 1) tone({ type: 'square', f: mtof(ch[ARP[s]] + 12), dur: spb * 0.8, vol: 0.025, lp: 2200, bus: musicBus, delay: dl });
      if (intensity >= 2) {
        if (s % 4 === 0) tone({ type: 'sine', f: 120, f2: 40, dur: 0.18, vol: 0.3, bus: musicBus, delay: dl });
        if (s % 2 === 1) noise({ f: 8000, q: 1, dur: 0.04, vol: 0.05, ftype: 'highpass', bus: musicBus, delay: dl });
      }
      if (intensity >= 3 && s % 4 === 2) noise({ f: 1800, q: 0.7, dur: 0.12, vol: 0.09, bus: musicBus, delay: dl });
      nextT += spb;
      step++;
    }
  }

  function startSynth() {
    synthWanted = true;
    if (!ctx || synthOn || ctx.currentTime < holdUntil) return;
    synthOn = true;
    nextT = ctx.currentTime + 0.1;
    step = 0;
    timer = setInterval(schedule, 40);
  }

  // keep: nur pausieren (Abschluss spielt), Wunsch bleibt bestehen
  function stopSynth(keep) {
    if (!keep) synthWanted = false;
    synthOn = false;
    if (timer) clearInterval(timer);
    timer = null;
  }

  // ---------- Für das Probehören (tools/audio/audition.html) und Tests ----------
  function debug() {
    return {
      state: ctx ? ctx.state : 'none', sfx: Object.keys(buf).length, music: Object.keys(music),
      cur: cur && cur.id, lowpass: lpTarget, muted: muted(), master: master ? master.gain.value : null,
      voices, stats: Object.assign({}, stats), durations: Object.fromEntries(Object.entries(music).map(([k, b]) => [k, b.duration])),
      loops: Object.fromEntries(Object.entries(music).filter(([k]) => LOOPS.includes(k)).map(([k, b]) => [k, loopBounds(k, b)])),
    };
  }
  // Pegel am Ausgang (RMS, 0…1) – nur für Tests; der Analyser entsteht erst beim ersten Aufruf
  function level() {
    if (!ctx) return 0;
    if (!analyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 2048; comp.connect(analyser); }
    const a = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(a);
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * a[i];
    return Math.sqrt(s / a.length);
  }
  const EVENTS = ['hit', 'kill', 'gem', 'coin', 'levelup', 'chestpick', 'chest', 'evolve', 'item', 'hurt', 'death', 'boss', 'bossdown', 'alarm',
    'shoot', 'knife', 'slash', 'zap', 'throw', 'flask', 'nova', 'orbit', 'heal', 'magnet', 'bomb', 'break', 'summon', 'dash', 'slam', 'revive',
    'ewind', 'efire', 'eimpact', 'click', 'buy', 'deny', 'achievement', 'victory', 'warn', 'tick', 'surge'];

  return {
    init, preload, onData, play, sting, applySettings, setPlatformMute, releasePlatform, startMusic, stopMusic, setIntensity,
    unlock: armUnlock, loadTrack, warmBoss, debug, level, EVENTS, VOL, TRACK_VOL, SOUNDS,
    get ctx() { return ctx; }, get muted() { return muted(); }, get platformMuted() { return platformMuted || FORCE_MUTE; },
  };
})();
