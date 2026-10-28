// リリース: the work named as it is on GitHub now (a tag and a GitHub release: FR-REL-01), the releases listed and their
// episodes read (FR-REL-02), and an episode of one put back into the manuscript as a change not sent, the text before
// it kept in this device's versions (FR-REL-03). From the server version's public/ui/versions.js; GitHub's REST API in
// place of the server's git
import { filesOf, textOf } from '../lib/github.js';
import { esc } from '../lib/format.js';
import { episodesOf, firstLayout, parseLayout, tableOfContents, CONFIG } from '../lib/layout.js';
import { foldersOf } from '../lib/changes.js';
import {
  bareTags,
  nextTag,
  releaseBody,
  releaseEpisodeHtml,
  releaseEpisodes,
  releaseEpisodesHtml,
  releaseLabel,
  releasesHtml,
  releasesOf,
} from '../lib/releases.js';
import { $, busy, toast } from './dom.js';
import * as gh from './github.js';
import { api } from './shared.js';
import { bytes, each } from './work.js';

const body = () => $('releases-body');
const dialog = () => /** @type {HTMLDialogElement} */ (/** @type {unknown} */ ($('releases')));
/** @type {{ tag: string, label: string, episodes: import('../lib/releases.js').ReleaseEpisode[] } | null} */
let opened = null;

async function makeRelease() {
  const w = api.work();
  if (w.offline) return toast('オフラインです。つながってからリリースを作成してください');
  const given = prompt('リリース名（例: 第一稿、新人賞応募版）\nいまの原稿にタグを付け、GitHub のリリースにも残します');
  const label = releaseLabel(given ?? '');
  if (!label) return;
  // (said in the band, the button not pressed again until it is made: DESK-OPS-05)
  await busy('リリースを作成しています…', () => sendAndRelease(w.repo, label), $('name-version'));
}
/** @param {string} repo @param {string} label */
async function sendAndRelease(repo, label) {
  // what is not sent yet goes first (as the server version's: pushed, then tagged)
  if (api.unsent()) {
    await api.send();
    if (api.unsent()) return toast('送れなかったので、リリースを作成しませんでした。書いたものはこの端末に残っています');
  }
  try {
    const [list, names] = await Promise.all([gh.releases(repo), gh.tags(repo)]);
    const tag = nextTag([...names, ...list.map((/** @type {{ tag_name: string }} */ r) => r.tag_name)]);
    await gh.newRelease(repo, { tag, commit: api.work().commit, name: label, body: releaseBody(label, api.episodes()) });
    toast(`リリース「${label}」（${tag}）を作成しました`);
  } catch (err) {
    toast(`リリースを作成できませんでした: ${err.message}`);
  }
}
async function showReleases() {
  opened = null;
  $('releases-title').textContent = 'リリース一覧';
  body().innerHTML = '<p class="muted">読み込み中…</p>';
  if (!dialog().open) dialog().showModal();
  try {
    const repo = api.work().repo;
    const [made, names] = await Promise.all([gh.releases(repo), gh.tags(repo)]);
    // the tags v and a number with no release: dated by their commits
    const tags = await Promise.all(
      bareTags(names, made).map(async name => ({ name, date: new Date((await gh.commitOf(repo, await gh.tagCommit(repo, name))).date).toISOString() })),
    );
    body().innerHTML = releasesHtml(releasesOf(made, tags));
  } catch (err) {
    body().innerHTML = `<p class="error">${esc(err.message)}</p>`;
  }
}
// a release's episodes: its tree at the tag, novel.toml as it was then
/** @param {string} tag @param {string} label */
async function showRelease(tag, label) {
  const w = api.work();
  $('releases-title').textContent = label;
  body().innerHTML = '<p class="muted">読み込み中…</p>';
  try {
    const { tree } = await gh.commitOf(w.repo, await gh.tagCommit(w.repo, tag));
    const { blobs } = filesOf((await gh.treeFiles(w.repo, tree)).tree);
    const config = blobs[CONFIG] ? textOf(await bytes(w.repo, blobs[CONFIG].sha)) : null;
    const l = config === null ? firstLayout() : parseLayout(config).layout;
    const paths = Object.keys(blobs);
    const toc = tableOfContents(l, paths, foldersOf(paths));
    /** @type {Record<string, string>} */
    const texts = {};
    await each(episodesOf(toc), 6, async e => {
      texts[e.path] = textOf(await bytes(w.repo, blobs[e.path].sha)) ?? '';
    });
    const episodes = releaseEpisodes(l, toc, texts);
    opened = { tag, label, episodes };
    body().innerHTML = releaseEpisodesHtml(episodes);
  } catch (err) {
    body().innerHTML = `<p class="error">${esc(err.message)}</p>`;
  }
}
/** @param {number} i */
function showEpisode(i) {
  const r = /** @type {NonNullable<typeof opened>} */ (opened);
  const e = r.episodes[i];
  body().innerHTML = releaseEpisodeHtml(
    r.label,
    e,
    i,
    api.episodes().some(x => x.path === e.path),
  );
}
/** @param {number} i */
async function restore(i) {
  const r = /** @type {NonNullable<typeof opened>} */ (opened);
  const e = r.episodes[i];
  const here = /** @type {import('./shared.js').Episode} */ (api.episodes().find(x => x.path === e.path));
  if (!confirm(`今の「${here.title}」を、リリース「${r.label}」の内容に復元しますか？（今の内容も履歴に残ります。送るまではこの端末だけの変更です）`)) return;
  const now = (await api.texts([e.path]))[e.path];
  if (now !== null) await api.snapshot(e.path, now, true);
  api.keepText(e.path, e.text);
  dialog().close();
  await api.openEpisode(e.path);
  toast(`「${here.title}」を「${r.label}」の内容に復元しました`);
}

export function wireReleases() {
  $('name-version').addEventListener('click', () => void makeRelease());
  $('open-versions').addEventListener('click', () => void showReleases());
  $('close-releases').addEventListener('click', () => dialog().close());
  body().addEventListener('click', e => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.closest('.back-releases')) return void showReleases();
    if (t.closest('.back-release') && opened) return void showRelease(opened.tag, opened.label);
    const rel = t.closest('[data-tag]');
    if (rel instanceof HTMLElement) return void showRelease(/** @type {string} */ (rel.dataset.tag), /** @type {string} */ (rel.dataset.label));
    const ep = t.closest('[data-episode]');
    if (ep instanceof HTMLElement) return showEpisode(Number(ep.dataset.episode));
    const res = t.closest('[data-restore]');
    if (res instanceof HTMLElement) void restore(Number(res.dataset.restore));
  });
}
