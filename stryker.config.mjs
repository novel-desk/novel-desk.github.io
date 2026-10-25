// Mutation testing of the functions without the page (lib/): each small change to the code (a mutant) should make a
// function test (tests/unit) fail. `npm run test:mutation`; the report is in reports/mutation/
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.mjs' },
  mutate: ['lib/**/*.js'],
  reporters: ['clear-text', 'html', 'json'],
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 95, break: null },
  tempDirName: '.stryker-tmp',
  // tsconfig.json (the type check, tsc) is not for Stryker: left as it is. Stryker would rewrite it in its sandbox
  // with TypeScript's JS API, which TypeScript 7 does not have (ts.parseConfigFileTextToJson is not a function)
  tsconfigFile: '',
};
