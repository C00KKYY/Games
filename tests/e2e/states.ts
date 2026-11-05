/* eslint-disable @typescript-eslint/no-explicit-any -- in-page code reads untyped window hooks (__ctx, __game) */
/**
 * Shared UI states for the M3 acceptance specs (m3-ui.spec.ts, m3-layout.spec.ts): one place that knows how to open
 * every main HUD state, every confirmation sub-state and the transient layers (tooltip, toast), so B1/B3/B4/B5/B6/D5
 * all measure the same set.
 *
 * States are entered through the runtime hooks (window.__ctx, window.__game) or real input where no hook exists:
 *   base · rooms menu · staff menu · room panel · rascal panel · build tool (cursor label) · demolish tool ·
 *   settings · help · clipboard goal list · topbar stage list (collapse level 6 only) ·
 *   room-panel demolish confirm (.pn-yes / .pn-no) · canvas demolish bubble (.tl-byes / .tl-bno) ·
 *   touch build ✓ / ✕ (.tl-yes / .tl-no) · settings reset confirm (reset-yes / reset-no) ·
 *   hover tooltip (.ov-tip) · toasts (.ov-toast, the three kinds)
 */
import { expect, type Page } from '@playwright/test';
import { setup, gotoGame } from './helpers';

/** mid-game state: casual bot, 300 s warped (rooms, staff, agents exist) */
export const MID = 'bot=casual&warp=300';

export type StateName =
  | 'base' | 'rooms' | 'staff' | 'room' | 'rascal' | 'build' | 'demolish' | 'settings' | 'help' | 'clipList' | 'stageList'
  | 'roomConfirm' | 'demoBubble' | 'touchConfirm' | 'resetConfirm' | 'tip' | 'toast' | 'clipCard';

/** every main state and every confirmation sub-state */
export const ALL_STATES: StateName[] = [
  'base', 'rooms', 'staff', 'room', 'rascal', 'build', 'demolish', 'settings', 'help', 'clipList', 'stageList',
  'roomConfirm', 'demoBubble', 'touchConfirm', 'resetConfirm',
];
/** transient layers: a visible hover tooltip and a stack of toasts */
export const TRANSIENT: StateName[] = ['tip', 'toast'];
/** states that exist in a fresh game (tutorial clipboard with step 1/4 and the Skip button) */
export const TUTORIAL_STATES: StateName[] = ['base', 'clipCard', 'rooms', 'staff', 'room', 'build', 'settings', 'resetConfirm', 'demoBubble', 'touchConfirm'];

/** what must be visible once a state is entered (also re-checked after measuring states that time out) */
export const STATE_PROBE: Partial<Record<StateName, string>> = {
  rooms: '.bb-menu--rooms', staff: '.bb-menu--staff', room: '.pn', rascal: '.pn', build: '.tl-label', settings: '.ov-modal',
  help: '.ov-modal', clipList: '.cb-list', stageList: '.tb-list', roomConfirm: '.pn-yes', demoBubble: '.tl-bubble',
  touchConfirm: '.tl-confirm', resetConfirm: '[data-fid="reset-yes"]', tip: '.ov-tip.on', toast: '.ov-toast', clipCard: '.cb-card',
};

export const ctxEval = <T>(page: Page, fn: (ctx: any) => T) => page.evaluate(`(${fn.toString()})(window.__ctx)`) as Promise<T>;

export async function visible(page: Page, sel: string) {
  return page.evaluate(s => [...document.querySelectorAll(s)].some(e => e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && e.getBoundingClientRect().width > 0), sel);
}

/**
 * CSS transitions run on wall-clock time; under SwiftShader with a parallel worker a panel fade-in can still be at
 * opacity .15 after a fixed wait. Wait until every finite CSS animation/transition has finished; infinite ones
 * (bottleneck pulse) are ignored.
 */
export async function settleCss(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every(a =>
    a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity), null, { timeout: 15_000, polling: 100 });
}

/** load the game through helpers.setup (SDK mock, foreign-request guard) and pause it so the HUD holds still */
export async function load(page: Page, query = MID) {
  const guard = await setup(page);
  await gotoGame(page, query);
  await ctxEval(page, ctx => ctx.setPaused(true));
  await page.waitForTimeout(200);
  return guard;
}

/** back to the plain HUD: nothing open, no tool, no selection, no toast */
export async function reset(page: Page) {
  await page.mouse.move(2, 2);
  await ctxEval(page, ctx => { ctx.closeModal(); ctx.menu.set(null); ctx.tool.set({ kind: 'none' }); ctx.selection.set(null); });
  // the clipboard list/card and the topbar stage list close on Esc (capture phase)
  for (let i = 0; i < 3; i++) {
    if (!(await visible(page, '.cb-list, .tb-list')) && !(await page.evaluate(() => !!document.querySelector('.cb--open, .cb-card.open')))) break;
    await page.keyboard.press('Escape');
  }
  await ctxEval(page, ctx => { ctx.selection.set(null); ctx.menu.set(null); });
  // toasts opened by the 'toast' state carry a long lifetime: drop them
  await page.evaluate(() => document.querySelectorAll('.ov-toast').forEach(e => e.remove()));
  await page.waitForTimeout(150);
}

