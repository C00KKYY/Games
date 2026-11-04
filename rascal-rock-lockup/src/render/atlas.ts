import { Assets, Spritesheet, Texture } from 'pixi.js';

let sheet: Spritesheet | null = null;
/** picks @2x when DPR × maxZoom > 1.5 (Brief §7.4) */
export async function loadAtlas(dpr: number, maxZoom: number, onProgress?: (p: number) => void): Promise<void> {
  const res = dpr * maxZoom > 1.5 ? 2 : 1;
  const url = `atlas/atlas@${res}x.json`;
  sheet = await Assets.load<Spritesheet>({ src: url, data: { textureOptions: { autoGenerateMipmaps: true, scaleMode: 'linear' } } }, onProgress);
}
export function tex(name: string): Texture {
  const t = sheet?.textures[name];
  if (!t) throw new Error('missing sprite ' + name);
  return t;
}
export const hasTex = (name: string) => !!sheet?.textures[name];
