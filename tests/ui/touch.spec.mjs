// NFR-USE-02: on an iPhone's screen, everything pressed is at least 44×44 (CSS px, the iPhone's pt): every control of
// every screen and dialog measured at an iPhone's width (390), as a finger presses it (touch)
import { test, expect, noPasskey, openWork, WORK_FILES } from './lib/test.mjs';

const TOML = `${WORK_FILES['novel.toml']}\n\n[notes]\ndir = "notes"\n`;
// notes of the work (made up for the tests): the plot, the characters, a note in a folder, a picture
const NOTES = {
  'novel.toml': TOML,
  'notes/plot.md': '# プロット\n\n# 大箱1：起\n\n## 第1話 はじまり\n朝が来る。\n## 中箱1-2：まだない話\nこれから。\n',
  'notes/characters.md': '# 登場人物\n\n## 黒崎零\n主人公。\n',
  'notes/キャラ/alice.md': '# アリス\n',
};

// The controls shown now smaller than 44×44: buttons, links, fields, the rows of the table of contents. A link in a
// sentence (WCAG's exception for inline links) and the text read in a preview are not controls
/** @param {import('@playwright/test').Page} page */
const small = page =>
  page.evaluate(() => {
    const controls = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"])';
    /** @param {Element} el */
    const shown = el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    };
    /** @param {Element} el */
    const inText = el => el.tagName === 'A' && el.closest('p, li, .preview, .plot-panel-body');
    return [...document.querySelectorAll(controls)]
      .filter(el => shown(el) && !inText(el))
      .map(el => {
        const r = el.getBoundingClientRect();
        return {
          control: el.id || el.className || el.tagName,
          text: (el.textContent ?? '').trim().slice(0, 16),
          w: Math.floor(r.width),
          h: Math.floor(r.height),
        };
      })
      .filter(c => c.w < 44 || c.h < 44);
  });
// a screen that comes only after a passkey or GitHub (パスキーで開く, the App installed): shown as it comes
/** @param {import('@playwright/test').Page} page @param {string} id */
const showOnly = (page, id) =>
  page.evaluate(id => {
    for (const s of document.querySelectorAll('body > section')) /** @type {HTMLElement} */ (s).hidden = s.id !== id;
  }, id);

// the table of contents (a drawer on a phone) opened or closed
/** @param {import('@playwright/test').Page} page @param {boolean} open */
async function toc(page, open) {
  if ((await page.locator('#desk.toc-open').count()) === Number(open)) return;
  if (open) await page.locator('#menu').click();
  else await page.locator('#scrim').click({ position: { x: 380, y: 400 } });
}

