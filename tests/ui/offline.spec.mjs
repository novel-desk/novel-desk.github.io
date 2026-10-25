// Offline: the service worker keeps the app's files, the device keeps the work as last read; writing goes on, and is
// sent once GitHub is reached again. The manifest makes it an app on the home screen
import { test, expect, noPasskey, openWork, stored } from './lib/test.mjs';

test.describe('with the service worker', () => {
  test.use({ serviceWorkers: 'allow' });
  // Chrome only: in WebKit, Playwright's routing does not see the requests of a page that a service worker controls, so
  // the page would reach the real GitHub instead of the fake
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebKit: routing does not see the requests of a page under a service worker');
  test('opened and written offline, sent when back', async ({ page, context, gh, work }) => {
    await openWork(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await expect(page.locator('#episode-title')).toHaveValue('はじまり');
    gh.down = true;
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#sync-state')).toHaveText('オフラインです。前に読んだ版を出しています（送るのはつながってから）');
    await page.locator('#tree .node', { hasText: '坂の上' }).click();
    await page.locator('#body').fill('オフラインで書いた\n');
    await expect.poll(async () => (await stored(page, 'drafts')).length).toBe(1);
    await context.setOffline(false);
    gh.down = false;
    await page.getByRole('button', { name: '送る（1）' }).click();
    await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
    expect(work.text('chapters/03_part/01_third.md')).toBe('オフラインで書いた\n');
  });
});

// FR-APP-02: a new version taken over by its worker: the page loaded again when nothing typed is lost (when the desk
// is left), the text written kept
test.describe('a new version', () => {
  test.use({ serviceWorkers: 'allow' });
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebKit: routing does not see the requests of a page under a service worker');
  test('switched to when the desk is left, the text written kept', async ({ page, gh }) => {
    await openWork(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.locator('#tree .node', { hasText: '駅で' }).click();
    await page.locator('#sync-mode').selectOption('manual');
    await page.locator('#body').fill('# 第2話 駅で\n\n新しい版の前に\n');
    await page.evaluate(() => {
      Object.assign(window, { before: true });
      navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
    });
    // writing: not loaded again
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => 'before' in window)).toBe(true);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => page.evaluate(() => 'before' in window).catch(() => true)).toBe(false);
    await expect(page.locator('#body')).toHaveValue('# 第2話 駅で\n\n新しい版の前に\n');
  });
});

// FR-APP-02, FR-SAVE-02: the copies of the app's files: the ones of an older version deleted when the new worker takes
// over; a file kept only when it came back whole (a failed answer leaves the copy before); offline, the copy given, and a
// file without one fails as the network does. The check for a new version failing changes nothing
test.describe('the copies for offline', () => {
  test.use({ serviceWorkers: 'allow' });
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebKit: routing does not see the requests of a page under a service worker');
  test('an older version’s deleted; a failed answer not kept; offline, the copy or a failure', async ({ page, context, gh }) => {
    await noPasskey(page);
    // (a page of the site without the app: the copies an older version kept)
    await page.goto('./manifest.webmanifest');
    await page.evaluate(() => caches.open('novel-writer-js-v1').then(c => c.put('old', new Response('old'))));
    await openWork(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => caches.keys())).toEqual([expect.stringMatching(/^novel-writer-js-v\d+$/)]);
    expect(await page.evaluate(() => caches.keys())).not.toContain('novel-writer-js-v1');
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    // (opened as pages: the app's page lets its scripts reach nothing but GitHub's API)
    const other = await context.newPage();
    const kept = await (await other.goto('style.css'))?.text();
    await context.route('**/style.css', route => route.fulfill({ status: 503, body: 'down' }));
    expect((await other.goto('style.css'))?.status()).toBe(503);
    await context.unroute('**/style.css');
    await page.evaluate(async () => {
      const name = (await caches.keys())[0];
      await (await caches.open(name)).delete(new URL('icon.svg', location.href).href);
    });
    /** @type {string[]} */
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // (the check for a new version failing: GitHub Pages not reached, say)
    await page.evaluate(() => {
      ServiceWorkerRegistration.prototype.update = async function () {
        Object.assign(window, { checked: true });
        throw new TypeError('test');
      };
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => page.evaluate(() => 'checked' in window)).toBe(true);
    await expect(page.locator('#body')).toBeEnabled();
    expect(errors).toEqual([]);
    gh.down = true;
    await context.setOffline(true);
    expect(await (await other.goto('style.css'))?.text()).toBe(kept);
    expect(
      await other.goto('icon.svg').then(
        () => 'got',
        () => 'failed',
      ),
    ).toBe('failed');
    await context.setOffline(false);
  });
});

// FR-APP-02: a new version while a send is on its way: not loaded again until it is done
test.describe('a new version while sending', () => {
  test.use({ serviceWorkers: 'allow' });
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebKit: routing does not see the requests of a page under a service worker');
  test('switched to once the send is done', async ({ page, gh, work }) => {
    await openWork(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.locator('#sync-mode').selectOption('manual');
    await page.locator('#body').fill('# 第1話 はじまり\n\n送っている間に\n');
    /** @type {() => void} */
    let release = () => {};
    const gate = new Promise(r => (release = () => r(null)));
    let held = false;
    await page.route('https://api.github.com/repos/author/novel/git/refs/heads/main', async route => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      held = true;
      await gate;
      return route.fallback();
    });
    await page.getByRole('button', { name: '送る（1）' }).click();
    await expect.poll(() => held).toBe(true);
    await page.evaluate(() => {
      Object.assign(window, { before: true });
      navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // sending: not loaded again
    await expect(page.locator('#send')).toBeDisabled();
    expect(await page.evaluate(() => 'before' in window)).toBe(true);
    release();
    await expect.poll(() => page.evaluate(() => 'before' in window).catch(() => true)).toBe(false);
    expect(work.text('chapters/01_first.md')).toBe('# 第1話 はじまり\n\n送っている間に\n');
  });
});

test('the manifest: a standalone app from this folder, its icons there', async ({ page, request }) => {
  const res = await request.get('manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m).toMatchObject({ start_url: './', scope: './', display: 'standalone', lang: 'ja' });
  for (const icon of m.icons) expect((await request.get(icon.src)).ok()).toBe(true);
});
