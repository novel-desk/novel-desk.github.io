// The desk: the table of contents of the work open, the episode being written, its preview, the episodes added,
// renamed, put in the trash and reordered, and sending and reading again. The work, the changes not sent and the
// episode open are this module's: the others call open() and the functions it gives them
import { moveFiles, rebase, relabel, settle, unsentList, withoutOp, writeFile } from '../lib/changes.js';
import { afterSend, draftKey, draftOf, goneWhileSent, sameVersion, typedOver } from '../lib/drafts.js';
import * as plans from '../lib/episodes.js';
import { charsOf, esc, n, rowTimes, whenLong } from '../lib/format.js';
import { imageType } from '../lib/github.js';
import { episodesOf, isEpisode, titleOf } from '../lib/layout.js';
import { isNote } from '../lib/notes.js';
import { picturePaths, relPath, renderMd } from '../lib/markdown.js';
import { keptBoth } from '../lib/merge.js';
import { noteHeading } from '../lib/notes.js';
import { editToml } from '../lib/tomledit.js';
import { AUTO_WAIT, keptMode, onOtherBranch, sendsItself, stamped, syncMode, writtenOn } from '../lib/sync.js';
import {
  afterTrash,
  briefOf,
  changedKey,
  episodeAfter,
  episodeToOpen,
  footState,
  hasConflict,
  neighborOf,
  readSaid,
  readText,
  sendButton,
  shownText,
  unsentCount,
  updatedOf,
} from '../lib/desk.js';
import { viewOf } from '../lib/view.js';
import { visibilityTag } from '../lib/works.js';
import { $, busy as withBand, show, toast } from './dom.js';
import * as store from './db.js';
import { bytes, contents, converted, load, lookOf, readShas } from './work.js';
import { Overlapped, sendAll } from './send.js';
import { GitHubError, headOf, lastChange } from './github.js';
import { evenBreaks, inputBar, insertAt, setKeepingCaret } from './textbox.js';
import { showHistory, wireHistory } from './history.js';
import { pickImage } from './images.js';
import { api } from './shared.js';
import { followNote, readInNotes, wireNotes } from './notes.js';
import { openPlot, renderPlotPanel, wirePlot } from './plot.js';
import { openCharacters, wireCharacters } from './characters.js';
import { noteToday, wireRecord } from './record.js';
import { wireReleases } from './releases.js';
import { hide as hideSideNote, renderSideNote, wireSideNote } from './sidenote.js';
import { snapshotted } from '../lib/history.js';
import { previewPlace, reading, showPreviewAt, stopReading, togglePreview, wireReading } from './reading.js';
import { wireBranches } from './branches.js';
import { wireUnsent } from './unsent.js';
import { trace, traceFailed, traceWith } from './trace.js';
import { forgetWork, keepWork, locate, moveRepo, relink, startWork, titleFor, wireRepo } from './repo.js';

/** @typedef {import('../lib/drafts.js').Draft} Draft */
/** @typedef {import('../lib/tomledit.js').TomlEdit & { op: string }} Edit a key of novel.toml set by an operation */
/** @typedef {{ full_name: string, default_branch: string, visibility?: string }} Repo */

/** @type {Repo | null} */
let repo = null;
/** @type {import('./work.js').Work | null} */
let work = null;
/** @type {Map<string, Draft>} the changes of this work not sent, by path */
let drafts = new Map();
/** @type {Edit[]} novel.toml's keys set and not sent */
let edits = [];
/** @type {import('../lib/view.js').View | null} the work as shown: what was read, the changes over it */
let view = null;
// the episode open ('' = none)
let current = '';
// how many times an episode (or none) was opened: the text box is set each time (reloadHeld)
let opens = 0;
let busy = false;
// a work being opened (open(): until it is read the first time)
let opening = false;
/** @type {Set<string>} the files whose changes a send failed to deliver (FR-SAVE-07), until one goes */
let failed = new Set();
/** @type {import('../lib/works.js').RepoMeta | null} another repository under the work's name (FR-GH-12): not sent to */
let stopped = null;
/** @type {import('../lib/sync.js').SyncMode} how this work is sent (FR-GH-04), kept on the device for each work */
let mode = 'auto';
// 「並べ替え」 on: the rows show ↑↓, the chapter to move to, and can be dragged
let ordering = false;
/** @type {Map<string, string>} the object URLs of the pictures shown, by blob */
const pictures = new Map();
/** @type {Map<string, number>} when an episode was last changed on GitHub (its last commit), by path and blob: kept on
 * the device for each work, so that it is asked once for each version of an episode */
let changed = new Map();
// the changes written to the device one after another, so that the last one typed is the one kept
let writing = Promise.resolve();

/** @param {string} text @param {'' | 'ok' | 'err'} [kind] */
function syncState(text, kind = '') {
  const s = $('sync-state');
  s.textContent = text;
  s.className = `sync-state ${kind}`;
  // an error opens the folded リリース・GitHub・その他 (as the server version's)
  if (kind === 'err') /** @type {HTMLDetailsElement} */ (/** @type {unknown} */ ($('toc-more'))).open = true;
  brief();
}
// the state in a word on the folded line (as the server version's 「・push 済み」)
function brief() {
  const b = $('sync-brief');
  const bad = $('sync-state').classList.contains('err') || failed.size > 0;
  b.className = bad ? 'small err' : 'muted small';
  b.textContent = briefOf({ read: Boolean(work), mode, bad, unsent: unsent() });
}
const shown = () => /** @type {import('../lib/view.js').View} */ (view);
/** @param {string} path */
const textOf = path => shown().texts[path] ?? null;
const episodes = () => episodesOf(shown().toc);
const episodePaths = () => episodes().map(e => e.path);
/** @param {string} rel */
const titleAt = rel => titleOf(shown().layout, rel, shown().headings);
/** @param {string} path */
const findEpisode = path => episodes().find(e => e.path === path);
// the work as the plans of lib/episodes.js take it
/** @returns {import('../lib/episodes.js').Shown} */
const forPlans = () => ({ layout: shown().layout, toc: shown().toc, files: Object.keys(shown().files), headings: shown().headings, textOf });
function refreshView() {
  view = viewOf(/** @type {NonNullable<typeof work>} */ (work), drafts, edits);
}

// --- the changes kept on the device

/** @param {Map<string, Draft>} given @param {Edit[]} [nextEdits] */
function keep(given, nextEdits = edits) {
  const w = /** @type {NonNullable<typeof work>} */ (work);
  const before = drafts;
  // (each change new or changed kept with the branch it was written on and the work's mode: lib/sync.js stamped)
  const next = new Map([...given].map(([path, d]) => [path, before.get(path) === d ? d : stamped(d, before.get(path), w.branch, mode)]));
  drafts = next;
  const editsChanged = nextEdits !== edits;
  edits = nextEdits;
  const kept = edits;
  writing = writing
    .then(async () => {
      for (const [path, d] of next) if (before.get(path) !== d) await store.put('drafts', draftKey(w.repo, path), d);
      // (a draft gone, sent or given up: deleted only while the device keeps the version this page wrote; another
      // tab's written since stays, lib/drafts.js sameVersion)
      for (const [path, d] of before) if (!next.has(path)) await store.delIf('drafts', draftKey(w.repo, path), v => sameVersion(v, d));
      if (editsChanged) await store.put('prefs', `edits:${w.repo}`, kept);
    })
    .catch(saveFailed);
  refreshView();
  sendSoon();
}
/** @param {any} err */
const saveFailed = err => syncState(`この端末に保存できませんでした（${err.message ?? err}）`, 'err');
// a write to the device after the ones before it (a text set aside, or taken back)
/** @param {() => Promise<unknown>} write */
const thenWrite = write => {
  writing = writing.then(async () => void (await write())).catch(saveFailed);
};
// a change not sent given up by hand (FR-SAVE-09): a text written alone (by its path), or an operation (its changes
// and keys; the text written in its files stays as a draft). The open episode is shown again, or the first
/** @param {import('../lib/changes.js').Unsent} item */
async function discard(item) {
  if (item.kind === 'op') {
    const left = withoutOp(drafts, edits, item.op);
    keep(left.changes, left.edits);
    park(left.parked, TAKEN);
  } else {
    const next = new Map(drafts);
    next.delete(item.path);
    keep(next);
  }
  renderWork();
  const open = episodeToOpen(episodePaths(), current);
  if (open) await openEpisode(open);
  else openNone();
}
const unsent = () => unsentCount(drafts, edits);

