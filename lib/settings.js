// What the first screens and the settings say (app.js; no screen, no state of the app: tested by itself in
// tests/unit): the connection to GitHub as it was asked, the links to leave it, this device's screen, the screen's
// colors, the drafts of another account, and where the App installed goes on
import { appSettingsUrl, HOUR, installUrl, sameOwner } from './appkey.js';

// The connection as GitHub said it (DESK-OPS-03): installed on so many installations, or refused (401, 404: the App
// deleted on GitHub; the button to start again shown), or not said (not reached, failed: said as connected)
/** @param {{ installs: number } | { status: number | null }} asked @returns {{ text: string, relink: boolean }} */
export function linkState(asked) {
  if ('installs' in asked)
    return asked.installs
      ? { text: 'GitHub App で連携しています', relink: false }
      : {
          text: 'GitHub App が、どのリポジトリにもインストールされていません。「App をインストールするリポジトリを選ぶ」で、作品のリポジトリを選んでください。',
          relink: false,
        };
  if (asked.status === 401 || asked.status === 404)
    return {
      text: 'GitHub App との連携が無効になっています。GitHub がこの App の認証を拒否しました。GitHub で App を削除した場合も、この表示になります。',
      relink: true,
    };
  return { text: 'GitHub App で連携しています', relink: false };
}

// 連携をやめるとき (DESK-OPS-03): an App made here (its slug), its own pages; else GitHub's lists
/** @param {string | undefined} slug */
export function leaveLinks(slug) {
  return slug
    ? {
        repos: installUrl(slug),
        app: appSettingsUrl(slug),
        label: `「${slug}」の Advanced のページ`,
        then: 'を開き、「Delete GitHub App」を押して、App の名前を入れます。',
      }
    : {
        repos: 'https://github.com/settings/installations',
        app: 'https://github.com/settings/apps',
        label: 'GitHub App の一覧',
        then: 'でこの端末の App を開き、Advanced の「Delete GitHub App」を押して、App の名前を入れます。',
      };
}

// この端末の画面 (FR-APP-05): its size, its scale, the room the status bar and the home bar take, and whether it is
// the app on the home screen
/** @param {{ width: number, height: number, ratio: number, top: number, bottom: number, home: boolean }} s */
export const screenSaid = s =>
  `この端末の画面: ${s.width}×${s.height}、倍率 ${s.ratio}、上の余白 ${s.top}、下の余白 ${s.bottom}（${s.home ? 'ホーム画面のアプリ' : 'ブラウザ'}）`;

// 画面の色 (FR-APP-01): the one kept ('' 自動 when it is none of 白, 黒), and the color of the browser's bar: one for
// both themes, or (自動) the device's, as the meta's media says
/** @param {string | null} kept @returns {'' | 'light' | 'dark'} */
export const themeOf = kept => (kept === 'light' || kept === 'dark' ? kept : '');
/** @param {string} theme '' (自動), 'light' or 'dark' @param {string} media the meta's media */
export const themeColor = (theme, media) => (theme === 'dark' ? '#16171a' : theme === 'light' ? '#f2eee6' : media.includes('dark') ? '#16171a' : '#f2eee6');

// The drafts left on this device by another account than the App's (NFR-SEC-16): some left, the App's owner known, and
// not the account kept with them (lib/appkey.js sameOwner)
/** @param {number} left @param {unknown} owner the account kept @param {import('./appkey.js').Who | null} who */
export const othersDrafts = (left, owner, who) => left > 0 && who !== null && !sameOwner(owner, who);
// whether a flow started on this device (FR-GH-01: the App made by the manifest flow) is waited for: started within
// the hour (the field to paste its code in shown)
/** @param {import('./appkey.js').Pending | undefined} p @param {number} now */
export const waitingFlow = (p, now) => p !== undefined && now - p.at < HOUR;

// The repositories the App is installed on (FR-GH-01): none yet (GitHub's page to install it), one (opened), several
// (offered)
/** @template T @param {T[]} repos @returns {{ kind: 'none' } | { kind: 'one', repo: T } | { kind: 'many' }} */
export function afterInstall(repos) {
  if (!repos.length) return { kind: 'none' };
  return repos.length === 1 ? { kind: 'one', repo: repos[0] } : { kind: 'many' };
}
