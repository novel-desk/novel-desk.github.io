// The app: the token (put in once, opened with a passkey each time), the repository chosen, and the desk. No server:
// the page talks to GitHub's API only, and keeps what it needs on this device
import { esc } from './lib/format.js';
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
async function chooseRepo() {
  show('repos');
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
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
void start();
