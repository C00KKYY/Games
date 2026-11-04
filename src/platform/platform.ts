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
}
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
  /** recorded calls (tests) */
  readonly calls: { name: string; t: number; args?: unknown }[];
}
