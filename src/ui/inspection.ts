/**
 * Inspection Day (Brief §3.17, §12.3 B1 'Inspektionsergebnis'): forecast panel + "Call Inspection Day" → ctx.cmd.callInspection, walk HUD (45 s, optional camera follow), pausing result screen with stamp, grades, stars, worst-category tip, key preview, 'Site 2 unlocked' teaser, buttons Keep optimising (ctx.cmd.closeInspection) / Transfer (opens panel 'transfer').
 * Owner: ui-m5. Contract: docs/M5_DESIGN.md §12 and docs/UI_DESIGN.md (data-hud/data-overlay, aria-label + data-tip on
 * every button, ≤ 10 DOM writes/s, fonts ≥ 12 px / body ≥ 14 px, touch ≥ 44 px, EN/DE parts in
 * src/i18n/parts/inspection.{en,de}.json, compact ≤ 900 px). Stub: renders nothing until built (no dead buttons, H6).
 */
import type { UICtx, Component } from './ctx';

export function mountInspection(ctx: UICtx): Component {
  void ctx;
  return { update() { /* built by ui-m5 */ }, destroy() { /* nothing mounted yet */ } };
}
