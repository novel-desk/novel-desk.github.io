// Episodes and chapters added, renamed, put in the trash and reordered, as files moved and written and novel.toml's
// keys set (no screen, no state of the app: tested by itself in tests/unit). The rules of the server version's
// src/works/editing.rs, names.rs and layout.rs (follow_titles, follow_links): what it does to the files of a work, said
// as a plan that the screen keeps as changes not sent yet (lib/changes.js)
import { chapterName, episodesOf, headingParts, inFolder, isEpisode, numbered, prefixed, relOf, titleOf } from './layout.js';
import { tableEdits } from './tomledit.js';

/** @typedef {import('./layout.js').Layout} Layout */
/** @typedef {import('./layout.js').TocItem} TocItem */
/** @typedef {import('./tomledit.js').TomlEdit} TomlEdit */
/**
 * The work as the screen has it (its files with the changes not sent over them)
 * @typedef {{ layout: Layout, toc: TocItem[], files: string[], headings: Record<string, string>, textOf: (path: string) => string | null }} Shown
 */
/**
 * What an operation does: files moved (from, to: paths from the top, all at once), files written, novel.toml's keys
 * set, and the path it is about afterwards (the episode made or renamed)
 * @typedef {{ moves: [string, string][], writes: { path: string, text: string }[], edits: TomlEdit[], path: string }} Plan
 */

export const TRASH = '_trash';
// The largest number that the app gives a new episode or chapter (FR-TOC-02, FR-TOC-03)
export const MAX_NUMBER = 999999;
// the longest file name that most file systems take, in bytes
const NAME_BYTES = 255;

/** @param {string} s */
const bytesOf = s => new TextEncoder().encode(s).length;
// `s` cut at a character boundary, to `max` bytes (UTF-8) at most
/** @param {string} s @param {number} max */
export function cutBytes(s, max) {
  let out = '';
  for (const c of s) {
    if (bytesOf(out + c) > max) break;
    out += c;
  }
  return out;
}
// A title that can be used in a file name: no / \ NUL or line breaks, not starting with a dot or a space, 80
// characters and 240 bytes at most. An empty title becomes 無題 (the server version's clean_title)
/** @param {string} t */
export function cleanTitle(t) {
  const trimmed = t
    .replace(/[/\\\0\r\n]/g, ' ')
    .replace(/^[\s.]+/, '')
    .trimEnd();
  const title = cutBytes([...trimmed].slice(0, 80).join(''), 240).trimEnd();
  return title || '無題';
}
/** @param {number} n @param {number} width */
export const pad = (n, width) => String(n).padStart(width, '0');
// The digits that the numbers of `count` items need: at least 2
/** @param {number} count */
export const width = count => Math.max(2, String(count).length);
// The number of a new episode or chapter after the one numbered `last` (refused past MAX_NUMBER)
/** @param {number} last */
export function nextNumber(last) {
  if (last >= MAX_NUMBER) throw new Error(`これ以上は追加できません（番号の上限は ${MAX_NUMBER}）`);
  return last + 1;
}
// the leading digits of a name: 「07」 of 「07_駅で.md」
/** @param {string} name */
const numberPart = name => /** @type {RegExpExecArray} */ (/^\d*/.exec(name))[0];
// The name with another number: 「07_駅で.md」 becomes 「03_駅で.md」
/** @param {string} name @param {number} number @param {number} w */
export const renamedNumber = (name, number, w) => pad(number, w) + name.slice(numberPart(name).length);
// The name of a new episode or chapter: 「03_題名.md」, or 「03.md」 when the title is kept elsewhere
/** @param {Layout} l @param {number} number @param {number} w @param {string} title @param {boolean} md */
export function newName(l, number, w, title, md) {
  const ext = md ? '.md' : '';
  return l.bare || l.heading ? `${pad(number, w)}${ext}` : `${pad(number, w)}_${title}${ext}`;
}
// The 「第N話 」 for a new episode's heading: one more than the number in the heading of the episode before ('' when
// that one has none, or has the largest number)
/** @param {string | null} before */
export function nextHeadingNumber(before) {
  const number = before === null ? '' : (headingParts(before)?.number ?? '');
  const n = Number(number.slice(1, -1));
  return /^第\d+話$/.test(number) && n < MAX_NUMBER ? `第${n + 1}話 ` : '';
}
// The text with a new title on its heading line (the first 「# 」), keeping the 「第N話」 (`number`) before it
/** @param {string} text @param {string} number @param {string} title */
export function withHeading(text, number, title) {
  const at = Math.max(0, text.indexOf('# '));
  const end = text.indexOf('\n', at) === -1 ? text.length : text.indexOf('\n', at);
  const line = number ? `# ${number} ${title.trim()}` : `# ${title.trim()}`;
  return text.slice(0, at) + line + text.slice(end);
}
// The path (from the manuscript folder) that the episode or chapter at `rel` gets for the title: its number, then the
// title. null when its name has no title (07.md): it keeps its name then
/** @param {string} rel @param {string} title */
export function retitled(rel, title) {
  const at = rel.lastIndexOf('/');
  const name = rel.slice(at + 1);
  const n = numbered(name);
  if (!n?.title) return null;
  return rel.slice(0, at + 1) + `${numberPart(name)}_${title}${n.md ? '.md' : ''}`;
}

