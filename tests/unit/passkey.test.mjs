import { describe, test, expect } from 'vitest';
import { APP_KEY_INFO, createOptions, getOptions, openFailure, passkeyName, prfOf, webauthnFailure } from '../../lib/passkey.js';

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
