// The work as the screen shows it: the branch's files with the changes not sent over them, and what novel.toml (with
// its keys set by those changes) makes of them (no screen, no state of the app: tested by itself in tests/unit)
import { foldersOf, viewFiles } from './changes.js';
import { episodesOf, firstLayout, headingsOf, parseLayout, tableOfContents } from './layout.js';
import { editToml } from './tomledit.js';

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
