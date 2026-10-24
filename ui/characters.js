// キャラ: the characters of the work as cards, one a person (FR-NOTE-07). Read from one note: novel.toml [characters]
// file, else the note whose name or title says キャラ, 登場人物 or character. A person is written by itself in the notes'
// editor (FR-NOTE-08); a new one is added at the end of the note (FR-NOTE-09); one is moved up or down (FR-NOTE-10).
// Every change is a change of the note not sent, as anything typed in it (a draft of the note is shown, and changed).
// From the server version's public/ui/characters.js
import { addPerson, isCharactersNote, movePerson, NEW_CHARACTERS, nthOf, parseCharacters, personRange } from '../lib/characters.js';
import { esc } from '../lib/format.js';
import { newNote, noteHeading, notesList } from '../lib/notes.js';
import { plain } from '../lib/plot.js';
import { $, show, toast } from './dom.js';
import { openNote, showPerson } from './notes.js';
import { api } from './shared.js';

/** @type {{ path: string, text: string } | null} the note read when the page was last drawn */
let charNote = null;

// the characters' note: its path, or ('' none) the folder its characters are in one note each, if any
async function charactersPath() {
  const l = api.view().layout;
  if (l.characters) return { path: l.characters, folder: '' };
  const notes = notesList(l, api.files()).filter(f => f.kind === 'note');
  const texts = await api.texts(notes.map(f => f.path));
  const path = notes.find(f => isCharactersNote(f.name, noteHeading(texts[f.path] ?? '') ?? ''))?.path ?? '';
  const inFolder = notes.find(f => isCharactersNote(f.path.split('/').slice(0, -1).join('/')));
  return { path, folder: inFolder ? inFolder.path.split('/').slice(0, -1).join('/') : '' };
}
export async function openCharacters() {
  show('characters');
  $('characters-board').innerHTML = '<p class="muted small">読み込み中…</p>';
  const { path, folder } = await charactersPath();
  const text = path ? (await api.texts([path]))[path] : null;
  charNote = path && text !== null ? { path, text } : null;
  if (charNote) return renderCharacters();
  // the characters in a folder, a note each: not made again as one
  $('characters-board').innerHTML = folder
    ? `<p class="muted small">キャラクターが「${esc(folder)}」に 1 人 1 つの資料で分かれています。ここでは 1 つの資料の見出しを 1 人として並べるので、1 つの資料にまとめるか、novel.toml の [characters] file でまとめた資料を指定してください。</p>`
    : '<p class="muted small">キャラクターの資料がありません。資料の中の見出し（「## 名前」）ごとに、ここで 1 人のカードになります。</p><button id="characters-new">キャラクターの資料を作成</button>';
}
function renderCharacters() {
  const note = /** @type {NonNullable<typeof charNote>} */ (charNote);
  const { people } = parseCharacters(note.text);
  $('characters-board').innerHTML =
    (api.drafts().has(note.path) ? '<p class="muted small">この端末に、まだ送っていない書きかけがあります（ここにはその内容を出しています）。</p>' : '') +
    (people.length ? '' : '<p class="muted small">まだ誰もいません。「人物を追加」で見出しを足せます。</p>') +
    people
      .map(
        (p, i) =>
          `<div class="pcard"><div class="pcard-head"><b>${esc(p.head)}</b><span class="pbox-tools"><button class="ghost" data-move-up="${i}" ${i === 0 ? 'disabled' : ''} title="上へ" aria-label="上へ">↑</button><button class="ghost" data-move-down="${i}" ${i === people.length - 1 ? 'disabled' : ''} title="下へ" aria-label="下へ">↓</button><button class="ghost" data-person="${i}">編集</button></span></div>${
            plain(p.body) ? `<p class="pcard-sum">${esc(plain(p.body))}</p>` : ''
          }</div>`,
      )
      .join('') +
    '<button class="plot-add-group" id="characters-add">人物を追加</button>';
  for (const sum of /** @type {NodeListOf<HTMLElement>} */ ($('characters-board').querySelectorAll('.pcard-sum'))) {
    if (sum.scrollHeight <= sum.clientHeight + 2) continue;
    sum.insertAdjacentHTML('afterend', '<button class="ghost small sum-more" data-more>続きを表示</button>');
  }
}
// the note changed (a person added at its end, or moved), kept as a change not sent
/** @param {(text: string) => string} change */
function changeNote(change) {
  const note = /** @type {NonNullable<typeof charNote>} */ (charNote);
  const text = change(note.text);
  api.keepText(note.path, text);
  charNote = { path: note.path, text };
  renderCharacters();
}
async function makeNote() {
  try {
    const made = newNote(api.view().layout, api.files(), '', 'characters', '登場人物', Date.now());
    if (await api.apply({ moves: [], writes: [{ path: made.path, text: NEW_CHARACTERS }], edits: [], path: '' }, undefined, true)) await openCharacters();
  } catch (err) {
    toast(err.message);
  }
}
/** @param {MouseEvent} e */
async function boardClick(e) {
  const b = /** @type {HTMLElement} */ (e.target).closest('button');
  if (!(b instanceof HTMLElement)) return;
  if (b.id === 'characters-new') return makeNote();
  const { moveUp, moveDown } = b.dataset;
  if (moveUp || moveDown) return changeNote(text => movePerson(text, Number(moveUp ?? moveDown), moveUp ? -1 : 1));
  if (b.id === 'characters-add') {
    const head = prompt('人物の見出し（例: 黒崎零（くろさき れい） 18歳）');
    if (head?.trim()) changeNote(text => addPerson(text, head));
    return;
  }
  if (b.dataset.more !== undefined) {
    const open = /** @type {HTMLElement} */ (b.previousElementSibling).classList.toggle('open');
    b.textContent = open ? '閉じる' : '続きを表示';
    return;
  }
  // a card's 編集: the person written by itself, found again by its heading in the note opened
  const note = /** @type {NonNullable<typeof charNote>} */ (charNote);
  const people = parseCharacters(note.text).people,
    i = Number(b.dataset.person);
  const head = people[i].head,
    nth = nthOf(people, i);
  if (await openNote(note.path, { label: '‹ キャラ', title: 'キャラ一覧に戻る', go: () => void openCharacters() })) {
    showPerson(personRange(/** @type {HTMLTextAreaElement} */ ($('note-body')).value, head, nth), head);
  }
}

export function wireCharacters() {
  $('open-characters').addEventListener('click', () => void openCharacters());
  $('close-characters').addEventListener('click', () => api.back());
  $('characters-board').addEventListener('click', e => void boardClick(e));
}
