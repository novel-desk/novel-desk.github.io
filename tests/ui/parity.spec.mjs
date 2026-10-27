// What Novel Desk does as the server version does (docs/server-differences.md): 設定, the list of works, the page's start
// (boot.js), the branches, merges and releases that send what is not sent first, and the screens' smaller ways
import { test, expect, FakeRepo, openImport, openRepo, openWork, stored, toSettings, WORK_FILES } from './lib/test.mjs';

const TOML = `${WORK_FILES['novel.toml']}\n\n[notes]\ndir = "notes"\n`;
/** @param {import('@playwright/test').Page} page */
const inFront = page => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
// a request to GitHub held on its way until released
/** @param {import('@playwright/test').Page} page @param {string} method @param {string} part of the path */
async function holdOnce(page, method, part) {
  /** @type {() => void} */
  let release = () => {};
  const gate = new Promise(r => (release = () => r(undefined)));
  let held = false;
  let arrived = () => {};
  const came = new Promise(r => (arrived = () => r(undefined)));
  await page.route('https://api.github.com/**', async route => {
    if (held || route.request().method() !== method || !route.request().url().includes(part)) return route.fallback();
    held = true;
    arrived();
    await gate;
    await route.fallback();
  });
  return { release, came };
}
// a send refused by GitHub (the branch not moved)
const refuseSend = (/** @type {string} */ method, /** @type {string} */ path) => (method === 'PATCH' && path.includes('/git/refs/heads/') ? 500 : undefined);

// FR-APP-01, FR-APP-05, FR-AUTH-07: 設定 as the server version's: the colours (the browser's bar follows them), the account,
// GitHub; its account said only when GitHub says it
test('設定: the colours with the browser’s bar; the account from GitHub, or nothing when GitHub does not say', async ({ page, gh }) => {
  await openWork(page);
  await toSettings(page);
  await expect(page.locator('#settings > header strong')).toHaveText('設定');
  await expect(page.locator('#me')).toHaveText('GitHub の author');
  // the card's lines 10px apart, as the server version's (its gap only: no margin of a paragraph added to it)
  const box = async (/** @type {string} */ id) => /** @type {{ y: number, height: number }} */ (await page.locator(id).boundingBox());
  const me = await box('#me');
  expect(Math.round((await box('#screen-info')).y - (me.y + me.height))).toBe(10);
  await expect(page.locator('#gh-state')).toHaveText('GitHub App で連携しています');
  const colours = () => page.locator('meta[name="theme-color"]').evaluateAll(m => m.map(x => /** @type {HTMLMetaElement} */ (x).content));
  await page.getByRole('button', { name: '黒' }).click();
  expect(await colours()).toEqual(['#16171a', '#16171a']);
  await page.getByRole('button', { name: '白' }).click();
  expect(await colours()).toEqual(['#f2eee6', '#f2eee6']);
  await page.getByRole('button', { name: '自動' }).click();
  expect(await colours()).toEqual(['#f2eee6', '#16171a']);
  await page.getByRole('button', { name: '‹ 戻る' }).click();
  await expect(page.locator('#shelf')).toBeVisible();
  // (GitHub not saying whose the App is)
  await page.route('https://api.github.com/app', route =>
    route.fulfill({ status: 500, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: '{"message":"test"}' }),
  );
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await expect(page.locator('#me')).toHaveText('');
});

// FR-WORK-01, FR-WORK-03: a work whose last send failed said on its row (as the server version's 「push 失敗」); a name
// typed that is not owner/name, not found; the import closed and opened again
test('the list of works: a failed send said on its row; a name not owner/name not found; the import closed', async ({ page, gh }) => {
  await openWork(page);
  await page.locator('#body').fill('# 第1話 はじまり\n\n届かない\n');
  gh.fail = refuseSend;
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送れませんでした: /);
  await expect(page.locator('#sync-brief')).toHaveText('・送信失敗');
  await page.getByRole('button', { name: '‹ 作品' }).click();
  await expect(page.locator('#works .work small')).toHaveText(/ ・ 送信失敗$/);
  await openRepo(page, 'novel');
  await expect(page.locator('#toast')).toHaveText(/^novel が見つかりません/);
  await page.locator('#shelf details.import > summary').click();
  await expect(page.locator('#shelf details.import')).not.toHaveAttribute('open', '');
  await openImport(page);
  gh.fail = null;
  await page.locator('#works .work').click();
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  await expect(page.locator('#sync-brief')).toHaveText('・送信済み');
  await page.getByRole('button', { name: '‹ 作品' }).click();
  await expect(page.locator('#works .work small')).not.toHaveText(/送信失敗/);
});

