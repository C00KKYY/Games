/**
 * M5 in-game contact sheet: every new world visual in the running game (SwiftShader, deterministic ?capture stepping).
 *   ART_URL=http://localhost:5374 npx tsx tools/art/m5-scenes.ts   (needs `npx vite --port 5374 --strictPort` running)
 * Writes qa/m5/art/scene-<name>-<W>x<H>.png for 1280x720 and 907x510 plus a montage per size, and prints the WebGL
 * draw calls of one frame (drawElements + drawArrays around __step(1)) for every scene.
 * The states are forced through the dev-server modules (sandbox only: ?capture implies ?nosave).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium, type Page } from 'playwright';

const ROOT = new URL('../..', import.meta.url).pathname;
const OUT = ROOT + 'qa/m5/art/';
const URL0 = process.env.ART_URL ?? 'http://localhost:5374';
const MOCK = readFileSync(new URL('../../tests/fixtures/sdk-mock.js', import.meta.url), 'utf8');
const SIZES = [[1280, 720], [907, 510]] as const;

async function drawCalls(p: Page): Promise<number> {
  return p.evaluate(() => {
    const g = (window as any).__game.app.renderer.gl as WebGL2RenderingContext;
    let n = 0;
    const de = g.drawElements.bind(g), da = g.drawArrays.bind(g);
    const dei = (g as any).drawElementsInstanced?.bind(g), dai = (g as any).drawArraysInstanced?.bind(g);
    g.drawElements = (...a: Parameters<typeof de>) => { n++; return de(...a); };
    g.drawArrays = (...a: Parameters<typeof da>) => { n++; return da(...a); };
    if (dei) (g as any).drawElementsInstanced = (...a: unknown[]) => { n++; return dei(...a); };
    if (dai) (g as any).drawArraysInstanced = (...a: unknown[]) => { n++; return dai(...a); };
    (window as any).__step(1);
    g.drawElements = de; g.drawArrays = da;
    if (dei) (g as any).drawElementsInstanced = dei;
    if (dai) (g as any).drawArraysInstanced = dai;
    return n;
  });
}

/** set up the "everything M5 is there" state: all 12 projects, both leads, VIP board ready, site 2 unlocked */
async function setupAll(p: Page) {
  await p.evaluate(async () => {
    const ctx = (window as any).__ctx, w = ctx.w;
    const { PROJECTS } = await import('/src/content/progress.ts' as string);
    for (const pr of PROJECTS) w.projects.done[pr.id] = true;
    w.leads.slots = ['intake', 'logistics'];
    w.vip.phase = 'ready';
    w.prestige.completedSites = [1];
    w.director.data.vipNext = 1;
    if (w.ferry.state === 'away') w.ferry.nextT = w.t + 1;
    w.speed = 1;
  });
}
async function focus(p: Page, x: number, y: number, zoom: number) {
  await p.evaluate(([x, y, z]) => { const cam = (window as any).__game.cam; cam.zoom = cam.targetZoom = z; cam.x = x * 32; cam.y = y * 32; cam.vx = cam.vy = 0; cam.clamp(); }, [x, y, zoom]);
  await p.evaluate(() => (window as any).__step(2));
}
const roomCentre = (p: Page, type: string) => p.evaluate((t) => { const r = (window as any).__ctx.w.rooms.find((q: any) => q.type === t && q.built); return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null; }, type);

