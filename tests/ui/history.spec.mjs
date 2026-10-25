// 履歴: the versions of the open episode, this device's (ローカル履歴) and GitHub's, each in its tab; each compared with
// the one before and with the text now, or read whole; put back as a change not sent, the text before kept
// (FR-HIST-01〜04)
import { test, expect, openWork, WORK_FILES } from './lib/test.mjs';

test.use({ timezoneId: 'Asia/Tokyo' });

// FR-HIST-01, FR-HIST-02, FR-HIST-03
test("GitHub's versions listed; one compared with the one before, with now, read whole; put back as a change not sent", async ({ page, gh, work }) => {
  work.push({ 'chapters/01_first.md': '# 第1話 はじまり\n\n朝が来た。鳥が鳴いた。\n' });
  work.push({ 'chapters/02_second.md': '# 第2話 駅で\n\n変えた。\n' });
  work.push({ 'chapters/01_first.md': '# 第1話 はじまり\n\n夜になった。\n' });
  await openWork(page);
  await page.getByRole('button', { name: 'この話の履歴' }).click();
  const dlg = page.locator('#versions');
  await expect(page.locator('#versions-title')).toHaveText('「はじまり」の履歴');
  // this device's versions first: none yet
  await expect(dlg.locator('.history-tabs button.on')).toHaveText('ローカル履歴（0）');
  await expect(dlg.getByText('まだローカルの履歴はありません。この端末で書いていると、10 分おきに自動で残ります。')).toBeVisible();
  // the commits that changed this episode only, the newest first
  await dlg.getByRole('button', { name: 'GitHub 履歴（3）' }).click();
  await expect(dlg.locator('.version')).toHaveCount(3);
  await expect(dlg.locator('.version small')).toHaveText(['ほかの端末で', 'ほかの端末で', '最初']);
  await expect(dlg.locator('.version .tag').first()).toHaveText('GitHub');
  await dlg.locator('.version').nth(1).click();
  await expect(dlg.locator('.version-diff[data-for="before"] .diff ins')).toHaveText(['鳥が鳴いた。']);
  await expect(dlg.getByText('前の版（10/1 9:01、13 字）からこの版までの変更：1 か所')).toBeVisible();
  await dlg.getByRole('button', { name: '今と比べる' }).click();
  await expect(dlg.locator('.version-diff[data-for="now"] .diff')).toContainText('夜になった。');
  await dlg.getByRole('button', { name: '全文' }).click();
  await expect(dlg.getByLabel('この版の全文')).toHaveValue('# 第1話 はじまり\n\n朝が来た。鳥が鳴いた。\n');
  page.once('dialog', d => void d.accept());
  await dlg.getByRole('button', { name: 'この版を復元' }).click();
  await expect(dlg).toBeHidden();
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\n朝が来た。鳥が鳴いた。\n');
  await expect(page.locator('#save-state')).toHaveText('端末に保存済み（未送信）');
  // the tab chosen stays; the text before is in this device's versions, and the draft is a version too
  await page.getByRole('button', { name: 'この話の履歴' }).click();
  await expect(dlg.locator('.version .tag')).toHaveText(['GitHub', 'GitHub', 'GitHub']);
  await dlg.getByRole('button', { name: 'ローカル履歴（2）' }).click();
  await expect(dlg.locator('.version .tag')).toHaveText(['未送信', '自動']);
  await dlg.locator('.version').nth(1).click();
  await dlg.getByRole('button', { name: '全文' }).click();
  await expect(dlg.getByLabel('この版の全文')).toHaveValue('# 第1話 はじまり\n\n夜になった。\n');
  // back in the tab it was opened from
  await dlg.getByRole('button', { name: '‹ 履歴' }).click();
  await expect(dlg.locator('.version')).toHaveCount(2);
  await dlg.getByRole('button', { name: '閉じる' }).click();
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/01_first.md')).toBe('# 第1話 はじまり\n\n朝が来た。鳥が鳴いた。\n');
});

// FR-HIST-04
test('writing keeps a version on this device; the oldest version has none before it; putting back said no to changes nothing', async ({ page, gh }) => {
  await openWork(page);
  await page.locator('#body').fill('書き直した\n');
  await page.getByRole('button', { name: 'この話の履歴' }).click();
  const dlg = page.locator('#versions');
  await expect(dlg.locator('.version .tag')).toHaveText(['未送信', '自動']);
  await dlg.getByRole('button', { name: 'GitHub 履歴（1）' }).click();
  await dlg.locator('.version').nth(0).click();
  await expect(dlg.getByText('これより前の版はありません。')).toBeVisible();
  page.once('dialog', d => void d.dismiss());
  await dlg.getByRole('button', { name: 'この版を復元' }).click();
  await expect(dlg).toBeVisible();
  await dlg.getByRole('button', { name: '閉じる' }).click();
  await expect(page.locator('#body')).toHaveValue('書き直した\n');
});

test('an episode not on GitHub yet: only this device has versions', async ({ page, gh }) => {
  await openWork(page);
  await page.getByRole('button', { name: '＋ 話を追加' }).click();
  await page.getByRole('button', { name: 'この話の履歴' }).click();
  await expect(page.locator('#versions .version .tag')).toHaveText(['未送信']);
  await page.locator('#versions').getByRole('button', { name: 'GitHub 履歴（0）' }).click();
  await expect(page.locator('#versions').getByText('GitHub にはまだ履歴がありません（まだ送っていません）。')).toBeVisible();
  expect(gh.calls.some(c => c.includes('/commits?') && c.includes('04.md'))).toBe(false);
  expect(WORK_FILES['chapters/01_first.md']).toBeTruthy();
});

