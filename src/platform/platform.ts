/** Platform interface – the only surface the game talks to (Brief §9.3, §11.1). */
export type Env = 'crazygames' | 'local' | 'disabled' | 'mock';
export interface PlatformInfo {
  env: Env;
  locale: string;
  device: 'desktop' | 'tablet' | 'mobile';
  app: 'web' | 'pwa' | 'google_play_store' | 'apple_store';
  offline: boolean;
}
export interface Storage {
  get(key: string): string | null;
  set(key: string, value: string): { ok: true } | { ok: false; code: string };
  remove?(key: string): void;
}
/**
 * Where saving stands (Brief §9.2.4):
 * - ok: storage available (SDK data module after a successful init, or localStorage off CrazyGames)
 * - locked: on *.crazygames.com, init has not resolved (yet) – nothing is read or written
 * - failed: on *.crazygames.com, init failed for good (or is still pending long after the timeout) – play on unsaved
 */
export type SaveState = 'ok' | 'locked' | 'failed';
export interface Platform {
  /** resolves when init succeeded or timed out; never rejects */
  ready: Promise<PlatformInfo>;
  /** true once init resolved successfully (saving allowed) */
  readonly initOk: boolean;
  info(): PlatformInfo;
  gameplayStart(): void;
  gameplayStop(): void;
  happytime(): void;
  reportProgress(percent: number): void;
  setContext(ctx: Record<string, string | number | boolean>): void;
  muted(): boolean;
  onMuteChange(fn: (m: boolean) => void): void;
  storage(): Storage | null;
  saveState(): SaveState;
  /** init resolved after the boot timeout (crazygames.com only): saving is unlocked now */
  onLateInit(fn: () => void): void;
  /** saving became impossible for good ('failed') after boot */
  onSaveFailed(fn: () => void): void;
  /** recorded calls (tests) */
  readonly calls: { name: string; t: number; args?: unknown }[];
}