// FR-APP-02 (the server version's index.html, done by boot.js): an iPad (a Mac with a touch screen) kept from zooming in
test.describe('an iPad', () => {
  test.use({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15' });
  test('the viewport has maximum-scale=1', async ({ page, gh }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
    });
    await openWork(page);
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /,maximum-scale=1$/);
  });
});

// FR-APP-02: the screens' modules not started (a file of another version, one not come): the page loaded again, once;
// nothing done for another file's failure, or once the app has started
test('the modules not started: loaded again once; not for a picture, not once started, not without sessionStorage', async ({ page, gh }) => {
  await openWork(page);
  /** @param {string} target 'script' | 'img' | 'window' @param {{ started?: boolean, reloaded?: boolean }} o */
  const fail = (target, o) =>
    page.evaluate(
      ([t, started, reloaded]) => {
        /** @type {any} */ (window).nwStarted = started;
        /** @type {any} */ (window).__mark = true;
        if (reloaded) sessionStorage.setItem('nw-reloaded', '1');
        else sessionStorage.removeItem('nw-reloaded');
        const el = t === 'window' ? window : document.head.appendChild(document.createElement(String(t)));
        el.dispatchEvent(new Event('error'));
      },
      [target, Boolean(o.started), Boolean(o.reloaded)],
    );
  const kept = async () => {
    await page.waitForTimeout(300);
    return page.evaluate(() => Boolean(/** @type {any} */ (window).__mark));
  };
  await fail('img', {});
  expect(await kept()).toBe(true);
  await fail('script', { started: true });
  expect(await kept()).toBe(true);
  await fail('script', { reloaded: true });
  expect(await kept()).toBe(true);
  const loaded = page.waitForEvent('load');
  await fail('window', {});
  await loaded;
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  // (started again: the next failure may load it again)
  expect(await page.evaluate(() => sessionStorage.getItem('nw-reloaded'))).toBeNull();
  // a browser without sessionStorage: not loaded again (it could go on for ever)
  await page.addInitScript(() =>
    Object.defineProperty(window, 'sessionStorage', {
      get() {
        throw new DOMException('test', 'SecurityError');
      },
    }),
  );
  await page.reload();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await page.evaluate(() => {
    /** @type {any} */ (window).nwStarted = false;
    /** @type {any} */ (window).__mark = true;
    window.dispatchEvent(new Event('error'));
  });
  expect(await kept()).toBe(true);
});

// FR-GH-09: what is not sent goes first, then the branch changes (as the server version's); sent nothing, not changed
test('a branch chosen with changes not sent that cannot be sent: not changed, said', async ({ page, gh, work }) => {
  work.refs.draft = work.refs.main;
  await openWork(page);
  await page.locator('#body').fill('書きかけ\n');
  gh.fail = refuseSend;
  await page.getByRole('button', { name: /⎇ main/ }).click();
  await page.locator('#picker').getByRole('button', { name: 'draft' }).click();
  await expect(page.locator('#toast')).toHaveText('送れなかったので、ブランチを切り替えたりマージしたりしませんでした。書いたものはこの端末に残っています');
  await expect(page.getByRole('button', { name: /⎇ main/ })).toBeVisible();
});

