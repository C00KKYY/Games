/**
 * Off-screen hints (QA_REPORT 'Befunde' #2): arrow/chip at the screen edge pointing to an escapee (state 'escaping'), a food fight or the inspector while they are outside the view; tap flies the camera there (ctx.focusTile).
 * Owner: ui-m5. Contract: docs/M5_DESIGN.md §12 and docs/UI_DESIGN.md (data-hud/data-overlay, aria-label + data-tip on
 * every button, ≤ 10 DOM writes/s, fonts ≥ 12 px / body ≥ 14 px, touch ≥ 44 px, EN/DE parts in
 * src/i18n/parts/edgeHints.{en,de}.json, compact ≤ 900 px). Stub: renders nothing until built (no dead buttons, H6).
 */
import type { UICtx, Component } from './ctx';

export function mountEdgeHints(ctx: UICtx): Component {
  void ctx;
  return { update() { /* built by ui-m5 */ }, destroy() { /* nothing mounted yet */ } };
}
