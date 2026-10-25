// 作品のリポジトリ: a new work (FR-WORK-02, FR-GH-02: a private repository made, and an empty one started as a work),
// the repository renamed (FR-GH-10), where it is now (renamed or moved on GitHub: followed; another repository under
// its name: not sent to until the author says so, FR-GH-12), and what this device keeps of a work moved to the new
// name. Making and renaming a repository needs Administration, which the token in use does not have: a separate
// token is put in for it each time, used for that one request and not kept
import { adminFailure, isWorkKey, keptAfterForget, movedKey, newWorkFiles, repoName, whereIs, withWork } from '../lib/works.js';
import { $, toast } from './dom.js';
import * as store from './db.js';
import * as gh from './github.js';

/** @typedef {import('./desk.js').Repo} Repo */

/** @param {string} text */
const base64 = text => btoa(Array.from(new TextEncoder().encode(text), c => String.fromCharCode(c)).join(''));

// この端末の作品の一覧 (FR-WORK-01): the repositories opened on this device. A device that kept none yet starts from the
// work it had open; the listing of every repository the token reads, kept before, is no longer used
/** @returns {Promise<Repo[]>} */
export async function worksHere() {
  /** @type {Repo[] | undefined} */
  const kept = await store.get('prefs', 'works');
  if (kept) return kept;
  await store.del('prefs', 'repos');
  /** @type {Repo | undefined} */
  const r = await store.get('prefs', 'repo');
  return r ? [r] : [];
}
// the works taken off this device's list (FR-WORK-05), by repository
/** @returns {Promise<string[]>} */
export const offList = async () => (await store.get('prefs', 'off-list')) ?? [];
// a repository opened on this device: put on its list (and back on it, if it had been taken off)
/** @param {Repo} r */
export async function keepWork(r) {
  await store.put('prefs', 'works', withWork(await worksHere(), r));
  const off = await offList();
  if (off.includes(r.full_name))
    await store.put(
      'prefs',
      'off-list',
      off.filter(x => x !== r.full_name),
    );
}

// What this device keeps of a work (its drafts, the work last read, its settings, the choice of it, the list's row),
// moved from its repository's old name to the new one
/** @param {string} from @param {string} to */
export async function moveRepo(from, to) {
  for (const name of /** @type {const} */ (['drafts', 'snapshots', 'prefs'])) {
    for (const key of await store.keys(name)) {
      const next = movedKey(String(key), from, to);
      if (next === null) continue;
      const value = await store.get(name, String(key));
      await store.put(name, next, name === 'prefs' ? value : { ...value, repo: to });
      await store.del(name, String(key));
    }
  }
  const chosen = await store.get('prefs', 'repo');
  if (chosen?.full_name === from) await store.put('prefs', 'repo', { ...chosen, full_name: to });
  await store.put(
    'prefs',
    'works',
    (await worksHere()).map(r => (r.full_name === from ? { ...r, full_name: to } : r)),
  );
}

// 作品の削除 (FR-WORK-05): the work taken off this device's list, and what the device keeps of it (its drafts, the
// work last read, its settings) deleted. The repository on GitHub stays as it is; it can be put back on the list
/** @param {string} repo */
export async function forgetWork(repo) {
  for (const name of /** @type {const} */ (['drafts', 'snapshots', 'prefs']))
    for (const key of await store.keys(name)) if (isWorkKey(String(key), repo)) await store.del(name, String(key));
  if ((await store.get('prefs', 'repo'))?.full_name === repo) await store.del('prefs', 'repo');
  const off = await offList();
  if (!off.includes(repo)) await store.put('prefs', 'off-list', [...off, repo]);
}
// The token forgotten (NFR-SEC-16): what the device keeps of the works deleted (the works last read, the blobs, the
// settings and the versions kept), and the drafts too unless the author keeps them (with what they need to be sent)
/** @param {boolean} draftsKept */
export async function forgetDevice(draftsKept) {
  for (const name of /** @type {const} */ (['snapshots', 'blobs'])) for (const key of await store.keys(name)) await store.del(name, String(key));
  for (const key of await store.keys('prefs')) if (!keptAfterForget(String(key), draftsKept)) await store.del('prefs', String(key));
  if (!draftsKept) for (const key of await store.keys('drafts')) await store.del('drafts', String(key));
}