test.describe('on an iPhone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, actionTimeout: 10000 });

  test('NFR-USE-02: every control of every screen and dialog is at least 44×44', async ({ page, gh, work }) => {
    work.push(NOTES);
    work.refs.side = work.refs.main;
    // the first screen, the key file's form open too; パスキーで開く; the App to install
    await noPasskey(page);
    await page.goto('./');
    await page.locator('#app-key-details summary').click();
    expect(await small(page)).toEqual([]);
    for (const id of ['unlock', 'app-install']) {
      await showOnly(page, id);
      expect(await small(page), id).toEqual([]);
    }
    await openWork(page);
    // the desk; the table of contents open, リリース open, the order being changed
    expect(await small(page)).toEqual([]);
    await toc(page, true);
    await page.locator('.toc-more summary').click();
    expect(await small(page)).toEqual([]);
    await page.getByRole('button', { name: '並べ替え' }).click();
    expect(await small(page)).toEqual([]);
    await page.getByRole('button', { name: '完了' }).click();
    // the dialogs over the table of contents: the branches, the releases, the repository's name
    await page.getByRole('button', { name: /⎇ main/ }).click();
    await expect(page.locator('#picker')).toBeVisible();
    expect(await small(page)).toEqual([]);
    await page.locator('#picker-close').click();
    await page.getByRole('button', { name: 'リリース一覧' }).click();
    await expect(page.locator('#releases')).toBeVisible();
    expect(await small(page)).toEqual([]);
    await page.locator('#close-releases').click();
    await page.locator('#gh-rename').click();
    await expect(page.locator('#rename-repo')).toBeVisible();
    expect(await small(page)).toEqual([]);
    await page.locator('#close-rename-repo').click();
    await toc(page, false);
    // writing: the input bar over the keyboard
    await page.locator('#body').focus();
    await expect(page.locator('#kbar')).toBeVisible();
    expect(await small(page)).toEqual([]);
    await page.locator('#body').fill('# 第1話 はじまり\n\n書いた。\n');
    await page.locator('#body').blur();
    // the 中箱 over the text, the preview with the next episode at its end
    await page.locator('#plot-peek').click();
    await expect(page.locator('#plot-panel')).toBeVisible();
    expect(await small(page)).toEqual([]);
    await page.locator('#plot-peek').click();
    await page.locator('#toggle-preview').click();
    await expect(page.locator('#preview')).toBeVisible();
    expect(await small(page)).toEqual([]);
    await page.locator('#toggle-preview').click();
    // the history
    await page.locator('#open-history').click();
    await expect(page.locator('#versions')).toBeVisible();
    expect(await small(page)).toEqual([]);
    await page.locator('#close-versions').click();
    // the changes not sent, a text set aside among them (its episode put in _trash/ elsewhere)
    await toc(page, true);
    await page.locator('#tree .node', { hasText: '駅で' }).click();
    await page.locator('#body').fill('# 第2話 駅で\n\n残す。\n');
    work.push({ 'chapters/02_second.md': null, '_trash/20261001-000000/chapters/02_second.md': WORK_FILES['chapters/02_second.md'] });
    await toc(page, true);
    await page.getByRole('button', { name: '送る（2）' }).click();
    await expect(page.locator('#sync-state')).toHaveText(/^「第2話 駅で」は/);
    await toc(page, true);
    await page.getByRole('button', { name: '未送信の一覧' }).click();
    await expect(page.locator('#unsent .parked')).toBeVisible();
    expect(await small(page)).toEqual([]);
    await page.locator('#close-unsent').click();
    // the notices over the screen: the token refused (and a new one put in), the App's commits' author
    gh.tokens = ['new-test-token-not-real'];
    await toc(page, true);
    await page.getByRole('button', { name: '再読み込み' }).click();
    await expect(page.locator('#token-notice')).toBeVisible();
    await page.evaluate(() => {
      /** @type {HTMLElement} */ (document.getElementById('author-notice')).hidden = false;
    });
    expect(await small(page)).toEqual([]);
    await page.getByRole('button', { name: '新しいトークンを入れる' }).click();
    expect(await small(page)).toEqual([]);
    await page.getByLabel('新しいトークン', { exact: true }).fill('new-test-token-not-real');
    await page.getByRole('button', { name: 'パスキーで保管する' }).click();
    await expect(page.locator('#token-notice')).toBeHidden();
    await page.evaluate(() => {
      /** @type {HTMLElement} */ (document.getElementById('author-notice')).hidden = true;
    });
    // 資料: the list (a folder, the pictures), a note open with the input bar, its preview
    await toc(page, true);
    await page.getByRole('button', { name: '資料', exact: true }).click();
    await expect(page.locator('#notes-list [data-note]').first()).toBeVisible();
    await expect(page.locator('#images-list figure')).toHaveCount(1);
    expect(await small(page)).toEqual([]);
    await page.locator('#notes-list [data-note]', { hasText: 'アリス' }).click();
    await page.getByLabel('資料の本文').focus();
    await expect(page.locator('#note-kbar')).toBeVisible();
    expect(await small(page)).toEqual([]);
    await page.getByLabel('資料の本文').blur();
    await page.locator('#note-preview-toggle').click();
    expect(await small(page)).toEqual([]);
    await page.getByRole('button', { name: '‹ 一覧' }).click();
    await page.getByRole('button', { name: '‹ 原稿へ' }).click();
    // プロット (the tools of a box opened), キャラ, 記録
    await toc(page, true);
    await page.getByRole('button', { name: 'プロット', exact: true }).click();
    await page.locator('#plot-board [data-more-tools]').first().click();
    expect(await small(page)).toEqual([]);
    await page.getByRole('button', { name: '‹ 原稿へ' }).click();
    await toc(page, true);
    await page.getByRole('button', { name: 'キャラ', exact: true }).click();
    await expect(page.locator('#characters-board .pcard')).toHaveCount(1);
    expect(await small(page)).toEqual([]);
    await page.getByRole('button', { name: '‹ 原稿へ' }).click();
    await toc(page, true);
    await page.getByRole('button', { name: '記録', exact: true }).click();
    await expect(page.locator('#record-body h2').first()).toBeVisible();
    expect(await small(page)).toEqual([]);
    await page.getByRole('button', { name: '‹ 原稿へ' }).click();
    // the list of works (a work on it, a new work's form, the colours, ログアウト)
    await toc(page, true);
    await page.getByRole('button', { name: 'ほかの作品' }).click();
    await expect(page.locator('#repo-list [data-repo="author/novel"]')).toContainText('話');
    expect(await small(page)).toEqual([]);
  });

  // NFR-USE-02: the table of contents opened while the work is read again stays open, and what is in it is pressed
  // with a finger (it closed when the reading ended: 資料 was out of reach, tests/ui/touch.spec.mjs pressed it by an
  // event instead)
  test('NFR-USE-02: the table of contents stays open when the work is read again, and 資料 in it is pressed', async ({ page, gh }) => {
    await openWork(page);
    await toc(page, true);
    await page.getByRole('button', { name: '再読み込み' }).click();
    await expect(page.locator('#sync-state')).toHaveText(/^GitHub から読みました/);
    await expect(page.locator('#desk')).toHaveClass(/toc-open/);
    await page.getByRole('button', { name: '資料', exact: true }).click();
    await expect(page.locator('#notes')).toBeVisible();
  });
});
