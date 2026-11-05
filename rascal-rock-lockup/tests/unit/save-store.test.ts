import { describe, it, expect, vi } from 'vitest';
import { newGame, runFor, cmd, tick } from '../../src/sim/sim';
import { stateHash } from '../../src/sim/hash';
import { BotDriver } from '../../tools/bots';
import LZString from 'lz-string';
import { crc32, SLOT_KEYS, DEFAULT_SETTINGS, type Settings } from '../../src/save/serialize';
import { SaveStore, Autosave, awayMs, sanitizeSettings } from '../../src/save/store';
import { sdkKV, localKV, type KV } from '../../src/platform/storage';
import type { Storage } from '../../src/platform/platform';

const mem = (): Storage & { m: Map<string, string>; sets: string[] } => {
  const m = new Map<string, string>(), sets: string[] = [];
  return { m, sets, get: k => m.get(k) ?? null, set: (k, v) => { sets.push(k); m.set(k, v); return { ok: true }; }, remove: k => { m.delete(k); } };
};
const kv = (): KV & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return { m, getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } };
};
const played = (seed = 3, ms = 60_000) => { const w = newGame(seed); runFor(w, ms, x => { if (x.ferry.state === 'arriving') cmd.tapHorn(x); }); return w; };

describe('save store (Brief §9.7)', () => {
  it('writes slots A/B alternately with increasing seq; a new session loads the newest and writes the other slot', () => {
    const st = mem(), w = played();
    const s = new SaveStore(() => st, () => 1000);
    for (let i = 0; i < 4; i++) { const r = s.save(w, DEFAULT_SETTINGS); expect(r.ok).toBe(true); }
    expect(st.sets).toEqual([SLOT_KEYS[0], SLOT_KEYS[1], SLOT_KEYS[0], SLOT_KEYS[1]]);
    expect(s.seq).toBe(4);
    const s2 = new SaveStore(() => st);
    const r = s2.load();
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') { expect(r.doc.seq).toBe(4); expect(r.damaged).toBe(false); }
    const before = st.m.get(SLOT_KEYS[1]);
    s2.save(w, DEFAULT_SETTINGS);
    expect(st.sets.at(-1)).toBe(SLOT_KEYS[0]); // newest (B) stays untouched until the next write
    expect(st.m.get(SLOT_KEYS[1])).toBe(before);
    expect(s2.seq).toBe(5);
  });

  it('newest VALID slot wins; a corrupt slot falls back to the other one (damaged → friendly hint)', () => {
    const st = mem(), w = played();
    const s = new SaveStore(() => st);
    s.save(w, DEFAULT_SETTINGS); // A seq 1
    w.coins += 123;
    s.save(w, DEFAULT_SETTINGS); // B seq 2
    st.m.set(SLOT_KEYS[1], st.m.get(SLOT_KEYS[1])!.slice(0, -9) + 'XXXXXXXXX'); // torn write
    const r = new SaveStore(() => st).load();
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') { expect(r.doc.seq).toBe(1); expect(r.damaged).toBe(true); expect(r.world.coins).toBe(w.coins - 123); }
    // the next write repairs the broken slot, the good one survives
    const s3 = new SaveStore(() => st); s3.load();
    const good = st.m.get(SLOT_KEYS[0]);
    s3.save(w, DEFAULT_SETTINGS);
    expect(st.m.get(SLOT_KEYS[0])).toBe(good);
    expect(new SaveStore(() => st).load().kind).toBe('ok');
  });

  it('every slot unreadable → "corrupt" (fresh start + hint), never throws; garbage of any kind is survived', () => {
    for (const junk of ['garbage', ':', 'ffff:', '0:AAAA', '{"v":1}', '\u0000￿', 'deadbeef:' + 'Z'.repeat(5000)]) {
      const st = mem(); st.m.set(SLOT_KEYS[0], junk); st.m.set(SLOT_KEYS[1], junk);
      expect(new SaveStore(() => st).load().kind).toBe('corrupt');
    }
    expect(new SaveStore(() => mem()).load().kind).toBe('none');
    const throwing: Storage = { get: () => { throw new Error('boom'); }, set: () => { throw new Error('boom'); } };
    expect(new SaveStore(() => throwing).load().kind).toBe('none');
    expect(new SaveStore(() => throwing).save(newGame(1), DEFAULT_SETTINGS).ok).toBe(false);
    expect(new SaveStore(() => { throw new Error('platform'); }).available()).toBe(false);
  });

  it('a slot whose CRC is fine but whose world cannot be rebuilt falls back to the other slot', () => {
    const st = mem(), w = played();
    const s = new SaveStore(() => st);
    s.save(w, DEFAULT_SETTINGS);
    // valid envelope and CRC, but a world without a grid, with a higher seq
    const json = JSON.stringify({ v: 1, seq: 9, savedAt: 0, settings: DEFAULT_SETTINGS, world: { rooms: [] } });
    st.m.set(SLOT_KEYS[1], `${crc32(json).toString(16)}:${LZString.compressToBase64(json)}`);
    const r = new SaveStore(() => st).load();
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') { expect(r.doc.seq).toBe(1); expect(r.damaged).toBe(true); }
  });

  it('locked mode (storage null): nothing is read or written', () => {
    let st: Storage | null = null;
    const real = mem();
    const s = new SaveStore(() => st);
    expect(s.available()).toBe(false);
    expect(s.load().kind).toBe('none');
    expect(s.save(newGame(1), DEFAULT_SETTINGS)).toEqual({ ok: false, code: 'locked' });
    expect(real.sets).toEqual([]);
    st = real; // late init unlocks saving
    expect(s.save(newGame(1), DEFAULT_SETTINGS).ok).toBe(true);
    expect(real.sets).toEqual([SLOT_KEYS[0]]);
  });

  it('clear() wipes both slots and blocks every later write (reset progress + reload must not re-save)', () => {
    const st = mem(), s = new SaveStore(() => st);
    s.save(newGame(1), DEFAULT_SETTINGS); s.save(newGame(1), DEFAULT_SETTINGS);
    s.clear();
    expect(st.m.size).toBe(0);
    expect(s.save(newGame(1), DEFAULT_SETTINGS).ok).toBe(false);
    expect(st.m.size).toBe(0);
  });

  it('settings round-trip inside the save doc and are sanitised', () => {
    const st = mem(), s = new SaveStore(() => st);
    const mine: Settings = { music: 0.2, sfx: 0.4, ambience: 0, mute: true, lang: 'de', shake: false };
    s.save(newGame(1), mine);
    const r = new SaveStore(() => st).load();
    expect(r.kind === 'ok' && r.settings).toEqual(mine);
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ music: 7, sfx: -1, ambience: 'x', mute: 'yes', lang: 'fr', shake: 0 })).toEqual({ ...DEFAULT_SETTINGS, music: 1, sfx: 0 });
  });

  it('H4: identical state hash after store save → load before the first tick, and identical future', () => {
    const st = mem(), w = played(7, 120_000);
    new SaveStore(() => st).save(w, DEFAULT_SETTINGS);
    const r = new SaveStore(() => st).load();
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(stateHash(r.world)).toBe(stateHash(w));
    for (let i = 0; i < 2000; i++) { tick(w); tick(r.world); }
    expect(stateHash(r.world)).toBe(stateHash(w));
  });

  it('size budget: a 10-min casual-bot world saves < 150 KB (and encodes fast enough for an autosave)', () => {
    const w = newGame(1); const bot = new BotDriver(w, { profile: 'casual', seed: 1 });
    while (w.rtMs < 600_000) { tick(w); bot.step(); }
    const st = mem(), s = new SaveStore(() => st);
    const t0 = performance.now();
    const r = s.save(w, DEFAULT_SETTINGS);
    const ms = performance.now() - t0;
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bytes).toBeLessThan(150 * 1024);
    console.log(`[save] 10-min bot world: ${r.ok ? (r.bytes / 1024).toFixed(1) : '?'} KB, encode ${ms.toFixed(1)} ms, rooms ${w.rooms.length}, agents ${w.agents.length}`);
    const back = new SaveStore(() => st).load();
    expect(back.kind === 'ok' && stateHash(back.world)).toBe(stateHash(w));
  });

  it('offline time is clamped: negative → 0, +10 years → cap, garbage → 0', () => {
    const H = 3600_000;
    expect(awayMs(1000, 500, 2 * H)).toBe(0);
    expect(awayMs(0, 10 * 365 * 24 * H, 2 * H)).toBe(2 * H);
    expect(awayMs(0, 90_000, 2 * H)).toBe(90_000);
    expect(awayMs(NaN, 5, 2 * H)).toBe(0);
    expect(awayMs(0, Infinity, 2 * H)).toBe(0);
  });
});