// --- titles and links that follow what moved

/** @param {string} path @param {string} folder */
const atOrUnder = (path, folder) => path === folder || path.startsWith(`${folder}/`);
// Where a path (of an episode or a chapter, from the manuscript folder) went after these moves: a chapter takes its
// episodes along, but an episode moved itself goes where it was moved (the longest move wins). null when it did not
/** @param {string} k @param {[string, string][]} moved */
export function movedTo(k, moved) {
  let best = null;
  for (const m of moved) if (atOrUnder(k, m[0]) && (!best || m[0].length > best[0].length)) best = m;
  return best ? best[1] + k.slice(best[0].length) : null;
}
// The titles ([titles]) after these moves: a title that moves onto a key left in the table takes its place
/** @param {Record<string, string>} titles @param {[string, string][]} moved @returns {Record<string, string>} */
export function followedTitles(titles, moved) {
  /** @type {Record<string, string>} */
  const stayed = {};
  /** @type {[string, string][]} */
  const went = [];
  for (const [key, title] of Object.entries(titles)) {
    const to = movedTo(key, moved);
    if (to === null) stayed[key] = title;
    else went.push([to, title]);
  }
  for (const [to, title] of went) stayed[to] = title;
  return stayed;
}
// The links ([plot.links]) after these moves and deletions (of what is gone, and inside it, they go)
/** @param {Record<string, string>} links @param {[string, string][]} moved @param {string[]} gone @returns {Record<string, string>} */
export function followedLinks(links, moved, gone) {
  return Object.fromEntries(
    Object.entries(links)
      .filter(([k]) => !gone.some(g => atOrUnder(k, g)))
      .map(([k, v]) => [movedTo(k, moved) ?? k, v]),
  );
}
// the keys of novel.toml that follow these moves (from, to: paths from the manuscript folder) and deletions
/** @param {Layout} l @param {[string, string][]} moved @param {string[]} gone @returns {TomlEdit[]} */
function followEdits(l, moved, gone) {
  const titles = followedTitles(Object.fromEntries(Object.entries(l.titles).filter(([k]) => !gone.some(g => atOrUnder(k, g)))), moved);
  return [...tableEdits(['titles'], l.titles, titles), ...tableEdits(['plot', 'links'], l.links, followedLinks(l.links, moved, gone))];
}

// --- moving files

