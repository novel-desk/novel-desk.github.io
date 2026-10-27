// The work's repository: a new work (FR-WORK-02, FR-GH-02: a private repository made with a separate token that has
// Administration, or an empty one started), its name changed (FR-GH-10, the same separate token), followed when it
// was renamed on GitHub, and stopped when its name is another repository now (FR-GH-12)
import { test, expect, keepMoreOpen, openRepo, openWork, stored, FakeRepo, TOKEN } from './lib/test.mjs';

const ADMIN = 'admin-test-token-not-real';

// a new work: its title typed on the list and 作成 (as the server version's), then the repository in the dialog (left
// open after a failure: filled in again there)
/** @param {import('@playwright/test').Page} page @param {{ title: string, repo: string, token: string, owner?: string }} w */
async function create(page, w) {
  if (!(await page.locator('#new-repo').evaluate(d => /** @type {HTMLDialogElement} */ (d).open))) {
    await page.locator('#new-work-title').fill(w.title);
    await page.locator('#new-work').getByRole('button', { name: '作成' }).click();
  }
  if (w.owner !== undefined) await page.getByLabel(/^持ち主/).fill(w.owner);
  await page.getByLabel('リポジトリ名（英数字と . _ -）').fill(w.repo);
  await page.locator('#admin-token').fill(w.token);
  await page.locator('#create-work').click();
}
/** @param {import('@playwright/test').Page} page what the device keeps, all of it, as text */
const everything = async page => JSON.stringify(await Promise.all(['vault', 'drafts', 'snapshots', 'prefs'].map(s => stored(page, s))));

// FR-WORK-02, FR-GH-02
test('a new work: a private repository made with the separate token, started as a work, opened; that token not kept', async ({ page, gh }) => {
  gh.adminTokens = [ADMIN];
  await openWork(page);
  await page.getByRole('button', { name: '‹ 作品' }).click();
  await create(page, { title: '試験の新作', repo: 'new-work', token: ADMIN });
  await expect(page.locator('#work-title')).toHaveValue('試験の新作');
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await expect(page.locator('#work-repo')).toContainText('author/new-work非公開');
  const made = /** @type {FakeRepo} */ (gh.repos.get('author/new-work'));
  expect(made.private).toBe(true);
  expect(made.text('novel.toml')).toMatch(/^# Novel Writer の作品の設定\n[^]*title = "試験の新作"\n\n\[manuscript\]\ndir = "manuscript"\n/);
  expect(made.text('README.md')).toBe('# 試験の新作\n');
  expect(made.text('manuscript/01_はじまり.md')).toBe('');
  // the token with Administration: for making the repository only, and nowhere on the device
  expect(gh.adminCalls).toEqual(['GET /user', 'POST /user/repos']);
  expect(await everything(page)).not.toContain(ADMIN);
  await page.locator('#body').fill('書き出し\n');
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(made.text('manuscript/01_はじまり.md')).toBe('書き出し\n');
});

// FR-WORK-02, NFR-USE-01: a token without Administration, or one GitHub refuses: which permission is needed
test('a new work refused: the permission needed is said; a name GitHub would not take is said first', async ({ page, gh }) => {
  await openWork(page);
  await page.getByRole('button', { name: '‹ 作品' }).click();
  await create(page, { title: '題', repo: '小説', token: TOKEN });
  await expect(page.locator('#new-work-state')).toHaveText('リポジトリ名は、英数字と . _ - で 100 文字までにしてください');
  await create(page, { title: '題', repo: 'x', token: TOKEN });
  await expect(page.locator('#new-work-state')).toHaveText(
    'リポジトリを作成できませんでした: このトークンには、リポジトリを作成する・名前を変更する権限がありません。Repository permissions の Administration を Read and write にした別のトークン（作成するときは Repository access を All repositories に）を作成して入力してください',
  );
  await create(page, { title: '題', repo: 'x', token: 'wrong' });
  await expect(page.locator('#new-work-state')).toHaveText(/^リポジトリを作成できませんでした: このトークンは使用できません/);
  expect([...gh.repos.keys()]).toEqual(['author/novel', 'author/other']);
});

// FR-WORK-02, FR-GH-02, FR-WORK-01: made, but the GitHub App cannot read it yet (not installed on it): said what to
// do; on this device's list once made, and once the App can read it, opened from the list and started as a work. An empty repository made
// on GitHub is started the same way
test('made but not readable yet: said; then, and an empty repository made elsewhere, started from the list', async ({ page, gh }) => {
  gh.adminTokens = [ADMIN];
  gh.newReadable = false;
  const empty = new FakeRepo('author/empty', null);
  empty.id = ++gh.ids;
  gh.repos.set('author/empty', empty);
  await openWork(page);
  await page.getByRole('button', { name: '‹ 作品' }).click();
  // (opened, but not started yet)
  const asked = [];
  page.once('dialog', d => {
    asked.push(d.message());
    void d.dismiss();
  });
  await openRepo(page, 'author/empty');
  await expect.poll(() => asked.length).toBe(1);
  // (not started: not opened, the list of works again)
  await expect(page.locator('#shelf')).toBeVisible();
  await expect(page.locator('#works .work', { hasText: 'author/empty' })).toContainText('空のリポジトリです（開くと作品として始められます）');
  await create(page, { title: '試験の新作', repo: 'later', token: ADMIN });
  await expect(page.locator('#toast')).toHaveText(
    /^author\/later（非公開）を作りました。GitHub App がこのリポジトリにインストールされていないため、まだ読めません。設定の「App をインストールするリポジトリを選ぶ」で/,
  );
  await expect(page.locator('#new-repo')).toBeHidden();
  expect(gh.repos.get('author/later')?.empty).toBe(true);
  gh.unreadable.clear();
  // (from the list as it is: going back to the desk would open the empty repository, which asks again)
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: /author\/later/ }).click();
  await expect(page.locator('#work-title')).toHaveValue('試験の新作');
  await page.getByRole('button', { name: '‹ 作品' }).click();
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: /author\/empty/ }).click();
  await expect(page.locator('#work-title')).toHaveValue('empty');
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  expect(empty.text('novel.toml')).toContain('title = "empty"');
});

