// What a send does with each episode written, when the branch has moved on since the texts were read (no screen, no
// state of the app: tested by itself in tests/unit). The text there is never overwritten: an episode changed there too
// is put together with it line by line, against the version both began from (mergeLines, as the server version's
// src/merge.rs merge_lines); only where both changed the same lines are the two versions put side by side, and such a
// text is not sent until the author has tidied it (sideBySide, lib/send.js sentText). An episode or a note moved
// elsewhere (reordered, renumbered, renamed) takes the text where it is now (FR-TOC-04, FR-NOTE-05); one deleted (put
// in _trash/) does not, nor does a new one made where it was (FR-TOC-06, FR-NOTE-06)
import { firstLayout, isEpisode, parseLayout, relOf, titleWith } from './layout.js';
import { noteHeading } from './notes.js';

// The lines that put the two versions of one place side by side (FR-SAVE-05), as the server version writes them after
// a save over another device's (src/merge.rs SAVED and END_MARK): the lines under MINE_MARK are this device's, the
// lines under OTHER_DEVICE_MARK the other side's (GitHub's), END_MARK ends the place. OTHER_DEVICE_MARK starts with
// CONFLICT_MARK (the server version's), by which the table of contents and the screen tell such a text
export const MINE_MARK = '――― ここから、この端末で書いた版 ―――';
export const CONFLICT_MARK = '――― ここから、ほかの';
export const OTHER_DEVICE_MARK = '――― ここから、ほかの端末で書かれた版 ―――';
export const END_MARK = '――― 並べた版はここまで ―――';
// Whether a text still has a place with two versions side by side: any of the three lines (a place tidied only in part
// is not tidied)
/** @param {string} text */
export const sideBySide = text => [MINE_MARK, CONFLICT_MARK, END_MARK].some(m => text.includes(m));

/** @typedef {{ from: number, to: number, at: number, end: number }} Hunk the lines [from, to) of one text made the lines [at, end) of another */
// How many lines two versions of one place (`a`, `b`: their lines) share at their start, and then at their end
/** @param {string[]} a @param {string[]} b @returns {[number, number]} */
function shared(a, b) {
  /** the first of n lines (0 to n - 1) for which `differ` is true, else n @param {number} n @param {(i: number) => boolean} differ */
  const upTo = (n, differ) => [...Array(n).keys()].find(differ) ?? n;
  // (the start: as far as the shorter one, where the longer one has a line and the shorter one none)
  const s = upTo(a.length, i => a[i] !== b[i]);
  return [s, upTo(Math.min(a.length, b.length) - s, i => a[a.length - 1 - i] !== b[b.length - 1 - i])];
}
/**
 * The changes that make the lines `a` into the lines `b`, in their order: what is not in their longest common
 * subsequence, found as node-diff3 (bhousel/node-diff3) finds it (Hunt and McIlroy, 1976): for each line of `a`, the
 * lines of `b` like it, each one extending the longest chain of matches that ends before it. Of the subsequences as
 * long, the one that keeps the lines both share at the end (as git's diff, xdiff, leaves them out first) and matches
 * the first lines it can: an empty line typed before others is an empty line added, not the one before it changed.
 * Unlike a table of every pair of lines (lib/diff.js diffOps), it stays small for a long episode changed in a few
 * places: it is as large as the pairs of lines that are alike
 * @param {string[]} a @param {string[]} b @returns {Hunk[]}
 */
export function hunksOf(a, b) {
  const [, e] = shared(a, b);
  const x = a.slice(0, a.length - e),
    y = b.slice(0, b.length - e);
  /** @type {Map<string, number[]>} each line of y, and where it is in y */
  const where = new Map();
  for (const [j, line] of y.entries()) {
    const js = where.get(line);
    if (js) js.push(j);
    else where.set(line, [j]);
  }
  /** @typedef {{ i: number, j: number, chain: Match | null }} Match a match of x[i] and y[j], after the matches of its chain */
  /** @type {Match[]} at k, the last match of the chain of k matches that ends first in y (at 0: none): they end further on in y as k grows */
  const chains = [{ i: -1, j: -1, chain: null }];
  // the first chain from lo (to hi) that ends at j or after it, found by halves (as node-diff3 finds it)
  /** @param {number} lo @param {number} hi @param {number} j @returns {number} */
  const firstFrom = (lo, hi, j) => {
    if (lo >= hi) return lo;
    const mid = (lo + hi) >> 1;
    return chains[mid].j < j ? firstFrom(mid + 1, hi, j) : firstFrom(lo, mid, j);
  };
  for (const [i, line] of x.entries()) {
    // (each chain made longer by this line is put in only after the next line of y like it is tried)
    let r = 0,
      c = chains[0];
    const js = where.get(line);
    if (!js) continue;
    for (const j of js) {
      // the first chain from r that ends at j or after it: the one before it ends before j, and is made one longer by
      // this match, unless a chain as long ends at j already
      const lo = firstFrom(r, chains.length, j);
      if (lo > r && (lo === chains.length || chains[lo].j > j)) {
        const next = { i, j, chain: chains[lo - 1] };
        chains[r] = c;
        r = lo;
        c = next;
      }
    }
    chains[r] = c;
  }
  /** @type {Hunk[]} */
  const hunks = [];
  let [ti, tj] = [x.length, y.length];
  for (let m = /** @type {Match | null} */ (chains[chains.length - 1]); m; m = m.chain) {
    if (m.i + 1 < ti || m.j + 1 < tj) hunks.unshift({ from: m.i + 1, to: ti, at: m.j + 1, end: tj });
    [ti, tj] = [m.i, m.j];
  }
  return hunks;
}
// A text's lines, each with its line end, the line ends made \n (the last line given one: it compares with the same
// line followed by others)
/** @param {string} text */
const linesOf = text => (text === '' ? [] : `${text.replace(/\r\n/g, '\n').replace(/\n$/, '')}\n`.split(/(?<=\n)/));

