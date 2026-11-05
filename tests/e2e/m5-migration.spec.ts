/**
 * M5 contract in the browser: an M4 (v1) save in the SDK data module loads through the v1 → v2 migration, the
 * session start runs (offline plan, mail day from the injected clock, completion report) and the next save is v2.
 */
import { test, expect } from '@playwright/test';
import LZString from 'lz-string';
import { setup, gotoGame } from './helpers';
import { newGame, cmd, flushEvents } from '../../src/sim/sim';
import { worldToPlain, crc32, DEFAULT_SETTINGS, SLOT_KEYS, type SaveDoc } from '../../src/save/serialize';

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const M5_KEYS = ['projects', 'leads', 'taps', 'inspection', 'prestige', 'mail', 'vip', 'wall', 'offline'];

function v1Save(savedAt: number): string {
  const w = newGame(3);
  cmd.skipTutorial(w);
  expect(cmd.build(w, 'wash', 1, 13, 3, 3).ok).toBe(true);
  flushEvents(w);
  const plain = worldToPlain(w);
  for (const k of M5_KEYS) delete plain[k];
  const doc: SaveDoc = { v: 1, seq: 4, savedAt, settings: DEFAULT_SETTINGS, world: plain };
  const json = JSON.stringify(doc);
  return `${crc32(json).toString(16)}:${LZString.compressToBase64(json)}`;
}

test('an M4 save migrates to v2 in the browser; session start + completion report run; the next save is v2', async ({ page }) => {
  const now = Date.UTC(2026, 10, 5, 9, 0);
  await setup(page, { mock: { data: { [SLOT_KEYS[0]]: v1Save(now - 20 * 60_000) } } });
  await gotoGame(page, `?clock=${now}&tz=60`, 0);
  const s = await page.evaluate(() => {
    const g = window as unknown as Win, w = g.__sim;
    return {
      loaded: g.__save.state().loaded as string,
      wash: (w.rooms as { type: string; x: number; y: number }[]).some(r => r.type === 'wash' && r.x === 1 && r.y === 13),
      slots: w.leads.slots as unknown[], mailTasks: (w.mail.tasks as unknown[]).length, sessions: w.wall.sessions as number,
      pending: w.offline.pending as { awayMs: number } | null,
      reports: (g.__sdkCalls as { n: string; a: unknown }[]).filter(c => c.n === 'reportGameCompletedPercentage').map(c => c.a),
    };
  });
  expect(s.loaded).toBe('ok');
  expect(s.wash).toBe(true);
  expect(s.slots).toEqual([null, null]);
  expect(s.mailTasks).toBe(3);
  expect(s.sessions).toBe(1);
  expect(s.pending?.awayMs).toBe(20 * 60_000); // ≥ 5 min → offline formula → return panel data
  expect(s.reports).toContain(0);
  await page.evaluate(() => (window as unknown as Win).__save.flush());
  const v = await page.evaluate(async (key) => {
    const raw = (window as unknown as Win).__sdkMock.store[key] as string;
    return raw ? raw.length : 0;
  }, SLOT_KEYS[1]);
  expect(v).toBeGreaterThan(0);
  const doc = await page.evaluate((key) => (window as unknown as Win).__sdkMock.store[key] as string, SLOT_KEYS[1]);
  const json = LZString.decompressFromBase64(doc.slice(doc.indexOf(':') + 1))!;
  const parsed = JSON.parse(json) as SaveDoc;
  expect(parsed.v).toBe(2);
  for (const k of M5_KEYS) expect(parsed.world[k], k).toBeTruthy();
});
