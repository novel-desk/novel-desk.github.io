// Reading a work and writing in it: the table of contents from novel.toml, the drafts kept on the device, the counts,
// the preview, the phone's width
import { test, expect, openWork, stored, WORK_FILES } from './lib/test.mjs';

test('the table of contents: titles from the headings, the chapter folder, other files left out', async ({ page, gh }) => {
  await openWork(page);
  await expect(page.locator('#work-title')).toHaveValue('試験の作品');
  await expect(page.locator('#tree .node .t')).toHaveText(['はじまり', '駅で', 'part', '坂の上']);
  await expect(page.locator('#layout-problems')).toBeHidden();
  await expect(page.locator('#body')).toHaveValue(WORK_FILES['chapters/01_first.md']);
  await expect(page.locator('#episode-chars')).toHaveText('13');
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  // only the API, with the token
  expect(gh.calls.every(c => /^GET \/(user\/repos|repos\/author\/(novel|other)\/(git\/|commits\?))/.test(c))).toBe(true);
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
  await expect(page.locator('#save-state')).toHaveText('');
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
  await page.getByRole('button', { name: /author\/other/ }).click();
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
    // nothing wider than the screen
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
