// The property tests (fast-check: tests/props): random sequences of what the author does and what GitHub answers,
// over the real modules of sending and reading, with the fake GitHub of the screen tests. `npm run test:props`
// (check:all runs them with a fixed seed: NW_PROPS_SEED)
import { defineConfig } from 'vitest/config';

process.env.TZ = 'Asia/Tokyo';

export default defineConfig({
  test: { include: ['tests/props/**/*.test.mjs'], testTimeout: 120000 },
});
