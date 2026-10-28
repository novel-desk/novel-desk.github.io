// The desk as the screen shows it (lib/desk.js)
import { describe, test, expect } from 'vitest';
import * as dk from '../../lib/desk.js';
import { CONFLICT_MARK, OTHER_DEVICE_MARK } from '../../lib/merge.js';
import { firstLayout, tableOfContents, episodesOf } from '../../lib/layout.js';
import { visibilityTag } from '../../lib/works.js';
import { whenLong } from '../../lib/format.js';

const blobs = { 'ep/01.md': { sha: 's1', mode: '100644' }, 'ep/02.md': { sha: 's2', mode: '100644' } };
/** @param {any[]} list */
const map = list => new Map(list.map(d => [d.path, d]));

describe('where the text open is kept', () => {
  // FR-SAVE-05, FR-SAVE-07, FR-NOTE-04: both versions said first; a draft not sent; else nothing
  test('noteStateSaid: both versions side by side, a draft, nothing', () => {
    expect(dk.hasConflict(`前\n${CONFLICT_MARK}端末の版 ―――\n後`)).toBe(true);
    expect(dk.hasConflict('本文')).toBe(false);
    expect(dk.noteStateSaid(`${CONFLICT_MARK}`, true)).toBe(dk.BOTH_SAID);
    expect(dk.BOTH_SAID).toBe('両方の版が並んでいます。「――― ここから」の行を探して整理してください');
    expect(dk.noteStateSaid('本文', true)).toBe('端末に保存済み（未送信）');
    expect(dk.noteStateSaid('本文', false)).toBe('');
  });
});

