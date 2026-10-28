// Episodes and notes deleted, moved, renamed or renumbered elsewhere (another device, GitHub) while they are written
// here: what was written goes into the same episode or note where it is now (FR-TOC-04, FR-NOTE-05); one deleted (put
// in _trash/) is never put back where it was, nor into a new file made there: it is refused, stays on the device, is
// said, and the author chooses what to do with it (as the server version refuses such a save: FR-TOC-06, FR-NOTE-06)
import { test, expect, openWork, stored, WORK_FILES } from './lib/test.mjs';
import { OTHER_DEVICE_MARK } from '../../lib/merge.js';

// notes of the work (made up for the tests)
const NOTES = {
  'novel.toml': `${WORK_FILES['novel.toml']}\n\n[notes]\ndir = "notes"\n`,
  'notes/world.md': '# 世界観\n\n空は青い。\n',
  'notes/キャラ/alice.md': '# アリス\n',
};

/** @param {import('@playwright/test').Page} page the app brought in front: the work read in when it moved */
const inFront = page => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
// the texts set aside on the device, by path
/** @param {import('@playwright/test').Page} page */
const aside = async page => (await stored(page, 'drafts')).filter(d => d.parked).map(d => [d.path, d.text]);

// FR-TOC-06, FR-SAVE-07, FR-SAVE-09: the episode written here put in _trash/ elsewhere: what was written is refused (not
// put back where the episode was), stays on the device (opened again too), is said, and is put at the end of the
// episode open when the author chooses it
test('an episode put in _trash/ elsewhere while written here: not sent, not put back; kept and shown; put in the text open', async ({ page, gh, work }) => {
  await openWork(page);
  await page.locator('#tree .node', { hasText: '駅で' }).click();
  await page.locator('#body').fill('# 第2話 駅で\n\nここで書いた続き\n');
  work.push({ 'chapters/02_second.md': null, '_trash/20261001-000000/chapters/02_second.md': WORK_FILES['chapters/02_second.md'] });
  const head = work.refs.main;
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^「第2話 駅で」は、ほかの所で削除されたか、別のファイルに替わっていたので、書いた文章を送らずに/);
  expect(work.refs.main).toBe(head);
  expect(work.text('chapters/02_second.md')).toBeUndefined();
  // the episode open gone: the one before it opened, the trash as it is
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await expect(page.locator('#tree .node', { hasText: '駅で' })).toHaveCount(0);
  await expect(page.locator('#send')).toBeDisabled();
  await expect.poll(() => aside(page)).toEqual([['chapters/02_second.md', '# 第2話 駅で\n\nここで書いた続き\n']]);
  // opened again: still kept, still not in the table of contents
  await page.reload();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  await expect(page.locator('#tree .node', { hasText: '駅で' })).toHaveCount(0);
  await page.getByRole('button', { name: '未送信の一覧' }).click();
  await expect(page.locator('#unsent .card b')).toHaveText('chapters/02_second.md');
  await expect(page.locator('#unsent .card .version-text')).toHaveValue('# 第2話 駅で\n\nここで書いた続き\n');
  await page.getByRole('button', { name: '開いている話の末尾に挿入' }).click();
  await expect(page.locator('#unsent')).toBeHidden();
  const put = `${WORK_FILES['chapters/01_first.md']}\n\n――― 未送信の書きかけ（chapters/02_second.md）―――\n\n# 第2話 駅で\n\nここで書いた続き\n\n`;
  await expect(page.locator('#body')).toHaveValue(put);
  await expect.poll(() => aside(page)).toEqual([]);
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/01_first.md')).toBe(put);
  expect(work.text('_trash/20261001-000000/chapters/02_second.md')).toBe(WORK_FILES['chapters/02_second.md']);
  expect(work.text('chapters/02_second.md')).toBeUndefined();
});

// A work whose episodes are named by their numbers only (naming = "number": 01.md, 02.md, the titles in novel.toml)
/** @param {Record<string, string>} titles */
const numbered = titles => ({
  'novel.toml': [
    'title = "試験の作品"',
    '',
    '[manuscript]',
    'dir = "chapters"',
    'files = "*.md"',
    'naming = "number"',
    '',
    '[titles]',
    ...Object.entries(titles).map(([p, t]) => `"${p}" = "${t}"`),
    '',
  ].join('\n'),
});

