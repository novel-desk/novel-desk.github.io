// 資料: the notes listed (the ones used most on top, then by folder), written, previewed, made, renamed and put in the
// trash, each a change not sent until 「送る」 (FR-NOTE-01〜06)
import { test, expect, openWork, stored, WORK_FILES } from './lib/test.mjs';
import { CONFLICT_MARK } from '../../lib/merge.js';

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
  await page.locator('#versions').getByRole('button', { name: 'GitHub 履歴（2）' }).click();
  await expect(page.locator('#versions .version')).toHaveCount(2);
  await page.locator('#versions .version').nth(1).click();
  page.once('dialog', d => void d.accept());
  await page.locator('#versions').getByRole('button', { name: 'この版を復元' }).click();
  await expect(page.getByLabel('資料の本文')).toHaveValue(NOTES['notes/world.md']);
  await expect(page.locator('#note-state')).toHaveText('未送信（この端末に保存しました）');
});

// FR-NOTE-01, FR-NOTE-02: only the plot note (no 「そのほか」); a note no encoding reads, said, not opened; one without a
// heading named by its file; one with both versions side by side, said; a tap beside the notes does nothing; adding
// given up
test('notes that cannot say their names or be read; both versions side by side said; adding given up', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': NOTES['novel.toml'], 'notes/plot.md': NOTES['notes/plot.md'] });
  await openWork(page);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  await expect(page.locator('#notes-list .notes-folder span')).toHaveText(['主な資料']);
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  work.push({
    'notes/bad.md': /** @type {any} */ (Buffer.from([0x82, 0xff, 0xff])),
    'notes/memo.md': 'メモだけ\n',
    'notes/both.md': `# 両方\n\nここ\n${CONFLICT_MARK}の版）\nあちら\n`,
  });
  await page.getByRole('button', { name: '再読み込み' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  await expect(page.locator('#notes-list [data-note]')).toHaveText(['プロット プロット', 'bad.md', '両方', 'memo.md']);
  await page.locator('#notes-list .notes-folder span', { hasText: 'そのほか' }).click();
  await expect(page.locator('#notes-index')).toBeVisible();
  await page.locator('#notes-list [data-note]', { hasText: 'bad.md' }).click();
  await expect(page.locator('#toast')).toHaveText('この資料は開けません（文字コードが UTF-8 ではないか、この端末にまだ読み込まれていません）');
  await expect(page.locator('#notes-index')).toBeVisible();
  await page.locator('#notes-list [data-note]', { hasText: 'memo.md' }).click();
  await expect(page.locator('#note-name')).toHaveText('memo.md');
  await page.getByRole('button', { name: '‹ 一覧' }).click();
  await page.locator('#notes-list [data-note]', { hasText: '両方' }).click();
  await expect(page.locator('#note-state')).toHaveText('両方の版が並んでいます。「――― ここから」の行を探して整理してください');
  await page.getByRole('button', { name: '‹ 一覧' }).click();
  page.once('dialog', d => void d.dismiss());
  await page.getByRole('button', { name: '＋ 資料を追加' }).click();
  await expect(page.locator('#notes-index')).toBeVisible();
  await expect(page.locator('#send')).toBeDisabled();
});

// FR-NOTE-05: a work without [plot] file: a note renamed (the plot found by its name only by its file name); given up,
// the same name, a name taken: nothing changes
test('a note renamed in a work without [plot] file; given up, the same name, a name taken', async ({ page, gh, work }) => {
  work.push(NOTES);
  await openWork(page);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  await page.locator('#notes-list [data-note]', { hasText: '世界観' }).click();
  page.once('dialog', d => void d.dismiss());
  await page.getByRole('button', { name: '資料の名前を変更' }).click();
  page.once('dialog', d => void d.accept('世界観'));
  await page.getByRole('button', { name: '資料の名前を変更' }).click();
  await expect(page.locator('#note-name')).toHaveText('世界観');
  page.once('dialog', d => void d.accept('memo'));
  await page.getByRole('button', { name: '資料の名前を変更' }).click();
  await expect(page.locator('#toast')).toHaveText('同じ名前の資料があります');
  page.once('dialog', d => void d.accept('Earth'));
  await page.getByRole('button', { name: '資料の名前を変更' }).click();
  await expect(page.locator('#note-name')).toHaveText('Earth');
  await page.getByRole('button', { name: '‹ 一覧' }).click();
  await page.locator('#notes-list [data-note]', { hasText: 'プロット' }).click();
  page.once('dialog', d => {
    expect(d.defaultValue()).toBe('plot');
    void d.accept('story');
  });
  await page.getByRole('button', { name: '資料の名前を変更' }).click();
  await expect(page.locator('#toast')).toHaveText('資料の名前を変更しました（送るまではこの端末だけの変更です）');
  await page.getByRole('button', { name: '‹ 一覧' }).click();
  await expect(page.locator('#notes-list [data-note]', { hasText: 'プロット' })).toBeVisible();
});

// FR-NOTE-01, FR-NOTE-05, FR-NOTE-06, FR-PLOT-08, NFR-USE-01: novel.toml with line ends of two kinds is not changed, so
// a note is not made, renamed, put in the trash, chosen as the plot, nor given a picture: said, nothing changes; the
// trash given up
test('nothing done to a note while novel.toml cannot be changed: said; the trash given up', async ({ page, gh, work }) => {
  work.push({ ...NOTES, 'notes/plot.md': null, 'novel.toml': NOTES['novel.toml'].replace('\n', '\r\n') });
  await openWork(page);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  const refused = /^novel.toml の改行の形が行によって違うので、書き換えません/;
  // (a picture first: nothing else said before it)
  await page.locator('#notes-list [data-note]', { hasText: '世界観' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '資料に画像を挿入' }).click();
  await (await chooser).setFiles({ name: 'map.png', mimeType: 'image/png', buffer: /** @type {Buffer} */ (WORK_FILES['notes/images/sky.png']) });
  await expect(page.locator('#toast')).toHaveText(refused);
  await expect(page.getByLabel('資料の本文')).toHaveValue(NOTES['notes/world.md']);
  await page.getByRole('button', { name: '‹ 一覧' }).click();
  page.once('dialog', d => void d.accept('新しい'));
  await page.getByRole('button', { name: '＋ 資料を追加' }).click();
  await expect(page.locator('#toast')).toHaveText(refused);
  await expect(page.locator('#notes-index')).toBeVisible();
  await page.locator('#notes-list [data-note]', { hasText: '世界観' }).click();
  page.once('dialog', d => void d.accept('Earth'));
  await page.getByRole('button', { name: '資料の名前を変更' }).click();
  await expect(page.locator('#toast')).toHaveText(refused);
  await expect(page.locator('#note-name')).toHaveText('世界観');
  page.once('dialog', d => void d.dismiss());
  await page.getByRole('button', { name: 'この資料を削除' }).click();
  await expect(page.locator('#note-view')).toBeVisible();
  page.once('dialog', d => void d.accept());
  await page.getByRole('button', { name: 'この資料を削除' }).click();
  await expect(page.locator('#toast')).toHaveText(refused);
  await expect(page.locator('#note-view')).toBeVisible();
  await page.locator('#note-as-plot').click();
  await expect(page.locator('#toast')).toHaveText(refused);
  await expect(page.locator('#note-as-plot')).toBeVisible();
  await expect(page.locator('#send')).toBeDisabled();
});

// FR-PLOT-08, FR-NOTE-04: a note chosen as the plot from the note; a picture put in the note; one chosen after the note
// was left, put nowhere
test('a note chosen as the plot; a picture put in the note, not in another one left before it was chosen', async ({ page, gh, work }) => {
  work.push({ ...NOTES, 'notes/plot.md': null });
  await openWork(page);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  await page.locator('#notes-list [data-note]', { hasText: '世界観' }).click();
  await page.getByLabel('資料の本文').press('Control+End');
  let chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '資料に画像を挿入' }).click();
  await (await chooser).setFiles({ name: 'map.png', mimeType: 'image/png', buffer: /** @type {Buffer} */ (WORK_FILES['notes/images/sky.png']) });
  await expect(page.getByLabel('資料の本文')).toHaveValue(/\n!\[\]\(images\/\d{8}-\d{6}-map\.jpg\)\n$/);
  // chosen after the note was left
  chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '資料に画像を挿入' }).click();
  const late = await chooser;
  await page.getByRole('button', { name: '‹ 一覧' }).click();
  await late.setFiles({ name: 'late.png', mimeType: 'image/png', buffer: /** @type {Buffer} */ (WORK_FILES['notes/images/sky.png']) });
  await page.locator('#notes-list [data-note]', { hasText: 'memo.md' }).click();
  await expect(page.locator('#note-as-plot')).toBeVisible();
  await page.locator('#note-as-plot').click();
  await expect(page.locator('#toast')).toHaveText('この資料をプロットにしました（目次の「プロット」で箱になります）');
  await expect(page.locator('#note-as-plot')).toBeHidden();
  await page.getByRole('button', { name: '‹ 一覧' }).click();
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await page.getByRole('button', { name: '送る（3）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('novel.toml')).toBe(`${NOTES['novel.toml']}\n[plot]\nfile = "notes/memo.md"\n`);
  expect(paths(work).filter(p => p.includes('late'))).toEqual([]);
});

