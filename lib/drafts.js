// The texts written on this device and not sent yet (no screen, no state of the app: tested by itself in tests/unit).
// A draft is kept in IndexedDB with the blob it was written from; it is what the screen shows until it is sent. It is
// a change of lib/changes.js: one that an operation made (a new episode, a file moved) stays that operation's

/** @typedef {import('./changes.js').Change} Draft */

// The key of a draft: one for each repository and path
/** @param {string} repo @param {string} path */
export const draftKey = (repo, path) => `${repo}\n${path}`;
// What a text typed into an episode leaves on the device: the draft (null when the text is the one read: nothing to
// send). `base` is the blob of the text read, `read` its text
/** @param {{ repo: string, path: string, base: string, read: string, text: string, at: number }} typed @returns {Draft | null} */
export function draftOf({ repo, path, base, read, text, at }) {
  return text === read ? null : { repo, path, base, text, at };
}
// A text typed into a file that an operation put there: the same change, with the text typed in place of what it held
/** @param {Draft} change @param {string} text @param {number} at @returns {Draft} */
export function typedOver(change, text, at) {
  // eslint-disable-next-line no-unused-vars
  const { sha, bytes, ...rest } = change;
  return { ...rest, text, at };
}
// What a change becomes after a send that took its text `taken` (undefined: it held no text) and put it in the blob
// `blob` (with the other version beside it when `both`): gone when it is still what was taken; else the text typed
// since, now a draft written from that blob. After both were kept, it stays written from the blob it was, so that its
// next send keeps the other version too
/** @param {Draft} draft @param {string | undefined} taken @param {string} blob @param {boolean} both @returns {Draft | null} */
export function afterSend(draft, taken, blob, both) {
  if (draft.text === taken) return null;
  const text = /** @type {string} */ (draft.text);
  return both ? draft : { repo: draft.repo, path: draft.path, base: blob, text, at: draft.at };
}