// Where the repository of a work is now (lib/works.js whereIs), its ID kept the first time it is seen
/** @param {Repo} r */
export async function locate(r) {
  /** @type {number} */
  const keptId = (await store.get('prefs', `id:${r.full_name}`)) ?? 0;
  const byName = await gh.repoMeta(r.full_name);
  const byId = keptId && byName?.id !== keptId ? await gh.repoById(keptId) : null;
  const where = whereIs(r.full_name, keptId, byName, byId);
  if (where.kind === 'same' && !keptId && where.meta) await store.put('prefs', `id:${r.full_name}`, where.meta.id);
  return where;
}
// the repository under the work's name taken as its own (FR-GH-12: the author made sure of it)
/** @param {string} repo @param {number} id */
export const relink = (repo, id) => store.put('prefs', `id:${repo}`, id);

// An empty repository started as a work: the files a new work has (lib/works.js), in a first commit (the Contents API:
// an empty repository takes no other) and one more
/** @param {string} repo @param {string} branch the default branch, which the first commit makes @param {string} title */
export async function startWork(repo, branch, title) {
  const files = newWorkFiles(title, branch);
  const message = `作品「${title}」を作成`;
  const first = await gh.putFile(repo, 'README.md', base64(files['README.md']), message);
  const { tree } = await gh.commitOf(repo, first);
  const entries = [];
  for (const [path, text] of Object.entries(files))
    if (path !== 'README.md')
      entries.push({ path, mode: '100644', type: /** @type {const} */ ('blob'), sha: /** @type {string | null} */ (await gh.newBlob(repo, text)) });
  const commit = await gh.newCommit(repo, message, await gh.newTree(repo, tree, entries), first);
  await gh.moveBranch(repo, branch, commit);
}
// the title an empty repository is started with: the one given when it was made here, else its name
/** @param {string} repo */
export const titleFor = async repo => (await store.get('prefs', `new-title:${repo}`)) ?? repo.split('/')[1];

// what GitHub said when making or renaming failed, said for the screen
/** @param {unknown} err */
const said = err => (err instanceof gh.GitHubError && err.status !== 0 ? adminFailure(err.status, err.message) : /** @type {Error} */ (err).message);

// 新しい作品: a private repository made (with the token that has Administration), then started as a work when the
// token in use can read it; else the author is told to add it to that token's Repository access
/** @param {(r: Repo) => Promise<void>} open @param {() => Promise<void>} relist */
async function createWork(open, relist) {
  const title = $('new-work-title').value.trim();
  const name = repoName($('new-work-repo').value);
  const admin = $('admin-token').value.trim();
  const say = (/** @type {string} */ t, /** @type {boolean} */ bad) => {
    $('new-work-state').textContent = t;
    $('new-work-state').className = bad ? 'error' : 'muted small';
  };
  if (!title) return say('題名を入れてください', true);
  if (!name) return say('リポジトリ名は、英数字と . _ - で 100 文字までにしてください', true);
  if (!admin) return say('Administration の権限を付けたトークンを入れてください（作るときだけ使い、この端末には残しません）', true);
  $('create-work').disabled = true;
  say('作っています…', false);
  try {
    let made;
    try {
      made = await gh.createRepo(admin, $('new-work-owner').value.trim(), name, title);
    } catch (err) {
      throw new Error(`リポジトリを作れませんでした: ${said(err)}`, { cause: err });
    }
    $('admin-token').value = '';
    await store.put('prefs', `new-title:${made.full_name}`, title);
    await keepWork({ full_name: made.full_name, default_branch: made.default_branch, visibility: made.visibility });
    if (!(await gh.repoMeta(made.full_name))) {
      $('new-work-title').value = '';
      newDialog().close();
      toast(
        `${made.full_name}（非公開）を作りました。いまのトークンではまだ読めないので、GitHub のトークンの一覧でいまのトークンを開き（Edit）、Repository access にこのリポジトリを足してから、一覧から開いてください。開くと作品を始めます`,
      );
      await relist();
      return;
    }
    await startWork(made.full_name, made.default_branch, title);
    $('new-work-title').value = $('new-work-repo').value = $('new-work-owner').value = '';
    say('', false);
    newDialog().close();
    await open({ full_name: made.full_name, default_branch: made.default_branch, visibility: made.visibility });
  } catch (err) {
    say(/** @type {Error} */ (err).message, true);
  } finally {
    $('create-work').disabled = false;
  }
}

