// novel.toml: where the manuscript is, which files are episodes, their titles; and the table of contents made from the
// files of a branch (no screen, no state of the app: tested by itself in tests/unit). From the server version's
// src/works/layout.rs, names.rs and contents.rs, as much as reading and writing episodes needs
import { parseToml } from './toml.js';

/** @typedef {import('./toml.js').TomlValue} TomlValue */
/** @typedef {import('./toml.js').TomlTable} TomlTable */
/**
 * What novel.toml says (or, without one, the first layout: numbered episodes at the top)
 * @typedef {object} Layout
 * @property {string} title the work's title ('' when not set)
 * @property {string} dir the manuscript folder, from the top ('' = the top itself)
 * @property {string[]} files which file names are episodes (globs, "*.md")
 * @property {string[]} exclude paths (from dir) that are not episodes, though they match
 * @property {boolean} prefixed naming = "chapter-number": no chapter folders; 「2-09.md」 is chapter 2, episode 9
 * @property {boolean} bare naming = "number" (or "chapter-number"): new episodes and chapters are named by number alone,
 *   their titles kept in [titles]
 * @property {boolean} heading title = "heading": an episode's title is its first line 「# 第1話 題名」
 * @property {Record<string, string>} titles titles by path from dir ([titles])
 * @property {string} branch [git] branch: the branch read and written ('' = the repository's default)
 * @property {string} notes [notes] dir: the notes folder, from the top ('' = not set)
 * @property {string} images [images] dir: where pictures go ('' = not set)
 * @property {string} plot [plot] file: the note that is the plot ('' = not chosen)
 * @property {string} characters [characters] file: the note of the characters ('' = found by its name)
 * @property {Record<string, string>} links [plot.links]: episode (path from dir) → the 中箱 it is written from
 */
/**
 * An episode of the table of contents: its path from the top, and its path from the manuscript folder
 * @typedef {{ type: 'episode', path: string, rel: string }} TocEpisode
 * @typedef {{ type: 'chapter', path: string, rel: string, episodes: TocEpisode[] }} TocChapter
 * @typedef {TocEpisode | TocChapter} TocItem
 */

export const CONFIG = 'novel.toml';

/** @returns {Layout} */
export const firstLayout = () => ({
  title: '',
  dir: '',
  files: ['*.md'],
  exclude: [],
  prefixed: false,
  bare: false,
  heading: false,
  titles: {},
  branch: '',
  notes: '',
  images: '',
  plot: '',
  characters: '',
  links: {},
});

/** @param {string} folder @param {string} name */
export const inFolder = (folder, name) => (folder ? `${folder}/${name}` : name);
// a plain path inside the work: no empty part, no 「.」 「..」 「.git」, not from the root
/** @param {string} p */
export const safeRel = p => p !== '' && !p.startsWith('/') && !p.includes('\0') && p.split('/').every(s => s !== '' && s !== '.' && s !== '..' && s !== '.git');

/** @param {TomlValue | undefined} v @returns {v is TomlTable} */
const isTable = v => typeof v === 'object' && !Array.isArray(v);

