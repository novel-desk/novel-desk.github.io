// 記録: how much the work grew each day and each month (FR-WORK-08), as bars and a table. The length of the work at
// the end of each day is noted on this device as it is written (the server version notes it at each save); the days
// before this device noted any are counted, once, from the commits of the work's branch on GitHub: each day's last
// commit, its episodes as novel.toml now takes them (the server version's src/record.rs). Drawn by lib/record.js
import { filesOf, textOf } from '../lib/github.js';
import { esc, charsOf, n } from '../lib/format.js';
import { episodesOf, tableOfContents } from '../lib/layout.js';
import { foldersOf } from '../lib/changes.js';
import { allMonths, barChart, daysAndMonths, japanDate, lastDays, lastOfDays, signed } from '../lib/record.js';
import { $, show } from './dom.js';
import * as store from './db.js';
import * as gh from './github.js';
import { api } from './shared.js';
import { bytes, each } from './work.js';

/** @typedef {import('../lib/record.js').Point} Point */
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
  for (const { day, sha } of lastOfDays(commits, japanDate(Date.now()))) {
    if (day in kept.days) continue;
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

// the rows of a table: the newest first, those that changed only (the first: its count, its start not known)
/** @type {(points: Point[]) => string} */
const rows = points =>
  points
    .filter(p => p.added !== 0)
    .reverse()
    .map(p => `<tr><td>${esc(p.at)}</td><td class="num">${p.added === null ? '—' : `${signed(p.added)}字`}</td><td class="num">${n(p.chars)}字</td></tr>`)
    .join('');
/** @type {(points: Point[], what: string) => string} */
const table = (points, what) =>
  `<table class="rec-table"><thead><tr><th>${what}</th><th class="num">増えた字数</th><th class="num">合計</th></tr></thead><tbody>${rows(points)}</tbody></table>`;

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
  const { days, months } = daysAndMonths(kept.days);
  $('record-body').innerHTML =
    `${failed ? `<p class="error">${esc(failed)}</p>` : ''}<h2>日ごと（直近 30 日）</h2>${barChart(lastDays(days, 30))}${table(days, '日')}
    <h2>月ごと</h2>${barChart(allMonths(months))}${table(months, '月')}
    <p class="muted small">増えた字数は、その日（その月）の終わりの合計の字数から、前の日（前の月）の終わりの合計を引いたものです。削除した分は差し引きます。最初の日と月は、その前が分からないので「—」です。この端末で書いた日は書くたびに残し、それより前の日は GitHub の commit から分かる日だけです（その日の最後の commit の字数）。</p>`;
}

export function wireRecord() {
  $('open-record').addEventListener('click', () => void openRecord());
  $('close-record').addEventListener('click', () => api.back());
}
