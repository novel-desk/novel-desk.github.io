// The pictures of a work as the screens show them (lib/images.js)
import { test, expect } from 'vitest';
import { imagesHtml, isPicture, LONG_SIDE, pictureProblem, pictureRenameAsk, pictureRenamedSaid, pictureTrashAsk, shrunkSize } from '../../lib/images.js';
import { MAX_PICTURE } from '../../lib/notes.js';

// FR-EDIT-07: a large picture made small on the device
test('shrunkSize: the long side 1600 at most, either way; a small one as it is', () => {
  expect(LONG_SIDE).toBe(1600);
  expect(shrunkSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
  expect(shrunkSize(1000, 3001)).toEqual({ width: 533, height: 1600 });
  expect(shrunkSize(800, 600)).toEqual({ width: 800, height: 600 });
});
// NFR-SEC-15: only JPEG, PNG, WebP, GIF, 5 MB at most
test('isPicture, pictureProblem: an image; of a kind kept, not too large', () => {
  expect(isPicture('image/heic')).toBe(true);
  expect(isPicture('application/pdf')).toBe(false);
  expect(pictureProblem(null, 10)).toBe('画像（JPEG、PNG、WebP、GIF）を選んでください');
  expect(pictureProblem('jpg', MAX_PICTURE + 1)).toBe('画像が大きすぎます（5 MB まで）');
  expect(pictureProblem('jpg', MAX_PICTURE)).toBe('');
});
// FR-EDIT-08, FR-EDIT-09: the pictures listed on 資料, each to be renamed and deleted
test('imagesHtml: none; one folder, one grid; several, by folder (sorted), each picture by its place in the list', () => {
  expect(imagesHtml([])).toBe('<p class="muted small">まだ画像がありません。</p>');
  const one = imagesHtml([
    { path: 'images/a<.png', name: 'a<.png' },
    { path: 'images/b.jpg', name: 'b.jpg' },
  ]);
  expect(one.startsWith('<div class="images-grid"><figure><img alt="" data-src="images/a&lt;.png"><figcaption>a&lt;.png</figcaption>')).toBe(true);
  expect(one).toContain('data-image-rename="1">名前を変更</button><button class="ghost small danger" data-image-trash="1">削除</button>');
  expect(one).not.toContain('notes-folder');
  const two = imagesHtml([
    { path: 'notes/z/c.png', name: 'c.png' },
    { path: 'images/a.png', name: 'a.png' },
    { path: 'notes/z/d.png', name: 'd.png' },
  ]);
  expect(two.indexOf('<span>images</span>')).toBeLessThan(two.indexOf('<span>notes/z</span>'));
  expect(two).toContain('<div class="notes-folder"><span>images</span></div><div class="images-grid"><figure><img alt="" data-src="images/a.png">');
  expect(two).toContain('data-image-rename="0"');
  expect(two).toContain('data-image-trash="2"');
});
test('pictureRenameAsk: the name without its extension, which stays', () => {
  expect(pictureRenameAsk('images/sub/cover.v2.png')).toEqual({
    now: 'cover.v2',
    ask: '画像の新しい名前（英数字と - _。拡張子 .png はそのまま）\nこの画像を使っている本文と資料も、新しい名前の画像を表示します',
  });
});
test('pictureRenamedSaid: the places shown by the new name, when there are some', () => {
  expect(pictureRenamedSaid(3)).toBe('画像の名前を変更しました（3 か所の画像も新しい名前にしました）');
  expect(pictureRenamedSaid(0)).toBe('画像の名前を変更しました');
});
test('pictureTrashAsk: the places that use it said first, when there are some', () => {
  expect(pictureTrashAsk('images/a.png', 2)).toBe(
    '「a.png」を削除しますか？ この画像は 2 か所で使われています（本文の ![](…) は残り、画像は表示されなくなります）。削除した画像は作品の _trash/ に残ります',
  );
  expect(pictureTrashAsk('images/a.png', 0)).toBe('「a.png」を削除しますか？ 削除した画像は作品の _trash/ に残ります');
});
