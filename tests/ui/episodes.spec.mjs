// Episodes and chapters added, renamed, put in the trash and reordered: kept on the device as changes not sent, and
// sent with the texts in one commit (FR-TOC-02〜07). novel.toml keeps every line the app did not change
import { test, expect, openWork, stored, WORK_FILES } from './lib/test.mjs';
import { japanDay } from '../../lib/commit.js';

// the work with its titles in the file names (no title = "heading")
const BY_NAME = WORK_FILES['novel.toml'].replace('title = "heading"\n', '');
/** @param {import('./lib/test.mjs').FakeRepo} work @param {string} [branch] */
const paths = (work, branch) => Object.keys(work.files(work.refs[branch ?? work.defaultBranch])).sort();

test.use({ timezoneId: 'Asia/Tokyo' });

// FR-TOC-02
test('an episode added: numbered on, its heading numbered on, kept on the device until sent; its title typed', async ({ page, gh, work }) => {
  await openWork(page);
  await page.getByRole('button', { name: '＋ 話を追加' }).click();
  await expect(page.locator('#episode-title')).toHaveValue('新しい話');
  await expect(page.locator('#body')).toHaveValue('# 第3話 新しい話\n\n');
  await expect(page.locator('#tree .node.active')).toContainText('未送信');
  await expect(page.locator('#send')).toHaveText('送る（1）');
  // the title selected: typed over, the heading follows (title = "heading")
  await page.keyboard.type('夜');
  await page.keyboard.press('Enter');
  await expect(page.locator('#body')).toHaveValue('# 第3話 夜\n\n');
  await expect(page.locator('#tree .node.active .t')).toHaveText('夜');
  await page.locator('#body').press('End');
  await page.keyboard.type('本文');
  // kept on the device: the change of the operation, with the text typed
  await expect
    .poll(async () => (await stored(page, 'drafts')).map(d => [d.path, d.base, d.text, Boolean(d.op)]))
    .toEqual([['chapters/04.md', '', '# 第3話 夜\n\n本文', true]]);
  await page.reload();
  // (at the end of the top: after the chapter numbered 03)
  await expect(page.locator('#tree .node .t')).toHaveText(['はじまり', '駅で', 'part', '坂の上', '夜']);
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/04.md')).toBe('# 第3話 夜\n\n本文');
  expect(work.head().message).toBe(`${japanDay(Date.now())} 夜（新しい話、7字）`);
  await expect(page.locator('.unsent-tag')).toHaveCount(0);
  await expect.poll(() => stored(page, 'drafts')).toEqual([]);
});

// FR-TOC-03, FR-PLOT-07: a chapter added; novel.toml gets its title, every other line as it was
test('a chapter added with one episode; its title in [titles] of novel.toml, the rest of the file unchanged', async ({ page, gh, work }) => {
  await openWork(page);
  page.once('dialog', d => void d.accept('第二部'));
  await page.getByRole('button', { name: '＋ 章を追加' }).click();
  await expect(page.locator('#tree .node.chapter .t')).toHaveText(['part', '第二部']);
  await expect(page.locator('#episode-title')).toHaveValue('新しい話');
  await page.getByRole('button', { name: '送る（2）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/04/01.md')).toBe('# 新しい話\n\n');
  expect(work.text('novel.toml')).toBe(`${WORK_FILES['novel.toml']}\n\n[titles]\n04 = "第二部"\n`);
  expect(work.head().message).toBe(`${japanDay(Date.now())} 新しい話（新しい話、5字）`);
});

// FR-TOC-05
test('an episode renamed: its file named again (the titles in the names), the commit says it', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': BY_NAME });
  await openWork(page, 'first');
  await page.locator('#episode-title').fill('始まり');
  await page.locator('#episode-title').press('Enter');
  await expect(page.locator('#tree .node .t')).toHaveText(['始まり', 'second', 'part', 'third']);
  await expect(page.locator('#episode-title')).toHaveValue('始まり');
  // typed after the rename: in the file where it went
  await page.locator('#body').press('Control+End');
  await page.keyboard.type('続き');
  await page.getByRole('button', { name: '送る（2）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(paths(work)).toContain('chapters/01_始まり.md');
  expect(paths(work)).not.toContain('chapters/01_first.md');
  expect(work.text('chapters/01_始まり.md')).toBe(`${WORK_FILES['chapters/01_first.md']}続き`);
  expect(work.head().message).toBe(`${japanDay(Date.now())} first→始まり（タイトル） ＋2字`);
});

// FR-TOC-05: a chapter's title (its folder named again, its episodes along)
test('a chapter renamed from the reorder tools', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': BY_NAME });
  await openWork(page, 'first');
  await page.getByRole('button', { name: '並べ替え' }).click();
  page.once('dialog', d => void d.accept('坂道'));
  await page.getByRole('button', { name: '章の題名を変更', exact: true }).click();
  await expect(page.locator('#tree .node.chapter .t')).toHaveText('坂道');
  await page.getByRole('button', { name: '完了' }).click();
  await page.getByRole('button', { name: '送る（2）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/03_坂道/01_third.md')).toBe(WORK_FILES['chapters/03_part/01_third.md']);
  expect(paths(work).some(p => p.startsWith('chapters/03_part/'))).toBe(false);
});

