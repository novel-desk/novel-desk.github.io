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
const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
// The media type of a picture by its name ('application/octet-stream' for a name not known: shown as nothing). Only
// JPEG, PNG, WebP and GIF: never SVG, which could run a script if its object URL were opened (NFR-SEC-15)
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
      ? 'トークンが使用できません（期限切れか、削除された可能性があります）'
      : status === 403
        ? '権限がないか、回数の上限に達しました'
        : status === 404
          ? '見つかりません（トークンにこのリポジトリの権限がないかもしれません）'
          : status === 409
            ? 'リポジトリが空です'
            : `GitHub がエラーを返しました（${status}）`;
  return message ? `${why}: ${message}` : why;
}

// How Japanese a text looks: one for each kana, kanji and full-width mark, less ten for each character a Japanese text
// hardly has (half-width katakana, control characters other than line breaks and tabs, private use characters), which
// a reading in the wrong encoding is full of (the server version's japanese_score)
/** @param {string} text */
export function japaneseScore(text) {
  let score = 0;
  for (const c of text) {
    if (/[　-ヿ一-鿿！-～]/.test(c)) score += 1;
    // eslint-disable-next-line no-control-regex
    else if (/[｡-ﾟ-]/.test(c) || (/[\u0000-\u001f\u007f-\u009f]/.test(c) && !/[\n\r\t]/.test(c))) score -= 10;
  }
  return score;
}
/** @param {string} label @param {Uint8Array} bytes */
function decoded(label, bytes) {
  try {
    return new TextDecoder(label, { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}
// A Japanese text in another encoding than UTF-8 (Shift-JIS, EUC-JP, ISO-2022-JP, or UTF-16 with its BOM), as a text
// (FR-WORK-03; the server version's japanese_text). null when the bytes are UTF-8 already, or read as no Japanese
// text: each reading is scored (japaneseScore) and the best taken; one that scores nothing or has no kana is refused,
// so such a file is left as it is (it does not open) and never written over with garbled text
/** @param {Uint8Array} bytes @returns {string | null} */
export function japaneseText(bytes) {
  const [a, b] = bytes;
  if ((a === 0xff && b === 0xfe) || (a === 0xfe && b === 0xff)) return decoded(a === 0xff ? 'utf-16le' : 'utf-16be', bytes.subarray(2));
  // ISO-2022-JP is 7-bit: it reads as UTF-8 too, so it is told by its escape sequences
  const jis = bytes.every(x => x < 0x80) && bytes.some((x, i) => x === 0x1b && bytes[i + 1] === 0x24 && (bytes[i + 2] === 0x42 || bytes[i + 2] === 0x40));
  if (!jis && textOf(bytes) !== null) return null;
  let best = null,
    top = -Infinity;
  for (const label of ['iso-2022-jp', 'shift_jis', 'euc-jp']) {
    const t = decoded(label, bytes);
    if (t !== null && japaneseScore(t) > top) [best, top] = [t, japaneseScore(t)];
  }
  return best !== null && top > 0 && /[ぁ-ヺ]/.test(best) ? best : null;
}
