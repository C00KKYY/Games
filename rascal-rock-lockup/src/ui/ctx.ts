/**
 * UI contract (docs/UI_DESIGN.md). Every DOM component and the canvas tool receive one UICtx.
 * Components never touch the sim except through ctx.w (read) and ctx.cmd (write).
 */
import type { World, CommandResult, SimEvent } from '../sim/types';
import type { cmd as Cmd } from '../sim/sim';
import type { Camera } from '../render/camera';
import type { Key, Lang } from '../i18n/i18n';
import type { RoomType, StaffRole } from '../content/balance';
import type { Container } from 'pixi.js';
import type { Settings } from '../save/serialize';

export type Selection = { kind: 'room'; id: number } | { kind: 'agent'; id: number } | null;
export type Tool =
  | { kind: 'none' }
  | { kind: 'build'; type: RoomType }
  | { kind: 'resize'; roomId: number }
  | { kind: 'demolish' };

/** tiny observable value */
export class Store<T> {
  private fns: ((v: T, prev: T) => void)[] = [];
  constructor(private v: T) {}
  get() { return this.v; }
  set(v: T) { const p = this.v; this.v = v; for (const f of this.fns) f(v, p); }
  on(fn: (v: T, prev: T) => void) { this.fns.push(fn); return () => { this.fns = this.fns.filter(f => f !== fn); }; }
}

export interface TipContent { title: string; body?: string; hotkey?: string }

export interface UICtx {
  /** live world – read only (mutated by the sim each tick) */
  w: World;
  /** the only way to change the game */
  cmd: typeof Cmd;
  t: (key: Key, vars?: Record<string, string | number>) => string;
  lang: () => Lang;
  /** K/M/B/T number format, localised separator */
  fmt: (n: number) => string;
  cam: Camera;
  /** DOM root of the HUD layer (position:absolute; inset:0; pointer-events:none) */
  root: HTMLElement;
  /** URL of a UI icon (public/ui/<name>.svg) */
  icon: (name: string) => string;
  selection: Store<Selection>;
  tool: Store<Tool>;
  /** which bottom menu card is open */
  menu: Store<'rooms' | 'staff' | null>;
  /** the game canvas (pointer events for tools.ts) */
  canvas: HTMLCanvasElement;
  /** Pixi container in world space above the objects – for ghosts, selection, overlays (tools.ts / render/ghost.ts) */
  overlay: Container;
  /** true when the viewport is ≤ 900 px wide (compact HUD, Brief §6.6) */
  compact: Store<boolean>;
  /** coarse pointer (touch) */
  touch: boolean;
  /** short non-blocking message, max 2 lines (Brief §16) */
  toast(text: string, opts?: { icon?: string; kind?: 'info' | 'good' | 'bad'; ms?: number }): void;
  /** attach a tooltip (hover 300 ms / long-press 400 ms) */
  tip(el: HTMLElement, content: () => TipContent): void;
  /** fly the camera to a world point in tile units */
  focusTile(x: number, y: number, zoom?: number): void;
  /** UI sound (stub until M4 audio) */
  sound(name: string): void;
  /** pause handling (P / pause button): pausing calls platform.gameplayStop via the app */
  setPaused(p: boolean): void;
  paused(): boolean;
  /** open/close the modal overlays (settings, help) – modals pause the game (Brief §11.1) */
  openModal(name: 'settings' | 'help'): void;
  closeModal(): void;
  /**
   * result feedback for a command: on failure a toast with the localised reason (every sim reason has its own text).
   * `message` is an already localised override shown instead of the mapped reason (e.g. 'Unlocks at 3 stars').
   */
  feedback(r: CommandResult, message?: string): void;
  /** subscribe to new sim events; the app dispatches each event exactly once, in order, once per frame. Returns unsubscribe */
  onEvent(fn: (e: SimEvent) => void): () => void;
  /**
   * pointer arbitration with the camera (src/ui/input.ts): while `ownsPointer` is true, a single left button / single
   * finger does NOT pan – tools.ts sets it while a build/demolish tool is active or while it drags a room edge.
   * Right/middle button, Space+left and two fingers always pan.
   */
  input: { ownsPointer: boolean };
  /** increments each time a camera pan drag starts (≥ 6 px) – panels close on it */
  panned: Store<number>;
  /** player settings (volumes, language, screenshake) – persisted by the save system (M4) */
  settings: Store<Settings>;
  /**
   * switch the UI language at runtime (settings modal). Every component re-renders ALL its texts when ctx.lang()
   * differs from the language it last rendered (check in update()).
   */
  setLang(l: Lang): void;
  /**
   * "Reset progress" (settings modal): wipe both save slots in whatever storage the platform uses (SDK data module on
   * CrazyGames, localStorage elsewhere), never save again this session, reload. Attached by the app.
   */
  resetProgress?(): void;
}

export interface Component { update(dt: number): void; destroy?(): void }

export const ROLE_ICON: Record<StaffRole, string> = { cook: 'meal', janitor: 'shower', guard: 'staff', teacher: 'book', foreman: 'yarn', clerk: 'gate', carter: 'crate' };
export const ROOM_ICON: Partial<Record<RoomType, string>> = { bunk: 'bed', canteen: 'meal', wash: 'shower', workshop: 'yarn', classroom: 'book', guard: 'staff', yard: 'decor', gate: 'gate', dock: 'ferry' };
