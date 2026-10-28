// The desk as the screen shows it (ui/desk.js, and the note open on 資料: ui/notes.js; no screen, no state of the app:
// tested by itself in tests/unit): the table of contents, what the text open says of where it is kept, the operations'
// changes, the texts as shown, what reading and sending say, and the texts set aside
import { moveFiles, writeFile } from './changes.js';
import { draftOf, goneWhileSent, afterSend, typedOver } from './drafts.js';
import { charsOf, esc, n, whenLong } from './format.js';
import { isEpisode } from './layout.js';
import { CONFLICT_MARK, keptBoth } from './merge.js';
import { isNote, noteHeading } from './notes.js';
import { saveState, sendsItself } from './sync.js';
import { visibilityTag } from './works.js';

/** @typedef {import('./drafts.js').Draft} Draft */
/** @typedef {import('./changes.js').Blobs} Blobs */
/** @typedef {import('./layout.js').TocItem} TocItem */
/** @typedef {import('./layout.js').TocEpisode} TocEpisode */

// both versions side by side in a text (FR-SAVE-05), and what is said of it in place of where it is kept
/** @param {string} text */
export const hasConflict = text => text.includes(CONFLICT_MARK);
export const BOTH_SAID = '両方の版が並んでいます。「――― ここから」の行を探して整理してください';
// where the note open is kept (FR-SAVE-07, FR-NOTE-04): both versions side by side said first; a draft not sent; else nothing
/** @param {string} text @param {boolean} draft */
export const noteStateSaid = (text, draft) => (hasConflict(text) ? BOTH_SAID : draft ? '端末に保存済み（未送信）' : '');

// --- the table of contents (ui/desk.js renderToc)

// how many files the changes not sent change (novel.toml's keys count once, with a draft of it or not)
/** @param {{ size: number, has: (path: string) => boolean }} drafts @param {unknown[]} edits */
export const unsentCount = (drafts, edits) => drafts.size + (edits.length && !drafts.has('novel.toml') ? 1 : 0);
// The state in a word on the folded line (FR-GH-08, as the server version's 「・push 済み」): nothing with no work read or
// the work not synced; 送信失敗, 未送信, else 送信済み
/** @param {{ read: boolean, mode: string, bad: boolean, unsent: number }} s */
export const briefOf = ({ read, mode, bad, unsent }) => ({
  className: bad ? 'small err' : 'muted small',
  text: !read || mode === 'off' ? '' : bad ? '・送信失敗' : unsent ? '・未送信' : '・送信済み',
});
// 送る (FR-GH-05): 「…」 while it sends; not pressed with nothing to send, or the repository not the one connected
// (FR-GH-12); how many files it sends
/** @param {{ busy: boolean, unsent: number, stopped: boolean }} s */
export const sendButton = ({ busy, unsent, stopped }) => ({
  disabled: busy || unsent === 0 || stopped,
  text: busy ? '…' : unsent ? `送る（${unsent}）` : '送る',
});
// the characters of these episodes as shown (one not read counts as nothing)
/** @param {{ path: string }[]} episodes @param {(path: string) => string | null} textOf */
export const charsOfAll = (episodes, textOf) => episodes.reduce((sum, e) => sum + charsOf(textOf(e.path) ?? ''), 0);
/**
 * The table of contents (FR-TOC-01): the chapters (folded or open, FR-TOC-07: open when the episode open is in it) and
 * the episodes, each with its title, its tags (未送信, 競合), its length; the tools to reorder them while 「並べ替え」 is on
 * (FR-TOC-04: ↑ ↓, the chapter to move an episode to, a chapter's title renamed, FR-TOC-05), and dragged
 * @param {{ toc: TocItem[], titleAt: (rel: string) => string, textOf: (path: string) => string | null, drafts: { has: (path: string) => boolean },
 *   current: string, ordering: boolean, closed: Set<string> }} o
 */
