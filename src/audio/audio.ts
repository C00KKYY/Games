/** WebAudio mixer (Brief §8.4) – M4 stub, replaced by the audio-runtime agent. */
import type { UICtx, Component } from '../ui/ctx';
import type { Platform } from '../platform/platform';
export interface Audio extends Component {
  /** play a sound by id or M3 alias; unknown/unloaded ids are ignored */
  play(name: string, opts?: { vol?: number; rate?: number }): void;
  /** resume the AudioContext from a user gesture (first tap) */
  unlock(): void;
}
export function mountAudio(_ctx: UICtx, _platform: Platform): Audio {
  return { play() { /* stub */ }, unlock() { /* stub */ }, update() { /* stub */ } };
}
