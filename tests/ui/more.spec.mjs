// The rest of the server version's features that need no server: other Japanese encodings made UTF-8 (FR-WORK-03),
// branches chosen, made and merged (FR-GH-09), the preview kept over a reload (FR-TOC-08), what was written elsewhere
// read in while open (FR-SAVE-08), the changes not sent listed and given up (FR-SAVE-09), the colours (FR-APP-01) and
// the screen's size (FR-APP-05)
import { test, expect, openWork, stored, FakeRepo, WORK_FILES } from './lib/test.mjs';

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

/** @param {import('@playwright/test').Page} page the app back in front (what was written elsewhere read in) */
const inFront = page => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

// FR-SAVE-09: an operation listed with what it does (a file added; a key of novel.toml set); asked before it is given
// up (no: it stays); given up, the text written by it stays listed; an operation that wrote no text given up with the
// episode open in it: the first one opened, and the list closed when nothing is left in it
test('the changes not sent listed: a chapter added with its title; given up as asked; a rename given up with its episode open', async ({ page, gh, work }) => {
  work.push({ 'chapters/04_bad.md': /** @type {any} */ (Buffer.from([0x82, 0xff, 0xff])) });
  await openWork(page);
  page.once('dialog', d => void d.accept('第二部'));
  await page.getByRole('button', { name: '＋ 章を追加' }).click();
  await expect(page.locator('#episode-title')).toHaveValue('新しい話');
  await page.getByRole('button', { name: '未送信の一覧' }).click();
  const list = page.locator('#unsent-body .unsent-item');
  await expect(list).toHaveText([/^操作.*（追加）.*novel\.toml の設定 1 か所/]);
  await list.locator('small').click();
  page.once('dialog', d => void d.dismiss());
  await list.getByRole('button', { name: '取り消す' }).click();
  await expect(list).toHaveText([/^操作/]);
  page.once('dialog', d => void d.accept());
  await list.getByRole('button', { name: '取り消す' }).click();
  await expect(list).toHaveText([/^新しい話書いた文章/]);
  await page.getByRole('button', { name: '閉じる' }).click();
  // a work named by its files: a rename given up while its episode is open
  work.push({ 'novel.toml': BY_NAME });
  await page.getByRole('button', { name: '再読み込み' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  await page.getByRole('button', { name: '未送信の一覧' }).click();
  page.once('dialog', d => void d.accept());
  await list.getByRole('button', { name: '取り消す' }).click();
  await expect(page.locator('#unsent')).toBeHidden();
  await page.locator('#tree .node', { hasText: 'first' }).click();
  await page.locator('#episode-title').fill('始まり');
  await page.locator('#episode-title').press('Enter');
  await expect(page.locator('#tree .node.active .t')).toHaveText('始まり');
  await page.getByRole('button', { name: '未送信の一覧' }).click();
  page.once('dialog', d => void d.accept());
  await list.getByRole('button', { name: '取り消す' }).click();
  await expect(page.locator('#unsent')).toBeHidden();
  await expect(page.locator('#tree .node .t').first()).toHaveText('first');
  await expect(page.locator('#episode-title')).toHaveValue('first');
});

// FR-SAVE-09, FR-SAVE-01: an episode added and written in, the adding given up: the text written stays, as a new file
// not on GitHub yet; written on and sent, the file is made
test('an episode added and written in, the adding given up: the text stays as a new file; sent, made on GitHub', async ({ page, gh, work }) => {
  await openWork(page);
  await page.getByRole('button', { name: '＋ 話を追加' }).click();
  // (its title selected for typing first: the text goes into the text box after it)
  await expect(page.locator('#episode-title')).toBeFocused();
  await page.locator('#body').fill('# 第3話 新しい話\n\n書いた\n');
  await page.getByRole('button', { name: '未送信の一覧' }).click();
  page.once('dialog', d => void d.accept());
  await page.locator('#unsent-body .unsent-item', { hasText: '操作' }).getByRole('button', { name: '取り消す' }).click();
  await expect(page.locator('#unsent-body .unsent-item')).toHaveText([/^新しい話書いた文章/]);
  await page.getByRole('button', { name: '閉じる' }).click();
  await expect(page.locator('#body')).toHaveValue('# 第3話 新しい話\n\n書いた\n');
  // (emptied: the new file has nothing to send; written again, it is there again)
  await page.locator('#body').fill('');
  await expect(page.locator('#send')).toBeDisabled();
  await page.locator('#body').fill('# 第3話 新しい話\n\n書いた。続き\n');
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/04.md')).toBe('# 第3話 新しい話\n\n書いた。続き\n');
});

// FR-SAVE-08: read in while open: the open episode deleted elsewhere (the first one opened; none left: none open); only
// another episode changed (the open one as it is); the preview open drawn again with the new text
test('written elsewhere while open: the open episode deleted, the first opened, none when none is left; the preview drawn again', async ({
  page,
  gh,
  work,
}) => {
  await openWork(page);
  await page.locator('#tree .node', { hasText: '駅で' }).click();
  await page.locator('#body').evaluate(a => /** @type {HTMLTextAreaElement} */ (a).setSelectionRange(2, 2));
  // another episode changed: the open one left as it is
  work.push({ 'chapters/01_first.md': '# 第1話 はじまり\n\nほかで\n' });
  await inFront(page);
  await expect(page.locator('#toast')).toHaveText('ほかの所での変更を読み込みました');
  await expect(page.locator('#body')).toHaveValue(WORK_FILES['chapters/02_second.md']);
  // the open one changed while its preview is open: drawn again
  await page.getByRole('button', { name: 'プレビュー' }).click();
  await page.locator('#toast').evaluate(t => (t.textContent = ''));
  work.push({ 'chapters/02_second.md': '# 第2話 駅で\n\n電車が来た。\n' });
  await inFront(page);
  await expect(page.locator('#preview')).toContainText('電車が来た。');
  await page.getByRole('button', { name: '編集に戻る' }).click();
  // deleted elsewhere: the first one opened
  work.push({ 'chapters/02_second.md': null });
  await inFront(page);
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  // every episode deleted: none open
  work.push({ 'chapters/01_first.md': null, 'chapters/03_part/01_third.md': null });
  await inFront(page);
  await expect(page.locator('#tree')).toContainText('話がありません');
  await expect(page.locator('#episode-title')).toHaveValue('');
});

// FR-SAVE-08, FR-TOC-08: read in while open, and 再読み込み pressed before it is read: what 再読み込み reads is shown
test('read in while open, 再読み込み pressed meanwhile: the reading in gives way to it', async ({ page, gh, work }) => {
  await openWork(page);
  work.push({ 'chapters/02_second.md': '# 第2話 駅で\n\n一度目\n' });
  /** @type {() => void} */
  let release = () => {};
  const gate = new Promise(r => (release = () => r(undefined)));
  let held = false;
  let arrived = () => {};
  const came = new Promise(r => (arrived = () => r(undefined)));
  await page.route('https://api.github.com/repos/author/novel/git/trees/**', async route => {
    if (held) return route.fallback();
    held = true;
    arrived();
    await gate;
    await route.fallback();
  });
  await inFront(page);
  await came;
  work.push({ 'chapters/02_second.md': '# 第2話 駅で\n\n二度目\n' });
  await page.getByRole('button', { name: '再読み込み' }).click();
  release();
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  await page.locator('#tree .node', { hasText: '駅で' }).click();
  await expect(page.locator('#body')).toHaveValue('# 第2話 駅で\n\n二度目\n');
  await expect(page.locator('#toast')).not.toHaveText('ほかの所での変更を読み込みました');
});

// FR-GH-12, FR-WORK-05: another repository under the work's name, and no copy of the work on this device: said, nothing
// read or sent; taking the work off the list cannot send what was not sent there: said, nothing taken off
test('another repository under the name, no copy on this device: stopped; taken off the list, not sent there, said', async ({ page, gh, work }) => {
  await openWork(page);
  await page.locator('#body').fill('# 第1話 はじまり\n\n止まる\n');
  gh.rename('author/novel', 'author/gone');
  gh.unreadable.add('author/gone');
  const other = new FakeRepo('author/novel', { 'novel.toml': 'title = "別の作品"\n', '01.md': '# 別\n' });
  other.id = ++gh.ids;
  gh.repos.set('author/novel', other);
  await page.evaluate(
    () =>
      new Promise(resolve => {
        const req = indexedDB.open('novel-writer-js');
        req.onsuccess = () => {
          const tx = req.result.transaction('snapshots', 'readwrite');
          tx.objectStore('snapshots').delete('author/novel');
          tx.oncomplete = resolve;
        };
      }),
  );
  await page.reload();
  await expect(page.locator('#sync-state')).toHaveText(/^author\/novel は、つないだリポジトリとは別のリポジトリになっています/);
  /** @type {string[]} */
  const asked = [];
  page.on('dialog', d => {
    asked.push(d.message());
    void d.accept();
  });
  await page.getByRole('button', { name: '一覧から外す' }).click();
  await expect(page.locator('#toast')).toHaveText('送れなかったので、一覧から外しませんでした。書いたものはこの端末に残っています');
  expect(asked.length).toBe(2);
  expect(gh.calls.filter(c => !c.startsWith('GET'))).toEqual([]);
  expect((await stored(page, 'drafts')).map(d => d.text)).toEqual(['# 第1話 はじまり\n\n止まる\n']);
});

// FR-GH-12: つなぎ直す, not confirmed: still stopped
test('つなぎ直す not confirmed: still stopped, nothing sent', async ({ page, gh, work }) => {
  await openWork(page);
  gh.rename('author/novel', 'author/gone');
  gh.unreadable.add('author/gone');
  const other = new FakeRepo('author/novel', { 'novel.toml': 'title = "別の作品"\n', '01.md': '# 別\n' });
  other.id = ++gh.ids;
  gh.repos.set('author/novel', other);
  await page.getByRole('button', { name: '再読み込み' }).click();
  await expect(page.locator('#gh-relink')).toBeVisible();
  page.once('dialog', d => void d.dismiss());
  await page.getByRole('button', { name: 'つなぎ直す' }).click();
  await expect(page.locator('#gh-relink')).toBeVisible();
  await expect(page.locator('#work-title')).toHaveValue('試験の作品');
});

// FR-WORK-05: taking a work off the list not confirmed, or what was not sent neither sent nor given up: nothing changes
test('taking a work off the list not confirmed, or the changes neither sent nor given up: the work stays as it is', async ({ page, gh, work }) => {
  await openWork(page);
  page.once('dialog', d => void d.dismiss());
  await page.getByRole('button', { name: '一覧から外す' }).click();
  await expect(page.locator('#desk')).toBeVisible();
  await page.locator('#body').fill('# 第1話 はじまり\n\n残す\n');
  const answers = [true, false, false];
  page.on('dialog', d => void (answers.shift() ? d.accept() : d.dismiss()));
  await page.getByRole('button', { name: '一覧から外す' }).click();
  await expect.poll(() => answers.length).toBe(0);
  await expect(page.locator('#desk')).toBeVisible();
  await expect(page.locator('#send')).toHaveText('送る（1）');
  expect(gh.calls.filter(c => !c.startsWith('GET'))).toEqual([]);
});

// FR-WORK-03, FR-NOTE-04: a note in Shift-JIS: kept as a draft in UTF-8, sent as UTF-8, as an episode is
test('a note in Shift-JIS: made UTF-8 on the device, sent as UTF-8', async ({ page, gh, work }) => {
  work.push({
    'novel.toml': `${WORK_FILES['novel.toml']}\n\n[notes]\ndir = "notes"\n`,
    // 「# 第4話 古い\n\nあいう漢字\n」 in Shift-JIS
    'notes/settei.md': /** @type {any} */ (
      Buffer.concat([
        Buffer.from('# '),
        Buffer.from([0x91, 0xe6, 0x34, 0x98, 0x62, 0x20, 0x8c, 0xc3, 0x82, 0xa2]),
        Buffer.from('\n\n'),
        Buffer.from([0x82, 0xa0, 0x82, 0xa2, 0x82, 0xa4, 0x8a, 0xbf, 0x8e, 0x9a]),
        Buffer.from('\n'),
      ])
    ),
  });
  await openWork(page);
  // (read when it is opened; made UTF-8 when the work is read again)
  await page.getByRole('button', { name: '資料', exact: true }).click();
  await page
    .locator('#notes button', { hasText: /settei|古い/ })
    .first()
    .click();
  await expect(page.getByLabel('資料の本文')).toHaveValue('# 第4話 古い\n\nあいう漢字\n');
  await page.getByRole('button', { name: '‹ 一覧' }).click();
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await page.getByRole('button', { name: '再読み込み' }).click();
  await expect(page.locator('#send')).toHaveText('送る（1）');
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('notes/settei.md')).toBe('# 第4話 古い\n\nあいう漢字\n');
});

// FR-WORK-03, NFR-USE-01: a repository with more files than GitHub lists at once: not read, said
test('a repository too large for one listing of its files: said', async ({ page, gh }) => {
  gh.truncated = true;
  await openWork(page, null);
  await expect(page.locator('#sync-state')).toHaveText('リポジトリのファイルが多すぎて、GitHub が一覧を全部返しませんでした');
});

// FR-GH-09, NFR-USE-01: the branch chosen not read (GitHub failing on it): said; its files not given (gone since it was
// looked at): the branch novel.toml names opened instead
test('the chosen branch: GitHub failing on it, said; its files gone since it was looked at, the branch novel.toml names opened', async ({ page, gh, work }) => {
  work.refs.draft = work.refs.main;
  work.push({ 'chapters/01_first.md': '# 第1話 はじまり\n\n枝で\n' }, 'draft');
  await openWork(page);
  await page.getByRole('button', { name: /⎇ main/ }).click();
  await page.locator('#picker').getByRole('button', { name: 'draft' }).click();
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\n枝で\n');
  gh.fail = (method, path) => (path.endsWith('/git/ref/heads/draft') ? 500 : undefined);
  await page.getByRole('button', { name: '再読み込み' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/test failure/);
  const tree = /** @type {{ tree: string }} */ (work.commits.get(work.refs.draft)).tree;
  gh.fail = (method, path) => (path.endsWith(`/git/trees/${tree}`) ? 404 : undefined);
  await page.getByRole('button', { name: '再読み込み' }).click();
  await expect(page.locator('#toast')).toHaveText('draft は GitHub にもう無いので、main を開きました');
  await expect(page.getByRole('button', { name: /⎇ main/ })).toBeVisible();
});

// FR-SAVE-08: read in while open: GitHub failing to give the new version, nothing changes; the open episode written in
// here and changed elsewhere, what was written here stays in the box
test('read in while open: the new version not given, nothing changes; the open episode written here, kept as written', async ({ page, gh, work }) => {
  await openWork(page);
  work.push({ 'chapters/02_second.md': '# 第2話 駅で\n\nほかで\n' });
  gh.fail = (method, path) => (path.includes('/git/trees/') ? 500 : undefined);
  gh.calls.length = 0;
  await inFront(page);
  await expect.poll(() => gh.calls.filter(c => c.includes('/git/trees/')).length).toBe(1);
  gh.fail = null;
  await page.locator('#body').fill('ここで書いた\n');
  work.push({ 'chapters/01_first.md': '# 第1話 はじまり\n\nほかでも\n' });
  await inFront(page);
  await expect(page.locator('#toast')).toHaveText('ほかの所での変更を読み込みました');
  await expect(page.locator('#body')).toHaveValue('ここで書いた\n');
  await page.locator('#tree .node', { hasText: '駅で' }).click();
  await expect(page.locator('#body')).toHaveValue('# 第2話 駅で\n\nほかで\n');
});

// FR-WORK-05: a work with nothing left to send taken off the list: no more asked
test('a work with nothing left to send taken off the list: asked once, taken off', async ({ page, gh }) => {
  await openWork(page);
  /** @type {string[]} */
  const asked = [];
  page.on('dialog', d => {
    asked.push(d.message());
    void d.accept();
  });
  await page.getByRole('button', { name: '一覧から外す' }).click();
  await expect(page.locator('#repos')).toBeVisible();
  expect(asked.length).toBe(1);
  await expect(page.locator('#toast')).toHaveText(/^「試験の作品」を一覧から外しました/);
});

// FR-GH-02, NFR-USE-01: an empty repository that cannot be started as a work (GitHub refusing the files): said
test('an empty repository GitHub will not let start as a work: said', async ({ page, gh }) => {
  const empty = new FakeRepo('author/empty', null);
  empty.id = ++gh.ids;
  gh.repos.set('author/empty', empty);
  await openWork(page);
  gh.fail = method => (method === 'PUT' ? 403 : undefined);
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  page.once('dialog', d => void d.accept());
  await page.getByRole('button', { name: 'リポジトリを開く' }).click();
  await page.locator('#picker-list button', { hasText: 'author/empty' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^作品を始められませんでした: /);
  expect(empty.empty).toBe(true);
});

// FR-HIST-03, FR-SAVE-08: a version put back after the episode it was of was opened away from (deleted elsewhere and
// read in meanwhile): put into no other episode
test('a version put back after its episode was left (deleted elsewhere meanwhile): put into no other episode', async ({ page, gh, work }) => {
  work.push({ 'chapters/02_second.md': '# 第2話 駅で\n\n前の版\n' });
  work.push({ 'chapters/02_second.md': '# 第2話 駅で\n\n今の版\n' });
  await openWork(page);
  await page.locator('#tree .node', { hasText: '駅で' }).click();
  await page.getByRole('button', { name: 'この話の履歴' }).click();
  const dlg = page.locator('#versions');
  await dlg.getByRole('button', { name: /^GitHub 履歴/ }).click();
  await dlg.locator('.version').nth(1).click();
  work.push({ 'chapters/02_second.md': null });
  await inFront(page);
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  page.once('dialog', d => void d.accept());
  await dlg.getByRole('button', { name: 'この版を復元' }).click();
  await expect(dlg).toBeHidden();
  await expect(page.locator('#body')).toHaveValue(WORK_FILES['chapters/01_first.md']);
  await expect(page.locator('#send')).toBeDisabled();
});

// FR-EDIT-09, FR-TOC-05: the uses of a picture counted in the episodes as they are here: renamed ones too (one of them
// not text: counted as none)
test('a picture’s uses counted in episodes renamed here, one of them not text', async ({ page, gh, work }) => {
  work.push({
    'novel.toml': `${BY_NAME}\n[notes]\ndir = "notes"\n`,
    'chapters/01_first.md': '# 第1話 はじまり\n\n![空](../notes/images/sky.png)\n',
    'chapters/04_bad.md': /** @type {any} */ (Buffer.from([0x82, 0xff, 0xff])),
  });
  await openWork(page, 'first');
  for (const [from, to] of [
    ['first', '始まり'],
    ['bad', '読めない'],
  ]) {
    await page.locator('#tree .node', { hasText: from }).click();
    await page.locator('#episode-title').fill(to);
    await page.locator('#episode-title').press('Tab');
    await expect(page.locator('#tree .node.active .t')).toHaveText(to);
  }
  await page.getByRole('button', { name: '資料', exact: true }).click();
  /** @type {string[]} */
  const asked = [];
  page.once('dialog', d => {
    asked.push(d.message());
    void d.dismiss();
  });
  await page.locator('#notes').getByRole('button', { name: '削除' }).click();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0]).toMatch(/1 か所/);
});

// FR-NOTE-11, FR-NOTE-01: a note whose text GitHub does not give: not opened, said; the note beside the text deleted
// elsewhere and the work read again: said in its place
test.describe('a PC’s width', () => {
  test.use({ viewport: { width: 1400, height: 900 } });
  test('a note GitHub does not give: not opened, said; the note beside the text deleted elsewhere: said', async ({ page, gh, work }) => {
    work.push({ 'novel.toml': `${WORK_FILES['novel.toml']}\n\n[notes]\ndir = "notes"\n`, 'notes/world.md': '# 世界\n空は青い\n', 'notes/memo.md': '# メモ\n' });
    await openWork(page);
    const memo = work.files(work.refs.main)['notes/memo.md'].sha;
    gh.fail = (method, path) => (path.endsWith(`/git/blobs/${memo}`) ? 500 : undefined);
    await page.getByRole('button', { name: '資料', exact: true }).click();
    await page.locator('#notes-list [data-note]', { hasText: 'memo' }).click();
    await expect(page.locator('#toast')).toHaveText('この資料は開けません（文字コードが UTF-8 ではないか、この端末にまだ読み込まれていません）');
    gh.fail = null;
    await page.getByRole('button', { name: '‹ 原稿へ' }).click();
    const side = page.locator('#side-note');
    await page.getByRole('button', { name: '資料を横に出す' }).click();
    await side.locator('[data-side-note]', { hasText: '世界' }).click();
    await expect(side.locator('.plot-panel-head b')).toHaveText('世界');
    work.push({ 'notes/world.md': null });
    await page.getByRole('button', { name: '再読み込み' }).click();
    await expect(side).toContainText('この資料は読めません（無くなったか、この端末にまだ読み込まれていません）。');
  });
});
