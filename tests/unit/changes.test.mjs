import { describe, test, expect } from 'vitest';
import { conflictsOf, foldersOf, moveFiles, rebase, relabel, settle, unsentList, viewFiles, withoutOp, writeFile } from '../../lib/changes.js';
import { firstLayout } from '../../lib/layout.js';

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
    // (a path from the top: no folder named '')
    expect(foldersOf(['/e.md'])).toEqual([]);
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
      from: { path: 'p.png', base: '' },
      op: 'op2',
      at: 9,
    });
  });
  test('moveFiles: a file moved onto one gone before takes its blob as its base', () => {
    const gone = changes([{ repo: 'o/r', path: 'b.md', base: 'sb', gone: true, op: 'op1', at: 1 }]);
    const { changes: next } = moveFiles(blobs, gone, [['a.md', 'b.md']], o);
    expect(next.get('b.md')).toMatchObject({ base: 'sb', sha: 'sa', op: 'op2' });
  });
  // FR-SAVE-01, NFR-MAINT-02
  test('moveFiles: a change moved keeps its mode; one moved onto a change of another operation takes that operation in', () => {
    const before = changes([
      { repo: 'o/r', path: 'n.sh', base: '', text: 'x', mode: '100755', op: 'op0', at: 1 },
      { repo: 'o/r', path: 'm.md', base: '', text: 'y', op: 'op1', at: 1 },
    ]);
    const { changes: next, merged } = moveFiles(blobs, before, [['n.sh', 'm.md']], o);
    expect(merged).toEqual(new Set(['op0', 'op1']));
    expect(next.get('m.md')).toEqual({ repo: 'o/r', path: 'm.md', base: '', text: 'x', mode: '100755', from: { path: 'n.sh', base: '' }, op: 'op2', at: 9 });
  });
  // FR-SAVE-01, NFR-MAINT-02
  test('moveFiles: the blob of the branch moved onto its own blob is still a change when the change there was made on another', () => {
    const same = { 'a.md': { sha: 'sa', mode: '100644' }, 'b.md': { sha: 'sa', mode: '100644' } };
    const before = changes([{ repo: 'o/r', path: 'b.md', base: 'old', text: 'z', at: 1 }]);
    const { changes: next } = moveFiles(same, before, [['a.md', 'b.md']], o);
    expect(next.get('b.md')).toEqual({
      repo: 'o/r',
      path: 'b.md',
      base: 'old',
      sha: 'sa',
      mode: '100644',
      from: { path: 'a.md', base: 'sa' },
      op: 'op2',
      at: 9,
    });
  });
  // FR-SAVE-01, FR-SAVE-04: a new episode moved onto the place of one of the branch (the order changed), then given up
  // because a file changed elsewhere: its text goes back where it was made, and does not take the place of the
  // branch's file (before, it stayed there on that file's blob, and a send wrote over it: tests/props/model.test.mjs)
  test('rebase: a new file moved onto a file of the branch and given up: its text back where it was made, the branch’s file left', () => {
    const made = writeFile(blobs, new Map(), 'n.md', { text: '新しい' }, { ...o, op: 'op1' }).changes;
    const moved = moveFiles(
      blobs,
      made,
      [
        ['n.md', 'b.md'],
        ['b.md', 'n.md'],
      ],
      { ...o, op: 'op2' },
    ).changes;
    const { changes: next } = rebase(moved, { ...blobs, 'b.md': { sha: 'sb2', mode: '100644' } });
    expect([...next.values()]).toEqual([{ repo: 'o/r', path: 'n.md', base: '', text: '新しい', at: 9 }]);
  });
  // FR-SAVE-01, NFR-MAINT-02
  test('writeFile: over nothing, no operation taken in', () => {
    expect(writeFile(blobs, new Map(), 'n.md', { text: 't' }, o).merged).toEqual(new Set());
  });
  test('writeFile: a new file of an operation; over a file moved, where it came from stays', () => {
    const { changes: next } = writeFile(blobs, new Map(), 'n.md', { text: '# 新しい話\n' }, o);
    expect(next.get('n.md')).toEqual({ repo: 'o/r', path: 'n.md', base: '', text: '# 新しい話\n', op: 'op2', at: 9 });
    const moved = changes([{ repo: 'o/r', path: 'y.md', base: '', sha: 'sa', from: { path: 'a.md', base: 'sa' }, op: 'op1', at: 1 }]);
    const over = writeFile(blobs, moved, 'y.md', { text: 't' }, o);
    expect(over.changes.get('y.md')).toEqual({ repo: 'o/r', path: 'y.md', base: '', text: 't', from: { path: 'a.md', base: 'sa' }, op: 'op2', at: 9 });
    expect(over.merged).toEqual(new Set(['op1']));
    expect(writeFile(blobs, new Map(), 'b.md', { text: 'x' }, o).changes.get('b.md')?.base).toBe('sb');
    // over a file an operation took away (put in the trash): a file made here, its text given up as one
    const gone = changes([{ repo: 'o/r', path: 'b.md', base: 'sb', gone: true, op: 'op1', at: 1 }]);
    const made = writeFile(blobs, gone, 'b.md', { text: '新しい話' }, o).changes;
    expect(made.get('b.md')).toEqual({ repo: 'o/r', path: 'b.md', base: 'sb', text: '新しい話', from: { path: 'b.md', base: '' }, op: 'op2', at: 9 });
    expect([...rebase(made, { ...blobs, 'b.md': { sha: 'sb2', mode: '100644' } }).changes.values()]).toEqual([
      { repo: 'o/r', path: 'b.md', base: '', text: '新しい話', at: 9 },
    ]);
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
    // both taken (where it came from by a draft, where it is by a text put back there first): set aside, not lost
    const both = changes([
      { repo: 'o/r', path: 'k.md', base: 'bk', text: '下書き', at: 1 },
      { repo: 'o/r', path: 'p.md', base: '', text: 'one', from: { path: 'r.md', base: 'b1' }, op: 'op1', at: 2 },
      { repo: 'o/r', path: 'r.md', base: 'old', text: 'two', from: { path: 'k.md', base: 'bk' }, op: 'op1', at: 2 },
    ]);
    const given = rebase(both, {});
    expect([...given.changes.values()]).toEqual([
      { repo: 'o/r', path: 'k.md', base: 'bk', text: '下書き', at: 1 },
      { repo: 'o/r', path: 'r.md', base: 'b1', text: 'one', at: 2 },
    ]);
    expect(given.parked).toEqual([{ repo: 'o/r', path: 'r.md', base: 'old', text: 'two', at: 2 }]);
    expect(rebase(busy, blobs).parked).toEqual([]);
    // moved onto a file of the branch, the place it came from taken: set aside, not put on that other file
    const onto = changes([
      { repo: 'o/r', path: 'k.md', base: 'bk', text: '下書き', at: 1 },
      { repo: 'o/r', path: 'r.md', base: 'old', text: 'two', from: { path: 'k.md', base: 'bk' }, op: 'op1', at: 2 },
    ]);
    expect(rebase(onto, {})).toEqual({
      changes: changes([onto.get('k.md')]),
      ops: new Set(['op1']),
      parked: [{ repo: 'o/r', path: 'r.md', base: 'old', text: 'two', at: 2 }],
    });
  });
});

