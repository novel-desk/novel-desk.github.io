// The changes between two texts (no screen, no state of the app: tested by itself in tests/unit). From the server
// version's public/lib/diff.js
import { esc } from './format.js';

// 差分: the steps that turn a into b (arrays), as [op, item] with op '=', '-' or '+'. Longest common subsequence;
// too large → the common start and end, the middle as removed and added.
/** @typedef {['=' | '-' | '+', string]} Op one step: kept, removed or added, and the line or character */
/** @param {string[]} a @param {string[]} b @returns {Op[]} */
export function diffOps(a, b) {
  let s = 0,
    e = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  const x = a.slice(s, a.length - e),
    y = b.slice(s, b.length - e),
    /** @type {Op[]} */
    mid = [];
  if (x.length * y.length > 4e6) {
    x.forEach(v => mid.push(['-', v]));
    y.forEach(v => mid.push(['+', v]));
  } else {
    const w = y.length + 1,
      t = new Uint32Array((x.length + 1) * w);
    for (let i = x.length - 1; i >= 0; i--)
      for (let j = y.length - 1; j >= 0; j--) t[i * w + j] = x[i] === y[j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
    let i = 0,
      j = 0;
    while (i < x.length && j < y.length) {
      if (x[i] === y[j]) {
        mid.push(['=', x[i]]);
        i++;
        j++;
      } else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) mid.push(['-', x[i++]]);
      else mid.push(['+', y[j++]]);
    }
    while (i < x.length) mid.push(['-', x[i++]]);
    while (j < y.length) mid.push(['+', y[j++]]);
  }
  return [...a.slice(0, s).map(v => /** @type {Op} */ (['=', v])), ...mid, ...a.slice(a.length - e).map(v => /** @type {Op} */ (['=', v]))];
}
// one changed line: the removed and added characters marked inside it
/** @param {string} was @param {string} now */
export function diffLine(was, now) {
  return diffOps([...was], [...now])
    .map(([op, c]) => (op === '=' ? esc(c) : op === '-' ? `<del>${esc(c)}</del>` : `<ins>${esc(c)}</ins>`))
    .join('')
    .replace(/<\/del><del>/g, '')
    .replace(/<\/ins><ins>/g, '');
}
// the changes from one version to the next, a line around each; returns [html, the number of places]
/** @param {string} was @param {string} now @returns {[string, number]} */
export function diffHtml(was, now) {
  const ops = diffOps(was.split('\n'), now.split('\n'));
  const near = ops.map(() => false);
  ops.forEach(([op], i) => {
    if (op !== '=') for (let k = Math.max(0, i - 1); k <= Math.min(ops.length - 1, i + 1); k++) near[k] = true;
  });
  let html = '',
    places = 0,
    i = 0,
    gap = false;
  while (i < ops.length) {
    if (!near[i]) {
      gap = true;
      i++;
      continue;
    }
    if (gap && html) html += '<p class="diff-gap">…</p>';
    gap = false;
    if (ops[i][0] === '=') {
      html += `<p>${esc(ops[i][1]) || '&nbsp;'}</p>`;
      i++;
      continue;
    }
    /** @type {string[]} */
    const del = [],
      /** @type {string[]} */
      add = [];
    while (i < ops.length && ops[i][0] === '-') del.push(ops[i++][1]);
    while (i < ops.length && ops[i][0] === '+') add.push(ops[i++][1]);
    places++;
    // a removed and an added line in the same place that share most characters: one line with its changed characters
    /** @type {(d: string, a: string) => boolean} */
    const alike = (d, a) => d.length + a.length > 0 && 2 * diffOps([...d], [...a]).filter(([op]) => op === '=').length >= 0.5 * (d.length + a.length);
    const k = Math.min(del.length, add.length);
    for (let j = 0; j < Math.max(del.length, add.length); j++) {
      // (alike lines are never both empty, so the marked line always has something in it)
      if (j < k && alike(del[j], add[j])) html += `<p class="diff-chg">${diffLine(del[j], add[j])}</p>`;
      else
        html +=
          (j < del.length ? `<p class="diff-del"><del>${esc(del[j]) || '（空行）'}</del></p>` : '') +
          (j < add.length ? `<p class="diff-add"><ins>${esc(add[j]) || '（空行）'}</ins></p>` : '');
    }
  }
  return [html, places];
}
