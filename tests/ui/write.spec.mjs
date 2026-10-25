// Reading a work and writing in it: the table of contents from novel.toml, the drafts kept on the device, the counts,
// the preview, the phone's width
import { test, expect, openRepo, openWork, stored, WORK_FILES } from './lib/test.mjs';

/**
 * A store of the app's IndexedDB read or changed in the page (what a device kept: by an older version, or cleared)
 * @param {import('@playwright/test').Page} page @param {string} name @param {'get' | 'put' | 'del'} op @param {string} key @param {unknown} [value]
 */
const inStore = (page, name, op, key, value) =>
  page.evaluate(
    ([name, op, key, value]) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('novel-writer-js');
        req.onsuccess = () => {
          const tx = req.result.transaction(String(name), 'readwrite');
          const s = tx.objectStore(String(name));
          const r = op === 'get' ? s.get(String(key)) : op === 'del' ? s.delete(String(key)) : s.put(value, String(key));
          tx.oncomplete = () => resolve(r.result);
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
    [name, op, key, value],
  );

test('the table of contents: titles from the headings, the chapter folder, other files left out', async ({ page, gh }) => {
  await openWork(page);
  await expect(page.locator('#work-title')).toHaveValue('試験の作品');
  await expect(page.locator('#tree .node .t')).toHaveText(['はじまり', '駅で', 'part', '坂の上']);
  await expect(page.locator('#layout-problems')).toBeHidden();
  await expect(page.locator('#body')).toHaveValue(WORK_FILES['chapters/01_first.md']);
  await expect(page.locator('#episode-chars')).toHaveText('13');
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  // only the API, with the token
  expect(gh.calls.every(c => /^GET \/(user\/repos|user$|repos\/author\/(novel|other)(\/git\/|\/commits\?|$))/.test(c))).toBe(true);
});

test('typing keeps a draft on the device with the blob it was written from; the episode shows it as not sent, after a reload too', async ({
  page,
  gh,
  work,
}) => {
  await openWork(page);
  await page.locator('#body').click();
  await page.keyboard.press('End');
  await page.keyboard.type('足した');
  await expect(page.locator('#episode-chars')).toHaveText('16');
  await expect(page.locator('#save-state')).toHaveText('未送信（この端末に保存しました）');
  await expect(page.locator('#tree .node.active .unsent-tag')).toHaveText('未送信');
  await expect(page.locator('#send')).toHaveText('送る（1）');
  const base = work.files(work.refs.main)['chapters/01_first.md'].sha;
  await expect
    .poll(() => stored(page, 'drafts'))
    .toEqual([{ repo: 'author/novel', path: 'chapters/01_first.md', base, text: `${WORK_FILES['chapters/01_first.md']}足した`, at: expect.any(Number) }]);
  await page.reload();
  await expect(page.locator('#body')).toHaveValue(`${WORK_FILES['chapters/01_first.md']}足した`);
  await expect(page.locator('#save-state')).toHaveText('未送信（この端末に保存しました）');
  // typed back to the text read: nothing to send
  await page.locator('#body').click();
  await page.keyboard.press('Control+End');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace');
  await expect(page.locator('#save-state')).toHaveText('GitHub に届いています');
  await expect(page.locator('#send')).toBeDisabled();
  await expect.poll(() => stored(page, 'drafts')).toEqual([]);
});

test('a line or paragraph separator typed becomes a line break, but not while a word is being converted', async ({ page, gh }) => {
  await openWork(page);
  await page.locator('#body').fill('');
  await page.locator('#body').click();
  await page.keyboard.insertText('一 二 三');
  await expect(page.locator('#body')).toHaveValue('一\n二\n三');
  // while converting: left as it is, and done when the word is
  const during = await page.locator('#body').evaluate(area => {
    area.value = '変換 中';
    area.dispatchEvent(new InputEvent('input', { isComposing: true }));
    return area.value;
  });
  expect(during).toBe('変換 中');
  await page.locator('#body').evaluate(area => area.dispatchEvent(new CompositionEvent('compositionend')));
  await expect(page.locator('#body')).toHaveValue('変換\n中');
  // a word converted with no separator in it: left as it is
  await page.locator('#body').evaluate(area => area.dispatchEvent(new CompositionEvent('compositionend')));
  await expect(page.locator('#body')).toHaveValue('変換\n中');
  await expect.poll(async () => (await stored(page, 'drafts'))[0]?.text).toBe('変換\n中');
});

test('another episode and another work keep their own drafts', async ({ page, gh }) => {
  await openWork(page);
  await page.locator('#tree .node', { hasText: '坂の上' }).click();
  await expect(page.locator('#episode-title')).toHaveValue('坂の上');
  await page.locator('#body').fill('書き直した');
  // (title = "heading": the title follows the text written, as the server version's does after a save)
  await expect(page.locator('#tree .node.active .t')).toHaveText('third');
  await page.locator('#tree .node', { hasText: '駅で' }).click();
  await expect(page.locator('#body')).toHaveValue(WORK_FILES['chapters/02_second.md']);
  await page.locator('#tree .node', { hasText: 'third' }).click();
  await expect(page.locator('#body')).toHaveValue('書き直した');
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  await openRepo(page, 'author/other');
  await expect(page.locator('#tree')).toContainText('話がありません');
  await expect(page.locator('#send')).toBeDisabled();
});

test('novel.toml that cannot be read: what cannot be read is said on the screen', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': '[manuscript]\ndir = chapters\n' });
  await openWork(page, null);
  await expect(page.locator('#layout-problems')).toHaveText(
    'novel.toml が読めません（2 行目: 値「chapters」は読めません（文字列は "" で囲みます））。本文のフォルダを一番上として読みます',
  );
});

