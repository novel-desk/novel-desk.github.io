// The characters' note read as people (no screen, no state of the app: tested by itself in tests/unit; from the server
// version's public/lib/characters.js). A person is a
// heading and the lines under it, down to the next heading of the same level or higher. The level is that of the first
// heading, or of the headings under it when it is the note's title (a 「# 」 heading that says it is the characters':
// キャラ, 登場人物, 人物, character): 「# 登場人物」 and 「## 黒崎零」「## カミヤ」 → 2; 「# 黒崎零」 and its 「## 過去」 → 1
// (one person); 「## 黒崎零」「## カミヤ」「# 付録」 → 2. A heading deeper than the people's (「### 過去」) stays inside its
// person: people grouped under headings (「## 味方」「### 零」) are cards by group. A note written with CRLF is read as LF.

import { esc } from './format.js';
import { noteHeading } from './notes.js';
import { plain } from './plot.js';

/** @typedef {{ head: string, body: string[], start: number, end: number }} Person (start, end: its lines in the note) */
/** @typedef {{ level: number, people: Person[] }} Characters (level: of the people's headings; 2 when there are none) */

/** @type {(text: string) => { level: number, head: string, at: number }[]} */
const headings = text => {
  const out = [];
  let fence = false;
  for (const [at, line] of lf(text).split('\n').entries()) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const h = !fence && /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) out.push({ level: h[1].length, head: h[2].trim(), at });
  }
  return out;
};

/** @type {(text: string) => string} */
const lf = text => text.replace(/\r\n?/g, '\n');

/** @param {string} text @returns {Characters} */
export function parseCharacters(text) {
  const all = headings(text),
    lines = lf(text).split('\n');
  if (!all.length) return { level: 2, people: [] };
  let level = all[0].level;
  // the note's title: the people are the level under it (none yet: the next level)
  if (level === 1 && isCharactersNote(all[0].head)) {
    const deeper = all.filter(h => h.level > level);
    level = deeper.length ? Math.min(...deeper.map(h => h.level)) : level + 1;
  }
  const people = all
    .filter(h => h.level === level)
    .map(h => {
      const next = all.find(o => o.at > h.at && o.level <= level);
      const end = next ? next.at : lines.length;
      return { head: h.head, body: lines.slice(h.at + 1, end), start: h.at, end };
    });
  return { level, people };
}

// the lines of the `nth` person (from 0) under the heading `head` in the note: two may have the same heading (null:
// not there, as when it was renamed elsewhere)
/** @param {string} text @param {string} head @param {number} [nth] @returns {[number, number] | null} */
export function personRange(text, head, nth = 0) {
  const p = parseCharacters(text).people.filter(x => x.head === head.trim())[nth];
  return p ? [p.start, p.end] : null;
}
// which of the people under the same heading the `i`th person is (0: the first so named)
/** @type {(people: Person[], i: number) => number} */
export const nthOf = (people, i) => people.slice(0, i).filter(p => p.head === people[i].head).length;

// the note with a new person at its end: its heading at the people's level, and an empty line under it
/** @param {string} text @param {string} head (a 「## 」 typed before it goes) */
export function addPerson(text, head) {
  const { level } = parseCharacters(text),
    body = lf(text).replace(/\n+$/, '');
  return `${body}${body ? '\n\n' : ''}${'#'.repeat(level)} ${head.trim().replace(/^#+\s*/, '')}\n\n`;
}

// the note with the `i`th person and the one `by` (-1, 1) from it changed places. Each part keeps the empty lines at
// its end where they are, so the spacing between people stays; what lies between the two (a heading above the
// people's level) stays too. Out of range: the note as it is
/** @param {string} text @param {number} i @param {number} by */
export function movePerson(text, i, by) {
  const { people } = parseCharacters(text),
    j = i + by;
  if (!people[i] || !people[j]) return text;
  const [a, b] = i < j ? [people[i], people[j]] : [people[j], people[i]],
    lines = lf(text).split('\n');
  /** @type {(start: number, end: number) => [string[], string[]]} its lines, and the empty lines at its end */
  const part = (start, end) => {
    let k = end;
    while (k > start + 1 && lines[k - 1].trim() === '') k--;
    return [lines.slice(start, k), lines.slice(k, end)];
  };
  const [aText, aTrail] = part(a.start, a.end),
    [bText, bTrail] = part(b.start, b.end);
  return [...lines.slice(0, a.start), ...bText, ...aTrail, ...lines.slice(a.end, b.start), ...aText, ...bTrail, ...lines.slice(b.end)].join('\n');
}

// the note of a new work's characters
export const NEW_CHARACTERS = '# 登場人物\n\n## 主人公\n\n';

// whether a note is the characters', by its name or title (when novel.toml [characters] names none)
/** @type {(name: string, title?: string) => boolean} */
export const isCharactersNote = (name, title = '') => /キャラ|人物|character/i.test(`${name} ${title}`);

// --- the screen キャラ (ui/characters.js draws it)

// The characters' note found among the notes (FR-NOTE-07): the first whose name or title says it is (`texts`: the
// notes' texts, null: not read); and, when the characters are in a folder of their own, a note each, that folder ('' none)
/** @param {{ path: string, name: string }[]} notes @param {Record<string, string | null>} texts */
export function charactersNote(notes, texts) {
  const path = notes.find(f => isCharactersNote(f.name, noteHeading(texts[f.path] ?? '') ?? ''))?.path ?? '';
  const inFolder = notes.find(f => isCharactersNote(f.path.split('/').slice(0, -1).join('/')));
  return { path, folder: inFolder ? inFolder.path.split('/').slice(0, -1).join('/') : '' };
}
// No characters' note: the characters in a folder, a note each (not made again as one), or none (the button to make it)
/** @param {string} folder */
export const charactersEmpty = folder =>
  folder
    ? `<p class="muted small">キャラクターが「${esc(folder)}」に 1 人 1 つの資料で分かれています。ここでは 1 つの資料の見出しを 1 人として並べるので、1 つの資料にまとめるか、novel.toml の [characters] file でまとめた資料を指定してください。</p>`
    : '<p class="muted small">キャラクターの資料がありません。資料の中の見出し（「## 名前」）ごとに、ここで 1 人のカードになります。</p><button id="characters-new">キャラクターの資料を作成</button>';
// The cards, one a person (FR-NOTE-07), each moved up or down (FR-NOTE-10: not past the first or the last) and written by
// itself (FR-NOTE-08); a draft of the note not sent said first; the button to add one (FR-NOTE-09) last
/** @param {Person[]} people @param {boolean} draft */
export const charactersBoard = (people, draft) =>
  (draft ? '<p class="muted small">この端末に、まだ送っていない書きかけがあります（ここにはその内容を出しています）。</p>' : '') +
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
// a card's ↑ or ↓ pressed (FR-NOTE-10): which person, up (-1) or down (1); null for another button
/** @param {{ moveUp?: string, moveDown?: string }} data */
export const cardMove = ({ moveUp, moveDown }) => (moveUp || moveDown ? { i: Number(moveUp ?? moveDown), by: moveUp ? -1 : 1 } : null);
