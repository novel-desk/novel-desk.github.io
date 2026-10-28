// The notes (資料: the .md files of the notes folder) and the pictures of a work, from its files: where pictures go, the
// list of them, a picture added, renamed and put in the trash, and the links to it in the texts (no screen, no state
// of the app: tested by itself in tests/unit). The rules of the server version's src/works/notes.rs
import { inFolder, isEpisode } from './layout.js';
import { dirOf, linkedPath, relPath } from './markdown.js';
import { TRASH } from './episodes.js';

/** @typedef {import('./layout.js').Layout} Layout */

/** @type {Record<string, string>} */
const TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
// The content type of a picture the app shows, by its extension (null for any other file)
/** @param {string} path */
export const pictureType = path => TYPES[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] ?? null;
// The extension of a picture sent, by its content type (NFR-SEC-15: JPEG, PNG, WebP, GIF only; null for any other)
/** @param {string} type */
export const extOf = type => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' })[type] ?? null;
// The largest picture taken (NFR-SEC-15)
export const MAX_PICTURE = 5 * 1024 * 1024;

/** @param {string} path @param {string} folder */
const inside = (path, folder) => folder !== '' && path.startsWith(`${folder}/`);
// The folder of the pictures: [images] dir; else an images/ folder at the top, when there is one; else notes/images
/** @param {Layout} l @param {string[]} paths the work's files */
export function imagesDir(l, paths) {
  if (l.images) return l.images;
  if (paths.some(p => p.startsWith('images/'))) return 'images';
  return l.notes ? `${l.notes}/images` : 'images';
}
/** @typedef {{ path: string, name: string, kind: 'note' | 'image' }} Listed */
// The notes and the pictures, in the order of their paths: the files of the notes folder and of the pictures folder,
// 4 folders deep at most, hidden ones left out
/** @param {Layout} l @param {string[]} paths @returns {Listed[]} */
export function notesList(l, paths) {
  const images = imagesDir(l, paths);
  const roots = [l.notes, ...(inside(images, l.notes) ? [] : [images])].filter(r => r !== '');
  /** @type {Listed[]} */
  const out = [];
  for (const path of paths) {
    const root = roots.find(r => inside(path, r));
    if (root === undefined) continue;
    const parts = path.slice(root.length + 1).split('/');
    if (parts.length > 5 || parts.some(p => p.startsWith('.'))) continue;
    const name = parts[parts.length - 1];
    const kind = name.endsWith('.md') ? 'note' : pictureType(name) ? 'image' : null;
    if (kind) out.push({ path, name, kind });
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : 1));
}
// The work's .md files (episodes, notes, the rest) that a picture may be shown in: not in a hidden folder, _trash/ or
// node_modules/, 7 parts deep at most
/** @param {string[]} paths */
export const mdFiles = paths =>
  paths.filter(p => {
    const parts = p.split('/');
    return p.endsWith('.md') && parts.length <= 7 && !parts.some(s => s.startsWith('.') || s === 'node_modules' || s === TRASH);
  });
// Whether a path is a note: a .md file in the notes folder that is not an episode
/** @param {Layout} l @param {string} path */
export const isNote = (l, path) => path.endsWith('.md') && inside(path, l.notes) && !isEpisode(l, path);

// A file name for a new note or picture: lowercase ASCII letters, digits, - and _, 40 characters at most (every other
// letter becomes -, and runs of - become one)
/** @param {string} s */
export function asciiName(s) {
  const dashed = [...s].map(c => (/[A-Za-z0-9_-]/.test(c) ? c.toLowerCase() : '-')).join('');
  return dashed
    .split('-')
    .filter(w => w)
    .join('-')
    .slice(0, 40);
}
// the time in Japan as a new picture's name starts with it: 「20261024-093015」
/** @param {number} ms */
export function pictureStamp(ms) {
  const iso = new Date(ms + 9 * 3600 * 1000).toISOString();
  return `${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}`;
}
// Where a new picture goes: the pictures folder, its name the time and then its name in ASCII (FR-EDIT-07)
/** @param {Layout} l @param {string[]} paths @param {string} name @param {string} ext @param {number} now */
export function newPicture(l, paths, name, ext, now) {
  const base = asciiName(name.replace(/\.[^.]+$/, ''));
  return `${imagesDir(l, paths)}/${pictureStamp(now)}${base ? `-${base}` : ''}.${ext}`;
}

