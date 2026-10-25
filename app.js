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
import { showWorks, wireWorks } from './ui/works.js';
import { appOf, importKey, madeApp, startManifest } from './ui/appkey.js';
import { authorOf, HOUR, installUrl, returnOf, startedHere } from './lib/appkey.js';
import { forgetDevice, keepWork } from './ui/repo.js';

/** @typedef {import('./ui/desk.js').Repo} Repo */
/** @typedef {import('./ui/vault.js').AppVault} AppVault */
/** @typedef {import('./lib/appkey.js').Pending} Pending */

// what the screen says of how the token is kept ('' none kept yet)
const KINDS = {
  '': '',
  prf: 'トークンはパスキー（PRF）から作った鍵で暗号化して、この端末に置いています。開くたびにパスキーを使います。',
  local:
    'このブラウザーはパスキーの PRF に対応していないため、トークンはこの端末の取り出せない鍵（WebCrypto）で暗号化して置いています。パスキーは使いません。この端末でこのブラウザーを開ける人は、トークンを使えます。',
  app: 'GitHub App の秘密鍵は、この端末の取り出せない鍵（WebCrypto）として置いています。開くたびにパスキーを使います。',
  'app-local':
    'GitHub App の秘密鍵は、この端末の取り出せない鍵（WebCrypto）として置いています。このブラウザーはパスキーに対応していないため、パスキーは使いません。この端末でこのブラウザーを開ける人は、作品を読み書きできます。',
};
/** @type {keyof typeof KINDS} */
let kind = '';
/** @type {string} the token in use ('' none yet) */
let using = '';
/** @type {AppVault | null} the GitHub App in use, as kept */
let appVault = null;
/** @type {import('./ui/github.js').App | null} the GitHub App in use */
let appInUse = null;

// --- the token

