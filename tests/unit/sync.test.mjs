import { describe, test, expect } from 'vitest';
import { AUTO_WAIT, SYNC_MODES, sendsItself, syncMode } from '../../lib/sync.js';

describe('sync', () => {
  // FR-GH-04
  test('syncMode: the mode kept, else 自動', () => {
    expect(SYNC_MODES.map(syncMode)).toEqual(['auto', 'manual', 'off']);
    expect(syncMode(undefined)).toBe('auto');
    expect(syncMode('daily')).toBe('auto');
  });
  // FR-SAVE-03, FR-GH-04
  test('sendsItself: 自動, something to send, GitHub read, nothing going on', () => {
    const s = { mode: /** @type {const} */ ('auto'), unsent: 1, offline: false, busy: false };
    expect(sendsItself(s)).toBe(true);
    expect(sendsItself({ ...s, mode: 'manual' })).toBe(false);
    expect(sendsItself({ ...s, mode: 'off' })).toBe(false);
    expect(sendsItself({ ...s, unsent: 0 })).toBe(false);
    expect(sendsItself({ ...s, offline: true })).toBe(false);
    expect(sendsItself({ ...s, busy: true })).toBe(false);
    expect(AUTO_WAIT).toBeGreaterThanOrEqual(10000);
  });
});
