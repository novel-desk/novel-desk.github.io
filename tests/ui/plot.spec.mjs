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
  await expect(page.locator('#note-body')).toHaveValue('## 第2話 駅で\n電車。\n');
  await page.locator('#note-body').press('Control+End');
  await page.keyboard.type('乗り遅れる。');
  await page.getByRole('button', { name: '全体' }).click();
  await expect(page.locator('#note-body')).toHaveValue(PLOT.replace('電車。\n\n', '電車。\n乗り遅れる。\n'));
  await page.getByRole('button', { name: '‹ 箱' }).click();
  await expect(page.locator('.pcard', { hasText: '第2話 駅で' }).locator('.pcard-sum')).toHaveText('電車。\n乗り遅れる。');
  // a double click on a box opens it too
  await page.locator('.pcard', { hasText: '第3話 坂の上' }).locator('.pcard-sum').dblclick();
  await expect(page.locator('#note-body')).toHaveValue('## 第3話 坂の上\n坂。');
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

// FR-PLOT-01, FR-PLOT-02: the lines before the first 大箱 shown first and kept first; 大箱 without numbers (a new one at
// the end, a 中箱 without a number); one moved up; one folded stays folded on this device; a long text opened and
// closed; 削除 put away again; a 大箱 and the part before the first removed; asking given up, nothing changes
const LOOSE = [
  '前書きだけの行',
  '## 前の箱',
  '前。',
  '',
  '# 起',
  ...Array.from({ length: 10 }, (_, i) => `起の説明 ${i + 1}。`),
  '## 朝',
  '朝。',
  '# 承',
  '## 昼',
  '',
].join('\n');
test('the part before the first 大箱 stays first; 大箱 without numbers; folded, opened, removed; given up', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': `${TOML}\n[plot]\nfile = "notes/story.md"\n`, 'notes/story.md': LOOSE });
  await openWork(page);
  await page.getByRole('button', { name: 'プロット', exact: true }).click();
  const heads = page.locator('#plot-board .pgroup > summary');
  await expect(heads).toHaveText([/（見出しの前）/, /起/, /承/]);
  // given up: nothing added
  page.once('dialog', d => void d.dismiss());
  await page.getByRole('button', { name: '大箱を追加' }).click();
  page.once('dialog', d => void d.dismiss());
  await page.locator('.pgroup[data-g="2"]').getByRole('button', { name: '中箱を追加' }).click();
  page.once('dialog', d => {
    expect(d.defaultValue()).toBe('大箱1：');
    void d.accept('結');
  });
  await page.getByRole('button', { name: '大箱を追加' }).click();
  page.once('dialog', d => {
    expect(d.defaultValue()).toBe('');
    void d.accept('夜');
  });
  await page.locator('.pgroup[data-g="2"]').getByRole('button', { name: '中箱を追加' }).click();
  await expect(heads).toHaveText([/（見出しの前）/, /起/, /承/, /結/]);
  // the part before the first 大箱 does not move, nor does anything go before it
  await page.locator('.pgroup[data-g="0"] > summary').getByRole('button', { name: '下へ' }).click();
  await page.locator('.pgroup[data-g="1"] > summary').getByRole('button', { name: '上へ' }).click();
  await expect(heads).toHaveText([/（見出しの前）/, /起/, /承/, /結/]);
  await page.locator('.pgroup[data-g="2"] > summary').getByRole('button', { name: '上へ' }).click();
  await expect(heads).toHaveText([/（見出しの前）/, /承/, /起/, /結/]);
  // a long text: three lines, then the rest
  await page.locator('.pgroup[data-g="2"]').getByRole('button', { name: '続きを表示' }).click();
  await expect(page.locator('.pgroup[data-g="2"] > .pcard-sum')).toHaveClass(/open/);
  await page.locator('.pgroup[data-g="2"]').getByRole('button', { name: '閉じる' }).click();
  await expect(page.locator('.pgroup[data-g="2"]').getByRole('button', { name: '続きを表示' })).toBeVisible();
  // 削除 shown and put away again
  const tools = page.locator('.pcard', { hasText: '朝' }).getByRole('button', { name: 'ほかの操作' });
  await tools.click();
  await expect(tools).toHaveText('×');
  await tools.click();
  await expect(tools).toHaveText('⋯');
  // folded: kept so when drawn again
  await page.locator('.pgroup[data-g="1"] > summary').click({ position: { x: 4, y: 4 } });
  await expect(page.locator('.pgroup[data-g="1"]')).not.toHaveAttribute('open');
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await page.getByRole('button', { name: 'プロット', exact: true }).click();
  await expect(page.locator('.pgroup[data-g="1"]')).not.toHaveAttribute('open');
  await expect(page.locator('.pgroup[data-g="2"]')).toHaveAttribute('open');
  // a 大箱 removed (asked first, with its 中箱), and the part before the first
  const end = page.locator('.pgroup[data-g="3"] > summary');
  await end.getByRole('button', { name: 'ほかの操作' }).click();
  /** @type {string[]} */
  const asked = [];
  page.once('dialog', d => {
    asked.push(d.message());
    void d.dismiss();
  });
  await end.getByRole('button', { name: 'この箱を削除' }).click();
  await expect.poll(() => asked).toEqual(['「結」と、その中の中箱 0 個を削除しますか？（プロットの資料から削除します。対応している話は残ります）']);
  await expect(heads).toHaveCount(4);
  page.once('dialog', d => void d.accept());
  await end.getByRole('button', { name: 'この箱を削除' }).click();
  await expect(heads).toHaveCount(3);
  const first = page.locator('.pgroup[data-g="0"] > summary');
  // the part before the first 大箱 has no heading: written with the whole note
  await first.getByRole('button', { name: '編集' }).click();
  await expect(page.locator('#note-name')).toHaveText('story.md');
  await expect(page.locator('#note-whole')).toBeHidden();
  await page.getByRole('button', { name: '‹ 箱' }).click();
  await first.getByRole('button', { name: 'ほかの操作' }).click();
  page.once('dialog', d => {
    asked.push(d.message());
    void d.accept();
  });
  await first.getByRole('button', { name: 'この箱を削除' }).click();
  await expect(heads).toHaveText([/承/, /起/]);
  expect(asked[1]).toMatch(/^「見出しの前」と、その中の中箱 1 個を削除しますか？/);
  // a 大箱 written by itself
  await page.locator('.pgroup[data-g="1"] > summary').getByRole('button', { name: '編集' }).click();
  await expect(page.locator('#note-name')).toHaveText('起');
  // the whole note again: it has no heading of its own, named by its file
  await page.getByRole('button', { name: '全体' }).click();
  await expect(page.locator('#note-name')).toHaveText('story.md');
});

