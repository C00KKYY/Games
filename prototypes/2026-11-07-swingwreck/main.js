// Swingwreck – Physik-Abriss mit Abrissbirne am Kran. Matter.js (MIT) aus vendor/.
// Logische Fläche 960×540, fester Zeitschritt 60 Hz, WebAudio, Speicherstand, CrazyGames-SDK über cg.js.
(() => {
  const { Engine, Bodies, Body, Composite, Constraint, Events, Sleeping } = Matter;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const LW = 960, LH = 540, GY = 490, RAIL = 46;
  let W = 0, H = 0, DPR = 1, S = 1, OX = 0, OY = 0;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    S = Math.min(W / LW, H / LH); OX = (W - LW * S) / 2; OY = (H - LH * S) / 2;
  }
  window.addEventListener('resize', resize); resize();
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);

  // ---------- Audio ----------
  let paused = false;
  const audio = {
    ctx: null, master: null, noise: null, userMuted: CG.load('sw_mute', false),
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate; this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.apply();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    off() { return !this.ctx || CG.muted || this.userMuted || paused; },
    apply() { if (this.master) this.master.gain.value = (CG.muted || this.userMuted) ? 0 : 0.45; },
    tone(f, dur = 0.1, type = 'sine', vol = 0.2, slide = 0, delay = 0) {
      if (this.off()) return;
      const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.03);
    },
    noiseHit(freq, dur, vol, type = 'bandpass', q = 1) {
      if (this.off()) return;
      const t = this.ctx.currentTime, s = this.ctx.createBufferSource(); s.buffer = this.noise;
      const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
      if (type === 'lowpass') f.frequency.exponentialRampToValueAtTime(50, t + dur);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
    },
  };
  CG.onMuteChange(() => audio.apply());
  ['pointerdown', 'touchend', 'keydown'].forEach((ev) => window.addEventListener(ev, () => audio.ensure(), { passive: true }));
  let sndBudget = 0; // begrenzt gleichzeitige Bruch-Sounds

  // ---------- Eingabe ----------
  const input = { x: 120, y: 260, active: false, touched: false, keys: new Set(), clicked: false };
  const toL = (e) => [(e.clientX - OX) / S, (e.clientY - OY) / S];
  canvas.addEventListener('pointerdown', (e) => { [input.x, input.y] = toL(e); input.active = true; input.touched = true; input.clicked = true; });
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' || e.buttons) { [input.x, input.y] = toL(e); input.active = true; input.touched = true; }
  });
  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    input.keys.add(e.code);
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(e.code)) { input.active = false; input.touched = true; }
    if ((e.code === 'Space' || e.code === 'Enter') && panelEl.classList.contains('show')) mainButton();
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => input.keys.clear());

  // ---------- Speicherstand & Upgrades ----------
  const save = Object.assign({ level: 1, cash: 0, up: {}, stars: {}, daily: '', plays: 0 }, CG.load('sw_save', {}));
  const persist = () => CG.save('sw_save', save);
  const lv = (id) => save.up[id] || 0;
  const UPS = [
    { id: 'heavy', ic: '🏋️', nm: 'Heavy Ball', ds: (l) => `+${l * 30}% smash power`, base: 30, max: 8 },
    { id: 'size', ic: '⚫', nm: 'Bigger Ball', ds: (l) => `radius ${ballR(l)}`, base: 40, max: 5 },
    { id: 'motor', ic: '⚙️', nm: 'Crane Motor', ds: (l) => `+${l * 18}% trolley speed`, base: 25, max: 6 },
    { id: 'chain', ic: '⛓️', nm: 'Long Chain', ds: (l) => `reach ${maxLen(l)} px`, base: 30, max: 4 },
    { id: 'time', ic: '⏱️', nm: 'Overtime', ds: (l) => `${levelTime(l)} s per level`, base: 35, max: 6 },
    { id: 'blast', ic: '💥', nm: 'Blast Core', ds: (l) => l ? `hard hits explode (r ${60 + l * 20})` : 'hard hits explode', base: 80, max: 4 },
    { id: 'salvage', ic: '💰', nm: 'Salvage', ds: (l) => `+${l * 20}% cash`, base: 45, max: 6 },
    { id: 'spikes', ic: '🔩', nm: 'Diamond Spikes', ds: (l) => l ? 'can crack steel' : 'lets you crack steel', base: 150, max: 1 },
  ];
  const ballR = (l) => 24 + l * 4;
  const maxLen = (l) => 360 + l * 25;
  const levelTime = (l) => 40 + l * 5;
  const cost = (u) => Math.round(u.base * Math.pow(1.6, lv(u.id)));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

  // ---------- Materialien ----------
  const MAT = {
    wood: { hp: 5, dens: 0.0012, val: 3, col: '#c98a4b', dark: '#8a5a2b', snd: 700 },
    glass: { hp: 1.4, dens: 0.0015, val: 4, col: 'rgba(150,220,255,.5)', dark: '#bfefff', snd: 3200 },
    concrete: { hp: 14, dens: 0.004, val: 8, col: '#a3a1a6', dark: '#6c6a70', snd: 220 },
    steel: { hp: 40, dens: 0.006, val: 12, col: '#6f8296', dark: '#3e4b59', snd: 1400 },
    barrel: { hp: 2.2, dens: 0.0012, val: 6, col: '#e2412f', dark: '#8a1d12', snd: 300 },
  };

  // ---------- Welt ----------
  let engine, world, ball, rope, recs = [], settling = false, toBreak = new Set();
  const st = {
    mode: 'play', t: 0, time: 35, started: false, anchorX: 120, len: 200, pct: 0, cash: 0, combo: 0, comboT: 0,
    shake: 0, flash: 0, hitstop: 0, slowmo: 0, banner: null, endT: 0, blastCD: 0, daily: false, demolished: 0,
    trail: [], hint: 0, timeBonus: 0, lastStarShown: 0,
  };
  const parts = [], texts = [], rings = [];

  function mkBlock(x, y, w, h, mat, opts = {}) {
    const m = MAT[mat];
    const body = Bodies.rectangle(x, y, w, h, {
      density: m.dens, friction: 0.8, frictionStatic: 1.2, restitution: mat === 'glass' ? 0.02 : 0.04,
      chamfer: { radius: mat === 'barrel' ? 6 : 1.5 }, label: 'block', sleepThreshold: 40, ...opts,
    });
    const rec = { body, mat, w, h, hp: (mat === 'steel' && lv('spikes')) ? 22 : m.hp, max: 0, area: w * h, x0: 0, y0: 0, counted: false, broken: false, flash: 0 };
    rec.max = rec.hp; body.plugin.rec = rec;
    recs.push(rec); Composite.add(world, body);
    return rec;
  }

  // Bausteine
  function tower(cx, floors, post = 'wood', slab = 'wood', width = 64) {
    let y = GY;
    for (let f = 0; f < floors; f++) {
      mkBlock(cx - width / 2 + 8, y - 28, 16, 56, post); mkBlock(cx + width / 2 - 8, y - 28, 16, 56, post);
      mkBlock(cx, y - 56 - 7, width + 28, 14, slab);
      y -= 70;
    }
    return y;
  }
  function pyramid(cx, rows, mat = 'wood', s = 34, y0 = GY) {
    for (let r = 0; r < rows; r++) for (let i = 0; i < rows - r; i++) mkBlock(cx + (i - (rows - r - 1) / 2) * (s + 1), y0 - s / 2 - r * s, s, s, mat);
  }
  function house(cx, floors, width = 120) {
    let y = GY;
    const panes = Math.max(1, Math.round((width - 32) / 44));
    for (let f = 0; f < floors; f++) {
      mkBlock(cx - width / 2 + 8, y - 30, 16, 60, 'wood'); mkBlock(cx + width / 2 - 8, y - 30, 16, 60, 'wood');
      const inner = width - 32, pw = inner / panes;
      for (let i = 0; i < panes; i++) mkBlock(cx - inner / 2 + pw * (i + 0.5), y - 30, pw - 2, 58, 'glass');
      mkBlock(cx, y - 60 - 7, width + 16, 14, 'wood');
      y -= 74;
    }
    for (let r = 0; r < 3; r++) mkBlock(cx, y - 7 - r * 14, width - 20 - r * 34, 14, 'wood'); // Dach
  }
  function sky(cx, floors, width = 110) {
    let y = GY;
    for (let f = 0; f < floors; f++) {
      mkBlock(cx - width / 2 + 9, y - 32, 18, 64, 'concrete'); mkBlock(cx + width / 2 - 9, y - 32, 18, 64, 'concrete');
      mkBlock(cx, y - 32, width - 40, 62, 'glass');
      mkBlock(cx, y - 64 - 8, width + 10, 16, f % 3 === 2 ? 'steel' : 'concrete');
      y -= 80;
    }
  }
  function barrels(cx, n, y0 = GY) { for (let i = 0; i < n; i++) mkBlock(cx + (i - (n - 1) / 2) * 30, y0 - 18, 26, 36, 'barrel'); }
  function wall(cx, rows, cols, mat = 'concrete', bw = 40, bh = 22) {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const off = r % 2 ? bw / 2 : 0;
      if (r % 2 && c === cols - 1) continue;
      mkBlock(cx + (c - (cols - 1) / 2) * bw + off, GY - bh / 2 - r * bh, bw - 1, bh, mat);
    }
  }
  function fortress(cx) {
    // zwei Stahltürme, darüber eine Betonbrücke, darunter Fässer
    const top = tower(cx - 58, 2, 'steel', 'concrete', 44);
    tower(cx + 58, 2, 'steel', 'concrete', 44);
    mkBlock(cx, top - 8, 190, 16, 'concrete');
    barrels(cx, 2);
  }

  const DESIGNS = {
    1: () => { tower(470, 3); barrels(600, 1); pyramid(740, 3, 'wood', 36); tower(860, 2); },
    2: () => { house(470, 2); barrels(590, 2); tower(700, 4); house(850, 1, 100); },
    3: () => { sky(480, 3); barrels(590, 2); sky(720, 4, 100); pyramid(860, 3, 'glass', 32); },
    4: () => { wall(500, 5, 4, 'concrete'); tower(650, 4, 'concrete', 'wood'); barrels(760, 3); house(870, 2, 100); },
    5: () => { fortress(560); sky(770, 4, 100); barrels(880, 2); },
  };
  function randomDesign(L) {
    const gens = [
      (x) => tower(x, 3 + Math.min(4, Math.floor(L / 3)), Math.random() < 0.4 ? 'concrete' : 'wood'),
      (x) => house(x, 1 + Math.min(3, Math.floor(L / 4)), 110),
      (x) => sky(x, 3 + Math.min(3, Math.floor(L / 4)), 104),
      (x) => { pyramid(x, 3 + Math.min(2, Math.floor(L / 5)), Math.random() < 0.5 ? 'concrete' : 'wood', 30); },
      (x) => wall(x, 4 + Math.min(3, Math.floor(L / 4)), 3, Math.random() < 0.3 ? 'steel' : 'concrete', 38),
      (x) => fortress(x),
    ];
    const n = L > 8 ? 4 : 3, xs = n === 4 ? [450, 590, 730, 870] : [480, 670, 850];
    xs.forEach((x, i) => { gens[Math.floor(Math.random() * gens.length)](x); if (i < n - 1 && Math.random() < 0.6) barrels(x + (xs[i + 1] - x) / 2, 1 + Math.floor(Math.random() * 2)); });
  }

  function buildLevel() {
    engine = Engine.create({ enableSleeping: true, positionIterations: 8, velocityIterations: 6 });
    engine.gravity.y = 1.3;
    world = engine.world; recs = []; toBreak = new Set();
    Composite.add(world, Bodies.rectangle(480, GY + 50, 4000, 100, { isStatic: true, label: 'ground', friction: 1 }));
    const L = save.level;
    (DESIGNS[L] || (() => randomDesign(L)))();
    // Ball + Seil
    const R = ballR(lv('size'));
    st.anchorX = 110; st.len = 210;
    ball = Bodies.circle(st.anchorX, RAIL + 12 + st.len, R, { density: 0.02 * (1 + 0.25 * lv('heavy')), frictionAir: 0.004, restitution: 0.15, friction: 0.3, label: 'ball' });
    rope = Constraint.create({ pointA: { x: st.anchorX, y: RAIL + 12 }, bodyB: ball, length: st.len, stiffness: 0.9, damping: 0.02 });
    Composite.add(world, [ball, rope]);
    Events.on(engine, 'collisionStart', onCollide);
    // Gebäude setzen lassen, dann Ausgangslage merken
    settling = true;
    for (let i = 0; i < 120; i++) Engine.update(engine, 1000 / 60);
    settling = false;
    for (const r of recs) { r.x0 = r.body.position.x; r.y0 = r.body.position.y; r.a0 = r.body.angle; }
  }

  function startLevel() {
    parts.length = 0; texts.length = 0; rings.length = 0;
    buildLevel();
    Object.assign(st, {
      mode: 'play', t: 0, time: levelTime(lv('time')), started: false, pct: 0, cash: 0, combo: 0, comboT: 0, shake: 0, flash: 0,
      hitstop: 0, slowmo: 0, endT: 0, blastCD: 0, demolished: 0, trail: [], timeBonus: 0, lastStarShown: 0,
    });
    st.daily = save.daily !== today();
    st.hint = save.plays < 2 ? 1 : 0;
    st.banner = { a: `LEVEL ${save.level}`, b: st.daily ? 'Daily bonus: cash x2' : (DESIGNS[save.level] ? '' : 'Random site'), col: '#ffcf5a', t: 1.8 };
    panelEl.classList.remove('show');
    CG.gameplayStart();
  }

  // ---------- Kollisionen & Schaden ----------
  function ballPower() { return 1.6 * (1 + 0.3 * lv('heavy')) * (ballR(lv('size')) / 24); }
  function onCollide(ev) {
    if (settling) return;
    for (const pr of ev.pairs) {
      const a = pr.bodyA.parent, b = pr.bodyB.parent, n = pr.collision.normal;
      const s = Math.abs((a.velocity.x - b.velocity.x) * n.x + (a.velocity.y - b.velocity.y) * n.y);
      if (a === ball || b === ball) ballImpact(s, pr, a === ball ? b : a);
      hitBody(a, b, s); hitBody(b, a, s);
    }
  }
  function hitBody(self, other, s) {
    const rec = self.plugin && self.plugin.rec; if (!rec || rec.broken) return;
    let dmg;
    if (other === ball) dmg = Math.max(0, s - 1.2) * ballPower();
    else if (other.label === 'ground') dmg = Math.max(0, s - 3.2) * 0.55;
    else dmg = Math.max(0, s - 2.4) * 0.38 * clamp(other.mass / self.mass, 0.3, 3);
    if (dmg <= 0) return;
    if (rec.mat === 'steel' && !lv('spikes') && other === ball) dmg *= 0.05;
    rec.hp -= dmg; rec.flash = 0.12;
    if (rec.hp <= 0) toBreak.add(rec);
  }
  function ballImpact(s, pr, other) {
    if (s < 1.5) return;
    const sp = (pr.collision.supports && pr.collision.supports[0]) || ball.position;
    const k = Math.min(1, s / 12);
    st.shake = Math.max(st.shake, k * 0.6);
    if (s > 7) st.hitstop = Math.max(st.hitstop, 0.05);
    const mat = other.plugin && other.plugin.rec ? other.plugin.rec.mat : 'ground';
    burst(sp.x, sp.y, mat === 'ground' ? '#8a7055' : '#fff3c4', 6 + Math.floor(k * 10), 160 + k * 200, 3);
    audio.noiseHit(160 + k * 120, 0.25, 0.25 + k * 0.35, 'lowpass');
    audio.tone(70 + k * 40, 0.2, 'sine', 0.3 * k + 0.1, 0.5);
    if (lv('blast') && s > 6.5 && st.blastCD <= 0) {
      st.blastCD = 1.2;
      explode(sp.x, sp.y, 60 + lv('blast') * 20, 0.6, false);
    }
  }
  function breakBlock(rec) {
    if (rec.broken) return;
    rec.broken = true;
    Composite.remove(world, rec.body);
    const p = rec.body.position, m = MAT[rec.mat];
    // Splitter
    const n = Math.min(14, 5 + Math.floor(rec.area / 250));
    for (let i = 0; i < n; i++) {
      parts.push({ frag: true, x: p.x + rand(-rec.w / 3, rec.w / 3), y: p.y + rand(-rec.h / 3, rec.h / 3), vx: rand(-200, 200) + rec.body.velocity.x * 30, vy: rand(-280, -40) + rec.body.velocity.y * 30,
        rot: rand(0, 6), vr: rand(-14, 14), w: rand(4, 10), h: rand(3, 7), t: rand(0.6, 1.1), col: rec.mat === 'glass' ? '#d6f6ff' : m.col, glass: rec.mat === 'glass' });
    }
    if (rec.mat === 'concrete') for (let i = 0; i < 6; i++) parts.push({ dust: true, x: p.x + rand(-15, 15), y: p.y + rand(-10, 10), vx: rand(-40, 40), vy: rand(-50, -10), t: rand(0.6, 1.1), r: rand(8, 18) });
    if (sndBudget < 6) {
      sndBudget++;
      if (rec.mat === 'glass') { audio.noiseHit(4200, 0.25, 0.2, 'highpass'); audio.tone(2400 + rand(0, 1200), 0.18, 'sine', 0.07); }
      else if (rec.mat === 'concrete') audio.noiseHit(240, 0.4, 0.35, 'lowpass');
      else if (rec.mat === 'steel') { audio.tone(900, 0.3, 'triangle', 0.12, 0.7); audio.noiseHit(1800, 0.15, 0.15); }
      else audio.noiseHit(m.snd, 0.18, 0.28, 'bandpass', 1.5);
    }
    if (rec.mat === 'barrel') explode(p.x, p.y, 150, 1, true);
  }
  function explode(x, y, r, power, big) {
    rings.push({ x, y, r: 6, max: r, t: 0.35, col: big ? '255,170,60' : '255,230,140' });
    burst(x, y, '#ff9a2e', big ? 34 : 16, big ? 420 : 260, 5); burst(x, y, '#fff2a8', big ? 14 : 6, 220, 3);
    if (big) for (let i = 0; i < 8; i++) parts.push({ dust: true, x: x + rand(-20, 20), y: y + rand(-20, 20), vx: rand(-60, 60), vy: rand(-90, -20), t: rand(0.8, 1.4), r: rand(14, 26), dark: true });
    st.shake = Math.max(st.shake, big ? 0.9 : 0.4); st.flash = Math.max(st.flash, big ? 0.35 : 0.15); st.hitstop = Math.max(st.hitstop, big ? 0.08 : 0.03);
    if (big) st.slowmo = Math.max(st.slowmo, 0.35);
    audio.noiseHit(500, big ? 0.8 : 0.35, big ? 0.6 : 0.3, 'lowpass'); audio.tone(60, big ? 0.6 : 0.3, 'sawtooth', big ? 0.25 : 0.12, 0.4);
    for (const body of Composite.allBodies(world)) {
      if (body.isStatic) continue;
      const dx = body.position.x - x, dy = body.position.y - y, d = Math.hypot(dx, dy) || 1;
      if (d > r) continue;
      const k = 1 - d / r;
      Sleeping.set(body, false);
      const imp = (body === ball ? 3 : 14) * power * k / Math.sqrt(Math.max(1, body.mass / 1.5));
      Body.setVelocity(body, { x: body.velocity.x + (dx / d) * imp, y: body.velocity.y + (dy / d) * imp - 2 * k * power });
      Body.setAngularVelocity(body, body.angularVelocity + rand(-0.2, 0.2) * k);
      const rec = body.plugin.rec;
      if (rec && !rec.broken) { rec.hp -= 6 * power * k * (rec.mat === 'steel' && !lv('spikes') ? 0.2 : 1); rec.flash = 0.12; if (rec.hp <= 0) toBreak.add(rec); }
    }
  }

  // ---------- Effekte ----------
  function burst(x, y, col, n, sp = 200, size = 4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = sp * rand(0.2, 1);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: rand(0.3, 0.7), col, s: size * rand(0.6, 1.4) });
    }
  }

  // ---------- Fortschritt ----------
  function countDemolished() {
    let total = 0, done = 0;
    for (const r of recs) {
      total += r.area;
      if (!r.counted) {
        const b = r.body, p = b.position;
        const off = p.x < -80 || p.x > LW + 80 || p.y > LH + 100;
        if (off && !r.broken) { r.broken = true; Composite.remove(world, b); }
        if (r.broken || Math.hypot(p.x - r.x0, p.y - r.y0) > 30 || Math.abs(b.angle - r.a0) > 0.5) {
          r.counted = true; st.demolished++;
          const mult = (1 + 0.2 * lv('salvage')) * (st.daily ? 2 : 1);
          const v = Math.round(MAT[r.mat].val * mult);
          st.cash += v;
          st.combo = st.comboT > 0 ? st.combo + 1 : 1; st.comboT = 1.0;
          texts.push({ x: clamp(p.x, 20, LW - 20), y: clamp(p.y - 10, 70, GY - 10), s: `+$${v}`, col: '#ffe066', t: 0.9, size: 15 });
          if (st.combo >= 5 && st.combo % 5 === 0) {
            texts.push({ x: clamp(p.x, 80, LW - 80), y: clamp(p.y - 40, 90, 400), s: `CRASH x${st.combo}!`, col: '#ff8a3c', t: 1.1, size: 30 });
            audio.tone(440 * Math.pow(2, Math.min(st.combo, 30) / 24), 0.15, 'square', 0.12);
          }
        }
      }
      if (r.counted) done += r.area;
    }
    st.pct = total ? done / total : 0;
  }
  const starsFor = (p) => (p >= 0.95 ? 3 : p >= 0.8 ? 2 : p >= 0.6 ? 1 : 0);

  function endLevel(reason) {
    if (st.mode !== 'play') return;
    st.mode = 'ending'; st.endT = 1.4; st.endReason = reason;
    if (reason === 'clear') {
      st.timeBonus = Math.round(st.time * 2 * (st.daily ? 2 : 1));
      st.banner = { a: 'TOTAL DEMOLITION!', b: `+$${st.timeBonus} time bonus`, col: '#7dff9a', t: 1.6 };
      [523, 659, 784, 1046].forEach((f, i) => audio.tone(f, 0.2, 'triangle', 0.18, 0, i * 0.08));
    } else {
      st.banner = { a: "TIME'S UP!", b: '', col: '#ffcf5a', t: 1.6 };
      audio.tone(880, 0.15, 'square', 0.15); audio.tone(660, 0.3, 'square', 0.15, 0, 0.15);
    }
  }

  function showPanel() {
    st.mode = 'panel';
    CG.gameplayStop();
    const stars = starsFor(st.pct), L = save.level;
    const earned = st.cash + st.timeBonus;
    save.cash += earned; save.plays++;
    if (st.daily) save.daily = today();
    const prev = save.stars[L] || 0;
    if (stars > prev) save.stars[L] = stars;
    if (stars >= 3 && prev < 3) CG.happytime();
    st.passed = stars >= 1;
    persist();
    document.getElementById('ptitle').textContent = st.passed ? `Level ${L} demolished!` : 'Not enough rubble…';
    document.getElementById('pstars').innerHTML = [1, 2, 3].map((i) => `<span class="${i <= stars ? '' : 'off'}">⭐</span>`).join('');
    document.getElementById('pstats').innerHTML =
      `Demolished: <b>${Math.round(st.pct * 100)}%</b> (${st.demolished} parts)<br>` +
      `Cash: <b>$${st.cash}</b>${st.timeBonus ? ` + <b>$${st.timeBonus}</b> time bonus` : ''}${st.daily ? ' <span class="good">x2 daily</span>' : ''}<br>` +
      `Wallet: <b id="wallet">$${save.cash}</b><br>` +
      (st.passed ? '<span class="good">60% = 1⭐ · 80% = 2⭐ · 95% = 3⭐</span>' : '<span class="bad">Need 60% to advance. Upgrade and retry!</span>');
    nextBtn.style.display = st.passed ? '' : 'none';
    retryBtn.textContent = st.passed ? `↻ Replay for ${stars < 3 ? 'more stars' : 'cash'}` : '↻ RETRY';
    retryBtn.className = st.passed ? 'btn alt' : 'btn';
    renderShop();
    panelEl.classList.add('show');
  }
  const panelEl = document.getElementById('panel');
  const upsEl = document.getElementById('pups');
  const nextBtn = document.getElementById('pnext');
  const retryBtn = document.getElementById('pretry');
  let transitions = 0;
  function go(next) {
    if (st.mode !== 'panel') return;
    if (next) { save.level++; persist(); }
    transitions++;
    if (transitions % 3 === 0) {
      st.mode = 'ad';
      CG.requestAd('midgame', { pause: () => { paused = true; }, resume: () => { paused = false; }, onDone: () => startLevel() });
    } else startLevel();
  }
  function mainButton() { go(st.passed); }
  nextBtn.addEventListener('click', () => go(true));
  retryBtn.addEventListener('click', () => go(false));
  function renderShop() {
    upsEl.innerHTML = '';
    for (const u of UPS) {
      const l = lv(u.id), isMax = l >= u.max, c = cost(u);
      const b = document.createElement('button');
      b.className = 'up' + (isMax ? ' max' : ''); b.disabled = isMax || save.cash < c;
      b.innerHTML = `<span class="ic">${u.ic}</span><span class="tx"><div class="nm">${u.nm} <small>Lv ${l}</small></div>` +
        `<div class="ds">${isMax ? u.ds(l) : u.ds(l + 1)}</div></span><span class="cost">${isMax ? 'MAX' : '$' + c}</span>`;
      b.addEventListener('click', () => {
        if (save.cash < c || isMax) return;
        save.cash -= c; save.up[u.id] = l + 1; persist();
        audio.tone(520, 0.08, 'square', 0.16); audio.tone(780, 0.14, 'square', 0.14, 0, 0.06);
        renderShop(); const w = document.getElementById('wallet'); if (w) w.textContent = '$' + save.cash;
      });
      upsEl.appendChild(b);
    }
  }

  // ---------- Update ----------
  const STEP = 1 / 60;
  function update(dt) {
    st.t += dt;
    sndBudget = Math.max(0, sndBudget - dt * 30);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.dust) { p.vx *= 0.96; p.vy *= 0.96; p.r += dt * 14; }
      else { p.vy += (p.frag ? 900 : 500) * dt; if (p.frag) { p.rot += p.vr * dt; if (p.y > GY - 2) { p.y = GY - 2; p.vy *= -0.3; p.vx *= 0.6; p.vr *= 0.6; } } }
      if (p.t <= 0) parts.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) { const s = texts[i]; s.t -= dt; s.y -= 36 * dt; if (s.t <= 0) texts.splice(i, 1); }
    for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.t -= dt; r.r += (r.max - r.r) * Math.min(1, dt * 16); if (r.t <= 0) rings.splice(i, 1); }
    st.shake = Math.max(0, st.shake - dt * 2.2); st.flash = Math.max(0, st.flash - dt);
    if (st.banner) { st.banner.t -= dt; if (st.banner.t <= 0) st.banner = null; }
    for (const r of recs) if (r.flash > 0) r.flash -= dt;
    if (st.mode === 'panel' || st.mode === 'ad') return;
    if (st.hitstop > 0) { st.hitstop -= dt; return; }

    // Kran steuern
    const motor = 430 * (1 + 0.18 * lv('motor'));
    let tx = st.anchorX, tl = st.len;
    if (input.active) { tx = input.x; tl = input.y - RAIL - 12; }
    else {
      if (input.keys.has('ArrowLeft') || input.keys.has('KeyA')) tx = st.anchorX - 200;
      if (input.keys.has('ArrowRight') || input.keys.has('KeyD')) tx = st.anchorX + 200;
      if (input.keys.has('ArrowUp') || input.keys.has('KeyW')) tl = st.len - 100;
      if (input.keys.has('ArrowDown') || input.keys.has('KeyS')) tl = st.len + 100;
    }
    tx = clamp(tx, 30, LW - 30);
    tl = clamp(tl, 90, Math.min(maxLen(lv('chain')), GY - RAIL - 12 - ball.circleRadius + 6));
    const dx = tx - st.anchorX;
    st.anchorX += clamp(dx * 8 * dt, -motor * dt, motor * dt);
    st.len += clamp(tl - st.len, -220 * dt, 220 * dt);
    rope.pointA.x = st.anchorX; rope.pointA.y = RAIL + 12; rope.length = st.len;
    if (st.mode === 'play' && !st.started && input.touched) st.started = true;

    Engine.update(engine, 1000 / 60);
    // Geschwindigkeit deckeln (gegen Durchtunneln)
    const v = ball.velocity, sp = Math.hypot(v.x, v.y);
    if (sp > 28) Body.setVelocity(ball, { x: v.x / sp * 28, y: v.y / sp * 28 });
    if (toBreak.size) { const list = [...toBreak]; toBreak.clear(); list.forEach(breakBlock); }
    st.trail.push(ball.position.x, ball.position.y); if (st.trail.length > 16) st.trail.splice(0, 2);
    st.blastCD -= dt; st.comboT -= dt;

    // Bis zur ersten Eingabe dürfen sich Gebäude noch setzen, ohne zu zählen
    if (!st.started) for (const r of recs) if (!r.broken) { r.x0 = r.body.position.x; r.y0 = r.body.position.y; r.a0 = r.body.angle; }
    countDemolished();
    const stars = starsFor(st.pct);
    if (stars > st.lastStarShown && st.mode === 'play') {
      st.lastStarShown = stars;
      texts.push({ x: LW / 2, y: 120, s: '⭐'.repeat(stars), col: '#ffe066', t: 1.2, size: 34 });
      audio.tone(880, 0.12, 'triangle', 0.18); audio.tone(1320, 0.2, 'triangle', 0.15, 0, 0.08);
    }

    if (st.mode === 'play') {
      if (st.started) st.time -= dt;
      if (st.hint > 0 && st.started) st.hint = Math.max(0, st.hint - dt * 0.25);
      if (st.pct >= 0.999) endLevel('clear');
      else if (st.time <= 0) { st.time = 0; endLevel('time'); }
    } else if (st.mode === 'ending') {
      st.endT -= dt;
      if (st.endT <= 0) showPanel();
    }
  }

  // ---------- Render ----------
  const skyline = Array.from({ length: 26 }, (_, i) => ({ x: i * 40 - 10, w: 30 + Math.random() * 28, h: 60 + Math.random() * 140 }));
  function rr(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function text(s, x, y, size, col, align = 'center', weight = 800) {
    ctx.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = col; ctx.fillText(s, x, y);
  }
  function outlined(s, x, y, size, col, lw = 5) {
    ctx.font = `900 ${size}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = lw; ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y);
  }

  function drawBlock(r) {
    const b = r.body, w = r.w, h = r.h, m = MAT[r.mat];
    ctx.save(); ctx.translate(b.position.x, b.position.y); ctx.rotate(b.angle);
    const x = -w / 2, y = -h / 2;
    if (r.mat === 'glass') {
      ctx.fillStyle = 'rgba(140,215,255,.38)'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(220,250,255,.85)'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.moveTo(x + w * 0.2, y + 3); ctx.lineTo(x + w * 0.45, y + 3); ctx.lineTo(x + w * 0.15, y + h - 3); ctx.lineTo(x + 3, y + h - 3); ctx.closePath(); ctx.fill();
    } else if (r.mat === 'barrel') {
      ctx.fillStyle = m.dark; rr(x, y, w, h, 6); ctx.fill();
      ctx.fillStyle = m.col; rr(x + 2, y + 1, w - 4, h - 3, 5); ctx.fill();
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(x + 2, y + h * 0.28, w - 4, 4); ctx.fillRect(x + 2, y + h * 0.62, w - 4, 4);
      const p = 0.5 + 0.5 * Math.sin(st.t * 6 + b.id);
      ctx.fillStyle = `rgba(255,240,160,${0.3 + p * 0.5})`; ctx.beginPath(); ctx.arc(0, -1, 4, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = m.dark; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = m.col; ctx.fillRect(x + 1.5, y + 1.5, w - 3, h - 3);
      if (r.mat === 'wood') {
        ctx.strokeStyle = 'rgba(110,60,20,.45)'; ctx.lineWidth = 1;
        const along = w > h;
        for (let i = 1; i < 3; i++) { ctx.beginPath(); if (along) { ctx.moveTo(x + 3, y + h * i / 3); ctx.lineTo(x + w - 3, y + h * i / 3 + 1); } else { ctx.moveTo(x + w * i / 3, y + 3); ctx.lineTo(x + w * i / 3 + 1, y + h - 3); } ctx.stroke(); }
      } else if (r.mat === 'concrete') {
        ctx.fillStyle = 'rgba(0,0,0,.15)';
        for (let i = 0; i < 4; i++) ctx.fillRect(x + ((i * 37 + b.id * 13) % Math.max(4, w - 4)), y + ((i * 23 + b.id * 7) % Math.max(4, h - 4)), 2.5, 2.5);
        ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x + 1.5, y + 1.5, w - 3, 2);
      } else if (r.mat === 'steel') {
        ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(x + 1.5, y + 1.5, w - 3, 2.5);
        ctx.fillStyle = '#2b3540';
        for (const [px, py] of [[x + 4, y + 4], [x + w - 4, y + 4], [x + 4, y + h - 4], [x + w - 4, y + h - 4]]) { ctx.beginPath(); ctx.arc(px, py, 1.6, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    // Risse
    if (r.hp < r.max && r.mat !== 'glass') {
      const k = 1 - r.hp / r.max;
      ctx.strokeStyle = `rgba(0,0,0,${0.3 + k * 0.5})`; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(x + w * 0.5, y + h * 0.5); ctx.lineTo(x + w * (0.5 - 0.4 * k), y + h * (0.5 - 0.45 * k));
      ctx.moveTo(x + w * 0.5, y + h * 0.5); ctx.lineTo(x + w * (0.5 + 0.35 * k), y + h * (0.5 + 0.4 * k));
      ctx.stroke();
    }
    if (r.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${r.flash * 5})`; ctx.fillRect(x, y, w, h); }
    ctx.restore();
  }

  function drawCrane() {
    // Schiene
    ctx.fillStyle = '#e8a31c'; ctx.fillRect(0, RAIL - 10, LW, 10);
    ctx.fillStyle = '#9a6a0c'; ctx.fillRect(0, RAIL, LW, 3);
    ctx.strokeStyle = 'rgba(80,50,0,.6)'; ctx.lineWidth = 1.5;
    for (let x = 0; x < LW; x += 24) { ctx.beginPath(); ctx.moveTo(x, RAIL - 10); ctx.lineTo(x + 12, RAIL); ctx.lineTo(x + 24, RAIL - 10); ctx.stroke(); }
    // Laufkatze
    const ax = st.anchorX, tilt = clamp((ball.position.x - ax) / 300, -0.3, 0.3);
    ctx.save(); ctx.translate(ax, RAIL);
    ctx.fillStyle = '#333'; for (const wx of [-14, 14]) { ctx.beginPath(); ctx.arc(wx, -10, 5, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#ffcf3a'; rr(-24, -4, 48, 18, 4); ctx.fill();
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(-24, 6, 48, 3);
    ctx.fillStyle = Math.sin(st.t * 6) > 0 ? '#ff4040' : '#702020'; ctx.beginPath(); ctx.arc(18, 2, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // Kette
    const x1 = ax, y1 = RAIL + 12, x2 = ball.position.x, y2 = ball.position.y;
    const len = Math.hypot(x2 - x1, y2 - y1), n = Math.max(4, Math.floor(len / 11)), ang = Math.atan2(y2 - y1, x2 - x1);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, cx = x1 + (x2 - x1) * t, cy = y1 + (y2 - y1) * t;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
      ctx.strokeStyle = i % 2 ? '#8b939c' : '#5f666e'; ctx.lineWidth = 2.6;
      ctx.beginPath(); if (i % 2) ctx.ellipse(0, 0, 6.5, 2.2, 0, 0, Math.PI * 2); else ctx.ellipse(0, 0, 6.5, 3.6, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    void tilt;
  }
  function drawBall() {
    const R = ball.circleRadius, p = ball.position;
    const tr = st.trail, sp = Math.hypot(ball.velocity.x, ball.velocity.y);
    if (sp > 6) for (let i = 0; i < tr.length - 2; i += 2) {
      const k = i / tr.length;
      ctx.fillStyle = `rgba(255,255,255,${k * 0.12 * Math.min(1, (sp - 6) / 10)})`;
      ctx.beginPath(); ctx.arc(tr[i], tr[i + 1], R * (0.6 + k * 0.4), 0, Math.PI * 2); ctx.fill();
    }
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ball.angle);
    const g = ctx.createRadialGradient(-R * 0.35, -R * 0.35, R * 0.1, 0, 0, R);
    g.addColorStop(0, '#9aa3ad'); g.addColorStop(0.5, '#3f464e'); g.addColorStop(1, '#16191d');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    if (lv('spikes')) {
      ctx.fillStyle = '#bfefff';
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(Math.cos(a - 0.15) * R, Math.sin(a - 0.15) * R); ctx.lineTo(Math.cos(a) * (R + 7), Math.sin(a) * (R + 7)); ctx.lineTo(Math.cos(a + 0.15) * R, Math.sin(a + 0.15) * R); ctx.fill(); }
    }
    ctx.fillStyle = '#2b3036'; ctx.fillRect(-5, -R - 6, 10, 9);
    if (lv('blast')) { ctx.fillStyle = st.blastCD > 0 ? 'rgba(255,120,40,.35)' : `rgba(255,140,40,${0.6 + 0.3 * Math.sin(st.t * 10)})`; ctx.beginPath(); ctx.arc(0, 0, R * 0.32, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#3b2a5c'); bg.addColorStop(0.55, '#e0785a'); bg.addColorStop(1, '#f7c06a');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(DPR * S, 0, 0, DPR * S, DPR * OX, DPR * OY);
    ctx.save();
    if (st.shake > 0) ctx.translate(rand(-1, 1) * st.shake * 10, rand(-1, 1) * st.shake * 10);
    // Sonne und Skyline
    ctx.fillStyle = 'rgba(255,230,160,.85)'; ctx.beginPath(); ctx.arc(780, 300, 70, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(70,40,80,.55)';
    for (const b of skyline) ctx.fillRect(b.x, GY - b.h, b.w, b.h);
    ctx.fillStyle = 'rgba(255,220,140,.35)';
    for (const b of skyline) for (let y = GY - b.h + 10; y < GY - 10; y += 18) for (let x = b.x + 5; x < b.x + b.w - 6; x += 10) if ((x * 7 + y * 3) % 5 === 0) ctx.fillRect(x, y, 4, 6);
    // Boden
    ctx.fillStyle = '#4a3b33'; ctx.fillRect(-200, GY, LW + 400, LH - GY + 200);
    ctx.fillStyle = '#6b5446'; ctx.fillRect(-200, GY, LW + 400, 6);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; for (let x = 0; x < LW; x += 36) ctx.fillRect(x, GY + 14 + (x % 3) * 6, 18, 3);
    // Bauzaun links
    ctx.fillStyle = '#ffcf3a'; for (let x = 0; x < 240; x += 40) { ctx.fillRect(x + 4, GY - 26, 6, 26); }
    ctx.fillStyle = 'rgba(255,207,58,.8)'; ctx.fillRect(0, GY - 22, 240, 4); ctx.fillRect(0, GY - 10, 240, 4);

    for (const r of recs) if (!r.broken) drawBlock(r);
    for (const p of parts) {
      if (p.dust) { ctx.globalAlpha = clamp(p.t, 0, 0.6); ctx.fillStyle = p.dark ? '#3a3036' : '#c9c3bd'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); continue; }
      ctx.globalAlpha = clamp(p.t / 0.3, 0, 1); ctx.fillStyle = p.col;
      if (p.frag) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        if (p.glass) { ctx.beginPath(); ctx.moveTo(-p.w / 2, p.h / 2); ctx.lineTo(0, -p.h / 2); ctx.lineTo(p.w / 2, p.h / 2); ctx.closePath(); ctx.fill(); }
        else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      } else ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    ctx.globalAlpha = 1;
    for (const r of rings) {
      ctx.strokeStyle = `rgba(${r.col},${clamp(r.t * 3, 0, 1)})`; ctx.lineWidth = 10 * r.t * 3;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
    }
    drawCrane(); drawBall();
    for (const s of texts) { ctx.globalAlpha = clamp(s.t * 2, 0, 1); outlined(s.s, s.x, s.y, s.size, s.col, 4); }
    ctx.globalAlpha = 1;
    ctx.restore();
    if (st.flash > 0) { ctx.fillStyle = `rgba(255,240,210,${st.flash * 0.7})`; ctx.fillRect(0, 0, LW, LH); }
    drawHUD();
  }

  function drawHUD() {
    ctx.fillStyle = 'rgba(20,10,30,.55)'; ctx.fillRect(0, 0, LW, RAIL - 10);
    text(`LEVEL ${save.level}`, 14, 18, 18, '#ffcf5a', 'left', 900);
    // Fortschrittsbalken mit Sternmarken
    const bx = 150, bw = 430, by = 10, bh = 16;
    ctx.fillStyle = 'rgba(0,0,0,.45)'; rr(bx, by, bw, bh, 8); ctx.fill();
    const k = clamp(st.pct, 0, 1);
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0); g.addColorStop(0, '#ff9a3c'); g.addColorStop(1, '#ffe066');
    ctx.fillStyle = g; if (k > 0) { rr(bx, by, Math.max(bh, bw * k), bh, 8); ctx.fill(); }
    for (const [t, n] of [[0.6, 1], [0.8, 2], [0.95, 3]]) {
      const x = bx + bw * t; ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(x - 1, by - 2, 2, bh + 4);
      text('⭐'.repeat(n), x, by + bh / 2 + 1, 10, '#fff');
    }
    text(`${Math.round(k * 100)}%`, bx + bw + 10, 18, 16, '#fff', 'left', 900);
    const low = st.time < 8 && st.mode === 'play';
    text(`⏱ ${Math.ceil(st.time)}`, 700, 18, 18, low ? (Math.floor(st.t * 4) % 2 ? '#ff6a5a' : '#fff') : '#fff', 'left', 900);
    text(`$${save.cash + st.cash}`, LW - 14, 18, 18, '#ffe066', 'right', 900);

    if (st.banner) {
      const b = st.banner, a = clamp(Math.min(b.t * 3, 1), 0, 1);
      ctx.globalAlpha = a; outlined(b.a, LW / 2, 200, 46, b.col, 8);
      if (b.b) outlined(b.b, LW / 2, 242, 20, '#fff', 5);
      ctx.globalAlpha = 1;
    }
    if (st.mode === 'play' && !st.started) {
      const bob = Math.sin(st.t * 5) * 8;
      const touch = 'ontouchstart' in window;
      outlined(touch ? 'DRAG TO SWING THE WRECKING BALL' : 'MOVE THE MOUSE TO SWING (or ◀ ▶ ▲ ▼)', LW / 2, 300 + bob, 24, '#fff', 6);
      outlined('Swing back and forth to build up speed!', LW / 2, 334, 17, '#ffe0a0', 5);
      outlined('Timer starts when you move', LW / 2, 360, 14, 'rgba(255,255,255,.75)', 4);
    } else if (st.hint > 0 && st.mode === 'play') {
      ctx.globalAlpha = Math.min(1, st.hint * 2);
      outlined('Barrels explode · Glass shatters · Toppled parts count too', LW / 2, 520, 16, '#ffe0a0', 4);
      ctx.globalAlpha = 1;
    }
    // Mute
    const mx = LW - 44, my = RAIL + 8;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(mx, my, 36, 28, 8); ctx.fill();
    text(audio.userMuted ? '🔇' : '🔊', mx + 18, my + 15, 15, '#fff');
  }
  canvas.addEventListener('pointerdown', (e) => {
    const [x, y] = toL(e);
    if (x >= LW - 44 && x <= LW - 8 && y >= RAIL + 8 && y <= RAIL + 36) {
      audio.userMuted = !audio.userMuted; CG.save('sw_mute', audio.userMuted); audio.apply();
    }
  });

  document.addEventListener('visibilitychange', () => { last = performance.now(); });
  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!paused) {
      let sc = 1;
      if (st.slowmo > 0) { st.slowmo -= dt; sc = 0.35; }
      acc += dt * sc;
      let n = 0;
      while (acc >= STEP && n < 4) { update(STEP); acc -= STEP; n++; }
      if (n >= 4) acc = 0;
    }
    if (engine) render();
    requestAnimationFrame(frame);
  }

  window.__sw = { st, save, get recs() { return recs; }, get ball() { return ball; } }; // nur für Tests

  (async () => {
    CG.loadingStart();
    await CG.init();
    audio.apply();
    CG.loadingStop();
    startLevel();
    requestAnimationFrame(frame);
  })();
})();
