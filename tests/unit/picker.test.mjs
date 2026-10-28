// The dialog to choose one from a list (lib/picker.js)
import { test, expect } from 'vitest';
import { pickerList, pickerOptions, pickerTyped } from '../../lib/picker.js';

// FR-GH-09, FR-PLOT-04, FR-PLOT-08: a branch, the plot's note, a 中箱 chosen from a list, or typed
test('pickerList, pickerOptions: each by its place, the one now marked; the names offered', () => {
  expect(pickerList(['main', 'dev<'], 'main')).toBe(
    '<button type="button" data-pick="0" class="current">main（いま）</button><button type="button" data-pick="1" class="">dev&lt;</button>',
  );
  expect(pickerOptions(['a"b'])).toBe('<option value="a&quot;b">');
});
test('pickerTyped: trimmed; nothing typed is none', () => {
  expect(pickerTyped(' feat ')).toBe('feat');
  expect(pickerTyped('  ')).toBe(null);
});