// FR-GH-09: a merge with changes not sent: sent first, then merged; not sent, not merged; what it brings by the
// episodes' lengths (new, deleted); a branch GitHub no longer has, said as the server version says it
test('a merge: what is not sent sent first, or not merged; new and deleted episodes with their lengths; a branch gone said', async ({ page, gh, work }) => {
  work.refs.draft = work.refs.main;
  work.push(
    {
      'chapters/04_new.md': '# 第4話 新\n\n一二三\n',
      'chapters/02_second.md': null,
      'chapters/05_bad.md': /** @type {any} */ (Buffer.from([0x82, 0xff, 0xff])),
    },
    'draft',
  );
  await openWork(page);
  await page.getByRole('button', { name: /⎇ main/ }).click();
  await page.locator('#picker').getByRole('button', { name: 'draft' }).click();
  await expect(page.getByRole('button', { name: /⎇ draft/ })).toBeVisible();
  await page.locator('#body').fill('# 第1話 はじまり\n\n枝で\n');
  /** @type {string[]} */
  const said = [];
  page.on('dialog', d => {
    said.push(d.message());
    void d.accept();
  });
  // not sent: not merged
  gh.fail = refuseSend;
  await page.getByRole('button', { name: 'マージ' }).click();
  await page.locator('#picker').getByRole('button', { name: 'main' }).click();
  await expect(page.locator('#toast')).toHaveText('送れなかったので、ブランチを切り替えたりマージしたりしませんでした。書いたものはこの端末に残っています');
  expect(gh.calls.filter(c => c.includes('/merges'))).toEqual([]);
  // (one not to be read as text: counted as nothing)
  expect(said[0]).toMatch(/\n話の変化:\n・second 削除\n・新 新しい話（8 字）\n・bad 新しい話（0 字）\n\nマージしますか？$/);
  // sent, then merged
  gh.fail = null;
  await page.getByRole('button', { name: 'マージ' }).click();
  await page.locator('#picker').getByRole('button', { name: 'main' }).click();
  await expect(page.locator('#toast')).toHaveText('draft を main にマージしました');
  expect(work.text('chapters/01_first.md')).toBe('# 第1話 はじまり\n\n枝で\n');
  // the branch to merge into gone meanwhile
  work.push({ 'chapters/03_part/01_third.md': 'もう一度\n' }, 'draft');
  gh.fail = (method, path) => (method === 'POST' && path.endsWith('/merges') ? 404 : undefined);
  await page.getByRole('button', { name: 'マージ' }).click();
  await page.locator('#picker').getByRole('button', { name: 'main' }).click();
  await expect(page.locator('#toast')).toHaveText('main か draft が GitHub に見つかりません');
});

// FR-REL-01, FR-REL-02: a release with changes not sent that cannot be sent: not made; a tag v and a number without a
// GitHub release (made by the server version without GitHub) listed by its tag
test('a release not made when what is not sent cannot be sent; a tag without a release listed', async ({ page, gh, work }) => {
  work.tags.v1 = work.refs.main;
  await openWork(page);
  await page.locator('#body').fill('書きかけ\n');
  gh.fail = refuseSend;
  page.once('dialog', d => void d.accept('第一稿'));
  await page.getByRole('button', { name: 'リリースを作成' }).click();
  await expect(page.locator('#toast')).toHaveText('送れなかったので、リリースを作成しませんでした。書いたものはこの端末に残っています');
  expect(work.releases).toEqual([]);
  gh.fail = null;
  await page.getByRole('button', { name: 'リリース一覧' }).click();
  await expect(page.locator('#releases .version b')).toHaveText(['v1']);
});

// FR-NOTE-07: the characters' note there but not to be read: the board empty, said
test('the characters’ note not to be read: the board empty, said', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': `${TOML}\n[characters]\nfile = "notes/chars.md"\n`, 'notes/chars.md': /** @type {any} */ (Buffer.from([0x82, 0xff, 0xff])) });
  await openWork(page);
  await page.getByRole('button', { name: 'キャラ', exact: true }).click();
  await expect(page.locator('#toast')).toHaveText('この資料は開けません（文字コードが UTF-8 ではないか、この端末にまだ読み込まれていません）');
  await expect(page.locator('#characters-board')).toBeEmpty();
});

// FR-NOTE-02, FR-NOTE-03, FR-SAVE-08, FR-HIST-01: a note's preview drawn again when it is read in; a name of spaces only
// said; a note without a heading called by its file in its history, and put back by it
test('a note: the preview drawn again when read in; a name of spaces said; one without a heading in its history', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': TOML, 'notes/memo.md': 'メモだけ\n' });
  work.push({ 'notes/memo.md': 'メモだけ。直した\n' });
  await openWork(page);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  page.once('dialog', d => void d.accept('  '));
  await page.getByRole('button', { name: '＋ 資料を追加' }).click();
  await expect(page.locator('#toast')).toHaveText('名前を入れてください');
  await page.locator('#notes-list [data-note]', { hasText: 'memo.md' }).click();
  await page.locator('#note-preview-toggle').click();
  await expect(page.locator('#note-preview')).toHaveText('メモだけ。直した');
  work.push({ 'notes/memo.md': 'ほかの所で\n' });
  await inFront(page);
  await expect(page.locator('#note-preview')).toHaveText('ほかの所で');
  await expect(page.locator('#toast')).toHaveText('ほかの端末の更新を読み込みました');
  await page.locator('#note-preview-toggle').click();
  await page.getByRole('button', { name: 'この資料の履歴' }).click();
  await expect(page.locator('#versions-title')).toHaveText('「memo.md」の履歴');
  await page.getByRole('button', { name: /^GitHub 履歴/ }).click();
  await page.locator('#versions .version').nth(1).click();
  page.once('dialog', d => void d.accept());
  await page.getByRole('button', { name: 'この版を復元' }).click();
  await expect(page.locator('#toast')).toHaveText(/^「memo.md」を .+ の版に復元しました（送るまではこの端末だけの変更です）$/);
  await expect(page.locator('#note-body')).toHaveValue('メモだけ。直した\n');
});