export function tocHtml({ toc, titleAt, textOf, drafts, current, ordering, closed }) {
  const chapters = toc.filter(it => it.type === 'chapter');
  /** @param {'episode' | 'chapter'} kind @param {string} path @param {string} [inChapter] */
  const tools = (kind, path, inChapter = '') =>
    `<span class="order-tools">${kind === 'chapter' ? `<button data-rename-chapter="${esc(path)}" title="章の題名を変更" aria-label="章の題名を変更">✎</button>` : ''}<button data-move="-1" data-path="${esc(path)}" aria-label="上へ">↑</button><button data-move="1" data-path="${esc(path)}" aria-label="下へ">↓</button>${
      kind === 'episode' && chapters.length
        ? `<select data-to-chapter data-path="${esc(path)}" aria-label="移動先の章"><option value="">章なし</option>${chapters
            .map(c => `<option value="${esc(c.path)}"${inChapter === c.path ? ' selected' : ''}>${esc(titleAt(c.rel))}</option>`)
            .join('')}</select>`
        : ''
    }</span>`;
  /** @param {TocEpisode} e @param {string} [inChapter] */
  const episode = (e, inChapter) => {
    const text = textOf(e.path) ?? '';
    const tags =
      (drafts.has(e.path) ? '<span class="unsent-tag">未送信</span>' : '') +
      (hasConflict(text) ? '<span class="conflict" title="両方の版が並んでいます。「――― ここから」の行を整理してください">競合</span>' : '');
    return `<div class="node episode${e.path === current ? ' active' : ''}" role="button" tabindex="0" data-path="${esc(e.path)}" data-node="${esc(e.path)}" draggable="${ordering}"><span class="t">${esc(titleAt(e.rel))}</span>${tags}<span class="u"></span><span class="c">${n(charsOf(text))}</span>${tools('episode', e.path, inChapter)}</div>`;
  };
  return toc
    .map(it =>
      it.type === 'episode'
        ? episode(it)
        : `<div class="node chapter" role="button" tabindex="0" data-fold="${esc(it.path)}" data-node="${esc(it.path)}" draggable="${ordering}"><span class="fold">${closed.has(it.path) ? '▸' : '▾'}</span><span class="t">${esc(titleAt(it.rel))}</span><span class="c">${n(charsOfAll(it.episodes, textOf))}</span>${tools('chapter', it.path)}</div><div class="chapter-body${closed.has(it.path) && !it.episodes.some(e => e.path === current) ? ' closed' : ''}">${it.episodes.map(e => episode(e, it.path)).join('')}</div>`,
    )
    .join('');
}
// the repository, its page on GitHub at the branch open, and whether it is public (FR-GH-11)
/** @param {string} repo @param {string} branch @param {{ visibility?: string, private?: boolean }} r */
export const repoLink = (repo, branch, r) =>
  `<a href="https://github.com/${esc(repo)}/tree/${esc(encodeURIComponent(branch))}" target="_blank" rel="noopener">${esc(repo)}</a>${visibilityTag(r)}`;
// the work's title as shown: novel.toml's, else the repository's name
/** @param {string} title @param {string} repo */
export const workTitleOf = (title, repo) => title || repo.split('/')[1];
// when the work was last changed: the commit read, or a change not sent written after it
/** @param {number} updated @param {Iterable<{ at: number }>} drafts */
export const lastChange = (updated, drafts) => Math.max(updated || 0, ...[...drafts].map(d => d.at));
// a chapter folded or opened (FR-TOC-07): the chapters folded after it
/** @param {string[]} folded @param {string} path */
export const toggled = (folded, path) => (folded.includes(path) ? folded.filter(p => p !== path) : [...folded, path]);
// where a row dragged over a row goes (a mouse): an episode on a chapter goes into it, anything else before the row
/** @param {boolean} chapter the row is a chapter's @param {string} dragging the path dragged */
export const dropClass = (chapter, dragging) => (chapter && dragging.endsWith('.md') ? 'drop-into' : 'drop-before');
// the chapter the episode open is in ('' none: the episodes added go there, FR-TOC-02)
/** @param {TocItem[]} toc @param {string} current */
export const chapterWith = (toc, current) => toc.find(it => it.type === 'chapter' && it.episodes.some(e => e.path === current))?.path ?? '';

