// The plot note read as boxes, and how its boxes go with episodes and chapters (no screen, no state of the app: tested by itself in tests/unit).
// From the server version's public/lib/plot.js; the episodes a 中箱 is written into, from ui/plot.js
import { esc, n } from './format.js';

/** @typedef {{ head: string, body: string[] }} Card a 中箱: its heading and its lines */
/** @typedef {{ head: string, body: string[], cards: Card[], bare?: boolean }} Group a 大箱 (bare: no heading of its own) */
/** @typedef {{ pre: string[], groups: Group[] }} Plot the plot note: the lines before any box, and the 大箱 */
/** @typedef {{ type: string, title: string, path: string }} Item an item of a work's table of contents */

/** @param {string} text @returns {Plot} */
export function parsePlot(text) {
  /** @type {Plot} */
  const plot = { pre: [], groups: [] };
  /** @type {Group | null} */
  let group = null,
    /** @type {Card | null} */
    card = null,
    fence = false;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const h1 = !fence && /^#\s+(.*)$/.exec(line),
      h2 = !fence && /^##\s+(.*)$/.exec(line);
    if (h1) {
      group = { head: h1[1].trim(), body: [], cards: [] };
      card = null;
      plot.groups.push(group);
      continue;
    }
    if (h2) {
      // a 中箱 before any 大箱: a 大箱 with no heading holds it
      if (!group) {
        group = { head: '', body: [], cards: [], bare: true };
        plot.groups.push(group);
      }
      card = { head: h2[1].trim(), body: [] };
      group.cards.push(card);
      continue;
    }
    (card ? card.body : group ? group.body : plot.pre).push(line);
  }
  return plot;
}
/** @param {Plot} plot */
export function writePlot(plot) {
  const lines = [...plot.pre];
  for (const g of plot.groups) {
    if (!g.bare) lines.push(`# ${g.head}`);
    lines.push(...g.body);
    for (const c of g.cards) lines.push(`## ${c.head}`, ...c.body);
  }
  return lines.join('\n');
}
// a 中箱's short name: 「中箱1-1：前世の終わり」 → 「中箱1-1」 (a link still finds it when the rest is rewritten)
/** @type {(head: string) => string} */
export const boxId = head => head.split(/[：:]/)[0].trim();
/** @param {Plot | null | undefined} plot @param {string | null | undefined} box */
export function findCard(plot, box) {
  if (!plot || !box) return null;
  const all = plot.groups.flatMap((g, gi) => g.cards.map((c, ci) => ({ g, c, gi, ci })));
  return all.find(x => x.c.head === box) || (boxId(box) !== box.trim() ? all.find(x => boxId(x.c.head) === boxId(box)) : null) || null;
}