// FR-SAVE-09: the changes not sent, listed, one given up by hand
// FR-TOC-04, FR-TOC-06, FR-NOTE-05, FR-NOTE-06, FR-SAVE-09: on the branch read again, a text whose file moved
// elsewhere goes with it (written from the blob it was); one whose file is put in _trash/, or is another file now, is
// set aside; the others, and the changes of operations, stay as they are
test('settle: the texts go where their files moved; the ones whose file is put in _trash/ or is another file now set aside', () => {
  const look = { texts: {}, was: firstLayout(), now: firstLayout() };
  const after = {
    'a.md': { sha: 'sa2', mode: '100644' },
    'c/d.md': { sha: 'sx', mode: '100644' },
    '_trash/b.md': { sha: 'sb', mode: '100755' },
    'e.md': { sha: 'sd', mode: '100644' },
  };
  const edited = { repo: 'o/r', path: 'a.md', base: 'sa', text: 'ここで', at: 1 };
  const trashed = { repo: 'o/r', path: 'b.md', base: 'sb', text: '消された話に', at: 2 };
  const moved = { repo: 'o/r', path: 'c/d.md', base: 'sd', text: '動いた話に', at: 3 };
  const op = { repo: 'o/r', path: 'b.md', base: 'sb', gone: true, op: 'op1', at: 4 };
  const { changes: kept, parked, moved: went } = settle(changes([edited, trashed, moved]), blobs, after, look);
  expect([...kept.values()]).toEqual([edited, { ...moved, path: 'e.md' }]);
  expect(parked).toEqual([trashed]);
  expect(went).toEqual([['c/d.md', 'e.md']]);
  expect(settle(changes([op]), blobs, after, look)).toEqual({ changes: changes([op]), parked: [], moved: [] });
  // two files swapped: each text goes where its file is now
  const swapped = { 'a.md': { sha: 'sb', mode: '100644' }, 'b.md': { sha: 'sa', mode: '100644' }, 'c/d.md': { sha: 'sd', mode: '100644' } };
  const one = { repo: 'o/r', path: 'a.md', base: 'sa', text: '一', at: 1 };
  const two = { repo: 'o/r', path: 'b.md', base: 'sb', text: '二', at: 2 };
  const s = settle(changes([one, two]), blobs, swapped, look);
  expect([...s.changes]).toEqual([
    ['b.md', { ...one, path: 'b.md' }],
    ['a.md', { ...two, path: 'a.md' }],
  ]);
  expect(s.moved).toEqual([
    ['a.md', 'b.md'],
    ['b.md', 'a.md'],
  ]);
  // moving where another change stays (a text there, or an operation's): set aside; where the text there is set aside
  // itself (its file put in _trash/): it goes
  const onto = { 'b.md': { sha: 'sa', mode: '100644' }, 'c/d.md': { sha: 'sd', mode: '100644' } };
  const stays = { repo: 'o/r', path: 'b.md', base: 'sa', text: '書いた', at: 5 };
  expect(settle(changes([one, stays]), blobs, onto, look)).toEqual({ changes: changes([stays]), parked: [one], moved: [] });
  const opThere = { repo: 'o/r', path: 'b.md', base: '', text: '足した', op: 'op1', at: 5 };
  expect(settle(changes([one, opThere]), blobs, onto, look)).toEqual({ changes: changes([opThere]), parked: [one], moved: [] });
  const ontoTrash = { 'b.md': { sha: 'sa', mode: '100644' }, '_trash/b.md': { sha: 'sb', mode: '100644' }, 'c/d.md': { sha: 'sd', mode: '100644' } };
  expect(settle(changes([one, two]), blobs, ontoTrash, look)).toEqual({
    changes: changes([{ ...one, path: 'b.md' }]),
    parked: [two],
    moved: [['a.md', 'b.md']],
  });
  // (two texts moving to one file: both set aside)
  const both = settle(
    changes([
      { ...one, path: 'x.md' },
      { ...one, path: 'y.md' },
    ]),
    { 'x.md': { sha: 'sa', mode: '100644' }, 'y.md': { sha: 'sa', mode: '100644' } },
    { 'z.md': { sha: 'sa', mode: '100644' } },
    look,
  );
  expect([both.changes.size, both.parked.length]).toEqual([0, 2]);
});

