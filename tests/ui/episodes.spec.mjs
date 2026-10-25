// Episodes and chapters added, renamed, put in the trash and reordered: kept on the device as changes not sent, and
// sent with the texts in one commit (FR-TOC-02〜07). novel.toml keeps every line the app did not change
import { test, expect, openRepo, openWork, stored, WORK_FILES } from './lib/test.mjs';
import { japanDay } from '../../lib/commit.js';

// the work with its titles in the file names (no title = "heading")
const BY_NAME = WORK_FILES['novel.toml'].replace('title = "heading"\n', '');
/** @param {import('./lib/test.mjs').FakeRepo} work @param {string} [branch] */
const paths = (work, branch) => Object.keys(work.files(work.refs[branch ?? work.defaultBranch])).sort();

test.use({ timezoneId: 'Asia/Tokyo' });

// FR-TOC-02
test('an episode added: numbered on, its heading numbered on, kept on the device until sent; its title typed', async ({ page, gh, work }) => {
  await openWork(page);
  await page.getByRole('button', { name: '＋ 話を追加' }).click();
  await expect(page.locator('#episode-title')).toHaveValue('新しい話');
  await expect(page.locator('#body')).toHaveValue('# 第3話 新しい話\n\n');
  await expect(page.locator('#tree .node.active')).toContainText('未送信');
  await expect(page.locator('#send')).toHaveText('送る（1）');
  // the title selected: typed over, the heading follows (title = "heading")
  await page.keyboard.type('夜');
  await page.keyboard.press('Enter');
  await expect(page.locator('#body')).toHaveValue('# 第3話 夜\n\n');
  await expect(page.locator('#tree .node.active .t')).toHaveText('夜');
  await page.locator('#body').press('End');
  await page.keyboard.type('本文');
  // kept on the device: the change of the operation, with the text typed
  await expect
    .poll(async () => (await stored(page, 'drafts')).map(d => [d.path, d.base, d.text, Boolean(d.op)]))
    .toEqual([['chapters/04.md', '', '# 第3話 夜\n\n本文', true]]);
  await page.reload();
  // (at the end of the top: after the chapter numbered 03)
  await expect(page.locator('#tree .node .t')).toHaveText(['はじまり', '駅で', 'part', '坂の上', '夜']);
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/04.md')).toBe('# 第3話 夜\n\n本文');
  expect(work.head().message).toBe(`${japanDay(Date.now())} 夜（新しい話、7字）`);
  await expect(page.locator('.unsent-tag')).toHaveCount(0);
  await expect.poll(() => stored(page, 'drafts')).toEqual([]);
});

// FR-TOC-03, FR-PLOT-07: a chapter added; novel.toml gets its title, every other line as it was
test('a chapter added with one episode; its title in [titles] of novel.toml, the rest of the file unchanged', async ({ page, gh, work }) => {
  await openWork(page);
  page.once('dialog', d => void d.accept('第二部'));
  await page.getByRole('button', { name: '＋ 章を追加' }).click();
  await expect(page.locator('#tree .node.chapter .t')).toHaveText(['part', '第二部']);
  await expect(page.locator('#episode-title')).toHaveValue('新しい話');
  await page.getByRole('button', { name: '送る（2）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/04/01.md')).toBe('# 新しい話\n\n');
  expect(work.text('novel.toml')).toBe(`${WORK_FILES['novel.toml']}\n\n[titles]\n04 = "第二部"\n`);
  expect(work.head().message).toBe(`${japanDay(Date.now())} 新しい話（新しい話、5字）`);
});