// FR-TOC-01, FR-TOC-04, FR-TOC-05, FR-TOC-07, FR-GH-05, FR-GH-08: the table of contents
describe('the table of contents', () => {
  const l = { ...firstLayout(), dir: 'ep' };
  const toc = tableOfContents(l, ['ep/01.md', 'ep/2_章/01.md', 'ep/2_章/02.md'], ['ep/2_章']);
  const texts = { 'ep/01.md': `一話<${CONFLICT_MARK}`, 'ep/2_章/01.md': '二の一', 'ep/2_章/02.md': null };
  /** @param {string} p */
  const textOf = p => texts[p] ?? null;
  /** @param {string} rel */
  const titleAt = rel => `題:${rel}`;
  test('unsentCount: the drafts, and novel.toml’s keys once', () => {
    expect(dk.unsentCount(map([{ path: 'a.md' }]), [{}])).toBe(2);
    expect(dk.unsentCount(map([{ path: 'novel.toml' }]), [{}])).toBe(1);
    expect(dk.unsentCount(map([{ path: 'a.md' }]), [])).toBe(1);
  });
  test('briefOf: nothing unread or not synced; 送信失敗, 未送信, 送信済み', () => {
    expect(dk.briefOf({ read: false, mode: 'auto', bad: false, unsent: 1 })).toEqual({ className: 'muted small', text: '' });
    expect(dk.briefOf({ read: true, mode: 'off', bad: true, unsent: 1 })).toEqual({ className: 'small err', text: '' });
    expect(dk.briefOf({ read: true, mode: 'auto', bad: true, unsent: 0 }).text).toBe('・送信失敗');
    expect(dk.briefOf({ read: true, mode: 'manual', bad: false, unsent: 2 }).text).toBe('・未送信');
    expect(dk.briefOf({ read: true, mode: 'auto', bad: false, unsent: 0 }).text).toBe('・送信済み');
  });
  test('sendButton: … while sending; not pressed with nothing to send or stopped; how many', () => {
    expect(dk.sendButton({ busy: true, unsent: 2, stopped: false })).toEqual({ disabled: true, text: '…' });
    expect(dk.sendButton({ busy: false, unsent: 0, stopped: false })).toEqual({ disabled: true, text: '送る' });
    expect(dk.sendButton({ busy: false, unsent: 2, stopped: true })).toEqual({ disabled: true, text: '送る（2）' });
    expect(dk.sendButton({ busy: false, unsent: 2, stopped: false })).toEqual({ disabled: false, text: '送る（2）' });
  });
  test('charsOfAll: the episodes’ lengths, one not read as nothing', () => {
    expect(dk.charsOfAll(episodesOf(toc), textOf)).toBe([...`一話<${CONFLICT_MARK}`.replace(/\s/g, '')].length + 3);
  });
  test('tocHtml: episodes and chapters, the open one active, tags, lengths; a folded chapter closed unless it holds the one open', () => {
    const html = dk.tocHtml({ toc, titleAt, textOf, drafts: new Set(['ep/01.md']), current: 'ep/01.md', ordering: false, closed: new Set(['ep/2_章']) });
    expect(html).toContain(
      '<div class="node episode active" role="button" tabindex="0" data-path="ep/01.md" data-node="ep/01.md" draggable="false"><span class="t">題:01.md</span><span class="unsent-tag">未送信</span><span class="conflict"',
    );
    expect(html).toContain(
      '<div class="node chapter" role="button" tabindex="0" data-fold="ep/2_章" data-node="ep/2_章" draggable="false"><span class="fold">▸</span><span class="t">題:2_章</span><span class="c">3</span>',
    );
    expect(html).toContain('<div class="chapter-body closed">');
    expect(html).toContain(
      'data-path="ep/2_章/02.md" data-node="ep/2_章/02.md" draggable="false"><span class="t">題:2_章/02.md</span><span class="u"></span><span class="c">0</span>',
    );
    expect(html).toContain('<button data-rename-chapter="ep/2_章" title="章の題名を変更" aria-label="章の題名を変更">✎</button>');
    expect(html).toContain(
      '<select data-to-chapter data-path="ep/01.md" aria-label="移動先の章"><option value="">章なし</option><option value="ep/2_章">題:2_章</option></select>',
    );
    expect(html).toContain('<option value="ep/2_章" selected>題:2_章</option>');
    const open = dk.tocHtml({ toc, titleAt, textOf, drafts: new Set(), current: 'ep/2_章/01.md', ordering: true, closed: new Set(['ep/2_章']) });
    expect(open).toContain('<div class="chapter-body">');
    expect(open).toContain('draggable="true"');
    expect(open).not.toContain('unsent-tag');
    expect(dk.tocHtml({ toc, titleAt, textOf, drafts: new Set(), current: '', ordering: false, closed: new Set() })).toContain('<span class="fold">▾</span>');
    const flat = dk.tocHtml({ toc: tableOfContents(l, ['ep/01.md']), titleAt, textOf, drafts: new Set(), current: '', ordering: false, closed: new Set() });
    expect(flat).not.toContain('<select');
  });
  test('repoLink, workTitleOf, lastChange: the repository at its branch with its visibility; the title; the last change', () => {
    const r = { visibility: 'public' };
    expect(dk.repoLink('kuro/a<', 'feat/x', r)).toBe(
      `<a href="https://github.com/kuro/a&lt;/tree/feat%2Fx" target="_blank" rel="noopener">kuro/a&lt;</a>${visibilityTag(r)}`,
    );
    expect(dk.workTitleOf('作品', 'kuro/a')).toBe('作品');
    expect(dk.workTitleOf('', 'kuro/a')).toBe('a');
    expect(dk.lastChange(100, [{ at: 50 }, { at: 300 }])).toBe(300);
    expect(dk.lastChange(0, [])).toBe(0);
  });
  test('toggled, dropClass, chapterWith: a chapter folded and opened; an episode into a chapter, else before; the chapter of the one open', () => {
    expect(dk.toggled(['a'], 'b')).toEqual(['a', 'b']);
    expect(dk.toggled(['a', 'b'], 'a')).toEqual(['b']);
    expect(dk.dropClass(true, 'ep/01.md')).toBe('drop-into');
    expect(dk.dropClass(true, 'ep/2_章')).toBe('drop-before');
    expect(dk.dropClass(false, 'ep/01.md')).toBe('drop-before');
    expect(dk.chapterWith(toc, 'ep/2_章/02.md')).toBe('ep/2_章');
    expect(dk.chapterWith(toc, 'ep/01.md')).toBe('');
  });
});

