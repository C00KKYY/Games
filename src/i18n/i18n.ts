/** Tiny i18n: EN master, DE second (Brief §10). Language fixed at boot from the SDK locale. */
import en from './en.json';
import de from './de.json';
export type Lang = 'en' | 'de';
/** base keys are typed; component parts (src/i18n/parts/<name>.<lang>.json) add more */
export type Key = keyof typeof en | (string & {});
const TABLES: Record<Lang, Record<string, string>> = { en: { ...en }, de: { ...de } };
// merge component string tables (each UI component owns src/i18n/parts/<component>.en.json + .de.json)
const parts = import.meta.glob('./parts/*.json', { eager: true, import: 'default' }) as Record<string, Record<string, string>>;
for (const [path, table] of Object.entries(parts)) {
  const m = path.match(/\.(en|de)\.json$/); if (!m) continue;
  Object.assign(TABLES[m[1] as Lang], table);
}
export const allKeys = (l: Lang) => Object.keys(TABLES[l]);
export const tableOf = (l: Lang) => TABLES[l];
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
