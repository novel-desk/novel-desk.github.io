// novel.toml changed as the server version's toml_edit changes it: only the keys asked for, every other line of the
// file as it was, to the character (no screen, no state of the app: tested by itself in tests/unit). A value changed
// keeps its key and the rest of its line; a key removed takes its line; a key added goes after the last key of its
// table, or under its header, or in a new table at the end of the file
import { parseToml } from './toml.js';

/** @typedef {import('./toml.js').TomlPlace} TomlPlace */
/** @typedef {import('./toml.js').TomlValue} TomlValue */
/** A key to set (its whole path, the table's then its own) to a text, or to remove (null) @typedef {{ key: string[], value: string | null }} TomlEdit */

/** @type {Record<string, string>} */
const ESCAPED = { '"': '\\"', '\\': '\\\\', '\b': '\\b', '\t': '\\t', '\n': '\\n', '\f': '\\f', '\r': '\\r' };
// a text as a TOML basic string
/** @param {string} s */
export const quote = s =>
  // (the control characters: the ones with a short escape, else \uXXXX)
  // eslint-disable-next-line no-control-regex
  `"${s.replace(/["\\\u0000-\u001f\u007f]/g, c => ESCAPED[c] ?? `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}"`;
// a key: bare when it can be, else quoted
/** @param {string} k */
const keyText = k => (/^[A-Za-z0-9_-]+$/.test(k) ? k : quote(k));
/** @param {string[]} path */
const dotted = path => path.map(keyText).join('.');
/** @param {string[]} a @param {string[]} b */
const same = (a, b) => a.length === b.length && a.every((k, i) => k === b[i]);
/** @param {string[]} path @param {string[]} prefix */
const startsWith = (path, prefix) => prefix.length <= path.length && prefix.every((k, i) => k === path[i]);
// the value at a path of a table read (undefined when there is none)
/** @param {import('./toml.js').TomlTable} t @param {string[]} path @returns {TomlValue | undefined} */
function valueAt(t, path) {
  /** @type {TomlValue | undefined} */
  let v = t;
  for (const k of path) v = v !== undefined && typeof v === 'object' && !Array.isArray(v) ? v[k] : undefined;
  return v;
}

// One edit on a text read (line ends \n): the new text
/** @param {string} text @param {TomlPlace[]} places @param {TomlEdit} edit */
function editOnce(text, places, { key, value }) {
  const at = places.find(p => p.kind === 'key' && same(p.path, key));
  if (at) return value === null ? text.slice(0, at.from) + text.slice(at.to) : text.slice(0, at.valueFrom) + quote(value) + text.slice(at.valueTo);
  if (value === null) return text;
  const table = key.slice(0, -1);
  /** @param {number} to @param {string[]} under the table the new line is written under */
  const after = (to, under) => {
    const line = `${dotted(key.slice(under.length))} = ${quote(value)}\n`;
    return text.slice(0, to) + (to > 0 && text[to - 1] !== '\n' ? '\n' : '') + line + text.slice(to);
  };
  // after the last key of the table written under a header the key can be written under (the table's or one above it)
  const keys = places.filter(p => p.kind === 'key' && startsWith(p.path, table) && startsWith(table, p.head));
  const last = keys[keys.length - 1];
  if (last) return after(last.to, last.head);
  const header = places.find(p => p.kind === 'table' && same(p.path, table));
  if (header) return after(header.to, table);
  // (the top table: before the first header)
  const firstHeader = places.find(p => p.kind === 'table');
  if (table.length === 0) return firstHeader ? after(firstHeader.from, []) : after(text.length, []);
  // a new table: before a table inside it (which made it), else at the end
  const inside = places.find(p => p.kind === 'table' && startsWith(p.path, table));
  const section = `[${dotted(table)}]\n${dotted([key[key.length - 1]])} = ${quote(value)}\n`;
  if (inside) return `${text.slice(0, inside.from)}${section}\n${text.slice(inside.from)}`;
  return text + (text === '' ? '' : text.endsWith('\n') ? '\n' : '\n\n') + section;
}

// novel.toml with the edits made, in order, or why it is not changed (it cannot be read, its line ends are mixed, or a
// key cannot be set there: a value that is not a table on the way)
/** @param {string} src @param {TomlEdit[]} edits @returns {{ text: string, error: '' } | { text: null, error: string }} */
export function editToml(src, edits) {
  const bom = src.startsWith('﻿') ? '﻿' : '';
  let text = src.slice(bom.length);
  const crlf = text.includes('\r\n');
  if (crlf) {
    // (a line end that is not \r\n left: the file is written back with \r\n everywhere, so it is not)
    if (/[\r\n]/.test(text.replace(/\r\n/g, '')))
      return { text: null, error: 'novel.toml の改行の形が行によって違うので、書き換えません（GitHub か Working Copy でそろえてください）' };
    text = text.replace(/\r\n/g, '\n');
  }
  for (const edit of edits) {
    const read = parseToml(text);
    if (!read.table) return { text: null, error: `novel.toml が読めないので、書き換えません（${read.error}）` };
    const next = editOnce(text, read.places, edit);
    const check = parseToml(next).table;
    if (!check || valueAt(check, edit.key) !== (edit.value ?? undefined))
      return { text: null, error: `novel.toml の「${edit.key.join('.')}」を書き換えられません（表でない値があります）` };
    text = next;
  }
  return { text: bom + (crlf ? text.replace(/\n/g, '\r\n') : text), error: '' };
}

// The edits that make the table `table` (a table of texts, such as [titles]) go from `before` to `after`: the keys
// gone removed, the keys new or changed set
/** @param {string[]} table @param {Record<string, string>} before @param {Record<string, string>} after @returns {TomlEdit[]} */
export function tableEdits(table, before, after) {
  /** @type {TomlEdit[]} */
  const edits = [];
  for (const k of Object.keys(before)) if (!(k in after)) edits.push({ key: [...table, k], value: null });
  for (const [k, v] of Object.entries(after)) if (before[k] !== v) edits.push({ key: [...table, k], value: v });
  return edits;
}
