// Sends every change not sent yet as one commit (Git Data API: blobs, a tree on the branch's, a commit, the branch
// moved forward, never forced). When the branch moved on since it was read, the new tree is read, and the changes go
// on top of it: a text changed there too keeps both versions side by side (lib/merge.js); an operation (an episode
// added, renamed, put in the trash, the order changed) whose files changed there is not sent, and the screen says so
import { changeParts, changePart, commitSubject, japanDay, kindsOf } from '../lib/commit.js';
import { conflictsOf } from '../lib/changes.js';
import { filesOf, japaneseText, textOf } from '../lib/github.js';
import { CONFIG, relOf, titleWith } from '../lib/layout.js';
import { keptBoth, sendPlan } from '../lib/merge.js';
import { editToml } from '../lib/tomledit.js';
import { viewOf } from '../lib/view.js';
import * as gh from './github.js';
import { bytes } from './work.js';
import * as store from './db.js';

/** @typedef {import('../lib/drafts.js').Draft} Draft */
/** @typedef {import('./work.js').Work} Work */
/**
 * What a send did: the commit and tree the branch is at now, its files, and for each change the text taken from it
 * (none for one that held no text), the blob it went into ('' for a file deleted) and whether the other version was
 * put beside it
 * @typedef {{ commit: string, tree: string, updated: number, blobs: Work['blobs'], folders: string[], sent: { draft: Draft, text: string | undefined, blob: string, both: boolean }[], message: string }} Sent
 */

// An operation not sent: the branch changed under these files elsewhere
export class Overlapped extends Error {
  /** @param {string[]} paths */
  constructor(paths) {
    super(`ほかの所で ${paths.join('、')} が変わっていたので、送りませんでした`);
    this.paths = paths;
  }
}

// how many times the branch may move on during one send before it gives up
const TRIES = 3;

// a blob's text there now: UTF-8, or a Japanese text of another encoding (FR-WORK-03); null when it is neither
/** @param {string} repo @param {string} sha */
const textAt = async (repo, sha) => {
  const b = await bytes(repo, sha);
  return textOf(b) ?? japaneseText(b);
};
/** @param {Uint8Array} b */
const base64 = b => btoa(Array.from(b, c => String.fromCharCode(c)).join(''));

/**
 * @param {Work} work @param {Draft[]} drafts @param {import('../lib/tomledit.js').TomlEdit[]} edits novel.toml's keys to set
 * @returns {Promise<Sent>}
 */
export async function sendAll(work, drafts, edits) {
  for (let i = 0; ; i++) {
    const commit = await gh.headOf(work.repo, work.branch);
    let { tree, blobs, folders } = work;
    if (commit !== work.commit) {
      tree = await gh.treeOf(work.repo, commit);
      ({ blobs, folders } = filesOf((await gh.treeFiles(work.repo, tree)).tree));
    }
    const ops = drafts.filter(d => d.op);
    const overlapped = conflictsOf(new Map(ops.map(d => [d.path, d])), blobs);
    if (overlapped.length) throw new Overlapped(overlapped);
    // the texts there now, by path (an episode written, or a file an operation changes)
    /** @type {Record<string, string>} */
    const there = {};
    /** @type {Record<string, string>} */
    const after = {};
    const sent = [],
      entries = [];
    for (const { draft, how, mode, theirs } of sendPlan(
      drafts.filter(d => !d.op),
      blobs,
    )) {
      const was = theirs ? await textAt(work.repo, theirs) : '';
      if (was === null) throw new Error(`${draft.path} は GitHub で UTF-8 でない形に変わっているので、送れません`);
      const { text, both } = how === 'both' ? keptBoth(/** @type {string} */ (draft.text), was) : { text: /** @type {string} */ (draft.text), both: false };
      const blob = await gh.newBlob(work.repo, text);
      await store.put('blobs', blob, new TextEncoder().encode(text));
      sent.push({ draft, text, blob, both });
      entries.push({ path: draft.path, mode, type: /** @type {const} */ ('blob'), sha: /** @type {string | null} */ (blob) });
      [there[draft.path], after[draft.path]] = [was, text];
    }
    for (const d of ops) {
      const old = blobs[d.from?.path ?? d.path];
      if (old && !d.gone) there[d.from?.path ?? d.path] = (await textAt(work.repo, old.sha).catch(() => null)) ?? '';
      let blob = '';
      if (d.text !== undefined) {
        blob = await gh.newBlob(work.repo, d.text);
        await store.put('blobs', blob, new TextEncoder().encode(d.text));
        after[d.path] = d.text;
      } else if (d.bytes) blob = await gh.newBytes(work.repo, base64(d.bytes));
      else if (!d.gone) {
        blob = /** @type {string} */ (d.sha);
        after[d.path] = (await textAt(work.repo, blob).catch(() => null)) ?? '';
      }
      sent.push({ draft: d, text: d.text, blob, both: false });
      entries.push({ path: d.path, mode: d.mode ?? blobs[d.path]?.mode ?? '100644', type: /** @type {const} */ ('blob'), sha: d.gone ? null : blob });
    }
    // novel.toml: its keys set on the one there now (what else changed in it there stays)
    const configNow = blobs[CONFIG] ? await textAt(work.repo, blobs[CONFIG].sha) : '';
    const read = { blobs, config: configNow, problems: [], texts: there, shaTexts: {} };
    let config = configNow;
    if (edits.length) {
      if (configNow === null) throw new Error('novel.toml が UTF-8 ではないので、書き換えられません');
      const edited = editToml(configNow, edits);
      if (edited.text === null) throw new Error(edited.error);
      config = edited.text;
      if (config !== configNow) {
        const blob = await gh.newBlob(work.repo, config);
        entries.push({ path: CONFIG, mode: blobs[CONFIG]?.mode ?? '100644', type: /** @type {const} */ ('blob'), sha: /** @type {string | null} */ (blob) });
      }
    }
    const was = viewOf(read, new Map(), []);
    const now = viewOf({ ...read, config }, new Map(), []);
    const listed = kindsOf([
      ...ops,
      ...(edits.length && config !== configNow ? [{ repo: work.repo, path: CONFIG, base: blobs[CONFIG]?.sha ?? '', at: 0 }] : []),
    ]).map(k => ({ ...k, before: there[k.path] ?? '', after: after[k.to || k.path] ?? '' }));
    const parts = [
      ...sent
        .filter(s => !s.draft.op)
        .map(s => {
          const rel = relOf(was.layout, s.draft.path) ?? s.draft.path;
          return changePart({
            title: titleWith(now.layout, rel, /** @type {string} */ (s.text), now.headings),
            before: there[s.draft.path],
            after: /** @type {string} */ (s.text),
          });
        }),
      ...changeParts(listed, was, now),
    ];
    const message = commitSubject(japanDay(Date.now()), parts);
    const newTree = await gh.newTree(work.repo, tree, entries);
    const newCommit = await gh.newCommit(work.repo, message, newTree, commit);
    try {
      await gh.moveBranch(work.repo, work.branch, newCommit);
    } catch (err) {
      // (moved on again between reading it and moving it: read again, a few times)
      if (err instanceof gh.GitHubError && err.status === 422 && i + 1 < TRIES) continue;
      throw err;
    }
    for (const e of entries) {
      blobs = { ...blobs };
      if (e.sha === null) delete blobs[e.path];
      else blobs[e.path] = { sha: e.sha, mode: e.mode };
    }
    return { commit: newCommit, tree: newTree, updated: Date.now(), blobs, folders, sent, message };
  }
}