// --- the episode open

// the episode before (-1) or after (1) the one open, with its title (null: none, or none open)
/** @param {TocEpisode[]} episodes @param {string} current @param {number} d @param {(rel: string) => string} titleAt */
export function neighborOf(episodes, current, d, titleAt) {
  const i = episodes.findIndex(e => e.path === current);
  const e = i < 0 ? null : episodes[i + d];
  return e ? { path: e.path, title: titleAt(e.rel) } : null;
}
// Where the text open is kept (FR-SAVE-07): both versions side by side said first (FR-SAVE-05); no episode open,
// nothing; else lib/sync.js saveState (on GitHub: read from it, synced, the file there)
/** @param {{ text: string, current: string, draft: boolean, failed: boolean, onGitHub: boolean }} s */
export const saveSaid = ({ text, current, draft, failed, onGitHub }) => (hasConflict(text) ? BOTH_SAID : current ? saveState({ draft, failed, onGitHub }) : '');
// the length of the text open (FR-EDIT-02; none open: 0)
/** @param {string} current @param {string} text */
export const episodeChars = (current, text) => (current ? n(charsOf(text)) : '0');
// whether the file open is on GitHub as read: the work read from GitHub (not offline), synced, the file there
/** @param {{ offline: boolean, blobs: Blobs } | null} work @param {string} mode @param {string} path */
export const onGitHubOf = (work, mode, path) => Boolean(work && !work.offline && mode !== 'off' && work.blobs[path]);
// the key of when an episode was last changed on GitHub: by its path and its blob
/** @param {string} path @param {string} sha */
export const changedKey = (path, sha) => `${path}\n${sha}`;
// 最終更新 of an episode (FR-EDIT-02): when this device wrote it (not sent), else its last commit on GitHub (0: not known)
/** @param {Draft | undefined} draft @param {{ sha: string } | undefined} blob @param {Map<string, number>} changed @param {string} path */
export const updatedOf = (draft, blob, changed, path) => (draft ? draft.at : blob ? (changed.get(changedKey(path, blob.sha)) ?? 0) : 0);
// what the foot says of 最終更新 ('' none open, or not known yet)
/** @param {string} current @param {number} ms @param {number} [now] */
export const updatedSaid = (current, ms, now = Date.now()) => (current && ms ? `最終更新 ${whenLong(ms, now)}` : '');
// The key to ask GitHub for an episode's last commit by (null: not to be asked: not on GitHub as read, offline, a
// draft of it, or known or being asked already)
/** @param {{ offline: boolean, blobs: Blobs }} work @param {{ has: (path: string) => boolean }} drafts @param {string} path @param {{ has: (key: string) => boolean }[]} known */
export function askKey(work, drafts, path, known) {
  const b = work.blobs[path];
  if (!b || work.offline || drafts.has(path)) return null;
  const key = changedKey(path, b.sha);
  return known.some(k => k.has(key)) ? null : key;
}
// the last commits kept on the device for a work: those of the files there now
/** @param {Map<string, number>} changed @param {Blobs} blobs */
export function changedKept(changed, blobs) {
  const keys = new Set(Object.entries(blobs).map(([p, b]) => changedKey(p, b.sha)));
  return Object.fromEntries([...changed].filter(([k]) => keys.has(k)));
}
// what is said under the title of an episode that cannot be opened: not on the device offline, or not UTF-8 (hidden
// when it opens)
/** @param {string | null} text @param {boolean} offline */
export const episodeNote = (text, offline) =>
  text !== null
    ? { hidden: true, text: '' }
    : {
        hidden: false,
        text: offline ? 'この話はまだこの端末に読み込まれていません（つながってから開いてください）' : '文字コードが UTF-8 ではないため開けません',
      };
