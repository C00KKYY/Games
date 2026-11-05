/**
 * Transfer + perk menu (Brief §3.17, §12.3 B1 'Versetzung'): pausing dialog, keys preview (transferKeys), target sites (transferTargets; site 2 shows as locked silhouette until M6), confirm → ctx.cmd.transfer, perk list (6 perks, cost 2–6 keys) → ctx.cmd.buyPerk.
 * Owner: ui-m5. Contract: docs/M5_DESIGN.md §12 and docs/UI_DESIGN.md (data-hud/data-overlay, aria-label + data-tip on
 * every button, ≤ 10 DOM writes/s, fonts ≥ 12 px / body ≥ 14 px, touch ≥ 44 px, EN/DE parts in
 * src/i18n/parts/transfer.{en,de}.json, compact ≤ 900 px). Stub: renders nothing until built (no dead buttons, H6).
 */
import type { UICtx, Component } from './ctx';

export function mountTransfer(ctx: UICtx): Component {
  void ctx;
  return { update() { /* built by ui-m5 */ }, destroy() { /* nothing mounted yet */ } };
}
