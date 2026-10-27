// The app: the GitHub App (made once, its key opened with a passkey each time), the repository chosen, and the desk. No
// server: the page talks to GitHub's API only, and keeps what it needs on this device
import { installHint, isIos, switchNow } from './lib/install.js';
import { $, busy, show, toast } from './ui/dom.js';
import * as store from './ui/db.js';
import * as desk from './ui/desk.js';
import * as gh from './ui/github.js';
import * as vault from './ui/vault.js';
import { api } from './ui/shared.js';
import { importBox, showWorks, wireWorks } from './ui/works.js';
import { appOf, madeApp, startManifest } from './ui/appkey.js';
import { appFormOf, appSettingsUrl, authorOf, HOUR, installUrl, returnOf, sameOwner, startedHere } from './lib/appkey.js';
import { forgetDevice, keepWork, worksHere } from './ui/repo.js';

// started: every module came and linked (boot.js reloads the page once when they do not)
/** @type {any} */ (window).nwStarted = true;
try {
  sessionStorage.removeItem('nw-reloaded');
} catch {}

/** @typedef {import('./ui/desk.js').Repo} Repo */
/** @typedef {import('./ui/vault.js').AppVault} AppVault */
/** @typedef {import('./lib/appkey.js').Pending} Pending */

// what the screen says of how the App's key is kept ('' none kept yet)
const KINDS = {
  '': '',
  'app-prf': 'GitHub App の秘密鍵は、パスキー（PRF）から生成した鍵で暗号化し、この端末に保存しています。起動するたびにパスキーで認証します。',
  'app-local':
    'このブラウザーはパスキーの PRF に対応していないため、GitHub App の秘密鍵は暗号化せず、この端末の取り出せない鍵（WebCrypto）として保存しています。パスキーは使用しません。この端末でこのブラウザーを開ける人は、作品を読み書きできます。',
  // (DESK-SEC-01: kept by the version before; said here only, not each time it is opened)
  'app-old':
    'GitHub App の秘密鍵は暗号化されていません（前の版で、この端末の取り出せない鍵として保存したものです。起動するたびにパスキーで認証します）。ログアウトしてから「GitHub App を作成して始める」で App を再作成すると、パスキーで暗号化して保存します。前の App は、GitHub の Settings → Developer settings → GitHub Apps で削除してください。',
};
// what the screen to open it with says of an App's key kept with a passkey (the one kept by the version before: what
// to do with it is said in the settings only)
const UNLOCK_APP = { 'app-prf': KINDS['app-prf'], 'app-old': 'GitHub App の秘密鍵は、起動するたびにパスキーで認証します。' };
/** @type {keyof typeof KINDS} */
let kind = '';
/** @type {AppVault | null} the GitHub App in use, as kept */
let appVault = null;
/** @type {import('./ui/github.js').App | null} the GitHub App in use */
let appInUse = null;

// --- the App's key kept, opened, forgotten