// The files moved by these moves of episodes and chapters (from, to: from the manuscript folder): an episode's file,
// or every file in a chapter's folder. An episode moved itself goes where it was moved (the longest move wins)
/** @param {Shown} w @param {[string, string][]} moved @returns {[string, string][]} */
function fileMoves(w, moved) {
  /** @type {[string, string][]} */
  const out = [];
  for (const path of w.files) {
    const rel = relOf(w.layout, path);
    const to = rel === null ? null : movedTo(rel, moved);
    if (to !== null && to !== rel) out.push([path, inFolder(w.layout.dir, to)]);
  }
  return out;
}
// whether a path from the manuscript folder is taken by a file or a folder of the work, after these moves
/** @param {Shown} w @param {[string, string][]} moves @param {string} rel */
function taken(w, moves, rel) {
  const full = inFolder(w.layout.dir, rel);
  const gone = new Set(moves.map(m => m[0]));
  const paths = [...w.files.filter(p => !gone.has(p)), ...moves.map(m => m[1])];
  return paths.some(p => atOrUnder(p, full));
}
// the names at the top of the manuscript folder (chapters and loose episodes, one numbering), or in a chapter, in order
/** @param {Shown} w @param {string} folder from the manuscript folder ('' = the top) */
function namesIn(w, folder) {
  if (!folder) return w.toc.map(it => it.rel);
  const chapter = w.toc.find(it => it.type === 'chapter' && it.rel === folder);
  return chapter?.type === 'chapter' ? chapter.episodes.map(e => e.rel.slice(folder.length + 1)) : [];
}

// --- adding

/** @param {Shown} w @param {string} path a chapter's path from the top */
function chapterFolder(w, path) {
  const rel = relOf(w.layout, path);
  if (rel === null || rel.includes('/') || !chapterName(rel)) throw new Error('章が見つかりません');
  return rel;
}
// A new episode at the end of `folder` (from the manuscript folder; its names `names`): the others renamed first when
// its number needs one more digit (09 is followed by 010)
/** @param {Shown} w @param {string} folder @param {string[]} names @param {string} title @returns {Plan} */
function episodeIn(w, folder, names, title) {
  const l = w.layout;
  const last = names.length ? /** @type {NonNullable<ReturnType<typeof numbered>>} */ (numbered(names[names.length - 1])).number : 0;
  const next = nextNumber(last);
  const wd = width(next);
  /** @type {[string, string][]} */
  const moved = names.filter(n => numberPart(n).length < wd).length
    ? names.map((n, i) => /** @type {[string, string]} */ ([inFolder(folder, n), inFolder(folder, renamedNumber(n, i + 1, wd))])).filter(([a, b]) => a !== b)
    : [];
  const moves = fileMoves(w, moved);
  const rel = inFolder(folder, newName(l, next, wd, title, true));
  if (taken(w, moves, rel)) throw new Error('同じ名前があります');
  const edits = followEdits(l, moved, []);
  let text = '';
  if (l.heading) {
    const before = [...names].reverse().find(n => numbered(n)?.md);
    text = `# ${nextHeadingNumber(before ? w.textOf(inFolder(l.dir, inFolder(folder, before))) : null)}${title}\n\n`;
  } else if (l.bare) edits.push({ key: ['titles', rel], value: title });
  const path = inFolder(l.dir, rel);
  return { moves, writes: [{ path, text }], edits, path };
}
// A new episode of the chapter-number naming: 「2-10.md」, its title in [titles]. The numbers run on across chapters;
// an episode of a chapter written with 「2-」 keeps the prefix
/** @param {Shown} w @param {string} chapter @param {string} title @returns {Plan} */
function prefixedEpisode(w, chapter, title) {
  const l = w.layout;
  const chapters = w.toc.filter(it => it.type === 'chapter');
  let c;
  if (!chapter) c = chapters.length ? parseInt(chapters[chapters.length - 1].rel) : 1;
  else {
    const m = /^(\d+)-$/.exec(relOf(l, chapter) ?? '');
    if (!m) throw new Error('章が見つかりません');
    c = Number(m[1]);
  }
  const names = episodesOf(w.toc).map(e => e.rel);
  const last = Math.max(0, ...names.map(n => /** @type {NonNullable<ReturnType<typeof prefixed>>} */ (prefixed(n)).number));
  const mine = names.filter(n => prefixed(n)?.chapter === c);
  const withPrefix = mine.length ? mine.some(n => prefixed(n)?.hasChapter) : c !== 1;
  const rel = `${withPrefix ? `${c}-` : ''}${pad(nextNumber(last), 2)}.md`;
  if (taken(w, [], rel)) throw new Error('同じ名前があります');
  const path = inFolder(l.dir, rel);
  return { moves: [], writes: [{ path, text: '' }], edits: [{ key: ['titles', rel], value: title }], path };
}
// Adds an episode at the end of a chapter (its path from the top), or of the top ('') (FR-TOC-02)
/** @param {Shown} w @param {string} chapter @param {string} title @returns {Plan} */
export function addEpisode(w, chapter, title) {
  const t = cleanTitle(title);
  if (w.layout.prefixed) return prefixedEpisode(w, chapter, t);
  const folder = chapter ? chapterFolder(w, chapter) : '';
  return episodeIn(w, folder, namesIn(w, folder), t);
}
// Adds a chapter at the end, with one new episode (FR-TOC-03)
/** @param {Shown} w @param {string} title @returns {Plan} */
export function addChapter(w, title) {
  const l = w.layout;
  const t = cleanTitle(title);
  if (l.prefixed) {
    const chapters = w.toc.filter(it => it.type === 'chapter');
    const c = nextNumber(chapters.length ? parseInt(chapters[chapters.length - 1].rel) : 0);
    const plan = prefixedEpisode(w, inFolder(l.dir, `${c}-`), '新しい話');
    return { ...plan, edits: [...plan.edits, { key: ['titles', `${c}-`], value: t }] };
  }
  const names = namesIn(w, '');
  const next = nextNumber(names.length ? /** @type {NonNullable<ReturnType<typeof numbered>>} */ (numbered(names[names.length - 1])).number : 0);
  const name = newName(l, next, width(next), t, false);
  if (taken(w, [], name)) throw new Error('同じ名前があります');
  const plan = episodeIn(w, name, [], '新しい話');
  return { ...plan, edits: [...(l.bare || l.heading ? [{ key: ['titles', name], value: t }] : []), ...plan.edits] };
}