// --- the table of contents

// the screens of the work (資料, プロット, キャラ, 記録, リリース): not until it is read (the branches and 一覧から外す
// say what they need when it is not)
const WORK_TOOLS = ['open-notes', 'open-plot', 'open-characters', 'open-record', 'name-version', 'open-versions'];
function renderToc() {
  const v = shown();
  const w = /** @type {NonNullable<typeof work>} */ (work);
  const closed = new Set(/** @type {string[]} */ (folded));
  const chapters = v.toc.filter(it => it.type === 'chapter');
  /** @param {'episode' | 'chapter'} kind @param {string} path @param {string} [inChapter] */
  const tools = (kind, path, inChapter = '') =>
    `<span class="order-tools">${kind === 'chapter' ? `<button data-rename-chapter="${esc(path)}" title="章の題名を変更" aria-label="章の題名を変更">✎</button>` : ''}<button data-move="-1" data-path="${esc(path)}" aria-label="上へ">↑</button><button data-move="1" data-path="${esc(path)}" aria-label="下へ">↓</button>${
      kind === 'episode' && chapters.length
        ? `<select data-to-chapter data-path="${esc(path)}" aria-label="移動先の章"><option value="">章なし</option>${chapters
            .map(c => `<option value="${esc(c.path)}"${inChapter === c.path ? ' selected' : ''}>${esc(titleAt(c.rel))}</option>`)
            .join('')}</select>`
        : ''
    }</span>`;
  /** @param {import('../lib/layout.js').TocEpisode} e @param {string} [inChapter] */
  const episode = (e, inChapter) => {
    const text = textOf(e.path) ?? '';
    const tags =
      (drafts.has(e.path) ? '<span class="unsent-tag">未送信</span>' : '') +
      (hasConflict(text) ? '<span class="conflict" title="両方の版が並んでいます。「――― ここから」の行を整理してください">競合</span>' : '');
    return `<div class="node episode${e.path === current ? ' active' : ''}" role="button" tabindex="0" data-path="${esc(e.path)}" data-node="${esc(e.path)}" draggable="${ordering}"><span class="t">${esc(titleAt(e.rel))}</span>${tags}<span class="u"></span><span class="c">${n(charsOf(text))}</span>${tools('episode', e.path, inChapter)}</div>`;
  };
  const chars = (/** @type {import('../lib/layout.js').TocEpisode[]} */ list) => list.reduce((sum, e) => sum + charsOf(textOf(e.path) ?? ''), 0);
  $('tree').innerHTML = v.toc
    .map(it =>
      it.type === 'episode'
        ? episode(it)
        : `<div class="node chapter" role="button" tabindex="0" data-fold="${esc(it.path)}" data-node="${esc(it.path)}" draggable="${ordering}"><span class="fold">${closed.has(it.path) ? '▸' : '▾'}</span><span class="t">${esc(titleAt(it.rel))}</span><span class="c">${n(chars(it.episodes))}</span>${tools('chapter', it.path)}</div><div class="chapter-body${closed.has(it.path) && !it.episodes.some(e => e.path === current) ? ' closed' : ''}">${it.episodes.map(e => episode(e, it.path)).join('')}</div>`,
    )
    .join('');
  $('toc').classList.toggle('reorder', ordering);
  $('toggle-reorder').textContent = ordering ? '完了' : '並べ替え';
  $('work-chars').textContent = n(chars(episodes()));
  $('work-count').textContent = n(episodes().length);
  $('work-updated').textContent = whenLong(Math.max(w.updated || 0, ...[...drafts.values()].map(d => d.at)));
  $('work-branch').textContent = w.branch;
  // the repository, its page on GitHub, and whether it is public (FR-GH-11)
  $('work-repo').innerHTML =
    `<a href="https://github.com/${esc(w.repo)}/tree/${esc(encodeURIComponent(w.branch))}" target="_blank" rel="noopener">${esc(w.repo)}</a>${visibilityTag(/** @type {Repo} */ (repo))}`;
  $('gh-relink').hidden = !stopped;
  $('open-unsent').hidden = unsent() === 0 && !parked.length;
  showParked();
  if (document.activeElement !== $('work-title')) $('work-title').value = v.layout.title || w.repo.split('/')[1];
  // 送る and マージ: not shown when the work is not synced (as the server version's push and マージ); 「…」 while it sends
  $('send').hidden = $('gh-merge').hidden = mode === 'off';
  // (nothing to send: not pressed. It looks the same as the server version's push either way)
  const button = sendButton({ busy, unsent: unsent(), stopped: Boolean(stopped), mode });
  $('send').disabled = button.disabled;
  $('send').textContent = button.text;
  // the same, under the text (B6)
  $('send-foot').hidden = !button.foot;
  /** @type {HTMLButtonElement} */ ($('send-foot')).disabled = button.disabled;
  $('sync-mode').value = mode;
  brief();
  for (const id of ['add-episode', 'add-chapter', 'toggle-reorder', 'trash-episode']) $(id).disabled = busy;
  for (const id of WORK_TOOLS) $(id).disabled = false;
  $('prev-episode').disabled = !neighbor(-1);
  $('next-episode').disabled = !neighbor(1);
  paintTimes();
  watchRows();
}
/** @type {string[]} the chapters folded, by path (kept on the device for each work: FR-TOC-07) */
let folded = [];

// --- the episode open

