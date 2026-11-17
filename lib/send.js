// What a send puts in its commit, decided (ui/send.js asks GitHub; no screen, no state of the app: tested by itself in
// tests/unit): the text each text written goes as, what each operation's file is, novel.toml's change, and the files
// of the branch once the commit is on it (FR-SAVE-03, FR-SAVE-04, FR-GH-05)
import { mergeLines, sideBySide, underHeading } from './merge.js';

/** @typedef {import('./drafts.js').Draft} Draft */
/** @typedef {import('./changes.js').Blobs} Blobs */
/** @typedef {{ path: string, mode: string, type: 'blob', sha: string | null }} Entry a file of the new tree (sha null: deleted) */

// The text a text written goes as (lib/merge.js sendPlan `how`; `base`: the text it was written from, null or
// undefined when it is not known): changed there too, the two put together line by line (FR-SAVE-04, FR-SAVE-06); only
// renamed there, what was written under the heading given there; else as it was written. Says whether it took in what
// was written there (`merged`), whether the merge put places side by side (`placed`), and whether the text is held
// back: places side by side in it, put there now or left from before (`held`: not sent until the author has tidied
// them, so that GitHub never has them)
/**
 * @param {string} how @param {string} mine @param {string} was the text there now @param {string | null | undefined} base
 * @returns {{ text: string, merged: boolean, placed: boolean, held: boolean }}
 */
export function sentText(how, mine, was, base) {
  const m =
    how === 'both'
      ? mergeLines(base ?? null, mine, was)
      : { text: how === 'heading' ? underHeading(/** @type {string} */ (base), mine, was) : mine, both: false };
  return { text: m.text, merged: how === 'both' && m.text !== mine, placed: m.both, held: sideBySide(m.text) };
}
// What an operation's file goes as: its text, its bytes (a picture), the blob it moved, or nothing (deleted)
/** @param {Draft} d @returns {'text' | 'bytes' | 'blob' | 'gone'} */
export const opContent = d => (d.text !== undefined ? 'text' : d.bytes ? 'bytes' : !d.gone ? 'blob' : 'gone');
// where an operation's file came from (the file it moved), or the file itself
/** @param {Draft} d */
export const opSource = d => d.from?.path ?? d.path;
// an operation's file in the new tree: its mode (its own, the one there, else a plain file), its blob (none: deleted)
/** @param {Draft} d @param {Blobs} blobs @param {string} blob */
export const opEntry = (d, blobs, blob) =>
  /** @type {Entry} */ ({ path: d.path, mode: d.mode ?? blobs[d.path]?.mode ?? '100644', type: 'blob', sha: d.gone ? null : blob });
// novel.toml as a change of the commit's message (a new file: no blob there), when its keys set changed it
/** @param {{ repo: string, edits: number, config: string | null, configNow: string | null, blob: string | undefined }} o */
export const configChange = ({ repo, edits, config, configNow, blob }) =>
  edits && config !== configNow ? [{ repo, path: 'novel.toml', base: blob ?? '', at: 0 }] : [];
// the files of the branch once the new tree is on it: each entry put in, or deleted
/** @param {Blobs} blobs @param {Entry[]} entries @returns {Blobs} */
export function blobsAfter(blobs, entries) {
  const next = { ...blobs };
  for (const e of entries) {
    if (e.sha === null) delete next[e.path];
    else next[e.path] = { sha: e.sha, mode: e.mode };
  }
  return next;
}
// how many times the branch may move on during one send before it gives up: tried again while fewer
export const TRIES = 3;
// whether a send is tried again: the branch moved on between reading it and moving it (GitHub's 422), tries left
/** @param {number | null} status @param {number} tried */
export const tryAgain = (status, tried) => status === 422 && tried + 1 < TRIES;
