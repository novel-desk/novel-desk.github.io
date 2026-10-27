// 作品の一覧 (FR-WORK-01): the repositories opened on this device (ui/repo.js worksHere), each with its work summed up
// (title, length, episodes, last change, the repository and the branch in use), the latest changed first, as the server
// version's shelf. The list is shown at once from what the device kept (each work's last summary), and its rows filled
// in as the works are read, a few at a time. A work's summary is kept by the refs it was read at: when they have not
// moved, a later visit costs one ref request a work; when they have, the work is read again (the tree, novel.toml, the
// episodes' blobs, which the device keeps by sha). Another repository is opened from 「GitHub リポジトリをインポート」
// (FR-WORK-03): its name typed, with the ones the GitHub App can write to offered (GitHub's listing read when it is opened).
// The list and the summaries are this module's
import { esc, n, whenLong } from '../lib/format.js';
import { viewOf } from '../lib/view.js';
import { byUpdated, listed, offered, stillHolds, summaryOf, visibilityTag } from '../lib/works.js';
import { $, busy, toast } from './dom.js';
import * as store from './db.js';
import * as gh from './github.js';
import { offList, worksHere } from './repo.js';
import { contents, each, readFiles } from './work.js';

/** @typedef {import('../lib/works.js').Summary} Summary */
/** @typedef {{ full_name: string, default_branch: string, private?: boolean, visibility?: string }} Listed a repository as listed */

// how many works are read at once
const WIDTH = 3;
/** @param {string} repo */
const summaryKey = repo => `summary:${repo}`;
// the list shown now (a newer one makes an older one's rows stop filling in)
let shown = 0;