test("GitHub's versions not read (offline): said, this device's still listed", async ({ page, gh }) => {
  await openWork(page);
  await page.locator('#body').fill('書いた\n');
  gh.down = true;
  await page.getByRole('button', { name: 'この話の履歴' }).click();
  await expect(page.locator('#versions .version .tag')).toHaveText(['未送信', '自動']);
  await page.locator('#versions').getByRole('button', { name: 'GitHub 履歴（0）' }).click();
  await expect(page.locator('#versions .error')).toHaveText('GitHub の履歴を読めませんでした: GitHub につながりません（オフラインかもしれません）');
  await expect(page.locator('#versions .version')).toHaveCount(0);
});

// FR-HIST-01, FR-HIST-02: a version GitHub kept in no encoding the app reads: said, the list one tap away; a version
// read once shows its length in the list; the comparison chosen stays for the next version; one the same as now says so
test('a version not in UTF-8: said, back to the list; a version read shows its length; the comparison chosen stays', async ({ page, gh, work }) => {
  work.push({ 'chapters/01_first.md': /** @type {any} */ (Buffer.from([0x82, 0xff, 0xff])) });
  work.push({ 'chapters/01_first.md': '# 第1話 はじまり\n\n直す。\n' });
  work.push({ 'chapters/01_first.md': '# 第1話 はじまり\n\n直した。\n' });
  await openWork(page);
  await page.getByRole('button', { name: 'この話の履歴' }).click();
  const dlg = page.locator('#versions');
  // (nothing happens on a tap outside the buttons)
  await dlg.getByText('まだローカルの履歴はありません').click();
  await expect(dlg.locator('.history-tabs')).toBeVisible();
  await dlg.getByRole('button', { name: 'GitHub 履歴（4）' }).click();
  await dlg.locator('.version').nth(2).click();
  await expect(dlg.locator('.error')).toHaveText('この版は文字コードが UTF-8 ではないため開けません');
  await dlg.getByRole('button', { name: '‹ 履歴' }).click();
  // the newest, the same as now
  await dlg.locator('.version').nth(0).click();
  await expect(dlg.getByText('この版から今の本文（12 字）までの変更：ありません')).toBeHidden();
  await dlg.getByRole('button', { name: '今と比べる' }).click();
  await expect(dlg.getByText('この版から今の本文（12 字）までの変更：ありません')).toBeVisible();
  await dlg.getByRole('button', { name: '‹ 履歴' }).click();
  await expect(dlg.locator('.version small').first()).toHaveText('12 字 ・ ほかの端末で');
  await dlg.locator('.version').nth(3).click();
  await expect(dlg.locator('.version-diff[data-for="now"]')).toBeVisible();
  await expect(dlg.locator('.version-diff[data-for="before"]')).toBeHidden();
});

// FR-HIST-03: the version not sent yet, read whole
test('the version not sent yet: said as such', async ({ page, gh }) => {
  await openWork(page);
  await page.locator('#body').fill('書いている\n');
  await page.getByRole('button', { name: 'この話の履歴' }).click();
  const dlg = page.locator('#versions');
  await dlg.locator('.version', { hasText: '未送信' }).click();
  await expect(dlg.locator('.hist-head')).toContainText('まだ送っていない版');
});

// FR-HIST-01: closed while GitHub's versions or a version's text are still on their way: nothing shown afterwards
test('closed while reading: what arrives later is not shown', async ({ page, gh }) => {
  await openWork(page);
  const dlg = page.locator('#versions');
  /** @type {() => void} */
  let release = () => {};
  let gate = new Promise(r => (release = () => r(undefined)));
  let arrived = false;
  await page.route('https://api.github.com/repos/author/novel/commits?**', async route => {
    arrived = true;
    await gate;
    await route.fallback();
  });
  await page.getByRole('button', { name: 'この話の履歴' }).click();
  await expect.poll(() => arrived).toBe(true);
  await dlg.getByRole('button', { name: '閉じる' }).click();
  release();
  await expect.poll(() => gh.calls.some(c => c.includes('/commits?'))).toBe(true);
  await expect(dlg).toBeHidden();
  await page.unroute('https://api.github.com/repos/author/novel/commits?**');
  // a version's text on its way
  arrived = false;
  gate = new Promise(r => (release = () => r(undefined)));
  await page.route('https://api.github.com/repos/author/novel/contents/**', async route => {
    arrived = true;
    await gate;
    await route.fallback();
  });
  await page.getByRole('button', { name: 'この話の履歴' }).click();
  await dlg.getByRole('button', { name: 'GitHub 履歴（1）' }).click();
  await dlg.locator('.version').nth(0).click();
  await expect.poll(() => arrived).toBe(true);
  await dlg.getByRole('button', { name: '閉じる' }).click();
  release();
  await expect.poll(() => gh.calls.some(c => c.includes('/contents/'))).toBe(true);
  await page.getByRole('button', { name: 'この話の履歴' }).click();
  await expect(dlg.locator('.version')).toHaveCount(1);
});
