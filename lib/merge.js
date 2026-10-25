// What a send does with each episode written, when the branch has moved on since the texts were read (no screen, no
// state of the app: tested by itself in tests/unit). The text there is never overwritten: an episode changed there too
// keeps both versions side by side, as the server version's src/handlers/texts.rs (kept_both) does. An episode or a
// note moved elsewhere (reordered, renumbered, renamed) takes the text where it is now (FR-TOC-04, FR-NOTE-05); one
// deleted (put in _trash/) does not, nor does a new one made where it was (FR-TOC-06, FR-NOTE-06)
import { firstLayout, isEpisode, parseLayout, relOf, titleWith } from './layout.js';
import { noteHeading } from './notes.js';

// The start of every line that puts two versions side by side (the server version's CONFLICT_MARK)
export const CONFLICT_MARK = '――― ここから、ほかの';
// The line that separates two versions kept side by side after a conflict (the server version's OTHER_DEVICE_MARK)
export const OTHER_DEVICE_MARK = '――― ここから、ほかの端末で書かれた版 ―――';

// The text to send: the one written, or both, when the one there is another (the same text with other line ends is no
// conflict). Returns whether both were kept
/** @param {string} mine @param {string} theirs @returns {{ text: string, both: boolean }} */
export function keptBoth(mine, theirs) {
  if (theirs.replace(/\r\n/g, '\n') === mine.replace(/\r\n/g, '\n')) return { text: mine, both: false };
  return { text: `${mine.trimEnd()}\n\n${OTHER_DEVICE_MARK}\n\n${theirs.trimEnd()}\n`, both: true };
}

