/**
 * World visuals of the M5 systems (docs/M5_DESIGN.md §13). Owner: art-m5.
 *  - finished projects: props/animations per content/progress.ts PROJECTS[].visual (read w.projects.done)
 *  - hired leads: Olli (horn) at the dock, Becca (crates) at the depot; `leadAutoTap` event → visible tap moment
 *  - goose inspector walking (w.inspection.walker while phase === 'walking')
 *  - dock teaser board for the morning VIP (vip.ts vipBoard(w): hidden | teaser | ready)
 *  - food fight tumult (director.ts foodFightMeter01) – optional world-space meter above the canteen
 * Mounted by SimView: constructor once, onRooms() after every room rebuild (props in rooms), update(dt) every frame.
 * No allocation per frame; create sprites lazily and keep them.
 */
import type { World } from '../sim/types';
import type { WorldView } from './world';

export class ProgressView {
  constructor(private wv: WorldView, private w: World) {}
  /** rooms were rebuilt (room props are recreated by WorldView.addSimRoom → re-add project props here) */
  onRooms() { void this.wv; void this.w; }
  update(dt: number) { void dt; }
  destroy() { /* sprites live in WorldView containers and are destroyed with them */ }
}
