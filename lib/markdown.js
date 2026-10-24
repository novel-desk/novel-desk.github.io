// Paths between files of a work, and the small Markdown of the preview (no screen, no state of the app: tested by itself
// in tests/unit). From the server version's public/lib/markdown.js; a picture's address is given by the caller (an
// object URL of the blob read from GitHub), not by a server
import { esc } from './format.js';

/** @type {(p: string | null | undefined) => string} */
export const dirOf = p => (p && p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
// a link in a file at `from` → the path of the file it points at, from the top of the repository (null: not a file of
// the repository, such as https://… or data:…)
/** @param {string} from @param {string} src @returns {string | null} */
export function linkedPath(from, src) {
  if (/^(https?:)?\/\//.test(src) || src.startsWith('data:')) return null;
  const parts = dirOf(from) ? dirOf(from).split('/') : [];
  for (const seg of src.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}
// a line cut at its pictures 「![alt](src)」: the text between them and the pictures, as line.split with the pattern
// /(!\[[^\]]*\]\([^)\s]+\))/ cuts it, in one pass: every 「]」 and every 「)」 or space is looked for once, from where the
// last search stopped, so a long line of 「![」 with no 「]」 (or of 「![](」 with no 「)」) takes no longer than its length
/** @param {string} line @returns {string[]} the text, a picture, the text, … (the text first and last, '' when none) */
export function splitImages(line) {
  const parts = [],
    src = /[^)\s]*/y;
  let from = 0,
    end = 0,
    at = line.indexOf('![');
  while (at !== -1) {
    // the first 「]」 after 「![」: a picture starting here ends its alt there (no 「]」 left: no picture any more)
    const close = line.indexOf(']', at + 2);
    if (close === -1) break;
    // the src after 「](」 runs up to the first 「)」 or space: found once (end only moves on), it must be a 「)」, after
    // one character at least
    src.lastIndex = Math.max(end, close + 2);
    src.exec(line);
    end = src.lastIndex;
    if (line[close + 1] === '(' && end > close + 2 && line[end] === ')') {
      parts.push(line.slice(from, at), line.slice(at, end + 1));
      from = end + 1;
      at = line.indexOf('![', from);
    }
    // no picture from here, nor from any 「![」 before that 「]」 (its alt ends there too)
    else at = line.indexOf('![', close);
  }
  parts.push(line.slice(from));
  return parts;
}
const PICTURE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;
// the files of the repository that the pictures of a text at `from` point at, each once, in order
/** @param {string} text @param {string} from @returns {string[]} */
export function picturePaths(text, from) {
  /** @type {Set<string>} */
  const found = new Set();
  for (const line of text.split('\n'))
    for (const part of splitImages(line)) {
      const m = part.match(PICTURE);
      const path = m && linkedPath(from, m[2]);
      if (path) found.add(path);
    }
  return [...found];
}
// 見出し、箇条書き、画像、ルビ（漢字《かんじ》、|文字《もじ》）だけの小さな Markdown. `srcOf` gives a picture's address from
// the path of its file in the repository ('' when it is not there: the picture shows its alt only)
/** @param {string} text @param {string} from @param {(path: string) => string} srcOf */
export function renderMd(text, from, srcOf) {
  // (a kanji ruby is tried only where the kanji begin: from inside them it would fail the same way, line by line)
  /** @type {(t: string) => string} */
  const ruby = t =>
    t
      .replace(/[|｜]([^|｜《》\n]+)《([^《》\n]+)》/g, '<ruby>$1<rt>$2</rt></ruby>')
      .replace(/(?<![一-鿿々〆ヵヶ])([一-鿿々〆ヵヶ]+)《([^《》\n]+)》/g, '<ruby>$1<rt>$2</rt></ruby>');
  /** @type {(src: string) => string} */
  const address = src => {
    const path = linkedPath(from, src);
    return path === null ? src : srcOf(path);
  };
  /** @type {(line: string) => string} */
  const inline = line =>
    splitImages(line)
      .map(part => {
        const m = part.match(PICTURE);
        if (!m) return ruby(esc(part));
        const src = address(m[2]);
        return src ? `<img alt="${esc(m[1])}" src="${esc(src)}">` : `<img alt="${esc(m[1])}">`;
      })
      .join('');
  let html = '',
    list = false,
    n = -1;
  // each line of the text is one element, numbered (data-l), so writing and the preview can keep the same place
  for (const line of text.split('\n')) {
    n++;
    const h = line.match(/^(#{1,4})\s+(.*)$/),
      li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) {
      if (!list) {
        html += '<ul>';
        list = true;
      }
      html += `<li data-l="${n}">${inline(li[1])}</li>`;
      continue;
    }
    if (list) {
      html += '</ul>';
      list = false;
    }
    html += h ? `<h${h[1].length} data-l="${n}">${inline(h[2])}</h${h[1].length}>` : `<p data-l="${n}">${inline(line)}</p>`;
  }
  return html + (list ? '</ul>' : '');
}
