// The coverage of the app's scripts, the screen tests' (coverage/ui) and the function tests' (coverage/unit) together,
// place by place. Lists what neither ran (coverage/all/missing.txt) and exits with 1 unless everything ran (NFR-MAINT-02).
// `node tools/coverage_all.mjs` (after npm run test:ui and npm run test:unit)
// Both are istanbul's counts of the same code, but vitest's places have lost the column where they end (they come
// back through the source map), so istanbul's own merge takes them for other places: they are matched here by where
// they start (a branch: and its kind). A place of the function tests not found in the screen tests' is an error.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, report, lines } from '../tests/ui/lib/coverage.mjs';

/** @param {string} d */
const read = d => {
  const p = join(ROOT, d, 'coverage-final.json');
  if (!existsSync(p)) {
    console.log(`${p} がありません（npm run test:ui と npm run test:unit を先に）`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(p, 'utf8'));
};
const ui = read('coverage/ui'),
  unit = read('coverage/unit');
/** @param {any} l */
const at = l => `${l.start.line}:${l.start.column}`;
/** @type {Record<string, [(d: any) => any, (m: any) => string]>} */
const keys = {
  s: [d => d.statementMap, l => at(l)],
  f: [d => d.fnMap, m => at(m.decl || m.loc)],
  b: [d => d.branchMap, m => `${at(m.loc)} ${m.type} ${m.locations.length}`],
};
let unmatched = 0;
for (const [file, u] of Object.entries(unit)) {
  const base = ui[file];
  if (!base) {
    ui[file] = u;
    continue;
  }
  for (const [kind, [map, key]] of Object.entries(keys)) {
    const index = new Map(Object.entries(map(base)).map(([id, m]) => [key(m), id]));
    for (const [id, m] of Object.entries(map(u))) {
      const to = index.get(key(m));
      if (to == null) {
        unmatched++;
        console.log(`合わない場所: ${file.slice(ROOT.length + 1)} ${kind} ${key(m)}`);
        continue;
      }
      if (kind === 'b') base.b[to] = base.b[to].map((/** @type {number} */ n, /** @type {number} */ i) => n + u.b[id][i]);
      else base[kind][to] += u[kind][id];
    }
  }
}
const dir = join(ROOT, 'coverage/all');
const r = await report([ui], { dir, show: false });
const all = lines(r);
writeFileSync(join(dir, 'missing.txt'), all.join('\n') + '\n');
console.log(all.join('\n'));
const bad = unmatched + Object.values(r).filter(s => s.missing.length).length;
if (bad) {
  console.log(unmatched ? `単体テストの場所 ${unmatched} 個が画面の試験の記録と合いません` : '100% ではありません（coverage/all/missing.txt）');
  process.exit(1);
}
