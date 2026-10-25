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