// FR-TOC-05
test('an episode renamed: its file named again (the titles in the names), the commit says it', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': BY_NAME });
  await openWork(page, 'first');
  await page.locator('#episode-title').fill('始まり');
  await page.locator('#episode-title').press('Enter');
  await expect(page.locator('#tree .node .t')).toHaveText(['始まり', 'second', 'part', 'third']);
  await expect(page.locator('#episode-title')).toHaveValue('始まり');
  // typed after the rename: in the file where it went
  await page.locator('#body').press('Control+End');
  await page.keyboard.type('続き');
  await page.getByRole('button', { name: '送る（2）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(paths(work)).toContain('chapters/01_始まり.md');
  expect(paths(work)).not.toContain('chapters/01_first.md');
  expect(work.text('chapters/01_始まり.md')).toBe(`${WORK_FILES['chapters/01_first.md']}続き`);
  expect(work.head().message).toBe(`${japanDay(Date.now())} first→始まり（タイトル） ＋2字`);
});

// FR-TOC-05: a chapter's title (its folder named again, its episodes along)
test('a chapter renamed from the reorder tools', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': BY_NAME });
  await openWork(page, 'first');
  await page.getByRole('button', { name: '並べ替え' }).click();
  page.once('dialog', d => void d.accept('坂道'));
  await page.getByRole('button', { name: '章の題名を変更', exact: true }).click();
  await expect(page.locator('#tree .node.chapter .t')).toHaveText('坂道');
  await page.getByRole('button', { name: '完了' }).click();
  await page.getByRole('button', { name: '送る（2）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/03_坂道/01_third.md')).toBe(WORK_FILES['chapters/03_part/01_third.md']);
  expect(paths(work).some(p => p.startsWith('chapters/03_part/'))).toBe(false);
});

