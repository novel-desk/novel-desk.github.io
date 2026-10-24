// The work open: its branch read from GitHub (the commit, the tree, novel.toml, the episodes' texts), or, offline, as
// it was last read. The blobs are kept on the device by their sha, so a text read once is not asked for again
import { filesOf, bytesOf, textOf } from '../lib/github.js';
import { CONFIG, firstLayout, headingsOf, parseLayout, tableOfContents, episodesOf } from '../lib/layout.js';
import * as gh from './github.js';
import * as store from './db.js';

/**
 * The work as read: where it was read from, its files, and what novel.toml makes of them
 * @typedef {object} Work
 * @property {string} repo 「owner/name」
 * @property {string} branch
 * @property {string} commit the commit read
 * @property {string} tree its tree
 * @property {Record<string, { sha: string, mode: string }>} blobs the files by path
 * @property {string[]} folders
 * @property {import('../lib/layout.js').Layout} layout
 * @property {string[]} problems what novel.toml has that cannot be read
 * @property {import('../lib/layout.js').TocItem[]} toc
 * @property {Record<string, string>} headings
 * @property {Record<string, string | null>} texts the episodes' texts by path (null: not UTF-8, or not on the device offline)
 * @property {boolean} offline read from the device, not from GitHub
 */

// a blob's bytes: from the device, else from GitHub (and kept)
/** @param {string} repo @param {string} sha @returns {Promise<Uint8Array>} */
export async function bytes(repo, sha) {
  const kept = await store.get('blobs', sha);
  if (kept) return kept;
  const got = bytesOf(await gh.blob(repo, sha));
  await store.put('blobs', sha, got);
  return got;
}
// a blob's text, when the device has it (offline: null when it does not)
/** @param {string} repo @param {string} sha @param {boolean} offline */
async function textAt(repo, sha, offline) {
  if (offline) {
    const kept = await store.get('blobs', sha);
    return kept ? textOf(kept) : null;
  }
  return textOf(await bytes(repo, sha));
}
// does `f` for every item, `width` at a time
/** @template T @param {T[]} items @param {number} width @param {(item: T) => Promise<void>} f */
async function each(items, width, f) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await f(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, worker));
}

/** @param {string} repo @param {string} branch */
async function readBranch(repo, branch) {
  const commit = await gh.headOf(repo, branch);
  const tree = await gh.treeOf(repo, commit);
  const listing = await gh.treeFiles(repo, tree);
  if (listing.truncated) throw new Error('リポジトリのファイルが多すぎて、GitHub が一覧を全部返しませんでした');
  return { repo, branch, commit, tree, ...filesOf(listing.tree) };
}
/** @param {{ repo: string, blobs: Record<string, { sha: string }> }} files @param {boolean} offline */
async function layoutOf(files, offline) {
  const config = files.blobs[CONFIG];
  if (!config) return { layout: firstLayout(), problems: [] };
  const src = await textAt(files.repo, config.sha, offline);
  if (src === null) return { layout: firstLayout(), problems: ['novel.toml が UTF-8 ではないので読めません'] };
  return parseLayout(src);
}
// The work, read from GitHub: its default branch, or the one novel.toml names. Offline, the one last read
/** @param {string} repo @param {string} defaultBranch @returns {Promise<Work>} */
export async function load(repo, defaultBranch) {
  /** @type {Awaited<ReturnType<typeof readBranch>>} */
  let files;
  let offline = false;
  try {
    files = await readBranch(repo, defaultBranch);
    const { layout } = await layoutOf(files, false);
    if (layout.branch && layout.branch !== defaultBranch) files = await readBranch(repo, layout.branch);
  } catch (err) {
    const snapshot = err instanceof gh.GitHubError && err.status === 0 && (await store.get('snapshots', repo));
    if (!snapshot) throw err;
    files = snapshot;
    offline = true;
  }
  return contents(files, offline);
}
// The work from its files: novel.toml, the table of contents, the episodes' texts. Kept as the last read of the work
/** @param {Awaited<ReturnType<typeof readBranch>>} files @param {boolean} offline @returns {Promise<Work>} */
export async function contents(files, offline) {
  const { layout, problems } = await layoutOf(files, offline);
  const toc = tableOfContents(layout, Object.keys(files.blobs), files.folders);
  /** @type {Record<string, string | null>} */
  const texts = {};
  await each(episodesOf(toc), 6, async e => {
    texts[e.path] = await textAt(files.repo, files.blobs[e.path].sha, offline);
  });
  if (!offline) await store.put('snapshots', files.repo, files);
  return { ...files, layout, problems, toc, headings: headingsOf(layout, toc, texts), texts, offline };
}