// FR-PLOT-03: a double click on a 大箱's text opens it; on a button or beside the boxes, nothing
test('a double click: on a 大箱 opens it for writing; on a button or outside the boxes, nothing', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': `${TOML}\n[plot]\nfile = "notes/story.md"\n`, 'notes/story.md': LOOSE });
  await openWork(page);
  await page.getByRole('button', { name: 'プロット', exact: true }).click();
  await page.locator('.pcard', { hasText: '朝' }).getByRole('button', { name: 'ほかの操作' }).dblclick();
  await page.locator('#plot-board').dispatchEvent('dblclick');
  await expect(page.locator('#plot')).toBeVisible();
  await page.locator('.pgroup[data-g="1"] > .pcard-sum').dblclick();
  await expect(page.locator('#note-name')).toHaveText('起');
  await expect(page.locator('#note-body')).toHaveValue(/^# 起\n起の説明 1。/);
});

test.describe('a touch screen', () => {
  test.use({ hasTouch: true });
  // FR-PLOT-03: a double tap on a box opens it, as its 編集 does; two taps on two boxes, or far apart, do not
  test('a double tap opens a box; taps on two boxes, far apart, or outside the boxes do not', async ({ page, gh, work }) => {
    work.push(WITH_PLOT);
    await openWork(page);
    await page.getByRole('button', { name: 'プロット', exact: true }).click();
    const one = page.locator('.pcard', { hasText: '第1話 はじまり' }).locator('.pcard-head b');
    const two = page.locator('.pcard', { hasText: '第2話 駅で' });
    await page
      .locator('#plot-board')
      .getByRole('button', { name: '大箱を追加' })
      .evaluate(b => b.scrollIntoView());
    // (a tap outside the boxes: on a button)
    page.once('dialog', d => void d.dismiss());
    await page.getByRole('button', { name: '大箱を追加' }).tap();
    await page
      .locator('#plot-board .pgroup > summary')
      .first()
      .tap({ position: { x: 200, y: 6 } });
    await one.tap();
    await two.tap({ position: { x: 5, y: 5 } });
    await two.tap({ position: { x: 120, y: 5 } });
    await expect(page.locator('#plot')).toBeVisible();
    await two.tap({ position: { x: 120, y: 5 } });
    await expect(page.locator('#note-name')).toHaveText('第2話 駅で');
  });
});