const newDialog = () => /** @type {HTMLDialogElement} */ (/** @type {unknown} */ ($('new-repo')));
const renameDialog = () => /** @type {HTMLDialogElement} */ (/** @type {unknown} */ ($('rename-repo')));
/** @typedef {{ repo: () => Repo, settled: () => Promise<void>, reopen: (r: Repo) => Promise<void> }} Desk the desk's */
// リポジトリの名前を変更 (FR-GH-10): renamed on GitHub (with the token that has Administration), then what this device
// keeps of the work moved to the new name, and the work opened by it
/** @param {Desk} desk */
async function renameRepo(desk) {
  const r = desk.repo();
  const name = repoName($('rename-repo-name').value);
  const admin = $('rename-admin-token').value.trim();
  const say = (/** @type {string} */ t) => {
    $('rename-repo-error').textContent = t;
  };
  if (!name) return say('リポジトリ名は、英数字と . _ - で 100 文字までにしてください');
  if (name === r.full_name.split('/')[1]) return renameDialog().close();
  if (!admin) return say('Administration の権限を付けたトークンを入れてください（名前を変えるときだけ使い、この端末には残しません）');
  $('rename-repo-go').disabled = true;
  try {
    let meta;
    try {
      meta = await gh.renameRepo(admin, r.full_name, name);
    } catch (err) {
      throw new Error(`リポジトリ名を ${r.full_name.split('/')[0]}/${name} に変更できませんでした: ${said(err)}`, { cause: err });
    }
    $('rename-admin-token').value = '';
    await desk.settled();
    await moveRepo(r.full_name, meta.full_name);
    await store.put('prefs', `id:${meta.full_name}`, meta.id);
    renameDialog().close();
    toast(`${meta.full_name} に変更しました`);
    await desk.reopen({ full_name: meta.full_name, default_branch: meta.default_branch, visibility: meta.visibility });
  } catch (err) {
    say(/** @type {Error} */ (err).message);
  } finally {
    $('rename-repo-go').disabled = false;
  }
}

/**
 * @param {{ open: (r: Repo) => Promise<void>, relist: () => Promise<void> }} shelf
 * @param {Desk} on
 */
export function wireRepo(shelf, on) {
  // 新しい作品: the title typed on the list (as the server version's), then the repository to make, in a dialog
  $('new-work').addEventListener('submit', e => {
    e.preventDefault();
    $('new-work-state').textContent = '';
    newDialog().showModal();
  });
  $('new-repo-form').addEventListener('submit', e => {
    e.preventDefault();
    void createWork(shelf.open, shelf.relist);
  });
  $('close-new-repo').addEventListener('click', () => newDialog().close());
  $('gh-rename').addEventListener('click', () => {
    $('rename-repo-name').value = on.repo().full_name.split('/')[1];
    $('rename-repo-error').textContent = '';
    renameDialog().showModal();
  });
  $('rename-repo-form').addEventListener('submit', e => {
    e.preventDefault();
    void renameRepo(on);
  });
  $('close-rename-repo').addEventListener('click', () => renameDialog().close());
}
