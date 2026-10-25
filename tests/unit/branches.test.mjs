import { test, expect } from 'vitest';
import { branchNameError, commitDate, mergeLines } from '../../lib/branches.js';

// FR-GH-09
test('branchNameError: a name git takes; empty, spaces, .., a dot or / at either end, .lock refused', () => {
  expect(branchNameError('draft/第2稿')).toBe('');
  expect(branchNameError('')).toBe('ブランチの名前を入れてください');
  for (const bad of ['a b', 'a..b', '-a', '/a', 'a/', 'a.', 'a.lock', 'a~1', 'a:b', '@', 'a@{1}', 'a//b', 'a/.b', 'a\\b'])
    expect(branchNameError(bad)).toMatch(/使えない文字/);
});
// FR-GH-09: as the server version's merge preview
test('mergeLines: what is not sent, the commits (8 at most), the episodes changed with their lengths (12 at most), how many other files', () => {
  const commits = Array.from({ length: 10 }, (_, i) => ({ date: `10/0${i % 9} 04:20`, subject: `${i + 1}` }));
  const episodes = [
    { title: '01話', before: null, after: 1200 },
    { title: '02話', before: 300, after: null },
    { title: '03話', before: 1000, after: 1234 },
    { title: '04話', before: 1500, after: 1000 },
    { title: '05話', before: 10, after: 10 },
    ...Array.from({ length: 10 }, (_, i) => ({ title: `1${i}話`, before: 1, after: 2 })),
  ];
  const lines = mergeLines({ from: 'draft', into: 'main', unsent: true, commits, episodes, others: 2 });
  expect(lines.slice(0, 4)).toEqual(['draft → main', '（まだ送っていない変更も、先に送ってから入れます）', 'commit 10 件:', '・10/00 04:20 1']);
  expect(lines).toContain('・ほか 2 件');
  expect(lines).toContain('話の変化:');
  expect(lines).toContain('・01話 新しい話（1,200 字）');
  expect(lines).toContain('・02話 削除');
  expect(lines).toContain('・03話 ＋234 字');
  expect(lines).toContain('・04話 −500 字');
  expect(lines).toContain('・05話 ＋0 字');
  expect(lines).toContain('・ほか 3 話');
  expect(lines[lines.length - 1]).toBe('話以外のファイル 2 件');
  expect(mergeLines({ from: 'a', into: 'b', unsent: false, commits: [], episodes: [], others: 0 })).toEqual(['a → b', 'commit 0 件:']);
});
test("commitDate: month/day hours:minutes in the author's time, two digits each", () => {
  expect(commitDate('2026-10-07T19:05:00Z')).toBe('10/08 04:05');
  expect(commitDate('2026-01-31T23:59:00+09:00')).toBe('01/31 23:59');
});
