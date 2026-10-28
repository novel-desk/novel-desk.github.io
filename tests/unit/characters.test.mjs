import { describe, test, expect } from 'vitest';
import {
  parseCharacters,
  personRange,
  nthOf,
  addPerson,
  movePerson,
  isCharactersNote,
  NEW_CHARACTERS,
  charactersNote,
  charactersEmpty,
  charactersBoard,
  cardMove,
} from '../../lib/characters.js';

describe('characters', () => {
  // FR-NOTE-07: a person is a heading and its lines; the note's title above them is not one; a deeper heading stays
  // inside its person; a heading in a fence is not one
  test('people under a title', () => {
    const text = ['# 登場人物', '前書き', '## 黒崎零 18歳', '主人公', '### 過去', '研究科', '```', '## フェンスの中', '```', '## カミヤ', 'パイロット'].join(
      '\n',
    );
    const { level, people } = parseCharacters(text);
    expect(level).toBe(2);
    expect(people.map(p => p.head)).toEqual(['黒崎零 18歳', 'カミヤ']);
    expect(people[0].body).toEqual(['主人公', '### 過去', '研究科', '```', '## フェンスの中', '```']);
    expect([people[0].start, people[0].end]).toEqual([2, 9]);
    expect([people[1].start, people[1].end]).toEqual([9, 11]);
  });

  // FR-NOTE-07: people as the top headings themselves (no title); a section after them at a higher level ends the last
  test('people with no title, and a higher heading after them', () => {
    expect(parseCharacters('# 零\na\n# カミヤ\nb').people.map(p => [p.head, p.body])).toEqual([
      ['零', ['a']],
      ['カミヤ', ['b']],
    ]);
    const { people } = parseCharacters('## 零\na\n## カミヤ\nb\n# 付録\nc');
    expect(people.map(p => p.head)).toEqual(['零', 'カミヤ']);
    expect(people[1].end).toBe(4);
    // a title alone, nobody yet; and no heading at all
    expect(parseCharacters('# 登場人物\n説明')).toEqual({ level: 2, people: [] });
    expect(parseCharacters('説明だけ')).toEqual({ level: 2, people: [] });
    // a title that says it is the characters', with an appendix at its level after the people; a person with a deeper
    // heading under it is not a title
    expect(parseCharacters('# 登場人物\n## 零\n## カミヤ\n# 付録\nc').people.map(p => p.head)).toEqual(['零', 'カミヤ']);
    expect(parseCharacters('# 零\n### 過去\n# カミヤ').people.map(p => [p.head, p.body])).toEqual([
      ['零', ['### 過去']],
      ['カミヤ', []],
    ]);
  });

  // FR-NOTE-07: a 「# 」 heading that is not a title of characters is a person, with what is under it (only the
  // protagonist written yet); one person at 「## 」 alone; a note written with CRLF
  test('one person, and CRLF', () => {
    expect(parseCharacters('# 黒崎零\n研究科\n## 過去\n## 性格').people.map(p => p.head)).toEqual(['黒崎零']);
    expect(parseCharacters('## 零\na').people.map(p => [p.head, p.body])).toEqual([['零', ['a']]]);
    const crlf = parseCharacters('# 登場人物\r\n## 零\r\na\r\n## カミヤ\r\n');
    expect(crlf.people.map(p => [p.head, p.body])).toEqual([
      ['零', ['a']],
      ['カミヤ', ['']],
    ]);
  });

  // FR-NOTE-08: the lines of one person, found again by its heading (not there: null)
  test('the lines of a person', () => {
    const text = '# 登場人物\n## 零\na\n## カミヤ\nb\n';
    expect(personRange(text, 'カミヤ')).toEqual([3, 6]);
    expect(personRange(text, ' 零 ')).toEqual([1, 3]);
    expect(personRange(text, 'リン')).toBeNull();
    // two of the same heading: the second found as the second
    const two = '## ？？？\na\n## ？？？\nb';
    const { people } = parseCharacters(two);
    expect([nthOf(people, 0), nthOf(people, 1)]).toEqual([0, 1]);
    expect(personRange(two, '？？？', 1)).toEqual([2, 4]);
    expect(personRange(two, '？？？', 2)).toBeNull();
  });

  // FR-NOTE-09: a new person goes at the end, at the people's level
  test('a new person', () => {
    expect(addPerson('# 登場人物\n\n## 零\na\n\n', ' リン ')).toBe('# 登場人物\n\n## 零\na\n\n## リン\n\n');
    expect(addPerson('# 零\na\n# カミヤ', 'リン')).toBe('# 零\na\n# カミヤ\n\n# リン\n\n');
    expect(addPerson('', 'リン')).toBe('## リン\n\n');
    expect(addPerson('# 登場人物\n説明\n', 'リン')).toBe('# 登場人物\n説明\n\n## リン\n\n');
    expect(parseCharacters(NEW_CHARACTERS).people.map(p => p.head)).toEqual(['主人公']);
    // a 「## 」 typed with the name goes; one person at 「## 」: the next at the same level; a CRLF note written as LF
    expect(addPerson('## 零\na', '## リン')).toBe('## 零\na\n\n## リン\n\n');
    expect(addPerson('# 登場人物\r\n## 零\r\n', 'リン')).toBe('# 登場人物\n## 零\n\n## リン\n\n');
  });

  // FR-NOTE-10: a person changes places with the next or the one before; the spacing stays where it was, and what lies
  // between two people (a heading above their level) stays between them; out of range: as it is
  test('a person moved', () => {
    const text = '# 登場人物\n\n## 零\na\n\n## カミヤ\nb\n\n\n## リン\nc\n';
    expect(movePerson(text, 0, 1)).toBe('# 登場人物\n\n## カミヤ\nb\n\n## 零\na\n\n\n## リン\nc\n');
    expect(movePerson(text, 2, -1)).toBe('# 登場人物\n\n## 零\na\n\n## リン\nc\n\n\n## カミヤ\nb\n');
    expect(movePerson(text, 0, -1)).toBe(text);
    expect(movePerson(text, 2, 1)).toBe(text);
    expect(movePerson('## 零\na\n# 付録\nx\n## カミヤ\nb', 1, -1)).toBe('## カミヤ\nb\n# 付録\nx\n## 零\na');
    // a CRLF note: written with LF
    expect(movePerson('## 零\r\na\r\n## カミヤ\r\nb', 0, 1)).toBe('## カミヤ\nb\n## 零\na');
  });

  // FR-NOTE-07: the characters' note by its name or title
  test('the characters note by name', () => {
    expect(isCharactersNote('characters')).toBe(true);
    expect(isCharactersNote('07_Characters')).toBe(true);
    expect(isCharactersNote('people', '登場人物')).toBe(true);
    expect(isCharactersNote('people', '主要人物')).toBe(true);
    expect(isCharactersNote('キャラ/alice')).toBe(true);
    expect(isCharactersNote('02_world', '世界設定資料集')).toBe(false);
  });
});

