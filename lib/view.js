// The work as the screen shows it: the branch's files with the changes not sent over them, and what novel.toml (with
// its keys set by those changes) makes of them (no screen, no state of the app: tested by itself in tests/unit)
import { foldersOf, viewFiles } from './changes.js';
import { episodesOf, firstLayout, headingsOf, parseLayout, tableOfContents } from './layout.js';
import { editToml } from './tomledit.js';
import { extOf } from './merge.js';

/**
 * The work as read from the branch: its files, novel.toml's text (null: none, or not readable, said in `problems`),
 * the episodes' texts by path and by blob (null: not UTF-8, or not on the device offline)
 * @typedef {{ blobs: import('./changes.js').Blobs, config: string | null, problems: string[], texts: Record<string, string | null>, shaTexts: Record<string, string | null> }} Read
 */
/**
 * @typedef {object} View
 * @property {import('./changes.js').Blobs} files
 * @property {string | null} config novel.toml's text, its keys set
 * @property {import('./layout.js').Layout} layout
 * @property {string[]} problems
 * @property {import('./layout.js').TocItem[]} toc
 * @property {Record<string, string | null>} texts the episodes' texts, by path
 * @property {Record<string, string>} headings
 */

/** @param {Read} read @param {import('./changes.js').Changes} changes @param {import('./tomledit.js').TomlEdit[]} edits @returns {View} */
export function viewOf(read, changes, edits) {
  const files = viewFiles(read.blobs, changes.values());
  let config = read.config;
  const problems = [...read.problems];
  if (edits.length) {
    const edited = editToml(config ?? '', edits);
    if (edited.text === null) problems.push(edited.error);
    else config = edited.text;
  }
  const parsed = config === null ? { layout: firstLayout(), problems: [] } : parseLayout(config);
  const paths = Object.keys(files);
  const toc = tableOfContents(parsed.layout, paths, foldersOf(paths));
  /** @type {Record<string, string | null>} */
  const texts = {};
  for (const { path } of episodesOf(toc)) {
    const c = changes.get(path);
    if (c) texts[path] = c.text ?? (c.sha ? (read.shaTexts[c.sha] ?? null) : null);
    else texts[path] = path in read.texts ? read.texts[path] : (read.shaTexts[read.blobs[path].sha] ?? null);
  }
  return { files, config, layout: parsed.layout, problems: [...problems, ...parsed.problems], toc, texts, headings: headingsOf(parsed.layout, toc, texts) };
}

// --- reading the work (ui/work.js)

// The branch novel.toml names to read in place of the default one (FR-WORK-01; '' none): one it names, not the default,
// and not the one found gone already
/** @param {string} named @param {string} defaultBranch @param {string} gone */
export const namedBranch = (named, defaultBranch, gone) => (named && named !== defaultBranch && named !== gone ? named : '');
// The blobs whose texts tell the files apart (lib/merge.js Look) for the texts written alone between `was` and `now`:
// for each text whose file is not the one it was written from any more, the blob written from and the one read, and
// the files of the same kind come or changed since; each once
/**
 * @param {import('./drafts.js').Draft[]} drafts @param {{ blobs: Record<string, { sha: string }> }} was @param {{ blobs: Record<string, { sha: string }> }} now
 * @returns {string[]}
 */
export function shasToLook(drafts, was, now) {
  /** @type {(string | undefined)[]} */
  const shas = [];
  /** @type {Set<string>} */
  const kinds = new Set();
  for (const d of drafts) {
    if (d.op || !d.base || now.blobs[d.path]?.sha === d.base) continue;
    shas.push(d.base, was.blobs[d.path]?.sha);
    kinds.add(extOf(d.path));
  }
  for (const [q, { sha }] of Object.entries(now.blobs)) if (kinds.has(extOf(q)) && sha !== was.blobs[q]?.sha) shas.push(sha);
  return [.../** @type {Set<string>} */ (new Set(shas.filter(s => s !== undefined)))];
}
