// 記録: how much the work grew each day and each month (FR-WORK-08), as bars and a table. The length of the work at
// the end of each day is noted on this device as it is written (the server version notes it at each save); the days
// before this device noted any are counted, once, from the commits of the work's branch on GitHub: each day's last
// commit, its episodes as novel.toml now takes them (the server version's src/record.rs). Drawn by lib/record.js
import { filesOf, textOf } from '../lib/github.js';
import { charsOf } from '../lib/format.js';
import { episodesOf, tableOfContents } from '../lib/layout.js';
import { foldersOf } from '../lib/changes.js';
import { daysToCount, japanDate, lastOfDays, recordHtml } from '../lib/record.js';
import { $, show } from './dom.js';
import * as store from './db.js';
import * as gh from './github.js';
import { api } from './shared.js';
import { bytes, each } from './work.js';

/** @typedef {{ days: Record<string, number>, history: boolean }} Kept the record kept on the device for a work */

/** @param {string} repo */
const key = repo => `record:${repo}`;
// the length of the work today, noted (the last of the day is the day's)
/** @param {string} repo @param {number} chars */
export async function noteToday(repo, chars) {
  /** @type {Kept} */
  const kept = (await store.get('prefs', key(repo))) ?? { days: {}, history: false };
  kept.days[japanDate(Date.now())] = chars;
  await store.put('prefs', key(repo), kept);
}
// the days before the record was kept, from GitHub: each day's last commit (300 commits at most), counted
/** @param {Kept} kept */
async function fromHistory(kept) {
  const w = api.work();
  const commits = await gh.branchCommits(w.repo, w.branch);
  const layout = api.view().layout;
  for (const { day, sha } of daysToCount(lastOfDays(commits, japanDate(Date.now())), kept.days)) {
    const { tree } = await gh.commitOf(w.repo, sha);
    const { blobs } = filesOf((await gh.treeFiles(w.repo, tree)).tree);
    const paths = Object.keys(blobs);
    let chars = 0;
    await each(episodesOf(tableOfContents(layout, paths, foldersOf(paths))), 6, async e => {
      // (read first, then added: `chars +=` would take chars before the wait, and the readings at once would overwrite each other)
      const text = textOf(await bytes(w.repo, blobs[e.path].sha)) ?? '';
      chars += charsOf(text);
    });
    kept.days[day] = chars;
  }
  kept.history = true;
}

export async function openRecord() {
  const w = api.work();
  show('record');
  $('record-body').innerHTML = '<p class="muted small">読み込み中…</p>';
  // today as it is now (what was typed a moment ago too)
  await noteToday(
    w.repo,
    api.episodes().reduce((sum, e) => sum + e.chars, 0),
  );
  /** @type {Kept} (noted just now) */
  const kept = await store.get('prefs', key(w.repo));
  let failed = '';
  if (!kept.history && !w.offline) {
    try {
      await fromHistory(kept);
      await store.put('prefs', key(w.repo), kept);
    } catch (err) {
      failed = `GitHub の履歴を読めませんでした（${err.message}）。この端末で書いた日だけを出しています`;
    }
  }
  $('record-body').innerHTML = recordHtml(kept.days, failed);
}

export function wireRecord() {
  $('open-record').addEventListener('click', () => void openRecord());
  $('close-record').addEventListener('click', () => api.back());
}