/**
 * A text written in a file (the episode typed, a note): typed over an operation's file, that change with the text;
 * else a draft written from the blob it was first written from (none: back to the text read)
 * @param {Draft | undefined} before @param {{ repo: string, path: string, sha: string, read: string, text: string, at: number }} o @returns {Draft | null}
 */
export const nextDraft = (before, { repo, path, sha, read, text, at }) =>
  before?.op ? typedOver(before, text, at) : draftOf({ repo, path, base: before?.base ?? sha, read, text, at });
// the episodes of the work as the other screens take them: path, title and length
/** @param {TocEpisode[]} episodes @param {(rel: string) => string} titleAt @param {(path: string) => string | null} textOf */
export const episodeRows = (episodes, titleAt, textOf) =>
  episodes.map(e => ({ path: e.path, rel: e.rel, title: titleAt(e.rel), chars: charsOf(textOf(e.path) ?? '') }));

// --- the operations (ui/desk.js apply)

/**
 * An operation's plan made changes (FR-TOC-02〜06, FR-NOTE-01〜06, FR-EDIT-07〜09): the files moved, then each file
 * written. A text written into a file of the branch (not moved there, not an operation's own, not bound: a heading
 * renamed) is a draft of it, as when typed; anything else is the operation's
 * @param {{ repo: string, blobs: Blobs }} w @param {Map<string, Draft>} drafts @param {Blobs} shown the files as shown
 * @param {import('./episodes.js').Plan} plan @param {{ op: string, at: number }} stamp @param {(path: string) => string} read the text read of a file
 * @returns {{ changes: Map<string, Draft>, merged: Set<string> }}
 */
export function planChanges(w, drafts, shown, plan, { op, at }, read) {
  let { changes, merged } = moveFiles(w.blobs, drafts, plan.moves, { repo: w.repo, op, at });
  for (const { path, text, bytes, bound } of plan.writes) {
    const there = shown[path] && !plan.moves.some(m => m[1] === path);
    if (text !== undefined && !bound && there && !changes.get(path)?.op) {
      const d = draftOf({ repo: w.repo, path, base: changes.get(path)?.base ?? w.blobs[path].sha, read: read(path), text, at });
      if (d) changes.set(path, d);
      else changes.delete(path);
      continue;
    }
    const made = writeFile(w.blobs, changes, path, bytes ? { bytes } : { text, ...(bound && { auto: true }) }, { repo: w.repo, op, at });
    changes = made.changes;
    for (const m of made.merged) merged.add(m);
  }
  return { changes, merged };
}
// The episode opened after an operation: the one asked for (`open`); else where the one open moved, or the one open,
// when they are still episodes (`has`); else none (''). `moved`: where the one open moved to (none: not moved)
/** @param {{ moves: [string, string][], current: string, open: string | undefined, has: (path: string) => boolean }} o */
export function openAfter({ moves, current, open, has }) {
  const moved = moves.find(m => m[0] === current)?.[1];
  const next = open ?? (moved && has(moved) ? moved : has(current) ? current : '');
  return { next, keepsPlace: next === current || next === moved };
}
// the episode opened after the one open is put in the trash: the one before it (the first, when it was the first;
// none when it was the only one)
/** @param {{ path: string }[]} episodes @param {{ path: string }} e */
export function afterTrash(episodes, e) {
  const i = episodes.indexOf(e);
  return episodes.filter(x => x !== e)[Math.max(0, i - 1)]?.path ?? '';
}
// a chapter's new title typed (FR-TOC-05; null: nothing to change: closed, nothing typed, or the title now)
/** @param {string | null} given @param {string} now */
export const changedTitle = (given, now) => (given === null || !given.trim() || given === now ? null : given);
// The work's title typed (FR-WORK-04): kept (trimmed); or, nothing typed or the same, the title shown again
/** @param {string} typed @param {string} title novel.toml's @param {string} repo @returns {{ keep: string } | { shown: string }} */
export function workTitleTyped(typed, title, repo) {
  const t = typed.trim();
  return !t || t === title ? { shown: workTitleOf(title, repo) } : { keep: t };
}