// The layout that novel.toml (`src`) says, and what in it cannot be read (each said on the screen). A novel.toml that
// cannot be read at all gives the first layout. A value of the wrong kind is said, and left as if it were not there
/** @param {string} src @returns {{ layout: Layout, problems: string[] }} */
export function parseLayout(src) {
  const l = firstLayout();
  const { table, error } = parseToml(src);
  if (!table) return { layout: l, problems: [`novel.toml が読めません（${error}）。本文のフォルダを一番上として読みます`] };
  /** @type {string[]} */
  const problems = [];
  /** @param {string} name @returns {TomlTable} */
  const section = name => {
    const t = table[name];
    if (t === undefined || isTable(t)) return t ?? {};
    problems.push(`[${name}] が表ではありません`);
    return {};
  };
  // a text value: table.key (where = 「manuscript.dir」 for what is said)
  /** @param {TomlTable} t @param {string} key @param {string} where @returns {string} */
  const text = (t, key, where) => {
    const v = t[key];
    if (v === undefined || typeof v === 'string') return v ?? '';
    problems.push(`${where} が文字列ではありません`);
    return '';
  };
  /** @param {TomlValue[]} a @param {string} where @returns {string[]} */
  const texts = (a, where) => {
    if (a.some(v => typeof v !== 'string')) problems.push(`${where} に文字列でない値があります`);
    return /** @type {string[]} */ (a.filter(v => typeof v === 'string'));
  };
  // A folder from novel.toml, which comes from the repository: a plain path inside the work, or else the top ('')
  /** @param {TomlTable} t @param {string} where */
  const folder = (t, where) => {
    const dir = text(t, 'dir', where).replace(/^\/+|\/+$/g, '');
    if (dir === '' || safeRel(dir)) return dir;
    problems.push(`${where}「${dir}」は作品の中のフォルダではないので、一番上として読みます`);
    return '';
  };
  const manuscript = section('manuscript'),
    git = section('git'),
    plot = section('plot');
  l.title = text(table, 'title', 'title');
  l.dir = folder(manuscript, 'manuscript.dir');
  const files = manuscript.files;
  if (Array.isArray(files)) l.files = texts(files, 'manuscript.files');
  else if (typeof files === 'string' && files !== '') l.files = [files];
  else if (files !== undefined && files !== '') problems.push('manuscript.files が文字列でも配列でもありません');
  const exclude = manuscript.exclude;
  if (Array.isArray(exclude)) l.exclude = texts(exclude, 'manuscript.exclude');
  else if (exclude !== undefined) problems.push('manuscript.exclude が配列ではありません');
  const naming = text(manuscript, 'naming', 'manuscript.naming');
  l.prefixed = naming === 'chapter-number';
  l.bare = naming === 'number' || l.prefixed;
  l.heading = text(manuscript, 'title', 'manuscript.title') === 'heading';
  l.branch = text(git, 'branch', 'git.branch').trim();
  l.notes = folder(section('notes'), 'notes.dir');
  l.images = folder(section('images'), 'images.dir');
  l.plot = text(plot, 'file', 'plot.file').trim();
  l.characters = text(section('characters'), 'file', 'characters.file').trim();
  /** @param {TomlValue | undefined} t @param {string} name @param {Record<string, string>} into */
  const textTable = (t, name, into) => {
    if (t === undefined) return;
    if (!isTable(t)) return void problems.push(`[${name}] が表ではありません`);
    for (const [key, v] of Object.entries(t)) {
      if (typeof v === 'string') into[key] = v;
      else problems.push(`[${name}] の「${key}」が文字列ではありません`);
    }
  };
  textTable(table.titles, 'titles', l.titles);
  textTable(plot.links, 'plot.links', l.links);
  return { layout: l, problems };
}

// --- names

/** 話 = 「番号_題名.md」か「番号.md」、章 = 「番号_章の題名」か「番号」 */
const NUMBERED = /^(\d+)(?:_(.+?))?(\.md)?$/;
// a number from a name, as a number (one too long to be exact sorts last, as the server version's u64::MAX did)
/** @param {string} digits */
const num = digits => (digits.length > 15 ? Number.MAX_SAFE_INTEGER : Number(digits));
// The parts of a numbered name: its number, its title ('' when the name has none), and whether it ends in .md (null
// when the name does not start with a number)
/** @param {string} name @returns {{ number: number, title: string, md: boolean } | null} */
export function numbered(name) {
  const m = NUMBERED.exec(name);
  return m ? { number: num(m[1]), title: m[2] ?? '', md: m[3] !== undefined } : null;
}
/** The chapter-number naming: 「2-09.md」 「09.md」 「2-11-2.md」 「2-09_題名.md」 */
const PREFIXED = /^(?:(\d+)-)?(\d+)(?:-(\d+))?(?:_(.+?))?\.md$/;
// The parts of a name of the chapter-number naming (null when the name does not have that shape). A name without a
// chapter (「09.md」) is in chapter 1
/** @param {string} name @returns {{ chapter: number, number: number, part: number, title: string, hasChapter: boolean } | null} */
export function prefixed(name) {
  const m = PREFIXED.exec(name);
  return m ? { chapter: m[1] ? num(m[1]) : 1, number: num(m[2]), part: m[3] ? num(m[3]) : 0, title: m[4] ?? '', hasChapter: m[1] !== undefined } : null;
}
/** @param {string} a @param {string} b */
const textOrder = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// The order of file names, with their numbers compared as numbers ("2_" comes before "10_")
/** @param {string} a @param {string} b */
export function nameOrder(a, b) {
  const x = numbered(a),
    y = numbered(b);
  return (x && y && x.number - y.number) || textOrder(a, b);
}
// The order of the chapter-number naming: by chapter, then number, then part (only names of that shape are sorted)
/** @param {string} a @param {string} b */
export function prefixedOrder(a, b) {
  const x = /** @type {NonNullable<ReturnType<typeof prefixed>>} */ (prefixed(a)),
    y = /** @type {NonNullable<ReturnType<typeof prefixed>>} */ (prefixed(b));
  return x.chapter - y.chapter || x.number - y.number || x.part - y.part || textOrder(a, b);
}

