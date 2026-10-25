// The function tests: the pure functions of lib/ without a browser (tests/unit). `npm run test:unit`
// Every line and every branch of lib/ is run by them (the thresholds stop the run otherwise). The coverage is istanbul's,
// as the screen tests' (coverage/unit/coverage-final.json): tools/coverage_all.mjs adds the two
import { defineConfig } from 'vitest/config';

// the dates are shown in the author's time
process.env.TZ = 'Asia/Tokyo';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.mjs'],
    coverage: {
      provider: 'istanbul',
      include: ['lib/**/*.js'],
      reporter: ['json', 'text', 'text-summary'],
      reportsDirectory: 'coverage/unit',
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
