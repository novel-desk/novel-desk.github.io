import { describe, test, expect } from 'vitest';
import { conflictsOf, foldersOf, moveFiles, rebase, relabel, viewFiles, writeFile } from '../../lib/changes.js';

const blobs = { 'a.md': { sha: 'sa', mode: '100644' }, 'b.md': { sha: 'sb', mode: '100755' }, 'c/d.md': { sha: 'sd', mode: '100644' } };
const o = { repo: 'o/r', op: 'op2', at: 9 };
const changes = list => new Map(list.map(c => [c.path, c]));

describe('changes', () => {
  test('viewFiles: the files with the changes over them (gone, written, moved)', () => {
    const list = [
      { repo: 'o/r', path: 'a.md', base: 'sa', gone: true, at: 1 },
      { repo: 'o/r', path: 'b.md', base: 'sb', text: 't', at: 1 },
      { repo: 'o/r', path: 'e.md', base: '', sha: 'sa', from: { path: 'a.md', base: 'sa' }, at: 1 },
      { repo: 'o/r', path: 'f.png', base: '', bytes: new Uint8Array([1]), mode: '100755', at: 1 },
    ];
    expect(viewFiles(blobs, list)).toEqual({
      'b.md': { sha: '', mode: '100755' },
      'c/d.md': { sha: 'sd', mode: '100644' },
      'e.md': { sha: 'sa', mode: '100644' },
      'f.png': { sha: '', mode: '100755' },
    });
  });
  test('foldersOf: every folder that holds a path, once', () => {
    expect(foldersOf(['a/b/c.md', 'a/d.md', 'e.md']).sort()).toEqual(['a', 'a/b']);
  });
  test('moveFiles: a file of the branch moved (gone where it was, its blob put where it goes, where it came from kept)', () => {
    const { changes: next, merged } = moveFiles(blobs, new Map(), [['a.md', 'x/a.md']], o);
    expect([...next.values()]).toEqual([
      { repo: 'o/r', path: 'a.md', base: 'sa', gone: true, op: 'op2', at: 9 },
      { repo: 'o/r', path: 'x/a.md', base: '', sha: 'sa', mode: '100644', from: { path: 'a.md', base: 'sa' }, op: 'op2', at: 9 },
    ]);
    expect(merged.size).toBe(0);
  });
  test('moveFiles: two files swapped; a draft moved takes its text and the blob it was written on along', () => {
    const draft = { repo: 'o/r', path: 'b.md', base: 'sb0', text: '書いた', at: 1 };
    const { changes: next } = moveFiles(
      blobs,
      changes([draft]),
      [
        ['a.md', 'b.md'],
        ['b.md', 'a.md'],
      ],
      o,
    );
    expect(next.get('b.md')).toEqual({
      repo: 'o/r',
      path: 'b.md',
      base: 'sb0',
      sha: 'sa',
      mode: '100644',
      from: { path: 'a.md', base: 'sa' },
      op: 'op2',
      at: 9,
    });
    expect(next.get('a.md')).toEqual({ repo: 'o/r', path: 'a.md', base: 'sa', text: '書いた', from: { path: 'b.md', base: 'sb0' }, op: 'op2', at: 9 });
  });
  test('moveFiles: a file moved again keeps where it came from first; moved back as it was, nothing is left; bytes move', () => {
    const first = moveFiles(blobs, new Map(), [['a.md', 'x.md']], { ...o, op: 'op1' }).changes;
    const again = moveFiles(blobs, first, [['x.md', 'y.md']], o);
    expect(again.changes.get('y.md')?.from).toEqual({ path: 'a.md', base: 'sa' });
    expect(again.changes.has('x.md')).toBe(false);
    expect(again.merged).toEqual(new Set(['op1']));
    expect([...again.changes.values()].every(c => c.op === 'op2')).toBe(true);
    expect(moveFiles(blobs, again.changes, [['y.md', 'a.md']], { ...o, op: 'op3' }).changes.size).toBe(0);
    const pic = changes([{ repo: 'o/r', path: 'p.png', base: '', bytes: new Uint8Array([7]), op: 'op1', at: 1 }]);
    expect(moveFiles(blobs, pic, [['p.png', 'q.png']], o).changes.get('q.png')).toEqual({
      repo: 'o/r',
      path: 'q.png',
      base: '',
      bytes: new Uint8Array([7]),
      op: 'op2',
      at: 9,
    });
  });
  test('moveFiles: a file moved onto one gone before takes its blob as its base', () => {
    const gone = changes([{ repo: 'o/r', path: 'b.md', base: 'sb', gone: true, op: 'op1', at: 1 }]);
    const { changes: next } = moveFiles(blobs, gone, [['a.md', 'b.md']], o);
    expect(next.get('b.md')).toMatchObject({ base: 'sb', sha: 'sa', op: 'op2' });
  });
  test('writeFile: a new file of an operation; over a file moved, where it came from stays', () => {
    const { changes: next } = writeFile(blobs, new Map(), 'n.md', { text: '# 新しい話\n' }, o);
    expect(next.get('n.md')).toEqual({ repo: 'o/r', path: 'n.md', base: '', text: '# 新しい話\n', op: 'op2', at: 9 });
    const moved = changes([{ repo: 'o/r', path: 'y.md', base: '', sha: 'sa', from: { path: 'a.md', base: 'sa' }, op: 'op1', at: 1 }]);
    const over = writeFile(blobs, moved, 'y.md', { text: 't' }, o);
    expect(over.changes.get('y.md')).toEqual({ repo: 'o/r', path: 'y.md', base: '', text: 't', from: { path: 'a.md', base: 'sa' }, op: 'op2', at: 9 });
    expect(over.merged).toEqual(new Set(['op1']));
    expect(writeFile(blobs, new Map(), 'b.md', { text: 'x' }, o).changes.get('b.md')?.base).toBe('sb');
    // a link rewritten by an operation (auto), not over a draft; over a draft, what was typed in it is not auto
    expect(writeFile(blobs, new Map(), 'b.md', { text: 'x', auto: true }, o).changes.get('b.md')?.auto).toBe(true);
    const typed = changes([{ repo: 'o/r', path: 'b.md', base: 'sb', text: '下書き', at: 1 }]);
    expect(writeFile(blobs, typed, 'b.md', { text: 'x', auto: true }, o).changes.get('b.md')).toEqual({
      repo: 'o/r',
      path: 'b.md',
      base: 'sb',
      text: 'x',
      op: 'op2',
      at: 9,
    });
  });
  test('relabel: the changes of the operations taken in become the new one', () => {
    expect(relabel([{ op: 'a' }, { op: 'b' }, {}], new Set(['a']), 'c')).toEqual([{ op: 'c' }, { op: 'b' }, {}]);
  });
  test('conflictsOf: the files of operations that changed on the branch since; a text written alone is not one', () => {
    const list = changes([
      { repo: 'o/r', path: 'a.md', base: 'sa', gone: true, op: 'op1', at: 1 },
      { repo: 'o/r', path: 'b.md', base: 'old', gone: true, op: 'op1', at: 1 },
      { repo: 'o/r', path: 'n.md', base: '', text: '', op: 'op3', at: 1 },
      { repo: 'o/r', path: 'c/d.md', base: 'old', text: 't', at: 1 },
    ]);
    expect(conflictsOf(list, blobs)).toEqual(['b.md']);
    expect(conflictsOf(list, { ...blobs, 'n.md': { sha: 'sn', mode: '100644' } })).toEqual(['b.md', 'n.md']);
  });
  test('rebase: an operation whose files changed elsewhere is given up whole; the text written in it stays a draft', () => {
    const list = changes([
      { repo: 'o/r', path: 'a.md', base: 'old', gone: true, op: 'op1', at: 1 },
      { repo: 'o/r', path: 'z.md', base: '', text: '書き足した', from: { path: 'a.md', base: 'sa0' }, op: 'op1', at: 2 },
      { repo: 'o/r', path: 'y.md', base: '', sha: 'sb', from: { path: 'b.md', base: 'sb' }, op: 'op1', at: 2 },
      { repo: 'o/r', path: 'n.md', base: '', text: '新しい話', op: 'op2', at: 3 },
      { repo: 'o/r', path: 'c/d.md', base: 'old', text: 'ここで', at: 4 },
    ]);
    const now = { ...blobs, 'n.md': { sha: 'other', mode: '100644' } };
    const { changes: next, ops } = rebase(list, now);
    expect(ops).toEqual(new Set(['op1', 'op2']));
    expect([...next.values()]).toEqual([
      { repo: 'o/r', path: 'c/d.md', base: 'old', text: 'ここで', at: 4 },
      { repo: 'o/r', path: 'a.md', base: 'sa0', text: '書き足した', at: 2 },
      { repo: 'o/r', path: 'n.md', base: '', text: '新しい話', at: 3 },
    ]);
    // the place it came from taken (by a draft of its own): where it is; both taken: nothing more
    const busy = changes([
      { repo: 'o/r', path: 'a.md', base: 'sa', text: '下書き', at: 1 },
      { repo: 'o/r', path: 'z.md', base: '', text: '移した', from: { path: 'a.md', base: 'sa' }, op: 'op1', at: 2 },
      { repo: 'o/r', path: 'b.md', base: 'x', gone: true, op: 'op1', at: 2 },
    ]);
    expect(rebase(busy, blobs).changes.get('z.md')).toEqual({ repo: 'o/r', path: 'z.md', base: '', text: '移した', at: 2 });
    expect(rebase(changes([]), blobs).ops.size).toBe(0);
    // a text the operation wrote by itself (auto) goes with it
    const auto = changes([
      { repo: 'o/r', path: 'a.md', base: 'old', gone: true, op: 'op1', at: 1 },
      { repo: 'o/r', path: 'b.md', base: 'sb', text: 'リンク', auto: true, op: 'op1', at: 1 },
    ]);
    expect(rebase(auto, blobs).changes.size).toBe(0);
    // both taken (where it came from by a draft, where it is by a text put back there first): nothing more
    const both = changes([
      { repo: 'o/r', path: 'k.md', base: 'bk', text: '下書き', at: 1 },
      { repo: 'o/r', path: 'p.md', base: '', text: 'one', from: { path: 'r.md', base: 'b1' }, op: 'op1', at: 2 },
      { repo: 'o/r', path: 'r.md', base: 'old', text: 'two', from: { path: 'k.md', base: 'bk' }, op: 'op1', at: 2 },
    ]);
    expect([...rebase(both, {}).changes.values()]).toEqual([
      { repo: 'o/r', path: 'k.md', base: 'bk', text: '下書き', at: 1 },
      { repo: 'o/r', path: 'r.md', base: 'b1', text: 'one', at: 2 },
    ]);
  });
});
