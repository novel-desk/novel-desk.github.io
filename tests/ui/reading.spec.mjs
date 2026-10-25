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
  // past the top of the first: none before it
  await page.waitForTimeout(400);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -100);
  await page.waitForTimeout(300);
  await expect(page.locator('#pull-hint')).toBeHidden();
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
    await expect(page.locator('#preview h1')).toHaveText('第1話 はじまり');
    await drag([
      [300, 300],
      [200, 305],
      [100, 310],
    ]);
    await expect(page.locator('#episode-title')).toHaveValue('駅で');
    // (the next gesture once the page has come: one made while it comes is not taken)
    await expect(page.locator('#preview h1')).toHaveText('第2話 駅で');
    await drag([
      [100, 300],
      [200, 305],
      [300, 310],
    ]);
    await expect(page.locator('#episode-title')).toHaveValue('はじまり');
    await expect(page.locator('#preview h1')).toHaveText('第1話 はじまり');
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

// FR-EDIT-06: gestures that do not move on: a swipe from the very left edge (Safari's back), with two fingers, too
// short, more down than sideways, with a word chosen; a pull that does not start at an end, that turns back, that goes
// back into the text, or that is let go before it is far enough
test.describe('a finger on the preview, not moving on (Chrome: touches sent by its protocol)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test.skip(({ browserName }) => browserName !== 'chromium', 'touches are sent with the Chrome DevTools Protocol');
  /** @param {import('@playwright/test').Page} page */
  async function finger(page) {
    const cdp = await page.context().newCDPSession(page);
    /** @param {[number, number][][]} steps each step the fingers on the screen (none: let go) */
    return async steps => {
      for (const [i, points] of steps.entries())
        await cdp.send('Input.dispatchTouchEvent', {
          type: i === 0 ? 'touchStart' : points.length ? 'touchMove' : 'touchEnd',
          touchPoints: points.map(([x, y]) => ({ x, y })),
        });
    };
  }
  test('swipes that do not move on', async ({ page, gh }) => {
    await openWork(page);
    await page.getByRole('button', { name: 'プレビュー' }).click();
    await expect(page.locator('#preview h1')).toHaveText('第1話 はじまり');
    const touch = await finger(page);
    // from the very left edge, with two fingers (only touched: a move sideways there is the browser's), too short, more
    // down than sideways
    await touch([[[20, 300]], [[20, 310]], []]);
    await touch([
      [
        [300, 300],
        [300, 400],
      ],
      [
        [300, 310],
        [300, 410],
      ],
      [],
    ]);
    await touch([[[300, 300]], [[260, 305]], []]);
    await touch([[[300, 200]], [[250, 300]], [[200, 400]], []]);
    // a word chosen
    await page.locator('#preview p').filter({ hasText: '朝が来た。' }).selectText();
    await touch([[[300, 300]], [[200, 305]], [[100, 310]], []]);
    await page.waitForTimeout(300);
    await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  });
  test('pulls that do not move on', async ({ page, gh, work }) => {
    const long = Array.from({ length: 120 }, (_, i) => `${i}行目の文。`).join('\n');
    work.push({ 'chapters/01_first.md': `# 第1話 はじまり\n\n${long}\n`, 'chapters/02_second.md': `# 第2話 駅で\n\n${long}\n` });
    await openWork(page);
    await page.getByRole('button', { name: 'プレビュー' }).click();
    const pv = page.locator('#preview');
    await expect(pv.locator('h1')).toHaveText('第1話 はじまり');
    const touch = await finger(page);
    // the top of the first (none before it), not at its bottom: not a pull
    await touch([[[200, 300]], [[200, 500]], []]);
    await expect(page.locator('#pull-hint')).toBeHidden();
    // at the bottom: a pull that stays still, then turns back the other way, then is let go before it is far enough
    await pv.evaluate(p => (p.scrollTop = p.scrollHeight));
    await touch([[[200, 500]], [[200, 500]], [[200, 450]], [[200, 420]], [[200, 480]], [[200, 560]], []]);
    await expect(page.locator('#pull-hint')).toBeHidden();
    await expect(page.locator('#episode-title')).toHaveValue('はじまり');
    // the top of the second: pulled down far enough (the hint), then back up into the text: no longer a pull
    await page.getByRole('button', { name: '編集に戻る' }).click();
    await page.getByRole('button', { name: '次の話 ›' }).click();
    await expect(page.locator('#episode-title')).toHaveValue('駅で');
    await page.getByRole('button', { name: 'プレビュー' }).click();
    await expect(pv.locator('h1')).toHaveText('第2話 駅で');
    await pv.evaluate(p => (p.scrollTop = 0));
    await touch([[[200, 300]], [[200, 350]], [[200, 420]]]);
    await expect(page.locator('#pull-hint')).toHaveText('前の話へ移動');
    await pv.evaluate(p => p.scrollTo(0, 200));
    await touch([[[200, 400]], []]);
    await expect(page.locator('#pull-hint')).toBeHidden();
    await expect(page.locator('#episode-title')).toHaveValue('駅で');
    // at the bottom of the last: nothing after it
    await page.getByRole('button', { name: '編集に戻る' }).click();
    await page.getByRole('button', { name: '次の話 ›' }).click();
    await expect(page.locator('#episode-title')).toHaveValue('坂の上');
    await page.getByRole('button', { name: 'プレビュー' }).click();
    await expect(pv.locator('h1')).toHaveText('第3話 坂の上');
    await touch([[[200, 500]], [[200, 300]], []]);
    await expect(page.locator('#episode-title')).toHaveValue('坂の上');
    // (short: at both ends) down, then turned back up (nothing after it); only sideways
    await touch([[[200, 300]], [[200, 350]], [[200, 250]], []]);
    await touch([[[200, 300]], [[230, 300]], []]);
    await expect(page.locator('#pull-hint')).toBeHidden();
    await expect(page.locator('#episode-title')).toHaveValue('坂の上');
  });
});