// FR-TOC-06
test('an episode put in the trash: moved to _trash/ with the time and its title, the one before opened', async ({ page, gh, work }) => {
  await openWork(page);
  await page.locator('#tree .node', { hasText: '駅で' }).click();
  page.once('dialog', d => void d.accept());
  await page.getByRole('button', { name: 'この話を削除' }).click();
  await expect(page.locator('#tree .node .t')).toHaveText(['はじまり', 'part', '坂の上']);
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await page.getByRole('button', { name: '送る（2）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  const trashed = paths(work).filter(p => p.startsWith('_trash/'));
  expect(trashed).toEqual([expect.stringMatching(/^_trash\/\d{8}T\d{6}_2_駅で\.md$/)]);
  expect(work.text(trashed[0])).toBe(WORK_FILES['chapters/02_second.md']);
  expect(paths(work)).not.toContain('chapters/02_second.md');
  expect(work.head().message).toBe(`${japanDay(Date.now())} 駅で（削除）`);
});
test('the trash said no to: nothing changes', async ({ page, gh }) => {
  await openWork(page);
  page.once('dialog', d => void d.dismiss());
  await page.getByRole('button', { name: 'この話を削除' }).click();
  await expect(page.locator('#tree .node .t')).toHaveText(['はじまり', '駅で', 'part', '坂の上']);
  await expect(page.locator('#send')).toBeDisabled();
});

// FR-TOC-04
test('reordered with ↑↓ and the chapter to move to: the files numbered again, the open episode followed', async ({ page, gh, work }) => {
  await openWork(page);
  await page.getByRole('button', { name: '並べ替え' }).click();
  await page.locator('#tree .node', { hasText: 'はじまり' }).getByRole('button', { name: '下へ' }).click();
  await expect(page.locator('#tree .node .t')).toHaveText(['駅で', 'はじまり', 'part', '坂の上']);
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await page.locator('#tree .node', { hasText: '駅で' }).getByLabel('移動先の章').selectOption({ label: 'part' });
  await expect(page.locator('#tree .node .t')).toHaveText(['はじまり', 'part', '坂の上', '駅で']);
  await page.getByRole('button', { name: '完了' }).click();
  await page.getByRole('button', { name: /^送る/ }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(paths(work).filter(p => p.startsWith('chapters/'))).toEqual([
    'chapters/01_first.md',
    'chapters/02_part/01_third.md',
    'chapters/02_part/02_second.md',
    'chapters/memo.txt',
  ]);
  expect(work.text('chapters/02_part/02_second.md')).toBe(WORK_FILES['chapters/02_second.md']);
  expect(work.head().message).toMatch(/（並べ替え）/);
});
test('reordered by dragging: an episode dropped on a chapter goes to its end', async ({ page, gh }) => {
  await openWork(page);
  await page.getByRole('button', { name: '並べ替え' }).click();
  await page.locator('#tree .node', { hasText: 'はじまり' }).dragTo(page.locator('#tree .node.chapter'));
  await expect(page.locator('#tree .node .t')).toHaveText(['駅で', 'part', '坂の上', 'はじまり']);
});

// FR-TOC-07
test('a chapter folded stays folded on this device', async ({ page, gh }) => {
  await openWork(page);
  await page.locator('#tree .node.chapter').click();
  await expect(page.locator('#tree .node', { hasText: '坂の上' })).toBeHidden();
  // (kept on the device before the page is loaded again)
  await expect
    .poll(async () => (await stored(page, 'prefs')).some(v => Array.isArray(v) && v.some(x => typeof x === 'string' && x.endsWith('03_part'))))
    .toBe(true);
  await page.reload();
  await expect(page.locator('#tree .node.chapter .fold')).toHaveText('▸');
  await expect(page.locator('#tree .node', { hasText: '坂の上' })).toBeHidden();
  await page.locator('#tree .node.chapter').click();
  await expect(page.locator('#tree .node', { hasText: '坂の上' })).toBeVisible();
});

// FR-WORK-04
test('the work renamed: title in novel.toml, the other lines unchanged', async ({ page, gh, work }) => {
  await openWork(page);
  await page.locator('#work-title').fill('別の題');
  await page.locator('#work-title').press('Enter');
  await expect(page.locator('#send')).toHaveText('送る（1）');
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('novel.toml')).toBe(WORK_FILES['novel.toml'].replace('"試験の作品"', '"別の題"'));
  expect(work.head().message).toBe(`${japanDay(Date.now())} 整理`);
});

// FR-SAVE-04: a rename here and a change of the same file elsewhere: not sent; read again, the rename is undone and
// the text written stays
test('renamed here and changed elsewhere: not sent, said; read again, the rename undone, the text typed kept', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': BY_NAME });
  await openWork(page, 'first');
  await page.locator('#episode-title').fill('始まり');
  await page.locator('#episode-title').press('Enter');
  await page.locator('#body').fill('ここで書いた\n');
  const before = work.refs.main;
  work.push({ 'chapters/01_first.md': 'ほかで書いた\n' });
  await page.getByRole('button', { name: '送る（2）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(
    /^ほかの所で chapters\/01_first\.md が変わっていたので、送りませんでした。「再読み込み」で読み直してください/,
  );
  expect(work.head().parents).toEqual([before]);
  await page.locator('#reload-work').click();
  await expect(page.locator('#sync-state')).toHaveText(/名前の変更・削除・並べ替えを取り消しました。書いた文章は残っています/);
  await expect(page.locator('#tree .node .t')).toHaveText(['first', 'second', 'part', 'third']);
  await expect(page.locator('#episode-title')).toHaveValue('first');
  await expect(page.locator('#body')).toHaveValue('ここで書いた\n');
  // sent now: both versions side by side, nothing lost
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/両方の版を並べました/);
  expect(work.text('chapters/01_first.md')).toMatch(/^ここで書いた\n\n――― ここから、ほかの端末で書かれた版 ―――\n\nほかで書いた\n$/);
});

// FR-EDIT-02, FR-TOC-01: the counts and the last change
test('the counts and 最終更新: the work, the episode (its last commit; this device once written)', async ({ page, gh, work }) => {
  await openWork(page);
  await expect(page.locator('#work-chars')).toHaveText('37');
  await expect(page.locator('#work-count')).toHaveText('3');
  // (the commits of the fake GitHub: 2026-10-01 00:01 UTC, 9:01 in Japan)
  await expect(page.locator('#work-updated')).toHaveText('10/1 9:01');
  await expect(page.locator('#episode-updated')).toHaveText('最終更新 10/1 9:01');
  await page.locator('#body').press('Control+End');
  await page.keyboard.type('あ');
  await expect(page.locator('#episode-updated')).toHaveText(/^最終更新 \d+\/\d+ \d+:\d\d（たった今）$/);
  await expect(page.locator('#work-updated')).toHaveText(/（たった今）$/);
  await expect(page.locator('#work-chars')).toHaveText('38');
  await expect(page.locator('#episode-chars')).toHaveText('14');
});

// FR-TOC-01: 最終更新 on the rows, as the server version's: asked of GitHub lazily, once for each version of an episode,
// and said only where it tells a row from the others
test('the rows’ 最終更新: the one changed elsewhere says its time; asked once for each blob, kept on the device', async ({ page, gh, work }) => {
  work.push({ 'chapters/02_second.md': '# 第2話 駅で\n\nほかで\n' });
  await openWork(page);
  const times = page.locator('#tree .node.episode .u');
  await expect(times).toHaveText(['', /^10\/1 \d+:02$/, '']);
  await expect.poll(() => gh.calls.filter(c => c.includes('/commits?') && c.includes('path=')).length).toBe(3);
  // written here: now, until sent
  await page.locator('#body').press('Control+End');
  await page.keyboard.type('あ');
  await expect(times.first()).toHaveText(/^\d+\/\d+ \d+:\d\d$/);
  // opened again: from the device, not asked again
  await page.reload();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  gh.calls.length = 0;
  await page.locator('#reload-work').click();
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  await expect(times.nth(1)).toHaveText(/^10\/1 \d+:02$/);
  expect(gh.calls.filter(c => c.includes('path='))).toEqual([]);
});

// FR-TOC-02, FR-TOC-03: past the largest number (999999), an episode or a chapter is not added; the reason is said
test('past the largest number: no episode and no chapter added, the reason said', async ({ page, gh, work }) => {
  work.push({ 'chapters/999999_last.md': '# 第999999話 最後\n' });
  await openWork(page);
  await page.getByRole('button', { name: '＋ 話を追加' }).click();
  await expect(page.locator('#toast')).toHaveText('これ以上は追加できません（番号の上限は 999999）');
  await page.locator('#toast').evaluate(t => (t.textContent = ''));
  page.once('dialog', d => void d.accept('第二部'));
  await page.getByRole('button', { name: '＋ 章を追加' }).click();
  await expect(page.locator('#toast')).toHaveText('これ以上は追加できません（番号の上限は 999999）');
  await expect(page.locator('#send')).toBeDisabled();
});

// FR-WORK-04: novel.toml that cannot be read takes no key: the work's title (a key) not kept, the reason said
test('novel.toml that cannot be read: the work’s title not kept, the reason said', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': '[manuscript]\ndir = chapters\n' });
  await openWork(page, null);
  await expect(page.locator('#layout-problems')).toBeVisible();
  await page.locator('#work-title').fill('別の題');
  await page.locator('#work-title').press('Enter');
  await expect(page.locator('#toast')).toHaveText(/chapters/);
  await expect(page.locator('#send')).toBeDisabled();
});

