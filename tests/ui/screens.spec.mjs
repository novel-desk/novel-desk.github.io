// The screens over the desk (資料, プロット, キャラ, 記録): what is written there goes by itself as on the desk (a pause
// in writing, the app left), and what is written elsewhere is read in there too; the note open keeps its text and
// caret while it has a draft (FR-SAVE-03, FR-SAVE-08, FR-GH-04)
import { test, expect, openWork, stored, WORK_FILES } from './lib/test.mjs';
import { OTHER_DEVICE_MARK } from '../../lib/merge.js';

const TOML = `${WORK_FILES['novel.toml']}\n\n[notes]\ndir = "notes"\n`;
// notes of the work (made up for the tests)
const NOTES = {
  'novel.toml': TOML,
  'notes/world.md': '# 世界観\n\n空は青い。\n',
  'notes/plot.md': '# プロット\n\n# 大箱1：起\n\n## 第1話 はじまり\n朝が来る。\n',
  'notes/characters.md': '# 登場人物\n\n## 黒崎零\n主人公。\n',
};
/** @param {import('@playwright/test').Page} page */
const inFront = page => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
/** @param {import('@playwright/test').Page} page */
const leave = page =>
  page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
/** @param {import('@playwright/test').Page} page @param {string} name */
async function openNote(page, name) {
  await page.getByRole('button', { name: '資料', exact: true }).click();
  await page.locator('#notes-list [data-note]', { hasText: name }).click();
  await expect(page.locator('#note-name')).toHaveText(name);
}

// FR-SAVE-03, FR-GH-04: a note written on the notes screen goes by itself after a pause in writing, without going back
// to the desk; the notes screen left (the app put away), what is written there goes at once
test('自動 on the notes screen: a note sent after a pause in writing, and when the app is left from there', async ({ page, gh, work }) => {
  work.push(NOTES);
  await page.clock.install();
  await openWork(page);
  await openNote(page, '世界観');
  await page.locator('#note-body').fill('# 世界観\n\n海もある。\n');
  await page.clock.fastForward(61000);
  await expect.poll(() => work.text('notes/world.md')).toBe('# 世界観\n\n海もある。\n');
  await expect(page.locator('#note-state')).toHaveText('');
  await expect.poll(() => stored(page, 'drafts')).toEqual([]);
  await expect(page.locator('#notes')).toBeVisible();
  // left from the notes screen: sent at once
  await page.locator('#note-body').fill('# 世界観\n\n山もある。\n');
  await leave(page);
  await expect.poll(() => work.text('notes/world.md')).toBe('# 世界観\n\n山もある。\n');
});

