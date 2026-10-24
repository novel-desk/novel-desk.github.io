// プロット: the plot note as boxes; boxes added, moved and removed; one written by itself; the episodes of each 中箱,
// a new one made from it; the 中箱 of the open episode over its text; which note is the plot. Every change is a change
// of the note (or of novel.toml) not sent, and the lines the app did not change stay as they were (FR-PLOT-01〜08)
import { test, expect, openWork, WORK_FILES } from './lib/test.mjs';

const TOML = `${WORK_FILES['novel.toml']}\n\n[notes]\ndir = "notes"\n`;
const PLOT = [
  '# プロット',
  '',
  '# 大箱1：起',
  '前書き',
  '',
  '## 第1話 はじまり',
  '朝が来る。',
  '## 第2話 駅で',
  '電車。',
  '',
  '# 大箱2：転「part」',
  '## 第3話 坂の上',
  '坂。',
  '## 中箱2-2：まだない話',
  'これから。',
  '',
].join('\n');
const WITH_PLOT = { 'novel.toml': TOML, 'notes/plot.md': PLOT, 'notes/memo.md': '# メモ\n' };
/** @param {import('@playwright/test').Page} page */
const plotDraft = async page =>
  page.evaluate(
    () =>
      new Promise(resolve => {
        const req = indexedDB.open('novel-writer-js');
        req.onsuccess = () => {
          const get = req.result.transaction('drafts').objectStore('drafts').getAll();
          get.onsuccess = () => resolve(get.result.find((/** @type {{ path: string }} */ d) => d.path === 'notes/plot.md')?.text);
        };
      }),
  );

// FR-PLOT-01, FR-PLOT-04
test('the plot as boxes: 大箱 and 中箱, each 中箱 with the episodes of the same title; an episode opened from it', async ({ page, gh, work }) => {
  work.push(WITH_PLOT);
  await openWork(page);
  await page.getByRole('button', { name: 'プロット', exact: true }).click();
  await expect(page.locator('#plot-board .pgroup > summary')).toHaveText([/プロット/, /大箱1：起/, /大箱2：転「part」/]);
  await expect(page.locator('#plot-board .pcard-head b')).toHaveText(['第1話 はじまり', '第2話 駅で', '第3話 坂の上', '中箱2-2：まだない話']);
  await expect(page.locator('#plot-board .ep-chip')).toHaveText(['はじまり 13 字', '駅で 12 字', '坂の上 12 字']);
  await page.locator('#plot-board .ep-chip', { hasText: '駅で' }).click();
  await expect(page.locator('#desk')).toBeVisible();
  await expect(page.locator('#episode-title')).toHaveValue('駅で');
});

// FR-PLOT-02, FR-PLOT-07
test('boxes added, moved and removed: the note written back, every other line as it was', async ({ page, gh, work }) => {
  work.push(WITH_PLOT);
  await openWork(page);
  await page.getByRole('button', { name: 'プロット', exact: true }).click();
  page.once('dialog', d => {
    expect(d.defaultValue()).toBe('大箱3：');
    void d.accept('大箱3：結');
  });
  await page.getByRole('button', { name: '大箱を追加' }).click();
  page.once('dialog', d => {
    expect(d.defaultValue()).toBe('中箱1-3：');
    void d.accept('中箱1-3：別れ');
  });
  await page.locator('.pgroup[data-g="1"]').getByRole('button', { name: '中箱を追加' }).click();
  await page.locator('.pcard', { hasText: '第1話 はじまり' }).getByRole('button', { name: '下へ' }).click();
  const card = page.locator('.pcard', { hasText: '中箱2-2：まだない話' });
  await card.getByRole('button', { name: 'ほかの操作' }).click();
  page.once('dialog', d => void d.accept());
  await card.getByRole('button', { name: 'この箱を削除' }).click();
  await expect(page.locator('#plot-board .pcard-head b')).toHaveText(['第2話 駅で', '第1話 はじまり', '中箱1-3：別れ', '第3話 坂の上']);
  const changed = [
    '# プロット',
    '',
    '# 大箱1：起',
    '前書き',
    '',
    '## 第2話 駅で',
    '電車。',
    '',
    '## 第1話 はじまり',
    '朝が来る。',
    '## 中箱1-3：別れ',
    '',
    '# 大箱2：転「part」',
    '## 第3話 坂の上',
    '坂。',
    '# 大箱3：結',
    '',
  ].join('\n');
  await expect.poll(() => plotDraft(page)).toBe(changed);
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('notes/plot.md')).toBe(changed);
});

