// What a toast says when something is done names what was done (which work, which repository, what went, what it is
// now): a toast is seen where the button was pressed, often far from the state that says more (「送りました」 alone,
// pressed under the text, said nothing of what went)
import { test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../..');

test('ui/: no toast of a fixed 「…ました」 that does not say what', () => {
  const bare = readdirSync(join(ROOT, 'ui'))
    .filter(f => f.endsWith('.js'))
    .flatMap(f =>
      [...readFileSync(join(ROOT, 'ui', f), 'utf8').matchAll(/toast\('([^']*)'\)/g)]
        .map(m => m[1])
        // (what, or why, said in 「」 or （）)
        .filter(text => /ました$/.test(text) && !/[「（]/.test(text))
        .map(text => `${f}: ${text}`),
    );
  expect(bare).toEqual([]);
});
