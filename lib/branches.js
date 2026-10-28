// Branches: a new one's name checked, and what a merge would bring, said before it is made (FR-GH-09; no screen, no
// state of the app: tested by itself in tests/unit). The server version's merge preview, from GitHub's compare API

import { n } from './format.js';

// Why a branch name cannot be used ('' when it can): git's rules for a ref, as far as a name typed needs them
/** @param {string} name */
export function branchNameError(name) {
  if (!name) return 'ブランチの名前を入れてください';
  // eslint-disable-next-line no-control-regex
  const bad = /[\u0000- \u007f~^:?*[\\]/.test(name) || /\.\.|@\{|\/\/|\/\.|^[-/.]|[/.]$|\.lock$/.test(name) || name === '@';
  return bad ? 'ブランチの名前に使えない文字があります（英数字と - _ . / で、. や / で始めたり終えたりしない）' : '';
}
// a commit's time as the merge preview says it: month/day hours:minutes in the author's time (as the server version's
// git log --date=format:%m/%d %H:%M)
/** @param {string} iso */
export function commitDate(iso) {
  const d = new Date(iso);
  const two = (/** @type {number} */ x) => String(x).padStart(2, '0');
  return `${two(d.getMonth() + 1)}/${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}
// how an episode changed: new (its length), deleted, or the characters it gained or lost (as the server version's)
/** @param {{ before: number | null, after: number | null }} ep */
const delta = ep =>
  ep.before == null
    ? `新しい話（${n(/** @type {number} */ (ep.after))} 字）`
    : ep.after == null
      ? '削除'
      : `${ep.after - ep.before >= 0 ? '＋' : '−'}${n(Math.abs(ep.after - ep.before))} 字`;
/**
 * What a merge of `from` into `into` brings, as lines to read before it is made, as the server version's merge
 * preview: what is not sent yet (sent first), its commits (8 at most), the episodes it changes with their lengths (12
 * at most) and how many other files
 * @param {{ from: string, into: string, unsent: boolean, commits: { date: string, subject: string }[],
 *   episodes: { title: string, before: number | null, after: number | null }[], others: number }} o
 */
export function mergeLines({ from, into, unsent, commits, episodes, others }) {
  return [
    `${from} → ${into}`,
    unsent ? '（まだ送っていない変更も、先に送ってから入れます）' : '',
    `commit ${commits.length} 件:`,
    ...commits.slice(0, 8).map(c => `・${c.date} ${c.subject}`),
    commits.length > 8 ? `・ほか ${commits.length - 8} 件` : '',
    episodes.length ? '話の変化:' : '',
    ...episodes.slice(0, 12).map(ep => `・${ep.title} ${delta(ep)}`),
    episodes.length > 12 ? `・ほか ${episodes.length - 12} 話` : '',
    others ? `話以外のファイル ${others} 件` : '',
  ].filter(Boolean);
}

// --- the branch chosen, and the merge, on the desk (ui/branches.js)

// The changes not sent written on another branch than the one open (the device's settings gone, or the branch gone on
// GitHub): only that branch can be chosen, to send them where they were written
/** @param {string} other */
export const onlyThat = other => `未送信の変更は ${other} で書いたものです。${other} に切り替えるか、「送る」で送ってから、ほかのブランチに切り替えてください`;
/**
 * What choosing the branch `name` does (as the server version's: what is not sent goes first, to the branch it was
 * written on): nothing (none chosen, or the one open); refused (the changes not sent were written on another branch,
 * `other`, said why); else whether what is not sent goes first, and whether the branch is made (not one listed)
 * @param {{ name: string | null, current: string, unsent: number, other: string, listed: string[] }} o
 * @returns {null | { name: string, refuse: string, sendFirst: boolean, create: boolean }}
 */
export function switchPlan({ name, current, unsent, other, listed }) {
  if (!name || name === current) return null;
  if (unsent && other && name !== other) return { name, refuse: onlyThat(other), sendFirst: false, create: false };
  return { name, refuse: '', sendFirst: Boolean(unsent) && !other, create: !listed.includes(name) };
}
// what a branch switched to says: made too, or only switched to
/** @param {string} name @param {boolean} created */
export const switchedSaid = (name, created) => (created ? `${name} を作成して切り替えました` : `${name} に切り替えました`);
// Which sides of a file a merge changes are counted (as git's diff of names says them): before it (where the branches
// met), not for a file new or renamed (the one it is now); after it, not for a file removed
/** @param {string} status GitHub's compare: added, removed, modified, renamed… */
export const mergeSides = status => ({ before: status !== 'added' && status !== 'renamed', after: status !== 'removed' });
// the branch offered to merge into: main when it is one of them, else the first
/** @param {string[]} list */
export const mergeTarget = list => (list.includes('main') ? 'main' : list[0]);
// the message of the merge commit
/** @param {string} from @param {string} into */
export const mergeMessage = (from, into) => `${from} を ${into} にマージ（Novel Desk から）`;
// what a merge made says: merged, or nothing to merge (`into` had it all)
/** @param {boolean} made @param {string} from @param {string} into */
export const mergedSaid = (made, from, into) => (made ? `${from} を ${into} にマージしました` : `${into} には、もう ${from} の内容が全部入っています`);
// why a merge failed (`status`: GitHub's, null when it is not GitHub's answer): a conflict, a branch not found, else
// what was said
/** @param {number | null} status @param {string} message @param {string} from @param {string} into */
export function mergeFailure(status, message, from, into) {
  if (status === 409) return `${into} と ${from} が競合しているため、自動ではマージできません。GitHub か Working Copy で競合を解消してください`;
  return status === 404 ? `${into} か ${from} が GitHub に見つかりません` : `マージできませんでした: ${message}`;
}
