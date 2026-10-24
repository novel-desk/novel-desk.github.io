// The message of a commit of what was written: 「10/24 はじまり ＋320字、駅で −12字」 (no screen, no state of the app:
// tested by itself in tests/unit). The same form as the server version's src/commit_message.rs
import { TRASH } from './episodes.js';
import { charsOf } from './format.js';
import { CONFIG, isEpisode, relOf, titleOf, titleWith } from './layout.js';

// The day in Japan (the author's time, whatever the device's): 「10/24」
/** @param {number} ms */
export function japanDay(ms) {
  const d = new Date(ms + 9 * 3600 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}
// A change of length, as the commit says it: 「 ＋320字」 or 「 −12字」 ('' when the length is the same)
/** @param {number} before @param {number} after */
export function charsDelta(before, after) {
  const d = after - before;
  return d === 0 ? '' : d > 0 ? ` ＋${d}字` : ` −${-d}字`;
}
// What the message says for one episode written: its title and how its length changed (「（書き換え）」 when it did not)
/** @param {{ title: string, before: string, after: string }} change */
export function changePart({ title, before, after }) {
  return `${title}${charsDelta(charsOf(before), charsOf(after)) || '（書き換え）'}`;
}
// A commit's message from what changed: the day, and the changes (「整理」 when there are none; four at most, then 「ほか
// n 件」). The same change twice in a row is said once
/** @param {string} day @param {string[]} parts */
export function commitSubject(day, parts) {
  const said = parts.filter((p, i) => p !== parts[i - 1]);
  const body = said.length === 0 ? '整理' : said.length > 4 ? `${said.slice(0, 3).join('、')} ほか ${said.length - 3} 件` : said.join('、');
  return `${day} ${body}`;
}

/**
 * A change that a commit sends, as git would list it: A (added), D (deleted), M (changed), R (moved: from `path` to
 * `to`), with the texts of the episode before and after (or '')
 * @typedef {{ kind: 'A' | 'D' | 'M' | 'R', path: string, to: string, before: string, after: string }} Listed
 */
// What the changes sent are, as git lists them: a file put where another moved from is that one moved (R); a file gone
// that moved is not said again; the rest added, deleted or changed. In the order of their paths
/** @typedef {{ kind: Listed['kind'], path: string, to: string }} Kind */
/** @param {import('./changes.js').Change[]} changes @returns {Kind[]} */
export function kindsOf(changes) {
  /** @param {import('./changes.js').Change} c */
  const movedFrom = c => (!c.gone && c.from && c.from.path !== c.path ? c.from.path : null);
  const moved = new Set(changes.map(movedFrom));
  /** @type {Kind[]} */
  const kinds = [];
  for (const c of changes) {
    const from = movedFrom(c);
    if (from !== null) kinds.push({ kind: 'R', path: from, to: c.path });
    else if (!c.gone) kinds.push({ kind: c.base ? 'M' : 'A', path: c.path, to: '' });
    else if (!moved.has(c.path)) kinds.push({ kind: 'D', path: c.path, to: '' });
  }
  return kinds.sort((a, b) => Number(a.path > b.path) - Number(a.path < b.path));
}
/** @typedef {{ layout: import('./layout.js').Layout, headings: Record<string, string> }} Shape */
// What a commit's message says for each change (the server version's change_part): characters written, a new
// episode, one deleted (gone, or moved to _trash/), one renamed or reordered; a new novel.toml first. `was` is the
// work before, `now` after (an old path is said by the first, a new one by the second). Nothing for the rest
/** @param {Listed[]} list @param {Shape} was @param {Shape} now @returns {string[]} */
export function changeParts(list, was, now) {
  /** @param {Shape} s @param {string} p @param {string} [text] */
  const title = (s, p, text) => {
    const rel = /** @type {string} */ (relOf(s.layout, p));
    return text === undefined ? titleOf(s.layout, rel, s.headings) : titleWith(s.layout, rel, text, s.headings);
  };
  const inTrash = (/** @type {string} */ p) => p.startsWith(`${TRASH}/`);
  /** @type {string[]} */
  const parts = [];
  for (const { kind, path, to, before, after } of list) {
    const delta = charsDelta(charsOf(before), charsOf(after));
    if (kind === 'A' && path === CONFIG) parts.unshift('構成を novel.toml に');
    else if (kind === 'A' && !inTrash(path) && isEpisode(now.layout, path))
      parts.push(`${title(now, path, after)}（新しい話${charsOf(after) ? `、${charsOf(after)}字` : ''}）`);
    else if (kind === 'D' && isEpisode(was.layout, path)) parts.push(`${title(was, path)}（削除）`);
    else if (kind === 'R' && inTrash(to)) parts.push(`${isEpisode(was.layout, path) ? title(was, path) : path}（削除）`);
    else if (kind === 'R' && isEpisode(now.layout, to)) {
      const [a, b] = [title(was, path), title(now, to, after)];
      parts.push(a !== b ? `${a}→${b}（タイトル）${delta}` : delta ? `${b}${delta}` : `${b}（並べ替え）`);
    } else if (kind === 'M' && isEpisode(now.layout, path)) parts.push(changePart({ title: title(now, path, after), before, after }));
  }
  return parts;
}
