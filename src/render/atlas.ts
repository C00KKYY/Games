import { Assets, Spritesheet, Texture, type SpritesheetData } from 'pixi.js';
import { assetUrl, inlined } from '../platform/assets';

let sheet: Spritesheet | null = null;
/** picks @2x when DPR × maxZoom > 1.5 (Brief §7.4) */
export async function loadAtlas(dpr: number, maxZoom: number, onProgress?: (p: number) => void): Promise<void> {
  const res = dpr * maxZoom > 1.5 ? 2 : 1;
  const url = `atlas/atlas@${res}x.json`;
  if (inlined(url)) {
    // single-file playtest build: JSON and image are data: URLs (the spritesheet loader cannot resolve meta.image next to one)
    const data = (await (await fetch(assetUrl(url))).json()) as SpritesheetData;
    const texture = await Assets.load<Texture>({ src: assetUrl(`atlas/${data.meta.image}`), data: { autoGenerateMipmaps: true, scaleMode: 'linear' } }, onProgress);
    sheet = new Spritesheet(texture, data);
    await sheet.parse();
    return;
  }
  sheet = await Assets.load<Spritesheet>({ src: url, data: { textureOptions: { autoGenerateMipmaps: true, scaleMode: 'linear' } } }, onProgress);
}
export function tex(name: string): Texture {
  const t = sheet?.textures[name];
  if (!t) throw new Error('missing sprite ' + name);
  return t;
}
export const hasTex = (name: string) => !!sheet?.textures[name];
