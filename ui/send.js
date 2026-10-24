// Sends every episode written on this device as one commit (Git Data API: blobs, a tree on the branch's, a commit, the
// branch moved forward, never forced). When the branch moved on since the texts were read, the new tree is read, and
// what was written goes on top of it: an episode changed there too keeps both versions side by side (lib/merge.js)
import { changePart, commitSubject, japanDay } from '../lib/commit.js';
import { filesOf, textOf } from '../lib/github.js';
import { relOf, titleWith } from '../lib/layout.js';
import { keptBoth, sendPlan } from '../lib/merge.js';
import * as gh from './github.js';
import { bytes } from './work.js';
import * as store from './db.js';

/** @typedef {import('../lib/drafts.js').Draft} Draft */
/** @typedef {import('./work.js').Work} Work */
/**
 * What a send did: the commit and tree the branch is at now, its files, and for each draft the text taken from it, the
 * blob it went into and whether the other version was put beside it
 * @typedef {{ commit: string, tree: string, blobs: Work['blobs'], folders: string[], sent: { draft: Draft, text: string, blob: string, both: boolean }[], message: string }} Sent
 */

// how many times the branch may move on during one send before it gives up
const TRIES = 3;

/** @param {string} repo @param {string} sha */
const textAt = async (repo, sha) => textOf(await bytes(repo, sha));

/** @param {Work} work @param {Draft[]} drafts @returns {Promise<Sent>} */
export async function sendAll(work, drafts) {
  for (let i = 0; ; i++) {
    const commit = await gh.headOf(work.repo, work.branch);
    let { tree, blobs, folders } = work;
    if (commit !== work.commit) {
      tree = await gh.treeOf(work.repo, commit);
      ({ blobs, folders } = filesOf((await gh.treeFiles(work.repo, tree)).tree));
    }
    const sent = [],
      parts = [],
      entries = [];
    for (const { draft, how, mode, theirs } of sendPlan(drafts, blobs)) {
      const there = theirs ? await textAt(work.repo, theirs) : '';
      if (there === null) throw new Error(`${draft.path} は GitHub で UTF-8 でない形に変わっているので、送れません`);
      const { text, both } = how === 'both' ? keptBoth(draft.text, there) : { text: draft.text, both: false };
      const blob = await gh.newBlob(work.repo, text);
      await store.put('blobs', blob, new TextEncoder().encode(text));
      sent.push({ draft, text, blob, both });
      entries.push({ path: draft.path, mode, type: /** @type {const} */ ('blob'), sha: blob });
      const rel = relOf(work.layout, draft.path) ?? draft.path;
      parts.push(changePart({ title: titleWith(work.layout, rel, text, work.headings), before: there, after: text }));
    }
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
    for (const e of entries) blobs = { ...blobs, [e.path]: { sha: e.sha, mode: e.mode } };
    return { commit: newCommit, tree: newTree, blobs, folders, sent, message };
  }
}
