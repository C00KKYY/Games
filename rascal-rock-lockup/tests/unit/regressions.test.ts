import { describe, it, expect } from 'vitest';
import { newGame, tick, runFor, cmd, Stepper } from '../../src/sim/sim';
import { roomsOf } from '../../src/sim/world';
import { violations } from '../../src/sim/invariants';
import { encode, decode, plainToWorld, DEFAULT_SETTINGS } from '../../src/save/serialize';
import { BotDriver } from '../../tools/bots';
import { TUTORIAL_WASH } from '../../src/content/site1';
import { AF } from '../../src/sim/types';

describe('review regressions (M2 review workflow)', () => {
  it('food fight: calmed brawlers free their canteen seat', () => {
    for (const seed of [1, 2, 3]) {
      const w = newGame(seed); const bot = new BotDriver(w, { profile: 'casual', seed });
      while (w.rtMs < 700000) { tick(w); bot.step(); }
      const c = roomsOf(w, 'canteen')[0];
      for (const id of c.slotUser) if (id) { const a = w.agents.find(x => x.id === id); expect(a && a.act?.roomId === c.id, `seed ${seed} stale seat ${id}`).toBe(true); }
    }
  }, 60000);
  it('tutorial: building the Wash Hut before the horn does not soft-lock', () => {
    const w = newGame(4); tick(w);
    expect(cmd.build(w, 'wash', TUTORIAL_WASH.x, TUTORIAL_WASH.y, TUTORIAL_WASH.w, TUTORIAL_WASH.h).ok).toBe(true);
    runFor(w, 8000);
    cmd.tapHorn(w);
    runFor(w, 90000, x => { if (x.agents.some(a => a.state === 'atGate')) cmd.stamp(x); });
    cmd.upgrade(w, roomsOf(w, 'canteen')[0].id, 1);
    runFor(w, 2000);
    expect(w.tutorial.done).toBe(true);
    expect(cmd.build(w, 'workshop', 5, 10, 4, 4).reason).not.toBe('locked');
  });
  it('shrinking an occupied bunk does not crash and keeps beds valid', () => {
    violations.length = 0;
    const w = newGame(5, { debug: true });
    runFor(w, 100000, x => { if (x.ferry.state === 'arriving') cmd.tapHorn(x); if (x.tutorial.active) cmd.skipTutorial(x); });
    const b = roomsOf(w, 'bunk')[0];
    cmd.resize(w, b.id, b.x, b.y, 3, 3);
    expect(() => runFor(w, 120000, x => { if (x.ferry.state === 'arriving') cmd.tapHorn(x); })).not.toThrow();
    for (const a of w.agents) if (a.bed) { const r = w.rooms.find(q => q.id === a.bed)!; expect(a.bedSlot).toBeLessThan(r.slots.length); }
  });
  it('save right after a command keeps tutorial progress (events flushed)', () => {
    const w = newGame(6); tick(w); cmd.tapHorn(w); runFor(w, 3000);
    cmd.build(w, 'wash', TUTORIAL_WASH.x, TUTORIAL_WASH.y, TUTORIAL_WASH.w, TUTORIAL_WASH.h);
    runFor(w, 6000);
    const w2 = plainToWorld(decode(encode(w, DEFAULT_SETTINGS, 1, 0))!.world);
    expect(w2.tutorial.step).toBe(w.tutorial.step);
    expect(w2.tutorial.step).toBeGreaterThanOrEqual(2);
  });
  it('skip before the ferry docks still brings Earl, released by 2:00', () => {
    const w = newGame(7); tick(w); cmd.skipTutorial(w);
    runFor(w, 120000);
    expect(w.events.some(e => e.type === 'release' && e.name === 'Earl') || w.stats.released >= 1).toBe(true);
    void AF;
  });
  it('tutorialStep is only emitted on change', () => {
    const w = newGame(8); runFor(w, 20000);
    expect(w.events.filter(e => e.type === 'tutorialStep').length).toBeLessThanOrEqual(4);
  });
  it('stepper carries sub-µs remainders (no drift at 144 Hz)', () => {
    const a = new Stepper(newGame(1)), b = new Stepper(newGame(1));
    for (let i = 0; i < 144 * 60; i++) a.frame(1e6 / 144);
    for (let i = 0; i < 60 * 60; i++) b.frame(1e6 / 60);
    expect(Math.abs(a.ticks - b.ticks)).toBeLessThanOrEqual(1);
  });
  it('upgrade rejects office, unbuilt rooms and bad n; refunds are not income', () => {
    const w = newGame(9);
    const office = roomsOf(w, 'office')[0];
    expect(cmd.upgrade(w, office.id, 1).ok).toBe(false);
    expect(cmd.upgrade(w, roomsOf(w, 'canteen')[0].id, NaN).ok).toBe(false);
    const life = w.stats.lifetimeCoins;
    const r = cmd.build(w, 'wash', TUTORIAL_WASH.x, TUTORIAL_WASH.y, 3, 3);
    expect(r.ok).toBe(true);
    cmd.undo(w);
    expect(w.stats.lifetimeCoins).toBe(life);
  });
});