// FR-TOC-04, FR-TOC-06: episodes named by numbers, renumbered elsewhere (01.md and 02.md change places): what was
// written in one goes into it where it is now, never into the other that took its path, and the episode open follows
// it; put in _trash/ and a new one added at its number: never put into the new one. Both when sent, and when the work
// is read in first
test('numbered episodes renumbered elsewhere: written into the same one where it is now; put in _trash/ and another added at the number: never into the other one', async ({
  page,
  gh,
  work,
}) => {
  /** @type {Record<string, string | null>} */
  const files = Object.fromEntries(Object.keys(WORK_FILES).map(p => [p, null]));
  work.push({ ...files, ...numbered({ '01.md': '一の話', '02.md': '二の話' }), 'chapters/01.md': '一の本文\n', 'chapters/02.md': '二の本文\n' });
  await openWork(page, '一の話');
  await page.locator('#body').fill('一の本文\n一の続き\n');
  // reordered elsewhere: 一 is 02.md now, 二 01.md
  work.push({ ...numbered({ '01.md': '二の話', '02.md': '一の話' }), 'chapters/01.md': '二の本文\n', 'chapters/02.md': '一の本文\n' });
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect([work.text('chapters/01.md'), work.text('chapters/02.md')]).toEqual(['二の本文\n', '一の本文\n一の続き\n']);
  // the episode open went with it: 一, at 02.md now
  await expect(page.locator('#episode-title')).toHaveValue('一の話');
  await expect(page.locator('#body')).toHaveValue('一の本文\n一の続き\n');
  expect(await aside(page)).toEqual([]);
  // reordered back elsewhere while 一 is written again: read in, the text goes with it (to 01.md), and is sent there
  await page.locator('#body').fill('一の本文\n一の続き\n三行目\n');
  work.push({ ...numbered({ '01.md': '一の話', '02.md': '二の話' }), 'chapters/01.md': '一の本文\n一の続き\n', 'chapters/02.md': '二の本文\n' });
  await inFront(page);
  await expect(page.locator('#toast')).toHaveText('ほかの端末の更新を読み込みました（一の話、二の話）');
  await expect(page.locator('#episode-title')).toHaveValue('一の話');
  await expect(page.locator('#body')).toHaveValue('一の本文\n一の続き\n三行目\n');
  await expect.poll(async () => (await stored(page, 'drafts')).map(d => d.path)).toEqual(['chapters/01.md']);
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect([work.text('chapters/01.md'), work.text('chapters/02.md')]).toEqual(['一の本文\n一の続き\n三行目\n', '二の本文\n']);
  // 一 written again (01.md), then put in _trash/ elsewhere and a new episode added at 01.md: read in, set aside
  await page.locator('#body').fill('一の本文\nもう一度\n');
  work.push({
    ...numbered({ '01.md': '新しい話', '02.md': '二の話' }),
    'chapters/01.md': '新しい話の本文\n',
    '_trash/20261002-000000/chapters/01.md': '一の本文\n一の続き\n三行目\n',
  });
  await inFront(page);
  await expect(page.locator('#sync-state')).toHaveText(/^「chapters\/01\.md」は、ほかの所で削除されたか/);
  await expect(page.locator('#episode-title')).toHaveValue('新しい話');
  await expect(page.locator('#body')).toHaveValue('新しい話の本文\n');
  await expect(page.locator('#send')).toBeDisabled();
  await expect.poll(() => aside(page)).toEqual([['chapters/01.md', '一の本文\nもう一度\n']]);
  expect(work.text('chapters/01.md')).toBe('新しい話の本文\n');
  // sent by the author: beside the new episode's text (said, and chosen)
  await page.getByRole('button', { name: '未送信の一覧' }).click();
  await page.locator('#unsent [data-unpark-send="0"]').click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました/);
  await expect(page.locator('#unsent')).toBeHidden();
  await expect.poll(() => aside(page)).toEqual([]);
  expect(work.text('chapters/01.md')).toBe(`一の本文\nもう一度\n\n${OTHER_DEVICE_MARK}\n\n新しい話の本文\n`);
});

