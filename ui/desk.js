// The desk: the table of contents of the work open, the episode being written, its preview, and sending and reading
// again. The work, the drafts and the episode open are this module's: the others call open()
import { afterSend, draftKey, draftOf } from '../lib/drafts.js';
import { charsOf, esc, lineBreaks, n } from '../lib/format.js';
import { imageType } from '../lib/github.js';
import { episodesOf, titleOf } from '../lib/layout.js';
import { picturePaths, renderMd } from '../lib/markdown.js';
import { CONFLICT_MARK } from '../lib/merge.js';
import { $, show, toast } from './dom.js';
import * as store from './db.js';
import { bytes, contents, load } from './work.js';
import { sendAll } from './send.js';
import { GitHubError } from './github.js';

/** @typedef {import('../lib/drafts.js').Draft} Draft */
/** @typedef {{ full_name: string, default_branch: string }} Repo */

/** @type {Repo | null} */
let repo = null;
/** @type {import('./work.js').Work | null} */
let work = null;
/** @type {Map<string, Draft>} the drafts of this work, by path */
let drafts = new Map();
// the episode open ('' = none)
let current = '';
let busy = false;
/** @type {Map<string, string>} the object URLs of the pictures shown, by blob */
const pictures = new Map();
// the drafts written to the device one after another, so that the last one typed is the one kept
let writing = Promise.resolve();

/** @param {string} text @param {'' | 'ok' | 'err'} [kind] */
function syncState(text, kind = '') {
  const s = $('sync-state');
  s.textContent = text;
  s.className = `sync-state ${kind}`;
}
const hasConflict = (/** @type {string} */ text) => text.includes(CONFLICT_MARK);
/** @param {string} path */
const textOf = path => drafts.get(path)?.text ?? work?.texts[path] ?? null;

// --- the table of contents

function renderToc() {
  const w = /** @type {NonNullable<typeof work>} */ (work);
  /** @param {import('../lib/layout.js').TocEpisode} e */
  const episode = e => {
    const text = textOf(e.path) ?? '';
    const tags = (drafts.has(e.path) ? '<span class="unsent-tag">未送信</span>' : '') + (hasConflict(text) ? '<span class="conflict">両方の版</span>' : '');
    return `<button class="node episode${e.path === current ? ' active' : ''}" data-path="${esc(e.path)}"><span class="t">${esc(titleOf(w.layout, e.rel, w.headings))}</span>${tags}<span class="c">${n(charsOf(text))}</span></button>`;
  };
  $('tree').innerHTML =
    w.toc
      .map(it =>
        it.type === 'episode'
          ? episode(it)
          : `<div class="node chapter"><span class="t">${esc(titleOf(w.layout, it.rel, w.headings))}</span></div><div class="chapter-body">${it.episodes.map(episode).join('')}</div>`,
      )
      .join('') || '<p class="muted small">話がありません。novel.toml の manuscript.dir と files を確かめてください。</p>';
  const total = episodesOf(w.toc).reduce((sum, e) => sum + charsOf(textOf(e.path) ?? ''), 0);
  $('work-chars').textContent = `${n(total)}字・${w.branch}`;
  $('send').disabled = busy || drafts.size === 0;
  $('send').textContent = drafts.size ? `送る（${drafts.size}）` : '送る';
  $('reload').disabled = busy;
}

// --- the episode open

function showCounts() {
  const text = $('body').value;
  $('chars').textContent = current ? `${n(charsOf(text))}字` : '';
  $('save-state').textContent = drafts.has(current) ? '未送信（この端末に保存しました）' : '';
  const note = $('episode-note');
  note.hidden = !hasConflict(text);
  note.textContent = '両方の版が並んでいます。「――― ここから」の行を探して整理してください';
}
/** @param {string} path */
async function openEpisode(path) {
  const w = /** @type {NonNullable<typeof work>} */ (work);
  current = path;
  const e = episodesOf(w.toc).find(e => e.path === path);
  const text = textOf(path);
  const area = $('body');
  area.value = text ?? '';
  area.disabled = text === null;
  $('episode-title').textContent = e ? titleOf(w.layout, e.rel, w.headings) : '';
  $('preview-toggle').disabled = text === null;
  showCounts();
  if (text === null) {
    const note = $('episode-note');
    note.hidden = false;
    note.textContent = w.offline ? 'この話はまだこの端末に読み込まれていません（つながってから開いてください）' : '文字コードが UTF-8 ではないため開けません';
  }
  if (!$('preview').hidden) await renderPreview();
  $('desk').classList.remove('toc-open');
  renderToc();
  await store.put('prefs', `episode:${w.repo}`, path);
}
// what was typed: kept on the device at once, with the blob it was written from
function typed() {
  const w = /** @type {NonNullable<typeof work>} */ (work);
  const path = current,
    text = $('body').value;
  const base = drafts.get(path)?.base ?? w.blobs[path].sha;
  const draft = draftOf({ repo: w.repo, path, base, read: w.texts[path] ?? '', text, at: Date.now() });
  if (draft) drafts.set(path, draft);
  else drafts.delete(path);
  const key = draftKey(w.repo, path);
  writing = writing
    .then(async () => {
      if (draft) await store.put('drafts', key, draft);
      else await store.del('drafts', key);
    })
    .catch(err => syncState(`この端末に保存できませんでした（${err.message ?? err}）`, 'err'));
  showCounts();
  renderToc();
}
// put a text in the box, the caret and the scroll where they were
/** @param {HTMLTextAreaElement} area @param {string} text */
function setKeepingCaret(area, text) {
  const [a, b, top] = [area.selectionStart, area.selectionEnd, area.scrollTop];
  area.value = text;
  area.setSelectionRange(Math.min(a, text.length), Math.min(b, text.length));
  area.scrollTop = top;
}
// line and paragraph separators typed or pasted in the box (an iPhone puts them): made line breaks, the caret and the
// scroll where they were (a character for a character), as the server version's textbox.js does. Not while a word is
// being converted: a text put in the box then breaks the word; it is done when the word is (an input again)
/** @param {HTMLTextAreaElement} area */
function evenBreaks(area) {
  area.addEventListener('input', e => {
    if (!(/** @type {InputEvent} */ (e).isComposing) && lineBreaks(area.value) !== area.value) setKeepingCaret(area, lineBreaks(area.value));
  });
  area.addEventListener('compositionend', () => {
    if (lineBreaks(area.value) !== area.value) area.dispatchEvent(new Event('input'));
  });
}

