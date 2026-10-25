// The app's page itself: the colour and the screen's size on the list of works (FR-APP-01, FR-APP-05) where the
// browser keeps nothing for it, a browser without a service worker or one that will not take it (FR-APP-02), and this
// device's store that cannot be opened or is full (NFR-USE-01)
import { test, expect, noPasskey, openWork } from './lib/test.mjs';

// FR-APP-01: a browser that lets the page keep nothing (localStorage refused): the colour 自動, and one chosen still
// shown; a tap between the buttons changes nothing
test('the colour where the browser keeps nothing for the page: 自動, and one chosen shown all the same', async ({ page, gh }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('test', 'SecurityError');
      },
    }),
  );
  await openWork(page);
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  await expect(page.locator('[data-theme-pick=""]')).toHaveClass(/on/);
  await page.locator('[data-theme-pick="dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('#theme-pick').dispatchEvent('click');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  // (a tap on the list between its works: nothing opened)
  await page.locator('#repo-list .work').first().waitFor();
  await page.locator('#repo-list').dispatchEvent('click');
  await expect(page.locator('#repos')).toBeVisible();
});

// FR-APP-05: opened as the app on the home screen: said so with the screen's size
test('the screen as the app on the home screen: said so', async ({ page, gh }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }));
  await openWork(page);
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  await expect(page.locator('#screen-info')).toHaveText(/（ホーム画面のアプリ）$/);
});

// FR-APP-02, NFR-PORT-01: a browser without service workers, and one that refuses to take the app's: the app works the
// same (only the copies for offline are not kept)
for (const [what, init] of /** @type {const} */ ([
  ['without service workers', 'none'],
  ['refusing the app’s service worker', 'refused'],
]))
  test(`a browser ${what}: the work opened and written as before`, async ({ page, gh }) => {
    await page.addInitScript(how => {
      if (how === 'none') delete (/** @type {any} */ (Navigator.prototype).serviceWorker);
      else ServiceWorkerContainer.prototype.register = () => Promise.reject(new Error('test'));
    }, init);
    await openWork(page);
    await page.locator('#body').fill('# 第1話 はじまり\n\n書けた\n');
    await expect(page.locator('#send')).toHaveText('送る（1）');
    expect(await page.evaluate(() => 'serviceWorker' in navigator)).toBe(init !== 'none');
  });

// NFR-USE-01: this device's store made by a newer version of the app (opened again in an older one): said on the first
// screen, not a blank page
test('the store on this device cannot be opened: said on the first screen', async ({ page, gh }) => {
  await noPasskey(page);
  // (a page of the same site without the app: the store made there at a version the app does not know)
  await page.goto('./manifest.webmanifest');
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('novel-writer-js', 2);
        req.onsuccess = () => {
          req.result.close();
          resolve(null);
        };
        req.onerror = () => reject(req.error);
      }),
  );
  await page.goto('./');
  await expect(page.locator('#setup')).toBeVisible();
  await expect(page.locator('#setup-error')).toHaveText(/^この端末の保存場所を開けません（.+）$/);
});

// NFR-USE-01, FR-SAVE-01: this device's storage full (a write's transaction aborted with QuotaExceededError, as the
// browser does): the text typed stays on the screen, and that it is not kept is said
test('this device’s storage full: what is typed stays on the screen, and not being kept is said', async ({ page, gh }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const req = put.apply(this, args);
      if (/** @type {any} */ (window).full) {
        Object.defineProperty(this.transaction, 'error', { value: new DOMException('test', 'QuotaExceededError') });
        this.transaction.abort();
      }
      return req;
    };
  });
  await openWork(page);
  await page.evaluate(() => Object.assign(window, { full: true }));
  await page.locator('#body').fill('# 第1話 はじまり\n\n満杯\n');
  await expect(page.locator('#sync-state')).toHaveText('この端末に保存できませんでした（test）');
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\n満杯\n');
});
