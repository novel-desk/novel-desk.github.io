// The token: kept encrypted with a passkey (PRF), or without PRF with a key that cannot be taken out; the CSP; the
// repositories it can read
import { test, expect, noPasskey, openRepo, openWork, stored, TOKEN } from './lib/test.mjs';

/** @param {import('@playwright/test').Page} page @param {boolean} hasPrf */
async function authenticator(page, hasPrf) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      hasPrf,
      automaticPresenceSimulation: true,
    },
  });
}
// The passkey's answers changed for a test, as other authenticators and browsers give them: localStorage 「nw-create」 and
// 「nw-get」 say how (none: as the virtual authenticator answers)
/** @param {import('@playwright/test').Page} page */
async function otherAnswers(page) {
  await page.addInitScript(() => {
    const c = navigator.credentials;
    const [create, get] = [c.create.bind(c), c.get.bind(c)];
    /** @param {any} cred @param {any} results */
    const saying = (cred, results) => Object.assign(cred, { getClientExtensionResults: () => results });
    c.create = async o => {
      const how = localStorage.getItem('nw-create');
      if (how === 'null') return null;
      if (how === 'error') throw new TypeError('test');
      const cred = await create(o);
      // (PRF said to be there, its output given only on a get)
      return how === 'later' ? saying(cred, { prf: { enabled: true } }) : cred;
    };
    c.get = async o => {
      const how = localStorage.getItem('nw-get');
      if (how === 'cancel') throw new DOMException('test', 'NotAllowedError');
      if (how === 'error') throw new TypeError('test');
      if (how === 'string') throw 'test';
      if (how === 'null') return null;
      const cred = await get(o);
      if (how === 'none') return saying(cred, {});
      if (how === 'other') return saying(cred, { prf: { results: { first: new Uint8Array(32).fill(7).buffer } } });
      return cred;
    };
  });
}
/** @param {import('@playwright/test').Page} page @param {string} key @param {string} value */
const answering = (page, key, value) => page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, value]);
/** @param {import('@playwright/test').Page} page */
async function putToken(page) {
  await page.goto('./');
  await page.getByLabel('トークン', { exact: true }).fill(TOKEN);
  await page.getByRole('button', { name: 'パスキーで保管する' }).click();
}

