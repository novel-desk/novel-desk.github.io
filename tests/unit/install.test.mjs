import { test, expect } from 'vitest';
import { installHint, isIos, switchNow, viewportOf } from '../../lib/install.js';

// FR-APP-03: adding the app to the home screen
test('isIos: an iPhone, an iPad (which says it is a Mac with a touch screen); not a Mac, not Android', () => {
  expect(isIos({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 })).toBe(true);
  expect(isIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
  expect(isIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
  expect(isIos({ userAgent: 'Mozilla/5.0 (Linux; Android 15)', platform: 'Linux armv8l', maxTouchPoints: 5 })).toBe(false);
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

// NFR-USE-02: on iOS, no zooming in on tapping the 14px text (maximum-scale=1, as the server version); not on Android,
// where it would stop pinching too
test('viewportOf: maximum-scale=1 added on an iPhone and an iPad, once; not on Android or a Mac', () => {
  const content = 'width=device-width,initial-scale=1,viewport-fit=cover';
  const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 };
  expect(viewportOf(content, iphone)).toBe(`${content},maximum-scale=1`);
  expect(viewportOf(viewportOf(content, iphone), iphone)).toBe(`${content},maximum-scale=1`);
  expect(viewportOf(content, { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(
    `${content},maximum-scale=1`,
  );
  expect(viewportOf(content, { userAgent: 'Mozilla/5.0 (Linux; Android 15)', platform: 'Linux armv8l', maxTouchPoints: 5 })).toBe(content);
  expect(viewportOf(content, { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(content);
});