// The browser asked to keep this device's store (the key, the drafts) for good, the first time a key is kept: without
// it, a browser short of room, or Safari after days unopened, may delete it. What it answers changes nothing here
async function keepStore() {
  try {
    await navigator.storage.persist();
  } catch {}
}
async function openKey() {
  const a = await vault.keptApp();
  if (!a) return start();
  $('unlock-error').textContent = '';
  $('open-key').disabled = true;
  $('open-key').textContent = 'パスキーで開いています…';
  try {
    const key = await vault.openApp(a);
    loading('作品を読み込んでいます…');
    await withApp(a, key);
  } catch (err) {
    show('unlock');
    $('unlock-error').textContent = err.message;
  } finally {
    $('open-key').disabled = false;
    $('open-key').textContent = 'パスキーで開く';
  }
}
// the screen while something is done before the next one can be shown (what is being done said: B4)
/** @param {string} text */
function loading(text) {
  $('loading-text').textContent = text;
  show('loading');
}
// whose a GitHub App is (lib/appkey.js Who: the account that made it), null when GitHub does not say
/** @param {import('./ui/github.js').App} app */
const whoseApp = app => app.who().catch(() => null);
// The drafts left on this device by another account (an App's owner: compared by the account's number, lib/appkey.js
// sameOwner; one kept by a token's user before is compared as well), deleted only when the author says so; otherwise
// the App is not kept (throws). The account kept with the drafts, by its number (NFR-SEC-16)
/** @param {import('./lib/appkey.js').Who | null} who (null: not known) */
async function checkLogin(who) {
  const owner = await store.get('prefs', 'owner');
  const left = (await store.all('drafts')).length;
  if (left && who && !sameOwner(owner, who)) {
    if (
      !confirm(
        `この端末に、前にログインしていた人の未送信の書きかけが ${left} 件あります。削除して続けますか？（中身は表示しません。キャンセルすると、この GitHub Appを保管しません）`,
      )
    )
      throw new Error('前のユーザーの書きかけを残すため、この GitHub Appを保管しませんでした。前のユーザーが自分の GitHub App で始め直すと送れます');
    await forgetDevice(false);
  }
  if (who) await store.put('prefs', 'owner', who.id);
}
// Logged out (NFR-SEC-16): the App's key forgotten, with what the device keeps of the works (the works last read, the
// blobs, the settings, the versions kept); the drafts not sent too, when the author says so
// As the server version's: asked only when something is not sent. Unlike it, the drafts can be kept (logging out is
// how a GitHub App's key made again is put in: the drafts go with the new one). What is deleted, said in the band, the
// button pressed not pressed again meanwhile (DESK-OPS-05)
/** @param {HTMLButtonElement} button the one pressed */
async function logOut(button) {
  await desk.settled();
  const left = (await store.all('drafts')).length;
  const dropDrafts =
    left > 0 &&
    confirm(
      `未送信の書きかけが ${left} 件あります。ログアウトするとき、この端末から削除しますか？（「キャンセル」なら書きかけだけ残します。同じ GitHub のユーザーの GitHub App で始め直すと送れます）`,
    );
  await busy(
    'ログアウトしています…',
    async () => {
      await vault.forgetApp();
      gh.useApp(null);
      appVault = appInUse = null;
      $('author-notice').hidden = true;
      await forgetDevice(left > 0 && !dropDrafts);
    },
    button,
  );
  hideNotice();
  kind = '';
  toast(
    'ログアウトしました。GitHub App の秘密鍵と、この端末に残した作品の控えを削除しました。GitHub の App と、パスワードの管理のパスキーは残っています。使用しないときは、それぞれ削除してください（App は GitHub の Settings → Developer settings → GitHub Apps）',
  );
  show('setup');
}

// --- the repository

