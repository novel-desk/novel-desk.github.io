// Pictures: one chosen is made small on the device and kept as a change not sent (FR-EDIT-07); the pictures of the
// work listed on 資料, renamed (the texts that show one show it by its new name: FR-EDIT-08) and put in the trash (the
// places that use it said first: FR-EDIT-09). From the server version's public/ui/images.js and the pictures of notes.js
import { trashStamp } from '../lib/episodes.js';
import { esc } from '../lib/format.js';
import { dirOf } from '../lib/markdown.js';
import { extOf, MAX_PICTURE, mdFiles, newPicture, notesList, pictureUses, renamePicture, toTrash } from '../lib/notes.js';
import { $, toast } from './dom.js';
import { api } from './shared.js';

// the texts of the work's .md files that can be read (the pictures in them)
async function mdTexts() {
  const got = await api.texts(mdFiles(api.files()));
  return /** @type {Record<string, string>} */ (Object.fromEntries(Object.entries(got).filter(([, t]) => t !== null)));
}
// make the picture small on the device (long side 1600px, JPEG; a GIF as it is)
/** @param {File} file @returns {Promise<Blob>} */
async function shrink(file) {
  if (file.type === 'image/gif') return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')).drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((resolve, reject) => c.toBlob(b => (b ? resolve(b) : reject(new Error('画像を縮小できませんでした'))), 'image/jpeg', 0.85));
}
// one file picker for all: what to do with the picture is set before opening it
/** @type {((path: string, bytes: Uint8Array) => unknown) | null} */
let onPicked = null;
/** @param {(path: string, bytes: Uint8Array) => unknown} then */
export function pickImage(then) {
  onPicked = then;
  const input = /** @type {HTMLInputElement} */ ($('image-file'));
  input.value = '';
  input.click();
}
async function picked() {
  const file = /** @type {HTMLInputElement} */ ($('image-file')).files?.[0];
  const then = onPicked;
  if (!file || !then) return;
  try {
    if (!file.type.startsWith('image/')) throw new Error('画像（JPEG、PNG、WebP、GIF）を選んでください');
    const blob = await shrink(file).catch(() => {
      throw new Error('画像を読めませんでした。JPEG、PNG、WebP、GIF の画像を選んでください');
    });
    const ext = extOf(blob.type);
    if (!ext) throw new Error('画像（JPEG、PNG、WebP、GIF）を選んでください');
    if (blob.size > MAX_PICTURE) throw new Error('画像が大きすぎます（5 MB まで）');
    await then(newPicture(api.view().layout, api.files(), file.name, ext, Date.now()), new Uint8Array(await blob.arrayBuffer()));
  } catch (err) {
    toast(err.message);
  }
}

// --- the pictures of the work, on 資料

/** @type {string[]} the pictures listed, by their place in the list */
let listed = [];
/** @type {() => void} what draws 資料 again after a picture changed */
let again = () => {};
// the pictures drawn on 資料, by folder (in more than one folder, each under its path, so two of the same name are told apart)
export async function renderImages() {
  const l = api.view().layout;
  $('images-where').textContent =
    l.notes || l.images
      ? ''
      : '資料のフォルダが novel.toml に書かれていないので、一番上の images/ の画像を出します（[notes] dir か [images] dir で変えられます）';
  const images = notesList(l, api.files()).filter(f => f.kind === 'image');
  listed = images.map(f => f.path);
  /** @type {Map<string, typeof images>} */
  const folders = new Map();
  for (const f of images) folders.set(dirOf(f.path), [...(folders.get(dirOf(f.path)) ?? []), f]);
  /** @param {typeof images} list */
  const grid = list =>
    `<div class="images-grid">${list
      .map(
        f =>
          `<figure><img alt="" data-src="${esc(f.path)}"><figcaption>${esc(f.name)}</figcaption><span class="image-tools"><button class="ghost small" data-image-rename="${listed.indexOf(f.path)}">名前を変更</button><button class="ghost small danger" data-image-trash="${listed.indexOf(f.path)}">削除</button></span></figure>`,
      )
      .join('')}</div>`;
  $('images-list').innerHTML = !images.length
    ? '<p class="muted small">まだ画像がありません。</p>'
    : folders.size === 1
      ? grid(images)
      : [...folders.keys()]
          .sort((a, b) => a.localeCompare(b, 'ja'))
          .map(folder => `<div class="notes-folder"><span>${esc(folder)}</span></div>${grid(/** @type {typeof images} */ (folders.get(folder)))}`)
          .join('');
  for (const img of /** @type {NodeListOf<HTMLImageElement>} */ ($('images-list').querySelectorAll('img[data-src]'))) {
    const url = await api.pictureUrl(/** @type {string} */ (img.dataset.src));
    if (url) img.src = url;
  }
}
/** @param {string} path */
async function renameImage(path) {
  const file = /** @type {string} */ (path.split('/').pop()),
    now = file.slice(0, file.lastIndexOf('.'));
  const name = prompt(
    `画像の新しい名前（英数字と - _。拡張子 ${file.slice(now.length)} はそのまま）\nこの画像を使っている本文と資料も、新しい名前の画像を表示します`,
    now,
  );
  if (name === null || !name.trim() || name.trim() === now) return;
  try {
    const plan = renamePicture(api.files(), await mdTexts(), path, name.trim());
    if (await api.apply({ moves: plan.moves, writes: plan.writes.map(w => ({ ...w, bound: true })), edits: [], path: plan.path }))
      toast(plan.links ? `画像の名前を変更しました（${plan.links} か所の画像も新しい名前にしました）` : '画像の名前を変更しました');
  } catch (err) {
    toast(err.message);
  }
  again();
}
/** @param {string} path */
async function trashImage(path) {
  const file = path.split('/').pop();
  const uses = pictureUses(await mdTexts(), path);
  const where = uses ? `この画像は ${uses} か所で使われています（本文の ![](…) は残り、画像は表示されなくなります）。` : '';
  if (!confirm(`「${file}」を削除しますか？ ${where}削除した画像は作品の _trash/ に残ります`)) return;
  const to = toTrash(api.files(), path, trashStamp(Date.now()));
  if (await api.apply({ moves: [[path, to]], writes: [], edits: [], path: '' })) toast('画像を削除しました（送るまではこの端末だけの変更です）');
  again();
}

/** @param {() => void} redraw 資料 drawn again */
export function wireImages(redraw) {
  again = redraw;
  $('image-file').addEventListener('change', () => void picked());
  $('add-image').addEventListener('click', () =>
    pickImage(async (path, bytes) => {
      if (await api.apply({ moves: [], writes: [{ path, bytes }], edits: [], path })) toast('画像を追加しました（送るまではこの端末だけの変更です）');
      again();
    }),
  );
  $('images-list').addEventListener('click', e => {
    const t = /** @type {HTMLElement} */ (e.target);
    const rename = t.closest('[data-image-rename]'),
      trash = t.closest('[data-image-trash]');
    if (rename instanceof HTMLElement) void renameImage(listed[Number(rename.dataset.imageRename)]);
    if (trash instanceof HTMLElement) void trashImage(listed[Number(trash.dataset.imageTrash)]);
  });
}
