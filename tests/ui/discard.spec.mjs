// 書きかけを捨てて読み込み直す (DESK-SAVE-03): beside the reload over the text, the text written in the episode open on
// this device and not sent is given up without sending it (places side by side in it too), once the author says so in
// the app's dialog, and the work is read again from GitHub; said in a toast where it was pressed
import { test, expect, openWork, stored } from './lib/test.mjs';

const KEPT = '（捨てた文章は、この話の履歴に残ります）';
/** @param {string} title */
const readAgain = title => `「${title}」の書きかけを捨てて、GitHub のブランチ main の版を読み込みました${KEPT}`;
// the versions kept in the history of this device, of every file (each a { at, text })
/** @param {import('@playwright/test').Page} page @returns {Promise<string[]>} */
const historyTexts = async page =>
  (await stored(page, 'prefs')).flatMap(v => (Array.isArray(v) ? v.flatMap(s => (typeof s?.text === 'string' ? [s.text] : [])) : []));

test.describe('on an iPhone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  // DESK-SAVE-03: faint with nothing written here; asked once (やめる: kept); given up, not sent, kept in the history,
  // and the newer version on GitHub read and shown; said in the toast at the top of the screen
  test('DESK-SAVE-03: the text written here given up without sending it, asked once, and GitHub’s version read again', async ({ page, gh, work }) => {
    await openWork(page);
    const button = page.getByRole('button', { name: '書きかけを捨てて読み込み直す' });
    await expect(button).toBeVisible();
    await expect(button).toBeDisabled();
    const mine = '# 第1話 はじまり\n\nここで書いた。\n';
    await page.locator('#body').fill(mine);
    await expect(button).toBeEnabled();
    await expect.poll(async () => (await stored(page, 'drafts')).map(d => d.text)).toEqual([mine]);
    const theirs = '# 第1話 はじまり\n\nほかで書いた。\n';
    const head = work.push({ 'chapters/01_first.md': theirs });
    // やめる: nothing given up
    await button.click();
    await expect(page.locator('#discard-ask')).toBeVisible();
    await expect(page.locator('#discard-ask-title')).toHaveText('「はじまり」の書きかけを捨てます');
    await expect(page.locator('#discard-ask-help')).toContainText('送らずに捨てて、GitHub の版を読み込み直します');
    await page.locator('#discard-ask').getByRole('button', { name: 'やめる' }).click();
    await expect(page.locator('#discard-ask')).toBeHidden();
    await expect(page.locator('#body')).toHaveValue(mine);
    await expect.poll(async () => (await stored(page, 'drafts')).map(d => d.text)).toEqual([mine]);
    // given up: GitHub's version now shown, nothing sent
    await button.click();
    await page.locator('#discard-ask').getByRole('button', { name: '捨てて読み込み直す' }).click();
    await expect(page.locator('#toast')).toHaveText(readAgain('はじまり'));
    await expect(page.locator('#toast')).toBeInViewport();
    await expect(page.locator('#body')).toHaveValue(theirs);
    await expect(page.locator('#episode-title')).toHaveValue('はじまり');
    await expect.poll(() => stored(page, 'drafts')).toEqual([]);
    expect(work.refs.main).toBe(head);
    expect(gh.calls.filter(c => /^(POST|PATCH) .*\/git\//.test(c))).toEqual([]);
    await expect(button).toBeDisabled();
    await expect(page.locator('.unsent-tag')).toHaveCount(0);
    // (kept in the history of this device)
    await expect.poll(() => historyTexts(page)).toContain(mine);
  });
});

// DESK-SAVE-03, DESK-SAVE-01: a text a send held back, the two versions of a line side by side in it (kept on this
// device, not sent): given up, the author no longer tidying it; GitHub's version shown, nothing sent
test('DESK-SAVE-03: a text held back with both versions side by side given up; GitHub’s version shown', async ({ page, gh, work }) => {
  await openWork(page);
  await page.locator('#tree .node', { hasText: '駅で' }).click();
  await page.locator('#body').fill('# 第2話 駅で\n\nここで書いた。\n');
  const theirs = '# 第2話 駅で\n\nほかで書いた。\n';
  work.push({ 'chapters/02_second.md': theirs });
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#tree .node.active .conflict')).toHaveText('競合');
  const head = work.refs.main;
  await page.getByRole('button', { name: '書きかけを捨てて読み込み直す' }).click();
  await page.locator('#discard-ask').getByRole('button', { name: '捨てて読み込み直す' }).click();
  await expect(page.locator('#toast')).toHaveText(readAgain('駅で'));
  await expect(page.locator('#body')).toHaveValue(theirs);
  await expect(page.locator('#tree .node.active .conflict')).toHaveCount(0);
  await expect(page.locator('#save-state')).toHaveText('GitHub に保存済み');
  await expect.poll(() => stored(page, 'drafts')).toEqual([]);
  expect(work.refs.main).toBe(head);
});

// DESK-SAVE-03: an episode added on this device and written in: no version of it on GitHub to go back to; nothing given
// up, and 未送信の一覧 said instead
test('DESK-SAVE-03: an episode added here and not sent: not given up, 未送信の一覧 said', async ({ page, gh, work }) => {
  await openWork(page);
  await page.getByRole('button', { name: '＋ 話を追加' }).click();
  await expect(page.locator('#episode-title')).toHaveValue('新しい話');
  await page.locator('#body').fill('# 新しい話\n\n書いた\n');
  await page.getByRole('button', { name: '書きかけを捨てて読み込み直す' }).click();
  await expect(page.locator('#toast')).toHaveText(
    '「新しい話」は、この端末で追加したか、名前の変更・並べ替えをしてまだ送っていない話のため、GitHub の版に戻せません。戻すときは「未送信の一覧」で取り消してください',
  );
  await expect(page.locator('#discard-ask')).toBeHidden();
  await expect(page.locator('#body')).toHaveValue('# 新しい話\n\n書いた\n');
  await expect.poll(async () => (await stored(page, 'drafts')).some(d => d.text === '# 新しい話\n\n書いた\n')).toBe(true);
});

// DESK-SAVE-03: the text sent while it was asked (the page left: 自動 sends at once): not given up, as the author did
// not see it so; said
test('DESK-SAVE-03: the text sent while it is asked is not given up, and that is said', async ({ page, gh, work }) => {
  await openWork(page);
  await expect(page.locator('#sync-mode')).toHaveValue('auto');
  const mine = '# 第1話 はじまり\n\nここで書いた。\n';
  await page.locator('#body').fill(mine);
  await page.getByRole('button', { name: '書きかけを捨てて読み込み直す' }).click();
  await expect(page.locator('#discard-ask')).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => work.text('chapters/01_first.md')).toBe(mine);
  await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }));
  await page.locator('#discard-ask').getByRole('button', { name: '捨てて読み込み直す' }).click();
  await expect(page.locator('#toast')).toHaveText('「はじまり」の書きかけは、確かめている間に送信か GitHub からの読み込みで変わったため、捨てませんでした');
  await expect(page.locator('#body')).toHaveValue(mine);
  await expect(page.locator('#save-state')).toHaveText('GitHub に保存済み');
});