async function keepToken(/** @type {SubmitEvent} */ e) {
  e.preventDefault();
  const token = $('token').value.trim();
  $('setup-error').textContent = '';
  if (!token) return;
  $('keep-token').disabled = true;
  try {
    await checkOwner(token);
    kind = await vault.keep(token);
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
    if (a) await withApp(await vault.openApp(a));
    else await withToken(await vault.open(/** @type {import('./ui/vault.js').Vault} */ (v)));
  } catch (err) {
    $('unlock-error').textContent = err.message;
  } finally {
    $('open-token').disabled = false;
  }
}
// The GitHub user the token is of, kept with the drafts. A token of another user put in where drafts of the one before
// are left (a device shared): asked, without showing them, whether to delete them; if not, the token is not kept
// (NFR-SEC-16)
/** @param {string} token */
async function checkOwner(token) {
  gh.useToken(token);
  /** @type {string} */
  let login = '';
  try {
    login = (await gh.getJson('/user')).login ?? '';
  } catch {}
  try {
    await checkLogin(login, 'このトークン');
  } catch (err) {
    gh.useToken(using);
    throw err;
  }
}
// the drafts left on this device by another user (a token's GitHub user, or another App), deleted only when the
// author says so; otherwise what is put in is not kept (throws)
/** @param {string} login @param {string} what what is put in (このトークン, この秘密鍵) */
async function checkLogin(login, what) {
  const owner = await store.get('prefs', 'owner');
  const left = (await store.all('drafts')).length;
  if (left && owner && login && login !== owner) {
    if (
      !confirm(
        `この端末には、前のユーザーが GitHub に送っていない書きかけが ${left} 件残っています（中身は出しません）。消してから進みますか？（「キャンセル」なら、${what}を保管しません）`,
      )
    )
      throw new Error(`前のユーザーの書きかけを残すため、${what}を保管しませんでした。前のユーザーがトークンを入れ直すと送れます`);
    await forgetDevice(false);
  }
  if (login) await store.put('prefs', 'owner', login);
}
// The token forgotten (NFR-SEC-16): with it, what the device keeps of the works (the works last read, the blobs, the
// settings, the versions kept); the drafts not sent too, when the author says so
async function forgetToken() {
  if (
    !confirm(
      'ログアウトします。この端末からトークンと、この端末に残した作品の控え（オフライン用の版、読んだファイル、履歴、設定）を消します。GitHub の作品はそのままです。よろしいですか',
    )
  )
    return;
  const left = (await store.all('drafts')).length;
  const dropDrafts =
    left > 0 &&
    confirm(
      `GitHub に送っていない書きかけが ${left} 件あります。この端末から消しますか？（「キャンセル」なら書きかけだけ残します。同じ GitHub のユーザーのトークンを入れ直すと送れます）`,
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
async function chooseRepo() {
  show('repos');
  $('screen-info').textContent = screenInfo();
  $('vault-kind').textContent = KINDS[kind];
  $('repos-back').hidden = !(await store.get('prefs', 'repo'));
  await showWorks();
  switchSoon();
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
  const text = expiryNotice((await store.get('prefs', 'token-expires')) ?? 0, Date.now());
  if (text) showNotice(text);
  else hideNotice();
}
// a token GitHub refuses: said, with the way to put a new one in; and, as when the server version's session ends
// (NFR-SEC-16), what the device keeps of the works deleted (the copies, the settings, the records), the drafts kept
gh.onRefused(() => {
  if (!using) return;
  showNotice(
    using === 'app'
      ? 'GitHub が GitHub App のトークンを断りました（秘密鍵が消されたか、App が外されたかもしれません）。'
      : 'GitHub がトークンを断りました（期限が切れたか、消されたかもしれません）。',
  );
  void forgetDevice(true);
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
    // (the notice that opens this is shown on the desk and on the list of works only)
    if (!$('desk').hidden) await api.reload();
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
// the work chosen before, or the list of works
async function openFirst() {
  /** @type {Repo | undefined} */
  const r = await store.get('prefs', 'repo');
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
    await checkLogin(`app:${appId}`, 'この秘密鍵');
    const v = await vault.keepApp({ appId, key, author, credentialId: await vault.appPasskey() });
    await vault.forget();
    /** @type {HTMLFormElement} */ (/** @type {unknown} */ ($('app-form'))).reset();
    if (!v.credentialId) toast('パスキーに対応していないため、パスキーなしで保管しました');
    await withApp(v, app);
  } catch (err) {
    $('app-error').textContent = err.message;
  } finally {
    $('keep-app').disabled = false;
  }
}
/** @param {AppVault} v @param {import('./ui/github.js').App} [app] the one it was checked with */
function useApp(v, app = appOf(v.appId, v.key, v.author)) {
  kind = v.credentialId ? 'app' : 'app-local';
  gh.useToken('');
  gh.useApp(app);
  using = 'app';
  appVault = v;
  appInUse = app;
  hideNotice();
}
/** @param {AppVault} v @param {import('./ui/github.js').App} [app] */
async function withApp(v, app) {
  useApp(v, app);
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
    const credentialId = await vault.appPasskey();
    $('app-paste-form').hidden = false;
    await startManifest(credentialId);
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
// The code turned into the App: its key kept (cannot be taken out; the private key's text not kept), then GitHub's
// page to install it on the work's repositories. The state is used up first: the code is taken once
/** @param {string} code @param {Pending} p */
async function finishApp(code, p) {
  await store.del('prefs', 'app-manifest');
  show('setup');
  $('app-paste-form').hidden = true;
  try {
    const { appId, slug, key } = await madeApp(code);
    await checkLogin(`app:${appId}`, 'この GitHub App');
    const v = await vault.keepApp({ appId, slug, key, author: null, credentialId: p.credentialId });
    await vault.forget();
    // (back from installing it, opened once without the passkey made a moment ago)
    await store.put('prefs', 'app-installing', Date.now());
    useApp(v);
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
  await store.del('prefs', 'app-installing');
  if (repos.length === 1) return openRepo({ full_name: repos[0].full_name, default_branch: repos[0].default_branch, visibility: repos[0].visibility });
  await chooseRepo();
  $('open-other').click();
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
    /** @type {number} */
    const installing = (await store.get('prefs', 'app-installing')) ?? 0;
    if (!a.credentialId || Date.now() - installing < HOUR) return withApp(a);
    kind = 'app';
    $('unlock-note').textContent = KINDS.app;
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
$('forget-token').addEventListener('click', () => void forgetToken());
$('forget-token-unlock').addEventListener('click', () => void forgetToken());
$('repos-back').addEventListener('click', async () => void desk.open(await store.get('prefs', 'repo')));
$('repo-list').addEventListener('click', e => {
  const b = /** @type {HTMLElement} */ (e.target).closest('[data-repo]');
  if (b instanceof HTMLElement)
    void openRepo({
      full_name: /** @type {string} */ (b.dataset.repo),
      default_branch: /** @type {string} */ (b.dataset.branch),
      visibility: /** @type {string} */ (b.dataset.visibility),
    });
});
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