test.describe('a passkey', () => {
  // Chrome's virtual authenticator (CDP's WebAuthn domain): WebKit has no virtual authenticator that Playwright can
  // drive, so the passkey's path is tested on Chrome only
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebKit has no virtual authenticator');

  test('with PRF: the token encrypted by a key from the passkey, opened with it each time; forgotten on asking', async ({ page, gh }) => {
    await authenticator(page, true);
    await putToken(page);
    await expect(page.getByRole('button', { name: 'リポジトリを開く' })).toBeVisible();
    await expect(page.locator('#vault-kind')).toHaveText(/パスキー（PRF）から作った鍵で暗号化/);
    const [vault] = /** @type {any[]} */ (await stored(page, 'vault'));
    expect(Object.keys(vault).sort()).toEqual(['credentialId', 'data', 'iv', 'kind', 'salt']);
    expect(vault.kind).toBe('prf');
    // the token is not in what is kept
    expect(JSON.stringify(Object.values(vault.data))).not.toContain(JSON.stringify([...Buffer.from(TOKEN)].slice(0, 6)).slice(1, -1));
    await page.reload();
    await expect(page.locator('#unlock')).toBeVisible();
    await page.getByRole('button', { name: 'パスキーで開く' }).click();
    await openRepo(page, 'author/novel');
    await expect(page.locator('#episode-title')).toHaveValue('はじまり');
    // opened again, straight into the work chosen
    await page.reload();
    await page.getByRole('button', { name: 'パスキーで開く' }).click();
    await expect(page.locator('#episode-title')).toHaveValue('はじまり');
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'ほかの作品' }).click();
    await page.getByRole('button', { name: 'トークンを忘れる' }).click();
    await expect(page.locator('#setup')).toBeVisible();
    expect(await stored(page, 'vault')).toEqual([]);
  });

  test('an authenticator without PRF: the key that cannot be taken out, and the screen says so', async ({ page, gh }) => {
    await authenticator(page, false);
    await putToken(page);
    await expect(page.locator('#vault-kind')).toHaveText(/PRF に対応していないため.*取り出せない鍵/);
    expect(/** @type {any[]} */ (await stored(page, 'vault'))[0].kind).toBe('local');
  });

  test('the passkey refused: nothing is kept', async ({ page, gh }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: false,
        hasPrf: true,
        automaticPresenceSimulation: true,
      },
    });
    await putToken(page);
    await expect(page.locator('#setup-error')).toHaveText(/パスキーが作られませんでした/);
    expect(await stored(page, 'vault')).toEqual([]);
  });
  // FR-GH-01: whether the browser has PRF, said in other ways (or not said): a passkey is tried all the same
  for (const [said, caps] of /** @type {const} */ ([
    ['not asked (no getClientCapabilities)', 'none'],
    ['not said', 'silent'],
    ['the question failing', 'throws'],
  ]))
    test(`PRF ${said}: the passkey tried, and kept with it`, async ({ page, gh }) => {
      await page.addInitScript(how => {
        const PKC = /** @type {any} */ (window.PublicKeyCredential);
        PKC.getClientCapabilities = how === 'none' ? undefined : how === 'silent' ? async () => ({}) : async () => Promise.reject(new Error('test'));
      }, caps);
      await authenticator(page, true);
      await putToken(page);
      await expect(page.locator('#vault-kind')).toHaveText(/パスキー（PRF）から作った鍵で暗号化/);
      expect(/** @type {any[]} */ (await stored(page, 'vault'))[0].kind).toBe('prf');
    });

  // FR-GH-01: an authenticator that gives PRF's output only on a get, or not at all, or no passkey, or a browser that
  // cannot: kept with the passkey when its output comes, else with the key that cannot be taken out
  for (const [what, create, get, kind] of /** @type {const} */ ([
    ['the output given on a get', 'later', '', 'prf'],
    ['the output not given on the get either', 'later', 'none', 'local'],
    ['no passkey back from the get', 'later', 'null', 'local'],
    ['no passkey made', 'null', '', 'local'],
    ['the browser cannot make one', 'error', '', 'local'],
  ]))
    test(`a passkey made, ${what}: kept as ${kind}`, async ({ page, gh }) => {
      await otherAnswers(page);
      await authenticator(page, true);
      await page.goto('./');
      await answering(page, 'nw-create', create);
      await answering(page, 'nw-get', get);
      await page.getByLabel('トークン', { exact: true }).fill(TOKEN);
      await page.getByRole('button', { name: 'パスキーで保管する' }).click();
      await expect(page.getByRole('button', { name: 'リポジトリを開く' })).toBeVisible();
      expect(/** @type {any[]} */ (await stored(page, 'vault'))[0].kind).toBe(kind);
    });

  // NFR-USE-01: the token not opened by the passkey: why, said; opened when the passkey answers. Forgotten in another tab
  // meanwhile: the first screen again
  test('the passkey not opening the token: said why; opened once it does; forgotten elsewhere: the first screen', async ({ page, context, gh }) => {
    await otherAnswers(page);
    await authenticator(page, true);
    await putToken(page);
    await expect(page.getByRole('button', { name: 'リポジトリを開く' })).toBeVisible();
    await page.reload();
    for (const [how, said] of [
      ['cancel', 'パスキーで開けませんでした（取り消されたか、時間切れです）'],
      ['error', 'パスキーを使えません（TypeError）'],
      ['string', 'パスキーを使えません（test）'],
      ['none', 'パスキーが PRF の値を返しませんでした'],
      ['other', 'トークンを復号できませんでした（作ったときと違うパスキーかもしれません）'],
    ]) {
      await answering(page, 'nw-get', how);
      await page.getByRole('button', { name: 'パスキーで開く' }).click();
      await expect(page.locator('#unlock-error')).toHaveText(said);
    }
    await answering(page, 'nw-get', '');
    await page.getByRole('button', { name: 'パスキーで開く' }).click();
    await expect(page.getByRole('button', { name: 'リポジトリを開く' })).toBeVisible();
    await page.reload();
    await expect(page.locator('#unlock')).toBeVisible();
    const other = await context.newPage();
    await other.goto('./');
    other.once('dialog', d => void d.accept());
    await other.getByRole('button', { name: 'トークンを忘れる' }).click();
    await expect(other.locator('#setup')).toBeVisible();
    await page.getByRole('button', { name: 'パスキーで開く' }).click();
    await expect(page.locator('#setup')).toBeVisible();
  });
});