// FR-TOC-06
test('an episode put in the trash: moved to _trash/ with the time and its title, the one before opened', async ({ page, gh, work }) => {
  await openWork(page);
  await page.locator('#tree .node', { hasText: '駅で' }).click();
  page.once('dialog', d => void d.accept());
  await page.getByRole('button', { name: 'この話を削除' }).click();
  await expect(page.locator('#tree .node .t')).toHaveText(['はじまり', 'part', '坂の上']);
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await page.getByRole('button', { name: '送る（2）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  const trashed = paths(work).filter(p => p.startsWith('_trash/'));
  expect(trashed).toEqual([expect.stringMatching(/^_trash\/\d{8}T\d{6}_2_駅で\.md$/)]);
  expect(work.text(trashed[0])).toBe(WORK_FILES['chapters/02_second.md']);
  expect(paths(work)).not.toContain('chapters/02_second.md');
  expect(work.head().message).toBe(`${japanDay(Date.now())} 駅で（削除）`);
});
test('the trash said no to: nothing changes', async ({ page, gh }) => {
  await openWork(page);
  page.once('dialog', d => void d.dismiss());
  await page.getByRole('button', { name: 'この話を削除' }).click();
  await expect(page.locator('#tree .node .t')).toHaveText(['はじまり', '駅で', 'part', '坂の上']);
  await expect(page.locator('#send')).toBeDisabled();
});

// FR-TOC-04
test('reordered with ↑↓ and the chapter to move to: the files numbered again, the open episode followed', async ({ page, gh, work }) => {
  await openWork(page);
  await page.getByRole('button', { name: '並べ替え' }).click();
  await page.locator('#tree .node', { hasText: 'はじまり' }).getByRole('button', { name: '下へ' }).click();
  await expect(page.locator('#tree .node .t')).toHaveText(['駅で', 'はじまり', 'part', '坂の上']);
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await page.locator('#tree .node', { hasText: '駅で' }).getByLabel('移動先の章').selectOption({ label: 'part' });
  await expect(page.locator('#tree .node .t')).toHaveText(['はじまり', 'part', '坂の上', '駅で']);
  await page.getByRole('button', { name: '完了' }).click();
  await page.getByRole('button', { name: /^送る/ }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(paths(work).filter(p => p.startsWith('chapters/'))).toEqual([
    'chapters/01_first.md',
    'chapters/02_part/01_third.md',
    'chapters/02_part/02_second.md',
    'chapters/memo.txt',
  ]);
  expect(work.text('chapters/02_part/02_second.md')).toBe(WORK_FILES['chapters/02_second.md']);
  expect(work.head().message).toMatch(/（並べ替え）/);
});
test('reordered by dragging: an episode dropped on a chapter goes to its end', async ({ page, gh }) => {
  await openWork(page);
  await page.getByRole('button', { name: '並べ替え' }).click();
  await page.locator('#tree .node', { hasText: 'はじまり' }).dragTo(page.locator('#tree .node.chapter'));
  await expect(page.locator('#tree .node .t')).toHaveText(['駅で', 'part', '坂の上', 'はじまり']);
});

// FR-TOC-07
test('a chapter folded stays folded on this device', async ({ page, gh }) => {
  await openWork(page);
  await page.locator('#tree .node.chapter').click();
  await expect(page.locator('#tree .node', { hasText: '坂の上' })).toBeHidden();
  await page.reload();
  await expect(page.locator('#tree .node.chapter .fold')).toHaveText('▸');
  await expect(page.locator('#tree .node', { hasText: '坂の上' })).toBeHidden();
  await page.locator('#tree .node.chapter').click();
  await expect(page.locator('#tree .node', { hasText: '坂の上' })).toBeVisible();
});

// FR-WORK-04
test('the work renamed: title in novel.toml, the other lines unchanged', async ({ page, gh, work }) => {
  await openWork(page);
  await page.locator('#work-title').fill('別の題');
  await page.locator('#work-title').press('Enter');
  await expect(page.locator('#send')).toHaveText('送る（1）');
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('novel.toml')).toBe(WORK_FILES['novel.toml'].replace('"試験の作品"', '"別の題"'));
  expect(work.head().message).toBe(`${japanDay(Date.now())} 整理`);
});

// FR-SAVE-04: a rename here and a change of the same file elsewhere: not sent; read again, the rename is undone and
// the text written stays
test('renamed here and changed elsewhere: not sent, said; read again, the rename undone, the text typed kept', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': BY_NAME });
  await openWork(page, 'first');
  await page.locator('#episode-title').fill('始まり');
  await page.locator('#episode-title').press('Enter');
  await page.locator('#body').fill('ここで書いた\n');
  const before = work.refs.main;
  work.push({ 'chapters/01_first.md': 'ほかで書いた\n' });
  await page.getByRole('button', { name: '送る（2）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(
    /^ほかの所で chapters\/01_first\.md が変わっていたので、送りませんでした。「再読み込み」で読み直してください/,
  );
  expect(work.head().parents).toEqual([before]);
  await page.getByRole('button', { name: '再読み込み' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/名前の変更・削除・並べ替えを取り消しました。書いた文章は残っています/);
  await expect(page.locator('#tree .node .t')).toHaveText(['first', 'second', 'part', 'third']);
  await expect(page.locator('#episode-title')).toHaveValue('first');
  await expect(page.locator('#body')).toHaveValue('ここで書いた\n');
  // sent now: both versions side by side, nothing lost
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/両方の版を並べました/);
  expect(work.text('chapters/01_first.md')).toMatch(/^ここで書いた\n\n――― ここから、ほかの端末で書かれた版 ―――\n\nほかで書いた\n$/);
});

// FR-EDIT-02, FR-TOC-01: the counts and the last change
test('the counts and 最終更新: the work, the episode (its last commit; this device once written)', async ({ page, gh, work }) => {
  await openWork(page);
  await expect(page.locator('#work-chars')).toHaveText('37');
  await expect(page.locator('#work-count')).toHaveText('3');
  // (the commits of the fake GitHub: 2026-10-01 00:01 UTC, 9:01 in Japan)
  await expect(page.locator('#work-updated')).toHaveText('10/1 9:01');
  await expect(page.locator('#episode-updated')).toHaveText('最終更新 10/1 9:01');
  await page.locator('#body').press('Control+End');
  await page.keyboard.type('あ');
  await expect(page.locator('#episode-updated')).toHaveText(/^最終更新 \d+\/\d+ \d+:\d\d（たった今）$/);
  await expect(page.locator('#work-updated')).toHaveText(/（たった今）$/);
  await expect(page.locator('#work-chars')).toHaveText('38');
  await expect(page.locator('#episode-chars')).toHaveText('14');
});

// FR-TOC-01: 最終更新 on the rows, as the server version's: asked of GitHub lazily, once for each version of an episode,
// and said only where it tells a row from the others
test('the rows’ 最終更新: the one changed elsewhere says its time; asked once for each blob, kept on the device', async ({ page, gh, work }) => {
  work.push({ 'chapters/02_second.md': '# 第2話 駅で\n\nほかで\n' });
  await openWork(page);
  const times = page.locator('#tree .node.episode .u');
  await expect(times).toHaveText(['', /^10\/1 \d+:02$/, '']);
  await expect.poll(() => gh.calls.filter(c => c.includes('/commits?') && c.includes('path=')).length).toBe(3);
  // written here: now, until sent
  await page.locator('#body').press('Control+End');
  await page.keyboard.type('あ');
  await expect(times.first()).toHaveText(/^\d+\/\d+ \d+:\d\d$/);
  // opened again: from the device, not asked again
  await page.reload();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  gh.calls.length = 0;
  await page.getByRole('button', { name: '再読み込み' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  await expect(times.nth(1)).toHaveText(/^10\/1 \d+:02$/);
  expect(gh.calls.filter(c => c.includes('path='))).toEqual([]);
});
