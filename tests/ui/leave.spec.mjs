// 連携をやめるとき、連携が切れたとき (DESK-OPS-03): the settings ask GitHub whether it still takes the connection; refused
// (the App or the token deleted on GitHub), said so, with the way to start again; the steps to stop, for the way it is
// connected (an App made here: the page on GitHub to delete it on)
import { test, expect, keepMoreOpen, noPasskey, openWork, toSettings } from './lib/test.mjs';

// DESK-OPS-03
test('the App deleted on GitHub: the settings say the connection is gone; logged out, the App made again from the first screen', async ({ page, gh }) => {
  gh.installRepos = ['author/novel'];
  await noPasskey(page);
  await keepMoreOpen(page);
  await page.goto('./');
  await page.getByRole('button', { name: 'GitHub App を作って始める' }).click();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await page.getByRole('button', { name: 'これでよい' }).click();
  const slug = /** @type {{ slug: string }} */ ([...gh.codes.values()].at(-1)).slug;
  await toSettings(page);
  await expect(page.locator('#gh-state')).toHaveText('GitHub App で連携しています');
  await expect(page.locator('#me')).toHaveText('GitHub の author');
  await expect(page.locator('#relink')).toBeHidden();
  // the steps to stop: the App's own page to delete it on; nothing of a token
  await page.getByText('連携をやめるとき').click();
  const link = page.locator('#leave-app-link');
  await expect(link).toHaveAttribute('href', `https://github.com/settings/apps/${slug}/advanced`);
  await expect(link).toHaveText(`「${slug}」の Advanced のページ`);
  await expect(page.locator('#leave-app')).toContainText('インストールも一緒に外れます');
  await expect(page.locator('#leave-token')).toBeHidden();
  // deleted on GitHub: said when the settings are opened again
  await page.getByRole('button', { name: '‹ 戻る' }).click();
  gh.app = null;
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await expect(page.locator('#gh-state')).toContainText('GitHub App の連携が切れています');
  await expect(page.locator('#me')).toHaveText('');
  await page.getByRole('button', { name: 'ログアウトして、App を作り直す' }).click();
  await expect(page.locator('#setup')).toBeVisible();
  await expect(page.getByRole('button', { name: 'GitHub App を作って始める' })).toBeVisible();
});

// DESK-OPS-03
test('the token deleted on GitHub: the settings say the connection is gone; a new token put in from there', async ({ page, gh }) => {
  await openWork(page);
  await toSettings(page);
  await expect(page.locator('#gh-state')).toHaveText('トークンで連携しています');
  await expect(page.locator('#relink')).toBeHidden();
  await page.getByText('連携をやめるとき').click();
  await expect(page.locator('#leave-token a')).toHaveAttribute('href', 'https://github.com/settings/personal-access-tokens');
  await expect(page.locator('#leave-app')).toBeHidden();
  await page.getByRole('button', { name: '‹ 戻る' }).click();
  gh.tokens = [];
  // (the list read again on the way back, refused: the notice said first, put off)
  await page.getByRole('button', { name: 'あとで' }).click();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await expect(page.locator('#gh-state')).toContainText('トークンの連携が切れています');
  await page.locator('#relink').click();
  await expect(page.locator('#token-replace')).toBeVisible();
});

// DESK-OPS-03: GitHub not reached (or failing): not said to be gone
test('GitHub failing: the connection not said to be gone', async ({ page, gh }) => {
  await openWork(page);
  gh.fail = (method, path) => (path === '/user' ? 500 : undefined);
  await toSettings(page);
  await expect(page.locator('#me')).toHaveText('');
  await expect(page.locator('#gh-state')).toHaveText('トークンで連携しています');
  await expect(page.locator('#relink')).toBeHidden();
});
