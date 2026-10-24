// The rest of the server version's features that need no server: other Japanese encodings made UTF-8 (FR-WORK-03),
// branches chosen, made and merged (FR-GH-09), the preview kept over a reload (FR-TOC-08), what was written elsewhere
// read in while open (FR-SAVE-08), the changes not sent listed and given up (FR-SAVE-09), the colours (FR-APP-01) and
// the screen's size (FR-APP-05)
import { test, expect, openWork, stored, WORK_FILES } from './lib/test.mjs';

const BY_NAME = WORK_FILES['novel.toml'].replace('title = "heading"\n', '');

// FR-WORK-03
test('an episode in Shift-JIS: opened as text, kept as a draft in UTF-8, sent as UTF-8; one no encoding reads is left', async ({ page, gh, work }) => {
  // 「# 第4話 古い\n\nあいう漢字\n」 in Shift-JIS
  const sjis = Buffer.concat([
    Buffer.from('# '),
    Buffer.from([0x91, 0xe6, 0x34, 0x98, 0x62, 0x20, 0x8c, 0xc3, 0x82, 0xa2]),
    Buffer.from('\n\n'),
    Buffer.from([0x82, 0xa0, 0x82, 0xa2, 0x82, 0xa4, 0x8a, 0xbf, 0x8e, 0x9a]),
    Buffer.from('\n'),
  ]);
  work.push({ 'chapters/04_old.md': /** @type {any} */ (sjis), 'chapters/05_bad.md': /** @type {any} */ (Buffer.from([0x82, 0xff, 0xff])) });
  await openWork(page);
  await expect(page.locator('#send')).toHaveText('送る（1）');
  await page.locator('#tree .node', { hasText: '古い' }).click();
  await expect(page.locator('#body')).toHaveValue('# 第4話 古い\n\nあいう漢字\n');
  await page.locator('#tree .node', { hasText: 'bad' }).click();
  await expect(page.locator('#episode-note')).toHaveText('文字コードが UTF-8 ではないため開けません');
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/04_old.md')).toBe('# 第4話 古い\n\nあいう漢字\n');
  expect(work.blobs.get(work.files(work.refs.main)['chapters/05_bad.md'].sha)).toEqual(Buffer.from([0x82, 0xff, 0xff]));
});

// FR-GH-09
test('a branch chosen, a new one made from the version read; refused while changes are not sent', async ({ page, gh, work }) => {
  work.refs.draft = work.refs.main;
  work.push({ 'chapters/01_first.md': '# 第1話 はじまり\n\n下書きの枝。\n' }, 'draft');
  await openWork(page);
  await page.getByRole('button', { name: /⎇ main/ }).click();
  await page.locator('#picker').getByRole('button', { name: 'draft' }).click();
  await expect(page.getByRole('button', { name: /⎇ draft/ })).toBeVisible();
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\n下書きの枝。\n');
  // kept on this device
  await page.reload();
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\n下書きの枝。\n');
  await page.locator('#body').fill('書きかけ\n');
  await page.getByRole('button', { name: /⎇ draft/ }).click();
  await expect(page.locator('#toast')).toHaveText(/^未送信の変更があります/);
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/01_first.md', 'draft')).toBe('書きかけ\n');
  expect(work.text('chapters/01_first.md')).toBe(WORK_FILES['chapters/01_first.md']);
  await page.getByRole('button', { name: /⎇ draft/ }).click();
  await page.locator('#picker-input').fill('第2稿');
  await page.locator('#picker').getByRole('button', { name: '決定' }).click();
  await expect(page.getByRole('button', { name: /⎇ 第2稿/ })).toBeVisible();
  expect(work.refs['第2稿']).toBe(work.refs.draft);
  await page.getByRole('button', { name: /⎇ 第2稿/ }).click();
  await page.locator('#picker-input').fill('bad name');
  await page.locator('#picker').getByRole('button', { name: '決定' }).click();
  await expect(page.locator('#toast')).toHaveText(/使えない文字があります/);
});
test('a branch merged into another on GitHub: what it brings said first; a conflict said', async ({ page, gh, work }) => {
  work.refs.draft = work.refs.main;
  work.push({ 'chapters/02_second.md': '# 第2話 駅で\n\n枝で書いた。\n' }, 'draft');
  await openWork(page);
  await page.getByRole('button', { name: /⎇ main/ }).click();
  await page.locator('#picker').getByRole('button', { name: 'draft' }).click();
  await expect(page.getByRole('button', { name: /⎇ draft/ })).toBeVisible();
  /** @type {string[]} */
  const said = [];
  page.once('dialog', d => {
    said.push(d.message());
    void d.accept();
  });
  await page.getByRole('button', { name: 'マージ' }).click();
  await page.locator('#picker').getByRole('button', { name: 'main' }).click();
  await expect(page.locator('#toast')).toHaveText('draft を main にマージしました');
  expect(said[0]).toMatch(/^draft → main\ncommit 1 件:\n・\d{4}-\d{2}-\d{2} ほかの端末で\n話の変化:\n・駅で 1 行足し、1 行消す\n\nマージしますか？$/);
  expect(work.text('chapters/02_second.md')).toBe('# 第2話 駅で\n\n枝で書いた。\n');
  expect(work.head().parents.length).toBe(2);
  // nothing more to bring
  await page.getByRole('button', { name: 'マージ' }).click();
  await page.locator('#picker').getByRole('button', { name: 'main' }).click();
  await expect(page.locator('#toast')).toHaveText('main には、もう draft の内容が全部入っています');
  // both changed the same file: said
  work.push({ 'chapters/03_part/01_third.md': 'main で\n' });
  work.push({ 'chapters/03_part/01_third.md': 'draft で\n' }, 'draft');
  page.once('dialog', d => void d.accept());
  await page.getByRole('button', { name: 'マージ' }).click();
  await page.locator('#picker').getByRole('button', { name: 'main' }).click();
  await expect(page.locator('#toast')).toHaveText(/^マージできませんでした: 両方のブランチで同じファイルが変わっています/);
});

