import { describe, it, expect } from 'vitest';
import { newGame, runFor, cmd, tick } from '../../src/sim/sim';
import { stateHash } from '../../src/sim/hash';
import { encode, decode, plainToWorld, pickSlot, DEFAULT_SETTINGS, rle, unrle } from '../../src/save/serialize';

describe('H4 save/load', () => {
  it('RLE round-trips', () => { const a = new Uint8Array([0, 0, 0, 2, 2, 1, 0, 0]); expect(Array.from(unrle(rle(a), new Uint8Array(8)))).toEqual(Array.from(a)); });
  it('identical state hash after serialise → deserialise, and identical future', () => {
    const w = newGame(5);
    runFor(w, 240000, x => { if (x.ferry.state === 'arriving') cmd.tapHorn(x); if (x.tutorial.active) cmd.skipTutorial(x); });
    const s = encode(w, DEFAULT_SETTINGS, 1, 0);
    expect(s.length).toBeLessThan(150 * 1024);
    const doc = decode(s)!;
    const w2 = plainToWorld(doc.world);
    expect(stateHash(w2)).toBe(stateHash(w));
    for (let i = 0; i < 3000; i++) { tick(w); tick(w2); }
    expect(stateHash(w2)).toBe(stateHash(w));
  });
  it('corrupt slot falls back to the other one; newest wins', () => {
    const w = newGame(2);
    const a = encode(w, DEFAULT_SETTINGS, 3, 0), b = encode(w, DEFAULT_SETTINGS, 4, 0);
    expect(pickSlot(a, b)!.seq).toBe(4);
    expect(pickSlot(a, b.slice(0, -5) + 'xxxxx')!.seq).toBe(3);
    expect(pickSlot('garbage', null)).toBeNull();
  });
});