// --- the texts as shown, and the pictures

// a picture shown by its blob, or (added on this device, not sent) by its bytes ('' none)
/** @param {Draft | undefined} draft @param {Blobs} files @param {string} path */
export const pictureKeyOf = (draft, files, path) => (draft?.bytes ? `here:${path}:${draft.at}` : (files[path]?.sha ?? ''));
/**
 * The texts of files of the work as shown (null: not there, not UTF-8, or not on the device offline): a change's
 * text, or the blob it moved; else the text read, by path or by blob
 * @param {string[]} paths @param {Blobs} files @param {Map<string, Draft>} drafts
 * @param {{ texts: Record<string, string | null>, shaTexts: Record<string, string | null> }} work @returns {Record<string, string | null>}
 */
export function textsOf(paths, files, drafts, work) {
  /** @type {Record<string, string | null>} */
  const out = {};
  for (const p of paths) {
    const c = drafts.get(p);
    if (!files[p]) out[p] = null;
    else if (c) out[p] = c.text ?? work.shaTexts[/** @type {string} */ (c.sha)] ?? null;
    else out[p] = work.texts[p] ?? work.shaTexts[files[p].sha] ?? null;
  }
  return out;
}
// the text of a file as read from GitHub ('' when it is not there, or not read)
/** @param {{ texts: Record<string, string | null>, shaTexts: Record<string, string | null>, blobs: Blobs }} work @param {string} path */
export const remoteTextOf = (work, path) => work.texts[path] ?? work.shaTexts[work.blobs[path]?.sha ?? ''] ?? '';
// the blobs of the files moved by the changes not sent (their texts read when the device does not have them yet)
/** @param {Iterable<Draft>} drafts */
export const movedShas = drafts => [...drafts].flatMap(d => (d.sha && d.text === undefined ? [d.sha] : []));
// the blobs of these files as shown (to be read)
/** @param {string[]} paths @param {Blobs} files */
export const shasOf = (paths, files) => paths.flatMap(p => (files[p]?.sha ? [files[p].sha] : []));
// The episodes and notes read from another encoding than UTF-8 (FR-WORK-03), with no draft: kept as drafts, made UTF-8
/** @param {{ files: Blobs, layout: import('./layout.js').Layout }} view @param {Set<string>} converted the blobs @param {{ has: (path: string) => boolean }} drafts */
export const convertedPaths = (view, converted, drafts) =>
  Object.keys(view.files).filter(p => converted.has(view.files[p].sha) && !drafts.has(p) && (isEpisode(view.layout, p) || isNote(view.layout, p)));

// --- reading and sending (FR-GH-05, FR-GH-07, FR-GH-08, FR-SAVE-03)

// What is said once the work is read (`when`: the time): not synced (FR-GH-04), offline (the version read before), or
// read from GitHub
/** @param {string} mode @param {boolean} offline @param {string} when @returns {[string, '' | 'ok' | 'err']} */
export const readSaid = (mode, offline, when) =>
  mode === 'off'
    ? ['同期しない設定です。GitHub へ送ることも、GitHub から取り込むこともしません（この端末で前に読んだ版に書きます）', '']
    : offline
      ? ['オフラインです。前に読んだ版を出しています（送るのはつながってから）', 'err']
      : [`GitHub から読みました（${when}）`, 'ok'];
// 同期しない (FR-GH-04): the work as last read on this device is opened, when it is of the branch chosen ('' none)
/** @param {{ branch: string } | null | undefined} kept @param {string} chosen */
export const keptToOpen = (kept, chosen) => Boolean(kept) && (!chosen || /** @type {{ branch: string }} */ (kept).branch === chosen);
// the episode opened once the work is read (FR-EDIT-01): the one open, else the one last opened, else the first ('' none)
/** @param {string[]} paths @param {string} current @param {string | undefined} last */
export const openAfterRead = (paths, current, last) =>
  paths.includes(current) ? current : paths.includes(/** @type {string} */ (last)) ? /** @type {string} */ (last) : (paths[0] ?? '');
