import { describe, test, expect } from 'vitest';
import {
  APP_KEY_INFO,
  ASK_DEFAULT,
  ASK_INTERVALS,
  askChanged,
  askIntervalOf,
  createOptions,
  getOptions,
  keepsOpened,
  openedStill,
  openFailure,
  passkeyName,
  prfOf,
  prfSaid,
  webauthnFailure,
  prfInCaps,
  asksPasskey,
} from '../../lib/passkey.js';

const bytes = n => new Uint8Array(n).fill(7);

describe('passkey', () => {
  test('createOptions: a passkey on this host, called as given, verified, asking for PRF with the salt', () => {
    const o = createOptions({
      rpId: 'kurogane255.github.io',
      userId: bytes(16),
      challenge: bytes(32),
      salt: bytes(32),
      name: 'Novel Desk GitHub App 2026-10-25',
    });
    expect(o.rp).toEqual({ id: 'kurogane255.github.io', name: 'Novel Desk' });
    expect([o.user.name, o.user.displayName]).toEqual(['Novel Desk GitHub App 2026-10-25', 'Novel Desk GitHub App 2026-10-25']);
    expect(o.user.id).toEqual(bytes(16));
    expect(o.challenge).toEqual(bytes(32));
    expect(o.authenticatorSelection).toEqual({ residentKey: 'preferred', userVerification: 'required' });
    expect(o.pubKeyCredParams.map(p => p.alg)).toEqual([-7, -257]);
    expect(o.extensions).toEqual({ prf: { eval: { first: bytes(32) } } });
  });
  // NFR-SEC-15: the passkey's name in the passwords' list says what it opens and the day it was made
  test('passkeyName: the GitHub App, and the day made', () => {
    expect(passkeyName(new Date(2026, 9, 25, 23, 59))).toBe('Novel Desk GitHub App 2026-10-25');
    expect(passkeyName(new Date(2026, 0, 5))).toBe('Novel Desk GitHub App 2026-01-05');
  });
  test('getOptions: only the passkey made for the App’s key, verified, the same salt', () => {
    const o = getOptions({ rpId: 'localhost', credentialId: bytes(20), challenge: bytes(32), salt: bytes(32) });
    expect(o.rpId).toBe('localhost');
    expect(o.allowCredentials).toEqual([{ type: 'public-key', id: bytes(20) }]);
    expect(o.userVerification).toBe('required');
    expect(o.extensions).toEqual({ prf: { eval: { first: bytes(32) } } });
  });
  test('prfOf: the output when given; enabled when said or given; nothing for no PRF', () => {
    expect(prfOf({ prf: { enabled: true, results: { first: bytes(32) } } })).toEqual({ output: bytes(32), enabled: true });
    expect(prfOf({ prf: { results: { first: bytes(32) } } })).toEqual({ output: bytes(32), enabled: true });
    expect(prfOf({ prf: { enabled: true } })).toEqual({ output: null, enabled: true });
    expect(prfOf({ prf: { enabled: false } })).toEqual({ output: null, enabled: false });
    expect(prfOf({})).toEqual({ output: null, enabled: false });
    expect(prfOf(undefined)).toEqual({ output: null, enabled: false });
  });
  test('webauthnFailure: said no or timed out; anything else is a browser that cannot', () => {
    expect(webauthnFailure({ name: 'NotAllowedError' })).toBe('cancelled');
    expect(webauthnFailure({ name: 'AbortError' })).toBe('cancelled');
    expect(webauthnFailure({ name: 'NotSupportedError' })).toBe('unsupported');
    expect(webauthnFailure({})).toBe('unsupported');
    expect(webauthnFailure(undefined)).toBe('unsupported');
  });
  // DESK-SEC-01: the key from the PRF output names what it is for (the GitHub App's key)
  test('APP_KEY_INFO: names what the key is for, and its version', () => {
    expect(APP_KEY_INFO).toBe('novel-writer-js app key v1');
  });
  // DESK-SEC-01: the passkey not opening the App's key
  test('openFailure: said no or timed out; a browser that cannot, by its error’s name (or the error itself)', () => {
    // (the passkey deleted is said no to as well: the way out said, logged out and the App made again)
    const cancelled =
      'パスキーで開けませんでした（取り消されたか、時間切れになりました）。パスワードの管理でパスキーを削除した場合は、もう開けません。「ログアウト」を押して、App を再作成してください';
    expect(openFailure({ name: 'NotAllowedError' })).toBe(cancelled);
    expect(openFailure({ name: 'AbortError' })).toBe(cancelled);
    expect(openFailure(new TypeError('x'))).toBe('パスキーを使えません（TypeError）');
    expect(openFailure('test')).toBe('パスキーを使えません（test）');
    expect(openFailure(undefined)).toBe('パスキーを使えません（undefined）');
  });
});

// DESK-SEC-01: PRF said by the browser; the key kept by the version before opened with its passkey
test('prfInCaps: true, false, or not said', () => {
  expect(prfInCaps({ 'extension:prf': true })).toBe(true);
  expect(prfInCaps({ 'extension:prf': false })).toBe(false);
  expect(prfInCaps({ conditionalGet: true })).toBe(null);
});
test('asksPasskey: kept by the version before with a passkey; not with none, nor kept here without one', () => {
  expect(asksPasskey({ credentialId: new Uint8Array([1]) })).toBe(true);
  expect(asksPasskey({ credentialId: null })).toBe(false);
  expect(asksPasskey({ kind: 'local' })).toBe(false);
});

