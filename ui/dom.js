// The page's elements, the screen shown, and the short notices
/** @typedef {HTMLElement & HTMLInputElement & HTMLTextAreaElement & HTMLButtonElement} El */

/** @param {string} id @returns {El} */
export const $ = id => /** @type {El} */ (document.getElementById(id));

const SCREENS = ['loading', 'setup', 'unlock', 'repos', 'desk', 'images'];
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
  toastTimer = setTimeout(() => t.classList.remove('show'), 4000);
}