// A glob of [manuscript] files as a pattern of names: 「*」 any characters, 「?」 one, 「[abc]」 「[a-z]」 「[!abc]」 one of
// them or not (as the glob crate of the server version reads them). null when it cannot be read (a 「[」 not closed):
// then it matches every name, as there
/** @param {string} glob @returns {RegExp | null} */
export function globPattern(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') re += '.*';
    else if (c === '?') re += '.';
    else if (c === '[') {
      const end = glob.indexOf(']', i + 2);
      if (end === -1) return null;
      const not = glob[i + 1] === '!';
      const body = glob.slice(not ? i + 2 : i + 1, end).replace(/[\\\]^]/g, '\\$&');
      re += `[${not ? '^' : ''}${body}]`;
      i = end;
    } else re += c.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 's');
}

// --- where an episode is

// A path from the top, as a path from the manuscript folder (null when it is not in the manuscript folder)
/** @param {Layout} l @param {string} path @returns {string | null} */
export function relOf(l, path) {
  if (!l.dir) return path;
  return path.startsWith(`${l.dir}/`) ? path.slice(l.dir.length + 1) : null;
}
// Whether a file is an episode: its name has the shape of one, matches [manuscript] files, and its path is not in
// [manuscript] exclude
/** @param {Layout} l @param {string} name @param {string} rel */
export function episodeName(l, name, rel) {
  const shaped = l.prefixed ? prefixed(name) !== null : numbered(name)?.md === true;
  const listed = l.files.some(g => globPattern(g)?.test(name) ?? true);
  return shaped && listed && !l.exclude.includes(rel);
}
// Whether a folder's name is a chapter's: 「番号_章の題名」 or 「番号」
/** @param {string} name */
export const chapterName = name => numbered(name)?.md === false;
// Whether a path from the top is an episode: 「話」 or 「章/話」 in the manuscript folder
/** @param {Layout} l @param {string} path */
export function isEpisode(l, path) {
  const rel = relOf(l, path);
  if (rel === null) return false;
  const parts = rel.split('/');
  if (parts.length === 1) return episodeName(l, rel, rel);
  return !l.prefixed && parts.length === 2 && chapterName(parts[0]) && episodeName(l, parts[1], rel);
}

// The heading on an episode's first line: 「# 第1話 題名」 gives 「題名」, and 「# 題名」 (or 「# 第1話」 alone) the whole of
// it. null when the first line that is not empty is not a heading
/** @param {string} text @returns {string | null} */
export const episodeHeading = text => headingParts(text)?.title ?? null;
// The heading's parts: 「# 第1話 題名」 gives 第1話 and 題名, 「# 題名」 no number (the server version's episode_heading)
/** @param {string} text @returns {{ number: string, title: string } | null} */
export function headingParts(text) {
  const first = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .find(line => line.trim() !== '');
  if (!first?.startsWith('# ')) return null;
  const heading = first.slice(2).trim();
  const m = /^(第[0-9０-９〇一二三四五六七八九十百千]+話)\s*(.*)$/.exec(heading);
  if (m && m[2].trim()) return { number: m[1], title: m[2].trim() };
  return heading ? { number: '', title: heading } : null;
}

// The title of an episode or a chapter (`rel`, from the manuscript folder; a chapter of the chapter-number naming is
// 「2-」): its heading (title = "heading", `headings` read from the files), else its [titles], else the title in its
// name, else 第 n 話 or 第 n 章
/** @param {Layout} l @param {string} rel @param {Record<string, string>} [headings] */
export function titleOf(l, rel, headings = {}) {
  const set = headings[rel] || l.titles[rel];
  if (set) return set;
  if (l.prefixed) {
    const chapter = /^(\d+)-$/.exec(rel);
    if (chapter) return `第${num(chapter[1])}章`;
    const p = prefixed(rel);
    if (p) return p.title || (p.part ? `第${p.number}話（${p.part}）` : `第${p.number}話`);
  }
  const name = rel.slice(rel.lastIndexOf('/') + 1);
  const n = numbered(name);
  if (!n) return name.replace(/\.md$/, '');
  return n.title || `第${n.number}${n.md ? '話' : '章'}`;
}

