// Bricklash – Roguelite-Brick-Breaker: Level räumen, 1 von 3 Upgrades wählen, alle 5 Level ein Boss.
// Logische Auflösung 960×540, skaliert auf das Fenster. Fester Zeitschritt, WebAudio, Speicherstand, SDK über cg.js.
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const LW = 960, LH = 540;
  let W = 0, H = 0, DPR = 1, S = 1, OX = 0, OY = 0;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    S = Math.min(W / LW, H / LH);
    OX = (W - LW * S) / 2; OY = (H - LH * S) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // ---------- Audio ----------
  const audio = {
    ctx: null, master: null, noise: null, userMuted: CG.load('bl_mute', false),
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 0.6;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.apply();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    off() { return !this.ctx || CG.muted || this.userMuted || paused; },
    apply() { if (this.master) this.master.gain.value = (CG.muted || this.userMuted) ? 0 : 0.4; },
    tone(f, dur = 0.08, type = 'square', vol = 0.18, slide = 0, delay = 0) {
      if (this.off()) return;
      const t = this.ctx.currentTime + delay;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.03);
    },
    boom(dur = 0.4, vol = 0.4, freq = 400) {
      if (this.off()) return;
      const t = this.ctx.currentTime;
      const s = this.ctx.createBufferSource(); s.buffer = this.noise;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq * 3, t);
      f.frequency.exponentialRampToValueAtTime(60, t + dur);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.03);
    },
  };
  CG.onMuteChange(() => audio.apply());
  ['pointerdown', 'touchend', 'keydown'].forEach((ev) => window.addEventListener(ev, () => audio.ensure(), { passive: true }));

  // ---------- Eingabe ----------
  const input = { x: LW / 2, y: LH / 2, down: false, clicked: false, usePointer: false, keys: new Set(), pressed: new Set() };
  const toLogical = (e) => [(e.clientX - OX) / S, (e.clientY - OY) / S];
  canvas.addEventListener('pointerdown', (e) => {
    [input.x, input.y] = toLogical(e); input.down = true; input.clicked = true; input.usePointer = true;
  });
  window.addEventListener('pointermove', (e) => {
    [input.x, input.y] = toLogical(e);
    if (e.pointerType === 'mouse' || input.down) input.usePointer = true;
  });
  window.addEventListener('pointerup', () => { input.down = false; });
  window.addEventListener('pointercancel', () => { input.down = false; });
  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (!input.keys.has(e.code)) input.pressed.add(e.code);
    input.keys.add(e.code);
    if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) input.usePointer = false;
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => { input.keys.clear(); input.down = false; });

  // ---------- Speicherstand & Meta ----------
  const save = Object.assign({ shards: 0, best: 0, bestScore: 0, runs: 0, meta: {}, daily: '', muteHint: 0 }, CG.load('bl_save', {}));
  const persist = () => CG.save('bl_save', save);
  const mlv = (id) => save.meta[id] || 0;
  const META = [
    { id: 'lives', ic: '❤️', nm: 'Spare Heart', ds: '+1 starting life', max: 2, base: 40 },
    { id: 'paddle', ic: '📏', nm: 'Long Paddle', ds: '+8% paddle width', max: 3, base: 25 },
    { id: 'luck', ic: '🍀', nm: 'Lucky Drops', ds: '+25% capsule chance', max: 3, base: 30 },
    { id: 'start', ic: '🎁', nm: 'Head Start', ds: 'free upgrade pick at start', max: 1, base: 70 },
  ];
  const metaCost = (m) => Math.round(m.base * Math.pow(1.9, mlv(m.id)));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

  // ---------- Upgrades (pro Run) ----------
  const UPS = [
    { id: 'multi', ic: '⚪', nm: 'Multiball', col: '#7cf', ds: (l) => `Launch ${l + 2} balls` , max: 4 },
    { id: 'wide', ic: '↔️', nm: 'Wide Paddle', col: '#8f8', ds: () => 'Paddle +18% wider', max: 4 },
    { id: 'power', ic: '💥', nm: 'Heavy Ball', col: '#fa5', ds: (l) => `Ball damage ${l + 2}`, max: 4 },
    { id: 'fire', ic: '🔥', nm: 'Fireball', col: '#f64', ds: (l) => `${(l + 1) * 15}% chance to ignite: pierce + burn`, max: 4 },
    { id: 'laser', ic: '🔫', nm: 'Paddle Lasers', col: '#f5f', ds: (l) => `Auto-fire every ${laserEvery(l + 1).toFixed(1)}s`, max: 4 },
    { id: 'blast', ic: '💣', nm: 'Shockwave', col: '#fc4', ds: (l) => `Hits splash ${40 + (l + 1) * 18}px around`, max: 3 },
    { id: 'shield', ic: '🛡️', nm: 'Floor Shield', col: '#4ef', ds: (l) => `Saves ${l + 1} ball${l ? 's' : ''} per level`, max: 3 },
    { id: 'chain', ic: '⚡', nm: 'Chain Zap', col: '#ff6', ds: (l) => `${Math.min(60, (l + 1) * 20)}% zap on break`, max: 3 },
    { id: 'life', ic: '❤️', nm: 'Extra Life', col: '#f6a', ds: () => '+1 life', max: 9 },
  ];
  const laserEvery = (l) => (l ? 1.9 / (1 + 0.45 * (l - 1)) : 0);

  // ---------- Zustand ----------
  let paused = false;
  const st = {
    mode: 'serve', t: 0, level: 1, lives: 3, score: 0, up: {}, balls: [], bricks: [], caps: [], lasers: [], shots: [],
    boss: null, px: LW / 2, pvx: 0, ptilt: 0, psquash: 0, pw: 110, stun: 0, grow: 0, slow: 0, tempLaser: 0, laserT: 0,
    shield: 0, combo: 0, comboT: 0, shake: 0, hitstop: 0, flash: 0, timer: 0, serveT: 0, choices: [], newBest: false,
    banner: null, shardsGain: 0, daily: false, firstServe: true, zaps: [], picksPending: 0,
  };
  const parts = [], texts = [], rings = [];
  const ulv = (id) => st.up[id] || 0;
  const PY = 500, PH = 16;
  const paddleW = () => 110 * (1 + 0.08 * mlv('paddle')) * (1 + 0.18 * ulv('wide')) * (st.grow > 0 ? 1.45 : 1);
  const ballSpeed = () => Math.min(740, 470 + st.level * 9) * (st.slow > 0 ? 0.7 : 1);

  // Sterne für Hintergrund
  const stars = Array.from({ length: 90 }, () => ({ x: Math.random() * LW, y: Math.random() * LH, z: rand(0.2, 1) }));

  // ---------- Level-Erzeugung ----------
  const COLS = 14, BW = 62, BH = 24, GX = (LW - COLS * BW) / 2, GY = 62;
  const PATTERNS = {
    rows: (c, r) => r < 6 && !(r % 3 === 2 && c % 4 === 0),
    pyramid: (c, r) => r < 7 && Math.abs(c - 6.5) <= r + 0.5,
    diamond: (c, r) => Math.abs(c - 6.5) / 7 + Math.abs(r - 3.5) / 4 <= 1,
    checker: (c, r) => r < 7 && (c + r) % 2 === 0,
    columns: (c, r) => r < 8 && c % 3 !== 2,
    frame: (c, r) => r < 7 && (r === 0 || r === 6 || c === 0 || c === 13 || (r >= 2 && r <= 4 && c >= 4 && c <= 9)),
    wave: (c, r) => Math.abs(r - (3 + Math.sin(c * 0.7) * 2.5)) < 1.6,
    invader: (c, r) => {
      const m = ['0011000001100', '0001100011000', '0011111111100', '0110111110110', '1111111111111', '1011111111101', '1010000000101', '0001100011000'];
      const cc = c - 0; return r < 8 && cc < 13 && m[r][cc] === '1';
    },
    mirror: null, // zufällig, gespiegelt
  };
  const patternNames = Object.keys(PATTERNS);
  let lastPattern = '';

  function mkBrick(c, r, hp, type = 'n') {
    return { x: GX + c * BW + 2, y: GY + r * BH + 2, w: BW - 4, h: BH - 4, hp, max: hp, type, flash: 0, vx: 0, burn: 0, wob: 0 };
  }

  function buildLevel() {
    st.bricks = []; st.boss = null; st.shots = [];
    const L = st.level;
    const baseHp = 1 + Math.floor((L - 1) / 4);
    if (L === 1) {
      // Einstiegslevel: viele Bomben → sofort eine Kettenreaktion
      for (let r = 0; r < 4; r++) for (let c = 0; c < COLS; c++) {
        if ((r === 1 || r === 3) && c % 3 === 1) st.bricks.push(mkBrick(c, r, 1, 'bomb'));
        else if (r === 0 && (c === 3 || c === 10)) st.bricks.push(mkBrick(c, r, 1, 'gold'));
        else st.bricks.push(mkBrick(c, r, 1));
      }
      return;
    }
    if (L % 5 === 0) {
      // Boss-Level
      const hp = 25 + L * 5;
      st.boss = { x: LW / 2 - 100, y: 70, w: 200, h: 60, hp, max: hp, flash: 0, shootT: 2, phase: 0, eye: 0 };
      for (let c = 0; c < COLS; c++) {
        if (c % 3 !== 1) st.bricks.push(mkBrick(c, 6, baseHp));
        if (c % 4 === 0) st.bricks.push(mkBrick(c, 7, 1, 'bomb'));
      }
      st.banner = { a: 'BOSS', b: 'Smash the Brick Golem!', col: '#ff4d6d', t: 2.4 };
      return;
    }
    let name;
    do { name = pick(patternNames); } while (name === lastPattern);
    lastPattern = name;
    let fn = PATTERNS[name];
    if (!fn) {
      const half = Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => Math.random() < 0.55));
      fn = (c, r) => r < 7 && half[r][c < 7 ? c : 13 - c];
    }
    const steelMax = L >= 3 ? Math.min(8, 2 + Math.floor(L / 3)) : 0;
    let steel = 0;
    for (let r = 0; r < 9; r++) for (let c = 0; c < COLS; c++) {
      if (!fn(c, r)) continue;
      const x = Math.random();
      let type = 'n';
      let hp = baseHp + (r < 2 && L > 2 ? 1 : 0) + (Math.random() < Math.min(0.3, L * 0.03) ? 1 : 0);
      if (x < 0.07) { type = 'bomb'; hp = 1; }
      else if (x < 0.11) { type = 'gold'; hp = 1; }
      else if (x < 0.15 && steel < steelMax && r > 1) { type = 'steel'; hp = 6 + L; steel++; }
      st.bricks.push(mkBrick(c, r, hp, type));
    }
    // Ab Level 4: eine Reihe wandernder Ziegel
    if (L >= 4 && Math.random() < 0.6) {
      const y = 9;
      for (let i = 0; i < 4; i++) {
        const b = mkBrick(i * 3 + 1, y, baseHp + 1, 'move');
        b.vx = (i % 2 ? -1 : 1) * (70 + L * 4);
        st.bricks.push(b);
      }
    }
    if (st.bricks.filter((b) => b.type !== 'steel').length < 12) buildLevel();
  }

  // ---------- Run-Steuerung ----------
  function newRun() {
    Object.assign(st, {
      level: 1, lives: 3 + mlv('lives'), score: 0, up: {}, combo: 0, comboT: 0, grow: 0, slow: 0, tempLaser: 0,
      newBest: false, firstServe: true, picksPending: mlv('start'), shake: 0, flash: 0,
    });
    st.daily = save.daily !== today();
    parts.length = 0; texts.length = 0; rings.length = 0;
    if (st.picksPending > 0) { st.picksPending--; buildLevel(); openPick(true); return; }
    startLevel();
  }

  function startLevel() {
    buildLevel();
    st.shield = ulv('shield');
    st.caps = []; st.lasers = []; st.zaps = [];
    if (st.level > 1 && !st.boss) st.banner = { a: `LEVEL ${st.level}`, b: st.level % 5 === 4 ? 'Boss next!' : '', col: '#7df9ff', t: 1.6 };
    if (st.level === 1 && st.daily) st.banner = { a: 'DAILY RUN', b: 'Shards x2 today', col: '#7dff9a', t: 2.2 };
    serve();
  }

  function serve() {
    st.mode = 'serve'; st.serveT = st.firstServe ? 6 : 2.2; st.balls = [];
    st.balls.push(newBall(st.px, PY - 9, 0, 0));
    CG.gameplayStart();
  }

  function newBall(x, y, vx, vy) { return { x, y, vx, vy, r: 8, fire: 0, trail: [], squash: 0 }; }

  function launch() {
    if (st.mode !== 'serve') return;
    st.mode = 'play'; st.firstServe = false;
    const n = 1 + ulv('multi');
    const sp = ballSpeed();
    const base = -Math.PI / 2 + clamp(st.pvx / 1500, -0.5, 0.5) + (n === 1 ? 0.25 : 0);
    st.balls = [];
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.32;
      st.balls.push(newBall(st.px, PY - 9, Math.cos(a) * sp, Math.sin(a) * sp));
    }
    audio.tone(520, 0.1, 'triangle', 0.2, 1.6);
    st.psquash = 0.5;
  }

  function loseBall() {
    st.lives--; st.combo = 0;
    st.shake = 0.5; st.flash = 0.25;
    audio.tone(330, 0.5, 'sawtooth', 0.2, 0.3);
    if (st.lives <= 0) { gameOver(); return; }
    st.mode = 'dead'; st.timer = 0.9;
    texts.push({ x: st.px, y: PY - 40, s: '-1 ❤️', col: '#ff6a8a', t: 1.2, size: 30 });
  }

  function levelCleared() {
    st.mode = 'clear'; st.timer = 1.4;
    const bonus = 100 * st.level;
    addScore(bonus);
    texts.push({ x: LW / 2, y: LH / 2 + 40, s: `+${bonus} clear bonus`, col: '#ffe66d', t: 1.4, size: 26 });
    st.banner = { a: st.boss ? 'BOSS DOWN!' : 'CLEARED!', b: '', col: '#7dff9a', t: 1.4 };
    st.flash = 0.3;
    [523, 659, 784, 1046].forEach((f, i) => audio.tone(f, 0.18, 'triangle', 0.18, 0, i * 0.08));
    if (st.boss) CG.happytime();
    CG.gameplayStop();
  }

  function openPick(free = false) {
    st.mode = 'pick'; st.pickFree = free;
    const pool = UPS.filter((u) => ulv(u.id) < u.max && !(u.id === 'life' && st.lives >= 6));
    const ch = [];
    while (ch.length < 3 && pool.length) ch.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    st.choices = ch; st.pickAnim = 0;
    CG.gameplayStop();
  }

  function choose(i) {
    const u = st.choices[i]; if (!u) return;
    if (u.id === 'life') st.lives++; else st.up[u.id] = ulv(u.id) + 1;
    audio.tone(660, 0.1, 'square', 0.15); audio.tone(990, 0.2, 'square', 0.12, 0, 0.08);
    if (st.pickFree) { st.pickFree = false; if (st.picksPending > 0) { st.picksPending--; openPick(true); return; } startLevel(); return; }
    st.level++;
    startLevel();
  }

  function gameOver() {
    st.mode = 'over'; st.timer = 0;
    CG.gameplayStop();
    const gain = Math.floor(st.score / 60 + (st.level - 1) * 3) * (st.daily ? 2 : 1);
    st.shardsGain = gain;
    save.shards += gain; save.runs++;
    if (st.daily) save.daily = today();
    if (st.score > save.bestScore) { st.newBest = save.bestScore > 0; save.bestScore = st.score; }
    save.best = Math.max(save.best, st.level);
    persist();
    if (st.newBest) CG.happytime();
  }

  let runCount = 0;
  function playAgain() {
    runCount++;
    if (runCount % 2 === 0) {
      st.mode = 'ad';
      CG.requestAd('midgame', { pause: () => { paused = true; }, resume: () => { paused = false; }, onDone: () => newRun() });
    } else newRun();
  }

  // ---------- Effekte ----------
  function burst(x, y, col, n, sp = 220, size = 4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = sp * rand(0.2, 1);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: rand(0.35, 0.8), max: 0.8, col, s: size * rand(0.6, 1.4) });
    }
  }
  function addScore(v) { st.score += v; }
  const HPCOL = ['#38e1ff', '#4dff8a', '#ffe14d', '#ff9a3c', '#ff4dc4', '#b06cff'];
  const brickCol = (b) => b.type === 'bomb' ? '#ff3b3b' : b.type === 'gold' ? '#ffd23f' : b.type === 'steel' ? '#9aa3b5' : b.type === 'move' ? '#c47dff' : HPCOL[Math.min(HPCOL.length - 1, b.hp - 1)];

  function damageBrick(b, dmg, src) {
    if (b.dead) return;
    if (b.type === 'steel' && src !== 'fire' && src !== 'boom' && src !== 'laser') { b.flash = 0.1; b.wob = 0.2; audio.tone(1400, 0.05, 'square', 0.08); return; }
    b.hp -= dmg; b.flash = 0.12; b.wob = 0.25;
    if (b.hp > 0) { audio.tone(300 + Math.min(st.combo, 20) * 30, 0.05, 'square', 0.1); return; }
    killBrick(b, src);
  }

  function killBrick(b, src) {
    b.dead = true;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    st.combo++; st.comboT = 2;
    const mult = 1 + Math.min(st.combo, 30) * 0.1;
    const pts = Math.round((b.type === 'gold' ? 100 : 10 * b.max) * mult);
    addScore(pts);
    texts.push({ x: cx, y: cy, s: `+${pts}`, col: brickCol(b), t: 0.8, size: b.type === 'gold' ? 22 : 16 });
    burst(cx, cy, brickCol(b), b.type === 'gold' ? 26 : 14, 240, 4);
    const semitone = Math.min(st.combo, 24);
    audio.tone(440 * Math.pow(2, semitone / 12), 0.09, 'triangle', 0.17);
    st.shake = Math.max(st.shake, 0.12);
    if (b.type === 'gold') { audio.tone(1320, 0.15, 'sine', 0.15, 0, 0.05); }
    // Kapsel
    const luck = 0.12 * (1 + 0.25 * mlv('luck'));
    if (b.type === 'gold' || Math.random() < luck) dropCapsule(cx, cy);
    if (b.type === 'bomb') explode(cx, cy);
    // Kettenblitz
    const zc = Math.min(0.6, ulv('chain') * 0.2);
    if (zc > 0 && src !== 'zap' && Math.random() < zc) {
      const near = st.bricks.filter((o) => !o.dead && o.type !== 'steel').sort((p, q) => d2(p, cx, cy) - d2(q, cx, cy)).slice(0, 2);
      for (const o of near) {
        st.zaps.push({ x1: cx, y1: cy, x2: o.x + o.w / 2, y2: o.y + o.h / 2, t: 0.18 });
        damageBrick(o, 1 + ulv('power'), 'zap');
      }
      if (near.length) audio.tone(1800, 0.08, 'sawtooth', 0.08, 0.5);
    }
  }
  const d2 = (b, x, y) => { const dx = b.x + b.w / 2 - x, dy = b.y + b.h / 2 - y; return dx * dx + dy * dy; };

  function explode(x, y) {
    rings.push({ x, y, r: 10, max: 95, t: 0.35 });
    burst(x, y, '#ff8a3c', 30, 380, 5); burst(x, y, '#fff3a0', 12, 200, 3);
    st.shake = Math.max(st.shake, 0.55); st.hitstop = Math.max(st.hitstop, 0.05);
    audio.boom(0.45, 0.45, 500);
    const list = st.bricks.filter((o) => !o.dead && d2(o, x, y) < 95 * 95);
    // leicht verzögert, damit Ketten sichtbar laufen
    setTimeout(() => list.forEach((o) => damageBrick(o, 3, 'boom')), 70);
    if (st.boss && !st.boss.dead) {
      const b = st.boss, dx = clamp(x, b.x, b.x + b.w) - x, dy = clamp(y, b.y, b.y + b.h) - y;
      if (dx * dx + dy * dy < 95 * 95) hitBoss(4);
    }
  }

  const CAPS = {
    split: { col: '#7cf', ch: '×3' },
    grow: { col: '#8f8', ch: '↔' },
    slow: { col: '#fd6', ch: 'S' },
    laser: { col: '#f5f', ch: 'L' },
    life: { col: '#f6a', ch: '♥' },
  };
  function dropCapsule(x, y) {
    const r = Math.random();
    const type = r < 0.35 ? 'split' : r < 0.55 ? 'grow' : r < 0.72 ? 'slow' : r < 0.95 ? 'laser' : 'life';
    st.caps.push({ x, y, vy: 140, type, rot: 0 });
  }
  function catchCapsule(c) {
    const cfg = CAPS[c.type];
    burst(c.x, c.y, cfg.col, 16, 200, 3);
    audio.tone(880, 0.08, 'sine', 0.16); audio.tone(1320, 0.12, 'sine', 0.12, 0, 0.06);
    let label = '';
    if (c.type === 'split') {
      const add = [];
      for (const b of st.balls) {
        if (st.balls.length + add.length >= 14) break;
        const sp = Math.hypot(b.vx, b.vy), a = Math.atan2(b.vy, b.vx);
        for (const da of [-0.4, 0.4]) add.push(Object.assign(newBall(b.x, b.y, Math.cos(a + da) * sp, Math.sin(a + da) * sp), { fire: b.fire }));
      }
      st.balls.push(...add); label = 'SPLIT!';
    } else if (c.type === 'grow') { st.grow = 12; label = 'BIG PADDLE'; }
    else if (c.type === 'slow') { st.slow = 9; label = 'SLOW-MO'; }
    else if (c.type === 'laser') { st.tempLaser = 8; label = 'LASERS'; }
    else if (c.type === 'life') { st.lives = Math.min(9, st.lives + 1); label = '+1 LIFE'; }
    texts.push({ x: c.x, y: PY - 30, s: label, col: cfg.col, t: 1, size: 22 });
  }

  function hitBoss(dmg) {
    const b = st.boss; if (!b || b.dead) return;
    b.hp -= dmg; b.flash = 0.12;
    st.shake = Math.max(st.shake, 0.2);
    audio.tone(160, 0.12, 'square', 0.18, 0.6);
    burst(b.x + b.w / 2, b.y + b.h, '#ff4d6d', 8, 200, 4);
    addScore(15);
    if (b.hp <= 0) {
      b.dead = true;
      for (let i = 0; i < 6; i++) setTimeout(() => explode(b.x + rand(0, b.w), b.y + rand(0, b.h)), i * 110);
      addScore(500 * st.level / 5);
      st.hitstop = 0.15;
    }
  }

  // ---------- Kollision ----------
  function circleRect(b, r) {
    const cx = clamp(b.x, r.x, r.x + r.w), cy = clamp(b.y, r.y, r.y + r.h);
    const dx = b.x - cx, dy = b.y - cy, dd = dx * dx + dy * dy;
    if (dd > b.r * b.r) return null;
    if (dd > 1e-6) { const d = Math.sqrt(dd); return { nx: dx / d, ny: dy / d, pen: b.r - d }; }
    const l = b.x - r.x, rr = r.x + r.w - b.x, t = b.y - r.y, bt = r.y + r.h - b.y, m = Math.min(l, rr, t, bt);
    if (m === l) return { nx: -1, ny: 0, pen: l + b.r };
    if (m === rr) return { nx: 1, ny: 0, pen: rr + b.r };
    if (m === t) return { nx: 0, ny: -1, pen: t + b.r };
    return { nx: 0, ny: 1, pen: bt + b.r };
  }
  function reflect(b, n) {
    const dot = b.vx * n.nx + b.vy * n.ny;
    if (dot < 0) { b.vx -= 2 * dot * n.nx; b.vy -= 2 * dot * n.ny; }
    b.x += n.nx * n.pen; b.y += n.ny * n.pen;
  }
  function normalizeSpeed(b) {
    const sp = ballSpeed() * (1 + Math.min(0.25, st.combo * 0.01));
    let a = Math.atan2(b.vy, b.vx);
    // zu flache Winkel vermeiden
    const minV = 0.28;
    let vx = Math.cos(a), vy = Math.sin(a);
    if (Math.abs(vy) < minV) { vy = vy < 0 ? -minV : minV; vx = Math.sign(vx || 1) * Math.sqrt(1 - minV * minV); }
    b.vx = vx * sp; b.vy = vy * sp;
  }

  function stepBall(b, dt) {
    const steps = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 4));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      b.x += b.vx * h; b.y += b.vy * h;
      // Wände
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); wallHit(b); }
      if (b.x > LW - b.r) { b.x = LW - b.r; b.vx = -Math.abs(b.vx); wallHit(b); }
      if (b.y < 40 + b.r) { b.y = 40 + b.r; b.vy = Math.abs(b.vy); wallHit(b); }
      // Schild
      if (st.shield > 0 && b.vy > 0 && b.y > LH - 14 - b.r) {
        b.y = LH - 14 - b.r; b.vy = -Math.abs(b.vy); st.shield--;
        burst(b.x, LH - 14, '#4ef', 20, 260, 3); audio.tone(700, 0.2, 'sine', 0.2, 0.5); st.shake = 0.2;
        texts.push({ x: b.x, y: LH - 40, s: 'SHIELD!', col: '#4ef', t: 0.9, size: 20 });
      }
      // Schläger
      const pw = st.pw;
      if (b.vy > 0 && b.y + b.r >= PY - PH / 2 && b.y - b.r <= PY + PH / 2 && b.x >= st.px - pw / 2 - b.r && b.x <= st.px + pw / 2 + b.r) {
        const off = clamp((b.x - st.px) / (pw / 2), -1, 1);
        const a = -Math.PI / 2 + off * 1.1 + clamp(st.pvx / 4000, -0.15, 0.15);
        const sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.y = PY - PH / 2 - b.r;
        normalizeSpeed(b);
        st.psquash = 1; b.squash = 1;
        if (st.combo >= 5) texts.push({ x: st.px, y: PY - 34, s: `${st.combo} combo!`, col: '#fff', t: 0.8, size: 18 });
        st.combo = 0;
        audio.tone(220 + Math.abs(off) * 120, 0.07, 'sine', 0.22, 1.5);
        burst(b.x, PY - PH / 2, '#7df9ff', 6, 120, 2.5);
      }
      // Boss
      if (st.boss && !st.boss.dead) {
        const n = circleRect(b, st.boss);
        if (n) { reflect(b, n); normalizeSpeed(b); hitBoss(1 + ulv('power') + (b.fire > 0 ? 2 : 0)); b.squash = 1; }
      }
      // Ziegel: tiefste Durchdringung zuerst
      let best = null, bn = null;
      for (const r of st.bricks) {
        if (r.dead) continue;
        const n = circleRect(b, r);
        if (n && (!bn || n.pen > bn.pen)) { best = r; bn = n; }
      }
      if (best) {
        const dmg = 1 + ulv('power') + (b.fire > 0 ? 2 : 0);
        const wasHp = best.hp;
        if (b.fire <= 0 && ulv('fire') && Math.random() < ulv('fire') * 0.15) { b.fire = 1.6; audio.tone(180, 0.2, 'sawtooth', 0.12, 2); }
        damageBrick(best, dmg, b.fire > 0 ? 'fire' : 'ball');
        if (ulv('blast')) {
          const R = 40 + ulv('blast') * 18, cx = best.x + best.w / 2, cy = best.y + best.h / 2;
          rings.push({ x: cx, y: cy, r: 6, max: R, t: 0.2, col: '255,204,68' });
          for (const o of st.bricks) if (o !== best && !o.dead && d2(o, cx, cy) < R * R) damageBrick(o, 1, 'blast');
        }
        const pierce = b.fire > 0 && best.dead && wasHp <= dmg;
        if (!pierce) { reflect(b, bn); normalizeSpeed(b); }
        b.squash = 1;
      }
    }
  }
  function wallHit(b) { b.squash = 1; audio.tone(160, 0.03, 'sine', 0.08); }

  // ---------- Update ----------
  const STEP = 1 / 120;
  function update(dt) {
    st.t += dt;
    // Effekte laufen immer
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985; p.vy = p.vy * 0.985 + 300 * dt;
      if (p.t <= 0) parts.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) { const s = texts[i]; s.t -= dt; s.y -= 40 * dt; if (s.t <= 0) texts.splice(i, 1); }
    for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.t -= dt; r.r += (r.max - r.r) * Math.min(1, dt * 18); if (r.t <= 0) rings.splice(i, 1); }
    for (let i = st.zaps.length - 1; i >= 0; i--) { st.zaps[i].t -= dt; if (st.zaps[i].t <= 0) st.zaps.splice(i, 1); }
    for (const s of stars) { s.y += s.z * 14 * dt; if (s.y > LH) { s.y = 0; s.x = Math.random() * LW; } }
    st.shake = Math.max(0, st.shake - dt * 2);
    st.flash = Math.max(0, st.flash - dt);
    if (st.banner) { st.banner.t -= dt; if (st.banner.t <= 0) st.banner = null; }
    for (const b of st.bricks) { if (b.flash > 0) b.flash -= dt; if (b.wob > 0) b.wob -= dt; }
    st.bricks = st.bricks.filter((b) => !b.dead || false);

    const clicked = input.clicked; input.clicked = false;
    const pressed = input.pressed; input.pressed = new Set();

    if (st.mode === 'pick') {
      st.pickAnim = Math.min(1, st.pickAnim + dt * 4);
      if (st.pickAnim < 0.6) return; // versehentliche Klicks vermeiden
      let idx = -1;
      ['Digit1', 'Digit2', 'Digit3'].forEach((k, i) => { if (pressed.has(k) || pressed.has('Numpad' + (i + 1))) idx = i; });
      if (clicked) idx = hitButton('card');
      if (idx >= 0) choose(idx);
      return;
    }
    if (st.mode === 'over') {
      st.timer += dt;
      if (st.timer < 0.6) return;
      if (pressed.has('Enter') || pressed.has('Space')) { playAgain(); return; }
      if (clicked) {
        const m = hitButton('meta');
        if (m >= 0) {
          const mm = META[m];
          if (mlv(mm.id) < mm.max && save.shards >= metaCost(mm)) {
            save.shards -= metaCost(mm); save.meta[mm.id] = mlv(mm.id) + 1; persist();
            audio.tone(660, 0.1, 'square', 0.15); audio.tone(990, 0.2, 'square', 0.12, 0, 0.08);
          }
        } else if (hitButton('again') >= 0) playAgain();
      }
      return;
    }
    if (st.mode === 'ad') return;

    if (st.hitstop > 0) { st.hitstop -= dt; return; }

    // Schläger
    st.pw += (paddleW() - st.pw) * Math.min(1, dt * 10);
    const prev = st.px;
    if (st.stun > 0) st.stun -= dt;
    else {
      let kx = 0;
      if (input.keys.has('ArrowLeft') || input.keys.has('KeyA')) kx -= 1;
      if (input.keys.has('ArrowRight') || input.keys.has('KeyD')) kx += 1;
      if (kx) st.px += kx * 820 * dt;
      else if (input.usePointer) st.px += (input.x - st.px) * Math.min(1, dt * 22);
    }
    st.px = clamp(st.px, st.pw / 2, LW - st.pw / 2);
    const v = (st.px - prev) / dt;
    st.pvx += (v - st.pvx) * Math.min(1, dt * 12);
    st.ptilt += (clamp(st.pvx / 2500, -0.12, 0.12) - st.ptilt) * Math.min(1, dt * 10);
    st.psquash = Math.max(0, st.psquash - dt * 5);
    st.grow = Math.max(0, st.grow - dt); st.slow = Math.max(0, st.slow - dt); st.tempLaser = Math.max(0, st.tempLaser - dt);
    st.comboT -= dt;

    if (st.mode === 'dead') { st.timer -= dt; if (st.timer <= 0) serve(); return; }
    if (st.mode === 'clear') {
      st.timer -= dt;
      for (const b of st.balls) { b.x += b.vx * dt * 0.2; b.y += b.vy * dt * 0.2; }
      if (st.timer <= 0) openPick();
      return;
    }

    if (st.mode === 'serve') {
      const b = st.balls[0];
      b.x = st.px; b.y = PY - PH / 2 - b.r;
      st.serveT -= dt;
      if (clicked || pressed.has('Space') || pressed.has('ArrowUp') || pressed.has('KeyW') || st.serveT <= 0) launch();
      // Bewegliche Ziegel und Boss laufen schon
    }

    // bewegliche Ziegel
    for (const b of st.bricks) if (b.type === 'move') {
      b.x += b.vx * dt;
      if (b.x < 4) { b.x = 4; b.vx = Math.abs(b.vx); }
      if (b.x + b.w > LW - 4) { b.x = LW - 4 - b.w; b.vx = -Math.abs(b.vx); }
    }
    // Boss
    const boss = st.boss;
    if (boss && !boss.dead) {
      boss.phase += dt;
      boss.x = LW / 2 - boss.w / 2 + Math.sin(boss.phase * 0.7) * 300;
      boss.flash = Math.max(0, boss.flash - dt);
      if (st.mode === 'play') {
        boss.shootT -= dt;
        if (boss.shootT <= 0) {
          boss.shootT = Math.max(0.9, 2.2 - st.level * 0.05);
          const ang = Math.atan2(PY - (boss.y + boss.h), st.px - (boss.x + boss.w / 2));
          st.shots.push({ x: boss.x + boss.w / 2, y: boss.y + boss.h, vx: Math.cos(ang) * 210, vy: Math.sin(ang) * 210 });
          audio.tone(240, 0.15, 'sawtooth', 0.12, 0.5);
        }
      }
    }
    for (let i = st.shots.length - 1; i >= 0; i--) {
      const s = st.shots[i]; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.y > PY - 12 && s.y < PY + 12 && Math.abs(s.x - st.px) < st.pw / 2 + 8) {
        st.shots.splice(i, 1); st.stun = 0.8; st.shake = 0.4; burst(s.x, s.y, '#ff4d6d', 18, 260, 4);
        audio.tone(120, 0.3, 'square', 0.2, 0.5);
        texts.push({ x: st.px, y: PY - 30, s: 'STUNNED', col: '#ff4d6d', t: 0.8, size: 20 });
      } else if (s.y > LH + 20) st.shots.splice(i, 1);
    }

    if (st.mode !== 'play') return;

    // Bälle
    for (const b of st.balls) {
      b.fire = Math.max(0, b.fire - dt); b.squash = Math.max(0, b.squash - dt * 6);
      stepBall(b, dt);
      b.trail.push(b.x, b.y); if (b.trail.length > 24) b.trail.splice(0, 2);
      if (b.fire > 0 && Math.random() < 0.5) parts.push({ x: b.x, y: b.y, vx: rand(-30, 30), vy: rand(-60, 0), t: 0.3, max: 0.3, col: Math.random() < 0.5 ? '#ff8a3c' : '#ffe14d', s: 4 });
    }
    st.balls = st.balls.filter((b) => b.y < LH + 30);
    if (!st.balls.length) { loseBall(); return; }

    // Laser
    const lv = ulv('laser');
    const every = st.tempLaser > 0 ? Math.min(laserEvery(lv) || 99, 0.45) : laserEvery(lv);
    if (every) {
      st.laserT -= dt;
      if (st.laserT <= 0) {
        st.laserT = every;
        for (const sx of [-1, 1]) st.lasers.push({ x: st.px + sx * (st.pw / 2 - 8), y: PY - 12 });
        audio.tone(1500, 0.05, 'square', 0.06, 0.5);
      }
    }
    for (let i = st.lasers.length - 1; i >= 0; i--) {
      const l = st.lasers[i]; l.y -= 900 * dt;
      let hit = false;
      if (st.boss && !st.boss.dead && l.x > st.boss.x && l.x < st.boss.x + st.boss.w && l.y < st.boss.y + st.boss.h && l.y > st.boss.y) { hitBoss(1); hit = true; }
      if (!hit) for (const r of st.bricks) if (!r.dead && l.x > r.x && l.x < r.x + r.w && l.y < r.y + r.h && l.y > r.y) { damageBrick(r, 1, 'laser'); hit = true; break; }
      if (hit) burst(l.x, l.y, '#f5f', 5, 120, 2);
      if (hit || l.y < 40) st.lasers.splice(i, 1);
    }

    // Kapseln
    for (let i = st.caps.length - 1; i >= 0; i--) {
      const c = st.caps[i]; c.y += c.vy * dt; c.rot += dt * 3;
      if (c.y > PY - 16 && c.y < PY + 14 && Math.abs(c.x - st.px) < st.pw / 2 + 16) { catchCapsule(c); st.caps.splice(i, 1); }
      else if (c.y > LH + 20) st.caps.splice(i, 1);
    }

    // Level geschafft?
    const left = st.bricks.some((b) => !b.dead && b.type !== 'steel');
    if (!left && (!st.boss || st.boss.dead)) levelCleared();
  }

  // ---------- Render ----------
  const buttons = [];
  function hitButton(kind) {
    for (const b of buttons) if (b.kind === kind && input.x >= b.x && input.x <= b.x + b.w && input.y >= b.y && input.y <= b.y + b.h) return b.i;
    return -1;
  }
  function rr(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function text(s, x, y, size, col, align = 'center', weight = 800) {
    ctx.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = col; ctx.fillText(s, x, y);
  }
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (hex.length === 4) { r = parseInt(hex[1] + hex[1], 16); g = parseInt(hex[2] + hex[2], 16); b = parseInt(hex[3] + hex[3], 16); }
    const f = (c) => Math.round(clamp(k > 0 ? c + (255 - c) * k : c * (1 + k), 0, 255));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }

  function drawBrick(b) {
    const col = brickCol(b);
    const wob = b.wob > 0 ? Math.sin(b.wob * 60) * b.wob * 6 : 0;
    const x = b.x, y = b.y + wob * 0.3, w = b.w, h = b.h;
    ctx.fillStyle = shade(col, -0.45); rr(x, y + 2, w, h, 5); ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, shade(col, 0.25)); g.addColorStop(1, col);
    ctx.fillStyle = g; rr(x, y, w, h - 2, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; rr(x + 4, y + 3, w - 8, 4, 2); ctx.fill();
    if (b.type === 'bomb') {
      const p = 0.5 + 0.5 * Math.sin(st.t * 8 + b.x);
      ctx.fillStyle = `rgba(255,255,200,${0.4 + p * 0.5})`;
      ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, 5 + p * 2, 0, Math.PI * 2); ctx.fill();
      text('✹', x + w / 2, y + h / 2 + 1, 14, '#5a0000');
    } else if (b.type === 'gold') {
      const sx = ((st.t * 0.8 + b.x * 0.01) % 1.6) * (w + 40) - 20;
      ctx.save(); rr(x, y, w, h - 2, 5); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.moveTo(x + sx, y); ctx.lineTo(x + sx + 10, y); ctx.lineTo(x + sx - 4, y + h); ctx.lineTo(x + sx - 14, y + h); ctx.fill();
      ctx.restore();
      text('$', x + w / 2, y + h / 2 + 1, 13, '#7a5500');
    } else if (b.type === 'steel') {
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      for (const dx of [8, w - 8]) { ctx.beginPath(); ctx.arc(x + dx, y + h / 2, 2.5, 0, Math.PI * 2); ctx.fill(); }
    } else if (b.type === 'move') {
      text('⇄', x + w / 2, y + h / 2 + 1, 13, 'rgba(40,0,70,.7)');
    } else if (b.max > 1) {
      text(String(b.hp), x + w / 2, y + h / 2 + 1, 12, 'rgba(0,0,0,.45)', 'center', 900);
    }
    if (b.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${b.flash * 6})`; rr(x, y, w, h - 2, 5); ctx.fill(); }
    if (b.type !== 'steel' && b.hp < b.max && b.max > 1) {
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(x + w * 0.3, y + 2); ctx.lineTo(x + w * 0.38, y + h * 0.5); ctx.lineTo(x + w * 0.3, y + h - 3); ctx.stroke();
    }
  }

  function drawBoss(b) {
    const x = b.x, y = b.y;
    ctx.save();
    if (b.flash > 0) ctx.translate(rand(-3, 3), rand(-3, 3));
    ctx.fillStyle = '#3a0d1a'; rr(x - 4, y + 4, b.w + 8, b.h, 14); ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, y + b.h); g.addColorStop(0, '#ff6b8b'); g.addColorStop(1, '#b0183a');
    ctx.fillStyle = b.flash > 0 ? '#fff' : g; rr(x, y, b.w, b.h, 12); ctx.fill();
    // Augen folgen dem Schläger
    const look = clamp((st.px - (x + b.w / 2)) / 300, -1, 1) * 6;
    for (const ex of [0.3, 0.7]) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x + b.w * ex, y + 24, 16, 13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a0008'; ctx.beginPath(); ctx.arc(x + b.w * ex + look, y + 27, 7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#4a0012'; rr(x + b.w * 0.32, y + 44, b.w * 0.36, 8, 4); ctx.fill();
    ctx.restore();
    // HP-Leiste
    const k = Math.max(0, b.hp / b.max);
    ctx.fillStyle = 'rgba(0,0,0,.5)'; rr(LW / 2 - 200, 46, 400, 10, 5); ctx.fill();
    ctx.fillStyle = '#ff4d6d'; rr(LW / 2 - 200, 46, 400 * k, 10, 5); ctx.fill();
  }

  function drawBall(b) {
    // Schweif
    const tr = b.trail;
    for (let i = 0; i < tr.length; i += 2) {
      const k = i / tr.length;
      ctx.fillStyle = b.fire > 0 ? `rgba(255,140,60,${k * 0.45})` : `rgba(125,249,255,${k * 0.22})`;
      ctx.beginPath(); ctx.arc(tr[i], tr[i + 1], b.r * (0.2 + k * 0.45), 0, Math.PI * 2); ctx.fill();
    }
    const a = Math.atan2(b.vy, b.vx), sp = Math.hypot(b.vx, b.vy);
    const stretch = 1 + Math.min(0.25, sp / 3000) - b.squash * 0.25;
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a); ctx.scale(stretch, 1 / stretch);
    ctx.shadowColor = b.fire > 0 ? '#ff8a3c' : '#7df9ff'; ctx.shadowBlur = 16;
    ctx.fillStyle = b.fire > 0 ? '#ffd27a' : '#fff';
    ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawPaddle() {
    const pw = st.pw, sq = st.psquash;
    ctx.save();
    ctx.translate(st.px, PY); ctx.rotate(st.ptilt);
    ctx.scale(1 + sq * 0.12, 1 - sq * 0.3);
    const stun = st.stun > 0;
    ctx.shadowColor = stun ? '#ff4d6d' : '#7df9ff'; ctx.shadowBlur = 18;
    const g = ctx.createLinearGradient(0, -PH / 2, 0, PH / 2);
    g.addColorStop(0, stun ? '#ffb3c1' : '#bff9ff'); g.addColorStop(1, stun ? '#ff4d6d' : '#2bb6d6');
    ctx.fillStyle = g; rr(-pw / 2, -PH / 2, pw, PH, PH / 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.7)'; rr(-pw / 2 + 8, -PH / 2 + 3, pw - 16, 3, 2); ctx.fill();
    if (ulv('laser') || st.tempLaser > 0) {
      ctx.fillStyle = '#f5f';
      for (const sx of [-1, 1]) ctx.fillRect(sx * (pw / 2 - 8) - 3, -PH / 2 - 6, 6, 8);
    }
    ctx.restore();
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // Hintergrund über ganze Fläche
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    const hue = (st.level * 37) % 360;
    bg.addColorStop(0, `hsl(${hue},55%,10%)`); bg.addColorStop(1, '#05040f');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    buttons.length = 0;

    ctx.setTransform(DPR * S, 0, 0, DPR * S, DPR * OX, DPR * OY);
    ctx.save();
    if (st.shake > 0) ctx.translate(rand(-1, 1) * st.shake * 12, rand(-1, 1) * st.shake * 12);
    // Spielfeld
    ctx.fillStyle = 'rgba(255,255,255,.03)'; ctx.fillRect(0, 40, LW, LH - 40);
    for (const s of stars) { ctx.fillStyle = `rgba(200,220,255,${s.z * 0.5})`; ctx.fillRect(s.x, s.y, s.z * 2.2, s.z * 2.2); }
    ctx.strokeStyle = 'rgba(125,249,255,.08)'; ctx.lineWidth = 1;
    for (let x = 0; x <= LW; x += 60) { ctx.beginPath(); ctx.moveTo(x, 40); ctx.lineTo(x, LH); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(125,249,255,.35)'; ctx.lineWidth = 2; ctx.strokeRect(1, 40, LW - 2, LH - 41);

    for (const b of st.bricks) if (!b.dead) drawBrick(b);
    if (st.boss && !st.boss.dead) drawBoss(st.boss);
    // Schild
    if (st.shield > 0) {
      ctx.strokeStyle = `rgba(68,238,255,${0.5 + 0.3 * Math.sin(st.t * 5)})`; ctx.lineWidth = 3 + st.shield;
      ctx.beginPath(); ctx.moveTo(0, LH - 10); ctx.lineTo(LW, LH - 10); ctx.stroke();
    }
    for (const r of rings) {
      ctx.strokeStyle = `rgba(${r.col || '255,170,80'},${clamp(r.t * 3, 0, 1)})`; ctx.lineWidth = 6 * r.t * 3;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
    }
    for (const z of st.zaps) {
      ctx.strokeStyle = `rgba(255,255,120,${z.t * 5})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(z.x1, z.y1);
      for (let i = 1; i < 5; i++) ctx.lineTo(z.x1 + (z.x2 - z.x1) * i / 5 + rand(-8, 8), z.y1 + (z.y2 - z.y1) * i / 5 + rand(-8, 8));
      ctx.lineTo(z.x2, z.y2); ctx.stroke();
    }
    for (const c of st.caps) {
      const cfg = CAPS[c.type];
      ctx.save(); ctx.translate(c.x, c.y); ctx.scale(1, 0.85 + 0.15 * Math.cos(c.rot));
      ctx.shadowColor = cfg.col; ctx.shadowBlur = 12;
      ctx.fillStyle = cfg.col; rr(-18, -10, 36, 20, 10); ctx.fill(); ctx.shadowBlur = 0;
      text(cfg.ch, 0, 1, 13, '#111', 'center', 900); ctx.restore();
    }
    for (const l of st.lasers) { ctx.fillStyle = '#f9f'; ctx.fillRect(l.x - 2, l.y - 10, 4, 16); }
    for (const s of st.shots) {
      ctx.fillStyle = '#ff4d6d'; ctx.shadowColor = '#ff4d6d'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(s.x, s.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    }
    for (const p of parts) { ctx.globalAlpha = clamp(p.t / 0.4, 0, 1); ctx.fillStyle = p.col; ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
    ctx.globalAlpha = 1;
    if (st.mode !== 'over') drawPaddle();
    if (st.mode === 'play' || st.mode === 'serve' || st.mode === 'clear') for (const b of st.balls) drawBall(b);
    // Zielhilfe beim Aufschlag
    if (st.mode === 'serve') {
      const a = -Math.PI / 2 + clamp(st.pvx / 1500, -0.5, 0.5) + (ulv('multi') ? 0 : 0.25);
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([6, 8]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(st.px, PY - 18); ctx.lineTo(st.px + Math.cos(a) * 120, PY - 18 + Math.sin(a) * 120); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const s of texts) {
      ctx.globalAlpha = clamp(s.t * 2, 0, 1);
      ctx.font = `900 ${s.size}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(s.s, s.x, s.y);
      ctx.fillStyle = s.col; ctx.fillText(s.s, s.x, s.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    drawHUD();
    if (st.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${st.flash * 0.6})`; ctx.fillRect(0, 0, LW, LH); }
    if (st.mode === 'pick') drawPick();
    if (st.mode === 'over') drawOver();
  }

  function drawHUD() {
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, LW, 40);
    text(`LEVEL ${st.level}`, 16, 21, 20, '#7df9ff', 'left', 900);
    text(`${st.score}`, LW / 2, 21, 24, '#fff', 'center', 900);
    let hearts = '';
    for (let i = 0; i < Math.min(st.lives, 9); i++) hearts += '♥';
    text(hearts, LW - 64, 21, 22, '#ff6a8a', 'right', 900);
    // Mute-Knopf
    const mb = { kind: 'mute', i: 0, x: LW - 52, y: 4, w: 44, h: 32 };
    buttons.push(mb);
    ctx.fillStyle = 'rgba(255,255,255,.12)'; rr(mb.x, mb.y, mb.w, mb.h, 8); ctx.fill();
    text(audio.userMuted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2 + 1, 18, '#fff');
    // aktive Upgrades als Symbole
    let x = 150;
    for (const u of UPS) {
      const l = ulv(u.id); if (!l || u.id === 'life') continue;
      text(u.ic, x, 21, 16, '#fff'); text(String(l), x + 13, 28, 11, u.col, 'left', 900); x += 34;
    }
    if (st.combo >= 3 && st.mode === 'play') text(`COMBO x${(1 + Math.min(st.combo, 30) * 0.1).toFixed(1)}`, LW / 2 + 70, 21, 15, '#ffe66d', 'left', 900);
    const timers = [[st.grow, '↔', '#8f8'], [st.slow, 'S', '#fd6'], [st.tempLaser, 'L', '#f5f']];
    let tx = LW - 230;
    for (const [v, ch, col] of timers) if (v > 0) { text(`${ch} ${Math.ceil(v)}`, tx, 21, 14, col, 'left', 900); tx -= 46; }

    if (st.banner) {
      const b = st.banner, a = clamp(Math.min(b.t * 3, 1), 0, 1);
      ctx.globalAlpha = a;
      const sc = 1 + Math.max(0, b.t - (b.t > 1.2 ? 1.2 : b.t)) * 0.2;
      ctx.save(); ctx.translate(LW / 2, LH * (st.level === 1 && st.mode === 'serve' ? 0.5 : 0.66)); ctx.scale(sc, sc);
      ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,.6)';
      ctx.font = '900 54px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeText(b.a, 0, 0); ctx.fillStyle = b.col; ctx.fillText(b.a, 0, 0);
      if (b.b) { ctx.font = '800 22px system-ui, sans-serif'; ctx.lineWidth = 5; ctx.strokeText(b.b, 0, 44); ctx.fillStyle = '#fff'; ctx.fillText(b.b, 0, 44); }
      ctx.restore(); ctx.globalAlpha = 1;
    }
    if (st.mode === 'serve' && st.level === 1 && save.runs < 2) {
      const bob = Math.sin(st.t * 5) * 6;
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.6)';
      ctx.font = '900 26px system-ui, sans-serif'; ctx.textAlign = 'center';
      const msg = input.usePointer || 'ontouchstart' in window ? 'MOVE TO STEER · TAP TO LAUNCH' : '◀ ▶ TO STEER · SPACE TO LAUNCH';
      ctx.strokeText(msg, LW / 2, 418 + bob); ctx.fillStyle = '#fff'; ctx.fillText(msg, LW / 2, 418 + bob);
      text('Hit the red ✹ bricks for chain explosions!', LW / 2, 452, 18, '#ffb3a0', 'center', 700);
    }
    if (st.mode === 'dead') text('BALL LOST', LW / 2, LH * 0.6, 40, '#ff6a8a', 'center', 900);
  }

  function drawPick() {
    ctx.fillStyle = 'rgba(5,4,20,.78)'; ctx.fillRect(0, 0, LW, LH);
    const a = st.pickAnim;
    text(st.pickFree ? 'HEAD START: PICK AN UPGRADE' : `LEVEL ${st.level} CLEARED`, LW / 2, 80, 34, '#7dff9a', 'center', 900);
    text('Choose one upgrade (click or press 1 · 2 · 3)', LW / 2, 118, 18, '#cfd8ff', 'center', 600);
    const cw = 250, ch = 270, gap = 30, x0 = LW / 2 - (st.choices.length * cw + (st.choices.length - 1) * gap) / 2;
    st.choices.forEach((u, i) => {
      const x = x0 + i * (cw + gap), y = 150 + (1 - Math.min(1, a * (1 + i * 0.3))) * 80;
      const hover = input.x >= x && input.x <= x + cw && input.y >= y && input.y <= y + ch;
      buttons.push({ kind: 'card', i, x, y, w: cw, h: ch });
      ctx.fillStyle = hover ? '#2a2850' : '#1a1838'; rr(x, y, cw, ch, 18); ctx.fill();
      ctx.strokeStyle = u.col; ctx.lineWidth = hover ? 4 : 2; rr(x, y, cw, ch, 18); ctx.stroke();
      text(u.ic, x + cw / 2, y + 62, 54, '#fff');
      text(u.nm, x + cw / 2, y + 128, 26, u.col, 'center', 900);
      const l = ulv(u.id);
      text(u.id === 'life' ? `${st.lives} → ${st.lives + 1}` : `Lv ${l} → ${l + 1}`, x + cw / 2, y + 160, 17, '#aab', 'center', 700);
      wrap(u.ds(l), x + cw / 2, y + 196, cw - 30, 18, '#fff');
      text(String(i + 1), x + cw / 2, y + ch - 22, 16, 'rgba(255,255,255,.4)', 'center', 900);
    });
  }
  function wrap(s, x, y, maxW, size, col) {
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    const words = s.split(' '); let line = '', yy = y;
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { text(line, x, yy, size, col, 'center', 600); line = w; yy += size * 1.3; }
      else line = t;
    }
    if (line) text(line, x, yy, size, col, 'center', 600);
  }

  function drawOver() {
    ctx.fillStyle = 'rgba(5,4,20,.85)'; ctx.fillRect(0, 0, LW, LH);
    text(st.newBest ? 'NEW HIGH SCORE!' : 'GAME OVER', LW / 2, 70, 44, st.newBest ? '#7dff9a' : '#ff6a8a', 'center', 900);
    text(`Score ${st.score}  ·  Level ${st.level}  ·  Best ${save.bestScore}`, LW / 2, 115, 22, '#fff', 'center', 700);
    text(`+${st.shardsGain} 💎 shards${st.daily ? ' (daily x2)' : ''}   ·   You have ${save.shards} 💎`, LW / 2, 150, 20, '#9fd8ff', 'center', 700);
    text('PERMANENT UPGRADES', LW / 2, 192, 16, '#aab', 'center', 900);
    const bw = 205, bh = 120, gap = 16, x0 = LW / 2 - (4 * bw + 3 * gap) / 2;
    META.forEach((m, i) => {
      const x = x0 + i * (bw + gap), y = 210;
      const l = mlv(m.id), max = l >= m.max, c = metaCost(m), can = !max && save.shards >= c;
      buttons.push({ kind: 'meta', i, x, y, w: bw, h: bh });
      const hover = input.x >= x && input.x <= x + bw && input.y >= y && input.y <= y + bh;
      ctx.fillStyle = can && hover ? '#2d2b58' : '#1a1838'; rr(x, y, bw, bh, 14); ctx.fill();
      ctx.strokeStyle = can ? '#7df9ff' : 'rgba(255,255,255,.15)'; ctx.lineWidth = 2; rr(x, y, bw, bh, 14); ctx.stroke();
      text(`${m.ic} ${m.nm}`, x + bw / 2, y + 26, 18, '#fff', 'center', 800);
      text(m.ds, x + bw / 2, y + 54, 14, '#cfd8ff', 'center', 600);
      text(`Lv ${l}/${m.max}`, x + bw / 2, y + 78, 14, '#aab', 'center', 700);
      text(max ? 'MAX' : `${c} 💎`, x + bw / 2, y + 102, 18, max ? '#7dff9a' : can ? '#ffe66d' : '#776', 'center', 900);
    });
    const b = { kind: 'again', i: 0, x: LW / 2 - 150, y: 370, w: 300, h: 70 };
    buttons.push(b);
    const pulse = 1 + Math.sin(st.t * 5) * 0.03;
    ctx.save(); ctx.translate(LW / 2, b.y + b.h / 2); ctx.scale(pulse, pulse);
    const g = ctx.createLinearGradient(0, -35, 0, 35); g.addColorStop(0, '#9ffbff'); g.addColorStop(1, '#22a6c8');
    ctx.fillStyle = '#126'; rr(-150, -31, 300, 70, 18); ctx.fill();
    ctx.fillStyle = g; rr(-150, -35, 300, 70, 18); ctx.fill();
    text('PLAY AGAIN', 0, 1, 30, '#062033', 'center', 900);
    ctx.restore();
    text('Enter / Space', LW / 2, 462, 15, '#aab', 'center', 600);
  }

  // Mute per Klick im HUD
  canvas.addEventListener('pointerdown', () => {
    if (hitButton('mute') >= 0) {
      input.clicked = false;
      audio.userMuted = !audio.userMuted; CG.save('bl_mute', audio.userMuted); audio.apply();
    }
  });

  document.addEventListener('visibilitychange', () => { last = performance.now(); });
  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!paused) {
      acc += dt;
      while (acc >= STEP) { update(STEP); acc -= STEP; }
    }
    render();
    requestAnimationFrame(frame);
  }

  window.__bl = { st, save }; // nur für Tests

  (async () => {
    CG.loadingStart();
    await CG.init();
    audio.apply();
    CG.loadingStop();
    newRun();
    requestAnimationFrame(frame);
  })();
})();
