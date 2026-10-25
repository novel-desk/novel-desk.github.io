import { describe, test, expect } from 'vitest';
import { extOf, keptBoth, layoutOf, nameOf, placeOf, sendPlan, underHeading, OTHER_DEVICE_MARK, CONFLICT_MARK } from '../../lib/merge.js';
import { firstLayout, parseLayout } from '../../lib/layout.js';

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
  // episodes titled by their headings in ch/ (none of the texts known: no file told by its text)
  const L = parseLayout('[manuscript]\ndir = "ch"\ntitle = "heading"\n').layout;
  // episodes titled by their file names in ch/
  const F = parseLayout('[manuscript]\ndir = "ch"\n').layout;
  /** @param {Record<string, string | null>} [texts] @param {any} [layout] */
  const look = (texts = {}, layout = L) => ({ texts, was: layout, now: layout });
  const at = (/** @type {string} */ how, /** @type {string} */ to) => ({ how, to });
  test('placeOf: mine when the file is still the blob written from (a file made here: still not there); both when the same file changed there', () => {
    const read = f({ 'a.md': 'a1', 'b.md': 'b1' });
    expect(placeOf('a.md', 'a1', read, read, look())).toEqual(at('mine', 'a.md'));
    expect(placeOf('new.md', '', read, read, look())).toEqual(at('mine', 'new.md'));
    expect(placeOf('a.md', 'a1', read, f({ 'a.md': 'a2', 'b.md': 'b1' }), look())).toEqual(at('both', 'a.md'));
    // (written from a version before the one read: the one read changed there again)
    expect(placeOf('a.md', 'a0', read, read, look())).toEqual(at('both', 'a.md'));
    expect(placeOf('a.md', 'a0', read, f({ 'a.md': 'a2', 'b.md': 'b1' }), look())).toEqual(at('both', 'a.md'));
    // (another file with the same text as the one written, not moved: the file written is still here)
    const twins = f({ 'a.md': 'e', 'b.md': 'e' });
    expect(placeOf('a.md', 'e', twins, f({ 'a.md': 'a2', 'b.md': 'e' }), look())).toEqual(at('both', 'a.md'));
    // (another file changed too: not a move)
    expect(placeOf('a.md', 'a1', read, f({ 'a.md': 'a2', 'b.md': 'b2' }), look())).toEqual(at('both', 'a.md'));
    // (changed into the text of another file, which is still there: not a move)
    expect(placeOf('a.md', 'a1', f({ 'a.md': 'a1', 'b.md': 'x' }), f({ 'a.md': 'x', 'b.md': 'x' }), look())).toEqual(at('both', 'a.md'));
    // (the same name then and now, both read)
    const named = look({ a1: '# 一\n\nA\n', a2: '# 一\n\nA2\n' });
    expect(placeOf('ch/a.md', 'a1', f({ 'ch/a.md': 'a1' }), f({ 'ch/a.md': 'a2' }), named)).toEqual(at('both', 'ch/a.md'));
    // (not told, its text not read then, or not now: not UTF-8 there)
    expect(placeOf('ch/a.md', 'a1', f({ 'ch/a.md': 'a1' }), f({ 'ch/a.md': 'a3' }), named)).toEqual(at('both', 'ch/a.md'));
    expect(placeOf('ch/a.md', 'a0', f({ 'ch/a.md': 'a9' }), f({ 'ch/a.md': 'a2' }), named)).toEqual(at('both', 'ch/a.md'));
  });
  // FR-TOC-04, FR-NOTE-05: reordered, renumbered or renamed (by the file name) elsewhere: the text goes where the file
  // is now, never into the file that took its path
  test('placeOf: moved elsewhere as it was: where it is now', () => {
    const read = f({ '01.md': 'one', '02.md': 'two' });
    const swapped = f({ '01.md': 'two', '02.md': 'one' });
    expect(placeOf('01.md', 'one', read, swapped, look())).toEqual(at('mine', '02.md'));
    expect(placeOf('02.md', 'two', read, swapped, look())).toEqual(at('mine', '01.md'));
    expect(placeOf('01.md', 'one', read, f({ '02.md': 'two', '05.md': 'one' }), look())).toEqual(at('mine', '05.md'));
    // (written from a version before the one read: the one read moved, and changed there since it was written from)
    expect(placeOf('01.md', 'one0', read, f({ '02.md': 'two', '05.md': 'one' }), look())).toEqual(at('both', '05.md'));
    // (the one written from moved, though another was read)
    expect(placeOf('01.md', 'one0', read, f({ '02.md': 'two', '05.md': 'one0' }), look())).toEqual(at('mine', '05.md'));
    // (renamed by its file name: called otherwise there now, still the one)
    const byName = look({ one: '本文\n' }, F);
    expect(placeOf('ch/01_a.md', 'one', f({ 'ch/01_a.md': 'one' }), f({ 'ch/01_z.md': 'one' }), byName)).toEqual(at('mine', 'ch/01_z.md'));
    // (a file of another kind with its blob: not it)
    expect(placeOf('01.md', 'one', read, f({ '02.md': 'two', '05.txt': 'one' }), look())).toEqual(at('refused', '01.md'));
    // several files with its blob (the same text): the one called as it was, else none
    const twins = f({ 'ch/01_a.md': 'e', 'ch/02_b.md': 'e' });
    const empty = look({ e: '' }, F);
    expect(placeOf('ch/01_a.md', 'e', twins, f({ 'ch/01_b.md': 'e', 'ch/02_a.md': 'e' }), empty)).toEqual(at('mine', 'ch/02_a.md'));
    expect(placeOf('ch/01_a.md', 'e', twins, f({ 'ch/01_c.md': 'e', 'ch/02_d.md': 'e' }), empty)).toEqual(at('refused', 'ch/01_a.md'));
    expect(placeOf('ch/01_a.md', 'e', twins, f({ 'ch/01_c.md': 'e', 'ch/02_d.md': 'e' }), look({}, F))).toEqual(at('refused', 'ch/01_a.md'));
    // (not told apart, though a file called as it was is at its path now: refused)
    expect(
      placeOf('ch/01_a.md', 'e', f({ 'ch/01_a.md': 'e' }), f({ 'ch/01_a.md': 'n', 'ch/02_c.md': 'e', 'ch/03_d.md': 'e' }), look({ e: '', n: 'x' }, F)),
    ).toEqual(at('refused', 'ch/01_a.md'));
  });
  // FR-TOC-06, FR-NOTE-06: deleted or put in _trash/ elsewhere: not put back, nor into a new file made there
  test('placeOf: refused when the file is put in _trash/ or gone; a file made here, and another there now', () => {
    const read = f({ 'a.md': 'a1', 'b.md': 'b1' });
    expect(placeOf('a.md', 'a1', read, f({ 'b.md': 'b1' }), look())).toEqual(at('refused', 'a.md'));
    expect(placeOf('a.md', 'a1', read, f({ 'b.md': 'b1', '_trash/a.md': 'a1' }), look())).toEqual(at('refused', 'a.md'));
    // (deleted, and a new file made at its path: refused, never written into the new one)
    expect(placeOf('a.md', 'a1', read, f({ 'a.md': 'n1', 'b.md': 'b1', '_trash/a.md': 'a1' }), look())).toEqual(at('refused', 'a.md'));
    // (put in _trash/ and a copy of it elsewhere too: refused)
    expect(placeOf('a.md', 'a1', read, f({ 'b.md': 'b1', 'c.md': 'a1', '_trash/a.md': 'a1' }), look())).toEqual(at('refused', 'a.md'));
    // (written from a version before the one read: the one read put in _trash/)
    expect(placeOf('a.md', 'a0', read, f({ 'a.md': 'n1', 'b.md': 'b1', '_trash/a.md': 'a1' }), look())).toEqual(at('refused', 'a.md'));
    // (the trash of another file, of the same text: not this one's)
    expect(placeOf('a.md', 'a1', f({ 'a.md': 'a1', '_trash/x.md': 'a1' }), f({ 'a.md': 'a2', '_trash/x.md': 'a1' }), look())).toEqual(at('both', 'a.md'));
    // a file this device made, and another file made at its path elsewhere
    expect(placeOf('new.md', '', read, f({ 'a.md': 'a1', 'b.md': 'b1', 'new.md': 'x1' }), look())).toEqual(at('refused', 'new.md'));
    // (gone when it was read, there again now)
    expect(placeOf('z.md', 'z0', read, f({ 'a.md': 'a1', 'b.md': 'b1', 'z.md': 'z1' }), look())).toEqual(at('refused', 'z.md'));
    // (another file moved to its path, its own gone)
    expect(placeOf('01.md', 'one', f({ '01.md': 'one', '02.md': 'two' }), f({ '01.md': 'two' }), look())).toEqual(at('refused', '01.md'));
    expect(placeOf('01.md', 'one', f({ '01.md': 'one', '02.md': 'two', '03.md': 'two' }), f({ '01.md': 'two', '02.md': 'two' }), look())).toEqual(
      at('refused', '01.md'),
    );
  });
  // FR-TOC-04, FR-NOTE-05: renamed by the heading elsewhere (moved too): the text goes there, under the new heading;
  // a new file made under its old name is not it
  test('placeOf: only the heading changed there: heading, where it is now; an empty text tells nothing; two such: none', () => {
    const texts = { b: '# 第1話 はじまり\n\n本文\n', r: '# 第1話 朝\n\n本文\n', n: '# 第1話 はじまり\n\n新しい\n', e: '# 空\n\n', e2: '# 空2\n\n' };
    expect(placeOf('ch/01.md', 'b', f({ 'ch/01.md': 'b' }), f({ 'ch/01.md': 'r' }), look(texts))).toEqual(at('heading', 'ch/01.md'));
    expect(placeOf('ch/01.md', 'b', f({ 'ch/01.md': 'b' }), f({ 'ch/02.md': 'r' }), look(texts))).toEqual(at('heading', 'ch/02.md'));
    // (another file come, its text not read: not it)
    expect(placeOf('ch/01.md', 'b', f({ 'ch/01.md': 'b' }), f({ 'ch/02.md': 'r', 'ch/05.md': 'unread' }), look(texts))).toEqual(at('heading', 'ch/02.md'));
    // (renamed and moved; a new one under its old name at its path: not that one)
    expect(placeOf('ch/01.md', 'b', f({ 'ch/01.md': 'b' }), f({ 'ch/01.md': 'n', 'ch/02.md': 'r' }), look(texts))).toEqual(at('heading', 'ch/02.md'));
    // (another file of the same text, not changed: not it)
    const copy = { ...texts, c: '# 写し\n\n本文\n' };
    expect(placeOf('ch/01.md', 'b', f({ 'ch/01.md': 'b', 'ch/09.md': 'c' }), f({ 'ch/01.md': 'r', 'ch/09.md': 'c' }), look(copy))).toEqual(
      at('heading', 'ch/01.md'),
    );
    // (two of the same text under other headings, one here: not told apart, though the one here is called as it was by its
    // file name)
    const two = { b: '# W\n\n本文\n', r: '# X\n\n本文\n', r2: '# Y\n\n本文\n' };
    expect(placeOf('ch/01_a.md', 'b', f({ 'ch/01_a.md': 'b' }), f({ 'ch/01_a.md': 'r', 'ch/02_b.md': 'r2' }), look(two, F))).toEqual(
      at('refused', 'ch/01_a.md'),
    );
    // (other line ends there)
    const crlf = { ...texts, r: '# 第1話 朝\r\n\r\n本文\r\n' };
    expect(placeOf('ch/01.md', 'b', f({ 'ch/01.md': 'b' }), f({ 'ch/01.md': 'r' }), look(crlf))).toEqual(at('heading', 'ch/01.md'));
    // (a heading only: nothing to tell it by; called otherwise now, refused)
    expect(placeOf('ch/01.md', 'e', f({ 'ch/01.md': 'e' }), f({ 'ch/01.md': 'e2' }), look(texts))).toEqual(at('refused', 'ch/01.md'));
    // (the same text under two headings now, here and come elsewhere: not told apart)
    expect(placeOf('ch/01.md', 'b', f({ 'ch/01.md': 'b' }), f({ 'ch/01.md': 'r', 'ch/02.md': 'r2' }), look({ ...texts, r2: '# 写し\n\n本文\n' }))).toEqual(
      at('refused', 'ch/01.md'),
    );
    // (in _trash/ with another heading: not it)
    expect(placeOf('ch/01.md', 'b', f({ 'ch/01.md': 'b' }), f({ '_trash/ch/01.md': 'r' }), look(texts))).toEqual(at('refused', 'ch/01.md'));
  });
  // FR-TOC-04: moved and changed at once elsewhere (two episodes swapped and written in one commit): no blob tells it,
  // the name does; another file called otherwise there now is not it
  test('placeOf: moved and changed at once: the one file come elsewhere called as it was; none, or another file there: refused', () => {
    const read = f({ 'ch/01.md': 'one', 'ch/02.md': 'two' });
    const texts = { one: '# 一\n\nA\n', two: '# 二\n\nB\n', one2: '# 一\n\nA2\n', two2: '# 二\n\nB2\n', three: '# 三\n\nC\n' };
    expect(placeOf('ch/01.md', 'one', read, f({ 'ch/01.md': 'two2', 'ch/02.md': 'one2' }), look(texts))).toEqual(at('both', 'ch/02.md'));
    expect(placeOf('ch/01.md', 'one', read, f({ 'ch/01.md': 'three', 'ch/02.md': 'two' }), look(texts))).toEqual(at('refused', 'ch/01.md'));
    expect(
      placeOf('ch/01.md', 'one', read, f({ 'ch/01.md': 'three', 'ch/02.md': 'two', 'ch/05.md': 'four' }), look({ ...texts, four: '# 四\n\nD\n' })),
    ).toEqual(at('refused', 'ch/01.md'));
    // (another file moved to its path, though called as it was)
    const same = { ...texts, two: '# 一\n\nB\n' };
    expect(placeOf('ch/01.md', 'one', read, f({ 'ch/01.md': 'two' }), look(same))).toEqual(at('refused', 'ch/01.md'));
    // (two come elsewhere called as it was: not told apart)
    expect(
      placeOf('ch/01.md', 'one', read, f({ 'ch/02.md': 'two', 'ch/03.md': 'one2', 'ch/04.md': 'one3' }), look({ ...texts, one3: '# 一\n\nA3\n' })),
    ).toEqual(at('refused', 'ch/01.md'));
    // (gone, and nothing called as it was: its text not read)
    expect(placeOf('ch/01.md', 'one', read, f({ 'ch/02.md': 'two', 'ch/03.md': 'one2' }), look())).toEqual(at('refused', 'ch/01.md'));
    // (the text written from not read, the one read is: named by it)
    expect(placeOf('ch/01.md', 'one0', read, f({ 'ch/02.md': 'two', 'ch/03.md': 'one2' }), look(texts))).toEqual(at('both', 'ch/03.md'));
  });
  test('underHeading: what was written under the heading given there; renamed here too, its own', () => {
    const base = '# 第1話 はじまり\n\n本文\n';
    expect(underHeading(base, '# 第1話 はじまり\n\n本文と続き\n', '# 第1話 朝\n\n本文\n')).toBe('# 第1話 朝\n\n本文と続き\n');
    expect(underHeading(base, '# 第1話 夜\n\n本文と続き\n', '# 第1話 朝\n\n本文\n')).toBe('# 第1話 夜\n\n本文と続き\n');
    // (no heading in what was written, nor then: the text under the one given there)
    expect(underHeading('本文\n', '本文と続き\n', '# 題\n本文\n')).toBe('# 題\n本文と続き\n');
    // (a # not at the start is no heading)
    expect(underHeading('本文 #1\n', '本文 #1 続き\n', '# 題\n本文 #1\n')).toBe('# 題\n本文 #1 続き\n');
  });
  test('layoutOf and extOf: novel.toml, or none; a file’s extension, or none', () => {
    expect(layoutOf(null)).toEqual(firstLayout());
    expect(layoutOf('[manuscript]\ndir = "ch"\n').dir).toBe('ch');
    expect([extOf('ch/01.md'), extOf('ch.d/README'), extOf('a.tar.gz')]).toEqual(['.md', '', '.gz']);
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
  test('sendPlan: where and how each draft goes, the mode its file keeps, and the blob there; two going to one file', () => {
    const d = (path, base) => ({ repo: 'o/r', path, base, text: 't', at: 0 });
    const read = { 'a.md': { sha: 's1', mode: '100644' }, 'b.md': { sha: 's2', mode: '100755' }, 'c.md': { sha: 's3', mode: '100644' } };
    const blobs = { 'a.md': { sha: 's1', mode: '100644' }, 'b.md': { sha: 's9', mode: '100755' }, 'm.md': { sha: 's3', mode: '100755' } };
    expect(sendPlan([d('a.md', 's1'), d('b.md', 's2'), d('c.md', 's3'), d('n.md', ''), d('z.md', 'sz')], blobs, read, look())).toEqual([
      { draft: d('a.md', 's1'), how: 'mine', to: 'a.md', mode: '100644', theirs: 's1' },
      { draft: d('b.md', 's2'), how: 'both', to: 'b.md', mode: '100755', theirs: 's9' },
      { draft: d('c.md', 's3'), how: 'mine', to: 'm.md', mode: '100755', theirs: 's3' },
      { draft: d('n.md', ''), how: 'mine', to: 'n.md', mode: '100644', theirs: '' },
      { draft: d('z.md', 'sz'), how: 'refused', to: 'z.md', mode: '100644', theirs: '' },
    ]);
    // (two texts going to one file: the one moved there refused; a text refused there takes nothing)
    const swapped = { 'a.md': { sha: 's3', mode: '100644' }, 'c.md': { sha: 's1', mode: '100644' } };
    const moving = { 'a.md': { sha: 's1', mode: '100644' }, 'c.md': { sha: 's3', mode: '100644' } };
    expect(sendPlan([d('a.md', 's3'), d('c.md', 's3')], swapped, moving, look()).map(p => [p.how, p.to])).toEqual([
      ['mine', 'a.md'],
      ['refused', 'c.md'],
    ]);
    expect(sendPlan([d('b.md', 's2'), d('c.md', 's3')], { 'b.md': { sha: 's3', mode: '100644' } }, read, look()).map(p => [p.how, p.to])).toEqual([
      ['refused', 'b.md'],
      ['mine', 'b.md'],
    ]);
  });
});