// NFR-USE-01, FR-AUTH-07: the token kept without a passkey that cannot be opened (the browser's key no longer works):
// said on the screen that opens it, and forgotten from there
test('a token kept without a passkey that cannot be opened: said; forgotten from that screen', async ({ page, gh }) => {
  await noPasskey(page);
  await putToken(page);
  await expect(page.getByRole('button', { name: 'リポジトリを開く' })).toBeVisible();
  await page.addInitScript(() => {
    crypto.subtle.decrypt = async () => Promise.reject(new DOMException('test', 'OperationError'));
  });
  await page.reload();
  await expect(page.locator('#unlock')).toBeVisible();
  await expect(page.locator('#unlock-error')).toHaveText('test');
  page.once('dialog', d => void d.accept());
  await page.locator('#forget-token-unlock').click();
  await expect(page.locator('#setup')).toBeVisible();
  expect(await stored(page, 'vault')).toEqual([]);
});

// FR-GH-01, NFR-SEC-16: a token of nothing but spaces is not kept; one whose user GitHub does not say is kept without
// a user noted; one GitHub refuses while it is checked whose it is is not taken for the token in use refused
test('the token put in: spaces only, nothing; its user not said, kept without one; refused by GitHub, nothing deleted', async ({ page, gh }) => {
  await noPasskey(page);
  await page.goto('./');
  await page.getByLabel('トークン', { exact: true }).fill('   ');
  await page.getByRole('button', { name: 'パスキーで保管する' }).click();
  await expect(page.locator('#setup')).toBeVisible();
  expect(await stored(page, 'vault')).toEqual([]);
  await page.route('https://api.github.com/user', route =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: '{}' })
      : route.fallback(),
  );
  await page.getByLabel('トークン', { exact: true }).fill(TOKEN);
  await page.getByRole('button', { name: 'パスキーで保管する' }).click();
  await expect(page.getByRole('button', { name: 'リポジトリを開く' })).toBeVisible();
  expect(await stored(page, 'prefs')).not.toContain('author');
  // forgotten, and a token GitHub does not take put in: the check of its user is refused, and nothing more happens
  const answers = [false, true];
  page.on('dialog', d => void (answers.shift() ? d.accept() : d.dismiss()));
  await page.getByRole('button', { name: 'トークンを忘れる' }).click();
  // (not confirmed: nothing forgotten)
  await expect(page.locator('#repos')).toBeVisible();
  expect((await stored(page, 'vault')).length).toBe(1);
  await page.getByRole('button', { name: 'トークンを忘れる' }).click();
  await expect(page.locator('#setup')).toBeVisible();
  await page.unroute('https://api.github.com/user');
  await page.getByLabel('トークン', { exact: true }).fill('not-a-token');
  await page.getByRole('button', { name: 'パスキーで保管する' }).click();
  await expect(page.getByRole('button', { name: 'リポジトリを開く' })).toBeVisible();
  await expect(page.locator('#token-notice')).toBeHidden();
});

test('no passkey in this browser: kept with a key that cannot be taken out; opened without asking', async ({ page, gh }) => {
  await noPasskey(page);
  await putToken(page);
  await expect(page.locator('#vault-kind')).toHaveText(/PRF に対応していないため/);
  const [vault] = /** @type {any[]} */ (await stored(page, 'vault'));
  expect(vault.kind).toBe('local');
  expect(await page.evaluate(() => 'PublicKeyCredential' in window && window.PublicKeyCredential)).toBeFalsy();
  await page.reload();
  await expect(page.getByRole('button', { name: 'リポジトリを開く' })).toBeVisible();
});

