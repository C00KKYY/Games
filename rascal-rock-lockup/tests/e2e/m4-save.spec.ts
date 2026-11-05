/**
 * M4 saving (Brief §9.2.4, §9.7, §6.1): A5, A5b, reload keeps progress, settings persist, failure modes.
 *
 * crazygames.com behaviour (8 s timeout, locked mode, late init) is tested for real: the page is served under
 * https://game.crazygames.com/ – every request to that host is answered from the preview server (route.fetch), so
 * location.hostname matches the CrazyGames rule in src/platform/crazygames.ts. The SDK still goes to the mock.
 */
import { test, expect, type Page } from '@playwright/test';
import { setup, gotoGame } from './helpers';

const CG = 'https://game.crazygames.com/';
type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** serve the game under a crazygames.com hostname (registered after setup(), so it wins over its catch-all route) */
async function serveOnCrazyGames(page: Page, baseURL: string) {
  const base = baseURL.replace(/\/$/, '');
  await page.route(/^https:\/\/game\.crazygames\.com\//, async route => {
    const u = new URL(route.request().url());
    try {
      const resp = await route.fetch({ url: base + u.pathname + u.search });
      await route.fulfill({ response: resp });
    } catch { await route.abort().catch(() => undefined); } // page already closing
  });
}
async function waitBoot(page: Page, timeout = 60_000) {
  await page.waitForFunction(() => {
    const g = window as unknown as Win;
    return !!g.__ctx && !!g.__game && !!document.getElementById('boot')?.classList.contains('gone');
  }, null, { timeout });
}
const rrlLocalKeys = (page: Page) => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('rrl')));
const dataCalls = (page: Page) => page.evaluate(() => ((window as unknown as Win).__sdkCalls as { n: string; inited: boolean }[]).filter(c => /getItem|setItem|removeItem|clear|BEFORE_INIT/.test(c.n)));
/** build the tutorial wash house (always valid on a fresh map) through the command API */
const buildRoom = (page: Page) => page.evaluate(() => {
  const g = window as unknown as Win;
  const r = g.__ctx.cmd.build(g.__sim, 'wash', 1, 13, 3, 3);
  return { ok: r.ok as boolean, rooms: (g.__sim.rooms as unknown[]).length };
});
const roomsAt = (page: Page) => page.evaluate(() => ((window as unknown as Win).__sim.rooms as { type: string; x: number; y: number }[]).map(r => `${r.type}@${r.x},${r.y}`).sort());

