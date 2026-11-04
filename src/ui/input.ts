/** Camera input: drag-pan (1 finger / right / middle / space+left), wheel zoom to cursor, pinch, WASD/arrows via event.code. */
import type { Camera } from '../render/camera';

export function attachInput(canvas: HTMLCanvasElement, cam: Camera) {
  const pts = new Map<number, { x: number; y: number }>();
  let last = { x: 0, y: 0, t: 0 }; let vel = { x: 0, y: 0 };
  let space = false; let pinch0 = 0;
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    last = { x: e.clientX, y: e.clientY, t: performance.now() }; vel = { x: 0, y: 0 }; cam.vx = cam.vy = 0;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  canvas.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    if (pts.size === 2) {
      p.x = e.clientX; p.y = e.clientY;
      const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0) { cam.zoomAt(d / pinch0, (a.x + b.x) / 2, (a.y + b.y) / 2); pinch0 = d; }
      return;
    }
    const panning = e.pointerType !== 'mouse' || (e.buttons & 6) !== 0 || ((e.buttons & 1) && space) || (e.buttons & 1);
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (!panning) return;
    cam.panBy(dx, dy);
    const now = performance.now(); const dtm = Math.max(1, now - last.t);
    vel = { x: (-dx / cam.zoom) / (dtm / 1000) * 0.5 + vel.x * 0.5, y: (-dy / cam.zoom) / (dtm / 1000) * 0.5 + vel.y * 0.5 };
    last = { x: e.clientX, y: e.clientY, t: now };
  });
  const up = (e: PointerEvent) => {
    pts.delete(e.pointerId); pinch0 = 0;
    if (performance.now() - last.t < 80) { cam.vx = Math.max(-1500, Math.min(1500, vel.x)); cam.vy = Math.max(-1500, Math.min(1500, vel.y)); }
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); cam.zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });
  const keys = new Set<string>();
  window.addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.code === 'Space') space = true;
    keys.add(e.code);
  });
  window.addEventListener('keyup', e => { if (e.code === 'Space') space = false; keys.delete(e.code); });
  document.addEventListener('gesturestart', e => e.preventDefault());
  const tick = () => {
    const sp = 520 / cam.zoom; let x = 0, y = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1; if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1; if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
    if (x || y) { cam.vx = x * sp; cam.vy = y * sp; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
