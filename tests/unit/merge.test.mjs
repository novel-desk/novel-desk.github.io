import { describe, test, expect } from 'vitest';
import { keptBoth, onTopOf, sendPlan, OTHER_DEVICE_MARK, CONFLICT_MARK } from '../../lib/merge.js';

describe('merge', () => {
  // FR-SAVE-05
  test('the mark of both versions starts with the mark the screen looks for', () => {
    expect(OTHER_DEVICE_MARK.startsWith(CONFLICT_MARK)).toBe(true);
    // (the server version's mark, which the screen looks for in texts it wrote too)
    expect(CONFLICT_MARK).toBe('――― ここから、ほかの');
  });
  // FR-SAVE-04, FR-SAVE-06
  test('keptBoth: mine first, the mark, theirs; the same text (other line ends too) is no conflict', () => {
    expect(keptBoth('私の版\n\n', 'ほかの版\n')).toEqual({ text: `私の版\n\n${OTHER_DEVICE_MARK}\n\nほかの版\n`, both: true });
    expect(keptBoth('同じ\n二行', '同じ\r\n二行')).toEqual({ text: '同じ\n二行', both: false });
    expect(keptBoth('同じ\r\n二行', '同じ\n二行')).toEqual({ text: '同じ\r\n二行', both: false });
  });
  test('onTopOf: mine when the file is still the blob written from, or gone; both when it changed', () => {
    expect(onTopOf('a1', 'a1')).toBe('mine');
    expect(onTopOf('a1', undefined)).toBe('mine');
    expect(onTopOf('a1', 'b2')).toBe('both');
  });
  test('sendPlan: what each draft does, the mode its file keeps, and the blob there', () => {
    const d = (path, base) => ({ repo: 'o/r', path, base, text: 't', at: 0 });
    const blobs = { 'a.md': { sha: 's1', mode: '100644' }, 'b.md': { sha: 's9', mode: '100755' } };
    expect(sendPlan([d('a.md', 's1'), d('b.md', 's2'), d('c.md', 's3')], blobs)).toEqual([
      { draft: d('a.md', 's1'), how: 'mine', mode: '100644', theirs: 's1' },
      { draft: d('b.md', 's2'), how: 'both', mode: '100755', theirs: 's9' },
      { draft: d('c.md', 's3'), how: 'mine', mode: '100644', theirs: '' },
    ]);
  });
});