// DESK-SEC-05: how often the passkey is asked for
describe('DESK-SEC-05: the interval the passkey is asked for', () => {
  const DAY = 86400000;
  const app = { appId: 'Iv23testclient1', credentialId: new Uint8Array([1, 2, 3]) };
  const at = Date.UTC(2026, 10, 22, 3);
  const opened = { ...app, at };
  test('DESK-SEC-05: ASK_INTERVALS: 毎回, 1 日, 7 日, 30 日, 求めない (App を作成したときと、端末の保存データが消えたときだけ), in this order; 7 日 before one is chosen', () => {
    expect(ASK_INTERVALS.map(c => [c.id, c.label, c.ms])).toEqual([
      ['every', '毎回', 0],
      ['1d', '1 日', DAY],
      ['7d', '7 日', 7 * DAY],
      ['30d', '30 日', 30 * DAY],
      ['never', '求めない（App を作成したときと、端末の保存データが消えたときだけ）', Infinity],
    ]);
    expect(ASK_DEFAULT).toBe('7d');
  });
  test('DESK-SEC-05: askIntervalOf: the one kept; none kept, or not one of them: 7 日', () => {
    for (const c of ASK_INTERVALS) expect(askIntervalOf(c.id)).toBe(c.id);
    expect(askIntervalOf(null)).toBe('7d');
    expect(askIntervalOf('')).toBe('7d');
    expect(askIntervalOf('2d')).toBe('7d');
  });
  test('DESK-SEC-05: keepsOpened: the key the passkey opened kept, but for 毎回', () => {
    expect(ASK_INTERVALS.map(c => keepsOpened(c.id))).toEqual([false, true, true, true, true]);
    expect(keepsOpened('unknown')).toBe(true);
  });
  test('DESK-SEC-05: openedStill: used until the interval has passed since the passkey opened it; at it, and after, not', () => {
    for (const [id, ms] of /** @type {const} */ ([
      ['1d', DAY],
      ['7d', 7 * DAY],
      ['30d', 30 * DAY],
    ])) {
      expect(openedStill(opened, app, id, at)).toBe(true);
      expect(openedStill(opened, app, id, at + ms - 1)).toBe(true);
      expect(openedStill(opened, app, id, at + ms)).toBe(false);
      expect(openedStill(opened, app, id, at + ms + 1)).toBe(false);
    }
    // (毎回: never kept; one kept before 毎回 was chosen, not used)
    expect(openedStill(opened, app, 'every', at)).toBe(false);
    // (求めない: whenever)
    expect(openedStill(opened, app, 'never', at + 3650 * DAY)).toBe(true);
    // (not one of them: as 7 日)
    expect(openedStill(opened, app, 'x', at + 7 * DAY - 1)).toBe(true);
    expect(openedStill(opened, app, 'x', at + 7 * DAY)).toBe(false);
  });
  test('DESK-SEC-05: openedStill: the device’s clock put back (now before the passkey opened it): passed, but for 求めない', () => {
    expect(openedStill(opened, app, '30d', at - 1)).toBe(false);
    expect(openedStill(opened, app, 'never', at - 1)).toBe(true);
  });
  test('DESK-SEC-05: openedStill: kept for another App, or for another passkey: not used', () => {
    expect(openedStill({ ...opened, appId: 'Iv23other' }, app, 'never', at)).toBe(false);
    expect(openedStill({ ...opened, credentialId: new Uint8Array([1, 2, 4]) }, app, 'never', at)).toBe(false);
    expect(openedStill({ ...opened, credentialId: new Uint8Array([1, 2]) }, app, 'never', at)).toBe(false);
    expect(openedStill({ ...opened, credentialId: new Uint8Array([1, 2, 3, 0]) }, app, 'never', at)).toBe(false);
  });
  test('DESK-SEC-05: prfSaid: how the key is kept, by the interval', () => {
    const kept = 'GitHub App の秘密鍵は、パスキー（PRF）から生成した鍵で暗号化し、この端末に保存しています。';
    const others = '鍵を保存している間は、この端末でこのブラウザーを開ける人が、パスキーなしで作品を読み書きできます。';
    expect(prfSaid('every')).toBe(`${kept}起動するたびにパスキーで認証します。`);
    expect(prfSaid('7d')).toBe(
      `${kept}App を作成したときと、パスキーで開いたときに、秘密鍵を取り出せない鍵（WebCrypto）としてもこの端末に保存し、7 日のあいだはパスキーを求めずに起動します。7 日を過ぎると、保存した鍵を削除してパスキーで認証します。${others}`,
    );
    expect(prfSaid('1d')).toContain('1 日のあいだはパスキーを求めずに起動します。1 日を過ぎると');
    expect(prfSaid('30d')).toContain('30 日のあいだはパスキーを求めずに起動します。30 日を過ぎると');
    expect(prfSaid('never')).toBe(
      `${kept}App を作成したときと、パスキーで開いたときに、秘密鍵を取り出せない鍵（WebCrypto）としてもこの端末に保存し、パスキーを求めずに起動します。パスキーを求めるのは、App を作成したときと、端末の保存データが消えたときだけです。${others}`,
    );
  });
  test('DESK-SEC-05: askChanged: the interval now, and what it does', () => {
    expect(askChanged('every')).toBe(
      'パスキーを求める間隔を「毎回」にしました。パスキーで開いて保存した鍵を、この端末から削除しました。起動するたびにパスキーで認証します',
    );
    expect(askChanged('1d')).toBe('パスキーを求める間隔を「1 日」にしました。パスキーで開いてから 1 日のあいだは、パスキーを求めずに起動します');
    expect(askChanged('30d')).toBe('パスキーを求める間隔を「30 日」にしました。パスキーで開いてから 30 日のあいだは、パスキーを求めずに起動します');
    expect(askChanged('never')).toBe(
      'パスキーを求める間隔を「求めない」にしました。パスキーを求めるのは、App を作成したときと、端末の保存データが消えたときだけです',
    );
  });
});
