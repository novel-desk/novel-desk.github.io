// A GitHub App's private key, and the JWT it signs (FR-GH-01: a way in that is not a token made by hand every 90 days;
// no screen, no state of the app: tested by itself in tests/unit). GitHub gives the key as a .pem file: PKCS#1 (「BEGIN
// RSA PRIVATE KEY」), which WebCrypto does not take, so it is put in PKCS#8 here. The signing and the requests are in
// ui/appkey.js

// the DER of the key in a PEM file, in PKCS#8 (a PKCS#1 key wrapped as RSA's PrivateKeyInfo). Throws when it is not
// an RSA private key in PEM
/** @param {string} pem @returns {Uint8Array} */
export function pkcs8Of(pem) {
  const m = /-----BEGIN (RSA )?PRIVATE KEY-----([A-Za-z0-9+/=\s]+)-----END \1PRIVATE KEY-----/.exec(pem);
  if (!m) throw new Error('GitHub App の秘密鍵（.pem）ではありません。GitHub の App の設定の「Generate a private key」で作ったファイルを選んでください');
  const der = Uint8Array.from(atob(m[2].replace(/\s+/g, '')), c => c.charCodeAt(0));
  return m[1] ? wrapPkcs1(der) : der;
}
// a DER length, in its long form (what is wrapped is an RSA key: always more than 127 bytes)
/** @param {number} n @returns {number[]} */
function length(n) {
  const bytes = [];
  for (let x = n; x > 0; x >>= 8) bytes.unshift(x & 0xff);
  return [0x80 | bytes.length, ...bytes];
}
/** @param {number} tag @param {Uint8Array | number[]} body */
const tlv = (tag, body) => [tag, ...length(body.length), ...body];
// PrivateKeyInfo: version 0, the algorithm rsaEncryption (1.2.840.113549.1.1.1) with no parameters, the PKCS#1 key
const RSA = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
/** @param {Uint8Array} pkcs1 */
const wrapPkcs1 = pkcs1 => Uint8Array.from(tlv(0x30, [0x02, 0x01, 0x00, ...RSA, ...tlv(0x04, pkcs1)]));

// base64url of bytes or of a text (UTF-8)
/** @param {Uint8Array | string} x */
export function base64url(x) {
  const bytes = typeof x === 'string' ? new TextEncoder().encode(x) : x;
  return btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
// what the App signs to ask for its installations' tokens: the JWT's header and claims (iat a minute back for a clock
// a little off, exp 9 minutes on: GitHub takes 10 at most; iss the App's ID or Client ID), without the signature
/** @param {string} app @param {number} now ms @returns {string} */
export const jwtBody = (app, now) => {
  const s = Math.floor(now / 1000);
  return `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(JSON.stringify({ iat: s - 60, exp: s + 540, iss: app }))}`;
};
// whether an installation's token is to be asked for again: none yet, or it ends within 5 minutes
/** @param {{ expires: number } | undefined} t @param {number} now ms */
export const renewNow = (t, now) => !t || t.expires - now < 5 * 60000;
// the owner of the repository a request of the API is about ('' when it is about none)
/** @param {string} url */
export const ownerOf = url => (/^(?:https:\/\/api\.github\.com)?\/repos\/([^/?]+)\//.exec(url)?.[1] ?? '').toLowerCase();
