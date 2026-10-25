// 横の資料: the notes of the work beside the text, on a PC's or an iPad's (landscape) width only (FR-NOTE-11): their
// list, as on 資料, and one of them as read (a preview). Which is shown is kept on the device for each work, and the
// note is read again each time an episode is opened (a draft of it not sent: that). The panel's width is dragged at its
// border (or moved by ← →), and kept on the device. From the server version's public/ui/sidenote.js
import { esc } from '../lib/format.js';
import { sideWidth } from '../lib/layout.js';
import { picturePaths, renderMd } from '../lib/markdown.js';
import { groupNotes } from '../lib/notelist.js';
import { noteHeading, notesList } from '../lib/notes.js';
import { plotPathOf } from '../lib/plot.js';
import { $ } from './dom.js';
import * as store from './db.js';
import { api } from './shared.js';

/** @type {{ repo: string, path: string, text: string } | null} what the panel shows now (path '': the list) */
let shown = null;
// each drawing numbered: one started before the last is not drawn
let draws = 0;
/** @type {Map<string, string | null>} what is shown for each work: a note, '' its list, null nothing */
const kept = new Map();
const sideKey = (/** @type {string} */ repo) => `side:${repo}`;
/** @param {string} repo */
async function keptFor(repo) {
  if (!kept.has(repo)) kept.set(repo, (await store.get('prefs', sideKey(repo))) ?? null);
  return /** @type {string | null} */ (kept.get(repo));
}
/** @param {string} repo @param {string | null} path */
async function keep(repo, path) {
  kept.set(repo, path);
  await (path === null ? store.del('prefs', sideKey(repo)) : store.put('prefs', sideKey(repo), path));
}
function hide() {
  draws++;
  shown = null;
  $('side-note').hidden = true;
  $('side-note-in').innerHTML = '';
  $('side-peek').classList.remove('on');
}
const listHead =
  '<div class="plot-panel-head"><b>資料</b><span class="grow"></span><button class="ghost small" data-side-close aria-label="閉じる">×</button></div>';
/** @param {string} name */
const noteHead = name =>
  `<div class="plot-panel-head"><button class="ghost small" data-side-list>‹ 一覧</button><b>${esc(name)}</b><span class="grow"></span><button class="ghost small" data-side-close aria-label="閉じる">×</button></div>`;

