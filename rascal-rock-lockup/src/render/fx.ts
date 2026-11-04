/** Ambient & feedback particles with fixed pools (no per-frame allocation). */
import { Container, Sprite } from 'pixi.js';
import { tex } from './atlas';
import { MAP_W, MAP_H, SEA } from '../content/site1';
import { TILE } from './world';

interface P { s: Sprite; t: number; life: number; vx: number; vy: number; kind: number; a0: number; x0: number; y0: number; spin: number }

export class Ambient {
  private waves: P[] = []; private gulls: P[] = []; private leaves: P[] = []; private flies: P[] = []; private steam: P[] = []; private clouds: P[] = [];
  steamSources: { x: number; y: number }[] = [];
  night = 0;

  constructor(water: Container, air: Container, lights: Container) {
    const mk = (name: string, parent: Container, n: number, arr: P[]) => {
      for (let i = 0; i < n; i++) { const s = new Sprite(tex(name)); s.visible = false; parent.addChild(s); arr.push({ s, t: 0, life: 0, vx: 0, vy: 0, kind: 0, a0: 1, x0: 0, y0: 0, spin: 0 }); }
    };
    mk('wave', water, 120, this.waves);
    mk('cloudShadow', air, 3, this.clouds);
    mk('gull', air, 5, this.gulls);
    mk('leaf', air, 14, this.leaves);
    mk('steam', air, 16, this.steam);
    mk('firefly', lights, 26, this.flies);
    for (const p of [...this.waves, ...this.gulls, ...this.clouds, ...this.flies]) p.t = -Math.random() * 6;
  }

  private seaPoint(): [number, number] {
    // anywhere in the sea ring, biased to near the island
    for (;;) {
      const x = (-SEA + Math.random() * (MAP_W + SEA * 2)) * TILE, y = (-SEA + Math.random() * (MAP_H + SEA * 2)) * TILE;
      const inside = x > 3 * TILE && y > 0 && x < MAP_W * TILE && y < MAP_H * TILE;
      if (!inside) return [x, y];
    }
  }

  update(dt: number) {
    for (const p of this.waves) {
      p.t += dt;
      if (p.t >= p.life) { const [x, y] = this.seaPoint(); p.x0 = x; p.y0 = y; p.t = 0; p.life = 2.5 + Math.random() * 2.5; p.s.visible = true; p.s.scale.set(1 + Math.random() * 0.8); }
      if (p.t < 0) { p.s.visible = false; continue; }
      const k = p.t / p.life;
      p.s.alpha = Math.sin(k * Math.PI) * 0.9;
      p.s.position.set(p.x0 + k * 10, p.y0);
    }
    for (const p of this.clouds) {
      p.t += dt;
      if (p.t < 0) continue;
      if (!p.s.visible || p.s.x > (MAP_W + SEA) * TILE + 200) { p.s.visible = true; p.s.position.set(-SEA * TILE - 200, Math.random() * MAP_H * TILE); p.vx = 6 + Math.random() * 6; p.s.scale.set(2 + Math.random() * 1.5); }
      p.s.x += p.vx * dt; p.s.alpha = 1 - this.night;
    }
    for (const p of this.gulls) {
      p.t += dt;
      if (p.t < 0) continue;
      if (!p.s.visible) { p.s.visible = true; const left = Math.random() < 0.5; p.x0 = left ? -SEA * TILE : (MAP_W + SEA) * TILE; p.s.position.set(p.x0, (Math.random() * MAP_H) * TILE); p.vx = (left ? 1 : -1) * (40 + Math.random() * 25); p.vy = (Math.random() - 0.5) * 10; p.life = 0; }
      p.life += dt;
      p.s.x += p.vx * dt; p.s.y += p.vy * dt + Math.sin(p.life * 1.3) * 0.2;
      p.s.scale.set(p.vx > 0 ? 1 : -1, 0.6 + Math.abs(Math.sin(p.life * 7)) * 0.5);
      p.s.alpha = 1 - this.night * 0.7;
      if (p.s.x < -SEA * TILE - 40 || p.s.x > (MAP_W + SEA) * TILE + 40) { p.s.visible = false; p.t = -4 - Math.random() * 10; }
    }
    for (const p of this.leaves) {
      if (!p.s.visible) { if (Math.random() < dt * 0.35) { p.s.visible = true; p.s.position.set(Math.random() * MAP_W * TILE, Math.random() * MAP_H * TILE); p.vx = 14 + Math.random() * 10; p.vy = 4 + Math.random() * 4; p.t = 0; p.life = 5 + Math.random() * 3; p.spin = (Math.random() - 0.5) * 4; } continue; }
      p.t += dt; p.s.x += p.vx * dt; p.s.y += p.vy * dt + Math.sin(p.t * 2.2) * 0.4; p.s.rotation += p.spin * dt;
      p.s.alpha = Math.min(1, Math.sin((p.t / p.life) * Math.PI) * 2) * (1 - this.night * 0.6);
      if (p.t > p.life) p.s.visible = false;
    }
    let si = 0;
    for (const p of this.steam) {
      if (!p.s.visible) {
        if (this.steamSources.length && Math.random() < dt * 1.4) { const src = this.steamSources[si++ % this.steamSources.length]; p.s.visible = true; p.x0 = src.x + (Math.random() - 0.5) * 6; p.y0 = src.y; p.t = 0; p.life = 1.6 + Math.random(); }
        continue;
      }
      p.t += dt; const k = p.t / p.life;
      p.s.position.set(p.x0 + Math.sin(p.t * 2 + p.y0) * 3, p.y0 - k * 26); p.s.scale.set(0.5 + k * 0.9); p.s.alpha = (1 - k) * 0.55;
      if (k >= 1) p.s.visible = false;
    }
    for (const p of this.flies) {
      p.t += dt;
      if (this.night < 0.2) { p.s.visible = false; continue; }
      if (!p.s.visible || p.t > p.life) { p.s.visible = true; p.x0 = (4 + Math.random() * (MAP_W - 6)) * TILE; p.y0 = (2 + Math.random() * (MAP_H - 4)) * TILE; p.t = 0; p.life = 4 + Math.random() * 4; p.spin = Math.random() * 6; }
      p.s.position.set(p.x0 + Math.sin(p.t * 0.9 + p.spin) * 14, p.y0 + Math.sin(p.t * 1.3 + p.spin * 2) * 8);
      p.s.alpha = this.night * Math.max(0, Math.sin((p.t / p.life) * Math.PI)) * (0.6 + 0.4 * Math.sin(p.t * 9 + p.spin));
      p.s.scale.set(1.4);
    }
  }
}
