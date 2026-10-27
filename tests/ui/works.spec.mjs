// 作品の一覧 (FR-WORK-01): the repositories opened on this device, each with its work summed up, the latest changed first
// (as the server version's shelf), the summaries kept by the refs they were read at; another one opened from 「GitHub
// リポジトリをインポート」 (FR-WORK-03: only the ones the GitHub App is installed on offered, by name, nothing read of them); the
// repository's visibility, 公開 standing out (FR-GH-11)
import { test, expect, keepMoreOpen, noPasskey, openImport, openRepo, openWork, startApp, stored, FakeRepo } from './lib/test.mjs';

/** @param {import('@playwright/test').Page} page */
const rows = page => page.locator('#works .work small');
/** @param {import('@playwright/test').Page} page */
const toShelf = page => page.getByRole('button', { name: '‹ 作品' }).click();
// the names the import offers (read when it is opened)
/** @param {import('@playwright/test').Page} page */
const offered = page => page.locator('#repo-options option').evaluateAll(o => o.map(x => /** @type {HTMLOptionElement} */ (x).value));

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
  await toShelf(page);
  await expect(page.locator('#works .work b')).toHaveText(['試験の作品']);
  await openRepo(page, 'author/other');
  await expect(page.locator('#work-title')).toHaveValue('ほかの試験');
  await toShelf(page);
  // (the latest changed first)
  await expect(page.locator('#works .work b')).toHaveText(['ほかの試験', '試験の作品']);
  await expect(rows(page)).toHaveText([
    /^7 字 ・ 1 話 ・ 最終更新 10\/1 \d+:03 ・ GitHub author\/other（draft） 公開$/,
    /^37 字 ・ 3 話 ・ 最終更新 10\/1 \d+:01 ・ GitHub author\/novel（main） 非公開$/,
  ]);
  // a later visit: one ref request for each ref, no more
  gh.calls.length = 0;
  await page.locator('#works .work', { hasText: 'author/other' }).click();
  // (the desk reads the work open)
  await expect.poll(() => gh.calls.some(c => c.includes('/git/trees/'))).toBe(true);
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  gh.calls.length = 0;
  await toShelf(page);
  await expect(page.locator('#works .work b')).toHaveText(['ほかの試験', '試験の作品']);
  // (and GitHub's listing of repositories not read)
  await expect
    .poll(() => [...gh.calls].sort())
    .toEqual(['GET /repos/author/novel/git/ref/heads/main', 'GET /repos/author/other/git/ref/heads/draft', 'GET /repos/author/other/git/ref/heads/main']);
  // written elsewhere: read again; a change not sent on this device counts, as the desk counts it
  work.push({ 'chapters/04_new.md': '# 第4話 新\n\n一二三\n' });
  await page.locator('#works .work', { hasText: 'author/novel' }).click();
  await page.locator('#tree .node', { hasText: 'はじまり' }).click();
  await page.locator('#body').fill('# 第1話 はじまり\n');
  await expect(page.locator('#work-chars')).toHaveText('40');
  await toShelf(page);
  await expect(rows(page).first()).toHaveText(/^40 字 ・ 4 話 ・ 最終更新 .+（たった今） ・ GitHub author\/novel（main） 非公開$/);
});

// FR-WORK-01, FR-WORK-03
test('shown at once from what was kept; GitHub not reached: what was kept stays, and the import says the failure', async ({ page, gh }) => {
  await openWork(page);
  await toShelf(page);
  await expect(rows(page).first()).toHaveText(/^37 字/);
  await page.locator('#works .work').click();
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  gh.down = true;
  await toShelf(page);
  await expect(rows(page)).toHaveText([/^37 字 ・ 3 話 ・ .* GitHub author\/novel（main） 非公開$/]);
  // (nothing offered; the name typed not found, said)
  await openRepo(page, 'author/other');
  await expect(page.locator('#toast')).toHaveText('GitHub につながりません（オフラインかもしれません）');
  // (the names offered: none read)
});

