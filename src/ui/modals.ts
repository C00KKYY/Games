/** STUB – replaced by the M3 component builder (docs/UI_DESIGN.md). */
import type { UICtx, Component } from './ctx';
export function mountModals(_ctx: UICtx): Component & { open(name: 'settings' | 'help'): void; close(): void; isOpen(): boolean } {
  return { update() {}, open() {}, close() {}, isOpen: () => false };
}