/**
 * The text to send, when the one written (`mine`, from `base`) is not on the one there now (`theirs`): the two put
 * together line by line (FR-SAVE-04, FR-SAVE-06). What only one side changed is taken; a change made the same on both
 * sides is taken once; where both changed the same lines differently, or added lines at the same place, both
 * versions of those lines are put side by side between MINE_MARK, OTHER_DEVICE_MARK and END_MARK (FR-SAVE-05), the
 * lines both versions share at the start and the end of the place left out of it, once. Changes that overlap or
 * touch (no line between them) are one place, as in git's merge and node-diff3's diff3MergeRegions. Without the base
 * (`null`: its text not known), every place where the two differ is side by side: nothing either side wrote is taken
 * as removed. The same text (other line ends too) is mine as it is. A text whose last line has no line end keeps it so
 * when mine has none, unless it is the line that ends a place side by side (what is typed after it goes on a line of
 * its own). Returns whether places were put side by side
 * @param {string | null} base @param {string} mine @param {string} theirs @returns {{ text: string, both: boolean }}
 */
export function mergeLines(base, mine, theirs) {
  const [m, t] = [linesOf(mine), linesOf(theirs)];
  if (m.join('') === t.join('')) return { text: mine, both: false };
  /** @type {string[]} */
  const out = [];
  let both = false;
  /** the two versions of one place (`a`: mine, `b`: theirs) @param {string[]} a @param {string[]} b */
  const place = (a, b) => {
    const [s, e] = shared(a, b);
    out.push(...a.slice(0, s));
    // (they differ: not all of the longer one is shared at the start)
    if (s < Math.max(a.length, b.length)) {
      out.push(`${MINE_MARK}\n`, ...a.slice(s, a.length - e), `${OTHER_DEVICE_MARK}\n`, ...b.slice(s, b.length - e), `${END_MARK}\n`);
      both = true;
    }
    out.push(...a.slice(a.length - e));
  };
  let at = 0;
  if (base === null) {
    for (const h of hunksOf(m, t)) {
      out.push(...m.slice(at, h.from));
      place(m.slice(h.from, h.to), t.slice(h.at, h.end));
      at = h.to;
    }
    out.push(...m.slice(at));
  } else {
    const o = linesOf(base);
    const hunks = [...hunksOf(o, m).map(h => ({ ...h, mine: true })), ...hunksOf(o, t).map(h => ({ ...h, mine: false }))].sort((p, q) => p.from - q.from);
    /** @type {{ from: number, to: number, group: typeof hunks }[]} the places: the changes that overlap or touch */
    const places = [];
    for (const h of hunks) {
      const p = places[places.length - 1];
      if (p && h.from <= p.to) {
        p.to = Math.max(p.to, h.to);
        p.group.push(h);
      } else places.push({ from: h.from, to: h.to, group: [h] });
    }
    for (const { from, to, group } of places) {
      out.push(...o.slice(at, from));
      // one side's lines of the place: its changes, and the base's lines around them
      /** @param {string[]} lines @param {Hunk[]} hs */
      const span = (lines, hs) => lines.slice(hs[0].at - hs[0].from + from, hs[hs.length - 1].end - hs[hs.length - 1].to + to);
      const [mineHere, theirsHere] = [group.filter(h => h.mine), group.filter(h => !h.mine)];
      if (!theirsHere.length) out.push(...span(m, mineHere));
      else if (!mineHere.length) out.push(...span(t, theirsHere));
      else place(span(m, mineHere), span(t, theirsHere));
      at = to;
    }
    out.push(...o.slice(at));
  }
  const text = out.join('');
  return { text: mine === '' || mine.endsWith('\n') || text.endsWith(`${END_MARK}\n`) ? text : text.slice(0, -1), both };
}
// Where a place in a text (`at`, in `was`) is once the text is `now` (put together with another: mergeLines), for the
// caret (FR-SAVE-08): on a line both have, the same place in it; on a line changed, the start of what it became
/** @param {string} was @param {string} now @param {number} at */
export function placeAfter(was, now, at) {
  const before = was.slice(0, at).split('\n');
  const line = before.length - 1;
  const lines = now.split('\n');
  const hunks = hunksOf(was.split('\n'), lines);
  const inside = hunks.find(h => h.from <= line && line < h.to);
  const to = inside ? inside.at : line + hunks.filter(h => h.to <= line).reduce((d, h) => d + h.end - h.at - h.to + h.from, 0);
  return Math.min(now.length, lines.slice(0, to).reduce((n, l) => n + l.length + 1, 0) + (inside ? 0 : before[line].length));
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
 * there: the two put together line by line, mergeLines), 'heading' (only its heading changed there: what was written under it,
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