// FR-WORK-01, FR-WORK-03: a repository the GitHub App is not installed on (someone's public tools, say) is not a work:
// not offered, nothing read of it; the ones on the list not offered again
test('GitHub リポジトリをインポート: only the repositories the App is installed on and the list does not show, by name; nothing read of them', async ({
  page,
  gh,
}) => {
  const tools = new FakeRepo('someone/tools', { 'README.md': '# 道具\n' }, { private: false, push: false });
  tools.id = ++gh.ids;
  gh.repos.set('someone/tools', tools);
  await openWork(page);
  await toShelf(page);
  await expect(rows(page)).toHaveText([/^37 字/]);
  gh.calls.length = 0;
  await openImport(page);
  await expect.poll(() => offered(page)).toEqual(['author/other']);
  expect(gh.calls).toEqual(['GET /installation/repositories?per_page=100']);
  await expect(page.locator('#works .work b')).toHaveText(['試験の作品']);
  // every one the App is installed on on the list: none offered
  await openRepo(page, 'author/other');
  await toShelf(page);
  await openImport(page);
  // (read again: the list shown again)
  await expect.poll(() => gh.calls.filter(c => c.startsWith('GET /installation/repositories')).length).toBe(2);
  await expect.poll(() => offered(page)).toEqual([]);
  expect(gh.calls.some(c => c.includes('someone/tools'))).toBe(false);
});

// FR-WORK-03
test('GitHub リポジトリをインポート: the names offered emptied as the list is shown, so the field taken up before the list is read reads them again', async ({
  page,
  gh,
}) => {
  void gh;
  await openWork(page);
  await toShelf(page);
  await openImport(page);
  await expect.poll(() => offered(page)).toEqual(['author/other']);
  await page.locator('#works .work').first().click();
  await expect(page.locator('#shelf')).toBeHidden();
  // the names offered counted the moment the list is shown, before anything is read for it
  await page.evaluate(() => {
    const shelf = /** @type {HTMLElement} */ (document.getElementById('shelf'));
    new MutationObserver((_, o) => {
      if (shelf.hidden) return;
      /** @type {any} */ (window).offeredOnShow = document.querySelectorAll('#repo-options option').length;
      o.disconnect();
    }).observe(shelf, { attributes: true, attributeFilter: ['hidden'] });
  });
  await toShelf(page);
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).offeredOnShow)).toBe(0);
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
  await toShelf(page);
  await expect(page.locator('#works .work b')).toHaveText(['試験の作品']);
  await expect.poll(async () => (await stored(page, 'prefs')).some(v => Array.isArray(v) && v.some(r => r.full_name === 'author/other'))).toBe(false);
});

// FR-GH-11
test('public or private: on the list and on the desk, 公開 standing out', async ({ page, gh }) => {
  await openWork(page);
  await expect(page.locator('#work-repo')).toContainText('author/novel非公開');
  await expect(page.locator('#work-repo .vis')).toHaveClass('vis private');
  await expect(page.locator('#work-repo a')).toHaveAttribute('href', 'https://github.com/author/novel/tree/main');
  await toShelf(page);
  await openRepo(page, 'author/other');
  await expect(page.locator('#work-repo .vis.public')).toHaveText('公開');
  await toShelf(page);
  await expect(page.locator('#works .vis.public')).toHaveText('公開');
});

