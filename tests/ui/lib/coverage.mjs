// istanbul's counts (window.__coverage__ of every page, self.__coverage__ of the service worker) → one report for the
// app's scripts (SCRIPTS): statements, branches (both ways of every if, each side of || && ?? and ?:, default values,
// switch cases), functions and lines. The scripts are instrumented by tools/serve.mjs (NW_COVERAGE=1)
import libCoverage from 'istanbul-lib-coverage';
import libReport from 'istanbul-lib-report';
import reports from 'istanbul-reports';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '../../..');
// the counts each worker took (written when the worker ends, read by global-teardown.mjs)
export const OUT = join(ROOT, 'coverage/ui/workers');
/** @param {string} dir */
const modulesIn = dir =>
  readdirSync(join(ROOT, dir))
    .filter(f => f.endsWith('.js'))
    .sort()
    .map(f => `${dir}/${f}`);
// the app's scripts: the page's (app.js), the service worker, the functions without the page (lib/) and the screens (ui/)
export const SCRIPTS = ['app.js', 'sw.js', ...modulesIn('lib'), ...modulesIn('ui')];

// The counts of a page that goes away (a reload, a new version of the app) are kept in its localStorage (a binding
// called while the page unloads does not reach the test): added up there, and taken with the page that comes after it
// (same origin, same context) when its test ends. The page's localStorage is taken before the app's scripts and the
// tests' run (a test may take it away from the page: its counts are kept all the same)
const STASH = '__nwCoverage';
// the counts of a page or worker (with the ones kept by the pages before it), then set back to 0 (so the next take has
// only what ran since)
export const TAKE = `(() => { const c = globalThis.__coverage__; if (!c) return null;
  const ls = globalThis.__nwStore ?? null;
  const kept = ls ? ls.getItem('${STASH}') : null;
  if (kept) { ls.removeItem('${STASH}'); const k = JSON.parse(kept);
    for (const [path, f] of Object.entries(c)) { const n = k[path]; if (!n) continue;
      for (const i in f.s) f.s[i] += n.s[i] ?? 0; for (const i in f.f) f.f[i] += n.f[i] ?? 0;
      for (const i in f.b) f.b[i] = f.b[i].map((x, j) => x + (n.b[i]?.[j] ?? 0)); } }
  const out = JSON.stringify(c);
  for (const f of Object.values(c)) { for (const k in f.s) f.s[k] = 0; for (const k in f.f) f.f[k] = 0; for (const k in f.b) f.b[k] = f.b[k].map(() => 0); }
  return out; })()`;
// a page that goes away adds its counts to the ones kept
export const ON_LEAVE = `Object.defineProperty(window, '__nwStore', { value: window.localStorage });
addEventListener('pagehide', () => { const c = window.__coverage__; if (!c) return;
  const ls = window.__nwStore;
  const k = JSON.parse(ls.getItem('${STASH}') || '{}');
  for (const [path, f] of Object.entries(c)) { const n = (k[path] ??= { s: {}, f: {}, b: {} });
    for (const i in f.s) n.s[i] = (n.s[i] ?? 0) + f.s[i]; for (const i in f.f) n.f[i] = (n.f[i] ?? 0) + f.f[i];
    for (const i in f.b) n.b[i] = f.b[i].map((x, j) => x + (n.b[i]?.[j] ?? 0)); }
  ls.setItem('${STASH}', JSON.stringify(k));
  for (const f of Object.values(c)) { for (const k in f.s) f.s[k] = 0; for (const k in f.f) f.f[k] = 0; for (const k in f.b) f.b[k] = f.b[k].map(() => 0); } });`;

/**
 * The counts taken, together → coverage-final.json and the html report in `dir`; for each script, its percentages and
 * what did not run
 * @param {object[]} takes @param {{ dir?: string, show?: boolean }} [o]
 */
export async function report(takes, { dir = join(ROOT, 'coverage/ui'), show = true } = {}) {
  const map = libCoverage.createCoverageMap({});
  for (const t of takes) map.merge(t);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'coverage-final.json'), JSON.stringify(map.toJSON()));
  const context = libReport.createContext({ dir, coverageMap: map });
  reports.create('html').execute(context);
  if (show) reports.create('text').execute(context);
  /** @type {Record<string, { statements: number, branches: number, functions: number, lines: number, missing: string[] }>} */
  const out = {};
  for (const name of SCRIPTS) {
    const f = join(ROOT, name);
    if (!map.files().includes(f)) {
      out[name] = { statements: 0, branches: 0, functions: 0, lines: 0, missing: ['never ran'] };
      continue;
    }
    const fc = map.fileCoverageFor(f),
      s = fc.toSummary();
    out[name] = { statements: s.statements.pct, branches: s.branches.pct, functions: s.functions.pct, lines: s.lines.pct, missing: missing(fc, f) };
  }
  return out;
}

// what did not run, with the line and the code there (a branch: which of its ways)
/** @param {any} fc @param {string} file */
function missing(fc, file) {
  const src = readFileSync(file, 'utf8').split('\n');
  /** @param {any} loc @param {string} what */
  const at = (loc, what) => `${loc.start.line}:${loc.start.column} ${what}  ${src[loc.start.line - 1].slice(loc.start.column, loc.start.column + 90).trim()}`;
  /** @type {[number, string][]} */
  const list = [];
  const d = fc.data;
  for (const [k, n] of Object.entries(d.f)) if (!n) list.push([d.fnMap[k].loc.start.line, at(d.fnMap[k].loc, 'function')]);
  for (const [k, counts] of Object.entries(d.b))
    /** @type {number[]} */ (counts).forEach((n, i) => {
      if (n) return;
      const m = d.branchMap[k],
        loc = m.locations[i]?.start?.line ? m.locations[i] : m.loc;
      list.push([loc.start.line, at(loc, `branch ${m.type}[${i}]`)]);
    });
  for (const [k, n] of Object.entries(d.s)) if (!n) list.push([d.statementMap[k].start.line, at(d.statementMap[k], 'statement')]);
  return list.sort((a, b) => a[0] - b[0]).map(x => x[1]);
}

/** the report's lines: each script's percentages, and what did not run @param {Awaited<ReturnType<typeof report>>} r */
export function lines(r) {
  const out = [];
  for (const [file, s] of Object.entries(r)) {
    out.push(`${file}: statements ${s.statements}% ・ branches ${s.branches}% ・ functions ${s.functions}% ・ lines ${s.lines}%`);
    if (s.missing.length) out.push(`  not run (${s.missing.length}):`, ...s.missing.map(m => `    ${m}`));
  }
  return out;
}
