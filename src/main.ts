import { createPlatform } from './platform/crazygames';

const bar = document.getElementById('bootbar') as HTMLElement | null;
export const setBoot = (p: number) => { if (bar) bar.style.width = `${Math.max(8, Math.min(100, p * 100))}%`; };

const platform = createPlatform();
(window as unknown as { __platform: unknown }).__platform = platform;

async function boot() {
  setBoot(0.15);
  const { startGame } = await import('./game');
  await startGame(platform, setBoot);
}
boot().catch(e => {
  console.error(e);
  const b = document.getElementById('boot');
  if (b) b.insertAdjacentHTML('beforeend', '<p style="font:600 16px system-ui;color:#f8f0de">Something went wrong. Please reload.</p>');
});
