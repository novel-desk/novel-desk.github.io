// 待ちの間の表示 (DESK-OPS-05): an operation that waits says what it is doing: in the band over the screen once it has
// taken longer than 0.3 seconds (ui/dom.js busy), or where its answer will be shown. GitHub's answers are held here
// (page.route, in front of the fake GitHub) to look at the screen meanwhile: the band shown while they are held is the
// band shown after the wait
import { test, expect, keepMoreOpen, noPasskey, openRepo, openWork, startApp, TOKEN, WORK_FILES } from './lib/test.mjs';

const NOTES = {
  'novel.toml': `${WORK_FILES['novel.toml']}\n\n[notes]\ndir = "notes"\n`,
  'notes/plot.md': '# プロット\n\n# 大箱1：起\n\n## 第1話 はじまり\n朝が来る。\n',
  'notes/world.md': '# 世界観\n\n空は青い。\n',
};

// GitHub's answers to the requests `match` takes held until the function returned is called; then answered by the fake
// GitHub, or (`fail`) with an error
/**
 * @param {import('@playwright/test').Page} page
 * @param {(method: string, path: string) => boolean} match
 * @param {boolean} [fail]
 */
async function hold(page, match, fail = false) {
  let release = () => {};
  const gate = new Promise(r => (release = () => r(undefined)));
  await page.route('https://api.github.com/**', async route => {
    const req = route.request();
    if (!match(req.method(), new URL(req.url()).pathname)) return route.fallback();
    await gate;
    if (fail)
      return route.fulfill({ status: 500, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: '{"message":"test"}' });
    return route.fallback();
  });
  return release;
}
// the blobs (the texts of the notes, the pictures)
/** @param {string} m @param {string} path */
const blobs = (m, path) => m === 'GET' && path.includes('/git/blobs/');

// DESK-OPS-05: the band: shown while the branches are read, gone once they are
test('DESK-OPS-05: the branches read: ブランチを読み込んでいます… in the band until the list is shown', async ({ page, gh }) => {
  void gh;
  await openWork(page);
  await expect(page.locator('#busy')).toBeHidden();
  const release = await hold(page, (m, p) => m === 'GET' && p.endsWith('/branches'));
  await page.getByRole('button', { name: /⎇ main/ }).click();
  await expect(page.locator('#busy')).toBeVisible();
  await expect(page.locator('#busy')).toHaveText('ブランチを読み込んでいます…');
  release();
  await expect(page.locator('#picker')).toBeVisible();
  await expect(page.locator('#busy')).toBeHidden();
});

// DESK-OPS-05: GitHub リポジトリをインポート: the band, and the button not pressed again until the repository is found
test('DESK-OPS-05: a repository imported: the band, and インポート not pressed again meanwhile', async ({ page, gh }) => {
  void gh;
  await openWork(page);
  await page.locator('#to-shelf').click();
  const release = await hold(page, (m, p) => m === 'GET' && p === '/repos/author/other');
  const details = page.locator('#shelf details.import');
  if (!(await details.evaluate(d => /** @type {HTMLDetailsElement} */ (d).open))) await page.locator('#shelf details.import > summary').click();
  await page.locator('#import-repo').fill('author/other');
  const button = page.locator('#import-work button');
  await button.click();
  await expect(page.locator('#busy')).toHaveText('読み込んでいます…');
  await expect(page.locator('#busy')).toBeVisible();
  await expect(button).toBeDisabled();
  release();
  await expect(page.locator('#desk')).toBeVisible();
  await expect(page.locator('#busy')).toBeHidden();
  await expect(button).toBeEnabled();
});

