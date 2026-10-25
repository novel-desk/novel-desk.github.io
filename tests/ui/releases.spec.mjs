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
  await expect(page.locator('#save-state')).toHaveText('端末に保存済み（未送信）');
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

// FR-REL-01, NFR-USE-01: offline, not made, said; the name not given, nothing made; GitHub refusing, said
test('a release not made: offline, said; no name given; GitHub refusing, said', async ({ page, gh, work }) => {
  work.tags.v1 = work.refs.main;
  work.releases.push({ id: 1, tag_name: 'v1', name: '第一稿', body: '', created_at: '2026-10-02T00:00:00Z' });
  await openWork(page);
  await page.locator('.toc-more summary').click();
  page.once('dialog', d => void d.dismiss());
  await page.getByRole('button', { name: 'リリースを作成' }).click();
  page.once('dialog', d => void d.accept('   '));
  await page.getByRole('button', { name: 'リリースを作成' }).click();
  await expect.poll(() => gh.calls.filter(c => c.includes('/releases')).length).toBe(0);
  gh.fail = (method, path) => (method === 'POST' && path.endsWith('/releases') ? 500 : undefined);
  page.once('dialog', d => void d.accept('第二稿'));
  await page.getByRole('button', { name: 'リリースを作成' }).click();
  await expect(page.locator('#toast')).toHaveText(/^リリースを作成できませんでした: .*test failure$/);
  expect(work.releases.length).toBe(1);
  gh.fail = null;
  page.once('dialog', d => void d.accept('第二稿'));
  await page.getByRole('button', { name: 'リリースを作成' }).click();
  await expect(page.locator('#toast')).toHaveText('リリース「第二稿」（v2）を作成しました');
  // read again offline
  gh.down = true;
  await page.getByRole('button', { name: '再読み込み' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/つながりません|オフライン/);
  await page.getByRole('button', { name: 'リリースを作成' }).click();
  await expect(page.locator('#toast')).toHaveText('オフラインです。つながってからリリースを作成してください');
});

// FR-REL-02, FR-REL-03: a release without novel.toml (read as a work without settings), an episode in it no encoding
// reads, one not in the manuscript now; back and forth; put back over an episode the device cannot read now
test('a release from before novel.toml; an episode not here now; put back over one not readable now', async ({ page, gh, work }) => {
  work.tags.v1 = work.refs.main;
  work.releases.push({ id: 1, tag_name: 'v1', name: '第一稿', body: '', created_at: '2026-10-02T00:00:00Z' });
  work.tags.v0 = work.commit({ '01.md': '# 一\n\nいち\n', '02.md': /** @type {any} */ (Buffer.from([0x82, 0xff, 0xff])) }, '前', []);
  work.releases.push({ id: 2, tag_name: 'v0', name: '旧稿', body: '', created_at: '2026-09-02T00:00:00Z' });
  work.push({ 'chapters/01_first.md': /** @type {any} */ (Buffer.from([0x82, 0xff, 0xff])) });
  // (its heading not read: named by its file)
  await openWork(page, 'first');
  await page.locator('.toc-more summary').click();
  await page.getByRole('button', { name: 'リリース一覧' }).click();
  const dlg = page.locator('#releases');
  await dlg.getByRole('button', { name: /旧稿/ }).click();
  await expect(dlg.locator('.version small')).toHaveText(['4 字', '0 字']);
  await dlg.locator('.version').first().click();
  await expect(dlg.getByText('今の原稿には、同じ場所にこの話がありません')).toBeVisible();
  // (a tap on the text: nothing more)
  await dlg.getByLabel('リリースの本文').click();
  await dlg.getByRole('button', { name: '‹ 旧稿' }).click();
  await expect(dlg.locator('.version')).toHaveCount(2);
  await dlg.getByRole('button', { name: '‹ リリース一覧' }).click();
  await dlg.getByRole('button', { name: /第一稿/ }).click();
  await dlg.getByRole('button', { name: /はじまり/ }).click();
  page.once('dialog', d => void d.dismiss());
  await dlg.getByRole('button', { name: 'この話を今の原稿に復元' }).click();
  await expect(dlg.getByLabel('リリースの本文')).toBeVisible();
  page.once('dialog', d => void d.accept());
  await dlg.getByRole('button', { name: 'この話を今の原稿に復元' }).click();
  await expect(dlg).toBeHidden();
  await expect(page.locator('#body')).toHaveValue(WORK_FILES['chapters/01_first.md']);
});

// FR-REL-02, NFR-USE-01: GitHub not answering: the list, or a release, not read, said; closed
test('the releases or a release not read: said; closed', async ({ page, gh, work }) => {
  work.tags.v1 = work.refs.main;
  work.releases.push({ id: 1, tag_name: 'v1', name: '第一稿', body: '', created_at: '2026-10-02T00:00:00Z' });
  await openWork(page);
  await page.locator('.toc-more summary').click();
  gh.fail = (method, path) => (path.endsWith('/releases') ? 500 : undefined);
  await page.getByRole('button', { name: 'リリース一覧' }).click();
  const dlg = page.locator('#releases');
  await expect(dlg.locator('.error')).toHaveText(/test failure$/);
  gh.fail = (method, path) => (path.includes('/git/ref/tags/') ? 500 : undefined);
  await dlg.getByRole('button', { name: '閉じる' }).click();
  await expect(dlg).toBeHidden();
  await page.getByRole('button', { name: 'リリース一覧' }).click();
  await dlg.getByRole('button', { name: /第一稿/ }).click();
  await expect(dlg.locator('.error')).toHaveText(/test failure$/);
  await expect(dlg.getByRole('button', { name: '‹ リリース一覧' })).toBeVisible();
});
