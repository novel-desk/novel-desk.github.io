// 横の資料: on a PC's or an iPad's (landscape) width only, a note beside the text: the list as on 資料, one as read; kept
// for the work over a reload; read again when an episode is opened; its width dragged and kept (FR-NOTE-11)
import { test, expect, openWork, WORK_FILES } from './lib/test.mjs';

const TOML = `${WORK_FILES['novel.toml']}\n\n[notes]\ndir = "notes"\n`;
const WIDE = { width: 1400, height: 900 },
  IPAD_SIDE = { width: 1180, height: 820 },
  NARROW = { width: 1024, height: 1366 };

test.use({ viewport: WIDE });

test('a note beside the text: the list, one as read, kept over a reload, closed', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': TOML, 'notes/world.md': '# 世界\n空は青い\n', 'notes/memo.md': '# メモ\n' });
  await openWork(page);
  const side = page.locator('#side-note');
  await expect(side).toBeHidden();
  await page.getByRole('button', { name: '資料を横に出す' }).click();
  await expect(side.locator('.notes-folder span')).toHaveText(['主な資料', 'そのほか']);
  await expect(side.locator('[data-side-note]')).toHaveText(['世界', 'メモ']);
  await side.locator('[data-side-note]', { hasText: '世界' }).click();
  await expect(side.locator('.plot-panel-head b')).toHaveText('world.md');
  await expect(side.locator('.side-note-body p')).toHaveText(['空は青い', '']);
  // the text beside it keeps its room
  expect(await page.locator('#body').evaluate(b => b.getBoundingClientRect().width)).toBeGreaterThanOrEqual(420);
  await page.reload();
  await expect(side.locator('.plot-panel-head b')).toHaveText('world.md');
  // written on 資料 meanwhile: shown when back (a draft not sent)
  await page.getByRole('button', { name: '資料', exact: true }).click();
  await page.locator('#notes-list [data-note]', { hasText: '世界' }).click();
  await page.locator('#note-body').press('Control+End');
  await page.keyboard.type('海も青い');
  await page.getByRole('button', { name: '‹ 一覧' }).click();
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await expect(side.locator('.side-note-body')).toContainText('海も青い');
  await expect(side).toContainText('まだ送っていない書きかけがあります');
  await side.getByRole('button', { name: '‹ 一覧' }).click();
  await expect(side.locator('[data-side-note]')).toHaveCount(2);
  await side.getByRole('button', { name: '閉じる' }).click();
  await expect(side).toBeHidden();
  await page.reload();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await expect(side).toBeHidden();
});

test('the width: dragged at the border and with ← →, held between the least of each, kept', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': TOML, 'notes/world.md': '# 世界\n' });
  await openWork(page);
  await page.getByRole('button', { name: '資料を横に出す' }).click();
  const side = page.locator('#side-note');
  await expect(side).toBeVisible();
  const grip = page.locator('#side-grip');
  const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await grip.boundingBox());
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(1400 - 500, box.y + 200, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => side.evaluate(s => Math.round(s.getBoundingClientRect().width))).toBe(500);
  // narrower than the least: 240
  await page.mouse.move(1400 - 500, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(1390, box.y + 200, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => side.evaluate(s => Math.round(s.getBoundingClientRect().width))).toBe(240);
  await grip.focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => side.evaluate(s => Math.round(s.getBoundingClientRect().width))).toBe(256);
  await expect(grip).toHaveAttribute('aria-valuenow', '256');
  await page.reload();
  await expect.poll(() => side.evaluate(s => Math.round(s.getBoundingClientRect().width))).toBe(256);
});

// FR-NOTE-11, FR-NOTE-01, FR-NOTE-02: the list as on 資料: the notes in a folder under it, one without a heading by its
// file name, one that cannot be read as a note that says so; the panel closed by its button on the desk
test('the list beside the text: folders, a note without a heading, one that cannot be read; closed by the button', async ({ page, gh, work }) => {
  work.push({
    'novel.toml': TOML,
    'notes/plot.md': '# プロット\n',
    'notes/people/kou.md': '# 甲\n',
    'notes/memo.md': '見出しのない資料\n',
    'notes/bad.md': /** @type {any} */ (Buffer.from([0x82, 0xff, 0xff])),
  });
  await openWork(page);
  const side = page.locator('#side-note');
  await page.getByRole('button', { name: '資料を横に出す' }).click();
  await expect(side.locator('.notes-folder span')).toHaveText(['主な資料', 'そのほか', 'people']);
  await expect(side.locator('[data-side-note]')).toHaveText(['プロット プロット', 'bad.md', 'memo.md', '甲']);
  await side.locator('[data-side-note]', { hasText: 'memo' }).click();
  await expect(side.locator('.plot-panel-head b')).toHaveText('memo.md');
  await expect(side.locator('.side-note-body')).toHaveText('見出しのない資料');
  await side.getByRole('button', { name: '‹ 一覧' }).click();
  await side.locator('[data-side-note]', { hasText: 'bad' }).click();
  await expect(side).toContainText('この資料は読めません（無くなったか、この端末にまだ読み込まれていません）。');
  // (a tap beside the buttons does nothing)
  await side.getByText('この資料は読めません').click();
  await expect(side.locator('.plot-panel-head b')).toHaveText('notes/bad.md');
  await page.getByRole('button', { name: '資料を横に出す' }).click();
  await expect(side).toBeHidden();
  await page.getByRole('button', { name: '資料を横に出す' }).click();
  await expect(side.locator('[data-side-note]')).toHaveCount(4);
});

