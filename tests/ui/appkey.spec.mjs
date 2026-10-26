// GitHub App の秘密鍵 (FR-GH-01, NFR-SEC-15, NFR-SEC-16): a GitHub App's private key in place of a token, kept when
// the App is made from the first screen (GitHub App を作って始める; the flow itself in manifest.spec.mjs). The key is
// made by the fake GitHub for the test (never a real one); it checks the App's JWTs with its public key, gives its
// installation tokens for a while, and takes them until they end or are revoked
import { createPrivateKey, generateKeyPairSync, verify } from 'node:crypto';
import {
  test,
  expect,
  noPasskey,
  answering,
  keepMoreOpen,
  keptAppForm,
  otherAnswers,
  signingKeys,
  watchSigningKeys,
  openImport,
  openRepo,
  openWork,
  toSettings,
  passkeyNames,
  persistAsked,
  stored,
  today,
  FakeRepo,
  watchPasskeyNames,
  watchPersist,
} from './lib/test.mjs';

const APP_ID = '123456';
const AUTHOR = { name: '試験の作者', email: 'author@example.invalid' };

// an App on the fake GitHub, installed on the author's repositories, for a key kept by the version before (keepOld);
// its private key as GitHub gives it (PKCS#1)
/** @param {import('./lib/fake-github.mjs').FakeGitHub} gh @param {string[]} [repos] */
function oldApp(gh, repos = ['author/novel', 'author/other']) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  gh.app = { id: APP_ID, publicKey, installations: [{ id: 7, account: 'author', repos }] };
  return privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
}
// the App made from the first screen (GitHub App を作って始める) on the fake GitHub's pages, installed there on `repos`
/** @param {import('@playwright/test').Page} page @param {import('./lib/fake-github.mjs').FakeGitHub} gh @param {string[]} [repos] */
async function startApp(page, gh, repos = ['author/novel']) {
  gh.installRepos = repos;
  await keepMoreOpen(page);
  await page.goto('./');
  await page.getByRole('button', { name: 'GitHub App を作って始める' }).click();
}
// the private key of the App made last, as GitHub gave it (PKCS#1)
/** @param {import('./lib/fake-github.mjs').FakeGitHub} gh */
const pemOf = gh => /** @type {{ pem: string }} */ ([...gh.codes.values()].at(-1)).pem;
// the App made: its Client ID (its ID kept, as GitHub gives it with the key)
const CLIENT_ID = 'Iv23testclient1';
/** @param {import('@playwright/test').Page} page what the vault keeps of the App's key, and whether it can be taken out */
const keptKey = page =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('novel-writer-js');
        req.onsuccess = () => {
          const get = req.result.transaction('vault').objectStore('vault').get('app');
          get.onsuccess = async () => {
            const v = get.result;
            if (!v) return resolve(null);
            const out = await crypto.subtle.exportKey('pkcs8', v.key).then(
              () => 'exported',
              e => e.name,
            );
            resolve({ extractable: v.key.extractable, usages: v.key.usages, out, author: v.author, appId: v.appId });
          };
        };
        req.onerror = () => reject(req.error);
      }),
  );
/** @param {import('./lib/fake-github.mjs').FakeGitHub} gh */
const tokensAsked = gh => gh.calls.filter(c => /^POST \/app\/installations\/\d+\/access_tokens$/.test(c)).length;

