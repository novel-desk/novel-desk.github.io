// 横の資料: on a PC's or an iPad's (landscape) width only, a note beside the text: the list as on 資料, one as read; kept
// for the work over a reload; read again when an episode is opened; its width dragged and kept (FR-NOTE-11)
import { test, expect, openWork, WORK_FILES } from './lib/test.mjs';

const TOML = `${WORK_FILES['novel.toml']}\n\n[notes]\ndir = "notes"\n`;
const WIDE = { width: 1400, height: 900 },
  IPAD_SIDE = { width: 1180, height: 820 },
  NARROW = { width: 1024, height: 1366 };

test.use({ viewport: WIDE });

test('a note beside the text: the list, one as read, kept over a reload, closed', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': TOML, 'notes/world.md': '# 世界\n空は青い\n', 'notes/memo.md': '# メモ\n' });
  await openWork(page);
  const side = page.locator('#side-note');
  await expect(side).toBeHidden();
  await page.getByRole('button', { name: '資料を横に出す' }).click();
  await expect(side.locator('.notes-folder span')).toHaveText(['主な資料', 'そのほか']);
  await expect(side.locator('[data-side-note]')).toHaveText(['世界', 'メモ']);
  await side.locator('[data-side-note]', { hasText: '世界' }).click();
  await expect(side.locator('.plot-panel-head b')).toHaveText('世界');
  await expect(side.locator('.side-note-body p')).toHaveText(['空は青い', '']);
  // the text beside it keeps its room
  expect(await page.locator('#body').evaluate(b => b.getBoundingClientRect().width)).toBeGreaterThanOrEqual(420);
  await page.reload();
  await expect(side.locator('.plot-panel-head b')).toHaveText('世界');
  // written on 資料 meanwhile: shown when back (a draft not sent)
  await page.getByRole('button', { name: '資料', exact: true }).click();
  await page.locator('#notes-list [data-note]', { hasText: '世界' }).click();
  await page.getByLabel('資料の本文').press('Control+End');
  await page.keyboard.type('海も青い');
  await page.getByRole('button', { name: '‹ 一覧' }).click();
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await expect(side.locator('.side-note-body')).toContainText('海も青い');
  await expect(side).toContainText('まだ送っていない書きかけがあります');
  await side.getByRole('button', { name: '‹ 一覧' }).click();
  await expect(side.locator('[data-side-note]')).toHaveCount(2);
  await side.getByRole('button', { name: '閉じる' }).click();
  await expect(side).toBeHidden();
  await page.reload();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await expect(side).toBeHidden();
});

test('the width: dragged at the border and with ← →, held between the least of each, kept', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': TOML, 'notes/world.md': '# 世界\n' });
  await openWork(page);
  await page.getByRole('button', { name: '資料を横に出す' }).click();
  const side = page.locator('#side-note');
  await expect(side).toBeVisible();
  const grip = page.locator('#side-grip');
  const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await grip.boundingBox());
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(1400 - 500, box.y + 200, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => side.evaluate(s => Math.round(s.getBoundingClientRect().width))).toBe(500);
  // narrower than the least: 240
  await page.mouse.move(1400 - 500, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(1390, box.y + 200, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => side.evaluate(s => Math.round(s.getBoundingClientRect().width))).toBe(240);
  await grip.focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => side.evaluate(s => Math.round(s.getBoundingClientRect().width))).toBe(256);
  await expect(grip).toHaveAttribute('aria-valuenow', '256');
  await page.reload();
  await expect.poll(() => side.evaluate(s => Math.round(s.getBoundingClientRect().width))).toBe(256);
});

test.describe('an iPad on its side', () => {
  test.use({ viewport: IPAD_SIDE });
  test('the button and the panel are there', async ({ page, gh, work }) => {
    work.push({ 'novel.toml': TOML, 'notes/world.md': '# 世界\n' });
    await openWork(page);
    await page.getByRole('button', { name: '資料を横に出す' }).click();
    await expect(page.locator('#side-note')).toBeVisible();
  });
});
test.describe('an iPad standing', () => {
  test.use({ viewport: NARROW });
  test('neither the button nor the panel', async ({ page, gh, work }) => {
    work.push({ 'novel.toml': TOML, 'notes/world.md': '# 世界\n' });
    await openWork(page);
    await expect(page.getByRole('button', { name: '資料を横に出す' })).toBeHidden();
  });
});