// FR-GH-10
test('the repository renamed from the app: with the separate token; the work and its changes not sent follow it', async ({ page, gh, work }) => {
  gh.adminTokens = [ADMIN];
  await openWork(page);
  await page.locator('#body').fill('# 第1話 はじまり\n\n名前を変える前に書いた\n');
  await page.getByRole('button', { name: '名前を変更' }).click();
  await expect(page.getByLabel('新しい名前（英数字と . _ -）')).toHaveValue('novel');
  await page.getByLabel('新しい名前（英数字と . _ -）').fill('novel-renamed');
  await page.locator('#rename-admin-token').fill(TOKEN);
  await page.getByRole('button', { name: '名前を変更' }).last().click();
  await expect(page.locator('#rename-repo-error')).toHaveText(
    /^リポジトリ名を author\/novel-renamed に変更できませんでした: このトークンには.*Administration を Read and write/,
  );
  await page.locator('#rename-admin-token').fill(ADMIN);
  await page.getByRole('button', { name: '名前を変更' }).last().click();
  await expect(page.locator('#toast')).toHaveText('author/novel-renamed に変更しました');
  await expect(page.locator('#work-repo a')).toHaveText('author/novel-renamed');
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\n名前を変える前に書いた\n');
  expect(work.fullName).toBe('author/novel-renamed');
  expect(await everything(page)).not.toContain(ADMIN);
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/01_first.md')).toBe('# 第1話 はじまり\n\n名前を変える前に書いた\n');
  // opened again: by its new name
  await page.reload();
  await expect(page.locator('#work-repo a')).toHaveText('author/novel-renamed');
});

// FR-GH-10: renamed on GitHub (on the account the GitHub App is installed on): followed when the work is read, its
// changes not sent with it
test('renamed on GitHub: followed when read, the changes not sent with it', async ({ page, gh, work }) => {
  await openWork(page);
  await page.locator('#body').fill('# 第1話 はじまり\n\nここで\n');
  gh.rename('author/novel', 'author/novel-moved');
  await page.locator('#reload-work').click();
  await expect(page.locator('#toast')).toHaveText('GitHub でリポジトリが author/novel-moved に変わっていたので、合わせました');
  await expect(page.locator('#work-repo a')).toHaveText('author/novel-moved');
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\nここで\n');
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/01_first.md')).toBe('# 第1話 はじまり\n\nここで\n');
});