// FR-SAVE-08: written elsewhere while the notes screen is shown: read in there. The note open with no draft shows the
// new text, the caret where it was; with a draft, its text stays and is sent with the other version beside it. The
// list shows a note made elsewhere; a note deleted elsewhere while open is closed and said
test('read in on the notes screen: the note open follows GitHub, its caret kept; its draft kept; the list drawn again; a note gone closed', async ({
  page,
  gh,
  work,
}) => {
  work.push(NOTES);
  await openWork(page);
  await openNote(page, '世界観');
  await page.locator('#note-body').evaluate(a => /** @type {HTMLTextAreaElement} */ (a).setSelectionRange(4, 4));
  work.push({ 'notes/world.md': '# 世界観\n\n空は青い。ほかで足した。\n' });
  await inFront(page);
  await expect(page.locator('#note-body')).toHaveValue('# 世界観\n\n空は青い。ほかで足した。\n');
  expect(await page.locator('#note-body').evaluate(a => /** @type {HTMLTextAreaElement} */ (a).selectionStart)).toBe(4);
  // changed elsewhere into something not UTF-8: what is written left as it is, and said
  work.push({ 'notes/world.md': /** @type {any} */ (Buffer.from([0x82, 0xff, 0xff])) });
  await inFront(page);
  await expect(page.locator('#note-state')).toHaveText('GitHub にあるこの資料は UTF-8 ではないので、読み込めませんでした（書いている文章はそのままです）');
  await expect(page.locator('#note-body')).toHaveValue('# 世界観\n\n空は青い。ほかで足した。\n');
  // its heading taken away elsewhere: called by its file
  work.push({ 'notes/world.md': '空は青い。\n' });
  await inFront(page);
  await expect(page.locator('#note-name')).toHaveText('world.md');
  work.push({ 'notes/world.md': '# 世界観\n\n空は青い。ほかで足した。\n' });
  await inFront(page);
  await expect(page.locator('#note-name')).toHaveText('世界観');
  // a draft: kept as it is, the other version beside it when sent
  await page.locator('#note-body').fill('# 世界観\n\nここで書いた。\n');
  work.push({ 'notes/world.md': '# 世界観\n\nほかで書いた。\n' });
  await inFront(page);
  await expect(page.locator('#toast')).toHaveText('ほかの端末の更新を読み込みました（話の本文は変わっていません）');
  await expect(page.locator('#note-body')).toHaveValue('# 世界観\n\nここで書いた。\n');
  await expect(page.locator('#note-state')).toHaveText('端末に保存済み（未送信）');
  await leave(page);
  await expect.poll(() => work.text('notes/world.md')).toBe(`# 世界観\n\nここで書いた。\n\n${OTHER_DEVICE_MARK}\n\n# 世界観\n\nほかで書いた。\n`);
  // (sent: the note open shows both versions, as the branch has it)
  await expect(page.locator('#note-body')).toHaveValue(`# 世界観\n\nここで書いた。\n\n${OTHER_DEVICE_MARK}\n\n# 世界観\n\nほかで書いた。\n`);
  await expect(page.locator('#note-state')).toHaveText(/^両方の版が並んでいます/);
  // the list: a note made elsewhere shown
  await page.getByRole('button', { name: '‹ 一覧' }).click();
  work.push({ 'notes/sea.md': '# 海\n' });
  await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }));
  await inFront(page);
  await expect(page.locator('#notes-list [data-note]', { hasText: '海' })).toBeVisible();
  // the note open deleted elsewhere: closed, said
  await page.locator('#notes-list [data-note]', { hasText: '海' }).click();
  work.push({ 'notes/sea.md': null, '_trash/20261004-000000/notes/sea.md': '# 海\n' });
  await inFront(page);
  await expect(page.locator('#toast')).toHaveText('この資料は、ほかの所で削除されたか、動かされました（書きかけがあれば「未送信の一覧」に残しています）');
  await expect(page.locator('#notes-index')).toBeVisible();
  await expect(page.locator('#notes-list [data-note]', { hasText: '海' })).toHaveCount(0);
});

// FR-SAVE-08, FR-PLOT-01, FR-NOTE-07: written elsewhere while the plot or the characters are shown: drawn again
test('read in on the plot and characters screens: the boxes and the people drawn again', async ({ page, gh, work }) => {
  work.push(NOTES);
  await openWork(page);
  await page.getByRole('button', { name: 'プロット', exact: true }).click();
  await expect(page.locator('#plot-board .pcard-head b')).toHaveText(['第1話 はじまり']);
  work.push({ 'notes/plot.md': `${NOTES['notes/plot.md']}## 第2話 駅で\n電車。\n` });
  await inFront(page);
  await expect(page.locator('#plot-board .pcard-head b')).toHaveText(['第1話 はじまり', '第2話 駅で']);
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await page.getByRole('button', { name: 'キャラ', exact: true }).click();
  await expect(page.locator('#characters-board .pcard-head b')).toHaveText(['黒崎零']);
  work.push({ 'notes/characters.md': `${NOTES['notes/characters.md']}\n## カミヤ\n相棒。\n` });
  await inFront(page);
  await expect(page.locator('#characters-board .pcard-head b')).toHaveText(['黒崎零', 'カミヤ']);
});

// FR-SAVE-03: what was written goes by itself from the 記録 screen too, when the app is left there
test('自動 on the record screen: what was written on the desk goes when the app is left from there', async ({ page, gh, work }) => {
  await openWork(page);
  await page.locator('#body').fill('# 第1話 はじまり\n\n記録の画面から届く\n');
  await page.getByRole('button', { name: '記録', exact: true }).click();
  await expect(page.locator('#record')).toBeVisible();
  await leave(page);
  await expect.poll(() => work.text('chapters/01_first.md')).toBe('# 第1話 はじまり\n\n記録の画面から届く\n');
});
