// The text box of the episode: the input bar, where things are laid out in it. From the server version's
// public/ui/textbox.js
import { lineBreaks } from '../lib/format.js';
import { barText, caretScroll, laidLine, lineAt, linesBefore, pageShift, previewFace } from '../lib/textbox.js';

/** @typedef {import('./dom.js').El} El */

// put a text in the box, the caret and the scroll where they were
/** @param {HTMLTextAreaElement} area @param {string} text */
export function setKeepingCaret(area, text) {
  const [a, b, top] = [area.selectionStart, area.selectionEnd, area.scrollTop];
  area.value = text;
  area.setSelectionRange(Math.min(a, text.length), Math.min(b, text.length));
  area.scrollTop = top;
}
// line and paragraph separators typed or pasted in the box (an iPhone puts them): made line breaks, the caret and the
// scroll where they were (a character for a character), as the server version's textbox.js does (FR-EDIT-10). Not
// while a word is being converted: a text put in the box then breaks the word; it is done when the word is (an input
// again)
/** @param {HTMLTextAreaElement} area */
export function evenBreaks(area) {
  area.addEventListener('input', e => {
    if (!(/** @type {InputEvent} */ (e).isComposing) && lineBreaks(area.value) !== area.value) setKeepingCaret(area, lineBreaks(area.value));
  });
  area.addEventListener('compositionend', () => {
    if (lineBreaks(area.value) !== area.value) area.dispatchEvent(new Event('input'));
  });
}
// a text put where the caret is, when the browser's own insertText cannot (it is not undone with the browser's undo)
/** @param {HTMLTextAreaElement} area @param {string} text */
export function insertAt(area, text) {
  const { selectionStart: a, selectionEnd: b, value } = area;
  area.value = value.slice(0, a) + text + value.slice(b);
  area.selectionStart = area.selectionEnd = a + text.length;
  area.dispatchEvent(new Event('input'));
  area.focus();
}

// where things are in a textarea can only be measured in a hidden copy of it, laid out the same way (width, font,
// padding, wrapping). fill puts the text in and returns what to read once it is laid out
/** @template T @param {HTMLTextAreaElement} area @param {(copy: HTMLDivElement) => () => T} fill @returns {T} */
export function inBoxCopy(area, fill) {
  const cs = getComputedStyle(area),
    copy = document.createElement('div');
  for (const k of ['font', 'letterSpacing', 'lineHeight', 'paddingTop', 'paddingLeft', 'paddingRight', 'textIndent', 'wordBreak', 'lineBreak', 'overflowWrap'])
    /** @type {any} */ (copy.style)[k] = /** @type {any} */ (cs)[k];
  Object.assign(copy.style, {
    position: 'absolute',
    visibility: 'hidden',
    top: '0',
    left: '-9999px',
    boxSizing: 'border-box',
    width: `${area.clientWidth}px`,
    whiteSpace: 'pre-wrap',
  });
  const read = fill(copy);
  document.body.append(copy);
  try {
    return read();
  } finally {
    copy.remove();
  }
}
// line n of the text box: its top and height (the caller's line is one of the box's: the preview is of its text)
/** @param {HTMLTextAreaElement} area @param {number} n */
export function lineInBox(area, n) {
  const lines = area.value.split('\n');
  return inBoxCopy(area, copy => {
    copy.textContent = linesBefore(lines, n);
    const it = document.createElement('div');
    it.textContent = laidLine(lines[n]);
    copy.append(it);
    return () => ({ top: it.offsetTop, height: it.offsetHeight });
  });
}
// the line at a height in the text box (lines are laid out 200 at a time, only as far as that height)
/** @param {HTMLTextAreaElement} area @param {number} y */
export function lineAtInBox(area, y) {
  const lines = area.value.split('\n');
  return inBoxCopy(area, copy => () => {
    for (let from = 0; from < lines.length; from += 200) {
      for (const line of lines.slice(from, from + 200)) {
        const d = document.createElement('div');
        d.textContent = laidLine(line);
        copy.append(d);
      }
      if (copy.offsetHeight > y + 1) break;
    }
    const divs = /** @type {HTMLElement[]} */ ([...copy.children]);
    const i = lineAt(
      divs.map(d => d.offsetTop),
      y,
    );
    return { line: i, top: divs[i].offsetTop, height: divs[i].offsetHeight };
  });
}

