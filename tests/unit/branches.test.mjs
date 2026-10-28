import { test, expect } from 'vitest';
import {
  branchNameError,
  commitDate,
  mergedSaid,
  mergeFailure,
  mergeLines,
  mergeMessage,
  mergeSides,
  mergeTarget,
  onlyThat,
  switchedSaid,
  switchPlan,
} from '../../lib/branches.js';

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

// FR-GH-09: the branch chosen: what is not sent goes first, to the branch it was written on
test('switchPlan: none or the same: nothing; written on another branch: only that one; sent first; made when not listed', () => {
  const o = { name: 'b', current: 'main', unsent: 0, other: '', listed: ['main', 'b'] };
  expect(switchPlan({ ...o, name: null })).toBe(null);
  expect(switchPlan({ ...o, name: 'main' })).toBe(null);
  expect(switchPlan({ ...o, unsent: 2, other: 'x' })).toEqual({ name: 'b', refuse: onlyThat('x'), sendFirst: false, create: false });
  expect(switchPlan({ ...o, name: 'x', unsent: 2, other: 'x', listed: ['main'] })).toEqual({ name: 'x', refuse: '', sendFirst: false, create: true });
  expect(switchPlan({ ...o, unsent: 1 })).toEqual({ name: 'b', refuse: '', sendFirst: true, create: false });
  expect(switchPlan(o)).toEqual({ name: 'b', refuse: '', sendFirst: false, create: false });
  expect(switchPlan({ ...o, other: 'x' })).toEqual({ name: 'b', refuse: '', sendFirst: false, create: false });
  expect(onlyThat('x')).toBe('未送信の変更は x で書いたものです。x に切り替えるか、「送る」で送ってから、ほかのブランチに切り替えてください');
});
test('switchedSaid: made and switched to, or switched to', () => {
  expect(switchedSaid('b', true)).toBe('b を作成して切り替えました');
  expect(switchedSaid('b', false)).toBe('b に切り替えました');
});
// FR-GH-09: what a merge brings, said before it is made
test('mergeSides: before, not for a file added or renamed; after, not for one removed', () => {
  expect(mergeSides('modified')).toEqual({ before: true, after: true });
  expect(mergeSides('added')).toEqual({ before: false, after: true });
  expect(mergeSides('renamed')).toEqual({ before: false, after: true });
  expect(mergeSides('removed')).toEqual({ before: true, after: false });
});
test('mergeTarget: main when listed, else the first', () => {
  expect(mergeTarget(['dev', 'main'])).toBe('main');
  expect(mergeTarget(['dev', 'x'])).toBe('dev');
});
test('mergeMessage, mergedSaid, mergeFailure: the commit’s message; merged or nothing to merge; a conflict, not found, else why', () => {
  expect(mergeMessage('dev', 'main')).toBe('dev を main にマージ（Novel Desk から）');
  expect(mergedSaid(true, 'dev', 'main')).toBe('dev を main にマージしました');
  expect(mergedSaid(false, 'dev', 'main')).toBe('main には、もう dev の内容が全部入っています');
  expect(mergeFailure(409, 'x', 'dev', 'main')).toBe(
    'main と dev が競合しているため、自動ではマージできません。GitHub か Working Copy で競合を解消してください',
  );
  expect(mergeFailure(404, 'x', 'dev', 'main')).toBe('main か dev が GitHub に見つかりません');
  expect(mergeFailure(500, 'GitHub のエラー', 'dev', 'main')).toBe('マージできませんでした: GitHub のエラー');
  expect(mergeFailure(null, 'オフライン', 'dev', 'main')).toBe('マージできませんでした: オフライン');
});