// FR-EDIT-01, FR-EDIT-02, FR-SAVE-07: the episode open
describe('the episode open', () => {
  test('neighborOf: before and after the one open, with its title; none at the ends, none open', () => {
    const eps = [
      { type: 'episode', path: 'a', rel: 'a' },
      { type: 'episode', path: 'b', rel: 'b' },
    ];
    expect(dk.neighborOf(eps, 'a', 1, r => r.toUpperCase())).toEqual({ path: 'b', title: 'B' });
    expect(dk.neighborOf(eps, 'a', -1, r => r)).toBe(null);
    expect(dk.neighborOf(eps, '', 1, r => r)).toBe(null);
  });
  test('saveSaid, episodeChars, onGitHubOf: both versions first; none open; where it is kept; the length', () => {
    const s = { text: '本文', current: 'a', draft: false, failed: false, onGitHub: true };
    expect(dk.saveSaid({ ...s, text: CONFLICT_MARK })).toBe(dk.BOTH_SAID);
    expect(dk.saveSaid({ ...s, current: '' })).toBe('');
    expect(dk.saveSaid(s)).toBe('GitHub に保存済み');
    expect(dk.episodeChars('a', '本 文')).toBe('2');
    expect(dk.episodeChars('', '本文')).toBe('0');
    const w = { offline: false, blobs };
    expect(dk.onGitHubOf(w, 'auto', 'ep/01.md')).toBe(true);
    expect(dk.onGitHubOf(null, 'auto', 'ep/01.md')).toBe(false);
    expect(dk.onGitHubOf({ ...w, offline: true }, 'auto', 'ep/01.md')).toBe(false);
    expect(dk.onGitHubOf(w, 'off', 'ep/01.md')).toBe(false);
    expect(dk.onGitHubOf(w, 'auto', 'ep/09.md')).toBe(false);
  });
  test('updatedOf, updatedSaid: written here, else the last commit known (0 not known); said when known', () => {
    const changed = new Map([[dk.changedKey('ep/01.md', 's1'), 500]]);
    expect(dk.changedKey('a', 'b')).toBe('a\nb');
    expect(dk.updatedOf({ at: 900 }, blobs['ep/01.md'], changed, 'ep/01.md')).toBe(900);
    expect(dk.updatedOf(undefined, blobs['ep/01.md'], changed, 'ep/01.md')).toBe(500);
    expect(dk.updatedOf(undefined, blobs['ep/02.md'], changed, 'ep/02.md')).toBe(0);
    expect(dk.updatedOf(undefined, undefined, changed, 'x')).toBe(0);
    const now = Date.parse('2026-10-27T05:00:00Z');
    expect(dk.updatedSaid('a', now - 60000, now)).toBe(`最終更新 ${whenLong(now - 60000, now)}`);
    expect(dk.updatedSaid('', 5, now)).toBe('');
    expect(dk.updatedSaid('a', 0, now)).toBe('');
    expect(dk.updatedSaid('a', 5)).toContain('最終更新');
  });
  test('askKey, changedKept: asked once a blob, not offline, not with a draft; only the files there now kept', () => {
    const w = { offline: false, blobs };
    expect(dk.askKey(w, new Set(), 'ep/01.md', [new Set()])).toBe('ep/01.md\ns1');
    expect(dk.askKey(w, new Set(), 'ep/09.md', [])).toBe(null);
    expect(dk.askKey({ ...w, offline: true }, new Set(), 'ep/01.md', [])).toBe(null);
    expect(dk.askKey(w, new Set(['ep/01.md']), 'ep/01.md', [])).toBe(null);
    expect(dk.askKey(w, new Set(), 'ep/01.md', [new Set(), new Set(['ep/01.md\ns1'])])).toBe(null);
    const changed = new Map([
      ['ep/01.md\ns1', 5],
      ['ep/01.md\nold', 3],
    ]);
    expect(dk.changedKept(changed, blobs)).toEqual({ 'ep/01.md\ns1': 5 });
  });
  test('episodeNote: none when it opens; not on the device offline; not UTF-8', () => {
    expect(dk.episodeNote('本文', true)).toEqual({ hidden: true, text: '' });
    expect(dk.episodeNote(null, true)).toEqual({ hidden: false, text: 'この話はまだこの端末に読み込まれていません（つながってから開いてください）' });
    expect(dk.episodeNote(null, false)).toEqual({ hidden: false, text: '文字コードが UTF-8 ではないため開けません' });
  });
  test('nextDraft: typed over an operation’s file; a draft from the blob first written from; back to the text read, none', () => {
    const o = { repo: 'o/r', path: 'a.md', sha: 'sa', read: '読んだ', text: '書いた', at: 9 };
    expect(dk.nextDraft({ repo: 'o/r', path: 'a.md', base: '', sha: 'x', op: 'op1', at: 1 }, o)).toEqual({
      repo: 'o/r',
      path: 'a.md',
      base: '',
      op: 'op1',
      text: '書いた',
      at: 9,
    });
    expect(dk.nextDraft({ repo: 'o/r', path: 'a.md', base: 'old', text: 'x', at: 1 }, o)).toEqual({
      repo: 'o/r',
      path: 'a.md',
      base: 'old',
      text: '書いた',
      at: 9,
    });
    expect(dk.nextDraft(undefined, o)).toEqual({ repo: 'o/r', path: 'a.md', base: 'sa', text: '書いた', at: 9 });
    expect(dk.nextDraft(undefined, { ...o, text: '読んだ' })).toBe(null);
  });
  test('episodeRows: path, title and length', () => {
    expect(
      dk.episodeRows(
        [{ type: 'episode', path: 'a', rel: 'r' }],
        r => `T${r}`,
        () => null,
      ),
    ).toEqual([{ path: 'a', rel: 'r', title: 'Tr', chars: 0 }]);
    expect(
      dk.episodeRows(
        [{ type: 'episode', path: 'a', rel: 'r' }],
        r => r,
        () => 'あい',
      )[0].chars,
    ).toBe(2);
  });
});

