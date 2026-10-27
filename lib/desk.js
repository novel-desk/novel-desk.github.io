// What the desk decides of the work open (ui/desk.js): how many changes are not sent, what its buttons and states say,
// which episode is opened after the work changed, the texts shown and when an episode was last changed. No screen, no
// state of the app: tested by itself in tests/unit
import { CONFLICT_MARK } from './merge.js';
import { saveState } from './sync.js';

/** @typedef {import('./changes.js').Changes} Changes */
/** @typedef {import('./changes.js').Blobs} Blobs */
/** @typedef {import('./sync.js').SyncMode} SyncMode */

// how many files the changes not sent change (novel.toml counts once: its keys set by operations, or its text written)
/** @param {Changes} drafts @param {unknown[]} edits */
export const unsentCount = (drafts, edits) => drafts.size + (edits.length && !drafts.has('novel.toml') ? 1 : 0);

// the state in a word on the folded line (as the server version's 「・push 済み」): none without a work, or 同期しない
/** @param {{ read: boolean, mode: SyncMode, bad: boolean, unsent: number }} s */
export const briefOf = s => (!s.read || s.mode === 'off' ? '' : s.bad ? '・送信失敗' : s.unsent ? '・未送信' : '・送信済み');

// 送る: not pressed with nothing to send, while it sends, or while another repository is under the work's name (FR-GH-12);
// 「…」 while it sends, the number of files to send otherwise. 「GitHub に送信」 under the text (B6): shown only when there
// is something to send and it can go (not 同期しない, nor stopped)
/** @param {{ busy: boolean, unsent: number, stopped: boolean, mode: SyncMode }} s @returns {{ disabled: boolean, text: string, foot: boolean }} */
export const sendButton = s => ({
  disabled: s.busy || s.unsent === 0 || s.stopped,
  text: s.busy ? '…' : s.unsent ? `送る（${s.unsent}）` : '送る',
  foot: s.mode !== 'off' && s.unsent > 0 && !s.stopped,
});

// both versions side by side in a text (lib/merge.js keptBoth)
/** @param {string} text */
export const hasConflict = text => text.includes(CONFLICT_MARK);

// What the foot says of the episode open: both versions side by side (said there instead, as the server version's), else
// where it is kept (lib/sync.js saveState); nothing with no episode open
/** @param {{ text: string, open: boolean, draft: boolean, failed: boolean, onGitHub: boolean }} s */
export const footState = s =>
  hasConflict(s.text)
    ? '両方の版が並んでいます。「――― ここから」の行を探して整理してください'
    : s.open
      ? saveState({ draft: s.draft, failed: s.failed, onGitHub: s.onGitHub })
      : '';

// what the state above 送る says once the work is read (`when`: the time it was read)
/** @param {{ mode: SyncMode, offline: boolean, when: string }} s @returns {{ text: string, kind: '' | 'ok' | 'err' }} */
export const readSaid = s =>
  s.mode === 'off'
    ? { text: '同期しない設定です。GitHub へ送ることも、GitHub から取り込むこともしません（この端末で前に読んだ版に書きます）', kind: '' }
    : s.offline
      ? { text: 'オフラインです。前に読んだ版を出しています（送るのはつながってから）', kind: 'err' }
      : { text: `GitHub から読みました（${s.when}）`, kind: 'ok' };

// --- the episode to open

// the episode before or after the one open (`d`: -1 or 1) in the table of contents' order ('' when there is none)
/** @param {string[]} paths @param {string} current @param {number} d */
export const neighborOf = (paths, current, d) => {
  const i = paths.indexOf(current);
  return i < 0 ? '' : (paths[i + d] ?? '');
};
// The episode opened when the work is read (again): the one open, else the one last opened on the device, else the
// first ('' when the work has none)
/** @param {string[]} paths @param {string} current @param {unknown} [last] */
export const episodeToOpen = (paths, current, last) =>
  paths.includes(current) ? current : typeof last === 'string' && paths.includes(last) ? last : (paths[0] ?? '');
// The episode opened after an operation: the one it asks for (`open`), else where the open one moved, else the open one
// if it is still there ('' when none)
/** @param {{ paths: string[], current: string, open?: string, moved?: string }} s */
export const episodeAfter = s => s.open ?? (s.moved && s.paths.includes(s.moved) ? s.moved : s.paths.includes(s.current) ? s.current : '');
// the episode opened after the open one is put in the trash: the one before it, else the first left ('' when none)
/** @param {string[]} paths @param {string} trashed */
export const afterTrash = (paths, trashed) => {
  const i = paths.indexOf(trashed);
  return paths.filter(p => p !== trashed)[Math.max(0, i - 1)] ?? '';
};

// --- the texts

/** @typedef {{ blobs: Blobs, texts: Record<string, string | null>, shaTexts: Record<string, string | null> }} Read the work as read from GitHub */

// the text of a file as read from GitHub ('' when it is not there, or not read)
/** @param {Read} read @param {string} path */
export const readText = (read, path) => read.texts[path] ?? read.shaTexts[read.blobs[path]?.sha ?? ''] ?? '';
// The text of a file of the work as shown (null: not there, not UTF-8, or not on the device): its change not sent (its
// text, or the blob it moved), else the branch's
/** @param {Read} read @param {Blobs} files the files as shown @param {Changes} drafts @param {string} path */
export const shownText = (read, files, drafts, path) => {
  const c = drafts.get(path);
  if (!files[path]) return null;
  if (c) return c.text ?? read.shaTexts[/** @type {string} */ (c.sha)] ?? null;
  return read.texts[path] ?? read.shaTexts[files[path].sha] ?? null;
};

// --- 最終更新 (FR-EDIT-02)

// the key an episode's last commit is kept by: its path and its blob (asked once for each version of it)
/** @param {string} path @param {string} sha */
export const changedKey = (path, sha) => `${path}\n${sha}`;
// When an episode was last changed: when this device wrote it (not sent), else its last commit on GitHub (0: not known
// yet)
/** @param {Changes} drafts @param {Blobs} blobs @param {Map<string, number>} changed @param {string} path */
export const updatedOf = (drafts, blobs, changed, path) => {
  const d = drafts.get(path);
  if (d) return d.at;
  const b = blobs[path];
  return b ? (changed.get(changedKey(path, b.sha)) ?? 0) : 0;
};
