// The fixtures of the screen tests: a fake GitHub for each test (`gh`, with the work `work`), and the steps that most
// tests start with (the token kept, the work chosen). Every page's and service worker's counts of the app (istanbul,
// coverage.mjs) are taken when its test ends (a page that goes away before keeps them for the page after it)
import { test as base, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FakeGitHub, FakeRepo, TOKEN } from './fake-github.mjs';
import { OUT, TAKE, ON_LEAVE } from './coverage.mjs';

export { expect, FakeRepo, TOKEN };

// the 版 of the 利用規約 (index.html, #terms data-version): agreed to on the device of every test but those of the
// 利用規約 themselves (test.use({ agreed: false }))
export const TERMS = /** @type {string} */ (
  /id="terms"[^>]*data-version="([^"]+)"/.exec(readFileSync(join(import.meta.dirname, '../../../index.html'), 'utf8'))?.[1]
);

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
    agreed: [true, { option: true }],
    context: async (/** @type {any} */ { context, taken, agreed }, /** @type {any} */ use) => {
      await context.addInitScript(ON_LEAVE);
      if (agreed) await context.addInitScript(v => localStorage.setItem('terms', v), TERMS);
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
// The passkey's answers changed for a test, as other authenticators and browsers give them: localStorage 「nw-create」 and
// 「nw-get」 say how (none: as the virtual authenticator answers)
/** @param {import('@playwright/test').Page} page */
export async function otherAnswers(page) {
  await page.addInitScript(() => {
    const c = navigator.credentials;
    const [create, get] = [c.create.bind(c), c.get.bind(c)];
    /** @param {any} cred @param {any} results */
    const saying = (cred, results) => Object.assign(cred, { getClientExtensionResults: () => results });
    c.create = async o => {
      const how = localStorage.getItem('nw-create');
      if (how === 'null') return null;
      if (how === 'error') throw new TypeError('test');
      const cred = await create(o);
      // (PRF said to be there, its output given only on a get)
      return how === 'later' ? saying(cred, { prf: { enabled: true } }) : cred;
    };
    c.get = async o => {
      const how = localStorage.getItem('nw-get');
      if (how === 'cancel') throw new DOMException('test', 'NotAllowedError');
      if (how === 'error') throw new TypeError('test');
      if (how === 'string') throw 'test';
      if (how === 'null') return null;
      const cred = await get(o);
      if (how === 'none') return saying(cred, {});
      if (how === 'other') return saying(cred, { prf: { results: { first: new Uint8Array(32).fill(7).buffer } } });
      return cred;
    };
  });
}
/** @param {import('@playwright/test').Page} page @param {string} key @param {string} value */
export const answering = (page, key, value) => page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, value]);
// What this origin's IndexedDB keeps of the GitHub App's key (DESK-SEC-01): its kind, its fields, the bytes kept
// encrypted (hex), and how many WebCrypto keys are kept anywhere in IndexedDB (every store); null when none is kept
/** @param {import('@playwright/test').Page} page @returns {Promise<{ kind: string | undefined, fields: string[], data: string, cryptoKeys: number } | null>} */
export const keptAppForm = page =>
  page.evaluate(async () => {
    const db = /** @type {IDBDatabase} */ (
      await new Promise((resolve, reject) => {
        const req = indexedDB.open('novel-writer-js');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
    );
    /** @param {string} name @returns {Promise<any[]>} */
    const all = name =>
      new Promise(resolve => {
        const get = db.transaction(name).objectStore(name).getAll();
        get.onsuccess = () => resolve(get.result);
      });
    let cryptoKeys = 0;
    /** @param {any} x */
    const walk = x => {
      if (x instanceof CryptoKey) cryptoKeys++;
      else if (x && typeof x === 'object' && !ArrayBuffer.isView(x) && !(x instanceof ArrayBuffer)) for (const v of Object.values(x)) walk(v);
    };
    for (const name of db.objectStoreNames) walk(await all(name));
    const v = await new Promise(resolve => {
      const get = db.transaction('vault').objectStore('vault').get('app');
      get.onsuccess = () => resolve(get.result);
    });
    if (!v) return null;
    const data = v.data ? Array.from(new Uint8Array(v.data), b => b.toString(16).padStart(2, '0')).join('') : '';
    return { kind: v.kind, fields: Object.keys(v).sort(), data, cryptoKeys };
  });
// The keys the page makes from PKCS#8 bytes (crypto.subtle.importKey), kept on the page to be looked at by
// signingKeys (DESK-SEC-01: the App's key, opened)
/** @param {import('@playwright/test').Page} page */
export async function watchSigningKeys(page) {
  await page.addInitScript(() => {
    const importKey = SubtleCrypto.prototype.importKey;
    /** @type {any} */ (window).nwSigningKeys = [];
    SubtleCrypto.prototype.importKey = /** @type {any} */ (
      async function (/** @type {any[]} */ ...args) {
        const key = await importKey.apply(this, /** @type {any} */ (args));
        if (args[0] === 'pkcs8') /** @type {any} */ (window).nwSigningKeys.push(key);
        return key;
      }
    );
  });
}
// The last key the page made from PKCS#8 bytes: whether it can be taken out (exportKey refused: its error's name), and
// its signature of `text` (hex), to be checked with the App's public key
/** @param {import('@playwright/test').Page} page @param {string} text */
export const signingKeys = (page, text) =>
  page.evaluate(async text => {
    const keys = /** @type {CryptoKey[]} */ (/** @type {any} */ (window).nwSigningKeys);
    const key = /** @type {CryptoKey} */ (keys.at(-1));
    const out = await crypto.subtle.exportKey('pkcs8', key).then(
      () => 'exported',
      e => e.name,
    );
    const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(text)));
    return { count: keys.length, extractable: key.extractable, usages: key.usages, out, sig: Array.from(sig, b => b.toString(16).padStart(2, '0')).join('') };
  }, text);
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
  await keepMoreOpen(page);
  await page.goto('./');
  await page.getByLabel('トークン', { exact: true }).fill(TOKEN);
  await page.getByRole('button', { name: 'パスキーで保管する' }).click();
  await openRepo(page, 'author/novel');
  if (first !== null) await expect(page.locator('#episode-title')).toHaveValue(first);
}
// 設定 (as the server version's: from the list of works), from the desk or the list
/** @param {import('@playwright/test').Page} page */
export async function toSettings(page) {
  if (await page.locator('#desk').isVisible()) await page.locator('#to-shelf').click();
  await page.getByRole('button', { name: '設定', exact: true }).click();
}
// 「GitHub リポジトリをインポート」 opened, and its field taken up (the names offered read then)
/** @param {import('@playwright/test').Page} page */
export async function openImport(page) {
  const details = page.locator('#shelf details.import');
  if (!(await details.evaluate(d => /** @type {HTMLDetailsElement} */ (d).open))) await page.locator('#shelf details.import > summary').click();
  await page.locator('#import-repo').focus();
}
// 「リリース・GitHub・その他」 open on every load of the page (as the author opens it to send and read again by hand: the
// sync's buttons are in it, as the server version's)
/** @param {import('@playwright/test').Page} page */
export const keepMoreOpen = page =>
  page.addInitScript(() =>
    addEventListener('DOMContentLoaded', () => {
      const d = /** @type {HTMLDetailsElement | null} */ (document.getElementById('toc-more'));
      if (d) d.open = true;
    }),
  );
// A repository not on the list opened from 「GitHub リポジトリをインポート」 (FR-WORK-03), on the list of works
/** @param {import('@playwright/test').Page} page @param {string} name 「owner/name」 */
export async function openRepo(page, name) {
  const details = page.locator('#shelf details.import');
  if (!(await details.evaluate(d => /** @type {HTMLDetailsElement} */ (d).open))) await page.locator('#shelf details.import > summary').click();
  await page.locator('#import-repo').fill(name);
  await page.getByRole('button', { name: 'インポート', exact: true }).click();
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
