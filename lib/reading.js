// The preview and the way to the next and previous episodes, decided (FR-EDIT-05, FR-EDIT-06; ui/reading.js measures
// the page and moves it; no screen, no state of the app: tested by itself in tests/unit): the way on at the preview's
// end, the place read kept, the pull past the end, the swipe sideways, the wheel past the end, and the hint shown
import { esc } from './format.js';

// the way to the episodes before and after, at the preview's end (the last one says so)
/** @param {{ title: string } | null} prev @param {{ title: string } | null} next */
export const episodeNav = (prev, next) =>
  `<nav class="ep-nav">${prev ? `<button class="ghost" data-go="-1">‹ ${esc(prev.title)}</button>` : '<span></span>'}${
    next ? `<button class="ghost" data-go="1">${esc(next.title)} ›</button>` : '<span class="muted small">最後の話です</span>'
  }</nav>`;
// the page sliding along the way read: from and to (percent of its size), faded out away from 0
/** @param {string} axis 'X' or 'Y' @param {number} from @param {number} to */
export const slideFrames = (axis, from, to) => [
  { transform: `translate${axis}(${from}%)`, opacity: from ? 0 : 1 },
  { transform: `translate${axis}(${to}%)`, opacity: to ? 0 : 1 },
];
// Where the preview of the episode moved to is scrolled: pulled back from the top of the next (`atEnd`, read in the
// preview, the way on there), the end of this one, just above the way on (`navTops`: its top from the preview's top;
// none when it is not there); else its top
/** @param {{ atEnd: boolean, reading: boolean, navTops: number[], height: number }} o */
export const scrollAfterMove = ({ atEnd, reading, navTops, height }) => (atEnd && reading && navTops.length ? Math.max(0, navTops[0] - height + 40) : 0);

// The place read in the preview: the first line of the text not above its top (`rows`: each line's top in what it
// scrolls, its height), and how far into it. One is there: the room under the last line is less than the preview
/** @param {{ line: number, top: number, height: number }[]} rows @param {number} scrollTop */
export function placeAt(rows, scrollTop) {
  const row = /** @type {{ line: number, top: number, height: number }} */ (rows.find(r => r.top + r.height > scrollTop + 1));
  return { line: row.line, into: intoLine(scrollTop, row.top, row.height) };
}
// how far into a line (0 to 1) a place is (its top `top`, its height `height`: one of 0 counts as 1)
/** @param {number} scrollTop @param {number} top @param {number} height */
export const intoLine = (scrollTop, top, height) => Math.max(0, scrollTop - top) / (height || 1);
// where the preview is scrolled to show a place read: into its line (`rows`: the line, none when it is no longer in
// the text: the top)
/** @param {{ top: number, height: number }[]} rows @param {number} into */
export const scrollToPlace = (rows, into) => (rows.length ? rows[0].top + into * rows[0].height : 0);

// --- the hint 「次の話へ移動」, shown only once letting go would move on

// The hint asked for `d` (1 the next, -1 the previous) shown or not, when the one shown is `shown` (0 none): hidden
// only when it is the one shown
/** @param {number} shown @param {number} d @param {boolean} on @returns {{ shown: number, show: boolean, hide: boolean }} */
export function hintStep(shown, d, on) {
  if (on) return { shown: d, show: true, hide: false };
  return shown === d ? { shown: 0, show: false, hide: true } : { shown, show: false, hide: false };
}
// what the hint says, and where it is: over the preview's edge from outside it (`rect`: the preview's; `height`: the hint's)
/** @param {number} d */
export const hintText = d => (d > 0 ? '次の話へ移動' : '前の話へ移動');
/** @param {number} d @param {{ top: number, bottom: number, left: number, width: number }} rect @param {number} height */
export const hintPlace = (d, rect, height) => ({ top: d > 0 ? rect.bottom - height - 12 : rect.top + 12, left: rect.left + rect.width / 2 });

// --- touch: a pull of PULL px past the bottom (or the top), from where the finger started there, then letting go.
// Which edge is decided by the way the finger goes (a short episode is at both at once)