// DESK-OPS-05: a branch made and switched to: the band while it is made; while it is read, the text box not written in
// (as when a work is opened), and written in again once read, or when it could not be read
test('DESK-OPS-05: a branch made and switched to: the band, the text box disabled until it is read, read or not', async ({ page, gh }) => {
  void gh;
  await openWork(page);
  const made = await hold(page, (m, p) => m === 'POST' && p.endsWith('/git/refs'));
  await page.getByRole('button', { name: /⎇ main/ }).click();
  await page.locator('#picker-input').fill('second');
  await page.locator('#picker').getByRole('button', { name: '決定' }).click();
  await expect(page.locator('#busy')).toHaveText('ブランチを作成しています…');
  await expect(page.locator('#busy')).toBeVisible();
  const read = await hold(page, (m, p) => m === 'GET' && p.endsWith('/git/ref/heads/second'));
  made();
  await expect(page.locator('#busy')).toHaveText('ブランチを読み込んでいます…');
  await expect(page.locator('#body')).toBeDisabled();
  read();
  await expect(page.getByRole('button', { name: /⎇ second/ })).toBeVisible();
  await expect(page.locator('#body')).toBeEnabled();
  await expect(page.locator('#busy')).toBeHidden();
  // back to main, GitHub failing while it is read: the text box written in again
  const failing = await hold(page, (m, p) => m === 'GET' && p.endsWith('/git/ref/heads/main'), true);
  await page.getByRole('button', { name: /⎇ second/ }).click();
  await page.locator('#picker').getByRole('button', { name: 'main', exact: true }).click();
  await expect(page.locator('#body')).toBeDisabled();
  failing();
  await expect(page.locator('#sync-state')).toHaveClass(/err/);
  await expect(page.locator('#body')).toBeEnabled();
  await expect(page.locator('#busy')).toBeHidden();
});

// DESK-OPS-05: リポジトリの名前を変更: the band over the dialog (a modal dialog covers the rest of the page), its button
// not pressed again meanwhile
test('DESK-OPS-05: the repository renamed: 名前を変更しています… over the dialog', async ({ page, gh }) => {
  gh.adminTokens = [TOKEN];
  await openWork(page);
  await page.getByRole('button', { name: '名前を変更' }).click();
  await page.getByLabel('新しい名前（英数字と . _ -）').fill('novel-renamed');
  await page.locator('#rename-admin-token').fill(TOKEN);
  const release = await hold(page, (m, p) => m === 'PATCH' && p === '/repos/author/novel');
  await page.locator('#rename-repo-go').click();
  await expect(page.locator('#busy')).toHaveText('名前を変更しています…');
  await expect(page.locator('#busy')).toBeVisible();
  // (over the dialog: in the top layer, shown after it)
  await expect(page.locator('#busy:popover-open')).toHaveCount(1);
  await expect(page.locator('#rename-repo-go')).toBeDisabled();
  release();
  await expect(page.locator('#toast')).toHaveText('author/novel-renamed に変更しました');
  await expect(page.locator('#busy')).toBeHidden();
  await expect(page.locator('#busy')).not.toHaveAttribute('popover');
});

// DESK-OPS-05: 設定: what GitHub says of the connection, said to be asked until it answers
test('DESK-OPS-05: the settings: GitHub に確かめています… until GitHub answers', async ({ page, gh }) => {
  void gh;
  await openWork(page);
  const release = await hold(page, (m, p) => m === 'GET' && p === '/app');
  await page.locator('#to-shelf').click();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await expect(page.locator('#gh-state')).toHaveText('GitHub に確かめています…');
  release();
  await expect(page.locator('#gh-state')).toHaveText('GitHub App で連携しています');
});

// DESK-OPS-05: 資料 opened from another work: the list of the work before neither seen nor pressed until this one's is read
test("DESK-OPS-05: the notes opened: the lists emptied, 読み込んでいます… until this work's are read", async ({ page, gh, work }) => {
  work.push(NOTES);
  /** @type {import('./lib/test.mjs').FakeRepo} */ (gh.repos.get('author/other')).push({
    'novel.toml': '[notes]\ndir = "notes"\n',
    'notes/b.md': '# 別の資料\n',
  });
  await openWork(page);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  await expect(page.locator('#notes-list [data-note]', { hasText: '世界観' })).toBeVisible();
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await page.locator('#to-shelf').click();
  await openRepo(page, 'author/other');
  await expect(page.locator('#desk')).toBeVisible();
  await expect(page.locator('#save-state')).toHaveText(/話がありません/);
  const release = await hold(page, blobs);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  await expect(page.locator('#notes-list')).toHaveText('読み込んでいます…');
  await expect(page.locator('#images-list')).toHaveText('読み込んでいます…');
  await expect(page.locator('#notes-list [data-note]')).toHaveCount(0);
  release();
  await expect(page.locator('#notes-list [data-note]')).toHaveText(['別の資料']);
  await expect(page.locator('#images-list')).toHaveText('まだ画像がありません。');
});

