// A device of the property tests (tests/props): the real modules of sending and reading (ui/send.js, ui/work.js,
// ui/github.js over lib/) talking to the fake GitHub of the screen tests (tests/ui/lib/fake-github.mjs) through
// fetch, and what the desk (ui/desk.js) does around them, step by step as it does it: a text typed kept as a change
// (keepText), an operation's plan made changes (apply), a send and what is left after it (sendDrafts), the work read
// again and the operations whose files changed elsewhere given up (readIn, rebaseChanges), and the texts whose file is
// gone there or is another file now set aside (lib/changes.js settle, the send's refused). The store on the device
// (ui/db.js) is the in-memory one of memory-db.mjs (the tests mock it). Nothing here reaches the real GitHub
import { FakeGitHub, FakeRepo, TOKEN } from '../../ui/lib/fake-github.mjs';
import { moveFiles, rebase, relabel, settle, writeFile } from '../../../lib/changes.js';
import { afterSend, draftOf, goneWhileSent, typedOver } from '../../../lib/drafts.js';
import { episodesOf } from '../../../lib/layout.js';
import { editToml } from '../../../lib/tomledit.js';
import { viewOf } from '../../../lib/view.js';
import * as gh from '../../../ui/github.js';
import { sendAll } from '../../../ui/send.js';
import { contents, load, renamedPaths } from '../../../ui/work.js';

export { FakeGitHub, FakeRepo };

// The novel.toml of the works: lines the author wrote by hand (a comment, a key the app does not know) that every
// send must leave as they are, to the byte
export const HAND_LINES = ['# 作品の設定（手で書いた説明。アプリは書き換えない）', 'extra = "keep"   # アプリの知らない設定'];
export const TOML = [
  HAND_LINES[0],
  'title = "試験の作品"',
  HAND_LINES[1],
  '',
  '[manuscript]',
  'dir = "chapters"',
  'files = "*.md"',
  'title = "heading"',
  '',
  '[git]',
  'branch = "main"',
  '',
].join('\n');
// (each episode holds a mark of its own, ［E1］, so that a test can tell which episode a text is)
export const FILES = {
  'novel.toml': TOML,
  'chapters/01.md': '# 第1話 はじまり\n\n［E1］\n',
  'chapters/02.md': '# 第2話 駅で\n\n［E2］\n',
  'notes/memo.md': '# メモ\n',
};

/**
 * fetch over the fake GitHub: each request answered by its `answer` (as Playwright's routing would), through `gate`
 * (a test's hold on the answer: fast-check's scheduler)
 * @param {FakeGitHub} fake @param {<T>(p: () => Promise<T>) => Promise<T>} [gate]
 */
export function fetchOver(fake, gate = p => p()) {
  return /** @type {typeof fetch} */ (
    async (url, init = {}) =>
      gate(async () => {
        /** @type {Response | null} */
        let res = null;
        const headers = Object.fromEntries(Object.entries(/** @type {Record<string, string>} */ (init.headers ?? {})).map(([k, v]) => [k.toLowerCase(), v]));
        await fake.answer(
          /** @type {any} */ ({
            request: () => ({
              method: () => init.method ?? 'GET',
              url: () => String(url),
              headers: () => headers,
              postDataJSON: () => JSON.parse(String(init.body)),
            }),
            fulfill: (/** @type {{ status: number, headers?: Record<string, string>, body?: string }} */ o) => {
              res = new Response(o.status === 204 ? null : (o.body ?? null), { status: o.status, headers: o.headers });
            },
            abort: () => {
              throw new TypeError('Failed to fetch');
            },
          }),
        );
        return /** @type {Response} */ (/** @type {unknown} */ (res));
      })
  );
}