export const PULL = 90;
/** @typedef {{ startY: number | null, can: Record<number, boolean>, edge: number, ready: boolean }} Pull */
/** @typedef {[number, boolean][]} Hints the hints set, in order: [d, on] */
// a touch started: the edges it can pull past (at the bottom with a next episode, at the top with one before)
/** @param {{ 1: boolean, '-1': boolean }} can @param {number} y @returns {Pull} */
export const pullStart = (can, y) => ({ startY: can[1] || can[-1] ? y : null, can, edge: 0, ready: false });
// The finger moved to `y`: the edge it goes to (another way: the hint before taken away); left that edge (`at`: the
// preview at its bottom, at its top), the pull given up; past PULL, ready to move on (the hint shown), or no longer
/** @param {Pull} p @param {number} y @param {{ bottom: boolean, top: boolean }} at @returns {{ pull: Pull, hints: Hints }} */
export function pullMove(p, y, at) {
  if (p.startY === null) return { pull: p, hints: [] };
  /** @type {Hints} */
  const hints = [];
  let { edge, ready } = p;
  const dy = p.startY - y,
    dir = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  if (dir !== edge) {
    if (edge) {
      ready = false;
      hints.push([edge, false]);
    }
    edge = p.can[dir] ? dir : 0;
  }
  if (!edge) return { pull: { ...p, edge, ready }, hints };
  if (!(edge > 0 ? at.bottom : at.top)) {
    hints.push([edge, false]);
    return { pull: { ...p, startY: null, edge, ready: false }, hints };
  }
  const on = dy * edge > PULL;
  if (on !== ready) hints.push([edge, on]);
  return { pull: { ...p, edge, ready: on }, hints };
}
// The finger let go: ready, it moves on to that edge's episode (`go`, 0 none; the hint taken away)
/** @param {Pull} p @returns {{ pull: Pull, go: number }} */
export const pullEnd = p => ({ pull: { ...p, startY: null, ready: false }, go: p.ready ? p.edge : 0 });

// --- a sideways swipe: left for the next, right for the previous. One finger, not from the very left edge (Safari's back)

/** @param {number} fingers @param {number} x @returns {number | null} where it started (null: not a swipe) */
export const swipeStart = (fingers, x) => (fingers === 1 && x > 24 ? x : null);
// where it goes (1 the next, -1 the previous, 0 nowhere): far enough, more sideways than up or down, no text selected
/** @param {number} dx @param {number} dy @param {boolean} selected */
export const swipeOf = (dx, dy, selected) => (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2 && !selected ? (dx < 0 ? 1 : -1) : 0);

// --- the wheel and the trackpad: going on past the bottom (or the top) for a while. Only a turn started there counts

/** @typedef {{ pushed: number, last: number, armed: number }} Wheel */
export const WHEEL = { pushed: 0, last: 0, armed: 0 };
// where a turn of the wheel goes past: down at the bottom with a next episode (1), up at the top with one before (-1)
/** @param {number} deltaY @param {{ bottom: boolean, top: boolean }} at @param {{ next: boolean, prev: boolean }} has */
export const wheelDir = (deltaY, at, has) => (deltaY > 0 && at.bottom && has.next ? 1 : deltaY < 0 && at.top && has.prev ? -1 : 0);
// A turn of `deltaY` at `time` going `dir`: one 300 ms after the last starts a new one (armed by where it goes). Not
// past an edge, or not the way it was armed, or the other way: what was pushed is let go (the hints taken away). Past
// 150, the hint; past 400, it moves on (`go`)
/** @param {Wheel} w @param {number} deltaY @param {number} time @param {number} dir @returns {{ wheel: Wheel, hints: Hints, go: number }} */
export function wheelStep(w, deltaY, time, dir) {
  const armed = time - w.last > 300 ? dir : w.armed;
  let pushed = w.pushed;
  /** @type {Hints} */
  const hints = [];
  if (!dir || armed !== dir || Math.sign(pushed || dir) !== dir) {
    hints.push([1, false], [-1, false]);
    pushed = 0;
  }
  if (!dir || armed !== dir) return { wheel: { pushed, last: time, armed }, hints, go: 0 };
  pushed += deltaY;
  hints.push([dir, Math.abs(pushed) > 150]);
  if (Math.abs(pushed) <= 400) return { wheel: { pushed, last: time, armed }, hints, go: 0 };
  hints.push([dir, false]);
  return { wheel: { pushed: 0, last: time, armed }, hints, go: dir };
}
