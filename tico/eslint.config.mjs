// One rule, and it is the one that has bitten this project three times: an
// identifier that is used but never imported. A service worker that throws at
// module scope does not fail loudly — it simply stops having any listeners, so
// reminders quietly never fire and every test that does not check a
// notification still passes.
export default [
  {
    files: ['*.js'],
    ignores: ['test-*.js', 'make-store-assets.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        chrome: 'readonly', window: 'readonly', document: 'readonly',
        navigator: 'readonly', location: 'readonly', self: 'readonly',
        console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
        fetch: 'readonly', URL: 'readonly', URLSearchParams: 'readonly',
        Blob: 'readonly', TextEncoder: 'readonly', CSS: 'readonly',
        LanguageModel: 'readonly', structuredClone: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
    },
  },
];