const PICTURE = /!\[([^\]\n]*)\]\(([^)\s]+)\)/g;
// The pictures in the text of the file at `from` that show `target`: how many, and the text with them showing `to`
// instead (when it is given; the alt text stays)
/** @param {string} text @param {string} from @param {string} target @param {string | null} to */
export function relinkImages(text, from, target, to) {
  let n = 0;
  const out = text.replace(PICTURE, (all, alt, src) => {
    if (linkedPath(from, src) !== target) return all;
    n++;
    return to === null ? all : `![${alt}](${relPath(from, to)})`;
  });
  return { text: out, n };
}
// How many pictures in the texts (by path) show the picture at `path` (FR-EDIT-09: said before it is deleted)
/** @param {Record<string, string>} texts @param {string} path */
export const pictureUses = (texts, path) => Object.entries(texts).reduce((sum, [file, text]) => sum + relinkImages(text, file, path, null).n, 0);
/**
 * A picture given a new name, its extension kept (FR-EDIT-08): moved, and every picture in the texts (by path) that
 * shows it showing it by its new name. Refused: a name not of ASCII letters, digits, - and _ (80 at most), the same
 * name, a name taken
 * @param {string[]} paths @param {Record<string, string>} texts @param {string} path @param {string} name
 */
export function renamePicture(paths, texts, path, name) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(name)) throw new Error('画像の名前は、英数字と - _ で 80 文字までにしてください');
  const file = path.slice(path.lastIndexOf('/') + 1);
  const to = inFolder(dirOf(path), `${name}${file.slice(file.lastIndexOf('.'))}`);
  if (to === path) throw new Error('いまと同じ名前です');
  if (paths.includes(to)) throw new Error('同じ名前の画像があります');
  const writes = [];
  let links = 0;
  for (const [p, text] of Object.entries(texts)) {
    const r = relinkImages(text, p, path, to);
    if (r.n) writes.push({ path: p, text: r.text });
    links += r.n;
  }
  return { moves: /** @type {[string, string][]} */ ([[path, to]]), writes, links, path: to };
}
// A file (a note, a picture) put in _trash/ at the top, named with the time (FR-EDIT-09, FR-NOTE-06)
/** @param {string[]} paths @param {string} path @param {string} stamp (trashStamp) */
export function toTrash(paths, path, stamp) {
  const file = path.slice(path.lastIndexOf('/') + 1);
  let kept = `${TRASH}/${stamp}_${file}`;
  for (let n = 2; paths.includes(kept); n++) kept = `${TRASH}/${stamp}-${n}_${file}`;
  return kept;
}

// --- notes made, renamed, put in the trash (FR-NOTE-01, FR-NOTE-05, FR-NOTE-06)

// A note's title: its first line, when that is a 「# 見出し」 (60 characters at most; null when it is not)
/** @param {string} text */
export function noteHeading(text) {
  const first = text
    .replace(/^﻿/, '')
    .split('\n')
    .find(l => l.trim() !== '');
  const title = first?.startsWith('# ') ? first.slice(2).trim() : '';
  return title ? [...title].slice(0, 60).join('') : null;
}
// The folder for a new note in the notes folder: 「キャラ」, 「旧版/プロット」. Any letters, 3 levels at most ('' the top)
/** @param {string} s */
export function noteFolder(s) {
  const parts = s
    .split('/')
    .map(p => p.trim())
    .filter(p => p);
  // eslint-disable-next-line no-control-regex
  if (parts.some(p => p.startsWith('.') || /[\u0000-\u001f\u007f\\]/.test(p) || [...p].length > 40))
    throw new Error('フォルダの名前が正しくありません（. で始めない、40 文字まで）');
  if (parts.length > 3) throw new Error('フォルダは 3 段までです');
  return parts.join('/');
}
// A note's text with the heading 「# title」: in place of its first line when that is a 「# 見出し」 (after blank lines
// and a byte order mark), else above the text
/** @param {string} text @param {string} title */
export function noteTitled(text, title) {
  const heading = `# ${title}`;
  let at = 0;
  for (const line of text.split(/(?<=\n)/)) {
    const bare = line.replace(/^﻿/, '');
    if (bare.trim() === '') {
      at += line.length;
      continue;
    }
    if (bare.startsWith('# ')) {
      const mark = line.length - bare.length;
      const end = at + line.replace(/[\r\n]+$/, '').length;
      return text.slice(0, at) + line.slice(0, mark) + heading + text.slice(end);
    }
    break;
  }
  const body = text.replace(/^﻿/, '');
  return `${text.slice(0, text.length - body.length)}${heading}\n\n${body}`;
}
/**
 * A new note in the folder `folder` of the notes folder: its file name the name in ASCII (or the time, when nothing
 * of it is left), its heading the name as given
 * @param {Layout} l @param {string[]} paths @param {string} folder @param {string} name @param {string} title its heading (cleanTitle) @param {number} now
 */
export function newNote(l, paths, folder, name, title, now) {
  if (!l.notes) throw new Error('資料のフォルダが決まっていません。novel.toml の [notes] dir に書いてください');
  const file = asciiName(name) || `note-${pictureStamp(now)}`;
  const path = inFolder(l.notes, inFolder(noteFolder(folder), `${file}.md`));
  if (paths.includes(path)) throw new Error('同じ名前の資料があります');
  return { path, text: `# ${title}\n\n` };
}
/**
 * A note given a new name (FR-NOTE-05): its heading, and its file name in the same folder (the name in ASCII; the file
 * name stays when nothing of it is left). The plot keeps its headings (each 「# 」 is a 大箱): only its file name
 * changes, and [plot] file follows it (`plot`: the note is the plot, found by its name: [plot] file is set then).
 * [characters] file follows the note too
 * @param {Layout} l @param {string[]} paths @param {string} path @param {string} name @param {string} title its heading (cleanTitle)
 * @param {string} text the note's text @param {boolean} plot
 */
