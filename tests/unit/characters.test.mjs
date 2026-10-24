import { describe, test, expect } from 'vitest';
import { parseCharacters, personRange, nthOf, addPerson, movePerson, isCharactersNote, NEW_CHARACTERS } from '../../lib/characters.js';

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
