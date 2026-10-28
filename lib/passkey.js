// The GitHub App's private key kept with a passkey: the options of WebAuthn, and what comes back from it (no screen, no
// state of the app: tested by itself in tests/unit). The requests and the encryption are in ui/vault.js
//
// The key is encrypted with AES-GCM under a key made (HKDF) from the passkey's PRF output, which the authenticator
// gives only after the author is verified (Face ID). Where PRF is not there, the App's key is kept as a WebCrypto key
// that cannot be taken out (extractable: false), in IndexedDB: anyone who can open this browser can use it, and the
// screen says so

// what the HKDF of the key from the PRF output is for (its info): the GitHub App's private key's (DESK-SEC-01)
export const APP_KEY_INFO = 'novel-writer-js app key v1';

// What a passkey is called in the passwords' list (iPhone: 設定 → パスワード): what it opens (the GitHub App's key) and
// the day it was made (on this device's clock), so that one no longer used is told from the one in use
/** @param {Date} day */
export const passkeyName = day =>
  `Novel Desk GitHub App ${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
// The options that make the passkey called `name` (passkeyName): on this host (rp.id), verified, kept on the
// authenticator, asking for PRF with `salt` (some authenticators give its output at once, others only on a get)
/** @param {{ rpId: string, userId: Uint8Array, challenge: Uint8Array, salt: Uint8Array, name: string }} o @returns {PublicKeyCredentialCreationOptions} */
export function createOptions({ rpId, userId, challenge, salt, name }) {
  return {
    rp: { id: rpId, name: 'Novel Desk' },
    user: { id: /** @type {BufferSource} */ (userId), name, displayName: name },
    challenge: /** @type {BufferSource} */ (challenge),
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    timeout: 120000,
    extensions: /** @type {AuthenticationExtensionsClientInputs} */ ({ prf: { eval: { first: salt } } }),
  };
}
// The options that open the App's key: the passkey made for it (its credential ID), verified, with the same salt
/** @param {{ rpId: string, credentialId: Uint8Array, challenge: Uint8Array, salt: Uint8Array }} o @returns {PublicKeyCredentialRequestOptions} */
export function getOptions({ rpId, credentialId, challenge, salt }) {
  return {
    rpId,
    challenge: /** @type {BufferSource} */ (challenge),
    allowCredentials: [{ type: 'public-key', id: /** @type {BufferSource} */ (credentialId) }],
    userVerification: 'required',
    timeout: 120000,
    extensions: /** @type {AuthenticationExtensionsClientInputs} */ ({ prf: { eval: { first: salt } } }),
  };
}
// What the authenticator said of PRF (getClientExtensionResults): its output (when it gave one), and whether it can
/** @param {any} results @returns {{ output: BufferSource | null, enabled: boolean }} */
export function prfOf(results) {
  const prf = results?.prf;
  const output = prf?.results?.first ?? null;
  return { output, enabled: Boolean(output) || prf?.enabled === true };
}
// What a failed WebAuthn request means: the author said no (or let it time out), or this browser cannot (then the key
// that cannot be taken out is used instead)
/** @param {{ name?: string }} err @returns {'cancelled' | 'unsupported'} */
export const webauthnFailure = err => (err?.name === 'NotAllowedError' || err?.name === 'AbortError' ? 'cancelled' : 'unsupported');
// What the screen says when a passkey does not open what it keeps (the GitHub App's private key): the author said no (or let it time out), or this browser cannot (its error's name)
/** @param {any} err */
export const openFailure = err =>
  webauthnFailure(err) === 'cancelled'
    ? 'パスキーで開けませんでした（取り消されたか、時間切れになりました）。パスワードの管理でパスキーを削除した場合は、もう開けません。「ログアウト」を押して、App を再作成してください'
    : `パスキーを使えません（${err?.name ?? err}）`;
// Whether this browser says it has PRF, from what it says it can do (getClientCapabilities: true, false; null when it
// does not say)
/** @param {Record<string, unknown>} caps @returns {boolean | null} */
export const prfInCaps = caps => ('extension:prf' in caps ? caps['extension:prf'] === true : null);
// whether opening an App's key kept as it is asks for its passkey first: kept by the version before with one
/** @param {{ kind?: string, credentialId?: Uint8Array | null }} v */
export const asksPasskey = v => v.kind !== 'local' && Boolean(v.credentialId);
