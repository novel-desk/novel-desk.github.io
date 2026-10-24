import { describe, test, expect } from 'vitest';
import { japanDay, charsDelta, changePart, commitSubject } from '../../lib/commit.js';

describe('commit message', () => {
  test('japanDay: the day in Japan, whatever the time zone', () => {
    expect(japanDay(Date.parse('2026-10-23T15:00:00Z'))).toBe('10/24');
    expect(japanDay(Date.parse('2026-10-23T14:59:59Z'))).toBe('10/23');
    expect(japanDay(Date.parse('2026-01-05T00:00:00Z'))).toBe('1/5');
  });
  test('charsDelta: ＋ and − with the count, nothing when the same', () => {
    expect(charsDelta(10, 330)).toBe(' ＋320字');
    expect(charsDelta(30, 18)).toBe(' −12字');
    expect(charsDelta(5, 5)).toBe('');
  });
  test('changePart: the title with the change of length (not counting spaces); （書き換え） when it is the same', () => {
    expect(changePart({ title: 'はじまり', before: 'あ', after: 'あいう' })).toBe('はじまり ＋2字');
    expect(changePart({ title: '駅で', before: 'あいう', after: 'あ' })).toBe('駅で −2字');
    expect(changePart({ title: '夜', before: 'あい', after: 'いあ\n' })).toBe('夜（書き換え）');
  });
  test('commitSubject: the day and the changes; 整理 for none; four at most; the same twice in a row said once', () => {
    expect(commitSubject('10/24', ['a ＋1字'])).toBe('10/24 a ＋1字');
    expect(commitSubject('10/24', ['a', 'b', 'c', 'd'])).toBe('10/24 a、b、c、d');
    expect(commitSubject('10/24', ['a', 'b', 'c', 'd', 'e'])).toBe('10/24 a、b、c ほか 2 件');
    expect(commitSubject('10/24', ['a', 'a', 'b'])).toBe('10/24 a、b');
    expect(commitSubject('10/24', [])).toBe('10/24 整理');
  });
});
