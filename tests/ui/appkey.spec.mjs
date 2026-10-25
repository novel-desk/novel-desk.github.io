// GitHub App の秘密鍵で始める (FR-GH-01, NFR-SEC-15, NFR-SEC-16): a GitHub App's private key in place of a token.
// The key is made here for the test (never a real one); the fake GitHub checks the App's JWTs with its public key,
// gives its installation tokens for a while, and takes them until they end or are revoked
import { generateKeyPairSync } from 'node:crypto';
import {
  test,
  expect,
  noPasskey,
  keepMoreOpen,
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

// the App on the fake GitHub, installed on the author's repositories; its private key as GitHub gives it (PKCS#1)
/** @param {import('./lib/fake-github.mjs').FakeGitHub} gh @param {string[]} [repos] */
function makeApp(gh, repos = ['author/novel', 'author/other']) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  gh.app = { id: APP_ID, publicKey, installations: [{ id: 7, account: 'author', repos }] };
  return privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
}
// the App's key put in on the first screen
/** @param {import('@playwright/test').Page} page @param {string} pem @param {{ id?: string, name?: string }} [o] */
async function putKey(page, pem, { id = APP_ID, name = 'novel-desk.private-key.pem' } = {}) {
  await keepMoreOpen(page);
  await page.goto('./');
  await page.getByText('鍵のファイルがあるとき').click();
  await page.locator('#app-id').fill(id);
  await page.locator('#app-key').setInputFiles({ name, mimeType: 'application/x-pem-file', buffer: Buffer.from(pem) });
  await page.locator('#app-name').fill(AUTHOR.name);
  await page.locator('#app-email').fill(AUTHOR.email);
  await page.locator('#keep-app').click();
}
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
const tokensAsked = gh => gh.calls.filter(c => /^POST \/app\/installations\/7\/access_tokens$/.test(c)).length;

// FR-GH-01, NFR-SEC-15, NFR-SEC-16: kept as a key that cannot be taken out; the repositories it is installed on
// offered; the commits written as the author; opened again without asking (no passkey here); gone on logging out
test('started with the App’s private key: kept so that it cannot be taken out; its repositories; commits by the author; gone on logging out', async ({
  page,
  gh,
  work,
}) => {
  const pem = makeApp(gh);
  gh.installationPerPage = 1;
  await noPasskey(page);
  await watchPersist(page);
  await putKey(page, pem);
  await expect(page.locator('#toast')).toHaveText('パスキーに対応していないため、パスキーなしで保管しました');
  // (the browser asked once to keep this device's store for good)
  expect(await persistAsked(page)).toBe(1);
  await toSettings(page);
  await expect(page.locator('#gh-help')).toHaveText(/GitHub App の秘密鍵は、この端末の取り出せない鍵.*パスキーは使いません/);
  await page.getByRole('button', { name: '‹ 戻る' }).click();
  expect(await keptKey(page)).toEqual({ extractable: false, usages: ['sign'], out: 'InvalidAccessError', author: AUTHOR, appId: APP_ID });
  // the file's content kept nowhere
  const body = pem.split('\n')[5];
  const all = JSON.stringify(await Promise.all(['vault', 'drafts', 'snapshots', 'prefs', 'blobs'].map(s => stored(page, s))));
  expect(all).not.toContain(body);
  await expect(page.locator('#app-id')).toHaveValue('');
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
  const pem = makeApp(gh);
  // (each token for 4 minutes: under the 5 the app keeps as a margin, so each request asks for a new one)
  gh.appTokenLife = 4 * 60000;
  await noPasskey(page);
  await putKey(page, pem);
  await openRepo(page, 'author/novel');
  // (opened from the import)
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
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
  await expect(page.locator('#token-notice-text')).toHaveText(/^GitHub が GitHub App のトークンを断りました.*秘密鍵を作り直し、ログアウトしてから/);
  await expect(page.locator('#token-notice-token')).toBeHidden();
});

// FR-GH-01, NFR-USE-01: a file that is not a key, a wrong App ID, an App on no repository, a repository of an owner it
// is not installed on: said, nothing kept
test('not a key, a wrong App ID, installed nowhere, a repository it is not on: said; nothing kept', async ({ page, gh }) => {
  const pem = makeApp(gh, []);
  await noPasskey(page);
  await putKey(page, 'これは鍵ではありません\n', { name: 'note.pem' });
  await expect(page.locator('#app-error')).toHaveText(/^GitHub App の秘密鍵（\.pem）ではありません/);
  await putKey(page, pem, { id: '999' });
  await expect(page.locator('#app-error')).toHaveText(/^GitHub App として GitHub に入れませんでした（App ID か秘密鍵が違うかもしれません）/);
  await putKey(page, pem);
  await expect(page.locator('#app-error')).toHaveText(/^この GitHub App は、どのリポジトリにも入っていません/);
  expect(await keptKey(page)).toBeNull();
  // installed on the author's account, with a repository listed that is another owner's
  const tools = new FakeRepo('someone/tools', { 'README.md': '# 道具\n' });
  tools.id = ++gh.ids;
  gh.repos.set('someone/tools', tools);
  /** @type {NonNullable<typeof gh.app>} */ (gh.app).installations[0].repos = ['author/novel', 'someone/tools'];
  await putKey(page, pem);
  await openRepo(page, 'someone/tools');
  // (opened from the import)
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
  const pem = makeApp(gh);
  /** @type {NonNullable<typeof gh.app>} */ (gh.app).owner = 'someone';
  await putKey(page, pem);
  await expect(page.locator('#app-error')).toHaveText(/^前のユーザーの書きかけを残すため、この秘密鍵を保管しませんでした/);
  expect(asked).toHaveLength(2);
  expect(await keptKey(page)).toBeNull();
  expect(await stored(page, 'drafts')).toHaveLength(1);
  // the token's user's own App (its number typed, where the token's user is kept by number)
  /** @type {NonNullable<typeof gh.app>} */ (gh.app).owner = 'author';
  await putKey(page, pem);
  await expect(page.locator('#shelf')).toBeVisible();
  expect(asked).toHaveLength(2);
  expect(await keptKey(page)).not.toBeNull();
  await openRepo(page, 'author/novel');
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\n前のユーザー\n');
});

