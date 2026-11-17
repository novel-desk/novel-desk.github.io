import { describe, test, expect } from 'vitest';
import {
  extOf,
  hunksOf,
  layoutOf,
  mergeLines,
  nameOf,
  placeAfter,
  placeOf,
  sendPlan,
  sideBySide,
  underHeading,
  CONFLICT_MARK,
  END_MARK,
  MINE_MARK,
  OTHER_DEVICE_MARK,
} from '../../lib/merge.js';
import { firstLayout, parseLayout } from '../../lib/layout.js';

// one place with both versions side by side (`mine`, `theirs`: their lines, each with its line end)
/** @param {string} mine @param {string} theirs */
const sides = (mine, theirs) => `${MINE_MARK}\n${mine}${OTHER_DEVICE_MARK}\n${theirs}${END_MARK}\n`;
// a text of lines, each with its line end
/** @param {string[]} lines */
const text = lines => lines.map(l => `${l}\n`).join('');

describe('merge', () => {
  // FR-SAVE-05
  test('the lines that put two versions side by side: the server version’s; the second starts with the mark the screen looks for', () => {
    expect(OTHER_DEVICE_MARK.startsWith(CONFLICT_MARK)).toBe(true);
    // (the server version's mark, which the screen looks for in texts it wrote too)
    expect(CONFLICT_MARK).toBe('――― ここから、ほかの');
    // (the server version's src/merge.rs SAVED and END_MARK: a text side by side reads the same, whichever wrote it)
    expect([MINE_MARK, OTHER_DEVICE_MARK, END_MARK]).toEqual([
      '――― ここから、この端末で書いた版 ―――',
      '――― ここから、ほかの端末で書かれた版 ―――',
      '――― 並べた版はここまで ―――',
    ]);
  });
  // FR-SAVE-05: a place tidied only in part is still there (a line of the three left)
  test('sideBySide: any of the three lines, or the start of the second (the server version’s other marks); none, not', () => {
    expect(sideBySide(`前\n${MINE_MARK}\n後\n`)).toBe(true);
    expect(sideBySide(`前\n${CONFLICT_MARK}所（GitHub や Working Copy）で書かれた版 ―――\n`)).toBe(true);
    expect(sideBySide(`前\n${END_MARK}`)).toBe(true);
    expect(sideBySide('――― ここから\n本文\n')).toBe(false);
    expect(sideBySide('')).toBe(false);
  });
  // FR-SAVE-06: the changes between two versions, small for a long episode changed in a few lines
  test('hunksOf: none for the same lines; a line changed, added, removed; the middle by its longest common subsequence, the first match taken', () => {
    const L = (/** @type {string} */ s) => [...s];
    expect(hunksOf(L('abc'), L('abc'))).toEqual([]);
    expect(hunksOf([], [])).toEqual([]);
    expect(hunksOf(L('abc'), L('axc'))).toEqual([{ from: 1, to: 2, at: 1, end: 2 }]);
    expect(hunksOf(L('ac'), L('abc'))).toEqual([{ from: 1, to: 1, at: 1, end: 2 }]);
    expect(hunksOf(L('abc'), L('ac'))).toEqual([{ from: 1, to: 2, at: 1, end: 1 }]);
    // (a line repeated: the first ones matched; the lines both share at the end kept: a line typed before an empty line
    // is a line changed, not one added and the empty line removed)
    expect(hunksOf(['', ''], ['a', ''])).toEqual([{ from: 0, to: 1, at: 0, end: 1 }]);
    expect(hunksOf(L('aa'), L('aaa'))).toEqual([{ from: 2, to: 2, at: 2, end: 3 }]);
    expect(hunksOf(L('aaa'), L('aa'))).toEqual([{ from: 2, to: 3, at: 2, end: 2 }]);
    expect(hunksOf(L('pxxq'), L('rxs'))).toEqual([
      { from: 0, to: 1, at: 0, end: 1 },
      { from: 2, to: 4, at: 2, end: 3 },
    ]);
    expect(hunksOf(L('abcb'), L('babc'))).toEqual([
      { from: 0, to: 0, at: 0, end: 1 },
      { from: 3, to: 4, at: 4, end: 4 },
    ]);
    expect(hunksOf(L('ab'), L('ba'))).toEqual([
      { from: 0, to: 1, at: 0, end: 0 },
      { from: 2, to: 2, at: 1, end: 2 },
    ]);
    // every pair of texts of up to three lines of two kinds: the changes make one into the other, and the lines they
    // leave are a longest common subsequence of the two
    /** @param {string} a @param {string} b @returns {number} */
    const lcs = (a, b) => (!a || !b ? 0 : a[0] === b[0] ? 1 + lcs(a.slice(1), b.slice(1)) : Math.max(lcs(a.slice(1), b), lcs(a, b.slice(1))));
    const all = [''];
    for (let n = 0; n < 3; n++) for (const t of all.filter(t => t.length === n)) all.push(`${t}a`, `${t}b`);
    for (const a of all)
      for (const b of all) {
        let out = '',
          at = 0,
          kept = 0;
        for (const h of hunksOf(L(a), L(b))) {
          expect(h.from >= at && h.to >= h.from && h.end >= h.at).toBe(true);
          kept += h.from - at;
          out += a.slice(at, h.from) + b.slice(h.at, h.end);
          at = h.to;
        }
        expect([out + a.slice(at), kept + a.length - at]).toEqual([b, lcs(a, b)]);
      }
  });
  // FR-SAVE-04, FR-SAVE-06: written in two places, in other lines: both taken, nothing twice
  test('mergeLines: what only one side changed is taken, each side’s; the same change once; lines removed on one side, removed', () => {
    const base = text(['# 第1話', '', '一', '', '二', '', '三']);
    expect(
      mergeLines(base, text(['# 第1話', '', '一を書き換えた', '', '二', '', '三']), text(['# 第1話', '', '一', '', '二', '', '三を書き換えた', '四'])),
    ).toEqual({
      text: text(['# 第1話', '', '一を書き換えた', '', '二', '', '三を書き換えた', '四']),
      both: false,
    });
    // (the other side's change before this side's, in the text)
    expect(mergeLines(base, text(['# 第1話', '', '一', '', '二', '', '三と']), text(['# 第1話 朝', '', '一', '', '二', '', '三']))).toEqual({
      text: text(['# 第1話 朝', '', '一', '', '二', '', '三と']),
      both: false,
    });
    expect(mergeLines(base, text(['# 第1話', '', '一', '', '二と', '', '三']), text(['# 第1話', '', '一', '', '二と', '', '三と']))).toEqual({
      text: text(['# 第1話', '', '一', '', '二と', '', '三と']),
      both: false,
    });
    expect(mergeLines(base, text(['# 第1話', '', '二', '', '三']), text(['# 第1話', '', '一', '', '二', '', '三', '四']))).toEqual({
      text: text(['# 第1話', '', '二', '', '三', '四']),
      both: false,
    });
    expect(mergeLines(base, text(['# 第1話', '', '一', '', '二', '', '三', '四']), text(['# 第1話', '', '一', '', '三']))).toEqual({
      text: text(['# 第1話', '', '一', '', '三', '四']),
      both: false,
    });
  });
  // FR-SAVE-05, FR-SAVE-06: only the lines both changed are side by side, the lines both versions share at the start
  // and the end of the place once
  test('mergeLines: the same lines changed on both sides, lines added at the same place: those lines side by side, nothing else twice', () => {
    const base = text(['一', '', '二', '', '三']);
    expect(mergeLines(base, text(['一', '', '二をここで', '', '三']), text(['一', '', '二をほかで', '', '三']))).toEqual({
      text: text(['一', '']) + sides('二をここで\n', '二をほかで\n') + text(['', '三']),
      both: true,
    });
    expect(mergeLines(base, text(['一', '', '二', '', '三', 'ここで足した']), text(['一', '', '二', '', '三', 'ほかで足した']))).toEqual({
      text: text(['一', '', '二', '', '三']) + sides('ここで足した\n', 'ほかで足した\n'),
      both: true,
    });
    // (changes that touch, with no line between them, are one place; its first and last lines, the same on both
    // sides, once)
    expect(mergeLines(base, text(['一', '', '二', 'ここで', '', '三']), text(['一', '', '二', 'ほかで', '', '三']))).toEqual({
      text: text(['一', '', '二']) + sides('ここで\n', 'ほかで\n') + text(['', '三']),
      both: true,
    });
    expect(mergeLines(text(['一', '二', '三']), text(['一', '二と', '三']), text(['一', '二', '三と']))).toEqual({
      text: text(['一']) + sides('二と\n三\n', '二\n三と\n'),
      both: true,
    });
    // (one side's change takes in the other's, longer: one place over both; each side's lines of it)
    expect(mergeLines(text(['a', 'b', 'c', 'd', 'e']), text(['a', 'B', 'C', 'D', 'e']), text(['a', 'b', 'X', 'd', 'e']))).toEqual({
      text: text(['a']) + sides('B\nC\nD\n', 'b\nX\nd\n') + text(['e']),
      both: true,
    });
    expect(mergeLines(text(['a', 'b', 'c', 'd', 'e']), text(['a', 'b', 'C2', 'D2', 'e']), text(['a', 'B1', 'C1', 'd', 'e']))).toEqual({
      text: text(['a']) + sides('b\nC2\nD2\n', 'B1\nC1\nd\n') + text(['e']),
      both: true,
    });
    // (a line changed here at the start, one added there at the end: not one place)
    expect(mergeLines('\n\n', 'a\n\n', '\n\nx')).toEqual({ text: 'a\n\nx\n', both: false });
    // (removed here, added to there at its end: one place)
    expect(mergeLines(text(['a', 'b']), '', text(['a', 'b', 'c']))).toEqual({ text: sides('', 'a\nb\nc\n'), both: true });
    // (the two versions of the place sharing their last lines, or one the other's start: those lines once)
    expect(mergeLines(text(['p', 'q']), text(['m', 's']), text(['t', 's']))).toEqual({ text: sides('m\n', 't\n') + text(['s']), both: true });
    expect(mergeLines(text(['p', 'q', 'r']), text(['m', 's', 'u']), text(['t', 's', 'u']))).toEqual({
      text: sides('m\n', 't\n') + text(['s', 'u']),
      both: true,
    });
    expect(mergeLines(text(['y']), text(['x', 'x']), text(['x', 'x', 'x']))).toEqual({ text: text(['x', 'x']) + sides('', 'x\n'), both: true });
    expect(mergeLines(text(['y']), text(['x', 'x', 'x']), text(['x', 'x']))).toEqual({ text: text(['x', 'x']) + sides('x\n', ''), both: true });
    // (one side's lines the same as the other's start: the rest side by side)
    expect(mergeLines(text(['p']), text(['x']), text(['x', 'y']))).toEqual({ text: text(['x']) + sides('', 'y\n'), both: true });
  });
  // FR-SAVE-04, FR-SAVE-06: the text it was written from not known: nothing taken as removed, the same lines once
  test('mergeLines without the base: every place where the two differ side by side; the lines both have once', () => {
    expect(mergeLines(null, text(['一', 'ここで', '三']), text(['一', 'ほかで', '三', '四']))).toEqual({
      text: text(['一']) + sides('ここで\n', 'ほかで\n') + text(['三']) + sides('', '四\n'),
      both: true,
    });
    expect(mergeLines(null, text(['一']), text(['一']))).toEqual({ text: text(['一']), both: false });
  });
  // FR-SAVE-06: the same text, other line ends: no conflict, mine as it is
  test('mergeLines: line ends of either kind; the same text is mine as it is; a last line without a line end stays so', () => {
    expect(mergeLines('同じ\n二行', '同じ\r\n二行', '同じ\n二行\n')).toEqual({ text: '同じ\r\n二行', both: false });
    expect(mergeLines(text(['a', 'b', 'c']).replace(/\n/g, '\r\n'), text(['a', 'B', 'c']), 'a\r\nb\r\nc\r\nd\r\n')).toEqual({
      text: text(['a', 'B', 'c', 'd']),
      both: false,
    });
    // (the line that ends a place side by side keeps its line end: what is typed after it goes on a line of its own)
    expect(mergeLines(text(['a', 'b']), 'a\nb\nここ', 'a\nb\nほか')).toEqual({ text: text(['a', 'b']) + sides('ここ\n', 'ほか\n'), both: true });
    expect(mergeLines(text(['a', 'b', 'c']), 'a\nB\nc', 'a\nX\nc')).toEqual({ text: `a\n${sides('B\n', 'X\n')}c`, both: true });
    expect(mergeLines(text(['a', 'b']), 'A\nb', text(['a', 'b', 'c']))).toEqual({ text: 'A\nb\nc', both: false });
    expect(mergeLines('', '', text(['c']))).toEqual({ text: text(['c']), both: false });
  });
  // FR-SAVE-06: the case of the work that found it: an episode of 2,300 lines changed in a few lines in two places
  test('mergeLines: a long episode changed in a few lines in two places: those lines only, never the whole text twice', () => {
    const lines = Array.from({ length: 2300 }, (_, i) => `段落${i}`);
    const base = text(lines);
    const mine = text(lines.map(l => (l === '段落10' ? '段落10をここで' : l === '段落1200' ? '段落1200をここで' : l)));
    const theirs = text([...lines.map(l => (l === '段落2200' ? '段落2200をほかで' : l === '段落1200' ? '段落1200をほかで' : l)), '最後にほかで']);
    const merged = mergeLines(base, mine, theirs);
    expect(merged.both).toBe(true);
    expect(merged.text).toBe(
      text([...lines.slice(0, 10), '段落10をここで', ...lines.slice(11, 1200)]) +
        sides('段落1200をここで\n', '段落1200をほかで\n') +
        text([...lines.slice(1201, 2200), '段落2200をほかで', ...lines.slice(2201), '最後にほかで']),
    );
    // (without the base, the lines both have once)
    expect(mergeLines(null, mine, theirs).text.split('\n').length).toBeLessThan(2300 + 20);
  });
  // FR-SAVE-08: the caret on the line it was on, once the text is put together
  test('placeAfter: the same place on a line both have, lines added or removed before it; the start of what a changed line became', () => {
    expect(placeAfter('一\n二\n三', 'ほか\n一\n二\n三', 3)).toBe(6);
    expect(placeAfter('一\n二\n三', '一\n三', 5)).toBe(3);
    expect(placeAfter('一\n二二\n三', '一\nほか\n三', 4)).toBe(2);
    expect(placeAfter('一\n二二\n三', '一\nほか\n三', 2)).toBe(2);
    expect(placeAfter('一\n二', '一', 3)).toBe(1);
    expect(placeAfter('一\n二', `一\n${MINE_MARK}\n二`, 3)).toBe(4 + MINE_MARK.length);
    expect(placeAfter('一\n二', '一\n二\nほか', 1)).toBe(1);
    expect(placeAfter('a\nb\nc\nd\ne', 'a\nX\nY\nc\nd\ne', 6)).toBe(8);
  });
  // FR-SAVE-04, FR-SAVE-06: the same file, changed there or not
  const f = (/** @type {Record<string, string>} */ paths) => Object.fromEntries(Object.entries(paths).map(([p, sha]) => [p, { sha, mode: '100644' }]));
  // episodes titled by their headings in ch/ (none of the texts known: no file told by its text)
  const L = parseLayout('[manuscript]\ndir = "ch"\ntitle = "heading"\n').layout;
  // episodes titled by their file names in ch/
  const F = parseLayout('[manuscript]\ndir = "ch"\n').layout;
  /** @param {Record<string, string | null>} [texts] @param {any} [layout] */
  const look = (texts = {}, layout = L) => ({ texts, was: layout, now: layout });
  const at = (/** @type {string} */ how, /** @type {string} */ to) => ({ how, to });
  test('placeOf: mine when the file is still the blob written from (a file made here: still not there); both when the same file changed there', () => {
    const read = f({ 'a.md': 'a1', 'b.md': 'b1' });
    expect(placeOf('a.md', 'a1', read, read, look())).toEqual(at('mine', 'a.md'));
    expect(placeOf('new.md', '', read, read, look())).toEqual(at('mine', 'new.md'));
    expect(placeOf('a.md', 'a1', read, f({ 'a.md': 'a2', 'b.md': 'b1' }), look())).toEqual(at('both', 'a.md'));
    // (written from a version before the one read: the one read changed there again)
    expect(placeOf('a.md', 'a0', read, read, look())).toEqual(at('both', 'a.md'));
    expect(placeOf('a.md', 'a0', read, f({ 'a.md': 'a2', 'b.md': 'b1' }), look())).toEqual(at('both', 'a.md'));
    // (another file with the same text as the one written, not moved: the file written is still here)
    const twins = f({ 'a.md': 'e', 'b.md': 'e' });
    expect(placeOf('a.md', 'e', twins, f({ 'a.md': 'a2', 'b.md': 'e' }), look())).toEqual(at('both', 'a.md'));
    // (another file changed too: not a move)
    expect(placeOf('a.md', 'a1', read, f({ 'a.md': 'a2', 'b.md': 'b2' }), look())).toEqual(at('both', 'a.md'));
    // (changed into the text of another file, which is still there: not a move)
    expect(placeOf('a.md', 'a1', f({ 'a.md': 'a1', 'b.md': 'x' }), f({ 'a.md': 'x', 'b.md': 'x' }), look())).toEqual(at('both', 'a.md'));
    // (the same name then and now, both read)
    const named = look({ a1: '# 一\n\nA\n', a2: '# 一\n\nA2\n' });
    expect(placeOf('ch/a.md', 'a1', f({ 'ch/a.md': 'a1' }), f({ 'ch/a.md': 'a2' }), named)).toEqual(at('both', 'ch/a.md'));
    // (not told, its text not read then, or not now: not UTF-8 there)
    expect(placeOf('ch/a.md', 'a1', f({ 'ch/a.md': 'a1' }), f({ 'ch/a.md': 'a3' }), named)).toEqual(at('both', 'ch/a.md'));
    expect(placeOf('ch/a.md', 'a0', f({ 'ch/a.md': 'a9' }), f({ 'ch/a.md': 'a2' }), named)).toEqual(at('both', 'ch/a.md'));
  });
  // FR-TOC-04, FR-NOTE-05: reordered, renumbered or renamed (by the file name) elsewhere: the text goes where the file
  // is now, never into the file that took its path
  test('placeOf: moved elsewhere as it was: where it is now', () => {
    const read = f({ '01.md': 'one', '02.md': 'two' });
    const swapped = f({ '01.md': 'two', '02.md': 'one' });
    expect(placeOf('01.md', 'one', read, swapped, look())).toEqual(at('mine', '02.md'));
    expect(placeOf('02.md', 'two', read, swapped, look())).toEqual(at('mine', '01.md'));
    expect(placeOf('01.md', 'one', read, f({ '02.md': 'two', '05.md': 'one' }), look())).toEqual(at('mine', '05.md'));
    // (written from a version before the one read: the one read moved, and changed there since it was written from)
    expect(placeOf('01.md', 'one0', read, f({ '02.md': 'two', '05.md': 'one' }), look())).toEqual(at('both', '05.md'));
    // (the one written from moved, though another was read)
    expect(placeOf('01.md', 'one0', read, f({ '02.md': 'two', '05.md': 'one0' }), look())).toEqual(at('mine', '05.md'));
    // (renamed by its file name: called otherwise there now, still the one)
    const byName = look({ one: '本文\n' }, F);
    expect(placeOf('ch/01_a.md', 'one', f({ 'ch/01_a.md': 'one' }), f({ 'ch/01_z.md': 'one' }), byName)).toEqual(at('mine', 'ch/01_z.md'));
    // (a file of another kind with its blob: not it)
    expect(placeOf('01.md', 'one', read, f({ '02.md': 'two', '05.txt': 'one' }), look())).toEqual(at('refused', '01.md'));
    // several files with its blob (the same text): the one called as it was, else none
    const twins = f({ 'ch/01_a.md': 'e', 'ch/02_b.md': 'e' });
    const empty = look({ e: '' }, F);
    expect(placeOf('ch/01_a.md', 'e', twins, f({ 'ch/01_b.md': 'e', 'ch/02_a.md': 'e' }), empty)).toEqual(at('mine', 'ch/02_a.md'));
    expect(placeOf('ch/01_a.md', 'e', twins, f({ 'ch/01_c.md': 'e', 'ch/02_d.md': 'e' }), empty)).toEqual(at('refused', 'ch/01_a.md'));
    expect(placeOf('ch/01_a.md', 'e', twins, f({ 'ch/01_c.md': 'e', 'ch/02_d.md': 'e' }), look({}, F))).toEqual(at('refused', 'ch/01_a.md'));
    // (not told apart, though a file called as it was is at its path now: refused)
    expect(
      placeOf('ch/01_a.md', 'e', f({ 'ch/01_a.md': 'e' }), f({ 'ch/01_a.md': 'n', 'ch/02_c.md': 'e', 'ch/03_d.md': 'e' }), look({ e: '', n: 'x' }, F)),
    ).toEqual(at('refused', 'ch/01_a.md'));
  });
  // FR-TOC-06, FR-NOTE-06: deleted or put in _trash/ elsewhere: not put back, nor into a new file made there
  test('placeOf: refused when the file is put in _trash/ or gone; a file made here, and another there now', () => {
    const read = f({ 'a.md': 'a1', 'b.md': 'b1' });
    expect(placeOf('a.md', 'a1', read, f({ 'b.md': 'b1' }), look())).toEqual(at('refused', 'a.md'));
    expect(placeOf('a.md', 'a1', read, f({ 'b.md': 'b1', '_trash/a.md': 'a1' }), look())).toEqual(at('refused', 'a.md'));
    // (deleted, and a new file made at its path: refused, never written into the new one)
    expect(placeOf('a.md', 'a1', read, f({ 'a.md': 'n1', 'b.md': 'b1', '_trash/a.md': 'a1' }), look())).toEqual(at('refused', 'a.md'));
    // (put in _trash/ and a copy of it elsewhere too: refused)
    expect(placeOf('a.md', 'a1', read, f({ 'b.md': 'b1', 'c.md': 'a1', '_trash/a.md': 'a1' }), look())).toEqual(at('refused', 'a.md'));
    // (written from a version before the one read: the one read put in _trash/)
    expect(placeOf('a.md', 'a0', read, f({ 'a.md': 'n1', 'b.md': 'b1', '_trash/a.md': 'a1' }), look())).toEqual(at('refused', 'a.md'));
    // (the trash of another file, of the same text: not this one's)
    expect(placeOf('a.md', 'a1', f({ 'a.md': 'a1', '_trash/x.md': 'a1' }), f({ 'a.md': 'a2', '_trash/x.md': 'a1' }), look())).toEqual(at('both', 'a.md'));
    // a file this device made, and another file made at its path elsewhere
    expect(placeOf('new.md', '', read, f({ 'a.md': 'a1', 'b.md': 'b1', 'new.md': 'x1' }), look())).toEqual(at('refused', 'new.md'));
    // (gone when it was read, there again now)
    expect(placeOf('z.md', 'z0', read, f({ 'a.md': 'a1', 'b.md': 'b1', 'z.md': 'z1' }), look())).toEqual(at('refused', 'z.md'));
    // (another file moved to its path, its own gone)
    expect(placeOf('01.md', 'one', f({ '01.md': 'one', '02.md': 'two' }), f({ '01.md': 'two' }), look())).toEqual(at('refused', '01.md'));
    expect(placeOf('01.md', 'one', f({ '01.md': 'one', '02.md': 'two', '03.md': 'two' }), f({ '01.md': 'two', '02.md': 'two' }), look())).toEqual(
      at('refused', '01.md'),
    );
  });
  // FR-TOC-04, FR-NOTE-05: renamed by the heading elsewhere (moved too): the text goes there, under the new heading;
  // a new file made under its old name is not it
  test('placeOf: only the heading changed there: heading, where it is now; an empty text tells nothing; two such: none', () => {
    const texts = { b: '# 第1話 はじまり\n\n本文\n', r: '# 第1話 朝\n\n本文\n', n: '# 第1話 はじまり\n\n新しい\n', e: '# 空\n\n', e2: '# 空2\n\n' };
    expect(placeOf('ch/01.md', 'b', f({ 'ch/01.md': 'b' }), f({ 'ch/01.md': 'r' }), look(texts))).toEqual(at('heading', 'ch/01.md'));
    expect(placeOf('ch/01.md', 'b', f({ 'ch/01.md': 'b' }), f({ 'ch/02.md': 'r' }), look(texts))).toEqual(at('heading', 'ch/02.md'));
    // (another file come, its text not read: not it)
    expect(placeOf('ch/01.md', 'b', f({ 'ch/01.md': 'b' }), f({ 'ch/02.md': 'r', 'ch/05.md': 'unread' }), look(texts))).toEqual(at('heading', 'ch/02.md'));
    // (renamed and moved; a new one under its old name at its path: not that one)
    expect(placeOf('ch/01.md', 'b', f({ 'ch/01.md': 'b' }), f({ 'ch/01.md': 'n', 'ch/02.md': 'r' }), look(texts))).toEqual(at('heading', 'ch/02.md'));
    // (another file of the same text, not changed: not it)
    const copy = { ...texts, c: '# 写し\n\n本文\n' };
    expect(placeOf('ch/01.md', 'b', f({ 'ch/01.md': 'b', 'ch/09.md': 'c' }), f({ 'ch/01.md': 'r', 'ch/09.md': 'c' }), look(copy))).toEqual(
      at('heading', 'ch/01.md'),
    );
    // (two of the same text under other headings, one here: not told apart, though the one here is called as it was by its
    // file name)
    const two = { b: '# W\n\n本文\n', r: '# X\n\n本文\n', r2: '# Y\n\n本文\n' };
    expect(placeOf('ch/01_a.md', 'b', f({ 'ch/01_a.md': 'b' }), f({ 'ch/01_a.md': 'r', 'ch/02_b.md': 'r2' }), look(two, F))).toEqual(
      at('refused', 'ch/01_a.md'),
    );
    // (other line ends there)
    const crlf = { ...texts, r: '# 第1話 朝\r\n\r\n本文\r\n' };
    expect(placeOf('ch/01.md', 'b', f({ 'ch/01.md': 'b' }), f({ 'ch/01.md': 'r' }), look(crlf))).toEqual(at('heading', 'ch/01.md'));
    // (a heading only: nothing to tell it by; called otherwise now, refused)
    expect(placeOf('ch/01.md', 'e', f({ 'ch/01.md': 'e' }), f({ 'ch/01.md': 'e2' }), look(texts))).toEqual(at('refused', 'ch/01.md'));
    // (the same text under two headings now, here and come elsewhere: not told apart)
    expect(placeOf('ch/01.md', 'b', f({ 'ch/01.md': 'b' }), f({ 'ch/01.md': 'r', 'ch/02.md': 'r2' }), look({ ...texts, r2: '# 写し\n\n本文\n' }))).toEqual(
      at('refused', 'ch/01.md'),
    );
    // (in _trash/ with another heading: not it)
    expect(placeOf('ch/01.md', 'b', f({ 'ch/01.md': 'b' }), f({ '_trash/ch/01.md': 'r' }), look(texts))).toEqual(at('refused', 'ch/01.md'));
  });
  // FR-TOC-04: moved and changed at once elsewhere (two episodes swapped and written in one commit): no blob tells it,
  // the name does; another file called otherwise there now is not it
  test('placeOf: moved and changed at once: the one file come elsewhere called as it was; none, or another file there: refused', () => {
    const read = f({ 'ch/01.md': 'one', 'ch/02.md': 'two' });
    const texts = { one: '# 一\n\nA\n', two: '# 二\n\nB\n', one2: '# 一\n\nA2\n', two2: '# 二\n\nB2\n', three: '# 三\n\nC\n' };
    expect(placeOf('ch/01.md', 'one', read, f({ 'ch/01.md': 'two2', 'ch/02.md': 'one2' }), look(texts))).toEqual(at('both', 'ch/02.md'));
    expect(placeOf('ch/01.md', 'one', read, f({ 'ch/01.md': 'three', 'ch/02.md': 'two' }), look(texts))).toEqual(at('refused', 'ch/01.md'));
    expect(
      placeOf('ch/01.md', 'one', read, f({ 'ch/01.md': 'three', 'ch/02.md': 'two', 'ch/05.md': 'four' }), look({ ...texts, four: '# 四\n\nD\n' })),
    ).toEqual(at('refused', 'ch/01.md'));
    // (another file moved to its path, though called as it was)
    const same = { ...texts, two: '# 一\n\nB\n' };
    expect(placeOf('ch/01.md', 'one', read, f({ 'ch/01.md': 'two' }), look(same))).toEqual(at('refused', 'ch/01.md'));
    // (two come elsewhere called as it was: not told apart)
    expect(
      placeOf('ch/01.md', 'one', read, f({ 'ch/02.md': 'two', 'ch/03.md': 'one2', 'ch/04.md': 'one3' }), look({ ...texts, one3: '# 一\n\nA3\n' })),
    ).toEqual(at('refused', 'ch/01.md'));
    // (gone, and nothing called as it was: its text not read)
    expect(placeOf('ch/01.md', 'one', read, f({ 'ch/02.md': 'two', 'ch/03.md': 'one2' }), look())).toEqual(at('refused', 'ch/01.md'));
    // (the text written from not read, the one read is: named by it)
    expect(placeOf('ch/01.md', 'one0', read, f({ 'ch/02.md': 'two', 'ch/03.md': 'one2' }), look(texts))).toEqual(at('both', 'ch/03.md'));
  });
  test('underHeading: what was written under the heading given there; renamed here too, its own', () => {
    const base = '# 第1話 はじまり\n\n本文\n';
    expect(underHeading(base, '# 第1話 はじまり\n\n本文と続き\n', '# 第1話 朝\n\n本文\n')).toBe('# 第1話 朝\n\n本文と続き\n');
    expect(underHeading(base, '# 第1話 夜\n\n本文と続き\n', '# 第1話 朝\n\n本文\n')).toBe('# 第1話 夜\n\n本文と続き\n');
    // (no heading in what was written, nor then: the text under the one given there)
    expect(underHeading('本文\n', '本文と続き\n', '# 題\n本文\n')).toBe('# 題\n本文と続き\n');
    // (a # not at the start is no heading)
    expect(underHeading('本文 #1\n', '本文 #1 続き\n', '# 題\n本文 #1\n')).toBe('# 題\n本文 #1 続き\n');
  });
  test('layoutOf and extOf: novel.toml, or none; a file’s extension, or none', () => {
    expect(layoutOf(null)).toEqual(firstLayout());
    expect(layoutOf('[manuscript]\ndir = "ch"\n').dir).toBe('ch');
    expect([extOf('ch/01.md'), extOf('ch.d/README'), extOf('a.tar.gz')]).toEqual(['.md', '', '.gz']);
  });
  // FR-TOC-04, FR-NOTE-05: what tells one file from another at a path: an episode's title, a note's heading
  test('nameOf: an episode by its title (heading, [titles], file name); anything else by its heading, else its path', () => {
    const heading = parseLayout('[manuscript]\ndir = "ch"\ntitle = "heading"\n').layout;
    const titles = parseLayout('[manuscript]\ndir = "ch"\nnaming = "number"\n[titles]\n"01.md" = "一の話"\n').layout;
    expect(nameOf(heading, 'ch/01.md', '# 第1話 はじまり\n\n本文\n')).toBe('はじまり');
    expect(nameOf(titles, 'ch/01.md', '本文\n')).toBe('一の話');
    expect(nameOf(titles, 'ch/01_first.md', '本文\n')).toBe('first');
    expect(nameOf(heading, 'notes/a.md', '# アリス\n')).toBe('アリス');
    expect(nameOf(heading, 'notes/a.md', 'メモ\n')).toBe('notes/a.md');
  });
  test('sendPlan: where and how each draft goes, the mode its file keeps, and the blob there; two going to one file', () => {
    const d = (path, base) => ({ repo: 'o/r', path, base, text: 't', at: 0 });
    const read = { 'a.md': { sha: 's1', mode: '100644' }, 'b.md': { sha: 's2', mode: '100755' }, 'c.md': { sha: 's3', mode: '100644' } };
    const blobs = { 'a.md': { sha: 's1', mode: '100644' }, 'b.md': { sha: 's9', mode: '100755' }, 'm.md': { sha: 's3', mode: '100755' } };
    expect(sendPlan([d('a.md', 's1'), d('b.md', 's2'), d('c.md', 's3'), d('n.md', ''), d('z.md', 'sz')], blobs, read, look())).toEqual([
      { draft: d('a.md', 's1'), how: 'mine', to: 'a.md', mode: '100644', theirs: 's1' },
      { draft: d('b.md', 's2'), how: 'both', to: 'b.md', mode: '100755', theirs: 's9' },
      { draft: d('c.md', 's3'), how: 'mine', to: 'm.md', mode: '100755', theirs: 's3' },
      { draft: d('n.md', ''), how: 'mine', to: 'n.md', mode: '100644', theirs: '' },
      { draft: d('z.md', 'sz'), how: 'refused', to: 'z.md', mode: '100644', theirs: '' },
    ]);
    // (two texts going to one file: the one moved there refused; a text refused there takes nothing)
    const swapped = { 'a.md': { sha: 's3', mode: '100644' }, 'c.md': { sha: 's1', mode: '100644' } };
    const moving = { 'a.md': { sha: 's1', mode: '100644' }, 'c.md': { sha: 's3', mode: '100644' } };
    expect(sendPlan([d('a.md', 's3'), d('c.md', 's3')], swapped, moving, look()).map(p => [p.how, p.to])).toEqual([
      ['mine', 'a.md'],
      ['refused', 'c.md'],
    ]);
    expect(sendPlan([d('b.md', 's2'), d('c.md', 's3')], { 'b.md': { sha: 's3', mode: '100644' } }, read, look()).map(p => [p.how, p.to])).toEqual([
      ['refused', 'b.md'],
      ['mine', 'b.md'],
    ]);
  });
});
