/**
 * Warden's Office leads (Brief §3.11): slot view (slot 1 at 3★, slot 2 at 4★), hire dialog "You tapped N times today. From now on, Olli handles it." → ctx.cmd.hireLead. Opened by tapping the office and from the staff menu.
 * Owner: ui-m5. Contract: docs/M5_DESIGN.md §12 and docs/UI_DESIGN.md (data-hud/data-overlay, aria-label + data-tip on
 * every button, ≤ 10 DOM writes/s, fonts ≥ 12 px / body ≥ 14 px, touch ≥ 44 px, EN/DE parts in
 * src/i18n/parts/leads.{en,de}.json, compact ≤ 900 px). Stub: renders nothing until built (no dead buttons, H6).
 */
import type { UICtx, Component } from './ctx';

export function mountLeads(ctx: UICtx): Component {
  void ctx;
  return { update() { /* built by ui-m5 */ }, destroy() { /* nothing mounted yet */ } };
}