test('the CSP: no script but the app’s, nothing reached but GitHub’s API', async ({ page, gh }) => {
  await openWork(page);
  const ran = await page.evaluate(async () => {
    const s = document.createElement('script');
    s.textContent = 'window.injected = true';
    document.head.append(s);
    const reached = await fetch('https://example.com/').then(
      () => true,
      () => false,
    );
    return { injected: 'injected' in window, reached };
  });
  expect(ran).toEqual({ injected: false, reached: false });
});

// FR-WORK-03
test('リポジトリを開く: every page of the repositories; the ones on the list not offered; the one chosen is remembered; a token GitHub refuses is said', async ({
  page,
  gh,
}) => {
  gh.perPage = 1;
  await noPasskey(page);
  await putToken(page);
  await page.getByRole('button', { name: 'リポジトリを開く' }).click();
  await expect(page.locator('#picker-list button')).toHaveText(['author/novel', 'author/other']);
  await page.locator('#picker-list button', { hasText: 'author/novel' }).click();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  await expect(page.locator('#repo-list .work b')).toHaveText(['試験の作品']);
  await page.getByRole('button', { name: 'リポジトリを開く' }).click();
  await expect(page.locator('#picker-list button')).toHaveText(['author/other']);
  await page.locator('#picker-list button').click();
  await expect(page.locator('#work-repo a')).toHaveText('author/other');
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  await expect(page.locator('#repo-list .work b')).toHaveText(['試験の作品', 'other']);
  await expect(page.locator('#repo-list .work small')).toHaveText([/author\/novel（main）非公開$/, /author\/other（main）公開$/]);
  await page.getByRole('button', { name: '戻る' }).click();
  await expect(page.locator('#work-repo a')).toHaveText('author/other');
  await page.reload();
  await expect(page.locator('#work-repo a')).toHaveText('author/other');
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  gh.fail = () => 401;
  await page.getByRole('button', { name: 'リポジトリを開く' }).click();
  await expect(page.locator('#repos-error')).toHaveText('トークンが使えません（期限切れか、消されたかもしれません）: test failure');
});

// the token made easy: GitHub's form opened with its name, its expiry and Contents read and write filled in
test('a link to make the token, filled in', async ({ page }) => {
  await page.goto('./');
  const link = page.locator('#make-token');
  await expect(link).toBeVisible();
  const url = new URL(/** @type {string} */ (await link.getAttribute('href')));
  expect(url.origin + url.pathname).toBe('https://github.com/settings/personal-access-tokens/new');
  expect(Object.fromEntries(url.searchParams)).toEqual({ name: 'Novel Desk', description: 'For novel-desk.github.io', expires_in: '90', contents: 'write' });
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
});

