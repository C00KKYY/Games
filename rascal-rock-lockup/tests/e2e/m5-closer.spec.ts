/**
 * Closer M5 (verifier findings): a tap ANYWHERE inside the guide's dashed footprint builds exactly that footprint – the
 * build tool used to centre the minimum room on the tapped tile, so a tap off the centre built elsewhere or failed with
 * "Outside your land" (fresh play at 907×510, 5:53). Mouse (click) and touch (tap + ✓).
 */
import { test, expect } from '@playwright/test';
import { setup, gotoGame } from './helpers';
import { instr, hook, stepN, tileToScreen, type Win } from './accept-kit';

for (const touch of [false, true]) {
  test.describe(`guide spot tap (${touch ? 'touch' : 'mouse'})`, () => {
    test.use({ viewport: touch ? { width: 844, height: 390 } : { width: 907, height: 510 }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
    test(`a tap on a corner tile of the dashed footprint builds the footprint (${touch ? 'touch' : 'mouse'})`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.addInitScript(instr);
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(String(e)));
      await setup(page);
      await gotoGame(page, 'capture=1&lang=en', 0);
      await hook(page);
      await stepN(page, 2);
      // tutorial skipped (skip path, D9); coins for the first build goal plus tonight's wages; the guide names the room
      await page.evaluate(() => { const g = window as unknown as Win; g.__ctx.cmd.skipTutorial(g.__sim); g.__sim.coins = 5000; });
      let goal: { kind: string; type?: string } | null = null;
      for (let i = 0; i < 40 && !goal?.type; i++) { await stepN(page, 10); goal = await page.evaluate(() => (window as unknown as Win).__tutorial.guide()); }
      expect(goal?.type, `guide step ${JSON.stringify(goal)}`).toBeTruthy();
      await page.evaluate(t => { const g = window as unknown as Win; g.__ctx.tool.set({ kind: 'build', type: t }); }, goal!.type);
      await stepN(page, 10);
      const spot = await page.evaluate(() => (window as unknown as Win).__ctx.guideSpot.get());
      expect(spot, 'the guide shows a footprint for the goal room').not.toBeNull();
      expect(spot.type).toBe(goal!.type);
      // centre the camera on the footprint, then tap its bottom-right corner tile (far from the centre tile)
      await page.evaluate(([x, y]) => (window as unknown as Win).__ctx.focusTile(x, y), [spot.x + spot.w / 2, spot.y + spot.h / 2]);
      await stepN(page, 40);
      const p = await tileToScreen(page, spot.x + spot.w - 0.5, spot.y + spot.h - 0.5);
      expect(p.canvas, `corner tile is on the canvas (${p.under})`).toBe(true);
      if (touch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
      await stepN(page, 4);
      if (touch) {
        const yes = page.locator('.tl-confirm:not([hidden]) .tl-yes');
        await expect(yes).toBeVisible();
        const b = (await yes.boundingBox())!;
        await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
        await stepN(page, 4);
      }
      const rooms = await page.evaluate(t => (window as unknown as Win).__sim.rooms.filter((r: { type: string }) => r.type === t).map((r: { x: number; y: number; w: number; h: number }) => ({ x: r.x, y: r.y, w: r.w, h: r.h })), spot.type);
      expect(rooms).toContainEqual({ x: spot.x, y: spot.y, w: spot.w, h: spot.h });
      expect(errors).toEqual([]);
    });
  });
}
