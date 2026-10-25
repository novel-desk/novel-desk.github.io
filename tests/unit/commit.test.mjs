import { describe, test, expect } from 'vitest';
import { japanDay, charsDelta, changePart, commitSubject, kindsOf, changeParts } from '../../lib/commit.js';
import { firstLayout } from '../../lib/layout.js';

describe('commit message', () => {
  test('japanDay: the day in Japan, whatever the time zone', () => {
    expect(japanDay(Date.parse('2026-10-23T15:00:00Z'))).toBe('10/24');
    expect(japanDay(Date.parse('2026-10-23T14:59:59Z'))).toBe('10/23');
    expect(japanDay(Date.parse('2026-01-05T00:00:00Z'))).toBe('1/5');
  });
  test('charsDelta: ＋ and − with the count, nothing when the same', () => {
    expect(charsDelta(10, 330)).toBe(' ＋320字');
    expect(charsDelta(30, 18)).toBe(' −12字');
    expect(charsDelta(5, 5)).toBe('');
  });
  test('changePart: the title with the change of length (not counting spaces); （書き換え） when it is the same', () => {
    expect(changePart({ title: 'はじまり', before: 'あ', after: 'あいう' })).toBe('はじまり ＋2字');
    expect(changePart({ title: '駅で', before: 'あいう', after: 'あ' })).toBe('駅で −2字');
    expect(changePart({ title: '夜', before: 'あい', after: 'いあ\n' })).toBe('夜（書き換え）');
  });
  test('commitSubject: the day and the changes; 整理 for none; four at most; the same twice in a row said once', () => {
    expect(commitSubject('10/24', ['a ＋1字'])).toBe('10/24 a ＋1字');
    expect(commitSubject('10/24', ['a', 'b', 'c', 'd'])).toBe('10/24 a、b、c、d');
    expect(commitSubject('10/24', ['a', 'b', 'c', 'd', 'e'])).toBe('10/24 a、b、c ほか 2 件');
    expect(commitSubject('10/24', ['a', 'a', 'b'])).toBe('10/24 a、b');
    expect(commitSubject('10/24', [])).toBe('10/24 整理');
  });
  test('kindsOf: a file put where another moved from is a move; the file gone with it is not said again; in the order of paths', () => {
    const c = (path, over) => ({ repo: 'o/r', path, base: 'x', at: 0, ...over });
    expect(
      kindsOf([
        c('b.md', { gone: true }),
        c('z.md', { base: '', sha: 's', from: { path: 'b.md', base: 'x' } }),
        c('a.md', { text: 't' }),
        c('n.md', { base: '', text: '' }),
        c('d.md', { gone: true }),
        c('e.md', { text: 't', from: { path: 'e.md', base: 'x' } }),
        // (a file an operation made, moved before it was sent: added)
        c('m.md', { base: '', text: '', from: { path: 'k.md', base: '' } }),
      ]),
    ).toEqual([
      { kind: 'M', path: 'a.md', to: '' },
      { kind: 'R', path: 'b.md', to: 'z.md' },
      { kind: 'D', path: 'd.md', to: '' },
      { kind: 'M', path: 'e.md', to: '' },
      { kind: 'A', path: 'm.md', to: '' },
      { kind: 'A', path: 'n.md', to: '' },
    ]);
  });
  // FR-GH-06: what was written, added, deleted, renamed, as the server version's commit message says it
  test('changeParts: new episodes, deleted, renamed, reordered, written; a new novel.toml first; the rest not said', () => {
    const was = { layout: { ...firstLayout(), titles: { '03.md': '三' } }, headings: {} };
    const now = { layout: { ...firstLayout(), titles: { '04.md': '三' } }, headings: {} };
    const l = (kind, path, to, before, after) => ({ kind, path, to, before, after });
    expect(
      changeParts(
        [
          l('A', '05_新しい話.md', '', '', 'あい'),
          l('A', '06_空.md', '', '', ''),
          l('A', '_trash/x_1_a.md', '', '', 'a'),
          l('D', '01_a.md', '', 'a', ''),
          l('R', '02_b.md', '_trash/S_2_b.md', 'b', 'b'),
          l('R', 'img.png', '_trash/img.png', '', ''),
          l('R', '07_旧.md', '07_新.md', 'あ', 'あい'),
          l('R', '08_c.md', '09_c.md', 'あ', 'い'),
          l('R', '10_d.md', '11_d.md', 'あ', 'あい'),
          l('R', '03.md', '04.md', '', ''),
          l('M', '12_e.md', '', 'あ', 'あいう'),
          l('M', 'memo.txt', '', '', 'x'),
          l('A', 'novel.toml', '', '', ''),
          l('A', 'notes/images/a.png', '', '', ''),
          l('D', 'memo.txt', '', '', ''),
          l('R', 'a.png', 'b.png', '', ''),
        ],
        was,
        now,
      ),
    ).toEqual([
      '構成を novel.toml に',
      '新しい話（新しい話、2字）',
      '空（新しい話）',
      'a（削除）',
      'b（削除）',
      'img.png（削除）',
      '旧→新（タイトル） ＋1字',
      'c（並べ替え）',
      'd ＋1字',
      '三（並べ替え）',
      'e ＋2字',
    ]);
  });
});
