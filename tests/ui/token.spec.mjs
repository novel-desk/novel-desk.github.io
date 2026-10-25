// The token: kept encrypted with a passkey (PRF), or without PRF with a key that cannot be taken out; the CSP; the
// repositories it can read
import {
  test,
  expect,
  FakeRepo,
  noPasskey,
  answering,
  otherAnswers,
  openImport,
  openRepo,
  openWork,
  toSettings,
  passkeyNames,
  persistAsked,
  stored,
  today,
  TOKEN,
  watchPasskeyNames,
  watchPersist,
  WORK_FILES,
} from './lib/test.mjs';

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
    await watchPasskeyNames(page);
    await putToken(page);
    await expect(page.locator('#shelf')).toBeVisible();
    // (the passkey called, in the passwords' list, by what it opens and the day it was made)
    expect(await passkeyNames(page)).toEqual([`Novel Desk トークン ${today()}`]);
    await toSettings(page);
    await expect(page.locator('#gh-help')).toHaveText(/パスキー（PRF）から作った鍵で暗号化/);
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
    await toSettings(page);
    await page.getByRole('button', { name: 'ログアウト' }).click();
    await expect(page.locator('#setup')).toBeVisible();
    expect(await stored(page, 'vault')).toEqual([]);
  });

  test('an authenticator without PRF: the key that cannot be taken out, and the screen says so', async ({ page, gh }) => {
    await authenticator(page, false);
    await putToken(page);
    await toSettings(page);
    await expect(page.locator('#gh-help')).toHaveText(/PRF に対応していないため.*取り出せない鍵/);
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
      await toSettings(page);
      await expect(page.locator('#gh-help')).toHaveText(/パスキー（PRF）から作った鍵で暗号化/);
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
      await expect(page.locator('#shelf')).toBeVisible();
      expect(/** @type {any[]} */ (await stored(page, 'vault'))[0].kind).toBe(kind);
    });

  // NFR-USE-01: the token not opened by the passkey: why, said; opened when the passkey answers. Forgotten in another tab
  // meanwhile: the first screen again
  test('the passkey not opening the token: said why; opened once it does; forgotten elsewhere: the first screen', async ({ page, context, gh }) => {
    await otherAnswers(page);
    await authenticator(page, true);
    await putToken(page);
    await expect(page.locator('#shelf')).toBeVisible();
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
    await expect(page.locator('#shelf')).toBeVisible();
    await page.reload();
    await expect(page.locator('#unlock')).toBeVisible();
    const other = await context.newPage();
    await other.goto('./');
    // (nothing not sent: logged out without asking, as the server version's)
    await other.getByRole('button', { name: 'ログアウト' }).click();
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
  await expect(page.locator('#shelf')).toBeVisible();
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
  await expect(page.locator('#shelf')).toBeVisible();
  // (whose the drafts are not kept: GitHub did not say the account's number)
  expect(await stored(page, 'prefs')).not.toContain(1001);
  // forgotten (nothing not sent: without asking, as the server version's), and a token GitHub does not take put in: the
  // check of its user is refused, and nothing more happens
  expect((await stored(page, 'vault')).length).toBe(1);
  await toSettings(page);
  await page.getByRole('button', { name: 'ログアウト' }).click();
  await expect(page.locator('#setup')).toBeVisible();
  await page.unroute('https://api.github.com/user');
  await page.getByLabel('トークン', { exact: true }).fill('not-a-token');
  await page.getByRole('button', { name: 'パスキーで保管する' }).click();
  await expect(page.locator('#shelf')).toBeVisible();
  await expect(page.locator('#token-notice')).toBeHidden();
});

