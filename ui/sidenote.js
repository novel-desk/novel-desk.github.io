// 横の資料: the notes of the work beside the text, on a PC's or an iPad's (landscape) width only (FR-NOTE-11): their
// list, as on 資料, and one of them as read (a preview). Which is shown is kept on the device for each work, and the
// note is read again each time an episode is opened (a draft of it not sent: that). The panel's width is dragged at its
// border (or moved by ← →), and kept on the device. From the server version's public/ui/sidenote.js
import { gripStep, sideWidth } from '../lib/layout.js';
import { picturePaths, renderMd } from '../lib/markdown.js';
import { inNotes, sideListHtml, sideNoteHtml, sideUnreadable, titledNotes } from '../lib/notelist.js';
import { notesList } from '../lib/notes.js';
import { plotPathOf } from '../lib/plot.js';
import { $, busy } from './dom.js';
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
// (the desk left, or another work opened: as the server version's leaveSideNote)
export function hide() {
  draws++;
  shown = null;
  $('side-note').hidden = true;
  $('side-note-in').innerHTML = '';
  $('side-peek').classList.remove('on');
}
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
    const titled = titledNotes(notes, texts);
    shown = { repo: w.repo, path: '', text: '' };
    $('side-peek').classList.add('on');
    $('side-note').hidden = false;
    $('side-note-in').innerHTML = sideListHtml(titled, l.notes, plotPathOf(l.plot, titled));
    return;
  }
  const text = (await api.texts([path]))[path];
  if (n !== draws) return;
  $('side-peek').classList.add('on');
  $('side-note').hidden = false;
  if (text === null) {
    shown = null;
    $('side-note-in').innerHTML = sideUnreadable(path);
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
  $('side-note-in').innerHTML = sideNoteHtml(
    inNotes(path, api.view().layout.notes),
    api.drafts().has(path),
    renderMd(text, path, p => urls[p]),
  );
  /** @type {HTMLElement} */ ($('side-note').querySelector('.side-note-body')).scrollTop = top;
}
// (said in the band while the notes and their pictures are read: DESK-OPS-05)
/** @param {string | null} path a note, '' the list, null the panel closed */
async function showSide(path) {
  await busy('読み込んでいます…', async () => {
    await keep(api.work().repo, path);
    await renderSideNote();
  });
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
    const by = gripStep(e.key);
    if (!by) return;
    e.preventDefault();
    setWidth($('side-note').getBoundingClientRect().width + by);
  });
}