/** A device with the work open: what the desk keeps of it */
export class Device {
  /** @param {FakeRepo} repo */
  constructor(repo) {
    this.repo = repo;
    /** @type {import('../../../ui/work.js').Work} */
    this.work = /** @type {any} */ (null);
    /** @type {Map<string, import('../../../lib/drafts.js').Draft>} the changes not sent, by path */
    this.changes = new Map();
    /** @type {any[]} novel.toml's keys set and not sent */
    this.edits = [];
    /** @type {import('../../../lib/drafts.js').Draft[]} the texts set aside (their file gone, or another file now) */
    this.parked = [];
    this.ops = 0;
    this.at = 0;
  }
  async open() {
    gh.useToken(TOKEN);
    this.work = await load(this.repo.fullName, this.repo.defaultBranch, '');
    return this;
  }
  view() {
    return viewOf(this.work, this.changes, this.edits);
  }
  episodes() {
    return episodesOf(this.view().toc).map(e => e.path);
  }
  // the text of a file as read from GitHub (ui/desk.js remoteText)
  /** @param {string} path */
  remoteText(path) {
    return this.work.texts[path] ?? this.work.shaTexts[this.work.blobs[path]?.sha ?? ''] ?? '';
  }
  // a text typed into an episode, kept at once (ui/desk.js keepText)
  /** @param {string} path @param {string} text */
  type(path, text) {
    const before = this.changes.get(path);
    const at = ++this.at;
    const draft = before?.op
      ? typedOver(before, text, at)
      : draftOf({ repo: this.repo.fullName, path, base: before?.base ?? this.work.blobs[path]?.sha ?? '', read: this.remoteText(path), text, at });
    const next = new Map(this.changes);
    if (draft) next.set(path, draft);
    else next.delete(path);
    this.changes = next;
  }
  // the work as the plans of lib/episodes.js take it (ui/desk.js forPlans)
  shown() {
    const v = this.view();
    return { layout: v.layout, toc: v.toc, files: Object.keys(v.files), headings: v.headings, textOf: (/** @type {string} */ p) => v.texts[p] ?? null };
  }
  // an operation's plan made changes (ui/desk.js apply): false when novel.toml cannot take its keys
  /** @param {import('../../../lib/episodes.js').Plan} plan */
  apply(plan) {
    const w = this.work;
    const op = `op${++this.ops}`,
      at = ++this.at;
    const opEdits = plan.edits.map(e => ({ ...e, op }));
    if (editToml(w.config ?? '', [...this.edits, ...opEdits]).text === null) return false;
    let { changes, merged } = moveFiles(w.blobs, this.changes, plan.moves, { repo: w.repo, op, at });
    const files = this.view().files;
    for (const { path, text, bytes, bound } of plan.writes) {
      const there = files[path] && !plan.moves.some(m => m[1] === path);
      if (text !== undefined && !bound && there && !changes.get(path)?.op) {
        const d = draftOf({ repo: w.repo, path, base: changes.get(path)?.base ?? w.blobs[path].sha, read: this.remoteText(path), text, at });
        if (d) changes.set(path, d);
        else changes.delete(path);
        continue;
      }
      const made = writeFile(w.blobs, changes, path, bytes ? { bytes } : { text, ...(bound && { auto: true }) }, { repo: w.repo, op, at });
      changes = made.changes;
      for (const m of made.merged) merged.add(m);
    }
    this.changes = changes;
    this.edits = [...relabel(this.edits, merged, op), ...opEdits];
    return true;
  }
  // 送る (ui/desk.js sendDrafts): the changes taken, sent, and what was typed meanwhile left. Returns what sendAll did
  async send() {
    const w = this.work;
    const result = await sendAll(w, [...this.changes.values()], this.edits);
    const next = new Map(this.changes);
    for (const { draft, blob, both } of result.sent) {
      const after = afterSend(next.get(draft.path) ?? goneWhileSent(draft, this.remoteText(draft.path)), draft.text, blob, both);
      if (after) next.set(draft.path, after);
      else next.delete(draft.path);
    }
    for (const d of result.refused) {
      const now = next.get(d.path);
      if (now) this.parked.push(now);
      next.delete(d.path);
    }
    this.work = await contents(
      { repo: w.repo, branch: w.branch, commit: result.commit, tree: result.tree, updated: result.updated, blobs: result.blobs, folders: result.folders },
      false,
    );
    const { changes: left, parked } = settle(next, w.blobs, result.blobs, await renamedPaths(w.repo, [...next.values()], w, this.work, false));
    this.parked.push(...parked);
    this.changes = left;
    this.edits = [];
    return result;
  }
  // the work read again (ui/desk.js readIn and rebaseChanges): the operations whose files changed there given up
  async readIn() {
    const before = this.work;
    this.work = await load(this.repo.fullName, this.repo.defaultBranch, '');
    const { changes, ops, parked: homeless } = rebase(this.changes, this.work.blobs);
    this.parked.push(...homeless);
    const renamed = await renamedPaths(this.repo.fullName, [...changes.values()], before, this.work, false);
    const { changes: left, parked } = settle(changes, before.blobs, this.work.blobs, renamed);
    this.changes = left;
    this.parked.push(...parked);
    this.edits = this.edits.filter(e => !ops.has(e.op));
  }
}

// everything a repository's branch holds now, as text: its files at the head
/** @param {FakeRepo} repo */
export function headTexts(repo) {
  const files = repo.files(repo.refs[repo.defaultBranch]);
  return Object.fromEntries(Object.entries(files).map(([p, e]) => [p, repo.blobs.get(e.sha)?.toString() ?? '']));
}
// the texts a device still keeps that are not sent (a text written, or a blob of the branch put elsewhere, or a text
// set aside)
/** @param {Device} d */
export function keptTexts(d) {
  return [
    ...[...d.changes.values()].map(c => c.text ?? (c.sha ? (d.repo.blobs.get(c.sha)?.toString() ?? '') : '')),
    ...d.parked.map(c => /** @type {string} */ (c.text)),
  ];
}
