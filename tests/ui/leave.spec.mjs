// 連携をやめるとき、連携が切れたとき (DESK-OPS-03): the settings ask GitHub whether it still takes the connection; refused
// (the App deleted on GitHub), said so, with the way to start again; the steps to stop (an App made here: the page on
// GitHub to delete it on). Logging out (NFR-SEC-16): what the device keeps of the works deleted, the drafts kept or not
// as asked, and kept ones sent by the App made again
import { test, expect, keepMoreOpen, noPasskey, openRepo, openWork, startApp, stored, toSettings, WORK_FILES } from './lib/test.mjs';

// DESK-OPS-03
test('the App deleted on GitHub: the settings say the connection is gone; logged out, the App made again from the first screen', async ({ page, gh }) => {
  gh.installRepos = ['author/novel'];
  await noPasskey(page);
  await keepMoreOpen(page);
  await page.goto('./');
  await page.getByRole('button', { name: 'GitHub App を作成して始める' }).click();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await page.getByRole('button', { name: 'これでよい' }).click();
  const slug = /** @type {{ slug: string }} */ ([...gh.codes.values()].at(-1)).slug;
  await toSettings(page);
  await expect(page.locator('#gh-state')).toHaveText('GitHub App で連携しています');
  await expect(page.locator('#me')).toHaveText('GitHub の author');
  await expect(page.locator('#relink')).toBeHidden();
  // the steps to stop: the App's own page to delete it on
  await page.getByText('連携をやめるとき').click();
  const link = page.locator('#leave-app-link');
  await expect(link).toHaveAttribute('href', `https://github.com/settings/apps/${slug}/advanced`);
  await expect(link).toHaveText(`「${slug}」の Advanced のページ`);
  await expect(page.locator('#leave-app')).toContainText('インストールも同時に解除されます');
  // the repositories it is installed on chosen on GitHub, from here
  await expect(page.locator('#app-repos-link')).toHaveAttribute('href', `https://github.com/apps/${slug}/installations/new`);
  // uninstalled on GitHub: said when the settings are opened again
  await page.getByRole('button', { name: '‹ 戻る' }).click();
  const app = /** @type {NonNullable<typeof gh.app>} */ (gh.app);
  const installations = app.installations;
  app.installations = [];
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await expect(page.locator('#gh-state')).toHaveText(/^GitHub App が、どのリポジトリにもインストールされていません。/);
  await expect(page.locator('#relink')).toBeHidden();
  // installed again: said as before
  app.installations = installations;
  await page.getByRole('button', { name: '‹ 戻る' }).click();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await expect(page.locator('#gh-state')).toHaveText('GitHub App で連携しています');
  // deleted on GitHub: said when the settings are opened again
  await page.getByRole('button', { name: '‹ 戻る' }).click();
  gh.app = null;
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await expect(page.locator('#gh-state')).toContainText('GitHub App との連携が無効になっています');
  await expect(page.locator('#me')).toHaveText('');
  await page.getByRole('button', { name: 'ログアウトして App を再作成' }).click();
  await expect(page.locator('#setup')).toBeVisible();
  await expect(page.getByRole('button', { name: 'GitHub App を作成して始める' })).toBeVisible();
});

// DESK-OPS-03: GitHub not reached (or failing): not said to be gone
test('GitHub failing: the connection not said to be gone', async ({ page, gh }) => {
  void gh;
  await openWork(page);
  await page.route('https://api.github.com/app', route =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 500, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: '{"message":"test"}' })
      : route.fallback(),
  );
  await toSettings(page);
  await expect(page.locator('#me')).toHaveText('');
  await expect(page.locator('#gh-state')).toHaveText('GitHub App で連携しています');
  await expect(page.locator('#relink')).toBeHidden();
});

