// サーバー版と見た目・部品の並びが違わないかを確かめる（check:all。docs/server-differences.md）。
// サーバー版の style.css と index.html を、比べる相手の commit（tools/server-diff-allowed.txt の commit の行）から
// `git -C ${NOVEL_WRITER_DIR:-$HOME/novel-writer} show <commit>:public/…` で読み（git の操作は show だけ。サーバー版の
// フォルダには書き込まない）、Novel Desk の style.css と index.html と、規則と要素の単位で比べる。
//   style.css: @media の中かどうかと、セレクター 1 つごとに、最後に効く宣言（属性ごとの値）を比べる。並びや書き方
//     （改行、空白、引用符）の違いは違いにしない
//   index.html: id のある要素は id で、無い要素は親からの道筋（タグ、class、data-* 属性）で同じ要素とみなし、
//     要素があるか、親、属性、中の文字、子の並びを比べる。svg は中身をまとめて 1 つの文字として比べる
// 違いの 1 つずつに鍵（例「css @media (max-width: 760px) .body {padding}」「html #desk > aside#toc order」）を付け、
// tools/server-diff-allowed.txt に、docs/server-differences.md の番号と一緒に書いた鍵だけを許す。許していない違い、
// もう無くなった違いを許す行、docs に無い番号を書いた行があれば、失敗する。サーバー版のフォルダや commit が
// 読めないときも、理由を出して失敗する（黙って通さない）。
// node tools/server_diff.mjs        確かめる
// node tools/server_diff.mjs --list 違いを全部、鍵と両方の値で出す（許す行を書くとき）
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const ALLOWED = join(ROOT, 'tools/server-diff-allowed.txt');
const DOC = join(ROOT, 'docs/server-differences.md');

// --- style.css

