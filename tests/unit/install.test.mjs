import { test, expect } from 'vitest';
import { installHint, isIos, isStandalone, switchNow } from '../../lib/install.js';

// FR-APP-03: adding the app to the home screen
test('isIos: an iPhone, an iPad (which says it is a Mac with a touch screen); not a Mac, not Android', () => {
  expect(isIos({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 })).toBe(true);
  expect(isIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
  expect(isIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
  expect(isIos({ userAgent: 'Mozilla/5.0 (Linux; Android 15)', platform: 'Linux armv8l', maxTouchPoints: 5 })).toBe(false);
});
test('isStandalone: the display mode of the home screen, or Safari saying so; not a tab', () => {
  expect(isStandalone(true, undefined)).toBe(true);
  expect(isStandalone(false, true)).toBe(true);
  expect(isStandalone(false, undefined)).toBe(false);
  expect(isStandalone(false, 'yes')).toBe(false);
});
test('installHint: nothing from the home screen; the steps in a tab on iOS; a button where the browser offers it', () => {
  expect(installHint({ standalone: true, ios: true, offered: true })).toBe('');
  expect(installHint({ standalone: false, ios: true, offered: false })).toBe('ios');
  expect(installHint({ standalone: false, ios: false, offered: true })).toBe('button');
  expect(installHint({ standalone: false, ios: false, offered: false })).toBe('');
});

// FR-APP-02: a new version switched to when nothing typed can be lost
test('switchNow: a new version, nothing going on, off the desk or the desk left', () => {
  const s = { updated: true, onDesk: false, visible: true, busy: false };
  expect(switchNow(s)).toBe(true);
  expect(switchNow({ ...s, onDesk: true })).toBe(false);
  expect(switchNow({ ...s, onDesk: true, visible: false })).toBe(true);
  expect(switchNow({ ...s, busy: true, visible: false })).toBe(false);
  expect(switchNow({ ...s, updated: false })).toBe(false);
});
