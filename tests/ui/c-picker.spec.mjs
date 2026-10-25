// Choosing from a list in a dialog (ui/picker.js, used by the branches, the plot and the list of works): a tap beside
// the choices, a name typed empty, and a list closed and opened again at once
import { test, expect, openWork, WORK_FILES } from './lib/test.mjs';

// FR-GH-09: the branch picker: a tap between the choices does nothing; the name field sent empty closes it as nothing
// chosen (the branch stays)
test('the branch picker: a tap beside the choices; an empty name sent: nothing chosen', async ({ page, gh, work }) => {
  work.refs.draft = work.refs.main;
  await openWork(page);
  await page.getByRole('button', { name: /⎇ main/ }).click();
  const picker = page.locator('#picker');
  await expect(picker.locator('#picker-list button')).toHaveText(['main（いま）', 'draft']);
  await picker.locator('#picker-list').click({ position: { x: 4, y: 4 } });
  await expect(picker).toBeVisible();
  await picker.getByRole('button', { name: '決定' }).click();
  await expect(picker).toBeHidden();
  await expect(page.getByRole('button', { name: /⎇ main/ })).toBeVisible();
});

// FR-PLOT-08: the picker closed and opened again at once (the close of the first comes after the second has opened):
// the second stays open, and its choice is taken
test('a picker closed and opened again at once: the second stays open', async ({ page, gh, work }) => {
  work.push({
    'novel.toml': `${WORK_FILES['novel.toml']}\n\n[notes]\ndir = "notes"\n`,
    'notes/plot.md': '# プロット\n\n# 大箱1\n## 中箱\n',
    'notes/other.md': '# 別\n',
  });
  await openWork(page);
  await page.getByRole('button', { name: 'プロット', exact: true }).click();
  const file = /** @type {{ x: number, y: number, width: number, height: number }} */ (await page.locator('#plot-file').boundingBox());
  await page.locator('#plot-file').click();
  const picker = page.locator('#picker');
  await expect(picker).toBeVisible();
  const close = /** @type {{ x: number, y: number, width: number, height: number }} */ (await page.locator('#picker-close').boundingBox());
  await page.mouse.click(close.x + close.width / 2, close.y + close.height / 2);
  await page.mouse.click(file.x + file.width / 2, file.y + file.height / 2);
  await page.waitForTimeout(300);
  await expect(picker).toBeVisible();
  await picker.getByRole('button', { name: 'notes/other.md' }).click();
  await expect(picker).toBeHidden();
});