describe('storage backends', () => {
  it('dataModuleDisabled → permanent localStorage fallback with a console warning (any call may throw it)', () => {
    const local = kv(), warn = vi.fn();
    const data: KV = { getItem: () => { throw Object.assign(new Error('x'), { code: 'dataModuleDisabled' }); }, setItem: () => { throw Object.assign(new Error('x'), { code: 'dataModuleDisabled' }); }, removeItem: () => undefined };
    const s = sdkKV(() => data, localKV(() => local, warn), warn);
    expect(s.kind).toBe('sdk');
    expect(s.set('k', 'v')).toEqual({ ok: true });
    expect(s.kind).toBe('local-fallback');
    expect(local.m.get('k')).toBe('v');
    expect(s.get('k')).toBe('v');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/dataModuleDisabled/);
    // via the store: a full save/load cycle survives the disabled module
    const st = new SaveStore(() => s); st.save(newGame(2), DEFAULT_SETTINGS);
    expect(new SaveStore(() => s).load().kind).toBe('ok');
  });

  it('dataModuleDisabled thrown by getItem first also falls back', () => {
    const local = kv(); local.m.set('a', '1');
    const data: KV = { getItem: () => { throw { code: 'dataModuleDisabled' }; }, setItem: () => undefined, removeItem: () => undefined };
    const s = sdkKV(() => data, localKV(() => local, () => undefined), () => undefined);
    expect(s.get('a')).toBe('1');
    expect(s.kind).toBe('local-fallback');
  });

  it('other SDK data errors (dataLimitExcedeed) are reported, not swallowed into localStorage', () => {
    const local = kv();
    const data: KV = { getItem: () => null, setItem: () => { throw { code: 'dataLimitExcedeed' }; }, removeItem: () => undefined };
    const s = sdkKV(() => data, localKV(() => local, () => undefined), () => undefined);
    expect(s.set('k', 'v')).toEqual({ ok: false, code: 'dataLimitExcedeed' });
    expect(s.kind).toBe('sdk');
    expect(local.m.size).toBe(0);
  });

  it('localStorage access errors never throw', () => {
    const bad: KV = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('x'); } };
    const s = localKV(() => bad, () => undefined);
    expect(s.get('x')).toBeNull();
    expect(s.set('x', 'y').ok).toBe(false);
    expect(() => s.remove?.('x')).not.toThrow();
    expect(localKV(() => null, () => undefined).set('x', 'y').ok).toBe(false);
  });
});

