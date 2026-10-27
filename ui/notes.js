// 資料: the notes of the work (the .md files of the notes folder) and its pictures; a note written, previewed, made,
// renamed, put in the trash (FR-NOTE-01〜06). A note is written as an episode is: what is typed is kept on the device
// as a change not sent. A box of the plot or a person of the characters is written here by itself (its lines only).
// From the server version's public/ui/notes.js
import { trashStamp, cleanTitle } from '../lib/episodes.js';
import { esc, whenLong } from '../lib/format.js';
import { picturePaths, relPath, renderMd } from '../lib/markdown.js';
import { CONFLICT_MARK } from '../lib/merge.js';
import { groupNotes } from '../lib/notelist.js';
import { newNote, noteHeading, notesList, renameNote, trashNote } from '../lib/notes.js';
import { boxRange, parsePlot, plotPathOf } from '../lib/plot.js';
import { $, busy, show, toast } from './dom.js';
import { showHistory } from './history.js';
import { pickImage, renderImages, wireImages } from './images.js';
import { api } from './shared.js';
import { evenBreaks, inBoxCopy, inputBar, insertAt, setKeepingCaret, setPreviewButton } from './textbox.js';

/** @type {string | null} the note open */
let notePath = null;
// a box of the plot or a person written by itself: the lines before and after it (null: the whole note is in the box)
/** @type {{ before: string[], after: string[] } | null} */
let noteSection = null;
/** @typedef {{ label: string, title: string, go: () => void }} Back where 「‹」 goes from the note */
/** @type {Back} */
const LIST = { label: '‹ 一覧', title: '資料の一覧に戻る', go: () => void openNotes() };
/** @type {Back} */
let back = LIST;
const area = () => /** @type {HTMLTextAreaElement} */ ($('note-body'));
// the note's whole text (a box written by itself: put back between the lines around it)
const noteText = () => (noteSection ? [...noteSection.before, ...area().value.split('\n'), ...noteSection.after].join('\n') : area().value);

// the notes of the work, with their texts' headings (the list shows them in place of the file names)
async function notesWithTitles() {
  const notes = notesList(api.view().layout, api.files()).filter(f => f.kind === 'note');
  const texts = await api.texts(notes.map(f => f.path));
  return notes.map(f => ({ ...f, title: noteHeading(texts[f.path] ?? '') ?? undefined, updated: 0 }));
}
// the work's plot note: [plot] file, else the note named プロット or plot ('' none)
export async function plotPath() {
  return plotPathOf(api.view().layout.plot, await notesWithTitles());
}

const LOADING = '<p class="muted small">読み込んでいます…</p>';
export async function openNotes() {
  // (opened from the desk: what the lists showed before, maybe of another work, emptied until this work's are read, so
  // that it is neither seen nor pressed. Drawn again on 資料 itself: left until drawn. DESK-OPS-05)
  if ($('notes').hidden) $('notes-list').innerHTML = $('images-list').innerHTML = LOADING;
  show('notes');
  notePath = null;
  $('note-view').hidden = true;
  $('notes-index').hidden = false;
  $('notes').classList.remove('note-open');
  const l = api.view().layout;
  $('notes-where').textContent = l.notes ? '' : '資料のフォルダが設定されていません。novel.toml の [notes] dir を設定すると、ここに表示されます';
  $('notes-where').hidden = Boolean(l.notes);
  const notes = await notesWithTitles();
  const plotFile = plotPathOf(l.plot, notes);
  const { pinned, folders } = groupNotes(notes, l.notes, plotFile);
  const drafts = api.drafts();
  /** @type {(f: import('../lib/notelist.js').NoteRow) => string} */
  const row = f =>
    `<button data-note="${esc(f.path)}"><span>${esc(f.label)}${f.path === plotFile ? ' <span class="vis">プロット</span>' : ''}</span>${drafts.has(f.path) ? '<small class="unsent-tag">未送信</small>' : ''}</button>`;
  const top = pinned.length
    ? `<div class="notes-folder"><span>主な資料</span></div><div class="notes-in">${pinned.map(row).join('')}</div>${notes.length > pinned.length ? '<div class="notes-folder"><span>そのほか</span></div>' : ''}`
    : '';
  $('notes-list').innerHTML = notes.length
    ? top +
      folders
        .map(({ folder, rows }) =>
          folder === ''
            ? rows.map(row).join('')
            : `<div class="notes-folder"><span>${esc(folder)}</span><button class="ghost" data-add-in="${esc(folder)}" title="このフォルダに資料を作成">＋</button></div><div class="notes-in">${rows.map(row).join('')}</div>`,
        )
        .join('')
    : '<p class="muted small">まだ資料がありません。「＋ 資料を追加」で作成できます。</p>';
  await renderImages();
}

