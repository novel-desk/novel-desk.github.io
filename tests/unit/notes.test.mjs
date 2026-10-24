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
