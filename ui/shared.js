// What the desk gives the screens over it (資料, プロット, キャラ, 記録, リリース, the note beside the text): the work as
// shown, its texts, and the ways to change it. The desk (ui/desk.js) fills it in once; the others call it, never change
// the desk's state themselves

/** @typedef {import('../lib/drafts.js').Draft} Draft */
/** @typedef {{ path: string, rel: string, title: string, chars: number }} Episode an episode of the table of contents */
/**
 * @typedef {object} Api
 * @property {() => import('./work.js').Work} work the work as read from GitHub
 * @property {() => import('../lib/view.js').View} view the work as shown (the changes not sent over it)
 * @property {() => Map<string, Draft>} drafts the changes not sent, by path
 * @property {() => string[]} files the work's files as shown
 * @property {(paths: string[]) => Promise<Record<string, string | null>>} texts the texts of these files as shown (null: not
 *   there, not UTF-8, or not on the device offline)
 * @property {(path: string, text: string) => void} keepText a text written in a file of the work (a note), kept as a change
 * @property {(plan: import('../lib/episodes.js').Plan, open?: string, stay?: boolean) => Promise<boolean>} apply an operation
 * @property {(path: string) => Promise<string>} pictureUrl a picture's object URL ('' when it cannot be read)
 * @property {() => import('../lib/episodes.js').Shown} forPlans the work as the plans of lib/episodes.js take it
 * @property {(path: string) => Promise<boolean>} openEpisode
 * @property {() => string} current the episode open ('' none)
 * @property {() => Episode[]} episodes
 * @property {(rel: string) => string} title the title of an episode or a chapter (its path from the manuscript folder)
 * @property {() => void} back back to the desk
 * @property {(path: string, text: string, force: boolean) => Promise<import('../lib/history.js').Snapshot[]>} snapshot a version
 *   kept on the device (every 10 minutes of writing, or `force`)
 * @property {(path: string) => Promise<import('../lib/history.js').Snapshot[]>} snapshots the versions kept of a file
 * @property {() => Promise<void>} reload the work read from GitHub again
 * @property {() => boolean} busy reading or sending
 * @property {() => number} unsent how many files the changes not sent change
 * @property {() => Promise<void>} send the changes not sent sent now (as 送る)
 * @property {() => ReturnType<typeof import('../lib/changes.js').unsentList>} unsentItems the changes not sent, as listed
 * @property {(item: import('../lib/changes.js').Unsent) => Promise<void>} discard a change not sent given up
 * @property {() => string} otherBranch the branch the changes not sent were written on, when it is not the one open ('' none)
 * @property {() => Draft[]} parked the texts set aside (their file gone, or another file now, when they were to be sent)
 * @property {(d: Draft, how: 'send' | 'put' | 'drop') => Promise<void>} unpark a text set aside, as the author chooses
 * @property {() => import('../lib/sync.js').SyncMode} mode how the work is sent
 */
/** @type {Api} */
export const api = /** @type {any} */ ({});
