// 記録: how much the work grew each day and month, as bars and a table: the days before this device kept the record
// from the commits on GitHub (each day's last), today from what is written here (FR-WORK-08)
import { test, expect, openWork } from './lib/test.mjs';

test.use({ timezoneId: 'Asia/Tokyo' });

test("the days from GitHub's commits, today from the device; the months; counted from GitHub once", async ({ page, gh, work }) => {
  // (the work's first commit: 2026-10-01, 37 characters)
  work.clock = Date.parse('2026-10-03T03:00:00Z');
  work.push({ 'chapters/01_first.md': '# 第1話 はじまり\n\n朝が来た。昼になった。\n' });
  work.clock = Date.parse('2026-10-03T05:00:00Z');
  work.push({ 'chapters/02_second.md': '# 第2話 駅で\n\n電車を待つ。来ない。\n' });
  work.clock = Date.parse('2026-10-05T03:00:00Z');
  work.push({ 'chapters/02_second.md': '# 第2話 駅で\n\n電車。\n' });
  await openWork(page);
  await page.locator('#body').press('Control+End');
  await page.keyboard.type('あいう');
  await page.getByRole('button', { name: '記録', exact: true }).click();
  const days = page.locator('.rec-table').first().locator('tbody tr');
  await expect(days.first()).toContainText(/\d{4}-\d{2}-\d{2}/);
  // the newest first: today (written here), then 10/5, 10/3, 10/1 (the first: its start not known)
  await expect(days.nth(1)).toHaveText('2026-10-05−7字40字');
  await expect(days.nth(2)).toHaveText('2026-10-03＋10字47字');
  await expect(days.nth(3)).toHaveText('2026-10-01—37字');
  await expect(days.nth(0)).toHaveText(/^\d{4}-\d{2}-\d{2}＋3字43字$/);
  await expect(page.locator('.rec-chart')).toHaveCount(2);
  const months = page.locator('.rec-table').nth(1).locator('tbody tr');
  await expect(months.last()).toHaveText('2026-10—43字');
  // counted once: opened again, GitHub is not asked for the commits again
  const asked = gh.calls.filter(c => c.includes('/commits?sha=main&per_page=100')).length;
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await page.getByRole('button', { name: '記録', exact: true }).click();
  await expect(days.nth(3)).toHaveText('2026-10-01—37字');
  expect(gh.calls.filter(c => c.includes('/commits?sha=main&per_page=100')).length).toBe(asked);
});

test("GitHub's commits not read (offline): the days of this device only, said", async ({ page, gh }) => {
  await openWork(page);
  await page.locator('#body').press('Control+End');
  await page.keyboard.type('あ');
  gh.down = true;
  await page.getByRole('button', { name: '記録', exact: true }).click();
  await expect(page.locator('#record-body .error')).toHaveText(/^GitHub の履歴を読めませんでした（GitHub につながりません/);
  await expect(page.locator('.rec-table').first().locator('tbody tr')).toHaveCount(1);
});

// FR-WORK-08: a day this device noted (GitHub not reached then) is not counted again from GitHub when it is read later;
// an episode no encoding reads counts as nothing
test('a day noted here before GitHub was read: kept as noted; an episode not in UTF-8 counted as nothing', async ({ page, gh, work }) => {
  await page.clock.install({ time: new Date('2026-10-05T12:00:00+09:00') });
  work.clock = Date.parse('2026-10-03T03:00:00Z');
  work.push({ 'chapters/02_second.md': /** @type {any} */ (Buffer.from([0x82, 0xff, 0xff])) });
  work.clock = Date.parse('2026-10-05T01:00:00Z');
  work.push({ 'chapters/02_second.md': '# 第2話 駅で\n\n電車を待つ。来ない。\n' });
  await openWork(page);
  // (one more character here than GitHub's commit of the day)
  await page.locator('#body').press('Control+End');
  await page.keyboard.type('あ');
  gh.down = true;
  await page.getByRole('button', { name: '記録', exact: true }).click();
  await expect(page.locator('#record-body .error')).toHaveText(/^GitHub の履歴を読めませんでした/);
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  gh.down = false;
  await page.clock.setSystemTime(new Date('2026-10-07T12:00:00+09:00'));
  await page.getByRole('button', { name: '記録', exact: true }).click();
  const days = page.locator('.rec-table').first().locator('tbody tr');
  await expect(days).toHaveText(['2026-10-05＋17字42字', '2026-10-03−12字25字', '2026-10-01—37字']);
});
