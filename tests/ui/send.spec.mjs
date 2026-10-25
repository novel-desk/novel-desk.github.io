// Sending: every episode written in one commit (blobs, a tree, a commit, the branch moved forward), and what happens
// when the branch moved on elsewhere
import { test, expect, openRepo, openWork, stored, WORK_FILES } from './lib/test.mjs';
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
  // FR-SAVE-07: not delivered, said on the episode too, until a send goes
  await expect(page.locator('#save-state')).toHaveText('届けられませんでした（この端末に残っています。理由は「送る」の上）');
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
  await expect(page.locator('#save-state')).toHaveText('GitHub に届いています');
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

// FR-SAVE-03, FR-GH-04: 自動 (the default): what was written goes by itself a while after the last key, and when the
// page is left, handled as 送る (what changed elsewhere too keeps both versions)
test('自動: sent by itself after a pause in writing, and when the page is left; both versions kept as 送る keeps them', async ({ page, gh, work }) => {
  await page.clock.install();
  await openWork(page);
  await expect(page.locator('#sync-mode')).toHaveValue('auto');
  await write(page, 'はじまり', '# 第1話 はじまり\n\nひとりでに届く。\n');
  await page.clock.fastForward(30000);
  expect(work.text('chapters/01_first.md')).toBe(WORK_FILES['chapters/01_first.md']);
  await page.clock.fastForward(31000);
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/01_first.md')).toBe('# 第1話 はじまり\n\nひとりでに届く。\n');
  await expect.poll(() => stored(page, 'drafts')).toEqual([]);
  // the page left (hidden): sent at once; written elsewhere too, both kept
  work.push({ 'chapters/02_second.md': '# 第2話 駅で\n\nほかで書いた。\n' });
  await write(page, '駅で', '# 第2話 駅で\n\nここで書いた。\n');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#sync-state')).toHaveText(/駅ではほかでも書き換えられていたので、両方の版を並べました/);
  expect(work.text('chapters/02_second.md')).toBe(`# 第2話 駅で\n\nここで書いた。\n\n${OTHER_DEVICE_MARK}\n\n# 第2話 駅で\n\nほかで書いた。\n`);
});

// FR-SAVE-03: GitHub not reached: kept on the device, and sent when the device is back online
test('自動: GitHub not reached, the text stays; back online, it goes', async ({ page, gh, work }) => {
  await page.clock.install();
  await openWork(page);
  gh.down = true;
  await write(page, 'はじまり', '後で届く\n');
  await page.clock.fastForward(61000);
  await expect(page.locator('#sync-state')).toHaveText('GitHub につながりません（オフラインかもしれません）。書いたものはこの端末に残っています');
  gh.down = false;
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await page.clock.fastForward(2000);
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/01_first.md')).toBe('後で届く\n');
});

// FR-GH-04: 「送る」を押したときだけ, and 同期しない (nothing sent, nothing read in), chosen for each work and kept
test('送る頻度: 送るを押したときだけ waits for the button; 同期しない sends nothing and reads nothing in', async ({ page, gh, work }) => {
  await page.clock.install();
  await openWork(page);
  await page.locator('#sync-mode').selectOption('manual');
  await write(page, 'はじまり', '# 第1話 はじまり\n\n押すまで待つ\n');
  await page.clock.fastForward(120000);
  expect(work.text('chapters/01_first.md')).toBe(WORK_FILES['chapters/01_first.md']);
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  await page.locator('#sync-mode').selectOption('off');
  await expect(page.locator('#sync-state')).toHaveText(/^同期しない設定です/);
  await write(page, 'はじまり', '# 第1話 はじまり\n\n端末だけ\n');
  await expect(page.locator('#send')).toBeDisabled();
  await expect(page.locator('#reload')).toBeDisabled();
  // opened again: the mode kept, the work as read before, GitHub not asked where the branch is
  work.push({ 'chapters/02_second.md': '# 第2話 駅で\n\nほかで\n' });
  gh.calls.length = 0;
  await page.reload();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await expect(page.locator('#sync-mode')).toHaveValue('off');
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\n端末だけ\n');
  await page.clock.fastForward(120000);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.locator('#tree .node', { hasText: '駅で' }).click();
  await expect(page.locator('#body')).toHaveValue(WORK_FILES['chapters/02_second.md']);
  expect(gh.calls.filter(c => c.includes('/git/ref') || c.startsWith('POST') || c.startsWith('PATCH'))).toEqual([]);
  expect(work.text('chapters/01_first.md')).toBe('# 第1話 はじまり\n\n押すまで待つ\n');
});

// a request to GitHub held on its way until released (a send in flight while the author goes on)
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

