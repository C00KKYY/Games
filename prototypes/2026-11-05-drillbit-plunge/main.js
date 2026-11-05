// Drillbit Plunge – Arcade-Bohrer mit Upgrade-Loop.
// Fester Zeitschritt, Canvas-Grafik, WebAudio-Sound, Speicherstand, CrazyGames-SDK über cg.js.
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  const COLS = 9;
  let T = 48, OX = 0; // Tilegröße und linker Rand des Schachts in px

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    T = Math.floor(Math.min(H / 8.6, (W * 0.98) / COLS));
    OX = Math.round((W - COLS * T) / 2);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- Audio ----------
  const audio = {
    ctx: null, master: null, noise: null, userMuted: CG.load('dp_mute', false),
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 0.5;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.apply();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    off() { return !this.ctx || CG.muted || this.userMuted || paused; },
    apply() { if (this.master) this.master.gain.value = (CG.muted || this.userMuted) ? 0 : 0.45; },
    tone(freq, dur = 0.08, type = 'square', vol = 0.2, slide = 0) {
      if (this.off()) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
    },
    hiss(dur = 0.1, vol = 0.2, freq = 1200, q = 1) {
      if (this.off()) return;
      const t = this.ctx.currentTime;
      const s = this.ctx.createBufferSource(); s.buffer = this.noise;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.02);
    },
  };
  CG.onMuteChange(() => audio.apply());
  ['pointerdown', 'touchend', 'keydown'].forEach((ev) =>
    window.addEventListener(ev, () => audio.ensure(), { passive: true }));
  const muteBtn = document.getElementById('mute');
  const syncMute = () => { muteBtn.textContent = audio.userMuted ? '🔇' : '🔊'; };
  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation(); audio.userMuted = !audio.userMuted; CG.save('dp_mute', audio.userMuted); audio.apply(); syncMute();
  });
  muteBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  syncMute();

  // ---------- Eingabe ----------
  const input = { px: 0, down: false, keys: new Set() };
  canvas.addEventListener('pointerdown', (e) => { input.px = e.clientX; input.down = true; });
  window.addEventListener('pointermove', (e) => { input.px = e.clientX; });
  window.addEventListener('pointerup', () => { input.down = false; });
  window.addEventListener('pointercancel', () => { input.down = false; });
  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    input.keys.add(e.code);
    if ((e.code === 'Space' || e.code === 'Enter') && state.mode === 'shop') goBtn.click();
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => { input.keys.clear(); input.down = false; });

  // ---------- Speicherstand & Upgrades ----------
  const save = Object.assign({ coins: 0, best: 0, runs: 0, lv: {}, daily: '' }, CG.load('dp_save', {}));
  const UPS = [
    { id: 'tank', ic: '⛽', nm: 'Fuel Tank', ds: (l) => `${fuelMax(l)} fuel`, base: 20, max: 12 },
    { id: 'power', ic: '⚙️', nm: 'Drill Power', ds: (l) => `${Math.round(power(l) * 25)}% speed`, base: 25, max: 12 },
    { id: 'hull', ic: '🛡️', nm: 'Hull Plating', ds: (l) => `${hullMax(l)} hits`, base: 40, max: 6 },
    { id: 'magnet', ic: '🧲', nm: 'Gem Magnet', ds: (l) => l ? `${magnet(l).toFixed(1)} tile reach` : 'grab gems nearby', base: 60, max: 6 },
    { id: 'engine', ic: '🏎️', nm: 'Steering', ds: (l) => `${steer(l).toFixed(1)} tiles/s`, base: 15, max: 8 },
    { id: 'eco', ic: '🍃', nm: 'Efficiency', ds: (l) => `-${Math.round((1 - drain(l) / 4) * 100)}% burn`, base: 35, max: 8 },
  ];
  const lv = (id) => save.lv[id] || 0;
  const fuelMax = (l) => 120 + l * 30;
  const power = (l) => 4 * Math.pow(1.32, l);
  const hullMax = (l) => 3 + l;
  const magnet = (l) => (l ? 0.9 + l * 0.45 : 0);
  const steer = (l) => 4.5 + l * 0.6;
  const drain = (l) => 4 * Math.pow(0.92, l);
  const cost = (u) => Math.round(u.base * Math.pow(1.65, lv(u.id)));
  const persist = () => CG.save('dp_save', save);

  // ---------- Welt ----------
  // Tiletypen
  const E = 0, DIRT = 1, STONE = 2, HARD = 3, GEM = 4, BOMB = 5, FUEL = 6;
  const GEMS = [
    { nm: 'Copper', v: 2, c: '#e8894a', d: 0 },
    { nm: 'Silver', v: 5, c: '#d7e3ee', d: 30 },
    { nm: 'Gold', v: 12, c: '#ffd23f', d: 75 },
    { nm: 'Ruby', v: 30, c: '#ff3b5c', d: 150 },
    { nm: 'Emerald', v: 70, c: '#38f28a', d: 250 },
    { nm: 'Diamond', v: 160, c: '#8ff3ff', d: 380 },
  ];
  const BIOMES = [
    { nm: 'Topsoil', a: '#8a5a34', b: '#6d4426', bg: '#2a1a10' },
    { nm: 'Clay Beds', a: '#a8613b', b: '#80462a', bg: '#2d170e' },
    { nm: 'Granite', a: '#7d7f88', b: '#5d5f69', bg: '#1b1c22' },
    { nm: 'Basalt', a: '#4d4a5a', b: '#383545', bg: '#131119' },
    { nm: 'Crystal Caves', a: '#4c5a8c', b: '#36406b', bg: '#0f1226' },
    { nm: 'Magma Deep', a: '#7a3a2a', b: '#5a2618', bg: '#1e0b06' },
    { nm: 'The Core', a: '#8a6a1a', b: '#6a4e10', bg: '#1d1404' },
  ];
  const BIOME_LEN = 60;
  const biomeAt = (r) => BIOMES[Math.min(BIOMES.length - 1, Math.floor(Math.max(0, r) / BIOME_LEN))];

  let rows = [];
  let rng = Math.random;
  function genRow(r) {
    const row = new Array(COLS);
    const d = r;
    const pStone = Math.min(0.45, 0.06 + d / 260);
    const pHard = d < 15 ? 0 : Math.min(0.22, (d - 15) / 450);
    const pGem = 0.075 + Math.min(0.04, d / 4000);
    const pBomb = d < 8 ? 0 : Math.min(0.045, 0.012 + d / 5000);
    const pFuel = d < 10 ? 0 : 0.011;
    const pCave = d < 12 ? 0 : 0.05;
    const hpMul = 1 + d / 140;
    for (let c = 0; c < COLS; c++) {
      let t = DIRT;
      const x = rng();
      if (r < 1) t = DIRT;
      else if (x < pCave) t = E;
      else if (x < pCave + pGem) t = GEM;
      else if (x < pCave + pGem + pBomb) t = BOMB;
      else if (x < pCave + pGem + pBomb + pFuel) t = FUEL;
      else if (x < pCave + pGem + pBomb + pFuel + pHard) t = HARD;
      else if (x < pCave + pGem + pBomb + pFuel + pHard + pStone) t = STONE;
      const hp = { [E]: 0, [DIRT]: 1, [STONE]: 3, [HARD]: 9, [GEM]: 1.6, [BOMB]: 0.5, [FUEL]: 1 }[t] * hpMul;
      const tile = { t, hp, max: hp, hit: 0 };
      if (t === GEM) {
        const avail = GEMS.filter((g) => g.d <= d);
        // meist die höchste verfügbare Stufe, manchmal eine darunter
        let gi = avail.length - 1;
        if (gi > 0 && rng() < 0.45) gi--;
        if (gi > 0 && rng() < 0.25) gi--;
        tile.g = gi;
      }
      row[c] = tile;
    }
    // Höhlen etwas zusammenhängender machen
    if (r > 12 && rng() < 0.08) {
      const c0 = Math.floor(rng() * (COLS - 3));
      for (let c = c0; c < c0 + 2 + Math.floor(rng() * 3) && c < COLS; c++) row[c] = { t: E, hp: 0, max: 0, hit: 0 };
    }
    return row;
  }
  function tileAt(c, r) {
    if (r < 0 || c < 0 || c >= COLS) return null;
    while (rows.length <= r) rows.push(genRow(rows.length));
    return rows[r][c];
  }

  // ---------- Spielzustand ----------
  const state = {
    mode: 'play', t: 0, x: COLS / 2, y: -0.6, fuel: 100, fuelMax: 100, hull: 3, hullMax: 3,
    coins: 0, gems: 0, depth: 0, inv: 0, combo: 0, comboT: 0, camY: -3, shake: 0, flash: 0,
    dying: 0, reason: '', banner: null, digging: false, digTick: 0, spin: 0, lastBiome: 0,
    daily: false, hint: 0, recordShown: false, sputter: 0, lean: 0,
  };
  let paused = false;
  const parts = [];
  const texts = [];
  const flyers = [];

  function today() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }

  function startRun() {
    rows = [];
    Object.assign(state, {
      mode: 'play', t: 0, x: COLS / 2, y: -0.6, fuelMax: fuelMax(lv('tank')), hullMax: hullMax(lv('hull')),
      coins: 0, gems: 0, depth: 0, inv: 0, combo: 0, comboT: 0, camY: -3, shake: 0, flash: 0, dying: 0,
      reason: '', banner: null, digging: false, digTick: 0, lastBiome: 0, recordShown: false, sputter: 0, lean: 0,
    });
    state.fuel = state.fuelMax; state.hull = state.hullMax;
    state.daily = save.daily !== today();
    state.hint = save.runs < 2 ? 5 : 0;
    parts.length = 0; texts.length = 0; flyers.length = 0;
    // Startbereich: mittig oben nur Erde
    for (let r = 0; r < 3; r++) for (let c = 0; c < COLS; c++) { const t = tileAt(c, r); if (t.t !== GEM) Object.assign(t, { t: DIRT, hp: 1, max: 1 }); }
    if (state.daily) banner('DAILY BONUS', 'Coins x2 this run', '#7dff9a');
    shopEl.classList.remove('show');
    CG.gameplayStart();
    audio.tone(220, 0.25, 'sawtooth', 0.15, 2.5);
  }

  function banner(a, b, col) { state.banner = { a, b, col, t: 2.4 }; }
  function addText(x, y, s, col, size = 1) { texts.push({ x, y, s, col, t: 1.1, size }); }
  function burst(x, y, col, n, spd = 4, size = 0.12) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = spd * (0.3 + Math.random());
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, t: 0.5 + Math.random() * 0.5, col, s: size * (0.6 + Math.random()) });
    }
  }
  const mult = () => (state.daily ? 2 : 1);

  function collectGem(tile, c, r, viaMagnet) {
    state.combo = state.comboT > 0 ? state.combo + 1 : 1;
    state.comboT = 1.6;
    const g = GEMS[tile.g];
    const bonus = 1 + Math.min(1, (state.combo - 1) * 0.1);
    const v = Math.round(g.v * bonus * mult());
    state.coins += v; state.gems++;
    flyers.push({ x: c + 0.5, y: r + 0.5, col: g.c, t: 0, v });
    addText(c + 0.5, r + 0.2, `+${v}`, g.c, state.combo > 2 ? 1.25 : 1);
    if (state.combo > 2) addText(c + 0.5, r - 0.3, `COMBO x${state.combo}`, '#fff', 0.8);
    burst(c + 0.5, r + 0.5, g.c, viaMagnet ? 6 : 12, 5, 0.1);
    const step = Math.min(state.combo - 1, 12);
    audio.tone(660 * Math.pow(2, step / 12), 0.12, 'triangle', 0.22);
    audio.tone(990 * Math.pow(2, step / 12), 0.1, 'sine', 0.12);
  }

  function breakTile(tile, c, r, viaMagnet = false) {
    const b = biomeAt(r);
    const t = tile.t;
    tile.t = E; tile.hp = 0;
    if (t === GEM) { collectGem(tile, c, r, viaMagnet); return; }
    if (t === FUEL) {
      const add = Math.round(state.fuelMax * 0.3);
      state.fuel = Math.min(state.fuelMax, state.fuel + add);
      addText(c + 0.5, r + 0.3, `+FUEL`, '#6dff7a', 1.1);
      burst(c + 0.5, r + 0.5, '#6dff7a', 14, 5);
      audio.tone(330, 0.18, 'sine', 0.25, 2);
      return;
    }
    const col = t === STONE ? '#9a9aa4' : t === HARD ? '#c9c2d8' : b.a;
    burst(c + 0.5, r + 0.5, col, t === HARD ? 16 : 7, t === HARD ? 5 : 3.5);
    if (t === HARD) { state.shake = Math.max(state.shake, 0.25); audio.tone(110, 0.2, 'square', 0.18, 0.5); audio.hiss(0.15, 0.3, 600); }
    else if (t === STONE) { state.shake = Math.max(state.shake, 0.08); audio.hiss(0.08, 0.22, 900); }
    else audio.hiss(0.05, 0.12, 500);
  }

  function explode(c, r) {
    const tile = tileAt(c, r);
    tile.t = E;
    state.shake = 0.6; state.flash = 0.35;
    burst(c + 0.5, r + 0.5, '#ff9a2e', 30, 8, 0.16);
    burst(c + 0.5, r + 0.5, '#444', 16, 5, 0.2);
    audio.hiss(0.5, 0.5, 300, 0.5); audio.tone(80, 0.45, 'sawtooth', 0.3, 0.4);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const t2 = tileAt(c + dc, r + dr);
      if (t2 && t2.t !== E) {
        if (t2.t === BOMB) { setTimeout(() => { if (state.mode === 'play' && t2.t === BOMB) explode(c + dc, r + dr); }, 120); }
        else breakTile(t2, c + dc, r + dr, true);
      }
    }
    const dx = state.x - (c + 0.5), dy = state.y - (r + 0.5);
    if (dx * dx + dy * dy < 2.6 && state.inv <= 0) hurt();
  }

  function hurt() {
    state.hull--; state.inv = 1.0;
    addText(state.x, state.y - 0.6, 'HULL -1', '#ff5a5a', 1.2);
    if (state.hull <= 0) endRun('Hull destroyed!');
  }

  const HS = 0.38;
  function blockers(nx, ny) {
    const out = [];
    const c0 = Math.floor(nx - HS), c1 = Math.floor(nx + HS - 1e-6);
    const r0 = Math.floor(ny - HS), r1 = Math.floor(ny + HS - 1e-6);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const t = tileAt(c, r);
      if (t && t.t !== E) out.push([t, c, r]);
    }
    return out;
  }
  function dig(list, amount) {
    for (const [t, c, r] of list) {
      if (t.t === E) continue;
      if (t.t === BOMB) { explode(c, r); continue; }
      t.hp -= amount; t.hit = 0.08;
      if (t.hp <= 0) breakTile(t, c, r);
    }
  }

  function endRun(reason) {
    if (state.mode !== 'play') return;
    state.mode = 'dead'; state.reason = reason; state.dying = 1.3;
    state.shake = Math.max(state.shake, 0.4);
    audio.tone(300, 0.9, 'sawtooth', 0.2, 0.25);
    CG.gameplayStop();
  }

  function finishRun() {
    state.mode = 'shop';
    const depthBonus = Math.floor(state.depth * 0.5) * mult();
    const total = state.coins + depthBonus;
    const newBest = state.depth > save.best;
    const prevBest = save.best;
    save.coins += total; save.runs++;
    if (newBest) save.best = state.depth;
    if (state.daily) save.daily = today();
    persist();
    if (newBest && prevBest > 0) CG.happytime();
    document.getElementById('title').textContent = newBest ? 'New record!' : 'Run over';
    document.getElementById('reason').textContent = state.reason;
    document.getElementById('stats').innerHTML =
      `Depth: <b>${state.depth} m</b>${newBest ? ' <span class="newbest">BEST!</span>' : ` (best ${save.best} m)`}<br>` +
      `Gems: <b>${state.gems}</b> → <b>${state.coins}</b> 🪙<br>` +
      `Depth bonus: <b>${depthBonus}</b> 🪙${state.daily ? ' <span class="newbest">x2</span>' : ''}<br>` +
      `Wallet: <b id="wallet">${save.coins}</b> 🪙`;
    renderShop();
    shopEl.classList.add('show');
  }

  // ---------- Shop ----------
  const shopEl = document.getElementById('shop');
  const upsEl = document.getElementById('ups');
  const goBtn = document.getElementById('go');
  let adCounter = 0;
  function renderShop() {
    upsEl.innerHTML = '';
    for (const u of UPS) {
      const l = lv(u.id), isMax = l >= u.max, c = cost(u);
      const b = document.createElement('button');
      b.className = 'up' + (isMax ? ' max' : '');
      b.disabled = isMax || save.coins < c;
      b.innerHTML = `<span class="ic">${u.ic}</span><span class="tx"><div class="nm">${u.nm} <small>Lv ${l}</small></div>` +
        `<div class="ds">${u.ds(l)}${isMax ? '' : ' → ' + u.ds(l + 1)}</div></span><span class="cost">${isMax ? 'MAX' : c + ' 🪙'}</span>`;
      b.addEventListener('click', () => {
        if (save.coins < c || isMax) return;
        save.coins -= c; save.lv[u.id] = l + 1; persist();
        audio.tone(520, 0.08, 'square', 0.18); audio.tone(780, 0.14, 'square', 0.16);
        renderShop();
        const w = document.getElementById('wallet'); if (w) w.textContent = save.coins;
      });
      upsEl.appendChild(b);
    }
  }
  goBtn.addEventListener('click', () => {
    if (state.mode !== 'shop') return;
    adCounter++;
    // Midgame-Werbung nur zwischen Runden, jede dritte Runde
    if (adCounter % 3 === 0) {
      CG.requestAd('midgame', {
        pause: () => { paused = true; },
        resume: () => { paused = false; },
        onDone: () => startRun(),
      });
    } else startRun();
  });

  // ---------- Update ----------
  const STEP = 1 / 120;
  function update(dt) {
    state.t += dt;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.t -= dt; p.vy += 14 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.t <= 0) parts.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) { const s = texts[i]; s.t -= dt; s.y -= 1.2 * dt; if (s.t <= 0) texts.splice(i, 1); }
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i]; f.t += dt * 2.2;
      f.x += (state.x - f.x) * Math.min(1, f.t * 0.5); f.y += (state.y - f.y) * Math.min(1, f.t * 0.5);
      if (f.t >= 1) flyers.splice(i, 1);
    }
    state.shake = Math.max(0, state.shake - dt * 1.6);
    state.flash = Math.max(0, state.flash - dt);
    if (state.banner) { state.banner.t -= dt; if (state.banner.t <= 0) state.banner = null; }

    if (state.mode === 'dead') {
      state.dying -= dt;
      if (state.dying <= 0) finishRun();
      return;
    }
    if (state.mode !== 'play') return;

    state.hint = Math.max(0, state.hint - dt);
    state.inv = Math.max(0, state.inv - dt);
    state.comboT -= dt; if (state.comboT <= 0) state.combo = 0;

    // Steuerung
    let h = 0;
    if (input.keys.has('ArrowLeft') || input.keys.has('KeyA')) h -= 1;
    if (input.keys.has('ArrowRight') || input.keys.has('KeyD')) h += 1;
    if (input.down) {
      const tx = (input.px - OX) / T;
      h = Math.max(-1, Math.min(1, (tx - state.x) * 3));
      if (Math.abs(tx - state.x) < 0.06) h = 0;
    }
    state.lean += (h - state.lean) * Math.min(1, dt * 10);
    const outOfFuel = state.fuel <= 0;
    const pw = power(lv('power')) * (outOfFuel ? 0.25 : 1);
    const vx = h * steer(lv('engine'));
    const vy = outOfFuel ? 1.2 : 3.4;

    // horizontal
    if (vx !== 0) {
      let nx = Math.max(HS, Math.min(COLS - HS, state.x + vx * dt));
      const b = blockers(nx, state.y);
      if (b.length) dig(b, pw * 0.85 * dt);
      else state.x = nx;
    }
    // vertikal
    const ny = state.y + vy * dt;
    const bv = blockers(state.x, ny);
    state.digging = bv.length > 0;
    if (bv.length) dig(bv, pw * dt);
    else state.y = ny;
    if (state.mode !== 'play') return;

    // Magnet
    const mr = magnet(lv('magnet'));
    if (mr > 0) {
      const rr = Math.ceil(mr);
      const cc = Math.floor(state.x), cr = Math.floor(state.y);
      for (let r = cr - rr; r <= cr + rr; r++) for (let c = cc - rr; c <= cc + rr; c++) {
        const t = tileAt(c, r);
        if (t && t.t === GEM) {
          const dx = c + 0.5 - state.x, dy = r + 0.5 - state.y;
          if (dx * dx + dy * dy <= mr * mr) breakTile(t, c, r, true);
        }
      }
    }

    // Treibstoff
    state.fuel -= drain(lv('eco')) * (state.digging ? 1.15 : 0.8) * dt;
    if (state.fuel <= 0) {
      state.fuel = 0;
      state.sputter += dt;
      if (state.sputter > 2.2) endRun('Out of fuel!');
    } else state.sputter = 0;

    // Funken- und Sound-Takt beim Bohren
    state.spin += dt * (state.digging ? 30 : 12);
    if (state.digging) {
      state.digTick -= dt;
      if (state.digTick <= 0) {
        state.digTick = 0.07;
        const b = biomeAt(Math.floor(state.y + 0.5));
        parts.push({ x: state.x + (Math.random() - 0.5) * 0.6, y: state.y + HS, vx: (Math.random() - 0.5) * 5, vy: -2 - Math.random() * 3, t: 0.35, col: Math.random() < 0.3 ? '#ffd76a' : b.a, s: 0.08 });
        audio.hiss(0.05, 0.06, 200 + Math.random() * 200, 2);
      }
    }

    // Tiefe, Biome, Rekord
    state.depth = Math.max(state.depth, Math.max(0, Math.floor(state.y)));
    const bi = Math.min(BIOMES.length - 1, Math.floor(state.depth / BIOME_LEN));
    if (bi > state.lastBiome) {
      state.lastBiome = bi;
      banner(BIOMES[bi].nm.toUpperCase(), `${bi * BIOME_LEN} m`, '#ffcf5a');
      audio.tone(392, 0.15, 'triangle', 0.2); setTimeout(() => audio.tone(523, 0.25, 'triangle', 0.2), 140);
    }
    if (!state.recordShown && save.best > 10 && state.depth > save.best) {
      state.recordShown = true;
      banner('NEW RECORD!', `${save.best} m passed`, '#7dff9a');
      state.flash = 0.2;
      audio.tone(523, 0.12, 'square', 0.18); setTimeout(() => audio.tone(784, 0.25, 'square', 0.18), 110);
    }

    // Kamera
    const target = state.y - 2.6;
    state.camY += (target - state.camY) * Math.min(1, dt * 6);
  }

  // ---------- Render ----------
  function rr(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function gemShape(cx, cy, s, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s * 0.8, cy - s * 0.2); ctx.lineTo(cx, cy + s); ctx.lineTo(cx - s * 0.8, cy - s * 0.2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s * 0.35, cy - s * 0.2); ctx.lineTo(cx - s * 0.35, cy - s * 0.2); ctx.closePath(); ctx.fill();
  }

  function drawTile(t, c, r, sx, sy) {
    const b = biomeAt(r);
    const pad = 1;
    let jx = 0;
    if (t.hit > 0) { t.hit -= 1 / 60; jx = (Math.random() - 0.5) * 3; }
    const x = sx + jx + pad, y = sy + pad, s = T - pad * 2;
    let base = b.a, edge = b.b;
    if (t.t === STONE) { base = '#8b8c96'; edge = '#62636d'; }
    if (t.t === HARD) { base = '#3d3a4a'; edge = '#26232f'; }
    if (t.t === BOMB) { base = '#3a1616'; edge = '#220808'; }
    if (t.t === FUEL) { base = b.a; edge = b.b; }
    ctx.fillStyle = edge; rr(x, y, s, s, T * 0.14); ctx.fill();
    ctx.fillStyle = base; rr(x + 2, y + 2, s - 4, s - 6, T * 0.12); ctx.fill();
    // Körnung (deterministisch je Tile)
    const seed = (c * 73 + r * 151) % 97;
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    for (let i = 0; i < 3; i++) {
      const px = x + ((seed * (i + 3) * 7) % 80) / 100 * s + s * 0.08, py = y + ((seed * (i + 5) * 11) % 76) / 100 * s + s * 0.08;
      ctx.fillRect(px, py, T * 0.08, T * 0.08);
    }
    if (t.t === HARD) {
      ctx.strokeStyle = 'rgba(200,190,230,.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + s * 0.2, y + s * 0.3); ctx.lineTo(x + s * 0.5, y + s * 0.45); ctx.lineTo(x + s * 0.8, y + s * 0.25);
      ctx.moveTo(x + s * 0.3, y + s * 0.75); ctx.lineTo(x + s * 0.6, y + s * 0.65); ctx.stroke();
    }
    if (t.t === GEM) {
      const g = GEMS[t.g];
      const pulse = 1 + Math.sin(state.t * 4 + c + r) * 0.06;
      ctx.save(); ctx.shadowColor = g.c; ctx.shadowBlur = T * 0.35;
      gemShape(x + s / 2, y + s / 2, s * 0.28 * pulse, g.c); ctx.restore();
    }
    if (t.t === BOMB) {
      const blink = Math.sin(state.t * 8 + c) > 0;
      ctx.fillStyle = blink ? '#ff3030' : '#7a1010';
      ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.round(s * 0.32)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', x + s / 2, y + s / 2 + 1);
    }
    if (t.t === FUEL) {
      ctx.fillStyle = '#2fd14a'; rr(x + s * 0.28, y + s * 0.22, s * 0.44, s * 0.58, s * 0.08); ctx.fill();
      ctx.fillStyle = '#167a27'; ctx.fillRect(x + s * 0.42, y + s * 0.13, s * 0.16, s * 0.1);
      ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.round(s * 0.26)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('F', x + s / 2, y + s * 0.52);
    }
    // Risse je nach Schaden
    if (t.max > 0 && t.hp < t.max) {
      const k = 1 - t.hp / t.max;
      ctx.strokeStyle = `rgba(0,0,0,${0.35 + k * 0.4})`; ctx.lineWidth = Math.max(1.5, T * 0.04);
      ctx.beginPath();
      ctx.moveTo(x + s * 0.5, y + s * 0.5);
      ctx.lineTo(x + s * (0.5 - 0.35 * k), y + s * (0.5 - 0.3 * k));
      ctx.moveTo(x + s * 0.5, y + s * 0.5);
      ctx.lineTo(x + s * (0.5 + 0.4 * k), y + s * (0.5 - 0.15 * k));
      ctx.moveTo(x + s * 0.5, y + s * 0.5);
      ctx.lineTo(x + s * (0.5 + 0.1 * k), y + s * (0.5 + 0.42 * k));
      ctx.stroke();
    }
  }

  function drawDrill(sx, sy) {
    const s = T * 0.82;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(state.lean * 0.25);
    if (state.inv > 0 && Math.floor(state.t * 20) % 2) ctx.globalAlpha = 0.45;
    // Körper
    ctx.fillStyle = '#2b2f3a'; rr(-s * 0.42, -s * 0.62, s * 0.84, s * 0.7, s * 0.14); ctx.fill();
    ctx.fillStyle = '#ffb627'; rr(-s * 0.38, -s * 0.58, s * 0.76, s * 0.6, s * 0.12); ctx.fill();
    ctx.fillStyle = '#ff8a00'; ctx.fillRect(-s * 0.38, -s * 0.14, s * 0.76, s * 0.12);
    // Cockpit
    ctx.fillStyle = '#1b2a3a'; rr(-s * 0.22, -s * 0.5, s * 0.44, s * 0.24, s * 0.08); ctx.fill();
    ctx.fillStyle = '#7fe0ff'; rr(-s * 0.18, -s * 0.47, s * 0.2, s * 0.16, s * 0.05); ctx.fill();
    // Bohrspitze
    ctx.beginPath();
    ctx.moveTo(-s * 0.34, 0); ctx.lineTo(s * 0.34, 0); ctx.lineTo(0, s * 0.6); ctx.closePath();
    ctx.fillStyle = '#c9ced8'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = '#6d7380'; ctx.lineWidth = s * 0.07;
    const off = (state.spin % 1) * s * 0.22;
    for (let i = -3; i < 6; i++) {
      const yy = i * s * 0.22 + off;
      ctx.beginPath(); ctx.moveTo(-s * 0.4, yy); ctx.lineTo(s * 0.4, yy + s * 0.14); ctx.stroke();
    }
    ctx.restore();
    // Abgas
    if (state.fuel <= 0 && Math.random() < 0.3) burst(state.x, state.y - 0.5, '#555', 1, 1.5, 0.12);
    ctx.restore();
  }

  function render() {
    const cam = state.camY;
    const b = biomeAt(Math.floor(state.y));
    ctx.fillStyle = b.bg; ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (state.shake > 0) ctx.translate((Math.random() - 0.5) * state.shake * T * 0.5, (Math.random() - 0.5) * state.shake * T * 0.5);

    const toY = (wy) => (wy - cam) * T;
    // Himmel
    const skyBottom = toY(0);
    if (skyBottom > 0) {
      const g = ctx.createLinearGradient(0, 0, 0, skyBottom);
      g.addColorStop(0, '#5fb6ff'); g.addColorStop(1, '#bfe6ff');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, skyBottom);
      ctx.fillStyle = '#4caf50'; ctx.fillRect(0, skyBottom - T * 0.15, W, T * 0.2);
    }
    // Seitenwände
    const r0 = Math.floor(cam) - 1, r1 = Math.ceil(cam + H / T) + 1;
    for (let r = Math.max(0, r0); r <= r1; r++) {
      const bb = biomeAt(r);
      const y = toY(r);
      ctx.fillStyle = bb.b; ctx.fillRect(0, y, OX, T + 1); ctx.fillRect(OX + COLS * T, y, W - OX - COLS * T, T + 1);
      ctx.fillStyle = bb.bg; ctx.fillRect(OX, y, COLS * T, T + 1);
    }
    if (OX > 0) {
      const gl = ctx.createLinearGradient(0, 0, OX, 0); gl.addColorStop(0, 'rgba(0,0,0,.55)'); gl.addColorStop(1, 'rgba(0,0,0,.1)');
      ctx.fillStyle = gl; ctx.fillRect(0, Math.max(0, skyBottom), OX, H);
      const gr = ctx.createLinearGradient(OX + COLS * T, 0, W, 0); gr.addColorStop(0, 'rgba(0,0,0,.1)'); gr.addColorStop(1, 'rgba(0,0,0,.55)');
      ctx.fillStyle = gr; ctx.fillRect(OX + COLS * T, Math.max(0, skyBottom), W - OX - COLS * T, H);
    }
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(OX - 4, Math.max(0, skyBottom), 4, H); ctx.fillRect(OX + COLS * T, Math.max(0, skyBottom), 4, H);
    // Tiefenmarken an der Seite
    ctx.font = `700 ${Math.max(11, Math.round(T * 0.26))}px system-ui`; ctx.textBaseline = 'middle';
    for (let r = Math.max(0, r0 - (r0 % 10)); r <= r1; r += 10) {
      if (r === 0) continue;
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.textAlign = 'right';
      ctx.fillText(`${r} m`, OX - 8, toY(r));
    }
    // Rekordlinie
    if (save.best > 0 && save.best >= r0 && save.best <= r1) {
      const y = toY(save.best);
      ctx.strokeStyle = '#7dff9a'; ctx.setLineDash([8, 6]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(OX, y); ctx.lineTo(OX + COLS * T, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#7dff9a'; ctx.textAlign = 'left'; ctx.fillText(`BEST ${save.best} m`, OX + COLS * T + 8, y);
    }
    // Tiles
    for (let r = Math.max(0, r0); r <= r1; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = tileAt(c, r);
        if (t.t !== E) drawTile(t, c, r, OX + c * T, toY(r));
      }
    }
    // Magnetradius
    const mr = magnet(lv('magnet'));
    if (mr > 0 && state.mode === 'play') {
      ctx.strokeStyle = 'rgba(140,220,255,.18)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(OX + state.x * T, toY(state.y), mr * T, 0, Math.PI * 2); ctx.stroke();
    }
    // Partikel
    for (const p of parts) {
      ctx.globalAlpha = Math.min(1, p.t * 2);
      ctx.fillStyle = p.col; ctx.fillRect(OX + (p.x - p.s / 2) * T, toY(p.y - p.s / 2), p.s * T, p.s * T);
    }
    ctx.globalAlpha = 1;
    for (const f of flyers) {
      ctx.save(); ctx.shadowColor = f.col; ctx.shadowBlur = 10;
      gemShape(OX + f.x * T, toY(f.y), T * 0.16 * (1 - f.t * 0.5), f.col); ctx.restore();
    }
    // Bohrer
    drawDrill(OX + state.x * T, toY(state.y));
    // Texte
    ctx.textAlign = 'center';
    for (const s of texts) {
      ctx.globalAlpha = Math.min(1, s.t * 2);
      ctx.font = `900 ${Math.round(T * 0.42 * s.size)}px system-ui`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.7)';
      ctx.strokeText(s.s, OX + s.x * T, toY(s.y)); ctx.fillStyle = s.col; ctx.fillText(s.s, OX + s.x * T, toY(s.y));
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (state.flash > 0) { ctx.fillStyle = `rgba(255,220,180,${state.flash})`; ctx.fillRect(0, 0, W, H); }
    if (state.mode === 'dead') { ctx.fillStyle = `rgba(0,0,0,${0.5 * (1 - state.dying / 1.3)})`; ctx.fillRect(0, 0, W, H); }
    drawHUD();
  }

  function drawHUD() {
    const side = OX;
    const wide = side >= 130;
    const fs = Math.max(13, Math.min(T * 0.42, 26));
    ctx.textBaseline = 'top';
    let x0 = wide ? 12 : 8, y0 = 10;
    const panelW = wide ? side - 24 : Math.min(200, W * 0.45);
    if (!wide) { ctx.fillStyle = 'rgba(0,0,0,.45)'; rr(4, 4, panelW + 8, fs * 4.4, 10); ctx.fill(); }
    // Tiefe
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.round(fs * 1.5)}px system-ui`;
    ctx.fillText(`${state.depth} m`, x0, y0);
    ctx.font = `600 ${Math.round(fs * 0.62)}px system-ui`; ctx.fillStyle = '#d8c3a8';
    ctx.fillText(`best ${save.best} m · ${biomeAt(state.depth).nm}`, x0, y0 + fs * 1.6);
    // Fuel
    const by = y0 + fs * 2.5, bw = panelW, bh = Math.max(12, fs * 0.7);
    const fk = state.fuel / state.fuelMax;
    ctx.fillStyle = 'rgba(0,0,0,.5)'; rr(x0, by, bw, bh, bh / 2); ctx.fill();
    const low = fk < 0.25;
    ctx.fillStyle = low ? (Math.floor(state.t * 6) % 2 ? '#ff4a3a' : '#ff9a3a') : '#3fd45a';
    if (fk > 0) { rr(x0 + 2, by + 2, Math.max(bh - 4, (bw - 4) * fk), bh - 4, (bh - 4) / 2); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(bh * 0.72)}px system-ui`; ctx.textBaseline = 'middle';
    ctx.fillText('⛽ FUEL', x0 + 8, by + bh / 2 + 1);
    // Hülle
    ctx.textBaseline = 'top';
    const hy = by + bh + 6;
    const hs = Math.max(12, fs * 0.7);
    for (let i = 0; i < state.hullMax; i++) {
      ctx.fillStyle = i < state.hull ? '#5ad1ff' : 'rgba(255,255,255,.18)';
      rr(x0 + i * (hs + 4), hy, hs, hs, 3); ctx.fill();
    }
    // Münzen rechts
    ctx.textAlign = 'right';
    const rx = W - (wide ? 12 : 8);
    if (!wide) { ctx.fillStyle = 'rgba(0,0,0,.45)'; rr(W - 150, 4, 146, fs * 2.6, 10); ctx.fill(); }
    ctx.font = `900 ${Math.round(fs * 1.2)}px system-ui`; ctx.fillStyle = '#ffcf5a';
    ctx.fillText(`🪙 ${state.coins}`, rx, y0);
    ctx.font = `600 ${Math.round(fs * 0.62)}px system-ui`; ctx.fillStyle = '#d8c3a8';
    ctx.fillText(`${state.gems} gems${state.daily ? ' · x2 daily' : ''}`, rx, y0 + fs * 1.35);
    if (state.combo > 1) {
      ctx.font = `900 ${Math.round(fs * 0.9)}px system-ui`; ctx.fillStyle = '#fff';
      ctx.fillText(`COMBO x${state.combo}`, rx, y0 + fs * 2.2);
    }
    // Banner
    if (state.banner) {
      const bnr = state.banner;
      const a = Math.min(1, bnr.t * 2, (2.4 - bnr.t) * 4);
      ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const yy = H * 0.62;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; rr(W / 2 - Math.min(W * 0.45, 260), yy - fs * 1.4, Math.min(W * 0.9, 520), fs * 2.8, 14); ctx.fill();
      ctx.font = `900 ${Math.round(fs * 1.3)}px system-ui`; ctx.fillStyle = bnr.col; ctx.fillText(bnr.a, W / 2, yy - fs * 0.35);
      ctx.font = `700 ${Math.round(fs * 0.7)}px system-ui`; ctx.fillStyle = '#fff'; ctx.fillText(bnr.b, W / 2, yy + fs * 0.75);
      ctx.globalAlpha = 1;
    }
    // Einführung
    if (state.hint > 0 && state.mode === 'play') {
      ctx.globalAlpha = Math.min(1, state.hint);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const yy = H * 0.86;
      const bob = Math.sin(state.t * 6) * 8;
      ctx.font = `900 ${Math.round(fs * 1.4)}px system-ui`; ctx.fillStyle = '#fff';
      ctx.fillStyle = '#fff';
      for (const dir of [-1, 1]) {
        const ax = W / 2 + dir * (fs * 7 + bob), a = fs * 0.7;
        ctx.beginPath(); ctx.moveTo(ax + dir * a, yy); ctx.lineTo(ax - dir * a * 0.6, yy - a); ctx.lineTo(ax - dir * a * 0.6, yy + a); ctx.closePath(); ctx.fill();
      }
      ctx.font = `800 ${Math.round(fs * 0.8)}px system-ui`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.7)';
      ctx.strokeText('HOLD & DRAG TO STEER', W / 2, yy - fs * 0.35); ctx.fillText('HOLD & DRAG TO STEER', W / 2, yy - fs * 0.35);
      ctx.font = `700 ${Math.round(fs * 0.62)}px system-ui`; ctx.fillStyle = '#ffe9a8';
      ctx.strokeText('grab gems · avoid ! bombs · watch fuel', W / 2, yy + fs * 0.6); ctx.fillText('grab gems · avoid ! bombs · watch fuel', W / 2, yy + fs * 0.6);
      ctx.globalAlpha = 1;
    }
    if (state.mode === 'play' && state.fuel <= 0) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.round(fs * 1.1)}px system-ui`; ctx.fillStyle = Math.floor(state.t * 4) % 2 ? '#ff5a3a' : '#fff';
      ctx.fillText('OUT OF FUEL', W / 2, H * 0.2);
    }
  }

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

  // Test-Hook (nur lesend)
  window.__dp = { state, save };

  (async () => {
    CG.loadingStart();
    await CG.init();
    audio.apply();
    CG.loadingStop();
    startRun();
    requestAnimationFrame(frame);
  })();
})();