// DESK-OPS-05: この話のプロット: what the panel showed before emptied until the plot is read again
test('DESK-OPS-05: the plot over the text opened: 読み込んでいます… until the plot is read, not what it showed before', async ({ page, gh, work }) => {
  void gh;
  work.push(NOTES);
  await openWork(page);
  await page.getByRole('button', { name: 'この話のプロット' }).click();
  await expect(page.locator('#plot-panel .plot-panel-body')).toHaveText('朝が来る。');
  await page.getByRole('button', { name: 'この話のプロット' }).click();
  await expect(page.locator('#plot-panel')).toBeHidden();
  // the plot changed on GitHub, and read again (the work's notes are read when they are shown)
  work.push({ 'notes/plot.md': '# プロット\n\n# 大箱1：起\n\n## 第1話 はじまり\n夜が明ける。\n' });
  await page.locator('#reload-work').click();
  await expect(page.locator('#sync-state')).not.toHaveText('読み込み中…');
  const release = await hold(page, blobs);
  await page.getByRole('button', { name: 'この話のプロット' }).click();
  await expect(page.locator('#plot-panel')).toHaveText('読み込んでいます…');
  release();
  await expect(page.locator('#plot-panel .plot-panel-body')).toHaveText('夜が明ける。');
});

// DESK-OPS-05: the next episode from the preview: its text not seen as typed while its pictures are read; the preview
// kept until it is drawn, and the band
test('DESK-OPS-05: the next episode from the preview: the text box not shown while its preview is drawn', async ({ page, gh, work }) => {
  void gh;
  work.push({ 'chapters/02_second.md': '# 第2話 駅で\n\n![空](../notes/images/sky.png)\n' });
  await openWork(page);
  await page.locator('#toggle-preview').click();
  await expect(page.locator('#preview h1')).toHaveText('第1話 はじまり');
  const release = await hold(page, blobs);
  await page.locator('#next-episode').click();
  await expect(page.locator('#episode-title')).toHaveValue('駅で');
  await expect(page.locator('#body')).toBeHidden();
  await expect(page.locator('#busy')).toHaveText('読み込んでいます…');
  await expect(page.locator('#busy')).toBeVisible();
  await expect(page.locator('#body')).toBeHidden();
  release();
  await expect(page.locator('#preview h1')).toHaveText('第2話 駅で');
  await expect(page.locator('#preview img')).toHaveCount(1);
  await expect(page.locator('#body')).toBeHidden();
  await expect(page.locator('#busy')).toBeHidden();
});

// DESK-OPS-05: ↻ over the text (the state under the table of contents is not seen on a phone): the band
test('DESK-OPS-05: ↻ over the text: 読み込んでいます… in the band until the work is read', async ({ page, gh }) => {
  void gh;
  await openWork(page);
  const release = await hold(page, (m, p) => m === 'GET' && p.endsWith('/git/ref/heads/main'));
  await page.locator('#reload-desk').click();
  await expect(page.locator('#busy')).toHaveText('読み込んでいます…');
  await expect(page.locator('#busy')).toBeVisible();
  // another operation meanwhile: the band says the latest, and stays until the last one ends
  const listed = await hold(page, (m, p) => m === 'GET' && p.endsWith('/branches'));
  await page.getByRole('button', { name: /⎇ main/ }).click();
  await expect(page.locator('#busy')).toHaveText('ブランチを読み込んでいます…');
  listed();
  await expect(page.locator('#picker')).toBeVisible();
  await expect(page.locator('#busy')).toHaveText('読み込んでいます…');
  await expect(page.locator('#busy')).toBeVisible();
  await page.locator('#picker-close').click();
  release();
  await expect(page.locator('#busy')).toBeHidden();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
});

// DESK-OPS-05: a key kept without a passkey, opened at once: what is read said until the next screen (the repositories
// the App is on, held here)
test('DESK-OPS-05: started with a key kept without a passkey: 作品を読み込んでいます… until the next screen', async ({ page, gh }) => {
  void gh;
  await noPasskey(page);
  await keepMoreOpen(page);
  await startApp(page);
  await expect(page.locator('#shelf')).toBeVisible();
  const release = await hold(page, (m, p) => m === 'GET' && p === '/installation/repositories');
  await page.reload();
  await expect(page.locator('#loading')).toBeVisible();
  await expect(page.locator('#loading-text')).toHaveText('作品を読み込んでいます…');
  release();
  await expect(page.locator('#shelf')).toBeVisible();
});
