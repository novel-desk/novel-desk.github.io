// 作品の一覧 (FR-WORK-01): what a row of the list says of a work (its title, its length, how many episodes, when it was
// last changed, the repository and the branch in use), and when a summary kept on the device still holds (no screen,
// no state of the app: tested by itself in tests/unit). The reading is ui/works.js's
import { charsOf, esc } from './format.js';
import { episodesOf } from './layout.js';
import { quote } from './tomledit.js';

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

// --- a new work (FR-WORK-02, FR-GH-02) and the repository's name (FR-GH-10)

// A repository's name as GitHub takes it: letters, digits and . _ - (100 at most); 「.git」 at its end left off
/** @param {string} name @returns {string | null} the name, or null when GitHub would not take it */
export function repoName(name) {
  const n = name.trim().replace(/\.git$/, '');
  return /^[A-Za-z0-9_.-]{1,100}$/.test(n) && n !== '.' && n !== '..' ? n : null;
}
// The comment at the top of a new work's novel.toml: what each setting means (the server version's CONFIG_HELP)
const CONFIG_HELP = `# Novel Writer の作品の設定
#   manuscript.dir   本文のフォルダ。中の「番号_題名.md」が話、「番号_題名/」が章
#   manuscript.files 話にするファイル名（例 "[0-9][0-9].md"）、exclude で外すもの
#   manuscript.naming "number" なら、新しい話を「番号.md」にして、題名を [titles] に書く
#   notes.dir        資料（キャラクター、世界観、プロット）のフォルダ
#   images.dir       画像（立ち絵、地図、挿絵）のフォルダ
#   git.branch       書き込んで push するブランチ
`;
// The files of a new work, as the server version makes them (src/works/setup.rs): novel.toml, README.md, the first
// episode (empty), and the pictures folder
/** @param {string} title @param {string} branch @returns {Record<string, string>} */
export function newWorkFiles(title, branch) {
  const config = [
    `title = ${quote(title)}`,
    '',
    '[manuscript]',
    'dir = "manuscript"',
    'files = "*.md"',
    '',
    '[notes]',
    'dir = "notes"',
    '',
    '[images]',
    'dir = "notes/images"',
    '',
    '[git]',
    `branch = ${quote(branch)}`,
    '',
  ].join('\n');
  return { 'README.md': `# ${title}\n`, 'novel.toml': CONFIG_HELP + config, 'manuscript/01_はじまり.md': '', 'notes/images/.gitkeep': '' };
}

/** @typedef {{ id: number, full_name: string, default_branch: string, visibility?: string, private?: boolean }} RepoMeta a repository as GitHub says it */
// Where the repository of a work is now (FR-GH-10, FR-GH-12), from its name and the ID it had when it was opened:
// 'same' (the name is still it), 'moved' (renamed or moved to another owner: the name given now, which GitHub
// sends the old one on to, or the repository found by its ID), 'other' (the name is now another repository, and
// the one opened is not found: not sent to until the author says so), 'gone' (not found at all: said when it is read)
/**
 * @param {string} name the name the work was opened by @param {number} keptId its ID then (0: not known yet)
 * @param {RepoMeta | null} byName the repository the name gives now @param {RepoMeta | null} byId the one the ID gives
 * @returns {{ kind: 'same' | 'moved' | 'other' | 'gone', meta: RepoMeta | null }}
 */
export function whereIs(name, keptId, byName, byId) {
  if (byName && (!keptId || byName.id === keptId)) return { kind: byName.full_name === name ? 'same' : 'moved', meta: byName };
  if (byId) return { kind: byId.full_name === name ? 'same' : 'moved', meta: byId };
  return byName ? { kind: 'other', meta: byName } : { kind: 'gone', meta: null };
}
// A key the device keeps for a work, moved to its repository's new name (null: not this work's). The keys are
// 「owner/name」 or 「owner/name\npath」 (a draft, the work last read), or those after 「what:」 (the settings)
/** @param {string} key @param {string} from @param {string} to */
export function movedKey(key, from, to) {
  /** @param {string} k */
  const ours = k => k === from || k.startsWith(`${from}\n`);
  if (ours(key)) return to + key.slice(from.length);
  const at = key.indexOf(':');
  return at >= 0 && ours(key.slice(at + 1)) ? key.slice(0, at + 1) + to + key.slice(at + 1 + from.length) : null;
}
// Why GitHub refused to make or rename a repository, and what to do (the separate token with Administration)
/** @param {number} status @param {string} message GitHub's message */
export function adminFailure(status, message) {
  if (status === 401) return 'このトークンは使えません（期限切れか、消されたかもしれません）';
  if (status === 403 || status === 404)
    return 'このトークンには、リポジトリを作る・名前を変える権限がありません。Repository permissions の Administration を Read and write にした別のトークン（作るときは Repository access を All repositories に）を作って入れてください';
  if (status === 422) return `GitHub が受け付けませんでした（同じ名前のリポジトリがあるかもしれません）: ${message}`;
  return message;
}

// --- a work taken off the list (FR-WORK-05), and the token forgotten (NFR-SEC-16)

// Whether a key the device keeps is a work's (its drafts, the work last read, its settings)
/** @param {string} key @param {string} repo */
export const isWorkKey = (key, repo) => movedKey(key, repo, repo) !== null;
// The repositories the list shows, and the ones taken off it (on this device; GitHub keeps them as they are)
/** @template {{ full_name: string }} R @param {R[]} list @param {string[]} off @returns {{ shown: R[], off: R[] }} */
export function listed(list, off) {
  const out = new Set(off);
  return { shown: list.filter(r => !out.has(r.full_name)), off: list.filter(r => out.has(r.full_name)) };
}
// The settings kept when the token is forgotten: none, but when the drafts are kept, what they need to be sent later
// (the keys of novel.toml their operations set, and whose they are)
/** @param {string} key @param {boolean} draftsKept */
export const keptAfterForget = (key, draftsKept) => draftsKept && (key.startsWith('edits:') || key === 'owner');