// FR-GH-01, NFR-SEC-15, NFR-SEC-16: kept as a key that cannot be taken out; the repositories it is installed on
// offered; the commits written as the author; opened again without asking (no passkey here); gone on logging out
test('started with the App’s private key: kept so that it cannot be taken out; its repositories; commits by the author; gone on logging out', async ({
  page,
  gh,
  work,
}) => {
  gh.installationPerPage = 1;
  await noPasskey(page);
  await watchPersist(page);
  await startApp(page, gh, ['author/novel', 'author/other']);
  await expect(page.locator('#shelf')).toBeVisible();
  // (the browser asked once to keep this device's store for good)
  expect(await persistAsked(page)).toBe(1);
  await toSettings(page);
  await expect(page.locator('#gh-help')).toHaveText(
    /PRF に対応していないため、GitHub App の秘密鍵は暗号化せず、この端末の取り出せない鍵.*パスキーは使いません/,
  );
  await page.getByRole('button', { name: '‹ 戻る' }).click();
  // (whose the commits are: not known until a work is opened)
  expect(await keptKey(page)).toEqual({ extractable: false, usages: ['sign'], out: 'InvalidAccessError', author: null, appId: CLIENT_ID });
  // the key's text kept nowhere
  const body = pemOf(gh).split('\n')[5];
  const all = JSON.stringify(await Promise.all(['vault', 'drafts', 'snapshots', 'prefs', 'blobs'].map(s => stored(page, s))));
  expect(all).not.toContain(body);
  // the repositories it is installed on (every page), offered by name
  await openImport(page);
  await expect
    .poll(() => page.locator('#repo-options option').evaluateAll(o => o.map(x => /** @type {HTMLOptionElement} */ (x).value)))
    .toEqual(['author/novel', 'author/other']);
  await openRepo(page, 'author/novel');
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await page.locator('#body').fill('# 第1話 はじまり\n\nApp で書いた\n');
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/01_first.md')).toBe('# 第1話 はじまり\n\nApp で書いた\n');
  expect(gh.written.at(-1)).toEqual({ author: AUTHOR, committer: AUTHOR });
  // one installation token for all of it, asked for with a JWT GitHub took
  expect(tokensAsked(gh)).toBe(1);
  // opened again: straight in
  await page.reload();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  // logged out: the key gone with the token's place
  page.once('dialog', d => void d.accept());
  await toSettings(page);
  await page.getByRole('button', { name: 'ログアウト' }).click();
  await expect(page.locator('#setup')).toBeVisible();
  expect(await keptKey(page)).toBeNull();
  expect(await stored(page, 'vault')).toEqual([]);
});

// FR-GH-01: the installation's token asked for again before it ends, and when GitHub refuses it; refused again: said,
// with what to do with the App
test('the installation’s token: asked for again before it ends and when refused; refused again, said', async ({ page, gh, work }) => {
  // (each token for 4 minutes: under the 5 the app keeps as a margin, so each request asks for a new one)
  gh.appTokenLife = 4 * 60000;
  await noPasskey(page);
  await startApp(page, gh);
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await page.getByRole('button', { name: 'これでよい' }).click();
  const before = tokensAsked(gh);
  await page.locator('#reload-work').click();
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  expect(tokensAsked(gh)).toBeGreaterThan(before);
  // an hour each; revoked on GitHub: refused once, asked for again, and the work read as before
  gh.appTokenLife = 3600000;
  await page.locator('#reload-work').click();
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  gh.appTokens.clear();
  const asked = tokensAsked(gh);
  await page.locator('#body').fill('# 第1話 はじまり\n\n取り消されたあとに\n');
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(tokensAsked(gh)).toBe(asked + 1);
  await expect(page.locator('#token-notice')).toBeHidden();
  // tokens GitHub refuses at once (the App's key deleted, say): said, without the token's way
  gh.appTokenLife = 0;
  gh.appTokens.clear();
  await page.locator('#reload-work').click();
  await expect(page.locator('#token-notice-text')).toHaveText(
    /^GitHub が GitHub App のトークンを断りました.*ログアウトしてから「GitHub App を作って始める」で App を作り直してください/,
  );
  await expect(page.locator('#token-notice-token')).toBeHidden();
});

// FR-GH-01, NFR-USE-01: a repository of an owner the App is not installed on (listed on its installation): said, not
// opened
test('a repository it is not on: said; not opened', async ({ page, gh }) => {
  const tools = new FakeRepo('someone/tools', { 'README.md': '# 道具\n' });
  tools.id = ++gh.ids;
  gh.repos.set('someone/tools', tools);
  await noPasskey(page);
  await startApp(page, gh, ['author/novel', 'someone/tools']);
  await expect(page.locator('#shelf')).toBeVisible();
  await openRepo(page, 'someone/tools');
  // (not opened: the list of works again, said, as the server version's)
  await expect(page.locator('#toast')).toHaveText(/^作品を開けませんでした: このリポジトリには GitHub App が入っていません/);
});

