// キャラ: the characters as cards (one a person), one written by itself, one added at the end, one moved; a note made
// when there is none; people in a folder a note each, said how to put them together (FR-NOTE-07〜10)
import { test, expect, openWork, WORK_FILES } from './lib/test.mjs';

const TOML = `${WORK_FILES['novel.toml']}\n\n[notes]\ndir = "notes"\n`;
const PEOPLE = '# 登場人物\n\n## 黒崎零\n主人公。\n\n## カミヤ\n相棒。\n### 過去\n昔のこと。\n';

// FR-NOTE-07, FR-NOTE-08
test('the people as cards (a deeper heading inside its person); one written by itself, the others left as they are', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': TOML, 'notes/characters.md': PEOPLE });
  await openWork(page);
  await page.getByRole('button', { name: 'キャラ', exact: true }).click();
  await expect(page.locator('#characters-board .pcard-head b')).toHaveText(['黒崎零', 'カミヤ']);
  await expect(page.locator('#characters-board .pcard-sum').nth(1)).toHaveText('相棒。\n過去\n昔のこと。');
  await page.locator('.pcard', { hasText: 'カミヤ' }).getByRole('button', { name: '編集' }).click();
  await expect(page.getByLabel('資料の本文')).toHaveValue('## カミヤ\n相棒。\n### 過去\n昔のこと。\n');
  await page.getByLabel('資料の本文').press('Control+End');
  await page.keyboard.type('今のこと。');
  await page.getByRole('button', { name: '‹ キャラ' }).click();
  await expect(page.locator('#characters-board')).toContainText('この端末に、まだ送っていない書きかけがあります');
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('notes/characters.md')).toBe(`${PEOPLE}今のこと。`);
});

// FR-NOTE-09, FR-NOTE-10
test('a person added at the end, at the level of the people; one moved up, the spacing kept', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': `${TOML}\n[characters]\nfile = "notes/people.md"\n`, 'notes/people.md': PEOPLE });
  await openWork(page);
  await page.getByRole('button', { name: 'キャラ', exact: true }).click();
  page.once('dialog', d => void d.accept('ミナ'));
  await page.getByRole('button', { name: '人物を追加' }).click();
  await expect(page.locator('#characters-board .pcard-head b')).toHaveText(['黒崎零', 'カミヤ', 'ミナ']);
  await page.locator('.pcard', { hasText: 'カミヤ' }).getByRole('button', { name: '上へ' }).click();
  await expect(page.locator('#characters-board .pcard-head b')).toHaveText(['カミヤ', '黒崎零', 'ミナ']);
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('notes/people.md')).toBe('# 登場人物\n\n## カミヤ\n相棒。\n### 過去\n昔のこと。\n\n## 黒崎零\n主人公。\n\n## ミナ\n\n');
});

// FR-NOTE-07
test('no characters note: one made; people in a folder a note each: said, not made', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': TOML });
  await openWork(page);
  await page.getByRole('button', { name: 'キャラ', exact: true }).click();
  await page.getByRole('button', { name: 'キャラクターの資料を作成' }).click();
  await expect(page.locator('#characters-board .pcard-head b')).toHaveText(['主人公']);
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('notes/characters.md')).toBe('# 登場人物\n\n## 主人公\n\n');
});
test('people in a folder a note each: how to put them together said', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': TOML, 'notes/キャラ/zero.md': '# 零\n' });
  await openWork(page);
  await page.getByRole('button', { name: 'キャラ', exact: true }).click();
  await expect(page.locator('#characters-board')).toContainText('キャラクターが「notes/キャラ」に 1 人 1 つの資料で分かれています');
  await expect(page.getByRole('button', { name: 'キャラクターの資料を作成' })).toHaveCount(0);
});
