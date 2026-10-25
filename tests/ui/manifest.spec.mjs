// GitHub App を作って始める (FR-GH-01, NFR-SEC-05, NFR-SEC-10, NFR-SEC-11, NFR-SEC-16): one button posts the App's
// manifest to GitHub; the fake GitHub makes the App (a key made for the test, never a real one), comes back with the
// code and the state, and, on the page of installing it, installs it and comes back again
import { test, expect, noPasskey, persistAsked, stored, FakeRepo, watchPersist } from './lib/test.mjs';
import { manifestOf } from '../../lib/appkey.js';

const AUTHOR = { name: '試験の作者', email: 'author@example.invalid' };

/** @param {import('@playwright/test').Page} page what the vault keeps of the App, and whether its key can be taken out */
const keptApp = page =>
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
            resolve({
              extractable: v.key.extractable,
              usages: v.key.usages,
              out,
              appId: v.appId,
              slug: v.slug,
              author: v.author,
              passkey: Boolean(v.credentialId),
            });
          };
        };
        req.onerror = () => reject(req.error);
      }),
  );
// every text this origin keeps (IndexedDB's stores, localStorage, sessionStorage), and the longest bytes it keeps
/** @param {import('@playwright/test').Page} page @returns {Promise<{ texts: string, bytes: number }>} */
const everything = page =>
  page.evaluate(async () => {
    /** @type {string[]} */
    const texts = [];
    let bytes = 0;
    /** @param {any} x */
    const walk = x => {
      if (typeof x === 'string') texts.push(x);
      else if (ArrayBuffer.isView(x) || x instanceof ArrayBuffer) bytes = Math.max(bytes, x.byteLength);
      else if (x && typeof x === 'object' && !(x instanceof CryptoKey)) for (const v of Object.values(x)) walk(v);
    };
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('novel-writer-js');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    for (const name of db.objectStoreNames) {
      const all = await new Promise(resolve => {
        const get = db.transaction(name).objectStore(name).getAll();
        get.onsuccess = () => resolve(get.result);
      });
      walk(all);
    }
    for (const s of [localStorage, sessionStorage]) for (let i = 0; i < s.length; i++) texts.push(String(s.key(i)), String(s.getItem(String(s.key(i)))));
    return { texts: texts.join('\n'), bytes };
  });
/** @param {import('./lib/fake-github.mjs').FakeGitHub} gh */
const conversions = gh => gh.calls.filter(c => c.startsWith('POST /app-manifests/'));
/** @param {import('@playwright/test').Page} page */
const makeApp = page => page.getByRole('button', { name: 'GitHub App を作って始める' }).click();
/** @param {import('@playwright/test').Page} page */
const inFront = page => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

// FR-GH-01, NFR-SEC-05, NFR-SEC-08, NFR-SEC-10, NFR-SEC-11: the manifest posted with the state; the code turned into the App once;
// its key kept so that it cannot be taken out and its text nowhere; the address cleaned; GitHub's page of installing
// it; back, the one repository opened; the commits' author proposed from the latest commit, changed once
test('one button: the manifest and its state posted; the key kept, not extractable, its text nowhere; installed; back, the work opened; the author proposed', async ({
  page,
  gh,
  work,
  baseURL,
}) => {
  await noPasskey(page);
  await watchPersist(page);
  await page.goto('./');
  // (NFR-SEC-08: the one form the page may send goes to github.com; the rest of the policy as strict as before)
  expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).toBe(
    "default-src 'self'; script-src 'self'; style-src 'self'; connect-src https://api.github.com; img-src 'self' blob: data:; object-src 'none'; base-uri 'none'; form-action https://github.com",
  );
  await makeApp(page);
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  // the manifest: the app's address, no webhook, private, Contents and Metadata; a state of its own
  expect(gh.manifests).toHaveLength(1);
  const { manifest, state } = gh.manifests[0];
  // (the kind of device and the day it is made, then the random end: told apart on GitHub's list of Apps)
  expect(manifest.name).toMatch(/^Novel Desk (?:(?:iPhone|iPad|Mac|Windows|Android|Linux) )?\d{4} [0-9a-z]{6}$/);
  expect(manifest).toEqual(manifestOf(/** @type {string} */ (baseURL), manifest.name));
  expect(state).toMatch(/^[\w-]{32}$/);
  // the code turned into the App once, then GitHub's page of installing it, then back with the installation
  expect(conversions(gh)).toEqual(['POST /app-manifests/testcode100000000/conversions']);
  const slug = manifest.name.toLowerCase().replace(/ /g, '-');
  expect(gh.installPages).toEqual([`/apps/${slug}/installations/new`]);
  expect(page.url()).toBe(baseURL);
  // (the key kept: the browser asked to keep this device's store for good, on the page that kept it)
  expect(await persistAsked(page)).toBe(1);
  // the key: cannot be taken out; nothing of the private key's text, nor the client secret, kept anywhere
  expect(await keptApp(page)).toEqual({
    extractable: false,
    usages: ['sign'],
    out: 'InvalidAccessError',
    appId: 'Iv23testclient1',
    slug,
    author: AUTHOR,
    passkey: false,
  });
  const pem = /** @type {{ pem: string }} */ (gh.codes.get('testcode100000000')).pem;
  const kept = await everything(page);
  for (const line of pem.split('\n').slice(1, -2)) expect(kept.texts).not.toContain(line);
  expect(kept.texts).not.toMatch(/PRIVATE KEY|test-client-secret-not-real|testcode1/);
  expect(kept.bytes).toBeLessThan(256);
  // the author proposed from the latest commit, shown before anything is sent; changed here
  await expect(page.locator('#author-notice')).toBeVisible();
  await expect(page.locator('#author-name')).toHaveValue(AUTHOR.name);
  await expect(page.locator('#author-email')).toHaveValue(AUTHOR.email);
  const changed = { name: '筆名', email: 'pen@example.invalid' };
  await page.locator('#author-name').fill(changed.name);
  await page.locator('#author-email').fill(changed.email);
  await page.getByRole('button', { name: 'これでよい' }).click();
  await expect(page.locator('#author-notice')).toBeHidden();
  await page.locator('#body').fill('# 第1話 はじまり\n\nApp を作って書いた\n');
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/01_first.md')).toBe('# 第1話 はじまり\n\nApp を作って書いた\n');
  expect(gh.written.at(-1)).toEqual({ author: changed, committer: changed });
  // opened again: straight in, the author not asked again
  await page.reload();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await expect(page.locator('#author-notice')).toBeHidden();
  expect((await keptApp(page))?.author).toEqual(changed);
});

