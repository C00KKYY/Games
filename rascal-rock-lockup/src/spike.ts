/**
 * M1 art spike scene: the start prison with scripted agents (no simulation yet).
 * URL params: ?stage=2 (canteen milestone look), ?night=1, ?t=<hour> fixed clock, ?cam=start|wide
 */
import { Application, Sprite, Container } from 'pixi.js';
import { WorldView, TILE } from './render/world';
import { AgentView, SECURITY, type Look } from './render/agentsView';
import { Camera } from './render/camera';
import { Ambient } from './render/fx';
import { tex } from './render/atlas';
import { buildGround, START_ROOMS, START_DECOR, FERRY_POS, PATH_Y, GATE_X, GATE_Y, type RoomDesc } from './content/site1';
import { P } from '../art/palette';
import type { Dir } from './render/charLayout';
import { rclock } from './render/rclock';

const hex = (h: string) => parseInt(h.slice(1), 16);

interface Walker { v: AgentView; path: [number, number][]; i: number; x: number; y: number; speed: number; wait: number; pause: number[] }

export function createSpike(app: Application, cam: Camera, opts: URLSearchParams) {
  const world = new WorldView();
  app.stage.addChild(world.root);
  world.buildSea();
  const stage = Number(opts.get('stage') ?? 1);
  const rooms: RoomDesc[] = START_ROOMS.map(r => ({ ...r, stage: r.type === 'canteen' ? stage : 1 }));
  world.buildGround(buildGround(), rooms);
  for (const r of rooms) world.addRoom(r);
  for (const d of START_DECOR) world.addProp(d.s, d.x, d.y);
  // buildings & fixed structures
  world.addProp('office', 5, 21, 21 * TILE - 2);
  world.addProp('booth', GATE_X - 1.75, GATE_Y - 0.15, (GATE_Y - 0.2) * TILE);
  world.addProp('gate', GATE_X - 0.125, GATE_Y, GATE_Y * TILE);
  // cart depot
  world.addProp('cart', 3.9, 18.9); for (const [x, y] of [[2.9, 19.2], [3.4, 19.5], [2.7, 19.75], [3.25, 19.0]]) world.addProp('crate', x, y);
  // ferry with bob
  const ferry = world.addProp('ferry', FERRY_POS.x, FERRY_POS.y, FERRY_POS.y * TILE - 100);
  // lights (night)
  const lampPos = START_DECOR.filter(d => d.s === 'lamp').map(d => ({ x: d.x * TILE, y: d.y * TILE - 46 }));
  const lightPts = [...lampPos, { x: 5 * TILE + 19, y: 21 * TILE - 30 }, { x: 5 * TILE + 77, y: 21 * TILE - 30 }, { x: (GATE_X + 1) * TILE, y: GATE_Y * TILE - 62 }, { x: (GATE_X - 1) * TILE, y: GATE_Y * TILE - 24 }];
  const glows: Sprite[] = [];
  for (const p of lightPts) { const g = new Sprite(tex('glow')); g.position.set(p.x, p.y); g.scale.set(1.1); g.alpha = 0; world.lights.addChild(g); glows.push(g); }
  const amb = new Ambient(world.sea, world.fx, world.lights);
  const counter = rooms[0];
  amb.steamSources = [{ x: counter.x * TILE + 2 + 11, y: counter.y * TILE + 50 - 33 }, { x: counter.x * TILE + 2 + 53, y: counter.y * TILE + 50 - 33 }];

  // ---------------- agents
  const raccoon = (sec: keyof typeof SECURITY, acc?: Look['acc'], accTint?: number): Look => ({ species: 'raccoon', overall: SECURITY[sec].overall, stripe: SECURITY[sec].stripe, paw: hex(P.ink700), acc, accTint, tail: 'raccoon' });
  const weasel = (sec: keyof typeof SECURITY, acc?: Look['acc'], accTint?: number): Look => ({ species: 'weasel', overall: SECURITY[sec].overall, stripe: SECURITY[sec].stripe, paw: hex(P.wood700), acc, accTint, tail: 'weasel' });
  const walkers: Walker[] = [];
  const addWalker = (look: Look, path: [number, number][], speed = 34, pause: number[] = []) => {
    const v = new AgentView(look); world.objects.addChild(v.c);
    const w: Walker = { v, path: path.map(([x, y]) => [x * TILE, y * TILE]), i: 1, x: path[0][0] * TILE, y: path[0][1] * TILE, speed, wait: 0, pause };
    walkers.push(w); return w;
  };
  const py = PATH_Y + 0.55, py2 = PATH_Y + 1.45;
  addWalker(raccoon('low'), [[2.2, py], [6.5, py], [6.5, 13.7], [6.5, py], [12.5, py], [12.5, 13.6], [12.5, py2], [2.2, py2]], 30, [2, 5]);
  addWalker(weasel('mid', 'glasses'), [[14.5, py2], [8, py2], [8, py], [12.5, py], [12.5, 13.5], [12.5, py2]], 26, [1, 4]);
  addWalker(raccoon('high', 'beanie', hex(P.sage500)), [[10.4, 18.2], [12, 18.2], [14, 17.6], [14, py2], [9, py2], [9, 18.2]], 22, [0, 3]);
  addWalker(weasel('low', 'scarf', hex(P.teal500)), [[15.4, py], [15.4, 18.4], [15.6, 22.5], [16.5, 22.5], [16.5, 18.4], [16.4, py2], [13, py2], [13, py], [15.4, py]], 24, [3, 6]);
  // cook behind the counter, idle; clerk in booth
  const cook = new AgentView({ species: 'bear', overall: hex(P.cream300), stripe: null, paw: hex(P.wood700), acc: 'chef' });
  cook.c.position.set(counter.x * TILE + 34, counter.y * TILE + 27); cook.c.zIndex = counter.y * TILE + 49; world.objects.addChild(cook.c);
  const guard = new AgentView({ species: 'bulldog', overall: hex(P.ink700), stripe: null, paw: hex(P.brick500), acc: 'guardcap' });
  guard.c.position.set((GATE_X + 2.6) * TILE, (GATE_Y - 0.1) * TILE); guard.c.zIndex = guard.c.y; world.objects.addChild(guard.c);
  const beaver = new AgentView({ species: 'beaver', overall: hex(P.gold700), stripe: null, paw: hex(P.wood700) });
  beaver.c.position.set(4.6 * TILE, 19.4 * TILE); beaver.c.zIndex = beaver.c.y; world.objects.addChild(beaver.c); beaver.setDir('W');
  const statics = [cook, guard, beaver];

  // ---------------- day / night
  let hour = Number(opts.get('t') ?? (opts.get('night') ? 22.5 : 9.5));
  let fixedClock = opts.has('t') || opts.has('night') || opts.has('capture');
  const nightTint = { r: 0xb6 / 255, g: 0xc0 / 255, b: 0xdc / 255 };
  const nightOf = (h: number) => {
    // 0 day … 1 night, soft transitions 19–22 and 5–7
    if (h >= 22 || h < 5) return 1;
    if (h >= 19) return (h - 19) / 3;
    if (h < 7) return 1 - (h - 5) / 2;
    return 0;
  };

  const update = (dt: number) => {
    if (!fixedClock) hour = (hour + dt * (1 / 7.5)) % 24;
    const n = nightOf(hour);
    amb.night = n;
    const lerp = (a: number, b: number) => Math.round((a + (b - a) * n) * 255);
    world.tinted.tint = (lerp(1, nightTint.r) << 16) | (lerp(1, nightTint.g) << 8) | lerp(1, nightTint.b);
    const flick = (i: number) => 0.92 + Math.sin((rclock.t * 1000) / 180 + i * 1.7) * 0.04;
    glows.forEach((g, i) => { g.alpha = n * 0.85 * flick(i); });
    amb.update(dt);
    ferry.y = FERRY_POS.y * TILE + Math.sin((rclock.t * 1000) / 900) * 1.2;
    ferry.rotation = Math.sin((rclock.t * 1000) / 1300) * 0.006;
    for (const w of walkers) {
      let speed = 0;
      if (w.wait > 0) w.wait -= dt;
      else {
        const [tx, ty] = w.path[w.i];
        const dx = tx - w.x, dy = ty - w.y, d = Math.hypot(dx, dy);
        const step = w.speed * dt;
        if (d <= step) { w.x = tx; w.y = ty; if (w.pause.includes(w.i)) w.wait = 1.5 + Math.random() * 2; w.i = (w.i + 1) % w.path.length; }
        else { w.x += (dx / d) * step; w.y += (dy / d) * step; speed = w.speed; }
        const dir: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N';
        if (speed && dir !== w.v.dir) w.v.setDir(dir);
        if (!speed && w.wait > 0 && w.v.dir !== 'S') w.v.setDir('S');
      }
      w.v.c.position.set(w.x, w.y); w.v.c.zIndex = w.y;
      w.v.update(dt, speed);
    }
    for (const s of statics) s.update(dt, 0);
  };

  // camera bounds: island + sea margin
  cam.bounds = { x0: -5 * TILE, y0: -3 * TILE, x1: 37 * TILE, y1: 33 * TILE };
  const frameStart = () => cam.fit(-3.6 * TILE, 10.2 * TILE, 18.4 * TILE, 21.6 * TILE, 4);
  return { world, update, frameStart, get hour() { return hour; }, setNight(h: number) { hour = h; fixedClock = true; } , container: world.root as Container };
}
