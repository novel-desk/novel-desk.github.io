// What a send does with each episode written, when the branch has moved on since the texts were read (no screen, no
// state of the app: tested by itself in tests/unit). The text there is never overwritten: an episode changed there too
// keeps both versions side by side, as the server version's src/handlers/texts.rs (kept_both) does; a text whose file
// is gone there, or is another file now, is not sent
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

// What a send does with a text written at `path` from the blob `base` ('' for a file this device made there), now that
// the branch has the files `now`, and had `read` when the device last read it:
// - 'mine': the file is still the one written from (a file made here: nothing is there yet, it is made)
// - 'both': that same file was changed there (the two are put side by side, keptBoth)
// - 'refused': the file is not there any more, or another file is there now. Gone (deleted, put in _trash/, renamed),
//   moved away (the file it was is at another path now), or another file moved to its path (episodes renumbered
//   elsewhere: 01.md and 02.md changed places), or the file there is called otherwise now (`renamed`: moved and
//   changed at once elsewhere, calledOtherwise). A refused text is not sent: never put back where its file was taken
//   from, never into another file (the server version refuses such a save: FR-TOC-04, FR-TOC-06, FR-NOTE-05, FR-NOTE-06)
/**
 * @param {string} path @param {string} base @param {import('./changes.js').Blobs} read @param {import('./changes.js').Blobs} now
 * @param {boolean} [renamed] @returns {'mine' | 'both' | 'refused'}
 */
export function onTopOf(path, base, read, now, renamed = false) {
  const there = now[path]?.sha ?? '';
  if (there === base) return 'mine';
  // (the file read here: none when it was gone already, or not there yet for a file made here)
  const was = read[path]?.sha;
  if (!there || !base || !was || renamed) return 'refused';
  // the file read here came to another path, where it was not
  const movedAway = Object.keys(now).some(q => now[q].sha === was && read[q]?.sha !== was);
  // the file here now was at another path when it was read, and left it
  const movedIn = Object.keys(read).some(q => read[q].sha === there && now[q]?.sha !== there);
  return movedAway || movedIn ? 'refused' : 'both';
}

// What a file is called, to tell one file from another at the same path: an episode by its title (its heading,
// novel.toml's [titles], or its file name: lib/layout.js titleWith), anything else by its heading, else its path
/** @param {import('./layout.js').Layout} layout @param {string} path @param {string} text */
export const nameOf = (layout, path, text) =>
  isEpisode(layout, path) ? titleWith(layout, /** @type {string} */ (relOf(layout, path)), text, {}) : (noteHeading(text) ?? path);
// Whether the file at `path` is called otherwise now than when the text written there was read (`was`, `now`:
// novel.toml's text, null when there is none, and the file's text, null when it cannot be read, then and now): another
// episode or note there, though no blob moved (moved and changed at once elsewhere: two episodes renumbered and written
// in one commit). A text that cannot be read is not told by its name
/** @typedef {{ config: string | null, text: string | null }} Named */
/** @param {string} path @param {Named} was @param {Named} now */
export function calledOtherwise(path, was, now) {
  if (was.text === null || now.text === null) return false;
  /** @param {string | null} config */
  const layoutOf = config => (config === null ? firstLayout() : parseLayout(config).layout);
  return nameOf(layoutOf(was.config), path, was.text) !== nameOf(layoutOf(now.config), path, now.text);
}

// For each draft, what a send does on top of the branch's files now (`blobs`, by path; `read`: the ones the device
// read; `renamed`: the paths whose file is called otherwise now): 'mine', 'both' or 'refused' (onTopOf), and the mode
// its file keeps (a new file: a plain one)
/**
 * @param {import('./drafts.js').Draft[]} drafts @param {import('./changes.js').Blobs} blobs @param {import('./changes.js').Blobs} read
 * @param {Set<string>} [renamed]
 */
export function sendPlan(drafts, blobs, read, renamed = new Set()) {
  return drafts.map(draft => {
    const now = blobs[draft.path];
    return { draft, how: onTopOf(draft.path, draft.base, read, blobs, renamed.has(draft.path)), mode: now?.mode ?? '100644', theirs: now?.sha ?? '' };
  });
}