// FR-SAVE-01, FR-SAVE-07: typed while a send is on its way: what was typed since stays on the device, not sent, in the
// box as typed; typed back to the text read meanwhile, that text stays (it is not replaced by the one sent)
test('typed while sending: what was typed since stays, not sent; typed back to the text read, that text stays', async ({ page, gh, work }) => {
  await openWork(page);
  const read = WORK_FILES['chapters/01_first.md'];
  await write(page, 'はじまり', `${read}送る分\n`);
  let h = await holdOnce(page, 'PATCH', '/git/refs/heads/');
  await page.getByRole('button', { name: '送る（1）' }).click();
  await h.came;
  await page.locator('#body').fill(`${read}送る分\nその後\n`);
  h.release();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/01_first.md')).toBe(`${read}送る分\n`);
  await expect(page.locator('#body')).toHaveValue(`${read}送る分\nその後\n`);
  await expect(page.locator('#send')).toHaveText('送る（1）');
  await expect(page.locator('#save-state')).toHaveText('未送信（この端末に保存しました）');
  // typed back to the text read while it is sent
  await page.unrouteAll();
  const now = work.text('chapters/01_first.md');
  h = await holdOnce(page, 'PATCH', '/git/refs/heads/');
  await page.getByRole('button', { name: '送る（1）' }).click();
  await h.came;
  await page.locator('#body').fill(now ?? '');
  h.release();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/01_first.md')).toBe(`${read}送る分\nその後\n`);
  await expect(page.locator('#body')).toHaveValue(`${read}送る分\n`);
  await expect(page.locator('#send')).toHaveText('送る（1）');
  await expect.poll(async () => (await stored(page, 'drafts')).map(d => d.text)).toEqual([`${read}送る分\n`]);
});

/** @param {import('@playwright/test').Page} page the page left (hidden), as when another app is opened */
const leave = page =>
  page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    // (what it starts, started)
    return new Promise(r => setTimeout(r, 0));
  });
/** @param {import('@playwright/test').Page} page the page back in front */
const back = page =>
  page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

// FR-SAVE-03: the page left while the list of works is shown: nothing sent then (no work open); sent from the work
test('自動: the page left while the list of works is shown: nothing sent then; the work open again, sent', async ({ page, gh, work }) => {
  await openWork(page);
  await write(page, 'はじまり', '一覧で離れる\n');
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  await leave(page);
  expect(gh.calls.filter(c => c.startsWith('PATCH'))).toEqual([]);
  await back(page);
  await expect(page.locator('#repo-list .work small')).toHaveText([/ 字 ・ /]);
  await page.locator('#repo-list .work', { hasText: 'author/novel' }).click();
  await expect(page.locator('#desk')).toBeVisible();
  await expect(page.locator('#body')).toHaveValue('一覧で離れる\n');
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  await leave(page);
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/01_first.md')).toBe('一覧で離れる\n');
});

// FR-SAVE-03: the page left while a send is on its way: what was typed since goes by itself afterwards
test('自動: the page left while a send is on its way: what was typed since sent by itself afterwards', async ({ page, gh, work }) => {
  await page.clock.install();
  await openWork(page);
  await write(page, 'はじまり', 'A\n');
  const h = await holdOnce(page, 'PATCH', '/git/refs/heads/');
  await page.getByRole('button', { name: '送る（1）' }).click();
  await h.came;
  await page.locator('#body').fill('A\nB\n');
  await leave(page);
  h.release();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/01_first.md')).toBe('A\n');
  await page.clock.fastForward(61000);
  await expect.poll(() => work.text('chapters/01_first.md')).toBe('A\nB\n');
});

// FR-GH-04, FR-SAVE-03: the page left while 「送るを押したときだけ」 sends, or while the work is read again: nothing more sent
test('the page left while a send of 「送るを押したときだけ」 is on its way, or while reading again: nothing more sent', async ({ page, gh, work }) => {
  await openWork(page);
  await page.locator('#sync-mode').selectOption('manual');
  await write(page, 'はじまり', 'A\n');
  let h = await holdOnce(page, 'PATCH', '/git/refs/heads/');
  await page.getByRole('button', { name: '送る（1）' }).click();
  await h.came;
  await page.locator('#body').fill('A\nB\n');
  await leave(page);
  h.release();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  await back(page);
  await page.locator('#sync-mode').selectOption('auto');
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  await page.unrouteAll();
  h = await holdOnce(page, 'GET', '/git/trees/');
  await page.getByRole('button', { name: '再読み込み' }).click();
  await h.came;
  await leave(page);
  h.release();
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  expect(gh.calls.filter(c => c.startsWith('PATCH')).length).toBe(2);
});

