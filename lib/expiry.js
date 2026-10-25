// The token's expiry: GitHub does not let a page read it (the header github-authentication-token-expiration is not in
// the API's Access-Control-Expose-Headers), so the author says it when putting the token in (the link to make it
// fills in 90 days), and the screen warns from 14 days before (FR-GH-01, NFR-USE-01). No screen, no state of the app:
// tested by itself in tests/unit

// the days the link to make a token fills in (index.html's #make-token)
export const TOKEN_DAYS = 90;
// how many days before the expiry the screen warns
export const WARN_DAYS = 14;
const DAY = 86400000;

/** @param {number} n */
const two = n => String(n).padStart(2, '0');
// the day `days` days after `now`, as a date input takes it (「2026-01-23」, the device's time)
/** @param {number} now @param {number} [days] */
export function dayAfter(now, days = TOKEN_DAYS) {
  const d = new Date(now + days * DAY);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}
// the end of a day said as a date input says it (ms; 0 for none: a token with no expiry, or a date not read)
/** @param {string} day */
export function endOf(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1).getTime() - 1 : 0;
}
// What the screen says of the expiry: '' while it is far (or none), else when it ends and how many days are left
/** @param {number | undefined} expires ms (0 or none kept: none) @param {number} now */
export function expiryNotice(expires, now) {
  if (!expires || expires - now > WARN_DAYS * DAY) return '';
  const d = new Date(expires);
  const day = `${d.getMonth() + 1}/${d.getDate()}`;
  if (expires <= now) return `トークンの期限（${day}）が切れました。`;
  const left = Math.ceil((expires - now) / DAY);
  return `トークンの期限が ${day} に切れます（あと ${left} 日）。`;
}
