// Branches (FR-GH-09), what goes wrong or is given up: GitHub not answering when the branches are read, a branch not
// made, the picker closed, nothing to merge into, the merge not wanted after reading what it brings, merged elsewhere
// meanwhile, and a merge GitHub refuses for another reason
import { test, expect, openWork } from './lib/test.mjs';

// FR-GH-09, NFR-USE-01
test('choosing a branch: GitHub not answering said; closed or the same branch chosen, nothing changes; a branch GitHub does not make said', async ({
  page,
  gh,
  work,
}) => {
  await openWork(page);
  gh.fail = (method, path) => (method === 'GET' && path.endsWith('/branches') ? 500 : undefined);
  await page.getByRole('button', { name: /⎇ main/ }).click();
  await expect(page.locator('#toast')).toHaveText(/^ブランチを読めませんでした: .*test failure$/);
  gh.fail = null;
  // closed
  await page.getByRole('button', { name: /⎇ main/ }).click();
  await page.locator('#picker-close').click();
  await expect(page.locator('#picker')).toBeHidden();
  // the branch read now
  await page.getByRole('button', { name: /⎇ main/ }).click();
  await page.locator('#picker').getByRole('button', { name: 'main（いま）' }).click();
  await expect(page.locator('#picker')).toBeHidden();
  expect(gh.calls.filter(c => !c.startsWith('GET'))).toEqual([]);
  // GitHub refuses to make it
  gh.fail = (method, path) => (method === 'POST' && path.endsWith('/git/refs') ? 422 : undefined);
  await page.getByRole('button', { name: /⎇ main/ }).click();
  await page.locator('#picker-input').fill('second');
  await page.locator('#picker').getByRole('button', { name: '決定' }).click();
  await expect(page.locator('#toast')).toHaveText(/^ブランチを作れませんでした: .*test failure$/);
  expect(Object.keys(work.refs)).toEqual(['main']);
  await expect(page.getByRole('button', { name: /⎇ main/ })).toBeVisible();
});

// FR-GH-09, NFR-USE-01
test('merging: what is not sent said first, nothing sent when not wanted; GitHub not answering said; no other branch said; closed, nothing merged', async ({
  page,
  gh,
  work,
}) => {
  await openWork(page);
  await page.getByRole('button', { name: 'マージ' }).click();
  await expect(page.locator('#toast')).toHaveText('マージ先にできるブランチがありません');
  work.refs.draft = work.refs.main;
  gh.fail = (method, path) => (method === 'GET' && path.endsWith('/branches') ? 500 : undefined);
  await page.getByRole('button', { name: 'マージ' }).click();
  await expect(page.locator('#toast')).toHaveText(/^ブランチを読めませんでした: .*test failure$/);
  gh.fail = null;
  await page.getByRole('button', { name: 'マージ' }).click();
  await page.locator('#picker-close').click();
  await expect(page.locator('#picker')).toBeHidden();
  await page.locator('#body').fill('書きかけ\n');
  /** @type {string[]} */
  const said = [];
  page.once('dialog', d => {
    said.push(d.message());
    void d.dismiss();
  });
  await page.getByRole('button', { name: 'マージ' }).click();
  await page.locator('#picker').getByRole('button', { name: 'draft' }).click();
  await expect.poll(() => said.length).toBe(1);
  expect(said[0]).toContain('（まだ送っていない変更も、先に送ってから入れます）');
  await expect(page.locator('#send')).toHaveText('送る（1）');
  expect(gh.calls.filter(c => c.includes('/merges') || c.startsWith('PATCH'))).toEqual([]);
});

// FR-GH-09: what the merge brings read (a file that is not an episode too), and the merge given up; merged elsewhere
// between reading and merging; refused by GitHub for another reason than a conflict
test('a merge given up after reading what it brings; merged meanwhile; refused by GitHub', async ({ page, gh, work }) => {
  work.refs.draft = work.refs.main;
  work.push({ 'chapters/02_second.md': '# 第2話 駅で\n\n枝で書いた。\n', 'chapters/memo.txt': 'メモを書き直した\n' }, 'draft');
  await openWork(page);
  await page.getByRole('button', { name: /⎇ main/ }).click();
  await page.locator('#picker').getByRole('button', { name: 'draft' }).click();
  await expect(page.getByRole('button', { name: /⎇ draft/ })).toBeVisible();
  /** @type {string[]} */
  const said = [];
  page.once('dialog', d => {
    said.push(d.message());
    void d.dismiss();
  });
  await page.getByRole('button', { name: 'マージ' }).click();
  await page.locator('#picker').getByRole('button', { name: 'main' }).click();
  await expect.poll(() => said.length).toBe(1);
  expect(said[0]).toContain('話以外のファイル 1 件');
  expect(gh.calls.filter(c => c.includes('/merges'))).toEqual([]);
  // merged on GitHub while the author read it
  gh.before = (method, path) => {
    if (method === 'POST' && path.endsWith('/merges')) work.refs.main = work.refs.draft;
  };
  page.once('dialog', d => void d.accept());
  await page.getByRole('button', { name: 'マージ' }).click();
  await page.locator('#picker').getByRole('button', { name: 'main' }).click();
  await expect(page.locator('#toast')).toHaveText('main には、もう draft の内容が全部入っています');
  // refused for another reason
  gh.before = null;
  work.push({ 'chapters/02_second.md': '# 第2話 駅で\n\nもう一度。\n' }, 'draft');
  gh.fail = (method, path) => (method === 'POST' && path.endsWith('/merges') ? 500 : undefined);
  page.once('dialog', d => void d.accept());
  await page.getByRole('button', { name: 'マージ' }).click();
  await page.locator('#picker').getByRole('button', { name: 'main' }).click();
  await expect(page.locator('#toast')).toHaveText(/^マージできませんでした: .*（500）: test failure$/);
});
