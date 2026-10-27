// The page's elements, the screen shown, the short notices, and the band said while waiting
import { busyBand } from '../lib/busy.js';
/** @typedef {HTMLElement & HTMLInputElement & HTMLTextAreaElement & HTMLButtonElement} El */

/** @param {string} id @returns {El} */
export const $ = id => /** @type {El} */ (document.getElementById(id));

const SCREENS = ['loading', 'terms', 'setup', 'app-install', 'unlock', 'shelf', 'desk', 'settings', 'notes', 'plot', 'characters', 'record'];
// one screen at a time
/** @param {string} id */
export function show(id) {
  for (const s of SCREENS) $(s).hidden = s !== id;
}
/** @type {ReturnType<typeof setTimeout> | undefined} */
let toastTimer;
/** @param {string} text */
export function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// 待ちの帯 (DESK-OPS-05, B4): `work` run; once it has taken longer than 0.3 seconds, `text` said in the band over the
// screen until it ends (failed or not: lib/busy.js), and `button` not to be pressed meanwhile. Under the notices
// (z-index). With a modal dialog open, the band is put in the top layer (a popover) over it, as nothing else is seen
// there; it is not pressed, so that it is out of the dialog does not matter (whatwg/html#9936: a popover over a modal
// dialog is not interactive)
export const busy = busyBand({
  show: text => {
    const b = $('busy');
    b.textContent = text;
    if (!b.hidden) return;
    b.hidden = false;
    if (document.querySelector('dialog:modal')) {
      b.popover = 'manual';
      b.showPopover();
    }
  },
  hide: () => {
    const b = $('busy');
    if (b.popover) {
      b.hidePopover();
      b.removeAttribute('popover');
    }
    b.hidden = true;
  },
  later: (f, ms) => setTimeout(f, ms),
  cancel: t => clearTimeout(/** @type {ReturnType<typeof setTimeout>} */ (t)),
});
