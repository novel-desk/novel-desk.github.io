// ESLint: the recommended rules (@eslint/js), for the screens (the browser), the service worker, and the tests and
// tools (Node). `npm run lint:js`
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'coverage/', 'test-results/', 'playwright-report/', 'reports/', '.stryker-tmp/'] },
  js.configs.recommended,
  {
    rules: {
      // 「catch {}」: a failure that changes nothing is let go on purpose (offline, a picture that cannot be read)
      'no-empty': ['error', { allowEmptyCatch: true }],
      // full-width spaces in Japanese text, its patterns and the comments about them
      'no-irregular-whitespace': ['error', { skipStrings: true, skipComments: true, skipRegExps: true, skipTemplates: true }],
    },
  },
  { files: ['app.js', 'lib/**/*.js', 'ui/**/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['sw.js'], languageOptions: { globals: globals.serviceworker, sourceType: 'script' } },
  { files: ['boot.js'], languageOptions: { globals: globals.browser, sourceType: 'script' } },
  { files: ['tests/**/*.mjs', 'tools/**/*.mjs', '*.mjs'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  // (a Playwright fixture names what it needs in its first argument, used or not)
  { files: ['tests/ui/**'], rules: { 'no-unused-vars': ['error', { args: 'none' }] } },
];
