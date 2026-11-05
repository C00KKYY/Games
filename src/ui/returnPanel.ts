/**
 * Return panel + catch-up toast (Brief §3.15, §12.3 B1 'Rückkehr-Panel'): NON-pausing overlay "While you were away" with count-up of w.offline.pending.coins and Collect → ctx.cmd.collectOffline (FULL-only ×2 button never in BASIC); "Catching up…" mini-toast while ctx.catchUp is a 'catchup' run.
 * Owner: ui-m5. Contract: docs/M5_DESIGN.md §12 and docs/UI_DESIGN.md (data-hud/data-overlay, aria-label + data-tip on
 * every button, ≤ 10 DOM writes/s, fonts ≥ 12 px / body ≥ 14 px, touch ≥ 44 px, EN/DE parts in
 * src/i18n/parts/returnPanel.{en,de}.json, compact ≤ 900 px). Stub: renders nothing until built (no dead buttons, H6).
 */
import type { UICtx, Component } from './ctx';

export function mountReturnPanel(ctx: UICtx): Component {
  void ctx;
  return { update() { /* built by ui-m5 */ }, destroy() { /* nothing mounted yet */ } };
}
