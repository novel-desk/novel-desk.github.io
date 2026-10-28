// The dialog to choose one from a list, or type one, as it is drawn (ui/picker.js; no screen, no state of the app:
// tested by itself in tests/unit): the list, the one now marked, and the names offered for the field
import { esc } from './format.js';

// the buttons of the list, by their place; the one now marked (いま)
/** @param {string[]} items @param {string} current */
export const pickerList = (items, current) =>
  items
    .map((x, i) => `<button type="button" data-pick="${i}" class="${x === current ? 'current' : ''}">${esc(x)}${x === current ? '（いま）' : ''}</button>`)
    .join('');
// the names offered while typing
/** @param {string[]} items */
export const pickerOptions = items => items.map(x => `<option value="${esc(x)}">`).join('');
// what is typed, trimmed (null: nothing)
/** @param {string} typed */
export const pickerTyped = typed => typed.trim() || null;