// FR-PLOT-03: a double tap that comes as two dblclicks: the box opened once (as the server version's)
test('a box opened by two dblclicks one after another: opened once', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': TOML, 'notes/plot.md': '# プロット\n\n# 大箱1：起\n\n## 第1話 はじまり\n朝が来る。\n' });
  await openWork(page);
  await page.getByRole('button', { name: 'プロット', exact: true }).click();
  await page
    .locator('#plot-board .pcard')
    .first()
    .evaluate(async card => {
      card.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await new Promise(r => setTimeout(r, 200));
      card.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
  await expect(page.locator('#note-name')).toHaveText('第1話 はじまり');
  await expect(page.locator('#note-back')).toHaveText('‹ 箱');
});

// FR-TOC-04, FR-TOC-08: another episode moved while the preview is shown: the preview stays (as the server version's)
test('reordered, or a chapter renamed, while the preview is shown: the preview stays', async ({ page, gh }) => {
  await openWork(page);
  await page.getByRole('button', { name: 'プレビュー' }).click();
  await expect(page.locator('#preview')).toBeVisible();
  await page.getByRole('button', { name: '並べ替え' }).click();
  await page.locator('#tree .node', { hasText: '駅で' }).getByRole('button', { name: '上へ' }).click();
  await expect(page.locator('#tree .node.episode .t')).toHaveText(['駅で', 'はじまり', '坂の上']);
  await expect(page.locator('#preview')).toBeVisible();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  page.once('dialog', d => void d.accept('第一部'));
  await page.locator('#tree .node.chapter').getByRole('button', { name: '章の題名を変更' }).click();
  await expect(page.locator('#tree .node.chapter .t')).toHaveText('第一部');
  await expect(page.locator('#preview')).toBeVisible();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
});

// FR-TOC-06, FR-EDIT-07, FR-TOC-08: while a send is on its way, the trash and a picture do nothing (said); 再読み込み
// waits for the send
test('while a send is on its way: the trash and a picture said and not done; 再読み込み not started', async ({ page, gh, work }) => {
  await openWork(page);
  await page.locator('#body').fill('# 第1話 はじまり\n\n送っている\n');
  const h = await holdOnce(page, 'PATCH', '/git/refs/heads/');
  await page.getByRole('button', { name: '送る（1）' }).click();
  await h.came;
  // (the buttons of the operations are not pressed while sending: the ways in are called as the buttons do)
  page.once('dialog', d => void d.accept());
  await page.locator('#trash-episode').evaluate(b => {
    /** @type {HTMLButtonElement} */ (b).disabled = false;
    /** @type {HTMLButtonElement} */ (b).click();
  });
  await expect(page.locator('#toast')).toHaveText('送っている間は、話の追加・名前の変更・削除・並べ替えはできません。送り終わってからやり直してください');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '画像を挿入' }).click();
  await (await chooser).setFiles({ name: 'sky.png', mimeType: 'image/png', buffer: /** @type {Buffer} */ (WORK_FILES['notes/images/sky.png']) });
  await expect(page.locator('#toast')).toHaveText('送っている間は、話の追加・名前の変更・削除・並べ替えはできません。送り終わってからやり直してください');
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\n送っている\n');
  gh.calls.length = 0;
  await page.locator('#reload-work').click();
  expect(gh.calls.filter(c => c.includes('/git/trees/'))).toEqual([]);
  h.release();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  await expect(page.locator('#tree .node', { hasText: 'はじまり' })).toHaveCount(1);
});