// FR-EDIT-06: the page slides along (motion not reduced); a second tap while it slides is not taken
test.describe('the page sliding', () => {
  test.use({ reducedMotion: 'no-preference' });
  test('the next by the foot and by the way on in the preview, the page sliding; a tap while it slides not taken', async ({ page, gh }) => {
    await openWork(page);
    await page.getByRole('button', { name: '次の話 ›' }).click();
    await page.getByRole('button', { name: '次の話 ›' }).click();
    await expect(page.locator('#episode-title')).toHaveValue('駅で');
    await expect.poll(() => page.locator('#body').evaluate(b => b.getAnimations().length)).toBe(0);
    await expect(page.locator('#episode-title')).toHaveValue('駅で');
    await page.getByRole('button', { name: 'プレビュー' }).click();
    // (a tap on the preview but on the way on does nothing)
    await page.locator('#preview h1').click();
    await page.locator('#preview .ep-nav').getByRole('button', { name: '坂の上 ›' }).click();
    await expect(page.locator('#preview h1')).toHaveText('第3話 坂の上');
    await expect.poll(() => page.locator('#preview').evaluate(p => p.getAnimations().length)).toBe(0);
  });
});

// FR-EDIT-06, FR-WORK-03: the next episode cannot be read (no encoding reads it): opened as such, said, the preview left
test('the next episode cannot be read: opened, said; the preview left', async ({ page, gh, work }) => {
  work.push({ 'chapters/02_second.md': /** @type {any} */ (Buffer.from([0x82, 0xff, 0xff])) });
  await openWork(page);
  await page.getByRole('button', { name: 'プレビュー' }).click();
  await page.locator('#preview .ep-nav button[data-go="1"]').click();
  await expect(page.locator('#episode-note')).toHaveText('文字コードが UTF-8 ではないため開けません');
  await expect(page.locator('#preview')).toBeHidden();
  // (and on from there, once it is done)
  await page.getByRole('button', { name: '次の話 ›' }).click();
  await expect(page.locator('#episode-title')).toHaveValue('坂の上');
});

// FR-EDIT-05: an episode that begins with an empty heading (being written): back from the preview at its top; read again
// from the preview when the text is shorter now: the preview from its top
test('the place read: an empty heading at the top; the text shorter when read again', async ({ page, gh, work }) => {
  work.push({ 'chapters/01_first.md': '# \n\n朝が来た。\n' });
  await openWork(page, null);
  await expect(page.locator('#body')).toHaveValue('# \n\n朝が来た。\n');
  await page.getByRole('button', { name: 'プレビュー' }).click();
  await expect(page.locator('#preview p').first()).toBeAttached();
  await page.getByRole('button', { name: '編集に戻る' }).click();
  await expect(page.locator('#body')).toBeVisible();
  expect(await page.locator('#body').evaluate(a => a.scrollTop)).toBe(0);
  const long = Array.from({ length: 200 }, (_, i) => `${i}行目の文。`).join('\n');
  work.push({ 'chapters/01_first.md': `# 第1話 はじまり\n\n${long}\n` });
  await page.getByRole('button', { name: '再読み込み' }).click();
  await expect(page.locator('#body')).toHaveValue(/199行目/);
  await page.getByRole('button', { name: 'プレビュー' }).click();
  await page.locator('#preview').evaluate(p => (p.scrollTop = p.scrollHeight));
  work.push({ 'chapters/01_first.md': '# 第1話 はじまり\n\n短くした。\n' });
  await page.getByRole('button', { name: '再読み込み' }).click();
  await expect(page.locator('#preview')).toContainText('短くした。');
  await expect(page.locator('#preview')).toBeVisible();
  expect(await page.locator('#preview').evaluate(p => p.scrollTop)).toBe(0);
});

// FR-HIST-03, FR-EDIT-05: a version put back while the preview is shown: back to writing, the text put back shown (the
// preview was of the text before)
test('a version put back while the preview is shown: the text put back, in the text box', async ({ page, gh, work }) => {
  const long = Array.from({ length: 200 }, (_, i) => `${i}行目の文。`).join('\n');
  work.push({ 'chapters/01_first.md': `# 第1話 はじまり\n\n${long}\n` });
  await openWork(page);
  await page.getByRole('button', { name: 'プレビュー' }).click();
  await page.locator('#preview').evaluate(p => (p.scrollTop = p.scrollHeight));
  await page.getByRole('button', { name: 'この話の履歴' }).click();
  const dlg = page.locator('#versions');
  await dlg.getByRole('button', { name: /^GitHub 履歴/ }).click();
  await dlg.locator('.version').last().click();
  page.once('dialog', d => void d.accept());
  await dlg.getByRole('button', { name: 'この版を復元' }).click();
  await expect(page.locator('#body')).toBeVisible();
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\n朝が来た。\n');
  await expect(page.locator('#preview')).toBeHidden();
  await page.getByRole('button', { name: 'プレビュー' }).click();
  await expect(page.locator('#preview')).toContainText('朝が来た。');
  await expect(page.locator('#preview')).not.toContainText('199行目');
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
