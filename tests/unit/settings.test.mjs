// What the first screens and the settings say (lib/settings.js)
import { test, expect } from 'vitest';
import { afterInstall, leaveLinks, linkState, othersDrafts, screenSaid, themeColor, themeOf, waitingFlow } from '../../lib/settings.js';
import { HOUR } from '../../lib/appkey.js';

// DESK-OPS-03: the connection as GitHub says it, each time the settings are opened
test('linkState: installed somewhere, installed nowhere, refused (401, 404), not said (another failure)', () => {
  expect(linkState({ installs: 2 })).toEqual({ text: 'GitHub App で連携しています', relink: false });
  const none = linkState({ installs: 0 });
  expect(none.text).toContain('どのリポジトリにもインストールされていません');
  expect(none.relink).toBe(false);
  for (const status of [401, 404]) {
    const refused = linkState({ status });
    expect(refused.text).toContain('連携が無効になっています');
    expect(refused.relink).toBe(true);
  }
  expect(linkState({ status: 0 })).toEqual({ text: 'GitHub App で連携しています', relink: false });
  expect(linkState({ status: 500 })).toEqual({ text: 'GitHub App で連携しています', relink: false });
  expect(linkState({ status: null })).toEqual({ text: 'GitHub App で連携しています', relink: false });
});
// DESK-OPS-03: the steps to leave, with the App's own pages
test('leaveLinks: an App made here, by its slug; none known, GitHub’s lists', () => {
  expect(leaveLinks('novel-desk-a')).toEqual({
    repos: 'https://github.com/apps/novel-desk-a/installations/new',
    app: 'https://github.com/settings/apps/novel-desk-a/advanced',
    label: '「novel-desk-a」の Advanced のページ',
    then: 'を開き、「Delete GitHub App」を押して、App の名前を入れます。',
  });
  const none = leaveLinks(undefined);
  expect(none.repos).toBe('https://github.com/settings/installations');
  expect(none.app).toBe('https://github.com/settings/apps');
  expect(none.label).toBe('GitHub App の一覧');
  expect(none.then).toContain('でこの端末の App を開き');
});
// FR-APP-05: this device's screen
test('screenSaid: the size, the scale, the room above and below, the app on the home screen or the browser', () => {
  const s = { width: 390, height: 844, ratio: 3, top: 47, bottom: 34, home: true };
  expect(screenSaid(s)).toBe('この端末の画面: 390×844、倍率 3、上の余白 47、下の余白 34（ホーム画面のアプリ）');
  expect(screenSaid({ ...s, home: false })).toBe('この端末の画面: 390×844、倍率 3、上の余白 47、下の余白 34（ブラウザ）');
});
// FR-APP-01: 画面の色
test('themeOf: 白 and 黒 kept; anything else (none, not a theme) is 自動', () => {
  expect(themeOf('light')).toBe('light');
  expect(themeOf('dark')).toBe('dark');
  expect(themeOf(null)).toBe('');
  expect(themeOf('blue')).toBe('');
});
test('themeColor: one color for 白 and 黒; 自動 follows the media of the meta', () => {
  expect(themeColor('dark', '(prefers-color-scheme: light)')).toBe('#16171a');
  expect(themeColor('light', '(prefers-color-scheme: dark)')).toBe('#f2eee6');
  expect(themeColor('', '(prefers-color-scheme: dark)')).toBe('#16171a');
  expect(themeColor('', '(prefers-color-scheme: light)')).toBe('#f2eee6');
});
// NFR-SEC-16: the drafts of another account, deleted only when the author says so
test('othersDrafts: drafts left, the owner known, another account; not when none left, not known, or the same', () => {
  const who = { id: 7, login: 'kuro' };
  expect(othersDrafts(2, 8, who)).toBe(true);
  expect(othersDrafts(2, 7, who)).toBe(false);
  expect(othersDrafts(0, 8, who)).toBe(false);
  expect(othersDrafts(2, 8, null)).toBe(false);
});
// FR-GH-01: the flow started here waited for within the hour
test('waitingFlow: a flow started less than an hour ago; none, or older', () => {
  const p = { state: 's', at: 1000, seal: null };
  expect(waitingFlow(p, 1000 + HOUR - 1)).toBe(true);
  expect(waitingFlow(p, 1000 + HOUR)).toBe(false);
  expect(waitingFlow(undefined, 1000)).toBe(false);
});
// FR-GH-01: where the App installed goes on
test('afterInstall: none, one (opened), several (offered)', () => {
  expect(afterInstall([])).toEqual({ kind: 'none' });
  expect(afterInstall(['a/b'])).toEqual({ kind: 'one', repo: 'a/b' });
  expect(afterInstall(['a/b', 'a/c'])).toEqual({ kind: 'many' });
});
