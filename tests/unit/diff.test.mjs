import { describe, test, expect } from 'vitest';
import { diffOps, diffLine, diffHtml } from '../../lib/diff.js';

// From the server version's tests/unit/diff.test.mjs (FR-HIST-02)

describe('diff', () => {
  test('diffOps: the steps from one list to another; the common start and end kept', () => {
    expect(diffOps(['a', 'b', 'c'], ['a', 'x', 'c'])).toEqual([
      ['=', 'a'],
      ['-', 'b'],
      ['+', 'x'],
      ['=', 'c'],
    ]);
    expect(diffOps([], ['a'])).toEqual([['+', 'a']]);
    expect(diffOps(['a'], [])).toEqual([['-', 'a']]);
    expect(diffOps(['a', 'b'], ['b', 'a'])).toEqual([
      ['-', 'a'],
      ['=', 'b'],
      ['+', 'a'],
    ]);
  });
  test('diffOps: too large to compare by every pair: the middle as removed and added', () => {
    const big = n => Array.from({ length: n }, (_, i) => 'l' + i);
    // (the first line is the same, the rest is compared as removed and added)
    expect(
      diffOps(
        big(2100),
        big(2100).map((x, i) => (i % 2 ? x + '!' : x)),
      ).length,
    ).toBe(1 + 2099 * 2);
  });
  test('diffLine: the characters removed and added inside one line, runs joined', () => {
    expect(diffLine('あいうえお', 'あいXえおか')).toBe('あい<del>う</del><ins>X</ins>えお<ins>か</ins>');
    expect(diffLine('<a>', '<b>')).toBe('&lt;<del>a</del><ins>b</ins>&gt;');
  });
  test('diffHtml: the changed places with a line around each, and their number', () => {
    // far apart: two places with a gap between them; empty lines changed
    const gap = diffHtml(['一', '二', '三', '四', '五', '六', '七', '八'].join('\n'), ['一', '弐', '三', '四', '五', '六', '', '八', ''].join('\n'));
    expect(gap[1]).toBe(3);
    expect(gap[0]).toMatch(/diff-gap/);
    expect(gap[0]).toMatch(/（空行）|&nbsp;/);
    // lines removed and added with nothing in common; an empty line removed and added
    const apart = diffHtml('abc\n\nxyz', 'qrs\nxyz\n\n');
    expect(apart[0]).toMatch(/diff-del/);
    expect(apart[0]).toMatch(/diff-add/);
    expect(diffHtml('同じ', '同じ')).toEqual(['', 0]);
    expect(diffHtml('', 'a')[1]).toBe(1);
    expect(diffHtml('あいうえおかきくけこ', 'あいうえおXきくけこ')[0]).toMatch(/<p class="diff-chg">あいうえお<del>か<\/del><ins>X<\/ins>きくけこ<\/p>/);
    // the same last lines; an empty line kept beside a change
    expect(diffHtml('a\nx\nz', 'a\ny\nz')[1]).toBe(1);
    expect(diffHtml('\nb', '\nc')[0]).toMatch(/<p>&nbsp;<\/p>/);
  });
});