// DESK-SEC-03: GitHub refusing the App's tokens (its key deleted, or the App removed): said, with what to do; nothing the
// device keeps of the works deleted until the author logs out (the copies, the blobs read, the drafts, the branch chosen,
// the mode). Taken again by GitHub, the work goes on as it was: the drafts go to their branch by the mode chosen
test('the App’s tokens refused: said; nothing the device keeps deleted; taken again, the branch and the mode as they were', async ({ page, gh, work }) => {
  work.refs.side = work.refs.main;
  await openWork(page);
  await page.getByRole('button', { name: /⎇ main/ }).click();
  await page.locator('#picker').getByRole('button', { name: 'side' }).click();
  await expect(page.getByRole('button', { name: /⎇ side/ })).toBeVisible();
  await page.locator('#sync-mode').selectOption('manual');
  await page.locator('#body').fill('# 第1話 はじまり\n\n断られても残る\n');
  await expect.poll(async () => (await stored(page, 'drafts')).map(d => [d.branch, d.sync])).toEqual([['side', 'manual']]);
  const [snapshots, blobs] = [await stored(page, 'snapshots'), await stored(page, 'blobs')];
  await expect(page.locator('#token-notice')).toBeHidden();
  // (every token GitHub gives ends at once: refused, asked for again, refused again)
  gh.appTokenLife = 0;
  gh.appTokens.clear();
  await page.locator('#reload-work').click();
  await expect(page.locator('#token-notice-text')).toHaveText(
    /^GitHub が GitHub App のトークンを拒否しました.*ログアウトしてから「GitHub App を作成して始める」で App を再作成してください。書いた文章はこの端末に残っています。$/,
  );
  expect(await stored(page, 'snapshots')).toEqual(snapshots);
  expect(await stored(page, 'blobs')).toEqual(blobs);
  expect((await stored(page, 'drafts')).map(d => d.text)).toEqual(['# 第1話 はじまり\n\n断られても残る\n']);
  await page.getByRole('button', { name: 'あとで' }).click();
  await expect(page.locator('#token-notice')).toBeHidden();
  // taken again (opened again): the draft, the branch chosen and the mode kept; sent only when pressed, to that branch
  gh.appTokenLife = 3600000;
  await page.reload();
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\n断られても残る\n');
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  await expect(page.getByRole('button', { name: /⎇ side/ })).toBeVisible();
  await expect(page.locator('#sync-mode')).toHaveValue('manual');
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/01_first.md', 'side')).toBe('# 第1話 はじまり\n\n断られても残る\n');
  expect(work.text('chapters/01_first.md')).toBe(WORK_FILES['chapters/01_first.md']);
});

// NFR-SEC-16: logged out: the App's key, and with it what the device keeps of the works; the drafts too when the author
// says so (here: kept)
test('logged out: the App’s key, the works’ copies and settings deleted; the drafts kept or deleted as asked', async ({ page, gh, work }) => {
  void gh;
  await openWork(page);
  await page.locator('#body').fill('# 第1話 はじまり\n\n残す書きかけ\n');
  await expect.poll(async () => (await stored(page, 'drafts')).length).toBe(1);
  await toSettings(page);
  const answers = [false];
  page.on('dialog', d => void (answers.shift() ? d.accept() : d.dismiss()));
  await page.getByRole('button', { name: 'ログアウト' }).click();
  await expect(page.locator('#setup')).toBeVisible();
  // (DESK-OPS-03: what logging out leaves said, the App on GitHub and the passkey)
  await expect(page.locator('#toast')).toContainText('GitHub の App と、パスワードの管理のパスキーは残っています');
  expect(await stored(page, 'vault')).toEqual([]);
  expect(await stored(page, 'snapshots')).toEqual([]);
  expect(await stored(page, 'blobs')).toEqual([]);
  // (kept with the drafts: their repository's ID, and whose they are, by the GitHub account's number)
  expect(await stored(page, 'prefs')).toEqual([work.id, 1001]);
  expect((await stored(page, 'drafts')).map(d => d.text)).toEqual(['# 第1話 はじまり\n\n残す書きかけ\n']);
});

