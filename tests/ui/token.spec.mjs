// A device started with a token, before that way of starting was taken away (DESK-OPS-04): when it is opened, the token
// kept is deleted and the first screen says so, with the way to start again; the drafts not sent and the copies of the
// works stay, and the App made again by the same account sends the drafts
import { test, expect, openWork, startApp, stored } from './lib/test.mjs';

// What this origin's IndexedDB keeps made as a version with tokens left it: the App's key taken out, and a token kept in
// its place as those versions kept one without a passkey (encrypted with a WebCrypto key that cannot be taken out). The
// token is made up for the test
/** @param {import('@playwright/test').Page} page */
const asTokenDevice = page =>
  page.evaluate(async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode('test-token-not-real'));
    const db = /** @type {IDBDatabase} */ (
      await new Promise((resolve, reject) => {
        const req = indexedDB.open('novel-writer-js');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
    );
    await new Promise((resolve, reject) => {
      const tx = db.transaction('vault', 'readwrite');
      tx.objectStore('vault').delete('app');
      tx.objectStore('vault').put({ kind: 'local', key, iv, data }, 'token');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });

// DESK-OPS-04
test('DESK-OPS-04: a device started with a token: the token deleted and said on the first screen; the drafts and copies kept, sent by the same account’s App', async ({
  page,
  gh,
  work,
}) => {
  void gh;
  await openWork(page);
  await page.locator('#body').fill('# 第1話 はじまり\n\nトークンのころの書きかけ\n');
  await expect.poll(async () => (await stored(page, 'drafts')).length).toBe(1);
  await asTokenDevice(page);
  const [drafts, snapshots, prefs] = [await stored(page, 'drafts'), await stored(page, 'snapshots'), await stored(page, 'prefs')];
  // opened: the token deleted, said, and the first screen (nothing else deleted)
  await page.reload();
  await expect(page.locator('#setup')).toBeVisible();
  const gone = page.locator('#token-gone');
  await expect(gone).toBeVisible();
  await expect(gone).toContainText('トークンで始める方法は無くなりました');
  await expect(gone).toContainText('「GitHub App を作って始める」で始め直してください');
  await expect(gone.getByRole('link', { name: 'トークンの一覧' })).toHaveAttribute('href', 'https://github.com/settings/personal-access-tokens');
  expect(await stored(page, 'vault')).toEqual([]);
  expect(await stored(page, 'drafts')).toEqual(drafts);
  expect(await stored(page, 'snapshots')).toEqual(snapshots);
  expect(await stored(page, 'prefs')).toEqual(prefs);
  // opened again: the first screen, not said again (the token is gone)
  await page.reload();
  await expect(page.locator('#setup')).toBeVisible();
  await expect(gone).toBeHidden();
  // the App made by the same account: the work on the list, its draft sent
  await startApp(page);
  await expect(page.locator('#works [data-repo="author/novel"]')).toBeVisible();
  await page.locator('#works [data-repo="author/novel"]').click();
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\nトークンのころの書きかけ\n');
  await page.getByRole('button', { name: 'これでよい' }).click();
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/01_first.md')).toBe('# 第1話 はじまり\n\nトークンのころの書きかけ\n');
});
