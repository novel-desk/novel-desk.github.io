// 作品の一覧 (FR-WORK-01): the repositories opened on this device, each with its work summed up, the summaries kept by
// the refs they were read at; another one opened from 「リポジトリを開く」 (FR-WORK-03: only the ones the token can write
// to, by name, nothing read of them); the repository's visibility, 公開 standing out (FR-GH-11)
import { test, expect, openRepo, openWork, stored, FakeRepo } from './lib/test.mjs';

/** @param {import('@playwright/test').Page} page */
const rows = page => page.locator('#repo-list .work small');

// FR-WORK-01
test('the list: the works opened on this device, with title, length, episodes, last change, repository and branch; kept by their refs', async ({
  page,
  gh,
  work,
}) => {
  const other = gh.repos.get('author/other');
  other?.push({ 'novel.toml': 'title = "ほかの試験"\n\n[git]\nbranch = "draft"\n' });
  if (other) other.refs.draft = other.refs.main;
  other?.push({ '01.md': '# 一\n\nあいうえお\n' }, 'draft');
  await openWork(page);
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  await expect(page.locator('#repo-list .work b')).toHaveText(['試験の作品']);
  await openRepo(page, 'author/other');
  await expect(page.locator('#work-title')).toHaveValue('ほかの試験');
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  await expect(page.locator('#repo-list .work b')).toHaveText(['試験の作品', 'ほかの試験']);
  await expect(rows(page)).toHaveText([
    /^37 字 ・ 3 話 ・ 最終更新 10\/1 \d+:01 ・ author\/novel（main）非公開$/,
    /^7 字 ・ 1 話 ・ 最終更新 10\/1 \d+:03 ・ author\/other（draft）公開$/,
  ]);
  // a later visit: one ref request for each ref, no more
  gh.calls.length = 0;
  await page.getByRole('button', { name: '戻る' }).click();
  // (the desk reads the work open)
  await expect.poll(() => gh.calls.some(c => c.includes('/git/trees/'))).toBe(true);
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  gh.calls.length = 0;
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  await expect(page.locator('#repo-list .work b')).toHaveText(['試験の作品', 'ほかの試験']);
  // (and GitHub's listing of repositories not read)
  await expect
    .poll(() => [...gh.calls].sort())
    .toEqual(['GET /repos/author/novel/git/ref/heads/main', 'GET /repos/author/other/git/ref/heads/draft', 'GET /repos/author/other/git/ref/heads/main']);
  // written elsewhere: read again; a change not sent on this device counts, as the desk counts it
  work.push({ 'chapters/04_new.md': '# 第4話 新\n\n一二三\n' });
  await page.locator('#repo-list .work', { hasText: 'author/novel' }).click();
  await page.locator('#tree .node', { hasText: 'はじまり' }).click();
  await page.locator('#body').fill('# 第1話 はじまり\n');
  await expect(page.locator('#work-chars')).toHaveText('40');
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  await expect(rows(page).first()).toHaveText(/^40 字 ・ 4 話 ・ 最終更新 .+（たった今） ・ author\/novel（main）非公開$/);
});

// FR-WORK-01, FR-WORK-03
test('shown at once from what was kept; GitHub not reached: what was kept stays, and 「リポジトリを開く」 says the failure', async ({ page, gh }) => {
  await openWork(page);
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  await expect(rows(page).first()).toHaveText(/^37 字/);
  await page.getByRole('button', { name: '戻る' }).click();
  gh.down = true;
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  await expect(rows(page)).toHaveText([/^37 字 ・ 3 話 ・ .* author\/novel（main）非公開$/]);
  await page.getByRole('button', { name: 'リポジトリを開く' }).click();
  await expect(page.locator('#repos-error')).toHaveText('GitHub につながりません（オフラインかもしれません）');
  await expect(page.locator('#picker')).toBeHidden();
});

// FR-WORK-01, FR-WORK-03: a public repository the token can only read (tools, say) is not a work: not offered, nothing
// read of it; the ones on the list not offered again
test('リポジトリを開く: only the repositories the token can write to and the list does not show, by name; nothing read of them', async ({ page, gh }) => {
  const tools = new FakeRepo('someone/tools', { 'README.md': '# 道具\n' }, { private: false, push: false });
  tools.id = ++gh.ids;
  gh.repos.set('someone/tools', tools);
  await openWork(page);
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  await expect(rows(page)).toHaveText([/^37 字/]);
  gh.calls.length = 0;
  await page.getByRole('button', { name: 'リポジトリを開く' }).click();
  await expect(page.locator('#picker-list button')).toHaveText(['author/other']);
  expect(gh.calls).toEqual(['GET /user/repos?per_page=100&sort=updated']);
  await page.locator('#picker-close').click();
  await expect(page.locator('#picker')).toBeHidden();
  await expect(page.locator('#repo-list .work b')).toHaveText(['試験の作品']);
  expect(gh.calls).toEqual(['GET /user/repos?per_page=100&sort=updated']);
  // every one the token can write to on the list: none offered, said
  await openRepo(page, 'author/other');
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  await page.getByRole('button', { name: 'リポジトリを開く' }).click();
  await expect(page.locator('#repos-error')).toHaveText(
    'トークンで書き込めるリポジトリのうち、一覧に無いものはありません。トークンの Repository access を確かめてください。',
  );
  expect(gh.calls.some(c => c.includes('someone/tools'))).toBe(false);
});

