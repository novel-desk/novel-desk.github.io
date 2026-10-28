// The text box of an episode or a note, decided (ui/textbox.js measures it and puts the text in; no screen, no state of
// the app: tested by itself in tests/unit): what a button of the input bar puts in, the caret's line kept in sight,
// the lines measured, and the preview button's face

// What a button of the input bar puts in (FR-EDIT-03) where the caret is, and how far before its end the caret goes:
// a text as it is (`ins`); a pair around what is chosen, or the caret between the two (`wrap`); ルビ (none of these):
// ｜選んだ文字《》 with the caret in 《》, nothing chosen ｜《》 with the caret after ｜
/** @param {{ ins?: string, wrap?: string }} data @param {string} chosen @returns {{ text: string, back: number }} */
export function barText(data, chosen) {
  if (data.ins) return { text: data.ins, back: 0 };
  if (data.wrap) {
    const [open, close] = [...data.wrap];
    return chosen ? { text: open + chosen + close, back: 0 } : { text: open + close, back: 1 };
  }
  return chosen ? { text: `｜${chosen}《》`, back: 1 } : { text: '｜《》', back: 2 };
}
// The line being written kept in sight (FR-EDIT-04): the box scrolled to put the caret's line (its top `y`, its height
// `line`) in the middle when it is above what is shown or within 8px of its bottom; null when it is in sight
/** @param {{ y: number, line: number, scrollTop: number, height: number }} o @returns {number | null} */
export const caretScroll = ({ y, line, scrollTop, height }) => (y < scrollTop || y + line > scrollTop + height - 8 ? Math.max(0, y - height / 2) : null);
// the page moved along to where the window is, when iOS has moved it down (visualViewport.pageTop)
/** @param {number} pageTop */
export const pageShift = pageTop => (pageTop ? `translateY(${pageTop}px)` : '');
// a line as the hidden copy of the box lays it out (an empty one has the height of a line)
/** @param {string | undefined} line */
export const laidLine = line => line || '​';
// the text above line n in the copy of the box (an empty line before it keeps its height)
/** @param {string[]} lines @param {number} n */
export const linesBefore = (lines, n) => (n ? lines.slice(0, n).join('\n') + (lines[n - 1] ? '' : '​') : '');
// the line at a height `y` of the box, from the tops of its lines as laid out (the first ones, at least as far as `y`)
/** @param {number[]} tops @param {number} y */
export function lineAt(tops, y) {
  let i = 0;
  while (i + 1 < tops.length && tops[i + 1] <= y) i++;
  return i;
}
// the preview button: a pen while reading (back to writing), an open book while writing
/** @param {boolean} reading @returns {{ icon: 'pen' | 'book', title: string }} */
export const previewFace = reading => (reading ? { icon: 'pen', title: '編集に戻る' } : { icon: 'book', title: 'プレビュー' });