/** @param {import('@playwright/test').Page} page @param {number} days @returns {Promise<string>} the day `days` days on, in the page's time */
const dayOn = (page, days) =>
  page.evaluate(n => {
    const d = new Date(Date.now() + n * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, days);

// FR-GH-01: the token's expiry (GitHub does not let the page read it: the author says it, 90 days filled in), warned
// from 14 days before, with GitHub's list of tokens and a way to put the new one in its place
test('the expiry: 90 days filled in; from 14 days before, said on the screen; the new token put in its place, kept as the first', async ({
  page,
  gh,
  work,
}) => {
  await noPasskey(page);
  await page.goto('./');
  await expect(page.locator('#token-expires')).toHaveValue(await dayOn(page, 90));
  await page.getByLabel('トークン', { exact: true }).fill(TOKEN);
  await page.locator('#token-expires').fill(await dayOn(page, 10));
  await page.getByRole('button', { name: 'パスキーで保管する' }).click();
  await expect(page.locator('#token-notice')).toBeVisible();
  await expect(page.locator('#token-notice-text')).toHaveText(/^トークンの期限が \d+\/\d+ に切れます（あと 1[01] 日）。 GitHub のトークンの一覧/);
  await expect(page.locator('#token-notice a')).toHaveAttribute('href', 'https://github.com/settings/personal-access-tokens');
  await openRepo(page, 'author/novel');
  await expect(page.locator('#token-notice')).toBeVisible();
  const [before] = /** @type {any[]} */ (await stored(page, 'vault'));
  // regenerated on GitHub: the old value no longer taken
  gh.tokens = ['new-test-token-not-real'];
  await page.getByRole('button', { name: '再読み込み' }).click();
  await expect(page.locator('#token-notice-text')).toHaveText(/^GitHub がトークンを断りました/);
  await page.getByRole('button', { name: '新しいトークンを入れる' }).click();
  await expect(page.locator('#new-token-expires')).toHaveValue(await dayOn(page, 90));
  await page.getByLabel('新しいトークン', { exact: true }).fill('new-test-token-not-real');
  await page.getByRole('button', { name: 'パスキーで保管する' }).click();
  await expect(page.locator('#toast')).toHaveText('新しいトークンを保管しました');
  await expect(page.locator('#token-notice')).toBeHidden();
  const [after] = /** @type {any[]} */ (await stored(page, 'vault'));
  expect(after.kind).toBe('local');
  expect(after.iv).not.toEqual(before.iv);
  // used from now on, and opened with it next time
  await page.locator('#body').fill('# 第1話 はじまり\n\n新しいトークンで\n');
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/01_first.md')).toBe('# 第1話 はじまり\n\n新しいトークンで\n');
  // (the refusal deleted what the device kept of the works, the choice of the work too: chosen again)
  await page.reload();
  await openRepo(page, 'author/novel');
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await expect(page.locator('#token-notice')).toBeHidden();
});

// NFR-USE-01: a token GitHub refuses (expired, deleted) is said with what to do, and a new one put in its place
// NFR-SEC-16: and, as when a session ends, the works' copies and settings deleted, the drafts kept
test('a token GitHub refuses: said, with the way to put a new one in; a token that does not work is not kept', async ({ page, gh }) => {
  await openWork(page);
  await page.locator('#body').fill('# 第1話 はじまり\n\n断られても残る\n');
  await expect.poll(async () => (await stored(page, 'drafts')).length).toBe(1);
  await expect(page.locator('#token-notice')).toBeHidden();
  gh.tokens = ['new-test-token-not-real'];
  await page.getByRole('button', { name: '再読み込み' }).click();
  await expect(page.locator('#token-notice-text')).toHaveText(/^GitHub がトークンを断りました（期限が切れたか、消されたかもしれません）。/);
  await expect.poll(() => stored(page, 'snapshots')).toEqual([]);
  // (deleted one by one, after the copies)
  await expect.poll(() => stored(page, 'blobs')).toEqual([]);
  expect((await stored(page, 'drafts')).map(d => d.text)).toEqual(['# 第1話 はじまり\n\n断られても残る\n']);
  await page.getByRole('button', { name: '新しいトークンを入れる' }).click();
  await page.getByLabel('新しいトークン', { exact: true }).fill('wrong-token');
  await page.getByRole('button', { name: 'パスキーで保管する' }).click();
  await expect(page.locator('#token-replace-error')).toHaveText(/^このトークンは使えません: トークンが使えません/);
  await page.getByLabel('新しいトークン', { exact: true }).fill('new-test-token-not-real');
  await page.getByRole('button', { name: 'パスキーで保管する' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  await expect(page.locator('#token-notice')).toBeHidden();
});

// FR-GH-01, NFR-USE-01: refused on the list of works: after a reload (the expiry kept deleted with the rest) nothing is
// said until GitHub is asked; the new token put in there, the list shown again. The dialog closed without one, and a
// token of spaces only, change nothing
test('refused on the list of works: said when GitHub is asked; the new token put in there, the list shown again', async ({ page, gh }) => {
  await openWork(page);
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  gh.tokens = ['new-test-token-not-real'];
  await page.getByRole('button', { name: 'リポジトリを開く' }).click();
  await expect(page.locator('#token-notice-text')).toHaveText(/^GitHub がトークンを断りました/);
  await expect.poll(() => stored(page, 'snapshots')).toEqual([]);
  await page.reload();
  await expect(page.locator('#repos')).toBeVisible();
  await expect(page.locator('#token-notice')).toBeHidden();
  await page.getByRole('button', { name: 'リポジトリを開く' }).click();
  await expect(page.locator('#token-notice-text')).toHaveText(/^GitHub がトークンを断りました/);
  await page.getByRole('button', { name: '新しいトークンを入れる' }).click();
  await page.locator('#close-token-replace').click();
  await expect(page.locator('#token-replace')).toBeHidden();
  await page.getByRole('button', { name: '新しいトークンを入れる' }).click();
  await page.getByLabel('新しいトークン', { exact: true }).fill('   ');
  await page.getByRole('button', { name: 'パスキーで保管する' }).click();
  await expect(page.locator('#token-replace-error')).toHaveText('');
  await expect(page.locator('#token-replace')).toBeVisible();
  await page.getByLabel('新しいトークン', { exact: true }).fill('new-test-token-not-real');
  await page.getByRole('button', { name: 'パスキーで保管する' }).click();
  await expect(page.locator('#toast')).toHaveText('新しいトークンを保管しました');
  await expect(page.locator('#token-notice')).toBeHidden();
  await expect(page.locator('#repos')).toBeVisible();
  await page.getByRole('button', { name: 'リポジトリを開く' }).click();
  await expect(page.locator('#picker-list button')).toHaveText(['author/novel', 'author/other']);
});

// NFR-SEC-16: the token forgotten: with it, what the device keeps of the works; the drafts too when the author says so
test('the token forgotten: the works’ copies and settings deleted; the drafts kept or deleted as asked', async ({ page, gh }) => {
  await openWork(page);
  await page.locator('#body').fill('# 第1話 はじまり\n\n残す書きかけ\n');
  await expect.poll(async () => (await stored(page, 'drafts')).length).toBe(1);
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  const answers = [true, false];
  page.on('dialog', d => void (answers.shift() ? d.accept() : d.dismiss()));
  await page.getByRole('button', { name: 'トークンを忘れる' }).click();
  await expect(page.locator('#setup')).toBeVisible();
  expect(await stored(page, 'vault')).toEqual([]);
  expect(await stored(page, 'snapshots')).toEqual([]);
  expect(await stored(page, 'blobs')).toEqual([]);
  expect(await stored(page, 'prefs')).toEqual(['author']);
  expect((await stored(page, 'drafts')).map(d => d.text)).toEqual(['# 第1話 はじまり\n\n残す書きかけ\n']);
});

// NFR-SEC-16: another user's token where the drafts of the one before are left: asked without showing them; kept
// unless deleted
test('another user’s token on a device with the drafts of the one before: not kept unless they are deleted', async ({ page, gh }) => {
  await openWork(page);
  await page.locator('#body').fill('# 第1話 はじまり\n\n前の人の書きかけ\n');
  await expect.poll(async () => (await stored(page, 'drafts')).length).toBe(1);
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  const answers = [true, false, false, true];
  page.on('dialog', d => void (answers.shift() ? d.accept() : d.dismiss()));
  await page.getByRole('button', { name: 'トークンを忘れる' }).click();
  gh.tokens.push('someone-test-token');
  gh.logins['someone-test-token'] = 'someone';
  await page.getByLabel('トークン', { exact: true }).fill('someone-test-token');
  await page.getByRole('button', { name: 'パスキーで保管する' }).click();
  await expect(page.locator('#setup-error')).toHaveText(/^前のユーザーの書きかけを残すため、このトークンを保管しませんでした/);
  expect(await stored(page, 'vault')).toEqual([]);
  expect((await stored(page, 'drafts')).length).toBe(1);
  await page.getByRole('button', { name: 'パスキーで保管する' }).click();
  await expect(page.locator('#repos')).toBeVisible();
  expect(await stored(page, 'drafts')).toEqual([]);
});
