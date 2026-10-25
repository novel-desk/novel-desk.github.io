// Before the page shows (a classic script in the head): what the server version's index.html does with scripts written
// in the page, which this page's CSP does not run (script-src 'self'), done from this file instead
// iOS only: maximum-scale=1 keeps it from zooming in on tapping the 14px text (pinching still zooms there). Android
// would take it as no zooming at all, so it is not set there
if (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
  /** @type {HTMLMetaElement} */ (document.querySelector('meta[name="viewport"]')).content += ',maximum-scale=1';
// 画面の色 (設定): before the page shows, so it never flashes the other one
try {
  const t = localStorage.getItem('theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch {}
// the screens' modules did not start (files of two versions met, or one did not come: a deploy, a connection lost
// halfway): the page is loaded again, once. app.js says it started (nwStarted) and lets the next failure reload again
addEventListener(
  'error',
  e => {
    if (/** @type {any} */ (window).nwStarted || (e.target !== window && /** @type {HTMLElement | null} */ (e.target)?.tagName !== 'SCRIPT')) return;
    try {
      if (sessionStorage.getItem('nw-reloaded')) return;
      sessionStorage.setItem('nw-reloaded', '1');
    } catch {
      return;
    }
    location.reload();
  },
  true,
);
