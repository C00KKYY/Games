/**
 * URLs of the files the game loads from public/ at runtime (relative to index.html). In the single-file playtest build
 * (SINGLEFILE=1, vite.config.ts inlineAssets) the files are bundled as data: URLs, so the page also runs from file://;
 * in the normal build the map is empty and the relative path is returned unchanged.
 */
import INLINE from 'virtual:rrl-inline-assets';

export const assetUrl = (path: string): string => INLINE[path] ?? path;
/** true in the single-file playtest build */
export const inlined = (path: string): boolean => path in INLINE;
