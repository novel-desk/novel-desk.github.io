// What a send puts in its commit (lib/send.js)
import { test, expect } from 'vitest';
import { blobsAfter, configChange, opContent, opEntry, opSource, sentText, TRIES, tryAgain } from '../../lib/send.js';
import { END_MARK, MINE_MARK, OTHER_DEVICE_MARK } from '../../lib/merge.js';

/** @param {string} mine @param {string} theirs one place with both versions side by side */
const sides = (mine, theirs) => `${MINE_MARK}\n${mine}${OTHER_DEVICE_MARK}\n${theirs}${END_MARK}\n`;

// FR-SAVE-04, FR-SAVE-05, FR-SAVE-06, DESK-SAVE-01: changed there too, put together line by line; the same lines changed on both
// sides, side by side and held back (GitHub never gets them); renamed there, under its heading; else as written
test('sentText: put together with the one there; side by side where both changed the same lines, held back; under the heading given there; as written', () => {
  expect(sentText('both', '一\n\n二を\n', '一を\n\n二\n', '一\n\n二\n')).toEqual({ text: '一を\n\n二を\n', merged: true, placed: false, held: false });
  expect(sentText('both', '私の\n', 'ほかの\n', '元\n')).toEqual({ text: sides('私の\n', 'ほかの\n'), merged: true, placed: true, held: true });
  // (the text it was written from not known: the places where they differ side by side)
  expect(sentText('both', '一\n私の\n', '一\nほかの\n', undefined)).toEqual({
    text: `一\n${sides('私の\n', 'ほかの\n')}`,
    merged: true,
    placed: true,
    held: true,
  });
  // (the same text there, other line ends: as written, nothing taken in)
  expect(sentText('both', '同じ\n', '同じ\r\n', '元\n')).toEqual({ text: '同じ\n', merged: false, placed: false, held: false });
  // (places side by side left from before: held back, not put there by this send)
  expect(sentText('mine', `前\n${sides('a\n', 'b\n')}`, '', null)).toEqual({ text: `前\n${sides('a\n', 'b\n')}`, merged: false, placed: false, held: true });
  expect(sentText('heading', '# 旧\n本文を書いた', '# 新\n本文', '# 旧\n本文')).toEqual({
    text: '# 新\n本文を書いた',
    merged: false,
    placed: false,
    held: false,
  });
  expect(sentText('as', '私の', 'ほかの', null)).toEqual({ text: '私の', merged: false, placed: false, held: false });
});
// FR-TOC-02〜06, FR-EDIT-07: an operation's files in the commit
test('opContent, opSource, opEntry: a text, bytes, a blob moved, deleted; where it came from; its mode and blob', () => {
  const base = { repo: 'o/r', path: 'b.md', base: '', at: 1 };
  expect(opContent({ ...base, text: '' })).toBe('text');
  expect(opContent({ ...base, bytes: new Uint8Array() })).toBe('bytes');
  expect(opContent({ ...base, sha: 's' })).toBe('blob');
  expect(opContent({ ...base, gone: true })).toBe('gone');
  expect(opSource({ ...base, from: { path: 'a.md', base: 's' } })).toBe('a.md');
  expect(opSource(base)).toBe('b.md');
  const blobs = { 'b.md': { sha: 's0', mode: '100755' } };
  expect(opEntry({ ...base, mode: '100644' }, blobs, 'n')).toEqual({ path: 'b.md', mode: '100644', type: 'blob', sha: 'n' });
  expect(opEntry(base, blobs, 'n')).toEqual({ path: 'b.md', mode: '100755', type: 'blob', sha: 'n' });
  expect(opEntry({ ...base, path: 'c.md', gone: true }, blobs, '')).toEqual({ path: 'c.md', mode: '100644', type: 'blob', sha: null });
});
// FR-GH-06: novel.toml in the commit's message when its keys changed it
test('configChange: keys set that changed it (a new file: no blob); none set, or no change', () => {
  expect(configChange({ repo: 'o/r', edits: 1, config: 'b', configNow: 'a', blob: 's' })).toEqual([{ repo: 'o/r', path: 'novel.toml', base: 's', at: 0 }]);
  expect(configChange({ repo: 'o/r', edits: 1, config: 'b', configNow: '', blob: undefined })).toEqual([{ repo: 'o/r', path: 'novel.toml', base: '', at: 0 }]);
  expect(configChange({ repo: 'o/r', edits: 1, config: 'a', configNow: 'a', blob: 's' })).toEqual([]);
  expect(configChange({ repo: 'o/r', edits: 0, config: 'b', configNow: 'a', blob: 's' })).toEqual([]);
});
test('blobsAfter: each entry put in, or deleted; the files given left as they were', () => {
  const blobs = { 'a.md': { sha: 'sa', mode: '100644' }, 'b.md': { sha: 'sb', mode: '100644' } };
  const after = blobsAfter(blobs, [
    { path: 'a.md', mode: '100644', type: 'blob', sha: null },
    { path: 'c.md', mode: '100755', type: 'blob', sha: 'sc' },
  ]);
  expect(after).toEqual({ 'b.md': { sha: 'sb', mode: '100644' }, 'c.md': { sha: 'sc', mode: '100755' } });
  expect(blobs['a.md']).toEqual({ sha: 'sa', mode: '100644' });
});
// FR-SAVE-03: the branch moved on during the send: read again, a few times
test('tryAgain: GitHub’s 422 while tries are left', () => {
  expect(TRIES).toBe(3);
  expect(tryAgain(422, 0)).toBe(true);
  expect(tryAgain(422, 1)).toBe(true);
  expect(tryAgain(422, 2)).toBe(false);
  expect(tryAgain(409, 0)).toBe(false);
});
