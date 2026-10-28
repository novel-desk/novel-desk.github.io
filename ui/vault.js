// The GitHub App's private key, kept on this device: encrypted with a key from a passkey's PRF output (iPhone: Face ID
// each time it is opened), or where PRF is not there, as a WebCrypto key that cannot be taken out of IndexedDB (below)
import { APP_KEY_INFO, asksPasskey, createOptions, getOptions, openFailure, passkeyName, prfInCaps, prfOf, webauthnFailure } from '../lib/passkey.js';
import { pkcs8Of } from '../lib/appkey.js';
import * as store from './db.js';

/** @param {number} n */
const random = n => crypto.getRandomValues(new Uint8Array(n));

// A token kept by the versions that could start with one (DESK-OPS-04): deleted, and whether one was there. Nothing
// else is deleted with it (the drafts not sent and the copies of the works stay, for the App made again)
export async function dropOldToken() {
  if ((await store.get('vault', 'token')) === undefined) return false;
  await store.del('vault', 'token');
  return true;
}

// The AES-GCM key from a PRF output (HKDF, SHA-256, the salt kept with it; info: what it is for)
/** @param {BufferSource} output @param {Uint8Array} salt @param {string} what */
async function prfKey(output, salt, what) {
  const base = await crypto.subtle.importKey('raw', output, 'HKDF', false, ['deriveKey']);
  const info = new TextEncoder().encode(what);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: /** @type {BufferSource} */ (salt), info },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
/** @param {CryptoKey} key @param {Uint8Array} bytes */
async function encrypt(key, bytes) {
  const iv = random(12);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: /** @type {BufferSource} */ (iv) }, key, /** @type {BufferSource} */ (bytes));
  return { iv, data };
}
/** @param {CryptoKey} key @param {Uint8Array} iv @param {ArrayBuffer} data */
async function decrypt(key, iv, data) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: /** @type {BufferSource} */ (iv) }, key, data));
}

// Whether this browser says it has PRF (false: it says it has not; null: it does not say)
async function saysPrf() {
  const PKC = /** @type {any} */ (window.PublicKeyCredential);
  if (!PKC) return false;
  if (typeof PKC.getClientCapabilities !== 'function') return null;
  try {
    return prfInCaps(await PKC.getClientCapabilities());
  } catch {
    return null;
  }
}
// A passkey made for the App's key, and its PRF output (null when the authenticator has no PRF: the passkey is left
// unused)
/** @param {Uint8Array} salt @returns {Promise<{ credentialId: Uint8Array, output: BufferSource } | null>} */
async function makePasskey(salt) {
  const rpId = location.hostname;
  const cred = /** @type {PublicKeyCredential | null} */ (
    await navigator.credentials.create({
      publicKey: createOptions({ rpId, userId: random(16), challenge: random(32), salt, name: passkeyName(new Date()) }),
    })
  );
  if (!cred) return null;
  const credentialId = new Uint8Array(cred.rawId);
  const made = prfOf(cred.getClientExtensionResults());
  if (made.output) return { credentialId, output: made.output };
  if (!made.enabled) return null;
  // (an authenticator that gives the output only on a get: asked once more, as opening it will)
  const output = await passkeyOutput(credentialId, salt);
  return output ? { credentialId, output } : null;
}
/** @param {Uint8Array} credentialId @param {Uint8Array} salt */
async function passkeyOutput(credentialId, salt) {
  const got = /** @type {PublicKeyCredential | null} */ (
    await navigator.credentials.get({ publicKey: getOptions({ rpId: location.hostname, credentialId, challenge: random(32), salt }) })
  );
  return got ? prfOf(got.getClientExtensionResults()).output : null;
}
// A passkey with PRF made, when this browser has it (null: it has not, or the authenticator has not). Throws when the
// author said no to it
/** @param {Uint8Array} salt */
async function newPasskey(salt) {
  if ((await saysPrf()) === false) return null;
  try {
    return await makePasskey(salt);
  } catch (err) {
    if (webauthnFailure(err) === 'cancelled')
      throw new Error('パスキーを作成できませんでした（取り消されたか、時間切れになりました）。もう一度押してください', { cause: err });
    return null;
  }
}
// What is kept with a passkey, decrypted: the author verified by it. Throws when it cannot be (lib/passkey.js
// openFailure)
/** @param {{ credentialId: Uint8Array, salt: Uint8Array, iv: Uint8Array, data: ArrayBuffer }} v */
async function opened(v) {
  /** @type {BufferSource | null} */
  let output;
  try {
    output = await passkeyOutput(v.credentialId, v.salt);
  } catch (err) {
    throw new Error(openFailure(err), { cause: err });
  }
  if (!output) throw new Error('パスキーが PRF の値を返しませんでした');
  try {
    return await decrypt(await prfKey(output, v.salt, APP_KEY_INFO), v.iv, v.data);
  } catch (err) {
    throw new Error('GitHub App の秘密鍵を復号できませんでした（作成したときと違うパスキーの可能性があります）', { cause: err });
  }
}

