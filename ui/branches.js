// Branches (FR-GH-09): the branch read and written on this device chosen (one of the repository's, or a new one made
// at the commit read), and the branch merged into another on GitHub, what the merge brings said first. A branch is
// changed only when nothing is waiting to be sent (the changes are of the branch they were made on)
import { branchNameError, mergeLines } from '../lib/branches.js';
import { isEpisode, relOf, titleOf } from '../lib/layout.js';
import { $, toast } from './dom.js';
import * as store from './db.js';
import * as gh from './github.js';
import { pick } from './picker.js';
import { api } from './shared.js';

const UNSENT = '未送信の変更があります。「送る」で送ってから、ブランチを切り替えたりマージしたりしてください';
const NO_WORK = '作品を読み込めていません。「再読み込み」で読み込んでから、ブランチを切り替えたりマージしたりしてください';

// The changes not sent written on another branch than the one open (the device's settings gone, or the branch gone on
// GitHub): only that branch can be chosen, to send them where they were written
/** @param {string} other */
const onlyThat = other => `未送信の変更は ${other} で書いたものです。${other} に切り替えるか、「送る」で送ってから、ほかのブランチに切り替えてください`;
async function chooseBranch() {
  const w = api.work();
  if (!w) return toast(NO_WORK);
  const other = api.otherBranch();
  if (api.unsent() && !other) return toast(UNSENT);
  let list;
  try {
    list = await gh.branches(w.repo);
  } catch (err) {
    return toast(`ブランチを読めませんでした: ${err.message}`);
  }
  const name = await pick({
    title: 'ブランチ',
    items: list,
    current: w.branch,
    input: '新しいブランチの名前',
    help: '選ぶと、この端末ではそのブランチを読み書きします。無い名前を入れると、今読んでいる版から新しく作ります。',
  });
  if (!name || name === w.branch) return;
  if (api.unsent() && name !== other) return toast(onlyThat(other));
  if (!list.includes(name)) {
    const why = branchNameError(name);
    if (why) return toast(why);
    try {
      await gh.newBranch(w.repo, name, w.commit);
    } catch (err) {
      return toast(`ブランチを作れませんでした: ${err.message}`);
    }
  }
  await store.put('prefs', `branch:${w.repo}`, name);
  await api.reload();
  toast(list.includes(name) ? `${name} に切り替えました` : `${name} を作って切り替えました`);
}
async function mergeBranch() {
  const w = api.work();
  if (!w) return toast(NO_WORK);
  if (api.unsent()) return toast(UNSENT);
  let list;
  try {
    list = (await gh.branches(w.repo)).filter(b => b !== w.branch);
  } catch (err) {
    return toast(`ブランチを読めませんでした: ${err.message}`);
  }
  if (!list.length) return toast('マージ先にできるブランチがありません');
  const into = await pick({
    title: `${w.branch} をどこにマージしますか`,
    items: list,
    help: 'マージは GitHub 上で行います。この端末のブランチは変わりません。',
  });
  if (!into) return;
  try {
    const cmp = await gh.compare(w.repo, into, w.branch);
    if (!cmp.commits.length) return toast(`${into} には、もう ${w.branch} の内容が全部入っています`);
    const l = api.view().layout;
    const lines = mergeLines({
      from: w.branch,
      into,
      commits: cmp.commits,
      files: cmp.files,
      episode: path => (isEpisode(l, path) ? titleOf(l, /** @type {string} */ (relOf(l, path)), api.view().headings) : null),
    });
    if (!confirm(`${lines.join('\n')}\n\nマージしますか？`)) return;
    const made = await gh.merge(w.repo, into, w.branch, `Merge ${w.branch} into ${into}`);
    toast(made ? `${w.branch} を ${into} にマージしました` : `${into} には、もう ${w.branch} の内容が全部入っています`);
  } catch (err) {
    toast(
      err instanceof gh.GitHubError && err.status === 409
        ? 'マージできませんでした: 両方のブランチで同じファイルが変わっています（GitHub か Working Copy でマージしてください）'
        : `マージできませんでした: ${err.message}`,
    );
  }
}

export function wireBranches() {
  $('gh-branch').addEventListener('click', () => void chooseBranch());
  $('gh-merge').addEventListener('click', () => void mergeBranch());
}