// NFR-SEC-16, FR-GH-04, FR-GH-09: logged out with the drafts kept (the settings deleted), the App made again by the same
// account: the drafts go where and how they were written (their branch, their mode). Their branch gone on GitHub: not
// sent by itself to the one open; 送る asks first; only their branch can be chosen
test('logged out with the drafts kept, the App made again: their branch and mode; never sent by itself to another branch', async ({ page, gh, work }) => {
  void gh;
  work.refs.side = work.refs.main;
  work.refs.other = work.refs.main;
  await page.clock.install();
  await openWork(page);
  await page.getByRole('button', { name: /⎇ main/ }).click();
  await page.locator('#picker').getByRole('button', { name: 'side' }).click();
  await expect(page.getByRole('button', { name: /⎇ side/ })).toBeVisible();
  await page.locator('#body').fill('# 第1話 はじまり\n\n枝の書きかけ\n');
  await page.locator('#sync-mode').selectOption('manual');
  await expect.poll(async () => (await stored(page, 'drafts')).map(d => [d.branch, d.sync])).toEqual([['side', 'manual']]);
  await toSettings(page);
  const answers = [false];
  page.on('dialog', d => void (answers.shift() ? d.accept() : d.dismiss()));
  await page.getByRole('button', { name: 'ログアウト' }).click();
  await expect(page.locator('#setup')).toBeVisible();
  expect(await stored(page, 'prefs')).toEqual([work.id, 1001]);
  await startApp(page);
  await expect(page.locator('#shelf details.import')).toHaveAttribute('open', '');
  await openRepo(page, 'author/novel');
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\n枝の書きかけ\n');
  await page.getByRole('button', { name: 'これでよい' }).click();
  await expect(page.getByRole('button', { name: /⎇ side/ })).toBeVisible();
  await expect(page.locator('#sync-mode')).toHaveValue('manual');
  await page.clock.fastForward(120000);
  expect([work.text('chapters/01_first.md'), work.text('chapters/01_first.md', 'side')]).toEqual([
    WORK_FILES['chapters/01_first.md'],
    WORK_FILES['chapters/01_first.md'],
  ]);
  // their branch gone on GitHub: the default one opened; nothing sent by itself to it, 自動 too
  delete work.refs.side;
  // (pressed again until taken: a press while the check of every minute, moved on by the clock above, is still reading
  // is not taken, and a busy machine reads slowly)
  await expect(async () => {
    await page.locator('#reload-work').click();
    await expect(page.locator('#toast')).toHaveText('side は GitHub にもう無いので、main を開きました', { timeout: 1000 });
  }).toPass();
  await expect(page.locator('#sync-state')).toHaveText(
    /^この端末の未送信の変更は、ブランチ side で書いたものです。いまは main を開いているので、自動では送りません/,
  );
  await page.locator('#sync-mode').selectOption('auto');
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  await page.clock.fastForward(61000);
  await expect(page.locator('#sync-state')).toHaveText(/^この端末の未送信の変更は、ブランチ side で書いたものです/);
  expect(work.text('chapters/01_first.md')).toBe(WORK_FILES['chapters/01_first.md']);
  // 送る asks; not wanted, nothing sent
  answers.push(false);
  await page.getByRole('button', { name: '送る（1）' }).click();
  expect(work.text('chapters/01_first.md')).toBe(WORK_FILES['chapters/01_first.md']);
  // another branch cannot be chosen; theirs can (made again from the one open), and they go there
  await page.getByRole('button', { name: /⎇ main/ }).click();
  await page.locator('#picker').getByRole('button', { name: 'other' }).click();
  await expect(page.locator('#toast')).toHaveText(/^未送信の変更は side で書いたものです。side に切り替えるか/);
  await page.getByRole('button', { name: /⎇ main/ }).click();
  await page.locator('#picker-input').fill('side');
  await page.locator('#picker').getByRole('button', { name: '決定' }).click();
  await expect(page.getByRole('button', { name: /⎇ side/ })).toBeVisible();
  await expect
    .poll(async () => {
      await page.clock.fastForward(61000);
      return work.text('chapters/01_first.md', 'side');
    })
    .toBe('# 第1話 はじまり\n\n枝の書きかけ\n');
  expect(work.text('chapters/01_first.md')).toBe(WORK_FILES['chapters/01_first.md']);
});

// DESK-OPS-05: GitHub App を作成して始める: the button says what is being done until the page leaves for GitHub; back
// from GitHub, the screen says the App is being taken (both held here until looked at)
test('making the App: what is being done said on the button, and on the screen while the App is taken', async ({ page, gh }) => {
  gh.installRepos = ['author/novel'];
  await noPasskey(page);
  await keepMoreOpen(page);
  let release = () => {};
  const gate = new Promise(r => (release = () => r(undefined)));
  await page.route('https://github.com/settings/apps/new**', async route => {
    await gate;
    await route.fallback();
  });
  let releaseTaken = () => {};
  const taken = new Promise(r => (releaseTaken = () => r(undefined)));
  await page.route('https://api.github.com/app-manifests/**', async route => {
    await taken;
    await route.fallback();
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'GitHub App を作成して始める' }).click();
  // (the page leaves for GitHub once the form is sent: the button no longer to be seen, only the screen after)
  release();
  await expect(page.locator('#loading-text')).toHaveText('GitHub App を受け取っています…');
  releaseTaken();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
});

// DESK-OPS-05: a work opened: said in the field of the text until it is read (the reading held here)
test('a work opened: 作品を読み込んでいます… in the field of the text until it is read', async ({ page, gh }) => {
  void gh;
  await openWork(page);
  await page.locator('#to-shelf').click();
  let release = () => {};
  const gate = new Promise(r => (release = () => r(undefined)));
  await page.route('https://api.github.com/**', async route => {
    await gate;
    await route.fallback();
  });
  await page.locator('#works .work', { hasText: 'author/novel' }).click();
  await expect(page.locator('#body')).toHaveAttribute('placeholder', '作品を読み込んでいます…');
  release();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await expect(page.locator('#body')).toHaveAttribute('placeholder', 'ここに書く');
});

// DESK-OPS-05: the passkey being made (waited for here, never answered): said on the button
test('making the App: パスキーを作成しています… on the button while the passkey is made', async ({ page, gh, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebKit here says it has no PRF: no passkey is made');
  void gh;
  await page.addInitScript(() => {
    navigator.credentials.create = () => new Promise(() => {});
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'GitHub App を作成して始める' }).click();
  await expect(page.locator('#make-app')).toHaveText('パスキーを作成しています…');
  await expect(page.locator('#make-app')).toBeDisabled();
});