// FR-NOTE-11, FR-NOTE-02: every note one of the main ones: no 「そのほか」; a work with no notes: said how to make one
test('the list beside the text: only main notes; none at all', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': TOML, 'notes/plot.md': '# プロット\n' });
  await openWork(page);
  const side = page.locator('#side-note');
  await page.getByRole('button', { name: '資料を横に出す' }).click();
  await expect(side.locator('.notes-folder span')).toHaveText(['主な資料']);
  await expect(side.locator('[data-side-note] .vis')).toHaveText('プロット');
  work.push({ 'notes/plot.md': null });
  await page.locator('#reload-work').click();
  await expect(side).toContainText('まだ資料がありません。目次の「資料」から作成できます。');
});

// FR-NOTE-11: the note kept for the work gone from GitHub: said when it is opened again
test('the note kept beside the text gone from GitHub: said', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': TOML, 'notes/world.md': '# 世界\n' });
  await openWork(page);
  const side = page.locator('#side-note');
  await page.getByRole('button', { name: '資料を横に出す' }).click();
  await side.locator('[data-side-note]', { hasText: '世界' }).click();
  await expect(side.locator('.plot-panel-head b')).toHaveText('world.md');
  work.push({ 'notes/world.md': null });
  await page.locator('#reload-work').click();
  await expect(side).toContainText('この資料は読めません');
  await expect(side.locator('.plot-panel-head b')).toHaveText('notes/world.md');
});

// FR-NOTE-11, FR-EDIT-07: a note with a picture, shown with it; another episode opened: the note left as it is, where it
// was scrolled to
test('a note with a picture beside the text; another episode opened: left where it was scrolled to', async ({ page, gh, work }) => {
  const long = Array.from({ length: 80 }, (_, i) => `${i}行目`).join('\n');
  work.push({ 'novel.toml': TOML, 'notes/world.md': `# 世界\n![空](images/sky.png)\n${long}\n` });
  await openWork(page);
  const side = page.locator('#side-note');
  await page.getByRole('button', { name: '資料を横に出す' }).click();
  await side.locator('[data-side-note]', { hasText: '世界' }).click();
  await expect(side.locator('.side-note-body img')).toHaveAttribute('src', /^blob:/);
  await side.locator('.side-note-body').evaluate(b => (b.scrollTop = 300));
  await page.locator('#tree .node', { hasText: '駅で' }).click();
  await expect(page.locator('#episode-title')).toHaveValue('駅で');
  await expect(side.locator('.plot-panel-head b')).toHaveText('world.md');
  expect(await side.locator('.side-note-body').evaluate(b => b.scrollTop)).toBe(300);
});

// FR-NOTE-11: a drawing of the panel overtaken by a later one (another episode opened while the first still reads from
// GitHub) draws nothing; the later one is drawn: the list, a note, a note's picture
test.describe('drawn while another episode is opened', () => {
  /** @param {import('@playwright/test').Page} page @param {string} sha */
  async function hold(page, sha) {
    /** @type {() => void} */
    let release = () => {};
    const gate = new Promise(r => (release = () => r(undefined)));
    let arrived = 0;
    await page.route(
      u => u.pathname.endsWith(`/git/blobs/${sha}`),
      async route => {
        arrived++;
        await gate;
        await route.fallback();
      },
    );
    return { release, arrived: () => arrived };
  }
  /** @param {import('./lib/test.mjs').FakeRepo} work @param {string} path */
  const shaOf = (work, path) => work.files(work.refs.main)[path].sha;

  test('the list', async ({ page, gh, work }) => {
    work.push({ 'novel.toml': TOML, 'notes/world.md': '# 世界\n一覧\n' });
    await openWork(page);
    const h = await hold(page, shaOf(work, 'notes/world.md'));
    await page.getByRole('button', { name: '資料を横に出す' }).click();
    await expect.poll(h.arrived).toBeGreaterThan(0);
    await page.locator('#tree .node', { hasText: '駅で' }).click();
    await expect(page.locator('#episode-title')).toHaveValue('駅で');
    h.release();
    await expect(page.locator('#side-note [data-side-note]')).toHaveText(['世界']);
  });
  test('a note', async ({ page, gh, work }) => {
    work.push({ 'novel.toml': TOML, 'notes/world.md': '# 世界\n前\n' });
    await openWork(page);
    const side = page.locator('#side-note');
    await page.getByRole('button', { name: '資料を横に出す' }).click();
    await side.locator('[data-side-note]', { hasText: '世界' }).click();
    await expect(side.locator('.side-note-body')).toContainText('前');
    work.push({ 'notes/world.md': '# 世界\n後\n' });
    const h = await hold(page, shaOf(work, 'notes/world.md'));
    await page.locator('#reload-work').click();
    await expect.poll(h.arrived).toBeGreaterThan(0);
    await page.locator('#tree .node', { hasText: '駅で' }).click();
    await expect(page.locator('#episode-title')).toHaveValue('駅で');
    h.release();
    await expect(side.locator('.side-note-body')).toContainText('後');
  });
  test('a picture of the note', async ({ page, gh, work }) => {
    work.push({ 'novel.toml': TOML, 'notes/world.md': '# 世界\n![空](images/sky.png)\n' });
    await openWork(page);
    const side = page.locator('#side-note');
    await page.getByRole('button', { name: '資料を横に出す' }).click();
    await expect(side.locator('[data-side-note]')).toHaveText(['世界']);
    const h = await hold(page, shaOf(work, 'notes/images/sky.png'));
    await side.locator('[data-side-note]', { hasText: '世界' }).click();
    await expect.poll(h.arrived).toBeGreaterThan(0);
    await page.locator('#tree .node', { hasText: '駅で' }).click();
    await expect(page.locator('#episode-title')).toHaveValue('駅で');
    h.release();
    await expect(side.locator('.plot-panel-head b')).toHaveText('world.md');
    await expect(side.locator('.side-note-body img')).toHaveAttribute('src', /^blob:/);
  });
});

