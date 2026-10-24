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
import { forgetDevice } from './ui/repo.js';

/** @typedef {import('./ui/desk.js').Repo} Repo */

const KINDS = {
  prf: 'トークンはパスキー（PRF）から作った鍵で暗号化して、この端末に置いています。開くたびにパスキーを使います。',
  local:
    'このブラウザーはパスキーの PRF に対応していないため、トークンはこの端末の取り出せない鍵（WebCrypto）で暗号化して置いています。パスキーは使いません。この端末でこのブラウザーを開ける人は、トークンを使えます。',
};
/** @type {'prf' | 'local' | ''} */
let kind = '';
/** @type {string} the token in use ('' none yet) */
let using = '';

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
  const v = await vault.kept();
  if (!v) return start();
  $('unlock-error').textContent = '';
  $('open-token').disabled = true;
  try {
    await withToken(await vault.open(v));
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
  const owner = await store.get('prefs', 'owner');
  const left = (await store.all('drafts')).length;
  if (left && owner && login && login !== owner) {
    if (
      !confirm(
        `この端末には、前のユーザーが GitHub に送っていない書きかけが ${left} 件残っています（中身は出しません）。消してから進みますか？（「キャンセル」なら、このトークンを保管しません）`,
      )
    ) {
      gh.useToken(using);
      throw new Error('前のユーザーの書きかけを残すため、このトークンを保管しませんでした。前のユーザーがトークンを入れ直すと送れます');
    }
    await forgetDevice(false);
  }
  if (login) await store.put('prefs', 'owner', login);
}
// The token forgotten (NFR-SEC-16): with it, what the device keeps of the works (the works last read, the blobs, the
// settings, the versions kept); the drafts not sent too, when the author says so
async function forgetToken() {
  if (!confirm('トークンをこの端末から消します。この端末に残した作品の控え・履歴・設定も消します。よろしいですか')) return;
  const left = (await store.all('drafts')).length;
  const dropDrafts =
    left > 0 &&
    confirm(
      `GitHub に送っていない書きかけが ${left} 件あります。この端末から消しますか？（「キャンセル」なら書きかけだけ残します。同じ GitHub のユーザーのトークンを入れ直すと送れます）`,
    );
  await vault.forget();
  await forgetDevice(left > 0 && !dropDrafts);
  await store.del('prefs', 'token-expires');
  hideNotice();
  gh.useToken('');
  using = '';
  kind = '';
  toast('トークンと、この端末に残した作品の控えを消しました。パスキーはパスワードの管理に残っているので、要らなければそこで消してください');
  show('setup');
}

// --- the repository

/** @param {Repo} r */
async function openRepo(r) {
  await store.put('prefs', 'repo', r);
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
  $('vault-kind').textContent = kind ? KINDS[kind] : '';
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
    `${text} GitHub のトークンの一覧でトークンを作り直し（Regenerate token）、新しい値を入れてください。書いたものはこの端末に残っています。`;
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
  showNotice('GitHub がトークンを断りました（期限が切れたか、消されたかもしれません）。');
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
    if (!$('desk').hidden) await api.reload();
    else if (!$('repos').hidden) await chooseRepo();
  } catch (err) {
    gh.useToken(before);
    $('token-replace-error').textContent = err.message;
  } finally {
    $('keep-new-token').disabled = false;
  }
}

/** @param {string} token */
async function withToken(token) {
  gh.useToken(token);
  using = token;
  await checkExpiry();
  const r = await store.get('prefs', 'repo');
  if (r) await desk.open(r);
  else await chooseRepo();
}
async function start() {
  const v = await vault.kept();
  kind = v?.kind ?? '';
  if (!v) return show('setup');
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
wireWorks();
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
$('install').addEventListener('click', async () => {
  if (!offer) return;
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
  if (b instanceof HTMLElement) setTheme(b.dataset.themePick ?? '');
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
void start();
