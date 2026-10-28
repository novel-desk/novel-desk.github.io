// The list of a work's notes as the screens show it (資料 and the note beside the text): no screen, no state of the
// app, tested by itself in tests/unit. From the server version's public/lib/notelist.js

import { esc } from './format.js';
import { noteHeading } from './notes.js';

/** @typedef {{ path: string, name: string, title?: string, updated: number }} NoteFile */
/** @typedef {NoteFile & { label: string }} NoteRow a note with what its row says */

// the notes used most: the plot, the characters, the world, the settings
const PINNED = /プロット|plot|キャラ|人物|character|世界観|world|設定|setting/i;
/**
 * The ones used most on top (主な資料); then the rest by folder, the top folder first, each folder by its name. A row
 * says the note's title, or its path in the notes' folder (on top) or its file name (in a folder)
 * @param {NoteFile[]} notes @param {string} dir the notes' folder @param {string | undefined} plotFile the plot's note
 * @returns {{ pinned: NoteRow[], folders: { folder: string, rows: NoteRow[] }[] }}
 */
export function groupNotes(notes, dir, plotFile) {
  const pinned = notes.filter(f => f.path === plotFile || PINNED.test(`${f.name} ${f.title || ''}`));
  /** @type {Map<string, NoteRow[]>} */
  const folders = new Map();
  // a note shown on top is not shown again under its folder
  for (const f of notes.filter(f => !pinned.includes(f))) {
    const rel = f.path.slice(dir.length + 1),
      at = rel.lastIndexOf('/');
    const folder = at < 0 ? '' : rel.slice(0, at);
    if (!folders.has(folder)) folders.set(folder, []);
    /** @type {NoteRow[]} */ (folders.get(folder)).push({ ...f, label: f.title || rel.slice(at + 1) });
  }
  return {
    pinned: pinned.map(f => ({ ...f, label: f.title || f.path.slice(dir.length + 1) })),
    folders: [...folders.keys()]
      .sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b, 'ja')))
      .map(folder => ({ folder, rows: /** @type {NoteRow[]} */ (folders.get(folder)) })),
  };
}

// the notes with their texts' headings as titles (the lists show them in place of the file names; `texts`: null, not read)
/** @param {{ path: string, name: string }[]} notes @param {Record<string, string | null>} texts @returns {NoteFile[]} */
export const titledNotes = (notes, texts) => notes.map(f => ({ ...f, title: noteHeading(texts[f.path] ?? '') ?? undefined, updated: 0 }));

/** @param {NoteRow} f @param {string} plotFile */
const label = (f, plotFile) => `<span>${esc(f.label)}${f.path === plotFile ? ' <span class="vis">プロット</span>' : ''}</span>`;
// 主な資料 on top, and 「そのほか」 under them when other notes follow
/** @param {NoteFile[]} notes @param {NoteRow[]} pinned @param {(rows: NoteRow[]) => string} rows */
const topOf = (notes, pinned, rows) =>
  pinned.length
    ? `<div class="notes-folder"><span>主な資料</span></div><div class="notes-in">${rows(pinned)}</div>${notes.length > pinned.length ? '<div class="notes-folder"><span>そのほか</span></div>' : ''}`
    : '';

// The list of notes on 資料 (FR-NOTE-01, FR-NOTE-02): the ones used most on top, then by folder, a folder with its
// button to make a note in it; each row with its title, the plot said, and 未送信 when it has a draft not sent
/** @param {NoteFile[]} notes @param {string} dir @param {string} plotFile @param {{ has: (path: string) => boolean }} drafts */
export function notesIndexHtml(notes, dir, plotFile, drafts) {
  if (!notes.length) return '<p class="muted small">まだ資料がありません。「＋ 資料を追加」で作成できます。</p>';
  const { pinned, folders } = groupNotes(notes, dir, plotFile);
  /** @param {NoteRow[]} list */
  const rows = list =>
    list
      .map(f => `<button data-note="${esc(f.path)}">${label(f, plotFile)}${drafts.has(f.path) ? '<small class="unsent-tag">未送信</small>' : ''}</button>`)
      .join('');
  return (
    topOf(notes, pinned, rows) +
    folders
      .map(({ folder, rows: list }) =>
        folder === ''
          ? rows(list)
          : `<div class="notes-folder"><span>${esc(folder)}</span><button class="ghost" data-add-in="${esc(folder)}" title="このフォルダに資料を作成">＋</button></div><div class="notes-in">${rows(list)}</div>`,
      )
      .join('')
  );
}

// --- 横の資料 (FR-NOTE-11: ui/sidenote.js)

const CLOSE = '<button class="ghost small" data-side-close aria-label="閉じる">×</button>';
// The panel's list: the same as on 資料 (without the drafts and the buttons to make one), under its head
/** @param {NoteFile[]} notes @param {string} dir @param {string} plotFile */
export function sideListHtml(notes, dir, plotFile) {
  const head = `<div class="plot-panel-head"><b>資料</b><span class="grow"></span>${CLOSE}</div>`;
  if (!notes.length) return `${head}<p class="muted small">まだ資料がありません。目次の「資料」から作成できます。</p>`;
  const { pinned, folders } = groupNotes(notes, dir, plotFile);
  /** @param {NoteRow[]} list */
  const rows = list => list.map(f => `<button data-side-note="${esc(f.path)}">${label(f, plotFile)}</button>`).join('');
  /** @param {string} name @param {NoteRow[]} list */
  const group = (name, list) => `<div class="notes-folder"><span>${esc(name)}</span></div><div class="notes-in">${rows(list)}</div>`;
  return `${head}<div class="notes-list side-note-body">${topOf(notes, pinned, rows)}${folders.map(({ folder, rows: list }) => (folder === '' ? rows(list) : group(folder, list))).join('')}</div>`;
}
// the head over a note in the panel: back to the list, its name, close
/** @param {string} name */
export const sideNoteHead = name =>
  `<div class="plot-panel-head"><button class="ghost small" data-side-list>‹ 一覧</button><b>${esc(name)}</b><span class="grow"></span>${CLOSE}</div>`;
// a note in the panel, by its path in the notes folder (as the server version's); one elsewhere by its whole path
/** @param {string} path @param {string} dir */
export const inNotes = (path, dir) => path.replace(new RegExp(`^${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`), '');
// a note the panel cannot read (gone, or not on the device yet)
/** @param {string} path */
export const sideUnreadable = path =>
  `${sideNoteHead(path)}<p class="muted small">この資料は読めません（無くなったか、この端末にまだ読み込まれていません）。</p>`;
// a note as the panel shows it: its head, its draft not sent said, its text as read (`html`: lib/markdown.js renderMd)
/** @param {string} name @param {boolean} draft @param {string} html */
export const sideNoteHtml = (name, draft, html) =>
  sideNoteHead(name) +
  (draft ? '<p class="muted small">この端末に、まだ送っていない書きかけがあります（ここにはその内容を出しています）。</p>' : '') +
  `<div class="preview side-note-body">${html}</div>`;