describe('autosave cadence (Brief §9.7)', () => {
  it('important actions are debounced to ≤ 1 write / 2 s; plus every 30 s; flush writes at once', () => {
    const writes: number[] = [];
    let now = 0;
    const a = new Autosave(() => { writes.push(now); return true; }, 0);
    for (now = 0; now <= 10_000; now += 16) { if (now % 160 === 0) a.request(); a.pump(now); }
    for (let i = 1; i < writes.length; i++) expect(writes[i] - writes[i - 1]).toBeGreaterThanOrEqual(2000);
    expect(writes.length).toBeGreaterThanOrEqual(4);
    writes.length = 0;
    for (now = 20_000; now <= 81_000; now += 16) a.pump(now);
    expect(writes.length).toBe(2); // idle: every 30 s
    a.flush(now);
    expect(writes.length).toBe(3);
  });
  it('a failed write (locked) stays pending and is retried', () => {
    let ok = false, n = 0;
    const a = new Autosave(() => { n++; return ok; }, 0);
    a.request(); a.pump(2000);
    expect(a.pending).toBe(true);
    ok = true; a.pump(4000);
    expect(a.pending).toBe(false);
    expect(n).toBe(2);
  });
});

describe('reset protection', () => {
  it('slots wiped by someone else (settings reset) are detected, so the pagehide flush does not resurrect the save', () => {
    const st = mem(), s = new SaveStore(() => st);
    expect(s.externallyCleared()).toBe(false); // never saved: nothing to protect
    s.save(newGame(1), DEFAULT_SETTINGS);
    expect(s.externallyCleared()).toBe(false);
    st.m.clear();
    expect(s.externallyCleared()).toBe(true);
    s.clear();
    expect(s.save(newGame(1), DEFAULT_SETTINGS).ok).toBe(false);
    expect(st.m.size).toBe(0);
  });
});
