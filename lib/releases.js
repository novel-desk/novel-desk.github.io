// Releases (リリース: the tags v1, v2 … with GitHub's releases), as the server version's src/handlers/history.rs makes
// and reads them (no screen, no state of the app: tested by itself in tests/unit)
import { charsOf, esc, n } from './format.js';
import { episodesOf, headingsOf, nameOrder, titleOf } from './layout.js';

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
 * The releases, the newest first, as the server version lists them (every tag v and a number): GitHub's releases (the
 * REST API's list) by their names, and the tags v and a number that have no release (one made by the server version
 * without GitHub, or whose release could not be made) by their tags
 * @param {{ tag_name: string, name: string | null, created_at: string }[]} list
 * @param {{ name: string, date: string }[]} [tags] the tags with no release, with their commits' dates
 * @returns {{ tag: string, label: string, date: string }[]}
 */
export const releasesOf = (list, tags = []) => {
  const released = new Set(list.map(r => r.tag_name));
  return [
    ...list.map(r => ({ tag: r.tag_name, label: r.name || r.tag_name, date: r.created_at })),
    ...tags.filter(t => !released.has(t.name)).map(t => ({ tag: t.name, label: t.name, date: t.date })),
  ]
    .filter(r => /^v\d+$/.test(r.tag))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
};
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

// --- the screen リリース (ui/releases.js)

// what a release says on GitHub: its name, how many episodes and characters it has
/** @param {string} label @param {{ chars: number }[]} episodes */
export const releaseBody = (label, episodes) => `${label}（${episodes.length} 話、${episodes.reduce((s, e) => s + e.chars, 0)} 字）`;
// the tags v and a number with no release (dated by their commits)
/** @param {string[]} names the tags @param {{ tag_name: string }[]} made the releases */
export function bareTags(names, made) {
  const released = new Set(made.map(r => r.tag_name));
  return names.filter(t => /^v\d+$/.test(t) && !released.has(t));
}
// the list of releases (FR-REL-02), each with its tag and when it was made; none, said with how to make one
/** @param {{ tag: string, label: string, date: string }[]} list */
export const releasesHtml = list =>
  list.length
    ? list
        .map(
          r =>
            `<button class="version" data-tag="${esc(r.tag)}" data-label="${esc(r.label)}"><b>${esc(r.label)}</b><small>${esc(r.tag)} ・ ${esc(new Date(r.date).toLocaleString('ja-JP'))}</small></button>`,
        )
        .join('')
    : '<p class="muted">まだリリースはありません。「リリースを作成」で、いまの原稿を残せます。</p>';
/** @typedef {{ path: string, title: string, chapter: string, chars: number, text: string }} ReleaseEpisode */
// The episodes of a release (FR-REL-02), as novel.toml then lays them out: each with its title, its chapter's ('' none),
// its length and its text (`texts`: by path), in the order of their paths
/** @param {import('./layout.js').Layout} l @param {import('./layout.js').TocItem[]} toc @param {Record<string, string>} texts @returns {ReleaseEpisode[]} */
export function releaseEpisodes(l, toc, texts) {
  const headings = headingsOf(l, toc, texts);
  return episodesOf(toc)
    .map(e => {
      const at = e.rel.indexOf('/');
      return {
        path: e.path,
        title: titleOf(l, e.rel, headings),
        chapter: at === -1 ? '' : titleOf(l, e.rel.slice(0, at), headings),
        chars: charsOf(texts[e.path]),
        text: texts[e.path],
      };
    })
    .sort((a, b) => pathOrder(a.path, b.path));
}
// a release opened: back to the list, then its episodes (the chapter before the title) with their lengths
/** @param {ReleaseEpisode[]} episodes */
export const releaseEpisodesHtml = episodes =>
  '<button class="ghost back-releases">‹ リリース一覧</button>' +
  episodes
    .map(
      (e, i) =>
        `<button class="version" data-episode="${i}"><b>${e.chapter ? `${esc(e.chapter)} / ` : ''}${esc(e.title)}</b><small>${n(e.chars)} 字</small></button>`,
    )
    .join('');
// An episode of a release read (FR-REL-03): back to the release, its text, and the button to put it back into the
// manuscript, when the manuscript has an episode at its place (`here`); else said why it cannot be
/** @param {string} label @param {ReleaseEpisode} e @param {number} i @param {boolean} here */
export const releaseEpisodeHtml = (label, e, i, here) =>
  `<button class="ghost back-release">‹ ${esc(label)}</button><textarea class="version-text" readonly aria-label="リリースの本文">${esc(e.text)}</textarea>${
    here
      ? `<button class="primary" data-restore="${i}">この話を今の原稿に復元</button>`
      : '<p class="muted small">今の原稿には、同じ場所にこの話がありません（タイトルや順番が変わった可能性があります）。必要なら上の本文をコピーしてください。</p>'
  }`;
