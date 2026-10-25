// The app: the token (put in once, opened with a passkey each time), the repository chosen, and the desk. No server:
// the page talks to GitHub's API only, and keeps what it needs on this device
import { dayAfter, endOf, expiryNotice } from './lib/expiry.js';
import { installHint, isIos, switchNow } from './lib/install.js';
import { $, show, toast } from './ui/dom.js';
import * as store from './ui/db.js';
import * as desk from './ui/desk.js';
import * as gh from './ui/github.js';
import * as vault from './ui/vault.js';
import { api } from './ui/shared.js';
import { importBox, showWorks, wireWorks } from './ui/works.js';
import { appOf, importKey, madeApp, startManifest } from './ui/appkey.js';
import { appFormOf, authorOf, HOUR, installUrl, returnOf, sameOwner, startedHere } from './lib/appkey.js';
import { forgetDevice, keepWork, worksHere } from './ui/repo.js';

// started: every module came and linked (boot.js reloads the page once when they do not)
/** @type {any} */ (window).nwStarted = true;
try {
  sessionStorage.removeItem('nw-reloaded');
} catch {}

/** @typedef {import('./ui/desk.js').Repo} Repo */
/** @typedef {import('./ui/vault.js').AppVault} AppVault */
/** @typedef {import('./lib/appkey.js').Pending} Pending */

// what the screen says of how the token is kept ('' none kept yet)
const KINDS = {
  '': '',
  prf: 'トークンはパスキー（PRF）から作った鍵で暗号化して、この端末に置いています。開くたびにパスキーを使います。',
  local:
    'このブラウザーはパスキーの PRF に対応していないため、トークンはこの端末の取り出せない鍵（WebCrypto）で暗号化して置いています。パスキーは使いません。この端末でこのブラウザーを開ける人は、トークンを使えます。',
  'app-prf': 'GitHub App の秘密鍵はパスキー（PRF）から作った鍵で暗号化して、この端末に置いています。開くたびにパスキーを使います。',
  'app-local':
    'このブラウザーはパスキーの PRF に対応していないため、GitHub App の秘密鍵は暗号化せず、この端末の取り出せない鍵（WebCrypto）として置いています。パスキーは使いません。この端末でこのブラウザーを開ける人は、作品を読み書きできます。',
  // (DESK-SEC-01: kept by the version before; said here only, not each time it is opened)
  'app-old':
    'GitHub App の秘密鍵は暗号化されていません（前の版で、この端末の取り出せない鍵として置いたものです。開くたびにパスキーを使います）。GitHub の App の設定で秘密鍵を作り直し、ログアウトしてから新しい秘密鍵で始めると、パスキーで暗号化して保存します。',
};
// what the screen to open it with says of an App's key kept with a passkey (the one kept by the version before: what
// to do with it is said in the settings only)
const UNLOCK_APP = { 'app-prf': KINDS['app-prf'], 'app-old': 'GitHub App の秘密鍵は、開くたびにパスキーを使います。' };
/** @type {keyof typeof KINDS} */
let kind = '';
/** @type {string} the token in use ('' none yet) */
let using = '';
/** @type {AppVault | null} the GitHub App in use, as kept */
let appVault = null;
/** @type {import('./ui/github.js').App | null} the GitHub App in use */
let appInUse = null;

// --- the token