// FR-PLOT-05: a 大箱 that names no chapter: the chapter asked (given up, nothing made; a chapter chosen; outside the
// chapters, where the name is taken: said); a 中箱 with only its number, its heading the title
test('a new episode from a 大箱 that names no chapter: the chapter asked; a name taken said', async ({ page, gh, work }) => {
  work.push({
    'novel.toml': TOML,
    'notes/plot.md': '# プロット\n\n# 大箱1：起\n## 中箱1-1：\n## 中箱1-2：二つ目\n',
    // (a folder where the next episode at the top would go)
    'chapters/04.md/keep.txt': '置いておく\n',
  });
  await openWork(page);
  await page.getByRole('button', { name: 'プロット', exact: true }).click();
  const first = page.locator('.pcard', { hasText: '中箱1-1：' });
  await first.getByRole('button', { name: '新しい話を作成' }).click();
  await expect(page.locator('#picker-title')).toHaveText('どの章に作成しますか');
  await expect(page.locator('#picker-list button')).toHaveText(['part', '（章の外）']);
  await page.locator('#picker-close').click();
  await expect(page.locator('#picker')).toBeHidden();
  await expect(page.locator('#send')).toBeDisabled();
  await first.getByRole('button', { name: '新しい話を作成' }).click();
  await page.locator('#picker-list button', { hasText: 'part' }).click();
  await expect(page.locator('#toast')).toHaveText('「中箱1-1：」を作成しました（送るまではこの端末だけの変更です）');
  await expect(first.locator('.ep-chip')).toHaveCount(1);
  await page.locator('.pcard', { hasText: '二つ目' }).getByRole('button', { name: '新しい話を作成' }).click();
  await page.locator('#picker-list button', { hasText: '（章の外）' }).click();
  await expect(page.locator('#toast')).toHaveText('同じ名前があります');
});

// FR-PLOT-05: a work without chapters: made at the top
test('a new episode from a 中箱 in a work without chapters: at the top', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': TOML, 'notes/plot.md': '# プロット\n\n# 大箱1：起\n## 中箱1-1：朝\n', 'chapters/03_part/01_third.md': null });
  await openWork(page);
  await page.getByRole('button', { name: 'プロット', exact: true }).click();
  await page.locator('.pcard', { hasText: '朝' }).getByRole('button', { name: '新しい話を作成' }).click();
  await expect(page.locator('#toast')).toHaveText('「朝」を作成しました（送るまではこの端末だけの変更です）');
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await page.getByRole('button', { name: '送る（2）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/03.md')).toBe('# 第3話 朝\n\n');
});

// FR-PLOT-05, FR-PLOT-06, FR-PLOT-08, NFR-USE-01: nothing changed while novel.toml cannot be changed (its line ends of
// two kinds), said; no notes folder, no plot made, said; the plot note not chosen when the picker is closed
test('the plot not made or chosen, an episode not made or linked: said; the picker closed, nothing chosen', async ({ page, gh, work }) => {
  await openWork(page);
  await page.getByRole('button', { name: 'プロット', exact: true }).click();
  await page.getByRole('button', { name: 'プロットを作成' }).click();
  await expect(page.locator('#toast')).toHaveText('資料のフォルダが決まっていません。novel.toml の [notes] dir に書いてください');
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  work.push({ 'novel.toml': TOML.replace('\n', '\r\n'), 'notes/story.md': '# 大箱1：起\n## 中箱1-1：朝\n' });
  await page.locator('#reload-work').click();
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  await page.getByRole('button', { name: 'プロット', exact: true }).click();
  await page.getByRole('button', { name: 'プロットを作成' }).click();
  await expect(page.locator('#toast')).toHaveText(/^novel.toml の改行の形が行によって違うので、書き換えません/);
  await expect(page.getByRole('button', { name: 'プロットを作成' })).toBeVisible();
  await page.getByRole('button', { name: 'ファイル' }).click();
  await expect(page.locator('#picker-list button')).toHaveText(['notes/story.md']);
  await page.locator('#picker-close').click();
  await page.getByRole('button', { name: 'ファイル' }).click();
  await page.locator('#picker-list button').click();
  await expect(page.locator('#toast')).toHaveText(/^novel.toml の改行の形が行によって違うので/);
  await expect(page.getByRole('button', { name: 'プロットを作成' })).toBeVisible();
  // the plot found by its name: an episode from it, and a link, not made either
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  work.push({ 'notes/story.md': null, 'notes/plot.md': '# 大箱1：part\n## 中箱1-1：朝\n' });
  await page.locator('#reload-work').click();
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  await page.getByRole('button', { name: 'プロット', exact: true }).click();
  await page.locator('.pcard', { hasText: '朝' }).getByRole('button', { name: '新しい話を作成' }).click();
  await expect(page.locator('#toast')).toHaveText(/^novel.toml の改行の形が行によって違うので/);
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await page.getByRole('button', { name: 'この話のプロット' }).click();
  await page.locator('#plot-panel').getByRole('button', { name: '中箱を選択' }).click();
  await page.locator('#picker-list button', { hasText: '朝' }).click();
  await expect(page.locator('#toast')).toHaveText(/^novel.toml の改行の形が行によって違うので/);
  await expect(page.locator('#plot-panel')).toContainText('この話に対応するプロットの中箱はありません');
  await expect(page.locator('#send')).toBeDisabled();
});

