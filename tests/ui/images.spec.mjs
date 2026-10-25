// Pictures: one inserted is made small and kept as a change not sent, then sent with the texts (FR-EDIT-07); the
// pictures of the work renamed, the texts that show one following (FR-EDIT-08), and put in the trash, the places that
// use it said first (FR-EDIT-09)
import { test, expect, openWork, stored, WORK_FILES } from './lib/test.mjs';
import { japanDay } from '../../lib/commit.js';

const WITH_NOTES = `${WORK_FILES['novel.toml']}\n\n[notes]\ndir = "notes"\n`;
const PNG = /** @type {Buffer} */ (WORK_FILES['notes/images/sky.png']);
/** @param {import('./lib/test.mjs').FakeRepo} work */
const paths = work => Object.keys(work.files(work.refs.main)).sort();

test('a picture inserted where the caret is: made small (JPEG) in the pictures folder, shown in the preview, sent with the text', async ({
  page,
  gh,
  work,
}) => {
  work.push({ 'novel.toml': WITH_NOTES });
  await openWork(page);
  await page.locator('#body').click();
  await page.keyboard.press('Control+End');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '画像を挿入' }).click();
  await (await chooser).setFiles({ name: 'Sky Photo.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('#body')).toHaveValue(/\n!\[\]\(\.\.\/notes\/images\/\d{8}-\d{6}-sky-photo\.jpg\)\n$/);
  await expect(page.locator('#send')).toHaveText('送る（2）');
  const kept = await stored(page, 'drafts');
  const picture = kept.find(d => d.path.endsWith('.jpg'));
  expect(picture.base).toBe('');
  expect([picture.bytes[0], picture.bytes[1]]).toEqual([0xff, 0xd8]);
  // the preview shows it from the device (not sent yet)
  await page.getByRole('button', { name: 'プレビュー' }).click();
  const img = page.locator('#preview img');
  await expect(img).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => img.evaluate(i => /** @type {HTMLImageElement} */ (i).naturalWidth)).toBe(1);
  await page.getByRole('button', { name: '送る（2）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  const sent = paths(work).find(p => p.endsWith('-sky-photo.jpg'));
  expect(sent).toMatch(/^notes\/images\/\d{8}-\d{6}-sky-photo\.jpg$/);
  const bytes = work.blobs.get(work.files(work.refs.main)[/** @type {string} */ (sent)].sha);
  expect([bytes?.[0], bytes?.[1]]).toEqual([0xff, 0xd8]);
  expect(work.head().message).toMatch(new RegExp(`^${japanDay(Date.now())} はじまり ＋\\d+字$`));
});

test('a picture added from the list of pictures; not a picture: refused', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': WITH_NOTES });
  await openWork(page);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  await expect(page.locator('#images-list figcaption')).toHaveText(['sky.png']);
  await expect
    .poll(() =>
      page
        .locator('#images-list img')
        .first()
        .evaluate(i => /** @type {HTMLImageElement} */ (i).naturalWidth),
    )
    .toBe(1);
  let chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '＋ 画像' }).click();
  await (await chooser).setFiles({ name: 'memo.txt', mimeType: 'text/plain', buffer: Buffer.from('文字') });
  await expect(page.locator('#toast')).toHaveText('画像（JPEG、PNG、WebP、GIF）を選んでください');
  chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '＋ 画像' }).click();
  await (await chooser).setFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not a picture') });
  await expect(page.locator('#toast')).toHaveText('画像を読めませんでした。JPEG、PNG、WebP、GIF の画像を選んでください');
  chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '＋ 画像' }).click();
  await (await chooser).setFiles({ name: 'map.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('#images-list figcaption')).toHaveText([/^\d{8}-\d{6}-map\.jpg$/, 'sky.png']);
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await expect(page.locator('#send')).toHaveText('送る（1）');
});

