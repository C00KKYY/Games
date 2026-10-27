'use strict';
// ---------------------------------------------------------------------------
// Klänge und Musik: alles synthetisch über WebAudio
// ---------------------------------------------------------------------------

const PENTA = [0, 2, 4, 7, 9];

const AUDIO = {
  ctx: null, master: null, sfx: null, mus: null,
  enabled: true, musicOn: true, volume: 0.6, last: {}, danger: 0,
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? this.volume : 0;
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain(); this.sfx.gain.value = 1; this.sfx.connect(this.master);
      this.mus = this.ctx.createGain(); this.mus.gain.value = this.musicOn ? 0.5 : 0; this.mus.connect(this.master);
      this.startAmbient();
      this.startMusic();
    } catch (e) { this.ctx = null; }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  setEnabled(on) { this.enabled = on; if (this.master) this.master.gain.setTargetAtTime(on ? this.volume : 0, this.ctx.currentTime, 0.05); },
  setMusic(on) { this.musicOn = on; if (this.mus) this.mus.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.3); },
  noiseBuffer() {
    if (this._nb) return this._nb;
    const len = this.ctx.sampleRate * 1.5;
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._nb = b;
    return b;
  },
  startAmbient() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuffer(); src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start();
    this.ambGain = g;
  },
  setTraffic(level) {
    if (!this.ambGain) return;
    this.ambGain.gain.setTargetAtTime(Math.min(0.1, level * 0.1), this.ctx.currentTime, 0.8);
  },
  tone(freq, dur, type = 'sine', vol = 0.3, when = 0, slide = 0, out) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out || this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, freq, vol = 0.3, when = 0, q = 1, type = 'bandpass') {
    const c = this.ctx, t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noiseBuffer();
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  // Halbton über A4
  hz(semi) { return 440 * Math.pow(2, semi / 12); },
  play(name, arg) {
    if (!this.ctx || !this.enabled) return;
    const now = performance.now();
    const gap = name === 'klack' ? 25 : name === 'pling' ? 45 : 70;
    if (this.last[name] && now - this.last[name] < gap) return;
    this.last[name] = now;
    try {
      switch (name) {
        case 'klack': { // Straßenkachel, Tonhöhe steigt entlang des Pfads
          const k = Math.min(arg || 0, 14);
          this.noise(0.05, 1800 + k * 120, 0.22, 0, 2.5);
          this.tone(this.hz(-12 + PENTA[k % 5] + 12 * Math.floor(k / 5)), 0.07, 'triangle', 0.09);
          break;
        }
        case 'pling': { // Lieferung, Kombo steigt pentatonisch
          const k = Math.min((arg || 1) - 1, 14);
          const semi = PENTA[k % 5] + 12 * Math.floor(k / 5);
          this.tone(this.hz(semi + 3), 0.22, 'sine', 0.13);
          this.tone(this.hz(semi + 15), 0.12, 'sine', 0.04, 0.01);
          break;
        }
        case 'drop': this.tone(110, 0.18, 'sine', 0.25, 0, 0.5); this.noise(0.12, 300, 0.2, 0, 0.8, 'lowpass'); break;
        case 'dropBig': this.tone(80, 0.3, 'sine', 0.35, 0, 0.45); this.noise(0.2, 250, 0.3, 0, 0.8, 'lowpass'); this.tone(523, 0.15, 'triangle', 0.08, 0.12); this.tone(784, 0.2, 'triangle', 0.08, 0.2); break;
        case 'erase': this.noise(0.18, 600, 0.22, 0, 0.7, 'lowpass'); this.tone(240, 0.12, 'triangle', 0.08, 0, 0.6); break;
        case 'deny': this.tone(196, 0.1, 'square', 0.07); this.tone(147, 0.14, 'square', 0.07, 0.09); break;
        case 'honk': { const f = 330 + Math.random() * 120; this.tone(f, 0.16, 'square', 0.035); this.tone(f * 1.26, 0.16, 'square', 0.03); break; }
        case 'warn': this.tone(587, 0.12, 'triangle', 0.14); this.tone(466, 0.18, 'triangle', 0.14, 0.13); break;
        case 'bell': for (let k = 0; k < 4; k++) this.tone(1568, 0.09, 'triangle', 0.05, k * 0.22); break;
        case 'horn': this.tone(98, 0.9, 'sawtooth', 0.06); this.tone(147, 0.9, 'sawtooth', 0.04); break;
        case 'siren': for (let k = 0; k < 3; k++) { this.tone(740, 0.3, 'sawtooth', 0.035, k * 0.6); this.tone(988, 0.3, 'sawtooth', 0.035, k * 0.6 + 0.3); } break;
        case 'saved': [523, 659, 784, 1047, 1319].forEach((f, k) => this.tone(f, 0.22, 'triangle', 0.13, k * 0.08)); break;
        case 'late': [392, 349, 311].forEach((f, k) => this.tone(f, 0.3, 'sine', 0.12, k * 0.16)); break;
        case 'week': [392, 523, 659, 784].forEach((f, k) => this.tone(f, 0.28, 'triangle', 0.14, k * 0.11)); this.tone(1047, 0.5, 'triangle', 0.12, 0.45); break;
        case 'card': this.noise(0.08, 3000, 0.12, 0, 1.2); this.tone(880, 0.1, 'triangle', 0.08, 0.04); break;
        case 'gameover': [440, 415, 392, 330].forEach((f, k) => this.tone(f, 0.45, 'sine', 0.16, k * 0.26)); this.noise(0.6, 200, 0.12, 0.9, 0.5, 'lowpass'); break;
        case 'police': this.tone(2400, 0.08, 'sine', 0.08); this.tone(2600, 0.25, 'sine', 0.09, 0.1); break;
        case 'device': this.tone(660, 0.07, 'triangle', 0.12); this.tone(990, 0.1, 'triangle', 0.1, 0.06); break;
        case 'priority': this.noise(0.2, 2000, 0.1, 0, 0.5, 'highpass'); this.tone(523, 0.1, 'triangle', 0.1, 0.05); this.tone(784, 0.12, 'triangle', 0.1, 0.12); break;
        case 'greenwave': [523, 587, 659, 784, 880, 1047].forEach((f, k) => this.tone(f, 0.16, 'sine', 0.1, k * 0.06)); break;
        case 'confetti': this.noise(0.3, 4000, 0.12, 0, 0.6, 'highpass'); [784, 988, 1175].forEach((f, k) => this.tone(f, 0.14, 'triangle', 0.08, k * 0.05)); break;
        case 'undo': this.tone(700, 0.07, 'triangle', 0.12, 0, 0.6); break;
        case 'click': this.tone(880, 0.04, 'triangle', 0.08); break;
        case 'tool': this.tone(620, 0.05, 'triangle', 0.1); this.tone(930, 0.05, 'triangle', 0.08, 0.04); break;
        case 'valve': this.tone(520, 0.08, 'sine', 0.06); this.tone(390, 0.1, 'sine', 0.06, 0.07); break;
        case 'newday': this.tone(784, 0.15, 'sine', 0.05); this.tone(1047, 0.2, 'sine', 0.04, 0.1); break;
      }
    } catch (e) { /* ignorieren */ }
  },

  // ---- Generative Musik --------------------------------------------------------------
  startMusic() {
    this.beat = 0;
    this.nextT = this.ctx.currentTime + 0.3;
    this.chords = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]]; // C, Am, F, G
    const tick = () => {
      if (!this.ctx) return;
      const c = this.ctx;
      const bpm = 92 + this.danger * 38;
      const step = 60 / bpm / 2;
      while (this.nextT < c.currentTime + 0.25) {
        this.musicStep(this.nextT, step);
        this.nextT += step;
        this.beat++;
      }
      setTimeout(tick, 80);
    };
    tick();
  },
  musicStep(t, step) {
    if (!this.musicOn || !this.enabled) return;
    const b = this.beat, bar = Math.floor(b / 8) % 4;
    const ch = this.chords[bar];
    const minor = this.danger > 0.5 ? -1 : 0;
    const base = -21;
    const when = t - this.ctx.currentTime;
    if (when < 0) return;
    const mv = 0.05;
    if (b % 8 === 0) {
      this.tone(this.hz(base + ch[0] - 12), step * 7, 'triangle', mv * 0.9, when, 0, this.mus);
      for (const n of ch) this.tone(this.hz(base + 12 + n + (n === ch[1] ? minor : 0)), step * 7.5, 'sine', mv * 0.25, when, 0, this.mus);
    }
    if (b % 8 === 4) this.tone(this.hz(base + ch[0] - 5), step * 3, 'triangle', mv * 0.6, when, 0, this.mus);
    // Pluck-Arpeggio
    const pat = [0, 2, 1, 2, 0, 2, 1, 3];
    const p = pat[b % 8];
    if (p < 3 && (b % 2 === 0 || this.danger > 0.3)) {
      const n = ch[p] + 24 + base;
      this.tone(this.hz(n), step * 1.4, 'triangle', mv * 0.32, when, 0, this.mus);
    }
    // leise Hi-Hat bei Gefahr
    if (this.danger > 0.2 && b % 2 === 1) {
      const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuffer();
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
      const g = c.createGain(); g.gain.setValueAtTime(0.02 * this.danger, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      s.connect(f); f.connect(g); g.connect(this.mus); s.start(t, Math.random()); s.stop(t + 0.07);
    }
  },
};
