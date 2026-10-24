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