/** @param {number} d @returns {{ path: string, title: string } | null} */
function neighbor(d) {
  const eps = episodes();
  const path = neighborOf(
    eps.map(e => e.path),
    current,
    d,
  );
  const e = eps.find(x => x.path === path);
  return e ? { path: e.path, title: titleAt(e.rel) } : null;
}
function showCounts() {
  const text = $('body').value;
  $('episode-chars').textContent = current ? n(charsOf(text)) : '0';
  const w = work;
  // (both versions side by side: said there instead, as the server version's)
  $('save-state').textContent = footState({
    text,
    open: Boolean(current),
    draft: drafts.has(current),
    failed: failed.has(current),
    onGitHub: Boolean(w && !w.offline && mode !== 'off' && w.blobs[current]),
  });
}
// 最終更新 of an episode (lib/desk.js updatedOf)
/** @param {string} path */
const updated = path => updatedOf(drafts, /** @type {NonNullable<typeof work>} */ (work).blobs, changed, path);
// 最終更新 of the open episode (FR-EDIT-02), asked of GitHub when it is not known yet
function showUpdated() {
  const ms = updated(current);
  $('episode-updated').textContent = current && ms ? `最終更新 ${whenLong(ms)}` : '';
  if (current && !ms) ask(current);
}
// 最終更新 on the rows of the table of contents, where it tells one row from the others (as the server version's)
function paintTimes() {
  const said = rowTimes(Object.fromEntries(episodes().map(e => [e.path, updated(e.path)])));
  for (const u of /** @type {NodeListOf<HTMLElement>} */ ($('tree').querySelectorAll('.node.episode .u')))
    u.textContent = said[/** @type {string} */ (/** @type {HTMLElement} */ (u.parentElement).dataset.path)];
  showUpdated();
}
// The last commits of the episodes, asked of GitHub lazily: a row when it comes into sight, the open episode when it
// opens; a few at a time, once for each blob (the answers kept on the device for each work)
/** @type {{ repo: string, branch: string, path: string, key: string }[]} */
const asks = [];
/** @type {Set<string>} the keys asked and not answered yet */
const asking = new Set();
let askers = 0;
/** @param {string} path */
function ask(path) {
  const w = /** @type {NonNullable<typeof work>} */ (work);
  const b = w.blobs[path];
  if (!b || w.offline || drafts.has(path)) return;
  const key = changedKey(path, b.sha);
  if (changed.has(key) || asking.has(key)) return;
  asking.add(key);
  asks.push({ repo: w.repo, branch: w.branch, path, key });
  while (askers < 3 && asks.length) void answerAsks();
}
async function answerAsks() {
  askers++;
  for (let job; (job = asks.shift());) {
    let ms = 0;
    try {
      ms = await lastChange(job.repo, job.branch, job.path);
    } catch {}
    asking.delete(job.key);
    const w = work;
    if (!ms || !w || w.repo !== job.repo) continue;
    changed.set(job.key, ms);
    paintTimes();
    // (only the keys of the files there now are kept)
    const keys = new Set(Object.entries(w.blobs).map(([p, b]) => changedKey(p, b.sha)));
    await store.put('prefs', `changed:${w.repo}`, Object.fromEntries([...changed].filter(([k]) => keys.has(k))));
  }
  askers--;
}
/** @type {IntersectionObserver | null} the rows whose last commit is not known yet, asked when they come into sight */
let sight = null;
function watchRows() {
  sight?.disconnect();
  for (const row of /** @type {NodeListOf<HTMLElement>} */ ($('tree').querySelectorAll('.node.episode')))
    if (!updated(/** @type {string} */ (row.dataset.path))) sight?.observe(row);
}
// (`shut`: the table of contents, a drawer on a phone, closed: the author chose the episode. A work read again, or
// read in, opens it without closing the drawer, which the author may have opened meanwhile: tests/ui/touch.spec.mjs)
/** @param {string} path @param {boolean} [shut] @returns {Promise<boolean>} */
async function openEpisode(path, shut = true) {
  const w = /** @type {NonNullable<typeof work>} */ (work);
  current = path;
  opens++;
  // (an episode of the table of contents: the callers open one of its rows)
  const e = /** @type {import('../lib/layout.js').TocEpisode} */ (findEpisode(path));
  const text = textOf(path);
  const area = /** @type {HTMLTextAreaElement} */ ($('body'));
  area.value = text ?? '';
  area.disabled = text === null;
  area.scrollTop = 0;
  $('episode-title').value = titleAt(e.rel);
  stopReading();
  showCounts();
  const note = $('episode-note');
  note.hidden = text !== null;
  note.textContent =
    text !== null ? '' : w.offline ? 'この話はまだこの端末に読み込まれていません（つながってから開いてください）' : '文字コードが UTF-8 ではないため開けません';
  if (shut) $('desk').classList.remove('toc-open');
  renderToc();
  showUpdated();
  void renderPlotPanel();
  void renderSideNote();
  await store.put('prefs', `episode:${w.repo}`, path);
  return text !== null;
}
// no episode open (none in the work, or the open one put in the trash)
function openNone() {
  current = '';
  opens++;
  $('body').value = '';
  /** @type {HTMLTextAreaElement} */ ($('body')).disabled = true;
  $('episode-title').value = '';
  $('episode-updated').textContent = '';
  $('episode-note').hidden = true;
  stopReading();
  showCounts();
  renderToc();
  // (as the server version's: said in the foot)
  $('save-state').textContent = '話がありません。「＋ 話を追加」で追加してください';
  void renderPlotPanel();
  void renderSideNote();
}
// a text written in a file of the work (the episode typed, a note): kept on the device at once, with the blob it was
// written from; a version of it kept every 10 minutes of writing
/** @param {string} path @param {string} text */
function keepText(path, text) {
  const w = /** @type {NonNullable<typeof work>} */ (work);
  const before = drafts.get(path);
  const next = new Map(drafts);
  /** @type {Draft | null} */
  let draft;
  if (before?.op) draft = typedOver(before, text, Date.now());
  else draft = draftOf({ repo: w.repo, path, base: before?.base ?? w.blobs[path]?.sha ?? '', read: remoteText(path), text, at: Date.now() });
  if (draft) next.set(path, draft);
  else next.delete(path);
  keep(next);
  void snapshot(path, text, false);
  noteSoon();
}
// what was typed in the episode: a key, a letter of a word being converted (an input method), the word converted
/** @param {'Type' | 'Compose' | 'Converted'} step */
function typed(step) {
  keepText(current, $('body').value);
  showCounts();
  renderToc();
  showUpdated();
  void trace(step, { composing: step === 'Compose' });
}
// 記録: the work's length today, noted on the device a moment after the last key (and when it is read and sent)
/** @type {ReturnType<typeof setTimeout> | undefined} */
let noteTimer;
const noteSoon = () => {
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => void noteNow(), 2000);
};
// (none when no work is read: another work being opened, its note from the one before not written)
const noteNow = async () => {
  if (work)
    await noteToday(
      work.repo,
      episodes().reduce((sum, e) => sum + charsOf(textOf(e.path) ?? ''), 0),
    );
};
// the text of a file as read from GitHub ('' when it is not there, or not read)
/** @param {string} path */
function remoteText(path) {
  return readText(/** @type {NonNullable<typeof work>} */ (work), path);
}
// 履歴: a version of the episode kept on this device every 10 minutes of writing (or `force`: before one is put back)
/** @type {Map<string, import('../lib/history.js').Snapshot[]>} */
const snaps = new Map();
/** @param {string} path @param {string} text @param {boolean} force */
async function snapshot(path, text, force) {
  const key = `snap:${/** @type {NonNullable<typeof work>} */ (work).repo}\n${path}`;
  const list = snaps.get(key) ?? (await store.get('prefs', key)) ?? [];
  const next = snapshotted(list, text, Date.now(), force);
  snaps.set(key, next);
  if (next !== list) await store.put('prefs', key, next);
  return next;
}
/** @param {string} path */
async function snapshots(path) {
  const key = `snap:${/** @type {NonNullable<typeof work>} */ (work).repo}\n${path}`;
  return snaps.get(key) ?? (await store.get('prefs', key)) ?? [];
}
async function openHistory() {
  const w = /** @type {NonNullable<typeof work>} */ (work);
  const path = current,
    e = findEpisode(path);
  if (!e) return;
  const d = drafts.get(path);
  await showHistory({
    repo: w.repo,
    branch: w.branch,
    path,
    title: titleAt(e.rel),
    what: '話',
    draft: d?.text !== undefined ? { text: d.text, at: d.at } : null,
    snapshots: await snapshots(path),
    remote: Boolean(w.blobs[path]),
    now: () => $('body').value,
    restore: async (text, at) => {
      if (current !== path) return;
      await snapshot(path, $('body').value, true);
      setKeepingCaret(/** @type {HTMLTextAreaElement} */ ($('body')), text);
      // (the text put back is shown: the preview was of the text before)
      stopReading();
      typed('Type');
      toast(`「${titleAt(e.rel)}」を ${whenLong(at)} の版に復元しました（送るまではこの端末だけの変更です）`);
    },
  });
}

// --- the operations on episodes and chapters: kept as changes not sent (lib/changes.js), sent with the texts

const newOp = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
// an operation's plan made changes: the files moved and written, novel.toml's keys set. The open episode goes where it
// moved (or to `open`). False when it cannot be kept (said in a toast)
/**
 * @param {import('../lib/episodes.js').Plan} plan @param {string} [open] the episode to open afterwards
 * @param {boolean} [stay] the open episode stays as it is in the text box (a picture added to it)
 */