test('a picture renamed: the episodes that show it show it by its new name; sent as one commit', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': WITH_NOTES, 'chapters/01_first.md': '# 第1話 はじまり\n\n![空](../notes/images/sky.png)\n' });
  await openWork(page);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  page.once('dialog', d => void d.accept('skyline'));
  await page.getByRole('button', { name: '名前を変更' }).click();
  await expect(page.locator('#toast')).toHaveText('画像の名前を変更しました（1 か所の画像も新しい名前にしました）');
  await expect(page.locator('#images-list figcaption')).toHaveText(['skyline.png']);
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\n![空](../notes/images/skyline.png)\n');
  await page.getByRole('button', { name: 'プレビュー' }).click();
  await expect.poll(() => page.locator('#preview img').evaluate(i => /** @type {HTMLImageElement} */ (i).naturalWidth)).toBe(1);
  await page.getByRole('button', { name: /^送る/ }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(paths(work)).toContain('notes/images/skyline.png');
  expect(paths(work)).not.toContain('notes/images/sky.png');
  expect(work.text('chapters/01_first.md')).toBe('# 第1話 はじまり\n\n![空](../notes/images/skyline.png)\n');
});
test('a picture renamed to a name not allowed: said, nothing changes', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': WITH_NOTES });
  await openWork(page);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  page.once('dialog', d => void d.accept('空の写真'));
  await page.getByRole('button', { name: '名前を変更' }).click();
  await expect(page.locator('#toast')).toHaveText('画像の名前は、英数字と - _ で 80 文字までにしてください');
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await expect(page.locator('#send')).toBeDisabled();
});

test('a picture put in the trash: how many places use it said first; moved to _trash/', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': WITH_NOTES, 'chapters/01_first.md': '# 第1話 はじまり\n\n![空](../notes/images/sky.png)\n' });
  await openWork(page);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  /** @type {string[]} */
  const said = [];
  page.once('dialog', d => {
    said.push(d.message());
    void d.dismiss();
  });
  await page.getByRole('button', { name: '削除' }).click();
  await expect.poll(() => said.length).toBe(1);
  expect(said[0]).toBe(
    '「sky.png」を削除しますか？ この画像は 1 か所で使われています（本文の ![](…) は残り、画像は表示されなくなります）。削除した画像は作品の _trash/ に残ります',
  );
  await expect(page.locator('#images-list figcaption')).toHaveText(['sky.png']);
  page.once('dialog', d => void d.accept());
  await page.getByRole('button', { name: '削除' }).click();
  await expect(page.locator('#images-list')).toHaveText('まだ画像がありません。');
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await page.getByRole('button', { name: '送る（2）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(paths(work).filter(p => p.startsWith('_trash/'))).toEqual([expect.stringMatching(/^_trash\/\d{8}T\d{6}_sky\.png$/)]);
  expect(work.text('chapters/01_first.md')).toBe('# 第1話 はじまり\n\n![空](../notes/images/sky.png)\n');
});

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
/** @param {import('@playwright/test').Page} page @param {{ name: string, mimeType: string, buffer: Buffer }[]} files */
async function addPicture(page, files) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '＋ 画像' }).click();
  await (await chooser).setFiles(files);
}

// FR-EDIT-07, NFR-SEC-15: a GIF kept as it is (not made small); one over 5 MB refused; nothing chosen: nothing
test('a GIF added as it is; one over 5 MB refused; the picker closed with nothing chosen', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': WITH_NOTES });
  await openWork(page);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  await addPicture(page, []);
  await addPicture(page, [{ name: 'big.gif', mimeType: 'image/gif', buffer: Buffer.concat([GIF, Buffer.alloc(5 * 1024 * 1024)]) }]);
  await expect(page.locator('#toast')).toHaveText('画像が大きすぎます（5 MB まで）');
  await addPicture(page, [{ name: 'dot.gif', mimeType: 'image/gif', buffer: GIF }]);
  await expect(page.locator('#toast')).toHaveText('画像を挿入しました（送るまではこの端末だけの変更です）');
  await expect(page.locator('#images-list figcaption')).toHaveText([/^\d{8}-\d{6}-dot\.gif$/, 'sky.png']);
  const kept = (await stored(page, 'drafts')).find(d => d.path.endsWith('-dot.gif'));
  expect(Buffer.from(Object.values(kept.bytes))).toEqual(GIF);
});

// FR-EDIT-07: a browser that cannot make the small picture (its canvas gives nothing, or a kind of picture the work does
// not take): said, nothing added
test('the small picture not made by the browser: said, nothing added', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': WITH_NOTES });
  await openWork(page);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  await page.evaluate(() => {
    HTMLCanvasElement.prototype.toBlob = function (done) {
      done(null);
    };
  });
  await addPicture(page, [{ name: 'map.png', mimeType: 'image/png', buffer: PNG }]);
  await expect(page.locator('#toast')).toHaveText('画像を読めませんでした。JPEG、PNG、WebP、GIF の画像を選んでください');
  await page.evaluate(() => {
    HTMLCanvasElement.prototype.toBlob = function (done) {
      done(new Blob(['x'], { type: 'image/bmp' }));
    };
  });
  await addPicture(page, [{ name: 'map.png', mimeType: 'image/png', buffer: PNG }]);
  await expect(page.locator('#toast')).toHaveText('画像（JPEG、PNG、WebP、GIF）を選んでください');
  await expect(page.locator('#images-list figcaption')).toHaveText(['sky.png']);
});