// FR-TOC-04: two episodes written here, swapped elsewhere (renumbered): each text goes into its own episode, where it
// is now; what is typed in one while they are sent goes with it, and stays to be sent
test('two episodes written here and swapped elsewhere: each text into its own one; typed meanwhile, kept with it', async ({ page, context, gh, work }) => {
  /** @type {Record<string, string | null>} */
  const files = Object.fromEntries(Object.keys(WORK_FILES).map(p => [p, null]));
  work.push({ ...files, ...numbered({ '01.md': '一の話', '02.md': '二の話' }), 'chapters/01.md': '一の本文\n', 'chapters/02.md': '二の本文\n' });
  await openWork(page, '一の話');
  await page.locator('#body').fill('一の本文\n一の続き\n');
  await page.locator('#tree .node', { hasText: '二の話' }).click();
  await page.locator('#body').fill('二の本文\n二の続き\n');
  await page.locator('#tree .node', { hasText: '一の話' }).click();
  work.push({ ...numbered({ '01.md': '二の話', '02.md': '一の話' }), 'chapters/01.md': '二の本文\n', 'chapters/02.md': '一の本文\n' });
  // (the branch moved by the send held while 一 is typed in)
  /** @type {() => void} */
  let release = () => {};
  const held = new Promise(resolve => {
    release = () => resolve(null);
  });
  let holding = false;
  await context.route('https://api.github.com/**', async route => {
    if (route.request().method() === 'PATCH') {
      holding = true;
      await held;
    }
    return route.fallback();
  });
  await page.getByRole('button', { name: '送る（2）' }).click();
  await expect.poll(() => holding).toBe(true);
  await page.locator('#body').fill('一の本文\n一の続き\n送る間に\n');
  release();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect([work.text('chapters/01.md'), work.text('chapters/02.md')]).toEqual(['二の本文\n二の続き\n', '一の本文\n一の続き\n']);
  // 一 open where it is now, what was typed meanwhile kept to be sent there
  await expect(page.locator('#episode-title')).toHaveValue('一の話');
  await expect(page.locator('#body')).toHaveValue('一の本文\n一の続き\n送る間に\n');
  expect(await aside(page)).toEqual([]);
  await expect.poll(async () => (await stored(page, 'drafts')).map(d => [d.path, d.text])).toEqual([['chapters/02.md', '一の本文\n一の続き\n送る間に\n']]);
  await page.getByRole('button', { name: '送る（1）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect([work.text('chapters/01.md'), work.text('chapters/02.md')]).toEqual(['二の本文\n二の続き\n', '一の本文\n一の続き\n送る間に\n']);
});

// FR-NOTE-05, FR-NOTE-06, FR-SAVE-09: a note renamed elsewhere (its file name) and a new note made with its old name:
// what was written goes into the note renamed, not into the new one; a note put in _trash/ elsewhere: not put back,
// unless the author sends it
test('a note renamed elsewhere, a new one under its name: written into the one renamed; a note put in _trash/: not put back unless the author says so', async ({
  page,
  gh,
  work,
}) => {
  work.push(NOTES);
  await openWork(page);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  await page.locator('#notes-list [data-note]', { hasText: 'アリス' }).click();
  await page.locator('#note-body').fill('# アリス\n\n剣を持つ。\n');
  await page.getByRole('button', { name: '‹ 一覧' }).click();
  await page.locator('#notes-list [data-note]', { hasText: '世界観' }).click();
  await page.locator('#note-body').fill('# 世界観\n\n海もある。\n');
  await page.getByRole('button', { name: '‹ 一覧' }).click();
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  work.push({
    'notes/キャラ/alice.md': '# アリス（新しい資料）\n',
    'notes/キャラ/alicia.md': NOTES['notes/キャラ/alice.md'],
    'notes/world.md': null,
    '_trash/20261003-000000/notes/world.md': NOTES['notes/world.md'],
  });
  await page.getByRole('button', { name: '送る（2）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^「世界観」は、ほかの所で削除されたか/);
  expect(work.text('notes/キャラ/alicia.md')).toBe('# アリス\n\n剣を持つ。\n');
  expect(work.text('notes/キャラ/alice.md')).toBe('# アリス（新しい資料）\n');
  expect(work.text('notes/world.md')).toBeUndefined();
  // the one put in _trash/, sent by the author: made again where it was (said, and chosen)
  await page.getByRole('button', { name: '未送信の一覧' }).click();
  await expect(page.locator('#unsent .card b')).toHaveText(['notes/world.md']);
  await page.locator('#unsent [data-unpark-send="0"]').click();
  await expect(page.locator('#unsent')).toBeHidden();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました/);
  expect(work.text('notes/world.md')).toBe('# 世界観\n\n海もある。\n');
});

// FR-TOC-04, FR-NOTE-05: renamed elsewhere as the app renames (an episode titled by its heading: the heading; a note:
// its heading and its file name) while written here: what was written goes into it, under the name given there; the
// note open follows it; another note made under the old name elsewhere is not written into
test('an episode and a note renamed elsewhere (the heading, the file name): written into them under the new name; the note open follows', async ({
  page,
  gh,
  work,
}) => {
  work.push(NOTES);
  await openWork(page);
  await page.locator('#body').fill('# 第1話 はじまり\n\n朝が来た。\nここで書いた。\n');
  await page.getByRole('button', { name: '資料', exact: true }).click();
  await page.locator('#notes-list [data-note]', { hasText: '世界観' }).click();
  await page.locator('#note-body').fill('# 世界観\n\n空は青い。\n海もある。\n');
  work.push({
    'chapters/01_first.md': '# 第1話 夜明け\n\n朝が来た。\n',
    'notes/world.md': '# 世界観\n\n古い名前で作った別の資料。\n',
    'notes/setting.md': '# 舞台\n\n空は青い。\n',
  });
  await inFront(page);
  await expect(page.locator('#toast')).toHaveText('ほかの端末の更新を読み込みました（はじまり）');
  // (the note open is the one renamed, written on as it was)
  await expect(page.locator('#note-body')).toHaveValue('# 世界観\n\n空は青い。\n海もある。\n');
  await page.locator('#note-body').fill('# 世界観\n\n空は青い。\n海もある。\n山もある。\n');
  await expect
    .poll(async () => (await stored(page, 'drafts')).map(d => [d.path, d.text]))
    .toContainEqual(['notes/setting.md', '# 世界観\n\n空は青い。\n海もある。\n山もある。\n']);
  await page.getByRole('button', { name: '‹ 一覧' }).click();
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  await page.getByRole('button', { name: '送る（2）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました（/);
  expect(work.text('chapters/01_first.md')).toBe('# 第1話 夜明け\n\n朝が来た。\nここで書いた。\n');
  expect(work.text('notes/setting.md')).toBe('# 舞台\n\n空は青い。\n海もある。\n山もある。\n');
  expect(work.text('notes/world.md')).toBe('# 世界観\n\n古い名前で作った別の資料。\n');
  await expect(page.locator('#episode-title')).toHaveValue('夜明け');
  expect(await aside(page)).toEqual([]);
});

// FR-SAVE-09, FR-WORK-05: a text set aside counts as not sent: the work is not taken off the list until it is dealt
// with; the list of works sums the work up without it. Sending it where a draft is waiting, and 同期しない, say why
test('a text set aside: the work not taken off the list for it; summed up without it; sent only when nothing waits there', async ({ page, gh, work }) => {
  await openWork(page);
  await page.locator('#tree .node', { hasText: '駅で' }).click();
  await page.locator('#body').fill('# 第2話 駅で\n\n残る\n');
  work.push({ 'chapters/02_second.md': null, '_trash/20261001-000000/chapters/02_second.md': WORK_FILES['chapters/02_second.md'] });
  await inFront(page);
  await expect(page.locator('#sync-state')).toHaveText(/^「第2話 駅で」は、ほかの所で削除されたか/);
  /** @type {boolean[]} */
  const answers = [];
  page.on('dialog', d => void (answers.shift() ? d.accept() : d.dismiss()));
  // (送ってから削除: not sent, so not deleted)
  await page.getByRole('button', { name: 'この作品を削除' }).click();
  await page.getByRole('button', { name: '送ってから削除' }).click();
  await expect(page.locator('#toast')).toHaveText('送れなかったので、削除しませんでした。書いたものはこの端末に残っています');
  await expect(page.locator('#desk')).toBeVisible();
  // the list of works: what GitHub has, without the text set aside
  await page.getByRole('button', { name: '‹ 作品' }).click();
  await expect(page.locator('#works [data-repo="author/novel"]')).toContainText('2 話');
  await page.locator('#works [data-repo="author/novel"]').click();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  // a draft where it would go back: sent first
  await page.locator('#body').fill('# 第1話 はじまり\n\n待っている\n');
  work.push({ 'chapters/02_second.md': '# 第2話 駅で（新しく）\n' });
  await inFront(page);
  await expect(page.locator('#toast')).toHaveText('ほかの端末の更新を読み込みました（駅で（新しく））');
  await page.locator('#tree .node', { hasText: '駅で' }).click();
  await page.locator('#body').fill('# 第2話 駅で（新しく）\n\nここでも\n');
  await page.getByRole('button', { name: '未送信の一覧' }).click();
  await page.locator('#unsent [data-unpark-send="0"]').click();
  await expect(page.locator('#toast')).toHaveText('その場所には、まだ送っていない書きかけがあります。「送る」で送ってから、もう一度押してください');
  await page.locator('#close-unsent').click();
  // 同期しない: not offered
  await page.locator('#sync-mode').selectOption('off');
  await page.getByRole('button', { name: '未送信の一覧' }).click();
  await expect(page.locator('#unsent [data-unpark-send]')).toHaveCount(0);
  await expect(page.locator('#unsent [data-unpark-put]')).toHaveCount(1);
  answers.push(false);
  await page.locator('#unsent [data-unpark-drop="0"]').click();
  await expect.poll(() => aside(page)).toEqual([['chapters/02_second.md', '# 第2話 駅で\n\n残る\n']]);
  // given up by the author: kept in the history
  answers.push(true);
  await page.locator('#unsent [data-unpark-drop="0"]').click();
  await expect.poll(() => aside(page)).toEqual([]);
  expect((await stored(page, 'prefs')).flat().some(v => v?.text === '# 第2話 駅で\n\n残る\n')).toBe(true);
});

// FR-TOC-06, FR-SAVE-09: the only episode put in _trash/ elsewhere: none open, the text kept (not put in a text, none is
// open); sent by the author where a file that cannot be read is now: said, still kept
test('the only episode put in _trash/ elsewhere: none open, the text kept; sent where an unreadable file is now: said, kept', async ({ page, gh, work }) => {
  work.push({ 'chapters/02_second.md': null, 'chapters/03_part/01_third.md': null });
  await openWork(page);
  await page.locator('#body').fill('# 第1話 はじまり\n\nひとつだけ\n');
  work.push({ 'chapters/01_first.md': null, '_trash/20261005-000000/chapters/01_first.md': WORK_FILES['chapters/01_first.md'] });
  await inFront(page);
  await expect(page.locator('#sync-state')).toHaveText(/^「第1話 はじまり」は、ほかの所で削除されたか/);
  await expect(page.locator('#episode-title')).toHaveValue('');
  await expect(page.locator('#body')).toBeDisabled();
  await page.getByRole('button', { name: '未送信の一覧' }).click();
  await expect(page.locator('#unsent [data-unpark-put]')).toHaveCount(0);
  await page.locator('#close-unsent').click();
  // a file that is not UTF-8 put at its path elsewhere: not sent beside it
  work.push({ 'chapters/01_first.md': /** @type {any} */ (Buffer.from([0x82, 0xff, 0xff])) });
  await inFront(page);
  await expect(page.locator('#toast')).toHaveText('ほかの端末の更新を読み込みました（first）');
  await page.getByRole('button', { name: '未送信の一覧' }).click();
  await page.locator('#unsent [data-unpark-send="0"]').click();
  await expect(page.locator('#toast')).toHaveText(
    'その場所のファイルを読めないので、送れません（文字コードが UTF-8 ではないか、この端末にまだ読み込まれていません）',
  );
  await expect.poll(() => aside(page)).toEqual([['chapters/01_first.md', '# 第1話 はじまり\n\nひとつだけ\n']]);
});

// FR-SAVE-08: the open episode read in while its title is being typed: the text follows GitHub, the title typed stays
test('read in while the episode’s title is typed: the text follows GitHub, the title typed stays', async ({ page, gh, work }) => {
  await openWork(page);
  await page.locator('#episode-title').fill('はじまりの朝');
  work.push({ 'chapters/01_first.md': '# 第1話 はじまり\n\nほかで書いた。\n' });
  await inFront(page);
  await expect(page.locator('#body')).toHaveValue('# 第1話 はじまり\n\nほかで書いた。\n');
  await expect(page.locator('#episode-title')).toHaveValue('はじまりの朝');
});