// FR-HIST-01, FR-NOTE-02: a note's history with its draft; a word converted (an IME) kept when it is done
test("a note's history shows its draft; a word being converted kept once converted", async ({ page, gh, work }) => {
  work.push(NOTES);
  await openWork(page);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  await page.locator('#notes-list [data-note]', { hasText: '世界観' }).click();
  const area = page.getByLabel('資料の本文');
  await area.evaluate((/** @type {HTMLTextAreaElement} */ a) => {
    a.value += '変換中';
    a.dispatchEvent(new InputEvent('input', { isComposing: true }));
  });
  await expect(page.locator('#note-state')).toHaveText('');
  await area.evaluate(a => a.dispatchEvent(new CompositionEvent('compositionend')));
  await expect(page.locator('#note-state')).toHaveText('未送信（この端末に保存しました）');
  await page.getByRole('button', { name: 'この資料の履歴' }).click();
  await expect(page.locator('#versions .version .tag').first()).toHaveText('未送信');
});

// FR-EDIT-03, FR-NOTE-03: on a phone, the input bar's preview over a note
test.describe('a phone (a finger)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("the input bar's preview: the note read", async ({ page, gh, work }) => {
    work.push(NOTES);
    await openWork(page);
    await page.getByRole('button', { name: '目次' }).click();
    await page.getByRole('button', { name: '資料', exact: true }).click();
    await page.locator('#notes-list [data-note]', { hasText: '世界観' }).click();
    await page.getByLabel('資料の本文').focus();
    await page.locator('#note-kbar').getByRole('button', { name: 'プレビュー' }).click();
    await expect(page.locator('#note-preview h1')).toHaveText('世界観');
  });
});
