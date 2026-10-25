// The token, kept on this device encrypted: with a key from a passkey's PRF output (iPhone: Face ID each time it is
// opened), or where PRF is not there, with a WebCrypto key that cannot be taken out of IndexedDB. The token itself is
// only in this page's memory while it is open. A GitHub App's private key is kept in the same way (below)
import { APP_KEY_INFO, createOptions, getOptions, KEY_INFO, openFailure, passkeyName, prfOf, webauthnFailure } from '../lib/passkey.js';
import { pkcs8Of } from '../lib/appkey.js';
import * as store from './db.js';

/**
 * @typedef {{ kind: 'prf', credentialId: Uint8Array, salt: Uint8Array, iv: Uint8Array, data: ArrayBuffer }} PrfVault
 * @typedef {{ kind: 'local', key: CryptoKey, iv: Uint8Array, data: ArrayBuffer }} LocalVault
 * @typedef {PrfVault | LocalVault} Vault
 */
const KEY = 'token';
/** @param {number} n */
const random = n => crypto.getRandomValues(new Uint8Array(n));

/** @returns {Promise<Vault | undefined>} */
export const kept = () => store.get('vault', KEY);
export const forget = () => store.del('vault', KEY);

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
    const caps = await PKC.getClientCapabilities();
    return 'extension:prf' in caps ? caps['extension:prf'] === true : null;
  } catch {
    return null;
  }
}
// A passkey made for the token or the App's key, and its PRF output (null when the authenticator has no PRF: the
// passkey is left unused)
/** @param {'token' | 'app'} kind @param {Uint8Array} salt @returns {Promise<{ credentialId: Uint8Array, output: BufferSource } | null>} */
async function makePasskey(kind, salt) {
  const rpId = location.hostname;
  const cred = /** @type {PublicKeyCredential | null} */ (
    await navigator.credentials.create({
      publicKey: createOptions({ rpId, userId: random(16), challenge: random(32), salt, name: passkeyName(kind, new Date()) }),
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
/** @param {'token' | 'app'} kind @param {Uint8Array} salt */
async function newPasskey(kind, salt) {
  if ((await saysPrf()) === false) return null;
  try {
    return await makePasskey(kind, salt);
  } catch (err) {
    if (webauthnFailure(err) === 'cancelled')
      throw new Error('パスキーが作られませんでした（取り消されたか、時間切れです）。もう一度押してください', { cause: err });
    return null;
  }
}
// What is kept with a passkey, decrypted: the author verified by it. `what` is what the screen calls it. Throws when it
// cannot be (the same words for the token and the App's key: lib/passkey.js openFailure)
/** @param {{ credentialId: Uint8Array, salt: Uint8Array, iv: Uint8Array, data: ArrayBuffer }} v @param {string} info @param {string} what */
async function opened(v, info, what) {
  /** @type {BufferSource | null} */
  let output;
  try {
    output = await passkeyOutput(v.credentialId, v.salt);
  } catch (err) {
    throw new Error(openFailure(err), { cause: err });
  }
  if (!output) throw new Error('パスキーが PRF の値を返しませんでした');
  try {
    return await decrypt(await prfKey(output, v.salt, info), v.iv, v.data);
  } catch (err) {
    throw new Error(`${what}を復号できませんでした（作ったときと違うパスキーかもしれません）`, { cause: err });
  }
}

// Keeps the token: with a passkey when this browser has PRF, else with a key that cannot be taken out. Returns the
// kind kept. Throws when the author said no to the passkey (nothing is kept then)
/** @param {string} token @returns {Promise<'prf' | 'local'>} */
export async function keep(token) {
  const salt = random(32);
  const passkey = await newPasskey('token', salt);
  const bytes = new TextEncoder().encode(token);
  if (passkey) {
    const { iv, data } = await encrypt(await prfKey(passkey.output, salt, KEY_INFO), bytes);
    await store.put('vault', KEY, { kind: 'prf', credentialId: passkey.credentialId, salt, iv, data });
    return 'prf';
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const { iv, data } = await encrypt(key, bytes);
  await store.put('vault', KEY, { kind: 'local', key, iv, data });
  return 'local';
}
// The token, opened (a passkey's: the author verified by it). Throws when it cannot be
/** @param {Vault} v @returns {Promise<string>} */
export async function open(v) {
  return new TextDecoder().decode(v.kind === 'local' ? await decrypt(v.key, v.iv, v.data) : await opened(v, KEY_INFO, 'トークン'));
}

// --- a GitHub App's private key (ui/appkey.js), kept in place of a token (DESK-SEC-01). As the token: its PKCS#8
// bytes encrypted (AES-GCM) with a key from the PRF output of a passkey made for it; opened each time with the passkey,
// made at once into WebCrypto's key that cannot be taken out (extractable: false), held in memory only, the bytes
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
  const passkey = await newPasskey('app', salt);
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
    const pkcs8 = await opened(v, APP_KEY_INFO, 'GitHub App の秘密鍵');
    try {
      return await signingKey(pkcs8);
    } finally {
      pkcs8.fill(0);
    }
  }
  if (v.kind !== 'local' && v.credentialId) {
    try {
      await passkeyOutput(v.credentialId, random(32));
    } catch (err) {
      throw new Error(openFailure(err), { cause: err });
    }
  }
  return v.key;
}
