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
  await expect(page.locator('#note-body')).toHaveValue('## カミヤ\n相棒。\n### 過去\n昔のこと。\n');
  await page.locator('#note-body').press('Control+End');
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

// FR-NOTE-07, FR-NOTE-10: found among notes without a heading and one no encoding reads; nobody yet, said; a long
// card opened and closed; one moved down; adding given up; a tap beside the buttons does nothing
test('found among notes that cannot say their names; nobody yet; a long card opened and closed; moved down; adding given up', async ({ page, gh, work }) => {
  work.push({
    'novel.toml': TOML,
    'notes/a-memo.md': '見出しのないメモ\n',
    'notes/b-bad.md': /** @type {any} */ (Buffer.from([0x82, 0xff, 0xff])),
    'notes/people.md': '# 登場人物\n',
  });
  await openWork(page);
  await page.getByRole('button', { name: 'キャラ', exact: true }).click();
  await expect(page.locator('#characters-board')).toContainText('まだ誰もいません。「人物を追加」で見出しを足せます。');
  page.once('dialog', d => void d.dismiss());
  await page.getByRole('button', { name: '人物を追加' }).click();
  await expect(page.locator('#characters-board .pcard')).toHaveCount(0);
  const long = Array.from({ length: 12 }, (_, i) => `${i + 1} 行目の説明。`).join('\n');
  page.once('dialog', d => void d.accept('黒崎零'));
  await page.getByRole('button', { name: '人物を追加' }).click();
  page.once('dialog', d => void d.accept('カミヤ'));
  await page.getByRole('button', { name: '人物を追加' }).click();
  await expect(page.locator('#characters-board .pcard-head b')).toHaveText(['黒崎零', 'カミヤ']);
  await page.locator('.pcard', { hasText: '黒崎零' }).getByRole('button', { name: '下へ' }).click();
  await expect(page.locator('#characters-board .pcard-head b')).toHaveText(['カミヤ', '黒崎零']);
  // a long description: shown in part, opened and closed
  await page.locator('.pcard', { hasText: 'カミヤ' }).getByRole('button', { name: '編集' }).click();
  await page.locator('#note-body').press('Control+End');
  await page.locator('#note-body').pressSequentially(`\n${long}`);
  await page.getByRole('button', { name: '‹ キャラ' }).click();
  await page.getByRole('button', { name: '続きを表示' }).click();
  await expect(page.locator('.pcard-sum.open')).toHaveCount(1);
  await page.getByRole('button', { name: '閉じる' }).click();
  await expect(page.locator('.pcard-sum.open')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '続きを表示' })).toBeVisible();
  await page.locator('.pcard-head b', { hasText: 'カミヤ' }).click();
  await expect(page.locator('#characters')).toBeVisible();
});

// FR-NOTE-07, NFR-USE-01: the note not made: no notes folder, said; novel.toml with line ends of two kinds, not changed
test('a characters note not made: no notes folder said; nothing made while novel.toml cannot be changed', async ({ page, gh, work }) => {
  await openWork(page);
  await page.getByRole('button', { name: 'キャラ', exact: true }).click();
  await page.getByRole('button', { name: 'キャラクターの資料を作成' }).click();
  await expect(page.locator('#toast')).toHaveText('資料のフォルダが決まっていません。novel.toml の [notes] dir に書いてください');
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  work.push({ 'novel.toml': TOML.replace('\n', '\r\n') });
  await page.locator('#reload-work').click();
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  await page.getByRole('button', { name: 'キャラ', exact: true }).click();
  await page.getByRole('button', { name: 'キャラクターの資料を作成' }).click();
  await expect(page.locator('#toast')).toHaveText(/^novel.toml の改行の形が行によって違うので、書き換えません/);
  await expect(page.getByRole('button', { name: 'キャラクターの資料を作成' })).toBeVisible();
});
