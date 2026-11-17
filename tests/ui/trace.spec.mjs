// The traces of the models in formal/ (NFR-MAINT-03): the screen runs the models' scenes, and writes down its steps
// (ui/trace.js); tools/trace_check.mjs checks that the models take them, line after line, and that every step of each
// model is taken by some trace. One episode, empty at first; a key types one letter of a, b, c, and elsewhere (another
// device, GitHub) writes x or y at its end (the models' letters: tools/trace/tla.mjs)
//   Send (formal/Send.tla): a send on a branch that moved on (the same line written there: held back, both versions
//     side by side, sent once tidied; other lines: put together and sent), read again when it moved between reading
//     and moving it, typed during a send, a send that fails, one whose answer is lost, read in while a word is being
//     converted
//   Rebase (formal/Rebase.tla): the episode renamed, its file changed elsewhere before it is sent: not sent, given up
//     when read again, the text typed in it kept; renamed and sent, typed during the send
import { test, expect, openWork, FakeRepo } from './lib/test.mjs';
import { follow } from './lib/trace.mjs';
import { END_MARK, MINE_MARK, OTHER_DEVICE_MARK } from '../../lib/merge.js';

const EPISODE = 'chapters/01_one.md';
const RENAMED = 'chapters/01_two.md';
// a work with its titles in the file names (a rename moves the file), one empty episode
test.use({
  // eslint-disable-next-line no-empty-pattern
  work: async ({}, /** @type {any} */ use) =>
    use(new FakeRepo('author/novel', { 'novel.toml': 'title = "試験の作品"\n\n[manuscript]\ndir = "chapters"\nfiles = "*.md"\n', [EPISODE]: '' })),
});