describe('the list of changes not sent', () => {
  const list = changes([
    { repo: 'o/r', path: 'a.md', base: 'sa', gone: true, op: 'op1', at: 1 },
    { repo: 'o/r', path: 'x/a.md', base: '', text: '書いた', from: { path: 'a.md', base: 'sa' }, op: 'op1', at: 1 },
    { repo: 'o/r', path: 'b.md', base: 'sb', text: '下書き', at: 2 },
    { repo: 'o/r', path: 'n.md', base: '', text: '', op: 'op3', at: 3 },
  ]);
  const edits = [
    { key: ['titles', 'a.md'], value: null, op: 'op1' },
    { key: ['title'], value: '題', op: 'op2' },
  ];
  test('unsentList: each text alone, each operation with its files and keys', () => {
    expect(unsentList(list, edits)).toEqual([
      { kind: 'text', path: 'b.md' },
      { kind: 'op', op: 'op1', changes: [list.get('a.md'), list.get('x/a.md')], keys: 1 },
      { kind: 'op', op: 'op2', changes: [], keys: 1 },
      { kind: 'op', op: 'op3', changes: [list.get('n.md')], keys: 0 },
    ]);
  });
  // FR-SAVE-09, NFR-MAINT-02
  test('withoutOp: the changes of the other operations are left exactly as they are (a text moved by one stays where it went)', () => {
    const other = changes([
      { repo: 'o/r', path: 'k.md', base: '', text: '移した', from: { path: 'z.md', base: 'sz' }, op: 'op4', at: 4 },
      { repo: 'o/r', path: 'g.md', base: 'sg', gone: true, op: 'op5', at: 5 },
    ]);
    expect([...withoutOp(other, [], 'op5').changes.values()]).toEqual([other.get('k.md')]);
  });
  test('withoutOp: the operation given up, the text written in it kept where it came from; its keys gone', () => {
    const { changes: next, edits: left, parked } = withoutOp(list, edits, 'op1');
    expect(parked).toEqual([]);
    expect([...next.values()]).toEqual([
      { repo: 'o/r', path: 'b.md', base: 'sb', text: '下書き', at: 2 },
      { repo: 'o/r', path: 'n.md', base: '', text: '', op: 'op3', at: 3 },
      { repo: 'o/r', path: 'a.md', base: 'sa', text: '書いた', at: 1 },
    ]);
    expect(left).toEqual([edits[1]]);
  });
});
