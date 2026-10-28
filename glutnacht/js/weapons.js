'use strict';
// Verhalten der Waffen. Jede Waffe hat update(w, run, dt); Werte stehen in w.st.

function nearestEnemy(r, x, y, maxD, skip) {
  let best = null, bd = maxD * maxD;
  for (const e of r.enemies) {
    if (e.dead || (skip && skip.indexOf(e) >= 0)) continue;
    const d = dist2(x, y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function onScreenEnemies(r) {
  const hw = Game.view.hw, hh = Game.view.hh, p = r.p, out = [];
  for (const e of r.enemies) {
    if (!e.dead && Math.abs(e.x - p.x) < hw && Math.abs(e.y - p.y) < hh) out.push(e);
  }
  return out;
}

// Abklingzeit + Salve: fire(i) wird amount-mal im Abstand gap aufgerufen.
function tickBurst(w, dt, gap, fire) {
  w.cdT -= dt;
  if (w.burst <= 0 && w.cdT <= 0) {
    w.cdT = w.st.cd;
    w.burst = w.st.amount;
    w.burstI = 0;
    w.burstT = 0;
  }
  if (w.burst > 0) {
    w.burstT -= dt;
    while (w.burst > 0 && w.burstT <= 0) {
      fire(w.burstI++);
      w.burst--;
      w.burstT += gap;
    }
  }
}

const WEAPON_FN = {
  wand: {
    update(w, r, dt) {
      tickBurst(w, dt, w.evo ? 0.04 : 0.08, () => {
        const p = r.p, st = w.st;
        const t = nearestEnemy(r, p.x, p.y, Game.viewRadius());
        let a = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.dirY, p.dirX);
        a += rand(-0.08, 0.08);
        r.shots.push({
          kind: 'bolt', x: p.x, y: p.y, vx: Math.cos(a) * st.speed, vy: Math.sin(a) * st.speed,
          r: 7 * st.area, dmg: st.dmg, pierce: st.pierce, life: st.dur, t: 0, hit: [], wid: 'wand', crit: st.crit,
          color: w.evo ? '#ff7cf5' : '#b48cff', evo: w.evo,
        });
        Hooks.sfx('shoot');
      });
    },
  },

  whip: {
    update(w, r, dt) {
      tickBurst(w, dt, 0.12, i => {
        const p = r.p, st = w.st;
        const R = 112 * st.area;
        // Erster Schlag zielt auf den nächsten Gegner in Reichweite, sonst in Laufrichtung.
        if (i === 0) {
          const t = nearestEnemy(r, p.x, p.y, R * 1.3);
          w.aim = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.dirY, p.dirX);
        }
        // 0: vorne, 1: hinten, 2/3: seitlich
        const a = w.aim + [0, Math.PI, Math.PI / 2, -Math.PI / 2][i % 4];
        const cx = p.x + Math.cos(a) * R * 0.5, cy = p.y + Math.sin(a) * R * 0.5;
        let heals = 0;
        Game.inCircle(cx, cy, R * 0.6, e => {
          Game.damage(e, st.dmg, 'whip', 110, st.crit);
          if (w.evo && heals < 5) { heals++; r.p.hp = Math.min(r.stats.maxHp, r.p.hp + 0.5); }
        });
        r.fx.push({ kind: 'slash', x: p.x, y: p.y, a, rad: R, t: 0, life: 0.22, evo: w.evo });
        Hooks.sfx('slash');
      });
    },
  },

  orbit: {
    update(w, r, dt) {
      const st = w.st;
      if (w.evo) w.active = 1;
      else if (w.active > 0) {
        w.active -= dt;
        if (w.active <= 0) w.cdT = st.cd;
      } else {
        w.cdT -= dt;
        if (w.cdT <= 0) { w.active = st.dur; Hooks.sfx('orbit'); }
      }
      if (w.active <= 0) return;
      w.ang += dt * 3.3 * st.speed;
      const p = r.p, R = 92 * st.area, orb = 14 * st.area;
      w.orbs = w.orbs || [];
      w.orbs.length = 0;
      for (let i = 0; i < st.amount; i++) {
        const a = w.ang + i / st.amount * TAU;
        const ox = p.x + Math.cos(a) * R, oy = p.y + Math.sin(a) * R;
        w.orbs.push(ox, oy);
        Game.inCircle(ox, oy, orb, e => {
          const nt = e.hitT.orbit;
          if (nt !== undefined && nt > r.t) return;
          e.hitT.orbit = r.t + 0.4;
          Game.damage(e, st.dmg, 'orbit', 160, st.crit, p.x, p.y);
        });
      }
    },
  },

  aura: {
    update(w, r, dt) {
      const st = w.st, p = r.p;
      w.rad = 82 * st.area;
      w.cdT -= dt;
      if (w.cdT > 0) return;
      w.cdT = st.cd / st.amount; // +1 Geschoss = ein zusätzlicher Puls pro Abklingzeit
      w.pulse = 1;
      let any = false;
      Game.inCircle(p.x, p.y, w.rad, e => {
        any = true;
        if (w.evo) { e.slowT = Math.max(e.slowT, 0.6); e.slowF = Math.min(e.slowF, 0.6); }
        Game.damage(e, st.dmg, 'aura', 40, st.crit);
      });
      if (w.evo && any) p.hp = Math.min(r.stats.maxHp, p.hp + 0.6);
    },
  },

  lightning: {
    update(w, r, dt) {
      tickBurst(w, dt, 0.06, () => {
        const st = w.st;
        const list = onScreenEnemies(r);
        if (!list.length) return;
        const t = pick(list);
        const R = 36 * st.area;
        Game.inCircle(t.x, t.y, R, e => Game.damage(e, st.dmg, 'lightning', 60, st.crit, t.x, t.y));
        r.fx.push({ kind: 'zap', x: t.x, y: t.y, rad: R, t: 0, life: 0.25, evo: w.evo });
        if (w.evo) {
          let from = t;
          const done = [t];
          for (let k = 0; k < 4; k++) {
            const n = nearestEnemy(r, from.x, from.y, 190, done);
            if (!n) break;
            done.push(n);
            r.fx.push({ kind: 'arc', x: from.x, y: from.y, x2: n.x, y2: n.y, t: 0, life: 0.22 });
            Game.damage(n, st.dmg * 0.7, 'lightning', 40, st.crit, from.x, from.y);
            from = n;
          }
        }
        Hooks.sfx('zap');
      });
    },
  },

  sickle: {
    update(w, r, dt) {
      tickBurst(w, dt, 0.12, i => {
        const p = r.p, st = w.st;
        const t = nearestEnemy(r, p.x, p.y, 420);
        let a = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.dirY, p.dirX);
        a += (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.45;
        const sp = st.speed * (w.evo ? 1.25 : 1);
        r.shots.push({
          kind: 'sickle', x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vx0: Math.cos(a) * sp, vy0: Math.sin(a) * sp,
          speed: sp, r: 17 * st.area, dmg: st.dmg, life: 3.2, t: 0, hits: new Map(), wid: 'sickle', crit: st.crit,
          spin: 0, back: false, evo: w.evo,
        });
        Hooks.sfx('throw');
      });
    },
  },

  fire: {
    update(w, r, dt) {
      tickBurst(w, dt, 0.12, () => {
        const p = r.p, st = w.st;
        let tx, ty;
        const list = r.enemies.filter(e => !e.dead && dist2(e.x, e.y, p.x, p.y) < 260 * 260);
        if (list.length && Math.random() < 0.8) {
          const e = pick(list); tx = e.x; ty = e.y;
        } else {
          const a = rand(0, TAU), d = rand(60, 200);
          tx = p.x + Math.cos(a) * d; ty = p.y + Math.sin(a) * d;
        }
        r.shots.push({ kind: 'flask', sx: p.x, sy: p.y, tx, ty, x: p.x, y: p.y, t: 0, T: 0.45, rad: 46 * st.area, life: st.dur, dmg: st.dmg, wid: 'fire', evo: w.evo });
        Hooks.sfx('throw');
      });
    },
  },

  nova: {
    update(w, r, dt) {
      tickBurst(w, dt, 0.35, () => {
        const p = r.p, st = w.st;
        r.fx.push({ kind: 'nova', x: p.x, y: p.y, rad: 0, maxRad: 150 * st.area, t: 0, life: 0.55, hit: new Set(), dmg: st.dmg, slowDur: st.dur, freeze: w.evo, wid: 'nova' });
        Hooks.sfx('nova');
      });
    },
  },

  knives: {
    update(w, r, dt) {
      tickBurst(w, dt, w.evo ? 0.03 : 0.06, i => {
        const p = r.p, st = w.st;
        if (i === 0) {
          const t = nearestEnemy(r, p.x, p.y, 380);
          w.aim = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.dirY, p.dirX);
        }
        const a = w.aim + rand(-0.07, 0.07);
        const side = ((i % 3) - 1) * 9;
        const x = p.x - Math.sin(a) * side, y = p.y + Math.cos(a) * side;
        r.shots.push({
          kind: 'knife', x, y, vx: Math.cos(a) * st.speed, vy: Math.sin(a) * st.speed, r: 6 * st.area,
          dmg: st.dmg, pierce: st.pierce, life: 0.9, t: 0, hit: [], wid: 'knives', crit: st.crit, color: '#d8f3ff', evo: w.evo,
        });
        Hooks.sfx('knife');
      });
    },
  },
};