// another repository under the work's name (FR-GH-12): not sent to
/** @param {string} name */
export const stopSaid = name =>
  `${name} は、つないだリポジトリとは別のリポジトリになっています（GitHub で名前が変わったか、削除された後に同じ名前で作成された可能性があります）。送らずに止めています。GitHub で確かめてから「つなぎ直す」を押してください`;
// the changes not sent written on another branch than the one open: not sent by themselves
/** @param {string} branch @param {string} open */
export const otherBranchSaid = (branch, open) =>
  `この端末の未送信の変更は、ブランチ ${branch} で書いたものです。いまは ${open} を開いているので、自動では送りません。${branch} に送るときは「⎇」で ${branch} に切り替えてください（「送る」を押すと、いまのブランチに送るかを確かめます）`;
// Whether the work is read in (FR-SAVE-08): read from GitHub, synced, nothing being read or sent, a screen of the work
// shown and the page in front
/** @param {{ read: boolean, busy: boolean, offline: boolean, mode: string, onWork: boolean, visible: boolean }} s */
export const readsIn = s => s.read && !s.busy && !s.offline && s.mode !== 'off' && s.onWork && s.visible;
// The episode open, after the work changed under it (FR-SAVE-08): gone, the first one opened ('first'); with no draft
// of it, what the branch has now shown ('show'); else left as it is ('')
/** @param {string} current @param {boolean} there @param {boolean} draft @returns {'' | 'first' | 'show'} */
export const openStep = (current, there, draft) => (!current ? '' : !there ? 'first' : draft ? '' : 'show');
// What 自動 does when its time comes (FR-SAVE-03, FR-GH-04): sent (lib/sync.js sendsItself; not to another repository
// under the work's name, FR-GH-12: 'send'); written on another branch, said so ('other'); else nothing ('')
/** @param {{ stopped: boolean, mode: import('./sync.js').SyncMode, unsent: number, offline: boolean, busy: boolean, elsewhere: number }} s @returns {'' | 'send' | 'other'} */
export const sendNowStep = s => (!s.stopped && sendsItself(s) ? 'send' : s.elsewhere && s.mode === 'auto' ? 'other' : '');
// the files the changes were read against: the work as last read on this device when it is of the branch read now,
// else (none read before on this branch) the files read now
/** @param {{ branch: string, blobs: Blobs } | undefined} last @param {{ branch: string, blobs: Blobs }} now */
export const readAgainst = (last, now) => (last?.branch === now.branch ? last.blobs : now.blobs);
// the episode shown after a change not sent is given up, or back from another screen: the one open while it is one,
// else the first ('' none)
/** @param {string[]} paths @param {string} current */
export const openOrFirst = (paths, current) => (current && paths.includes(current) ? current : (paths[0] ?? ''));
// 自動 (FR-SAVE-03): the changes not sent go a while after the last one, while some are not sent
/** @param {string} mode @param {number} unsent */
export const autoSends = (mode, unsent) => mode === 'auto' && unsent > 0;
/**
 * What a send leaves on the device (FR-SAVE-04, FR-SAVE-09): the drafts as the device has them now (`drafts`: typed
 * during the send too), each one sent taken off unless typed since (then written from the blob it went into, where
 * its file went: lib/drafts.js afterSend); the texts refused set aside as the device has them now (none: typed back
 * or given up); the files the texts sent went to elsewhere
 * @param {Map<string, Draft>} drafts @param {{ refused: Draft[], sent: { draft: Draft, to: string, blob: string, both: boolean }[] }} result
 * @param {(path: string) => string} read the text read of a file
 */
