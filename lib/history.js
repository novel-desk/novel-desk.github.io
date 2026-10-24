// 履歴: the versions of an episode, from this device and from GitHub (no screen, no state of the app: tested by itself in
// tests/unit). This device keeps a version every 10 minutes of writing (FR-HIST-04), and the text before a version is
// put back (FR-HIST-03); GitHub has the commits that changed the file. The server version's public/ui/history.js shows
// the same, from the server's snapshots and commits

/** @typedef {{ at: number, text: string }} Snapshot a version kept on this device */
/**
 * A version as the list shows it: 未送信 (the draft), 自動 (kept on this device), GitHub (a commit; its text read when
 * opened), the newest first
 * @typedef {{ kind: 'here' | 'snapshot' | 'github', at: number, subject: string, text: string | null, ref: string }} Version
 */

export const SNAPSHOT_EVERY = 10 * 60 * 1000;
export const SNAPSHOTS_KEPT = 100;

// The versions kept after the text `text` written at `at`: one more when the last is 10 minutes old (or `force`: the
// text before a version is put back), and not the same text as the last; the oldest go past SNAPSHOTS_KEPT
/** @param {Snapshot[]} list @param {string} text @param {number} at @param {boolean} [force] @returns {Snapshot[]} */
export function snapshotted(list, text, at, force = false) {
  const last = list[list.length - 1];
  if (last && (last.text === text || (!force && at - last.at < SNAPSHOT_EVERY))) return list;
  return [...list, { at, text }].slice(-SNAPSHOTS_KEPT);
}
/**
 * The versions of a file, the newest first: its draft (not sent), the ones kept on this device, its commits on GitHub
 * (as the REST API lists them)
 * @param {{ draft: { text: string, at: number } | null, snapshots: Snapshot[], commits: { sha: string, commit: { message: string, committer: { date: string } } }[] }} o
 * @returns {Version[]}
 */
export function versionsOf({ draft, snapshots, commits }) {
  /** @type {Version[]} */
  const rest = [
    ...snapshots.map(s => ({ kind: /** @type {const} */ ('snapshot'), at: s.at, subject: '', text: s.text, ref: '' })),
    ...commits.map(c => ({
      kind: /** @type {const} */ ('github'),
      at: Date.parse(c.commit.committer.date) || 0,
      subject: c.commit.message.split('\n')[0],
      text: null,
      ref: c.sha,
    })),
  ].sort((a, b) => b.at - a.at);
  return draft ? [{ kind: 'here', at: draft.at, subject: '', text: draft.text, ref: '' }, ...rest] : rest;
}
