// Releases (リリース: the tags v1, v2 … with GitHub's releases), as the server version's src/handlers/history.rs makes
// and reads them (no screen, no state of the app: tested by itself in tests/unit)
import { nameOrder } from './layout.js';

// The name of a release as the writer gave it: trimmed, no control characters, 80 characters at most (null: nothing left)
/** @param {string} given */
export function releaseLabel(given) {
  // eslint-disable-next-line no-control-regex
  const label = [...given.trim().replace(/[\u0000-\u001f\u007f-\u009f]/g, '')].slice(0, 80).join('');
  return label || null;
}
// The tag of the next release: one more than the largest of v1, v2 … ("v1" when there are none)
/** @param {string[]} tags */
export const nextTag = tags => `v${Math.max(0, ...tags.map(t => (/^v\d+$/.test(t) ? Number(t.slice(1)) : 0))) + 1}`;
/**
 * The releases, the newest first, from GitHub's (the REST API's list): those of a tag v and a number
 * @param {{ tag_name: string, name: string | null, created_at: string }[]} list @returns {{ tag: string, label: string, date: string }[]}
 */
export const releasesOf = list =>
  list
    .filter(r => /^v\d+$/.test(r.tag_name))
    .map(r => ({ tag: r.tag_name, label: r.name || r.tag_name, date: r.created_at }))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
// The order of the episodes of a release: part by part, by the numbers in the names
/** @param {string} a @param {string} b */
export function pathOrder(a, b) {
  const [pa, pb] = [a.split('/'), b.split('/')];
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    const o = nameOrder(pa[i], pb[i]);
    if (o) return o;
  }
  return pa.length - pb.length;
}