// FR-TOC-03, FR-TOC-05: the prompts closed, emptied or left as they were: nothing changes
test('a chapter’s title not given, or given as it was: nothing added, nothing renamed', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': BY_NAME });
  await openWork(page, 'first');
  page.once('dialog', d => void d.dismiss());
  await page.getByRole('button', { name: '＋ 章を追加' }).click();
  await expect(page.locator('#tree .node.chapter')).toHaveCount(1);
  await page.getByRole('button', { name: '並べ替え' }).click();
  for (const answer of [null, '  ', 'part']) {
    page.once('dialog', d => void (answer === null ? d.dismiss() : d.accept(answer)));
    await page.getByRole('button', { name: '章の題名を変更', exact: true }).click();
    await expect(page.locator('#tree .node.chapter .t')).toHaveText('part');
  }
  await expect(page.locator('#send')).toBeDisabled();
});

// FR-TOC-05: a title that cannot be given (the episode cannot be read as text) is said, and the title stays; the same
// title given again changes nothing
test('an episode renamed to the title it has, or one that cannot be read: nothing changes, the title stays', async ({ page, gh, work }) => {
  work.push({ 'chapters/04_bad.md': /** @type {any} */ (Buffer.from([0x82, 0xff, 0xff])) });
  await openWork(page);
  await page.locator('#episode-title').dispatchEvent('change');
  await expect(page.locator('#send')).toBeDisabled();
  await page.locator('#tree .node', { hasText: 'bad' }).click();
  await page.locator('#episode-title').fill('読めない話');
  await page.locator('#episode-title').press('Tab');
  await expect(page.locator('#toast')).toHaveText('見つかりません');
  await expect(page.locator('#episode-title')).toHaveValue('bad');
  await expect(page.locator('#send')).toBeDisabled();
});

