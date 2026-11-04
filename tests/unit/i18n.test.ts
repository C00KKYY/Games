import { describe, it, expect } from 'vitest';
import en from '../../src/i18n/en.json';
import de from '../../src/i18n/de.json';
import { OFFENCES } from '../../src/content/gags';
import { langFromLocale, fmtNum, setLang } from '../../src/i18n/i18n';

describe('D7 i18n', () => {
  it('EN and DE have identical keys', () => { expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort()); });
  it('D1: tutorial steps have at most 8 words in both languages', () => {
    for (const k of Object.keys(en).filter(k => k.startsWith('tut.'))) for (const tbl of [en, de] as Record<string, string>[]) expect(tbl[k].split(/\s+/).length, k).toBeLessThanOrEqual(8);
  });
  it('placeholders match', () => {
    for (const k of Object.keys(en)) expect((de as Record<string, string>)[k].match(/\{\w+\}/g)?.sort() ?? []).toEqual((en as Record<string, string>)[k].match(/\{\w+\}/g)?.sort() ?? []);
  });
  it('language from SDK locale', () => { expect(langFromLocale('de-AT')).toBe('de'); expect(langFromLocale('en-US')).toBe('en'); expect(langFromLocale('fr')).toBe('en'); expect(langFromLocale(undefined)).toBe('en'); });
  it('number suffixes', () => { setLang('en'); expect(fmtNum(1240)).toBe('1,240'); expect(fmtNum(15300)).toBe('15.3K'); expect(fmtNum(2_500_000)).toBe('2.5M'); setLang('de'); expect(fmtNum(15300)).toBe('15,3K'); setLang('en'); });
  it('gags are bilingual and harmless', () => {
    const banned = /\b(beer|wine|vodka|drugs?|cigar\w*|smok\w*|guns?|knife|blood|bier|wein|drogen?|zigarett\w*|rauchen|waffen?|messer|blut)\b/i;
    for (const o of OFFENCES) { expect(o.en.length).toBeGreaterThan(3); expect(o.de.length).toBeGreaterThan(3); expect(banned.test(o.en + o.de)).toBe(false); }
  });
});
