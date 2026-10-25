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

// --- a GitHub App made by GitHub's manifest flow (FR-GH-01: one button, no key file, no App ID typed). The steps on
// the screen and the requests are in ui/appkey.js and app.js

/**
 * @typedef {{ state: string, at: number, seal: { credentialId: Uint8Array, salt: Uint8Array, key: CryptoKey } | null }} Pending
 * the flow started on this device, with the passkey made for the key and the key from its PRF output (ui/vault.js
 * appPasskey; null: no PRF here), to encrypt the key with when GitHub gives it
 */
// how long GitHub takes the code it gives back (and so how long a flow started is waited for)
export const HOUR = 3600000;
// a random name's end, lowercase letters and digits (App names are GitHub's, one each)
/** @param {Uint8Array} bytes */
export const suffixOf = bytes => Array.from(bytes, b => (b % 36).toString(36)).join('');
// The kind of device the app runs on, as the App's name says it (a device lost: told apart on GitHub's list of Apps,
// without the device's screen): iPhone, iPad, Mac, Windows, Android, Linux; '' when it is none of these. An iPad
// says it is a Mac (iPadOS's Safari, as a computer's), but it has a touch screen
/** @param {{ userAgent: string, maxTouchPoints: number }} nav */
export function deviceOf({ userAgent: ua, maxTouchPoints }) {
  if (/iPhone|iPod/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Linux|X11/.test(ua)) return 'Linux';
  return '';
}
// GitHub takes an App's name of 34 letters at most
export const APP_NAME_MAX = 34;
// The App's name: Novel Desk, the kind of device it is made on (none when not known), the day it is made (month and
// day, as 1025) and the suffix (random: App names are GitHub's, one each). 30 letters at most
/** @param {string} device @param {Date} day @param {string} suffix */
export const appName = (device, day, suffix) =>
  ['Novel Desk', device, `${String(day.getMonth() + 1).padStart(2, '0')}${String(day.getDate()).padStart(2, '0')}`, suffix].filter(Boolean).join(' ');
// The App's manifest: named `name` (appName); its page, the way back after it is made and after it is installed, the
// app's own address; on the author's account only (public: false); no webhook; Contents to write (and Metadata to
// read, which GitHub gives with it), no events
/** @param {string} base the app's address @param {string} name */
export const manifestOf = (base, name) => ({
  name,
  url: base,
  description: 'Novel Desk で小説のリポジトリを読み書きする',
  redirect_url: base,
  setup_url: base,
  public: false,
  hook_attributes: { url: base, active: false },
  default_permissions: { contents: 'write', metadata: 'read' },
  default_events: [],
});
// where GitHub installs the App (the author chooses the repositories there)
/** @param {string} slug */
export const installUrl = slug => `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`;
// What GitHub gave back after the App was made: from the address it came back to, or from what is pasted (that
// address, or 「state.code」 as a page that was not the one that started it shows it). null when it is neither
/** @param {string} text @returns {{ code: string, state: string } | null} */
export function returnOf(text) {
  const t = text.trim();
  /** @type {URLSearchParams} */
  let q;
  try {
    q = new URL(t).searchParams;
  } catch {
    const m = /^([\w-]+)\.([\w-]+)$/.exec(t);
    return m ? { state: m[1], code: m[2] } : null;
  }
  const code = q.get('code');
  const state = q.get('state');
  return code && state ? { code, state } : null;
}
// whether what came back is for the flow started on this device: its state, within the hour
/** @param {Pending | undefined} p @param {string} state @param {number} now ms */
export const startedHere = (p, state, now) => p !== undefined && p.state === state && now - p.at < HOUR;
// who the commits are written by, proposed: the author of the repository's latest commit; none (an empty
// repository): the account the App is installed on, with its noreply address
/** @param {any[]} commits the latest first @param {{ login: string, id: number } | undefined} account */
export function authorOf(commits, account) {
  const a = commits[0]?.commit?.author;
  if (a?.name && a?.email) return { name: String(a.name), email: String(a.email) };
  return account ? { name: account.login, email: `${account.id}+${account.login}@users.noreply.github.com` } : null;
}

// --- whose the drafts left on this device are (NFR-SEC-16): prefs 'owner', compared with whom a token or an App put
// in is of. Kept as the GitHub account's number, for both: a token's user (GitHub's /user) and an App's owner (GitHub's
// /app: the account that made it, the only one it can be installed on), so that an App made again, or a token put in
// after an App, is the same person
/** @typedef {{ id: number, login: string, appIds?: string[] }} Who a GitHub account, and an App's ID and Client ID */
// Whether the drafts kept as `kept`'s are the account `who`'s. Kept before as its login (a token's user: the same
// login, any case, is the same person) or as 「app:」 and the App's ID or Client ID (the same App, by either); none
// kept: nothing to tell them apart by
/** @param {unknown} kept @param {Who} who */
export function sameOwner(kept, who) {
  if (typeof kept === 'number') return kept === who.id;
  if (typeof kept !== 'string' || !kept) return true;
  if (kept.startsWith('app:')) return (who.appIds ?? []).includes(kept.slice(4));
  return kept.toLowerCase() === who.login.toLowerCase();
}

// --- how a GitHub App's private key is kept (DESK-SEC-01, ui/vault.js): 'prf', encrypted with a key from a passkey's
// PRF output; 'local', WebCrypto's key that cannot be taken out, kept as it is (no PRF in this browser: no passkey);
// 'old', kept as it is by the version before, opened with a passkey that encrypts nothing. One kept by the version
// before without a passkey is kept as 'local' is
/** @param {{ kind?: string, credentialId?: Uint8Array | null }} v @returns {'prf' | 'local' | 'old'} */
export function appFormOf(v) {
  if (v.kind === 'prf') return 'prf';
  return v.kind === undefined && v.credentialId ? 'old' : 'local';
}