// FR-TOC-04: a row that cannot move further (the first one up) stays; a work ordered by the numbers in its file names
// (2-09.md) cannot be reordered in the app yet, said
test('reordered past the end, or in a work ordered by 2-09.md: nothing moves, the reason said', async ({ page, gh, work }) => {
  await openWork(page);
  await page.getByRole('button', { name: '並べ替え' }).click();
  await page.locator('#tree .node', { hasText: 'はじまり' }).getByRole('button', { name: '上へ' }).click();
  await expect(page.locator('#tree .node .t')).toHaveText(['はじまり', '駅で', 'part', '坂の上']);
  await expect(page.locator('#send')).toBeDisabled();
  work.push({
    'novel.toml': '[manuscript]\ndir = "chapters"\nnaming = "chapter-number"\n',
    'chapters/1-01.md': '# 一\n',
    'chapters/1-02.md': '# 二\n',
  });
  await page.getByRole('button', { name: '完了' }).click();
  await page.locator('#reload-work').click();
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  await page.getByRole('button', { name: '並べ替え' }).click();
  await page.locator('#tree [data-path="chapters/1-01.md"] [data-move="1"]').click();
  await expect(page.locator('#toast')).toHaveText(/まだアプリではできません/);
});

// FR-TOC-04: a chapter dragged onto an episode goes before it; a row dragged onto itself, or a drag that did not start
// on a row, moves nothing
test('reordered by dragging: a chapter before the episode it is dropped on; nothing moves for a drag not from a row', async ({ page, gh }) => {
  await openWork(page);
  await page.getByRole('button', { name: '並べ替え' }).click();
  // (a drag of something that is not a row, text say, and a row passed over or dropped on with nothing dragged)
  await page.locator('#tree').dispatchEvent('dragstart');
  await page.locator('#tree .node', { hasText: '駅で' }).dispatchEvent('dragover');
  await page.locator('#tree .node', { hasText: '駅で' }).dispatchEvent('drop');
  await page.locator('#tree .node', { hasText: '駅で' }).dispatchEvent('dragstart');
  await page.locator('#tree .node', { hasText: '駅で' }).dispatchEvent('dragend');
  await page.locator('#tree').dispatchEvent('drop');
  await expect(page.locator('#tree .node .t')).toHaveText(['はじまり', '駅で', 'part', '坂の上']);
  await page.locator('#tree .node.chapter').dragTo(page.locator('#tree .node', { hasText: 'はじまり' }));
  await expect(page.locator('#tree .node .t')).toHaveText(['part', '坂の上', 'はじまり', '駅で']);
});

// FR-TOC-01, FR-TOC-07: the rows by keyboard (Enter opens an episode, folds a chapter); while reordering, a chapter is
// not folded by a tap
test('the rows by keyboard: Enter opens an episode or folds a chapter; reordering, a tap does not fold', async ({ page, gh }) => {
  await openWork(page);
  await page.locator('#tree .node', { hasText: '駅で' }).press('a');
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await page.locator('#tree .node', { hasText: '駅で' }).press('Enter');
  await expect(page.locator('#episode-title')).toHaveValue('駅で');
  await page.locator('#tree .node.chapter').press('Enter');
  await expect(page.locator('#tree .node.chapter .fold')).toHaveText('▸');
  await page.locator('#tree .node.chapter').press('Enter');
  await page.getByRole('button', { name: '並べ替え' }).click();
  await page.locator('#tree .node.chapter .t').click();
  await expect(page.locator('#tree .node.chapter .fold')).toHaveText('▾');
});

// FR-WORK-04, FR-TOC-05: the titles typed (Enter ends them); the work's title emptied or left as it was: nothing kept
test('the titles typed: Enter ends them; the work’s title emptied or as it was: nothing kept, the title shown again', async ({ page, gh }) => {
  await openWork(page);
  await page.locator('#work-title').click();
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Enter');
  // (Enter keeps the field focused, as the server version's: the change is kept all the same)
  await expect(page.locator('#work-title')).toBeFocused();
  await expect(page.locator('#send')).toBeDisabled();
  await page.locator('#work-title').fill('');
  await page.locator('#work-title').press('Enter');
  await expect(page.locator('#work-title')).toHaveValue('試験の作品');
  await expect(page.locator('#send')).toBeDisabled();
  await page.locator('#episode-title').click();
  await page.keyboard.press('End');
  await page.keyboard.type('に');
  await page.keyboard.press('Enter');
  await expect(page.locator('#body')).toBeFocused();
  await expect(page.locator('#tree .node.active .t')).toHaveText('はじまりに');
});