// NFR-SEC-16: logged out with the drafts kept, the App made again (another App, the same account): the same person,
// by the account's number; nothing asked, the drafts kept and sent. An App made on another account: asked, and not
// kept unless the drafts are deleted
test('the App made again by the same account: the drafts its own, sent; made on another account: asked, not kept', async ({ page, gh, work }) => {
  await noPasskey(page);
  await page.goto('./');
  /** @type {string[]} */
  const asked = [];
  const answers = [true, false];
  page.on('dialog', d => {
    asked.push(d.message());
    void (answers.shift() ? d.accept() : d.dismiss());
  });
  await makeApp(page);
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await page.locator('#body').fill('# 第1話 はじまり\n\nApp を作り直す前の書きかけ\n');
  await expect.poll(async () => (await stored(page, 'drafts')).length).toBe(1);
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  await page.getByRole('button', { name: 'ログアウト' }).click();
  await expect(page.locator('#setup')).toBeVisible();
  expect(asked).toHaveLength(2);
  // made again: another App (another Client ID), on the same account
  await makeApp(page);
  await expect.poll(() => gh.installPages.length).toBe(2);
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\nApp を作り直す前の書きかけ\n');
  expect(asked).toHaveLength(2);
  expect((await keptApp(page))?.appId).toBe('Iv23testclient2');
  await page.getByRole('button', { name: 'これでよい' }).click();
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/01_first.md')).toBe('# 第1話 はじまり\n\nApp を作り直す前の書きかけ\n');
  // another account's App where drafts are left: asked; not deleted, not kept
  await page.locator('#body').fill('# 第1話 はじまり\n\n残す書きかけ\n');
  await expect.poll(async () => (await stored(page, 'drafts')).length).toBe(1);
  answers.push(true, false);
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  await page.getByRole('button', { name: 'ログアウト' }).click();
  await expect(page.locator('#setup')).toBeVisible();
  gh.makeOwner = 'someone';
  answers.push(false);
  await makeApp(page);
  await expect(page.locator('#app-make-error')).toHaveText(/前のユーザーの書きかけを残すため、この GitHub Appを保管しませんでした/);
  expect(asked.at(-1)).toMatch(/^この端末には、前のユーザーが GitHub に送っていない書きかけが 1 件残っています/);
  expect(await keptApp(page)).toBeNull();
  expect((await stored(page, 'drafts')).map(d => d.text)).toEqual(['# 第1話 はじまり\n\n残す書きかけ\n']);
});

