// Offline: the service worker keeps the app's files, the device keeps the work as last read; writing goes on, and is
// sent once GitHub is reached again. The manifest makes it an app on the home screen
import { test, expect, openWork, stored } from './lib/test.mjs';

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

test('the manifest: a standalone app from this folder, its icons there', async ({ page, request }) => {
  const res = await request.get('manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m).toMatchObject({ start_url: './', scope: './', display: 'standalone', lang: 'ja' });
  for (const icon of m.icons) expect((await request.get(icon.src)).ok()).toBe(true);
});