/** @param {string} s */
const squash = s => s.replace(/\s+/g, ' ').trim();
// a selector as compared: spaces made one, attribute values quoted, combinators without spaces around them
/** @param {string} sel */
export const normSelector = sel =>
  squash(sel)
    .replace(/\[([\w-]+)=([^"'\]]+)\]/g, '[$1="$2"]')
    .replace(/'/g, '"')
    .replace(/\s*([>+~])\s*/g, ' $1 ');
// splits at the commas outside parentheses and strings
/** @param {string} s @param {string} at */
function splitTop(s, at) {
  const out = [];
  let depth = 0,
    quote = '',
    from = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === at && depth === 0) {
      out.push(s.slice(from, i));
      from = i + 1;
    }
  }
  out.push(s.slice(from));
  return out;
}
// the end of the block that starts after `i` (its closing brace)
/** @param {string} s @param {number} i */
function blockEnd(s, i) {
  let depth = 1,
    quote = '';
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return j;
  }
  throw new Error('CSS の { } が閉じていません');
}
/**
 * A stylesheet as its rules: by where (the @media around it, and the selector) the properties' values that take effect
 * (a property given twice in one rule, as a fallback, keeps both, in order)
 * @param {string} css @returns {Map<string, Map<string, string>>}
 */
export function parseCss(css) {
  /** @type {Map<string, Map<string, string>>} */
  const rules = new Map();
  /** @param {string} src @param {string} ctx */
  const walk = (src, ctx) => {
    let i = 0;
    while (i < src.length) {
      const open = src.indexOf('{', i);
      if (open < 0) break;
      const prelude = squash(src.slice(i, open));
      const end = blockEnd(src, open + 1);
      const inner = src.slice(open + 1, end);
      if (prelude.startsWith('@')) walk(inner, squash(`${ctx} ${prelude}`));
      else {
        /** @type {Map<string, string[]>} */
        const decls = new Map();
        for (const d of splitTop(inner, ';')) {
          const at = d.indexOf(':');
          if (at < 0) continue;
          const prop = squash(d.slice(0, at)).toLowerCase();
          const value = squash(d.slice(at + 1)).replace(/'/g, '"');
          decls.set(prop, [...(decls.get(prop) ?? []), value]);
        }
        for (const sel of splitTop(prelude, ',')) {
          const key = squash(`${ctx} ${normSelector(sel)}`);
          const rule = rules.get(key) ?? new Map();
          for (const [p, v] of decls) rule.set(p, v.join(' ; '));
          rules.set(key, rule);
        }
      }
      i = end + 1;
    }
  };
  walk(css.replace(/\/\*[\s\S]*?\*\//g, ''), '');
  return rules;
}
/** @typedef {{ key: string, server: string, desk: string }} Diff a difference: its key, and what each has ('' none) */
/** @param {string} server @param {string} desk @returns {Diff[]} */
export function cssDiffs(server, desk) {
  const [a, b] = [parseCss(server), parseCss(desk)];
  /** @type {Diff[]} */
  const out = [];
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const [ra, rb] = [a.get(key), b.get(key)];
    if (!ra || !rb) {
      const r = /** @type {Map<string, string>} */ (ra ?? rb);
      const text = [...r].map(([p, v]) => `${p}: ${v}`).join('; ');
      out.push({ key: `css ${ra ? '-' : '+'} ${key}`, server: ra ? text : '', desk: rb ? text : '' });
      continue;
    }
    for (const p of new Set([...ra.keys(), ...rb.keys()]))
      if (ra.get(p) !== rb.get(p)) out.push({ key: `css ${key} {${p}}`, server: ra.get(p) ?? '', desk: rb.get(p) ?? '' });
  }
  return out;
}

// --- index.html

/** @typedef {{ tag: string, attrs: Map<string, string>, children: Node[], text: string, parent: El | null }} El */
/** @typedef {El | { text: string }} Node */
const VOID = new Set(['meta', 'link', 'input', 'br', 'img', 'hr', 'source', 'path', 'rect', 'circle', 'line', 'polyline']);
/** @param {string} html @returns {El} */
export function parseHtml(html) {
  /** @type {El} */
  const root = { tag: '#root', attrs: new Map(), children: [], text: '', parent: null };
  let at = root;
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/gi;
  for (let m; (m = re.exec(html));) {
    if (m[0].startsWith('<!')) continue;
    if (m[5] !== undefined) {
      at.children.push({ text: m[5] });
      continue;
    }
    const [, close, name, attrText, self] = m;
    const tag = name.toLowerCase();
    if (close) {
      // up to the element it closes
      let e = at;
      while (e.parent && e.tag !== tag) e = e.parent;
      if (e.parent) at = e.parent;
      continue;
    }
    /** @type {Map<string, string>} */
    const attrs = new Map();
    for (const a of attrText.matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))
      attrs.set(a[1].toLowerCase(), squash(a[2] ?? a[3] ?? a[4] ?? ''));
    /** @type {El} */
    const el = { tag, attrs, children: [], text: '', parent: at };
    at.children.push(el);
    if (tag === 'script') {
      // its text as it is (raw), up to </script>
      const endAt = html.indexOf('</script>', /** @type {number} */ (m.index) + m[0].length);
      el.text = squash(html.slice(/** @type {number} */ (m.index) + m[0].length, endAt));
      re.lastIndex = endAt + '</script>'.length;
      continue;
    }
    if (!self && !VOID.has(tag)) at = el;
  }
  return root;
}
/** @param {Node} n @returns {n is El} */
const isEl = n => 'tag' in n;
// what an element is known by among its siblings: its tag, classes and data-* (and a meta's or link's name, rel, media,
// a script's src)
/** @param {El} e */
function signature(e) {
  const cls = (e.attrs.get('class') ?? '').split(' ').filter(Boolean);
  const extra = [...e.attrs]
    .filter(
      ([k]) =>
        k.startsWith('data-') ||
        (['meta', 'link'].includes(e.tag) && ['name', 'rel', 'http-equiv', 'media', 'charset'].includes(k)) ||
        (e.tag === 'script' && k === 'src'),
    )
    .map(([k, v]) => `[${k}${v ? `="${v}"` : ''}]`);
  return `${e.tag}${cls.map(c => `.${c}`).join('')}${extra.join('')}`;
}
// an svg's inside as one text
/** @param {El} e @returns {string} */
const inner = e =>
  e.children.map(c => (isEl(c) ? `<${c.tag}${[...c.attrs].map(([k, v]) => ` ${k}="${v}"`).join('')}>${inner(c)}</${c.tag}>` : squash(c.text))).join('');
/**
 * Every element by its key: `#id`, or the path from the nearest one with an id (`parent > signature`, with `:n` when
 * siblings share it). Each with its parent's key, its attributes, its own text and its children's keys
 * @param {El} root @returns {Map<string, { parent: string, attrs: Map<string, string>, text: string, children: string[] }>}
 */
export function elements(root) {
  /** @type {Map<string, { parent: string, attrs: Map<string, string>, text: string, children: string[] }>} */
  const out = new Map();
  /** @param {El} e @param {string} key @param {string} parentKey */
  const visit = (e, key, parentKey) => {
    const els = /** @type {El[]} */ (e.children.filter(isEl));
    const svg = e.tag === 'svg';
    const text = svg
      ? inner(e)
      : e.tag === 'script'
        ? e.text
        : squash(
            e.children
              .filter(c => !isEl(c))
              .map(c => c.text)
              .join(' '),
          );
    const attrs = new Map([...e.attrs].filter(([k]) => k !== 'id'));
    /** @type {string[]} */
    const children = [];
    if (!svg) {
      /** @type {Map<string, number>} */
      const seen = new Map();
      const counts = new Map();
      for (const c of els) counts.set(signature(c), (counts.get(signature(c)) ?? 0) + 1);
      for (const c of els) {
        const sig = signature(c);
        const n = (seen.get(sig) ?? 0) + 1;
        seen.set(sig, n);
        const id = c.attrs.get('id');
        const ck = id ? `#${id}` : `${key === '#root' ? '' : `${key} > `}${sig}${counts.get(sig) > 1 ? `:${n}` : ''}`;
        children.push(ck);
        visit(c, ck, key);
      }
    }
    out.set(key, { parent: parentKey, attrs, text, children });
  };
  visit(root, '#root', '');
  return out;
}
/** @param {string} server @param {string} desk @returns {Diff[]} */
export function htmlDiffs(server, desk) {
  const [a, b] = [elements(parseHtml(server)), elements(parseHtml(desk))];
  /** @type {Diff[]} */
  const out = [];
  // an element in one only: said once, not its inside
  /** @param {Map<string, any>} one @param {Map<string, any>} other @param {string} sign */
  const only = (one, other, sign) => {
    for (const [key, e] of one) {
      if (other.has(key)) continue;
      // (its parent in one only too: said by the parent)
      if (e.parent && !other.has(e.parent)) continue;
      out.push({ key: `html ${sign} ${key}`, server: sign === '-' ? key : '', desk: sign === '+' ? key : '' });
    }
  };
  only(a, b, '-');
  only(b, a, '+');
  for (const [key, ea] of a) {
    const eb = b.get(key);
    if (!eb) continue;
    if (ea.parent !== eb.parent) out.push({ key: `html ${key} parent`, server: ea.parent, desk: eb.parent });
    for (const k of new Set([...ea.attrs.keys(), ...eb.attrs.keys()]))
      if (ea.attrs.get(k) !== eb.attrs.get(k)) out.push({ key: `html ${key} [${k}]`, server: ea.attrs.get(k) ?? '', desk: eb.attrs.get(k) ?? '' });
    if (ea.text !== eb.text) out.push({ key: `html ${key} text`, server: ea.text, desk: eb.text });
    const common = ea.children.filter((/** @type {string} */ c) => eb.children.includes(c));
    const commonB = eb.children.filter((/** @type {string} */ c) => ea.children.includes(c));
    if (common.join('\n') !== commonB.join('\n')) out.push({ key: `html ${key} order`, server: common.join(' | '), desk: commonB.join(' | ') });
  }
  return out;
}

// --- the allowed list, and the check

/**
 * tools/server-diff-allowed.txt: 「commit <hash>」, then 「A<n> <key>」 a line (# a comment)
 * @param {string} text @returns {{ commit: string, allowed: Map<string, string> }} the commit, and each key's number
 */
export function parseAllowed(text) {
  let commit = '';
  /** @type {Map<string, string>} */
  const allowed = new Map();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const c = /^commit\s+([0-9a-f]{7,40})$/.exec(line);
    if (c) commit = c[1];
    else {
      const m = /^([A-Z]+\d+)\s+(.+)$/.exec(line);
      if (!m) throw new Error(`tools/server-diff-allowed.txt の読めない行: ${line}`);
      allowed.set(m[2], m[1]);
    }
  }
  return { commit, allowed };
}
// the numbers docs/server-differences.md gives reasons for (its headings 「## A1. …」)
/** @param {string} doc */
export const docNumbers = doc => new Set([...doc.matchAll(/^#{2,3}\s+([A-Z]+\d+)[.．]/gm)].map(m => m[1]));
/**
 * What is wrong: the differences not allowed, the lines that allow what no longer differs, the numbers not in the doc
 * @param {Diff[]} diffs @param {Map<string, string>} allowed @param {Set<string>} numbers
 */
export function judge(diffs, allowed, numbers) {
  const keys = new Set(diffs.map(d => d.key));
  return {
    unexplained: diffs.filter(d => !allowed.has(d.key)),
    stale: [...allowed.keys()].filter(k => !keys.has(k)),
    unknown: [...new Set(allowed.values())].filter(n => !numbers.has(n)),
  };
}

/* c8 ignore start */
async function main() {
  const dir = process.env.NOVEL_WRITER_DIR || join(homedir(), 'novel-writer');
  const fail = (/** @type {string} */ why) => {
    console.log(`サーバー版と比べられません: ${why}`);
    process.exit(1);
  };
  if (!existsSync(join(dir, '.git'))) fail(`${dir} にサーバー版（novel-writer）の git のフォルダがありません。NOVEL_WRITER_DIR で場所を指定してください`);
  const { commit, allowed } = parseAllowed(readFileSync(ALLOWED, 'utf8'));
  if (!commit) fail('tools/server-diff-allowed.txt に、比べる相手の commit（commit <hash> の行）がありません');
  /** @param {string} path */
  const show = path => {
    try {
      return execFileSync('git', ['-C', dir, 'show', `${commit}:${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      return fail(
        `${dir} で ${commit}:${path} を読めません（${String(/** @type {any} */ (err).stderr ?? err).trim()}）。サーバー版を git pull するか、commit を確かめてください`,
      );
    }
  };
  const diffs = [
    ...cssDiffs(/** @type {string} */ (show('public/style.css')), readFileSync(join(ROOT, 'style.css'), 'utf8')),
    ...htmlDiffs(/** @type {string} */ (show('public/index.html')), readFileSync(join(ROOT, 'index.html'), 'utf8')),
  ];
  if (process.argv.includes('--list')) {
    for (const d of diffs) console.log(`${allowed.get(d.key) ?? '??'} ${d.key}\n    サーバー版: ${d.server}\n    Novel Desk: ${d.desk}`);
    return;
  }
  const { unexplained, stale, unknown } = judge(diffs, allowed, docNumbers(readFileSync(DOC, 'utf8')));
  for (const d of unexplained) console.log(`理由の無い違い: ${d.key}\n    サーバー版: ${d.server}\n    Novel Desk: ${d.desk}`);
  for (const k of stale) console.log(`もう無い違いを許している行（tools/server-diff-allowed.txt から消す）: ${k}`);
  for (const n of unknown) console.log(`docs/server-differences.md に無い番号: ${n}`);
  if (unexplained.length || stale.length || unknown.length) {
    console.log(
      'サーバー版に合わせるか、サーバーが無いために同じにできない理由を docs/server-differences.md に書いて、tools/server-diff-allowed.txt に鍵を足してください',
    );
    process.exit(1);
  }
  console.log(`サーバー版（${commit}）との違い ${diffs.length} 件は、どれも docs/server-differences.md に理由があります`);
}
if (import.meta.url === `file://${process.argv[1]}`) await main();
/* c8 ignore stop */