// NFR-SEC-10: a code with another state, or with none: not taken (nothing asked of GitHub), the address cleaned; the
// code shown to paste where the flow was started; a wrong code pasted, refused; the field shown while a flow is waited for
test('a wrong or missing state: refused, nothing converted; the code shown to paste; a wrong paste refused', async ({ page, gh, baseURL }) => {
  await noPasskey(page);
  gh.createNow = false;
  await page.goto('./');
  await expect(page.locator('#app-paste-form')).toBeHidden();
  await makeApp(page);
  await expect(page.getByText('GitHub（試験の偽物）')).toBeVisible();
  await page.goto('./?code=testcode100000000&state=not-the-state');
  await expect(page.locator('#app-bridge')).toBeVisible();
  await expect(page.locator('#app-bridge-code')).toHaveValue('not-the-state.testcode100000000');
  expect(page.url()).toBe(baseURL);
  expect(conversions(gh)).toEqual([]);
  // the code copied (the clipboard taken; then refused: selected, to copy by hand)
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.resolve() }, configurable: true }));
  await page.getByRole('button', { name: 'コードを写す' }).click();
  await expect(page.locator('#toast')).toHaveText(/^コードを写しました/);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('no')) }, configurable: true }));
  await page.getByRole('button', { name: 'コードを写す' }).click();
  await expect(page.locator('#toast')).toHaveText(/^写せませんでした/);
  // no state at all: the ordinary first screen
  await page.goto('./?code=testcode100000000');
  await expect(page.locator('#setup')).toBeVisible();
  await expect(page.locator('#app-bridge')).toBeHidden();
  expect(page.url()).toBe(baseURL);
  // the flow started here is waited for: the field to paste in; what is not its code, refused
  await expect(page.locator('#app-paste-form')).toBeVisible();
  for (const text of ['コードではない', 'not-the-state.testcode100000000']) {
    await page.locator('#app-paste').fill(text);
    await page.getByRole('button', { name: '続ける' }).click();
    await expect(page.locator('#app-paste-error')).toHaveText(/^このコードは、ここで始めた GitHub App のものではありません/);
  }
  // (shown again with nothing new kept: still the first screen)
  await inFront(page);
  await expect(page.locator('#setup')).toBeVisible();
  expect(conversions(gh)).toEqual([]);
  expect(await keptApp(page)).toBeNull();
});

// FR-GH-01, NFR-SEC-10: GitHub came back somewhere else (another browser's storage, as Safari and the app on the home
// screen): not taken there, its code shown; pasted where the flow was started, taken there, and on as before
test('back somewhere else: not taken there; its code pasted where it was started: the App kept there, installed, the work opened', async ({
  page,
  gh,
  browser,
  baseURL,
}) => {
  await noPasskey(page);
  gh.createNow = false;
  await page.goto('./');
  await makeApp(page);
  await expect(page.getByText('GitHub（試験の偽物）')).toBeVisible();
  const { state } = gh.manifests[0];
  // (the way back opened in another context: its own storage)
  const other = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  await gh.install(other, new URL(/** @type {string} */ (baseURL)).origin);
  const elsewhere = await other.newPage();
  await elsewhere.goto(`./?code=testcode100000000&state=${state}`);
  await expect(elsewhere.locator('#app-bridge')).toBeVisible();
  const code = await elsewhere.locator('#app-bridge-code').inputValue();
  expect(code).toBe(`${state}.testcode100000000`);
  expect(await keptApp(elsewhere)).toBeNull();
  await other.close();
  expect(conversions(gh)).toEqual([]);
  // back where it was started: pasted
  await page.goto('./');
  await page.locator('#app-paste').fill(code);
  await page.getByRole('button', { name: '続ける' }).click();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  expect(conversions(gh)).toHaveLength(1);
  expect(await keptApp(page)).toMatchObject({ extractable: false, appId: 'Iv23testclient1' });
});