// what is kept for the work, shown: the list of its notes, or a note; nothing kept: the panel closed
export async function renderSideNote() {
  const w = api.work();
  const n = ++draws;
  const path = await keptFor(w.repo);
  if (path === null) return n === draws && hide();
  const l = api.view().layout;
  const notes = notesList(l, api.files()).filter(f => f.kind === 'note');
  if (!path) {
    const texts = await api.texts(notes.map(f => f.path));
    if (n !== draws) return;
    const titled = notes.map(f => ({ ...f, title: noteHeading(texts[f.path] ?? '') ?? undefined, updated: 0 }));
    const plotFile = plotPathOf(l.plot, titled);
    const { pinned, folders } = groupNotes(titled, l.notes, plotFile);
    /** @type {(f: import('../lib/notelist.js').NoteRow) => string} */
    const row = f =>
      `<button data-side-note="${esc(f.path)}"><span>${esc(f.label)}${f.path === plotFile ? ' <span class="vis">プロット</span>' : ''}</span></button>`;
    /** @type {(name: string, rows: import('../lib/notelist.js').NoteRow[]) => string} */
    const group = (name, rows) => `<div class="notes-folder"><span>${esc(name)}</span></div><div class="notes-in">${rows.map(row).join('')}</div>`;
    const top = pinned.length ? group('主な資料', pinned) + (titled.length > pinned.length ? '<div class="notes-folder"><span>そのほか</span></div>' : '') : '';
    shown = { repo: w.repo, path: '', text: '' };
    $('side-peek').classList.add('on');
    $('side-note').hidden = false;
    $('side-note-in').innerHTML =
      listHead +
      (titled.length
        ? `<div class="notes-list side-note-body">${top}${folders.map(({ folder, rows }) => (folder === '' ? rows.map(row).join('') : group(folder, rows))).join('')}</div>`
        : '<p class="muted small">まだ資料がありません。目次の「資料」から作成できます。</p>');
    return;
  }
  const text = (await api.texts([path]))[path];
  if (n !== draws) return;
  $('side-peek').classList.add('on');
  $('side-note').hidden = false;
  if (text === null) {
    shown = null;
    $('side-note-in').innerHTML = `${noteHead(path)}<p class="muted small">この資料は読めません（無くなったか、この端末にまだ読み込まれていません）。</p>`;
    return;
  }
  // the same text: left as it is, where it was scrolled to
  const same = shown?.repo === w.repo && shown.path === path;
  if (same && shown?.text === text) return;
  const top = same ? /** @type {HTMLElement} */ ($('side-note').querySelector('.side-note-body')).scrollTop : 0;
  /** @type {Record<string, string>} */
  const urls = {};
  for (const p of picturePaths(text, path)) urls[p] = await api.pictureUrl(p);
  if (n !== draws) return;
  // (what is shown, once it is: a drawing given up for a later one has shown nothing)
  shown = { repo: w.repo, path, text };
  $('side-note-in').innerHTML =
    noteHead(noteHeading(text) ?? /** @type {string} */ (path.split('/').pop())) +
    (api.drafts().has(path) ? '<p class="muted small">この端末に、まだ送っていない書きかけがあります（ここにはその内容を出しています）。</p>' : '') +
    `<div class="preview side-note-body">${renderMd(text, path, p => urls[p])}</div>`;
  /** @type {HTMLElement} */ ($('side-note').querySelector('.side-note-body')).scrollTop = top;
}
/** @param {string | null} path a note, '' the list, null the panel closed */
async function showSide(path) {
  await keep(api.work().repo, path);
  await renderSideNote();
}

/** @param {string} w */
const putWidth = w => {
  document.documentElement.style.setProperty('--side-w', `${w}px`);
  $('side-grip').setAttribute('aria-valuenow', w);
};
// the width set (held between the least of the panel and of the text) and kept
/** @param {number} want */
const setWidth = want => {
  const w = String(sideWidth(want, innerWidth));
  putWidth(w);
  void store.put('prefs', 'side-width', w);
};
export function wireSideNote() {
  $('side-peek').addEventListener('click', async () => void showSide((await keptFor(api.work().repo)) === null ? '' : null));
  $('side-note-in').addEventListener('click', e => {
    const t = /** @type {HTMLElement} */ (e.target);
    const note = t.closest('[data-side-note]');
    if (note instanceof HTMLElement) void showSide(/** @type {string} */ (note.dataset.sideNote));
    else if (t.closest('[data-side-list]')) void showSide('');
    else if (t.closest('[data-side-close]')) void showSide(null);
  });
  void store.get('prefs', 'side-width').then(w => w && putWidth(w));
  const grip = $('side-grip');
  // followed on the whole window while held; only the pointer that took it, only the main button
  /** @type {number | null} */
  let holding = null;
  const letGo = () => {
    holding = null;
    grip.classList.remove('dragging');
  };
  grip.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    holding = e.pointerId;
    grip.classList.add('dragging');
  });
  addEventListener('pointermove', e => {
    if (holding !== e.pointerId) return;
    if (!e.buttons) return letGo();
    setWidth(innerWidth - e.clientX);
  });
  addEventListener('pointerup', letGo);
  addEventListener('pointercancel', letGo);
  grip.addEventListener('keydown', e => {
    const by = e.key === 'ArrowLeft' ? 16 : e.key === 'ArrowRight' ? -16 : 0;
    if (!by) return;
    e.preventDefault();
    setWidth($('side-note').getBoundingClientRect().width + by);
  });
}