/** @param {import('@playwright/test').Page} page the episode's text, as the box shows it */
const box = page => page.locator('#body');
/** @param {import('@playwright/test').Page} page 「送る」 only when pressed (no send of 自動 in the scenes) */
async function byHand(page) {
  await page.locator('#sync-mode').selectOption('manual');
}
/** @param {import('@playwright/test').Page} page the app back in front: the branch read in (readIn) */
const front = page => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
/** @param {FakeRepo} work @param {string} path @param {string} letter written elsewhere at the end of the file */
const elsewhere = (work, path, letter) => work.push({ [path]: `${work.text(path) ?? ''}${letter}` });
/** @param {string} mine @param {string} theirs one place with both versions side by side (their lines) */
const sides = (mine, theirs) => `${MINE_MARK}\n${mine}${OTHER_DEVICE_MARK}\n${theirs}${END_MARK}\n`;
/** @param {import('@playwright/test').Page} page the caret at the start of the text box */
const atStart = page => box(page).evaluate(a => /** @type {HTMLTextAreaElement} */ (a).setSelectionRange(0, 0));
// a work whose one episode is three empty lines: a letter typed at its start and one written at its end elsewhere
// are in other lines
const LINES = {
  // eslint-disable-next-line no-empty-pattern
  work: async ({}, /** @type {any} */ use) =>
    use(new FakeRepo('author/novel', { 'novel.toml': 'title = "試験の作品"\n\n[manuscript]\ndir = "chapters"\nfiles = "*.md"\n', [EPISODE]: '\n\n' })),
};
test.describe('Send', () => {
  // FR-SAVE-03, FR-SAVE-04, FR-SAVE-05, DESK-SAVE-01, FR-GH-05, NFR-MAINT-03
  test('moved on between reading and moving it, the same line written there: held back, typed during the send stays; side by side, tidied and sent', async ({
    page,
    gh,
    work,
    browserName,
  }) => {
    const t = await follow(page, work, { model: 'Send', name: 'send-moved-on', browser: browserName, paths: [EPISODE] });
    await openWork(page, 'one');
    await byHand(page);
    await box(page).press('a');
    // the branch moves on between the send's reading it and its moving it (422): read again, the same line written
    // there: nothing sent; a letter typed while the send is on its way stays as the draft
    let first = true;
    await page.route('**/git/refs/heads/main', async route => {
      if (route.request().method() !== 'PATCH' || !first) return route.fallback();
      first = false;
      elsewhere(work, EPISODE, 'x');
      t.step('Write');
      await box(page).press('b');
      await expect.poll(() => t.has('Type')).toBe(true);
      return route.fallback();
    });
    await page.getByRole('button', { name: '送る（1）' }).click();
    await expect(page.locator('#toast')).toHaveText(/^「one」は、ほかの端末での変更と同じ所を書き換えていたため/);
    await expect.poll(() => t.has('Sent')).toBe(true);
    expect(work.text(EPISODE)).toBe('x');
    await expect(box(page)).toHaveValue('ab');
    // sent again: held back again, the two versions side by side in the draft, on what GitHub has now
    await page.getByRole('button', { name: '送る（1）' }).click();
    await expect.poll(() => t.lines.filter(l => /** @type {any} */ (l).a === 'Sent').length).toBe(2);
    await expect(box(page)).toHaveValue(sides('ab\n', 'x\n'));
    expect(work.text(EPISODE)).toBe('x');
    // tidied (the lines that mark the place taken out, in one input): sent
    await box(page).evaluate(a => {
      /** @type {HTMLTextAreaElement} */ (a).value = 'ab\nx';
      a.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect.poll(() => t.lines.filter(l => /** @type {any} */ (l).a === 'Type').length).toBe(3);
    await page.getByRole('button', { name: '送る（1）' }).click();
    await expect.poll(() => t.lines.filter(l => /** @type {any} */ (l).a === 'Sent').length).toBe(3);
    expect(work.text(EPISODE)).toBe('ab\nx');
    t.write();
  });

  // FR-SAVE-01, FR-SAVE-07, NFR-MAINT-03
  test('a send that fails, and one whose answer is lost: the draft kept; read in, sent once', async ({ page, gh, work, browserName }) => {
    const t = await follow(page, work, { model: 'Send', name: 'send-failed', browser: browserName, paths: [EPISODE] });
    await openWork(page, 'one');
    await byHand(page);
    await box(page).press('a');
    gh.fail = (method, path) => (method === 'PATCH' && path.includes('/git/refs/') ? 500 : undefined);
    await page.getByRole('button', { name: '送る（1）' }).click();
    await expect(page.locator('#sync-state')).toHaveText(/^送れませんでした/);
    gh.fail = null;
    // the branch moved by the send, but its answer lost on the way back
    let lost = true;
    await page.route('**/git/refs/heads/main', async route => {
      if (route.request().method() !== 'PATCH' || !lost) return route.fallback();
      lost = false;
      await gh.answer(
        /** @type {any} */ ({
          request: () => route.request(),
          fulfill: async () => {
            t.step('Move');
            await route.abort('failed');
          },
        }),
      );
    });
    await page.getByRole('button', { name: '送る（1）' }).click();
    await expect.poll(() => t.lines.filter(l => /** @type {any} */ (l).a === 'Failed').length).toBe(2);
    expect(work.text(EPISODE)).toBe('a');
    // read in: the draft stays; sent again, the same text is no conflict
    await front(page);
    await expect.poll(() => t.has('ReadIn')).toBe(true);
    await page.getByRole('button', { name: '送る（1）' }).click();
    await expect.poll(() => t.has('Sent')).toBe(true);
    expect(work.text(EPISODE)).toBe('a');
    await expect(page.locator('#send')).toHaveText('送る');
    t.write();
  });

  // FR-SAVE-01, FR-SAVE-08, NFR-MAINT-03: a word being converted is kept as the draft; the branch read in meanwhile
  // does not write over the box (before, the word was lost: formal/Send_now.cfg)
  test('read in while a word is being converted: the word stays, and is sent with what was written elsewhere', async ({ page, gh, work, browserName }) => {
    test.skip(browserName !== 'chromium', 'WebKit では試さない: 入力メソッドの変換は Chrome の CDP（Input.imeSetComposition）でだけ起こせる');
    const t = await follow(page, work, { model: 'Send', name: 'send-composing', browser: browserName, paths: [EPISODE] });
    await openWork(page, 'one');
    await byHand(page);
    await box(page).focus();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: 'a', selectionStart: 1, selectionEnd: 1 });
    await expect.poll(() => t.has('Compose')).toBe(true);
    elsewhere(work, EPISODE, 'x');
    t.step('Write');
    await front(page);
    await expect.poll(() => t.has('ReadIn')).toBe(true);
    await expect(box(page)).toHaveValue('a');
    await cdp.send('Input.insertText', { text: 'a' });
    await expect.poll(() => t.has('Converted')).toBe(true);
    await page.getByRole('button', { name: '送る（1）' }).click();
    await expect.poll(() => t.has('Sent')).toBe(true);
    // (the same line written elsewhere: held back, side by side)
    expect(work.text(EPISODE)).toBe('x');
    await expect(box(page)).toHaveValue(sides('a\n', 'x\n'));
    t.write();
  });

  test.describe('other lines', () => {
    test.use(LINES);
    // FR-SAVE-04, FR-SAVE-06, FR-SAVE-08, NFR-MAINT-03: written there in other lines: put together and sent; typed during
    // the send, put in what went
    test('moved on before the send, other lines written there: put together and sent; typed during the send, put in it', async ({
      page,
      gh,
      work,
      browserName,
    }) => {
      const t = await follow(page, work, { model: 'Send', name: 'send-merged', browser: browserName, paths: [EPISODE] });
      await openWork(page, 'one');
      await byHand(page);
      await box(page).focus();
      await atStart(page);
      await box(page).press('a');
      elsewhere(work, EPISODE, 'x');
      t.step('Write');
      let first = true;
      await page.route('**/git/refs/heads/main', async route => {
        if (route.request().method() !== 'PATCH' || !first) return route.fallback();
        first = false;
        await box(page).press('b');
        await expect.poll(() => t.has('Type')).toBe(true);
        return route.fallback();
      });
      await page.getByRole('button', { name: '送る（1）' }).click();
      await expect(page.locator('#toast')).toHaveText(/^GitHub に送りました（[^）]*）。「one」は、ほかの端末での変更を取り込みました$/);
      await expect.poll(() => t.has('Sent')).toBe(true);
      expect(work.text(EPISODE)).toBe('a\n\nx\n');
      await expect(box(page)).toHaveValue('ab\n\nx\n');
      await page.getByRole('button', { name: '送る（1）' }).click();
      await expect.poll(() => t.lines.filter(l => /** @type {any} */ (l).a === 'Sent').length).toBe(2);
      expect(work.text(EPISODE)).toBe('ab\n\nx\n');
      t.write();
    });
  });
});

