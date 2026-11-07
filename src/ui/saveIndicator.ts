/**
 * Save confirmation (Brief §5.6; docs/M5_DESIGN.md §12.7): a small check icon in the bottom-left corner fades in for
 * ~1.5 s after each successful save (ctx.saved = performance.now() of the save). Decoration only: aria-hidden, no
 * button, no text, never covers anything that can be tapped (pointer-events: none, data-overlay).
 * Owner: ui-m5.
 */
import type { UICtx, Component } from './ctx';
import { domKit } from './buildbar';

const SHOW_MS = 1500;

export function mountSaveIndicator(ctx: UICtx): Component {
  const d = domKit(ctx);
  const el = d.h('div', 'm5-save');
  el.dataset.overlay = '1';
  el.setAttribute('aria-hidden', 'true');
  d.img(ctx.icon('check'), el);
  ctx.root.appendChild(el);
  let until = 0;
  const off = ctx.saved.on(v => { if (v > 0) until = performance.now() + SHOW_MS; });
  let acc = 0;
  return {
    update(dt) {
      acc += dt;
      if (acc < 0.1) return;
      acc = 0;
      d.cls(el, 'on', performance.now() < until);
    },
    destroy() { off(); el.remove(); },
  };
}