// FR-NOTE-11: the border taken by another button, or let go outside the window (the move after it without a button),
// does not drag; ← → only of the keys
test('the width: not by another button, not after letting go outside; → narrower; other keys nothing', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': TOML, 'notes/world.md': '# 世界\n' });
  await openWork(page);
  await page.getByRole('button', { name: '資料を横に出す' }).click();
  const side = page.locator('#side-note');
  await expect(side).toBeVisible();
  const width = () => side.evaluate(s => Math.round(s.getBoundingClientRect().width));
  const before = await width();
  const grip = page.locator('#side-grip');
  const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await grip.boundingBox());
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(700, box.y + 200, { steps: 3 });
  await page.mouse.up({ button: 'right' });
  expect(await width()).toBe(before);
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  // (the button let go outside the window: the next move comes without it)
  await page.evaluate(() => dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, buttons: 0, clientX: 600, clientY: 300 })));
  await expect(grip).not.toHaveClass(/dragging/);
  await page.mouse.move(700, box.y + 200, { steps: 3 });
  await page.mouse.up();
  expect(await width()).toBe(before);
  await grip.focus();
  await page.keyboard.press('a');
  expect(await width()).toBe(before);
  await page.keyboard.press('ArrowRight');
  await expect.poll(width).toBe(before - 16);
});

test.describe('an iPad on its side', () => {
  test.use({ viewport: IPAD_SIDE });
  test('the button and the panel are there', async ({ page, gh, work }) => {
    work.push({ 'novel.toml': TOML, 'notes/world.md': '# 世界\n' });
    await openWork(page);
    await page.getByRole('button', { name: '資料を横に出す' }).click();
    await expect(page.locator('#side-note')).toBeVisible();
  });
});
test.describe('an iPad standing', () => {
  test.use({ viewport: NARROW });
  test('neither the button nor the panel', async ({ page, gh, work }) => {
    work.push({ 'novel.toml': TOML, 'notes/world.md': '# 世界\n' });
    await openWork(page);
    await expect(page.getByRole('button', { name: '資料を横に出す' })).toBeHidden();
  });
});

// B7: on a wide screen, the text box as wide as the paper (its scrollbar at the right edge), the text 46em wide in the middle
test('a wide screen: the text box reaches the right edge; the text kept in the middle, as wide as before', async ({ page, gh, work }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  work.push({ 'novel.toml': TOML, 'notes/world.md': '# 世界\n空は青い\n' });
  await openWork(page);
  const edges = () =>
    page.evaluate(() => {
      const b = /** @type {HTMLElement} */ (document.getElementById('body')),
        p = /** @type {HTMLElement} */ (document.querySelector('main.paper'));
      const r = b.getBoundingClientRect(),
        c = getComputedStyle(b);
      return { right: r.right, paper: p.getBoundingClientRect().right, text: r.width - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight) };
    });
  const e = await edges();
  expect(e.right).toBe(e.paper);
  // 46em of 14px, less the padding of 22px on each side
  expect(e.text).toBeCloseTo(644 - 44, 0);
  // beside a note too
  await page.getByRole('button', { name: '資料を横に出す' }).click();
  const n = await edges();
  expect(n.right).toBe(n.paper);
  // (the note beside it, a wide panel, keeps its own padding: not the text's)
  await page.locator('#side-note [data-side-note]', { hasText: '世界' }).click();
  await expect(page.locator('#side-note .side-note-body')).toHaveCSS('padding-left', '20px');
});
