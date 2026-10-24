// The desk: the table of contents of the work open, the episode being written, its preview, the episodes added,
// renamed, put in the trash and reordered, and sending and reading again. The work, the changes not sent and the
// episode open are this module's: the others call open() and the functions it gives them
import { moveFiles, rebase, relabel, unsentList, withoutOp, writeFile } from '../lib/changes.js';
import { afterSend, draftKey, draftOf, typedOver } from '../lib/drafts.js';
import * as plans from '../lib/episodes.js';
import { charsOf, esc, n, rowTimes, whenLong } from '../lib/format.js';
import { imageType } from '../lib/github.js';
import { episodesOf, isEpisode, titleOf } from '../lib/layout.js';
import { isNote } from '../lib/notes.js';
import { picturePaths, relPath, renderMd } from '../lib/markdown.js';
import { CONFLICT_MARK } from '../lib/merge.js';
import { editToml } from '../lib/tomledit.js';
import { AUTO_WAIT, sendsItself, syncMode } from '../lib/sync.js';
import { viewOf } from '../lib/view.js';
import { visibilityTag } from '../lib/works.js';
import { $, show, toast } from './dom.js';
import * as store from './db.js';
import { bytes, contents, converted, load, readShas } from './work.js';
import { Overlapped, sendAll } from './send.js';
import { GitHubError, headOf, lastChange } from './github.js';
import { evenBreaks, inputBar, insertAt, setKeepingCaret } from './textbox.js';
import { showHistory, wireHistory } from './history.js';
import { pickImage } from './images.js';
import { api } from './shared.js';
import { wireNotes } from './notes.js';
import { renderPlotPanel, wirePlot } from './plot.js';
import { wireCharacters } from './characters.js';
import { noteToday, wireRecord } from './record.js';
import { wireReleases } from './releases.js';
import { renderSideNote, wireSideNote } from './sidenote.js';
import { snapshotted } from '../lib/history.js';
import { previewPlace, reading, showPreviewAt, stopReading, togglePreview, wireReading } from './reading.js';
import { wireBranches } from './branches.js';
import { wireUnsent } from './unsent.js';

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
let busy = false;
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
}
const hasConflict = (/** @type {string} */ text) => text.includes(CONFLICT_MARK);
const shown = () => /** @type {import('../lib/view.js').View} */ (view);
/** @param {string} path */
const textOf = path => shown().texts[path] ?? null;
const episodes = () => episodesOf(shown().toc);
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

/** @param {Map<string, Draft>} next @param {Edit[]} [nextEdits] */
function keep(next, nextEdits = edits) {
  const w = /** @type {NonNullable<typeof work>} */ (work);
  const before = drafts;
  drafts = next;
  const editsChanged = nextEdits !== edits;
  edits = nextEdits;
  const kept = edits;
  writing = writing
    .then(async () => {
      for (const [path, d] of next) if (before.get(path) !== d) await store.put('drafts', draftKey(w.repo, path), d);
      for (const path of before.keys()) if (!next.has(path)) await store.del('drafts', draftKey(w.repo, path));
      if (editsChanged) await store.put('prefs', `edits:${w.repo}`, kept);
    })
    .catch(err => syncState(`この端末に保存できませんでした（${err.message ?? err}）`, 'err'));
  refreshView();
  sendSoon();
}
// a change not sent given up by hand (FR-SAVE-09): a text written alone (by its path), or an operation (its changes
// and keys; the text written in its files stays as a draft). The open episode is shown again, or the first
/** @param {import('../lib/changes.js').Unsent} item */
async function discard(item) {
  if (item.kind === 'op') {
    const left = withoutOp(drafts, edits, item.op);
    keep(left.changes, left.edits);
  } else {
    const next = new Map(drafts);
    next.delete(item.path);
    keep(next);
  }
  renderWork();
  const open = findEpisode(current) ? current : (episodes()[0]?.path ?? '');
  if (open) await openEpisode(open);
  else openNone();
}
// how many files the changes not sent change (novel.toml counts once)
const unsent = () => drafts.size + (edits.length && !drafts.has('novel.toml') ? 1 : 0);