async function apply(plan, open, stay = false) {
  // (not while a send is on its way: its end would take the changes it sent from under the operation: formal/Rebase.tla)
  if (busy) {
    toast('送っている間は、話の追加・名前の変更・削除・並べ替えはできません。送り終わってからやり直してください');
    return false;
  }
  const w = /** @type {NonNullable<typeof work>} */ (work);
  const op = newOp(),
    at = Date.now();
  const opEdits = plan.edits.map(e => ({ ...e, op }));
  // (novel.toml must take the keys: a file it cannot read is not changed)
  const checked = editToml(w.config ?? '', [...edits, ...opEdits]);
  if (checked.text === null) {
    toast(checked.error);
    return false;
  }
  let { changes, merged } = moveFiles(w.blobs, drafts, plan.moves, { repo: w.repo, op, at });
  for (const { path, text, bytes: put, bound } of plan.writes) {
    const there = shown().files[path] && !plan.moves.some(m => m[1] === path);
    if (text !== undefined && !bound && there && !changes.get(path)?.op) {
      // a text written into a file of the branch (a heading renamed): a draft of it, as when typed
      const d = draftOf({ repo: w.repo, path, base: changes.get(path)?.base ?? w.blobs[path].sha, read: remoteText(path), text, at });
      if (d) changes.set(path, d);
      else changes.delete(path);
      continue;
    }
    const made = writeFile(w.blobs, changes, path, put ? { bytes: put } : { text, ...(bound && { auto: true }) }, { repo: w.repo, op, at });
    changes = made.changes;
    for (const m of made.merged) merged.add(m);
  }
  keep(changes, [...relabel(edits, merged, op), ...opEdits]);
  if (stay) {
    renderToc();
    return true;
  }
  const moved = plan.moves.find(m => m[0] === current)?.[1];
  const next = episodeAfter({ paths: episodePaths(), current, open, moved });
  // the episode open is still the one open (it or others renamed, moved, added): the preview open stays, where it was
  // read (as the server version's renderToc)
  const place = reading() && (next === current || next === moved) ? previewPlace() : null;
  if (next) await openEpisode(next);
  else openNone();
  if (place) await showPreviewAt(place);
  return true;
}
// a plan made, or why it cannot be (said in a toast)
/** @param {() => import('../lib/episodes.js').Plan} make */
function planned(make) {
  try {
    return make();
  } catch (err) {
    toast(err.message);
    return null;
  }
}
async function addEpisode() {
  const chapter = shown().toc.find(it => it.type === 'chapter' && it.episodes.some(e => e.path === current));
  const plan = planned(() => plans.addEpisode(forPlans(), chapter?.path ?? '', '新しい話'));
  if (plan && (await apply(plan, plan.path))) $('episode-title').select();
}
async function addChapter() {
  const title = prompt('章のタイトル', '新しい章');
  if (title === null) return;
  const plan = planned(() => plans.addChapter(forPlans(), title));
  if (plan) await apply(plan, plan.path);
}
async function renameEpisode() {
  const title = $('episode-title').value;
  const e = findEpisode(current);
  if (!e || title === titleAt(e.rel)) return;
  const plan = planned(() => plans.rename(forPlans(), current, title));
  if (!plan || !(await apply(plan, plan.path))) $('episode-title').value = titleAt(e.rel);
  else await trace('Rename');
}
/** @param {string} path */
async function renameChapter(path) {
  const it = /** @type {import('../lib/layout.js').TocItem} */ (shown().toc.find(c => c.path === path));
  const now = titleAt(it.rel);
  const title = prompt('章の題名', now);
  if (title === null || !title.trim() || title === now) return;
  const plan = planned(() => plans.rename(forPlans(), path, title));
  if (plan) await apply(plan);
}
async function trashEpisode() {
  const e = findEpisode(current);
  if (
    !e ||
    !confirm(
      `「${$('episode-title').value}」を削除しますか？（作品の _trash/ フォルダに移動します。完全には消えません。GitHub に送るのは「送る」を押したときです）`,
    )
  )
    return;
  const next = afterTrash(episodePaths(), current);
  const plan = plans.trash(forPlans(), current, Date.now());
  // (no key of novel.toml to set that it could not take: the trash only takes away the titles novel.toml has)
  if (await apply(plan, next)) toast('削除しました（_trash/ に移動。送るまではこの端末だけの変更です）');
}
/** @param {import('../lib/episodes.js').OrderItem[] | null} want */
async function sendOrder(want) {
  if (!want) return;
  const plan = planned(() => plans.reorder(forPlans(), want));
  if (plan) await apply(plan, current ? plans.placeAfter(shown().layout, want, current) : undefined);
}
async function renameWork() {
  const title = $('work-title').value.trim();
  // (nothing to keep: the title shown again, the field still focused, as the server version's)
  if (!title || title === shown().layout.title)
    return void ($('work-title').value = shown().layout.title || /** @type {NonNullable<typeof work>} */ (work).repo.split('/')[1]);
  await apply({ moves: [], writes: [], edits: [{ key: ['title'], value: title }], path: '' });
}

// --- the preview: the pictures read from GitHub (or the device), shown by object URLs

async function draw() {
  const text = $('body').value;
  for (const path of picturePaths(text, current)) await pictureUrl(path);
  return renderMd(text, current, path => pictures.get(pictureKey(path)) ?? '');
}
// a picture shown by its blob, or (added on this device, not sent) by its bytes
/** @param {string} path */
const pictureKey = path => {
  const c = drafts.get(path);
  return c?.bytes ? `here:${path}:${c.at}` : (shown().files[path]?.sha ?? '');
};
// the object URL of a picture of the work ('' when it cannot be read)
/** @param {string} path @returns {Promise<string>} */
async function pictureUrl(path) {
  const w = /** @type {NonNullable<typeof work>} */ (work);
  const key = pictureKey(path);
  if (!key || pictures.has(key)) return pictures.get(key) ?? '';
  try {
    const c = drafts.get(path);
    const got = c?.bytes ?? (w.offline ? await store.get('blobs', key) : await bytes(w.repo, key));
    if (got) pictures.set(key, URL.createObjectURL(new Blob([got], { type: imageType(path) })));
  } catch {}
  return pictures.get(key) ?? '';
}
// the texts of files of the work as shown (the changes not sent first), read when the device does not have them yet
// (null: not there, not UTF-8, or not on the device offline)
/** @param {string[]} paths @returns {Promise<Record<string, string | null>>} */
async function texts(paths) {
  const w = /** @type {NonNullable<typeof work>} */ (work);
  const files = shown().files;
  await readShas(
    w,
    paths.flatMap(p => (files[p]?.sha ? [files[p].sha] : [])),
  );
  /** @type {Record<string, string | null>} */
  const out = {};
  for (const p of paths) out[p] = shownText(w, files, drafts, p);
  return out;
}
// a picture added to the open episode where the caret is: made small, put in the pictures folder, ![](…) written
function insertImage() {
  const path = current;
  if (!path) return;
  pickImage(async (file, put) => {
    if (current !== path) return;
    // (no key of novel.toml to set: kept)
    if (!(await apply({ moves: [], writes: [{ path: file, bytes: put }], edits: [], path: file }, undefined, true))) return;
    insertAt(/** @type {HTMLTextAreaElement} */ ($('body')), `\n![](${relPath(path, file)})\n`);
    toast('画像を挿入しました（送るまではこの端末だけの変更です）');
  });
}

// --- reading and sending

/** @param {string} when */
const readState = when => {
  const said = readSaid({ mode, offline: Boolean(work?.offline), when });
  syncState(said.text, said.kind);
};
const now = () => new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

function renderWork() {
  const problems = $('layout-problems');
  problems.hidden = shown().problems.length === 0;
  problems.innerHTML = shown()
    .problems.map(p => `<p>${esc(p)}</p>`)
    .join('');
  renderToc();
}
// the texts of the files moved by the changes not sent, read when the device does not have them yet
async function readMoved() {
  const w = /** @type {NonNullable<typeof work>} */ (work);
  await readShas(
    w,
    [...drafts.values()].flatMap(d => (d.sha && d.text === undefined ? [d.sha] : [])),
  );
}
// the changes on the work read again: the operations whose files changed elsewhere are given up (their texts stay)
// The texts written whose file is gone, or is another file now, set aside (lib/changes.js settle; `before`: the files
// the changes were read against until now, and novel.toml then). Returns how many were set aside
/** @param {{ blobs: import('../lib/changes.js').Blobs, config: string | null }} before */
async function rebaseChanges(before) {
  const w = /** @type {NonNullable<typeof work>} */ (work);
  if (w.offline) return 0;
  const { changes, ops, parked: homeless } = rebase(drafts, w.blobs);
  const settled = settle(changes, before.blobs, w.blobs, await lookOf(w.repo, [...changes.values()], before, w, false));
  const { changes: left, parked: moved } = settled;
  if (!ops.size && !moved.length && !settled.moved.length) return 0;
  keep(
    left,
    edits.filter(e => !ops.has(e.op)),
  );
  follow(settled.moved);
  if (ops.size) {
    syncState(
      'ほかの所でファイルが変わっていたので、この端末の話の追加・名前の変更・削除・並べ替えを取り消しました。書いた文章は残っています。やり直してください',
      'err',
    );
    toast('ほかの所での変更と重なった操作を取り消しました（書いた文章は残っています）');
  }
  park(homeless, TAKEN);
  park(moved, MOVED);
  return homeless.length + moved.length;
}
// --- the texts set aside (FR-SAVE-09): written where the file is gone now, or is another file. Kept on the device (in
// the drafts' store, by their own keys) until the author sends them, puts them in the text open, or gives them up