// FR-TOC-02〜06, FR-NOTE-05, FR-EDIT-07, FR-WORK-04: the operations
describe('the operations', () => {
  const w = { repo: 'o/r', blobs };
  const stamp = { op: 'op1', at: 9 };
  test('planChanges: moved; a heading renamed in a file of the branch is a draft (or none, back to what was read)', () => {
    const plan = { moves: [['ep/02.md', 'ep/03.md']], writes: [{ path: 'ep/01.md', text: '# 新\n' }], edits: [], path: '' };
    const { changes, merged } = dk.planChanges(w, new Map(), blobs, plan, stamp, () => '# 旧\n');
    expect(changes.get('ep/01.md')).toEqual({ repo: 'o/r', path: 'ep/01.md', base: 's1', text: '# 新\n', at: 9 });
    expect(changes.get('ep/03.md')).toMatchObject({ sha: 's2', op: 'op1' });
    expect(merged.size).toBe(0);
    const back = dk.planChanges(w, map([{ repo: 'o/r', path: 'ep/01.md', base: 's0', text: 'x', at: 1 }]), blobs, plan, stamp, () => '# 新\n');
    expect(back.changes.has('ep/01.md')).toBe(false);
  });
  test('planChanges: a new file, bytes, a bound text (auto), a text into a file moved there or an operation’s', () => {
    const bytes = new Uint8Array([1]);
    const plan = {
      moves: [['ep/02.md', 'ep/01x.md']],
      writes: [
        { path: 'ep/new.md', text: '新しい' },
        { path: 'img/a.png', bytes },
        { path: 'ep/02.md', text: 'リンク', bound: true },
        { path: 'ep/01x.md', text: '移した所に' },
      ],
      edits: [],
      path: '',
    };
    const shown = { ...blobs, 'ep/01x.md': { sha: 's2', mode: '100644' } };
    const opDraft = { repo: 'o/r', path: 'ep/01.md', base: 's1', text: 't', op: 'op0', at: 1 };
    const { changes, merged } = dk.planChanges(
      w,
      map([opDraft]),
      shown,
      { ...plan, writes: [...plan.writes, { path: 'ep/01.md', text: '操作の上に' }] },
      stamp,
      () => '',
    );
    expect(changes.get('ep/new.md')).toMatchObject({ text: '新しい', op: 'op1' });
    expect(changes.get('img/a.png')).toMatchObject({ bytes, op: 'op1' });
    expect(changes.get('ep/02.md')).toMatchObject({ text: 'リンク', auto: true });
    expect(changes.get('ep/01x.md')).toMatchObject({ text: '移した所に', op: 'op1' });
    expect(changes.get('ep/01.md')).toMatchObject({ text: '操作の上に', op: 'op1' });
    expect(merged.has('op0')).toBe(true);
  });
  test('openAfter: the one asked; where the open one moved; the open one; none; the place kept when it is the one open', () => {
    const has = (/** @type {string} */ p) => ['a', 'b', 'c'].includes(p);
    expect(dk.openAfter({ moves: [], current: 'a', open: 'c', has })).toEqual({ next: 'c', keepsPlace: false });
    expect(dk.openAfter({ moves: [['a', 'b']], current: 'a', open: undefined, has })).toEqual({ next: 'b', keepsPlace: true });
    expect(dk.openAfter({ moves: [['a', 'x']], current: 'a', open: undefined, has })).toEqual({ next: 'a', keepsPlace: true });
    expect(dk.openAfter({ moves: [], current: 'z', open: undefined, has })).toEqual({ next: '', keepsPlace: false });
  });
  test('afterTrash: the one before; the first for the first; none for the only one', () => {
    const eps = [{ path: 'a' }, { path: 'b' }, { path: 'c' }];
    expect(dk.afterTrash(eps, eps[2])).toBe('b');
    expect(dk.afterTrash(eps, eps[0])).toBe('b');
    expect(dk.afterTrash([eps[0]], eps[0])).toBe('');
  });
  test('changedTitle, workTitleTyped: a chapter’s title as typed; the work’s title trimmed, or shown again', () => {
    expect(dk.changedTitle(' 新 ', '旧')).toBe(' 新 ');
    expect(dk.changedTitle(null, '旧')).toBe(null);
    expect(dk.changedTitle('  ', '旧')).toBe(null);
    expect(dk.changedTitle('旧', '旧')).toBe(null);
    expect(dk.workTitleTyped(' 新 ', '旧', 'k/a')).toEqual({ keep: '新' });
    expect(dk.workTitleTyped(' ', '旧', 'k/a')).toEqual({ shown: '旧' });
    expect(dk.workTitleTyped('旧', '旧', 'k/a')).toEqual({ shown: '旧' });
    expect(dk.workTitleTyped('', '', 'k/a')).toEqual({ shown: 'a' });
  });
});

