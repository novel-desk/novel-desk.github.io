import { describe, test, expect } from 'vitest';
import { esc, charsOf, n, lineBreaks, moreLabel, newName, rowTimes, when, whenLong } from '../../lib/format.js';

describe('format', () => {
  test('esc: the five characters of HTML, anything made text', () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
    expect(esc(3)).toBe('3');
  });
  test('charsOf: characters without spaces or line ends; one per character, not per UTF-16 unit', () => {
    expect(charsOf('あい う\nえ\t お')).toBe(5);
    expect(charsOf('𠮷野家')).toBe(3);
    expect(charsOf('')).toBe(0);
  });
  test('lineBreaks: a line or paragraph separator made a line break, one character for one; the rest as it was', () => {
    expect(lineBreaks('一\u2028二\u2029三\n四\r\n')).toBe('一\n二\n三\n四\r\n');
    expect(lineBreaks('そのまま')).toBe('そのまま');
  });
  test('n: numbers with commas; nothing is 0', () => {
    expect(n(1234567)).toBe('1,234,567');
    expect(n(undefined)).toBe('0');
  });
  // FR-EDIT-02: 最終更新
  test('when: month/day hours:minutes, the year when it is another; whenLong: how long ago within a day', () => {
    const at = new Date(2026, 9, 8, 4, 5).getTime();
    expect(when(at, at)).toBe('10/8 4:05');
    expect(when(new Date(2025, 11, 1, 9, 5).getTime(), at)).toBe('2025/12/1 9:05');
    expect(when(0)).toBe('');
    expect(when(Date.now())).toMatch(/^\d+\/\d+ \d+:\d\d$/);
    expect(whenLong(at, at + 30000)).toBe('10/8 4:05（たった今）');
    expect(whenLong(at, at + 3 * 60000)).toBe('10/8 4:05（3 分前）');
    expect(whenLong(at, at + 5 * 3600000)).toBe('10/8 4:05（5 時間前）');
    expect(whenLong(at, at + 2 * 86400000)).toBe('10/8 4:05');
    expect(whenLong(null)).toBe('');
    expect(whenLong(Date.now())).toMatch(/たった今/);
  });
  // FR-TOC-01 (the rows' 最終更新, as the server version's)
  test('rowTimes: a row says its time only where it tells it from the others', () => {
    const now = new Date(2026, 9, 25).getTime();
    const [a, b] = [new Date(2026, 9, 1, 9, 1).getTime(), new Date(2026, 9, 3, 12, 30).getTime()];
    expect(rowTimes({ x: a, y: a, z: b }, now)).toEqual({ x: '', y: '', z: '10/3 12:30' });
    expect(rowTimes({ x: a, y: b }, now)).toEqual({ x: '10/1 9:01', y: '10/3 12:30' });
    // not known yet: nothing said; the ones known that share a time still tell themselves from the rest
    expect(rowTimes({ x: 0, y: 0, z: 0, w: a, v: a }, now)).toEqual({ x: '', y: '', z: '', w: '10/1 9:01', v: '10/1 9:01' });
    expect(rowTimes({}, now)).toEqual({});
    expect(rowTimes({ x: a })).toEqual({ x: when(a) });
  });
});

// FR-PLOT-01, FR-NOTE-07: a box's text cut to three lines, opened whole by its button
test('moreLabel: 閉じる while open, else 続きを表示', () => {
  expect(moreLabel(true)).toBe('閉じる');
  expect(moreLabel(false)).toBe('続きを表示');
});
// FR-EDIT-08, FR-NOTE-05: a new name typed: nothing to change when closed, empty, or the name now
test('newName: trimmed; null when closed, nothing typed, or the same', () => {
  expect(newName('  alice ', 'bob')).toBe('alice');
  expect(newName(null, 'bob')).toBe(null);
  expect(newName('   ', 'bob')).toBe(null);
  expect(newName(' bob ', 'bob')).toBe(null);
});
