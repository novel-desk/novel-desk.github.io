// 履歴: the versions of the open episode (this device's and GitHub's), each compared with the one before and with the
// text now, or read whole, and put back (FR-HIST-01〜04). From the server version's public/ui/history.js. Putting a
// version back writes it in the text box: a change not sent, as anything typed
import { esc, whenLong } from '../lib/format.js';
import { bytesOf, textOf } from '../lib/github.js';
import { historyListHtml, versionHtml, versionsOf } from '../lib/history.js';
import { $ } from './dom.js';
import * as gh from './github.js';
import * as store from './db.js';

/**
 * Whose history: the work's repository and branch, the file, its title, its draft (not sent), the versions kept on
 * this device, whether GitHub has it, the text in the box now, and how a version is put back
 * @typedef {{ repo: string, branch: string, path: string, title: string, draft: { text: string, at: number } | null,
 *   snapshots: import('../lib/history.js').Snapshot[], remote: boolean, now: () => string, restore: (text: string, at: number) => Promise<void>,
 *   what: string }} HistoryOf `what`: 話 or 資料
 */
/** @type {HistoryOf | null} */
let of = null;
/** @type {import('../lib/history.js').Version[]} */
let versions = [];
// a version shows its changes from the one before, to the text now, or the whole text
let view = 'before';
// the list shows this device's versions (自動, 未送信) or GitHub's, as the server version's ローカル履歴 and GitHub 履歴
let tab = 'local';
// why GitHub's versions are not there ('' when they are)
let failed = '';
const body = () => $('versions-body');
const dialog = () => /** @type {HTMLDialogElement} */ (/** @type {unknown} */ ($('versions')));

/** @param {HistoryOf} who */
export async function showHistory(who) {
  of = who;
  const dlg = dialog();
  $('versions-title').textContent = `「${who.title}」の履歴`;
  body().innerHTML = '<p class="muted">読み込み中…</p>';
  // (opened from a button outside the dialog, which is modal: never open already)
  dlg.showModal();
  let commits = [];
  failed = '';
  if (who.remote) {
    try {
      commits = await gh.commitsOf(who.repo, who.branch, who.path);
    } catch (err) {
      failed = err.message;
    }
  }
  if (of !== who) return;
  versions = versionsOf({ draft: who.draft, snapshots: who.snapshots, commits });
  renderList();
}
function renderList() {
  body().innerHTML = historyListHtml(versions, tab, failed, /** @type {HistoryOf} */ (of).what);
}
// a version's text: kept with it, or read from GitHub (the blob kept on the device by its sha)
/** @param {import('../lib/history.js').Version} v */
async function textOfVersion(v) {
  if (v.text !== null) return v.text;
  const who = /** @type {HistoryOf} */ (of);
  const got = await gh.fileAt(who.repo, who.path, v.ref);
  const bytes = bytesOf(got.content);
  await store.put('blobs', got.sha, bytes);
  const text = textOf(bytes);
  if (text === null) throw new Error('この版は文字コードが UTF-8 ではないため開けません');
  return (v.text = text);
}
/** @param {number} i */
async function showVersion(i) {
  const who = /** @type {HistoryOf} */ (of);
  const v = versions[i],
    before = versions[i + 1];
  body().innerHTML = '<p class="muted">読み込み中…</p>';
  let text, was;
  try {
    [text, was] = await Promise.all([textOfVersion(v), before ? textOfVersion(before) : null]);
  } catch (err) {
    body().innerHTML = `<p class="error">${esc(err.message)}</p>`;
    return;
  }
  if (of !== who) return;
  body().innerHTML = versionHtml({ v, i, text, before, was, now: who.now(), view });
}
/** @param {string} k */
function setView(k) {
  view = k;
  for (const b of /** @type {NodeListOf<HTMLElement>} */ (body().querySelectorAll('[data-view]'))) b.classList.toggle('on', b.dataset.view === k);
  for (const d of /** @type {NodeListOf<HTMLElement>} */ (body().querySelectorAll('.version-diff'))) d.hidden = d.dataset.for !== k;
  /** @type {HTMLElement} */ (body().querySelector('.version-text')).hidden = k !== 'text';
}
/** @param {number} i */
async function restore(i) {
  const who = /** @type {HistoryOf} */ (of);
  const v = versions[i];
  if (
    !confirm(
      `今の「${who.title}」を、この版（${whenLong(v.at)}）の内容に復元しますか？\n今の本文も、ローカル履歴に残ります。復元した本文は「送る」で GitHub に送ります。`,
    )
  )
    return;
  await who.restore(/** @type {string} */ (v.text), v.at);
  dialog().close();
}

export function wireHistory() {
  $('close-versions').addEventListener('click', () => dialog().close());
  $('versions').addEventListener('close', () => {
    of = null;
  });
  body().addEventListener('click', e => {
    const t = /** @type {HTMLElement} */ (e.target);
    const v = t.closest('[data-v]');
    if (v instanceof HTMLElement) return void showVersion(Number(v.dataset.v));
    const tb = t.closest('[data-tab]');
    if (tb instanceof HTMLElement) {
      tab = /** @type {string} */ (tb.dataset.tab);
      return renderList();
    }
    const k = t.closest('[data-view]');
    if (k instanceof HTMLElement) return setView(/** @type {string} */ (k.dataset.view));
    const r = t.closest('[data-restore]');
    if (r instanceof HTMLElement) return void restore(Number(r.dataset.restore));
    if (t.closest('.back-history')) renderList();
  });
}