// FR-GH-09: the branch chosen on this device deleted on GitHub (after a merge, say): the one novel.toml names opened
// instead, said, and no longer chosen; the changes not sent stay
test('a chosen branch GitHub no longer has: the branch novel.toml names opened instead, said; the changes not sent kept', async ({ page, gh, work }) => {
  work.refs.draft = work.refs.main;
  work.push({ 'chapters/02_second.md': '# 第2話 駅で\n\n枝で書いた。\n' }, 'draft');
  await openWork(page);
  await page.getByRole('button', { name: /⎇ main/ }).click();
  await page.locator('#picker').getByRole('button', { name: 'draft' }).click();
  await expect(page.getByRole('button', { name: /⎇ draft/ })).toBeVisible();
  await page.locator('#body').fill('書きかけ\n');
  await expect(page.locator('#send')).toHaveText('送る（1）');
  delete work.refs.draft;
  await page.reload();
  await expect(page.getByRole('button', { name: /⎇ main/ })).toBeVisible();
  await expect(page.locator('#toast')).toHaveText('draft は GitHub にもう無いので、main を開きました');
  await expect(page.locator('#send')).toHaveText('送る（1）');
  await expect(page.locator('#body')).toHaveValue('書きかけ\n');
  expect(await stored(page, 'prefs')).not.toContain('draft');
});
// FR-GH-09: novel.toml names a branch GitHub does not have: the default branch opened, said
test('novel.toml names a branch GitHub does not have: the default branch opened, said', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': WORK_FILES['novel.toml'].replace('branch = "main"', 'branch = "draft/old"') });
  await openWork(page);
  await expect(page.getByRole('button', { name: /⎇ main/ })).toBeVisible();
  await expect(page.locator('#toast')).toHaveText('draft/old は GitHub にもう無いので、main を開きました');
});
// FR-GH-09: the work not read (GitHub failing): choosing or merging a branch says so instead of doing nothing
test('the work not read: choosing or merging a branch says to read it first', async ({ page, gh, work }) => {
  gh.fail = (method, path) => (path.includes('/git/ref/') ? 500 : undefined);
  await openWork(page, null);
  await expect(page.locator('#sync-state')).toHaveClass(/err/);
  await page.locator('#gh-branch').click();
  await expect(page.locator('#toast')).toHaveText(/^作品を読み込めていません/);
  await page.locator('#toast').evaluate(t => (t.textContent = ''));
  await page.locator('#gh-merge').click();
  await expect(page.locator('#toast')).toHaveText(/^作品を読み込めていません/);
});