// FR-TOC-02, FR-TOC-03, FR-TOC-04, FR-TOC-06: while a work is being read, the operations on it wait (a tap on
// 「＋ 話を追加」 then had no work to add to, and said 「Cannot read properties of null」)
test('while the work is being read: adding, reordering, the trash and the work’s screens wait until it is read', async ({ page, gh }) => {
  await openWork(page);
  /** @type {() => void} */
  let release = () => {};
  const gate = new Promise(r => (release = () => r(undefined)));
  await page.route('https://api.github.com/repos/author/novel/git/trees/**', async route => {
    await gate;
    await route.fallback();
  });
  await page.reload();
  await expect(page.locator('#desk')).toBeVisible();
  for (const name of ['＋ 話を追加', '＋ 章を追加', '並べ替え', 'この話を削除']) await expect(page.getByRole('button', { name })).toBeDisabled();
  // (the screens of the work too: リリース一覧 opened before said 「Cannot read properties of null」)
  for (const id of ['open-notes', 'open-plot', 'open-characters', 'open-record', 'name-version', 'open-versions'])
    await expect(page.locator(`#${id}`)).toBeDisabled();
  release();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await expect(page.getByRole('button', { name: '＋ 話を追加' })).toBeEnabled();
  await expect(page.locator('#open-versions')).toBeEnabled();
});

// FR-TOC-04, FR-SAVE-09: a work whose chapters have no episode yet: the chapters reordered with no episode open; the
// reorder given up, still none open
test('chapters with no episode reordered, none open; the reorder given up, none open', async ({ page, gh, work }) => {
  work.push({
    'chapters/01_first.md': null,
    'chapters/02_second.md': null,
    'chapters/03_part/01_third.md': null,
    'chapters/04_a/memo.txt': 'メモ\n',
    'chapters/05_b/memo.txt': 'メモ\n',
  });
  await openWork(page, null);
  await expect(page.locator('#tree .node.chapter .t')).toHaveText(['a', 'b']);
  await expect(page.locator('#episode-title')).toHaveValue('');
  await page.getByRole('button', { name: '並べ替え' }).click();
  await page.locator('#tree .node.chapter', { hasText: 'a' }).first().getByRole('button', { name: '下へ' }).click();
  await expect(page.locator('#tree .node.chapter .t')).toHaveText(['b', 'a']);
  await expect(page.locator('#episode-title')).toHaveValue('');
  await page.getByRole('button', { name: '完了' }).click();
  await page.getByRole('button', { name: '未送信の一覧' }).click();
  page.once('dialog', d => void d.accept());
  await page.locator('#unsent-body .unsent-item').getByRole('button', { name: '取り消す' }).click();
  await expect(page.locator('#tree .node.chapter .t')).toHaveText(['a', 'b']);
  await expect(page.locator('#episode-title')).toHaveValue('');
  await expect(page.locator('#body')).toBeDisabled();
});

// FR-TOC-06: the last episode put in the trash: none open; the history of no episode asks nothing
test('the only episode put in the trash: none open afterwards; the history with no episode open shows nothing', async ({ page, gh }) => {
  await openWork(page);
  await page.getByRole('button', { name: '‹ 作品' }).click();
  await openRepo(page, 'author/other');
  await expect(page.locator('#save-state')).toHaveText('話がありません。「＋ 話を追加」で追加してください');
  await page.getByRole('button', { name: 'この話の履歴' }).click();
  await expect(page.locator('#versions')).toBeHidden();
  await page.getByRole('button', { name: '＋ 話を追加' }).click();
  await expect(page.locator('#episode-title')).toHaveValue('新しい話');
  page.once('dialog', d => void d.accept());
  await page.getByRole('button', { name: 'この話を削除' }).click();
  await expect(page.locator('#toast')).toHaveText('削除しました（_trash/ に移動。送るまではこの端末だけの変更です）');
  await expect(page.locator('#save-state')).toHaveText('話がありません。「＋ 話を追加」で追加してください');
  await expect(page.locator('#episode-title')).toHaveValue('');
});

