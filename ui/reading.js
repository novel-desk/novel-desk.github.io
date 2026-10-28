// The preview and the way to the next and previous episodes (FR-EDIT-05, FR-EDIT-06): the buttons at the foot, and in
// the preview a swipe sideways, a pull on past its end, and the page sliding along. The place read stays when the
// preview is switched on and off. From the server version's public/ui/reading.js; the desk gives what it needs
import {
  episodeNav,
  hintPlace,
  hintStep,
  hintText,
  intoLine,
  placeAt,
  pullEnd,
  pullMove,
  pullStart,
  scrollAfterMove,
  scrollToPlace,
  slideFrames,
  swipeOf,
  swipeStart,
  WHEEL,
  wheelDir,
  wheelStep,
} from '../lib/reading.js';
import { $, busy } from './dom.js';
import { lineAtInBox, lineInBox, setPreviewButton } from './textbox.js';

/**
 * What the desk gives: the episode before or after the open one, opening an episode (false when it could not), and the
 * preview's text drawn (without the way on)
 * @typedef {{ neighbor: (d: number) => { path: string, title: string } | null, open: (path: string) => Promise<boolean>, draw: () => Promise<string> }} Desk
 */
/** @type {Desk} */
let desk;
const area = () => /** @type {HTMLTextAreaElement} */ ($('body'));
const pv = () => $('preview');
export const reading = () => !pv().hidden;

// the preview drawn, with the way to the episodes before and after at its end (said in the band while its pictures are
// read: DESK-OPS-05)
export async function renderPreview() {
  const prev = desk.neighbor(-1),
    next = desk.neighbor(1);
  const html = await busy('読み込んでいます…', desk.draw);
  pv().innerHTML = html + episodeNav(prev, next);
}
// the preview on or off, drawn
/** @param {boolean} on */
function setReading(on) {
  pv().hidden = !on;
  area().hidden = on;
  setPreviewButton($('toggle-preview'), on);
}

// the page slides: on along the way read (up for the next, down for the previous; sideways for a swipe)
let going = false;
// the preview kept on while the next episode is opened from it (goEpisode): the episode opened does not switch it off,
// so that its text is not seen as typed while its preview is drawn (DESK-OPS-05). Put in once drawn
let staying = false;
const still = matchMedia('(prefers-reduced-motion: reduce)');
/** @param {number} d 1: the next, -1: the previous @param {boolean} [atEnd] @param {string} [axis] */
export async function goEpisode(d, atEnd = false, axis = 'Y') {
  const ep = desk.neighbor(d);
  if (!ep || going) return;
  going = true;
  const was = reading(),
    page = () => (was ? pv() : area());
  /** @type {(el: HTMLElement, from: number, to: number, ms: number, easing: string) => Promise<unknown>} */
  const move = (el, from, to, ms, easing) =>
    still.matches ? Promise.resolve() : el.animate(slideFrames(axis, from, to), { duration: ms, easing, fill: 'forwards' }).finished;
  try {
    await move(page(), 0, -d * 25, 160, 'ease-in');
    staying = was;
    let opened;
    try {
      opened = await desk.open(ep.path);
    } finally {
      staying = false;
    }
    // (one that cannot be opened: shown as the episode opened shows it, in the text box)
    if (!opened) return stopReading();
    if (was) {
      await renderPreview();
      setReading(true);
    }
    // pulled back from the top of the next: the end of this one (just above the way on)
    const navTops = [...pv().querySelectorAll('.ep-nav')].map(nav => nav.getBoundingClientRect().top - pv().getBoundingClientRect().top);
    pv().scrollTop = scrollAfterMove({ atEnd, reading: was, navTops, height: pv().clientHeight });
    await move(page(), d * 25, 0, 240, 'ease-out');
  } finally {
    for (const el of [pv(), area()]) el.getAnimations().forEach(a => a.cancel());
    going = false;
  }
}

