// リリース: the work as it is on GitHub named (a tag and a GitHub release), the releases listed and their episodes
// read, an episode of one put back into the manuscript as a change not sent (FR-REL-01〜03)
import { test, expect, openWork, WORK_FILES } from './lib/test.mjs';

// FR-REL-01
test('a release made: the next tag at the commit read, its name, and what it holds; refused while changes are not sent', async ({ page, gh, work }) => {
  work.tags.v1 = work.refs.main;
  await openWork(page);
  await page.locator('#body').fill('書きかけ\n');
  await page.locator('.toc-more summary').click();
  await page.getByRole('button', { name: 'リリースを作成' }).click();
  await expect(page.locator('#toast')).toHaveText('未送信の変更があります。「送る」で送ってから、リリースを作成してください');
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  page.once('dialog', d => void d.accept(' 第一稿 '));
  await page.getByRole('button', { name: 'リリースを作成' }).click();
  await expect(page.locator('#toast')).toHaveText('リリース「第一稿」（v2）を作成しました');
  expect(work.releases).toEqual([{ id: 1, tag_name: 'v2', name: '第一稿', body: '第一稿（3 話、28 字）', created_at: expect.any(String) }]);
  expect(work.tags.v2).toBe(work.refs.main);
});

// FR-REL-02, FR-REL-03
test("the releases listed, one's episodes read, one put back as a change not sent (the text before kept)", async ({ page, gh, work }) => {
  work.tags.v1 = work.refs.main;
  work.releases.push({ id: 1, tag_name: 'v1', name: '第一稿', body: '', created_at: '2026-10-02T00:00:00Z' });
  work.push({ 'chapters/02_second.md': '# 第2話 駅で\n\n書き直した。\n' });
  await openWork(page);
  await page.locator('.toc-more summary').click();
  await page.getByRole('button', { name: 'リリース一覧' }).click();
  const dlg = page.locator('#releases');
  await dlg.getByRole('button', { name: /第一稿/ }).click();
  await expect(dlg.locator('.version b')).toHaveText(['はじまり', '駅で', 'part / 坂の上']);
  await expect(dlg.locator('.version small')).toHaveText(['13 字', '12 字', '12 字']);
  await dlg.getByRole('button', { name: /駅で/ }).click();
  await expect(dlg.getByLabel('リリースの本文')).toHaveValue(WORK_FILES['chapters/02_second.md']);
  page.once('dialog', d => void d.accept());
  await dlg.getByRole('button', { name: 'この話を今の原稿に復元' }).click();
  await expect(dlg).toBeHidden();
  await expect(page.locator('#episode-title')).toHaveValue('駅で');
  await expect(page.locator('#body')).toHaveValue(WORK_FILES['chapters/02_second.md']);
  await expect(page.locator('#save-state')).toHaveText('未送信（この端末に保存しました）');
  await page.getByRole('button', { name: 'この話の履歴' }).click();
  await expect(page.locator('#versions .version .tag')).toHaveText(['未送信', '自動']);
  await page.locator('#versions').getByRole('button', { name: 'GitHub 履歴（2）' }).click();
  await expect(page.locator('#versions .version .tag')).toHaveText(['GitHub', 'GitHub']);
});

test('no release yet: said', async ({ page, gh }) => {
  await openWork(page);
  await page.locator('.toc-more summary').click();
  await page.getByRole('button', { name: 'リリース一覧' }).click();
  await expect(page.locator('#releases-body')).toHaveText('まだリリースはありません。「リリースを作成」で、いまの原稿を残せます。');
});
