// Writing on a phone and reading: the input bar over the keyboard, the next and previous episodes (the buttons, the
// preview's way on, a pull past its end, a swipe), and the place kept when the preview is switched
import { test, expect, openWork } from './lib/test.mjs';

// (no sliding of the page: the next step waits for nothing; the slide is the same code, only its animation left out)
test.use({ reducedMotion: 'reduce' });

// FR-EDIT-03, FR-EDIT-04
test.describe('a phone (a finger)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('the input bar: brackets, ……, ――, a full-width space, a ruby; undone and done again; the foot gives way to it', async ({ page, gh }) => {
    await openWork(page);
    const area = page.locator('#body');
    await expect(page.locator('#kbar')).toBeHidden();
    await area.fill('');
    await area.focus();
    await expect(page.locator('#kbar')).toBeVisible();
    await expect(page.locator('.paper-foot')).toBeHidden();
    await expect(page.locator('#desk')).toHaveClass(/writing/);
    const bar = page.locator('#kbar');
    await bar.getByRole('button', { name: '「」' }).click();
    await page.keyboard.type('はい');
    await expect(area).toHaveValue('「はい」');
    await page.keyboard.press('End');
    await bar.getByRole('button', { name: '……' }).click();
    await bar.getByRole('button', { name: '――' }).click();
    await bar.getByRole('button', { name: '全角スペース' }).click();
    await expect(area).toHaveValue('「はい」……――　');
    await bar.getByRole('button', { name: 'ルビ' }).click();
    await expect(area).toHaveValue('「はい」……――　｜《》');
    await page.keyboard.type('漢字');
    await expect(area).toHaveValue('「はい」……――　｜漢字《》');
    // a word chosen: in brackets, or the base of a ruby
    await area.evaluate(a => /** @type {HTMLTextAreaElement} */ (a).setSelectionRange(1, 3));
    await bar.getByRole('button', { name: '『』' }).click();
    await expect(area).toHaveValue('「『はい』」……――　｜漢字《》');
    await bar.getByRole('button', { name: '元に戻す' }).click();
    await expect(area).toHaveValue('「はい」……――　｜漢字《》');
    await bar.getByRole('button', { name: 'やり直す' }).click();
    await expect(area).toHaveValue('「『はい』」……――　｜漢字《》');
    await area.evaluate(a => /** @type {HTMLTextAreaElement} */ (a).setSelectionRange(2, 4));
    await bar.getByRole('button', { name: 'ルビ' }).click();
    await expect(area).toHaveValue('「『｜はい《》』」……――　｜漢字《》');
    // the text box kept the focus throughout; the preview from the bar puts the keyboard away
    await expect(area).toBeFocused();
    await bar.getByRole('button', { name: 'プレビュー' }).click();
    await expect(page.locator('#preview')).toBeVisible();
    await expect(page.locator('#kbar')).toBeHidden();
    await expect(page.locator('.paper-foot')).toBeVisible();
  });
});
test('a computer: no input bar (the keyboard has these)', async ({ page, gh }) => {
  await openWork(page);
  await page.locator('#body').focus();
  await page.waitForTimeout(200);
  await expect(page.locator('#kbar')).toBeHidden();
});

// FR-EDIT-06
test('the next and previous episodes: the buttons at the foot, the way on at the end of the preview', async ({ page, gh }) => {
  await openWork(page);
  await expect(page.getByRole('button', { name: '‹ 前の話' })).toBeDisabled();
  await page.getByRole('button', { name: '次の話 ›' }).click();
  await expect(page.locator('#episode-title')).toHaveValue('駅で');
  await page.getByRole('button', { name: '次の話 ›' }).click();
  await expect(page.locator('#episode-title')).toHaveValue('坂の上');
  await expect(page.getByRole('button', { name: '次の話 ›' })).toBeDisabled();
  await page.getByRole('button', { name: '‹ 前の話' }).click();
  await expect(page.locator('#episode-title')).toHaveValue('駅で');
  // in the preview: the way on at its end, and the preview stays on
  await page.getByRole('button', { name: 'プレビュー' }).click();
  await expect(page.locator('#preview .ep-nav')).toContainText('‹ はじまり');
  await page.locator('#preview .ep-nav').getByRole('button', { name: '坂の上 ›' }).click();
  await expect(page.locator('#episode-title')).toHaveValue('坂の上');
  await expect(page.locator('#preview h1')).toHaveText('第3話 坂の上');
  await expect(page.locator('#preview .ep-nav')).toContainText('最後の話です');
});
test('the preview: going on past its end with the wheel opens the next; past its top the one before', async ({ page, gh }) => {
  await openWork(page);
  await page.getByRole('button', { name: 'プレビュー' }).click();
  await page.locator('#preview').hover();
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 100);
  await expect(page.locator('#episode-title')).toHaveValue('駅で');
  await expect(page.locator('#preview')).toBeVisible();
  await page.waitForTimeout(400);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -100);
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
});

test.describe('a finger on the preview (Chrome: touches sent by its protocol)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test.skip(({ browserName }) => browserName !== 'chromium', 'touches are sent with the Chrome DevTools Protocol');
  test('a swipe to the left opens the next, to the right the one before; a pull past the end, with the hint', async ({ page, gh }) => {
    await openWork(page);
    await page.getByRole('button', { name: 'プレビュー' }).click();
    const cdp = await page.context().newCDPSession(page);
    /** @param {[number, number][]} points */
    const drag = async points => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: points[0][0], y: points[0][1] }] });
      for (const [x, y] of points.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await drag([
      [300, 300],
      [200, 305],
      [100, 310],
    ]);
    await expect(page.locator('#episode-title')).toHaveValue('駅で');
    await drag([
      [100, 300],
      [200, 305],
      [300, 310],
    ]);
    await expect(page.locator('#episode-title')).toHaveValue('はじまり');
    // a pull up past the bottom (a short episode is at its end at once): the hint, then the next on letting go
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 500 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 450 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 380 }] });
    await expect(page.locator('#pull-hint')).toHaveText('次の話へ移動');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('#episode-title')).toHaveValue('駅で');
    await expect(page.locator('#pull-hint')).toBeHidden();
  });
});

// FR-EDIT-05
test('writing ⇄ the preview keeps the place read', async ({ page, gh, work }) => {
  const long = Array.from({ length: 200 }, (_, i) => `${i}行目の文。`).join('\n');
  work.push({ 'chapters/01_first.md': `# 第1話 はじまり\n\n${long}\n` });
  await openWork(page);
  const area = page.locator('#body');
  await area.evaluate(a => (a.scrollTop = 2000));
  await page.getByRole('button', { name: 'プレビュー' }).click();
  await expect(page.locator('#preview')).toBeVisible();
  await expect.poll(() => page.locator('#preview').evaluate(p => p.scrollTop)).toBeGreaterThan(500);
  const line = await page.locator('#preview').evaluate(p => {
    const top = p.getBoundingClientRect().top;
    return /** @type {HTMLElement[]} */ ([...p.querySelectorAll('[data-l]')]).find(e => e.getBoundingClientRect().bottom > top + 1)?.dataset.l;
  });
  await page.locator('#preview').evaluate(p => (p.scrollTop += 300));
  await page.getByRole('button', { name: '編集に戻る' }).click();
  await expect(area).toBeVisible();
  expect(await area.evaluate(a => a.scrollTop)).toBeGreaterThan(2000);
  expect(Number(line)).toBeGreaterThan(20);
});
