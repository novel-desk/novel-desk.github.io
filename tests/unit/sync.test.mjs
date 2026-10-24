import { describe, test, expect } from 'vitest';
import { AUTO_WAIT, SYNC_MODES, saveState, sendsItself, syncMode } from '../../lib/sync.js';

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
  // FR-SAVE-07
  test('saveState: delivered, on this device only, or not delivered', () => {
    expect(saveState({ draft: false, failed: false, onGitHub: true })).toBe('GitHub に届いています');
    expect(saveState({ draft: false, failed: true, onGitHub: false })).toBe('');
    expect(saveState({ draft: true, failed: false, onGitHub: true })).toBe('未送信（この端末に保存しました）');
    expect(saveState({ draft: true, failed: true, onGitHub: true })).toBe('届けられませんでした（この端末に残っています。理由は「送る」の上）');
  });
});
