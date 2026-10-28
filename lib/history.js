// 履歴: the versions of an episode, from this device and from GitHub (no screen, no state of the app: tested by itself in
// tests/unit). This device keeps a version every 10 minutes of writing (FR-HIST-04), and the text before a version is
// put back (FR-HIST-03); GitHub has the commits that changed the file. The server version's public/ui/history.js shows
// the same, from the server's snapshots and commits

import { diffHtml } from './diff.js';
import { charsOf, esc, n, whenLong } from './format.js';

/** @typedef {{ at: number, text: string }} Snapshot a version kept on this device */
/**
 * A version as the list shows it: 未送信 (the draft), 自動 (kept on this device), GitHub (a commit; its text read when
 * opened), the newest first
 * @typedef {{ kind: 'here' | 'snapshot' | 'github', at: number, subject: string, text: string | null, ref: string }} Version
 */

export const SNAPSHOT_EVERY = 10 * 60 * 1000;
export const SNAPSHOTS_KEPT = 100;

// The versions kept after the text `text` written at `at`: one more when the last is 10 minutes old (or `force`: the
// text before a version is put back), and not the same text as the last; the oldest go past SNAPSHOTS_KEPT
/** @param {Snapshot[]} list @param {string} text @param {number} at @param {boolean} [force] @returns {Snapshot[]} */
export function snapshotted(list, text, at, force = false) {
  const last = list[list.length - 1];
  if (last && (last.text === text || (!force && at - last.at < SNAPSHOT_EVERY))) return list;
  return [...list, { at, text }].slice(-SNAPSHOTS_KEPT);
}
/**
 * The versions of a file, the newest first: its draft (not sent), the ones kept on this device, its commits on GitHub
 * (as the REST API lists them)
 * @param {{ draft: { text: string, at: number } | null, snapshots: Snapshot[], commits: { sha: string, commit: { message: string, committer: { date: string } } }[] }} o
 * @returns {Version[]}
 */
export function versionsOf({ draft, snapshots, commits }) {
  /** @type {Version[]} */
  const rest = [
    ...snapshots.map(s => ({ kind: /** @type {const} */ ('snapshot'), at: s.at, subject: '', text: s.text, ref: '' })),
    ...commits.map(c => ({
      kind: /** @type {const} */ ('github'),
      at: Date.parse(c.commit.committer.date) || 0,
      subject: c.commit.message.split('\n')[0],
      text: null,
      ref: c.sha,
    })),
  ].sort((a, b) => b.at - a.at);
  return draft ? [{ kind: 'here', at: draft.at, subject: '', text: draft.text, ref: '' }, ...rest] : rest;
}
// the draft of a file as its history shows it: a text written (not an operation's file with no text), else none
/** @param {{ text?: string, at: number } | undefined} d */
export const historyDraft = d => (d?.text !== undefined ? { text: d.text, at: d.at } : null);

// --- the screen 履歴 (ui/history.js)

const KIND = { here: '未送信', snapshot: '自動', github: 'GitHub' };
// The list of versions (FR-HIST-01): this device's (自動, 未送信) or GitHub's, as the server version's ローカル履歴 and
// GitHub 履歴, each with how many; why GitHub's are not there (`failed`, '' when they are); each version with when, its
// kind, and its length and the commit's subject (one of GitHub's not read yet: its subject only); none, said
/** @param {Version[]} versions @param {string} tab 'local' or 'github' @param {string} failed @param {string} what 話 or 資料 @param {number} [now] */
export function historyListHtml(versions, tab, failed, what, now = Date.now()) {
  const local = versions.filter(v => v.kind !== 'github'),
    remote = versions.filter(v => v.kind === 'github');
  const list = tab === 'local' ? local : remote;
  return (
    `<div class="history-tabs">
      <button data-tab="local" class="${tab === 'local' ? 'on' : ''}">ローカル履歴（${local.length}）</button>
      <button data-tab="github" class="${tab === 'github' ? 'on' : ''}">GitHub 履歴（${remote.length}）</button></div>` +
    (tab === 'github' && failed ? `<p class="error">GitHub の履歴を読めませんでした: ${esc(failed)}</p>` : '') +
    (list.length
      ? list
          .map(
            v =>
              `<button class="version" data-v="${versions.indexOf(v)}"><b>${esc(whenLong(v.at, now))}<span class="tag">${KIND[v.kind]}</span></b><small>${v.text === null ? esc(v.subject) : `${n(charsOf(v.text))} 字${v.subject ? ` ・ ${esc(v.subject)}` : ''}`}</small></button>`,
          )
          .join('')
      : tab === 'local'
        ? '<p class="muted small">まだローカルの履歴はありません。書いていると、10 分おきに自動で残ります。</p>'
        : failed
          ? ''
          : `<p class="muted small">GitHub にこの${esc(what)}の履歴はありません（まだ送っていません）。</p>`)
  );
}
/**
 * A version read (FR-HIST-02): its length and kind; its changes from the one before (`was`, null: none before), to the
 * text now, and its whole text, as `view` chooses (the others hidden); the button to put it back (FR-HIST-03)
 * @param {{ v: Version, i: number, text: string, before: Version | undefined, was: string | null, now: string, view: string, at?: number }} o
 */
export function versionHtml({ v, i, text, before, was, now, view, at = Date.now() }) {
  /** @type {(html: string, places: number) => string} */
  const shown = (html, places) => (places ? `<div class="diff">${html}</div>` : '');
  let changes;
  if (was == null) changes = '<p class="muted small">これより前の版はありません。</p>';
  else {
    const [html, places] = diffHtml(was, text);
    changes =
      `<p class="muted small">前の版（${esc(whenLong(/** @type {Version} */ (before).at, at))}、${n(charsOf(was))} 字）からこの版までの変更：${places ? `${places} か所` : 'ありません'}</p>` +
      shown(html, places);
  }
  const [nowHtml, nowPlaces] = diffHtml(text, now);
  const toNow =
    `<p class="muted small">この版から今の本文（${n(charsOf(now))} 字）までの変更：${nowPlaces ? `${nowPlaces} か所` : 'ありません'}</p>` +
    shown(nowHtml, nowPlaces);
  return `<div class="hist-head"><button class="ghost back-history">‹ 履歴</button>
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