test.describe('M4 save', () => {
  test('A5 (localhost): an SDK whose init never resolves does not block the start; the SDK data module is never touched', async ({ page }) => {
    await setup(page, { mock: { neverResolve: true } });
    const t0 = Date.now();
    await gotoGame(page, '', 0);
    const bootMs = Date.now() - t0;
    expect(bootMs).toBeLessThan(15_000);
    expect((await buildRoom(page)).ok).toBe(true);
    await page.evaluate(() => (window as unknown as Win).__save.flush());
    expect(await dataCalls(page)).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as Win).__sdkCalls.some((c: { n: string }) => c.n.startsWith('BEFORE_INIT')))).toBe(false);
  });

  test('A5 (crazygames.com): init never resolves → the game starts after the 8 s timeout in locked mode and saves NOTHING', async ({ page, baseURL }) => {
    await setup(page, { mock: { neverResolve: true } });
    await serveOnCrazyGames(page, baseURL!);
    const t0 = Date.now();
    await page.goto(CG);
    await waitBoot(page);
    const bootMs = Date.now() - t0;
    console.log(`[A5] boot on crazygames.com with a never-resolving init: ${bootMs} ms`);
    expect(bootMs).toBeLessThan(20_000);
    expect(await page.evaluate(() => (window as unknown as Win).__save.state().saveState)).toBe('locked');
    // play: an important action, the autosave debounce, a hidden tab and a forced flush – none may write
    expect((await buildRoom(page)).ok).toBe(true);
    await page.waitForTimeout(2600);
    await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); (window as unknown as Win).__save.flush(); });
    expect(await dataCalls(page)).toEqual([]);
    expect(await page.evaluate(() => Object.keys((window as unknown as Win).__sdkMock.store))).toEqual([]);
    expect(await rrlLocalKeys(page)).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as Win).__save.state().writes)).toBe(0);
    // the world is fully playable
    expect(await page.evaluate(() => (window as unknown as Win).__sim.rtMs)).toBeGreaterThan(1000);
  });

  test('A5b: init delayed 8 s with an existing save → the save stays byte-identical until init, then it is loaded (cross-fade + toast)', async ({ browser, baseURL }) => {
    // 1) make a real save on crazygames.com (fast init → SDK data module)
    const p1 = await browser.newPage();
    await setup(p1);
    await serveOnCrazyGames(p1, baseURL!);
    await p1.goto(CG);
    await waitBoot(p1);
    expect(await p1.evaluate(() => (window as unknown as Win).__save.state().saveState)).toBe('ok');
    expect((await buildRoom(p1)).ok).toBe(true);
    await p1.evaluate(() => { const g = window as unknown as Win; g.__sim.coins += 777; g.__save.flush(); g.__save.flush(); });
    const saved = await p1.evaluate(() => ({ ...(window as unknown as Win).__sdkMock.store })) as Record<string, string>;
    const savedRooms = await roomsAt(p1);
    const savedCoins = await p1.evaluate(() => (window as unknown as Win).__sim.coins as number);
    expect(Object.keys(saved).sort()).toEqual(['rrl_save_a', 'rrl_save_b']);
    expect(await rrlLocalKeys(p1)).toEqual([]); // on CrazyGames only the data module is used
    await p1.close();

    // 2) new session: SDK script 2 s late + init 8 s → boot timeout (locked mode), then late init
    const page = await browser.newPage();
    const logs: string[] = [];
    page.on('console', m => logs.push(`${m.type()}: ${m.text()}`));
    page.on('pageerror', e => logs.push(`pageerror: ${e.message}`));
    await setup(page, { sdkDelayMs: 2000, mock: { initDelay: 8000, data: saved } });
    await serveOnCrazyGames(page, baseURL!);
    const t0 = Date.now();
    await page.goto(CG);
    await waitBoot(page);
    console.log(`[A5b] booted in locked mode after ${Date.now() - t0} ms`);
    expect(await page.evaluate(() => (window as unknown as Win).__save.state().saveState)).toBe('locked');
    const freshRooms = await roomsAt(page);
    expect(freshRooms).not.toEqual(savedRooms); // a new game runs meanwhile
    // play in locked mode – an important action must not touch the save
    expect((await buildRoom(page)).ok).toBe(true);
    await page.evaluate(() => { const g = window as unknown as Win; g.__lockedSim = g.__sim; });
    let checks = 0;
    while (!(await page.evaluate(() => (window as unknown as Win).__platform.initOk))) {
      const st = await page.evaluate(() => ({ ...(window as unknown as Win).__sdkMock.store }));
      if (!(await page.evaluate(() => (window as unknown as Win).__platform.initOk))) expect(st).toEqual(saved); // byte-identical
      expect((await dataCalls(page)).filter(c => !c.inited || c.n.startsWith('BEFORE_INIT'))).toEqual([]); // no data call before init
      checks++;
      await page.waitForTimeout(250);
    }
    expect(checks).toBeGreaterThan(0);
    // the data module content at the moment init resolved is exactly the old save (snapshot taken by the mock)
    expect(JSON.parse(await page.evaluate(() => (window as unknown as Win).__sdkMock.storeAtInit))).toEqual(saved);
    // late init → cross-fade to the saved world (a new World object replaces the locked-mode one)
    await page.waitForFunction(() => (window as unknown as Win).__sim !== (window as unknown as Win).__lockedSim, null, { timeout: 10_000 });
    await expect(page.locator('.ov-toast', { hasText: 'Progress restored' })).toBeVisible({ timeout: 5000 });
    expect(await roomsAt(page)).toEqual(savedRooms);
    expect(await page.evaluate(() => (window as unknown as Win).__sim.coins as number)).toBeGreaterThanOrEqual(savedCoins - 50);
    // nothing was written before init; the newest slot (b, seq 2) is still byte-identical right after loading
    const writes = await page.evaluate(() => (window as unknown as Win).__sdkMock.dataWrites as { k: string; inited: boolean }[]);
    expect(writes.every(x => x.inited)).toBe(true);
    const now = await page.evaluate(() => ({ ...(window as unknown as Win).__sdkMock.store })) as Record<string, string>;
    if (!writes.some(x => x.k === 'rrl_save_b')) expect(now.rrl_save_b).toBe(saved.rrl_save_b);
    // the re-mounted UI works on the new world: HUD present, the canvas fade is gone, saving continues
    await page.waitForFunction(() => !document.querySelector('[data-overlay="save-fade"]'), null, { timeout: 3000 });
    expect(await page.locator('.hud [data-hud="top"]').count()).toBeGreaterThan(0);
    await page.evaluate(() => (window as unknown as Win).__save.flush());
    expect(await page.evaluate(() => (window as unknown as Win).__save.state().saveState)).toBe('ok');
    expect(await page.evaluate(() => (window as unknown as Win).__sdkMock.dataWrites.length)).toBeGreaterThan(0);
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => (window as unknown as Win).__sim.rtMs)).toBeGreaterThan(500); // new world ticks
    expect(logs.filter(l => l.startsWith('error') || l.startsWith('pageerror'))).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('a5b-after-restore.png') });
    await page.close();
  });

  test('init fails for good on crazygames.com → play on, subtle "Progress can\'t be saved right now"', async ({ page, baseURL }) => {
    await setup(page, { mock: { initError: true } });
    await serveOnCrazyGames(page, baseURL!);
    await page.goto(CG);
    await waitBoot(page);
    await expect(page.locator('.ov-toast', { hasText: "Progress can't be saved right now" })).toBeVisible({ timeout: 5000 });
    expect(await page.evaluate(() => (window as unknown as Win).__save.state().saveState)).toBe('failed');
    expect((await buildRoom(page)).ok).toBe(true);
    await page.evaluate(() => (window as unknown as Win).__save.flush());
    expect(await rrlLocalKeys(page)).toEqual([]);
    expect(await dataCalls(page)).toEqual([]);
  });

  test('reload keeps progress: a built room is saved by the action autosave (≤ 2 s) and is there after reload', async ({ page }) => {
    await setup(page, { mock: { persist: true } });
    await gotoGame(page, '', 0);
    expect(await page.evaluate(() => (window as unknown as Win).__save.state().loaded)).toBe('none');
    const b = await buildRoom(page);
    expect(b.ok).toBe(true);
    const before = await roomsAt(page);
    // the build event triggers a save within the 2 s debounce – no manual flush
    await page.waitForFunction(() => (window as unknown as Win).__sdkMock.dataWrites.length > 0, null, { timeout: 10_000 });
    const w = await page.evaluate(() => (window as unknown as Win).__sdkMock.dataWrites as { k: string; len: number }[]);
    console.log(`[reload] first autosave: ${w[0].k}, ${(w[0].len / 1024).toFixed(1)} KB`);
    expect(w[0].len).toBeLessThan(150 * 1024);
    await page.reload();
    await waitBoot(page);
    expect(await page.evaluate(() => (window as unknown as Win).__save.state().loaded)).toBe('ok');
    expect(await roomsAt(page)).toEqual(before);
    expect(before).toContain('wash@1,13');
    // returning players land straight in their save: no menu, the world runs
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => (window as unknown as Win).__sim.speed)).toBeGreaterThan(0);
  });

  test('settings persist inside the save (mute + language), restored before the UI renders, not in a separate localStorage key', async ({ page }) => {
    await setup(page, { mock: { persist: true } });
    await gotoGame(page, '', 300);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
    await page.evaluate(() => (window as unknown as Win).__ctx.openModal('settings'));
    await page.locator('.ov-modal [data-fid="sw-mute"]').click();
    await page.locator('.ov-modal [data-fid="lang-de"]').click();
    expect(await page.evaluate(() => (window as unknown as Win).__ctx.settings.get())).toMatchObject({ mute: true, lang: 'de' });
    await page.waitForFunction(() => (window as unknown as Win).__sdkMock.dataWrites.length > 0, null, { timeout: 10_000 });
    expect(await rrlLocalKeys(page)).toEqual([]);
    // the very first rendered HUD after the reload is German (no EN flash): record the topbar's first text
    await page.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as Win).__firstLang = seen;
      new MutationObserver(() => { if (!seen.length && document.querySelector('.hud [data-hud="top"]')) seen.push(document.documentElement.lang); }).observe(document, { subtree: true, childList: true });
    });
    await page.reload();
    await waitBoot(page);
    expect(await page.evaluate(() => (window as unknown as Win).__firstLang)).toEqual(['de']);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('de');
    expect(await page.evaluate(() => (window as unknown as Win).__ctx.settings.get())).toMatchObject({ mute: true, lang: 'de' });
    await page.evaluate(() => (window as unknown as Win).__ctx.openModal('settings'));
    await expect(page.locator('.ov-modal [data-fid="lang-de"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a saved language wins over the SDK locale; ?lang wins over both', async ({ page }) => {
    await setup(page, { mock: { persist: true, locale: 'de-DE' } });
    await gotoGame(page, '', 0);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('de');
    await page.evaluate(() => { const g = window as unknown as Win; g.__ctx.setLang('en'); g.__save.flush(); });
    await page.reload();
    await waitBoot(page);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
  });

  test('dataModuleDisabled → falls back to localStorage with a console warning, progress still survives a reload', async ({ page }) => {
    const warns: string[] = [];
    page.on('console', m => { if (m.type() === 'warning') warns.push(m.text()); });
    await setup(page, { mock: { dataError: 'dataModuleDisabled' } });
    await gotoGame(page, '', 0);
    expect((await buildRoom(page)).ok).toBe(true);
    await page.evaluate(() => (window as unknown as Win).__save.flush());
    expect(warns.some(w => w.includes('dataModuleDisabled'))).toBe(true);
    expect(await page.evaluate(() => (window as unknown as Win).__platform.storageKind())).toBe('local-fallback');
    expect((await rrlLocalKeys(page)).length).toBeGreaterThan(0);
    const before = await roomsAt(page);
    await page.reload();
    await waitBoot(page);
    expect(await roomsAt(page)).toEqual(before);
  });

  test('a damaged newest slot falls back to the other slot with a friendly hint; never a crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await setup(page, { mock: { persist: true } });
    await gotoGame(page, '', 0);
    expect((await buildRoom(page)).ok).toBe(true);
    await page.evaluate(() => { const g = window as unknown as Win; g.__save.flush(); g.__sim.coins += 5000; g.__save.flush(); });
    const coinsA = await page.evaluate(() => (window as unknown as Win).__sim.coins - 5000);
    // tear the newest slot (the one the last flush wrote) as an interrupted write would
    await page.evaluate(() => {
      const raw = JSON.parse(sessionStorage.getItem('__sdkMockData')!);
      const newest = ['rrl_save_a', 'rrl_save_b'][1 - (window as unknown as Win).__save.store.next];
      raw[newest] = raw[newest].slice(0, Math.floor(raw[newest].length / 2));
      sessionStorage.setItem('__sdkMockData', JSON.stringify(raw));
      // block the pagehide save of the running page so the torn slot survives the reload
      (window as unknown as Win).__save.store.storage = () => null;
    });
    await page.reload();
    await waitBoot(page);
    await expect(page.locator('.ov-toast', { hasText: 'previous save' })).toBeVisible({ timeout: 5000 });
    expect(await page.evaluate(() => (window as unknown as Win).__sim.coins as number)).toBeLessThan(coinsA + 1000);
    expect(await roomsAt(page)).toContain('wash@1,13');
    expect(errors).toEqual([]);
  });

  test('settings "Reset progress" stays reset: the pagehide save of the reloading page does not resurrect it (localStorage path)', async ({ page }) => {
    await setup(page, { mock: { neverResolve: true } }); // localhost + no init → localStorage (Brief §9.2.3)
    await gotoGame(page, '', 0);
    expect((await buildRoom(page)).ok).toBe(true);
    await page.evaluate(() => (window as unknown as Win).__save.flush());
    expect((await rrlLocalKeys(page)).length).toBeGreaterThan(0);
    await page.evaluate(() => (window as unknown as Win).__ctx.openModal('settings'));
    await page.locator('.ov-modal [data-fid="reset"]').click();
    await Promise.all([page.waitForEvent('load', { timeout: 30_000 }), page.locator('.ov-modal [data-fid="reset-yes"]').click()]);
    await waitBoot(page);
    expect(await page.evaluate(() => (window as unknown as Win).__save.state().loaded)).toBe('none');
    expect(await roomsAt(page)).not.toContain('wash@1,13');
  });
});
