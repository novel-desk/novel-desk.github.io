// Sending: every episode written in one commit (blobs, a tree, a commit, the branch moved forward), and what happens
// when the branch moved on elsewhere
import { test, expect, openWork, stored, WORK_FILES } from './lib/test.mjs';
import { japanDay } from '../../lib/commit.js';
import { OTHER_DEVICE_MARK } from '../../lib/merge.js';

/** @param {import('@playwright/test').Page} page @param {string} title @param {string} text */
async function write(page, title, text) {
  await page.locator('#tree .node', { hasText: title }).click();
  await expect(page.locator('#episode-title')).toHaveValue(title);
  await page.locator('#body').fill(text);
}

test('the episodes written go as one commit, its message as the server version makes it; the drafts are gone', async ({ page, gh, work }) => {
  await openWork(page);
  const before = work.refs.main;
  await write(page, 'はじまり', '# 第1話 はじまり\n\n朝が来た。鳥が鳴いた。\n');
  await write(page, '駅で', '# 第2話 駅で\n');
  await page.getByRole('button', { name: '送る（2）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  const head = work.head();
  expect(head.parents).toEqual([before]);
  expect(head.message).toBe(`${japanDay(Date.now())} はじまり ＋6字、駅で −6字`);
  expect(work.text('chapters/01_first.md')).toBe('# 第1話 はじまり\n\n朝が来た。鳥が鳴いた。\n');
  expect(work.text('chapters/02_second.md')).toBe('# 第2話 駅で\n');
  expect(work.text('chapters/03_part/01_third.md')).toBe(WORK_FILES['chapters/03_part/01_third.md']);
  expect(gh.calls.filter(c => c.startsWith('PATCH'))).toEqual(['PATCH /repos/author/novel/git/refs/heads/main']);
  await expect(page.locator('.unsent-tag')).toHaveCount(0);
  await expect(page.locator('#send')).toBeDisabled();
  await expect.poll(() => stored(page, 'drafts')).toEqual([]);
  // a heading changed: the title follows it
  await write(page, '駅で', '# 第2話 改札で\n');
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.head().message).toBe(`${japanDay(Date.now())} 改札で ＋1字`);
  await expect(page.locator('#tree .node.active .t')).toHaveText('改札で');
});

test('the branch moved on: what changed only here goes on top; what changed there too keeps both versions side by side', async ({ page, gh, work }) => {
  await openWork(page);
  await write(page, 'はじまり', '# 第1話 はじまり\n\nここで書いた。\n');
  await write(page, '駅で', '# 第2話 駅で\n\nここで書いた二。\n');
  const other = work.push({ 'chapters/02_second.md': '# 第2話 駅で\n\nほかで書いた。\n', 'chapters/04_new.md': '# 第4話 新しい\n' });
  await page.getByRole('button', { name: '送る（2）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/駅ではほかでも書き換えられていたので、両方の版を並べました/);
  expect(work.head().parents).toEqual([other]);
  expect(work.text('chapters/01_first.md')).toBe('# 第1話 はじまり\n\nここで書いた。\n');
  expect(work.text('chapters/02_second.md')).toBe(`# 第2話 駅で\n\nここで書いた二。\n\n${OTHER_DEVICE_MARK}\n\n# 第2話 駅で\n\nほかで書いた。\n`);
  expect(work.text('chapters/04_new.md')).toBe('# 第4話 新しい\n');
  // the screen shows what is there now
  await expect(page.locator('#body')).toHaveValue(work.text('chapters/02_second.md') ?? '');
  await expect(page.locator('#episode-note')).toHaveText('両方の版が並んでいます。「――― ここから」の行を探して整理してください');
  await expect(page.locator('#tree .node.active .conflict')).toHaveText('両方の版');
  await expect(page.locator('#tree .node .t')).toContainText(['新しい']);
});

test('the branch moved between reading it and moving it: read again and sent', async ({ page, gh, work }) => {
  await openWork(page);
  await write(page, 'はじまり', '短く\n');
  let moved = false;
  gh.before = (method, path) => {
    if (method === 'PATCH' && !moved) {
      moved = true;
      work.push({ 'README.md': '# 書き換えた\n' });
    }
  };
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(gh.calls.filter(c => c.startsWith('PATCH')).length).toBe(2);
  expect(work.text('chapters/01_first.md')).toBe('短く\n');
  expect(work.text('README.md')).toBe('# 書き換えた\n');
});

test('GitHub not reached, or refusing: nothing is lost, the drafts stay to be sent later', async ({ page, gh, work }) => {
  await openWork(page);
  await write(page, 'はじまり', '残る\n');
  gh.down = true;
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText('GitHub につながりません（オフラインかもしれません）。書いたものはこの端末に残っています');
  gh.down = false;
  gh.fail = method => (method === 'POST' ? 403 : undefined);
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(
    '送れませんでした: 権限がないか、回数の上限に達しました: test failure。書いたものはこの端末に残っています',
  );
  expect((await stored(page, 'drafts')).map(d => d.text)).toEqual(['残る\n']);
  gh.fail = null;
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/01_first.md')).toBe('残る\n');
});

test('reading again: the episodes come as they are on GitHub, but one with a draft shows the draft', async ({ page, gh, work }) => {
  await openWork(page);
  await write(page, 'はじまり', '# 第1話 はじまり\n\n下書き\n');
  work.push({ 'chapters/01_first.md': '# 第1話 はじまり\n\nほかで\n', 'chapters/02_second.md': '# 第2話 駅で\n\nほかで変えた\n' });
  await page.getByRole('button', { name: '再読み込み' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\n下書き\n');
  await expect(page.locator('#save-state')).toHaveText('未送信（この端末に保存しました）');
  await page.locator('#tree .node', { hasText: '駅で' }).click();
  await expect(page.locator('#body')).toHaveValue('# 第2話 駅で\n\nほかで変えた\n');
  // the draft, sent, keeps the other version too: it was written from the text before
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/はじまりはほかでも書き換えられていた/);
  expect(work.text('chapters/01_first.md')).toBe(`# 第1話 はじまり\n\n下書き\n\n${OTHER_DEVICE_MARK}\n\n# 第1話 はじまり\n\nほかで\n`);
});
