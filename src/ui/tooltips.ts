/** STUB – replaced by the M3 component builder (docs/UI_DESIGN.md). */
import type { UICtx, Component, TipContent } from './ctx';
export function mountTooltips(_ctx: UICtx): Component & { tip(el: HTMLElement, content: () => TipContent): void } {
  return { update() {}, tip(el, content) { el.dataset.tip = '1'; el.title = content().title; } };
}
