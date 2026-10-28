// キャラ: the characters of the work as cards, one a person (FR-NOTE-07). Read from one note: novel.toml [characters]
// file, else the note whose name or title says キャラ, 登場人物 or character. A person is written by itself in the notes'
// editor (FR-NOTE-08); a new one is added at the end of the note (FR-NOTE-09); one is moved up or down (FR-NOTE-10).
// Every change is a change of the note not sent, as anything typed in it (a draft of the note is shown, and changed).
// From the server version's public/ui/characters.js
import {
  addPerson,
  cardMove,
  charactersBoard,
  charactersEmpty,
  charactersNote,
  movePerson,
  NEW_CHARACTERS,
  nthOf,
  parseCharacters,
  personRange,
} from '../lib/characters.js';
import { moreLabel } from '../lib/format.js';
import { newNote, notesList } from '../lib/notes.js';
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
  return charactersNote(notes, await api.texts(notes.map(f => f.path)));
}
export async function openCharacters() {
  show('characters');
  $('characters-board').innerHTML = '<p class="muted small">読み込み中…</p>';
  const { path, folder } = await charactersPath();
  const text = path ? (await api.texts([path]))[path] : null;
  charNote = path && text !== null ? { path, text } : null;
  if (charNote) return renderCharacters();
  // its note there but not to be read: the board left empty, and said (as the server version's)
  if (path && api.files().includes(path)) {
    $('characters-board').innerHTML = '';
    return toast('この資料は開けません（文字コードが UTF-8 ではないか、この端末にまだ読み込まれていません）');
  }
  // the characters in a folder, a note each: not made again as one
  $('characters-board').innerHTML = charactersEmpty(folder);
}
function renderCharacters() {
  const note = /** @type {NonNullable<typeof charNote>} */ (charNote);
  const { people } = parseCharacters(note.text);
  $('characters-board').innerHTML = charactersBoard(people, api.drafts().has(note.path));
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
  const move = cardMove(b.dataset);
  if (move) return changeNote(text => movePerson(text, move.i, move.by));
  if (b.id === 'characters-add') {
    const head = prompt('人物の見出し（例: 黒崎零（くろさき れい） 18歳）');
    if (head?.trim()) changeNote(text => addPerson(text, head));
    return;
  }
  if (b.dataset.more !== undefined) {
    const open = /** @type {HTMLElement} */ (b.previousElementSibling).classList.toggle('open');
    b.textContent = moreLabel(open);
    return;
  }
  // a card's 編集: the person written by itself, found again by its heading in the note opened
  const note = /** @type {NonNullable<typeof charNote>} */ (charNote);
  const people = parseCharacters(note.text).people,
    i = Number(b.dataset.person);
  const head = people[i].head,
    nth = nthOf(people, i);
  // (the note was read when the page was drawn: it opens; drawn again when it changes, so the person is in it)
  await openNote(note.path, { label: '‹ キャラ', title: 'キャラ一覧に戻る', go: () => void openCharacters() });
  showPerson(/** @type {[number, number]} */ (personRange(/** @type {HTMLTextAreaElement} */ ($('note-body')).value, head, nth)), head);
}

export function wireCharacters() {
  $('open-characters').addEventListener('click', () => void openCharacters());
  $('close-characters').addEventListener('click', () => api.back());
  $('characters-board').addEventListener('click', e => void boardClick(e));
}
