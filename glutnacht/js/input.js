'use strict';
// Tastatur und virtueller Joystick (Touch/Maus: irgendwo drücken und ziehen).

const Input = {
  keys: new Set(),
  joy: null, // { id, ox, oy, x, y }

  init(canvas) {
    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k) && Game.state === 'play') e.preventDefault();
      UI.onKey(k, e);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.keys.clear(); this.joy = null; });

    canvas.addEventListener('pointerdown', e => {
      if (Game.state !== 'play' || this.joy) return;
      Sfx.init();
      this.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    });
    canvas.addEventListener('pointermove', e => {
      if (!this.joy || e.pointerId !== this.joy.id) return;
      this.joy.x = e.clientX; this.joy.y = e.clientY;
      // Ursprung wandert mit, wenn weit gezogen wird
      const dx = this.joy.x - this.joy.ox, dy = this.joy.y - this.joy.oy, d = Math.hypot(dx, dy), max = 60;
      if (d > max) { this.joy.ox = this.joy.x - dx / d * max; this.joy.oy = this.joy.y - dy / d * max; }
    });
    const end = e => { if (this.joy && e.pointerId === this.joy.id) this.joy = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  },

  update() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('a') || k.has('arrowleft') || k.has('q')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup') || k.has('z')) y -= 1;
    if (k.has('s') || k.has('arrowdown')) y += 1;
    if (x || y) {
      const l = Math.hypot(x, y);
      x /= l; y /= l;
    } else if (this.joy) {
      const dx = this.joy.x - this.joy.ox, dy = this.joy.y - this.joy.oy, d = Math.hypot(dx, dy);
      if (d > 6) { const m = Math.min(1, d / 45); x = dx / d * m; y = dy / d * m; }
    }
    Game.input.x = x; Game.input.y = y;
  },

  drawJoystick(ctx) {
    const j = this.joy;
    if (!j) return;
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(j.ox, j.oy, 60, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#fff';
    const dx = j.x - j.ox, dy = j.y - j.oy, d = Math.hypot(dx, dy), m = Math.min(d, 60);
    ctx.beginPath(); ctx.arc(j.ox + (d ? dx / d * m : 0), j.oy + (d ? dy / d * m : 0), 24, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  },
};
