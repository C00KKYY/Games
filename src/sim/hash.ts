/** FNV-1a 32 over a canonical walk of the state; derived caches excluded (Brief H4, SIM_DESIGN §11). */
import type { World } from './types';
const SKIP = new Set(['cache', 'events', 'eventSeq', 'debug']);
export function stateHash(w: World): string {
  let h = 0x811c9dc5;
  const mix = (s: string) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } };
  const walk = (v: unknown, depth: number): void => {
    if (v === null || v === undefined) { mix('n'); return; }
    // exact: String() round-trips doubles; distinct tokens for NaN/±Infinity (review finding)
    if (typeof v === 'number') { mix(Number.isNaN(v) ? 'NaN' : String(v)); return; }
    if (typeof v === 'string' || typeof v === 'boolean') { mix(String(v)); return; }
    if (ArrayBuffer.isView(v)) { const a = v as unknown as ArrayLike<number>; for (let i = 0; i < a.length; i++) mix(String(a[i])); return; }
    if (Array.isArray(v)) { mix('['); for (const x of v) walk(x, depth + 1); mix(']'); return; }
    if (v instanceof Map) return;
    if (typeof v === 'object') {
      const keys = Object.keys(v as object).sort();
      for (const k of keys) { if (depth === 0 && SKIP.has(k)) continue; mix(k); walk((v as Record<string, unknown>)[k], depth + 1); }
    }
  };
  walk(w, 0);
  return (h >>> 0).toString(16).padStart(8, '0');
}