// FR-EDIT-07, FR-WORK-03, FR-SAVE-01: the texts as shown, and the pictures
describe('the texts as shown', () => {
  test('pictureKeyOf: added here by its bytes; else its blob; none', () => {
    expect(dk.pictureKeyOf({ bytes: new Uint8Array(), at: 7 }, blobs, 'img/a.png')).toBe('here:img/a.png:7');
    expect(dk.pictureKeyOf(undefined, blobs, 'ep/01.md')).toBe('s1');
    expect(dk.pictureKeyOf({ at: 1 }, blobs, 'x.png')).toBe('');
  });
  test('textsOf, remoteTextOf, shasOf, movedShas: a change’s text or the blob it moved; else read, by path or blob; none', () => {
    const files = { ...blobs, 'ep/03.md': { sha: 's3', mode: '100644' }, 'ep/04.md': { sha: 's4', mode: '100644' }, 'ep/05.md': { sha: 's5', mode: '100644' } };
    const drafts = map([
      { path: 'ep/01.md', text: '書いた' },
      { path: 'ep/03.md', sha: 's1' },
      { path: 'ep/05.md', sha: 'gone' },
    ]);
    const work = { texts: { 'ep/02.md': '読んだ' }, shaTexts: { s1: '一の blob', s4: '四' }, blobs };
    expect(dk.textsOf(['ep/01.md', 'ep/02.md', 'ep/03.md', 'ep/04.md', 'ep/05.md', 'ep/09.md'], files, drafts, work)).toEqual({
      'ep/01.md': '書いた',
      'ep/02.md': '読んだ',
      'ep/03.md': '一の blob',
      'ep/04.md': '四',
      'ep/05.md': null,
      'ep/09.md': null,
    });
    expect(dk.textsOf(['ep/02.md'], { 'ep/02.md': { sha: 'sx', mode: '' } }, new Map(), { texts: {}, shaTexts: {} })).toEqual({ 'ep/02.md': null });
    expect(dk.remoteTextOf(work, 'ep/02.md')).toBe('読んだ');
    expect(dk.remoteTextOf(work, 'ep/01.md')).toBe('一の blob');
    expect(dk.remoteTextOf(work, 'ep/09.md')).toBe('');
    expect(dk.shasOf(['ep/01.md', 'ep/09.md', 'x'], { ...blobs, x: { sha: '', mode: '' } })).toEqual(['s1']);
    expect(dk.movedShas([{ sha: 'a' }, { sha: 'b', text: 't' }, { text: 'c' }])).toEqual(['a']);
  });
  test('convertedPaths: the episodes and notes read from another encoding, with no draft', () => {
    const layout = { ...firstLayout(), dir: 'ep', notes: 'notes' };
    const files = {
      'ep/01.md': { sha: 'j1', mode: '' },
      'ep/02.md': { sha: 'j2', mode: '' },
      'notes/a.md': { sha: 'j3', mode: '' },
      'README.md': { sha: 'j4', mode: '' },
      'ep/03.md': { sha: 'u', mode: '' },
    };
    expect(dk.convertedPaths({ files, layout }, new Set(['j1', 'j2', 'j3', 'j4']), new Set(['ep/02.md']))).toEqual(['ep/01.md', 'notes/a.md']);
  });
});

