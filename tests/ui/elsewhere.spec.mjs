// Episodes and notes deleted, moved or renumbered elsewhere (another device, GitHub) while they are written here: what
// was written is never put back where the file was taken from, nor into the file that took its path. It is refused,
// stays on the device, is said, and the author chooses what to do with it (as the server version refuses such a save)
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
  await expect(page.locator('#sync-state')).toHaveText(
    /^「第2話 駅で」は、ほかの所で削除されたか、動かされたか、別のファイルに替わっていたので、書いた文章を送らずに/,
  );
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
  await expect(page.locator('#unsent .parked b')).toHaveText('chapters/02_second.md');
  await expect(page.locator('#unsent .parked-text')).toHaveValue('# 第2話 駅で\n\nここで書いた続き\n');
  await page.getByRole('button', { name: '開いている話の末尾に入れる' }).click();
  await expect(page.locator('#unsent')).toBeHidden();
  const put = `${WORK_FILES['chapters/01_first.md']}\n\n――― 未送信の書きかけ（第2話 駅で）―――\n\n# 第2話 駅で\n\nここで書いた続き\n\n`;
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
// written in one is never put into the other that took its path; put in _trash/ and a new one added at its number:
// never put into the new one. Both when sent, and when the work is read in first
test('numbered episodes renumbered, or put in _trash/ and another added at the number, elsewhere: never written into the other one', async ({
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
  await expect(page.locator('#sync-state')).toHaveText(/^「chapters\/01\.md」は、ほかの所で削除されたか、動かされたか、別のファイルに替わっていたので/);
  expect([work.text('chapters/01.md'), work.text('chapters/02.md')]).toEqual(['二の本文\n', '一の本文\n']);
  // the open episode's path shows what is there now: 二
  await expect(page.locator('#episode-title')).toHaveValue('二の話');
  await expect(page.locator('#body')).toHaveValue('二の本文\n');
  // 一 written again (02.md), then put in _trash/ elsewhere and a new episode added at 02.md: read in, set aside
  await page.locator('#tree .node', { hasText: '一の話' }).click();
  await page.locator('#body').fill('一の本文\nもう一度\n');
  work.push({
    ...numbered({ '01.md': '二の話', '02.md': '新しい話' }),
    'chapters/02.md': '新しい話の本文\n',
    '_trash/20261002-000000/chapters/02.md': '一の本文\n',
  });
  await inFront(page);
  await expect(page.locator('#sync-state')).toHaveText(/^「chapters\/02\.md」は、ほかの所で削除されたか/);
  await expect(page.locator('#episode-title')).toHaveValue('新しい話');
  await expect(page.locator('#body')).toHaveValue('新しい話の本文\n');
  await expect(page.locator('#send')).toBeDisabled();
  await expect
    .poll(() => aside(page))
    .toEqual([
      ['chapters/01.md', '一の本文\n一の続き\n'],
      ['chapters/02.md', '一の本文\nもう一度\n'],
    ]);
  expect(work.text('chapters/02.md')).toBe('新しい話の本文\n');
  // given up by the author (kept in the history), one by one
  page.on('dialog', d => void d.accept());
  await page.getByRole('button', { name: '未送信の一覧' }).click();
  await page.locator('#unsent [data-unpark-drop="0"]').click();
  await expect(page.locator('#unsent .parked-text')).toHaveValue('一の本文\nもう一度\n');
  await page.locator('#unsent [data-unpark-drop="0"]').click();
  await expect(page.locator('#unsent')).toBeHidden();
  await expect(page.locator('#open-unsent')).toBeHidden();
  await expect.poll(() => aside(page)).toEqual([]);
  expect((await stored(page, 'prefs')).flat().some(v => v?.text === '一の本文\n一の続き\n')).toBe(true);
});

// FR-NOTE-05, FR-NOTE-06, FR-SAVE-09: a note renamed elsewhere and a new note made with its old name: what was written
// is not put into the new note, unless the author sends it beside the new one's text; a note put in _trash/
// elsewhere: not put back
test('a note renamed elsewhere, a new one under its name: not written into it unless the author says so; a note put in _trash/: not put back', async ({
  page,
  gh,
  work,
}) => {
  work.push(NOTES);
  await openWork(page);
  await page.getByRole('button', { name: '資料', exact: true }).click();
  await page.locator('#notes-list [data-note]', { hasText: 'アリス' }).click();
  await page.getByLabel('資料の本文').fill('# アリス\n\n剣を持つ。\n');
  await page.getByRole('button', { name: '‹ 一覧' }).click();
  await page.locator('#notes-list [data-note]', { hasText: '世界観' }).click();
  await page.getByLabel('資料の本文').fill('# 世界観\n\n海もある。\n');
  await page.getByRole('button', { name: '‹ 一覧' }).click();
  await page.getByRole('button', { name: '‹ 原稿へ' }).click();
  work.push({
    'notes/キャラ/alice.md': '# アリス（新しい資料）\n',
    'notes/キャラ/alicia.md': NOTES['notes/キャラ/alice.md'],
    'notes/world.md': null,
    '_trash/20261003-000000/notes/world.md': NOTES['notes/world.md'],
  });
  await page.getByRole('button', { name: '送る（2）' }).click();
  await expect(page.locator('#sync-state')).toHaveText(/^「アリス」「世界観」は、ほかの所で削除されたか/);
  expect(work.text('notes/キャラ/alice.md')).toBe('# アリス（新しい資料）\n');
  expect(work.text('notes/world.md')).toBeUndefined();
  // sent by the author: beside the text there now
  await page.getByRole('button', { name: '未送信の一覧' }).click();
  await expect(page.locator('#unsent .parked b')).toHaveText(['notes/キャラ/alice.md', 'notes/world.md']);
  await page.locator('#unsent [data-unpark-send="0"]').click();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました/);
  expect(work.text('notes/キャラ/alice.md')).toBe(`# アリス\n\n剣を持つ。\n\n${OTHER_DEVICE_MARK}\n\n# アリス（新しい資料）\n`);
  expect(work.text('notes/キャラ/alicia.md')).toBe(NOTES['notes/キャラ/alice.md']);
  // the one put in _trash/, sent by the author: made again where it was (said, and chosen)
  await expect(page.locator('#unsent .parked b')).toHaveText(['notes/world.md']);
  await page.locator('#unsent [data-unpark-send="0"]').click();
  await expect(page.locator('#unsent')).toBeHidden();
  await expect(page.locator('#sync-state')).toHaveText(/^送りました/);
  expect(work.text('notes/world.md')).toBe('# 世界観\n\n海もある。\n');
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
  answers.push(true, true);
  await page.getByRole('button', { name: '一覧から外す' }).click();
  await expect(page.locator('#toast')).toHaveText('送れなかったので、一覧から外しませんでした。書いたものはこの端末に残っています');
  await expect(page.locator('#desk')).toBeVisible();
  // the list of works: what GitHub has, without the text set aside
  await page.getByRole('button', { name: 'ほかの作品' }).click();
  await expect(page.locator('#repo-list [data-repo="author/novel"]')).toContainText('2 話');
  await page.locator('#repo-list [data-repo="author/novel"]').click();
  await expect(page.locator('#episode-title')).toHaveValue('はじまり');
  // a draft where it would go back: sent first
  await page.locator('#body').fill('# 第1話 はじまり\n\n待っている\n');
  work.push({ 'chapters/02_second.md': '# 第2話 駅で（新しく）\n' });
  await inFront(page);
  await expect(page.locator('#toast')).toHaveText('ほかの所での変更を読み込みました');
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
  await expect(page.locator('#toast')).toHaveText('ほかの所での変更を読み込みました');
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