async function main() {
  mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const report: Record<string, Record<string, number>> = {};
  for (const [W, H] of SIZES) {
    const tag = `${W}x${H}`;
    report[tag] = {};
    const p = await b.newPage({ viewport: { width: W, height: H } });
    const errs: string[] = [];
    p.on('pageerror', e => errs.push(String(e)));
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.route('https://sdk.crazygames.com/**', r => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
    await p.goto(`${URL0}/?capture&bot=casual&warp=900&seed=7&lang=en`);
    await p.waitForFunction(() => !!(window as any).__step && !!(window as any).__ctx && document.getElementById('boot')?.classList.contains('gone'), null, { timeout: 120_000 });
    await p.evaluate(() => (window as any).__step(3));
    const shots: string[] = [];
    const shot = async (name: string) => {
      report[tag][name] = await drawCalls(p);
      const f = `${OUT}scene-${name}-${tag}.png`;
      await p.screenshot({ path: f });
      shots.push(f);
    };
    // 0) baseline before any M5 state (draw-call reference)
    await focus(p, 7.6, 17, 1);
    await shot('00-before');
    await setupAll(p);
    // let the ferry bring the Cat Burglar and the props settle (pops, bubbles, steam)
    for (let i = 0; i < 12; i++) await p.evaluate(() => (window as any).__step(30));
    await focus(p, 7.6, 17, 1);
    await shot('01-overview');
    await focus(p, 3.2, 20.2, 1.5);
    await shot('02-office-dock');
    for (const [t, z] of [['bunk', 1.5], ['canteen', 1.5], ['wash', 1.5], ['workshop', 1.5], ['classroom', 1.5], ['yard', 1.5], ['guard', 1.5]] as const) {
      const c = await roomCentre(p, t);
      if (!c) { console.log(`no ${t} room in this run`); continue; }
      await focus(p, c.x, c.y, z);
      await shot(`03-${t}`);
    }
    await focus(p, 14, 21.6, 1.5);
    await shot('04-booth-gate');
    // goose inspector walk (route from the sim module)
    await p.evaluate(async () => {
      const w = (window as any).__ctx.w;
      const { inspectionRoute } = await import('/src/sim/inspection.ts' as string);
      const I = w.inspection;
      I.route = inspectionRoute(w); I.phase = 'walking'; I.startMs = w.rtMs; I.walker = { x: I.route[0].x, y: I.route[0].y, dir: 'E', moving: true, wp: 0 };
    });
    for (let k = 0; k < 4; k++) {
      await p.evaluate((n) => (window as any).__step(n), k === 0 ? 20 : 110);
      const g = await p.evaluate(() => { const wk = (window as any).__ctx.w.inspection.walker; return { x: wk.x, y: wk.y, dir: wk.dir }; });
      await focus(p, g.x, g.y - 0.5, 1.5);
      await shot(`05-goose-${k}-${g.dir}`);
    }
    await p.evaluate(() => { const w = (window as any).__ctx.w; w.inspection.phase = 'idle'; });
    // food fight: brawl clouds over the canteen
    const cc = await roomCentre(p, 'canteen');
    if (cc) {
      await p.evaluate(() => {
        const w = (window as any).__ctx.w, c = w.rooms.find((q: any) => q.type === 'canteen' && q.built);
        const rs = w.agents.filter((a: any) => a.kind === 'rascal' && a.bed > 0).slice(0, 3);
        rs.forEach((a: any, i: number) => { a.x = c.x + 1 + i * 0.9; a.y = c.y + c.h - 0.6; a.state = 'brawling'; a.act = null; a.moving = false; });
        w.director.active = 'food'; w.director.activeSinceMs = w.rtMs;
      });
      await p.evaluate(() => (window as any).__step(8));
      await focus(p, cc.x, cc.y + 0.5, 1.5);
      await shot('06-foodfight');
    }
    // parcels: shaded unowned land, rope line, sale signs, lighthouse (lit) – wide view, then the roll-out of parcel 2
    await p.evaluate(() => { const w = (window as any).__ctx.w; w.prestige.completedSites = []; w.coins = Math.max(w.coins, 50000); w.parcels = w.parcels.map((_: boolean, k: number) => k === 0); });
    await p.evaluate(async () => { const w = (window as any).__ctx.w; const { applyParcels, rebuild } = await import('/src/sim/world.ts' as string); applyParcels(w); rebuild(w); });
    await p.evaluate(() => (window as any).__step(4));
    await focus(p, 18, 13, 0.5);
    await shot('07-parcels-locked-site2');
    await p.evaluate(() => { const c = (window as any).__ctx; c.cmd.buyParcel(c.w, 1); });
    await p.evaluate(() => (window as any).__step(18));
    await focus(p, 22, 15, 0.75);
    await shot('08-parcel2-rollout');
    await p.evaluate(() => (window as any).__step(60));
    await p.evaluate(() => { const w = (window as any).__ctx.w; w.prestige.completedSites = [1]; w.t = Math.floor(w.t / 1440) * 1440 + 23 * 60; });
    await p.evaluate(() => (window as any).__step(30));
    await focus(p, 33, 4, 1);
    await shot('09-site2-lit-night');
    if (errs.length) console.log(`[${tag}] page errors:\n` + errs.slice(0, 10).join('\n'));
    // montage of the scene shots (3 columns)
    const list = shots.map(f => ['-i', f]).flat();
    const n = shots.length, cols = 3, rows = Math.ceil(n / cols);
    const tw = Math.round(W / 2), th = Math.round(H / 2);
    const filt = shots.map((_, i) => `[${i}:v]scale=${tw}:${th}[s${i}]`).join(';') + ';' + shots.map((_, i) => `[s${i}]`).join('') + `xstack=inputs=${n}:layout=` + shots.map((_, i) => `${(i % cols) * tw}_${Math.floor(i / cols) * th}`).join('|') + `:fill=0x1f2b3e[o]`;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...list, '-filter_complex', filt, '-map', '[o]', '-frames:v', '1', `${OUT}montage-${tag}.png`]);
    void rows;
    await p.close();
  }
  await b.close();
  writeFileSync(OUT + 'drawcalls.json', JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1));
}
main().catch(e => { console.error(e); process.exit(1); });