export function renameNote(l, paths, path, name, title, text, plot) {
  if (!name.trim()) throw new Error('名前を入れてください');
  const isPlot = l.plot === path || (plot && !l.plot);
  const ascii = asciiName(name);
  const to = ascii ? inFolder(dirOf(path), `${ascii}.md`) : path;
  const titled = isPlot ? text : noteTitled(text, title);
  if (isPlot && to === path) throw new Error('プロットの資料は見出しを変えません。ファイル名にする英数字の名前を入れてください');
  if (to === path && titled === text) throw new Error('いまと同じ名前です');
  if (to !== path && paths.includes(to)) throw new Error('同じ名前の資料があります');
  /** @type {import('./tomledit.js').TomlEdit[]} */
  const edits = [];
  if (isPlot && to !== path) edits.push({ key: ['plot', 'file'], value: to });
  if (l.characters === path && to !== path) edits.push({ key: ['characters', 'file'], value: to });
  return {
    moves: /** @type {[string, string][]} */ (to === path ? [] : [[path, to]]),
    writes: titled === text ? [] : [{ path: to, text: titled }],
    edits,
    path: to,
  };
}
// A note put in _trash/ (FR-NOTE-06): the plot is no longer chosen when it is that note
/** @param {Layout} l @param {string[]} paths @param {string} path @param {string} stamp (trashStamp) */
export function trashNote(l, paths, path, stamp) {
  return {
    moves: /** @type {[string, string][]} */ ([[path, toTrash(paths, path, stamp)]]),
    writes: [],
    edits: l.plot === path ? [{ key: ['plot', 'file'], value: null }] : [],
    path: '',
  };
}

// --- the screen 資料 (ui/notes.js)

// a note's name as the screen says it: its heading, else its file name
/** @param {string} text @param {string} path */
export const noteTitle = (text, path) => noteHeading(text) ?? /** @type {string} */ (path.split('/').pop());
// what is said over the list when the work has no notes folder ('' it has one)
/** @param {string} dir */
export const notesWhere = dir => (dir ? '' : '資料のフォルダが設定されていません。novel.toml の [notes] dir を設定すると、ここに表示されます');
// A box of the plot or a person written by itself: the lines before and after it, kept aside. The note's whole text,
// with what is in the box (null: the whole note is in the box)
/** @param {{ before: string[], after: string[] } | null} section @param {string} box */
export const sectionText = (section, box) => (section ? [...section.before, ...box.split('\n'), ...section.after].join('\n') : box);
// where the box begins in the note's whole text (the lines before it, each with its line end)
/** @param {string[]} before */
export const sectionStart = before => before.reduce((n, l) => n + l.length + 1, 0);
// what is asked for a new note's name: in a folder, or anywhere (「フォルダ/名前」)
/** @param {string} folder '' none */
export const addNoteAsk = folder =>
  folder
    ? `「${folder}」に作成する資料の名前（ファイル名は英数字になります。例: alice）`
    : '資料の名前（ファイル名は英数字になります。例: characters、world、plot）。フォルダに入れるときは「フォルダ/名前」（例: キャラ/alice）';
// The new note asked for (FR-NOTE-01): null when closed (or nothing typed); a name of spaces only, refused; else the
// folder (the one it is made in, or the part of 「フォルダ/名前」 before its last 「/」) and its name
/** @param {string | null} given @param {string} folder '' none @returns {null | { error: string } | { folder: string, name: string }} */
export function addedNote(given, folder) {
  if (!given) return null;
  if (!given.trim()) return { error: '名前を入れてください' };
  if (folder) return { folder, name: given };
  const at = given.lastIndexOf('/');
  return { folder: given.slice(0, Math.max(0, at)), name: given.slice(at + 1) };
}
// What is asked for a note's new name (FR-NOTE-05): the plot's note, its file name only (its 大箱 stay); another, its
// name (its heading), shown now as `name`
/** @param {boolean} isPlot @param {string} path @param {string} name */
export const noteRenameAsk = (isPlot, path, name) =>
  isPlot
    ? {
        now: /** @type {string} */ (path.split('/').pop()).replace(/\.md$/, ''),
        ask: 'プロットの資料の新しいファイル名（英数字と - _）。大箱の見出しは変えません',
      }
    : { now: name, ask: '資料の新しい名前（資料の 1 行目の見出しになります。ファイル名は英数字になり、英数字が無ければ今のままです）' };