// The browser asked to keep this device's store (the key, the drafts) for good, the first time a key is kept: without
// it, a browser short of room, or Safari after days unopened, may delete it. What it answers changes nothing here
async function keepStore() {
  try {
    await navigator.storage.persist();
  } catch {}
}
async function keepToken(/** @type {SubmitEvent} */ e) {
  e.preventDefault();
  const token = $('token').value.trim();
  $('setup-error').textContent = '';
  if (!token) return;
  $('keep-token').disabled = true;
  try {
    await checkOwner(token);
    kind = await vault.keep(token);
    void keepStore();
    await keepExpiry($('token-expires').value);
    $('token').value = '';
    if (kind === 'local') toast('PRF に対応していないため、パスキーなしで保管しました');
    await withToken(token);
  } catch (err) {
    $('setup-error').textContent = err.message;
  } finally {
    $('keep-token').disabled = false;
  }
}
async function openToken() {
  const a = await vault.keptApp();
  const v = await vault.kept();
  if (!a && !v) return start();
  $('unlock-error').textContent = '';
  $('open-token').disabled = true;
  try {
    if (a) await withApp(a, await vault.openApp(a));
    else await withToken(await vault.open(/** @type {import('./ui/vault.js').Vault} */ (v)));
  } catch (err) {
    $('unlock-error').textContent = err.message;
  } finally {
    $('open-token').disabled = false;
  }
}
// The GitHub account the token is of (its user), kept with the drafts. A token of another account put in where drafts
// of the one before are left (a device shared): asked, without showing them, whether to delete them; if not, the token
// is not kept (NFR-SEC-16)
/** @param {string} token */
async function checkOwner(token) {
  gh.useToken(token);
  /** @type {import('./lib/appkey.js').Who | null} */
  let who = null;
  try {
    const u = await gh.getJson('/user');
    // (GitHub not saying the account's number: not known)
    if (typeof u.id === 'number') who = { id: u.id, login: u.login };
  } catch {}
  try {
    await checkLogin(who, 'このトークン');
  } catch (err) {
    gh.useToken(using);
    throw err;
  }
}
// whose a GitHub App is (lib/appkey.js Who: the account that made it), null when GitHub does not say
/** @param {import('./ui/github.js').App} app */
const whoseApp = app => app.who().catch(() => null);
// The drafts left on this device by another account (a token's user, or an App's owner: compared by the account's
// number, lib/appkey.js sameOwner), deleted only when the author says so; otherwise what is put in is not kept
// (throws). The account kept with the drafts, by its number
/** @param {import('./lib/appkey.js').Who | null} who (null: not known) @param {string} what what is put in (このトークン, この秘密鍵) */
async function checkLogin(who, what) {
  const owner = await store.get('prefs', 'owner');
  const left = (await store.all('drafts')).length;
  if (left && who && !sameOwner(owner, who)) {
    if (
      !confirm(
        `この端末に、前にログインしていた人の未送信の書きかけが ${left} 件あります。削除して続けますか？（中身は表示しません。キャンセルすると、${what}を保管しません）`,
      )
    )
      throw new Error(`前のユーザーの書きかけを残すため、${what}を保管しませんでした。前のユーザーがトークンを入れ直すと送れます`);
    await forgetDevice(false);
  }
  if (who) await store.put('prefs', 'owner', who.id);
}
// The token forgotten (NFR-SEC-16): with it, what the device keeps of the works (the works last read, the blobs, the
// settings, the versions kept); the drafts not sent too, when the author says so
// As the server version's: asked only when something is not sent. Unlike it, the drafts can be kept (logging out is
// how a GitHub App's key made again is put in: the drafts go with the new one)
async function forgetToken() {
  await desk.settled();
  const left = (await store.all('drafts')).length;
  const dropDrafts =
    left > 0 &&
    confirm(
      `未送信の書きかけが ${left} 件あります。ログアウトするとき、この端末から削除しますか？（「キャンセル」なら書きかけだけ残します。同じ GitHub のユーザーのトークンか GitHub App で始め直すと送れます）`,
    );
  await vault.forget();
  await vault.forgetApp();
  gh.useApp(null);
  appVault = appInUse = null;
  $('author-notice').hidden = true;
  await forgetDevice(left > 0 && !dropDrafts);
  await store.del('prefs', 'token-expires');
  hideNotice();
  gh.useToken('');
  using = '';
  kind = '';
  toast('ログアウトしました。トークンと、この端末に残した作品の控えを消しました。パスキーはパスワードの管理に残っているので、要らなければそこで消してください');
  show('setup');
}

// --- the repository