// NFR-SEC-16: the drafts a token's user left on this device: an App of the same account (by the account's number) is
// the same person, nothing asked, the drafts kept; an App of another account: asked, and the key not kept unless the
// drafts are deleted
test('drafts left by a token’s user: the same account’s App, its own; another account’s, not deleted unless asked, the key not kept then', async ({
  page,
  gh,
}) => {
  await openWork(page);
  await page.locator('#body').fill('# 第1話 はじまり\n\n前のユーザー\n');
  await expect.poll(async () => (await stored(page, 'drafts')).length).toBe(1);
  // (logged out, the drafts kept; then asked whether to delete them: no)
  /** @type {string[]} */
  const asked = [];
  const answers = [false, false];
  page.on('dialog', d => {
    asked.push(d.message());
    void (answers.shift() ? d.accept() : d.dismiss());
  });
  await toSettings(page);
  await page.getByRole('button', { name: 'ログアウト' }).click();
  await expect(page.locator('#setup')).toBeVisible();
  gh.makeOwner = 'someone';
  await startApp(page, gh);
  await expect(page.locator('#app-make-error')).toHaveText(/前のユーザーの書きかけを残すため、この GitHub Appを保管しませんでした/);
  expect(asked).toHaveLength(2);
  expect(await keptKey(page)).toBeNull();
  expect(await stored(page, 'drafts')).toHaveLength(1);
  // the token's user's own App (the token's user kept by number)
  gh.makeOwner = 'author';
  await startApp(page, gh, ['author/novel', 'author/other']);
  await expect(page.locator('#shelf')).toBeVisible();
  expect(asked).toHaveLength(2);
  expect(await keptKey(page)).not.toBeNull();
  await openRepo(page, 'author/novel');
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\n前のユーザー\n');
});

// NFR-SEC-16: GitHub not saying whose the App is (its /app not answered): kept as before, whose the drafts are not
// noted
test('whose the App is not said by GitHub: the key kept, whose the drafts are not noted', async ({ page, gh }) => {
  await noPasskey(page);
  await page.route('https://api.github.com/app', route =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 500, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: '{"message":"test"}' })
      : route.fallback(),
  );
  await startApp(page, gh, ['author/novel', 'author/other']);
  await expect(page.locator('#shelf')).toBeVisible();
  expect(await keptKey(page)).not.toBeNull();
  expect(await stored(page, 'prefs')).not.toContain(1001);
});