// FR-WORK-05: a work deleted (taken off the list; the repository on GitHub stays): what was not sent goes first, or is
// given up, or nothing is done, chosen in one dialog (as the server version's)
test('deleted: 送ってから削除 sends first; GitHub keeps the repository; やめる does nothing; opened again from the import', async ({ page, gh, work }) => {
  await openWork(page);
  await page.locator('#body').fill('# 第1話 はじまり\n\n外す前に書いた\n');
  await page.getByRole('button', { name: 'この作品を削除' }).click();
  await expect(page.locator('#delete-ask-title')).toHaveText('作品「試験の作品」を削除します');
  await expect(page.locator('#delete-ask-help')).toHaveText(
    'GitHub のリポジトリ（author/novel）はそのままです。まだ送っていない変更をどうしますか？送らずに削除すると、その変更は GitHub に送られず、この端末からも消えます。',
  );
  await expect(page.getByRole('button', { name: 'やめる' })).toBeFocused();
  await page.getByRole('button', { name: 'やめる' }).click();
  await expect(page.locator('#desk')).toBeVisible();
  await page.getByRole('button', { name: 'この作品を削除' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#delete-ask')).toBeHidden();
  await expect(page.locator('#desk')).toBeVisible();
  await page.getByRole('button', { name: 'この作品を削除' }).click();
  await page.getByRole('button', { name: '送ってから削除' }).click();
  await expect(page.locator('#shelf')).toBeVisible();
  await expect(page.locator('#toast')).toHaveText('作品を削除しました');
  expect(work.text('chapters/01_first.md')).toBe('# 第1話 はじまり\n\n外す前に書いた\n');
  await expect(page.locator('#works .work')).toHaveCount(0);
  await expect(page.locator('#works')).toHaveText(
    'まだ作品がありません。上にタイトルを入力して「作成」を押すか、「GitHub リポジトリをインポート」から作品のリポジトリを開いてください。',
  );
  expect((await stored(page, 'snapshots')).map(s => s.repo)).not.toContain('author/novel');
  // offered again by the import; opened, on the list again
  await openImport(page);
  await expect.poll(() => offered(page)).toEqual(['author/novel', 'author/other']);
  await openRepo(page, 'author/novel');
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await toShelf(page);
  await expect(page.locator('#works .work b')).toHaveText(['試験の作品']);
});

// FR-WORK-05, FR-WORK-08: a work deleted right after typing: the record of the day not written for it once it is gone
test('deleted right after typing: the record of the day not written for it once it is gone', async ({ page, gh }) => {
  void gh;
  await page.clock.install();
  await openWork(page);
  // (the clock held: the record noted 2 seconds after typing, only when the clock is moved on)
  await page.clock.pauseAt(Date.now() + 60000);
  await page.locator('#body').fill('# 第1話 はじまり\n\n消す前に\n');
  await expect.poll(async () => (await stored(page, 'drafts')).length).toBe(1);
  await page.getByRole('button', { name: 'この作品を削除' }).click();
  await page.getByRole('button', { name: '送らずに削除' }).click();
  await expect(page.locator('#shelf')).toBeVisible();
  await page.clock.runFor(3000);
  expect(JSON.stringify(await stored(page, 'prefs'))).not.toContain('"days"');
});

// FR-WORK-05: not sent, and given up (送らずに削除); a work not synced asked once
test('deleted, what was not sent given up: nothing sent, the drafts gone; not synced: asked once', async ({ page, gh, work }) => {
  await openWork(page);
  await page.locator('#body').fill('# 第1話 はじまり\n\n捨てる\n');
  await expect.poll(async () => (await stored(page, 'drafts')).length).toBe(1);
  await page.getByRole('button', { name: 'この作品を削除' }).click();
  await page.getByRole('button', { name: '送らずに削除' }).click();
  await expect(page.locator('#shelf')).toBeVisible();
  expect(work.text('chapters/01_first.md')).toBe('# 第1話 はじまり\n\n朝が来た。\n');
  expect(await stored(page, 'drafts')).toEqual([]);
  expect(gh.calls.filter(c => !c.startsWith('GET'))).toEqual([]);
  await openRepo(page, 'author/other');
  await expect(page.locator('#work-repo a')).toHaveText('author/other');
  await page.locator('#sync-mode').selectOption('off');
  /** @type {string[]} */
  const asked = [];
  const answers = [false, true];
  page.on('dialog', d => {
    asked.push(d.message());
    void (answers.shift() ? d.accept() : d.dismiss());
  });
  await page.getByRole('button', { name: 'この作品を削除' }).click();
  await expect.poll(() => asked.length).toBe(1);
  await expect(page.locator('#desk')).toBeVisible();
  await page.getByRole('button', { name: 'この作品を削除' }).click();
  await expect(page.locator('#shelf')).toBeVisible();
  expect(asked).toEqual([
    '作品「other」を削除しますか？\n同期をオフにしているため、送らずに削除します。GitHub のリポジトリ（author/other）はそのままで、この端末に残した控えと書きかけは消えます',
    '作品「other」を削除しますか？\n同期をオフにしているため、送らずに削除します。GitHub のリポジトリ（author/other）はそのままで、この端末に残した控えと書きかけは消えます',
  ]);
});

// FR-WORK-01, FR-GH-11: the work a device had open kept from before its visibility was (only `private`): its row says
// it all the same, and opens it
test('the work kept from before its visibility was: 非公開 or 公開 from `private`', async ({ page, gh }) => {
  await openWork(page);
  for (const [priv, tag] of /** @type {const} */ ([
    [true, '非公開'],
    [false, '公開'],
  ])) {
    await page.evaluate(
      p =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open('novel-writer-js');
          req.onsuccess = () => {
            const tx = req.result.transaction('prefs', 'readwrite');
            tx.objectStore('prefs').delete('works');
            tx.objectStore('prefs').put({ full_name: 'author/novel', default_branch: 'main', private: p }, 'repo');
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
          };
          req.onerror = () => reject(req.error);
        }),
      priv,
    );
    // (opened again by the work in the address, as when the page is loaded again on it)
    await page.evaluate(() => history.replaceState(null, '', `#${encodeURIComponent('author/novel')}`));
    await page.reload();
    await expect(page.locator('#episode-title')).toHaveValue('はじまり');
    await toShelf(page);
    await expect(page.locator('#works .vis')).toHaveText(tag);
    await expect(page.locator('#works .work')).toHaveAttribute('data-visibility', priv ? 'private' : 'public');
  }
  await page.locator('#works .work').click();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
});

