/** Tiny i18n: EN master, DE second (Brief §10). Language fixed at boot from the SDK locale. */
import en from './en.json';
import de from './de.json';
export type Lang = 'en' | 'de';
export type Key = keyof typeof en;
const TABLES: Record<Lang, Record<string, string>> = { en, de };
let lang: Lang = 'en';
export const setLang = (l: Lang) => { lang = l; };
export const getLang = () => lang;
/** 'de…' → German, everything else English (Brief §10) */
export const langFromLocale = (locale: string | undefined | null): Lang => (String(locale ?? '').toLowerCase().startsWith('de') ? 'de' : 'en');
export function t(key: Key, vars?: Record<string, string | number>): string {
  let s = TABLES[lang][key] ?? TABLES.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
/** number format with K/M/B/T suffixes and localised decimal separator */
export function fmtNum(n: number): string {
  const sep = lang === 'de' ? ',' : '.';
  const abs = Math.abs(n);
  const units: [number, string][] = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e4, 'K']];
  for (const [v, u] of units) if (abs >= v) { const x = n / (v === 1e4 ? 1e3 : v); return (Math.round(x * 10) / 10).toFixed(x >= 100 ? 0 : 1).replace('.', sep).replace(new RegExp(`\\${sep}0$`), '') + u; }
  return Math.round(n).toLocaleString(lang === 'de' ? 'de-DE' : 'en-US');
}
