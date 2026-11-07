/**
 * HUD icons of the M5 screens (docs/M5_DESIGN.md §12 "Neue Icons"). art-m5 drew key, mail, inspect, lead, perk,
 * transfer and timer into public/ui (tests/unit/m5-ui.test.ts checks that every entry resolves to an existing file).
 */
export const M5_ICON = {
  key: 'key',
  mail: 'mail',
  inspect: 'inspect',
  lead: 'lead',
  perk: 'perk',
  transfer: 'transfer',
  timer: 'timer',
} as const;
