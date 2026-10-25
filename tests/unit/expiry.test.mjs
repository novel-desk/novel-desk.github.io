import { describe, test, expect } from 'vitest';
import { dayAfter, endOf, expiryNotice, TOKEN_DAYS, WARN_DAYS } from '../../lib/expiry.js';

describe('expiry', () => {
  // FR-GH-01
  test('dayAfter: the day a date input takes, 90 days on unless told', () => {
    const now = new Date(2026, 9, 25, 12).getTime();
    expect(dayAfter(now)).toBe('2027-01-23');
    expect(dayAfter(now, 7)).toBe('2026-11-01');
    expect(TOKEN_DAYS).toBe(90);
  });
  // FR-GH-01
  test('endOf: the last moment of the day; nothing for none or a date not read', () => {
    expect(endOf('2026-11-01')).toBe(new Date(2026, 10, 2).getTime() - 1);
    expect(endOf('')).toBe(0);
    expect(endOf('11/1')).toBe(0);
  });
  // FR-GH-01, NFR-USE-01
  test('expiryNotice: nothing while far or none; from 14 days before, the day and the days left; past it, expired', () => {
    const now = new Date(2026, 9, 25, 12).getTime();
    expect(WARN_DAYS).toBe(14);
    expect(expiryNotice(0, now)).toBe('');
    // (none kept)
    expect(expiryNotice(undefined, now)).toBe('');
    expect(expiryNotice(endOf('2026-11-08'), now)).toBe('');
    expect(expiryNotice(endOf('2026-11-07'), now)).toBe('トークンの期限が 11/7 に切れます（あと 14 日）。');
    expect(expiryNotice(endOf('2026-10-25'), now)).toBe('トークンの期限が 10/25 に切れます（あと 1 日）。');
    expect(expiryNotice(endOf('2026-10-24'), now)).toBe('トークンの期限（10/24）が切れました。');
  });
});
