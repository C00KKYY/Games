import type { Platform } from './platform/platform';
// M0 stub: no world yet, so the loading screen stays (never an empty screen).
export async function startGame(platform: Platform, setBoot: (p: number) => void) {
  setBoot(0.6);
  await platform.ready;
  setBoot(1);
  platform.gameplayStart();
}
