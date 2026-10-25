// The store on the device (ui/db.js) kept in memory, for the property tests (they mock ui/db.js with this): the same
// functions, each store a Map. reset() empties them (a new device)
export const STORES = /** @type {const} */ (['vault', 'drafts', 'blobs', 'snapshots', 'prefs']);
/** @type {Map<string, Map<string, unknown>>} */
const stores = new Map(STORES.map(s => [s, new Map()]));
const of = (/** @type {string} */ s) => /** @type {Map<string, unknown>} */ (stores.get(s));
// (a value kept is a copy, as IndexedDB keeps it)
export const get = async (/** @type {string} */ s, /** @type {string} */ k) => structuredClone(of(s).get(k));
export const put = async (/** @type {string} */ s, /** @type {string} */ k, /** @type {unknown} */ v) => void of(s).set(k, structuredClone(v));
export const del = async (/** @type {string} */ s, /** @type {string} */ k) => void of(s).delete(k);
export const all = async (/** @type {string} */ s) => [...of(s).values()].map(v => structuredClone(v));
export const keys = async (/** @type {string} */ s) => [...of(s).keys()];
export const reset = () => stores.forEach(m => m.clear());