test('the preview: headings, rubies, and the pictures read from GitHub', async ({ page, gh, work }) => {
  work.push({ 'chapters/01_first.md': '# 第1話 はじまり\n\n|星空《ほしぞら》の下。\n![空](../notes/images/sky.png)\n' });
  await openWork(page);
  await page.getByRole('button', { name: 'プレビュー' }).click();
  await expect(page.locator('#preview h1')).toHaveText('第1話 はじまり');
  await expect(page.locator('#preview ruby')).toHaveText('星空ほしぞら');
  const img = page.locator('#preview img');
  await expect(img).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => img.evaluate(i => /** @type {HTMLImageElement} */ (i).naturalWidth)).toBe(1);
  await expect(page.locator('#body')).toBeHidden();
  await page.getByRole('button', { name: '編集に戻る' }).click();
  await expect(page.locator('#body')).toBeVisible();
});

test.describe('an iPhone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('the table of contents slides in from the menu, and goes when an episode is chosen', async ({ page, gh }) => {
    await openWork(page);
    await expect(page.locator('#toc')).not.toBeInViewport();
    await page.getByRole('button', { name: '目次' }).click();
    await expect(page.locator('#toc')).toBeInViewport();
    await page.locator('#tree .node', { hasText: '駅で' }).click();
    await expect(page.locator('#episode-title')).toHaveValue('駅で');
    await expect(page.locator('#toc')).not.toBeInViewport();
    // a tap beside it puts it away too
    await page.getByRole('button', { name: '目次' }).click();
    await expect(page.locator('#toc')).toBeInViewport();
    await page.locator('#scrim').click({ position: { x: 380, y: 400 } });
    await expect(page.locator('#toc')).not.toBeInViewport();
    // nothing wider than the screen
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});

// FR-EDIT-07: a picture with no episode open asks for nothing; one chosen after another episode was opened is not put
// into either; back from the notes with no episode, none open
test('a picture: no episode open, nothing asked; another episode opened while choosing, put nowhere', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': `${WORK_FILES['novel.toml']}\n\n[notes]\ndir = "notes"\n` });
  await openWork(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '画像を挿入' }).click();
  const picker = await chooser;
  await page.locator('#tree .node', { hasText: '駅で' }).click();
  await expect(page.locator('#episode-title')).toHaveValue('駅で');
  await picker.setFiles({ name: 'sky.png', mimeType: 'image/png', buffer: /** @type {Buffer} */ (WORK_FILES['notes/images/sky.png']) });
  await page.locator('#tree .node', { hasText: 'はじまり' }).click();
  await expect(page.locator('#body')).toHaveValue(WORK_FILES['chapters/01_first.md']);
  await page.locator('#tree .node', { hasText: '駅で' }).click();
  await expect(page.locator('#body')).toHaveValue(WORK_FILES['chapters/02_second.md']);
  await expect(page.locator('#send')).toBeDisabled();
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  await openRepo(page, 'author/other');
  await expect(page.locator('#tree')).toContainText('話がありません');
  let asked = false;
  page.once('filechooser', () => (asked = true));
  await page.getByRole('button', { name: '画像を挿入' }).click();
  await page.getByRole('button', { name: '資料', exact: true }).click();
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await expect(page.locator('#desk')).toBeVisible();
  await expect(page.locator('#episode-title')).toHaveValue('');
  expect(asked).toBe(false);
});

// FR-SAVE-01, NFR-USE-01: the device refusing to keep what is typed (its storage full, say): said, with the reason
test('the device refusing to keep what is typed: said, with the reason it gave', async ({ page, gh }) => {
  await openWork(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name !== 'drafts') return put.call(this, value, key);
      // (an error; then something thrown that is not one)
      if (/** @type {any} */ (window).plain) throw '空きがない';
      throw new DOMException('空きがありません', 'QuotaExceededError');
    };
  });
  await page.locator('#body').fill('書けない\n');
  await expect(page.locator('#sync-state')).toHaveText('この端末に保存できませんでした（空きがありません）');
  await page.evaluate(() => /** @type {any} */ (window.plain = true));
  await page.locator('#body').fill('まだ書けない\n');
  await expect(page.locator('#sync-state')).toHaveText('この端末に保存できませんでした（空きがない）');
});

