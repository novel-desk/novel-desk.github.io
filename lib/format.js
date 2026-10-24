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