describe('the screen キャラ', () => {
  // FR-NOTE-07: the note found by its name or its title; the characters in a folder, a note each
  test('charactersNote: by name, by title (its text read), none; the folder of the characters', () => {
    const notes = [
      { path: 'notes/world.md', name: 'world.md' },
      { path: 'notes/a.md', name: 'a.md' },
      { path: 'notes/キャラ/rei.md', name: 'rei.md' },
    ];
    expect(charactersNote(notes, { 'notes/a.md': '# 登場人物\n' })).toEqual({ path: 'notes/a.md', folder: 'notes/キャラ' });
    expect(charactersNote([{ path: 'notes/characters.md', name: 'characters.md' }], {})).toEqual({ path: 'notes/characters.md', folder: '' });
    expect(charactersNote([{ path: 'notes/world.md', name: 'world.md' }], { 'notes/world.md': null })).toEqual({ path: '', folder: '' });
    expect(charactersNote([{ path: 'notes/world.md', name: 'world.md' }], { 'notes/world.md': '本文だけ' })).toEqual({ path: '', folder: '' });
  });
  test('charactersEmpty: the characters in a folder (said, not made again as one); none (the button to make the note)', () => {
    expect(charactersEmpty('notes/<キャラ>')).toContain('キャラクターが「notes/&lt;キャラ&gt;」に 1 人 1 つの資料で分かれています');
    expect(charactersEmpty('notes/<キャラ>')).not.toContain('characters-new');
    expect(charactersEmpty('')).toContain('<button id="characters-new">キャラクターの資料を作成</button>');
  });
  // FR-NOTE-07, FR-NOTE-08, FR-NOTE-10: a card each, ↑ not on the first, ↓ not on the last, 編集; the text cut to its lines
  test('charactersBoard: the draft said, the cards with their tools, the button to add one', () => {
    const people = [
      { head: '零<', body: ['主人公'], start: 0, end: 2 },
      { head: 'カミヤ', body: [''], start: 2, end: 3 },
    ];
    const html = charactersBoard(people, true);
    expect(html.startsWith('<p class="muted small">この端末に、まだ送っていない書きかけがあります')).toBe(true);
    expect(html).toContain('<b>零&lt;</b>');
    expect(html).toContain('data-move-up="0" disabled');
    expect(html).toContain('data-move-down="0"  title');
    expect(html).toContain('data-move-up="1"  title');
    expect(html).toContain('data-move-down="1" disabled');
    expect(html).toContain('<button class="ghost" data-person="1">編集</button>');
    expect(html).toContain('<p class="pcard-sum">主人公</p>');
    expect(html.match(/pcard-sum/g)).toHaveLength(1);
    expect(html.endsWith('<button class="plot-add-group" id="characters-add">人物を追加</button>')).toBe(true);
    expect(html).not.toContain('まだ誰もいません');
    const none = charactersBoard([], false);
    expect(none).toBe(
      '<p class="muted small">まだ誰もいません。「人物を追加」で見出しを足せます。</p><button class="plot-add-group" id="characters-add">人物を追加</button>',
    );
  });
  test('cardMove: ↑ is -1, ↓ is 1, by the card; another button: none', () => {
    expect(cardMove({ moveUp: '2' })).toEqual({ i: 2, by: -1 });
    expect(cardMove({ moveDown: '0' })).toEqual({ i: 0, by: 1 });
    expect(cardMove({})).toBe(null);
  });
});