// FR-PLOT-03
test('a box written by itself: its lines only; 全体 shows the whole note; back to the boxes', async ({ page, gh, work }) => {
  work.push(WITH_PLOT);
  await openWork(page);
  await page.getByRole('button', { name: 'プロット', exact: true }).click();
  await page.locator('.pcard', { hasText: '第2話 駅で' }).getByRole('button', { name: '編集' }).click();
  await expect(page.locator('#note-name')).toHaveText('第2話 駅で');
  await expect(page.getByLabel('資料の本文')).toHaveValue('## 第2話 駅で\n電車。\n');
  await page.getByLabel('資料の本文').press('Control+End');
  await page.keyboard.type('乗り遅れる。');
  await page.getByRole('button', { name: '全体' }).click();
  await expect(page.getByLabel('資料の本文')).toHaveValue(PLOT.replace('電車。\n\n', '電車。\n乗り遅れる。\n'));
  await page.getByRole('button', { name: '‹ 箱' }).click();
  await expect(page.locator('.pcard', { hasText: '第2話 駅で' }).locator('.pcard-sum')).toHaveText('電車。\n乗り遅れる。');
  // a double click on a box opens it too
  await page.locator('.pcard', { hasText: '第3話 坂の上' }).locator('.pcard-sum').dblclick();
  await expect(page.getByLabel('資料の本文')).toHaveValue('## 第3話 坂の上\n坂。');
});

// FR-PLOT-05, FR-PLOT-04
test('a new episode made from a 中箱: in the chapter its 大箱 names, its heading the title, linked to it', async ({ page, gh, work }) => {
  work.push(WITH_PLOT);
  await openWork(page);
  await page.getByRole('button', { name: 'プロット', exact: true }).click();
  await page.locator('.pcard', { hasText: 'まだない話' }).getByRole('button', { name: '新しい話を作成' }).click();
  await expect(page.locator('#toast')).toHaveText('「まだない話」を作成しました（送るまではこの端末だけの変更です）');
  await expect(page.locator('.pcard', { hasText: '中箱2-2' }).locator('.ep-chip')).toHaveText('まだない話 9 字');
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await expect(page.locator('#episode-title')).toHaveValue('まだない話');
  await page.getByRole('button', { name: '送る（2）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/03_part/02.md')).toBe('# 第4話 まだない話\n\n');
  expect(work.text('novel.toml')).toBe(`${TOML}\n[plot.links]\n"03_part/02.md" = "中箱2-2：まだない話"\n`);
});

// FR-PLOT-06, FR-PLOT-04
test("the open episode's 中箱 over its text; another chosen for it (a link in novel.toml)", async ({ page, gh, work }) => {
  work.push(WITH_PLOT);
  await openWork(page);
  await page.locator('#tree .node', { hasText: '駅で' }).click();
  await expect(page.locator('#plot-panel')).toBeHidden();
  await page.getByRole('button', { name: 'この話のプロット' }).click();
  await expect(page.locator('#plot-panel .plot-panel-head b')).toHaveText('第2話 駅で');
  await expect(page.locator('#plot-panel .plot-panel-body')).toHaveText('電車。');
  await page.locator('#plot-panel').getByRole('button', { name: '中箱を変更' }).click();
  await page.locator('#picker').getByRole('button', { name: '中箱2-2：まだない話' }).click();
  await expect(page.locator('#plot-panel .plot-panel-head b')).toHaveText('中箱2-2：まだない話');
  // another episode: the panel closes
  await page.locator('#tree .node', { hasText: 'はじまり' }).click();
  await expect(page.locator('#plot-panel')).toBeHidden();
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('novel.toml')).toBe(`${TOML}\n[plot.links]\n"02_second.md" = "中箱2-2：まだない話"\n`);
});

// FR-PLOT-08
test('no plot: one made and chosen; another note chosen as the plot', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': TOML, 'notes/story.md': '# 話の流れ\n\n# 大箱1：始\n## 中箱1-1：朝\n' });
  await openWork(page);
  await page.getByRole('button', { name: 'プロット', exact: true }).click();
  await expect(page.locator('#plot-board')).toContainText('プロットの資料がありません');
  await page.getByRole('button', { name: 'プロットを作成' }).click();
  await expect(page.locator('#plot-board .pgroup > summary')).toHaveText([/プロット/, /大箱1：起/]);
  await page.getByRole('button', { name: 'ファイル' }).click();
  await page.locator('#picker').getByRole('button', { name: 'notes/story.md' }).click();
  await expect(page.locator('#plot-board .pcard-head b')).toHaveText(['中箱1-1：朝']);
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await page.getByRole('button', { name: '送る（2）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('notes/plot.md')).toBe('# プロット\n\n# 大箱1：起\n\n## 中箱1-1：\n');
  expect(work.text('novel.toml')).toBe(`${TOML}\n[plot]\nfile = "notes/story.md"\n`);
});
