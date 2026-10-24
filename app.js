// The app: the token (put in once, opened with a passkey each time), the repository chosen, and the desk. No server:
// the page talks to GitHub's API only, and keeps what it needs on this device
import { esc } from './lib/format.js';
import { installHint, isIos } from './lib/install.js';
import { $, show, toast } from './ui/dom.js';
import * as store from './ui/db.js';
import * as desk from './ui/desk.js';
import * as gh from './ui/github.js';
import * as vault from './ui/vault.js';

/** @typedef {import('./ui/desk.js').Repo} Repo */

const KINDS = {
  prf: 'トークンはパスキー（PRF）から作った鍵で暗号化して、この端末に置いています。開くたびにパスキーを使います。',
  local:
    'このブラウザーはパスキーの PRF に対応していないため、トークンはこの端末の取り出せない鍵（WebCrypto）で暗号化して置いています。パスキーは使いません。この端末でこのブラウザーを開ける人は、トークンを使えます。',
};
/** @type {'prf' | 'local' | ''} */
let kind = '';

// --- the token

async function keepToken(/** @type {SubmitEvent} */ e) {
  e.preventDefault();
  const token = $('token').value.trim();
  $('setup-error').textContent = '';
  if (!token) return;
  $('keep-token').disabled = true;
  try {
    kind = await vault.keep(token);
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
async function forgetToken() {
  if (!confirm('トークンをこの端末から消します。未送信の書きかけは残ります。よろしいですか')) return;
  await vault.forget();
  gh.useToken('');
  kind = '';
  toast('トークンを消しました。パスキーはパスワードの管理に残っているので、要らなければそこで消してください');
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
  $('repos-error').textContent = '';
  $('repo-list').innerHTML = '<p class="muted small">読み込んでいます…</p>';
  try {
    const list = await gh.repos();
    $('repo-list').innerHTML =
      list
        .map(
          r =>
            `<button class="work" data-repo="${esc(r.full_name)}" data-branch="${esc(r.default_branch)}"><b>${esc(r.full_name)}</b><small>${r.private ? '非公開' : '公開'}・${esc(r.default_branch)}</small></button>`,
        )
        .join('') || '<p class="muted small">トークンで読めるリポジトリがありません。トークンの Repository access を確かめてください。</p>';
  } catch (err) {
    $('repo-list').innerHTML = '';
    $('repos-error').textContent = err.message;
  }
}

/** @param {string} token */
async function withToken(token) {
  gh.useToken(token);
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
  if (b instanceof HTMLElement) void openRepo({ full_name: /** @type {string} */ (b.dataset.repo), default_branch: /** @type {string} */ (b.dataset.branch) });
});
desk.wire({ changeRepo: () => void chooseRepo() });

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
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
void start();
