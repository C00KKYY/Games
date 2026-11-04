import { describe, it, expect } from 'vitest';
import { allSprites } from '../../tools/art-build';
import { PALETTE_HEX, RAMPS } from '../../art/palette';

const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
/** colour lies on the line between two adjacent ramp steps (derived blend) */
const onRamp = (c: string) => RAMPS.some(r => r.some((a, i) => i < r.length - 1 && (() => { const A = rgb(a), B = rgb(r[i + 1]), C = rgb(c); for (let t = 0; t <= 1.0001; t += 0.05) { if (A.every((v, k) => Math.abs(v + (B[k] - v) * t - C[k]) <= 3)) return true; } return false; })()));

// F: every sprite source uses only palette colours (greyscale tint layers and white masks excepted)
const GREY = /^#([0-9a-f]{2})\1\1$/i;
describe('F art sources', () => {
  const sprites = allSprites();
  it('has a unique sprite for every required entity type (no placeholders)', () => {
    const need = ['bunkBed', 'benchTable', 'bistroTable', 'counter1', 'counter2', 'shower', 'crate', 'cart', 'ferry', 'office', 'gate', 'booth',
      'head_raccoon_S', 'head_raccoon_N', 'head_raccoon_E', 'head_weasel_S', 'head_weasel_N', 'head_weasel_E', 'head_bear_S', 'head_bear_N', 'head_bear_E',
      'head_bulldog_S', 'head_beaver_S', 'head_badger_S', 'wallH', 'wallV', 'doorH', 'tree0', 'tree1', 'lamp'];
    const names = new Set(sprites.map(s => s.name));
    for (const n of need) expect(names.has(n), n).toBe(true);
  });
  it('uses only palette colours', () => {
    const allowed = new Set([...PALETTE_HEX.map(h => h.toLowerCase()), '#fff2c4', '#ffffff', '#000000']);
    // documented derived tints (highlights of accent ramps)
    for (const h of ['#d07a5c', '#f4d07a', '#ec8b78', '#93dcb9', '#f0c457', '#c46a3e', '#e39a62', '#d48a6a', '#f6d27a']) allowed.add(h);
    const bad: string[] = [];
    for (const s of sprites) for (const m of s.body.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      const c = m[0].toLowerCase();
      if (!allowed.has(c) && !GREY.test(c) && !onRamp(c)) bad.push(`${s.name}:${c}`);
    }
    expect(bad).toEqual([]);
  });
  it('contains no text elements and no pure black fills', () => {
    for (const s of sprites) { expect(s.body.includes('<text'), s.name).toBe(false); expect(/fill="#000000"/.test(s.body), s.name).toBe(false); }
  });
});
