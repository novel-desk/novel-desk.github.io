import { describe, test, expect } from 'vitest';
import {
  afterTrash,
  briefOf,
  changedKey,
  episodeAfter,
  episodeToOpen,
  footState,
  hasConflict,
  neighborOf,
  readSaid,
  readText,
  sendButton,
  shownText,
  unsentCount,
  updatedOf,
} from '../../lib/desk.js';
import { CONFLICT_MARK } from '../../lib/merge.js';

/** @param {Record<string, object>} o @returns {Map<string, any>} */
const changes = o => new Map(Object.entries(o).map(([path, c]) => [path, { repo: 'o/r', path, base: '', at: 0, ...c }]));

describe('desk', () => {
  test('unsentCount: the files changed, novel.toml once for its keys set', () => {
    expect(unsentCount(new Map(), [])).toBe(0);
    expect(unsentCount(changes({ 'a.md': {}, 'b.md': {} }), [])).toBe(2);
    expect(unsentCount(changes({ 'a.md': {} }), [{ key: ['title'] }])).toBe(2);
    expect(unsentCount(changes({ 'novel.toml': {} }), [{ key: ['title'] }, { key: ['x'] }])).toBe(1);
  });
  test('briefOf: nothing without a work or not synced; 送信失敗, 未送信, 送信済み', () => {
    const s = { read: true, mode: /** @type {const} */ ('auto'), bad: false, unsent: 0 };
    expect(briefOf(s)).toBe('・送信済み');
    expect(briefOf({ ...s, unsent: 2 })).toBe('・未送信');
    expect(briefOf({ ...s, unsent: 2, bad: true })).toBe('・送信失敗');
    expect(briefOf({ ...s, read: false, bad: true })).toBe('');
    expect(briefOf({ ...s, mode: 'off', bad: true })).toBe('');
    expect(briefOf({ ...s, mode: 'manual', unsent: 1 })).toBe('・未送信');
  });
  // FR-GH-12: not pressed while another repository is under the work's name
  // B6: 「GitHub に送信」 under the text, only when something can go
  test('sendButton: the number to send; not pressed with none, while sending, or stopped; the one under the text', () => {
    const s = { busy: false, unsent: 3, stopped: false, mode: /** @type {const} */ ('auto') };
    expect(sendButton(s)).toEqual({ disabled: false, text: '送る（3）', foot: true });
    expect(sendButton({ ...s, unsent: 0 })).toEqual({ disabled: true, text: '送る', foot: false });
    expect(sendButton({ ...s, busy: true })).toEqual({ disabled: true, text: '…', foot: true });
    expect(sendButton({ ...s, stopped: true })).toEqual({ disabled: true, text: '送る（3）', foot: false });
    expect(sendButton({ ...s, mode: 'manual' }).foot).toBe(true);
    expect(sendButton({ ...s, mode: 'off' }).foot).toBe(false);
  });
  // FR-SAVE-07
  test('footState: both versions side by side first; where the open episode is kept; nothing with none open', () => {
    const s = { text: '本文', open: true, draft: false, failed: false, onGitHub: true };
    expect(footState(s)).toBe('GitHub に保存済み');
    expect(footState({ ...s, draft: true })).toBe('端末に保存済み（未送信）');
    expect(footState({ ...s, draft: true, failed: true })).toBe('届けられず、端末に保存済み');
    expect(footState({ ...s, open: false })).toBe('');
    // B6: a phone's width beside 「GitHub に送信」: in a word
    expect(footState({ ...s, draft: true, short: true })).toBe('未送信');
    expect(footState({ ...s, draft: true, failed: true, short: true })).toBe('送信失敗');
    expect(footState({ ...s, short: true })).toBe('GitHub に保存済み');
    expect(footState({ ...s, open: false, draft: true, short: true })).toBe('');
    expect(footState({ ...s, text: CONFLICT_MARK, draft: true, short: true })).toMatch(/^両方の版が並んでいます/);
    expect(footState({ ...s, text: `前\n${CONFLICT_MARK}\n後`, draft: true })).toMatch(/^両方の版が並んでいます/);
    expect(hasConflict(`a${CONFLICT_MARK}`)).toBe(true);
    expect(hasConflict('a')).toBe(false);
  });
  test('readSaid: 同期しない, offline, else read at the time', () => {
    expect(readSaid({ mode: 'off', offline: true, when: '10:00' })).toEqual({ text: expect.stringMatching(/^同期しない設定です/), kind: '' });
    expect(readSaid({ mode: 'auto', offline: true, when: '10:00' })).toEqual({ text: expect.stringMatching(/^オフラインです/), kind: 'err' });
    expect(readSaid({ mode: 'manual', offline: false, when: '10:00' })).toEqual({ text: 'GitHub から読みました（10:00）', kind: 'ok' });
  });
  test('neighborOf: the episode before or after the open one', () => {
    const paths = ['1.md', '2.md', '3.md'];
    expect(neighborOf(paths, '2.md', -1)).toBe('1.md');
    expect(neighborOf(paths, '2.md', 1)).toBe('3.md');
    expect(neighborOf(paths, '1.md', -1)).toBe('');
    expect(neighborOf(paths, '3.md', 1)).toBe('');
    expect(neighborOf(paths, '', 1)).toBe('');
  });
  test('episodeToOpen: the open one, else the last opened on the device, else the first', () => {
    const paths = ['1.md', '2.md'];
    expect(episodeToOpen(paths, '2.md', '1.md')).toBe('2.md');
    expect(episodeToOpen(paths, 'gone.md', '2.md')).toBe('2.md');
    expect(episodeToOpen(paths, 'gone.md', 'gone too.md')).toBe('1.md');
    expect(episodeToOpen(paths, '', undefined)).toBe('1.md');
    expect(episodeToOpen(paths, '', 2)).toBe('1.md');
    expect(episodeToOpen([], 'gone.md', 'gone.md')).toBe('');
  });
  test('episodeAfter: the one asked for, else where the open one moved, else the open one if still there', () => {
    const paths = ['1.md', '2.md'];
    expect(episodeAfter({ paths, current: '1.md', open: 'new.md' })).toBe('new.md');
    expect(episodeAfter({ paths, current: '1.md', open: '' })).toBe('');
    expect(episodeAfter({ paths, current: 'old.md', moved: '2.md' })).toBe('2.md');
    expect(episodeAfter({ paths, current: '1.md', moved: 'notes/x.md' })).toBe('1.md');
    expect(episodeAfter({ paths, current: '1.md' })).toBe('1.md');
    expect(episodeAfter({ paths, current: 'gone.md' })).toBe('');
  });
  test('afterTrash: the episode before the one trashed, else the first left', () => {
    expect(afterTrash(['1.md', '2.md', '3.md'], '3.md')).toBe('2.md');
    expect(afterTrash(['1.md', '2.md', '3.md'], '1.md')).toBe('2.md');
    expect(afterTrash(['1.md'], '1.md')).toBe('');
  });
  test('readText and shownText: as read from GitHub; as shown, the change not sent first', () => {
    const read = {
      blobs: { 'a.md': { sha: 'A', mode: '100644' }, 'b.md': { sha: 'B', mode: '100644' }, 'c.md': { sha: 'C', mode: '100644' } },
      texts: { 'a.md': 'a' },
      shaTexts: { B: 'b', M: 'moved' },
    };
    expect(readText(read, 'a.md')).toBe('a');
    expect(readText(read, 'b.md')).toBe('b');
    expect(readText(read, 'c.md')).toBe('');
    expect(readText(read, 'none.md')).toBe('');
    const files = { ...read.blobs, 'm.md': { sha: 'M', mode: '100644' }, 'n.md': { sha: 'N', mode: '100644' } };
    const drafts = changes({ 'a.md': { text: 'typed' }, 'm.md': { sha: 'M' }, 'n.md': { sha: 'N' } });
    expect(shownText(read, files, drafts, 'a.md')).toBe('typed');
    expect(shownText(read, files, drafts, 'm.md')).toBe('moved');
    expect(shownText(read, files, drafts, 'n.md')).toBe(null);
    expect(shownText(read, files, drafts, 'b.md')).toBe('b');
    expect(shownText(read, files, drafts, 'c.md')).toBe(null);
    expect(shownText(read, files, drafts, 'gone.md')).toBe(null);
  });
  // FR-EDIT-02
  test('updatedOf: written on this device, else its last commit for its blob, else 0', () => {
    const blobs = { 'a.md': { sha: 'A', mode: '100644' }, 'b.md': { sha: 'B', mode: '100644' } };
    const changed = new Map([[changedKey('a.md', 'A'), 100]]);
    expect(updatedOf(changes({ 'b.md': { at: 200 } }), blobs, changed, 'b.md')).toBe(200);
    expect(updatedOf(new Map(), blobs, changed, 'a.md')).toBe(100);
    expect(updatedOf(new Map(), blobs, changed, 'b.md')).toBe(0);
    expect(updatedOf(new Map(), blobs, changed, 'new.md')).toBe(0);
    expect(changedKey('a.md', 'A')).toBe('a.md\nA');
  });
});
