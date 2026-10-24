// 履歴: the versions of the open episode, from this device and from GitHub; each compared with the one before and
// with the text now, or read whole; put back as a change not sent, the text before kept (FR-HIST-01〜04)
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
  // the commits that changed this episode only, the newest first
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
  await expect(page.locator('#save-state')).toHaveText('未送信（この端末に保存しました）');
  // the text before is in this device's versions; the draft is a version too
  await page.getByRole('button', { name: 'この話の履歴' }).click();
  await expect(dlg.locator('.version .tag')).toHaveText(['未送信', '自動', 'GitHub', 'GitHub', 'GitHub']);
  await dlg.locator('.version').nth(1).click();
  await dlg.getByRole('button', { name: '全文' }).click();
  await expect(dlg.getByLabel('この版の全文')).toHaveValue('# 第1話 はじまり\n\n夜になった。\n');
  await dlg.getByRole('button', { name: '‹ 履歴' }).click();
  await expect(dlg.locator('.version')).toHaveCount(5);
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
  await expect(dlg.locator('.version .tag')).toHaveText(['未送信', '自動', 'GitHub']);
  await dlg.locator('.version').nth(2).click();
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
  expect(gh.calls.some(c => c.includes('/commits?') && c.includes('04.md'))).toBe(false);
  expect(WORK_FILES['chapters/01_first.md']).toBeTruthy();
});

test("GitHub's versions not read (offline): said, this device's still listed", async ({ page, gh }) => {
  await openWork(page);
  await page.locator('#body').fill('書いた\n');
  gh.down = true;
  await page.getByRole('button', { name: 'この話の履歴' }).click();
  await expect(page.locator('#versions .error')).toHaveText('GitHub の履歴を読めませんでした: GitHub につながりません（オフラインかもしれません）');
  await expect(page.locator('#versions .version .tag')).toHaveText(['未送信', '自動']);
});
