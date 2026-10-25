// A GitHub App's private key in PKCS#8, and the JWT it signs. The keys are made here for the test (never a real one)
import { describe, test, expect } from 'vitest';
import { generateKeyPairSync, verify, createPrivateKey, sign } from 'node:crypto';
import { base64url, jwtBody, ownerOf, pkcs8Of, renewNow } from '../../lib/appkey.js';

const pair = bits => generateKeyPairSync('rsa', { modulusLength: bits });
describe('appkey', () => {
  // FR-GH-01, NFR-SEC-15: GitHub's .pem (PKCS#1) and a PKCS#8 one give the same PKCS#8 bytes; anything else refused
  test('pkcs8Of: a PKCS#1 key wrapped as PKCS#8; a PKCS#8 one as it is; not a key: refused', () => {
    for (const bits of [512, 2048]) {
      const { privateKey } = pair(bits);
      const pkcs1 = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
      const pkcs8 = privateKey.export({ type: 'pkcs8', format: 'der' });
      expect(Buffer.from(pkcs8Of(pkcs1))).toEqual(pkcs8);
      expect(Buffer.from(pkcs8Of(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()))).toEqual(pkcs8);
      expect(createPrivateKey({ key: Buffer.from(pkcs8Of(pkcs1)), format: 'der', type: 'pkcs8' }).asymmetricKeyType).toBe('rsa');
    }
    expect(() => pkcs8Of('-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----\n')).toThrow(/GitHub App の秘密鍵/);
    expect(() => pkcs8Of('-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n')).toThrow(/GitHub App の秘密鍵/);
  });
  // FR-GH-01: the JWT GitHub takes (RS256, iat a minute back, exp 9 minutes on, iss the App)
  test('jwtBody: header and claims; signed, verified with the public key', () => {
    const body = jwtBody('Iv1.abc', 1_800_000_000_500);
    const [h, c] = body.split('.').map(p => JSON.parse(Buffer.from(p, 'base64url').toString()));
    expect(h).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(c).toEqual({ iat: 1_799_999_940, exp: 1_800_000_540, iss: 'Iv1.abc' });
    const { privateKey, publicKey } = pair(2048);
    const sig = base64url(new Uint8Array(sign('sha256', Buffer.from(body), privateKey)));
    expect(verify('sha256', Buffer.from(body), publicKey, Buffer.from(sig, 'base64url'))).toBe(true);
    expect(base64url(new Uint8Array([251, 255, 254]))).toBe('-__-');
    expect(base64url('ab?')).toBe('YWI_');
  });
  // FR-GH-01: an installation's token asked for again before it ends
  test('renewNow: none yet, or 5 minutes or less left', () => {
    expect(renewNow(undefined, 0)).toBe(true);
    expect(renewNow({ expires: 10 * 60000 }, 0)).toBe(false);
    expect(renewNow({ expires: 5 * 60000 - 1 }, 0)).toBe(true);
  });
  test('ownerOf: the owner of the repository a request is about', () => {
    expect(ownerOf('/repos/Author/novel/git/trees/x')).toBe('author');
    expect(ownerOf('https://api.github.com/repos/o/r/contents/a?ref=b')).toBe('o');
    expect(ownerOf('/user/repos?per_page=1')).toBe('');
    expect(ownerOf('/repositories/12')).toBe('');
  });
});