// --- the table of contents

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
    const tags = (drafts.has(e.path) ? '<span class="unsent-tag">未送信</span>' : '') + (hasConflict(text) ? '<span class="conflict">両方の版</span>' : '');
    return `<div class="node episode${e.path === current ? ' active' : ''}" role="button" tabindex="0" data-path="${esc(e.path)}" data-node="${esc(e.path)}" draggable="${ordering}"><span class="t">${esc(titleAt(e.rel))}</span>${tags}<span class="u"></span><span class="c">${n(charsOf(text))}</span>${tools('episode', e.path, inChapter)}</div>`;
  };
  const chars = (/** @type {import('../lib/layout.js').TocEpisode[]} */ list) => list.reduce((sum, e) => sum + charsOf(textOf(e.path) ?? ''), 0);
  $('tree').innerHTML =
    v.toc
      .map(it =>
        it.type === 'episode'
          ? episode(it)
          : `<div class="node chapter" role="button" tabindex="0" data-fold="${esc(it.path)}" data-node="${esc(it.path)}" draggable="${ordering}"><span class="fold">${closed.has(it.path) ? '▸' : '▾'}</span><span class="t">${esc(titleAt(it.rel))}</span><span class="c">${n(chars(it.episodes))}</span>${tools('chapter', it.path)}</div><div class="chapter-body${closed.has(it.path) && !it.episodes.some(e => e.path === current) ? ' closed' : ''}">${it.episodes.map(e => episode(e, it.path)).join('')}</div>`,
      )
      .join('') || '<p class="muted small">話がありません。「＋ 話を追加」で追加できます。</p>';
  $('toc').classList.toggle('reorder', ordering);
  $('toggle-reorder').textContent = ordering ? '完了' : '並べ替え';
  $('work-chars').textContent = n(chars(episodes()));
  $('work-count').textContent = n(episodes().length);
  $('work-updated').textContent = whenLong(Math.max(w.updated || 0, ...[...drafts.values()].map(d => d.at)));
  $('work-branch').textContent = w.branch;
  // the repository, its page on GitHub, and whether it is public (FR-GH-11)
  $('work-repo').innerHTML =
    `<a href="https://github.com/${esc(w.repo)}/tree/${esc(encodeURIComponent(w.branch))}" target="_blank" rel="noopener noreferrer">${esc(w.repo)}</a>${visibilityTag(/** @type {Repo} */ (repo))}`;
  $('open-unsent').hidden = unsent() === 0;
  if (document.activeElement !== $('work-title')) $('work-title').value = v.layout.title || w.repo.split('/')[1];
  $('send').disabled = busy || unsent() === 0 || mode === 'off';
  $('send').textContent = unsent() ? `送る（${unsent()}）` : '送る';
  $('reload').disabled = busy || mode === 'off';
  $('sync-mode').value = mode;
  for (const id of ['add-episode', 'add-chapter', 'toggle-reorder', 'trash-episode']) $(id).disabled = busy || (id === 'trash-episode' && !current);
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
  const eps = episodes(),
    i = eps.findIndex(e => e.path === current);
  const e = i < 0 ? null : eps[i + d];
  return e ? { path: e.path, title: titleAt(e.rel) } : null;
}
function showCounts() {
  const text = $('body').value;
  $('episode-chars').textContent = current ? n(charsOf(text)) : '0';
  $('save-state').textContent = drafts.has(current) ? '未送信（この端末に保存しました）' : '';
  const note = $('episode-note');
  note.hidden = !hasConflict(text);
  note.textContent = '両方の版が並んでいます。「――― ここから」の行を探して整理してください';
}
/** @param {string} path @param {string} sha */
const changedKey = (path, sha) => `${path}\n${sha}`;
// 最終更新 of an episode: when this device wrote it (not sent), else its last commit on GitHub (0: not known yet)
/** @param {string} path */
function updatedOf(path) {
  const d = drafts.get(path);
  if (d) return d.at;
  const b = /** @type {NonNullable<typeof work>} */ (work).blobs[path];
  return b ? (changed.get(changedKey(path, b.sha)) ?? 0) : 0;
}
// 最終更新 of the open episode (FR-EDIT-02), asked of GitHub when it is not known yet
function showUpdated() {
  const ms = updatedOf(current);
  $('episode-updated').textContent = current && ms ? `最終更新 ${whenLong(ms)}` : '';
  if (current && !ms) ask(current);
}
// 最終更新 on the rows of the table of contents, where it tells one row from the others (as the server version's)
function paintTimes() {
  const said = rowTimes(Object.fromEntries(episodes().map(e => [e.path, updatedOf(e.path)])));
  for (const u of /** @type {NodeListOf<HTMLElement>} */ ($('tree').querySelectorAll('.node.episode .u')))
    u.textContent = said[/** @type {HTMLElement} */ (u.parentElement).dataset.path ?? ''] ?? '';
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
    if (!updatedOf(row.dataset.path ?? '')) sight?.observe(row);
}
/** @param {string} path @returns {Promise<boolean>} */
async function openEpisode(path) {
  const w = /** @type {NonNullable<typeof work>} */ (work);
  current = path;
  const e = findEpisode(path);
  const text = e ? textOf(path) : null;
  const area = /** @type {HTMLTextAreaElement} */ ($('body'));
  area.value = text ?? '';
  area.disabled = text === null;
  area.scrollTop = 0;
  $('episode-title').value = e ? titleAt(e.rel) : '';
  $('episode-title').disabled = !e;
  $('toggle-preview').disabled = text === null;
  stopReading();
  showCounts();
  if (e && text === null) {
    const note = $('episode-note');
    note.hidden = false;
    note.textContent = w.offline ? 'この話はまだこの端末に読み込まれていません（つながってから開いてください）' : '文字コードが UTF-8 ではないため開けません';
  }
  $('desk').classList.remove('toc-open');
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
  $('body').value = '';
  /** @type {HTMLTextAreaElement} */ ($('body')).disabled = true;
  $('episode-title').value = '';
  $('episode-title').disabled = true;
  $('toggle-preview').disabled = true;
  $('episode-updated').textContent = '';
  stopReading();
  showCounts();
  renderToc();
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
// what was typed in the episode
function typed() {
  keepText(current, $('body').value);
  showCounts();
  renderToc();
  showUpdated();
}
// 記録: the work's length today, noted on the device a moment after the last key (and when it is read and sent)
/** @type {ReturnType<typeof setTimeout> | undefined} */
let noteTimer;
const noteSoon = () => {
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => void noteNow(), 2000);
};
const noteNow = () =>
  noteToday(
    /** @type {NonNullable<typeof work>} */ (work).repo,
    episodes().reduce((sum, e) => sum + charsOf(textOf(e.path) ?? ''), 0),
  );