/** @param {Listed} r @param {Summary | null} s @param {string} state what is happening to it ('' none) @param {boolean} failed its last send failed */
function rowInside(r, s, state, failed) {
  const where = `GitHub ${esc(r.full_name)}（${esc(s?.branch ?? r.default_branch)}） ${visibilityTag(r)}`;
  const about = s ? `${n(s.chars)} 字 ・ ${n(s.count)} 話 ・ 最終更新 ${esc(whenLong(s.updated))} ・ ${where}` : where;
  return `<b>${esc(s?.title ?? r.full_name.split('/')[1])}</b><small>${about}${failed ? ' ・ 送信失敗' : ''}${state ? ` ・ ${esc(state)}` : ''}</small>`;
}
// a row filled in where it is (the button stays the same element: a tap on it while it fills in is not lost)
/** @type {Set<string>} the works whose last send failed (kept on the device by the desk: failed:<repo>) */
let failing = new Set();
/** @param {HTMLElement} b @param {Listed} r @param {Summary | null} s @param {string} [state] */
function putRow(b, r, s, state = '') {
  Object.assign(b.dataset, { repo: r.full_name, branch: r.default_branch, visibility: r.visibility ?? (r.private ? 'private' : 'public') });
  b.innerHTML = rowInside(r, s, state, failing.has(r.full_name));
}
const rows = () => /** @type {HTMLElement[]} */ ([...$('works').querySelectorAll('[data-repo]')]);
// 「GitHub リポジトリをインポート」 (as the server version's: no id)
export const importBox = () => /** @type {HTMLDetailsElement} */ (document.querySelector('#shelf details.import'));
/** @param {Listed[]} list @param {Map<string, Summary>} kept */
function render(list, kept) {
  const state = (/** @type {Listed} */ r) => (kept.has(r.full_name) ? '' : '読み込み中…');
  const now = rows();
  if (!list.length || now.length !== list.length || now.some((b, i) => b.dataset.repo !== list[i].full_name)) {
    $('works').innerHTML = list.length
      ? list.map(() => '<button class="work" data-repo=""></button>').join('')
      : '<p class="muted">まだ作品がありません。上にタイトルを入力して「作成」を押すか、「GitHub リポジトリをインポート」から作品のリポジトリを開いてください。</p>';
  }
  rows().forEach((b, i) => putRow(b, list[i], kept.get(list[i].full_name) ?? null, state(list[i])));
}
/** @param {Listed} r @param {Summary | null} s @param {string} [state] */
// (called only while the list is the one shown: its rows are the list's)
function fill(r, s, state) {
  putRow(/** @type {HTMLElement} */ (rows().find(x => x.dataset.repo === r.full_name)), r, s, state);
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

/** @param {{ open: (r: import('./desk.js').Repo) => Promise<void> }} on */
export function wireWorks(on) {
  $('works').addEventListener('click', e => {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-repo]');
    if (b instanceof HTMLElement && b.dataset.repo)
      void on.open({
        full_name: b.dataset.repo,
        default_branch: /** @type {string} */ (b.dataset.branch),
        visibility: /** @type {string} */ (b.dataset.visibility),
      });
  });
  // the names offered: GitHub's listing, read when the import is opened, or its field taken up again
  importBox().addEventListener('toggle', () => {
    if (importBox().open) void offer();
  });
  $('import-repo').addEventListener('focus', () => {
    if (!$('repo-options').children.length) void offer();
  });
  $('import-work').addEventListener('submit', e => {
    e.preventDefault();
    void importWork(on.open);
  });
}
// the repositories the GitHub App can write to that the list does not show, offered for the field
async function offer() {
  /** @type {any[]} */
  let all;
  try {
    all = await gh.repos();
  } catch {
    return;
  }
  const on = listed(await worksHere(), await offList()).shown;
  $('repo-options').innerHTML = offered(
    all,
    on.map(r => r.full_name),
  )
    .map(r => `<option value="${esc(r.full_name)}">`)
    .join('');
}
// GitHub リポジトリをインポート (FR-WORK-03): the repository typed (owner/name) opened, and so put on the list
/** @param {(r: import('./desk.js').Repo) => Promise<void>} open */
async function importWork(open) {
  const name = $('import-repo')
    .value.trim()
    .replace(/^https:\/\/github\.com\//, '')
    .replace(/\.git$/, '');
  /** @type {import('../lib/works.js').RepoMeta | null} */
  let r;
  try {
    // (said in the band while GitHub is asked, the button not pressed again meanwhile: DESK-OPS-05)
    r = await busy(
      '読み込んでいます…',
      async () =>
        (/^[^/\s]+\/[^/\s]+$/.test(name) ? await gh.repoMeta(name) : null) ??
        // (one a GitHub App lists but cannot read, installed by its owner's account: opened, so that it says why)
        (await gh.repos()).find(x => x.full_name === name) ??
        null,
      /** @type {HTMLButtonElement} */ ($('import-work').querySelector('button')),
    );
  } catch (err) {
    return toast(err.message);
  }
  if (!r) return toast(`${name} が見つかりません（owner/リポジトリ名 で入れてください。GitHub App で読めるリポジトリだけを開けます）`);
  $('import-repo').value = '';
  toast('インポートしました');
  await open({ full_name: r.full_name, default_branch: r.default_branch, visibility: r.visibility });
}

// The list of works: the repositories opened on this device, each with its summary kept, filled in as read; the latest
// changed first
export async function showWorks() {
  const at = ++shown;
  // (the names offered read again when they are asked for next, as the server version's shelf reads them each time;
  // emptied before anything is awaited, so that the field taken up meanwhile reads them)
  $('repo-options').innerHTML = '';
  const all = listed(await worksHere(), await offList()).shown;
  /** @type {Map<string, Summary>} */
  const kept = new Map();
  failing = new Set();
  for (const r of all) {
    const s = await store.get('prefs', summaryKey(r.full_name));
    if (s) kept.set(r.full_name, s);
    if (await store.get('prefs', `failed:${r.full_name}`)) failing.add(r.full_name);
  }
  if (at !== shown) return;
  const list = byUpdated(all, kept);
  render(list, kept);
  /** @type {import('../lib/drafts.js').Draft[]} */
  const drafts = await store.all('drafts');
  /** @type {Map<string, Summary>} the summaries as read now */
  const latest = new Map(kept);
  await each(list, WIDTH, async r => {
    // (no longer shown: a work opened, or the list shown again)
    if (at !== shown || $('shelf').hidden) return;
    try {
      const s = await summarize(
        r,
        drafts.filter(d => d.repo === r.full_name && !d.parked),
      );
      latest.set(r.full_name, s);
      if (at === shown) fill(r, s);
    } catch (err) {
      const empty = err instanceof gh.GitHubError && err.status === 409;
      if (at === shown)
        fill(r, kept.get(r.full_name) ?? null, empty ? '空のリポジトリです（開くと作品として始められます）' : kept.has(r.full_name) ? '' : err.message);
    }
  });
  // the rows in the order of the summaries read (the latest changed first), the same elements moved
  if (at !== shown) return;
  const now = new Map(rows().map(b => [b.dataset.repo, b]));
  for (const r of byUpdated(list, latest)) $('works').append(/** @type {HTMLElement} */ (now.get(r.full_name)));
}
