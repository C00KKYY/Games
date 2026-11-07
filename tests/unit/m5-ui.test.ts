import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { M5_ICON } from '../../src/ui/m5icons';
import { clockStr } from '../../src/ui/m5kit';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

describe('M5 UI (docs/M5_DESIGN.md §12)', () => {
  it('every M5 HUD icon resolves to an existing public/ui file (no 404 → 0 console errors)', () => {
    for (const [k, name] of Object.entries(M5_ICON)) expect(existsSync(`${ROOT}public/ui/${name}.svg`), `${k} → ui/${name}.svg`).toBe(true);
  });
  it('every icon name the M5 components pass to ctx.icon exists', () => {
    const files = ['projectBoard', 'leads', 'mail', 'inspection', 'transfer', 'returnPanel', 'saveIndicator', 'edgeHints', 'eventBanner', 'm5kit'].map(f => readFileSync(`${ROOT}src/ui/${f}.ts`, 'utf8')).join('\n');
    const names = new Set([...files.matchAll(/ctx\.icon\('([\w-]+)'\)/g)].map(m => m[1]));
    for (const m of files.matchAll(/(?:FX_ICON|GRIP_ICON|ICON)[^=]*=\s*\{([^}]*)\}/g)) for (const v of m[1].matchAll(/'([\w-]+)'/g)) names.add(v[1]);
    expect(names.size).toBeGreaterThan(8);
    const have = new Set(readdirSync(`${ROOT}public/ui`).map(f => f.replace(/\.svg$/, '')));
    expect([...names].filter(n => !have.has(n))).toEqual([]);
  });
  it('timer format', () => {
    expect(clockStr(0)).toBe('0:00');
    expect(clockStr(53_200)).toBe('0:54');
    expect(clockStr(90_000)).toBe('1:30');
    expect(clockStr(3_725_000)).toBe('1:02:05');
  });
  it('no "coming soon" promise in any UI text (H6)', async () => {
    const { tableOf } = await import('../../src/i18n/i18n');
    for (const l of ['en', 'de'] as const) for (const [k, v] of Object.entries(tableOf(l))) expect(/coming soon|demnächst|bald verfügbar|in a later update/i.test(v), `${l} ${k}`).toBe(false);
  });
});