// FR-GH-12: the work's name is another repository now (the one opened gone from reach): not sent to; the author makes
// sure, and connects it again
test('another repository under the name: stopped, nothing sent; connected again when the author says so', async ({ page, gh, work }) => {
  await openWork(page);
  await page.locator('#body').fill('# 第1話 はじまり\n\n止まる\n');
  gh.rename('author/novel', 'author/gone');
  gh.unreadable.add('author/gone');
  const other = new FakeRepo('author/novel', { 'novel.toml': 'title = "別の作品"\n', '01.md': '# 別\n' });
  other.id = ++gh.ids;
  gh.repos.set('author/novel', other);
  await page.locator('#reload-work').click();
  await expect(page.locator('#sync-state')).toHaveText(/^author\/novel は、つないだリポジトリとは別のリポジトリになっています/);
  await expect(page.locator('#send')).toBeDisabled();
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\n止まる\n');
  expect(gh.calls.filter(c => !c.startsWith('GET'))).toEqual([]);
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'このリポジトリに再接続' }).click();
  await expect(page.locator('#work-title')).toHaveValue('別の作品');
  await expect(page.locator('#gh-relink')).toBeHidden();
});

// FR-WORK-02, NFR-USE-01: what is missing said before anything is made; GitHub not reached said
test('a new work: no title or no token said first; GitHub not reached said; the dialog closed; nothing made', async ({ page, gh }) => {
  gh.adminTokens = [ADMIN];
  await openWork(page);
  await page.getByRole('button', { name: '‹ 作品' }).click();
  // (no title: the list's field asks for one, as the server version's; spaces only: said in the dialog)
  await page.locator('#new-work').getByRole('button', { name: '作成' }).click();
  await expect(page.locator('#new-repo')).toBeHidden();
  await create(page, { title: ' ', repo: 'x', token: ADMIN });
  await expect(page.locator('#new-work-state')).toHaveText('題名を入れてください');
  await page.locator('#close-new-repo').click();
  await expect(page.locator('#new-repo')).toBeHidden();
  await create(page, { title: '題', repo: 'x', token: ' ' });
  await expect(page.locator('#new-work-state')).toHaveText(
    'Administration の権限を付けたトークンを入れてください（作成するときだけ使用し、この端末には保存しません）',
  );
  gh.down = true;
  await create(page, { title: '題', repo: 'x', token: ADMIN });
  await expect(page.locator('#new-work-state')).toHaveText('リポジトリを作成できませんでした: GitHub につながりません（オフラインかもしれません）');
  expect([...gh.repos.keys()]).toEqual(['author/novel', 'author/other']);
});

// FR-WORK-02: the owner named: its own user (made as its own; GitHub not saying the new repository's default branch:
// main), or an organisation (made there; the GitHub App, installed on its own account only, cannot read it: said)
test('a new work for the user named, and for an organisation; the default branch not said: main', async ({ page, gh }) => {
  gh.adminTokens = [ADMIN];
  await openWork(page);
  await page.getByRole('button', { name: '‹ 作品' }).click();
  await page.route('https://api.github.com/user/repos', route =>
    route.request().method() !== 'POST'
      ? route.fallback()
      : gh.answer(
          /** @type {any} */ ({
            request: () => route.request(),
            abort: (/** @type {any} */ e) => route.abort(e),
            fulfill: (/** @type {any} */ o) => route.fulfill({ ...o, body: JSON.stringify({ ...JSON.parse(o.body), default_branch: undefined }) }),
          }),
        ),
  );
  await create(page, { title: '自分の作品', repo: 'mine', token: ADMIN, owner: 'author' });
  await expect(page.locator('#work-repo')).toContainText('author/mine');
  await expect(page.locator('#work-branch')).toHaveText('main');
  expect(gh.repos.get('author/mine')?.text('novel.toml')).toContain('title = "自分の作品"');
  await page.getByRole('button', { name: '‹ 作品' }).click();
  await create(page, { title: '組織の作品', repo: 'shared', token: ADMIN, owner: 'novel-org' });
  // (an organisation's: the App cannot be installed there, said so; nothing to choose in the settings)
  await expect(page.locator('#toast')).toHaveText(
    'novel-org/shared（非公開）を作りました。GitHub App は作成したアカウントのリポジトリにしかインストールできないため、組織のこのリポジトリは Novel Desk では開けません',
  );
  expect(gh.adminCalls).toEqual(['GET /user', 'POST /user/repos', 'GET /user', 'POST /orgs/novel-org/repos']);
  expect(gh.repos.get('novel-org/shared')?.empty).toBe(true);
});