// --- the preview: the pictures read from GitHub (or the device), shown by object URLs

async function renderPreview() {
  const w = /** @type {NonNullable<typeof work>} */ (work);
  const text = $('body').value;
  for (const path of picturePaths(text, current)) {
    const blob = w.blobs[path];
    if (!blob || pictures.has(blob.sha)) continue;
    try {
      const got = w.offline ? await store.get('blobs', blob.sha) : await bytes(w.repo, blob.sha);
      if (got) pictures.set(blob.sha, URL.createObjectURL(new Blob([got], { type: imageType(path) })));
    } catch {}
  }
  $('preview').innerHTML = renderMd(text, current, path => pictures.get(w.blobs[path]?.sha ?? '') ?? '');
}
async function togglePreview() {
  const on = $('preview').hidden;
  if (on) await renderPreview();
  $('preview').hidden = !on;
  $('body').hidden = on;
  $('preview-toggle').textContent = on ? '書く' : 'プレビュー';
}

// --- reading and sending

/** @param {string} when */
const readState = when =>
  work?.offline
    ? syncState('オフラインです。前に読んだ版を出しています（送るのはつながってから）', 'err')
    : syncState(`GitHub から読みました（${when}）`, 'ok');
const now = () => new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

function renderWork() {
  const w = /** @type {NonNullable<typeof work>} */ (work);
  $('work-title').textContent = w.layout.title || w.repo.split('/')[1];
  const problems = $('layout-problems');
  problems.hidden = w.problems.length === 0;
  problems.innerHTML = w.problems.map(p => `<p>${esc(p)}</p>`).join('');
  renderToc();
}
// reads the work from GitHub again; the drafts stay as they are, and the episode open shows its draft if it has one
async function reload() {
  const r = /** @type {Repo} */ (repo);
  busy = true;
  syncState('読み込んでいます…');
  try {
    work = await load(r.full_name, r.default_branch);
  } catch (err) {
    syncState(err.message, 'err');
    return;
  } finally {
    busy = false;
  }
  renderWork();
  readState(now());
  const paths = episodesOf(work.toc).map(e => e.path);
  const last = await store.get('prefs', `episode:${work.repo}`);
  const open = paths.includes(current) ? current : paths.includes(last) ? last : (paths[0] ?? '');
  if (open) await openEpisode(open);
}
async function sendDrafts() {
  const w = /** @type {NonNullable<typeof work>} */ (work);
  busy = true;
  renderToc();
  syncState('送っています…');
  try {
    const result = await sendAll(w, [...drafts.values()]);
    for (const { draft, blob, both } of result.sent) {
      const next = afterSend(drafts.get(draft.path) ?? draft, draft.text, blob, both);
      const key = draftKey(w.repo, draft.path);
      if (next) {
        drafts.set(draft.path, next);
        await store.put('drafts', key, next);
      } else {
        drafts.delete(draft.path);
        await store.del('drafts', key);
      }
    }
    work = await contents({ repo: w.repo, branch: w.branch, commit: result.commit, tree: result.tree, blobs: result.blobs, folders: result.folders }, false);
    const sides = new Set(result.sent.filter(s => s.both).map(s => s.draft.path));
    const titles = episodesOf(work.toc)
      .filter(e => sides.has(e.path))
      .map(e => titleOf(/** @type {NonNullable<typeof work>} */ (work).layout, e.rel, /** @type {NonNullable<typeof work>} */ (work).headings));
    if (sides.size) {
      syncState(`送りました。${titles.join('、')}はほかでも書き換えられていたので、両方の版を並べました（${result.message}）`, 'err');
      toast('ほかでも書き換えられていた話があります。両方の版を並べました');
    } else syncState(`送りました（${result.message}）`, 'ok');
    renderWork();
    if (current && !drafts.has(current)) setKeepingCaret($('body'), work.texts[current] ?? '');
    showCounts();
  } catch (err) {
    syncState(
      err instanceof GitHubError && err.status === 0
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
  show('desk');
  $('body').value = '';
  $('body').disabled = true;
  $('episode-title').textContent = '';
  $('tree').innerHTML = '';
  $('work-title').textContent = r.full_name.split('/')[1];
  /** @type {Draft[]} */
  const kept = await store.all('drafts');
  drafts = new Map(kept.filter(d => d.repo === r.full_name).map(d => [d.path, d]));
  await reload();
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
  $('tree').addEventListener('click', e => {
    const node = /** @type {HTMLElement} */ (e.target).closest('.node.episode');
    if (node instanceof HTMLElement && node.dataset.path) void openEpisode(node.dataset.path);
  });
  $('send').addEventListener('click', () => void sendDrafts());
  $('reload').addEventListener('click', () => void reload());
  $('preview-toggle').addEventListener('click', () => void togglePreview());
  $('change-repo').addEventListener('click', on.changeRepo);
  $('menu').addEventListener('click', () => $('desk').classList.toggle('toc-open'));
  $('scrim').addEventListener('click', () => $('desk').classList.remove('toc-open'));
}
