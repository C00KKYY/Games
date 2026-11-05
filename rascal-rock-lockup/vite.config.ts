import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import license from 'rollup-plugin-license';
import { viteSingleFile } from 'vite-plugin-singlefile';

const ALLOWED = /^(MIT|ISC|BSD-2-Clause|BSD-3-Clause|Apache-2\.0|OFL-1\.1|CC0-1\.0|CC-BY-4\.0)$/;
const single = process.env.SINGLEFILE === '1';

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(process.env.BUILD_VARIANT ?? 'BASIC') },
  build: {
    target: 'es2020',
    assetsInlineLimit: single ? 100_000_000 : 0,
    chunkSizeWarningLimit: 1200,
    outDir: single ? 'dist-single' : 'dist',
  },
  plugins: [
    license({
      thirdParty: {
        includePrivate: false,
        allow: { test: (dep) => ALLOWED.test(String(dep.license)), failOnUnlicensed: true, failOnViolation: true },
        // same format as the plugin's default template (dist/index.js: d.text() joined by blank-line '---' blocks),
        // followed by the credits of the shipped third-party audio (CC0 / CC BY, Brief §15.5)
        output: {
          file: 'licenses/THIRD_PARTY_NOTICES.txt',
          template: (deps) => deps.map((d) => d.text()).join('\n\n---\n\n') + '\n\n---\n\n' + readFileSync('licenses/AUDIO_CREDITS.md', 'utf8'),
        },
      },
    }),
    ...(single ? [viteSingleFile()] : []),
  ],
  server: { port: 5173 },
  preview: { port: 4173 },
});
