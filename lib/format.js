// Text and numbers as the screens show them (no screen, no state of the app: tested by itself in tests/unit). From the
// server version's public/lib/format.js
/** @type {Record<string, string>} */
const ENTITY = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** @type {(v: unknown) => string} */
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ENTITY[c]);
/** @type {(t: string) => number} */
export const charsOf = t => [...t.replace(/\s/g, '')].length;
// a line or paragraph separator (U+2028, U+2029) made a line break: a text box shows it as one, while the text keeps
// the two lines one
/** @type {(t: string) => string} */
export const lineBreaks = t => t.replace(/[\u2028\u2029]/g, '\n');
/** @type {(v: unknown) => string} */
export const n = v => Number(v || 0).toLocaleString('ja-JP');
// 最終更新の日時: 「10/8 4:20」（年が違えば「2025/12/1 9:05」）. From the server version's public/lib/format.js
/** @type {(ms: number | null | undefined, now?: number) => string} */
export const when = (ms, now = Date.now()) => {
  if (!ms) return '';
  const d = new Date(ms),
    y = d.getFullYear() !== new Date(now).getFullYear() ? `${d.getFullYear()}/` : '';
  return `${y}${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};
// 日時に、24 時間以内なら「（3 分前）」を添える
/** @type {(ms: number | null | undefined, now?: number) => string} */
export const whenLong = (ms, now = Date.now()) => {
  if (!ms) return '';
  const s = (now - ms) / 1000;
  const rel = s < 60 ? 'たった今' : s < 3600 ? `${Math.floor(s / 60)} 分前` : s < 86400 ? `${Math.floor(s / 3600)} 時間前` : '';
  return rel ? `${when(ms, now)}（${rel}）` : when(ms, now);
};
// The time each row of the table of contents says (when), only where it tells one row from the others: a time most
// rows share (a rename of every file, a pull) is left out of those. From the server version's public/ui/desk.js
/** @type {(times: Record<string, number>, now?: number) => Record<string, string>} */
export const rowTimes = (times, now = Date.now()) => {
  const said = Object.fromEntries(Object.entries(times).map(([path, ms]) => [path, when(ms, now)]));
  /** @type {Record<string, number>} */
  const most = {};
  for (const t of Object.values(said)) most[t] = (most[t] ?? 0) + 1;
  const common = Object.entries(most).sort((a, b) => b[1] - a[1])[0];
  for (const path of Object.keys(said)) if (common && common[1] > 1 && said[path] === common[0]) said[path] = '';
  return said;
};
// the button under a box's text cut to three lines (a card of the plot or of the characters): what it says, the text
// open whole or not
/** @param {boolean} open */
export const moreLabel = open => (open ? '閉じる' : '続きを表示');
// A new name typed in a prompt, trimmed: null when nothing is to change (closed, nothing typed, or the name now)
/** @param {string | null} given @param {string} now */
export const newName = (given, now) => {
  const name = given?.trim() ?? '';
  return name && name !== now ? name : null;
};
