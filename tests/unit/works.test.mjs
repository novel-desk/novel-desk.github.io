import { describe, test, expect } from 'vitest';
import {
  adminFailure,
  isWorkKey,
  keptAfterForget,
  listed,
  movedKey,
  newWorkFiles,
  repoName,
  stillHolds,
  summaryOf,
  visibilityTag,
  whereIs,
} from '../../lib/works.js';
import { parseLayout } from '../../lib/layout.js';
import { viewOf } from '../../lib/view.js';

const read = config => ({
  blobs: { 'novel.toml': { sha: 'cfg', mode: '100644' }, '01.md': { sha: 's1', mode: '100644' }, '02.md': { sha: 's2', mode: '100644' } },
  config,
  problems: [],
  texts: { '01.md': '# 第1話 一\n\nあい う', '02.md': null },
  shaTexts: {},
});

describe('works', () => {
  // FR-WORK-01
  test('summaryOf: the title, the length counted as the desk counts it, the episodes, the last change', () => {
    expect(summaryOf(viewOf(read('title = "試験の題"\n'), new Map(), []), 'o/r', 100, [])).toEqual({ title: '試験の題', chars: 8, count: 2, updated: 100 });
    // no title: the repository's name; a change not sent counts, and is the last change
    const draft = { repo: 'o/r', path: '02.md', base: 's2', text: 'えお', at: 500 };
    expect(summaryOf(viewOf(read(null), new Map([['02.md', draft]]), []), 'o/r', 100, [draft])).toEqual({ title: 'r', chars: 10, count: 2, updated: 500 });
    expect(summaryOf(viewOf(read(null), new Map(), []), 'o/r', 0, []).updated).toBe(0);
  });
  // FR-WORK-01
  test('stillHolds: the same branch chosen, every ref where it was, no change not sent then or now', () => {
    const kept = {
      title: 't',
      chars: 1,
      count: 1,
      updated: 1,
      branch: 'main',
      chosen: '',
      heads: /** @type {[string, string][]} */ ([['main', 'c1']]),
      overlay: false,
    };
    expect(stillHolds(kept, '', ['c1'], false)).toBe(true);
    expect(stillHolds(kept, '', ['c2'], false)).toBe(false);
    expect(stillHolds(kept, '', ['c1', ''], false)).toBe(false);
    expect(stillHolds(kept, 'draft', ['c1'], false)).toBe(false);
    expect(stillHolds(kept, '', ['c1'], true)).toBe(false);
    expect(stillHolds({ ...kept, overlay: true }, '', ['c1'], false)).toBe(false);
    expect(stillHolds(null, '', ['c1'], false)).toBe(false);
    expect(stillHolds(undefined, '', [], false)).toBe(false);
  });
  // FR-GH-11
  test('visibilityTag: 公開 stands out; from `visibility`, else `private`; nothing when not known', () => {
    expect(visibilityTag({ visibility: 'public' })).toBe('<span class="vis public" title="GitHub のリポジトリの公開状態">公開</span>');
    expect(visibilityTag({ visibility: 'internal' })).toContain('組織内');
    expect(visibilityTag({ private: true })).toBe('<span class="vis private" title="GitHub のリポジトリの公開状態">非公開</span>');
    expect(visibilityTag({ private: false })).toContain('class="vis public"');
    expect(visibilityTag({})).toBe('');
    expect(visibilityTag({ visibility: 'odd' })).toBe('');
  });
  // FR-WORK-02, FR-GH-10
  test('repoName: letters, digits and . _ - (100 at most), 「.git」 left off', () => {
    expect(repoName(' my-novel.git ')).toBe('my-novel');
    expect(repoName('a_b.c-1')).toBe('a_b.c-1');
    expect(repoName('小説')).toBeNull();
    expect(repoName('')).toBeNull();
    expect(repoName('..')).toBeNull();
    expect(repoName('x'.repeat(101))).toBeNull();
  });
  // FR-WORK-02, FR-GH-02
  test('newWorkFiles: the files the server version makes; novel.toml read as it says', () => {
    const files = newWorkFiles('題 "引用"', 'main');
    expect(Object.keys(files)).toEqual(['README.md', 'novel.toml', 'manuscript/01_はじまり.md', 'notes/images/.gitkeep']);
    expect(files['README.md']).toBe('# 題 "引用"\n');
    const { layout, problems } = parseLayout(files['novel.toml']);
    expect(problems).toEqual([]);
    expect(layout).toMatchObject({ title: '題 "引用"', dir: 'manuscript', files: ['*.md'], notes: 'notes', images: 'notes/images', branch: 'main' });
    expect(files['novel.toml']).toMatch(/^# Novel Writer の作品の設定\n/);
  });
  // FR-GH-10, FR-GH-12
  test('whereIs: the same, renamed or moved (by its name or its ID), another repository by the name, or gone', () => {
    const meta = (id, full_name) => ({ id, full_name, default_branch: 'main' });
    expect(whereIs('o/a', 1, meta(1, 'o/a'), null)).toEqual({ kind: 'same', meta: meta(1, 'o/a') });
    expect(whereIs('o/a', 0, meta(5, 'o/a'), null)).toEqual({ kind: 'same', meta: meta(5, 'o/a') });
    expect(whereIs('o/a', 1, meta(1, 'p/b'), null)).toEqual({ kind: 'moved', meta: meta(1, 'p/b') });
    expect(whereIs('o/a', 1, meta(2, 'o/a'), meta(1, 'o/c'))).toEqual({ kind: 'moved', meta: meta(1, 'o/c') });
    expect(whereIs('o/a', 1, null, meta(1, 'o/a'))).toEqual({ kind: 'same', meta: meta(1, 'o/a') });
    expect(whereIs('o/a', 1, meta(2, 'o/a'), null)).toEqual({ kind: 'other', meta: meta(2, 'o/a') });
    expect(whereIs('o/a', 1, null, null)).toEqual({ kind: 'gone', meta: null });
  });
  // FR-GH-10
  test('movedKey: the keys of a work moved to its new name; others not', () => {
    expect(movedKey('o/a', 'o/a', 'p/b')).toBe('p/b');
    expect(movedKey('o/a\nch/01.md', 'o/a', 'p/b')).toBe('p/b\nch/01.md');
    expect(movedKey('branch:o/a', 'o/a', 'p/b')).toBe('branch:p/b');
    expect(movedKey('snap:o/a\nch/01:x.md', 'o/a', 'p/b')).toBe('snap:p/b\nch/01:x.md');
    expect(movedKey('branch:o/ab', 'o/a', 'p/b')).toBeNull();
    expect(movedKey('o/ab\nx', 'o/a', 'p/b')).toBeNull();
    expect(movedKey('repos', 'o/a', 'p/b')).toBeNull();
  });
  // FR-WORK-02, FR-GH-10, NFR-USE-01
  test('adminFailure: what went wrong and what to do', () => {
    expect(adminFailure(401, 'Bad credentials')).toMatch(/^このトークンは使えません/);
    expect(adminFailure(403, 'Resource not accessible')).toMatch(/Administration を Read and write にした別のトークン/);
    expect(adminFailure(404, 'Not Found')).toMatch(/Administration/);
    expect(adminFailure(422, 'name already exists')).toBe('GitHub が受け付けませんでした（同じ名前のリポジトリがあるかもしれません）: name already exists');
    expect(adminFailure(500, 'oops')).toBe('oops');
  });
  // FR-WORK-05
  test('isWorkKey, listed: a work’s keys; the list without the works taken off it', () => {
    expect(isWorkKey('o/a\n01.md', 'o/a')).toBe(true);
    expect(isWorkKey('summary:o/a', 'o/a')).toBe(true);
    expect(isWorkKey('summary:o/ab', 'o/a')).toBe(false);
    const list = [{ full_name: 'o/a' }, { full_name: 'o/b' }];
    expect(listed(list, ['o/b', 'o/z'])).toEqual({ shown: [{ full_name: 'o/a' }], off: [{ full_name: 'o/b' }] });
    expect(listed(list, [])).toEqual({ shown: list, off: [] });
  });
  // NFR-SEC-16
  test('keptAfterForget: nothing, but what the drafts kept need', () => {
    expect(keptAfterForget('edits:o/a', true)).toBe(true);
    expect(keptAfterForget('owner', true)).toBe(true);
    expect(keptAfterForget('summary:o/a', true)).toBe(false);
    expect(keptAfterForget('edits:o/a', false)).toBe(false);
    expect(keptAfterForget('owner', false)).toBe(false);
  });
});