/** @type {Draft[]} this work's texts set aside */
let parked = [];
/** @param {Draft} d its key: of its repository and path, and its own id (two can be set aside from one path) */
const parkedKey = d => `parked:${draftKey(d.repo, d.path)}\n${d.aside}`;
// why a text is set aside (said on the screen and in the list)
const MOVED = 'ほかの所で削除されたか、別のファイルに替わっていた';
const TAKEN = '取り消した操作の中で書いた文章で、元の場所にも今の場所にも別の書きかけがあった';
// what a text set aside is called: its heading, else its file
/** @param {Draft} d */
const parkedName = d => noteHeading(/** @type {string} */ (d.text)) ?? d.path;
/** @param {Draft[]} list @param {string} why */
function park(list, why) {
  if (!list.length) return;
  for (const d of list) {
    const p = { ...d, parked: why, aside: newOp() };
    parked = [...parked, p];
    thenWrite(() => store.put('drafts', parkedKey(p), p));
  }
  syncState(
    `「${list.map(parkedName).join('」「')}」は、${why}ので、書いた文章を送らずにこの端末に残しました。「未送信の一覧」で、送る・本文に入れる・捨てるを選べます`,
    'err',
  );
  renderToc();
}
// 未送信の書きかけ: a button over the screen while texts are set aside, opening the list (as the server version's)
function showParked() {
  let bar = document.getElementById('parked-bar');
  if (!parked.length || !onWork()) return bar?.remove();
  if (!bar) {
    bar = document.createElement('button');
    bar.id = 'parked-bar';
    bar.className = 'unsent';
    document.body.append(bar);
    bar.addEventListener('click', () => $('open-unsent').click());
  }
  bar.textContent = `未送信の書きかけが ${parked.length} 件あります`;
}
// A text set aside, as the author chooses: 'send' (put back where it was written, beside what is there now, and sent),
// 'put' (at the end of the episode open, as typed), 'drop' (given up; kept in the history)
/** @param {Draft} d @param {'send' | 'put' | 'drop'} how */
async function unpark(d, how) {
  if (how === 'send' && drafts.has(d.path)) return void toast('その場所には、まだ送っていない書きかけがあります。「送る」で送ってから、もう一度押してください');
  /** @type {string | null} */
  let there = '';
  if (how === 'send' && shown().files[d.path]) there = (await texts([d.path]))[d.path];
  if (there === null) return void toast('その場所のファイルを読めないので、送れません（文字コードが UTF-8 ではないか、この端末にまだ読み込まれていません）');
  parked = parked.filter(p => p !== d);
  thenWrite(() => store.del('drafts', parkedKey(d)));
  if (how === 'drop') {
    await snapshot(d.path, /** @type {string} */ (d.text), true);
    return renderToc();
  }
  if (how === 'put') {
    const area = /** @type {HTMLTextAreaElement} */ ($('body'));
    area.setSelectionRange(area.value.length, area.value.length);
    return insertAt(area, `\n\n――― 未送信の書きかけ（${d.path}）―――\n\n${d.text}\n`);
  }
  const w = /** @type {NonNullable<typeof work>} */ (work);
  const text = /** @type {string} */ (d.text);
  const next = new Map(drafts);
  next.set(d.path, { repo: w.repo, path: d.path, base: w.blobs[d.path]?.sha ?? '', text: there ? keptBoth(text, there).text : text, at: Date.now() });
  keep(next);
  renderWork();
  await sendDrafts();
  toast(unsent() ? '送信できませんでした。書いたものはこの端末に残っています' : '送信しました。GitHub の版と並べて残しています');
}
// the texts read from another encoding than UTF-8 (FR-WORK-03), episodes and notes: kept as drafts, made UTF-8, so
// that the next send puts them on GitHub as UTF-8 (the server version does it when the work is taken in)
async function keepConverted() {
  const w = /** @type {NonNullable<typeof work>} */ (work);
  const v = shown();
  const paths = Object.keys(v.files).filter(p => converted.has(v.files[p].sha) && !drafts.has(p) && (isEpisode(v.layout, p) || isNote(v.layout, p)));
  if (!paths.length) return;
  const got = await texts(paths);
  const next = new Map(drafts);
  // (read as text before: a blob is noted as converted when its text is read)
  for (const p of paths) next.set(p, { repo: w.repo, path: p, base: w.blobs[p].sha, text: /** @type {string} */ (got[p]), at: Date.now() });
  keep(next);
}
// reads the work from GitHub again; the changes stay as they are, and the episode open shows its draft if it has one.
// The preview open stays open where it was read (FR-TOC-08)
async function reload() {
  const r = /** @type {Repo} */ (repo);
  const place = current && reading() ? { path: current, at: previewPlace() } : null;
  busy = true;
  syncState('読み込み中…');
  /** @type {string} the branch asked for that GitHub no longer has ('' when none) */
  let gone = '';
  /** @type {{ m: import('../lib/works.js').RepoMeta | null }} the repository found renamed or moved on GitHub */
  const moving = { m: null };
  /** @type {import('./work.js').Files | undefined} the work as last read on this device: the files the changes were read against */
  let lastRead;
  try {
    lastRead = await store.get('snapshots', r.full_name);
    const chosen = await chosenBranch(r.full_name);
    // 同期しない (FR-GH-04): nothing read in from GitHub; the work as last read on this device, when it has it
    const kept = mode === 'off' ? lastRead : null;
    /** @type {import('./work.js').Work & { gone: string }} */
    let read;
    if (kept && (!chosen || kept.branch === chosen)) read = { ...(await contents(kept, false)), gone: '' };
    else {
      // where the repository is now (FR-GH-10, FR-GH-12): renamed or moved on GitHub, followed; another repository
      // under its name, neither read nor sent to (the work as last read on this device) until the author says so.
      // (GitHub not reached: read as before)
      const where = await locate(r).catch(() => null);
      stopped = where?.kind === 'other' ? where.meta : null;
      if (where?.kind === 'moved') moving.m = where.meta;
      else if (stopped) {
        if (!lastRead) throw new Error(stopSaid(r.full_name));
        read = { ...(await contents(lastRead, true)), gone: '' };
      } else if (where?.meta) repo = { ...r, visibility: where.meta.visibility };
    }
    // (a repository moved: read by its new name, below)
    if (!moving.m) {
      read ??= await load(r.full_name, r.default_branch, chosen);
      work = read;
      gone = read.gone;
      if (gone) await forgetBranch(r.full_name, gone);
    }
  } catch (err) {
    syncState(err.message, 'err');
    // an empty repository (FR-GH-02): started as a work, if the author wants it
    if (err instanceof GitHubError && err.status === 409) {
      busy = false;
      if (await offerStart(r)) await reload();
      else if (opening) leaveFailed(err);
    } else if (opening) leaveFailed(err);
    return;
  } finally {
    busy = false;
  }
  const m = /** @type {import('../lib/works.js').RepoMeta | null} */ (moving.m);
  if (m) {
    // renamed or moved on GitHub: what this device keeps of the work follows it, and the work is opened by its new name
    await writing;
    await moveRepo(r.full_name, m.full_name);
    await store.put('prefs', `id:${m.full_name}`, m.id);
    toast(`GitHub でリポジトリが ${m.full_name} に変わっていたので、合わせました`);
    return reopen({ full_name: m.full_name, default_branch: m.default_branch, visibility: m.visibility });
  }
  refreshView();
  readState(now());
  if (stopped) syncState(stopSaid(r.full_name), 'err');
  else if (mode !== 'off' && otherBranch()) syncState(otherBranchSaid(otherBranch()), 'err');
  const got = /** @type {NonNullable<typeof work>} */ (work);
  // (none read before on this branch: only the files gone are known)
  // (novel.toml as read now: the one before is not kept with the files)
  await rebaseChanges({ blobs: lastRead?.branch === got.branch ? lastRead.blobs : got.blobs, config: got.config });
  await readMoved();
  refreshView();
  await keepConverted();
  renderWork();
  void noteNow();
  const w = /** @type {NonNullable<typeof work>} */ (work);
  // (the episode open read after the device answers: one chosen meanwhile is the one opened)
  const last = await store.get('prefs', `episode:${w.repo}`);
  const open = episodeToOpen(episodePaths(), current, last);
  if (open) await openEpisode(open, false);
  else openNone();
  if (place && place.path === current) await showPreviewAt(place.at);
  if (gone) toast(`${gone} は GitHub にもう無いので、${w.branch} を開きました`);
  await refreshScreens();
  sendSoon();
}
// The work read again with the text box not written in until it is read (a branch switched to, ui/branches.js: as
// when a work is opened, DESK-OPS-05). Read, the episode opened sets the box; not read, the box put back as it was
async function reloadHeld() {
  const area = /** @type {HTMLTextAreaElement} */ ($('body'));
  const was = area.disabled;
  const at = opens;
  area.disabled = true;
  try {
    await reload();
  } finally {
    if (opens === at) area.disabled = was;
  }
}
// a work that could not be opened (not read at all): said, and the list of works shown again (as the server version's)
/** @param {Error} err */
function leaveFailed(err) {
  toast(`作品を開けませんでした: ${err.message}`);
  changeRepo();
}
/** @param {string} name */
const stopSaid = name =>
  `${name} は、つないだリポジトリとは別のリポジトリになっています（GitHub で名前が変わったか、削除された後に同じ名前で作成された可能性があります）。送らずに止めています。GitHub で確かめてから「つなぎ直す」を押してください`;
