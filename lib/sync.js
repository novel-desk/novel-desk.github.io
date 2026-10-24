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
// no reading or sending going on
/** @param {{ mode: SyncMode, unsent: number, offline: boolean, busy: boolean }} s */
export const sendsItself = s => s.mode === 'auto' && s.unsent > 0 && !s.offline && !s.busy;
