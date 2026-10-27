// 利用規約 (DESK-OPS-02): shown on starting (the button pressed to make the App) when not agreed to on this device; to
// one started before, when it is opened and they changed; read again from the settings
import { test, expect, keepMoreOpen, noPasskey, toSettings, TERMS } from './lib/test.mjs';

test.use({ agreed: false });

/** @param {import('@playwright/test').Page} page */
const makeApp = page => page.getByRole('button', { name: 'GitHub App を作成して始める' }).click();
// the work opened (the App installed on it only), whose the commits are taken as proposed
/** @param {import('@playwright/test').Page} page */
async function opened(page) {
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await page.getByRole('button', { name: 'これでよい' }).click();
}

// DESK-OPS-02
test('making the App: the 利用規約 first; 戻る, back to the first screen; agreed to, on to GitHub, kept; not asked again', async ({ page, gh }) => {
  await noPasskey(page);
  await keepMoreOpen(page);
  await page.goto('./');
  // the first screen first (adding it to the home screen seen before anything is agreed to)
  await expect(page.locator('#setup')).toBeVisible();
  await makeApp(page);
  await expect(page.locator('#terms')).toBeVisible();
  await expect(page.locator('#terms')).toContainText('ベータ版');
  await expect(page.locator('#terms')).toContainText(/第 \d+ 版（\d{4} 年 \d+ 月 \d+ 日）/);
  await expect(page.locator('#terms')).toContainText('作者個人が事業としてではなく');
  await expect(page.locator('#terms')).toContainText('公開を予告なく急にやめる');
  await expect(page.locator('#terms')).toContainText('作者のもとにはデータが何も残りません');
  await expect(page.locator('#terms a')).toHaveAttribute('href', 'https://github.com/novel-desk/novel-desk.github.io');
  await expect(page.locator('#terms')).toContainText('利用者が自分の責任で管理');
  await expect(page.locator('#terms')).toContainText('作者は一切の責任を負いません');
  // 戻る: the first screen again, nothing kept, nothing sent to GitHub
  await page.getByRole('button', { name: '戻る' }).click();
  await expect(page.locator('#setup')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('terms'))).toBeNull();
  expect(gh.manifests).toHaveLength(0);
  // agreed to: on to GitHub at once (not pressed again)
  await makeApp(page);
  await page.getByRole('button', { name: '同意して始める' }).click();
  await opened(page);
  expect(gh.manifests).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem('terms'))).toBe(TERMS);
  // opened again: straight in
  await page.reload();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  // read again from the settings: nothing to agree to, back to the settings
  await toSettings(page);
  await page.getByRole('button', { name: '利用規約を読む' }).click();
  await expect(page.locator('#terms')).toBeVisible();
  await expect(page.locator('#agree-terms')).toBeHidden();
  await page.getByRole('button', { name: '戻る' }).click();
  await expect(page.locator('#settings')).toBeVisible();
});

// DESK-OPS-02: started before the 利用規約 (or agreed to ones that changed since): asked when opened, nothing to go
// back to; agreed to, opened as before
test('started before, the 利用規約 changed since: asked when opened; agreed to, opened', async ({ page, gh }) => {
  void gh;
  await noPasskey(page);
  await page.goto('./');
  await page.evaluate(v => localStorage.setItem('terms', v), TERMS);
  await makeApp(page);
  await opened(page);
  await page.evaluate(() => localStorage.setItem('terms', '0'));
  await page.reload();
  await expect(page.locator('#terms')).toBeVisible();
  await expect(page.locator('#close-terms')).toBeHidden();
  await page.getByRole('button', { name: '同意して始める' }).click();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
});

// DESK-OPS-02: this device's storage not to be read or written (a browser that blocks it): agreed to for the time the
// page is open
test('the storage not to be used: the 利用規約 agreed to while the page is open', async ({ page, gh }) => {
  void gh;
  await noPasskey(page);
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException('test', 'SecurityError');
    };
    Storage.prototype.setItem = () => {
      throw new DOMException('test', 'SecurityError');
    };
  });
  await page.goto('./');
  await makeApp(page);
  await page.getByRole('button', { name: '同意して始める' }).click();
  // (back from GitHub with the App made: agreed to where it was started; back from installing it, a page loaded again:
  // asked again, as nothing could be kept)
  await page.getByRole('button', { name: '同意して始める' }).click();
  await opened(page);
  await toSettings(page);
  await page.getByRole('button', { name: '利用規約を読む' }).click();
  await page.getByRole('button', { name: '戻る' }).click();
  await expect(page.locator('#settings')).toBeVisible();
});