/** @param {Repo} r */
async function openRepo(r) {
  await keepWork(r);
  await store.put('prefs', 'repo', r);
  void proposeAuthor(r.full_name);
  await desk.open(r);
}
// この端末の画面 (FR-APP-05): its size, its scale, the room the status bar and the home bar take, and whether it is the
// app on the home screen (to fit the tests and the screen to the author's device)
function screenInfo() {
  const probe = document.createElement('div');
  Object.assign(probe.style, { position: 'fixed', visibility: 'hidden', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' });
  document.body.append(probe);
  const { paddingTop, paddingBottom } = getComputedStyle(probe);
  probe.remove();
  const home = matchMedia('(display-mode: standalone)').matches || /** @type {any} */ (navigator).standalone === true;
  return `この端末の画面: ${innerWidth}×${innerHeight}、倍率 ${devicePixelRatio}、上の余白 ${parseFloat(paddingTop)}、下の余白 ${parseFloat(paddingBottom)}（${home ? 'ホーム画面のアプリ' : 'ブラウザ'}）`;
}
// 作品の一覧 (the server version's shelf): no work in the address
async function chooseRepo() {
  await desk.settled();
  desk.leave();
  show('shelf');
  history.replaceState(null, '', location.pathname);
  await showWorks();
  switchSoon();
}
// 設定 (as the server version's): the screen's colors, the account, GitHub (how the token or the App is kept)
async function openSettings() {
  await desk.settled();
  desk.leave();
  show('settings');
  $('screen-info').textContent = screenInfo();
  $('gh-help').textContent = KINDS[kind];
  $('gh-state').textContent = using === 'app' ? 'GitHub App で連携しています' : 'トークンで連携しています';
  // (GitHub not saying it: nothing said)
  const who = using === 'app' ? await whoseApp(/** @type {import('./ui/github.js').App} */ (appInUse)) : await gh.getJson('/user').catch(() => null);
  $('me').textContent = who ? `GitHub の ${who.login}` : '';
}

// --- the token's expiry, said from 14 days before (GitHub does not let the page read it: the author says it), and a
// token GitHub refuses (401): either way, a new one put in its place (FR-GH-01, NFR-USE-01)

/** @param {string} day the date input's value ('' none) */
const keepExpiry = day => store.put('prefs', 'token-expires', endOf(day));
/** @param {string} text */
function showNotice(text) {
  $('token-notice-text').textContent =
    using === 'app'
      ? `${text} GitHub の App の設定で秘密鍵を作り直し、ログアウトしてから新しい秘密鍵で始めてください。書いたものはこの端末に残っています。`
      : `${text} GitHub のトークンの一覧でトークンを作り直し（Regenerate token）、新しい値を入れてください。書いたものはこの端末に残っています。`;
  $('token-notice-token').hidden = using === 'app';
  $('token-notice').hidden = false;
}
function hideNotice() {
  $('token-notice').hidden = true;
}
async function checkExpiry() {
  const text = expiryNotice(await store.get('prefs', 'token-expires'), Date.now());
  if (text) showNotice(text);
  else hideNotice();
}
// a token GitHub refuses: said, with the way to put a new one in. Nothing the device keeps of the works is deleted
// (their settings, the branch chosen, the repositories' IDs, the records, the copies, the drafts): only the token is
// put in again, and the work goes on as it was (what is not sent goes where and how it was written)
gh.onRefused(() => {
  if (!using) return;
  showNotice(
    using === 'app'
      ? 'GitHub が GitHub App のトークンを断りました（秘密鍵が消されたか、App が外されたかもしれません）。'
      : 'GitHub がトークンを断りました（期限が切れたか、消されたかもしれません）。',
  );
});
async function replaceToken(/** @type {SubmitEvent} */ e) {
  e.preventDefault();
  const token = $('new-token').value.trim();
  $('token-replace-error').textContent = '';
  if (!token) return;
  $('keep-new-token').disabled = true;
  const before = using;
  try {
    gh.useToken(token);
    try {
      await gh.check();
    } catch (err) {
      throw new Error(`このトークンは使えません: ${err.message}`, { cause: err });
    }
    kind = await vault.keep(token);
    await keepExpiry($('new-token-expires').value);
    using = token;
    $('new-token').value = '';
    /** @type {HTMLDialogElement} */ (/** @type {unknown} */ ($('token-replace'))).close();
    hideNotice();
    toast('新しいトークンを保管しました');
    // (the notice that opens this is shown on the screens of the work and on the list of works only)
    if (desk.onWork()) await api.reload();
    else await chooseRepo();
  } catch (err) {
    gh.useToken(before);
    $('token-replace-error').textContent = err.message;
  } finally {
    $('keep-new-token').disabled = false;
  }
}

/** @param {string} token */
async function withToken(token) {
  gh.useApp(null);
  gh.useToken(token);
  using = token;
  await checkExpiry();
  await openFirst();
}
// the work in the address (#owner/name, as the server version's #作品: the page loaded again opens it again), else
// the list of works
async function openFirst() {
  const name = decodeURIComponent(location.hash.slice(1));
  const r = name ? (await worksHere()).find(x => x.full_name === name) : undefined;
  if (!r) return chooseRepo();
  void proposeAuthor(r.full_name);
  await desk.open(r);
}

// --- a GitHub App's private key in place of the token (FR-GH-01, NFR-SEC-15: ui/appkey.js, ui/vault.js keepApp)

async function keepApp(/** @type {SubmitEvent} */ e) {
  e.preventDefault();
  $('app-error').textContent = '';
  const appId = $('app-id').value.trim();
  const author = { name: $('app-name').value.trim(), email: $('app-email').value.trim() };
  // (the form asks for each: it is not sent without them)
  const file = /** @type {File} */ ($('app-key').files?.[0]);
  $('keep-app').disabled = true;
  try {
    const key = await importKey(await file.text());
    const app = appOf(appId, key, author);
    /** @type {any[]} */
    let repos;
    try {
      repos = await app.repos();
    } catch (err) {
      throw new Error(`GitHub App として GitHub に入れませんでした（App ID か秘密鍵が違うかもしれません）: ${err.message}`, { cause: err });
    }
    if (!repos.length)
      throw new Error('この GitHub App は、どのリポジトリにも入っていません。GitHub の App の設定の Install App で、作品のリポジトリに入れてください');
    await checkLogin(await whoseApp(app), 'この秘密鍵');
    const seal = await vault.appPasskey();
    // (the file read again: its bytes encrypted with the passkey's key, and zeroed)
    const { lock } = await vault.lockApp(await file.text(), seal);
    const v = await vault.keepApp({ appId, author, ...lock });
    void keepStore();
    await vault.forget();
    /** @type {HTMLFormElement} */ (/** @type {unknown} */ ($('app-form'))).reset();
    if (v.kind === 'local') toast('PRF に対応していないため、パスキーなしで保管しました');
    await withApp(v, key, app);
  } catch (err) {
    $('app-error').textContent = err.message;
  } finally {
    $('keep-app').disabled = false;
  }
}
/** @param {AppVault} v as kept @param {CryptoKey} key its key to sign with (opened) @param {import('./ui/github.js').App} [app] the one it was checked with */
function useApp(v, key, app = appOf(v.appId, key, v.author)) {
  kind = `app-${appFormOf(v)}`;
  gh.useToken('');
  gh.useApp(app);
  using = 'app';
  appVault = v;
  appInUse = app;
  hideNotice();
}
/** @param {AppVault} v @param {CryptoKey} key @param {import('./ui/github.js').App} [app] */
async function withApp(v, key, app) {
  useApp(v, key, app);
  // (an App made by the manifest flow, no work chosen yet: where the author installed it)
  if (v.slug && !(await store.get('prefs', 'repo'))) await installed(false);
  else await openFirst();
}

// --- a GitHub App made by GitHub's manifest flow (FR-GH-01, NFR-SEC-05, NFR-SEC-10: ui/appkey.js startManifest,
// madeApp). One button here; on GitHub, Create, then the repositories and Install; back here, the work opened

// the flow started: the passkey for the key made now (while the press is fresh), then the page leaves for GitHub. The
// field to paste a code in is shown at once, for a way back that opens somewhere else (README: iPhone)
async function makeApp() {
  $('app-make-error').textContent = '';
  $('make-app').disabled = true;
  try {
    const seal = await vault.appPasskey();
    $('app-paste-form').hidden = false;
    await startManifest(seal);
  } catch (err) {
    $('app-make-error').textContent = err.message;
  } finally {
    $('make-app').disabled = false;
  }
}
// whether a flow started on this device is waited for (the field to paste its code in shown)
async function showPaste() {
  /** @type {Pending | undefined} */
  const p = await store.get('prefs', 'app-manifest');
  $('app-paste-form').hidden = !(p && Date.now() - p.at < HOUR);
}
// GitHub came back with the App made: taken only by the flow started here (its state, within the hour, once). Back
// somewhere else (another browser, or Safari and not the app on the home screen): not taken there, and the code shown
// to be pasted where the flow was started
/** @param {{ code: string, state: string }} back */
async function cameBack(back) {
  /** @type {Pending | undefined} */
  const p = await store.get('prefs', 'app-manifest');
  if (startedHere(p, back.state, Date.now())) return finishApp(back.code, /** @type {Pending} */ (p));
  show('setup');
  await showPaste();
  $('app-bridge-code').value = `${back.state}.${back.code}`;
  $('app-bridge').hidden = false;
}
async function pasteCode(/** @type {SubmitEvent} */ e) {
  e.preventDefault();
  $('app-paste-error').textContent = '';
  const back = returnOf($('app-paste').value);
  /** @type {Pending | undefined} */
  const p = await store.get('prefs', 'app-manifest');
  if (!back || !startedHere(p, back.state, Date.now())) {
    $('app-paste-error').textContent =
      'このコードは、ここで始めた GitHub App のものではありません（1 時間を過ぎたかもしれません）。もう一度「GitHub App を作って始める」を押してください';
    return;
  }
  $('app-paste').value = '';
  await finishApp(back.code, /** @type {Pending} */ (p));
}
// The code turned into the App: its key kept (encrypted with the passkey made when the flow started, DESK-SEC-01; the
// private key's text not kept), then GitHub's page to install it on the work's repositories. The state is used up
// first (with the passkey's key kept with it): the code is taken once
/** @param {string} code @param {Pending} p */
async function finishApp(code, p) {
  await store.del('prefs', 'app-manifest');
  show('setup');
  $('app-paste-form').hidden = true;
  try {
    const { appId, slug, key, lock } = await madeApp(code, p.seal);
    await checkLogin(await whoseApp(appOf(appId, key, null)), 'この GitHub App');
    const v = await vault.keepApp({ appId, slug, author: null, ...lock });
    void keepStore();
    await vault.forget();
    useApp(v, key);
    await installed(true);
  } catch (err) {
    $('app-make-error').textContent = `GitHub App を受け取れませんでした（${err.message}）`;
  }
}
// The repositories the App is installed on: one, opened; several, offered (リポジトリを開く); none yet, GitHub's page
// to install it on them (gone to at once when `leave`; looked at again when the author comes back)
/** @param {boolean} leave */
async function installed(leave) {
  const v = /** @type {AppVault} */ (appVault);
  $('app-install-error').textContent = '';
  /** @type {any[]} */
  let repos;
  try {
    repos = await gh.repos();
  } catch (err) {
    show('app-install');
    $('app-install-error').textContent = err.message;
    return;
  }
  if (!repos.length) {
    $('app-install-link').setAttribute('href', installUrl(/** @type {string} */ (v.slug)));
    show('app-install');
    if (leave) location.assign(installUrl(/** @type {string} */ (v.slug)));
    return;
  }
  if (repos.length === 1) return openRepo({ full_name: repos[0].full_name, default_branch: repos[0].default_branch, visibility: repos[0].visibility });
  await chooseRepo();
  importBox().open = true;
}
// the app shown again: an App installed meanwhile, or a key kept meanwhile by another page of this app
async function recheck() {
  if (!$('app-install').hidden) return installed(false);
  if (!$('setup').hidden && (await vault.keptApp())) await start();
}
// Who an App's commits are written by, when it is not known yet (an App made by the manifest flow): proposed from the
// latest commit of the work opened (or the account the App is installed on), kept at once, and shown with the way to
// change it, before anything is sent
/** @param {string} repo */
async function proposeAuthor(repo) {
  if (!appInUse || appInUse.author) return;
  /** @type {any[]} */
  let commits = [];
  try {
    commits = await gh.latest(repo);
  } catch {}
  const author = authorOf(commits, await appInUse.account(`/repos/${repo}/`));
  if (!author) return;
  await keepAuthor(author);
  $('author-name').value = author.name;
  $('author-email').value = author.email;
  $('author-notice').hidden = false;
}
/** @param {{ name: string, email: string }} author */
async function keepAuthor(author) {
  const v = /** @type {AppVault} */ (appVault);
  v.author = author;
  /** @type {import('./ui/github.js').App} */ (appInUse).author = author;
  await vault.keepApp(v);
}
async function changeAuthor(/** @type {SubmitEvent} */ e) {
  e.preventDefault();
  await keepAuthor({ name: $('author-name').value.trim(), email: $('author-email').value.trim() });
  $('author-notice').hidden = true;
}

async function start() {
  const back = returnOf(location.href);
  // (what GitHub gave back is not left in the address, nor in the history)
  if (location.search) history.replaceState(null, '', location.pathname);
  if (back) return cameBack(back);
  const a = await vault.keptApp();
  if (a) {
    const form = appFormOf(a);
    // (kept without a passkey: opened at once)
    if (form === 'local') return withApp(a, await vault.openApp(a));
    kind = `app-${form}`;
    $('unlock-note').textContent = UNLOCK_APP[kind];
    return show('unlock');
  }
  const v = await vault.kept();
  kind = v?.kind ?? '';
  if (!v) {
    show('setup');
    return showPaste();
  }
  if (v.kind === 'local') {
    try {
      return await withToken(await vault.open(v));
    } catch (err) {
      show('unlock');
      $('unlock-error').textContent = err.message;
      return;
    }
  }
  $('unlock-note').textContent = KINDS.prf;
  show('unlock');
}

$('setup-form').addEventListener('submit', e => void keepToken(/** @type {SubmitEvent} */ (e)));
$('app-form').addEventListener('submit', e => void keepApp(/** @type {SubmitEvent} */ (e)));
$('make-app').addEventListener('click', () => void makeApp());
$('app-paste-form').addEventListener('submit', e => void pasteCode(/** @type {SubmitEvent} */ (e)));
$('author-notice').addEventListener('submit', e => void changeAuthor(/** @type {SubmitEvent} */ (e)));
$('forget-token-install').addEventListener('click', () => void forgetToken());
$('copy-bridge').addEventListener('click', () =>
  navigator.clipboard.writeText($('app-bridge-code').value).then(
    () => toast('コードを写しました。始めた Novel Desk に戻って貼ってください'),
    () => {
      $('app-bridge-code').select();
      toast('写せませんでした。コードを長押しして写してください');
    },
  ),
);
document.addEventListener('visibilitychange', () => void recheck());
$('open-token').addEventListener('click', () => void openToken());
$('logout').addEventListener('click', () => void forgetToken());
$('forget-token-unlock').addEventListener('click', () => void forgetToken());
$('open-settings').addEventListener('click', () => void openSettings());
$('close-settings').addEventListener('click', () => void chooseRepo());
wireWorks({ open: openRepo });
desk.wire({ changeRepo: () => void chooseRepo(), open: openRepo, relist: chooseRepo });
$('token-replace-form').addEventListener('submit', e => void replaceToken(/** @type {SubmitEvent} */ (e)));
$('token-replace-open').addEventListener('click', () => {
  $('new-token-expires').value = dayAfter(Date.now());
  $('token-replace-error').textContent = '';
  /** @type {HTMLDialogElement} */ (/** @type {unknown} */ ($('token-replace'))).showModal();
});
$('close-token-replace').addEventListener('click', () => /** @type {HTMLDialogElement} */ (/** @type {unknown} */ ($('token-replace'))).close());
$('token-notice-close').addEventListener('click', hideNotice);
$('token-expires').value = dayAfter(Date.now());

// --- adding the app to the home screen (FR-APP-03): said on the first screen only, never once opened from there
/** @type {any} the browser's offer to install the app (Chrome), kept for the button */
let offer = null;
function showInstall() {
  const standalone = matchMedia('(display-mode: standalone)').matches || /** @type {any} */ (navigator).standalone === true;
  const hint = installHint({ standalone, ios: isIos(navigator), offered: offer !== null });
  $('install-ios').hidden = hint !== 'ios';
  $('install-app').hidden = hint !== 'button';
}
addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  offer = e;
  showInstall();
});
addEventListener('appinstalled', () => {
  offer = null;
  showInstall();
});
// (the button is shown only while the browser's offer is kept)
$('install').addEventListener('click', async () => {
  await offer.prompt();
  offer = null;
  showInstall();
});
showInstall();

