import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import en from '../../src/i18n/en.json';
import de from '../../src/i18n/de.json';
import { OFFENCES } from '../../src/content/gags';
import { langFromLocale, fmtNum, setLang, allKeys, tableOf } from '../../src/i18n/i18n';

describe('D7 i18n', () => {
  it('EN and DE have identical keys (base + component parts)', () => { expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort()); expect(allKeys('de').sort()).toEqual(allKeys('en').sort()); });
  it('D1 (parts): tutorial keys ≤ 8 words', () => { for (const l of ['en', 'de'] as const) for (const [k, v] of Object.entries(tableOf(l))) if (k.startsWith('tut.')) expect(v.split(/\s+/).length, k).toBeLessThanOrEqual(8); });
  it('D1: tutorial steps have at most 8 words in both languages', () => {
    for (const k of Object.keys(en).filter(k => k.startsWith('tut.'))) for (const tbl of [en, de] as Record<string, string>[]) expect(tbl[k].split(/\s+/).length, k).toBeLessThanOrEqual(8);
  });
  it('placeholders match', () => {
    for (const k of Object.keys(en)) expect((de as Record<string, string>)[k].match(/\{\w+\}/g)?.sort() ?? []).toEqual((en as Record<string, string>)[k].match(/\{\w+\}/g)?.sort() ?? []);
  });
  // D7 also for the component tables (src/i18n/parts/<component>.<lang>.json, docs/UI_DESIGN.md §5)
  const PARTS = fileURLToPath(new URL('../../src/i18n/parts/', import.meta.url));
  const partFiles = readdirSync(PARTS).filter(f => /\.(en|de)\.json$/.test(f)).sort();
  const readPart = (f: string) => JSON.parse(readFileSync(PARTS + f, 'utf8')) as Record<string, string>;
  const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
  it('every component table exists in EN and DE with the same keys, all prefixed "<component>."', () => {
    const comps = [...new Set(partFiles.map(f => f.replace(/\.(en|de)\.json$/, '')))];
    expect(comps.length).toBeGreaterThan(0);
    const problems: string[] = [];
    for (const c of comps) {
      if (!partFiles.includes(`${c}.en.json`) || !partFiles.includes(`${c}.de.json`)) { problems.push(`${c}: missing ${partFiles.includes(`${c}.en.json`) ? 'de' : 'en'} file`); continue; }
      const e = readPart(`${c}.en.json`), d = readPart(`${c}.de.json`);
      for (const k of Object.keys(e)) if (!(k in d)) problems.push(`${c}.de.json lacks ${k}`);
      for (const k of Object.keys(d)) if (!(k in e)) problems.push(`${c}.en.json lacks ${k}`);
      for (const k of [...Object.keys(e), ...Object.keys(d)]) if (!k.startsWith(`${c}.`)) problems.push(`${c}: key ${k} without prefix "${c}."`);
      for (const [k, v] of [...Object.entries(e), ...Object.entries(d)]) if (typeof v !== 'string' || !v.trim()) problems.push(`${c}: ${k} is empty`);
    }
    expect([...new Set(problems)]).toEqual([]);
  });
  it('placeholders match in every component table (per file and in the merged tables)', () => {
    const problems: string[] = [];
    for (const f of partFiles.filter(f => f.endsWith('.en.json'))) {
      const e = readPart(f), dFile = f.replace(/\.en\.json$/, '.de.json');
      if (!partFiles.includes(dFile)) continue; // reported by the key test
      const d = readPart(dFile);
      for (const k of Object.keys(e)) if (k in d && ph(d[k]).join() !== ph(e[k]).join()) problems.push(`${dFile} ${k}: DE ${JSON.stringify(ph(d[k]))} ≠ EN ${JSON.stringify(ph(e[k]))}`);
    }
    // merged tables (base + parts, as the game sees them): catches a part key that overrides a base key inconsistently
    const E = tableOf('en'), D = tableOf('de');
    for (const k of allKeys('en')) if (k in D && ph(D[k]).join() !== ph(E[k]).join()) problems.push(`merged ${k}: DE ${JSON.stringify(ph(D[k]))} ≠ EN ${JSON.stringify(ph(E[k]))}`);
    expect([...new Set(problems)]).toEqual([]);
  });
  it('B5: no UI string offers fullscreen or contains a URL (EN + DE, base + parts)', () => {
    const bad: string[] = [];
    for (const l of ['en', 'de'] as const) for (const [k, v] of Object.entries(tableOf(l))) if (/full\s*-?\s*screen|vollbild|https?:\/\/|www\./i.test(v)) bad.push(`${l} ${k}: ${v}`);
    expect(bad).toEqual([]);
  });
  it('language from SDK locale', () => { expect(langFromLocale('de-AT')).toBe('de'); expect(langFromLocale('en-US')).toBe('en'); expect(langFromLocale('fr')).toBe('en'); expect(langFromLocale(undefined)).toBe('en'); });
  it('number suffixes', () => { setLang('en'); expect(fmtNum(1240)).toBe('1,240'); expect(fmtNum(15300)).toBe('15.3K'); expect(fmtNum(2_500_000)).toBe('2.5M'); setLang('de'); expect(fmtNum(15300)).toBe('15,3K'); setLang('en'); });
  it('gags are bilingual and harmless', () => {
    const banned = /\b(beer|wine|vodka|drugs?|cigar\w*|smok\w*|guns?|knife|blood|bier|wein|drogen?|zigarett\w*|rauchen|waffen?|messer|blut)\b/i;
    for (const o of OFFENCES) { expect(o.en.length).toBeGreaterThan(3); expect(o.de.length).toBeGreaterThan(3); expect(banned.test(o.en + o.de)).toBe(false); }
  });
});
