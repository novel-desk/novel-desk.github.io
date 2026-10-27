// The preview and the way to the next and previous episodes (FR-EDIT-05, FR-EDIT-06): the buttons at the foot, and in
// the preview a swipe sideways, a pull on past its end, and the page sliding along. The place read stays when the
// preview is switched on and off. From the server version's public/ui/reading.js; the desk gives what it needs
import { esc } from '../lib/format.js';
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
  pv().innerHTML =
    html +
    `<nav class="ep-nav">${prev ? `<button class="ghost" data-go="-1">‹ ${esc(prev.title)}</button>` : '<span></span>'}${
      next ? `<button class="ghost" data-go="1">${esc(next.title)} ›</button>` : '<span class="muted small">最後の話です</span>'
    }</nav>`;
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
    still.matches
      ? Promise.resolve()
      : el.animate(
          [
            { transform: `translate${axis}(${from}%)`, opacity: from ? 0 : 1 },
            { transform: `translate${axis}(${to}%)`, opacity: to ? 0 : 1 },
          ],
          { duration: ms, easing, fill: 'forwards' },
        ).finished;
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
    const nav = pv().querySelector('.ep-nav');
    pv().scrollTop = atEnd && was && nav ? Math.max(0, nav.getBoundingClientRect().top - pv().getBoundingClientRect().top - pv().clientHeight + 40) : 0;
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
  const el = /** @type {HTMLElement} */ (
    /** @type {HTMLElement[]} */ ([...p.querySelectorAll('[data-l]')]).find(e => topIn(e) + e.offsetHeight > p.scrollTop + 1)
  );
  return { line: Number(el.dataset.l), into: Math.max(0, p.scrollTop - topIn(el)) / (el.offsetHeight || 1) };
}
// the preview shown, at a place (a line no longer in the text: the top)
/** @param {{ line: number, into: number }} at */
export async function showPreviewAt(at) {
  await renderPreview();
  setReading(true);
  const el = /** @type {HTMLElement | null} */ (pv().querySelector(`[data-l="${at.line}"]`));
  pv().scrollTop = el ? topIn(el) + at.into * el.offsetHeight : 0;
}
// writing ⇄ the preview, the place kept
export async function togglePreview() {
  const a = area();
  if (!reading()) {
    const l = lineAtInBox(a, a.scrollTop);
    return showPreviewAt({ line: l.line, into: Math.max(0, a.scrollTop - l.top) / l.height });
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
  const p = pv(),
    PULL = 90;
  p.addEventListener('click', e => {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-go]');
    if (b instanceof HTMLElement) void goEpisode(Number(b.dataset.go));
  });
  const atBottom = () => p.scrollTop + p.clientHeight >= p.scrollHeight - 2,
    atTop = () => p.scrollTop <= 0;
  // 「次の話へ移動」: shown only once letting go would move on, laid over the preview's edge from outside it
  let shown = 0;
  /** @type {(d: number, on: boolean) => void} */
  const hint = (d, on) => {
    const h = $('pull-hint');
    if (!on) {
      if (shown === d) {
        h.hidden = true;
        shown = 0;
      }
      return;
    }
    const r = p.getBoundingClientRect();
    h.textContent = d > 0 ? '次の話へ移動' : '前の話へ移動';
    h.hidden = false;
    shown = d;
    h.style.top = `${d > 0 ? r.bottom - h.offsetHeight - 12 : r.top + 12}px`;
    h.style.left = `${r.left + r.width / 2}px`;
  };
  // touch: starting at the bottom (or the top), a pull of PULL px past it, then letting go. Which edge is decided by
  // the way the finger goes (a short episode is at both at once)
  /** @type {number | null} */
  let startY = null;
  /** @type {Record<number, boolean>} */
  let can = { 1: false, '-1': false };
  let edge = 0,
    ready = false;
  p.addEventListener(
    'touchstart',
    e => {
      can = { 1: atBottom() && !!desk.neighbor(1), '-1': atTop() && !!desk.neighbor(-1) };
      startY = can[1] || can[-1] ? e.touches[0].clientY : null;
      edge = 0;
      ready = false;
    },
    { passive: true },
  );
  p.addEventListener(
    'touchmove',
    e => {
      if (startY == null) return;
      const dy = startY - e.touches[0].clientY,
        dir = dy > 0 ? 1 : dy < 0 ? -1 : 0;
      if (dir !== edge) {
        if (edge) hint(edge, (ready = false));
        edge = can[dir] ? dir : 0;
      }
      if (!edge) return;
      if (!(edge > 0 ? atBottom() : atTop())) {
        hint(edge, (ready = false));
        startY = null;
        return;
      }
      const on = dy * edge > PULL;
      if (on !== ready) hint(edge, (ready = on));
    },
    { passive: true },
  );
  p.addEventListener('touchend', () => {
    if (ready) {
      hint(edge, false);
      void goEpisode(edge, edge < 0);
    }
    startY = null;
    ready = false;
  });
  // a sideways swipe: left for the next, right for the previous. Not from the very left edge (Safari's back)
  /** @type {number | null} */
  let sx = null,
    sy = 0;
  p.addEventListener(
    'touchstart',
    e => {
      const t = e.touches[0];
      sx = e.touches.length === 1 && t.clientX > 24 ? t.clientX : null;
      sy = t.clientY;
    },
    { passive: true },
  );
  p.addEventListener('touchend', e => {
    if (sx == null || ready) return;
    const t = e.changedTouches[0],
      dx = t.clientX - sx,
      dy = t.clientY - sy;
    sx = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2 && !getSelection()?.toString()) void goEpisode(dx < 0 ? 1 : -1, false, 'X');
  });
  // wheel and trackpad: going on past the bottom (or the top) for a while. Only a turn started there counts
  let pushed = 0,
    last = 0,
    armed = 0;
  p.addEventListener(
    'wheel',
    e => {
      const dir = e.deltaY > 0 && atBottom() && desk.neighbor(1) ? 1 : e.deltaY < 0 && atTop() && desk.neighbor(-1) ? -1 : 0;
      const fresh = e.timeStamp - last > 300;
      last = e.timeStamp;
      if (fresh) armed = dir;
      if (!dir || armed !== dir || Math.sign(pushed || dir) !== dir) {
        hint(1, false);
        hint(-1, false);
        pushed = 0;
      }
      if (!dir || armed !== dir) return;
      pushed += e.deltaY;
      hint(dir, Math.abs(pushed) > 150);
      if (Math.abs(pushed) > 400) {
        pushed = 0;
        hint(dir, false);
        void goEpisode(dir, dir < 0);
      }
    },
    { passive: true },
  );
}
