// Once at the end: the counts of every worker together → the coverage report of the screen tests (coverage/ui) with the
// places not run (missing.txt). Whether everything ran, with the function tests' counts too: tools/coverage_all.mjs
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT, ROOT, report, lines } from './coverage.mjs';

export default async function globalTeardown() {
  if (!existsSync(OUT)) return;
  const dir = join(ROOT, 'coverage/ui'),
    coverage = [];
  for (const f of readdirSync(OUT)) coverage.push(...JSON.parse(readFileSync(join(OUT, f), 'utf8')));
  const all = lines(await report(coverage, { dir, show: false }));
  writeFileSync(join(dir, 'missing.txt'), all.join('\n') + '\n');
}