// FR-GH-04, FR-GH-05, FR-GH-07, FR-GH-12, FR-SAVE-03, FR-SAVE-04, FR-SAVE-08, NFR-USE-01: reading and sending
describe('reading and sending', () => {
  test('readSaid: not synced; offline; read, with when', () => {
    expect(dk.readSaid('off', true, '10:00')).toEqual([
      '同期しない設定です。GitHub へ送ることも、GitHub から取り込むこともしません（この端末で前に読んだ版に書きます）',
      '',
    ]);
    expect(dk.readSaid('auto', true, '10:00')).toEqual(['オフラインです。前に読んだ版を出しています（送るのはつながってから）', 'err']);
    expect(dk.readSaid('auto', false, '10:00')).toEqual(['GitHub から読みました（10:00）', 'ok']);
  });
  test('keptToOpen, openAfterRead: the work kept of the branch chosen; the episode open, the last one, the first, none', () => {
    expect(dk.keptToOpen({ branch: 'main' }, '')).toBe(true);
    expect(dk.keptToOpen({ branch: 'main' }, 'main')).toBe(true);
    expect(dk.keptToOpen({ branch: 'main' }, 'dev')).toBe(false);
    expect(dk.keptToOpen(null, '')).toBe(false);
    expect(dk.openAfterRead(['a', 'b'], 'b', 'a')).toBe('b');
    expect(dk.openAfterRead(['a', 'b'], 'x', 'b')).toBe('b');
    expect(dk.openAfterRead(['a', 'b'], 'x', undefined)).toBe('a');
    expect(dk.openAfterRead([], 'x', 'y')).toBe('');
  });
  test('stopSaid, otherBranchSaid: another repository under the name; written on another branch', () => {
    expect(dk.stopSaid('k/a')).toContain('k/a は、つないだリポジトリとは別のリポジトリになっています');
    expect(dk.otherBranchSaid('dev', 'main')).toBe(
      'この端末の未送信の変更は、ブランチ dev で書いたものです。いまは main を開いているので、自動では送りません。dev に送るときは「⎇」で dev に切り替えてください（「送る」を押すと、いまのブランチに送るかを確かめます）',
    );
  });
  test('readsIn: read, idle, online, synced, on the work, in front', () => {
    const s = { read: true, busy: false, offline: false, mode: 'auto', onWork: true, visible: true };
    expect(dk.readsIn(s)).toBe(true);
    for (const k of /** @type {const} */ (['read', 'onWork', 'visible'])) expect(dk.readsIn({ ...s, [k]: false })).toBe(false);
    for (const k of /** @type {const} */ (['busy', 'offline'])) expect(dk.readsIn({ ...s, [k]: true })).toBe(false);
    expect(dk.readsIn({ ...s, mode: 'off' })).toBe(false);
  });
  test('openStep, autoSends: gone, the first; no draft, shown; else left; sent by itself while auto with something to send', () => {
    expect(dk.openStep('', false, false)).toBe('');
    expect(dk.openStep('a', false, false)).toBe('first');
    expect(dk.openStep('a', true, true)).toBe('');
    expect(dk.openStep('a', true, false)).toBe('show');
    expect(dk.autoSends('auto', 1)).toBe(true);
    expect(dk.autoSends('auto', 0)).toBe(false);
    expect(dk.autoSends('manual', 1)).toBe(false);
  });
  test('afterSent: sent and untouched, gone; typed since, kept from the blob; moved, there; refused, set aside as it is now', () => {
    const sentA = { repo: 'o/r', path: 'a.md', base: 's0', text: 'A', at: 1 };
    const typedB = { repo: 'o/r', path: 'b.md', base: 's0', text: 'B2', at: 2 };
    const sentB = { ...typedB, text: 'B', at: 1 };
    const sentC = { repo: 'o/r', path: 'c.md', base: 's0', text: 'C', at: 1 };
    const refusedD = { repo: 'o/r', path: 'd.md', base: 's0', text: 'D', at: 1 };
    const refusedE = { repo: 'o/r', path: 'e.md', base: 's0', text: 'E', at: 1 };
    const gone = { repo: 'o/r', path: 'g.md', base: 's0', text: 'G', at: 1 };
    const drafts = map([sentA, typedB, sentC, refusedD]);
    const { next, refused, went } = dk.afterSent(
      drafts,
      {
        refused: [refusedD, refusedE],
        sent: [
          { draft: sentA, to: 'a.md', blob: 'nA', both: false },
          { draft: sentB, to: 'b.md', blob: 'nB', both: false },
          { draft: sentC, to: 'x/c.md', blob: 'nC', both: false },
          { draft: gone, to: 'g.md', blob: 'nG', both: false },
        ],
      },
      () => '読んだ',
    );
    expect(refused).toEqual([refusedD]);
    expect([...next.keys()].sort()).toEqual(['b.md', 'g.md']);
    expect(next.get('b.md')).toMatchObject({ text: 'B2', base: 'nB' });
    expect(next.get('g.md')).toMatchObject({ text: '読んだ', base: 'nG' });
    expect(went).toEqual([['c.md', 'x/c.md']]);
  });
  test('afterSent: a text typed since, moved to the path of another sent: the other one sent does not take it off', () => {
    const c = { repo: 'o/r', path: 'c.md', base: 's0', text: 'C2', at: 2 };
    const b = { repo: 'o/r', path: 'b.md', base: 's0', text: 'B', at: 1 };
    const { next } = dk.afterSent(
      map([c, b]),
      {
        refused: [],
        sent: [
          { draft: { ...c, text: 'C' }, to: 'b.md', blob: 'nC', both: false },
          { draft: b, to: 'b.md', blob: 'nB', both: false },
        ],
      },
      () => '',
    );
    expect([...next.keys()]).toEqual(['b.md']);
    expect(next.get('b.md')).toMatchObject({ text: 'C2', base: 'nC' });
  });
  test('sentSaid, sendFailedSaid: both versions (said in a notice too); sent; nothing to send; why it failed', () => {
    expect(dk.sentSaid(['第1話', '第2話'], true, 'msg')).toEqual({
      text: '送りました。第1話、第2話はほかでも書き換えられていたので、両方の版を並べました（msg）',
      kind: 'err',
      toast: 'ほかでも書き換えられていた話があります。両方の版を並べました',
    });
    expect(dk.sentSaid([], false, 'msg')).toEqual({ text: '送りました（msg）', kind: 'ok', toast: '' });
    expect(dk.sentSaid([], false, '')).toEqual({ text: '送る変更はありませんでした（GitHub にもう同じ内容があります）', kind: 'ok', toast: '' });
    expect(dk.sendFailedSaid('overlapped', 'x')).toBe(
      'x。「再読み込み」で読み直してください（重なった話の追加・名前の変更・削除・並べ替えは取り消し、書いた文章は残します）',
    );
    expect(dk.sendFailedSaid('offline', 'x')).toBe('x。書いたものはこの端末に残っています');
    expect(dk.sendFailedSaid('other', 'x')).toBe('送れませんでした: x。書いたものはこの端末に残っています');
  });
});

