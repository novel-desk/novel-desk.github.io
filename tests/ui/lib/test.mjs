// The fixtures of the screen tests: a fake GitHub for each test (`gh`, with the work `work`), and the steps that most
// tests start with (the token kept, the work chosen). Every page's and service worker's counts of the app (istanbul,
// coverage.mjs) are taken when its test ends (a page that goes away before keeps them for the page after it)
import { test as base, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FakeGitHub, FakeRepo, TOKEN } from './fake-github.mjs';
import { OUT, TAKE, ON_LEAVE } from './coverage.mjs';

export { expect, FakeRepo, TOKEN };

// A work as the server version makes it (novel.toml with dir, title = "heading", [titles], a chapter folder). The texts
// are made up for the tests
export const WORK_FILES = {
  'novel.toml': [
    '# 作品の設定',
    'title = "試験の作品"',
    '',
    '[manuscript]',
    'dir = "chapters"',
    'files = "*.md"',
    'title = "heading"',
    '',
    '[git]',
    'branch = "main"',
  ].join('\n'),
  'README.md': '# 試験の作品\n',
  'chapters/01_first.md': '# 第1話 はじまり\n\n朝が来た。\n',
  'chapters/02_second.md': '# 第2話 駅で\n\n電車を待つ。\n',
  'chapters/03_part/01_third.md': '# 第3話 坂の上\n\n坂を上る。\n',
  'chapters/memo.txt': 'メモ\n',
  'notes/images/sky.png': Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
};

/** @typedef {{ gh: FakeGitHub, work: FakeRepo }} Fixtures */
export const test = base.extend(
  /** @type {any} */ ({
    // the counts taken in this worker, written for global-teardown.mjs when the worker ends
    taken: [
      // eslint-disable-next-line no-empty-pattern
      async ({}, /** @type {any} */ use, /** @type {any} */ workerInfo) => {
        /** @type {object[]} */
        const taken = [];
        await use(taken);
        mkdirSync(OUT, { recursive: true });
        writeFileSync(join(OUT, `worker-${workerInfo.workerIndex}.json`), JSON.stringify(taken));
      },
      { scope: 'worker' },
    ],
    context: async (/** @type {any} */ { context, taken }, /** @type {any} */ use) => {
      await context.addInitScript(ON_LEAVE);
      await use(context);
      await takeAll(context, taken);
    },
    // (Playwright reads the fixtures a fixture needs from its first argument: none here)
    // eslint-disable-next-line no-empty-pattern
    work: async ({}, use) => use(new FakeRepo('author/novel', WORK_FILES)),
    gh: async ({ context, work, baseURL }, use) => {
      const gh = new FakeGitHub([work, new FakeRepo('author/other', { 'README.md': '# ほか\n' }, { private: false })]);
      await gh.install(context, new URL(baseURL).origin);
      await use(gh);
      // nothing went anywhere but this page's server and the (fake) API
      expect(gh.outside).toEqual([]);
    },
  }),
);

// the counts of every page and service worker of a context (closed pages sent theirs when they went away)
/** @param {import('@playwright/test').BrowserContext} context @param {object[]} taken */
export async function takeAll(context, taken) {
  for (const p of [...context.pages(), ...context.serviceWorkers()]) {
    try {
      const v = await p.evaluate(TAKE);
      if (v) taken.push(JSON.parse(v));
    } catch {}
  }
}

// This browser has no passkey: the token is kept with a key that cannot be taken out (the path of a browser without
// PRF; WebKit here has no authenticator to test with)
/** @param {import('@playwright/test').Page} page */
export async function noPasskey(page) {
  await page.addInitScript(() => Object.defineProperty(window, 'PublicKeyCredential', { value: undefined, configurable: true }));
}
// The browser's navigator.storage.persist counted (how many times the pages of the tab asked to keep the store for
// good, through the pages it went to: sessionStorage; the browser says yes), read with persistAsked
/** @param {import('@playwright/test').Page} page */
export async function watchPersist(page) {
  await page.addInitScript(() => {
    // (WebKit does not take the method set on navigator.storage itself)
    Object.defineProperty(StorageManager.prototype, 'persist', {
      configurable: true,
      value: async () => {
        sessionStorage.setItem('persist-asked', String(Number(sessionStorage.getItem('persist-asked')) + 1));
        return true;
      },
    });
  });
}
/** @param {import('@playwright/test').Page} page @returns {Promise<number>} */
export const persistAsked = page => page.evaluate(() => Number(sessionStorage.getItem('persist-asked')));
// What the passkeys made were called (their user's name, as the passwords' list shows it), through the pages of the
// tab (sessionStorage), read with passkeyNames
/** @param {import('@playwright/test').Page} page */
export async function watchPasskeyNames(page) {
  await page.addInitScript(() => {
    const c = navigator.credentials;
    const create = c.create.bind(c);
    c.create = o => {
      const names = JSON.parse(sessionStorage.getItem('passkey-names') ?? '[]');
      sessionStorage.setItem('passkey-names', JSON.stringify([...names, o?.publicKey?.user.name]));
      return create(o);
    };
  });
}
/** @param {import('@playwright/test').Page} page @returns {Promise<string[]>} */
export const passkeyNames = page => page.evaluate(() => JSON.parse(sessionStorage.getItem('passkey-names') ?? '[]'));
// today on this machine, as the passkeys' names say it (2026-10-25)
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// The token put in (without a passkey), and the work chosen: the desk open on its first episode
/** @param {import('@playwright/test').Page} page @param {string | null} [first] the title of the first episode (null: none) */
export async function openWork(page, first = 'はじまり') {
  await noPasskey(page);
  await page.goto('./');
  await page.getByLabel('トークン', { exact: true }).fill(TOKEN);
  await page.getByRole('button', { name: 'パスキーで保管する' }).click();
  await openRepo(page, 'author/novel');
  if (first !== null) await expect(page.locator('#episode-title')).toHaveValue(first);
}
// A repository not on the list opened from 「リポジトリを開く」 (FR-WORK-03), on the list of works
/** @param {import('@playwright/test').Page} page @param {string} name 「owner/name」 */
export async function openRepo(page, name) {
  await page.getByRole('button', { name: 'リポジトリを開く' }).click();
  await page.locator('#picker-list button', { hasText: name }).click();
}
// what IndexedDB keeps in a store
/** @param {import('@playwright/test').Page} page @param {string} store */
export function stored(page, store) {
  return page.evaluate(
    name =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('novel-writer-js');
        req.onsuccess = () => {
          const get = req.result.transaction(name).objectStore(name).getAll();
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => reject(get.error);
        };
        req.onerror = () => reject(req.error);
      }),
    store,
  );
}
