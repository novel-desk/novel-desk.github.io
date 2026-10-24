// What a send does with each episode written, when the branch has moved on since the texts were read (no screen, no
// state of the app: tested by itself in tests/unit). The text there is never overwritten: an episode changed there too
// keeps both versions side by side, as the server version's src/handlers/texts.rs (kept_both) does

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

// What to do with an episode written from the blob `base`, now that the branch has `now` there (its blob, or undefined
// when the file is gone): 'mine' when it is still the one written from (or gone: the text written is put back), 'both'
// when it was changed there (the two are put side by side, keptBoth)
/** @param {string} base @param {string | undefined} now @returns {'mine' | 'both'} */
export const onTopOf = (base, now) => (now === undefined || now === base ? 'mine' : 'both');

// For each draft, what a send does on top of the branch's files now (`blobs`, by path): 'mine' or 'both' (onTopOf), and
// the mode its file keeps (a new file: a plain one)
/** @param {import('./drafts.js').Draft[]} drafts @param {Record<string, { sha: string, mode: string }>} blobs */
export function sendPlan(drafts, blobs) {
  return drafts.map(draft => {
    const now = blobs[draft.path];
    return { draft, how: onTopOf(draft.base, now?.sha), mode: now?.mode ?? '100644', theirs: now?.sha ?? '' };
  });
}