// FR-SAVE-02, FR-EDIT-07: offline, what the device read before is shown (a picture too); an episode or a picture it
// never read is said, or shows its alt only; a picture whose file is not there shows its alt only
test('offline: an episode or a picture the device never read is said or left out; what it read is shown', async ({ page, gh, work }) => {
  work.push({
    'chapters/01_first.md': '# 第1話 はじまり\n\n![空](../notes/images/sky.png)\n![無い](../notes/images/none.png)\n',
    'chapters/03_part/01_third.md': '# 第3話 坂の上\n\n![別](../../notes/images/other.png)\n',
    // (another picture: other bytes than sky.png's, so another blob)
    'notes/images/other.png': /** @type {any} */ (Buffer.concat([/** @type {Buffer} */ (WORK_FILES['notes/images/sky.png']), Buffer.from([0])])),
  });
  await openWork(page);
  await page.getByRole('button', { name: 'プレビュー' }).click();
  await expect(page.locator('#preview img[alt="空"]')).toHaveAttribute('src', /^blob:/);
  await expect(page.locator('#preview img[alt="無い"]')).not.toHaveAttribute('src');
  await page.getByRole('button', { name: '編集に戻る' }).click();
  // (one episode's blob gone from the device: its storage cleared, say)
  await inStore(page, 'blobs', 'del', work.files(work.refs.main)['chapters/02_second.md'].sha);
  gh.down = true;
  await page.reload();
  await expect(page.locator('#sync-state')).toHaveText(/^オフラインです/);
  await page.getByRole('button', { name: 'プレビュー' }).click();
  await expect(page.locator('#preview img[alt="空"]')).toHaveAttribute('src', /^blob:/);
  await page.getByRole('button', { name: '編集に戻る' }).click();
  await page.locator('#tree .node', { hasText: '坂の上' }).click();
  await page.getByRole('button', { name: 'プレビュー' }).click();
  await expect(page.locator('#preview img[alt="別"]')).toHaveCount(1);
  await expect(page.locator('#preview img[alt="別"]')).not.toHaveAttribute('src');
  await page.getByRole('button', { name: '編集に戻る' }).click();
  await page.locator('#tree .node[data-path="chapters/02_second.md"]').click();
  await expect(page.locator('#episode-note')).toHaveText('この話はまだこの端末に読み込まれていません（つながってから開いてください）');
  await expect(page.locator('#body')).toBeDisabled();
});

// FR-SAVE-08, FR-WORK-04: what was written elsewhere read in while the work's title is being typed: the title typed stays
test('written elsewhere read in while the work’s title is typed: what is typed stays', async ({ page, gh, work }) => {
  await openWork(page);
  await page.locator('#work-title').fill('打ちかけの題');
  work.push({ 'chapters/02_second.md': '# 第2話 駅で\n\nほかで\n' });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#toast')).toHaveText('ほかの所での変更を読み込みました');
  await expect(page.locator('#work-title')).toHaveValue('打ちかけの題');
  await expect(page.locator('#work-title')).toBeFocused();
});

// FR-EDIT-02: GitHub cannot say when an episode last changed: no time shown, nothing kept
test('最終更新 that GitHub cannot tell: not shown, not kept', async ({ page, gh }) => {
  gh.fail = (method, path) => (path.endsWith('/commits') ? 500 : undefined);
  await openWork(page);
  await expect.poll(() => gh.calls.filter(c => c.includes('/commits?')).length).toBeGreaterThan(2);
  await expect(page.locator('#episode-updated')).toHaveText('');
  await expect(page.locator('#tree .node.episode .u')).toHaveText(['', '', '']);
  expect((await stored(page, 'prefs')).some(v => v && typeof v === 'object' && Object.keys(v).some(k => k.includes('\n')))).toBe(false);
});

// FR-WORK-07, FR-GH-04, FR-GH-09: 同期しない, with the work as an older version kept it (no time of its last change) on the
// branch chosen: opened from the device; the time of the work is the time written here
test('同期しない with the work kept by an older version: opened from the device on the branch chosen; the time is the time written here', async ({
  page,
  gh,
  work,
}) => {
  work.refs.draft = work.refs.main;
  work.push({ 'chapters/01_first.md': '# 第1話 はじまり\n\n枝で\n' }, 'draft');
  await openWork(page);
  await page.getByRole('button', { name: /⎇ main/ }).click();
  await page.locator('#picker').getByRole('button', { name: 'draft' }).click();
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\n枝で\n');
  await page.locator('#sync-mode').selectOption('off');
  const kept = /** @type {any} */ (await inStore(page, 'snapshots', 'get', 'author/novel'));
  delete kept.updated;
  await inStore(page, 'snapshots', 'put', 'author/novel', kept);
  gh.calls.length = 0;
  await page.reload();
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\n枝で\n');
  await expect(page.locator('#work-updated')).toHaveText('');
  expect(gh.calls.filter(c => c.includes('/git/'))).toEqual([]);
  await page.locator('#body').fill('書いた\n');
  await expect(page.locator('#work-updated')).toHaveText(/（たった今）$/);
});
