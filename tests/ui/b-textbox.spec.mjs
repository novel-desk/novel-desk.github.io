// The text box of the episode on a phone: the input bar over the keyboard as iOS moves the window (its visual viewport),
// the line written kept in sight, the bar's buttons in a browser without insertText; and the place kept between the
// text box and the preview in a long episode
import { test, expect, openWork } from './lib/test.mjs';

// (no sliding of the page: the next step waits for nothing)
test.use({ reducedMotion: 'reduce' });

// a window like iOS's over the keyboard: its height, and how far down the page it is (window.visualViewport replaced)
const IOS_WINDOW = () => {
  const vv = Object.assign(new EventTarget(), { height: 500, pageTop: 120, width: 390 });
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
};

test.describe('a phone (a finger)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  // FR-EDIT-04: writing, the page is cut to the window over the keyboard and moved down with it; the line written
  // brought into sight; measured again while the keyboard slides in, and no more once it has settled
  test('the page cut to the window over the keyboard and moved with it; the line written brought into sight', async ({ page, gh, work }) => {
    work.push({ 'chapters/01_first.md': `# 第1話 はじまり\n\n${Array.from({ length: 120 }, (_, i) => `${i}行目。`).join('\n')}\n` });
    await page.addInitScript(IOS_WINDOW);
    await page.clock.install();
    await openWork(page);
    const area = page.locator('#body');
    await area.evaluate(a => {
      const t = /** @type {HTMLTextAreaElement} */ (a);
      t.setSelectionRange(t.value.length, t.value.length);
      t.scrollTop = 0;
    });
    await area.focus();
    await expect(page.locator('#desk')).toHaveClass(/writing/);
    await expect(page.locator('#desk')).toHaveAttribute('style', /height: 500px; transform: translateY\(120px\)/);
    await expect.poll(() => area.evaluate(a => a.scrollTop)).toBeGreaterThan(0);
    // the keyboard sliding in: the window smaller again, measured again
    await page.evaluate(() => {
      const vv = /** @type {any} */ (window.visualViewport);
      vv.height = 450;
      vv.dispatchEvent(new Event('resize'));
    });
    await expect(page.locator('#desk')).toHaveAttribute('style', /height: 450px/);
    await page.clock.runFor(1200);
    // the box left (another field, say) while the window changes: the page follows, the box is not scrolled
    const top = await area.evaluate(a => a.scrollTop);
    await page.evaluate(() => {
      /** @type {HTMLElement} */ (document.activeElement).blur();
      const vv = /** @type {any} */ (window.visualViewport);
      vv.height = 400;
      vv.pageTop = 0;
      vv.dispatchEvent(new Event('scroll'));
    });
    await expect(page.locator('#desk')).toHaveAttribute('style', /height: 400px/);
    expect(await area.evaluate(a => a.scrollTop)).toBe(top);
  });

  // FR-EDIT-03: a browser whose insertText does not work: the bar's text put in all the same; a tap between the buttons
  // does nothing
  test('the input bar where the browser cannot insertText: put in all the same; a tap between the buttons does nothing', async ({ page, gh }) => {
    await page.addInitScript(() => {
      const exec = document.execCommand.bind(document);
      document.execCommand = (cmd, ...rest) => (cmd === 'insertText' ? false : exec(cmd, ...rest));
    });
    await openWork(page);
    const area = page.locator('#body');
    await area.fill('');
    await area.focus();
    const bar = page.locator('#kbar');
    await bar.locator('.kbar-sep').first().click();
    await expect(area).toHaveValue('');
    await bar.getByRole('button', { name: '……' }).click();
    await expect(area).toHaveValue('……');
    await bar.getByRole('button', { name: '「」' }).click();
    await expect(area).toHaveValue('……「」');
    await expect(page.locator('#send')).toHaveText('送る（1）');
  });
});

