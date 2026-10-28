// 未送信の一覧 (FR-SAVE-09): the changes not sent, each read before it is sent or given up: a text written (its
// episode or file), or an operation (the files it moves, adds or deletes, and the keys of novel.toml it sets). One given
// up goes from this device; the text written in an operation's files stays as a draft. A text set aside (its file
// gone, or another file now, when it was to be sent) is shown whole, to be sent beside what is there now, put at the
// end of the episode open, or given up
import { discardQuestion, parkedCards, unparkOf, unsentRows } from '../lib/unsent.js';
import { $, busy } from './dom.js';
import { api } from './shared.js';

const dialog = () => /** @type {HTMLDialogElement} */ (/** @type {unknown} */ ($('unsent')));
/** @type {ReturnType<typeof api.unsentItems>} */
let items = [];
/** @type {import('../lib/drafts.js').Draft[]} */
let aside = [];
// a path as the list says it: an episode by its title, anything else by its path
/** @param {string} path */
const said = path => api.episodes().find(e => e.path === path)?.title ?? path;
// (opened, and drawn again, only while something is not sent: the button is hidden otherwise)
function render() {
  items = api.unsentItems();
  $('unsent-body').innerHTML = unsentRows(items, said);
  aside = [...api.parked()];
  $('unsent-body').innerHTML += parkedCards(aside, { send: api.mode() !== 'off', put: Boolean(api.current()) });
}
/** @param {number} i */
async function discard(i) {
  const it = items[i];
  if (!confirm(discardQuestion(it, said))) return;
  // (the text given up kept in the history: a text written alone always has one)
  if (it.kind === 'text') await api.snapshot(it.path, /** @type {string} */ (api.drafts().get(it.path)?.text), true);
  await api.discard(it);
  redraw();
}
// the list drawn again, or closed when nothing is left
function redraw() {
  if (api.unsent() || api.parked().length) render();
  else dialog().close();
}
// a text set aside, as the author chooses (put in the episode open: the list closed, to show it there)
// (sent: said in the band over the list, its button not pressed again meanwhile. DESK-OPS-05)
/** @param {'send' | 'put' | 'drop'} how @param {number} i @param {HTMLButtonElement} button the one pressed */
async function unpark(how, i, button) {
  const d = aside[i];
  if (how === 'drop' && !confirm('この書きかけを破棄しますか？（この端末の履歴に残ります）')) return;
  if (how === 'put') dialog().close();
  await (how === 'send' ? busy('送信しています…', () => api.unpark(d, how), button) : api.unpark(d, how));
  if (how !== 'put') redraw();
}
export function wireUnsent() {
  $('open-unsent').addEventListener('click', () => {
    render();
    dialog().showModal();
  });
  $('close-unsent').addEventListener('click', () => dialog().close());
  $('unsent-body').addEventListener('click', e => {
    const t = /** @type {HTMLElement} */ (e.target);
    const b = t.closest('[data-discard]');
    if (b instanceof HTMLElement) void discard(Number(b.dataset.discard));
    const u = t.closest('[data-unpark-send], [data-unpark-put], [data-unpark-drop]');
    if (u instanceof HTMLElement) {
      const { how, i } = unparkOf(u.dataset);
      void unpark(how, i, /** @type {HTMLButtonElement} */ (u));
    }
  });
}
