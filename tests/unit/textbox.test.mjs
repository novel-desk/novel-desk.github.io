// The text box, decided (lib/textbox.js)
import { test, expect } from 'vitest';
import { barText, caretScroll, laidLine, lineAt, linesBefore, pageShift, previewFace } from '../../lib/textbox.js';

// FR-EDIT-03: the input bar
test('barText: a text as it is; a pair around what is chosen, or the caret between; ルビ around what is chosen, or empty', () => {
  expect(barText({ ins: '……' }, '選')).toEqual({ text: '……', back: 0 });
  expect(barText({ wrap: '「」' }, '選')).toEqual({ text: '「選」', back: 0 });
  expect(barText({ wrap: '「」' }, '')).toEqual({ text: '「」', back: 1 });
  expect(barText({}, '漢字')).toEqual({ text: '｜漢字《》', back: 1 });
  expect(barText({}, '')).toEqual({ text: '｜《》', back: 2 });
});
// FR-EDIT-04: the line being written kept in sight above the keyboard
test('caretScroll: above what is shown, or near its bottom: to the middle (not above the top); in sight: none', () => {
  expect(caretScroll({ y: 100, line: 20, scrollTop: 200, height: 400 })).toBe(0);
  expect(caretScroll({ y: 900, line: 20, scrollTop: 200, height: 400 })).toBe(700);
  expect(caretScroll({ y: 573, line: 20, scrollTop: 200, height: 400 })).toBe(373);
  expect(caretScroll({ y: 572, line: 20, scrollTop: 200, height: 400 })).toBe(null);
  expect(caretScroll({ y: 200, line: 20, scrollTop: 200, height: 400 })).toBe(null);
});
test('pageShift: moved down with the window, or not moved', () => {
  expect(pageShift(120)).toBe('translateY(120px)');
  expect(pageShift(0)).toBe('');
});
// FR-EDIT-05: the place read kept: the lines measured in a copy of the box
test('laidLine, linesBefore, lineAt: an empty line keeps its height; the text above a line; the line at a height', () => {
  expect(laidLine('本文')).toBe('本文');
  expect(laidLine('')).toBe('​');
  expect(laidLine(undefined)).toBe('​');
  expect(linesBefore(['一', '二', ''], 2)).toBe('一\n二');
  expect(linesBefore(['一', '', '三'], 2)).toBe('一\n​');
  expect(linesBefore(['一'], 0)).toBe('');
  expect(lineAt([0, 20, 40, 60], 45)).toBe(2);
  expect(lineAt([0, 20, 40], 100)).toBe(2);
  expect(lineAt([0, 20], 0)).toBe(0);
});
test('previewFace: a pen while reading, a book while writing', () => {
  expect(previewFace(true)).toEqual({ icon: 'pen', title: '編集に戻る' });
  expect(previewFace(false)).toEqual({ icon: 'book', title: 'プレビュー' });
});