export function afterSent(drafts, result, read) {
  const next = new Map(drafts);
  const refused = result.refused.map(d => drafts.get(d.path)).filter(d => d !== undefined);
  for (const d of result.refused) next.delete(d.path);
  for (const { draft, to, blob, both } of result.sent) {
    // (gone from the device while it was sent: what the author has is the text read, not the one sent)
    const after = afterSend(drafts.get(draft.path) ?? goneWhileSent(draft, read(draft.path)), draft.text, blob, both);
    // (its file moved elsewhere: what was typed since goes there with it; another text moved to its path stays)
    if (next.get(draft.path) === drafts.get(draft.path)) next.delete(draft.path);
    if (after) next.set(to, { ...after, path: to });
  }
  const went = result.sent.filter(s => s.to !== s.draft.path).map(s => /** @type {[string, string]} */ ([s.draft.path, s.to]));
  return { next, refused, went };
}
// What a send said: both versions kept side by side (the episodes said; FR-SAVE-05), sent (the commit's message), or
// nothing to send. `toast`: said in a notice too
/** @param {string[]} titles @param {boolean} sides @param {string} message @returns {{ text: string, kind: 'ok' | 'err', toast: string }} */
export function sentSaid(titles, sides, message) {
  if (sides)
    return {
      text: `送りました。${titles.join('、')}はほかでも書き換えられていたので、両方の版を並べました（${message}）`,
      kind: 'err',
      toast: 'ほかでも書き換えられていた話があります。両方の版を並べました',
    };
  return message
    ? { text: `送りました（${message}）`, kind: 'ok', toast: '' }
    : { text: '送る変更はありませんでした（GitHub にもう同じ内容があります）', kind: 'ok', toast: '' };
}
// Why a send failed (NFR-USE-01): an operation over files changed elsewhere (read again), GitHub not reached, or else
/** @param {'overlapped' | 'offline' | 'other'} kind @param {string} message */
export const sendFailedSaid = (kind, message) =>
  kind === 'overlapped'
    ? `${message}。「再読み込み」で読み直してください（重なった話の追加・名前の変更・削除・並べ替えは取り消し、書いた文章は残します）`
    : kind === 'offline'
      ? `${message}。書いたものはこの端末に残っています`
      : `送れませんでした: ${message}。書いたものはこの端末に残っています`;

// --- the texts set aside (FR-SAVE-09)

// why a text is set aside (said on the screen and in the list)
export const MOVED = 'ほかの所で削除されたか、別のファイルに替わっていた';
export const TAKEN = '取り消した操作の中で書いた文章で、元の場所にも今の場所にも別の書きかけがあった';
// what a text set aside is called: its heading, else its file
/** @param {Draft} d */
export const parkedName = d => noteHeading(/** @type {string} */ (d.text)) ?? d.path;
// what is said when texts are set aside
/** @param {Draft[]} list @param {string} why */
export const parkedSaid = (list, why) =>
  `「${list.map(parkedName).join('」「')}」は、${why}ので、書いた文章を送らずにこの端末に残しました。「未送信の一覧」で、送る・本文に入れる・捨てるを選べます`;
// the changes of this work kept on the device, and its texts set aside
/** @param {Draft[]} kept @param {string} repo */
export const draftsOf = (kept, repo) => ({
  drafts: new Map(kept.filter(d => d.repo === repo && !d.parked).map(d => [d.path, d])),
  parked: kept.filter(d => d.repo === repo && d.parked),
});
// why a text set aside cannot be sent now ('' it can): a draft at its place not sent yet
/** @param {'send' | 'put' | 'drop'} how @param {boolean} draft */
export const unparkRefusal = (how, draft) =>
  how === 'send' && draft ? 'その場所には、まだ送っていない書きかけがあります。「送る」で送ってから、もう一度押してください' : '';
// a text set aside sent: beside what is there now (none there: as it is)
/** @param {string} text @param {string} there '' none */
export const unparkText = (text, there) => (there ? keptBoth(text, there).text : text);
// what a text set aside sent says
/** @param {number} unsent left not sent */
export const unparkSentSaid = unsent => (unsent ? '送信できませんでした。書いたものはこの端末に残っています' : '送信しました。GitHub の版と並べて残しています');
