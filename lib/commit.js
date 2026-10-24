// The message of a commit of what was written: 「10/24 はじまり ＋320字、駅で −12字」 (no screen, no state of the app:
// tested by itself in tests/unit). The same form as the server version's src/commit_message.rs
import { charsOf } from './format.js';

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
