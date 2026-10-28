import { describe, test, expect } from 'vitest';
import {
  byUpdated,
  adminFailure,
  adminSaid,
  askById,
  idToKeep,
  importName,
  isRepoPath,
  madeUnread,
  mayHold,
  newWorkProblem,
  renameStep,
  rowFailure,
  sameRows,
  visibilityOf,
  workRow,
  worksSkeleton,
  isWorkKey,
  keptAfterForget,
  listed,
  movedKey,
  newWorkFiles,
  offered,
  repoName,
  stillHolds,
  summaryOf,
  visibilityTag,
  whereIs,
  withWork,
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
    expect(adminFailure(401, 'Bad credentials')).toMatch(/^このトークンは使用できません/);
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
  // FR-WORK-01
  test('withWork: put on this device’s list once, at its end; one already on it replaced in its place', () => {
    const list = [
      { full_name: 'o/a', default_branch: 'main' },
      { full_name: 'o/b', default_branch: 'main' },
    ];
    expect(withWork(list, { full_name: 'o/c', default_branch: 'main' }).map(r => r.full_name)).toEqual(['o/a', 'o/b', 'o/c']);
    expect(withWork(list, { full_name: 'o/a', default_branch: 'draft' })).toEqual([
      { full_name: 'o/a', default_branch: 'draft' },
      { full_name: 'o/b', default_branch: 'main' },
    ]);
    expect(withWork([], { full_name: 'o/a', default_branch: 'main' })).toEqual([{ full_name: 'o/a', default_branch: 'main' }]);
  });
  // FR-WORK-03
  test('offered: the repositories the token can write to that the list does not show', () => {
    const all = [
      { full_name: 'o/a', permissions: { push: true } },
      { full_name: 'o/b', permissions: { push: true } },
      { full_name: 'x/tools', permissions: { push: false } },
      { full_name: 'x/none' },
    ];
    expect(offered(all, ['o/a']).map(r => r.full_name)).toEqual(['o/b']);
    expect(offered(all, [])).toEqual(all.slice(0, 2));
  });
  // NFR-SEC-16
  // NFR-SEC-16, FR-GH-12: the drafts kept at ログアウト keep what they need to be sent: their keys of novel.toml, whose
  // they are, and their repository's ID (another repository under the old name is not sent to)
  test('keptAfterForget: nothing, but what the drafts kept need', () => {
    expect(keptAfterForget('edits:o/a', true)).toBe(true);
    expect(keptAfterForget('owner', true)).toBe(true);
    expect(keptAfterForget('id:o/a', true)).toBe(true);
    expect(keptAfterForget('id:o/a', false)).toBe(false);
    expect(keptAfterForget('summary:o/a', true)).toBe(false);
    expect(keptAfterForget('edits:o/a', false)).toBe(false);
    expect(keptAfterForget('owner', false)).toBe(false);
  });
  // FR-WORK-01: the list in the server version's order (its shelf: the latest changed first)
  test('byUpdated: the latest changed first; a work not summed up yet after the others, in the order it was opened', () => {
    const list = [{ full_name: 'o/a' }, { full_name: 'o/b' }, { full_name: 'o/c' }, { full_name: 'o/d' }];
    const kept = new Map([
      ['o/a', { updated: 10 }],
      ['o/c', { updated: 30 }],
      ['o/d', { updated: 10 }],
    ]);
    expect(byUpdated(list, kept).map(r => r.full_name)).toEqual(['o/c', 'o/a', 'o/d', 'o/b']);
    expect(byUpdated([], kept)).toEqual([]);
  });
});