// FR-WORK-01: a summary kept that no longer holds (a commit made elsewhere; a branch it read deleted): read again
test('a summary kept no longer holding (a commit elsewhere, a branch deleted): read again', async ({ page, gh, work }) => {
  const other = /** @type {import('./lib/test.mjs').FakeRepo} */ (gh.repos.get('author/other'));
  other.push({ 'novel.toml': 'title = "ほかの試験"\n\n[git]\nbranch = "draft"\n' });
  other.refs.draft = other.refs.main;
  other.push({ '01.md': '# 一\n\nあいうえお\n' }, 'draft');
  await openWork(page);
  await toShelf(page);
  await openRepo(page, 'author/other');
  await toShelf(page);
  await expect(rows(page)).toHaveText([/^7 字 ・ 1 話 .* GitHub author\/other（draft） 公開$/, /^37 字 ・ 3 話 /]);
  work.push({ 'chapters/04_new.md': '# 第4話 新\n\n一二三\n' });
  delete other.refs.draft;
  await page.locator('#works .work', { hasText: 'author/novel' }).click();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await toShelf(page);
  await expect(page.locator('#works .work', { hasText: 'author/novel' }).locator('small')).toHaveText(/^45 字 ・ 4 話 /);
  await expect(page.locator('#works .work', { hasText: 'author/other' }).locator('small')).toHaveText(/^0 字 ・ 0 話 .* GitHub author\/other（main） 公開$/);
});

// FR-WORK-01: the list asked for twice at once (two taps): shown once, its rows filled
test('the list asked for twice at once: shown and filled once', async ({ page, gh }) => {
  await openWork(page);
  await page.evaluate(() => {
    const b = /** @type {HTMLElement} */ (document.getElementById('to-shelf'));
    b.click();
    b.click();
  });
  await expect(rows(page)).toHaveText([/^37 字 ・ 3 話 /]);
});