// FR-WORK-01: a device that kept the listing of every repository the token reads (before the list was this device's):
// the list is the work it had open, the old listing not shown again
test('a device that kept the old listing of every repository: only the work it had open is listed', async ({ page, gh }) => {
  await openWork(page);
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('novel-writer-js');
        req.onsuccess = () => {
          const tx = req.result.transaction('prefs', 'readwrite');
          const s = tx.objectStore('prefs');
          s.delete('works');
          s.put(
            [
              { full_name: 'author/novel', default_branch: 'main', private: true },
              { full_name: 'author/other', default_branch: 'main', private: false },
            ],
            'repos',
          );
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
  await page.reload();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  await expect(page.locator('#repo-list .work b')).toHaveText(['試験の作品']);
  await expect.poll(async () => (await stored(page, 'prefs')).some(v => Array.isArray(v) && v.some(r => r.full_name === 'author/other'))).toBe(false);
});

// FR-GH-11
test('public or private: on the list and on the desk, 公開 standing out', async ({ page, gh }) => {
  await openWork(page);
  await expect(page.locator('#work-repo')).toContainText('author/novel非公開');
  await expect(page.locator('#work-repo .vis')).toHaveClass('vis private');
  await expect(page.locator('#work-repo a')).toHaveAttribute('href', 'https://github.com/author/novel/tree/main');
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  await openRepo(page, 'author/other');
  await expect(page.locator('#work-repo .vis.public')).toHaveText('公開');
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  await expect(page.locator('#repo-list .vis.public')).toHaveText('公開');
});

// FR-WORK-05: a work taken off the list; the repository on GitHub stays; what was not sent goes first, or is given up
test('taken off the list: sent first or given up as chosen; GitHub keeps the repository; put back on the list', async ({ page, gh, work }) => {
  await openWork(page);
  await page.locator('#body').fill('# 第1話 はじまり\n\n外す前に書いた\n');
  /** @type {string[]} */
  const asked = [];
  page.on('dialog', d => {
    asked.push(d.message());
    void d.accept();
  });
  await page.getByRole('button', { name: '一覧から外す' }).click();
  await expect(page.locator('#repos')).toBeVisible();
  expect(asked).toEqual([
    '「試験の作品」を作品の一覧から外しますか？（GitHub のリポジトリ author/novel は消しません。この端末に残した控え・履歴・設定は消します）',
    'GitHub に送っていない変更が 1 件あります。先に送りますか？（「キャンセル」なら、送らずに捨てるかを聞きます）',
  ]);
  expect(work.text('chapters/01_first.md')).toBe('# 第1話 はじまり\n\n外す前に書いた\n');
  await expect(page.locator('#repo-list .work')).toHaveCount(0);
  await expect(page.locator('#repo-list')).toHaveText('この端末で開いた作品はまだありません。「リポジトリを開く」で作品のリポジトリを選んでください。');
  await expect(page.locator('#off-list summary')).toHaveText('一覧から外した作品（1）');
  expect((await stored(page, 'snapshots')).map(s => s.repo)).not.toContain('author/novel');
  await page.locator('#off-list summary').click();
  await page.getByRole('button', { name: '一覧に戻す' }).click();
  await expect(page.locator('#repo-list .work b')).toHaveText(['試験の作品']);
  await expect(page.locator('#off-list')).toBeEmpty();
});

// FR-WORK-05: not sent, and given up
test('taken off the list, what was not sent given up: nothing sent, the drafts gone', async ({ page, gh, work }) => {
  await openWork(page);
  await page.locator('#body').fill('# 第1話 はじまり\n\n捨てる\n');
  await expect.poll(async () => (await stored(page, 'drafts')).length).toBe(1);
  const answers = [true, false, true];
  page.on('dialog', d => void (answers.shift() ? d.accept() : d.dismiss()));
  await page.getByRole('button', { name: '一覧から外す' }).click();
  await expect(page.locator('#repos')).toBeVisible();
  expect(work.text('chapters/01_first.md')).toBe('# 第1話 はじまり\n\n朝が来た。\n');
  expect(await stored(page, 'drafts')).toEqual([]);
  expect(gh.calls.filter(c => !c.startsWith('GET'))).toEqual([]);
});