// FR-GH-01: not installed yet: GitHub's page to install it, from a screen that says so; installed meanwhile, the app
// shown again: the repositories it is on offered (several); a repository of an owner it is not on: no author proposed
test('not installed yet: the screen with GitHub’s page; installed meanwhile on several: offered when shown again', async ({ page, gh }) => {
  await noPasskey(page);
  gh.installRepos = null;
  await page.goto('./');
  await makeApp(page);
  await expect(page.getByText('GitHub（試験の偽物）')).toBeVisible();
  expect(gh.installPages).toHaveLength(1);
  await page.goto('./');
  await expect(page.locator('#app-install')).toBeVisible();
  await expect(page.locator('#app-install-link')).toHaveAttribute('href', `https://github.com${gh.installPages[0]}`);
  // shown again, still not installed
  await inFront(page);
  await expect(page.locator('#app-install')).toBeVisible();
  // installed on the author's account, with a repository listed that is another owner's
  const tools = new FakeRepo('someone/tools', { 'README.md': '# 道具\n' });
  tools.id = ++gh.ids;
  gh.repos.set('someone/tools', tools);
  /** @type {NonNullable<typeof gh.app>} */ (gh.app).installations.push({ id: 8, account: 'author', repos: ['author/novel', 'someone/tools'] });
  await inFront(page);
  await expect(page.locator('#picker-list button')).toHaveText(['author/novel', 'someone/tools']);
  await page.locator('#picker-list button', { hasText: 'someone/tools' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^このリポジトリには GitHub App が入っていません/);
  await expect(page.locator('#author-notice')).toBeHidden();
  expect((await keptApp(page))?.author).toBeNull();
  // the author's own: proposed
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  await page.getByRole('button', { name: 'リポジトリを開く' }).click();
  await page.locator('#picker-list button', { hasText: 'author/novel' }).click();
  await expect(page.locator('#author-notice')).toBeVisible();
  expect((await keptApp(page))?.author).toEqual(AUTHOR);
});

// FR-GH-01, NFR-USE-01, NFR-SEC-16: GitHub not reached when looking where it is installed: said on that screen; logged
// out from there: the key gone
test('GitHub not reached on the screen of installing: said; logged out from there', async ({ page, gh }) => {
  await noPasskey(page);
  gh.installRepos = null;
  await page.goto('./');
  await makeApp(page);
  await expect(page.getByText('GitHub（試験の偽物）')).toBeVisible();
  gh.down = true;
  await page.goto('./');
  await expect(page.locator('#app-install-error')).toHaveText('GitHub につながりません（オフラインかもしれません）');
  page.once('dialog', d => void d.accept());
  await page.locator('#forget-token-install').click();
  await expect(page.locator('#setup')).toBeVisible();
  expect(await keptApp(page)).toBeNull();
  expect(await stored(page, 'vault')).toEqual([]);
});

// NFR-SEC-10: the code taken once: GitHub refusing it (used, or past the hour) said; the state used up with it
test('a code GitHub does not take: said; its state used up', async ({ page, gh }) => {
  await noPasskey(page);
  gh.createNow = false;
  await page.goto('./');
  await makeApp(page);
  await expect(page.getByText('GitHub（試験の偽物）')).toBeVisible();
  const { state } = gh.manifests[0];
  /** @type {{ used: boolean }} */ (gh.codes.get('testcode100000000')).used = true;
  await page.goto(`./?code=testcode100000000&state=${state}`);
  await expect(page.locator('#app-make-error')).toHaveText(/^GitHub App を受け取れませんでした（見つかりません/);
  expect(await keptApp(page)).toBeNull();
  await page.goto(`./?code=testcode100000000&state=${state}`);
  await expect(page.locator('#app-bridge')).toBeVisible();
  expect(conversions(gh)).toHaveLength(1);
});

// FR-GH-01: the App kept by another page of the app (the same storage): this one, shown again, goes on with it
// (gh: the fake GitHub; without it, the pages would reach the real one)
test('kept by another page of the app: this one, shown again, opens the work', async ({ page, context, gh }) => {
  await noPasskey(page);
  await page.goto('./');
  await expect(page.locator('#setup')).toBeVisible();
  const other = await context.newPage();
  await noPasskey(other);
  await other.goto('./');
  await makeApp(other);
  await expect(other.locator('#episode-title')).toHaveValue('はじまり');
  await inFront(page);
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
});

test.describe('with a passkey', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebKit has no virtual authenticator');
  /** @param {import('@playwright/test').Page} page @param {boolean} verified */
  async function authenticator(page, verified) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: verified,
        automaticPresenceSimulation: true,
      },
    });
  }
  // NFR-SEC-16: the passkey made on the press, before GitHub; back from installing, opened without it once; after,
  // the passkey each time
  test('the passkey made on the press; back from installing, straight in; opened again, the passkey', async ({ page, gh }) => {
    await authenticator(page, true);
    await page.goto('./');
    await makeApp(page);
    await expect(page.locator('#episode-title')).toHaveValue('はじまり');
    expect(await keptApp(page)).toMatchObject({ passkey: true, extractable: false });
    expect(gh.installPages).toHaveLength(1);
    await page.reload();
    await expect(page.locator('#unlock-note')).toHaveText(/開くたびにパスキーを使います/);
  });
  // the passkey not made: nothing posted to GitHub
  test('the passkey not made: said; nothing posted', async ({ page, gh }) => {
    await authenticator(page, false);
    await page.goto('./');
    await makeApp(page);
    await expect(page.locator('#app-make-error')).toHaveText(/^パスキーが作られませんでした（NotAllowedError）/);
    expect(gh.manifests).toEqual([]);
    await expect(page.getByRole('button', { name: 'GitHub App を作って始める' })).toBeEnabled();
  });
});