test.describe('Rebase', () => {
  test.describe('other lines', () => {
    test.use(LINES);
    // FR-TOC-05, FR-SAVE-04, NFR-MAINT-03: renamed here, written elsewhere: not sent; read again, the rename given up and
    // the text typed in it kept where the episode was; sent, put together with what was written there (in other lines)
    test('renamed here, changed elsewhere: not sent; given up when read again, the text typed kept', async ({ page, gh, work, browserName }) => {
      const t = await follow(page, work, { model: 'Rebase', name: 'rebase-overlapped', browser: browserName, paths: [EPISODE, RENAMED] });
      await openWork(page, 'one');
      await byHand(page);
      await box(page).focus();
      await atStart(page);
      await box(page).press('a');
      await page.locator('#episode-title').fill('two');
      await page.locator('#episode-title').press('Enter');
      await expect.poll(() => t.has('Rename')).toBe(true);
      // written elsewhere while the send reads the branch the first time: the send reads it again, and stops there
      let first = true;
      await page.route('**/git/refs/heads/main', async route => {
        if (route.request().method() !== 'PATCH' || !first) return route.fallback();
        first = false;
        elsewhere(work, EPISODE, 'x');
        t.step('Write');
        return route.fallback();
      });
      await page.getByRole('button', { name: /^送る（/ }).click();
      await expect(page.locator('#sync-state')).toHaveText(/が変わっていたので、送りませんでした/);
      await front(page);
      await expect.poll(() => t.has('ReadIn')).toBe(true);
      await expect(page.locator('#episode-title')).toHaveValue('one');
      await page.getByRole('button', { name: '送る（1）' }).click();
      await expect.poll(() => t.has('Sent')).toBe(true);
      expect(work.text(EPISODE)).toBe('a\n\nx\n');
      expect(work.text(RENAMED)).toBeUndefined();
      t.write();
    });
  });

  // FR-TOC-05, NFR-MAINT-03: renamed and sent (a send that fails first); typed during the send: kept, a draft where it
  // went. The episode is not renamed while a send is on its way (said)
  test('renamed and sent; typed during the send stays; no rename while a send is on its way', async ({ page, gh, work, browserName }) => {
    const t = await follow(page, work, { model: 'Rebase', name: 'rebase-sent', browser: browserName, paths: [EPISODE, RENAMED] });
    await openWork(page, 'one');
    await byHand(page);
    await page.locator('#episode-title').fill('two');
    await page.locator('#episode-title').press('Enter');
    await expect.poll(() => t.has('Rename')).toBe(true);
    gh.fail = (method, path) => (method === 'PATCH' && path.includes('/git/refs/') ? 500 : undefined);
    await page.getByRole('button', { name: /^送る（/ }).click();
    await expect(page.locator('#sync-state')).toHaveText(/^送れませんでした/);
    gh.fail = null;
    let first = true;
    await page.route('**/git/refs/heads/main', async route => {
      if (route.request().method() !== 'PATCH' || !first) return route.fallback();
      first = false;
      await box(page).press('b');
      await expect.poll(() => t.has('Type')).toBe(true);
      // (an operation while the send is on its way: refused, said)
      await page.locator('#episode-title').fill('three');
      await page.locator('#episode-title').press('Enter');
      await expect(page.locator('#toast')).toHaveText('送っている間は、話の追加・名前の変更・削除・並べ替えはできません。送り終わってからやり直してください');
      await expect(page.locator('#episode-title')).toHaveValue('two');
      return route.fallback();
    });
    await page.getByRole('button', { name: /^送る（/ }).click();
    await expect.poll(() => t.has('Sent')).toBe(true);
    expect(work.text(RENAMED)).toBe('');
    expect(work.text(EPISODE)).toBeUndefined();
    await expect(page.locator('#send')).toHaveText('送る（1）');
    await expect(box(page)).toHaveValue('b');
    t.write();
  });
});