// the text of a file as read from GitHub ('' when it is not there, or not read)
/** @param {string} path */
function remoteText(path) {
  const w = /** @type {NonNullable<typeof work>} */ (work);
  return w.texts[path] ?? w.shaTexts[w.blobs[path]?.sha ?? ''] ?? '';
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
    draft: d?.text !== undefined ? { text: d.text, at: d.at } : null,
    snapshots: await snapshots(path),
    remote: Boolean(w.blobs[path]),
    now: () => $('body').value,
    restore: async text => {
      if (current !== path) return;
      await snapshot(path, $('body').value, true);
      setKeepingCaret(/** @type {HTMLTextAreaElement} */ ($('body')), text);
      typed();
      toast(`「${titleAt(e.rel)}」を復元しました（送るまではこの端末だけの変更です）`);
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
  const next = open ?? (moved && findEpisode(moved) ? moved : findEpisode(current) ? current : '');
  if (next) await openEpisode(next);
  else openNone();
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
  if (!current) return;
  const title = $('episode-title').value;
  const e = findEpisode(current);
  if (!e || title === titleAt(e.rel)) return;
  const plan = planned(() => plans.rename(forPlans(), current, title));
  if (!plan || !(await apply(plan, plan.path))) $('episode-title').value = titleAt(e.rel);
}
/** @param {string} path */
async function renameChapter(path) {
  const it = shown().toc.find(c => c.path === path);
  if (!it) return;
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
    !confirm(`「${titleAt(e.rel)}」を削除しますか？（作品の _trash/ フォルダに移動します。完全には消えません。GitHub に送るのは「送る」を押したときです）`)
  )
    return;
  const i = episodes().indexOf(e);
  const plan = planned(() => plans.trash(forPlans(), current, Date.now()));
  if (!plan) return;
  const rest = episodes().filter(x => x !== e);
  const next = rest[Math.max(0, i - 1)];
  if (await apply(plan, next?.path ?? '')) toast('削除しました（_trash/ に移動。送るまではこの端末だけの変更です）');
}
/** @param {import('../lib/episodes.js').OrderItem[] | null} want */
async function sendOrder(want) {
  if (!want) return;
  const plan = planned(() => plans.reorder(forPlans(), want));
  if (plan) await apply(plan, current ? plans.placeAfter(shown().layout, want, current) : undefined);
}
async function renameWork() {
  const title = $('work-title').value.trim();
  if (!title || title === shown().layout.title) return renderToc();
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
  for (const p of paths) {
    const c = drafts.get(p);
    if (!files[p]) out[p] = null;
    else if (c) out[p] = c.text ?? w.shaTexts[c.sha ?? ''] ?? null;
    else out[p] = w.texts[p] ?? w.shaTexts[files[p].sha] ?? null;
  }
  return out;
}
// a picture added to the open episode where the caret is: made small, put in the pictures folder, ![](…) written
function insertImage() {
  const path = current;
  if (!path) return;
  pickImage(async (file, put) => {
    if (current !== path) return;
    if (!(await apply({ moves: [], writes: [{ path: file, bytes: put }], edits: [], path: file }, undefined, true))) return;
    insertAt(/** @type {HTMLTextAreaElement} */ ($('body')), `\n![](${relPath(path, file)})\n`);
    toast('画像を挿入しました（送るまではこの端末だけの変更です）');
  });
}

