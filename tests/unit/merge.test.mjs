import { describe, test, expect } from 'vitest';
import { calledOtherwise, keptBoth, nameOf, onTopOf, sendPlan, OTHER_DEVICE_MARK, CONFLICT_MARK } from '../../lib/merge.js';
import { parseLayout } from '../../lib/layout.js';

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
  // FR-SAVE-04, FR-SAVE-06: the same file, changed there or not
  const f = (/** @type {Record<string, string>} */ paths) => Object.fromEntries(Object.entries(paths).map(([p, sha]) => [p, { sha, mode: '100644' }]));
  test('onTopOf: mine when the file is still the blob written from (a file made here: still not there); both when the same file changed there', () => {
    const read = f({ 'a.md': 'a1', 'b.md': 'b1' });
    expect(onTopOf('a.md', 'a1', read, read)).toBe('mine');
    expect(onTopOf('new.md', '', read, read)).toBe('mine');
    expect(onTopOf('a.md', 'a1', read, f({ 'a.md': 'a2', 'b.md': 'b1' }))).toBe('both');
    // (written from a version before the one read: the one read changed there again)
    expect(onTopOf('a.md', 'a0', read, read)).toBe('both');
    expect(onTopOf('a.md', 'a0', read, f({ 'a.md': 'a2', 'b.md': 'b1' }))).toBe('both');
    // (another file with the same text as the one written, not moved: the file written is still here)
    const twins = f({ 'a.md': 'e', 'b.md': 'e' });
    expect(onTopOf('a.md', 'e', twins, f({ 'a.md': 'a2', 'b.md': 'e' }))).toBe('both');
    // (another file changed too: not a move)
    expect(onTopOf('a.md', 'a1', read, f({ 'a.md': 'a2', 'b.md': 'b2' }))).toBe('both');
    // (changed into the text of another file, which is still there: not a move)
    expect(onTopOf('a.md', 'a1', f({ 'a.md': 'a1', 'b.md': 'x' }), f({ 'a.md': 'x', 'b.md': 'x' }))).toBe('both');
  });
  // FR-TOC-06, FR-NOTE-06: deleted or put in _trash/ elsewhere: not put back
  test('onTopOf: refused when the file is gone, or moved away (to _trash/ or another path)', () => {
    const read = f({ 'a.md': 'a1', 'b.md': 'b1' });
    expect(onTopOf('a.md', 'a1', read, f({ 'b.md': 'b1' }))).toBe('refused');
    expect(onTopOf('a.md', 'a1', read, f({ 'b.md': 'b1', '_trash/a.md': 'a1' }))).toBe('refused');
    // (deleted, and a new file made at its path: refused, never written into the new one)
    expect(onTopOf('a.md', 'a1', read, f({ 'a.md': 'n1', 'b.md': 'b1', '_trash/a.md': 'a1' }))).toBe('refused');
    // (written from a version before the one read: the one read moved away)
    expect(onTopOf('a.md', 'a0', read, f({ 'a.md': 'n1', 'b.md': 'b1', '_trash/a.md': 'a1' }))).toBe('refused');
    // a file this device made, and another file made at its path elsewhere
    expect(onTopOf('new.md', '', read, f({ 'a.md': 'a1', 'b.md': 'b1', 'new.md': 'x1' }))).toBe('refused');
    // (gone when it was read, there again now)
    expect(onTopOf('z.md', 'z0', read, f({ 'a.md': 'a1', 'b.md': 'b1', 'z.md': 'z1' }))).toBe('refused');
  });
  // FR-TOC-04, FR-NOTE-05: renumbered or renamed elsewhere (names that are numbers only): never written into the file
  // that took its path
  test('onTopOf: refused when another file moved to its path', () => {
    const read = f({ '01.md': 'one', '02.md': 'two' });
    const swapped = f({ '01.md': 'two', '02.md': 'one' });
    expect(onTopOf('01.md', 'one', read, swapped)).toBe('refused');
    expect(onTopOf('02.md', 'two', read, swapped)).toBe('refused');
    // (the other one changed too, and came here: it left its path)
    expect(onTopOf('01.md', 'one', read, f({ '01.md': 'two', '03.md': 'one2' }))).toBe('refused');
    // (a file read here and at another path, the other one left: it came from there)
    expect(onTopOf('01.md', 'one', f({ '01.md': 'one', '02.md': 'two', '03.md': 'two' }), f({ '01.md': 'two', '02.md': 'two' }))).toBe('refused');
  });
  // (moved and changed at once elsewhere: no blob tells it, the name does)
  test('onTopOf: refused when the file there is called otherwise now, though no blob moved', () => {
    const read = f({ '01.md': 'one', '02.md': 'two' });
    const both = f({ '01.md': 'two2', '02.md': 'one2' });
    expect(onTopOf('01.md', 'one', read, both)).toBe('both');
    expect(onTopOf('01.md', 'one', read, both, true)).toBe('refused');
    // (still the blob written from: whatever it is called)
    expect(onTopOf('01.md', 'one', read, read, true)).toBe('mine');
  });
  // FR-TOC-04, FR-NOTE-05: what tells one file from another at a path: an episode's title, a note's heading
  test('nameOf: an episode by its title (heading, [titles], file name); anything else by its heading, else its path', () => {
    const heading = parseLayout('[manuscript]\ndir = "ch"\ntitle = "heading"\n').layout;
    const titles = parseLayout('[manuscript]\ndir = "ch"\nnaming = "number"\n[titles]\n"01.md" = "一の話"\n').layout;
    expect(nameOf(heading, 'ch/01.md', '# 第1話 はじまり\n\n本文\n')).toBe('はじまり');
    expect(nameOf(titles, 'ch/01.md', '本文\n')).toBe('一の話');
    expect(nameOf(titles, 'ch/01_first.md', '本文\n')).toBe('first');
    expect(nameOf(heading, 'notes/a.md', '# アリス\n')).toBe('アリス');
    expect(nameOf(heading, 'notes/a.md', 'メモ\n')).toBe('notes/a.md');
  });
  test('calledOtherwise: the name then and the name now differ (novel.toml or the text); a text that cannot be read is not told', () => {
    const one = '[manuscript]\ndir = "ch"\n[titles]\n"01.md" = "一の話"\n';
    const two = '[manuscript]\ndir = "ch"\n[titles]\n"01.md" = "二の話"\n';
    expect(calledOtherwise('ch/01.md', { config: one, text: 'a' }, { config: one, text: 'b' })).toBe(false);
    expect(calledOtherwise('ch/01.md', { config: one, text: 'a' }, { config: two, text: 'a' })).toBe(true);
    expect(calledOtherwise('ch/01.md', { config: two, text: 'a' }, { config: one, text: 'a' })).toBe(true);
    expect(calledOtherwise('n.md', { config: null, text: '# A\n' }, { config: null, text: '# B\n' })).toBe(true);
    expect(calledOtherwise('n.md', { config: null, text: '# A\n' }, { config: null, text: '# A\n\nmore' })).toBe(false);
    // (no novel.toml then, one now: the episode named by its file then, by [titles] now)
    expect(calledOtherwise('ch/01.md', { config: null, text: 'a' }, { config: one, text: 'a' })).toBe(true);
    expect(calledOtherwise('ch/01.md', { config: one, text: 'a' }, { config: null, text: 'a' })).toBe(true);
    expect(calledOtherwise('n.md', { config: null, text: null }, { config: null, text: '# B\n' })).toBe(false);
    expect(calledOtherwise('n.md', { config: null, text: '# A\n' }, { config: null, text: null })).toBe(false);
  });
  test('sendPlan: what each draft does, the mode its file keeps, and the blob there', () => {
    const d = (path, base) => ({ repo: 'o/r', path, base, text: 't', at: 0 });
    const read = { 'a.md': { sha: 's1', mode: '100644' }, 'b.md': { sha: 's2', mode: '100755' }, 'c.md': { sha: 's3', mode: '100644' } };
    const blobs = { 'a.md': { sha: 's1', mode: '100644' }, 'b.md': { sha: 's9', mode: '100755' } };
    expect(sendPlan([d('b.md', 's2')], blobs, read, new Set(['b.md']))).toEqual([{ draft: d('b.md', 's2'), how: 'refused', mode: '100755', theirs: 's9' }]);
    expect(sendPlan([d('a.md', 's1'), d('b.md', 's2'), d('c.md', 's3'), d('n.md', '')], blobs, read)).toEqual([
      { draft: d('a.md', 's1'), how: 'mine', mode: '100644', theirs: 's1' },
      { draft: d('b.md', 's2'), how: 'both', mode: '100755', theirs: 's9' },
      { draft: d('c.md', 's3'), how: 'refused', mode: '100644', theirs: '' },
      { draft: d('n.md', ''), how: 'mine', mode: '100644', theirs: '' },
    ]);
  });
});