// FR-WORK-01, FR-GH-11: a row of the list of works
describe('the list of works on the screen', () => {
  const r = { full_name: 'kuro/sora<', default_branch: 'main', visibility: 'public' };
  const now = Date.parse('2026-10-27T05:00:00Z');
  /** @type {import('../../lib/works.js').Summary} */
  const s = { title: '電脳<', chars: 12000, count: 3, updated: now - 60000, branch: 'draft', chosen: '', heads: [], overlay: false };
  test('workRow: read (title, length, episodes, last change, the branch in use), or not yet (the name); failed; what is happening', () => {
    const row = workRow(r, s, '読み込み中…<', true, now);
    expect(row).toContain('<b>電脳&lt;</b><small>12,000 字 ・ 3 話 ・ 最終更新 ');
    expect(row).toContain('（1 分前） ・ GitHub kuro/sora&lt;（draft） <span class="vis public"');
    expect(row).toContain(' ・ 送信失敗 ・ 読み込み中…&lt;</small>');
    const bare = workRow(r, null, '', false, now);
    expect(bare).toBe(`<b>sora&lt;</b><small>GitHub kuro/sora&lt;（main） ${visibilityTag(r)}</small>`);
    expect(workRow(r, s, '', false)).toContain('最終更新');
  });
  test('visibilityOf: as GitHub gives it, or from private', () => {
    expect(visibilityOf({ full_name: 'a/b', default_branch: 'm', visibility: 'internal', private: true })).toBe('internal');
    expect(visibilityOf({ full_name: 'a/b', default_branch: 'm', private: true })).toBe('private');
    expect(visibilityOf({ full_name: 'a/b', default_branch: 'm' })).toBe('public');
  });
  test('sameRows, worksSkeleton: the rows kept while they are the list’s, in order; else made again; none said', () => {
    const list = [r, { ...r, full_name: 'kuro/b' }];
    expect(sameRows(['kuro/sora<', 'kuro/b'], list)).toBe(true);
    expect(sameRows(['kuro/b', 'kuro/sora<'], list)).toBe(false);
    expect(sameRows(['kuro/sora<'], list)).toBe(false);
    expect(sameRows([], [])).toBe(false);
    expect(worksSkeleton(2)).toBe('<button class="work" data-repo=""></button><button class="work" data-repo=""></button>');
    expect(worksSkeleton(0)).toContain('まだ作品がありません');
  });
  test('mayHold: kept, read with the same branch chosen, no change not sent then or now', () => {
    expect(mayHold(s, '', false)).toBe(true);
    expect(mayHold(undefined, '', false)).toBe(false);
    expect(mayHold(s, '', true)).toBe(false);
    expect(mayHold({ ...s, overlay: true }, '', false)).toBe(false);
    expect(mayHold(s, 'draft', false)).toBe(false);
  });
  test('rowFailure: an empty repository; a summary kept, nothing; else why', () => {
    expect(rowFailure(409, true, 'x')).toBe('空のリポジトリです（開くと作品として始められます）');
    expect(rowFailure(404, true, 'x')).toBe('');
    expect(rowFailure(null, false, 'GitHub につながりません')).toBe('GitHub につながりません');
  });
  // FR-WORK-03
  test('importName, isRepoPath: owner/name from what is typed; owner/name or not', () => {
    expect(importName('  https://github.com/kuro/sora.git ')).toBe('kuro/sora');
    expect(importName('kuro/sora')).toBe('kuro/sora');
    expect(isRepoPath('kuro/sora')).toBe(true);
    expect(isRepoPath('sora')).toBe(false);
    expect(isRepoPath('kuro/so ra')).toBe(false);
    expect(isRepoPath('a/b/c')).toBe(false);
  });
});
// FR-WORK-02, FR-GH-10, FR-GH-12: the repository made, renamed, and where it is now
describe('the repository', () => {
  test('newWorkProblem: the title, a name GitHub takes, the token', () => {
    expect(newWorkProblem({ title: '', name: 'a', admin: 't' })).toBe('題名を入れてください');
    expect(newWorkProblem({ title: '空', name: null, admin: 't' })).toBe('リポジトリ名は、英数字と . _ - で 100 文字までにしてください');
    expect(newWorkProblem({ title: '空', name: 'a', admin: '' })).toContain('Administration の権限を付けたトークンを入れてください（作成するときだけ');
    expect(newWorkProblem({ title: '空', name: 'a', admin: 't' })).toBe('');
  });
  test('madeUnread: on the author’s account (install the App), or an organization’s (cannot be opened)', () => {
    expect(madeUnread('kuro/a', true)).toContain('kuro/a（非公開）を作りました。GitHub App がこのリポジトリにインストールされていないため');
    expect(madeUnread('org/a', false)).toContain('組織のこのリポジトリは Novel Desk では開けません');
  });
  test('renameStep: a name GitHub would not take; the same name; no token; else renamed', () => {
    expect(renameStep({ name: null, now: 'a', admin: 't' })).toEqual({ say: 'リポジトリ名は、英数字と . _ - で 100 文字までにしてください' });
    expect(renameStep({ name: 'a', now: 'a', admin: '' })).toEqual({ close: true });
    expect(renameStep({ name: 'b', now: 'a', admin: '' })).toEqual({
      say: 'Administration の権限を付けたトークンを入れてください（名前を変えるときだけ使い、この端末には残しません）',
    });
    expect(renameStep({ name: 'b', now: 'a', admin: 't' })).toEqual({ go: 'b' });
  });
  test('adminSaid: GitHub’s refusal explained; not reached or not GitHub’s, as said', () => {
    expect(adminSaid(401, 'x')).toBe(adminFailure(401, 'x'));
    expect(adminSaid(0, 'オフライン')).toBe('オフライン');
    expect(adminSaid(null, 'エラー')).toBe('エラー');
  });
  test('askById, idToKeep: looked for by its ID when the name gives another; the ID kept the first time it is seen', () => {
    const meta = { id: 5, full_name: 'a/b', default_branch: 'main' };
    expect(askById(0, meta)).toBe(false);
    expect(askById(5, meta)).toBe(false);
    expect(askById(6, meta)).toBe(true);
    expect(askById(6, null)).toBe(true);
    expect(idToKeep({ kind: 'same', meta }, 0)).toBe(5);
    expect(idToKeep({ kind: 'same', meta }, 5)).toBe(null);
    expect(idToKeep({ kind: 'moved', meta }, 0)).toBe(null);
    expect(idToKeep({ kind: 'same', meta: null }, 0)).toBe(null);
  });
});
