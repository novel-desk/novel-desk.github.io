// Adding the app to the home screen (FR-APP-03): the first screen says how on an iPhone in a tab of Safari, and why the
// token goes in only after; a browser that offers to install it gets a button; opened from the home screen, nothing
import { test, expect, noPasskey } from './lib/test.mjs';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

test.describe('an iPhone', () => {
  test.use({ userAgent: IPHONE, viewport: { width: 390, height: 844 } });
  test('in a tab of Safari: the steps, and why it is added first', async ({ page, gh }) => {
    await noPasskey(page);
    await page.goto('./');
    const hint = page.locator('#install-ios');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('Safari のタブとホーム画面のアプリでは、この端末の保存場所が別になります');
    await expect(hint).toContainText('「ホーム画面に追加」');
    await expect(page.locator('#install-app')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
  test('opened from the home screen: nothing said', async ({ page, gh }) => {
    await noPasskey(page);
    await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }));
    await page.goto('./');
    await expect(page.getByLabel('トークン', { exact: true })).toBeVisible();
    await expect(page.locator('#install-ios')).toBeHidden();
  });
});
test('a browser that offers to install the app: a button that asks it; nothing before the offer', async ({ page, gh }) => {
  await noPasskey(page);
  await page.goto('./');
  await expect(page.getByLabel('トークン', { exact: true })).toBeVisible();
  await expect(page.locator('#install-app')).toBeHidden();
  await expect(page.locator('#install-ios')).toBeHidden();
  await page.evaluate(() => {
    const e = /** @type {any} */ (new Event('beforeinstallprompt', { cancelable: true }));
    e.prompt = async () => {
      /** @type {any} */ (window).asked = true;
    };
    dispatchEvent(e);
  });
  await page.getByRole('button', { name: 'インストール' }).click();
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).asked)).toBe(true);
  await expect(page.locator('#install-app')).toBeHidden();
});
