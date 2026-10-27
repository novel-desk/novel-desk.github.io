// Branches (FR-GH-09): the branch read and written on this device chosen (one of the repository's, or a new one made
// at the commit read), and the branch merged into another on GitHub, what the merge brings said first. As the server
// version's: what is not sent yet goes first (the changes are of the branch they were made on), then the branch changes
// or the merge is made
import { branchNameError, commitDate, mergeLines } from '../lib/branches.js';
import { charsOf } from '../lib/format.js';
import { isEpisode, relOf, titleOf } from '../lib/layout.js';
import { $, busy, toast } from './dom.js';
import * as store from './db.js';
import * as gh from './github.js';
import { pick } from './picker.js';
import { api } from './shared.js';
import { textAt } from './work.js';

const UNSENT = '送れなかったので、ブランチを切り替えたりマージしたりしませんでした。書いたものはこの端末に残っています';
const NO_WORK = '作品を読み込めていません。「再読み込み」で読み込んでから、ブランチを切り替えたりマージしたりしてください';

// The changes not sent written on another branch than the one open (the device's settings gone, or the branch gone on
// GitHub): only that branch can be chosen, to send them where they were written
/** @param {string} other */
const onlyThat = other => `未送信の変更は ${other} で書いたものです。${other} に切り替えるか、「送る」で送ってから、ほかのブランチに切り替えてください`;
async function chooseBranch() {
  const w = api.work();
  if (!w) return toast(NO_WORK);
  const other = api.otherBranch();
  let list;
  try {
    list = await busy('ブランチを読み込んでいます…', () => gh.branches(w.repo));
  } catch (err) {
    return toast(`ブランチを読めませんでした: ${err.message}`);
  }
  const name = await pick({
    title: 'ブランチ',
    items: list,
    current: w.branch,
    placeholder: '新しいブランチの名前',
    help: '選択するとそのブランチに切り替えます。存在しない名前を入力すると、新しく作成します。まだ送っていない変更がある時は、送ってから切り替えます。',
  });
  if (!name || name === w.branch) return;
  if (api.unsent() && other && name !== other) return toast(onlyThat(other));
  // what is not sent goes first, to the branch it was written on (as the server version's: pushed, then switched)
  if (api.unsent() && !other) {
    await api.send();
    if (api.unsent()) return toast(UNSENT);
  }
  if (!list.includes(name)) {
    const why = branchNameError(name);
    if (why) return toast(why);
    try {
      await busy('ブランチを作成しています…', () => gh.newBranch(w.repo, name, w.commit));
    } catch (err) {
      return toast(`ブランチを作成できませんでした: ${err.message}`);
    }
  }
  await store.put('prefs', `branch:${w.repo}`, name);
  // (the text box not written in until the branch is read, as when a work is opened: DESK-OPS-05)
  await busy('ブランチを読み込んでいます…', api.reloadHeld);
  toast(list.includes(name) ? `${name} に切り替えました` : `${name} を作成して切り替えました`);
}
// the episodes a merge changes, with their lengths before (where the branches met) and after; how many other files
// (a file renamed counts as the one it is now: new, as the server version's git diff of names says it)
/** @param {string} repo @param {{ files: any[], merge_base_commit: { sha: string } }} cmp */
async function changedEpisodes(repo, cmp) {
  const l = api.view().layout;
  /** @param {string} path */
  const title = path => (isEpisode(l, path) ? titleOf(l, /** @type {string} */ (relOf(l, path)), api.view().headings) : null);
  // (one not to be read as text counted as nothing)
  /** @param {string} sha */
  const chars = async sha => charsOf((await textAt(repo, sha, false)) ?? '');
  const episodes = [];
  let others = 0;
  for (const f of cmp.files) {
    const name = title(f.filename);
    if (name === null) {
      others++;
      continue;
    }
    const before = f.status === 'added' || f.status === 'renamed' ? null : await chars(await gh.shaAt(repo, f.filename, cmp.merge_base_commit.sha));
    const after = f.status === 'removed' ? null : await chars(f.sha);
    episodes.push({ title: name, before, after });
  }
  return { episodes, others };
}
async function mergeBranch() {
  const w = api.work();
  if (!w) return toast(NO_WORK);
  let list;
  try {
    list = (await busy('ブランチを読み込んでいます…', () => gh.branches(w.repo))).filter(b => b !== w.branch);
  } catch (err) {
    return toast(`ブランチを読めませんでした: ${err.message}`);
  }
  if (!list.length) return toast('マージ先にできるブランチがありません');
  const into = await pick({
    title: `${w.branch} をどこにマージしますか`,
    items: list,
    value: list.includes('main') ? 'main' : list[0],
    help: 'マージは GitHub 上で行います。現在のブランチは変わりません。',
  });
  if (!into) return;
  try {
    const unsent = api.unsent() > 0;
    // what the merge brings, read (said in the band: DESK-OPS-05). null: nothing to merge
    const lines = await busy('マージの内容を読み込んでいます…', async () => {
      const cmp = await gh.compare(w.repo, into, w.branch);
      if (!cmp.commits.length && !unsent) return null;
      return mergeLines({
        from: w.branch,
        into,
        unsent,
        commits: cmp.commits.map(c => ({ date: commitDate(c.commit.committer.date), subject: c.commit.message.split('\n')[0] })),
        ...(await changedEpisodes(w.repo, cmp)),
      });
    });
    if (!lines) return toast(`${into} には、もう ${w.branch} の内容が全部入っています`);
    if (!confirm(`${lines.join('\n')}\n\nマージしますか？`)) return;
    // what is not sent goes first (as the server version's: pushed, then merged)
    if (unsent) {
      await api.send();
      if (api.unsent()) return toast(UNSENT);
    }
    // (the button shows 「…」 while GitHub merges, as the server version's)
    $('gh-merge').disabled = true;
    $('gh-merge').textContent = '…';
    const made = await gh.merge(w.repo, into, w.branch, `${w.branch} を ${into} にマージ（Novel Desk から）`).finally(() => {
      $('gh-merge').disabled = false;
      $('gh-merge').textContent = 'マージ';
    });
    toast(made ? `${w.branch} を ${into} にマージしました` : `${into} には、もう ${w.branch} の内容が全部入っています`);
  } catch (err) {
    toast(
      err instanceof gh.GitHubError && err.status === 409
        ? `${into} と ${w.branch} が競合しているため、自動ではマージできません。GitHub か Working Copy で競合を解消してください`
        : err instanceof gh.GitHubError && err.status === 404
          ? `${into} か ${w.branch} が GitHub に見つかりません`
          : `マージできませんでした: ${err.message}`,
    );
  }
}

export function wireBranches() {
  $('gh-branch').addEventListener('click', () => void chooseBranch());
  $('gh-merge').addEventListener('click', () => void mergeBranch());
}
