import { describe, it, expect } from 'vitest';
import { allSprites } from '../../tools/art-build';
import { m5Icons } from '../../tools/art/m5';
import { PALETTE_HEX } from '../../art/palette';
import { PROJECTS } from '../../src/content/progress';

// F (M5): every new entity has its own sprite, variants keep the frame of the sprite they replace, icons are palette-only
describe('F art M5', () => {
  const sprites = allSprites();
  const by = new Map(sprites.map(s => [s.name, s]));
  it('has the Cat Burglar, the goose inspector and the held items in every needed direction', () => {
    const need = ['head_cat_S', 'head_cat_N', 'head_cat_E', 'blink_cat_S', 'blink_cat_E', 'tail_cat_N', 'tail_cat_E', 'acc_tophat_S', 'acc_tophat_N', 'acc_tophat_E',
      'head_goose_S', 'head_goose_N', 'head_goose_E', 'blink_goose_S', 'blink_goose_E', 'tail_goose_N', 'tail_goose_E', 'footGoose',
      'held_clipboard', 'held_whistle', 'held_mop', 'held_horn'];
    for (const n of need) expect(by.has(n), n).toBe(true);
  });
  it('shows every one of the 12 projects with a dedicated visual', () => {
    const visual: Record<string, string[]> = {
      mattresses: ['bunkBedPlus'], recipeBook: ['cookbook'], form27b: ['formTray'], whistle: ['held_whistle'], bubbleBath: ['bubble'],
      assembly: ['knitStationPro', 'yarnBall'], speedyCarts: ['cartRacer'], nightSchool: ['deskLamp'], tetherball: ['tetherPole', 'tetherBall', 'rope'],
      suggestionBox: ['suggestionBox', 'heart'], squeakyMops: ['mopBucket', 'held_mop'], biggerFerry: ['ferryBig'],
    };
    expect(Object.keys(visual).sort()).toEqual(PROJECTS.map(p => p.id).sort());
    for (const names of Object.values(visual)) for (const n of names) expect(by.has(n), n).toBe(true);
  });
  it('variants keep the anchor point of the sprite they replace (swapped in place)', () => {
    for (const [a, b] of [['bunkBed', 'bunkBedPlus'], ['knitStation', 'knitStationPro'], ['desk', 'deskLamp'], ['cart', 'cartRacer']]) {
      const A = by.get(a)!, B = by.get(b)!;
      expect([B.ax, B.ay], `${a}→${b}`).toEqual([A.ax, A.ay]);
    }
    const f = by.get('ferry')!, g = by.get('ferryBig')!;
    expect([g.ax / g.w, g.ay / g.h]).toEqual([f.ax / f.w, f.ay / f.h]); // bottom centre at the berth
  });
  it('has the dock board, site-2 silhouette, brawl cloud, parcel line and feedback sprites', () => {
    for (const n of ['vipBoard', 'vipTagSun', 'vipTagFerry', 'lighthouseIsle', 'lanternLit', 'beam', 'brawlCloud', 'parcelLineH', 'parcelLineV', 'saleSign', 'stampSeal', 'fxKey'])
      expect(by.has(n), n).toBe(true);
  });
  it('M5 HUD icons exist under the contract names and use palette colours only', () => {
    const icons = m5Icons();
    expect(icons.map(i => i.name).sort()).toEqual(['inspect', 'key', 'lead', 'mail', 'perk', 'timer', 'transfer']);
    const allowed = new Set([...PALETTE_HEX.map(h => h.toLowerCase()), '#ffffff', '#f4d07a', '#ec8b78', '#93dcb9', '#f0c457', '#d07a5c']);
    for (const i of icons) for (const m of i.body.matchAll(/#[0-9a-fA-F]{6}\b/g)) expect(allowed.has(m[0].toLowerCase()), `${i.name}:${m[0]}`).toBe(true);
    for (const i of icons) expect(i.body.includes('<text'), i.name).toBe(false);
  });
});