// --- renaming

// the path (from the manuscript folder) of an episode, or of a chapter at the top
/** @param {Layout} l @param {string} path */
function episodeOrChapter(l, path) {
  const rel = relOf(l, path);
  if (rel === null || !(isEpisode(l, path) || (!rel.includes('/') && chapterName(rel)))) throw new Error('見つかりません');
  return rel;
}
// Gives an episode or a chapter a new title (FR-TOC-05): in its heading (title = "heading"), in [titles] (naming =
// "number", or a name with no title), else in its file name (its titles and links follow it)
/** @param {Shown} w @param {string} path @param {string} title @returns {Plan} */
export function rename(w, path, title) {
  const l = w.layout;
  const t = cleanTitle(title);
  const none = { moves: [], writes: [], edits: [], path };
  if (l.prefixed) {
    const rel = relOf(l, path);
    if (rel === null || !(isEpisode(l, path) || /^\d+-$/.test(rel))) throw new Error('見つかりません');
    return { ...none, edits: [{ key: ['titles', rel], value: t }] };
  }
  const rel = episodeOrChapter(l, path);
  if (!w.files.some(p => atOrUnder(p, path))) throw new Error('見つかりません');
  if (l.heading && isEpisode(l, path)) {
    const text = w.textOf(path);
    if (text === null) throw new Error('見つかりません');
    const h = headingParts(text);
    if (h) {
      const edits = rel in l.titles ? [{ key: ['titles', rel], value: null }] : [];
      return { ...none, writes: [{ path, text: withHeading(text, h.number, t) }], edits };
    }
  }
  const to = l.bare ? null : retitled(rel, t);
  if (to === null) return { ...none, edits: [{ key: ['titles', rel], value: t }] };
  /** @type {[string, string][]} */
  const moved = [[rel, to]];
  const moves = fileMoves(w, moved);
  if (
    to !== rel &&
    taken(
      w,
      moves.filter(m => !atOrUnder(m[1], inFolder(l.dir, to))),
      to,
    )
  )
    throw new Error('同じ名前があります');
  return { moves, writes: [], edits: followEdits(l, moved, []), path: inFolder(l.dir, to) };
}

// --- the trash