// FR-PLOT-06: no plot: said on the panel; a 中箱 chosen for an episode that has none (closed: nothing), its text with a
// picture; the link taken away; a link to a 中箱 no longer there, said; the plot opened from the panel; the panel closed
test("the open episode's 中箱: none, chosen, taken away, gone; the plot opened from it; closed", async ({ page, gh, work }) => {
  work.push({ 'novel.toml': TOML });
  await openWork(page);
  await page.getByRole('button', { name: 'この話のプロット' }).click();
  await expect(page.locator('#plot-panel')).toHaveText('プロットの資料がありません。目次の「プロット」から作成できます。');
  await page.getByRole('button', { name: 'この話のプロット' }).click();
  await expect(page.locator('#plot-panel')).toBeHidden();
  work.push({
    'novel.toml': `${TOML}\n[plot.links]\n"02_second.md" = "消えた箱"\n`,
    'notes/plot.md': '# プロット\n\n# 大箱1：起\n## 中箱1-1：朝\n朝の場面。\n![空](images/sky.png)\n',
  });
  await page.locator('#reload-work').click();
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  await page.getByRole('button', { name: 'この話のプロット' }).click();
  const panel = page.locator('#plot-panel');
  await expect(panel).toContainText('この話に対応するプロットの中箱はありません');
  await panel.getByRole('button', { name: '中箱を選択' }).click();
  await expect(page.locator('#picker-list button')).toHaveText(['中箱1-1：朝']);
  await page.locator('#picker-close').click();
  await expect(page.locator('#picker')).toBeHidden();
  await panel.getByRole('button', { name: '中箱を選択' }).click();
  await page.locator('#picker-list button').click();
  await expect(panel.locator('.plot-panel-head b')).toHaveText('中箱1-1：朝');
  await expect(panel.locator('.plot-panel-body img')).toHaveAttribute('alt', '空');
  // (a tap on the text: nothing)
  await panel.locator('.plot-panel-body').click();
  await panel.getByRole('button', { name: '中箱を変更' }).click();
  await expect(page.locator('#picker-list button')).toHaveText(['中箱1-1：朝（いま）', '（対応を解除）']);
  await page.locator('#picker-list button', { hasText: '（対応を解除）' }).click();
  await expect(panel).toContainText('この話に対応するプロットの中箱はありません');
  // a link to a 中箱 no longer in the plot
  await page.locator('#tree .node', { hasText: '駅で' }).click();
  await page.getByRole('button', { name: 'この話のプロット' }).click();
  await expect(panel).toContainText('中箱「消えた箱」が見つかりません');
  await page.locator('#tree .node', { hasText: 'はじまり' }).click();
  await page.getByRole('button', { name: 'この話のプロット' }).click();
  await panel.getByRole('button', { name: '中箱を選択' }).click();
  await page.locator('#picker-list button').click();
  await panel.getByRole('button', { name: 'プロット' }).click();
  await expect(page.locator('#plot')).toBeVisible();
});

// FR-PLOT-06: another episode opened while the plot is read for the panel: the panel is not drawn for it
test('the panel of an episode left while the plot was being read: not drawn', async ({ page, gh, work }) => {
  work.push(WITH_PLOT);
  await openWork(page);
  const before = gh.calls.filter(c => c.includes('/git/blobs/')).length;
  let held = 0;
  /** @type {() => void} */
  let release = () => {};
  const gate = new Promise(r => (release = () => r(undefined)));
  await page.route('https://api.github.com/repos/author/novel/git/blobs/**', async route => {
    held++;
    await gate;
    await route.fallback();
  });
  await page.getByRole('button', { name: 'この話のプロット' }).click();
  await expect.poll(() => held).toBeGreaterThan(0);
  await page.locator('#tree .node', { hasText: '駅で' }).click();
  await expect(page.locator('#episode-title')).toHaveValue('駅で');
  release();
  await expect.poll(() => gh.calls.filter(c => c.includes('/git/blobs/')).length).toBe(before + held);
  await expect(page.locator('#plot-panel')).toBeHidden();
});

// FR-PLOT-01: a plot note no encoding reads: no boxes
test('a plot note not in UTF-8: no boxes shown', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': `${TOML}\n[plot]\nfile = "notes/plot.md"\n`, 'notes/plot.md': /** @type {any} */ (Buffer.from([0x82, 0xff, 0xff])) });
  await openWork(page);
  await page.getByRole('button', { name: 'プロット', exact: true }).click();
  await expect(page.locator('#plot-board .pgroup')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '大箱を追加' })).toBeVisible();
});
