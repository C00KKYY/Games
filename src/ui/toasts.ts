/** STUB – replaced by the M3 component builder (docs/UI_DESIGN.md). */
import type { UICtx, Component } from './ctx';
export function mountToasts(_ctx: UICtx): Component & { toast(text: string, opts?: { icon?: string; kind?: 'info' | 'good' | 'bad'; ms?: number }): void } {
  return { update() {}, toast(text) { console.log('[toast]', text); } };
}