// The table of contents of a branch, from the paths of its files (the blobs of the tree, links left out): the chapters
// and loose episodes at the top of the manuscript folder, in one numbering, each chapter with its episodes in order.
// `folders` are the paths of the tree's folders: a chapter's folder with no episode in it is listed too
/** @param {Layout} l @param {string[]} paths @param {string[]} [folders] @returns {TocItem[]} */
export function tableOfContents(l, paths, folders = []) {
  /** @type {Map<string, string[]>} chapter (path from dir) → its episodes' names */
  const chapters = new Map();
  if (!l.prefixed)
    for (const path of folders) {
      const rel = relOf(l, path);
      if (rel !== null && !rel.includes('/') && chapterName(rel)) chapters.set(rel, []);
    }
  /** @type {string[]} */
  const loose = [];
  for (const path of paths) {
    if (!isEpisode(l, path)) continue;
    const rel = /** @type {string} */ (relOf(l, path));
    const slash = rel.indexOf('/');
    if (l.prefixed) {
      const key = `${/** @type {NonNullable<ReturnType<typeof prefixed>>} */ (prefixed(rel)).chapter}-`;
      chapters.set(key, [...(chapters.get(key) ?? []), rel]);
    } else if (slash === -1) loose.push(rel);
    else {
      const chapter = rel.slice(0, slash);
      chapters.set(chapter, [...(chapters.get(chapter) ?? []), rel.slice(slash + 1)]);
    }
  }
  /** @type {(rel: string) => TocEpisode} */
  const episode = rel => ({ type: 'episode', path: inFolder(l.dir, rel), rel });
  /** @type {(rel: string) => TocChapter} */
  const chapter = rel => {
    const names = /** @type {string[]} */ (chapters.get(rel));
    const episodes = l.prefixed ? names.sort(prefixedOrder).map(episode) : names.sort(nameOrder).map(n => episode(`${rel}/${n}`));
    return { type: 'chapter', path: inFolder(l.dir, rel), rel, episodes };
  };
  if (l.prefixed) return [...chapters.keys()].sort((a, b) => parseInt(a) - parseInt(b)).map(chapter);
  return [...chapters.keys(), ...loose].sort(nameOrder).map(rel => (chapters.has(rel) ? chapter(rel) : episode(rel)));
}
// Every episode of the table of contents, in order, the ones in chapters too
/** @param {TocItem[]} items @returns {TocEpisode[]} */
export const episodesOf = items => items.flatMap(it => (it.type === 'episode' ? [it] : it.episodes));
// title = "heading": the titles of the episodes from their first lines (by path from the manuscript folder). `texts`
// are the episodes' texts by path from the top (null: not read, or not UTF-8)
/** @param {Layout} l @param {TocItem[]} items @param {Record<string, string | null>} texts @returns {Record<string, string>} */
export function headingsOf(l, items, texts) {
  /** @type {Record<string, string>} */
  const found = {};
  if (!l.heading) return found;
  for (const e of episodesOf(items)) {
    const title = episodeHeading(texts[e.path] ?? '');
    if (title) found[e.rel] = title;
  }
  return found;
}
// The title of an episode with the text `text` (title = "heading": the heading in that text, which may be new)
/** @param {Layout} l @param {string} rel @param {string} text @param {Record<string, string>} headings */
export function titleWith(l, rel, text, headings) {
  const heading = l.heading ? episodeHeading(text) : null;
  return titleOf(l, rel, heading ? { ...headings, [rel]: heading } : headings);
}

// 横の資料: the panel beside the text at least 240px wide, and the text at least 420px beside the 280px table of
// contents, however wide the panel is dragged (FR-NOTE-11; the server version's public/lib/layout.js)
export const SIDE_MIN = 240;
export const BESIDE_MIN = 280 + 420;
/** @type {(want: number, screen: number) => number} the panel's width for one dragged to `want` on a screen so wide */
export const sideWidth = (want, screen) => Math.round(Math.max(SIDE_MIN, Math.min(want, screen - BESIDE_MIN)));
// the panel's border moved by the keyboard: ← widens it, → narrows it, 16px a press (0: another key)
/** @param {string} key */
export const gripStep = key => (key === 'ArrowLeft' ? 16 : key === 'ArrowRight' ? -16 : 0);
