import { describe, test, expect } from 'vitest';
import { KEY_INFO, createOptions, getOptions, prfOf, webauthnFailure } from '../../lib/passkey.js';

const bytes = n => new Uint8Array(n).fill(7);

describe('passkey', () => {
  test('createOptions: a passkey on this host, verified, asking for PRF with the salt', () => {
    const o = createOptions({ rpId: 'kurogane255.github.io', userId: bytes(16), challenge: bytes(32), salt: bytes(32) });
    expect(o.rp).toEqual({ id: 'kurogane255.github.io', name: 'Novel Writer' });
    expect(o.user.id).toEqual(bytes(16));
    expect(o.challenge).toEqual(bytes(32));
    expect(o.authenticatorSelection).toEqual({ residentKey: 'preferred', userVerification: 'required' });
    expect(o.pubKeyCredParams.map(p => p.alg)).toEqual([-7, -257]);
    expect(o.extensions).toEqual({ prf: { eval: { first: bytes(32) } } });
  });
  test('getOptions: only the passkey made for the token, verified, the same salt', () => {
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
  test('KEY_INFO: names what the key is for, and its version', () => {
    expect(KEY_INFO).toBe('novel-writer-js token v1');
  });
});