// --- reading and sending

/** @param {string} when */
const readState = when =>
  mode === 'off'
    ? syncState('同期しない設定です。GitHub へ送ることも、GitHub から取り込むこともしません（この端末で前に読んだ版に書きます）')
    : work?.offline
      ? syncState('オフラインです。前に読んだ版を出しています（送るのはつながってから）', 'err')
      : syncState(`GitHub から読みました（${when}）`, 'ok');
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
async function rebaseChanges() {
  const w = /** @type {NonNullable<typeof work>} */ (work);
  if (w.offline) return;
  const { changes, ops } = rebase(drafts, w.blobs);
  if (!ops.size) return;
  keep(
    changes,
    edits.filter(e => !ops.has(e.op)),
  );
  syncState(
    'ほかの所でファイルが変わっていたので、この端末の話の追加・名前の変更・削除・並べ替えを取り消しました。書いた文章は残っています。やり直してください',
    'err',
  );
  toast('ほかの所での変更と重なった操作を取り消しました（書いた文章は残っています）');
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
  for (const p of paths) {
    const text = got[p];
    if (text !== null) next.set(p, { repo: w.repo, path: p, base: w.blobs[p].sha, text, at: Date.now() });
  }
  keep(next);
}
// reads the work from GitHub again; the changes stay as they are, and the episode open shows its draft if it has one.
// The preview open stays open where it was read (FR-TOC-08)
async function reload() {
  const r = /** @type {Repo} */ (repo);
  const place = current && reading() ? { path: current, at: previewPlace() } : null;
  busy = true;
  syncState('読み込んでいます…');
  /** @type {string} the branch asked for that GitHub no longer has ('' when none) */
  let gone;
  try {
    const chosen = (await store.get('prefs', `branch:${r.full_name}`)) ?? '';
    // 同期しない (FR-GH-04): nothing read in from GitHub; the work as last read on this device, when it has it
    const kept = mode === 'off' ? await store.get('snapshots', r.full_name) : null;
    const read =
      kept && (!chosen || kept.branch === chosen) ? { ...(await contents(kept, false)), gone: '' } : await load(r.full_name, r.default_branch, chosen);
    work = read;
    gone = read.gone;
    if (gone) await forgetBranch(r.full_name, gone);
  } catch (err) {
    syncState(err.message, 'err');
    return;
  } finally {
    busy = false;
  }
  refreshView();
  readState(now());
  await rebaseChanges();
  await readMoved();
  refreshView();
  await keepConverted();
  renderWork();
  void noteNow();
  const paths = episodes().map(e => e.path);
  const last = await store.get('prefs', `episode:${work.repo}`);
  const open = paths.includes(current) ? current : paths.includes(last) ? last : (paths[0] ?? '');
  if (open) await openEpisode(open);
  else openNone();
  if (place && place.path === current) await showPreviewAt(place.at);
  if (gone) toast(`${gone} は GitHub にもう無いので、${work.branch} を開きました`);
  sendSoon();
}
// a branch that GitHub no longer has: no longer the one chosen on this device (the changes not sent stay as they are)
/** @param {string} repoName @param {string} branch */
async function forgetBranch(repoName, branch) {
  if ((await store.get('prefs', `branch:${repoName}`)) === branch) await store.del('prefs', `branch:${repoName}`);
}
// written elsewhere while the work is open (another device, GitHub): read in when the branch moved, and shown, but the
// text being written and its caret are left as they are (FR-SAVE-08). Every minute while the desk is shown, and when
// the app comes back in front
async function readIn() {
  const w = work;
  if (!w || busy || w.offline || mode === 'off' || $('desk').hidden || document.visibilityState !== 'visible') return;
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
    next = await load(r.full_name, r.default_branch, (await store.get('prefs', `branch:${r.full_name}`)) ?? '');
  } catch {
    return;
  }
  if (work !== w || busy) return;
  work = next;
  refreshView();
  await rebaseChanges();
  await readMoved();
  refreshView();
  await keepConverted();
  renderWork();
  if (current && !findEpisode(current)) {
    const first = episodes()[0];
    if (first) await openEpisode(first.path);
    else openNone();
  } else if (current && !drafts.has(current)) {
    const text = textOf(current);
    const area = /** @type {HTMLTextAreaElement} */ ($('body'));
    if (text !== null && text !== area.value) {
      setKeepingCaret(area, text);
      showCounts();
      if (reading()) {
        const at = previewPlace();
        await showPreviewAt(at);
      }
    }
  }
  toast('ほかの所での変更を読み込みました');
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
  if (!w || $('desk').hidden) return;
  if (busy && mode === 'auto' && unsent()) return sendSoon(5000);
  if (sendsItself({ mode, unsent: unsent(), offline: w.offline, busy })) await sendDrafts();
}
async function sendDrafts() {
  const w = /** @type {NonNullable<typeof work>} */ (work);
  busy = true;
  renderToc();
  syncState('送っています…');
  try {
    const result = await sendAll(w, [...drafts.values()], edits);
    const next = new Map(drafts);
    for (const { draft, blob, both } of result.sent) {
      const after = afterSend(next.get(draft.path) ?? draft, draft.text, blob, both);
      if (after) next.set(draft.path, after);
      else next.delete(draft.path);
    }
    work = await contents(
      { repo: w.repo, branch: w.branch, commit: result.commit, tree: result.tree, updated: result.updated, blobs: result.blobs, folders: result.folders },
      false,
    );
    keep(next, []);
    await readMoved();
    refreshView();
    const sides = new Set(result.sent.filter(s => s.both).map(s => s.draft.path));
    const titles = episodes()
      .filter(e => sides.has(e.path))
      .map(e => titleAt(e.rel));
    if (sides.size) {
      syncState(`送りました。${titles.join('、')}はほかでも書き換えられていたので、両方の版を並べました（${result.message}）`, 'err');
      toast('ほかでも書き換えられていた話があります。両方の版を並べました');
    } else syncState(`送りました（${result.message}）`, 'ok');
    renderWork();
    void noteNow();
    if (current && findEpisode(current) && !drafts.has(current)) setKeepingCaret(/** @type {HTMLTextAreaElement} */ ($('body')), textOf(current) ?? '');
    showCounts();
    showUpdated();
  } catch (err) {
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
  repo = r;
  work = null;
  current = '';
  ordering = false;
  show('desk');
  $('body').value = '';
  /** @type {HTMLTextAreaElement} */ ($('body')).disabled = true;
  $('episode-title').value = '';
  $('tree').innerHTML = '';
  $('work-title').value = r.full_name.split('/')[1];
  /** @type {Draft[]} */
  const kept = await store.all('drafts');
  drafts = new Map(kept.filter(d => d.repo === r.full_name).map(d => [d.path, d]));
  edits = (await store.get('prefs', `edits:${r.full_name}`)) ?? [];
  folded = (await store.get('prefs', `closed:${r.full_name}`)) ?? [];
  changed = new Map(Object.entries((await store.get('prefs', `changed:${r.full_name}`)) ?? {}));
  mode = syncMode(await store.get('prefs', `sync:${r.full_name}`));
  await reload();
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
    dragging = node.dataset.node ?? null;
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
  renderToc();
  readState(now());
  sendSoon();
}

let wired = false;
// the desk's buttons and the text box, once
/** @param {{ changeRepo: () => void }} on */
export function wire(on) {
  if (wired) return;
  wired = true;
  const area = /** @type {HTMLTextAreaElement} */ ($('body'));
  evenBreaks(area);
  area.addEventListener('input', e => {
    if (!(/** @type {InputEvent} */ (e).isComposing) && current) typed();
  });
  area.addEventListener('compositionend', () => current && typed());
  $('tree').addEventListener('click', e => void treeClick(e));
  $('tree').addEventListener('keydown', e => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (e.key === 'Enter' && t.matches('.node')) {
      e.preventDefault();
      t.click();
    }
  });
  $('tree').addEventListener('change', e => {
    const s = /** @type {HTMLElement} */ (e.target).closest('[data-to-chapter]');
    if (s instanceof HTMLSelectElement) void sendOrder(plans.moveToChapter(plans.orderOf(shown().toc), /** @type {string} */ (s.dataset.path), s.value));
  });
  wireDrag();
  $('send').addEventListener('click', () => void sendDrafts());
  $('reload').addEventListener('click', () => void reload());
  $('change-repo').addEventListener('click', on.changeRepo);
  $('menu').addEventListener('click', () => $('desk').classList.toggle('toc-open'));
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
  $('work-title').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('work-title').blur();
  });
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
    busy: () => busy,
    unsent,
    unsentItems: () => unsentList(drafts, edits),
    discard,
  });
  wireBranches();
  wireUnsent();
  sight = new IntersectionObserver(seen => {
    for (const e of seen)
      if (e.isIntersecting) {
        sight?.unobserve(e.target);
        ask(/** @type {HTMLElement} */ (e.target).dataset.path ?? '');
      }
  });
  setInterval(() => void readIn(), 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void sendNow();
    else void readIn();
  });
  addEventListener('online', () => sendSoon(1000));
  $('sync-mode').addEventListener('change', () => void setMode($('sync-mode').value));
  wireNotes();
  wirePlot();
  wireCharacters();
  wireRecord();
  wireReleases();
  wireSideNote();
}