// FR-SAVE-04, NFR-USE-01: the episode changed on GitHub into something that is not text (not UTF-8): both versions
// cannot be kept, so not sent; said, the text kept
test('changed on GitHub into something not UTF-8: not sent, said; the text kept', async ({ page, gh, work }) => {
  await openWork(page);
  await write(page, 'はじまり', 'ここで\n');
  work.push({ 'chapters/01_first.md': /** @type {any} */ (Buffer.from([0x82, 0xff, 0xff])) });
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(
    '送れませんでした: chapters/01_first.md は GitHub で UTF-8 でない形に変わっているので、送れません。書いたものはこの端末に残っています',
  );
  await expect(page.locator('#body')).toHaveValue('ここで\n');
});

// FR-WORK-03, FR-WORK-04: novel.toml that is not UTF-8 (nor a Japanese encoding): said when read; the work's title
// is not written into it, said
test('novel.toml not UTF-8: said when read; the work’s title not written into it, said', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': /** @type {any} */ (Buffer.from([0x82, 0xff, 0xff])) });
  await openWork(page, null);
  await expect(page.locator('#layout-problems')).toHaveText('novel.toml が UTF-8 ではないので読めません');
  await page.locator('#work-title').fill('別の題');
  await page.locator('#work-title').press('Enter');
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(
    '送れませんでした: novel.toml が UTF-8 ではないので、書き換えられません。書いたものはこの端末に残っています',
  );
});

// FR-WORK-04: the work's title sent on top of novel.toml as it is on GitHub now: one that cannot be read there is said;
// the same title set there too, nothing more written; a work without novel.toml gets one
test('the work’s title sent: novel.toml unreadable on GitHub now, said; the same title there, left as it is; none there, made', async ({ page, gh, work }) => {
  await openWork(page);
  await page.locator('#work-title').fill('別の題');
  await page.locator('#work-title').press('Enter');
  const before = work.text('novel.toml');
  work.push({ 'novel.toml': '[manuscript]\ndir = chapters\n' });
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送れませんでした: .*chapters/);
  const same = (before ?? '').replace('"試験の作品"', '"別の題"');
  work.push({ 'novel.toml': same });
  const head = work.refs.main;
  await page.getByRole('button', { name: '送る（1）' }).click();
  // (nothing to change: no commit made)
  await expect(page.locator('#sync-state')).toHaveText('送る変更はありませんでした（GitHub にもう同じ内容があります）');
  expect(work.refs.main).toBe(head);
  expect(work.text('novel.toml')).toBe(same);
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  await openRepo(page, 'author/other');
  await expect(page.locator('#tree')).toContainText('話がありません');
  await page.locator('#work-title').fill('ほかの題');
  await page.locator('#work-title').press('Enter');
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(gh.repos.get('author/other')?.text('novel.toml')).toContain('title = "ほかの題"');
});

// FR-TOC-05, FR-GH-06: a file moved (renamed) whose text GitHub does not give back: still sent, the commit said without it
test('an episode renamed whose text GitHub does not give back: sent all the same', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': WORK_FILES['novel.toml'].replace('title = "heading"\n', '') });
  await openWork(page, 'first');
  await page.locator('#episode-title').fill('始まり');
  await page.locator('#episode-title').press('Enter');
  await expect(page.locator('#send')).toHaveText('送る（2）');
  // (the device without the blob, and GitHub not giving it)
  const sha = work.files(work.refs.main)['chapters/01_first.md'].sha;
  await page.evaluate(
    sha =>
      new Promise(resolve => {
        const req = indexedDB.open('novel-writer-js');
        req.onsuccess = () => {
          const tx = req.result.transaction('blobs', 'readwrite');
          tx.objectStore('blobs').delete(sha);
          tx.oncomplete = resolve;
        };
      }),
    sha,
  );
  // (twice: its text before and after the move, for the commit's message; read again after the send)
  let refused = 0;
  gh.fail = (method, path) => {
    if (method !== 'GET' || !path.endsWith(`/git/blobs/${sha}`) || refused === 2) return undefined;
    refused++;
    return 500;
  };
  await page.getByRole('button', { name: '送る（2）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/01_始まり.md')).toBe(WORK_FILES['chapters/01_first.md']);
  expect(refused).toBe(2);
});

// FR-SAVE-07, NFR-USE-01: the branch not moved (GitHub failing, or moved on elsewhere every time): not sent, said
test('the branch cannot be moved (GitHub failing, or moved on elsewhere each time): not sent, said', async ({ page, gh, work }) => {
  await openWork(page);
  await write(page, 'はじまり', '動かない\n');
  gh.fail = method => (method === 'PATCH' ? 500 : undefined);
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送れませんでした: .*test failure。書いたものはこの端末に残っています$/);
  gh.fail = null;
  gh.before = method => {
    if (method === 'PATCH') work.push({ 'README.md': `# ${Math.random()}\n` });
  };
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送れませんでした: .*。書いたものはこの端末に残っています$/);
  expect(gh.calls.filter(c => c.startsWith('PATCH')).length).toBe(4);
  expect(work.text('chapters/01_first.md')).toBe(WORK_FILES['chapters/01_first.md']);
});
