'use strict';
// Klangeffekte und Musik, live per WebAudio erzeugt.

const Sfx = (() => {
  let ctx = null, master, sfxBus, musicBus, noiseBuf;
  const last = {};
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.32; musicBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    applySettings();
  }

  function applySettings() {
    if (!ctx) return;
    const s = Store.data.settings;
    sfxBus.gain.value = s.sfx ? 1 : 0;
    musicBus.gain.value = s.music ? 0.32 : 0;
  }

  function gate(name, ms) {
    const t = performance.now();
    if (last[name] && t - last[name] < ms) return false;
    last[name] = t;
    return true;
  }

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

  const SOUNDS = {
    hit() { if (gate('hit', 35)) noise({ f: 2400, q: 0.8, dur: 0.05, vol: 0.06, ftype: 'highpass' }); },
    kill() { if (gate('kill', 28)) tone({ type: 'triangle', f: rand(260, 340), f2: 90, dur: 0.09, vol: 0.09 }); },
    gem(combo) {
      if (!gate('gem', 30)) return;
      const st = PENTA[Math.min(PENTA.length - 1, Math.floor((combo || 0) / 2))];
      tone({ type: 'sine', f: 660 * Math.pow(2, st / 12), dur: 0.08, vol: 0.07 });
    },
    coin() { if (!gate('coin', 50)) return; tone({ type: 'square', f: 988, dur: 0.06, vol: 0.05 }); tone({ type: 'square', f: 1318, dur: 0.12, vol: 0.05, delay: 0.05 }); },
    levelup() { notes(523, [0, 4, 7, 12, 16], 0.07, { type: 'triangle', dur: 0.25, vol: 0.13 }); },
    chestpick() { tone({ type: 'sine', f: 140, f2: 60, dur: 0.25, vol: 0.25 }); },
    chest() { notes(392, [0, 3, 7, 10, 12, 15, 19, 24], 0.06, { type: 'triangle', dur: 0.3, vol: 0.1 }); noise({ f: 6000, q: 2, dur: 0.8, vol: 0.05, delay: 0.3, ftype: 'highpass' }); },
    evolve() {
      notes(262, [0, 7, 12, 16, 19, 24], 0.09, { type: 'sawtooth', dur: 0.6, vol: 0.07, lp: 2400 });
      notes(523, [0, 4, 7, 12], 0.0, { type: 'triangle', dur: 1.4, vol: 0.08, delay: 0.55 });
    },
    item() { tone({ type: 'triangle', f: 880, f2: 1320, dur: 0.15, vol: 0.1 }); },
    hurt() { if (!gate('hurt', 120)) return; tone({ type: 'sawtooth', f: 220, f2: 70, dur: 0.18, vol: 0.14, lp: 1200 }); noise({ f: 500, dur: 0.12, vol: 0.12 }); },
    death() { notes(330, [0, -3, -7, -12, -15], 0.14, { type: 'sawtooth', dur: 0.4, vol: 0.12, lp: 1400 }); },
    boss() { tone({ type: 'sawtooth', f: 82, dur: 1.4, vol: 0.18, lp: 500, attack: 0.1 }); tone({ type: 'sawtooth', f: 87, dur: 1.4, vol: 0.12, lp: 400, attack: 0.1 }); noise({ f: 120, dur: 1.2, vol: 0.2, ftype: 'lowpass' }); },
    alarm() { tone({ type: 'square', f: 660, dur: 0.12, vol: 0.06 }); tone({ type: 'square', f: 494, dur: 0.12, vol: 0.06, delay: 0.15 }); tone({ type: 'square', f: 660, dur: 0.12, vol: 0.06, delay: 0.3 }); },
    shoot() { if (gate('shoot', 70)) tone({ type: 'sine', f: 900, f2: 500, dur: 0.07, vol: 0.035 }); },
    knife() { if (gate('knife', 45)) noise({ f: 5000, q: 3, dur: 0.04, vol: 0.04 }); },
    slash() { if (gate('slash', 60)) noise({ f: 900, f2: 3500, q: 1.5, dur: 0.13, vol: 0.13 }); },
    zap() { if (!gate('zap', 50)) return; noise({ f: 3000, q: 0.6, dur: 0.18, vol: 0.12, ftype: 'highpass' }); tone({ type: 'square', f: 120, f2: 60, dur: 0.12, vol: 0.06 }); },
    throw() { if (gate('throw', 80)) noise({ f: 600, f2: 1600, q: 2, dur: 0.12, vol: 0.06 }); },
    flask() { if (gate('flask', 90)) { noise({ f: 1800, q: 1, dur: 0.08, vol: 0.08, ftype: 'highpass' }); noise({ f: 400, dur: 0.4, vol: 0.08, ftype: 'lowpass' }); } },
    nova() { tone({ type: 'sine', f: 1800, f2: 400, dur: 0.4, vol: 0.06 }); noise({ f: 7000, q: 4, dur: 0.35, vol: 0.05 }); },
    orbit() { tone({ type: 'sine', f: 440, f2: 880, dur: 0.25, vol: 0.05 }); },
    heal() { notes(659, [0, 5, 12], 0.06, { type: 'sine', dur: 0.2, vol: 0.09 }); },
    magnet() { tone({ type: 'sine', f: 200, f2: 1600, dur: 0.5, vol: 0.09 }); },
    bomb() { noise({ f: 200, dur: 0.9, vol: 0.4, ftype: 'lowpass' }); tone({ type: 'sine', f: 120, f2: 30, dur: 0.7, vol: 0.3 }); },
    break() { if (gate('break', 60)) { noise({ f: 1200, q: 2, dur: 0.12, vol: 0.12 }); tone({ type: 'triangle', f: 180, f2: 90, dur: 0.1, vol: 0.08 }); } },
    summon() { tone({ type: 'sawtooth', f: 110, f2: 220, dur: 0.5, vol: 0.08, lp: 900 }); },
    dash() { noise({ f: 300, f2: 1400, q: 1, dur: 0.35, vol: 0.12 }); },
    slam() { noise({ f: 150, dur: 0.5, vol: 0.3, ftype: 'lowpass' }); tone({ type: 'sine', f: 90, f2: 40, dur: 0.4, vol: 0.25 }); },
    bossdown() { this.bomb(); notes(392, [0, 4, 7, 12, 16, 19, 24], 0.08, { type: 'triangle', dur: 0.4, vol: 0.1, delay: 0.3 }); },
    revive() { notes(440, [0, 7, 12, 19, 24], 0.08, { type: 'triangle', dur: 0.5, vol: 0.12 }); },
    click() { tone({ type: 'triangle', f: 700, dur: 0.05, vol: 0.06 }); },
    buy() { notes(784, [0, 4, 7, 12], 0.05, { type: 'square', dur: 0.12, vol: 0.05 }); },
    deny() { tone({ type: 'square', f: 140, dur: 0.15, vol: 0.06 }); },
    achievement() { notes(587, [0, 4, 7, 11, 12], 0.07, { type: 'triangle', dur: 0.35, vol: 0.1 }); },
    victory() { notes(392, [0, 4, 7, 12, 7, 12, 16, 19, 24], 0.12, { type: 'triangle', dur: 0.5, vol: 0.12 }); },
  };

  function play(name, arg) {
    if (!ctx || ctx.state !== 'running' || !Store.data.settings.sfx) return;
    const fn = SOUNDS[name];
    if (fn) fn.call(SOUNDS, arg);
  }

  // ---------- Musik ----------
  // Dunkle Schleife in a-Moll; Intensität steigt mit der Spielzeit.
  const CHORDS = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]]; // Am F Dm E
  const ARP = [0, 1, 2, 1, 0, 2, 1, 2];
  let musicOn = false, nextT = 0, step = 0, timer = null, intensity = 0;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function schedule() {
    if (!ctx || !musicOn) return;
    const spb = 60 / 104 / 2; // Achtel
    while (nextT < ctx.currentTime + 0.15) {
      const bar = Math.floor(step / 8) % CHORDS.length, s = step % 8;
      const ch = CHORDS[bar];
      if (s % 2 === 0) tone({ type: 'triangle', f: mtof(ch[0] - 24), dur: spb * 1.8, vol: 0.22, bus: musicBus, delay: nextT - ctx.currentTime });
      if (s === 0) for (const n of ch) tone({ type: 'sawtooth', f: mtof(n - 12), dur: spb * 7.5, vol: 0.03, lp: 700, attack: 0.3, bus: musicBus, delay: nextT - ctx.currentTime });
      if (intensity >= 1) tone({ type: 'square', f: mtof(ch[ARP[s]] + 12), dur: spb * 0.8, vol: 0.025, lp: 2200, bus: musicBus, delay: nextT - ctx.currentTime });
      if (intensity >= 2) {
        if (s % 4 === 0) tone({ type: 'sine', f: 120, f2: 40, dur: 0.18, vol: 0.3, bus: musicBus, delay: nextT - ctx.currentTime });
        if (s % 2 === 1) noise({ f: 8000, q: 1, dur: 0.04, vol: 0.05, ftype: 'highpass', bus: musicBus, delay: nextT - ctx.currentTime });
      }
      if (intensity >= 3 && s % 4 === 2) noise({ f: 1800, q: 0.7, dur: 0.12, vol: 0.09, bus: musicBus, delay: nextT - ctx.currentTime });
      nextT += spb;
      step++;
    }
  }

  function startMusic() {
    if (!ctx || musicOn) return;
    musicOn = true;
    nextT = ctx.currentTime + 0.1;
    step = 0;
    timer = setInterval(schedule, 40);
  }

  function stopMusic() {
    musicOn = false;
    if (timer) clearInterval(timer);
    timer = null;
  }

  function setIntensity(v) { intensity = v; }

  return { init, play, applySettings, startMusic, stopMusic, setIntensity };
})();