// FR-TOC-08
test('read again from the preview: the preview stays, where it was read', async ({ page, gh, work }) => {
  const long = Array.from({ length: 150 }, (_, i) => `${i}行目。`).join('\n');
  work.push({ 'chapters/01_first.md': `# 第1話 はじまり\n\n${long}\n` });
  await openWork(page);
  await page.getByRole('button', { name: 'プレビュー' }).click();
  await page.locator('#preview').evaluate(p => (p.scrollTop = 1500));
  const before = await page.locator('#preview').evaluate(p => p.scrollTop);
  await page.getByRole('button', { name: '再読み込み' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  await expect(page.locator('#preview')).toBeVisible();
  await expect.poll(() => page.locator('#preview').evaluate(p => p.scrollTop)).toBeGreaterThan(before - 60);
});

// FR-SAVE-08
test('written elsewhere while open: read in when the app is back in front; the caret stays; a draft is left as it is', async ({ page, gh, work }) => {
  await openWork(page);
  await page.locator('#body').evaluate(a => /** @type {HTMLTextAreaElement} */ (a).setSelectionRange(3, 3));
  work.push({ 'chapters/01_first.md': '# 第1話 はじまり\n\n朝が来た。ほかで足した。\n', 'chapters/02_second.md': '# 第2話 駅で\n\n変えた。\n' });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\n朝が来た。ほかで足した。\n');
  expect(await page.locator('#body').evaluate(a => /** @type {HTMLTextAreaElement} */ (a).selectionStart)).toBe(3);
  await expect(page.locator('#toast')).toHaveText('ほかの所での変更を読み込みました');
  await page.locator('#body').fill('ここで書いた\n');
  work.push({ 'chapters/01_first.md': '# 第1話 はじまり\n\nまたほかで。\n' });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#tree .node', { hasText: '駅で' }).locator('.c')).toHaveText('10');
  await expect(page.locator('#body')).toHaveValue('ここで書いた\n');
});

// FR-SAVE-09
test('the changes not sent listed: an operation given up (the text written in it kept), a text given up', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': BY_NAME });
  await openWork(page, 'first');
  await page.locator('#episode-title').fill('始まり');
  await page.locator('#episode-title').press('Enter');
  await page.locator('#body').fill('改名して書いた\n');
  await page.locator('#tree .node', { hasText: 'second' }).click();
  await page.locator('#body').fill('二つ目\n');
  await page.getByRole('button', { name: '未送信の一覧' }).click();
  const list = page.locator('#unsent-body .unsent-item');
  await expect(list).toHaveCount(2);
  await expect(list.nth(0)).toContainText('second');
  await expect(list.nth(1)).toContainText('chapters/01_first.md → chapters/01_始まり.md');
  page.once('dialog', d => void d.accept());
  await list.nth(1).getByRole('button', { name: '取り消す' }).click();
  await expect(list).toHaveCount(2);
  await expect(page.locator('#tree .node .t')).toHaveText(['first', 'second', 'part', 'third']);
  await expect(list.nth(1)).toContainText('first');
  page.once('dialog', d => void d.accept());
  await list.nth(0).getByRole('button', { name: '取り消す' }).click();
  await expect(list).toHaveCount(1);
  await page.getByRole('button', { name: '閉じる' }).click();
  await expect(page.locator('#body')).toHaveValue(WORK_FILES['chapters/02_second.md']);
  await page.locator('#tree .node', { hasText: 'first' }).click();
  await expect(page.locator('#body')).toHaveValue('改名して書いた\n');
  await expect.poll(async () => (await stored(page, 'drafts')).map(d => d.path)).toEqual(['chapters/01_first.md']);
});

// FR-APP-01, FR-APP-05
test('the colours chosen and kept on this device; the screen said', async ({ page, gh }) => {
  await openWork(page);
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  await expect(page.locator('#screen-info')).toHaveText(/^この端末の画面: \d+×\d+、倍率 [\d.]+、上の余白 0、下の余白 0（ブラウザ）$/);
  await page.getByRole('button', { name: '黒' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(22, 23, 26)');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  await expect(page.getByRole('button', { name: '黒' })).toHaveClass(/on/);
  await page.getByRole('button', { name: '白' }).click();
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(242, 238, 230)');
  await page.getByRole('button', { name: '自動' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
});
