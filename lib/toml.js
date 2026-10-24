// The TOML of novel.toml, as much of it as a work's settings use (no screen, no state of the app: tested by itself in
// tests/unit). Read: comments, tables 「[a]」 「[a.b]」, keys (bare, "quoted", 'literal', dotted), and the values text
// ("basic" with its escapes, 'literal'), whole numbers, true and false, and arrays of them. Anything else (a text over
// several lines, an inline table, a date, an array of tables) is said by its line, and nothing of the file is used
/** @typedef {string | number | boolean | TomlValue[] | TomlTable} TomlValue */
/** @typedef {{ [key: string]: TomlValue }} TomlTable */
/**
 * Where a header 「[a.b]」 or a key statement is in the text read (with its line ends made \n, without a byte order
 * mark): its line from `from` to `to` (after its line end), the table path of the header it is under (`head`), its
 * whole path, and for a key the place of its value
 * @typedef {{ kind: 'table' | 'key', path: string[], head: string[], from: number, to: number, valueFrom: number, valueTo: number }} TomlPlace
 */

/** @type {Record<string, string>} */
const ESCAPES = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', '"': '"', '\\': '\\' };
const BARE = /[A-Za-z0-9_-]/;

// novel.toml read: its tables and values, or what cannot be read and on which line (「3 行目: …」)
/** @param {string} src @returns {{ table: TomlTable, error: '', places: TomlPlace[] } | { table: null, error: string, places: null }} */
export function parseToml(src) {
  const text = src.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  let i = 0;
  /** @type {(why: string) => never} */
  const fail = why => {
    throw new Error(`${text.slice(0, i).split('\n').length} 行目: ${why}`);
  };
  const space = () => {
    while (text[i] === ' ' || text[i] === '\t') i++;
  };
  // spaces, line ends and comments (inside an array)
  const blank = () => {
    for (;;) {
      space();
      if (text[i] === '#') while (i < text.length && text[i] !== '\n') i++;
      if (text[i] !== '\n') return;
      i++;
    }
  };
  // the end of a line: a comment may follow what is on it, nothing else
  const lineEnd = () => {
    space();
    if (text[i] === '#') while (i < text.length && text[i] !== '\n') i++;
    if (i < text.length && text[i] !== '\n') fail(`「${text[i]}」は読めません`);
  };
  /** @returns {string} */
  const basic = () => {
    if (text.startsWith('"""', i)) fail('複数行の文字列（"""）には対応していません');
    let s = '';
    for (i++; text[i] !== '"'; i++) {
      const c = text[i];
      if (c === undefined || c === '\n') fail('文字列が閉じていません（" が足りません）');
      if (c !== '\\') {
        s += c;
        continue;
      }
      const e = text[++i];
      if (e === 'u' || e === 'U') {
        const len = e === 'u' ? 4 : 8,
          hex = text.slice(i + 1, i + 1 + len);
        if (!new RegExp(`^[0-9A-Fa-f]{${len}}$`).test(hex)) fail(`\\${e} の後に 16 進数が ${len} 桁ありません`);
        s += String.fromCodePoint(parseInt(hex, 16));
        i += len;
      } else if (e in ESCAPES) s += ESCAPES[e];
      else fail(`エスケープ「\\${e ?? ''}」は読めません`);
    }
    i++;
    return s;
  };
  /** @returns {string} */
  const literal = () => {
    if (text.startsWith("'''", i)) fail("複数行の文字列（'''）には対応していません");
    const end = text.indexOf("'", i + 1),
      line = text.indexOf('\n', i);
    if (end === -1 || (line !== -1 && line < end)) fail("文字列が閉じていません（' が足りません）");
    const s = text.slice(i + 1, end);
    i = end + 1;
    return s;
  };
  /** @returns {string} */
  const keyPart = () => {
    space();
    if (text[i] === '"') return basic();
    if (text[i] === "'") return literal();
    const start = i;
    while (i < text.length && BARE.test(text[i])) i++;
    if (i === start) fail(text[i] === undefined || text[i] === '\n' ? 'キーがありません' : `キーに「${text[i]}」は使えません`);
    return text.slice(start, i);
  };
  /** @returns {string[]} */
  const key = () => {
    const parts = [keyPart()];
    for (space(); text[i] === '.'; space()) {
      i++;
      parts.push(keyPart());
    }
    return parts;
  };
  /** @returns {TomlValue} */
  const value = () => {
    space();
    const c = text[i];
    if (c === '"') return basic();
    if (c === "'") return literal();
    if (c === '[') {
      /** @type {TomlValue[]} */
      const items = [];
      i++;
      for (blank(); text[i] !== ']'; blank()) {
        items.push(value());
        blank();
        if (text[i] === ',') i++;
        else if (text[i] !== ']') fail('配列の値の間に「,」がありません');
      }
      i++;
      return items;
    }
    if (c === '{') fail('インラインテーブル（{ }）には対応していません');
    // (the pattern matches always, if only nothing)
    const word = /** @type {RegExpExecArray} */ (/^[^\s,\]#]*/.exec(text.slice(i)))[0];
    i += word.length;
    if (word === 'true' || word === 'false') return word === 'true';
    if (/^[+-]?(0|[1-9](_?[0-9])*)$/.test(word)) return Number(word.replace(/_/g, ''));
    if (word === '') fail('値がありません');
    return fail(`値「${word}」は読めません（文字列は "" で囲みます）`);
  };
  /** @type {TomlTable} */
  const root = {};
  // the tables that a header 「[a.b]」 or a key made, and the keys given a value: none of them is given twice
  /** @type {Set<TomlTable>} */
  const headed = new Set();
  /** @param {TomlTable} from @param {string[]} path @returns {TomlTable} */
  const tableAt = (from, path) => {
    let t = from;
    for (const k of path) {
      if (!(k in t)) t[k] = {};
      const next = t[k];
      if (typeof next !== 'object' || Array.isArray(next)) fail(`「${path.join('.')}」は表ではありません（「${k}」に値があります）`);
      t = next;
    }
    return t;
  };
  let table = root;
  /** @type {string[]} */
  let head = [];
  /** @type {TomlPlace[]} */
  const places = [];
  // the line of the statement at `at`, up to after the line end where the reading is now
  const line = (/** @type {number} */ at) => ({ from: text.lastIndexOf('\n', at - 1) + 1, to: i < text.length ? i + 1 : i });
  try {
    for (blank(); i < text.length; blank()) {
      const start = i;
      if (text[i] === '[') {
        if (text[i + 1] === '[') fail('表の配列（[[ ]]）には対応していません');
        i++;
        const path = key();
        if (text[i] !== ']') fail('表の名前が「]」で閉じていません');
        i++;
        lineEnd();
        table = tableAt(root, path);
        if (headed.has(table)) fail(`表「[${path.join('.')}]」が 2 回あります`);
        headed.add(table);
        head = path;
        places.push({ kind: 'table', path, head: [], ...line(start), valueFrom: i, valueTo: i });
        continue;
      }
      const path = key();
      if (text[i] !== '=') fail(`キー「${path.join('.')}」の後に「=」がありません`);
      i++;
      space();
      const valueFrom = i;
      const v = value();
      const valueTo = i;
      lineEnd();
      places.push({ kind: 'key', path: [...head, ...path], head, ...line(start), valueFrom, valueTo });
      const last = /** @type {string} */ (path.pop());
      const at = tableAt(table, path);
      if (last in at) fail(`キー「${[...path, last].join('.')}」が 2 回あります`);
      at[last] = v;
    }
  } catch (err) {
    return { table: null, error: err.message, places: null };
  }
  return { table: root, error: '', places };
}