// an empty repository started as a work (the files a new work has), when the author says so
/** @param {Repo} r */
async function offerStart(r) {
  if (!confirm(`${r.full_name} は空のリポジトリです。作品として始めますか？（novel.toml、README.md、最初の話を作成します）`)) return false;
  syncState('作品を始めています…');
  try {
    await startWork(r.full_name, r.default_branch, await titleFor(r.full_name));
    return true;
  } catch (err) {
    syncState(`作品を始められませんでした: ${err.message}`, 'err');
    return false;
  }
}
// FR-GH-12: the repository under the work's name taken as its own, once the author made sure of it
async function relinkRepo() {
  const r = /** @type {Repo} */ (repo);
  const other = stopped;
  if (!other || !confirm(`GitHub の ${r.full_name} は、以前接続していたリポジトリとは別のものです。この作品を、こちらに再接続して送信しますか`)) return;
  await relink(r.full_name, other.id);
  stopped = null;
  toast(`${r.full_name} に再接続しました`);
  await reload();
  if (unsent() && mode !== 'off') await sendDrafts();
}
// 作品の削除 (FR-WORK-05): the work taken off the list, and what this device keeps of it; the repository on GitHub
// stays. As the server version's: a synced work asks in one dialog whether what was not sent goes first (送ってから削除),
// is given up (送らずに削除), or nothing is done (やめる); a work not synced asks once
/** @param {string} title @param {string} repoName @returns {Promise<string>} 'push', 'keep' or '' (stop) */
function askDelete(title, repoName) {
  return new Promise(resolve => {
    const dlg = /** @type {HTMLDialogElement} */ (/** @type {unknown} */ ($('delete-ask')));
    $('delete-ask-title').textContent = `作品「${title}」を削除します`;
    $('delete-ask-help').textContent =
      `GitHub のリポジトリ（${repoName}）はそのままです。まだ送っていない変更をどうしますか？` +
      '送らずに削除すると、その変更は GitHub に送られず、この端末からも消えます。';
    let done = false;
    /** @type {(v: string) => void} */
    const finish = v => {
      if (done) return;
      done = true;
      dlg.close();
      resolve(v);
    };
    for (const b of /** @type {NodeListOf<HTMLElement>} */ (dlg.querySelectorAll('[data-delete]'))) b.onclick = () => finish(b.dataset.delete || '');
    dlg.onclose = () => finish('');
    dlg.showModal();
  });
}
async function deleteWork() {
  const r = /** @type {Repo} */ (repo);
  const title = $('work-title').value;
  if (mode !== 'off') {
    const choice = await askDelete(title, r.full_name);
    if (!choice) return;
    if (choice === 'push' && (unsent() || parked.length)) {
      await sendDrafts();
      if (unsent() || parked.length) return void toast('送れなかったので、削除しませんでした。書いたものはこの端末に残っています');
    }
  } else if (
    !confirm(
      `作品「${title}」を削除しますか？\n同期をオフにしているため、送らずに削除します。GitHub のリポジトリ（${r.full_name}）はそのままで、この端末に残した控えと書きかけは消えます`,
    )
  )
    return;
  clearTimeout(autoTimer);
  sight?.disconnect();
  // (said in the band: the device's store may take a while for a long work. DESK-OPS-05)
  await withBand('削除しています…', async () => {
    await writing;
    await forgetWork(r.full_name);
  });
  work = null;
  drafts = new Map();
  parked = [];
  edits = [];
  toast('作品を削除しました');
  changeRepo();
}
// the changes typed, written to the device (before the page is loaded again: FR-APP-02)
export const settled = () => writing;
// the work opened again by another repository (its name changed)
/** @param {Repo} r */
async function reopen(r) {
  await keepWork(r);
  await store.put('prefs', 'repo', r);
  await open(r);
}
// the branch to read: the one chosen on this device, else the one the changes not sent were written on (the device's
// settings gone: ログアウト with the drafts kept), else none (novel.toml's, else the default branch)
/** @param {string} repoName */
const chosenBranch = async repoName => (await store.get('prefs', `branch:${repoName}`)) ?? writtenOn([...drafts.values()]);
// the branch the changes not sent were written on, when it is not the one open ('' when it is, or none is known)
const otherBranch = () => writtenOn(onOtherBranch([...drafts.values()], /** @type {NonNullable<typeof work>} */ (work).branch));
/** @param {string} branch */
const otherBranchSaid = branch =>
  `この端末の未送信の変更は、ブランチ ${branch} で書いたものです。いまは ${/** @type {NonNullable<typeof work>} */ (work).branch} を開いているので、自動では送りません。${branch} に送るときは「⎇」で ${branch} に切り替えてください（「送る」を押すと、いまのブランチに送るかを確かめます）`;
