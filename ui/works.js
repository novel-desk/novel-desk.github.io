// 作品の一覧 (FR-WORK-01): the repositories opened on this device (ui/repo.js worksHere), each with its work summed up
// (title, length, episodes, last change, the repository and the branch in use). The list is shown at once from what the
// device kept (each work's last summary), and its rows filled in as the works are read, a few at a time. A work's
// summary is kept by the refs it was read at: when they have not moved, a later visit costs one ref request a work;
// when they have, the work is read again (the tree, novel.toml, the episodes' blobs, which the device keeps by sha).
// Another repository is opened from 「リポジトリを開く」 (FR-WORK-03): GitHub's listing is read only then, and only the
// names of the ones the token can write to are shown, nothing read of them. The list and the summaries are this module's
import { esc, n, whenLong } from '../lib/format.js';
import { viewOf } from '../lib/view.js';
import { listed, offered, stillHolds, summaryOf, visibilityTag } from '../lib/works.js';
import { $ } from './dom.js';
import * as store from './db.js';
import * as gh from './github.js';
import { pick } from './picker.js';
import { worksHere } from './repo.js';
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
  if (!list.length || now.length !== list.length || now.some((b, i) => b.dataset.repo !== list[i].full_name)) {
    $('repo-list').innerHTML = list.length
      ? list.map(() => '<button class="work" data-repo=""></button>').join('')
      : '<p class="muted small">この端末で開いた作品はまだありません。「リポジトリを開く」で作品のリポジトリを選んでください。</p>';
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

// the works taken off the list on this device (FR-WORK-05), each with a way back
/** @param {Listed[]} off */
function renderOff(off) {
  $('off-list').innerHTML = off.length
    ? `<details class="off-list"><summary>一覧から外した作品（${off.length}）</summary>${off
        .map(r => `<div class="off-row"><span>${esc(r.full_name)}</span><button class="ghost" data-back-on="${esc(r.full_name)}">一覧に戻す</button></div>`)
        .join('')}</details>`
    : '';
}
// the repositories the list shows (not the ones taken off it), and those taken off shown apart
/** @param {Listed[]} all */
async function shownOf(all) {
  const { shown, off } = listed(all, (await store.get('prefs', 'off-list')) ?? []);
  renderOff(off);
  return shown;
}
/** @param {{ open: (r: import('./desk.js').Repo) => Promise<void> }} on */
export function wireWorks(on) {
  $('off-list').addEventListener('click', async e => {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-back-on]');
    if (!(b instanceof HTMLElement)) return;
    /** @type {string[]} */
    const off = (await store.get('prefs', 'off-list')) ?? [];
    await store.put(
      'prefs',
      'off-list',
      off.filter(x => x !== b.dataset.backOn),
    );
    await showWorks();
  });
  $('open-other').addEventListener('click', () => void openOther(on.open));
}

// リポジトリを開く (FR-WORK-03): GitHub's listing read now, the repositories the token can write to and the list does not
// show offered by name, and the one chosen opened (and so put on the list)
/** @param {(r: import('./desk.js').Repo) => Promise<void>} open */
async function openOther(open) {
  $('repos-error').textContent = '';
  $('open-other').disabled = true;
  /** @type {any[]} */
  let all;
  try {
    all = await gh.repos();
  } catch (err) {
    $('repos-error').textContent = err.message;
    return;
  } finally {
    $('open-other').disabled = false;
  }
  const on = listed(await worksHere(), (await store.get('prefs', 'off-list')) ?? []).shown;
  const choices = offered(
    all,
    on.map(r => r.full_name),
  );
  if (!choices.length) {
    $('repos-error').textContent = 'トークンで書き込めるリポジトリのうち、一覧に無いものはありません。トークンの Repository access を確かめてください。';
    return;
  }
  const name = await pick({
    title: 'リポジトリを開く',
    items: choices.map(r => r.full_name),
    help: 'トークンで書き込めるリポジトリのうち、一覧に無いものです。開くと一覧に載ります。',
  });
  const r = choices.find(x => x.full_name === name);
  if (r) await open({ full_name: r.full_name, default_branch: r.default_branch, visibility: r.visibility });
}

// The list of works: the repositories opened on this device, each with its summary kept, filled in as read
export async function showWorks() {
  const at = ++shown;
  $('repos-error').textContent = '';
  const list = await shownOf(await worksHere());
  /** @type {Map<string, Summary>} */
  const kept = new Map();
  for (const r of list) {
    const s = await store.get('prefs', summaryKey(r.full_name));
    if (s) kept.set(r.full_name, s);
  }
  if (at !== shown) return;
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
      const empty = err instanceof gh.GitHubError && err.status === 409;
      if (at === shown)
        fill(r, kept.get(r.full_name) ?? null, empty ? '空のリポジトリです（開くと作品として始められます）' : kept.has(r.full_name) ? '' : err.message);
    }
  });
}
