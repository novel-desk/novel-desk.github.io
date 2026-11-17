// The texts written on this device and not sent yet (no screen, no state of the app: tested by itself in tests/unit).
// A draft is kept in IndexedDB with the blob it was written from; it is what the screen shows until it is sent. It is
// a change of lib/changes.js: one that an operation made (a new episode, a file moved) stays that operation's
import { mergeLines } from './merge.js';

/** @typedef {import('./changes.js').Change} Draft */

// The key of a draft: one for each repository and path
/** @param {string} repo @param {string} path */
export const draftKey = (repo, path) => `${repo}\n${path}`;
// Whether the draft kept on the device (`kept`, undefined when none is) is still the version `mine` (the one this page
// wrote): the same text, written at the same time. Another tab's draft written since is another version, and is not
// deleted when this page's is sent
/** @param {Draft | undefined} kept @param {Draft} mine */
export const sameVersion = (kept, mine) => kept !== undefined && kept.at === mine.at && kept.text === mine.text;
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
  const { sha, bytes, auto, ...rest } = change;
  return { ...rest, text, at };
}
// What a change becomes after a send that took its text `taken` (undefined: it held no text) and put the text `sent`
// in the blob `blob`: gone when it is still what was taken; else the text typed since, now a draft written from that
// blob. When the text sent is not the one taken (put together with the one there: lib/merge.js mergeLines), what was
// typed since is put in it line by line too, against the text taken (FR-SAVE-04, FR-SAVE-08). A change with no text (an
// operation's, which is not made while a send is on its way: formal/Rebase.tla's Idle) stays as it is
/** @param {Draft} draft @param {string | undefined} taken @param {string} blob @param {string | undefined} sent @returns {Draft | null} */
export function afterSend(draft, taken, blob, sent) {
  if (draft.text === taken) return null;
  if (draft.text === undefined) return draft;
  const text = draft.text;
  return {
    repo: draft.repo,
    path: draft.path,
    base: blob,
    text: sent === taken ? text : mergeLines(/** @type {string} */ (taken), text, /** @type {string} */ (sent)).text,
    at: draft.at,
  };
}
// What a change becomes after a send that held its text `taken` back (lib/send.js sentText `held`): still what was
// taken, the text with the places side by side (`text`), written from the blob there now (`theirs`); typed on
// meanwhile, as it is (its next send puts it together with the one there again)
/** @param {Draft} draft @param {string | undefined} taken @param {string} text @param {string} theirs @returns {Draft} */
export const afterHeld = (draft, taken, text, theirs) => (draft.text === taken ? { ...draft, base: theirs, text } : draft);
// The changes after a send (`next`: what is left of them so far), with the texts it held back (`held`: where they go,
// the text they are now, the blob there now) put in as the device has them now (`typed`, typed during the send too):
// each still what was taken, the text with the places side by side where it goes (its own path left, unless another
// text went there); typed on meanwhile, as typed where it is (put together again on the next send); gone from the
// device meanwhile (typed back to the text read, or given up), none
/**
 * @param {Map<string, Draft>} next @param {Map<string, Draft>} typed
 * @param {{ draft: Draft, to: string, text: string, theirs: string }[]} held @returns {Map<string, Draft>}
 */
export function keptAfterSend(next, typed, held) {
  const out = new Map(next);
  for (const { draft, to, text, theirs } of held) {
    const now = typed.get(draft.path);
    if (now === undefined) continue;
    const after = afterHeld(now, draft.text, text, theirs);
    if (after === now) continue;
    if (out.get(draft.path) === now) out.delete(draft.path);
    out.set(to, { ...after, path: to });
  }
  return out;
}
// A change sent, as the author has it after the send when it went from the device while it was on its way (typed back
// to the text read, or given up): that text read, to go on top of what was sent (an operation: as it was sent)
/** @param {Draft} draft @param {string} read the text read from GitHub before the send @returns {Draft} */
export const goneWhileSent = (draft, read) => (draft.op ? draft : { ...draft, text: read });
