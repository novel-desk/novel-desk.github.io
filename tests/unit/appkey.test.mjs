// A GitHub App's private key in PKCS#8, and the JWT it signs. The keys are made here for the test (never a real one)
import { describe, test, expect } from 'vitest';
import { generateKeyPairSync, verify, createPrivateKey, sign } from 'node:crypto';
import {
  APP_NAME_MAX,
  appFormOf,
  appName,
  authorOf,
  base64url,
  deviceOf,
  HOUR,
  installUrl,
  jwtBody,
  manifestOf,
  ownerOf,
  pkcs8Of,
  renewNow,
  returnOf,
  sameOwner,
  startedHere,
  suffixOf,
} from '../../lib/appkey.js';

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
  // FR-GH-01, NFR-SEC-11: the App made from the manifest: the app's own address to come back to, no webhook, on the
  // author's account only, Contents to write and Metadata to read and nothing else, no events
  test('manifestOf: named as given; back to the app; no webhook; private; contents write, metadata read', () => {
    const base = 'https://novel-desk.github.io/';
    expect(manifestOf(base, 'Novel Desk iPhone 1025 k3x9a1')).toEqual({
      name: 'Novel Desk iPhone 1025 k3x9a1',
      url: base,
      description: 'Novel Desk で小説のリポジトリを読み書きする',
      redirect_url: base,
      setup_url: base,
      public: false,
      hook_attributes: { url: base, active: false },
      default_permissions: { contents: 'write', metadata: 'read' },
      default_events: [],
    });
    expect(suffixOf(new Uint8Array([0, 35, 36, 255]))).toBe('0z03');
    expect(installUrl('novel-desk-k3x9a1')).toBe('https://github.com/apps/novel-desk-k3x9a1/installations/new');
  });
  // FR-GH-01: the App's name tells the device it was made on and the day, on GitHub's list of Apps (a device lost: its
  // App deleted there); within GitHub's 34 letters, its random end kept
  test('deviceOf and appName: the kind of device and the day in the name; within 34 letters; the kind not known, left out', () => {
    const ua = {
      iPhone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      iPadOld: 'Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
      linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    };
    expect(deviceOf({ userAgent: ua.iPhone, maxTouchPoints: 5 })).toBe('iPhone');
    expect(deviceOf({ userAgent: ua.iPadOld, maxTouchPoints: 5 })).toBe('iPad');
    // (iPadOS's Safari says it is a Mac; a Mac has no touch screen)
    expect(deviceOf({ userAgent: ua.mac, maxTouchPoints: 5 })).toBe('iPad');
    expect(deviceOf({ userAgent: ua.mac, maxTouchPoints: 0 })).toBe('Mac');
    expect(deviceOf({ userAgent: ua.windows, maxTouchPoints: 0 })).toBe('Windows');
    expect(deviceOf({ userAgent: ua.android, maxTouchPoints: 5 })).toBe('Android');
    expect(deviceOf({ userAgent: ua.linux, maxTouchPoints: 0 })).toBe('Linux');
    expect(deviceOf({ userAgent: 'SomethingElse/1.0', maxTouchPoints: 0 })).toBe('');
    const day = new Date(2026, 9, 25, 23, 59);
    expect(appName('iPhone', day, 'a1b2c3')).toBe('Novel Desk iPhone 1025 a1b2c3');
    expect(appName('', new Date(2026, 0, 5), 'a1b2c3')).toBe('Novel Desk 0105 a1b2c3');
    for (const device of ['iPhone', 'iPad', 'Mac', 'Windows', 'Android', 'Linux', ''])
      expect(appName(device, new Date(2026, 11, 31), suffixOf(new Uint8Array(6).fill(35))).length).toBeLessThanOrEqual(APP_NAME_MAX);
  });
  // NFR-SEC-16: whose the drafts are, by the GitHub account's number (a token's user, an App's owner); kept before as
  // a login (the same login, any case) or 「app:」 and the App's ID or Client ID (the same App, by either); none kept
  test('sameOwner: the account’s number; a login kept before; an App kept before by its ID or Client ID; none kept', () => {
    const who = { id: 1001, login: 'Author' };
    const app = { id: 1001, login: 'author', appIds: ['123456', 'Iv23abc'] };
    expect(sameOwner(1001, who)).toBe(true);
    expect(sameOwner(2002, who)).toBe(false);
    expect(sameOwner(1001, app)).toBe(true);
    expect(sameOwner('author', who)).toBe(true);
    expect(sameOwner('someone', who)).toBe(false);
    expect(sameOwner('app:123456', app)).toBe(true);
    expect(sameOwner('app:Iv23abc', app)).toBe(true);
    expect(sameOwner('app:Iv23other', app)).toBe(false);
    expect(sameOwner('app:123456', who)).toBe(false);
    expect(sameOwner(undefined, who)).toBe(true);
    expect(sameOwner('', who)).toBe(true);
  });
  // FR-GH-01, NFR-SEC-10: what came back, from the address or pasted; taken only by the flow started here, in the hour
  test('returnOf and startedHere: the address or 「state.code」; the same state within the hour only', () => {
    expect(returnOf('https://novel-desk.github.io/?code=abc123&state=s-1_x')).toEqual({ code: 'abc123', state: 's-1_x' });
    expect(returnOf('  s-1_x.abc123\n')).toEqual({ code: 'abc123', state: 's-1_x' });
    expect(returnOf('https://novel-desk.github.io/?code=abc123')).toBeNull();
    expect(returnOf('https://novel-desk.github.io/?state=s')).toBeNull();
    expect(returnOf('https://novel-desk.github.io/')).toBeNull();
    expect(returnOf('コードではない')).toBeNull();
    expect(returnOf('a.b.c')).toBeNull();
    const p = { state: 's1', at: 1000, seal: null };
    expect(startedHere(p, 's1', 1000 + HOUR - 1)).toBe(true);
    expect(startedHere(p, 's1', 1000 + HOUR)).toBe(false);
    expect(startedHere(p, 's2', 1000)).toBe(false);
    expect(startedHere(undefined, 's1', 1000)).toBe(false);
  });
  // FR-GH-01: the commits' author proposed from the latest commit, or the account's noreply address
  test('authorOf: the latest commit’s author; none, the account; neither, nothing', () => {
    const account = { login: 'author', id: 42 };
    const commits = [
      { commit: { author: { name: '試験の作者', email: 'author@example.invalid', date: 'x' } } },
      { commit: { author: { name: 'b', email: 'b@x' } } },
    ];
    expect(authorOf(commits, account)).toEqual({ name: '試験の作者', email: 'author@example.invalid' });
    expect(authorOf([], account)).toEqual({ name: 'author', email: '42+author@users.noreply.github.com' });
    expect(authorOf([{ commit: { author: { name: '名前だけ' } } }], account)).toEqual({ name: 'author', email: '42+author@users.noreply.github.com' });
    expect(authorOf([{ commit: { author: { email: 'a@x' } } }], undefined)).toBeNull();
    expect(authorOf([{}], undefined)).toBeNull();
  });
  // DESK-SEC-01: how the App's key is kept: encrypted with a passkey's PRF; as it is without PRF (no passkey); as it
  // is by the version before with a passkey ('old'); by the version before without one, as 'local' is
  test('appFormOf: prf, local, the version before’s with a passkey old, without one local', () => {
    const id = new Uint8Array([1]);
    expect(appFormOf({ kind: 'prf', credentialId: id })).toBe('prf');
    expect(appFormOf({ kind: 'local' })).toBe('local');
    expect(appFormOf({ kind: 'local', credentialId: id })).toBe('local');
    expect(appFormOf({ credentialId: id })).toBe('old');
    expect(appFormOf({ credentialId: null })).toBe('local');
    expect(appFormOf({})).toBe('local');
  });
});