// NFR-SEC-16: GitHub not saying whose the App is (its /app not answered): kept as before, whose the drafts are not
// noted
test('whose the App is not said by GitHub: the key kept, whose the drafts are not noted', async ({ page, gh }) => {
  const pem = makeApp(gh);
  await noPasskey(page);
  await page.route('https://api.github.com/app', route =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 500, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: '{"message":"test"}' })
      : route.fallback(),
  );
  await putKey(page, pem);
  await expect(page.locator('#shelf')).toBeVisible();
  expect(await keptKey(page)).not.toBeNull();
  expect(await stored(page, 'prefs')).not.toContain(1001);
});

// NFR-SEC-16: drafts kept before the account's number was (by 「app:」 and the Client ID of the App made by the
// manifest flow): the same App's key put in with its number (its App ID) is the same person, nothing asked
test('drafts kept by the App’s Client ID before: its key put in with its App ID, the same person', async ({ page, gh }) => {
  const pem = makeApp(gh);
  /** @type {NonNullable<typeof gh.app>} */ (gh.app).appId = Number(APP_ID);
  /** @type {NonNullable<typeof gh.app>} */ (gh.app).id = 'Iv23keyclient';
  await noPasskey(page);
  await page.goto('./');
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('novel-writer-js');
        req.onsuccess = () => {
          const tx = req.result.transaction(['prefs', 'drafts'], 'readwrite');
          tx.objectStore('prefs').put('app:Iv23keyclient', 'owner');
          tx.objectStore('drafts').put(
            { repo: 'author/novel', path: 'chapters/01_first.md', base: '', text: '書きかけ', at: 1 },
            'author/novel\nchapters/01_first.md',
          );
          tx.oncomplete = () => resolve(null);
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
  /** @type {string[]} */
  const asked = [];
  page.on('dialog', d => {
    asked.push(d.message());
    void d.dismiss();
  });
  await putKey(page, pem, { id: APP_ID });
  await expect(page.locator('#shelf')).toBeVisible();
  expect(asked).toEqual([]);
  expect(await keptKey(page)).not.toBeNull();
});

test.describe('with a passkey', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebKit has no virtual authenticator');
  /** @param {import('@playwright/test').Page} page @param {boolean} verified */
  async function authenticator(page, verified) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: verified,
        automaticPresenceSimulation: true,
      },
    });
    return { cdp, authenticatorId };
  }
  // NFR-SEC-15: opened with the passkey made for it; the passkey refused: said, not opened
  test('the App’s key opened with its passkey each time; refused: said', async ({ page, gh }) => {
    const pem = makeApp(gh);
    const { cdp, authenticatorId } = await authenticator(page, true);
    await watchPasskeyNames(page);
    await putKey(page, pem);
    await toSettings(page);
    await expect(page.locator('#gh-help')).toHaveText(
      'GitHub App の秘密鍵は、この端末の取り出せない鍵（WebCrypto）として置いています。開くたびにパスキーを使います。',
    );
    // (the passkey called, in the passwords' list, by what it opens and the day it was made)
    expect(await passkeyNames(page)).toEqual([`Novel Desk GitHub App ${today()}`]);
    await page.reload();
    await expect(page.locator('#unlock-note')).toHaveText(/開くたびにパスキーを使います/);
    await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: false });
    await page.getByRole('button', { name: 'パスキーで開く' }).click();
    await expect(page.locator('#unlock-error')).toHaveText(/^パスキーで開けませんでした（NotAllowedError）/);
    await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: true });
    await page.getByRole('button', { name: 'パスキーで開く' }).click();
    await expect(page.locator('#shelf')).toBeVisible();
  });
  // NFR-SEC-15: the passkey not made: nothing kept
  test('the passkey not made for the App’s key: said, nothing kept', async ({ page, gh }) => {
    const pem = makeApp(gh);
    await authenticator(page, false);
    await putKey(page, pem);
    await expect(page.locator('#app-error')).toHaveText(/^パスキーが作られませんでした（NotAllowedError）/);
    expect(await keptKey(page)).toBeNull();
  });
});
