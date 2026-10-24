import { describe, test, expect } from 'vitest';
import { groupNotes } from '../../lib/notelist.js';

const f = (path, title) => ({ path, name: path.split('/').pop(), updated: 1, ...(title ? { title } : {}) });

describe('notelist', () => {
  // FR-NOTE-01 FR-NOTE-11: the ones used most on top, then by folder (the top folder first, then by name); a row says
  // the title, or the path in the notes' folder (on top) or the file name (in a folder)
  test('groupNotes: on top, then by folder', () => {
    const { pinned, folders } = groupNotes(
      [
        f('notes/b/x.md', 'エックス'),
        f('notes/03_settings.md', '設定'),
        f('notes/memo.md'),
        f('notes/キャラ/rei.md'),
        f('notes/a/y.md'),
        f('notes/a/z.md'),
        f('notes/story.md'),
      ],
      'notes',
      'notes/story.md',
    );
    expect(pinned.map(r => r.label)).toEqual(['設定', 'story.md']);
    expect(folders.map(g => g.folder)).toEqual(['', 'a', 'b', 'キャラ']);
    expect(folders.map(g => g.rows.map(r => r.label))).toEqual([['memo.md'], ['y.md', 'z.md'], ['エックス'], ['rei.md']]);
    expect(groupNotes([], 'notes', undefined)).toEqual({ pinned: [], folders: [] });
  });
});
