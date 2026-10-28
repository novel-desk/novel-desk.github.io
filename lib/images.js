// The pictures of a work as the screens show them (ui/images.js; no screen, no state of the app: tested by itself in
// tests/unit): a picture chosen made small and checked (FR-EDIT-07, NFR-SEC-15), the pictures listed on 資料, renamed
// (FR-EDIT-08) and deleted (FR-EDIT-09)
import { esc } from './format.js';
import { dirOf } from './markdown.js';
import { MAX_PICTURE } from './notes.js';

// the long side of a picture made small
export const LONG_SIDE = 1600;
// the size a picture is made small to: its long side LONG_SIDE at most, never larger than it is
/** @param {number} width @param {number} height */
export function shrunkSize(width, height) {
  const scale = Math.min(1, LONG_SIDE / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
// a file chosen is a picture (what the browser says of it)
/** @param {string} type */
export const isPicture = type => type.startsWith('image/');
// what keeps a picture made small from being kept ('' nothing): not of a kind kept (lib/notes.js extOf: null), or
// larger than MAX_PICTURE
/** @param {string | null} ext @param {number} size */
export function pictureProblem(ext, size) {
  if (!ext) return '画像（JPEG、PNG、WebP、GIF）を選んでください';
  return size > MAX_PICTURE ? '画像が大きすぎます（5 MB まで）' : '';
}

// The pictures on 資料, by folder: in one folder, one grid; in more, each under its path (so that two of the same name
// are told apart), the folders by name. Each with its buttons to rename and delete it (by its place in `images`)
/** @param {{ path: string, name: string }[]} images */
export function imagesHtml(images) {
  if (!images.length) return '<p class="muted small">まだ画像がありません。</p>';
  /** @type {Map<string, { path: string, name: string, i: number }[]>} */
  const folders = new Map();
  images.forEach((f, i) => folders.set(dirOf(f.path), [...(folders.get(dirOf(f.path)) ?? []), { ...f, i }]));
  /** @param {{ path: string, name: string, i: number }[]} list */
  const grid = list =>
    `<div class="images-grid">${list
      .map(
        f =>
          `<figure><img alt="" data-src="${esc(f.path)}"><figcaption>${esc(f.name)}</figcaption><span class="image-tools"><button class="ghost small" data-image-rename="${f.i}">名前を変更</button><button class="ghost small danger" data-image-trash="${f.i}">削除</button></span></figure>`,
      )
      .join('')}</div>`;
  if (folders.size === 1) return grid([...folders.values()][0]);
  return [...folders.keys()]
    .sort((a, b) => a.localeCompare(b, 'ja'))
    .map(
      folder =>
        `<div class="notes-folder"><span>${esc(folder)}</span></div>${grid(/** @type {{ path: string, name: string, i: number }[]} */ (folders.get(folder)))}`,
    )
    .join('');
}

// What is asked for a picture's new name: its name now (without its extension, which stays), and the question
/** @param {string} path */
export function pictureRenameAsk(path) {
  const file = /** @type {string} */ (path.split('/').pop()),
    now = file.slice(0, file.lastIndexOf('.'));
  return {
    now,
    ask: `画像の新しい名前（英数字と - _。拡張子 ${file.slice(now.length)} はそのまま）\nこの画像を使っている本文と資料も、新しい名前の画像を表示します`,
  };
}
// what a picture renamed says: how many places that show it show it by its new name
/** @param {number} links */
export const pictureRenamedSaid = links => (links ? `画像の名前を変更しました（${links} か所の画像も新しい名前にしました）` : '画像の名前を変更しました');
// what is asked before a picture is deleted: the places that use it, first
/** @param {string} path @param {number} uses */
export function pictureTrashAsk(path, uses) {
  const where = uses ? `この画像は ${uses} か所で使われています（本文の ![](…) は残り、画像は表示されなくなります）。` : '';
  return `「${path.split('/').pop()}」を削除しますか？ ${where}削除した画像は作品の _trash/ に残ります`;
}