// FR-SAVE-09: a text set aside: the button over the screen opens the list (as the server version's); sent from there and
// GitHub refusing: said, kept
test('a text set aside: the button over the screen opens the list; its send refused, said', async ({ page, gh, work }) => {
  await openWork(page);
  await page.locator('#tree .node', { hasText: '駅で' }).click();
  await page.locator('#body').fill('# 第2話 駅で\n\n残る\n');
  work.push({ 'chapters/02_second.md': null, '_trash/20261001-000000/chapters/02_second.md': WORK_FILES['chapters/02_second.md'] });
  await inFront(page);
  await expect(page.locator('#parked-bar')).toHaveText('未送信の書きかけが 1 件あります');
  await page.locator('#parked-bar').click();
  await expect(page.locator('#unsent')).toBeVisible();
  await expect(page.locator('#unsent .card small').first()).toHaveText(/ に保留$/);
  gh.fail = refuseSend;
  await page.getByRole('button', { name: '送信（GitHub の版と並べて残す）' }).click();
  await expect(page.locator('#toast')).toHaveText('送信できませんでした。書いたものはこの端末に残っています');
  // (the list of works: the button gone)
  await page.locator('#close-unsent').click();
  await page.getByRole('button', { name: '‹ 作品' }).click();
  await expect(page.locator('#parked-bar')).toHaveCount(0);
});

// FR-GH-02, FR-GH-12: an open work whose repository became empty: asked whether to start it; not, it stays open. The
// repository under the name taken again: what was not sent goes to it
test('a work open whose repository is empty now: asked, stays open when not started', async ({ page, gh, work }) => {
  await openWork(page);
  work.refs = {};
  page.once('dialog', d => void d.dismiss());
  await page.locator('#reload-work').click();
  await expect(page.locator('#sync-state')).toHaveText(/^リポジトリが空です/);
  await expect(page.locator('#desk')).toBeVisible();
});

// FR-TOC-08: a work open that cannot be read again (GitHub failing): it stays open, the failure said
test('a work open that cannot be read again: stays open, said', async ({ page, gh }) => {
  await openWork(page);
  gh.fail = (method, path) => (path.includes('/git/ref/') ? 500 : undefined);
  await page.locator('#reload-work').click();
  await expect(page.locator('#sync-state')).toHaveText(/test failure/);
  await expect(page.locator('#sync-brief')).toHaveText('・送信失敗');
  await expect(page.locator('#desk')).toBeVisible();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
});

// FR-WORK-05, FR-GH-12: a work stopped (another repository under its name): 送ってから削除 does not send it, nor delete
// it; connected again, what was not sent goes to it
test('a work stopped: 送ってから削除 neither sends nor deletes; connected again, what was not sent sent', async ({ page, gh, work }) => {
  await openWork(page);
  await page.locator('#body').fill('# 第1話 はじまり\n\n止まる\n');
  gh.rename('author/novel', 'author/gone');
  gh.unreadable.add('author/gone');
  // (another repository under the name, with the same files: what was written goes into it once connected)
  const other = new FakeRepo('author/novel', WORK_FILES);
  other.id = ++gh.ids;
  gh.repos.set('author/novel', other);
  await page.locator('#reload-work').click();
  await expect(page.locator('#gh-relink')).toBeVisible();
  await page.getByRole('button', { name: 'この作品を削除' }).click();
  await page.getByRole('button', { name: '送ってから削除' }).click();
  await expect(page.locator('#toast')).toHaveText('送れなかったので、削除しませんでした。書いたものはこの端末に残っています');
  page.once('dialog', d => void d.accept());
  await page.getByRole('button', { name: 'このリポジトリに再接続' }).click();
  await expect.poll(async () => (await stored(page, 'drafts')).length).toBe(0);
  expect(other.text('chapters/01_first.md')).toBe('# 第1話 はじまり\n\n止まる\n');
});

// FR-WORK-04: the work's title emptied where novel.toml has none: the repository's name shown again
test('the work’s title emptied where novel.toml has none: its repository’s name', async ({ page, gh }) => {
  await openWork(page);
  await page.getByRole('button', { name: '‹ 作品' }).click();
  await openRepo(page, 'author/other');
  await expect(page.locator('#work-repo a')).toHaveText('author/other');
  await expect(page.locator('#work-title')).toHaveValue('other');
  await page.locator('#work-title').fill('');
  await page.locator('#work-title').press('Enter');
  await expect(page.locator('#work-title')).toHaveValue('other');
});