// The day and time in Japan, as the names in the trash have it: 「20261024T093015」
/** @param {number} ms */
export function trashStamp(ms) {
  return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 19).replace(/[-:]/g, '');
}
// The name in _trash/ (stem, extension): 「日時_章_番号_題名.md」, cut to leave room for 「-n」 and the extension
/** @param {Layout} l @param {string} rel @param {string} stamp @param {Record<string, string>} headings */
export function trashName(l, rel, stamp, headings) {
  const at = rel.lastIndexOf('/');
  const name = rel.slice(at + 1);
  const n = numbered(name);
  const number = n ? String(n.number) : name.replace(/\.md$/, '');
  const ext = !n || n.md ? '.md' : '';
  const chapter = at === -1 ? '' : `${rel.slice(0, at).replace(/\//g, '-')}_`;
  const stem = cutBytes(`${stamp}_${chapter}${number}_${cleanTitle(titleOf(l, rel, headings))}`, NAME_BYTES - ext.length - 4).trimEnd();
  return { stem, ext };
}
// Puts an episode or a chapter in _trash/ at the top (FR-TOC-06): it is not deleted. Its titles and links go with it
/** @param {Shown} w @param {string} path @param {number} now @returns {Plan} */
export function trash(w, path, now) {
  const l = w.layout;
  if (l.prefixed && !isEpisode(l, path))
    throw new Error('この作品は、ファイル名の番号（2-09.md など）で並べています。章の削除と並べ替えは、まだアプリではできません');
  const rel = episodeOrChapter(l, path);
  if (!w.files.some(p => atOrUnder(p, path))) throw new Error('見つかりません');
  const { stem, ext } = trashName(l, rel, trashStamp(now), w.headings);
  let kept = `${stem}${ext}`;
  for (let n = 2; w.files.some(p => atOrUnder(p, `${TRASH}/${kept}`)); n++) kept = `${stem}-${n}${ext}`;
  /** @type {[string, string][]} */
  const moves = w.files.filter(p => atOrUnder(p, path)).map(p => [p, `${TRASH}/${kept}${p.slice(path.length)}`]);
  return { moves, writes: [], edits: followEdits(l, [], [rel]), path: '' };
}

// --- reordering

/** @typedef {{ type: 'episode', path: string } | { type: 'chapter', path: string, episodes: string[] }} OrderItem */
// The wanted order, when it holds every episode and chapter of the table of contents once (and nothing else)
/** @param {OrderItem[]} want @param {TocItem[]} toc */
export function checkOrder(want, toc) {
  const episodes = new Set(episodesOf(toc).map(e => e.path));
  const chapters = new Set(toc.filter(it => it.type === 'chapter').map(it => it.path));
  const seen = new Set();
  const ok = want.every(it =>
    [it.path, ...(it.type === 'chapter' ? it.episodes : [])].every((p, i) => {
      const known = (it.type === 'chapter' && i === 0 ? chapters : episodes).has(p);
      if (!known || seen.has(p)) return false;
      seen.add(p);
      return true;
    }),
  );
  if (!ok || seen.size !== episodes.size + chapters.size) throw new Error('並び順が目次と合いません。再読み込みしてください');
}
// The renames (from, to: from the manuscript folder) that put the files in the wanted order: the chapters and the
// episodes at the top numbered 1, 2, …, and the episodes of each chapter numbered in it (a rename to the same name
// included)
/** @param {Layout} l @param {OrderItem[]} want @returns {[string, string][]} */
export function renamesFor(l, want) {
  /** @param {string} p */
  const rel = p => /** @type {string} */ (relOf(l, p));
  /** @param {string} p */
  const name = p => p.slice(p.lastIndexOf('/') + 1);
  const w = width(want.length);
  /** @type {[string, string][]} */
  const out = [];
  want.forEach((it, i) => {
    const to = renamedNumber(name(it.path), i + 1, w);
    out.push([rel(it.path), to]);
    if (it.type === 'chapter') {
      const ew = width(it.episodes.length);
      it.episodes.forEach((e, j) => out.push([rel(e), `${to}/${renamedNumber(name(e), j + 1, ew)}`]));
    }
  });
  return out;
}
// Puts the table of contents in the wanted order (FR-TOC-04): episodes may move between chapters
/** @param {Shown} w @param {OrderItem[]} want @returns {Plan} */
export function reorder(w, want) {
  const l = w.layout;
  if (l.prefixed) throw new Error('この作品は、ファイル名の番号（2-09.md など）で並べています。章の削除と並べ替えは、まだアプリではできません');
  checkOrder(want, w.toc);
  const moved = renamesFor(l, want).filter(([a, b]) => a !== b);
  return { moves: fileMoves(w, moved), writes: [], edits: followEdits(l, moved, []), path: '' };
}
// What the order of the table of contents is now, as a reorder takes it
/** @param {TocItem[]} toc @returns {OrderItem[]} */
export const orderOf = toc =>
  toc.map(it => (it.type === 'chapter' ? { type: 'chapter', path: it.path, episodes: it.episodes.map(e => e.path) } : { type: 'episode', path: it.path }));