/** @type {(head: string, title: string | null | undefined) => boolean} */
export const sameTitle = (head, title) => {
  // a note in （） at the end of the heading is not part of the title: 「桜並木（最終話）」 goes with 「桜並木」
  /** @type {(s: string) => string} */
  const bare = s =>
    s
      .replace(/^第[\d０-９]+話[\s　]*/, '')
      .replace(/[\s　]+/g, ' ')
      .trim();
  /** @type {(s: string) => string} */
  const noNote = s => bare(s).replace(/\s*[（(][^（()）]*[）)]$/, '');
  return !!title && (head.trim() === title.trim() || (bare(head) !== '' && (bare(head) === bare(title) || noNote(head) === bare(title))));
};
// a chapter for a 大箱: the one whose title is in its heading (「大箱2：承①「入学と運命の出会い」」 → 入学と運命の出会い)
/** @template {Item} T @param {T[]} items @param {string} groupHead @returns {T | null} */
export function chapterFor(items, groupHead) {
  const chapters = items.filter(it => it.type === 'chapter');
  const name = (/「(.+)」/.exec(groupHead)?.[1] || groupHead.replace(/^大箱[\d０-９]+[：:]?\s*/, '')).trim();
  return chapters.find(c => c.title === name) || chapters.find(c => name && (c.title.includes(name) || groupHead.includes(c.title))) || null;
}
// the Markdown marks at the head of a line and around words go; a 「-」 inside a word (2026-10-15) stays
// the whole text of a box, line by line (a list item keeps a 「・」); blank lines in a row become one
/** @type {(lines: string[]) => string} */
export const plain = lines =>
  lines
    .filter(l => !/^\s*\|?[\s:|-]+$/.test(l))
    .map(l =>
      l
        .replace(/^\s*[-*+]\s+/, '・')
        .replace(/^\s*(?:#+|>+)\s+/, '')
        .replace(/\*\*|`/g, '')
        .replace(/\s*\|\s*/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .trimEnd(),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// the line of a box's heading in the plot note (the lines are kept one for one by parsePlot and writePlot)
/** @param {Plot} plot @param {'g' | 'c'} kind a 大箱 or a 中箱 @param {number} gi @param {number} [ci] */
export function boxLine(plot, kind, gi, ci) {
  let at = plot.pre.length;
  for (const [i, g] of plot.groups.entries()) {
    if (kind === 'g' && i === gi) return at;
    at += (g.bare ? 0 : 1) + g.body.length;
    for (const [j, c] of g.cards.entries()) {
      if (i === gi && j === ci) return at;
      at += 1 + c.body.length;
    }
  }
  return 0;
}
// a box is written in the plot note itself, on the same page as any other note, with the caret on its heading
// the lines of a box in the plot note: a 中箱 is its heading and text, a 大箱 its heading, text and 中箱
/** @param {Plot} plot @param {'g' | 'c'} kind @param {number} gi @param {number} [ci] @returns {[number, number]} */
export function boxRange(plot, kind, gi, ci) {
  const start = boxLine(plot, kind, gi, ci),
    g = plot.groups[gi];
  const len =
    kind === 'g' ? (g.bare ? 0 : 1) + g.body.length + g.cards.reduce((n, c) => n + 1 + c.body.length, 0) : 1 + g.cards[/** @type {number} */ (ci)].body.length;
  return [start, start + len];
}

/** @typedef {{ path: string, rel: string, title: string }} Linked an episode as the plot goes with it (rel: its path from the manuscript folder) */
// The plot's note: novel.toml [plot] file, else the note whose name or title says プロット or plot ('' none)
/** @param {string} file [plot] file @param {{ path: string, name: string, title?: string }[]} notes */
export const plotPathOf = (file, notes) => file || notes.find(f => /プロット|plot/i.test(`${f.name} ${f.title || ''}`))?.path || '';
// The episodes written from a 中箱 (FR-PLOT-04): the ones linked to it ([plot.links], by heading, or by 「中箱1-1」 when
// the rest was rewritten), then the ones with no link whose title matches its heading
/** @template {Linked} T @param {Plot} plot @param {Card} card @param {Record<string, string>} links by rel @param {T[]} episodes @returns {T[]} */
export function episodesFor(plot, card, links, episodes) {
  const linked = episodes.filter(e => links[e.rel] !== undefined && findCard(plot, links[e.rel])?.c === card);
  const matched = episodes.filter(e => links[e.rel] === undefined && sameTitle(card.head, e.title));
  return [...linked, ...matched];
}
// The 中箱 of an episode (FR-PLOT-06): its link, else the 中箱 its title matches (undefined: none)
/** @param {Plot} plot @param {Linked} episode @param {Record<string, string>} links */
export const boxFor = (plot, episode, links) => links[episode.rel] ?? plot.groups.flatMap(g => g.cards).find(c => sameTitle(c.head, episode.title))?.head;
// The plot's note made new (FR-PLOT-08)
export const NEW_PLOT = '# プロット\n\n# 大箱1：起\n\n## 中箱1-1：\n';

// --- the boxes on the screen (ui/plot.js), and one written by itself (ui/notes.js)

// A box written by itself (FR-PLOT-03): its lines in the note, and the name over them, found again by its heading
// (`want`); null when its first line is not that heading (the part before the first 大箱, or the note changed)
/** @param {string} text @param {'g' | 'c'} kind @param {number} gi @param {number | undefined} ci @param {string} want */
export function boxLines(text, kind, gi, ci, want) {
  const lines = text.split('\n');
  const [start, end] = boxRange(parsePlot(text), kind, gi, ci);
  if (!/^#{1,2}\s/.test(lines[start]) || lines[start].replace(/^#{1,2}\s+/, '').trim() !== want) return null;
  return { start, end, name: want.replace(/^大箱[\d０-９]+[：:]\s*/, '') };
}

// No plot note: said, with the button to make one (FR-PLOT-08)
export const PLOT_EMPTY =
  '<p class="muted small">プロットの資料がありません。「# 大箱」「## 中箱」の見出しで書いた資料が、ここで箱になります。</p><button id="plot-new">プロットを作成</button>';
/** @typedef {Linked & { chars: number }} BoardEpisode */
// A box's tools: ↑ (not on the first), ↓ (not on the last), 編集, and 削除 behind ⋯ (away from 編集)
/** @param {string} kind 'g' or 'c' @param {string | number} at @param {number} count @param {number} i */
const boxTools = (kind, at, count, i) =>
  `<span class="pbox-tools"><button class="ghost" data-up="${kind}:${at}" ${i === 0 ? 'disabled' : ''} title="上へ" aria-label="上へ">↑</button><button class="ghost" data-down="${kind}:${at}" ${i === count - 1 ? 'disabled' : ''} title="下へ" aria-label="下へ">↓</button><button class="ghost" data-edit="${kind}:${at}">編集</button><button class="ghost more-tools" data-more-tools title="ほかの操作" aria-label="ほかの操作">⋯</button><button class="ghost danger" data-remove="${kind}:${at}" title="この箱を削除" aria-label="この箱を削除" hidden>削除</button></span>`;
/**
 * The boxes (FR-PLOT-01): each 大箱 folded or open (`folded`: by heading), its text, its 中箱 and the button to add one;
 * each 中箱 with its text and the episodes written from it (FR-PLOT-04), or the button to make one from it (FR-PLOT-05);
 * the button to add a 大箱 last
 * @param {Plot} plot @param {Set<string>} folded @param {Record<string, string>} links [plot.links] @param {BoardEpisode[]} episodes
 */
export function plotBoardHtml(plot, folded, links, episodes) {
  /** @type {(g: Group, gi: number, c: Card, ci: number) => string} */
  const card = (g, gi, c, ci) => {
    const eps = episodesFor(plot, c, links, episodes);
    return `<div class="pcard"><div class="pcard-head"><b>${esc(c.head)}</b>${boxTools('c', `${gi}:${ci}`, g.cards.length, ci)}</div>${
      plain(c.body) ? `<p class="pcard-sum">${esc(plain(c.body))}</p>` : ''
    }<div class="pcard-eps">${eps.map(e => `<button class="ep-chip" data-open="${esc(e.path)}">${esc(e.title)} <small>${n(e.chars)} 字</small></button>`).join('')}${
      eps.length ? '' : `<button class="ghost small" data-write="${gi}:${ci}" title="この中箱の見出しを題名にして、新しい話を作成">新しい話を作成</button>`
    }</div></div>`;
  };
  return (
    plot.groups
      .map(
        (g, gi) =>
          `<details class="pgroup" ${folded.has(g.head) ? '' : 'open'} data-g="${gi}"><summary>${boxTools('g', gi, plot.groups.length, gi)}${esc(g.bare ? '（見出しの前）' : g.head)} <small>${g.cards.length} 箱</small></summary>${
            plain(g.body) ? `<p class="pcard-sum">${esc(plain(g.body))}</p>` : ''
          }<div class="pcards">${g.cards.map((c, ci) => card(g, gi, c, ci)).join('')}</div><button class="ghost small" data-add-card="${gi}">中箱を追加</button></details>`,
      )
      .join('') + '<button class="plot-add-group" id="plot-add-group">大箱を追加</button>'
  );
}
// a box named by its button: 「g:<大箱>」 or 「c:<大箱>:<中箱>」
/** @param {string} spec @returns {['g' | 'c', number, number]} */
export const parseSpec = spec => /** @type {['g' | 'c', number, number]} */ (spec.split(':').map((x, i) => (i ? Number(x) : x)));
// a box's heading
/** @param {Plot} plot @param {'g' | 'c'} kind @param {number} gi @param {number} ci */
export const boxHead = (plot, kind, gi, ci) => (kind === 'g' ? plot.groups[gi].head : plot.groups[gi].cards[ci].head);
// the title of an episode made from a 中箱 (FR-PLOT-05): its heading without 「中箱N-M：」 (all of it when nothing is left)
/** @param {string} head */
export const cardTitle = head => head.replace(/^中箱[\d０-９\-－]+[：:]?\s*/, '') || head;
// The chapter an episode made from a 中箱 goes in: the one its 大箱 names (lib/plot.js chapterFor); none when the work has
// no chapters (''); undefined when none is named (the author is asked)
/** @param {Item[]} items the table of contents, titled @param {string} groupHead */
export const chapterOf = (items, groupHead) => (items.some(it => it.type === 'chapter') ? chapterFor(items, groupHead)?.path : '');
// a 大箱 numbered 「大箱N」
/** @param {Group} g */
const numbered = g => /^大箱[\d０-９]+/.test(g.head);
// the heading a new 大箱 is offered: the next number
/** @param {Plot} plot */
export const nextGroupHead = plot => `大箱${plot.groups.filter(numbered).length + 1}：`;
// A new 大箱 (FR-PLOT-02): after the last 「大箱N」, before the sections that follow it (at the end when there is none)
/** @param {Plot} plot @param {string} head */
export function addGroup(plot, head) {
  const last = plot.groups.findLastIndex(numbered);
  plot.groups.splice(last < 0 ? plot.groups.length : last + 1, 0, { head, body: [''], cards: [] });
}
// the heading a new 中箱 is offered: 「中箱N-M：」 by its 大箱's number, else nothing
/** @param {Group} g */
export function nextCardHead(g) {
  const num = /^大箱([\d０-９]+)/.exec(g.head)?.[1];
  return num ? `中箱${num}-${g.cards.length + 1}：` : '';
}
// A box moved up (-1) or down (1) among its own (FR-PLOT-02); false when it cannot be: past the first or the last, or
// a 大箱 over the part before the first 大箱 (which stays first)
/** @param {Plot} plot @param {string} spec @param {number} by @returns {boolean} */
export function moveBox(plot, spec, by) {
  const [kind, gi, ci] = parseSpec(spec);
  const list = kind === 'g' ? plot.groups : plot.groups[gi].cards,
    at = kind === 'g' ? gi : ci,
    to = at + by;
  const groups = /** @type {Group[]} */ (list);
  if (to < 0 || to >= list.length || (kind === 'g' && (groups[to].bare || groups[at].bare))) return false;
  [list[at], list[to]] = [list[to], list[at]];
  return true;
}
// what is asked before a box is removed: a 大箱 with how many 中箱 go with it
/** @param {Plot} plot @param {string} spec */
export function removeAsk(plot, spec) {
  const [kind, gi, ci] = parseSpec(spec);
  const g = plot.groups[gi];
  const what = kind === 'g' ? g : g.cards[ci];
  return `「${what.head || '見出しの前'}」${kind === 'g' ? `と、その中の中箱 ${g.cards.length} 個` : ''}を削除しますか？（プロットの資料から削除します。対応している話は残ります）`;
}
// a box removed (FR-PLOT-02), with the 中箱 in it
/** @param {Plot} plot @param {string} spec */
export function removeBox(plot, spec) {
  const [kind, gi, ci] = parseSpec(spec);
  if (kind === 'g') plot.groups.splice(gi, 1);
  else plot.groups[gi].cards.splice(ci, 1);
}
// the button ⋯ that shows 削除: × while it is shown
/** @param {boolean} hidden 削除 hidden */
export const toolsLabel = hidden => (hidden ? '⋯' : '×');
// The 中箱 of the open episode, over its text (FR-PLOT-06): found (its heading, its text as read: `html`), or not
// (the 中箱 linked not found, or none), with the button to choose one
/** @param {{ c: Card } | null} found @param {string | undefined} box the one it goes with @param {string} html */
export const plotPanelHtml = (found, box, html) =>
  found
    ? `<div class="plot-panel-head"><b>${esc(found.c.head)}</b><span class="grow"></span><button class="ghost small" data-plot-pick>中箱を変更</button><button class="ghost small" data-plot-open>プロット</button></div><div class="preview plot-panel-body">${html}</div>`
    : `<div class="plot-panel-head"><span class="muted small">${box ? `中箱「${esc(box)}」が見つかりません` : 'この話に対応するプロットの中箱はありません'}</span><span class="grow"></span><button class="ghost small" data-plot-pick>中箱を選択</button></div>`;
// The 中箱 offered to the open episode: every one, and, when it goes with one, the way to take it away (FR-PLOT-04)
export const UNLINK = '（対応を解除）';
/** @param {Plot} plot @param {string} current the one it goes with ('' none) */
export const boxChoices = (plot, current) => [...plot.groups.flatMap(g => g.cards.map(c => c.head)), ...(current ? [UNLINK] : [])];
// the 中箱 chosen, as [plot.links] takes it ('' taken away)
/** @param {string} chosen */
export const linkOf = chosen => (chosen === UNLINK ? '' : chosen);
// A double tap on a box (iPhone): the same box's 編集, within 400 ms and 30 px of the tap before
/** @param {{ edit: string, at: number, x: number, y: number } | null} last @param {{ edit: string, at: number, x: number, y: number }} now */
export const doubleTap = (last, now) => last !== null && last.edit === now.edit && now.at - last.at < 400 && Math.hypot(now.x - last.x, now.y - last.y) < 30;
// the 中箱 the open episode goes with, by its heading ('' none: no episode open, or none found)
/** @param {Plot} plot @param {Linked | undefined} episode @param {Record<string, string>} links */
export const currentBox = (plot, episode, links) => (episode && findCard(plot, boxFor(plot, episode, links))?.c.head) || '';
// the text of a 中箱 found ('' none)
/** @param {{ c: Card } | null} found */
export const foundBody = found => (found ? found.c.body.join('\n') : '');