// An App's key kept as the version before kept it (DESK-SEC-01): WebCrypto's key that cannot be taken out, as it is,
// with the credential ID of a passkey made for it (null: none); the page loaded again then
/** @param {import('@playwright/test').Page} page @param {string} pem @param {boolean} passkey */
async function keepOld(page, pem, passkey) {
  await page.goto('./');
  await expect(page.locator('#setup')).toBeVisible();
  const der = [...createPrivateKey(pem).export({ type: 'pkcs8', format: 'der' })];
  await page.evaluate(async ([der, appId, author, passkey]) => {
    const key = await crypto.subtle.importKey('pkcs8', new Uint8Array(der), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const rand = (/** @type {number} */ n) => crypto.getRandomValues(new Uint8Array(n));
    let credentialId = null;
    if (passkey) {
      const cred = /** @type {PublicKeyCredential} */ (
        await navigator.credentials.create({
          publicKey: {
            rp: { id: location.hostname, name: 'Novel Desk' },
            user: { id: rand(16), name: 'Novel Desk GitHub App', displayName: 'Novel Desk GitHub App' },
            challenge: rand(32),
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
            authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
          },
        })
      );
      credentialId = new Uint8Array(cred.rawId);
    }
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('novel-writer-js');
      req.onsuccess = () => {
        const tx = req.result.transaction('vault', 'readwrite');
        tx.objectStore('vault').put({ appId, key, author, credentialId }, 'app');
        tx.oncomplete = () => resolve(null);
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, /** @type {const} */ ([der, APP_ID, AUTHOR, passkey]));
  await page.reload();
}
// the App's private key in PKCS#8 (DER, hex), as 16-byte pieces: none of them is to be found in what is kept
/** @param {string} pem */
const pieces = pem => {
  const der = createPrivateKey(pem).export({ type: 'pkcs8', format: 'der' });
  const out = [];
  for (let i = 0; i + 16 <= der.length; i += 16) out.push(der.subarray(i, i + 16).toString('hex'));
  return out;
};

// DESK-SEC-01: one kept by the version before without a passkey (a browser without passkeys): opened at once, as one
// kept without PRF now is, and the settings say so
test('DESK-SEC-01: the App’s key kept by the version before without a passkey: opened at once; the settings say it is not encrypted', async ({ page, gh }) => {
  const pem = oldApp(gh);
  await noPasskey(page);
  await keepOld(page, pem, false);
  await expect(page.locator('#shelf')).toBeVisible();
  await toSettings(page);
  await expect(page.locator('#gh-help')).toHaveText(/GitHub App の秘密鍵は暗号化せず.*パスキーは使いません/);
});

test.describe('with a passkey', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebKit has no virtual authenticator');
  /** @param {import('@playwright/test').Page} page @param {boolean} verified @param {boolean} [hasPrf] */
  async function authenticator(page, verified, hasPrf = true) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: verified,
        hasPrf,
        automaticPresenceSimulation: true,
      },
    });
  }
  // DESK-SEC-01, NFR-SEC-15: kept encrypted with a key from its passkey's PRF output: neither the key (WebCrypto's)
  // nor its PKCS#8 bytes nor the .pem's text kept anywhere. Opened each time with the passkey, into a key that cannot
  // be taken out and that signs (GitHub takes its JWT); the passkey refused: said, not opened
  test('DESK-SEC-01: with PRF, the App’s key kept encrypted (no key, PKCS#8 or PEM kept); opened with its passkey each time into a key that cannot be taken out, that signs', async ({
    page,
    gh,
  }) => {
    await otherAnswers(page);
    await authenticator(page, true);
    await watchPasskeyNames(page);
    await watchSigningKeys(page);
    await startApp(page, gh, ['author/novel', 'author/other']);
    // (back from installing it: opened with the passkey)
    await page.getByRole('button', { name: 'パスキーで開く' }).click();
    await expect(page.locator('#shelf')).toBeVisible();
    const pem = pemOf(gh);
    await toSettings(page);
    await expect(page.locator('#gh-help')).toHaveText(
      'GitHub App の秘密鍵はパスキー（PRF）から作った鍵で暗号化して、この端末に置いています。開くたびにパスキーを使います。',
    );
    // (the passkey called, in the passwords' list, by what it opens and the day it was made)
    expect(await passkeyNames(page)).toEqual([`Novel Desk GitHub App ${today()}`]);
    // kept: the credential ID, the salt, the iv and the encrypted bytes only; no WebCrypto key anywhere
    const kept = /** @type {NonNullable<Awaited<ReturnType<typeof keptAppForm>>>} */ (await keptAppForm(page));
    expect(kept.kind).toBe('prf');
    expect(kept.fields).toEqual(['appId', 'author', 'credentialId', 'data', 'iv', 'kind', 'salt', 'slug']);
    expect(kept.cryptoKeys).toBe(0);
    expect(kept.data.length).toBeGreaterThan(1000);
    for (const piece of pieces(pem)) expect(kept.data).not.toContain(piece);
    const all = JSON.stringify(await Promise.all(['vault', 'drafts', 'snapshots', 'prefs', 'blobs'].map(s => stored(page, s))));
    for (const line of pem.split('\n').slice(1, -2)) expect(all).not.toContain(line);
    expect(all).not.toContain('PRIVATE KEY');
    // opened again: the passkey; the key made from what it decrypts cannot be taken out, and signs
    await page.reload();
    await expect(page.locator('#unlock-note')).toHaveText(/暗号化して.*開くたびにパスキーを使います/);
    await answering(page, 'nw-get', 'cancel');
    await page.getByRole('button', { name: 'パスキーで開く' }).click();
    await expect(page.locator('#unlock-error')).toHaveText('パスキーで開けませんでした（取り消されたか、時間切れです）');
    await answering(page, 'nw-get', '');
    await page.getByRole('button', { name: 'パスキーで開く' }).click();
    await expect(page.locator('#shelf')).toBeVisible();
    const key = await signingKeys(page, 'DESK-SEC-01');
    expect([key.count, key.extractable, key.usages, key.out]).toEqual([1, false, ['sign'], 'InvalidAccessError']);
    expect(verify('sha256', Buffer.from('DESK-SEC-01'), /** @type {NonNullable<typeof gh.app>} */ (gh.app).publicKey, Buffer.from(key.sig, 'hex'))).toBe(true);
    // (the repositories read with it: GitHub took the JWT it signed)
    await openRepo(page, 'author/novel');
    await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  });
  // DESK-SEC-01, NFR-USE-01: the passkey not opening the App's key: why, in the token's words; another passkey's PRF
  // output (the key from it opens nothing): said; opened once the passkey answers
  test('DESK-SEC-01: the passkey not opening the App’s key: said as for the token; another passkey: not decrypted; opened once it answers', async ({
    page,
    gh,
  }) => {
    await otherAnswers(page);
    await authenticator(page, true);
    await startApp(page, gh, ['author/novel', 'author/other']);
    await page.getByRole('button', { name: 'パスキーで開く' }).click();
    await expect(page.locator('#shelf')).toBeVisible();
    await page.reload();
    for (const [how, said] of [
      ['cancel', 'パスキーで開けませんでした（取り消されたか、時間切れです）'],
      ['error', 'パスキーを使えません（TypeError）'],
      ['string', 'パスキーを使えません（test）'],
      ['none', 'パスキーが PRF の値を返しませんでした'],
      ['other', 'GitHub App の秘密鍵を復号できませんでした（作ったときと違うパスキーかもしれません）'],
    ]) {
      await answering(page, 'nw-get', how);
      await page.getByRole('button', { name: 'パスキーで開く' }).click();
      await expect(page.locator('#unlock-error')).toHaveText(said);
    }
    await answering(page, 'nw-get', '');
    await page.getByRole('button', { name: 'パスキーで開く' }).click();
    await expect(page.locator('#shelf')).toBeVisible();
  });
  // DESK-SEC-01: an authenticator without PRF: the key that cannot be taken out kept as it is, no passkey; the
  // settings say it is not encrypted; opened again at once
  test('DESK-SEC-01: an authenticator without PRF: the key kept as it is, not encrypted, and the screen says so', async ({ page, gh }) => {
    await authenticator(page, true, false);
    await startApp(page, gh, ['author/novel', 'author/other']);
    await expect(page.locator('#shelf')).toBeVisible();
    await toSettings(page);
    await expect(page.locator('#gh-help')).toHaveText(
      'このブラウザーはパスキーの PRF に対応していないため、GitHub App の秘密鍵は暗号化せず、この端末の取り出せない鍵（WebCrypto）として置いています。パスキーは使いません。この端末でこのブラウザーを開ける人は、作品を読み書きできます。',
    );
    const kept = await keptAppForm(page);
    expect([kept?.kind, kept?.fields, kept?.cryptoKeys]).toEqual(['local', ['appId', 'author', 'key', 'kind', 'slug'], 1]);
    expect(await keptKey(page)).toEqual({ extractable: false, usages: ['sign'], out: 'InvalidAccessError', author: null, appId: CLIENT_ID });
    await page.reload();
    await expect(page.locator('#shelf')).toBeVisible();
  });
  // DESK-SEC-01: one kept by the version before with a passkey (not encrypted; it cannot be now): opened with the
  // passkey as before, the refusal said in the token's words; that it is not encrypted, and what to do, said in the
  // settings only (not on opening it, nor in a toast)
  test('DESK-SEC-01: the App’s key kept by the version before: opened with its passkey as before; the settings only say it is not encrypted and how to have it so', async ({
    page,
    gh,
  }) => {
    const pem = oldApp(gh);
    await otherAnswers(page);
    await authenticator(page, true);
    await keepOld(page, pem, true);
    await expect(page.locator('#unlock-note')).toHaveText('GitHub App の秘密鍵は、開くたびにパスキーを使います。');
    for (const [how, said] of [
      ['cancel', 'パスキーで開けませんでした（取り消されたか、時間切れです）'],
      ['error', 'パスキーを使えません（TypeError）'],
    ]) {
      await answering(page, 'nw-get', how);
      await page.getByRole('button', { name: 'パスキーで開く' }).click();
      await expect(page.locator('#unlock-error')).toHaveText(said);
    }
    await answering(page, 'nw-get', '');
    await page.getByRole('button', { name: 'パスキーで開く' }).click();
    await expect(page.locator('#shelf')).toBeVisible();
    await expect(page.locator('#toast')).not.toHaveText(/暗号化/);
    await toSettings(page);
    await expect(page.locator('#gh-help')).toHaveText(
      'GitHub App の秘密鍵は暗号化されていません（前の版で、この端末の取り出せない鍵として置いたものです。開くたびにパスキーを使います）。ログアウトしてから「GitHub App を作って始める」で App を作り直すと、パスキーで暗号化して保存します。前の App は、GitHub の Settings → Developer settings → GitHub Apps で消してください。',
    );
    // (kept as it was)
    expect((await keptAppForm(page))?.fields).toEqual(['appId', 'author', 'credentialId', 'key']);
  });
});
