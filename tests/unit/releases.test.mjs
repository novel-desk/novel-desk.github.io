import { test, expect } from 'vitest';
import { nextTag, pathOrder, releaseLabel, releasesOf } from '../../lib/releases.js';

// FR-REL-01, FR-REL-02
test('releaseLabel: trimmed, no control characters, 80 at most; nothing left is none', () => {
  expect(releaseLabel('  第一稿\u0007 ')).toBe('第一稿');
  expect([...(releaseLabel('あ'.repeat(90)) ?? '')].length).toBe(80);
  expect(releaseLabel(' \n ')).toBeNull();
});
test('nextTag: one more than the largest v and a number', () => {
  expect(nextTag([])).toBe('v1');
  expect(nextTag(['v2', 'v10', 'x', 'v3a'])).toBe('v11');
});
test('releasesOf: the releases of a tag v and a number, the newest first, their name or tag', () => {
  expect(
    releasesOf([
      { tag_name: 'v1', name: '第一稿', created_at: '2026-10-01T00:00:00Z' },
      { tag_name: 'draft', name: 'x', created_at: '2026-10-03T00:00:00Z' },
      { tag_name: 'v2', name: null, created_at: '2026-10-02T00:00:00Z' },
    ]),
  ).toEqual([
    { tag: 'v2', label: 'v2', date: '2026-10-02T00:00:00Z' },
    { tag: 'v1', label: '第一稿', date: '2026-10-01T00:00:00Z' },
  ]);
});
test('pathOrder: part by part, numbers as numbers; a folder before what is in it', () => {
  expect(['ms/10_b.md', 'ms/2_a/01.md', 'ms/2_a', 'ms/1.md'].sort(pathOrder)).toEqual(['ms/1.md', 'ms/2_a', 'ms/2_a/01.md', 'ms/10_b.md']);
});
