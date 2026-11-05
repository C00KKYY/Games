import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import license from 'rollup-plugin-license';
import { viteSingleFile } from 'vite-plugin-singlefile';

const ALLOWED = /^(MIT|ISC|BSD-2-Clause|BSD-3-Clause|Apache-2\.0|OFL-1\.1|CC0-1\.0|CC-BY-4\.0)$/;
const single = process.env.SINGLEFILE === '1';
/**
 * Web fonts come in through CSS @import (src/ui/hud.css), which the license plugin does not see: their OFL-1.1 texts
 * (Brief §15.5 "OFL-Texte der Fonts") are appended to THIRD_PARTY_NOTICES from the packages' own LICENSE files.
 */
const FONTS = ['@fontsource/fredoka', '@fontsource/inter'];
const fontNotice = (name: string) => {
  const pkg = JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')) as { version: string; license: string };
  if (!ALLOWED.test(pkg.license)) throw new Error(`${name}: license ${pkg.license} not allowed`);
  return `Name: ${name}\nVersion: ${pkg.version}\nLicense: ${pkg.license}\n\n${readFileSync(`node_modules/${name}/LICENSE`, 'utf8').trim()}`;
};

/**
 * virtual:rrl-inline-assets – the files the game loads from public/ at runtime (ui/*.svg, atlas/*, audio/*.mp3), keyed
 * by their relative URL. Empty in the normal build. In the single-file playtest build (SINGLEFILE=1, Brief §13.3: runs by
 * double-click, never submitted) every file becomes a data: URL, because a page opened from file:// can neither fetch()
 * nor reference files next to it once everything sits in one HTML file.
 */
function inlineAssets(on: boolean): Plugin {
  const ID = 'virtual:rrl-inline-assets', RID = '\0' + ID;
  const MIME: Record<string, string> = { svg: 'image/svg+xml', webp: 'image/webp', json: 'application/json', mp3: 'audio/mpeg' };
  return {
    name: 'rrl-inline-assets',
    resolveId: (id) => (id === ID ? RID : null),
    load(id) {
      if (id !== RID) return null;
      const map: Record<string, string> = {};
      if (on) for (const dir of ['ui', 'atlas', 'audio']) {
        for (const f of readdirSync(join('public', dir))) {
          const ext = f.slice(f.lastIndexOf('.') + 1);
          if (!MIME[ext] || f === 'loops.json') continue;
          map[`${dir}/${f}`] = `data:${MIME[ext]};base64,${readFileSync(join('public', dir, f)).toString('base64')}`;
        }
      }
      return `export default ${JSON.stringify(map)};`;
    },
  };
}

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(process.env.BUILD_VARIANT ?? 'BASIC') },
  build: {
    target: 'es2020',
    assetsInlineLimit: single ? 100_000_000 : 0,
    chunkSizeWarningLimit: 1200,
    outDir: single ? 'dist-single' : 'dist',
    // the playtest single file needs no public/ copy next to it (everything is inlined)
    copyPublicDir: !single,
  },
  plugins: [
    inlineAssets(single),
    license({
      thirdParty: {
        includePrivate: false,
        allow: { test: (dep) => ALLOWED.test(String(dep.license)), failOnUnlicensed: true, failOnViolation: true },
        // same format as the plugin's default template (dist/index.js: d.text() joined by blank-line '---' blocks),
        // followed by the credits of the shipped third-party audio (CC0 / CC BY, Brief §15.5)
        output: {
          file: 'licenses/THIRD_PARTY_NOTICES.txt',
          template: (deps) => [...deps.map((d) => d.text()), ...FONTS.map(fontNotice)].join('\n\n---\n\n') + '\n\n---\n\n' + readFileSync('licenses/AUDIO_CREDITS.md', 'utf8'),
        },
      },
    }),
    ...(single ? [viteSingleFile()] : []),
  ],
  server: { port: 5173 },
  preview: { port: 4173 },
});