/** a point on the world canvas (not covered by any HUD element) at the centre of a room, or null */
async function roomPoint(page: Page, types: string[]) {
  return page.evaluate(ts => {
    const g = window as any;
    const rooms = g.__ctx.w.rooms as { id: number; type: string; x: number; y: number; w: number; h: number; built?: boolean }[];
    const cam = g.__game.cam;
    const cands = [...rooms].sort((a, b) => (ts.indexOf(a.type) + 1 || 99) - (ts.indexOf(b.type) + 1 || 99));
    for (const r of cands) {
      for (const [fx, fy] of [[0.5, 0.5], [0.3, 0.4], [0.7, 0.6], [0.5, 0.25], [0.5, 0.75]]) {
        const s = cam.worldToScreen((r.x + r.w * fx) * 32, (r.y + r.h * fy) * 32);
        if (s.x < 4 || s.y < 4 || s.x > innerWidth - 4 || s.y > innerHeight - 4) continue;
        const hit = document.elementFromPoint(s.x, s.y);
        if (hit && hit.id === 'world') return { id: r.id, type: r.type, x: s.x, y: s.y };
      }
    }
    return null;
  }, types);
}

/** free points on the canvas (not under any HUD element), nearest to the middle of the viewport first */
async function canvasPoints(page: Page, n = 1) {
  return page.evaluate(k => {
    const out: { x: number; y: number }[] = [];
    for (let r = 0; r < Math.max(innerWidth, innerHeight) / 2 && out.length < k; r += 24) for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
      const x = innerWidth / 2 + dx, y = innerHeight / 2 + dy;
      if (out.length < k && !out.some(q => q.x === x && q.y === y) && document.elementFromPoint(x, y)?.id === 'world') out.push({ x, y });
    }
    return out;
  }, n);
}
const canvasPoint = async (page: Page) => (await canvasPoints(page, 1))[0] ?? null;

