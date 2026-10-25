// On an iPhone's width (a finger): the table of contents is a drawer. The controls are drawn as the server version's
// (docs/server-differences.md: the 44×44 of NFR-USE-02 is not applied, as the server version does not apply it yet)
import { test, expect, openWork } from './lib/test.mjs';

// the table of contents (a drawer on a phone) opened
/** @param {import('@playwright/test').Page} page */
async function openToc(page) {
  if (await page.locator('#desk.toc-open').count()) return;
  await page.locator('#open-toc').click();
}

test.describe('on an iPhone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, actionTimeout: 10000 });

  // the table of contents opened while the work is read again stays open, and what is in it is pressed with a finger
  // (it closed when the reading ended: 資料 was out of reach)
  test('the table of contents stays open when the work is read again, and 資料 in it is pressed', async ({ page, gh }) => {
    await openWork(page);
    await openToc(page);
    await page.locator('#reload-work').click();
    await expect(page.locator('#sync-state')).toHaveText(/^GitHub から読みました/);
    await expect(page.locator('#desk')).toHaveClass(/toc-open/);
    await page.getByRole('button', { name: '資料', exact: true }).click();
    await expect(page.locator('#notes')).toBeVisible();
  });
  // ☰ opens the drawer (as the server version's: it does not close it); a tap on the dark part closes it
  test('☰ opens the table of contents; a tap beside it closes it', async ({ page, gh }) => {
    await openWork(page);
    await page.locator('#open-toc').click();
    await expect(page.locator('#desk')).toHaveClass(/toc-open/);
    await page.locator('#scrim').click({ position: { x: 380, y: 400 } });
    await expect(page.locator('#desk')).not.toHaveClass(/toc-open/);
  });
});
