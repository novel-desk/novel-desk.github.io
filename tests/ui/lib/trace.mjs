// The traces of the screen tests for the trace checks of the models in formal/ (tools/trace_check.mjs, NFR-MAINT-03):
// the page writes down its steps (ui/trace.js, through globalThis.__nwTrace, given here), each with what the screen
// holds after it; the test writes down what it does elsewhere (step). Each line is put in the model's terms of one
// episode (Send: its path; Rebase: the path "a" it was at and "b" it is renamed to), the blobs and commits named by what
// they hold on the fake GitHub: a text, and the number of a commit on the branch (the first one 0). Written when the
// test ends, to test-results/traces/<browser>-<name>.ndjson
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIR = join(resolve(import.meta.dirname, '../../..'), 'test-results/traces');

/**
 * @param {import('@playwright/test').Page} page @param {import('./fake-github.mjs').FakeRepo} work
 * @param {{ model: 'Send' | 'Rebase', name: string, browser: string, paths: string[] }} o
 */
export async function follow(page, work, { model, name, browser, paths }) {
  /** @type {object[]} */
  const lines = [];
  /** @param {string} sha */
  const textOf = sha => work.blobs.get(sha)?.toString() ?? '';
  /** @param {string} commit */
  const numberOf = commit => work.ancestors(commit).length - 1;
  // the branch on GitHub now
  const branch = () => {
    const files = work.files(work.refs[work.defaultBranch]);
    const at = (/** @type {string} */ p) => (files[p] ? textOf(files[p].sha) : null);
    const n = numberOf(work.refs[work.defaultBranch]);
    return model === 'Send' ? { n, text: at(paths[0]) ?? '' } : { n, a: at(paths[0]), b: at(paths[1]) };
  };
  /** @param {any} s what the screen holds (ui/desk.js traceWith) */
  const screenOf = s => {
    if (!('commit' in s)) return {};
    const n = numberOf(s.commit);
    /** @param {string} p */
    const read = p => (s.blobs[p] ? textOf(s.blobs[p]) : null);
    /** @param {string} p */
    const draft = p => s.drafts.find((/** @type {any} */ d) => d.path === p);
    if (model === 'Send') {
      const d = draft(paths[0]);
      return {
        read: { n, text: read(paths[0]) ?? '' },
        draft: d ? { text: d.text, base: d.base ? textOf(d.base) : '' } : null,
        ...(s.current === paths[0] && { screen: s.screen }),
        ...('composing' in s && { composing: s.composing }),
      };
    }
    /** @param {string} p */
    const change = p => {
      const d = draft(p);
      if (!d) return { kind: 'none', text: '', base: null, op: false };
      const kind = d.gone ? 'gone' : d.text !== undefined && d.text !== null ? 'text' : 'sha';
      return { kind, text: kind === 'text' ? d.text : kind === 'sha' ? textOf(d.sha) : '', base: d.base ? textOf(d.base) : null, op: Boolean(d.op) };
    };
    return { read: { n, a: read(paths[0]), b: read(paths[1]) }, ch: { a: change(paths[0]), b: change(paths[1]) } };
  };
  await page.exposeBinding('__nwTrace', (_, /** @type {string} */ json) => {
    const s = JSON.parse(json);
    // (the branch, after the step that moved it: the page's 「Move」; the others say only what the page holds)
    lines.push({ a: s.a, ...screenOf(s), ...(s.a === 'Move' && { gh: branch() }) });
  });
  return {
    lines,
    // a step of the test (written elsewhere, a commit made whose answer is lost): the branch after it
    /** @param {string} a */
    step: a => lines.push({ a, gh: branch() }),
    // the lines that the page has written down so far
    /** @param {string} a */
    has: a => lines.some(l => /** @type {any} */ (l).a === a),
    write: () => {
      mkdirSync(DIR, { recursive: true });
      writeFileSync(join(DIR, `${browser}-${name}.ndjson`), [{ model }, ...lines].map(l => JSON.stringify(l)).join('\n') + '\n');
    },
  };
}
