// Mutation testing of the saving (stryker.config.mjs, on the modules that keep and send what is written: the changes
// not sent, the drafts, a send over a branch that moved on, when they are sent): every mutant must be caught (NFR-MAINT-02).
// `npm run test:mutation:save` (run by check:all)
import base from './stryker.config.mjs';

export default {
  ...base,
  mutate: ['lib/changes.js', 'lib/drafts.js', 'lib/merge.js', 'lib/sync.js'],
  thresholds: { high: 100, low: 100, break: 100 },
};
