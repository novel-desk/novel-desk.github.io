// The token kept with a passkey: the options of WebAuthn, and what comes back from it (no screen, no state of the app:
// tested by itself in tests/unit). The requests and the encryption are in ui/vault.js
//
// The token is encrypted with AES-GCM under a key made (HKDF) from the passkey's PRF output, which the authenticator
// gives only after the author is verified (Face ID). Where PRF is not there, the key is a WebCrypto key that cannot be
// taken out (extractable: false), kept in IndexedDB: anyone who can open this browser can use it, and the screen says so

// what the HKDF of the key from the PRF output is for (its info)
export const KEY_INFO = 'novel-writer-js token v1';

// The options that make the passkey: on this host (rp.id), verified, kept on the authenticator, asking for PRF with
// `salt` (some authenticators give its output at once, others only on a get)
/** @param {{ rpId: string, userId: Uint8Array, challenge: Uint8Array, salt: Uint8Array }} o @returns {PublicKeyCredentialCreationOptions} */
export function createOptions({ rpId, userId, challenge, salt }) {
  return {
    rp: { id: rpId, name: 'Novel Desk' },
    user: { id: /** @type {BufferSource} */ (userId), name: 'Novel Desk のトークン', displayName: 'Novel Desk のトークン' },
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
// The options that open the token: the passkey made for it (its credential ID), verified, with the same salt
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
