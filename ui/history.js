// 履歴: the versions of the open episode (this device's and GitHub's), each compared with the one before and with the
// text now, or read whole, and put back (FR-HIST-01〜04). From the server version's public/ui/history.js. Putting a
// version back writes it in the text box: a change not sent, as anything typed
import { diffHtml } from '../lib/diff.js';
import { charsOf, esc, n, whenLong } from '../lib/format.js';
import { bytesOf, textOf } from '../lib/github.js';
import { versionsOf } from '../lib/history.js';
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
const KIND = { here: '未送信', snapshot: '自動', github: 'GitHub' };

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
  const local = versions.filter(v => v.kind !== 'github'),
    remote = versions.filter(v => v.kind === 'github');
  const list = tab === 'local' ? local : remote;
  body().innerHTML =
    `<div class="history-tabs">
      <button data-tab="local" class="${tab === 'local' ? 'on' : ''}">ローカル履歴（${local.length}）</button>
      <button data-tab="github" class="${tab === 'github' ? 'on' : ''}">GitHub 履歴（${remote.length}）</button></div>` +
    (tab === 'github' && failed ? `<p class="error">GitHub の履歴を読めませんでした: ${esc(failed)}</p>` : '') +
    (list.length
      ? list
          .map(
            v =>
              `<button class="version" data-v="${versions.indexOf(v)}"><b>${esc(whenLong(v.at))}<span class="tag">${KIND[v.kind]}</span></b><small>${v.text === null ? esc(v.subject) : `${n(charsOf(v.text))} 字${v.subject ? ` ・ ${esc(v.subject)}` : ''}`}</small></button>`,
          )
          .join('')
      : tab === 'local'
        ? '<p class="muted small">まだローカルの履歴はありません。書いていると、10 分おきに自動で残ります。</p>'
        : failed
          ? ''
          : `<p class="muted small">GitHub にこの${esc(/** @type {HistoryOf} */ (of).what)}の履歴はありません（まだ送っていません）。</p>`);
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
  /** @type {(html: string, places: number) => string} */
  const shown = (html, places) => (places ? `<div class="diff">${html}</div>` : '');
  let changes;
  if (was == null) changes = '<p class="muted small">これより前の版はありません。</p>';
  else {
    const [html, places] = diffHtml(was, text);
    changes =
      `<p class="muted small">前の版（${esc(whenLong(before.at))}、${n(charsOf(was))} 字）からこの版までの変更：${places ? `${places} か所` : 'ありません'}</p>` +
      shown(html, places);
  }
  const now = who.now();
  const [nowHtml, nowPlaces] = diffHtml(text, now);
  const toNow =
    `<p class="muted small">この版から今の本文（${n(charsOf(now))} 字）までの変更：${nowPlaces ? `${nowPlaces} か所` : 'ありません'}</p>` +
    shown(nowHtml, nowPlaces);
  body().innerHTML = `<div class="hist-head"><button class="ghost back-history">‹ 履歴</button>
    <span class="muted small">${n(charsOf(text))} 字 ・ ${v.kind === 'github' ? 'GitHub' : v.kind === 'snapshot' ? '自動のスナップショット' : 'まだ送っていない版'}</span></div>
    <div class="history-tabs">${[
      ['before', '前と比べる'],
      ['now', '今と比べる'],
      ['text', '全文'],
    ]
      .map(([k, label]) => `<button data-view="${k}" class="${k === view ? 'on' : ''}">${label}</button>`)
      .join('')}</div>
    <div class="version-diff" data-for="before"${view === 'before' ? '' : ' hidden'}>${changes}</div>
    <div class="version-diff" data-for="now"${view === 'now' ? '' : ' hidden'}>${toNow}</div>
    <textarea class="version-text" readonly aria-label="この版の全文"${view === 'text' ? '' : ' hidden'}>${esc(text)}</textarea>
    <button class="primary restore-history" data-restore="${i}">この版を復元</button>`;
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
