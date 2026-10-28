import { describe, test, expect } from 'vitest';
import * as nt from '../../lib/notes.js';
import { firstLayout } from '../../lib/layout.js';

const l = (over = {}) => ({ ...firstLayout(), ...over });

describe('pictures (FR-EDIT-07〜09)', () => {
  test('pictureType and extOf: JPEG, PNG, WebP and GIF only (NFR-SEC-15)', () => {
    expect(['a.JPG', 'b.jpeg', 'c.png', 'd.webp', 'e.gif', 'f.svg', 'g'].map(nt.pictureType)).toEqual([
      'image/jpeg',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      null,
      null,
    ]);
    expect(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'].map(nt.extOf)).toEqual(['jpg', 'png', 'webp', 'gif', null]);
    expect(nt.MAX_PICTURE).toBe(5 * 1024 * 1024);
  });
  test('imagesDir: [images] dir; else an images/ folder at the top; else notes/images; else images', () => {
    expect(nt.imagesDir(l({ images: 'pics', notes: 'notes' }), ['images/a.png'])).toBe('pics');
    expect(nt.imagesDir(l({ notes: 'notes' }), ['images/a.png'])).toBe('images');
    expect(nt.imagesDir(l({ notes: 'notes' }), [])).toBe('notes/images');
    expect(nt.imagesDir(l(), [])).toBe('images');
  });
  test('notesList: the notes and pictures of the notes and pictures folders, 4 folders deep, hidden ones left out, by path', () => {
    const paths = [
      'notes/b.md',
      'notes/a.md',
      'notes/images/x.png',
      'notes/.hidden/c.md',
      'notes/t.txt',
      'notes/1/2/3/4/d.md',
      'notes/1/2/3/4/5/e.md',
      'pics/y.jpg',
      'other/z.png',
      'notes',
    ];
    expect(nt.notesList(l({ notes: 'notes', images: 'pics' }), paths)).toEqual([
      { path: 'notes/1/2/3/4/d.md', name: 'd.md', kind: 'note' },
      { path: 'notes/a.md', name: 'a.md', kind: 'note' },
      { path: 'notes/b.md', name: 'b.md', kind: 'note' },
      { path: 'notes/images/x.png', name: 'x.png', kind: 'image' },
      { path: 'pics/y.jpg', name: 'y.jpg', kind: 'image' },
    ]);
    // the pictures folder in the notes folder is walked once; no notes folder: the pictures folder alone
    expect(nt.notesList(l({ notes: 'notes' }), ['notes/images/x.png']).length).toBe(1);
    expect(nt.notesList(l(), ['images/a.png', 'notes/a.md'])).toEqual([{ path: 'images/a.png', name: 'a.png', kind: 'image' }]);
  });
  test('mdFiles: the .md files a picture may be shown in; isNote: a .md file of the notes folder, not an episode', () => {
    expect(
      nt.mdFiles(['01.md', 'notes/a.md', '.github/x.md', '_trash/y.md', 'node_modules/p/r.md', 'a/b/c/d/e/f/g.md', 'a/b/c/d/e/f/g/h.md', 'x.png']),
    ).toEqual(['01.md', 'notes/a.md', 'a/b/c/d/e/f/g.md']);
    const layout = l({ notes: 'notes' });
    expect([nt.isNote(layout, 'notes/a.md'), nt.isNote(layout, 'notes/01.md'), nt.isNote(layout, '01.md'), nt.isNote(layout, 'notes/x.png')]).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(nt.isNote(l({ notes: '' }), 'a.md')).toBe(false);
    expect(nt.isNote(l({ notes: 'ms', dir: 'ms' }), 'ms/01.md')).toBe(false);
  });
  test('asciiName: lowercase letters, digits, - and _; the rest one -; 40 at most', () => {
    expect(nt.asciiName('My Photo 写真!.v2')).toBe('my-photo-v2');
    expect(nt.asciiName('写真')).toBe('');
    expect(nt.asciiName('a'.repeat(50)).length).toBe(40);
  });
  test('pictureStamp (Japan time) and newPicture: the time, then the name in ASCII', () => {
    const at = Date.parse('2026-10-24T00:30:15Z');
    expect(nt.pictureStamp(at)).toBe('20261024-093015');
    expect(nt.newPicture(l({ notes: 'notes' }), [], 'Sky Photo.PNG', 'jpg', at)).toBe('notes/images/20261024-093015-sky-photo.jpg');
    expect(nt.newPicture(l(), [], '空.png', 'png', at)).toBe('images/20261024-093015.png');
  });
  test('relinkImages and pictureUses: the pictures that show a file, said again by its new name; the rest as it was', () => {
    const text = '![空](../notes/images/a.png) と ![](https://x/a.png) と ![海](../notes/images/b.png)\n![再](../notes/images/a.png)';
    expect(nt.relinkImages(text, 'ms/01.md', 'notes/images/a.png', 'notes/images/sky.png')).toEqual({
      text: '![空](../notes/images/sky.png) と ![](https://x/a.png) と ![海](../notes/images/b.png)\n![再](../notes/images/sky.png)',
      n: 2,
    });
    expect(nt.relinkImages(text, 'ms/01.md', 'notes/images/a.png', null)).toEqual({ text, n: 2 });
    expect(nt.pictureUses({ 'ms/01.md': text, 'notes/n.md': '![](images/a.png)', 'x.md': '' }, 'notes/images/a.png')).toBe(3);
  });
  test('renamePicture: moved, the texts that show it said by its new name; a bad, the same or a taken name refused', () => {
    const paths = ['notes/images/a.png', 'notes/images/b.png', '01.md'];
    const texts = { '01.md': '![](notes/images/a.png)', 'notes/n.md': 'なし' };
    expect(nt.renamePicture(paths, texts, 'notes/images/a.png', 'sky')).toEqual({
      moves: [['notes/images/a.png', 'notes/images/sky.png']],
      writes: [{ path: '01.md', text: '![](notes/images/sky.png)' }],
      links: 1,
      path: 'notes/images/sky.png',
    });
    expect(() => nt.renamePicture(paths, texts, 'notes/images/a.png', '空')).toThrow('画像の名前は、英数字と - _ で 80 文字までにしてください');
    expect(() => nt.renamePicture(paths, texts, 'notes/images/a.png', 'a')).toThrow('いまと同じ名前です');
    expect(() => nt.renamePicture(paths, texts, 'notes/images/a.png', 'b')).toThrow('同じ名前の画像があります');
  });
  test('toTrash: _trash/ with the time; the same name in the same second -2, -3', () => {
    expect(nt.toTrash([], 'notes/images/a.png', 'S')).toBe('_trash/S_a.png');
    expect(nt.toTrash(['_trash/S_a.png', '_trash/S-2_a.png'], 'a.png', 'S')).toBe('_trash/S-3_a.png');
  });
});

describe('notes (FR-NOTE-01, FR-NOTE-05, FR-NOTE-06)', () => {
  const layout = l({ notes: 'notes' });
  test('noteHeading: the first line when it is a heading, 60 characters at most', () => {
    expect(nt.noteHeading('﻿\n# 世界観\n本文')).toBe('世界観');
    expect(nt.noteHeading(`# ${'あ'.repeat(70)}`)).toBe('あ'.repeat(60));
    expect(nt.noteHeading('本文')).toBeNull();
    expect(nt.noteHeading('#  ')).toBeNull();
    expect(nt.noteHeading('')).toBeNull();
  });
  test('noteFolder: any letters, 3 levels; not a dot first, not 40 letters past', () => {
    expect(nt.noteFolder(' キャラ / 主役 ')).toBe('キャラ/主役');
    expect(nt.noteFolder('')).toBe('');
    expect(() => nt.noteFolder('.git')).toThrow('フォルダの名前が正しくありません');
    expect(() => nt.noteFolder('a\\b')).toThrow('フォルダの名前が正しくありません');
    expect(() => nt.noteFolder('あ'.repeat(41))).toThrow('フォルダの名前が正しくありません');
    expect(() => nt.noteFolder('a/b/c/d')).toThrow('フォルダは 3 段までです');
  });
  test('noteTitled: the heading put in place of the first heading, else above the text', () => {
    expect(nt.noteTitled('\n# 古い\r\n本文', '新しい')).toBe('\n# 新しい\r\n本文');
    expect(nt.noteTitled('﻿# 古い', '新しい')).toBe('﻿# 新しい');
    expect(nt.noteTitled('本文だけ', '題')).toBe('# 題\n\n本文だけ');
    expect(nt.noteTitled('﻿本文', '題')).toBe('﻿# 題\n\n本文');
  });
  test('newNote: its file name in ASCII (or the time), its heading the name; no notes folder, or the name taken: refused', () => {
    const at = Date.parse('2026-10-24T00:30:15Z');
    expect(nt.newNote(layout, [], 'キャラ', 'Alice', 'Alice', at)).toEqual({ path: 'notes/キャラ/alice.md', text: '# Alice\n\n' });
    expect(nt.newNote(layout, [], '', '世界観', '世界観', at).path).toBe('notes/note-20261024-093015.md');
    expect(() => nt.newNote(l(), [], '', 'a', 'a', at)).toThrow('資料のフォルダが決まっていません');
    expect(() => nt.newNote(layout, ['notes/a.md'], '', 'a', 'a', at)).toThrow('同じ名前の資料があります');
  });
  test('renameNote: the heading and the file name; the plot only its file name, [plot] file following; [characters] file following', () => {
    expect(nt.renameNote(layout, ['notes/w.md'], 'notes/w.md', 'World', 'World', '# 世界\n本文', false)).toEqual({
      moves: [['notes/w.md', 'notes/world.md']],
      writes: [{ path: 'notes/world.md', text: '# World\n本文' }],
      edits: [],
      path: 'notes/world.md',
    });
    // a name of no ASCII letters: the file name stays, the heading changes
    expect(nt.renameNote(layout, [], 'notes/w.md', '世界観', '世界観', '# 世界\n', false)).toEqual({
      moves: [],
      writes: [{ path: 'notes/w.md', text: '# 世界観\n' }],
      edits: [],
      path: 'notes/w.md',
    });
    const plot = nt.renameNote({ ...layout, plot: 'notes/p.md' }, [], 'notes/p.md', 'story', 'story', '# 大箱1\n', false);
    expect(plot).toEqual({
      moves: [['notes/p.md', 'notes/story.md']],
      writes: [],
      edits: [{ key: ['plot', 'file'], value: 'notes/story.md' }],
      path: 'notes/story.md',
    });
    expect(nt.renameNote(layout, [], 'notes/plot.md', 'story', 'story', '# 大箱1\n', true).edits).toEqual([{ key: ['plot', 'file'], value: 'notes/story.md' }]);
    expect(nt.renameNote({ ...layout, characters: 'notes/c.md' }, [], 'notes/c.md', 'people', 'people', '# 人\n', false).edits).toEqual([
      { key: ['characters', 'file'], value: 'notes/people.md' },
    ]);
    expect(() => nt.renameNote(layout, [], 'notes/plot.md', 'プロット', 'プロット', '#', true)).toThrow('プロットの資料は見出しを変えません');
    expect(() => nt.renameNote(layout, [], 'notes/w.md', ' ', '無題', '', false)).toThrow('名前を入れてください');
    expect(() => nt.renameNote(layout, [], 'notes/w.md', 'w', 'w', '# w\n', false)).toThrow('いまと同じ名前です');
    expect(() => nt.renameNote(layout, ['notes/x.md'], 'notes/w.md', 'x', 'x', '# w\n', false)).toThrow('同じ名前の資料があります');
  });
  test('trashNote: to _trash/; the plot no longer chosen when it is that note', () => {
    expect(nt.trashNote(layout, [], 'notes/a.md', 'S')).toEqual({ moves: [['notes/a.md', '_trash/S_a.md']], writes: [], edits: [], path: '' });
    expect(nt.trashNote({ ...layout, plot: 'notes/a.md' }, [], 'notes/a.md', 'S').edits).toEqual([{ key: ['plot', 'file'], value: null }]);
  });
});

// FR-NOTE-01, FR-NOTE-05, FR-PLOT-03: the screen 資料
describe('the screen 資料', () => {
  test('noteTitle: the heading, else the file name', () => {
    expect(nt.noteTitle('# 世界観\n本文', 'notes/world.md')).toBe('世界観');
    expect(nt.noteTitle('本文', 'notes/world.md')).toBe('world.md');
  });
  test('notesWhere: said when there is no notes folder', () => {
    expect(nt.notesWhere('notes')).toBe('');
    expect(nt.notesWhere('')).toContain('資料のフォルダが設定されていません');
  });
  test('sectionText, sectionStart: a box put back between the lines around it; where it begins', () => {
    const section = { before: ['# 題', '前'], after: ['後'] };
    expect(nt.sectionText(section, '箱\n中')).toBe('# 題\n前\n箱\n中\n後');
    expect(nt.sectionText(null, '全体')).toBe('全体');
    expect(nt.sectionStart(section.before)).toBe(6);
    expect(nt.sectionStart([])).toBe(0);
  });
  test('addNoteAsk, addedNote: in a folder, or 「フォルダ/名前」; closed or empty, nothing; spaces, refused', () => {
    expect(nt.addNoteAsk('キャラ')).toBe('「キャラ」に作成する資料の名前（ファイル名は英数字になります。例: alice）');
    expect(nt.addNoteAsk('')).toContain('フォルダに入れるときは「フォルダ/名前」');
    expect(nt.addedNote(null, '')).toBe(null);
    expect(nt.addedNote('', 'キャラ')).toBe(null);
    expect(nt.addedNote('  ', '')).toEqual({ error: '名前を入れてください' });
    expect(nt.addedNote('a/b', 'キャラ')).toEqual({ folder: 'キャラ', name: 'a/b' });
    expect(nt.addedNote('旧版/キャラ/alice', '')).toEqual({ folder: '旧版/キャラ', name: 'alice' });
    expect(nt.addedNote('alice', '')).toEqual({ folder: '', name: 'alice' });
  });
  test('noteRenameAsk: the plot’s note by its file name (its 大箱 stay); another by its name', () => {
    expect(nt.noteRenameAsk(true, 'notes/plot.md', 'プロット')).toEqual({
      now: 'plot',
      ask: 'プロットの資料の新しいファイル名（英数字と - _）。大箱の見出しは変えません',
    });
    expect(nt.noteRenameAsk(false, 'notes/world.md', '世界観')).toEqual({
      now: '世界観',
      ask: '資料の新しい名前（資料の 1 行目の見出しになります。ファイル名は英数字になり、英数字が無ければ今のままです）',
    });
  });
});