// FR-EDIT-07, FR-NOTE-01: the pictures by folder when there are more than one; one that cannot be read shows no picture;
// [images] dir alone, or no folder at all (the top images/, said)
test('the list of pictures: by folder; one that cannot be read; the folder from [images], or none set', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': WITH_NOTES, 'notes/maps/town.gif': GIF });
  const sky = work.files(work.refs.main)['notes/images/sky.png'].sha;
  await page.route(
    u => u.pathname.endsWith(`/git/blobs/${sky}`),
    route => route.abort('failed'),
  );
  await openWork(page);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  await expect(page.locator('#images-list .notes-folder span')).toHaveText(['notes/images', 'notes/maps']);
  await expect(page.locator('#images-list figcaption')).toHaveText(['sky.png', 'town.gif']);
  await expect(page.locator('#images-list img').nth(1)).toHaveAttribute('src', /^blob:/);
  await expect(page.locator('#images-list img').first()).not.toHaveAttribute('src', /./);
  // [images] dir alone
  work.push({ 'novel.toml': `${WORK_FILES['novel.toml']}\n\n[images]\ndir = "notes/maps"\n` });
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await page.locator('#reload-work').click();
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  await expect(page.locator('#images-list figcaption')).toHaveText(['town.gif']);
  // none set: the top images/
  work.push({ 'novel.toml': WORK_FILES['novel.toml'], 'images/top.png': PNG });
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await page.locator('#reload-work').click();
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  // (nothing said over them, as the server version's)
  await expect(page.locator('#images-list figcaption')).toHaveText(['top.png']);
});

// FR-EDIT-08, FR-EDIT-09: the name not changed (closed, empty, the same): nothing; a picture no text shows renamed and
// put in the trash: nothing more said
test('a picture renamed: not when closed, empty or the same; one no text shows renamed and put in the trash', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': WITH_NOTES });
  await openWork(page);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  for (const answer of [null, '  ', 'sky']) {
    page.once('dialog', d => void (answer === null ? d.dismiss() : d.accept(answer)));
    await page.getByRole('button', { name: '名前を変更' }).click();
    await expect(page.locator('#images-list figcaption')).toHaveText(['sky.png']);
  }
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await expect(page.locator('#send')).toBeDisabled();
  await page.getByRole('button', { name: '資料', exact: true }).click();
  page.once('dialog', d => void d.accept('sky2'));
  await page.getByRole('button', { name: '名前を変更' }).click();
  await expect(page.locator('#toast')).toHaveText('画像の名前を変更しました');
  await expect(page.locator('#images-list figcaption')).toHaveText(['sky2.png']);
  /** @type {string[]} */
  const said = [];
  page.once('dialog', d => {
    said.push(d.message());
    void d.accept();
  });
  await page.getByRole('button', { name: '削除' }).click();
  await expect(page.locator('#images-list')).toHaveText('まだ画像がありません。');
  expect(said).toEqual(['「sky2.png」を削除しますか？ 削除した画像は作品の _trash/ に残ります']);
});

// FR-EDIT-07〜09, FR-WORK-04: novel.toml with line ends of two kinds is not written: a picture added, renamed or put in
// the trash is refused, said
test('novel.toml with line ends of two kinds: a picture added, renamed or put in the trash refused, said', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': WITH_NOTES.replace('\n', '\r\n') });
  await openWork(page);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  const refused = 'novel.toml の改行の形が行によって違うので、書き換えません（GitHub か Working Copy でそろえてください）';
  await addPicture(page, [{ name: 'dot.gif', mimeType: 'image/gif', buffer: GIF }]);
  await expect(page.locator('#toast')).toHaveText(refused);
  page.once('dialog', d => void d.accept('sky2'));
  await page.getByRole('button', { name: '名前を変更' }).click();
  await expect(page.locator('#toast')).toHaveText(refused);
  await page.locator('#toast').evaluate(t => (t.textContent = ''));
  page.once('dialog', d => void d.accept());
  await page.getByRole('button', { name: '削除' }).click();
  await expect(page.locator('#toast')).toHaveText(refused);
  await expect(page.locator('#images-list figcaption')).toHaveText(['sky.png']);
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await expect(page.locator('#send')).toBeDisabled();
});
