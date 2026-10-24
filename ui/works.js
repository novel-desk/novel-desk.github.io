// 作品の一覧 (FR-WORK-01): every repository the token can read, each with its work summed up (title, length,
// episodes, last change, the repository and the branch in use). The list is shown at once from what the device kept
// (the last listing, each work's last summary), and its rows filled in as the works are read, a few at a time. A work's
// summary is kept by the refs it was read at: when they have not moved, a later visit costs one ref request a work;
// when they have, the work is read again (the tree, novel.toml, the episodes' blobs, which the device keeps by sha).
// The list and the summaries are this module's
import { esc, n, whenLong } from '../lib/format.js';
import { viewOf } from '../lib/view.js';
import { stillHolds, summaryOf, visibilityTag } from '../lib/works.js';
import { $ } from './dom.js';
import * as store from './db.js';
import * as gh from './github.js';
import { contents, each, readFiles } from './work.js';

/** @typedef {import('../lib/works.js').Summary} Summary */
/** @typedef {{ full_name: string, default_branch: string, private?: boolean, visibility?: string }} Listed a repository as listed */

// how many works are read at once
const WIDTH = 3;
/** @param {string} repo */
const summaryKey = repo => `summary:${repo}`;
// the list shown now (a newer one makes an older one's rows stop filling in)
let shown = 0;

/** @param {Listed} r @param {Summary | null} s @param {string} [state] what is happening to it ('' none) */
function rowInside(r, s, state = '') {
  const where = `${esc(r.full_name)}（${esc(s?.branch ?? r.default_branch)}）${visibilityTag(r)}`;
  const about = s ? `${n(s.chars)} 字 ・ ${n(s.count)} 話 ・ 最終更新 ${esc(whenLong(s.updated))} ・ ${where}` : where;
  return `<b>${esc(s?.title ?? r.full_name.split('/')[1])}</b><small>${about}${state ? ` ・ ${esc(state)}` : ''}</small>`;
}
// a row filled in where it is (the button stays the same element: a tap on it while it fills in is not lost)
/** @param {HTMLElement} b @param {Listed} r @param {Summary | null} s @param {string} [state] */
function putRow(b, r, s, state) {
  Object.assign(b.dataset, { repo: r.full_name, branch: r.default_branch, visibility: r.visibility ?? (r.private ? 'private' : 'public') });
  b.innerHTML = rowInside(r, s, state);
}
const rows = () => /** @type {HTMLElement[]} */ ([...$('repo-list').querySelectorAll('[data-repo]')]);
/** @param {Listed[]} list @param {Map<string, Summary>} kept */
function render(list, kept) {
  const state = (/** @type {Listed} */ r) => (kept.has(r.full_name) ? '' : '読み込んでいます…');
  const now = rows();
  if (now.length !== list.length || now.some((b, i) => b.dataset.repo !== list[i].full_name)) {
    $('repo-list').innerHTML = list.length
      ? list.map(() => '<button class="work" data-repo=""></button>').join('')
      : '<p class="muted small">トークンで読めるリポジトリがありません。トークンの Repository access を確かめてください。</p>';
  }
  rows().forEach((b, i) => putRow(b, list[i], kept.get(list[i].full_name) ?? null, state(list[i])));
}
/** @param {Listed} r @param {Summary | null} s @param {string} [state] */
function fill(r, s, state) {
  const b = rows().find(x => x.dataset.repo === r.full_name);
  if (b) putRow(b, r, s, state);
}
// a ref's commit now ('' when the branch is not there)
/** @param {string} repo @param {string} branch */
async function headOrNone(repo, branch) {
  try {
    return await gh.headOf(repo, branch);
  } catch (err) {
    if (err instanceof gh.GitHubError && err.status === 404) return '';
    throw err;
  }
}
// a work summed up: the summary kept when its refs have not moved, else the work read again (and the summary kept)
/** @param {Listed} r @param {import('../lib/drafts.js').Draft[]} drafts its changes not sent @returns {Promise<Summary>} */
async function summarize(r, drafts) {
  const repo = r.full_name;
  const chosen = (await store.get('prefs', `branch:${repo}`)) ?? '';
  /** @type {import('./desk.js').Edit[]} */
  const edits = (await store.get('prefs', `edits:${repo}`)) ?? [];
  const overlay = drafts.length > 0 || edits.length > 0;
  /** @type {Summary | undefined} */
  const kept = await store.get('prefs', summaryKey(repo));
  if (kept && !overlay && !kept.overlay && kept.chosen === chosen) {
    const heads = await Promise.all(kept.heads.map(([b]) => headOrNone(repo, b)));
    if (stillHolds(kept, chosen, heads, overlay)) return kept;
  }
  const { files, heads } = await readFiles(repo, r.default_branch, chosen);
  const work = await contents(files, false, false);
  const view = viewOf(work, new Map(drafts.map(d => [d.path, d])), edits);
  /** @type {Summary} */
  const s = { ...summaryOf(view, repo, work.updated, drafts), branch: files.branch, chosen, heads, overlay };
  await store.put('prefs', summaryKey(repo), s);
  return s;
}

// The list of works: the repositories (the listing kept, then GitHub's), each with its summary kept, filled in as read
export async function showWorks() {
  const at = ++shown;
  $('repos-error').textContent = '';
  /** @type {Listed[] | undefined} */
  const listed = await store.get('prefs', 'repos');
  /** @type {Map<string, Summary>} */
  const kept = new Map();
  const keptOf = async (/** @type {Listed[]} */ list) => {
    for (const r of list) {
      const s = kept.get(r.full_name) ?? (await store.get('prefs', summaryKey(r.full_name)));
      if (s) kept.set(r.full_name, s);
    }
  };
  if (listed) {
    await keptOf(listed);
    if (at === shown) render(listed, kept);
  } else $('repo-list').innerHTML = '<p class="muted small">読み込んでいます…</p>';
  /** @type {Listed[]} */
  let list;
  try {
    list = (await gh.repos()).map((/** @type {any} */ r) => ({
      full_name: r.full_name,
      default_branch: r.default_branch,
      private: r.private,
      visibility: r.visibility,
    }));
  } catch (err) {
    if (at !== shown) return;
    if (!listed) $('repo-list').innerHTML = '';
    else for (const r of listed) if (!kept.has(r.full_name)) fill(r, null, '');
    $('repos-error').textContent = err.message;
    return;
  }
  if (at !== shown) return;
  await store.put('prefs', 'repos', list);
  await keptOf(list);
  render(list, kept);
  /** @type {import('../lib/drafts.js').Draft[]} */
  const drafts = await store.all('drafts');
  await each(list, WIDTH, async r => {
    // (no longer shown: a work opened, or the list shown again)
    if (at !== shown || $('repos').hidden) return;
    try {
      const s = await summarize(
        r,
        drafts.filter(d => d.repo === r.full_name),
      );
      if (at === shown) fill(r, s);
    } catch (err) {
      if (at === shown) fill(r, kept.get(r.full_name) ?? null, kept.has(r.full_name) ? '' : err.message);
    }
  });
}