// (with it, the browser asked once to keep this device's store for good: the drafts and the key are not deleted when it
// is short of room)
test('no passkey in this browser: kept with a key that cannot be taken out; opened without asking', async ({ page, gh }) => {
  await noPasskey(page);
  await watchPersist(page);
  await putToken(page);
  await expect.poll(() => persistAsked(page)).toBe(1);
  await toSettings(page);
  await expect(page.locator('#gh-help')).toHaveText(/PRF に対応していないため/);
  const [vault] = /** @type {any[]} */ (await stored(page, 'vault'));
  expect(vault.kind).toBe('local');
  expect(await page.evaluate(() => 'PublicKeyCredential' in window && window.PublicKeyCredential)).toBeFalsy();
  await page.reload();
  await expect(page.locator('#shelf')).toBeVisible();
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

// FR-WORK-03: GitHub リポジトリをインポート (as the server version's): the names offered are the repositories the token
// can write to (every page of GitHub's listing) that the list does not show; the one typed is opened, put on the list,
// and opened again by the address; a name not found, and a token GitHub refuses, said
test('GitHub リポジトリをインポート: every page offered; the ones on the list not offered; the one typed is remembered; a name not found and a token refused said', async ({
  page,
  gh,
}) => {
  gh.perPage = 1;
  await noPasskey(page);
  await putToken(page);
  const offered = () => page.locator('#repo-options option').evaluateAll(o => o.map(x => /** @type {HTMLOptionElement} */ (x).value));
  await openImport(page);
  await expect.poll(offered).toEqual(['author/novel', 'author/other']);
  await openRepo(page, 'author/novel');
  await expect(page.locator('#toast')).toHaveText('インポートしました');
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await page.getByRole('button', { name: '‹ 作品' }).click();
  await expect(page.locator('#works .work b')).toHaveText(['試験の作品']);
  // (the names read again when the import is opened again)
  await openImport(page);
  // (read again: the list shown again)
  await expect.poll(offered).toEqual(['author/other']);
  await openRepo(page, 'author/other');
  await expect(page.locator('#work-repo a')).toHaveText('author/other');
  await page.getByRole('button', { name: '‹ 作品' }).click();
  await expect(page.locator('#works .work b')).toHaveText(['試験の作品', 'other']);
  await expect(page.locator('#works .work small')).toHaveText([/GitHub author\/novel（main） 非公開$/, /GitHub author\/other（main） 公開$/]);
  // the list again when the page is loaded again there; a work opened again by the address
  await page.reload();
  await expect(page.locator('#shelf')).toBeVisible();
  await page.locator('#works .work', { hasText: 'other' }).click();
  await expect(page.locator('#work-repo a')).toHaveText('author/other');
  await page.reload();
  await expect(page.locator('#work-repo a')).toHaveText('author/other');
  await page.getByRole('button', { name: '‹ 作品' }).click();
  await openRepo(page, 'author/none');
  await expect(page.locator('#toast')).toHaveText(
    'author/none が見つかりません（owner/リポジトリ名 で入れてください。トークンか GitHub App で読めるリポジトリだけを開けます）',
  );
  gh.fail = () => 401;
  await openRepo(page, 'author/novel');
  await expect(page.locator('#toast')).toHaveText('トークンが使えません（期限切れか、消されたかもしれません）: test failure');
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
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await expect(page.locator('#token-notice')).toBeVisible();
  const [before] = /** @type {any[]} */ (await stored(page, 'vault'));
  // regenerated on GitHub: the old value no longer taken
  gh.tokens = ['new-test-token-not-real'];
  // (the notice over the top of the screen put away first: 再読み込み is under it)
  await page.getByRole('button', { name: 'あとで' }).click();
  await page.locator('#reload-work').click();
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
  // (the refusal deleted nothing the device kept of the works: the work chosen opened again)
  await page.reload();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await expect(page.locator('#token-notice')).toBeHidden();
});

// NFR-USE-01: a token GitHub refuses (expired, deleted) is said with what to do, and a new one put in its place.
// Nothing the device keeps of the works is deleted (the copies, the blobs read, the drafts): only the token is put in
// again
test('a token GitHub refuses: said, with the way to put a new one in; a token that does not work is not kept', async ({ page, gh }) => {
  await openWork(page);
  await page.locator('#body').fill('# 第1話 はじまり\n\n断られても残る\n');
  await expect.poll(async () => (await stored(page, 'drafts')).length).toBe(1);
  await expect(page.locator('#token-notice')).toBeHidden();
  const [snapshots, blobs] = [await stored(page, 'snapshots'), await stored(page, 'blobs')];
  gh.tokens = ['new-test-token-not-real'];
  await page.locator('#reload-work').click();
  await expect(page.locator('#token-notice-text')).toHaveText(/^GitHub がトークンを断りました（期限が切れたか、消されたかもしれません）。/);
  expect(await stored(page, 'snapshots')).toEqual(snapshots);
  expect(await stored(page, 'blobs')).toEqual(blobs);
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

// FR-GH-04, FR-GH-09, FR-GH-12, NFR-USE-01: a token GitHub refuses, then a new one: what the device keeps of the work
// is all there (opened again too): the drafts go to the branch they were written on, by the mode chosen, and the
// repository's ID kept when it was first opened still tells another repository under its name. Nothing goes by itself
// to another branch
test('refused, then a new token: the branch, the mode and the repository’s ID kept; nothing sent by itself to another branch', async ({ page, gh, work }) => {
  work.refs.side = work.refs.main;
  await page.clock.install();
  await openWork(page);
  await page.getByRole('button', { name: /⎇ main/ }).click();
  await page.locator('#picker').getByRole('button', { name: 'side' }).click();
  await expect(page.getByRole('button', { name: /⎇ side/ })).toBeVisible();
  await page.locator('#body').fill('# 第1話 はじまり\n\n枝で書いた\n');
  await expect.poll(async () => (await stored(page, 'drafts')).length).toBe(1);
  // refused when it goes by itself
  gh.tokens = ['new-test-token-not-real'];
  await page.clock.fastForward(61000);
  await expect(page.locator('#token-notice-text')).toHaveText(/^GitHub がトークンを断りました/);
  await page.getByRole('button', { name: '新しいトークンを入れる' }).click();
  await page.getByLabel('新しいトークン', { exact: true }).fill('new-test-token-not-real');
  await page.getByRole('button', { name: 'パスキーで保管する' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  // opened again: the branch chosen, the mode, the draft
  await page.reload();
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\n枝で書いた\n');
  await expect(page.getByRole('button', { name: /⎇ side/ })).toBeVisible();
  // (a minute at a time, the reading still going on when the clock moves)
  await expect
    .poll(async () => {
      await page.clock.fastForward(61000);
      return work.text('chapters/01_first.md', 'side');
    })
    .toBe('# 第1話 はじまり\n\n枝で書いた\n');
  expect(work.text('chapters/01_first.md')).toBe(WORK_FILES['chapters/01_first.md']);
  // 送るを押したときだけ: refused, a new token, opened again: still that mode, nothing sent by itself
  await page.locator('#sync-mode').selectOption('manual');
  await page.locator('#body').fill('# 第1話 はじまり\n\n押すまで待つ\n');
  gh.tokens = ['third-test-token-not-real'];
  await page.locator('#reload-work').click();
  await expect(page.locator('#token-notice-text')).toHaveText(/^GitHub がトークンを断りました/);
  await page.getByRole('button', { name: '新しいトークンを入れる' }).click();
  await page.getByLabel('新しいトークン', { exact: true }).fill('third-test-token-not-real');
  await page.getByRole('button', { name: 'パスキーで保管する' }).click();
  await expect(page.locator('#token-notice')).toBeHidden();
  await page.reload();
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\n押すまで待つ\n');
  await expect(page.locator('#sync-mode')).toHaveValue('manual');
  await page.clock.fastForward(120000);
  expect(work.text('chapters/01_first.md', 'side')).toBe('# 第1話 はじまり\n\n枝で書いた\n');
  // FR-GH-12: another repository under the work's name is told by the ID kept before the token was refused
  gh.rename('author/novel', 'author/gone');
  gh.unreadable.add('author/gone');
  const other = new FakeRepo('author/novel', { 'novel.toml': 'title = "別の作品"\n', '01.md': '# 別\n' });
  other.id = ++gh.ids;
  gh.repos.set('author/novel', other);
  await page.locator('#reload-work').click();
  await expect(page.locator('#sync-state')).toHaveText(/^author\/novel は、つないだリポジトリとは別のリポジトリになっています/);
  await expect(page.locator('#send')).toBeDisabled();
});

// FR-GH-01, NFR-USE-01: refused on the list of works: said; nothing the device keeps deleted, so opened again the work
// chosen opens, and GitHub refusing is said there too; the new token put in on the list, the list shown again. The
// dialog closed without one, and a token of spaces only, change nothing
test('refused on the list of works: said when GitHub is asked; the new token put in there, the list shown again', async ({ page, gh }) => {
  await openWork(page);
  await page.getByRole('button', { name: '‹ 作品' }).click();
  gh.tokens = ['new-test-token-not-real'];
  await openImport(page);
  await expect(page.locator('#token-notice-text')).toHaveText(/^GitHub がトークンを断りました/);
  expect((await stored(page, 'snapshots')).length).toBe(1);
  await page.reload();
  await expect(page.locator('#shelf')).toBeVisible();
  await expect(page.locator('#token-notice-text')).toHaveText(/^GitHub がトークンを断りました/);
  // (the list shown again when the page is loaded there)
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
  await expect(page.locator('#shelf')).toBeVisible();
  // (the work stays on this device's list: the others offered)
  await expect(page.locator('#works [data-repo="author/novel"]')).toBeVisible();
  await openImport(page);
  await expect
    .poll(() => page.locator('#repo-options option').evaluateAll(o => o.map(x => /** @type {HTMLOptionElement} */ (x).value)))
    .toEqual(['author/other']);
});

// NFR-SEC-16: the token forgotten: with it, what the device keeps of the works; the drafts too when the author says so
test('the token forgotten: the works’ copies and settings deleted; the drafts kept or deleted as asked', async ({ page, gh, work }) => {
  await openWork(page);
  await page.locator('#body').fill('# 第1話 はじまり\n\n残す書きかけ\n');
  await expect.poll(async () => (await stored(page, 'drafts')).length).toBe(1);
  await toSettings(page);
  const answers = [false];
  page.on('dialog', d => void (answers.shift() ? d.accept() : d.dismiss()));
  await page.getByRole('button', { name: 'ログアウト' }).click();
  await expect(page.locator('#setup')).toBeVisible();
  expect(await stored(page, 'vault')).toEqual([]);
  expect(await stored(page, 'snapshots')).toEqual([]);
  expect(await stored(page, 'blobs')).toEqual([]);
  // (kept with the drafts: their repository's ID, and whose they are, by the GitHub account's number)
  expect(await stored(page, 'prefs')).toEqual([work.id, 1001]);
  expect((await stored(page, 'drafts')).map(d => d.text)).toEqual(['# 第1話 はじまり\n\n残す書きかけ\n']);
});

// NFR-SEC-16, FR-GH-04, FR-GH-09: logged out with the drafts kept (the settings deleted): opened again with the token,
// the drafts go where and how they were written (their branch, their mode). Their branch gone on GitHub: not sent by
// itself to the one open; 送る asks first; only their branch can be chosen
test('logged out with the drafts kept, opened again: their branch and mode; never sent by itself to another branch', async ({ page, gh, work }) => {
  work.refs.side = work.refs.main;
  work.refs.other = work.refs.main;
  await page.clock.install();
  await openWork(page);
  await page.getByRole('button', { name: /⎇ main/ }).click();
  await page.locator('#picker').getByRole('button', { name: 'side' }).click();
  await expect(page.getByRole('button', { name: /⎇ side/ })).toBeVisible();
  await page.locator('#body').fill('# 第1話 はじまり\n\n枝の書きかけ\n');
  await page.locator('#sync-mode').selectOption('manual');
  await expect.poll(async () => (await stored(page, 'drafts')).map(d => [d.branch, d.sync])).toEqual([['side', 'manual']]);
  await toSettings(page);
  const answers = [false];
  page.on('dialog', d => void (answers.shift() ? d.accept() : d.dismiss()));
  await page.getByRole('button', { name: 'ログアウト' }).click();
  await expect(page.locator('#setup')).toBeVisible();
  expect(await stored(page, 'prefs')).toEqual([work.id, 1001]);
  await page.getByLabel('トークン', { exact: true }).fill(TOKEN);
  await page.getByRole('button', { name: 'パスキーで保管する' }).click();
  await openRepo(page, 'author/novel');
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\n枝の書きかけ\n');
  await expect(page.getByRole('button', { name: /⎇ side/ })).toBeVisible();
  await expect(page.locator('#sync-mode')).toHaveValue('manual');
  await page.clock.fastForward(120000);
  expect([work.text('chapters/01_first.md'), work.text('chapters/01_first.md', 'side')]).toEqual([
    WORK_FILES['chapters/01_first.md'],
    WORK_FILES['chapters/01_first.md'],
  ]);
  // their branch gone on GitHub: the default one opened; nothing sent by itself to it, 自動 too
  delete work.refs.side;
  await page.locator('#reload-work').click();
  await expect(page.locator('#toast')).toHaveText('side は GitHub にもう無いので、main を開きました');
  await expect(page.locator('#sync-state')).toHaveText(
    /^この端末の未送信の変更は、ブランチ side で書いたものです。いまは main を開いているので、自動では送りません/,
  );
  await page.locator('#sync-mode').selectOption('auto');
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  await page.clock.fastForward(61000);
  await expect(page.locator('#sync-state')).toHaveText(/^この端末の未送信の変更は、ブランチ side で書いたものです/);
  expect(work.text('chapters/01_first.md')).toBe(WORK_FILES['chapters/01_first.md']);
  // 送る asks; not wanted, nothing sent
  answers.push(false);
  await page.getByRole('button', { name: '送る（1）' }).click();
  expect(work.text('chapters/01_first.md')).toBe(WORK_FILES['chapters/01_first.md']);
  // another branch cannot be chosen; theirs can (made again from the one open), and they go there
  await page.getByRole('button', { name: /⎇ main/ }).click();
  await page.locator('#picker').getByRole('button', { name: 'other' }).click();
  await expect(page.locator('#toast')).toHaveText(/^未送信の変更は side で書いたものです。side に切り替えるか/);
  await page.getByRole('button', { name: /⎇ main/ }).click();
  await page.locator('#picker-input').fill('side');
  await page.locator('#picker').getByRole('button', { name: '決定' }).click();
  await expect(page.getByRole('button', { name: /⎇ side/ })).toBeVisible();
  await expect
    .poll(async () => {
      await page.clock.fastForward(61000);
      return work.text('chapters/01_first.md', 'side');
    })
    .toBe('# 第1話 はじまり\n\n枝の書きかけ\n');
  expect(work.text('chapters/01_first.md')).toBe(WORK_FILES['chapters/01_first.md']);
});

// NFR-SEC-16: another user's token where the drafts of the one before are left: asked without showing them; kept
// unless deleted
test('another user’s token on a device with the drafts of the one before: not kept unless they are deleted', async ({ page, gh }) => {
  await openWork(page);
  await page.locator('#body').fill('# 第1話 はじまり\n\n前の人の書きかけ\n');
  await expect.poll(async () => (await stored(page, 'drafts')).length).toBe(1);
  await toSettings(page);
  const answers = [false, false, true];
  page.on('dialog', d => void (answers.shift() ? d.accept() : d.dismiss()));
  await page.getByRole('button', { name: 'ログアウト' }).click();
  gh.tokens.push('someone-test-token');
  gh.logins['someone-test-token'] = 'someone';
  await page.getByLabel('トークン', { exact: true }).fill('someone-test-token');
  await page.getByRole('button', { name: 'パスキーで保管する' }).click();
  await expect(page.locator('#setup-error')).toHaveText(/^前のユーザーの書きかけを残すため、このトークンを保管しませんでした/);
  expect(await stored(page, 'vault')).toEqual([]);
  expect((await stored(page, 'drafts')).length).toBe(1);
  await page.getByRole('button', { name: 'パスキーで保管する' }).click();
  await expect(page.locator('#shelf')).toBeVisible();
  expect(await stored(page, 'drafts')).toEqual([]);
});
