// The token, kept on this device encrypted: with a key from a passkey's PRF output (iPhone: Face ID each time it is
// opened), or where PRF is not there, with a WebCrypto key that cannot be taken out of IndexedDB. The token itself is
// only in this page's memory while it is open
import { createOptions, getOptions, KEY_INFO, prfOf, webauthnFailure } from '../lib/passkey.js';
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

// The AES-GCM key from a PRF output (HKDF, SHA-256, the salt kept with it)
/** @param {BufferSource} output @param {Uint8Array} salt */
async function prfKey(output, salt) {
  const base = await crypto.subtle.importKey('raw', output, 'HKDF', false, ['deriveKey']);
  const info = new TextEncoder().encode(KEY_INFO);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: /** @type {BufferSource} */ (salt), info },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
/** @param {CryptoKey} key @param {string} token */
async function encrypt(key, token) {
  const iv = random(12);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: /** @type {BufferSource} */ (iv) }, key, new TextEncoder().encode(token));
  return { iv, data };
}
/** @param {CryptoKey} key @param {Uint8Array} iv @param {ArrayBuffer} data */
async function decrypt(key, iv, data) {
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: /** @type {BufferSource} */ (iv) }, key, data));
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
// A passkey made for the token, and its PRF output (null when the authenticator has no PRF: the passkey is left unused)
/** @param {Uint8Array} salt @returns {Promise<{ credentialId: Uint8Array, output: BufferSource } | null>} */
async function makePasskey(salt) {
  const rpId = location.hostname;
  const cred = /** @type {PublicKeyCredential | null} */ (
    await navigator.credentials.create({ publicKey: createOptions({ rpId, userId: random(16), challenge: random(32), salt }) })
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

// Keeps the token: with a passkey when this browser has PRF, else with a key that cannot be taken out. Returns the
// kind kept. Throws when the author said no to the passkey (nothing is kept then)
/** @param {string} token @returns {Promise<'prf' | 'local'>} */
export async function keep(token) {
  const salt = random(32);
  /** @type {{ credentialId: Uint8Array, output: BufferSource } | null} */
  let passkey = null;
  if ((await saysPrf()) !== false) {
    try {
      passkey = await makePasskey(salt);
    } catch (err) {
      if (webauthnFailure(err) === 'cancelled')
        throw new Error('パスキーが作られませんでした（取り消されたか、時間切れです）。もう一度押してください', { cause: err });
    }
  }
  if (passkey) {
    const { iv, data } = await encrypt(await prfKey(passkey.output, salt), token);
    await store.put('vault', KEY, { kind: 'prf', credentialId: passkey.credentialId, salt, iv, data });
    return 'prf';
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const { iv, data } = await encrypt(key, token);
  await store.put('vault', KEY, { kind: 'local', key, iv, data });
  return 'local';
}
// The token, opened (a passkey's: the author verified by it). Throws when it cannot be
/** @param {Vault} v @returns {Promise<string>} */
export async function open(v) {
  if (v.kind === 'local') return decrypt(v.key, v.iv, v.data);
  /** @type {BufferSource | null} */
  let output;
  try {
    output = await passkeyOutput(v.credentialId, v.salt);
  } catch (err) {
    throw new Error(
      webauthnFailure(err) === 'cancelled' ? 'パスキーで開けませんでした（取り消されたか、時間切れです）' : `パスキーを使えません（${err.name ?? err}）`,
      { cause: err },
    );
  }
  if (!output) throw new Error('パスキーが PRF の値を返しませんでした');
  try {
    return await decrypt(await prfKey(output, v.salt), v.iv, v.data);
  } catch (err) {
    throw new Error('トークンを復号できませんでした（作ったときと違うパスキーかもしれません）', { cause: err });
  }
}

// --- a GitHub App's private key (ui/appkey.js), kept in place of a token. The key is WebCrypto's that cannot be
// taken out (extractable: false): kept as it is, so nothing can read it, on this device or off it. Where this browser
// has passkeys, opening the app asks for the passkey made for it (as the token's does); the key is not encrypted
// with it, since a key that cannot be taken out cannot be wrapped either (README: GitHub App の秘密鍵で始める)
/**
 * @typedef {{ appId: string, key: CryptoKey, author: { name: string, email: string } | null, credentialId: Uint8Array | null, slug?: string }} AppVault
 * (author null: not known yet, proposed when a work is opened; slug: an App made by the manifest flow, its page)
 */
const APP = 'app';
/** @returns {Promise<AppVault | undefined>} */
export const keptApp = () => store.get('vault', APP);
export const forgetApp = () => store.del('vault', APP);
// The passkey to open the App's key with, made when this browser has passkeys (null when it has none). Throws when
// the author said no to it. (Made while the author's press is fresh: Safari makes one only then)
/** @returns {Promise<Uint8Array | null>} */
export async function appPasskey() {
  if (!window.PublicKeyCredential) return null;
  try {
    const cred = /** @type {PublicKeyCredential} */ (
      await navigator.credentials.create({
        publicKey: createOptions({ rpId: location.hostname, userId: random(16), challenge: random(32), salt: random(32) }),
      })
    );
    return new Uint8Array(cred.rawId);
  } catch (err) {
    throw new Error(`パスキーが作られませんでした（${err.name}）。もう一度押してください`, { cause: err });
  }
}
// Keeps the App's key (with the passkey made for it, if any)
/** @param {AppVault} v @returns {Promise<AppVault>} */
export async function keepApp(v) {
  await store.put('vault', APP, v);
  return v;
}
// The App's key, opened with its passkey (the author verified by it; one kept without a passkey is opened at once,
// not here). Throws when it cannot be
/** @param {AppVault} v @returns {Promise<AppVault>} */
export async function openApp(v) {
  try {
    await navigator.credentials.get({
      publicKey: getOptions({ rpId: location.hostname, credentialId: /** @type {Uint8Array} */ (v.credentialId), challenge: random(32), salt: random(32) }),
    });
  } catch (err) {
    throw new Error(`パスキーで開けませんでした（${err.name}）`, { cause: err });
  }
  return v;
}