// FR-TOC-05: a chapter given a name that a file there already has: said, nothing renamed
test('a chapter renamed to a name a file already has: said, nothing renamed', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': BY_NAME, 'chapters/03_坂': 'ファイル\n' });
  await openWork(page, 'first');
  await page.getByRole('button', { name: '並べ替え' }).click();
  page.once('dialog', d => void d.accept('坂'));
  await page.getByRole('button', { name: '章の題名を変更', exact: true }).click();
  await expect(page.locator('#toast')).toHaveText('同じ名前があります');
  await expect(page.locator('#tree .node.chapter .t')).toHaveText('part');
  await expect(page.locator('#send')).toBeDisabled();
  // renamed with its episode open: the episode followed where it went
  await page.getByRole('button', { name: '完了' }).click();
  await page.locator('#tree .node', { hasText: 'third' }).click();
  await page.getByRole('button', { name: '並べ替え' }).click();
  page.once('dialog', d => void d.accept('坂道'));
  await page.getByRole('button', { name: '章の題名を変更', exact: true }).click();
  await expect(page.locator('#tree .node.active')).toHaveAttribute('data-path', 'chapters/03_坂道/01_third.md');
  await expect(page.locator('#body')).toHaveValue(WORK_FILES['chapters/03_part/01_third.md']);
});

// FR-TOC-05: a heading renamed (title = "heading"): written into the episode as a draft (on top of what was typed);
// renamed back, nothing left to send
test('a title in the heading renamed on top of what was typed, and back: the draft follows; nothing left to send', async ({ page, gh }) => {
  await openWork(page);
  await page.locator('#episode-title').fill('朝');
  await page.locator('#episode-title').press('Enter');
  await expect(page.locator('#body')).toHaveValue('# 第1話 朝\n\n朝が来た。\n');
  await expect(page.locator('#send')).toHaveText('送る（1）');
  await page.locator('#episode-title').fill('はじまり');
  await page.locator('#episode-title').press('Enter');
  await expect(page.locator('#body')).toHaveValue(WORK_FILES['chapters/01_first.md']);
  await expect(page.locator('#send')).toBeDisabled();
  await page.locator('#body').fill('# 第1話 はじまり\n\n書いた\n');
  await page.locator('#episode-title').fill('昼');
  await page.locator('#episode-title').press('Enter');
  await expect(page.locator('#body')).toHaveValue('# 第1話 昼\n\n書いた\n');
  await expect(page.locator('#send')).toHaveText('送る（1）');
});

// FR-TOC-05, FR-SAVE-04: an episode renamed (its title in [titles], which follows it), read again: the moved file shown
// with its text; changed elsewhere, the rename and its key given up, the text kept
test('a rename with its key in [titles]: read again, shown with its text; changed elsewhere, given up with its key', async ({ page, gh, work }) => {
  work.push({ 'novel.toml': `${BY_NAME}\n[titles]\n"01_first.md" = "最初"\n` });
  await openWork(page, '最初');
  await page.locator('#episode-title').fill('始まり');
  await page.locator('#episode-title').press('Enter');
  await expect(page.locator('#tree .node.active')).toHaveAttribute('data-path', 'chapters/01_始まり.md');
  await page.locator('#reload-work').click();
  await expect(page.locator('#sync-state')).toHaveText(/GitHub から読みました/);
  await expect(page.locator('#body')).toHaveValue(WORK_FILES['chapters/01_first.md']);
  work.push({ 'chapters/01_first.md': 'ほかで\n' });
  await page.locator('#reload-work').click();
  await expect(page.locator('#sync-state')).toHaveText(/名前の変更・削除・並べ替えを取り消しました/);
  await expect(page.locator('#tree .node.episode').first()).toHaveAttribute('data-path', 'chapters/01_first.md');
  await expect(page.locator('#send')).toBeDisabled();
});