// --- the input bar (Nola 風): 「」 …… ―― 全角スペース ルビ, undo, redo, just above the keyboard while writing (FR-EDIT-03,
// FR-EDIT-04). Inserted with insertText, so the browser's own undo takes them back too. `page` is the screen cut to
// above the keyboard while writing, `view` shows the text as read
/** @param {El} bar @param {HTMLTextAreaElement} area @param {El} page @param {() => void} view */
export function inputBar(bar, area, page, view) {
  /** @type {(text: string, caretFromEnd: number) => void} */
  const put = (text, caretFromEnd) => {
    area.focus();
    if (!document.execCommand('insertText', false, text)) insertAt(area, text);
    if (caretFromEnd) area.selectionStart = area.selectionEnd = area.selectionEnd - caretFromEnd;
  };
  // over the keyboard: iOS keeps the page's size, lays the keyboard over it and moves the window onto the page down
  // (visualViewport.pageTop). While writing, the page is cut to what is shown and moved along to where the window is,
  // so the bar, under the text, sits on the keyboard
  const fitNow = () => {
    if (!page.classList.contains('writing') || !window.visualViewport) return;
    const vv = window.visualViewport,
      h = `${vv.height}px`,
      moved = page.style.height !== h;
    page.style.height = h;
    page.style.transform = pageShift(vv.pageTop);
    // the caret's line follows at once, every time the page gets shorter
    if (moved) showCaret();
  };
  // the line being written stays in sight: where the caret is, measured in a hidden copy of the box
  const showCaret = () => {
    if (document.activeElement !== area) return;
    const { y, line } = inBoxCopy(area, copy => {
      copy.textContent = area.value.slice(0, area.selectionEnd);
      const mark = document.createElement('span');
      mark.textContent = '​';
      copy.append(mark);
      return () => ({ y: mark.offsetTop, line: mark.offsetHeight });
    });
    const to = caretScroll({ y, line, scrollTop: area.scrollTop, height: area.clientHeight });
    if (to !== null) area.scrollTop = to;
  };
  // the keyboard slides in (and iOS shifts the page) after the first resize: measure again until it settles
  let settle = 0;
  const fit = () => {
    fitNow();
    const until = performance.now() + 1000;
    if (settle) return void (settle = until);
    settle = until;
    const tick = () => {
      fitNow();
      if (performance.now() < settle) requestAnimationFrame(tick);
      else settle = 0;
    };
    requestAnimationFrame(tick);
  };
  const down = () => {
    bar.hidden = true;
    page.classList.remove('writing');
    page.style.height = page.style.transform = '';
  };
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let hideTimer = undefined;
  // fingers only: on a computer the keyboard has all of these
  const touch = matchMedia('(pointer: coarse)');
  area.addEventListener('focus', () => {
    clearTimeout(hideTimer);
    if (!touch.matches) return;
    bar.hidden = false;
    page.classList.add('writing');
    fit();
  });
  area.addEventListener('blur', () => {
    hideTimer = setTimeout(down, 150);
  });
  window.visualViewport?.addEventListener('resize', fit);
  window.visualViewport?.addEventListener('scroll', fit);
  // the text box keeps the focus (and the keyboard stays up)
  bar.addEventListener('pointerdown', e => e.preventDefault());
  bar.addEventListener('click', e => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button');
    if (!b) return;
    const sel = area.value.slice(area.selectionStart, area.selectionEnd);
    if (b.dataset.cmd) {
      area.focus();
      document.execCommand(b.dataset.cmd);
      return;
    }
    // プレビュー: the keyboard goes away and the page is read (the page back to its full size first)
    if ('view' in b.dataset) {
      clearTimeout(hideTimer);
      area.blur();
      clearTimeout(hideTimer);
      down();
      view();
      return;
    }
    // 「」 …… ―― 全角スペース, or ルビ (the bar's last kind of button)
    const { text, back } = barText(b.dataset, sel);
    put(text, back);
  });
}

// the preview button's two faces (as the server version's public/ui/textbox.js)
const ICON_EYE =
    /* プレビュー: an open book */ '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>',
  ICON_PEN =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/></svg>';
// the preview button: an open book while writing, a pen while reading
/** @param {El} btn @param {boolean} reading */
export function setPreviewButton(btn, reading) {
  const face = previewFace(reading);
  btn.innerHTML = { pen: ICON_PEN, book: ICON_EYE }[face.icon];
  btn.title = face.title;
  btn.setAttribute('aria-label', btn.title);
  btn.classList.toggle('on', reading);
}
