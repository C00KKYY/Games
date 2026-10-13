'use strict';
// ---------------------------------------------------------------------------
// Klänge: alles synthetisch über WebAudio (keine Audiodateien nötig)
// ---------------------------------------------------------------------------

const AUDIO = {
  ctx: null, master: null, enabled: true, volume: 0.55, ambient: null, ambGain: null, last: {},
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? this.volume : 0;
      this.master.connect(this.ctx.destination);
      this.startAmbient();
    } catch (e) { this.ctx = null; }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  setEnabled(on) { this.enabled = on; if (this.master) this.master.gain.value = on ? this.volume : 0; },
  setVolume(v) { this.volume = v; if (this.master && this.enabled) this.master.gain.value = v; },
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
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    this.ambGain = g;
  },
  setTraffic(level) { // 0..1
    if (!this.ambGain) return;
    this.ambGain.gain.setTargetAtTime(Math.min(0.12, level * 0.12), this.ctx.currentTime, 0.8);
  },
  tone(freq, dur, type = 'sine', vol = 0.3, when = 0, slide = 0) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, freq, vol = 0.3, when = 0, q = 1, type = 'bandpass') {
    const c = this.ctx, t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noiseBuffer();
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  play(name) {
    if (!this.ctx || !this.enabled) return;
    const now = performance.now();
    if (this.last[name] && now - this.last[name] < 70) return;
    this.last[name] = now;
    try {
      switch (name) {
        case 'click': this.tone(880, 0.05, 'triangle', 0.12); break;
        case 'tool': this.tone(620, 0.06, 'triangle', 0.12); this.tone(930, 0.06, 'triangle', 0.1, 0.04); break;
        case 'build': this.noise(0.12, 900, 0.25, 0, 0.8); this.tone(160, 0.12, 'square', 0.08); break;
        case 'demolish': this.noise(0.35, 400, 0.35, 0, 0.6, 'lowpass'); this.tone(90, 0.25, 'sawtooth', 0.06, 0, 0.5); break;
        case 'error': this.tone(220, 0.12, 'square', 0.1); this.tone(160, 0.16, 'square', 0.1, 0.1); break;
        case 'undo': this.tone(700, 0.07, 'triangle', 0.12, 0, 0.6); break;
        case 'crash': this.noise(0.5, 1200, 0.45, 0, 0.5); this.noise(0.3, 300, 0.4, 0.02, 0.7, 'lowpass'); this.tone(70, 0.3, 'sawtooth', 0.12, 0, 0.5); break;
        case 'siren': for (let k = 0; k < 4; k++) { this.tone(720, 0.28, 'sawtooth', 0.04, k * 0.56); this.tone(960, 0.28, 'sawtooth', 0.04, k * 0.56 + 0.28); } break;
        case 'alarm': for (let k = 0; k < 3; k++) this.tone(1100, 0.15, 'square', 0.06, k * 0.25); break;
        case 'horn': this.tone(392, 0.22, 'square', 0.05); this.tone(494, 0.22, 'square', 0.04); break;
        case 'power': this.tone(220, 0.6, 'sawtooth', 0.08, 0, 0.3); this.noise(0.3, 2000, 0.1); break;
        case 'note': this.tone(660, 0.1, 'sine', 0.12); this.tone(990, 0.14, 'sine', 0.1, 0.08); break;
        case 'warn': this.tone(520, 0.12, 'triangle', 0.15); this.tone(420, 0.16, 'triangle', 0.15, 0.12); break;
        case 'good': this.tone(660, 0.1, 'triangle', 0.15); this.tone(880, 0.12, 'triangle', 0.15, 0.09); this.tone(1320, 0.16, 'triangle', 0.12, 0.18); break;
        case 'event': this.tone(523, 0.12, 'triangle', 0.14); this.tone(659, 0.12, 'triangle', 0.14, 0.12); this.tone(784, 0.2, 'triangle', 0.14, 0.24); break;
        case 'achievement': [523, 659, 784, 1047].forEach((f, k) => this.tone(f, 0.18, 'triangle', 0.16, k * 0.09)); break;
        case 'win': [392, 523, 659, 784, 1047].forEach((f, k) => this.tone(f, 0.3, 'triangle', 0.18, k * 0.13)); break;
        case 'lose': [440, 392, 349, 262].forEach((f, k) => this.tone(f, 0.35, 'sine', 0.18, k * 0.2)); break;
        case 'cash': this.tone(1320, 0.06, 'square', 0.06); this.tone(1760, 0.1, 'square', 0.06, 0.05); break;
      }
    } catch (e) { /* ignorieren */ }
  },
};
