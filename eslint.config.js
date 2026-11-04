import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] } },
  // dev tools (capture, bots, probes) talk to the page through untyped globals
  { files: ['tools/**/*.ts'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['pixi.js', 'pixi.js/*'], message: 'sim/ must stay renderer-free' },
          { group: ['../render/*', '../ui/*', '../audio/*', '../platform/*'], message: 'sim/ must stay pure' },
        ],
      }],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'localStorage', 'requestAnimationFrame', 'performance'],
    },
  },
);
