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
