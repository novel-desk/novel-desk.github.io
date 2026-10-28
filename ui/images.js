// Pictures: one chosen is made small on the device and kept as a change not sent (FR-EDIT-07); the pictures of the
// work listed on 資料, renamed (the texts that show one show it by its new name: FR-EDIT-08) and put in the trash (the
// places that use it said first: FR-EDIT-09). From the server version's public/ui/images.js and the pictures of notes.js
import { trashStamp } from '../lib/episodes.js';
import { newName } from '../lib/format.js';
import { imagesHtml, isPicture, pictureProblem, pictureRenameAsk, pictureRenamedSaid, pictureTrashAsk, shrunkSize } from '../lib/images.js';
import { extOf, mdFiles, newPicture, notesList, pictureUses, renamePicture, toTrash } from '../lib/notes.js';
import { $, busy, toast } from './dom.js';
import { api } from './shared.js';

// the texts of the work's .md files that can be read (the pictures in them; said in the band while they are read:
// DESK-OPS-05)
async function mdTexts() {
  const got = await busy('読み込んでいます…', () => api.texts(mdFiles(api.files())));
  return /** @type {Record<string, string>} */ (Object.fromEntries(Object.entries(got).filter(([, t]) => t !== null)));
}
// make the picture small on the device (long side 1600px, JPEG; a GIF as it is)
/** @param {File} file @returns {Promise<Blob>} */
async function shrink(file) {
  if (file.type === 'image/gif') return file;
  const bmp = await createImageBitmap(file);
  const size = shrunkSize(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = size.width;
  c.height = size.height;
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
    if (!isPicture(file.type)) throw new Error('画像（JPEG、PNG、WebP、GIF）を選んでください');
    // (as the server version's 「縮小してアップロードしています…」: made small here, kept on the device)
    toast('画像を縮小しています…');
    const blob = await shrink(file).catch(() => {
      throw new Error('画像を読めませんでした。JPEG、PNG、WebP、GIF の画像を選んでください');
    });
    const ext = extOf(blob.type);
    const problem = pictureProblem(ext, blob.size);
    if (problem) throw new Error(problem);
    await then(newPicture(api.view().layout, api.files(), file.name, /** @type {string} */ (ext), Date.now()), new Uint8Array(await blob.arrayBuffer()));
  } catch (err) {
    toast(err.message);
  }
}

// --- the pictures of the work, on 資料

/** @type {string[]} the pictures listed, by their place in the list */
let listed = [];
/** @type {() => void} what draws 資料 again after a picture changed (wireImages) */
let again;
// the pictures drawn on 資料, by folder (in more than one folder, each under its path, so two of the same name are told apart)
export async function renderImages() {
  const l = api.view().layout;
  const images = notesList(l, api.files()).filter(f => f.kind === 'image');
  listed = images.map(f => f.path);
  $('images-list').innerHTML = imagesHtml(images);
  for (const img of /** @type {NodeListOf<HTMLImageElement>} */ ($('images-list').querySelectorAll('img[data-src]'))) {
    const url = await api.pictureUrl(/** @type {string} */ (img.dataset.src));
    if (url) img.src = url;
  }
}
/** @param {string} path */
async function renameImage(path) {
  const { now, ask } = pictureRenameAsk(path);
  const name = newName(prompt(ask, now), now);
  if (name === null) return;
  try {
    const plan = renamePicture(api.files(), await mdTexts(), path, name);
    if (await api.apply({ moves: plan.moves, writes: plan.writes.map(w => ({ ...w, bound: true })), edits: [], path: plan.path }))
      toast(pictureRenamedSaid(plan.links));
  } catch (err) {
    toast(err.message);
  }
  again();
}
/** @param {string} path */
async function trashImage(path) {
  if (!confirm(pictureTrashAsk(path, pictureUses(await mdTexts(), path)))) return;
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
      if (await api.apply({ moves: [], writes: [{ path, bytes }], edits: [], path })) toast('画像を挿入しました（送るまではこの端末だけの変更です）');
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