// a branch that GitHub no longer has: no longer the one chosen on this device (the changes not sent stay as they are)
/** @param {string} repoName @param {string} branch */
async function forgetBranch(repoName, branch) {
  if ((await store.get('prefs', `branch:${repoName}`)) === branch) await store.del('prefs', `branch:${repoName}`);
}
// the desk left for the list of works or the settings (as the server version's: the panel beside the text closed, the
// button of the texts set aside gone)
export function leave() {
  hideSideNote();
  document.getElementById('parked-bar')?.remove();
}
// the screens of the work open: the desk, and the ones over it (資料, プロット, キャラ, 記録)
const WORK_SCREENS = ['desk', 'notes', 'plot', 'characters', 'record'];
// whether one of them is shown (not the list of works, nor the first screens)
const onWork = () => WORK_SCREENS.some(id => !$(id).hidden);
// the screen over the desk shown again with the work as it is now (read in, or sent): the note open keeps its draft,
// else shows what the branch has, the caret where it was (FR-SAVE-08); the plot and the characters drawn again
async function refreshScreens() {
  await readInNotes();
  if (!$('plot').hidden) await openPlot();
  if (!$('characters').hidden) await openCharacters();
}
// written elsewhere while the work is open (another device, GitHub): read in when the branch moved, and shown, but the
// text being written and its caret are left as they are (FR-SAVE-08). Every minute while a screen of the work is
// shown, and when the app comes back in front
async function readIn() {
  const w = work;
  if (!w || busy || w.offline || mode === 'off' || !onWork() || document.visibilityState !== 'visible') return;
  let head;
  try {
    head = await headOf(w.repo, w.branch);
  } catch {
    return;
  }
  if (head === w.commit || work !== w || busy) return;
  const r = /** @type {Repo} */ (repo);
  let next;
  try {
    next = await load(r.full_name, r.default_branch, await chosenBranch(r.full_name));
  } catch {
    return;
  }
  if (work !== w || busy) return;
  work = next;
  refreshView();
  const set = await rebaseChanges(w);
  await readMoved();
  refreshView();
  await keepConverted();
  renderWork();
  await showOpen();
  // (what was set aside is said instead)
  if (!set) toast('ほかの端末の更新を読み込みました');
  await refreshScreens();
  await trace('ReadIn');
}
// The texts gone with their files moved elsewhere (FR-TOC-04, FR-NOTE-05: `moves`, from and to): the episode open, and
// the note open, go where theirs went
/** @param {[string, string][]} moves */
function follow(moves) {
  const to = new Map(moves).get(current);
  if (to) {
    current = to;
    thenWrite(() => store.put('prefs', `episode:${/** @type {NonNullable<typeof work>} */ (work).repo}`, to));
  }
  followNote(moves);
}
// the episode open, after the work changed under it (read in, or sent): gone, the first one opened; else, with no
// draft of it, what the branch has now shown, the caret and the place read where they were (FR-SAVE-08)
async function showOpen() {
  if (current && !findEpisode(current)) {
    const first = episodes()[0];
    if (first) await openEpisode(first.path, false);
    else openNone();
  } else if (current && !drafts.has(current)) {
    const text = textOf(current);
    const area = /** @type {HTMLTextAreaElement} */ ($('body'));
    // (another episode at its path now: its title too)
    if (document.activeElement !== $('episode-title'))
      $('episode-title').value = titleAt(/** @type {import('../lib/layout.js').TocEpisode} */ (findEpisode(current)).rel);
    if (text !== null && text !== area.value) {
      setKeepingCaret(area, text);
      showCounts();
      if (reading()) {
        const at = previewPlace();
        await showPreviewAt(at);
      }
    }
  }
}
// 自動 (FR-SAVE-03, FR-GH-04): the changes not sent go by themselves a while after the last one (AUTO_WAIT), when the
// page is left (hidden), and when the device is back online, as 送る sends them (the same handling of what changed
// elsewhere). Only while the page is open: a page closed runs nothing. A send that fails is tried again on the next
// change, the next time the page is left, or back online
/** @type {ReturnType<typeof setTimeout> | undefined} */
let autoTimer;
function sendSoon(wait = AUTO_WAIT) {
  clearTimeout(autoTimer);
  if (mode === 'auto' && unsent()) autoTimer = setTimeout(() => void sendNow(), wait);
}
async function sendNow() {
  clearTimeout(autoTimer);
  const w = work;
  if (!w || !onWork()) return;
  if (busy && mode === 'auto' && unsent()) return sendSoon(5000);
  const elsewhere = onOtherBranch([...drafts.values()], w.branch).length;
  if (!stopped && sendsItself({ mode, unsent: unsent(), offline: w.offline, busy, elsewhere })) await sendDrafts();
  else if (elsewhere && mode === 'auto') syncState(otherBranchSaid(otherBranch()), 'err');
}
/** @param {boolean} [pressed] 送る pressed (said in a toast when done, as the server version's push) */
async function sendDrafts(pressed = false) {
  if (stopped) return;
  const w = /** @type {NonNullable<typeof work>} */ (work);
  // (written on another branch: sent to the one open only when the author says so)
  const other = otherBranch();
  if (
    other &&
    !confirm(
      `未送信の変更は、ブランチ ${other} で書いたものです。いま開いている ${w.branch} に送りますか？（「キャンセル」なら送りません。${other} に送るときは「⎇」で ${other} に切り替えてください）`,
    )
  )
    return;
  busy = true;
  renderToc();
  syncState('送っています…');
  try {
    await trace('SendStart');
    const result = await sendAll(w, [...drafts.values()], edits);
    failed = new Set();
    // (the drafts as the device has them now, typed during the send too)
    const typed = new Map(drafts);
    const next = new Map(drafts);
    // the texts refused (their file put in _trash/ there, or another file now), as the device has them now: set aside
    // (one typed back to the text read during the send, or given up: none left to set aside)
    const refused = result.refused.map(d => typed.get(d.path)).filter(d => d !== undefined);
    for (const d of result.refused) next.delete(d.path);
    for (const { draft, to, blob, both } of result.sent) {
      // (gone from the device while it was sent: what the author has is the text read, not the one sent)
      const after = afterSend(typed.get(draft.path) ?? goneWhileSent(draft, remoteText(draft.path)), draft.text, blob, both);
      // (its file moved elsewhere: what was typed since goes there with it; another text moved to its path stays)
      if (next.get(draft.path) === typed.get(draft.path)) next.delete(draft.path);
      if (after) next.set(to, { ...after, path: to });
    }
    const went = result.sent.filter(s => s.to !== s.draft.path).map(s => /** @type {[string, string]} */ ([s.draft.path, s.to]));
    // (what is left was typed during the send: on what the branch is now, of the branch sent to)
    const sent = await contents(
      { repo: w.repo, branch: w.branch, commit: result.commit, tree: result.tree, updated: result.updated, blobs: result.blobs, folders: result.folders },
      false,
    );
    const settled = settle(next, w.blobs, result.blobs, await lookOf(w.repo, [...next.values()], w, sent, false));
    const { changes: left, parked: moved } = settled;
    for (const [path, d] of left) left.set(path, { ...d, branch: w.branch });
    work = sent;
    keep(left, []);
    follow([...went, ...settled.moved]);
    await readMoved();
    refreshView();
    const sides = new Set(result.sent.filter(s => s.both).map(s => s.draft.path));
    const titles = episodes()
      .filter(e => sides.has(e.path))
      .map(e => titleAt(e.rel));
    if (sides.size) {
      syncState(`送りました。${titles.join('、')}はほかでも書き換えられていたので、両方の版を並べました（${result.message}）`, 'err');
      toast('ほかでも書き換えられていた話があります。両方の版を並べました');
    } else if (result.message) syncState(`送りました（${result.message}）`, 'ok');
    else syncState('送る変更はありませんでした（GitHub にもう同じ内容があります）', 'ok');
    renderWork();
    void noteNow();
    await showOpen();
    park([...refused, ...moved], MOVED);
    await refreshScreens();
    showCounts();
    showUpdated();
    thenWrite(() => store.del('prefs', `failed:${w.repo}`));
    if (pressed) toast('送りました');
    await trace('Sent');
  } catch (err) {
    void traceFailed(err);
    failed = new Set(drafts.keys());
    thenWrite(() => store.put('prefs', `failed:${w.repo}`, true));
    showCounts();
    syncState(
      err instanceof Overlapped
        ? `${err.message}。「再読み込み」で読み直してください（重なった話の追加・名前の変更・削除・並べ替えは取り消し、書いた文章は残します）`
        : err instanceof GitHubError && err.status === 0
          ? `${err.message}。書いたものはこの端末に残っています`
          : `送れませんでした: ${err.message}。書いたものはこの端末に残っています`,
      'err',
    );
  } finally {
    busy = false;
    renderToc();
  }
}

// --- opening a work

/** @param {Repo} r */
export async function open(r) {
  opening = true;
  if (repo?.full_name !== r.full_name) hideSideNote();
  repo = r;
  work = null;
  stopped = null;
  current = '';
  failed = new Set();
  show('desk');
  // the work in the address (as the server version's #作品): the page loaded again opens it again
  history.replaceState(null, '', `#${encodeURIComponent(r.full_name)}`);
  $('body').value = '';
  // (said where the text will be, large enough to be seen on a phone: B4)
  /** @type {HTMLTextAreaElement} */ ($('body')).placeholder = '作品を読み込んでいます…';
  /** @type {HTMLTextAreaElement} */ ($('body')).disabled = true;
  $('episode-title').value = '';
  $('tree').innerHTML = '';
  // (the work before's state gone while this one loads)
  $('work-repo').innerHTML = '';
  $('sync-state').textContent = '';
  $('sync-brief').textContent = '';
  $('episode-chars').textContent = '0';
  $('episode-updated').textContent = '';
  $('episode-note').hidden = true;
  $('send-foot').hidden = true;
  $('save-state').textContent = '読み込み中…';
  // (the operations wait until the work is read: renderToc)
  for (const id of ['add-episode', 'add-chapter', 'toggle-reorder', 'trash-episode', ...WORK_TOOLS]) $(id).disabled = true;
  $('work-title').value = r.full_name.split('/')[1];
  /** @type {Draft[]} */
  const kept = await store.all('drafts');
  drafts = new Map(kept.filter(d => d.repo === r.full_name && !d.parked).map(d => [d.path, d]));
  parked = kept.filter(d => d.repo === r.full_name && d.parked);
  edits = (await store.get('prefs', `edits:${r.full_name}`)) ?? [];
  folded = (await store.get('prefs', `closed:${r.full_name}`)) ?? [];
  changed = new Map(Object.entries((await store.get('prefs', `changed:${r.full_name}`)) ?? {}));
  // (the mode kept on the device, else the one the drafts were written with: lib/sync.js keptMode)
  mode = keptMode(await store.get('prefs', `sync:${r.full_name}`), [...drafts.values()]);
  try {
    await reload();
  } finally {
    opening = false;
    /** @type {HTMLTextAreaElement} */ ($('body')).placeholder = 'ここに書く';
  }
}

// --- the table of contents' rows: opened, folded, moved

