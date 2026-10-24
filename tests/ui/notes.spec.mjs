// 資料: the notes listed (the ones used most on top, then by folder), written, previewed, made, renamed and put in the
// trash, each a change not sent until 「送る」 (FR-NOTE-01〜06)
import { test, expect, openWork, stored, WORK_FILES } from './lib/test.mjs';

export const NOTES = {
  'novel.toml': `${WORK_FILES['novel.toml']}\n\n[notes]\ndir = "notes"\n`,
  'notes/plot.md': '# プロット\n\n# 大箱1：起\n\n## 中箱1-1：はじまり\n朝が来る。\n',
  'notes/world.md': '# 世界観\n\n空は青い。\n![空](images/sky.png)\n',
  'notes/memo.md': 'メモだけ\n',
  'notes/キャラ/alice.md': '# アリス\n',
};
/** @param {import('./lib/test.mjs').FakeRepo} work */
const paths = work => Object.keys(work.files(work.refs.main)).sort();

// FR-NOTE-01, FR-NOTE-02, FR-NOTE-03, FR-NOTE-04
test('the notes listed (the ones used most on top, then by folder); one written and previewed, kept until sent', async ({ page, gh, work }) => {
  work.push(NOTES);
  await openWork(page);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  await expect(page.locator('#notes-list .notes-folder span')).toHaveText(['主な資料', 'そのほか', 'キャラ']);
  await expect(page.locator('#notes-list [data-note]')).toHaveText(['プロット プロット', '世界観', 'memo.md', 'アリス']);
  await page.locator('#notes-list [data-note]', { hasText: '世界観' }).click();
  await expect(page.locator('#note-name')).toHaveText('世界観');
  await expect(page.getByLabel('資料の本文')).toHaveValue(NOTES['notes/world.md']);
  await page.getByLabel('資料の本文').press('Control+End');
  await page.keyboard.type('海も青い。');
  await expect(page.locator('#note-state')).toHaveText('未送信（この端末に保存しました）');
  await expect.poll(async () => (await stored(page, 'drafts')).map(d => d.path)).toEqual(['notes/world.md']);
  // the preview: the heading, and the picture read from GitHub
  await page.locator('#note-preview-toggle').click();
  await expect(page.locator('#note-preview h1')).toHaveText('世界観');
  await expect.poll(() => page.locator('#note-preview img').evaluate(i => /** @type {HTMLImageElement} */ (i).naturalWidth)).toBe(1);
  await page.locator('#note-preview-toggle').click();
  await page.getByRole('button', { name: '‹ 一覧' }).click();
  await expect(page.locator('#notes-list [data-note]', { hasText: '世界観' })).toContainText('未送信');
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('notes/world.md')).toBe(`${NOTES['notes/world.md']}海も青い。`);
});