// --- the GitHub App's private key (ui/appkey.js, DESK-SEC-01): its PKCS#8 bytes encrypted (AES-GCM) with a key from
// the PRF output of a passkey made for it; opened each time with the passkey, made at once into WebCrypto's key that cannot be taken out (extractable: false), held in memory only, the bytes
// zeroed. Where PRF is not there: the key that cannot be taken out kept as it is, no passkey (anyone who can open this
// browser can sign with it: the screen says so). One kept as it is by the version before, with a passkey that encrypts
// nothing ('old'), cannot be encrypted now (it cannot be taken out): opened as before, and the settings say how to
// have it encrypted (README: GitHub App の秘密鍵の置き方)
/**
 * @typedef {{ appId: string, author: { name: string, email: string } | null, slug?: string }} AppInfo
 * (author null: not known yet, proposed when a work is opened; slug: an App made by the manifest flow, its page)
 * @typedef {{ kind: 'prf', credentialId: Uint8Array, salt: Uint8Array, iv: Uint8Array, data: ArrayBuffer }} AppSealed
 * @typedef {{ kind: 'local', key: CryptoKey }} AppLocal
 * @typedef {{ kind?: undefined, key: CryptoKey, credentialId: Uint8Array | null }} AppOld kept by the version before
 * @typedef {AppInfo & (AppSealed | AppLocal | AppOld)} AppVault
 * @typedef {{ credentialId: Uint8Array, salt: Uint8Array, key: CryptoKey }} AppSeal the passkey made for the App's key,
 * and the key from its PRF output to encrypt it with
 */
const APP = 'app';
/** @returns {Promise<AppVault | undefined>} */
export const keptApp = () => store.get('vault', APP);
export const forgetApp = () => store.del('vault', APP);
// The passkey to encrypt the App's key with, made when this browser has PRF (null when it has not). Throws when the
// author said no to it. (Made while the author's press is fresh: Safari makes one only then)
/** @returns {Promise<AppSeal | null>} */
export async function appPasskey() {
  const salt = random(32);
  const passkey = await newPasskey(salt);
  return passkey && { credentialId: passkey.credentialId, salt, key: await prfKey(passkey.output, salt, APP_KEY_INFO) };
}
// the key to sign with, from PKCS#8 bytes, that cannot be taken out
/** @param {Uint8Array} pkcs8 @returns {Promise<CryptoKey>} */
export const signingKey = pkcs8 =>
  crypto.subtle.importKey('pkcs8', /** @type {BufferSource} */ (pkcs8), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
// The App's key from its .pem (throws when it is not a key GitHub made): the key that cannot be taken out, to use now,
// and what is kept of it: its PKCS#8 bytes encrypted with the passkey's key, or (no PRF: no seal) the key itself. The
// bytes are zeroed once used; neither they nor the .pem's text are kept
/** @param {string} pem @param {AppSeal | null} seal @returns {Promise<{ key: CryptoKey, lock: AppSealed | AppLocal }>} */
export async function lockApp(pem, seal) {
  const pkcs8 = pkcs8Of(pem);
  try {
    const key = await signingKey(pkcs8);
    if (!seal) return { key, lock: { kind: 'local', key } };
    const { iv, data } = await encrypt(seal.key, pkcs8);
    return { key, lock: { kind: 'prf', credentialId: seal.credentialId, salt: seal.salt, iv, data } };
  } finally {
    pkcs8.fill(0);
  }
}
// Keeps the App (its key as lockApp made it, or as it was kept)
/** @param {AppVault} v @returns {Promise<AppVault>} */
export async function keepApp(v) {
  await store.put('vault', APP, v);
  return v;
}
// The App's key to sign with: decrypted with its passkey (the author verified by it), or, kept as it is, the key kept
// (the version before's with a passkey: the passkey asked first, as before). Throws when it cannot be
/** @param {AppVault} v @returns {Promise<CryptoKey>} */
export async function openApp(v) {
  if (v.kind === 'prf') {
    const pkcs8 = await opened(v);
    try {
      return await signingKey(pkcs8);
    } finally {
      pkcs8.fill(0);
    }
  }
  if (asksPasskey(v)) {
    try {
      await passkeyOutput(/** @type {Uint8Array} */ (/** @type {AppOld} */ (v).credentialId), random(32));
    } catch (err) {
      throw new Error(openFailure(err), { cause: err });
    }
  }
  return v.key;
}
