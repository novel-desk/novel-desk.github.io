// Choosing one from a list (the plot's note, a 中箱, a chapter), in a dialog. From the server version's public/ui/picker.js
import { esc } from '../lib/format.js';
import { $ } from './dom.js';

/**
 * @param {{ title: string, items: string[], current?: string, help?: string }} what
 * @returns {Promise<string | null>} what was chosen; null: closed
 */
export function pick({ title, items, current = '', help = '' }) {
  return new Promise(resolve => {
    const dlg = /** @type {HTMLDialogElement} */ (/** @type {unknown} */ ($('picker')));
    $('picker-title').textContent = title;
    $('picker-help').textContent = help;
    $('picker-list').innerHTML = items
      .map((x, i) => `<button type="button" data-pick="${i}" class="${x === current ? 'current' : ''}">${esc(x)}${x === current ? '（いま）' : ''}</button>`)
      .join('');
    let done = false;
    /** @type {(v: string | null) => void} */
    const finish = v => {
      if (done) return;
      done = true;
      dlg.close();
      resolve(v);
    };
    $('picker-list').onclick = e => {
      const b = /** @type {HTMLElement} */ (e.target).closest('[data-pick]');
      if (b instanceof HTMLElement) finish(items[Number(b.dataset.pick)]);
    };
    $('picker-close').onclick = () => finish(null);
    // closed by Escape (a picker closed just before this one opened sends its close a moment later: not this one's)
    dlg.onclose = () => {
      if (!dlg.open) finish(null);
    };
    dlg.showModal();
  });
}
