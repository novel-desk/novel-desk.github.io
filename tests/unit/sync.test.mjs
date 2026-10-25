import { describe, test, expect } from 'vitest';
import { AUTO_WAIT, SYNC_MODES, keptMode, onOtherBranch, saveState, sendsItself, stamped, syncMode, writtenOn } from '../../lib/sync.js';

describe('sync', () => {
  // FR-GH-04
  test('syncMode: the mode kept, else 自動', () => {
    expect(SYNC_MODES.map(syncMode)).toEqual(['auto', 'manual', 'off']);
    expect(syncMode(undefined)).toBe('auto');
    expect(syncMode('daily')).toBe('auto');
  });
  // FR-SAVE-03, FR-GH-04
  test('sendsItself: 自動, something to send, GitHub read, nothing going on', () => {
    const s = { mode: /** @type {const} */ ('auto'), unsent: 1, offline: false, busy: false, elsewhere: 0 };
    expect(sendsItself(s)).toBe(true);
    // (written on another branch than the one open: only when the author says so)
    expect(sendsItself({ ...s, elsewhere: 1 })).toBe(false);
    expect(sendsItself({ ...s, mode: 'manual' })).toBe(false);
    expect(sendsItself({ ...s, mode: 'off' })).toBe(false);
    expect(sendsItself({ ...s, unsent: 0 })).toBe(false);
    expect(sendsItself({ ...s, offline: true })).toBe(false);
    expect(sendsItself({ ...s, busy: true })).toBe(false);
    expect(AUTO_WAIT).toBeGreaterThanOrEqual(10000);
  });
  // FR-GH-04, FR-GH-09, NFR-SEC-16: the drafts keep where and how they go when the device's settings are gone
  test('stamped: the branch written on stays once set (the change replaced, else the branch open); the mode is the one now', () => {
    const d = { path: 'a.md', text: 't' };
    expect(stamped(d, undefined, 'main', 'manual')).toEqual({ path: 'a.md', text: 't', branch: 'main', sync: 'manual' });
    expect(stamped(d, { branch: 'side', sync: 'off' }, 'main', 'auto')).toEqual({ ...d, branch: 'side', sync: 'auto' });
    expect(stamped({ ...d, branch: 'own' }, { branch: 'side' }, 'main', 'off')).toEqual({ ...d, branch: 'own', sync: 'off' });
  });
  test('keptMode: the mode kept, else the most careful one the drafts were written with, else 自動', () => {
    expect(keptMode('manual', [{ sync: 'off' }])).toBe('manual');
    expect(keptMode(undefined, [{ sync: 'auto' }, { sync: 'off' }, { sync: 'manual' }])).toBe('off');
    expect(keptMode(undefined, [{ sync: 'manual' }, { sync: 'auto' }])).toBe('manual');
    expect(keptMode(undefined, [{}, { sync: 'auto' }])).toBe('auto');
    expect(keptMode(undefined, [])).toBe('auto');
  });
  test('writtenOn and onOtherBranch: the branch the drafts were written on; the ones of another (none known: the one open)', () => {
    expect(writtenOn([{}, { branch: 'side' }, { branch: 'main' }])).toBe('side');
    expect(writtenOn([{}, { branch: '' }])).toBe('');
    expect(writtenOn([])).toBe('');
    const list = [{ branch: 'main' }, {}, { branch: 'side' }];
    expect(onOtherBranch(list, 'main')).toEqual([{ branch: 'side' }]);
    expect(onOtherBranch(list, 'side')).toEqual([{ branch: 'main' }]);
  });
  // FR-SAVE-07
  test('saveState: delivered, on this device only, or not delivered', () => {
    expect(saveState({ draft: false, failed: false, onGitHub: true })).toBe('GitHub に届いています');
    expect(saveState({ draft: false, failed: true, onGitHub: false })).toBe('');
    expect(saveState({ draft: true, failed: false, onGitHub: true })).toBe('未送信（この端末に保存しました）');
    expect(saveState({ draft: true, failed: true, onGitHub: true })).toBe('届けられませんでした（この端末に残っています。理由は「送る」の上）');
  });
});