// FR-GH-10, NFR-USE-01: the rename dialog: a name GitHub would not take and no token said; the same name, or closing
// it, changes nothing
test('the rename dialog: a name not allowed and no token said; the same name or closing it changes nothing', async ({ page, gh, work }) => {
  gh.adminTokens = [ADMIN];
  await openWork(page);
  const dialog = page.locator('#rename-repo');
  await page.getByRole('button', { name: '名前を変更' }).click();
  await page.getByLabel('新しい名前（英数字と . _ -）').fill('小説');
  await dialog.getByRole('button', { name: '名前を変更' }).click();
  await expect(page.locator('#rename-repo-error')).toHaveText('リポジトリ名は、英数字と . _ - で 100 文字までにしてください');
  await page.getByLabel('新しい名前（英数字と . _ -）').fill('novel-two');
  await dialog.getByRole('button', { name: '名前を変更' }).click();
  await expect(page.locator('#rename-repo-error')).toHaveText(
    'Administration の権限を付けたトークンを入れてください（名前を変えるときだけ使い、この端末には残しません）',
  );
  await page.getByLabel('新しい名前（英数字と . _ -）').fill('novel');
  await dialog.getByRole('button', { name: '名前を変更' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: '名前を変更' }).click();
  await page.locator('#close-rename-repo').click();
  await expect(dialog).toBeHidden();
  expect(work.fullName).toBe('author/novel');
  expect(gh.adminCalls).toEqual([]);
});

// FR-GH-10, FR-WORK-05: other tabs of the same device: a work renamed in one while another work is the one chosen (that
// choice stays, the other work on the list as it was); taken off the list in tabs still showing it by its old name
test('other tabs: renamed while another work is chosen; taken off in tabs that still show it', async ({ page, context, gh }) => {
  gh.adminTokens = [ADMIN];
  await openWork(page);
  const tabs = [];
  for (let i = 0; i < 3; i++) {
    const tab = await context.newPage();
    await keepMoreOpen(tab);
    tab.on('dialog', d => void d.accept());
    await tab.goto(page.url());
    await expect(tab.locator('#episode-title')).toHaveValue('はじまり');
    tabs.push(tab);
  }
  const [renaming, stale, staler] = tabs;
  await page.getByRole('button', { name: '‹ 作品' }).click();
  await openRepo(page, 'author/other');
  await expect(page.locator('#work-repo a')).toHaveText('author/other');
  await renaming.getByRole('button', { name: '名前を変更' }).click();
  await renaming.getByLabel('新しい名前（英数字と . _ -）').fill('novel-two');
  await renaming.locator('#rename-admin-token').fill(ADMIN);
  await renaming.locator('#rename-repo').getByRole('button', { name: '名前を変更' }).click();
  await expect(renaming.locator('#work-repo a')).toHaveText('author/novel-two');
  for (const tab of [stale, staler]) {
    await tab.getByRole('button', { name: 'この作品を削除' }).click();
    await tab.getByRole('button', { name: '送ってから削除' }).click();
    await expect(tab.locator('#shelf')).toBeVisible();
  }
  // (the list: the renamed work and the other one, the old name taken off counting for neither)
  await page.getByRole('button', { name: '‹ 作品' }).click();
  await expect(page.locator('#works .work small')).toHaveText([/author\/novel-two（main）/, /author\/other（main）/]);
  await page.locator('#works .work', { hasText: 'author/novel-two' }).click();
  await expect(page.locator('#work-repo a')).toHaveText('author/novel-two');
});
