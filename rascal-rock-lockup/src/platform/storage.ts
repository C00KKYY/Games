/**
 * Key/value backends behind Platform.storage() (Brief §9.7).
 * - crazygames: ONLY the SDK data module (synchronous localStorage-like API that throws `{code}` errors,
 *   RULES_CHECK §3.6). On `dataModuleDisabled` (submission toggle missing) it falls back to localStorage for good,
 *   with a loud console warning – see the submission checklist note in docs/RULES_CHECK.md §3.6.
 * - everywhere else: localStorage, every call in try/catch (private mode / blocked storage).
 */
import type { Storage } from './platform';

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
export type StorageKind = 'sdk' | 'local' | 'local-fallback';

const codeOf = (e: unknown): string => {
  const c = (e as { code?: unknown } | null)?.code;
  if (typeof c === 'string' && c) return c;
  const m = String((e as { message?: unknown } | null)?.message ?? e ?? '');
  for (const k of ['dataModuleDisabled', 'dataLimitExcedeed', 'dataLimitExceeded']) if (m.includes(k)) return k;
  return 'other';
};

export function localKV(get: () => KV | undefined | null, warn: (...a: unknown[]) => void = console.warn): Storage & { kind: StorageKind } {
  return {
    kind: 'local',
    get(k) { try { return get()?.getItem(k) ?? null; } catch (e) { warn('[storage] localStorage.getItem', e); return null; } },
    set(k, v) {
      try { const s = get(); if (!s) return { ok: false, code: 'localStorage' }; s.setItem(k, v); return { ok: true }; }
      catch (e) { warn('[storage] localStorage.setItem', e); return { ok: false, code: 'localStorage' }; }
    },
    remove(k) { try { get()?.removeItem(k); } catch { /* blocked storage – nothing to remove */ } },
  };
}

/** SDK data module with a permanent localStorage fallback after `dataModuleDisabled` */
export function sdkKV(data: () => KV, fallback: Storage, warn: (...a: unknown[]) => void = console.warn): Storage & { readonly kind: StorageKind } {
  let fell = false;
  const fallBack = (e: unknown) => {
    if (fell) return;
    fell = true;
    warn('[storage] CrazyGames data module is DISABLED (dataModuleDisabled) – falling back to localStorage. ' +
      'Submission checklist: select "Yes, using the Data Module from the CrazyGames SDK" in the submission form.', e);
  };
  return {
    get kind() { return fell ? 'local-fallback' : 'sdk'; },
    get(k) {
      if (fell) return fallback.get(k);
      try { return data().getItem(k) ?? null; }
      catch (e) {
        if (codeOf(e) === 'dataModuleDisabled') { fallBack(e); return fallback.get(k); }
        warn('[storage] data.getItem', e); return null;
      }
    },
    set(k, v) {
      if (fell) return fallback.set(k, v);
      try { data().setItem(k, v); return { ok: true }; }
      catch (e) {
        const code = codeOf(e);
        if (code === 'dataModuleDisabled') { fallBack(e); return fallback.set(k, v); }
        warn('[storage] data.setItem', code, e); return { ok: false, code };
      }
    },
    remove(k) {
      if (fell) { fallback.remove?.(k); return; }
      try { data().removeItem(k); }
      catch (e) { if (codeOf(e) === 'dataModuleDisabled') { fallBack(e); fallback.remove?.(k); } }
    },
  };
}
