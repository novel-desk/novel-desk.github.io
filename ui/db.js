// The app's store on this device (IndexedDB): the token (encrypted), the texts not sent yet, the blobs read from
// GitHub (by their sha, which names their content), the last tree read of each work, and what was chosen
const NAME = 'novel-writer-js';
export const STORES = /** @type {const} */ (['vault', 'drafts', 'blobs', 'snapshots', 'prefs']);
/** @typedef {typeof STORES[number]} Store */

/** @type {Promise<IDBDatabase> | null} */
let opened = null;
/** @returns {Promise<IDBDatabase>} */
function db() {
  opened ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, 1);
    // (version 1 is the only one: made from nothing, every store at once)
    req.onupgradeneeded = () => {
      for (const s of STORES) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opened;
}
/** @template T @param {Store} store @param {IDBTransactionMode} mode @param {(s: IDBObjectStore) => IDBRequest<T>} f @returns {Promise<T>} */
async function run(store, mode, f) {
  const tx = (await db()).transaction(store, mode);
  const req = f(tx.objectStore(store));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
/** @param {Store} store @param {string} key @returns {Promise<any>} */
export const get = (store, key) => run(store, 'readonly', s => s.get(key));
/** @param {Store} store @param {string} key @param {unknown} value */
export const put = (store, key, value) => run(store, 'readwrite', s => s.put(value, key));
/** @param {Store} store @param {string} key */
export const del = (store, key) => run(store, 'readwrite', s => s.delete(key));
/** @param {Store} store @returns {Promise<any[]>} */
export const all = store => run(store, 'readonly', s => s.getAll());
/** @param {Store} store @returns {Promise<IDBValidKey[]>} */
export const keys = store => run(store, 'readonly', s => s.getAllKeys());