// The path that an episode at `path` has after a reorder (its place in `want` and in the order that comes out)
/** @param {Layout} l @param {OrderItem[]} want @param {string} path @returns {string} */
export function placeAfter(l, want, path) {
  const rel = relOf(l, path);
  const to = rel === null ? null : movedTo(rel, renamesFor(l, want));
  return to === null ? path : inFolder(l.dir, to);
}
// The order moved: the item at `path` up (-1) or down (1) in its list (FR-TOC-04)
/** @param {OrderItem[]} items @param {string} path @param {number} delta @returns {OrderItem[] | null} null: it cannot move */
export function moveBy(items, path, delta) {
  const next = items.map(it => (it.type === 'chapter' ? { ...it, episodes: [...it.episodes] } : it));
  const top = next.findIndex(it => it.path === path);
  /** @type {any[]} */
  let list = next;
  let i = top;
  if (top === -1) {
    const chapter = next.find(it => it.type === 'chapter' && it.episodes.includes(path));
    if (chapter?.type !== 'chapter') return null;
    list = chapter.episodes;
    i = list.indexOf(path);
  }
  const j = i + delta;
  if (j < 0 || j >= list.length) return null;
  list.splice(j, 0, ...list.splice(i, 1));
  return next;
}
// The order with an episode moved to the end of a chapter (its path; '' = out of chapters, at the end of the top)
/** @param {OrderItem[]} items @param {string} path @param {string} chapter @returns {OrderItem[]} */
export function moveToChapter(items, path, chapter) {
  /** @type {OrderItem[]} */
  const next = items.filter(it => it.path !== path).map(it => (it.type === 'chapter' ? { ...it, episodes: it.episodes.filter(e => e !== path) } : it));
  const into = next.find(it => it.type === 'chapter' && it.path === chapter);
  if (into?.type === 'chapter') into.episodes.push(path);
  else next.push({ type: 'episode', path });
  return next;
}
// The order after a drag and drop: an episode dropped on an episode goes before it, on a chapter at its end; a chapter
// goes before the item at the top that the target is or is in
/** @param {OrderItem[]} items @param {string} moving @param {string} target @param {boolean} onChapter @returns {OrderItem[] | null} */
export function dropOn(items, moving, target, onChapter) {
  if (moving === target) return null;
  const isEpisode = !items.some(it => it.type === 'chapter' && it.path === moving);
  if (isEpisode && onChapter) return moveToChapter(items, moving, target);
  if (isEpisode) {
    const next = moveToChapter(items, moving, '');
    next.pop();
    const holder = next.find(it => it.type === 'chapter' && it.episodes.includes(target));
    if (holder?.type === 'chapter') holder.episodes.splice(holder.episodes.indexOf(target), 0, moving);
    else
      next.splice(
        next.findIndex(it => it.path === target),
        0,
        { type: 'episode', path: moving },
      );
    return next;
  }
  const chapter = /** @type {OrderItem} */ (items.find(it => it.path === moving));
  const next = items.filter(it => it.path !== moving);
  const at = next.findIndex(it => it.path === target || (it.type === 'chapter' && it.episodes.includes(target)));
  next.splice(at, 0, chapter);
  return next;
}