// --- 画面の色 (FR-APP-01): 自動 (the device's setting), 白, 黒, kept on this device
/** @param {string} t '' (自動), 'light' or 'dark' */
function setTheme(t) {
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  try {
    if (t) localStorage.setItem('theme', t);
    else localStorage.removeItem('theme');
  } catch {}
  // the browser's bar follows: one color for both, or back to the device's (as the server version's)
  for (const m of /** @type {NodeListOf<HTMLMetaElement>} */ (document.querySelectorAll('meta[name="theme-color"]')))
    m.content = t === 'dark' ? '#16171a' : t === 'light' ? '#f2eee6' : m.media.includes('dark') ? '#16171a' : '#f2eee6';
  for (const b of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('[data-theme-pick]'))) b.classList.toggle('on', b.dataset.themePick === t);
}
try {
  const t = localStorage.getItem('theme');
  setTheme(t === 'light' || t === 'dark' ? t : '');
} catch {
  setTheme('');
}
$('theme-pick').addEventListener('click', e => {
  const b = /** @type {HTMLElement} */ (e.target).closest('[data-theme-pick]');
  if (b instanceof HTMLElement) setTheme(/** @type {string} */ (b.dataset.themePick));
});
// --- a new version of the app (FR-APP-02): its worker takes over at once (sw.js); the page is loaded again when
// nothing typed can be lost (lib/install.js switchNow): off the desk, or when the desk is left (the page hidden). The
// worker is asked for a new version when the app comes back in front, and every hour
let updated = false;
function switchSoon() {
  if (!updated) return;
  const s = { updated, onDesk: !$('desk').hidden, visible: document.visibilityState === 'visible', busy: Boolean(api.busy?.()) };
  if (switchNow(s)) void desk.settled().then(() => location.reload());
  else if (s.busy) setTimeout(switchSoon, 1000);
}
if ('serviceWorker' in navigator) {
  const had = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    updated ||= had;
    switchSoon();
  });
  const check = () => void navigator.serviceWorker.getRegistration().then(reg => reg?.update().catch(() => {}));
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? switchSoon() : check()));
  setInterval(check, 3600000);
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// (this device's store cannot be opened: a newer version of the app made it, or the browser does not allow it)
void start().catch(err => {
  show('setup');
  $('setup-error').textContent = `この端末の保存場所を開けません（${err.message}）`;
});