/**
 * Opens a note; false when it cannot be read (said in a toast)
 * @param {string} path @param {Back} [from] where 「‹」 goes
 */
export async function openNote(path, from = LIST) {
  const text = (await api.texts([path]))[path];
  if (text === null) {
    toast('この資料は開けません（文字コードが UTF-8 ではないか、この端末にまだ読み込まれていません）');
    return false;
  }
  show('notes');
  notePath = path;
  noteSection = null;
  back = from;
  [$('note-back').textContent, $('note-back').title] = [from.label, from.title];
  $('note-whole').hidden = true;
  $('notes-index').hidden = true;
  $('note-view').hidden = false;
  $('notes').classList.add('note-open');
  $('note-name').textContent = noteHeading(text) ?? /** @type {string} */ (path.split('/').pop());
  area().value = text;
  area().hidden = false;
  $('note-preview').hidden = true;
  setPreviewButton($('note-preview-toggle'), false);
  showState();
  const plot = await plotPath();
  // 「プロットに設定」 only while the work has no plot note: changing it is the plot screen's 「ファイル」
  $('note-as-plot').hidden = Boolean(plot);
  return true;
}
// The note open gone with its text where its file moved elsewhere (FR-NOTE-05: `moves`, from and to): open there
/** @param {[string, string][]} moves */
export function followNote(moves) {
  const to = new Map(moves).get(notePath ?? '');
  if (to) notePath = to;
}
// The work read in, or sent, while the notes are shown (FR-SAVE-08): the list drawn again; the note open, with no draft
// of it, shows what the branch has now, the caret where it was (a box written by itself: the whole note); its draft
// left as it is. A note gone (deleted or moved elsewhere) closed, and said
export async function readInNotes() {
  if ($('notes').hidden) return;
  const path = notePath;
  if (path === null) return openNotes();
  if (!api.files().includes(path)) {
    toast('この資料は、ほかの所で削除されたか、動かされました（書きかけがあれば「未送信の一覧」に残しています）');
    return openNotes();
  }
  if (api.drafts().has(path)) return;
  const text = (await api.texts([path]))[path];
  // (one that cannot be read now, not UTF-8: what is written left as it is, and said)
  if (text === null) {
    $('note-state').textContent = 'GitHub にあるこの資料は UTF-8 ではないので、読み込めませんでした（書いている文章はそのままです）';
    return;
  }
  if (text !== noteText()) {
    noteSection = null;
    $('note-whole').hidden = true;
    $('note-name').textContent = noteHeading(text) ?? /** @type {string} */ (path.split('/').pop());
    setKeepingCaret(area(), text);
    // (the preview open drawn again, as the server version's)
    if (!$('note-preview').hidden) $('note-preview').innerHTML = await previewHtml();
    toast(`資料「${$('note-name').textContent}」に、ほかの端末の更新を読み込みました`);
  }
  showState();
}
function showState() {
  const text = area().value;
  $('note-state').textContent = text.includes(CONFLICT_MARK)
    ? '両方の版が並んでいます。「――― ここから」の行を探して整理してください'
    : api.drafts().has(/** @type {string} */ (notePath))
      ? '端末に保存済み（未送信）'
      : '';
}
// only the lines start..end in the box, the rest of the note kept aside (put back around them when kept)
/** @param {number} start @param {number} end @param {string} name over the text */
function showLines(start, end, name) {
  const lines = area().value.split('\n');
  noteSection = { before: lines.slice(0, start), after: lines.slice(end) };
  area().value = lines.slice(start, end).join('\n');
  $('note-name').textContent = name;
  $('note-whole').hidden = false;
  area().scrollTop = 0;
  area().setSelectionRange(0, 0);
}
// a box of the plot written by itself (FR-PLOT-03): found again by its heading in the note open (not found: the whole)
/** @param {'g' | 'c'} kind @param {number} gi @param {number | undefined} ci @param {string} want the box's heading */
export function showBox(kind, gi, ci, want) {
  const lines = area().value.split('\n');
  // (the note open is the one the boxes were drawn from: the box is in it. A box without a heading, the part before the
  // first 大箱, is not written by itself)
  const range = boxRange(parsePlot(area().value), kind, gi, ci);
  if (!/^#{1,2}\s/.test(lines[range[0]]) || lines[range[0]].replace(/^#{1,2}\s+/, '').trim() !== want) return;
  showLines(range[0], range[1], want.replace(/^大箱[\d０-９]+[：:]\s*/, ''));
}
// a person of the characters written by itself (FR-NOTE-08), as a box of the plot
/** @param {[number, number]} range its lines in the note open @param {string} head */
export function showPerson(range, head) {
  showLines(range[0], range[1], head);
}
// 「全体」: the whole note again, the caret where the box begins (its button shown only while a box is written by itself)
function showWhole() {
  const at = /** @type {NonNullable<typeof noteSection>} */ (noteSection).before.reduce((n, l) => n + l.length + 1, 0);
  area().value = noteText();
  noteSection = null;
  $('note-whole').hidden = true;
  $('note-name').textContent = noteHeading(area().value) ?? /** @type {string} */ (/** @type {string} */ (notePath).split('/').pop());
  area().setSelectionRange(at, at);
  const { y } = inBoxCopy(area(), copy => {
    copy.textContent = area().value.slice(0, at);
    const mark = document.createElement('span');
    mark.textContent = '​';
    copy.append(mark);
    return () => ({ y: mark.offsetTop });
  });
  area().scrollTop = Math.max(0, y - 8);
}
// the note as read: its pictures from GitHub or the device
async function previewHtml() {
  const path = /** @type {string} */ (notePath);
  const text = area().value;
  /** @type {Record<string, string>} */
  const urls = {};
  for (const p of picturePaths(text, path)) urls[p] = await api.pictureUrl(p);
  // (the same pictures as picturePaths found)
  return renderMd(text, path, p => urls[p]);
}
async function togglePreview() {
  const on = $('note-preview').hidden === true;
  // (said in the band while its pictures are read: DESK-OPS-05)
  if (on) $('note-preview').innerHTML = await busy('読み込んでいます…', previewHtml);
  $('note-preview').hidden = !on;
  area().hidden = on;
  setPreviewButton($('note-preview-toggle'), on);
}

// a new note: 「名前」 or 「フォルダ/名前」 (its file name in ASCII, its heading the name)
/** @param {string} [folder] */
async function addNote(folder = '') {
  const given = prompt(
    folder
      ? `「${folder}」に作成する資料の名前（ファイル名は英数字になります。例: alice）`
      : '資料の名前（ファイル名は英数字になります。例: characters、world、plot）。フォルダに入れるときは「フォルダ/名前」（例: キャラ/alice）',
  );
  if (!given) return;
  if (!given.trim()) return void toast('名前を入れてください');
  const at = given.lastIndexOf('/');
  const [inFolder, name] = folder ? [folder, given] : [given.slice(0, Math.max(0, at)), given.slice(at + 1)];
  try {
    const made = newNote(api.view().layout, api.files(), inFolder, name, cleanTitle(name), Date.now());
    if (await api.apply({ moves: [], writes: [made], edits: [], path: made.path })) await openNote(made.path);
  } catch (err) {
    toast(err.message);
  }
}
// (the buttons on a note open: a note is open)
async function renameOpen() {
  const path = /** @type {string} */ (notePath);
  const l = api.view().layout;
  const byName = !l.plot && (await plotPath()) === path;
  const isPlot = l.plot === path || byName;
  const file = /** @type {string} */ (path.split('/').pop());
  const now = isPlot ? file.replace(/\.md$/, '') : /** @type {string} */ ($('note-name').textContent);
  const name = prompt(
    isPlot
      ? 'プロットの資料の新しいファイル名（英数字と - _）。大箱の見出しは変えません'
      : '資料の新しい名前（資料の 1 行目の見出しになります。ファイル名は英数字になり、英数字が無ければ今のままです）',
    now,
  );
  if (name === null || !name.trim() || name.trim() === now) return;
  try {
    const plan = renameNote(l, api.files(), path, name.trim(), cleanTitle(name.trim()), noteText(), byName);
    if (await api.apply(plan)) {
      toast('資料の名前を変更しました（送るまではこの端末だけの変更です）');
      await openNote(plan.path);
    }
  } catch (err) {
    toast(err.message);
  }
}
async function trashOpen() {
  const path = /** @type {string} */ (notePath);
  if (!confirm(`「${$('note-name').textContent}」を削除しますか？（作品の _trash/ フォルダに移動します。完全には消えません）`)) return;
  if (await api.apply(trashNote(api.view().layout, api.files(), path, trashStamp(Date.now())))) {
    toast('削除しました（_trash/ に移動。送るまではこの端末だけの変更です）');
    await openNotes();
  }
}
async function historyOfOpen() {
  const path = /** @type {string} */ (notePath);
  const d = api.drafts().get(path);
  const w = api.work();
  await showHistory({
    repo: w.repo,
    branch: w.branch,
    path,
    title: noteHeading(noteText()) ?? /** @type {string} */ (path.split('/').pop()),
    what: '資料',
    draft: d?.text !== undefined ? { text: d.text, at: d.at } : null,
    snapshots: await api.snapshots(path),
    remote: Boolean(w.blobs[path]),
    now: noteText,
    // (the history is a modal dialog: the note stays open until it is closed)
    restore: async (text, at) => {
      const title = noteHeading(noteText()) ?? /** @type {string} */ (path.split('/').pop());
      await api.snapshot(path, noteText(), true);
      noteSection = null;
      setKeepingCaret(area(), text);
      api.keepText(path, text);
      // (opened again, as the server version's: its name and 「‹ 一覧」)
      await openNote(path);
      toast(`「${title}」を ${whenLong(at)} の版に復元しました（送るまではこの端末だけの変更です）`);
    },
  });
}

export function wireNotes() {
  wireImages(() => void openNotes());
  evenBreaks(area());
  area().addEventListener('input', e => {
    if (/** @type {InputEvent} */ (e).isComposing || !notePath) return;
    api.keepText(notePath, noteText());
    showState();
  });
  // (the text box is shown only with a note open)
  area().addEventListener('compositionend', () => {
    api.keepText(/** @type {string} */ (notePath), noteText());
    showState();
  });
  $('open-notes').addEventListener('click', () => void openNotes());
  $('close-notes').addEventListener('click', () => {
    notePath = null;
    api.back();
  });
  $('notes-list').addEventListener('click', e => {
    const t = /** @type {HTMLElement} */ (e.target);
    const add = t.closest('[data-add-in]');
    if (add instanceof HTMLElement) return void addNote(add.dataset.addIn);
    const b = t.closest('[data-note]');
    if (b instanceof HTMLElement) void openNote(/** @type {string} */ (b.dataset.note));
  });
  $('add-note').addEventListener('click', () => void addNote());
  $('note-back').addEventListener('click', () => {
    notePath = null;
    back.go();
  });
  $('note-rename').addEventListener('click', () => void renameOpen());
  $('note-trash').addEventListener('click', () => void trashOpen());
  $('note-history').addEventListener('click', () => void historyOfOpen());
  $('note-whole').addEventListener('click', showWhole);
  $('note-preview-toggle').addEventListener('click', () => void togglePreview());
  $('note-as-plot').addEventListener('click', async () => {
    if (await api.apply({ moves: [], writes: [], edits: [{ key: ['plot', 'file'], value: /** @type {string} */ (notePath) }], path: '' }, undefined, true)) {
      $('note-as-plot').hidden = true;
      toast('この資料をプロットにしました（目次の「プロット」で箱になります）');
    }
  });
  $('note-image').addEventListener('click', () => {
    const path = /** @type {string} */ (notePath);
    pickImage(async (file, bytes) => {
      // (another note, or none, open by the time the picture was chosen: not put anywhere)
      if (notePath !== path) return;
      if (await api.apply({ moves: [], writes: [{ path: file, bytes }], edits: [], path: file }, undefined, true)) {
        insertAt(area(), `\n![](${relPath(path, file)})\n`);
        toast('画像を挿入しました（送るまではこの端末だけの変更です）');
      }
    });
  });
  inputBar($('note-kbar'), area(), $('notes'), () => void togglePreview());
}
