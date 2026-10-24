// The changes not sent yet, as files over the branch's (no screen, no state of the app: tested by itself in
// tests/unit). Every change is kept on the device by its path, with the blob that was there when it was made (`base`,
// '' when nothing was): a text written, a file put there (a blob of the branch, or bytes), or a file gone. The changes
// that one operation makes together (an episode added, renamed, put in the trash, the order changed) share its `op`:
// when the branch changed under any of them elsewhere, they are given up together (rebase), and the text written in
// them stays as a draft. A text written alone (no op) is never given up: a send keeps both versions (merge.js)

/** @typedef {Record<string, { sha: string, mode: string }>} Blobs the files of a branch, by path */
/** @typedef {{ path: string, base: string }} Origin where a file moved from: its path and the blob it was there */
/**
 * @typedef {object} Change
 * @property {string} repo 「owner/name」
 * @property {string} path
 * @property {string} base the blob there when the change was made ('' when nothing was)
 * @property {string} [text] the text written there
 * @property {string} [sha] a blob of the branch put there (a file moved)
 * @property {Uint8Array} [bytes] bytes put there (a picture)
 * @property {boolean} [gone] the file is gone (moved, or put in the trash)
 * @property {string} [mode] the file's mode (a new file: a plain one)
 * @property {Origin} [from] the file it was moved from
 * @property {string} [op] the operation that made it (none: a text written)
 * @property {boolean} [auto] its text written by the operation, not typed (a link to a picture renamed): given up with
 *   it, it is not kept as a draft
 * @property {number} at when it was made (ms)
 */
/** @typedef {Map<string, Change>} Changes the changes of a work, by path */

// The files with the changes over them: each by path, its blob ('' for one written on this device) and mode
/** @param {Blobs} blobs @param {Iterable<Change>} changes @returns {Blobs} */
export function viewFiles(blobs, changes) {
  const files = { ...blobs };
  for (const c of changes) {
    if (c.gone) delete files[c.path];
    else files[c.path] = { sha: c.sha ?? '', mode: c.mode ?? blobs[c.path]?.mode ?? '100644' };
  }
  return files;
}
// The folders that hold these paths, each once
/** @param {string[]} paths @returns {string[]} */
export function foldersOf(paths) {
  /** @type {Set<string>} */
  const found = new Set();
  for (const p of paths) for (let at = p.lastIndexOf('/'); at > 0; at = p.lastIndexOf('/', at - 1)) found.add(p.slice(0, at));
  return [...found];
}

// what a change puts in its file, to put it elsewhere
/** @param {Change} c @returns {Partial<Change>} */
const contentOf = c => {
  const mode = c.mode ? { mode: c.mode } : {};
  if (c.text !== undefined) return { text: c.text, ...mode };
  if (c.bytes) return { bytes: c.bytes, ...mode };
  return { sha: c.sha, ...mode };
};
// the changes of the operations `merged` made part of `op` (an operation that changed what they changed)
/** @template {{ op?: string }} T @param {T[]} list @param {Set<string>} merged @param {string} op @returns {T[]} */
export const relabel = (list, merged, op) => list.map(c => (c.op && merged.has(c.op) ? { ...c, op } : c));

/**
 * Files moved, all at once (`moves`: from, to, paths from the top; a to may be a from of another): the changes after
 * them, and the operations they took in (their changes are this operation's now). A file moved where the branch has
 * it, as it is there, is no change
 * @param {Blobs} blobs @param {Changes} changes @param {[string, string][]} moves
 * @param {{ repo: string, op: string, at: number }} o @returns {{ changes: Changes, merged: Set<string> }}
 */
export function moveFiles(blobs, changes, moves, { repo, op, at }) {
  const next = new Map(changes);
  /** @type {Set<string>} */
  const merged = new Set();
  /** @param {Change | undefined} c */
  const take = c => c?.op && merged.add(c.op);
  const taken = moves.map(([from, to]) => {
    const c = changes.get(from),
      there = blobs[from];
    take(c);
    const content = c ? contentOf(c) : { sha: there.sha, mode: there.mode };
    // where it came from first, with the blob its text was written on
    /** @type {Origin | undefined} */
    const origin = c?.from ?? (there ? { path: from, base: c?.base ?? there.sha } : undefined);
    return { from, to, content, origin };
  });
  for (const { from } of taken) {
    const there = blobs[from];
    if (there) next.set(from, { repo, path: from, base: changes.get(from)?.base ?? there.sha, gone: true, op, at });
    else next.delete(from);
  }
  for (const { to, content, origin } of taken) {
    const there = blobs[to],
      before = changes.get(to);
    take(before);
    const base = before?.base ?? there?.sha ?? '';
    if (there && content.sha === there.sha && base === there.sha) next.delete(to);
    else next.set(to, { repo, path: to, base, ...content, ...(origin && { from: origin }), op, at });
  }
  return { changes: new Map([...next].map(([p, c]) => [p, relabel([c], merged, op)[0]])), merged };
}
/**
 * A file written by an operation (a new episode, a picture, a link to a picture renamed): its text or bytes at `path`,
 * over what is there (a text written over a draft is not `auto`: what was typed in it stays when it is given up)
 * @param {Blobs} blobs @param {Changes} changes @param {string} path @param {{ text?: string, bytes?: Uint8Array, auto?: boolean }} content
 * @param {{ repo: string, op: string, at: number }} o @returns {{ changes: Changes, merged: Set<string> }}
 */
export function writeFile(blobs, changes, path, content, { repo, op, at }) {
  const before = changes.get(path);
  const merged = new Set(before?.op ? [before.op] : []);
  const next = new Map(changes);
  /** @type {Change} */
  const c = { repo, path, base: before?.base ?? blobs[path]?.sha ?? '', ...content, op, at };
  if (before?.from) c.from = before.from;
  if (before && !before.op && before.text !== undefined) delete c.auto;
  next.set(path, c);
  return { changes: new Map([...next].map(([p, x]) => [p, relabel([x], merged, op)[0]])), merged };
}

// The changes of operations made on a branch that changed under them since (a file there is not the one the change
// was made on): the paths, each once
/** @param {Changes} changes @param {Blobs} blobs @returns {string[]} */
export const conflictsOf = (changes, blobs) => [...changes.values()].filter(c => c.op && (blobs[c.path]?.sha ?? '') !== c.base).map(c => c.path);

/**
 * The changes on the branch read again: the operations whose files changed there are given up, every change of them
 * (`ops`). The text written in a file of theirs stays, as a draft where the file came from (or where it is, for a new
 * file), written on the blob it was written on: a send keeps both versions, when that one changed too
 * @param {Changes} changes @param {Blobs} blobs @returns {{ changes: Changes, ops: Set<string> }}
 */
export function rebase(changes, blobs) {
  const ops = new Set(conflictsOf(changes, blobs).map(p => /** @type {string} */ (changes.get(p)?.op)));
  /** @type {Changes} */
  const next = new Map();
  /** @type {Change[]} */
  const dropped = [];
  for (const [p, c] of changes) {
    if (c.op && ops.has(c.op)) dropped.push(c);
    else next.set(p, c);
  }
  for (const c of dropped) {
    if (c.text === undefined || c.auto) continue;
    const back = c.from ?? { path: c.path, base: c.base };
    const at = [back, { path: c.path, base: c.base }].find(b => !next.has(b.path));
    if (at) next.set(at.path, { repo: c.repo, path: at.path, base: at.base, text: c.text, at: c.at });
  }
  return { changes: next, ops };
}