// FR-SAVE-09: the texts set aside
describe('the texts set aside', () => {
  test('parkedName, parkedSaid: its heading, else its file; why they were set aside', () => {
    expect(dk.parkedName({ path: 'a.md', text: '# 題\n本文' })).toBe('題');
    expect(dk.parkedName({ path: 'a.md', text: '本文' })).toBe('a.md');
    expect(
      dk.parkedSaid(
        [
          { path: 'a.md', text: '# 題' },
          { path: 'b.md', text: '' },
        ],
        dk.MOVED,
      ),
    ).toBe(`「題」「b.md」は、${dk.MOVED}ので、書いた文章を送らずにこの端末に残しました。「未送信の一覧」で、送る・本文に入れる・捨てるを選べます`);
    expect(dk.TAKEN).toContain('取り消した操作の中で書いた文章');
  });
  test('draftsOf: this work’s drafts by path, and its texts set aside', () => {
    const kept = [
      { repo: 'o/r', path: 'a.md' },
      { repo: 'o/r', path: 'b.md', parked: 'why' },
      { repo: 'o/x', path: 'a.md' },
    ];
    const { drafts, parked } = dk.draftsOf(kept, 'o/r');
    expect([...drafts.keys()]).toEqual(['a.md']);
    expect(parked).toEqual([kept[1]]);
  });
  test('unparkRefusal, unparkText, unparkSentSaid: a draft at its place first; beside what is there; sent or not', () => {
    expect(dk.unparkRefusal('send', true)).toContain('まだ送っていない書きかけがあります');
    expect(dk.unparkRefusal('send', false)).toBe('');
    expect(dk.unparkRefusal('put', true)).toBe('');
    expect(dk.unparkText('私の', '')).toBe('私の');
    expect(dk.unparkText('私の', 'ほかの')).toBe(`私の\n\n${OTHER_DEVICE_MARK}\n\nほかの\n`);
    expect(dk.unparkSentSaid(1)).toBe('送信できませんでした。書いたものはこの端末に残っています');
    expect(dk.unparkSentSaid(0)).toBe('送信しました。GitHub の版と並べて残しています');
  });
});