// where an element of the preview is, from the top of what it scrolls
/** @type {(el: Element) => number} */
const topIn = el => el.getBoundingClientRect().top - pv().getBoundingClientRect().top + pv().scrollTop;
// the place read in the preview: the line of the text at its top, and how far into it
export function previewPlace() {
  const p = pv();
  // (every line of the text is an element, and the room under the last is less than the preview's height: one is there)
  const rows = /** @type {HTMLElement[]} */ ([...p.querySelectorAll('[data-l]')]).map(e => ({
    line: Number(e.dataset.l),
    top: topIn(e),
    height: e.offsetHeight,
  }));
  return placeAt(rows, p.scrollTop);
}
// the preview shown, at a place (a line no longer in the text: the top)
/** @param {{ line: number, into: number }} at */
export async function showPreviewAt(at) {
  await renderPreview();
  setReading(true);
  const rows = /** @type {HTMLElement[]} */ ([...pv().querySelectorAll(`[data-l="${at.line}"]`)]).map(el => ({ top: topIn(el), height: el.offsetHeight }));
  pv().scrollTop = scrollToPlace(rows, at.into);
}
// writing ⇄ the preview, the place kept
export async function togglePreview() {
  const a = area();
  if (!reading()) {
    const l = lineAtInBox(a, a.scrollTop);
    return showPreviewAt({ line: l.line, into: intoLine(a.scrollTop, l.top, l.height) });
  }
  const at = previewPlace();
  setReading(false);
  // (the preview is of the text in the box: the line is there)
  const l = lineInBox(a, at.line);
  a.scrollTop = l.top + at.into * l.height;
}
// back to writing (another episode opened; not while the next is opened from the preview)
export const stopReading = () => {
  if (!staying) setReading(false);
};

/** @param {Desk} d */
export function wireReading(d) {
  desk = d;
  $('prev-episode').addEventListener('click', () => void goEpisode(-1));
  $('next-episode').addEventListener('click', () => void goEpisode(1));
  $('toggle-preview').addEventListener('click', () => void togglePreview());
  const p = pv();
  p.addEventListener('click', e => {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-go]');
    if (b instanceof HTMLElement) void goEpisode(Number(b.dataset.go));
  });
  // the preview at its bottom, at its top
  const at = () => ({ bottom: p.scrollTop + p.clientHeight >= p.scrollHeight - 2, top: p.scrollTop <= 0 });
  // 「次の話へ移動」: shown only once letting go would move on, laid over the preview's edge from outside it
  let shown = 0;
  /** @type {(d: number, on: boolean) => void} */
  const hint = (d, on) => {
    const h = $('pull-hint');
    const step = hintStep(shown, d, on);
    shown = step.shown;
    if (step.hide) h.hidden = true;
    if (!step.show) return;
    const r = p.getBoundingClientRect();
    h.textContent = hintText(d);
    h.hidden = false;
    const place = hintPlace(d, r, h.offsetHeight);
    h.style.top = `${place.top}px`;
    h.style.left = `${place.left}px`;
  };
  /** @param {[number, boolean][]} list */
  const hints = list => list.forEach(([d, on]) => hint(d, on));
  // touch: starting at the bottom (or the top), a pull past it, then letting go (lib/reading.js pullMove)
  let pull = pullStart({ 1: false, '-1': false }, 0);
  p.addEventListener(
    'touchstart',
    e => {
      const now = at();
      pull = pullStart({ 1: now.bottom && !!desk.neighbor(1), '-1': now.top && !!desk.neighbor(-1) }, e.touches[0].clientY);
    },
    { passive: true },
  );
  p.addEventListener(
    'touchmove',
    e => {
      const moved = pullMove(pull, e.touches[0].clientY, at());
      pull = moved.pull;
      hints(moved.hints);
    },
    { passive: true },
  );
  p.addEventListener('touchend', () => {
    const ended = pullEnd(pull);
    pull = ended.pull;
    if (ended.go) {
      hint(ended.go, false);
      void goEpisode(ended.go, ended.go < 0);
    }
  });
  // a sideways swipe: left for the next, right for the previous (lib/reading.js swipeOf)
  /** @type {number | null} */
  let sx = null,
    sy = 0;
  p.addEventListener(
    'touchstart',
    e => {
      const t = e.touches[0];
      sx = swipeStart(e.touches.length, t.clientX);
      sy = t.clientY;
    },
    { passive: true },
  );
  p.addEventListener('touchend', e => {
    if (sx == null || pull.ready) return;
    const t = e.changedTouches[0];
    const d = swipeOf(t.clientX - sx, t.clientY - sy, Boolean(getSelection()?.toString()));
    sx = null;
    if (d) void goEpisode(d, false, 'X');
  });
  // wheel and trackpad: going on past the bottom (or the top) for a while (lib/reading.js wheelStep)
  let wheel = WHEEL;
  p.addEventListener(
    'wheel',
    e => {
      const step = wheelStep(wheel, e.deltaY, e.timeStamp, wheelDir(e.deltaY, at(), { next: Boolean(desk.neighbor(1)), prev: Boolean(desk.neighbor(-1)) }));
      wheel = step.wheel;
      hints(step.hints);
      if (step.go) void goEpisode(step.go, step.go < 0);
    },
    { passive: true },
  );
}
