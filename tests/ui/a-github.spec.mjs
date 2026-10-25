// What GitHub answers in ways the fake does not by itself (answered here with page.route): an error that is not JSON, a
// commit without its date, a file with no commit on the branch, a merge with nothing left to bring, an annotated tag
import { test, expect, openWork } from './lib/test.mjs';

const API = 'https://api.github.com';
const HEADERS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
/** @param {import('@playwright/test').Route} route @param {unknown} body */
const json = (route, body) => route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify(body) });

// NFR-USE-01: GitHub failing with a page that is not JSON (a proxy's 502, say): the status said
test('an error that is not JSON: its status said', async ({ page, gh }) => {
  await openWork(page);
  await page.route(`${API}/repos/author/novel/git/ref/heads/main`, route =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 502, headers: { 'Access-Control-Allow-Origin': '*' }, body: '<html>Bad Gateway</html>' })
      : route.fallback(),
  );
  await page.getByRole('button', { name: '再読み込み' }).click();
  await expect(page.locator('#sync-state')).toHaveText('GitHub がエラーを返しました（502）');
});

// FR-WORK-01, FR-EDIT-02: a commit GitHub gives without its date, and an episode with no commit on the branch: no time
// said for them, the rest as usual
test('a commit without its date, an episode without a commit: no time said', async ({ page, gh, work }) => {
  await page.route(`${API}/repos/author/novel/git/commits/*`, route => {
    const sha = /** @type {string} */ (new URL(route.request().url()).pathname.split('/').pop());
    const c = work.commits.get(sha);
    return route.request().method() === 'GET' && c ? json(route, { sha, tree: { sha: c.tree }, parents: c.parents.map(p => ({ sha: p })) }) : route.fallback();
  });
  await page.route(`${API}/repos/author/novel/commits?**`, route => (route.request().method() === 'GET' ? json(route, []) : route.fallback()));
  await openWork(page);
  await expect(page.locator('#work-chars')).toHaveText('37');
  await expect(page.locator('#work-updated')).toHaveText('');
  await page.locator('#tree .node', { hasText: '駅で' }).click();
  await expect(page.locator('#episode-title')).toHaveValue('駅で');
  await expect(page.locator('#episode-updated')).toHaveText('');
});

// FR-GH-09: a merge GitHub answers with nothing to bring (merged elsewhere after the comparison): said so
test('a merge with nothing left to bring: said so', async ({ page, gh, work }) => {
  work.refs.draft = work.refs.main;
  work.push({ 'chapters/02_second.md': '# 第2話 駅で\n\n枝で書いた。\n' }, 'draft');
  await openWork(page);
  await page.getByRole('button', { name: /⎇ main/ }).click();
  await page.locator('#picker').getByRole('button', { name: 'draft' }).click();
  await expect(page.getByRole('button', { name: /⎇ draft/ })).toBeVisible();
  await page.route(`${API}/repos/author/novel/merges`, route =>
    route.request().method() === 'POST' ? route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } }) : route.fallback(),
  );
  page.once('dialog', d => void d.accept());
  await page.getByRole('button', { name: 'マージ' }).click();
  await page.locator('#picker').getByRole('button', { name: 'main' }).click();
  await expect(page.locator('#toast')).toHaveText('main には、もう draft の内容が全部入っています');
});

// FR-REL-02: a release whose tag is an annotated tag (made with git tag -a): followed to its commit, its episodes read
test('a release on an annotated tag: followed to its commit', async ({ page, gh, work }) => {
  work.tags.v1 = work.refs.main;
  work.releases.push({ id: 1, tag_name: 'v1', name: '第一稿', body: '', created_at: '2026-10-02T00:00:00Z' });
  await page.route(`${API}/repos/author/novel/git/ref/tags/v1`, route =>
    route.request().method() === 'GET' ? json(route, { ref: 'refs/tags/v1', object: { type: 'tag', sha: 'a'.repeat(40) } }) : route.fallback(),
  );
  await page.route(`${API}/repos/author/novel/git/tags/${'a'.repeat(40)}`, route =>
    route.request().method() === 'GET' ? json(route, { object: { type: 'commit', sha: work.tags.v1 } }) : route.fallback(),
  );
  await openWork(page);
  await page.locator('.toc-more summary').click();
  await page.getByRole('button', { name: 'リリース一覧' }).click();
  const dlg = page.locator('#releases');
  await dlg.getByRole('button', { name: /第一稿/ }).click();
  await expect(dlg.locator('.version b')).toHaveText(['はじまり', '駅で', 'part / 坂の上']);
});