// FR-SAVE-03, FR-GH-04, FR-GH-12, FR-SAVE-09: 自動's time, the files read against, the episode shown again
describe('more of the desk', () => {
  test('sendNowStep: sent by itself; not to another repository; written on another branch, said (自動 only)', () => {
    const s = { stopped: false, mode: /** @type {const} */ ('auto'), unsent: 1, offline: false, busy: false, elsewhere: 0 };
    expect(dk.sendNowStep(s)).toBe('send');
    expect(dk.sendNowStep({ ...s, stopped: true })).toBe('');
    expect(dk.sendNowStep({ ...s, elsewhere: 1 })).toBe('other');
    expect(dk.sendNowStep({ ...s, mode: 'manual', elsewhere: 1 })).toBe('');
  });
  test('readAgainst: the work last read of the same branch, else the files read now', () => {
    const now = { branch: 'main', blobs: { a: { sha: '2', mode: '' } } };
    const last = { branch: 'main', blobs: { a: { sha: '1', mode: '' } } };
    expect(dk.readAgainst(last, now)).toBe(last.blobs);
    expect(dk.readAgainst({ ...last, branch: 'dev' }, now)).toBe(now.blobs);
    expect(dk.readAgainst(undefined, now)).toBe(now.blobs);
  });
  test('openOrFirst: the one open while it is there; else the first; none', () => {
    expect(dk.openOrFirst(['a', 'b'], 'b')).toBe('b');
    expect(dk.openOrFirst(['a', 'b'], 'x')).toBe('a');
    expect(dk.openOrFirst(['a'], '')).toBe('a');
    expect(dk.openOrFirst([], 'x')).toBe('');
  });
});
