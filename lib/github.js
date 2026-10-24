// What is read from and sent to GitHub's REST API, as values (no screen, no state of the app: tested by itself in
// tests/unit). The requests themselves are in ui/github.js

export const API = 'https://api.github.com';

// A blob's content as GitHub gives it (base64, its lines cut by line ends) → its bytes
/** @param {string} b64 @returns {Uint8Array} */
export function bytesOf(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
// The text of a file, which must be UTF-8 (null when it is not: the screen says so, and does not open it)
/** @param {Uint8Array} bytes @returns {string | null} */
export function textOf(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
// The next page of a listing, from the Link header (null when it is the last)
/** @param {string | null} link @returns {string | null} */
export function nextPage(link) {
  return /<([^>]+)>;\s*rel="next"/.exec(link ?? '')?.[1] ?? null;
}
/** @type {Record<string, string>} */
const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif' };
// The media type of a picture by its name ('application/octet-stream' for a name not known: shown as nothing)
/** @param {string} path */
export const imageType = path => IMAGE_TYPES[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream';

/** @typedef {{ path: string, mode: string, type: string, sha: string }} TreeEntry */
// The files of a tree (recursive): the blobs by path, with their modes, and the paths of the folders. Links (mode
// 120000) and submodules are left out: they are not episodes, and a link could point anywhere
/** @param {TreeEntry[]} entries @returns {{ blobs: Record<string, { sha: string, mode: string }>, folders: string[] }} */
export function filesOf(entries) {
  /** @type {Record<string, { sha: string, mode: string }>} */
  const blobs = {};
  /** @type {string[]} */
  const folders = [];
  for (const e of entries) {
    if (e.type === 'tree') folders.push(e.path);
    else if (e.type === 'blob' && e.mode !== '120000') blobs[e.path] = { sha: e.sha, mode: e.mode };
  }
  return { blobs, folders };
}
// What an answer of GitHub that is not ok says on the screen, by its status
/** @param {number} status @param {string} [message] the message GitHub gave */
export function failure(status, message = '') {
  const why =
    status === 401
      ? 'トークンが使えません（期限切れか、消されたかもしれません）'
      : status === 403
        ? '権限がないか、回数の上限に達しました'
        : status === 404
          ? '見つかりません（トークンにこのリポジトリの権限がないかもしれません）'
          : status === 409
            ? 'リポジトリが空です'
            : `GitHub がエラーを返しました（${status}）`;
  return message ? `${why}: ${message}` : why;
}