/** @param {MouseEvent} e */
async function treeClick(e) {
  const t = /** @type {HTMLElement} */ (e.target);
  if (t.closest('.order-tools')) {
    const b = t.closest('[data-move]');
    if (b instanceof HTMLElement) void sendOrder(plans.moveBy(plans.orderOf(shown().toc), /** @type {string} */ (b.dataset.path), Number(b.dataset.move)));
    const rn = t.closest('[data-rename-chapter]');
    if (rn instanceof HTMLElement) void renameChapter(/** @type {string} */ (rn.dataset.renameChapter));
    return;
  }
  const node = t.closest('.node.episode');
  if (node instanceof HTMLElement && node.dataset.path && !ordering) return void openEpisode(node.dataset.path);
  const fold = t.closest('[data-fold]');
  if (fold instanceof HTMLElement && !ordering) {
    const path = /** @type {string} */ (fold.dataset.fold);
    folded = folded.includes(path) ? folded.filter(p => p !== path) : [...folded, path];
    renderToc();
    await store.put('prefs', `closed:${/** @type {NonNullable<typeof work>} */ (work).repo}`, folded);
  }
}
// drag and drop (a mouse): an episode on an episode goes before it, on a chapter at its end; a chapter before
function wireDrag() {
  /** @type {string | null} */
  let dragging = null;
  const clear = () => document.querySelectorAll('.drop-before,.drop-into').forEach(x => x.classList.remove('drop-before', 'drop-into'));
  const tree = $('tree');
  tree.addEventListener('dragstart', e => {
    const node = /** @type {HTMLElement} */ (e.target).closest('[data-node]');
    if (!(node instanceof HTMLElement)) return;
    dragging = /** @type {string} */ (node.dataset.node);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  });
  tree.addEventListener('dragover', e => {
    const node = /** @type {HTMLElement} */ (e.target).closest('[data-node]');
    if (!dragging || !(node instanceof HTMLElement) || node.dataset.node === dragging) return;
    e.preventDefault();
    clear();
    node.classList.add(node.classList.contains('chapter') && dragging.endsWith('.md') ? 'drop-into' : 'drop-before');
  });
  tree.addEventListener('drop', e => {
    const node = /** @type {HTMLElement} */ (e.target).closest('[data-node]');
    clear();
    if (!dragging || !(node instanceof HTMLElement)) return;
    e.preventDefault();
    const want = plans.dropOn(plans.orderOf(shown().toc), dragging, /** @type {string} */ (node.dataset.node), node.classList.contains('chapter'));
    dragging = null;
    void sendOrder(want);
  });
  tree.addEventListener('dragend', () => {
    dragging = null;
  });
}

// 送る頻度 (FR-GH-04), chosen for each work and kept on this device
/** @param {string} value */
async function setMode(value) {
  const w = /** @type {NonNullable<typeof work>} */ (work);
  mode = syncMode(value);
  await store.put('prefs', `sync:${w.repo}`, mode);
  // (the changes not sent keep the mode too: lib/sync.js stamped)
  keep(new Map([...drafts].map(([path, d]) => [path, { ...d, sync: mode }])));
  renderToc();
  readState(now());
  toast('同期の設定を変更しました');
  sendSoon();
}

/** @type {() => void} the list of works shown (app.js) */
let changeRepo;
// the desk's buttons and the text box (once, by app.js)
/** @param {{ changeRepo: () => void, open: (r: Repo) => Promise<void>, relist: () => Promise<void> }} on */
export function wire(on) {
  // (the steps written down are all made on a work read)
  traceWith(() => ({
    commit: /** @type {NonNullable<typeof work>} */ (work).commit,
    blobs: Object.fromEntries(Object.entries(/** @type {NonNullable<typeof work>} */ (work).blobs).map(([p, b]) => [p, b.sha])),
    drafts: [...drafts.values()].map(({ path, base, text, sha, gone, op }) => ({ path, base, text, sha, gone, op })),
    current,
    screen: $('body').value,
  }));
  const area = /** @type {HTMLTextAreaElement} */ ($('body'));
  evenBreaks(area);
  // (a word being converted is kept too: the text box is not written over while a draft is kept, when the work is read
  // in or a send ends: formal/Send.tla)
  // (the box takes input only with an episode open: disabled otherwise, and the input bar shows only while writing in it)
  area.addEventListener('input', e => typed(/** @type {InputEvent} */ (e).isComposing ? 'Compose' : 'Type'));
  area.addEventListener('compositionend', () => current && typed('Converted'));
  $('tree').addEventListener('click', e => void treeClick(e));
  $('tree').addEventListener('keydown', e => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (e.key === 'Enter' && t.matches('.node')) {
      e.preventDefault();
      t.click();
    }
  });
  $('tree').addEventListener('change', e => {
    // (the chapter to move an episode to: the only field in the rows)
    const s = /** @type {HTMLSelectElement} */ (e.target);
    void sendOrder(plans.moveToChapter(plans.orderOf(shown().toc), /** @type {string} */ (s.dataset.path), s.value));
  });
  wireDrag();
  $('send').addEventListener('click', () => void sendDrafts(true));
  $('send-foot').addEventListener('click', () => void sendDrafts(true));
  // 再読み込み: over the table of contents and over the text (the table of contents is closed on a phone: the one over
  // the text says it in the band, as the state under the table of contents is not seen there. DESK-OPS-05)
  /** @param {boolean} band */
  const again = band => void (busy || opening ? null : band ? withBand('読み込んでいます…', reload) : reload());
  $('reload-work').addEventListener('click', () => again(false));
  $('reload-desk').addEventListener('click', () => again(true));
  $('to-shelf').addEventListener('click', on.changeRepo);
  changeRepo = on.changeRepo;
  $('delete-work').addEventListener('click', () => void deleteWork());
  $('open-toc').addEventListener('click', () => $('desk').classList.add('toc-open'));
  $('scrim').addEventListener('click', () => $('desk').classList.remove('toc-open'));
  $('add-episode').addEventListener('click', () => void addEpisode());
  $('add-chapter').addEventListener('click', () => void addChapter());
  $('trash-episode').addEventListener('click', () => void trashEpisode());
  $('toggle-reorder').addEventListener('click', () => {
    ordering = !ordering;
    renderToc();
  });
  $('episode-title').addEventListener('change', () => void renameEpisode());
  $('episode-title').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      area.focus();
    }
  });
  $('work-title').addEventListener('change', () => void renameWork());
  inputBar($('kbar'), area, $('desk'), () => void togglePreview());
  wireReading({ neighbor, open: openEpisode, draw });
  wireHistory();
  $('open-history').addEventListener('click', () => void openHistory());
  $('insert-image').addEventListener('click', insertImage);
  Object.assign(api, {
    work: () => work,
    view: shown,
    drafts: () => drafts,
    files: () => Object.keys(shown().files),
    texts,
    keepText,
    apply,
    pictureUrl,
    forPlans,
    openEpisode,
    current: () => current,
    episodes: () => episodes().map(e => ({ path: e.path, rel: e.rel, title: titleAt(e.rel), chars: charsOf(textOf(e.path) ?? '') })),
    title: titleAt,
    back: () => {
      show('desk');
      if (current && findEpisode(current)) void openEpisode(current);
      else openNone();
    },
    snapshot,
    snapshots,
    reload,
    reloadHeld,
    busy: () => busy,
    unsent,
    send: () => sendDrafts(),
    unsentItems: () => unsentList(drafts, edits),
    otherBranch,
    parked: () => parked,
    unpark,
    mode: () => mode,
    discard,
  });
  wireRepo(on, { repo: () => /** @type {Repo} */ (repo), settled: () => writing, reopen });
  wireBranches();
  wireUnsent();
  sight = new IntersectionObserver(seen => {
    for (const e of seen)
      if (e.isIntersecting) {
        sight?.unobserve(e.target);
        ask(/** @type {string} */ (/** @type {HTMLElement} */ (e.target).dataset.path));
      }
  });
  setInterval(() => void readIn(), 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void sendNow();
    else void readIn();
  });
  addEventListener('online', () => sendSoon(1000));
  $('gh-relink').addEventListener('click', () => void relinkRepo());
  $('sync-mode').addEventListener('change', () => void setMode($('sync-mode').value));
  wireNotes();
  wirePlot();
  wireCharacters();
  wireRecord();
  wireReleases();
  wireSideNote();
}
