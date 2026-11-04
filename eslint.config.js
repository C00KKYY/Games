import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  ...tseslint.configs.recommended,
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
