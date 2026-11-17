import { describe, test, expect } from 'vitest';
import {
  afterTrash,
  briefOf,
  changedEpisodes,
  changedKey,
  discardOf,
  discardOff,
  discardSaid,
  discardStep,
  episodeAfter,
  episodeToOpen,
  fileName,
  footState,
  hasConflict,
  heldCount,
  neighborOf,
  readInSaid,
  readSaid,
  readText,
  sendButton,
  sentSaid,
  shownText,
  unsentCount,
  updatedOf,
} from '../../lib/desk.js';
import { CONFLICT_MARK, END_MARK, MINE_MARK } from '../../lib/merge.js';

/** @param {Record<string, object>} o @returns {Map<string, any>} */
const changes = o => new Map(Object.entries(o).map(([path, c]) => [path, { repo: 'o/r', path, base: '', at: 0, ...c }]));

describe('desk', () => {
  test('unsentCount: the files changed, novel.toml once for its keys set', () => {
    expect(unsentCount(new Map(), [])).toBe(0);
    expect(unsentCount(changes({ 'a.md': {}, 'b.md': {} }), [])).toBe(2);
    expect(unsentCount(changes({ 'a.md': {} }), [{ key: ['title'] }])).toBe(2);
    expect(unsentCount(changes({ 'novel.toml': {} }), [{ key: ['title'] }, { key: ['x'] }])).toBe(1);
  });
  // what was read in from elsewhere names the episodes it changed
  test('changedEpisodes: the episodes whose blob is not the one before, added ones too', () => {
    const before = { 'a.md': { sha: '1', mode: '100644' }, 'b.md': { sha: '2', mode: '100644' } };
    const after = { 'a.md': { sha: '1', mode: '100644' }, 'b.md': { sha: '3', mode: '100644' }, 'c.md': { sha: '4', mode: '100644' } };
    expect(changedEpisodes(before, after, ['a.md', 'b.md', 'c.md'])).toEqual(['b.md', 'c.md']);
    expect(changedEpisodes(before, before, ['a.md', 'b.md'])).toEqual([]);
  });
  test('readInSaid: the titles, three at most; no episode changed said', () => {
    expect(readInSaid([])).toBe('ほかの端末の更新を読み込みました（話の本文は変わっていません）');
    expect(readInSaid(['はじまり'])).toBe('ほかの端末の更新を読み込みました（はじまり）');
    expect(readInSaid(['一', '二', '三'])).toBe('ほかの端末の更新を読み込みました（一、二、三）');
    expect(readInSaid(['一', '二', '三', '四'])).toBe('ほかの端末の更新を読み込みました（一、二 ほか 2 話）');
  });
  // B6: what went said in the toast too (pressed under the text, the state above 送る is not in sight)
  // FR-SAVE-05, DESK-SAVE-01: a text written elsewhere too said, sent or kept on the device, and how it goes
  test('sentSaid: what went, in the state and in the toast; nothing to send; taken in what was written elsewhere; kept on the device with places side by side', () => {
    const none = { merged: [], placed: [], left: [] };
    expect(sentSaid({ message: '10/27 はじまり ＋5字', ...none })).toEqual({
      text: '送りました（10/27 はじまり ＋5字）',
      kind: 'ok',
      toast: 'GitHub に送りました（10/27 はじまり ＋5字）',
    });
    expect(sentSaid({ message: '', ...none })).toEqual({
      text: '送る変更はありませんでした（GitHub にもう同じ内容があります）',
      kind: 'ok',
      toast: '送る変更はありませんでした（GitHub にもう同じ内容があります）',
    });
    expect(sentSaid({ message: '10/27 はじまり ＋5字、駅で ＋1字', ...none, merged: ['はじまり', '駅で'] })).toEqual({
      text: '送りました（10/27 はじまり ＋5字、駅で ＋1字）。「はじまり」「駅で」は、ほかの端末での変更を取り込みました',
      kind: 'ok',
      toast: 'GitHub に送りました（10/27 はじまり ＋5字、駅で ＋1字）。「はじまり」「駅で」は、ほかの端末での変更を取り込みました',
    });
    const tidy = '「――― ここから」の行を探して整理すると、次の送信で GitHub に送ります';
    const placed = '「駅で」は、ほかの端末での変更と同じ所を書き換えていたため、その所に両方の版を並べて、この端末に残しました（GitHub には送っていません）';
    expect(sentSaid({ message: '10/27 はじまり ＋5字', ...none, placed: ['駅で'] })).toEqual({
      text: `送りました（10/27 はじまり ＋5字）。${placed}。${tidy}`,
      kind: 'err',
      toast: `GitHub に送りました（10/27 はじまり ＋5字）。${placed}。${tidy}`,
    });
    expect(sentSaid({ message: '', merged: [], placed: ['駅で'], left: ['人物', '世界'] })).toEqual({
      text: `${placed}。「人物」「世界」は、両方の版を並べた所が残っているため、GitHub に送っていません。${tidy}`,
      kind: 'err',
      toast: `${placed}。「人物」「世界」は、両方の版を並べた所が残っているため、GitHub に送っていません。${tidy}`,
    });
    expect(sentSaid({ message: '', ...none, left: ['駅で'] }).text).toBe(`「駅で」は、両方の版を並べた所が残っているため、GitHub に送っていません。${tidy}`);
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
    expect(hasConflict(`a\n${END_MARK}\n`)).toBe(true);
    expect(hasConflict('a')).toBe(false);
  });
  // FR-SAVE-05, DESK-SAVE-01: a text sent or held back named: an episode by its title, else its heading, else its path
  test('fileName: an episode by its title; else by the heading of its text; else by its path', () => {
    expect(fileName('駅で', 'chapters/02.md', '# 第2話 駅で\n')).toBe('駅で');
    expect(fileName(undefined, 'notes/world.md', '# 世界観\n本文\n')).toBe('世界観');
    expect(fileName(undefined, 'notes/memo.txt', '見出しの無い本文\n')).toBe('notes/memo.txt');
  });
  // FR-SAVE-05, DESK-SAVE-01: a text held back goes only when 送る is pressed, which says why
  test('heldCount: the changes whose texts have places side by side (an operation without a text: not)', () => {
    expect(
      heldCount(changes({ 'a.md': { text: `前\n${MINE_MARK}\n` }, 'b.md': { text: '本文' }, 'c.md': { sha: 's1', op: 'op1' }, 'd.md': { text: END_MARK } })),
    ).toBe(2);
    expect(heldCount(new Map())).toBe(0);
  });
  test('readSaid: 同期しない, offline, else read at the time', () => {
    expect(readSaid({ mode: 'off', offline: true, when: '10:00' })).toEqual({ text: expect.stringMatching(/^同期しない設定です/), kind: '' });
    expect(readSaid({ mode: 'auto', offline: true, when: '10:00' })).toEqual({ text: expect.stringMatching(/^オフラインです/), kind: 'err' });
    expect(readSaid({ mode: 'manual', offline: false, when: '10:00' })).toEqual({ text: 'GitHub から読みました（10:00）', kind: 'ok' });
  });
  // DESK-SAVE-03: what 書きかけを捨てて読み込み直す gives up: a text written over GitHub's version (places side by side
  // in it too); none with no text written; not one of an operation, nor one GitHub does not have
  test('DESK-SAVE-03: discardOf: a text written over GitHub’s version; none; one of an operation or not on GitHub', () => {
    const [text, held, moved, typed] = changes({
      'a.md': { text: '書いた' },
      'b.md': { text: `${MINE_MARK}\n一\n${END_MARK}\n` },
      'c.md': { sha: '1', op: 'o1' },
      'd.md': { text: '書いた', op: 'o2' },
    }).values();
    expect(discardOf(text, true)).toBe('text');
    expect(discardOf(held, true)).toBe('text');
    expect(discardOf(undefined, true)).toBe('none');
    expect(discardOf(moved, true)).toBe('none');
    expect(discardOf(typed, true)).toBe('op');
    expect(discardOf(text, false)).toBe('op');
  });
  // DESK-SAVE-03: the button faint while the work is sent or read, and with nothing to give up
  test('DESK-SAVE-03: discardOff: not pressed while busy or with no text written', () => {
    const [text] = changes({ 'a.md': { text: '書いた' } }).values();
    expect(discardOff({ busy: false, draft: text, onGitHub: true })).toBe(false);
    expect(discardOff({ busy: true, draft: text, onGitHub: true })).toBe(true);
    expect(discardOff({ busy: false, draft: undefined, onGitHub: true })).toBe(true);
    // (one of an operation: pressed, to say why it is not given up)
    expect(discardOff({ busy: false, draft: text, onGitHub: false })).toBe(false);
  });
  // DESK-SAVE-03: asked once in the dialog with the episode's title; else why nothing is given up
  test('DESK-SAVE-03: discardStep: asked with the title; why not, with nothing or with an operation', () => {
    const [text, typed] = changes({ 'a.md': { text: '書いた' }, 'd.md': { text: '書いた', op: 'o2' } }).values();
    const step = discardStep(text, true, 'はじまり');
    expect(step.say).toBe('');
    expect(step.ask.title).toBe('「はじまり」の書きかけを捨てます');
    expect(step.ask.help).toMatch(/送らずに捨てて、GitHub の版を読み込み直します。捨てた文章は、この話の履歴（この端末）から復元できます。$/);
    expect(step.changed).toBe('「はじまり」の書きかけは、確かめている間に送信か GitHub からの読み込みで変わったため、捨てませんでした');
    expect(discardStep(undefined, true, 'はじまり').say).toBe('「はじまり」には、この端末の書きかけがありません');
    expect(discardStep(typed, true, '新しい話').say).toMatch(/^「新しい話」は、この端末で追加したか、.*「未送信の一覧」で取り消してください$/);
  });
  // DESK-SAVE-03: said once it is given up: the episode, and the version shown now (GitHub's branch, or the one read
  // before: 同期しない, or GitHub not read)
  test('DESK-SAVE-03: discardSaid: the episode and the version shown', () => {
    const s = { title: 'はじまり', branch: 'main', mode: /** @type {const} */ ('auto'), read: true, offline: false };
    const kept = '（捨てた文章は、この話の履歴に残ります）';
    expect(discardSaid(s)).toBe(`「はじまり」の書きかけを捨てて、GitHub のブランチ main の版を読み込みました${kept}`);
    const before = `「はじまり」の書きかけを捨てました。GitHub から読み込めなかったため、この端末で前に読んだ版を出しています${kept}`;
    expect(discardSaid({ ...s, read: false })).toBe(before);
    expect(discardSaid({ ...s, offline: true })).toBe(before);
    expect(discardSaid({ ...s, mode: 'off' })).toBe(
      `「はじまり」の書きかけを捨てて、この端末で前に読んだ版を出しました。同期しない設定のため、GitHub からは読み込んでいません${kept}`,
    );
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
