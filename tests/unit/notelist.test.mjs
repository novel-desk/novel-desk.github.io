import { describe, test, expect } from 'vitest';
import { groupNotes, inNotes, notesIndexHtml, sideListHtml, sideNoteHead, sideNoteHtml, sideUnreadable, titledNotes } from '../../lib/notelist.js';

const f = (path, title) => ({ path, name: path.split('/').pop(), updated: 1, ...(title ? { title } : {}) });

describe('notelist', () => {
  // FR-NOTE-01 FR-NOTE-11: the ones used most on top, then by folder (the top folder first, then by name); a row says
  // the title, or the path in the notes' folder (on top) or the file name (in a folder)
  test('groupNotes: on top, then by folder', () => {
    const { pinned, folders } = groupNotes(
      [
        f('notes/b/x.md', 'エックス'),
        f('notes/03_settings.md', '設定'),
        f('notes/memo.md'),
        f('notes/キャラ/rei.md'),
        f('notes/a/y.md'),
        f('notes/a/z.md'),
        f('notes/story.md'),
      ],
      'notes',
      'notes/story.md',
    );
    expect(pinned.map(r => r.label)).toEqual(['設定', 'story.md']);
    expect(folders.map(g => g.folder)).toEqual(['', 'a', 'b', 'キャラ']);
    expect(folders.map(g => g.rows.map(r => r.label))).toEqual([['memo.md'], ['y.md', 'z.md'], ['エックス'], ['rei.md']]);
    expect(groupNotes([], 'notes', undefined)).toEqual({ pinned: [], folders: [] });
  });
});

// FR-NOTE-01, FR-NOTE-02, FR-NOTE-11: the lists as 資料 and the panel beside the text draw them
describe('the lists drawn', () => {
  const notes = [f('notes/plot.md', 'プロット<'), f('notes/memo.md'), f('notes/a/y.md')];
  test('titledNotes: each note with its heading as its title (none when it has none, or is not read)', () => {
    expect(
      titledNotes(
        [
          { path: 'notes/a.md', name: 'a.md' },
          { path: 'notes/b.md', name: 'b.md' },
          { path: 'notes/c.md', name: 'c.md' },
        ],
        { 'notes/a.md': '# 世界\n', 'notes/b.md': '本文', 'notes/c.md': null },
      ),
    ).toEqual([
      { path: 'notes/a.md', name: 'a.md', title: '世界', updated: 0 },
      { path: 'notes/b.md', name: 'b.md', title: undefined, updated: 0 },
      { path: 'notes/c.md', name: 'c.md', title: undefined, updated: 0 },
    ]);
  });
  test('notesIndexHtml: none; on top (the plot said) with 「そのほか」, the top folder’s rows, a folder with its ＋; 未送信', () => {
    expect(notesIndexHtml([], 'notes', '', new Set())).toBe('<p class="muted small">まだ資料がありません。「＋ 資料を追加」で作成できます。</p>');
    const html = notesIndexHtml(notes, 'notes', 'notes/plot.md', new Set(['notes/memo.md']));
    expect(html).toBe(
      '<div class="notes-folder"><span>主な資料</span></div><div class="notes-in"><button data-note="notes/plot.md"><span>プロット&lt; <span class="vis">プロット</span></span></button></div>' +
        '<div class="notes-folder"><span>そのほか</span></div>' +
        '<button data-note="notes/memo.md"><span>memo.md</span><small class="unsent-tag">未送信</small></button>' +
        '<div class="notes-folder"><span>a</span><button class="ghost" data-add-in="a" title="このフォルダに資料を作成">＋</button></div><div class="notes-in"><button data-note="notes/a/y.md"><span>y.md</span></button></div>',
    );
    // only the ones on top: no 「そのほか」; none on top: no 主な資料
    expect(notesIndexHtml([notes[0]], 'notes', 'notes/plot.md', new Set())).not.toContain('そのほか');
    expect(notesIndexHtml([notes[1]], 'notes', '', new Set())).toBe('<button data-note="notes/memo.md"><span>memo.md</span></button>');
  });
  test('sideListHtml: its head; none; the same list without the drafts and the buttons to make one', () => {
    const head =
      '<div class="plot-panel-head"><b>資料</b><span class="grow"></span><button class="ghost small" data-side-close aria-label="閉じる">×</button></div>';
    expect(sideListHtml([], 'notes', '')).toBe(`${head}<p class="muted small">まだ資料がありません。目次の「資料」から作成できます。</p>`);
    expect(sideListHtml(notes, 'notes', 'notes/plot.md')).toBe(
      `${head}<div class="notes-list side-note-body">` +
        '<div class="notes-folder"><span>主な資料</span></div><div class="notes-in"><button data-side-note="notes/plot.md"><span>プロット&lt; <span class="vis">プロット</span></span></button></div>' +
        '<div class="notes-folder"><span>そのほか</span></div>' +
        '<button data-side-note="notes/memo.md"><span>memo.md</span></button>' +
        '<div class="notes-folder"><span>a</span></div><div class="notes-in"><button data-side-note="notes/a/y.md"><span>y.md</span></button></div></div>',
    );
  });
  test('sideNoteHead, sideUnreadable, sideNoteHtml: a note in the panel, by its path in the notes folder', () => {
    expect(sideNoteHead('a<')).toBe(
      '<div class="plot-panel-head"><button class="ghost small" data-side-list>‹ 一覧</button><b>a&lt;</b><span class="grow"></span><button class="ghost small" data-side-close aria-label="閉じる">×</button></div>',
    );
    expect(sideUnreadable('notes/x.md')).toBe(
      `${sideNoteHead('notes/x.md')}<p class="muted small">この資料は読めません（無くなったか、この端末にまだ読み込まれていません）。</p>`,
    );
    expect(sideNoteHtml('x.md', true, '<p>本文</p>')).toBe(
      `${sideNoteHead('x.md')}<p class="muted small">この端末に、まだ送っていない書きかけがあります（ここにはその内容を出しています）。</p><div class="preview side-note-body"><p>本文</p></div>`,
    );
    expect(sideNoteHtml('x.md', false, '')).toBe(`${sideNoteHead('x.md')}<div class="preview side-note-body"></div>`);
    expect(inNotes('notes/キャラ/rei.md', 'notes')).toBe('キャラ/rei.md');
    expect(inNotes('n.x/a.md', 'n.x')).toBe('a.md');
    expect(inNotes('nax/a.md', 'n.x')).toBe('nax/a.md');
  });
});