// FR-NOTE-01: made in a folder; no notes folder: said
test('a note made in a folder: its file name in ASCII, its heading the name', async ({ page, gh, work }) => {
  work.push(NOTES);
  await openWork(page);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  page.once('dialog', d => void d.accept('Bob'));
  await page.getByRole('button', { name: '「キャラ」に資料を作成' }).click();
  await expect(page.locator('#note-name')).toHaveText('Bob');
  await expect(page.getByLabel('資料の本文')).toHaveValue('# Bob\n\n');
  await page.getByRole('button', { name: '‹ 一覧' }).click();
  page.once('dialog', d => void d.accept('設定/魔法'));
  await page.getByRole('button', { name: '＋ 資料を追加' }).click();
  await expect(page.locator('#note-name')).toHaveText('魔法');
  await page.getByRole('button', { name: '‹ 一覧' }).click();
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await page.getByRole('button', { name: '送る（2）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('notes/キャラ/bob.md')).toBe('# Bob\n\n');
  expect(paths(work).filter(p => p.startsWith('notes/設定/'))).toEqual([expect.stringMatching(/^notes\/設定\/note-\d{8}-\d{6}\.md$/)]);
});
test('no notes folder in novel.toml: said, and no note can be made', async ({ page, gh }) => {
  await openWork(page);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  await expect(page.locator('#notes-where')).toHaveText('資料のフォルダが設定されていません。novel.toml の [notes] dir を設定すると、ここに表示されます');
  page.once('dialog', d => void d.accept('world'));
  await page.getByRole('button', { name: '＋ 資料を追加' }).click();
  await expect(page.locator('#toast')).toHaveText('資料のフォルダが決まっていません。novel.toml の [notes] dir に書いてください');
});

// FR-NOTE-05
test('a note renamed: its heading and its file name; the plot only its file name, [plot] file following', async ({ page, gh, work }) => {
  work.push({ ...NOTES, 'novel.toml': `${NOTES['novel.toml']}\n[plot]\nfile = "notes/plot.md"\n` });
  await openWork(page);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  await page.locator('#notes-list [data-note]', { hasText: '世界観' }).click();
  page.once('dialog', d => void d.accept('Earth'));
  await page.getByRole('button', { name: '資料の名前を変更' }).click();
  await expect(page.locator('#note-name')).toHaveText('Earth');
  await expect(page.getByLabel('資料の本文')).toHaveValue(NOTES['notes/world.md'].replace('# 世界観', '# Earth'));
  await page.getByRole('button', { name: '‹ 一覧' }).click();
  await page.locator('#notes-list [data-note]', { hasText: 'プロット' }).click();
  page.once('dialog', d => void d.accept('story'));
  await page.getByRole('button', { name: '資料の名前を変更' }).click();
  await expect(page.getByLabel('資料の本文')).toHaveValue(NOTES['notes/plot.md']);
  await page.getByRole('button', { name: '‹ 一覧' }).click();
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await page.getByRole('button', { name: /^送る/ }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(paths(work)).not.toContain('notes/world.md');
  expect(work.text('notes/earth.md')).toBe(NOTES['notes/world.md'].replace('# 世界観', '# Earth'));
  expect(paths(work)).not.toContain('notes/plot.md');
  expect(work.text('notes/story.md')).toBe(NOTES['notes/plot.md']);
  expect(work.text('novel.toml')).toBe(`${NOTES['novel.toml']}\n[plot]\nfile = "notes/story.md"\n`);
});

// FR-NOTE-06
test('a note put in the trash: to _trash/; the plot no longer chosen when it is that note', async ({ page, gh, work }) => {
  work.push({ ...NOTES, 'novel.toml': `${NOTES['novel.toml']}\n[plot]\nfile = "notes/plot.md"\n` });
  await openWork(page);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  await page.locator('#notes-list [data-note]', { hasText: 'プロット' }).click();
  page.once('dialog', d => void d.accept());
  await page.getByRole('button', { name: 'この資料を削除' }).click();
  await expect(page.locator('#notes-list [data-note]')).toHaveText(['世界観', 'memo.md', 'アリス']);
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await page.getByRole('button', { name: /^送る/ }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(paths(work).filter(p => p.startsWith('_trash/'))).toEqual([expect.stringMatching(/^_trash\/\d{8}T\d{6}_plot\.md$/)]);
  expect(work.text('novel.toml')).toBe(`${NOTES['novel.toml']}\n[plot]\n`);
});

// FR-HIST-01: a note's history too
test("a note's history: its versions on GitHub and this device", async ({ page, gh, work }) => {
  work.push(NOTES);
  work.push({ 'notes/world.md': '# 世界観\n\n空は赤い。\n' });
  await openWork(page);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  await page.locator('#notes-list [data-note]', { hasText: '世界観' }).click();
  await page.getByRole('button', { name: 'この資料の履歴' }).click();
  await expect(page.locator('#versions .version')).toHaveCount(2);
  await page.locator('#versions .version').nth(1).click();
  page.once('dialog', d => void d.accept());
  await page.locator('#versions').getByRole('button', { name: 'この版を復元' }).click();
  await expect(page.getByLabel('資料の本文')).toHaveValue(NOTES['notes/world.md']);
  await expect(page.locator('#note-state')).toHaveText('未送信（この端末に保存しました）');
});
