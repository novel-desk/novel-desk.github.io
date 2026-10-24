import { test, expect } from 'vitest';
import { branchNameError, mergeLines } from '../../lib/branches.js';

// FR-GH-09
test('branchNameError: a name git takes; empty, spaces, .., a dot or / at either end, .lock refused', () => {
  expect(branchNameError('draft/第2稿')).toBe('');
  expect(branchNameError('')).toBe('ブランチの名前を入れてください');
  for (const bad of ['a b', 'a..b', '-a', '/a', 'a/', 'a.', 'a.lock', 'a~1', 'a:b', '@', 'a@{1}', 'a//b', 'a/.b', 'a\\b'])
    expect(branchNameError(bad)).toMatch(/使えない文字/);
});
test('mergeLines: the commits (8 at most), the episodes changed (12 at most), how many other files', () => {
  const c = n => ({ commit: { message: `${n}\n\n本文`, committer: { date: '2026-10-0' + (n % 9) + 'T00:00:00Z' } } });
  const f = (filename, status, extra = {}) => ({ filename, status, additions: 2, deletions: 1, ...extra });
  const episode = p => (p.endsWith('.md') ? p.replace('.md', '話') : null);
  const lines = mergeLines({
    from: 'draft',
    into: 'main',
    commits: Array.from({ length: 10 }, (_, i) => c(i + 1)),
    files: [
      f('01.md', 'added'),
      f('02.md', 'removed'),
      f('03.md', 'modified'),
      f('x.png', 'renamed', { previous_filename: 'y.png' }),
      f('05.md', 'renamed', { previous_filename: '04.md' }),
      f('img.png', 'renamed', { previous_filename: '06.md' }),
      f('readme.txt', 'modified'),
      ...Array.from({ length: 10 }, (_, i) => f(`1${i}.md`, 'modified')),
    ],
    episode,
  });
  expect(lines.slice(0, 3)).toEqual(['draft → main', 'commit 10 件:', '・2026-10-01 1']);
  expect(lines).toContain('・ほか 2 件');
  expect(lines).toContain('話の変化:');
  expect(lines).toContain('・01話 新しい話');
  expect(lines).toContain('・02話 削除');
  expect(lines).toContain('・03話 2 行足し、1 行消す');
  expect(lines).toContain('・05話 名前の変更');
  expect(lines).toContain('・06話 名前の変更');
  expect(lines).toContain('・ほか 3 話');
  expect(lines[lines.length - 1]).toBe('話以外のファイル 2 件');
  expect(mergeLines({ from: 'a', into: 'b', commits: [], files: [], episode })).toEqual(['a → b', 'commit 0 件:']);
});