// FR-EDIT-05: a long episode: the place kept when the preview is switched on and off, far down it too (the lines laid
// out a part at a time), and on a line after an empty one
test('a long episode: the place kept between the text box and the preview, far down it too', async ({ page, gh, work }) => {
  const lines = Array.from({ length: 300 }, (_, i) => (i % 3 === 2 ? '' : `${i}行目。`));
  work.push({ 'chapters/01_first.md': `# 第1話 はじまり\n\n${lines.join('\n')}\n` });
  await openWork(page);
  const area = page.locator('#body');
  for (const line of [280, 6]) {
    // (the text box scrolled to that line: where it is, measured as the app measures it)
    await area.evaluate((a, n) => {
      const t = /** @type {HTMLTextAreaElement} */ (a);
      const lh = parseFloat(getComputedStyle(t).lineHeight);
      t.scrollTop = lh * n;
    }, line);
    const before = await area.evaluate(a => a.scrollTop);
    await page.getByRole('button', { name: 'プレビュー' }).click();
    await expect(page.locator('#preview')).toBeVisible();
    await page.getByRole('button', { name: '編集に戻る' }).click();
    await expect(area).toBeVisible();
    await expect.poll(() => area.evaluate(a => a.scrollTop)).toBeGreaterThan(before - 80);
    expect(await area.evaluate(a => a.scrollTop)).toBeLessThan(before + 80);
  }
});

// FR-EDIT-05: the preview read on an empty line (between two paragraphs): back in the text box at that line
test('the preview read where an empty line is: back in the text box at that line', async ({ page, gh, work }) => {
  const lines = Array.from({ length: 90 }, (_, i) => (i % 3 === 2 ? '' : `${i}行目。`));
  work.push({ 'chapters/01_first.md': `# 第1話 はじまり\n\n${lines.join('\n')}\n` });
  await openWork(page);
  await page.getByRole('button', { name: 'プレビュー' }).click();
  // (scrolled to just past the paragraph before an empty line: the empty line is the first one read)
  const line = await page.locator('#preview').evaluate(pv => {
    const empty = /** @type {HTMLElement[]} */ ([...pv.querySelectorAll('p[data-l]')]).filter(p => !p.textContent)[5];
    const before = /** @type {HTMLElement} */ (empty.previousElementSibling);
    const top = (/** @type {HTMLElement} */ el) => el.getBoundingClientRect().top - pv.getBoundingClientRect().top + pv.scrollTop;
    pv.scrollTop = top(before) + before.offsetHeight - 1;
    return Number(empty.dataset.l);
  });
  await page.getByRole('button', { name: '編集に戻る' }).click();
  const area = page.locator('#body');
  const lh = await area.evaluate(a => parseFloat(getComputedStyle(a).lineHeight));
  await expect.poll(() => area.evaluate(a => a.scrollTop)).toBeGreaterThan((line - 3) * lh);
});

// FR-EDIT-05, FR-HIST-03: an older, shorter version put back while the preview is read far down: back in the text
// box, at its top (the place read is past the end of the text now)
test('a shorter version put back while reading the preview far down: back in the text box at its top', async ({ page, gh, work }) => {
  work.push({ 'chapters/01_first.md': '# 第1話 はじまり\n\n短い。\n' });
  work.push({ 'chapters/01_first.md': `# 第1話 はじまり\n\n${Array.from({ length: 200 }, (_, i) => `${i}行目。`).join('\n')}\n` });
  await openWork(page);
  await page.getByRole('button', { name: 'プレビュー' }).click();
  await page.locator('#preview').evaluate(pv => (pv.scrollTop = pv.scrollHeight));
  await page.getByRole('button', { name: 'この話の履歴' }).click();
  const dlg = page.locator('#versions');
  await dlg.getByRole('button', { name: /^GitHub 履歴/ }).click();
  await dlg.locator('.version').nth(1).click();
  page.once('dialog', d => void d.accept());
  await dlg.getByRole('button', { name: 'この版を復元' }).click();
  await expect(dlg).toBeHidden();
  // (the preview left: the text put back is in the text box)
  await expect(page.locator('#preview')).toBeHidden();
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\n短い。\n');
  expect(await page.locator('#body').evaluate(a => a.scrollTop)).toBe(0);
});
