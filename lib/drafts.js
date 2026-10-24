// The texts written on this device and not sent yet (no screen, no state of the app: tested by itself in tests/unit).
// A draft is kept in IndexedDB with the blob it was written from; it is what the screen shows until it is sent

/** @typedef {{ repo: string, path: string, base: string, text: string, at: number }} Draft */

// The key of a draft: one for each repository and path
/** @param {string} repo @param {string} path */
export const draftKey = (repo, path) => `${repo}\n${path}`;
// What a text typed into an episode leaves on the device: the draft (null when the text is the one read: nothing to
// send). `base` is the blob of the text read, `read` its text
/** @param {{ repo: string, path: string, base: string, read: string, text: string, at: number }} typed @returns {Draft | null} */
export function draftOf({ repo, path, base, read, text, at }) {
  return text === read ? null : { repo, path, base, text, at };
}
// What a draft becomes after a send that took its text `taken` and put it in the blob `blob` (with the other version
// beside it when `both`): gone when the text is still the one taken; else the text typed since, now written from that
// blob. After both were kept, it stays written from the blob it was, so that its next send keeps the other version too
/** @param {Draft} draft @param {string} taken @param {string} blob @param {boolean} both @returns {Draft | null} */
export function afterSend(draft, taken, blob, both) {
  if (draft.text === taken) return null;
  return both ? draft : { ...draft, base: blob };
}