// A text's heading line (its first line, when it is a heading: an episode's title, a note's name; '' when it has none)
// and the rest of it
/** @param {string} text */
const headOf = text => (/^#/.test(text) ? text.split('\n', 1)[0] : '');
/** @param {string} text */
const bodyOf = text => text.slice(headOf(text).length).replace(/^\n/, '');
// The text written (`mine`, from `base`) on top of the one there (`theirs`) when only its heading changed there (an
// episode or a note renamed elsewhere): what was written, under the heading given there (mine's own, when it was
// renamed here too)
/** @param {string} base @param {string} mine @param {string} theirs */
export function underHeading(base, mine, theirs) {
  const head = headOf(mine) === headOf(base) ? headOf(theirs) : headOf(mine);
  return `${head}\n${bodyOf(mine)}`;
}

// What a file is called, to tell one file from another: an episode by its title (its heading, novel.toml's [titles],
// or its file name: lib/layout.js titleWith), anything else by its heading, else its path
/** @param {import('./layout.js').Layout} layout @param {string} path @param {string} text */
export const nameOf = (layout, path, text) =>
  isEpisode(layout, path) ? titleWith(layout, /** @type {string} */ (relOf(layout, path)), text, {}) : (noteHeading(text) ?? path);
// novel.toml's text made the layout (none: the one of a work without it)
/** @param {string | null} config */
export const layoutOf = config => (config === null ? firstLayout() : parseLayout(config).layout);

/** @typedef {import('./changes.js').Blobs} Blobs */
/**
 * What tells the files apart beyond their blobs: the texts of the blobs read (by sha; null: not a text), and the
 * layouts (novel.toml) when the texts were read and now, that name them
 * @typedef {{ texts: Record<string, string | null>, was: import('./layout.js').Layout, now: import('./layout.js').Layout }} Look
 */
/**
 * Where a text written goes, and how: 'mine' (the file is still the one written from), 'both' (that file changed
 * there: the two side by side, keptBoth), 'heading' (only its heading changed there: what was written under it,
 * underHeading), 'refused' (not sent: FR-SAVE-09)
 * @typedef {{ how: 'mine' | 'both' | 'heading' | 'refused', to: string }} Place
 */
/** @param {string} path */
const inTrash = path => path.startsWith('_trash/');
// a file's kind, by its extension ('' none)
/** @param {string} path */
export const extOf = path => /\.[^./]*$/.exec(path)?.[0] ?? '';

// Where a text written at `path` from the blob `base` ('' for a file this device made there) goes, now that the branch
// has the files `now`, and had `read` when the device last read it (FR-TOC-04, FR-TOC-06, FR-NOTE-05, FR-NOTE-06):
// - the file still the one written from (a file made here: nothing there yet): 'mine', there
// - moved elsewhere as it was (reordered, renumbered, renamed by its file name): 'mine' where it is now ('both' when it
//   had changed there before, since it was written from). Several files there with its blob (the same text): the one
//   called as it was, else none
// - put in _trash/: 'refused' (never put back where it was, nor into a new file made there)
// - only its heading changed there (renamed by its heading; moved too): 'heading' where it is now. Its text but the
//   heading the same as one file's only (an empty one tells nothing)
// - changed there, still called as it was (or not told: a text not read) and not another file moved to its path:
//   'both', there
// - else the one file come or changed elsewhere called as it was (moved and changed at once): 'both' there
// - else: 'refused' (gone, or another file now: a file made here, and another made at its path elsewhere, too)
/**
 * @param {string} path @param {string} base @param {Blobs} read @param {Blobs} now @param {Look} look
 * @returns {Place}
 */
export function placeOf(path, base, read, now, look) {
  const there = now[path]?.sha ?? '';
  if (there === base) return { how: 'mine', to: path };
  const refused = /** @type {Place} */ ({ how: 'refused', to: path });
  // (the file read here: none when it was gone already, or not there yet for a file made here)
  const was = read[path]?.sha;
  if (!base || !was) return refused;
  /** @param {string} q a file of the same kind there now, come to `q` or changed at it since it was read */
  const came = q => q !== path && extOf(q) === extOf(path) && now[q].sha !== read[q]?.sha;
  const all = Object.keys(now);
  // the file as it was written from, or as it was read, come to another path
  const moved = all.filter(q => came(q) && (now[q].sha === base || now[q].sha === was));
  if (moved.some(inTrash)) return refused;
  const text = look.texts[base] ?? look.texts[was] ?? null;
  const name = text === null ? null : nameOf(look.was, path, text);
  /** @param {string} q */
  const nameNow = q => {
    const t = look.texts[now[q].sha] ?? null;
    return t === null ? null : nameOf(look.now, q, t);
  };
  const as = moved.length > 1 ? moved.filter(q => nameNow(q) === name) : moved;
  if (as.length === 1) return { how: now[as[0]].sha === base ? 'mine' : 'both', to: as[0] };
  if (moved.length) return refused;
  // only the heading changed: the same text under it, here or come elsewhere (a text not read: none)
  /** @param {string | null | undefined} t */
  const bodyAt = t => (typeof t === 'string' ? bodyOf(t).replace(/\r\n/g, '\n') : null);
  const body = bodyAt(text);
  const renamed = body?.trim() ? all.filter(q => !inTrash(q) && (q === path || came(q)) && bodyAt(look.texts[now[q].sha]) === body) : [];
  if (renamed.length === 1) return { how: 'heading', to: renamed[0] };
  if (renamed.length) return refused;
  // another file moved to its path: the file here now was at another path when it was read, and left it
  const movedIn = Object.keys(read).some(q => read[q].sha === there && now[q]?.sha !== there);
  // (still called as it was; or not told, a text not read then or now: not UTF-8 there now, which the send says)
  if (there && !movedIn) {
    const nowName = nameNow(path);
    if (name === null || nowName === null || nowName === name) return { how: 'both', to: path };
  }
  const named = name === null ? [] : all.filter(q => !inTrash(q) && came(q) && nameNow(q) === name);
  return named.length === 1 ? { how: 'both', to: named[0] } : refused;
}

// For each draft, where and how a send puts it on top of the branch's files now (`blobs`, by path; `read`: the ones
// the device read): placeOf, the mode its file keeps (a new file: a plain one) and the blob there now. Two texts going
// to one file: the one moved there is refused (both, when both moved there)
/**
 * @param {import('./drafts.js').Draft[]} drafts @param {Blobs} blobs @param {Blobs} read @param {Look} look
 * @returns {{ draft: import('./drafts.js').Draft, how: Place['how'], to: string, mode: string, theirs: string }[]}
 */
export function sendPlan(drafts, blobs, read, look) {
  const places = drafts.map(d => placeOf(d.path, d.base, read, blobs, look));
  /** @param {string} to */
  const taken = to => places.filter(p => p.how !== 'refused' && p.to === to).length > 1;
  return drafts.map((draft, i) => {
    const p = places[i].to !== draft.path && taken(places[i].to) ? { how: /** @type {const} */ ('refused'), to: draft.path } : places[i];
    const now = blobs[p.to];
    return { draft, how: p.how, to: p.to, mode: now?.mode ?? '100644', theirs: now?.sha ?? '' };
  });
}
