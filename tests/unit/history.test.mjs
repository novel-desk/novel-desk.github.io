import { describe, test, expect } from 'vitest';
import { snapshotted, versionsOf, SNAPSHOT_EVERY, SNAPSHOTS_KEPT } from '../../lib/history.js';

describe('history', () => {
  // FR-HIST-04
  test('snapshotted: one version every 10 minutes of writing; none for the same text; forced before a version is put back; the oldest go', () => {
    expect(SNAPSHOT_EVERY).toBe(600000);
    const one = snapshotted([], 'a', 1000);
    expect(one).toEqual([{ at: 1000, text: 'a' }]);
    expect(snapshotted(one, 'ab', 1000 + SNAPSHOT_EVERY - 1)).toBe(one);
    expect(snapshotted(one, 'ab', 1000 + SNAPSHOT_EVERY)).toEqual([...one, { at: 1000 + SNAPSHOT_EVERY, text: 'ab' }]);
    expect(snapshotted(one, 'a', 1000 + 2 * SNAPSHOT_EVERY)).toBe(one);
    expect(snapshotted(one, 'ab', 1001, true)).toEqual([...one, { at: 1001, text: 'ab' }]);
    const full = Array.from({ length: SNAPSHOTS_KEPT }, (_, i) => ({ at: i, text: String(i) }));
    const next = snapshotted(full, 'new', 10 ** 9);
    expect(next.length).toBe(SNAPSHOTS_KEPT);
    expect(next[0].text).toBe('1');
  });
  // FR-HIST-01
  test('versionsOf: the draft first, then the versions of this device and of GitHub, the newest first', () => {
    const commits = [
      { sha: 'c2', commit: { message: '10/2 二\n\n本文', committer: { date: '2026-10-02T00:00:00Z' } } },
      { sha: 'c1', commit: { message: '10/1 一', committer: { date: 'bad' } } },
    ];
    const at = Date.parse('2026-10-01T12:00:00Z');
    expect(versionsOf({ draft: { text: 'd', at: 9e12 }, snapshots: [{ at, text: 's' }], commits })).toEqual([
      { kind: 'here', at: 9e12, subject: '', text: 'd', ref: '' },
      { kind: 'github', at: Date.parse('2026-10-02T00:00:00Z'), subject: '10/2 二', text: null, ref: 'c2' },
      { kind: 'snapshot', at, subject: '', text: 's', ref: '' },
      { kind: 'github', at: 0, subject: '10/1 一', text: null, ref: 'c1' },
    ]);
    expect(versionsOf({ draft: null, snapshots: [], commits: [] })).toEqual([]);
  });
});
