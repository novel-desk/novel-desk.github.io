// The plot note read as boxes, and how its boxes go with episodes and chapters (no screen, no state of the app: tested by itself in tests/unit).
// From the server version's public/lib/plot.js; the episodes a 中箱 is written into, from ui/plot.js
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
