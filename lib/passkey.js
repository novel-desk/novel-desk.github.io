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

// --- how often the passkey is asked for (DESK-SEC-05, ui/vault.js openedKey, keepOpened): the App's key the passkey
// opened (or the App was made with, its passkey made then) is kept on this device as WebCrypto's key that cannot be
// taken out (extractable: false), with when the passkey was used, and used as it is until the interval chosen in the settings has passed since then; once it has, it is
// deleted and the passkey asked for. 「毎回」 keeps nothing (as before). The choice is this device's (localStorage)

const DAY = 86400000;
/** @typedef {'every' | '1d' | '7d' | '30d' | 'never'} AskInterval */
// the choices, in the order the settings show them: what is kept and the button's label, and how long the key the
// passkey opened is used as it is (ms; 0: not kept; Infinity: until the App is made again or this device's store is lost)
/** @type {readonly { id: AskInterval, label: string, ms: number }[]} */
export const ASK_INTERVALS = [
  { id: 'every', label: '毎回', ms: 0 },
  { id: '1d', label: '1 日', ms: DAY },
  { id: '7d', label: '7 日', ms: 7 * DAY },
  { id: '30d', label: '30 日', ms: 30 * DAY },
  { id: 'never', label: '求めない（App を作成したときと、端末の保存データが消えたときだけ）', ms: Infinity },
];
// the choice before one is made (and for what is not one of them)
export const ASK_DEFAULT = '7d';
/** @param {string} id */
const choice = id => /** @type {typeof ASK_INTERVALS[number]} */ (ASK_INTERVALS.find(x => x.id === id) ?? ASK_INTERVALS.find(x => x.id === ASK_DEFAULT));
// the choice kept (null: none kept; anything else not one of them: the one before a choice is made)
/** @param {string | null} kept @returns {AskInterval} */
export const askIntervalOf = kept => choice(kept ?? '').id;
// whether the key the passkey opened is kept (no: 「毎回」)
/** @param {string} id */
export const keepsOpened = id => choice(id).ms > 0;
/**
 * Whether the key kept when the passkey last opened the App's key is used as it is: kept for this App (its ID and its
 * passkey), and `id`'s interval not passed since then (now before then, the device's clock put back: passed, but for
 * 「求めない」)
 * @param {{ appId: string, credentialId: Uint8Array, at: number }} opened
 * @param {{ appId: string, credentialId: Uint8Array }} app as kept (lib/appkey.js appFormOf 'prf')
 * @param {string} id @param {number} now ms
 */
export function openedStill(opened, app, id, now) {
  const same =
    opened.appId === app.appId && opened.credentialId.length === app.credentialId.length && opened.credentialId.every((b, i) => b === app.credentialId[i]);
  if (!same) return false;
  const { ms } = choice(id);
  return ms === Infinity || (now >= opened.at && now - opened.at < ms);
}
// What the settings and the screen to open the App's key say of the key kept encrypted with a passkey, by the interval
/** @param {string} id */
export function prfSaid(id) {
  const kept = 'GitHub App の秘密鍵は、パスキー（PRF）から生成した鍵で暗号化し、この端末に保存しています。';
  const c = choice(id);
  if (!keepsOpened(c.id)) return `${kept}起動するたびにパスキーで認証します。`;
  const others = '鍵を保存している間は、この端末でこのブラウザーを開ける人が、パスキーなしで作品を読み書きできます。';
  if (c.ms === Infinity)
    return `${kept}App を作成したときと、パスキーで開いたときに、秘密鍵を取り出せない鍵（WebCrypto）としてもこの端末に保存し、パスキーを求めずに起動します。パスキーを求めるのは、App を作成したときと、端末の保存データが消えたときだけです。${others}`;
  return `${kept}App を作成したときと、パスキーで開いたときに、秘密鍵を取り出せない鍵（WebCrypto）としてもこの端末に保存し、${c.label}のあいだはパスキーを求めずに起動します。${c.label}を過ぎると、保存した鍵を削除してパスキーで認証します。${others}`;
}
// What the toast says when the interval is changed: the interval now, and what it does
/** @param {string} id */
export function askChanged(id) {
  const c = choice(id);
  if (!keepsOpened(c.id))
    return 'パスキーを求める間隔を「毎回」にしました。パスキーで開いて保存した鍵を、この端末から削除しました。起動するたびにパスキーで認証します';
  if (c.ms === Infinity)
    return 'パスキーを求める間隔を「求めない」にしました。パスキーを求めるのは、App を作成したときと、端末の保存データが消えたときだけです';
  return `パスキーを求める間隔を「${c.label}」にしました。パスキーで開いてから ${c.label}のあいだは、パスキーを求めずに起動します`;
}