/** enter a state; returns false only when the state does not exist at this viewport (stage list above collapse level 6) */
export async function enter(page: Page, s: StateName): Promise<boolean> {
  let keepPointer = false;
  switch (s) {
    case 'base': break;
    case 'rooms': case 'staff':
      await ctxEval(page, ctx => ctx.menu.set(null));
      await page.evaluate(m => (window as any).__ctx.menu.set(m), s);
      break;
    case 'room': case 'roomConfirm':
      await ctxEval(page, ctx => {
        const rooms = ctx.w.rooms as { id: number; type: string }[];
        const r = rooms.find(x => x.type === 'workshop') ?? rooms.find(x => x.type === 'bunk') ?? rooms.find(x => x.type === 'canteen') ?? rooms[0];
        ctx.selection.set({ kind: 'room', id: r.id });
      });
      await expect.poll(() => visible(page, '.pn'), { message: 'room panel opens' }).toBe(true);
      if (s === 'roomConfirm') {
        await settleCss(page);
        await page.locator('.pn .pn-demo').click();
      }
      break;
    case 'rascal':
      await ctxEval(page, ctx => {
        const a = (ctx.w.agents as { id: number; kind: string; flags: number }[]).find(x => x.kind === 'rascal' && !(x.flags & (4 | 64)));
        if (a) ctx.selection.set({ kind: 'agent', id: a.id });
      });
      break;
    case 'build': {
      await ctxEval(page, ctx => ctx.tool.set({ kind: 'build', type: 'bunk' }));
      const p = (await canvasPoint(page)) ?? { x: page.viewportSize()!.width / 2, y: page.viewportSize()!.height / 2 };
      await page.mouse.move(p.x - 10, p.y - 6);
      await page.mouse.move(p.x, p.y);
      keepPointer = true;    // the cursor label follows the mouse: leaving the canvas would hide it
      break;
    }
    case 'demolish': await ctxEval(page, ctx => ctx.tool.set({ kind: 'demolish' })); break;
    case 'demoBubble': {
      await ctxEval(page, ctx => ctx.tool.set({ kind: 'demolish' }));
      await page.waitForTimeout(150);
      // a room that may be demolished (bubble with refund + Demolish button); the fresh game only has protected rooms,
      // there the locked bubble (reason, no Demolish button) is measured
      const p = await roomPoint(page, ['workshop', 'wash', 'classroom', 'guard', 'bunk', 'canteen']);
      expect(p, 'a room centre on the canvas to click in demolish mode').not.toBeNull();
      await page.mouse.click(p!.x, p!.y);
      break;
    }
    case 'touchConfirm': {
      // one finger "drag" in the build tool → the rectangle waits for ✓ / ✕ (docs/UI_DESIGN.md §4). Synthetic touch
      // pointer events on the canvas, so this works in desktop contexts as well (pointerId 1 = the always-active primary
      // pointer, so the camera's setPointerCapture does not throw)
      await ctxEval(page, ctx => ctx.tool.set({ kind: 'build', type: 'bunk' }));
      const pts = await canvasPoints(page, 40);
      expect(pts.length, 'free canvas points for the touch build gesture').toBeGreaterThan(0);
      // prefer a valid spot (green ✓); a new gesture replaces the waiting rectangle. If no spot is valid the
      // disabled-looking ✓ (.off) is measured instead – also a real state
      for (const p of pts) {
        await page.evaluate(({ x, y }) => {
          const c = document.getElementById('world')!;
          const ev = (type: string, cx: number, cy: number, buttons: number) => c.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: cy, button: 0, buttons, bubbles: true, cancelable: true }));
          ev('pointerdown', x, y, 1); ev('pointermove', x + 3, y + 2, 1); ev('pointerup', x + 3, y + 2, 0);
        }, p);
        await page.waitForTimeout(250);
        if (await visible(page, '.tl-yes:not(.off)')) break;
      }
      break;
    }
    case 'settings': case 'help': case 'resetConfirm':
      await page.evaluate(m => (window as any).__ctx.openModal(m), s === 'resetConfirm' ? 'settings' : s);
      await expect.poll(() => visible(page, '.ov-modal'), { message: `${s} modal opens` }).toBe(true);
      if (s === 'resetConfirm') { await settleCss(page); await page.locator('.ov-modal [data-fid="reset"]').click(); }
      break;
    case 'clipCard':
      // the expanded clipboard card (compact: the chip opens it; wide: it is always open). In the tutorial its Skip shows
      // only when the warden bubble (which carries the one Skip on screen) is not shown – compact expanded card
      if (!(await visible(page, '.cb-card'))) await page.locator('.cb-chip').click();
      break;
    case 'clipList':
      // compact: the chip expands the card first
      if (!(await visible(page, '.cb-more'))) await page.locator('.cb-chip').click();
      await expect.poll(() => visible(page, '.cb-more'), { message: 'clipboard card shows "all goals"' }).toBe(true);
      await page.locator('.cb-more').click();
      break;
    case 'stageList':
      if (!(await visible(page, '.tb .flow .sum'))) return false;
      await page.locator('.tb .flow .sum').click();
      break;
    case 'tip': {
      // the build-bar "Rooms" button: name, effect and hotkey (the longest regular tooltip on the plain HUD)
      const b = page.locator('.bb-bar button[data-tip]').first();
      await b.hover();
      keepPointer = true;
      break;
    }
    case 'toast':
      // one toast of every kind with the longest regular texts (day ledger, unpaid wages, objective)
      await ctxEval(page, ctx => {
        ctx.toast(ctx.t('overlays.toast.dayEnd', { day: 12, earned: ctx.fmt(12450), wages: ctx.fmt(1185), released: 14 }), { kind: 'info', icon: 'coin', ms: 120000 });
        ctx.toast(ctx.t('overlays.toast.unpaid', { wages: ctx.fmt(1185) }), { kind: 'bad', icon: 'staff', ms: 120000 });
        ctx.toast(ctx.t('overlays.toast.unlockRoom', { room: ctx.t('room.workshop') }), { kind: 'good', icon: 'rooms', ms: 120000 });
      });
      await page.waitForTimeout(300);   // toasts are positioned in the throttled update
      break;
  }
  const probe = STATE_PROBE[s];
  if (probe) await expect.poll(() => visible(page, probe), { message: `state ${s}: ${probe} visible`, timeout: 10_000 }).toBe(true);
  if (!keepPointer) await page.mouse.move(2, 2);   // no hover tooltip in the measurement
  await page.waitForTimeout(450);                  // open animations (≤ .18 s) and throttled DOM writes (≤ 10/s)
  await settleCss(page);
  if (probe) expect(await visible(page, probe), `state ${s}: ${probe} still visible after settling`).toBe(true);
  return true;
}

/** run `fn` in every state; returns the list of states actually visited */
export async function eachState(page: Page, states: StateName[], fn: (s: StateName) => Promise<void>): Promise<StateName[]> {
  const done: StateName[] = [];
  for (const s of states) {
    await reset(page);
    if (!(await enter(page, s))) continue;
    await fn(s);
    done.push(s);
  }
  await reset(page);
  return done;
}