// FR-WORK-01: the list left and shown again while its works were still being read (a slow GitHub): the rows of the
// list shown now only, the reading for the one before stopped
test('the list shown again while the one before was still reading: only the new one fills in', async ({ page, gh }) => {
  for (const name of ['author/third', 'author/fourth']) {
    const repo = new FakeRepo(name, { 'novel.toml': `title = "${name.split('/')[1]}"\n`, '01.md': '# 一\n\nあ\n' });
    repo.id = ++gh.ids;
    gh.repos.set(name, repo);
  }
  await openWork(page);
  for (const name of ['author/other', 'author/third', 'author/fourth']) {
    await toShelf(page);
    await openRepo(page, name);
    await expect(page.locator('#work-repo a')).toHaveText(name);
  }
  await toShelf(page);
  await expect(rows(page)).toHaveCount(4);
  await expect(page.locator('#works .work small', { hasText: '読み込み中' })).toHaveCount(0);
  await page.locator('#works .work', { hasText: 'author/fourth' }).click();
  await expect(page.locator('#work-repo a')).toHaveText('author/fourth');
  // the summaries asked again: the refs of the first three works held (three are read at once; the fourth is the work
  // open, which the desk reads too)
  /** @type {((how: 'go' | 'fail') => void)[]} */
  const held = [];
  let holding = true;
  await page.route('https://api.github.com/repos/*/*/git/ref/heads/**', async route => {
    if (!holding || route.request().method() !== 'GET' || route.request().url().includes('/author/fourth/')) return route.fallback();
    const how = await new Promise(r => held.push(r));
    return how === 'go' ? route.fallback() : route.abort('failed');
  });
  await toShelf(page);
  await expect.poll(() => held.length).toBe(3);
  holding = false;
  await page.locator('#works .work', { hasText: 'author/fourth' }).click();
  await expect(page.locator('#work-repo a')).toHaveText('author/fourth');
  await toShelf(page);
  await expect(page.locator('#works .work b')).toHaveText(['試験の作品', 'other', 'third', 'fourth']);
  await expect(page.locator('#works .work small', { hasText: '読み込み中' })).toHaveCount(0);
  const [fail, ...go] = held.splice(0);
  let answered = 0;
  page.on('requestfinished', r => void (/\/git\/ref\/heads\/main$/.test(r.url()) && answered++));
  fail('fail');
  for (const g of go) g('go');
  // (the reading for the list before stops without anything to see: once its answers are in, and the page has had a
  // turn after them, the rows stay as they are)
  await expect.poll(() => answered).toBeGreaterThanOrEqual(2);
  await page.evaluate(() => new Promise(r => setTimeout(r, 100)));
  await expect(page.locator('#works .work b')).toHaveText(['試験の作品', 'other', 'third', 'fourth']);
  await expect(rows(page).first()).toHaveText(/^37 字 ・ 3 話 /);
});

// FR-WORK-03: GitHub リポジトリをインポート (as the server version's): the names offered are the repositories the GitHub App
// is installed on (every page of GitHub's listing) that the list does not show; the one typed is opened, put on the
// list, and opened again by the address; a name not found, and GitHub refusing, said
test('GitHub リポジトリをインポート: every page offered; the ones on the list not offered; the one typed is remembered; a name not found and a refusal said', async ({
  page,
  gh,
}) => {
  gh.installationPerPage = 1;
  await noPasskey(page);
  await keepMoreOpen(page);
  await startApp(page);
  // (the list of works, with 「GitHub リポジトリをインポート」 opened by the app)
  await expect(page.locator('#shelf details.import')).toHaveAttribute('open', '');
  await openImport(page);
  await expect.poll(() => offered(page)).toEqual(['author/novel', 'author/other']);
  await openRepo(page, 'author/novel');
  await expect(page.locator('#toast')).toHaveText('インポートしました');
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await page.getByRole('button', { name: 'これでよい' }).click();
  await toShelf(page);
  await expect(page.locator('#works .work b')).toHaveText(['試験の作品']);
  // (the names read again when the import is opened again)
  await openImport(page);
  // (read again: the list shown again)
  await expect.poll(() => offered(page)).toEqual(['author/other']);
  await openRepo(page, 'author/other');
  await expect(page.locator('#work-repo a')).toHaveText('author/other');
  await toShelf(page);
  await expect(page.locator('#works .work b')).toHaveText(['試験の作品', 'other']);
  await expect(rows(page)).toHaveText([/GitHub author\/novel（main） 非公開$/, /GitHub author\/other（main） 公開$/]);
  // the list again when the page is loaded again there; a work opened again by the address
  await page.reload();
  await expect(page.locator('#shelf')).toBeVisible();
  await page.locator('#works .work', { hasText: 'other' }).click();
  await expect(page.locator('#work-repo a')).toHaveText('author/other');
  await page.reload();
  await expect(page.locator('#work-repo a')).toHaveText('author/other');
  await toShelf(page);
  await openRepo(page, 'author/none');
  await expect(page.locator('#toast')).toHaveText(
    'author/none が見つかりません（owner/リポジトリ名 で入れてください。GitHub App で読めるリポジトリだけを開けます）',
  );
  gh.fail = () => 401;
  await openRepo(page, 'author/novel');
  await expect(page.locator('#toast')).toHaveText('トークンが使用できません（期限切れか、削除された可能性があります）: test failure');
});