/** @param {Repo} r */
async function openRepo(r) {
  await keepWork(r);
  await store.put('prefs', 'repo', r);
  await proposeAuthor(r.full_name);
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
// 設定 (as the server version's): the screen's colors, the account, GitHub (how the App's key is kept)
async function openSettings() {
  await desk.settled();
  desk.leave();
  show('settings');
  $('screen-info').textContent = screenInfo();
  $('gh-help').textContent = KINDS[kind];
  showLeave();
  // asked of GitHub (DESK-OPS-03), said while it is asked (DESK-OPS-05): refused (the App deleted on GitHub), said so;
  // GitHub not saying it (not reached, failed), said as connected
  $('gh-state').textContent = 'GitHub に確かめています…';
  $('relink').hidden = true;
  const app = /** @type {import('./ui/github.js').App} */ (appInUse);
  let who = null;
  let state = 'GitHub App で連携しています';
  try {
    who = await app.who();
    // (installed nowhere: uninstalled on GitHub)
    if (!(await app.installedOn()).length)
      state = 'GitHub App が、どのリポジトリにもインストールされていません。「App をインストールするリポジトリを選ぶ」で、作品のリポジトリを選んでください。';
  } catch (err) {
    if (err instanceof gh.GitHubError && (err.status === 401 || err.status === 404)) {
      state = 'GitHub App との連携が無効になっています。GitHub がこの App の認証を拒否しました。GitHub で App を削除した場合も、この表示になります。';
      $('relink').hidden = false;
    }
  }
  $('gh-state').textContent = state;
  $('me').textContent = who ? `GitHub の ${who.login}` : '';
}
// 連携をやめるとき: an App made here, its own page to delete it on
function showLeave() {
  const slug = appVault?.slug;
  $('app-repos-link').setAttribute('href', slug ? installUrl(slug) : 'https://github.com/settings/installations');
  const link = $('leave-app-link');
  link.setAttribute('href', slug ? appSettingsUrl(slug) : 'https://github.com/settings/apps');
  link.textContent = slug ? `「${slug}」の Advanced のページ` : 'GitHub App の一覧';
  $('leave-app-then').textContent = slug
    ? 'を開き、「Delete GitHub App」を押して、App の名前を入れます。'
    : 'でこの端末の App を開き、Advanced の「Delete GitHub App」を押して、App の名前を入れます。';
}

// --- the App's installation tokens refused by GitHub (401, asked for again): said, with what to do (the App made
// again). Nothing the device keeps of the works is deleted until the author logs out (DESK-SEC-03)

function hideNotice() {
  $('token-notice').hidden = true;
}
gh.onRefused(() => {
  $('token-notice-text').textContent =
    'GitHub が GitHub App のトークンを拒否しました（秘密鍵が削除されたか、App がアンインストールされた可能性があります）。ログアウトしてから「GitHub App を作成して始める」で App を再作成してください。書いた文章はこの端末に残っています。';
  $('token-notice').hidden = false;
});

// the work in the address (#owner/name, as the server version's #作品: the page loaded again opens it again), else
// the list of works
async function openFirst() {
  const name = decodeURIComponent(location.hash.slice(1));
  const r = name ? (await worksHere()).find(x => x.full_name === name) : undefined;
  if (!r) return chooseRepo();
  await proposeAuthor(r.full_name);
  await desk.open(r);
}

/** @param {AppVault} v as kept @param {CryptoKey} key its key to sign with (opened) @param {import('./ui/github.js').App} [app] the one it was checked with */
function useApp(v, key, app = appOf(v.appId, key, v.author)) {
  kind = `app-${appFormOf(v)}`;
  gh.useApp(app);
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
  $('make-app').textContent = 'パスキーを作成しています…';
  try {
    const seal = await vault.appPasskey();
    $('app-paste-form').hidden = false;
    $('make-app').textContent = 'GitHub に移動しています…';
    await startManifest(seal);
  } catch (err) {
    $('app-make-error').textContent = err.message;
    resetMakeApp();
  }
}
// (left as it was while the page leaves for GitHub; put back when the author comes back to it, as Safari keeps it)
function resetMakeApp() {
  $('make-app').disabled = false;
  $('make-app').textContent = 'GitHub App を作成して始める';
}
addEventListener('pageshow', resetMakeApp);
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
      'このコードは、ここで始めた GitHub App のものではありません（1 時間を過ぎたかもしれません）。もう一度「GitHub App を作成して始める」を押してください';
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
  $('app-paste-form').hidden = true;
  loading('GitHub App を受け取っています…');
  try {
    const { appId, slug, key, lock } = await madeApp(code, p.seal);
    await checkLogin(await whoseApp(appOf(appId, key, null)));
    const v = await vault.keepApp({ appId, slug, author: null, ...lock });
    void keepStore();
    useApp(v, key);
    await installed(true);
  } catch (err) {
    show('setup');
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
  // (said in the band while GitHub is asked: DESK-OPS-05)
  if (!$('app-install').hidden) return busy('GitHub に確かめています…', () => installed(false));
  if (!$('setup').hidden && (await vault.keptApp())) await start();
}
// Who an App's commits are written by, when it is not known yet (an App made by the manifest flow): proposed from the
// latest commit of the work opened (or the account the App is installed on), kept at once, and shown with the way to
// change it, before anything is sent. Asked before the work is opened, so that it is shown before the text is, not
// once the author has started writing (said in the band while GitHub is asked: DESK-OPS-05). GitHub not saying it:
// nothing proposed this time
/** @param {string} repo */
async function proposeAuthor(repo) {
  const app = appInUse;
  if (!app || app.author) return;
  /** @type {{ author: { name: string, email: string } | null }} */
  const got = { author: null };
  await busy('作品を読み込んでいます…', async () => {
    try {
      /** @type {any[]} */
      let commits = [];
      try {
        commits = await gh.latest(repo);
      } catch {}
      got.author = authorOf(commits, await app.account(`/repos/${repo}/`));
    } catch {}
  });
  const author = got.author;
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

// 利用規約 (DESK-OPS-02): agreed to on this device on starting (the button pressed to make the App), and by one started
// before, when it is opened and they changed (their 版, data-version). Agreed to while this
// device's storage cannot be written: for this time the page is open
const TERMS = $('terms').dataset.version;
let agreedNow = false;
function agreed() {
  try {
    return agreedNow || localStorage.getItem('terms') === TERMS;
  } catch {
    return agreedNow;
  }
}
/** @type {(() => void) | null} what agreeing goes on with (none: read from the settings) */
let afterTerms = null;
/** @type {(() => void) | null} where 戻る goes (none: nothing to go back to, only agreeing) */
let backFromTerms = null;
/** @param {(() => void) | null} then @param {(() => void) | null} back */
function showTerms(then, back) {
  afterTerms = then;
  backFromTerms = back;
  $('agree-terms').hidden = !then;
  $('close-terms').hidden = !back;
  show('terms');
}
function agree() {
  agreedNow = true;
  try {
    localStorage.setItem('terms', /** @type {string} */ (TERMS));
  } catch {}
  // (at once, within the press: what it goes on with may make a passkey)
  afterTerms?.();
}
/** @param {() => void} go starting, the 利用規約 agreed to first on this device */
function agreeFirst(go) {
  if (agreed()) return go();
  showTerms(
    () => {
      show('setup');
      go();
    },
    () => show('setup'),
  );
}

async function start() {
  const back = returnOf(location.href);
  // (what GitHub gave back is not left in the address, nor in the history)
  if (location.search) history.replaceState(null, '', location.pathname);
  // (back from GitHub: agreed to where it was started; the page it came back to may be another one, as Safari)
  if (back) return cameBack(back);
  // (a device started with a token, before that way was taken away: the token deleted, said, and the first screen;
  // the drafts and the copies of the works kept, for the App made again by the same account, DESK-OPS-04)
  if (await vault.dropOldToken()) $('token-gone').hidden = false;
  const a = await vault.keptApp();
  if (!a) {
    show('setup');
    return showPaste();
  }
  // (started before the 利用規約 were agreed to here, or before they changed)
  if (!agreed()) return showTerms(() => void start(), null);
  const form = appFormOf(a);
  // (kept without a passkey: opened at once, what is read said until the next screen: DESK-OPS-05)
  if (form === 'local') {
    loading('作品を読み込んでいます…');
    return withApp(a, await vault.openApp(a));
  }
  kind = `app-${form}`;
  $('unlock-note').textContent = UNLOCK_APP[kind];
  show('unlock');
}

$('make-app').addEventListener('click', () => agreeFirst(() => void makeApp()));
$('app-paste-form').addEventListener('submit', e => void pasteCode(/** @type {SubmitEvent} */ (e)));
$('author-notice').addEventListener('submit', e => void changeAuthor(/** @type {SubmitEvent} */ (e)));
$('logout-install').addEventListener('click', () => void logOut($('logout-install')));
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
$('open-key').addEventListener('click', () => void openKey());
$('logout').addEventListener('click', () => void logOut($('logout')));
$('logout-unlock').addEventListener('click', () => void logOut($('logout-unlock')));
$('open-settings').addEventListener('click', () => void openSettings());
$('close-settings').addEventListener('click', () => void chooseRepo());
$('agree-terms').addEventListener('click', agree);
$('open-terms').addEventListener('click', () => showTerms(null, () => void openSettings()));
$('close-terms').addEventListener('click', () => backFromTerms?.());
wireWorks({ open: openRepo });
desk.wire({ changeRepo: () => void chooseRepo(), open: openRepo, relist: chooseRepo });
// the connection refused, said in the settings: logged out to make the App again (on the first screen: the passkey is
// made by the button pressed there)
$('relink').addEventListener('click', () => void logOut($('relink')));
$('token-notice-close').addEventListener('click', hideNotice);

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
  $('app-make-error').textContent = `この端末の保存場所を開けません（${err.message}）`;
});
