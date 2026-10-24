// 作品の一覧 (FR-WORK-01): what a row of the list says of a work (its title, its length, how many episodes, when it was
// last changed, the repository and the branch in use), and when a summary kept on the device still holds (no screen,
// no state of the app: tested by itself in tests/unit). The reading is ui/works.js's
import { charsOf, esc } from './format.js';
import { episodesOf } from './layout.js';

/**
 * A work's summary, kept on the device by the refs it was read at
 * @typedef {object} Summary
 * @property {string} title
 * @property {number} chars the work's length, counted as the desk counts it (no white space)
 * @property {number} count how many episodes
 * @property {number} updated when it was last changed (the commit read, or a change not sent written after it; ms)
 * @property {string} branch the branch in use
 * @property {string} chosen the branch chosen on this device when it was read ('' none)
 * @property {[string, string][]} heads every ref looked at to find the branch, and the commit it was at ('' not there)
 * @property {boolean} overlay counted with changes not sent over what was read
 */

// The work as the desk shows it (the changes not sent over what was read), summed up: its title (novel.toml's, else
// the repository's name), its length and episodes, and when it was last changed
/**
 * @param {import('./view.js').View} view @param {string} repo 「owner/name」 @param {number} updated when the commit read was made
 * @param {{ at: number }[]} changes the changes not sent
 * @returns {{ title: string, chars: number, count: number, updated: number }}
 */
export function summaryOf(view, repo, updated, changes) {
  const episodes = episodesOf(view.toc);
  return {
    title: view.layout.title || repo.split('/')[1],
    chars: episodes.reduce((sum, e) => sum + charsOf(view.texts[e.path] ?? ''), 0),
    count: episodes.length,
    updated: Math.max(updated || 0, ...changes.map(c => c.at)),
  };
}

// Whether a summary kept still holds: read with the same branch chosen, every ref it looked at still where it was, and
// no change not sent over it, then or now (a summary counted with them is read again)
/** @param {Summary | null | undefined} kept @param {string} chosen @param {string[]} heads the refs' commits now, in its order @param {boolean} overlay */
export function stillHolds(kept, chosen, heads, overlay) {
  if (!kept || overlay || kept.overlay || kept.chosen !== chosen) return false;
  return kept.heads.length === heads.length && kept.heads.every(([, c], i) => c === heads[i]);
}

/** @type {Record<string, string>} */
const VISIBILITY = { private: '非公開', public: '公開', internal: '組織内' };
// A repository's visibility (FR-GH-11), as a tag: 公開 stands out. GitHub gives `visibility`, or only `private`
/** @param {{ visibility?: string, private?: boolean }} r */
export function visibilityTag(r) {
  const v = r.visibility ?? (r.private === undefined ? '' : r.private ? 'private' : 'public');
  const label = VISIBILITY[v];
  return label ? `<span class="vis ${esc(v)}" title="GitHub のリポジトリの公開状態">${label}</span>` : '';
}
