// The work open: its branch read from GitHub (the commit, the tree, novel.toml, the episodes' texts), or, offline, as
// it was last read. The blobs are kept on the device by their sha, so a text read once is not asked for again. What the
// screen shows over it (the changes not sent) is lib/view.js's
import { filesOf, bytesOf, japaneseText, textOf } from '../lib/github.js';
import { CONFIG, firstLayout, parseLayout, tableOfContents, episodesOf } from '../lib/layout.js';
import { foldersOf } from '../lib/changes.js';
import * as gh from './github.js';
import * as store from './db.js';

/**
 * The work as read: where it was read from, its files, novel.toml's text and the episodes' texts
 * @typedef {object} WorkRead
 * @property {string} repo 「owner/name」
 * @property {string} branch
 * @property {string} commit the commit read
 * @property {string} tree its tree
 * @property {number} updated when that commit was made (ms; 0 when not known)
 * @property {Record<string, { sha: string, mode: string }>} blobs the files by path
 * @property {string[]} folders
 * @property {boolean} offline read from the device, not from GitHub
 * @typedef {WorkRead & import('../lib/view.js').Read} Work
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
/** @type {Set<string>} the blobs read from another encoding than UTF-8 (a Japanese text: FR-WORK-03) */
export const converted = new Set();
// a blob's text: UTF-8, or a Japanese text of another encoding (noted in `converted`); null when it is neither
/** @param {string} sha @param {Uint8Array} b */
function decode(sha, b) {
  const text = textOf(b);
  if (text !== null) return text;
  const other = japaneseText(b);
  if (other !== null) converted.add(sha);
  return other;
}
// a blob's text, when the device has it (offline: null when it does not)
/** @param {string} repo @param {string} sha @param {boolean} offline */
export async function textAt(repo, sha, offline) {
  if (offline) {
    const kept = await store.get('blobs', sha);
    return kept ? decode(sha, kept) : null;
  }
  return decode(sha, await bytes(repo, sha));
}
// does `f` for every item, `width` at a time
/** @template T @param {T[]} items @param {number} width @param {(item: T) => Promise<void>} f */
export async function each(items, width, f) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await f(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, worker));
}

/** @param {string} repo @param {string} branch @param {[string, string][]} heads the refs looked at, noted */
async function readBranch(repo, branch, heads) {
  const commit = await gh.headOf(repo, branch);
  heads.push([branch, commit]);
  const { tree, date } = await gh.commitOf(repo, commit);
  const listing = await gh.treeFiles(repo, tree);
  if (listing.truncated) throw new Error('リポジトリのファイルが多すぎて、GitHub が一覧を全部返しませんでした');
  return { repo, branch, commit, tree, updated: date, ...filesOf(listing.tree) };
}
/** @typedef {Awaited<ReturnType<typeof readBranch>>} Files */
// novel.toml's text, and what keeps it from being read
/** @param {{ repo: string, blobs: Record<string, { sha: string }> }} files @param {boolean} offline */
async function configOf(files, offline) {
  const config = files.blobs[CONFIG];
  if (!config) return { config: null, problems: [] };
  const src = await textAt(files.repo, config.sha, offline);
  if (src === null) return { config: null, problems: ['novel.toml が UTF-8 ではないので読めません'] };
  return { config: src, problems: [] };
}
// a branch read, or null when GitHub has no such branch (deleted after a merge, say; noted in `heads` with no commit)
/** @param {string} repo @param {string} branch @param {[string, string][]} heads @returns {Promise<Files | null>} */
async function readIfThere(repo, branch, heads) {
  try {
    return await readBranch(repo, branch, heads);
  } catch (err) {
    if (err instanceof gh.GitHubError && err.status === 404) {
      if (!heads.some(([b]) => b === branch)) heads.push([branch, '']);
      return null;
    }
    throw err;
  }
}
// The files of the branch in use, read from GitHub: the branch chosen on this device, else the one novel.toml names,
// else the default branch; a branch that GitHub no longer has is passed over (and named in `gone`). `heads`: every ref
// looked at on the way, and the commit it was at ('' not there), so that a summary kept by them can be checked with
// those refs alone (FR-WORK-01)
/** @param {string} repo @param {string} defaultBranch @param {string} chosen ('' none) */
export async function readFiles(repo, defaultBranch, chosen) {
  /** @type {[string, string][]} */
  const heads = [];
  let gone = '';
  const read = chosen ? await readIfThere(repo, chosen, heads) : null;
  if (read) return { files: read, gone, heads };
  if (chosen) gone = chosen;
  let files = await readBranch(repo, defaultBranch, heads);
  const { config } = await configOf(files, false);
  const branch = config === null ? '' : parseLayout(config).layout.branch;
  if (branch && branch !== defaultBranch && branch !== gone) {
    const named = await readIfThere(repo, branch, heads);
    if (named) files = named;
    else gone ||= branch;
  }
  return { files, gone, heads };
}
// The work, read from GitHub (readFiles). Offline, the one last read
/** @param {string} repo @param {string} defaultBranch @param {string} chosen ('' none) @returns {Promise<Work & { gone: string }>} */
export async function load(repo, defaultBranch, chosen) {
  /** @type {Files} */
  let files;
  let offline = false;
  /** @type {string} */
  let gone;
  try {
    ({ files, gone } = await readFiles(repo, defaultBranch, chosen));
  } catch (err) {
    const snapshot = err instanceof gh.GitHubError && err.status === 0 && (await store.get('snapshots', repo));
    if (!snapshot) throw err;
    files = snapshot;
    offline = true;
    gone = '';
  }
  return { ...(await contents(files, offline)), gone };
}
// The work from its files: novel.toml, the episodes' texts. Kept as the last read of the work (unless `keep` is false:
// a work summed up for the list of works, not opened)
/** @param {Files} files @param {boolean} offline @param {boolean} [keep] @returns {Promise<Work>} */
export async function contents(files, offline, keep = true) {
  const { config, problems } = await configOf(files, offline);
  const parsed = config === null ? { layout: firstLayout(), problems: [] } : parseLayout(config);
  const paths = Object.keys(files.blobs);
  const toc = tableOfContents(parsed.layout, paths, foldersOf(paths));
  /** @type {Record<string, string | null>} */
  const texts = {};
  /** @type {Record<string, string | null>} */
  const shaTexts = {};
  await each(episodesOf(toc), 6, async e => {
    const sha = files.blobs[e.path].sha;
    texts[e.path] = shaTexts[sha] = await textAt(files.repo, sha, offline);
  });
  if (!offline && keep) await store.put('snapshots', files.repo, files);
  return { ...files, config, problems, texts, shaTexts, offline };
}
// the texts of these blobs (files moved by changes not sent), into the work's, when they are not there yet
/** @param {Work} work @param {string[]} shas */
export async function readShas(work, shas) {
  await each(
    shas.filter(s => !(s in work.shaTexts)),
    6,
    async sha => {
      try {
        work.shaTexts[sha] = await textAt(work.repo, sha, work.offline);
      } catch {}
    },
  );
}
