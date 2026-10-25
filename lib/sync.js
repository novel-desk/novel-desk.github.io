// How a work is sent to GitHub, chosen for each work (FR-GH-04): 自動 (the changes not sent go by themselves a while
// after the last one, and when the page is left: FR-SAVE-03, while the page is open), ボタンを押したときだけ (送る), or
// 同期しない (nothing sent, nothing read in). No screen, no state of the app: tested by itself in tests/unit

/** @typedef {'auto' | 'manual' | 'off'} SyncMode */
/** @type {SyncMode[]} */
export const SYNC_MODES = ['auto', 'manual', 'off'];
// a mode kept on the device, or 自動 when none (or one not known) is
/** @param {unknown} v @returns {SyncMode} */
export const syncMode = v => SYNC_MODES.find(m => m === v) ?? 'auto';
// how long after the last change the changes not sent go by themselves (ms): a pause in writing, not every key
export const AUTO_WAIT = 60000;
// Whether the changes not sent go now by themselves: 自動, something to send, GitHub read (not the copy kept offline),
// no reading or sending going on, and none of them written on another branch than the one open (`elsewhere`: those
// go only when the author says so)
/** @param {{ mode: SyncMode, unsent: number, offline: boolean, busy: boolean, elsewhere: number }} s */
export const sendsItself = s => s.mode === 'auto' && s.unsent > 0 && !s.offline && !s.busy && s.elsewhere === 0;

// --- what a change not sent keeps of where and how it goes (FR-GH-04, FR-GH-09): the device's settings can be gone
// when it is opened again (ログアウト with the drafts kept), the drafts still know

/** @typedef {{ branch?: string, sync?: SyncMode }} Stamp the branch a change was written on, and the work's mode */
// A change kept: with the branch it was written on (once set it stays: the one of the change it takes the place of,
// else the branch open) and the work's mode now
/** @template {Stamp} C @param {C} change @param {Stamp | undefined} before the change it takes the place of @param {string} branch @param {SyncMode} mode @returns {C} */
export const stamped = (change, before, branch, mode) => ({ ...change, branch: change.branch ?? before?.branch ?? branch, sync: mode });
// The work's mode: the one kept on the device, else the most careful one its changes were written with (else 自動)
/** @param {unknown} kept @param {Stamp[]} changes */
export const keptMode = (kept, changes) =>
  syncMode(kept ?? SYNC_MODES[Math.max(-1, ...changes.map(c => SYNC_MODES.indexOf(/** @type {SyncMode} */ (c.sync))))]);
// The branch the changes were written on ('' none known: none, or written before the branch was kept with them)
/** @param {Stamp[]} changes */
export const writtenOn = changes => changes.find(c => c.branch)?.branch ?? '';
// The changes written on another branch than the one open (one written before the branch was kept: on the one open)
/** @template {Stamp} C @param {C[]} changes @param {string} branch @returns {C[]} */
export const onOtherBranch = (changes, branch) => changes.filter(c => c.branch !== undefined && c.branch !== branch);
// What the screen says of the episode open (FR-SAVE-07): on GitHub, on this device only, or not delivered (a send of it
// failed: it stays on the device until one goes); nothing when it is neither (not on GitHub, and nothing written)
/** @param {{ draft: boolean, failed: boolean, onGitHub: boolean }} s */
export const saveState = s =>
  s.draft
    ? s.failed
      ? '届けられませんでした（この端末に残っています。理由は「送る」の上）'
      : '未送信（この端末に保存しました）'
    : s.onGitHub
      ? 'GitHub に届いています'
      : '';
