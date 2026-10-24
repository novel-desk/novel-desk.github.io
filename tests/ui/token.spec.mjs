// The token: kept encrypted with a passkey (PRF), or without PRF with a key that cannot be taken out; the CSP; the
// repositories it can read
import { test, expect, noPasskey, openWork, stored, TOKEN } from './lib/test.mjs';

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
    await putToken(page);
    await expect(page.getByRole('button', { name: /author\/novel/ })).toBeVisible();
    await expect(page.locator('#vault-kind')).toHaveText(/パスキー（PRF）から作った鍵で暗号化/);
    const [vault] = /** @type {any[]} */ (await stored(page, 'vault'));
    expect(Object.keys(vault).sort()).toEqual(['credentialId', 'data', 'iv', 'kind', 'salt']);
    expect(vault.kind).toBe('prf');
    // the token is not in what is kept
    expect(JSON.stringify(Object.values(vault.data))).not.toContain(JSON.stringify([...Buffer.from(TOKEN)].slice(0, 6)).slice(1, -1));
    await page.reload();
    await expect(page.locator('#unlock')).toBeVisible();
    await page.getByRole('button', { name: 'パスキーで開く' }).click();
    await page.getByRole('button', { name: /author\/novel/ }).click();
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
});

test('no passkey in this browser: kept with a key that cannot be taken out; opened without asking', async ({ page, gh }) => {
  await noPasskey(page);
  await putToken(page);
  await expect(page.locator('#vault-kind')).toHaveText(/PRF に対応していないため/);
  const [vault] = /** @type {any[]} */ (await stored(page, 'vault'));
  expect(vault.kind).toBe('local');
  expect(await page.evaluate(() => 'PublicKeyCredential' in window && window.PublicKeyCredential)).toBeFalsy();
  await page.reload();
  await expect(page.getByRole('button', { name: /author\/novel/ })).toBeVisible();
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

test('the repositories: every page of them; the one chosen is remembered; a token GitHub refuses is said', async ({ page, gh }) => {
  gh.perPage = 1;
  await openWork(page);
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  await expect(page.locator('#repo-list .work b')).toHaveText(['試験の作品', 'other']);
  await expect(page.locator('#repo-list .work small')).toHaveText([/author\/novel（main）非公開$/, /author\/other（main）公開$/]);
  await page.getByRole('button', { name: '戻る' }).click();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  gh.fail = () => 401;
  await page.getByRole('button', { name: 'ほかの作品' }).click();
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
  await page.getByRole('button', { name: /author\/novel/ }).click();
  await expect(page.locator('#token-notice')).toBeVisible();
  const [before] = /** @type {any[]} */ (await stored(page, 'vault'));
  // regenerated on GitHub: the old value no longer taken
  gh.tokens = ['new-test-token-not-real'];
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
  await page.reload();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await expect(page.locator('#token-notice')).toBeHidden();
});

// NFR-USE-01: a token GitHub refuses (expired, deleted) is said with what to do, and a new one put in its place
test('a token GitHub refuses: said, with the way to put a new one in; a token that does not work is not kept', async ({ page, gh }) => {
  await openWork(page);
  await expect(page.locator('#token-notice')).toBeHidden();
  gh.tokens = ['new-test-token-not-real'];
  await page.getByRole('button', { name: '再読み込み' }).click();
  await expect(page.locator('#token-notice-text')).toHaveText(/^GitHub がトークンを断りました（期限が切れたか、消されたかもしれません）。/);
  await page.getByRole('button', { name: '新しいトークンを入れる' }).click();
  await page.getByLabel('新しいトークン', { exact: true }).fill('wrong-token');
  await page.getByRole('button', { name: 'パスキーで保管する' }).click();
  await expect(page.locator('#token-replace-error')).toHaveText(/^このトークンは使えません: トークンが使えません/);
  await page.getByLabel('新しいトークン', { exact: true }).fill('new-test-token-not-real');
  await page.getByRole('button', { name: 'パスキーで保管する' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  await expect(page.locator('#token-notice')).toBeHidden();
});
