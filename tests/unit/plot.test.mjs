import { describe, test, expect } from 'vitest';
import {
  parsePlot,
  writePlot,
  boxId,
  findCard,
  sameTitle,
  chapterFor,
  plain,
  boxLine,
  boxRange,
  plotPathOf,
  episodesFor,
  boxFor,
  NEW_PLOT,
} from '../../lib/plot.js';

const PLOT = [
  '前書き',
  '# 大箱1：起「入学」',
  '大箱1の説明',
  '## 中箱1-1：題',
  '本文',
  '```',
  '# フェンスの中',
  '```',
  '## 中箱1-2：',
  '# 大箱2：承',
  '## 伏線',
].join('\n');

describe('plot', () => {
  test('parsePlot, writePlot: boxes from the headings, line for line; a fence is not a heading', () => {
    const plot = parsePlot(PLOT);
    expect(plot.pre).toEqual(['前書き']);
    expect(plot.groups.map(g => g.head)).toEqual(['大箱1：起「入学」', '大箱2：承']);
    expect(plot.groups[0].cards.map(c => c.head)).toEqual(['中箱1-1：題', '中箱1-2：']);
    expect(plot.groups[0].cards[0].body).toEqual(['本文', '```', '# フェンスの中', '```']);
    expect(writePlot(plot)).toBe(PLOT);
    // a 中箱 before any 大箱: a 大箱 with no heading holds it
    const bare = parsePlot('## 先\n本文\n# 後');
    expect(bare.groups[0].bare).toBe(true);
    expect(writePlot(bare)).toBe('## 先\n本文\n# 後');
  });
  test('boxId, findCard: a 中箱 by its heading, or by 「中箱1-1」 when the rest was rewritten', () => {
    const plot = parsePlot('# A\n## 中箱1-1：題\n本文');
    expect(boxId('中箱1-1：前世の終わり')).toBe('中箱1-1');
    expect(findCard(null, 'x')).toBe(null);
    expect(findCard(plot, '')).toBe(null);
    expect(findCard(plot, '中箱1-1：題')?.ci).toBe(0);
    expect(findCard(plot, '中箱1-1：別の題')?.ci).toBe(0);
    expect(findCard(plot, 'なし')).toBe(null);
  });
  test('sameTitle: 「第N話」 and a note in （） at the end do not count', () => {
    expect([
      sameTitle('第24話　桜並木', '桜並木'),
      sameTitle('桜並木（最終話）', '桜並木'),
      sameTitle('桜', ''),
      sameTitle('第1話', '第1話'),
      sameTitle('第1話', '別'),
      sameTitle('x', 'y'),
    ]).toEqual([true, true, false, true, false, false]);
  });
  test("chapterFor: the chapter named in the 大箱's 「」, or whose title is in its heading", () => {
    const items = [
      { type: 'chapter', title: '入学と運命の出会い' },
      { type: 'chapter', title: 'ダリウス編' },
      { type: 'episode', title: 'ダリウス編' },
    ];
    expect([
      chapterFor(items, '大箱2：承①「入学と運命の出会い」')?.title,
      chapterFor(items, '大箱2：ダリウス')?.title,
      chapterFor(items, 'ダリウス編の続き')?.title,
      chapterFor(items, '大箱9：'),
    ]).toEqual(['入学と運命の出会い', 'ダリウス編', 'ダリウス編', null]);
  });
  test('plain: the Markdown marks go; a list item keeps a 「・」; a table its words; blank lines in a row become one', () => {
    expect(plain(['| a |', '|---|', '  * 一', '### 見出し', '', '', '', '後'])).toBe('a\n・一\n見出し\n\n後');
    expect(plain(['**太字** と `code`', '> 引用', 'ハイ-フン'])).toBe('太字 と code\n引用\nハイ-フン');
  });
  test('boxLine, boxRange: where a box is in the note, and its lines', () => {
    const plot = parsePlot(PLOT);
    expect(boxLine(plot, 'g', 0)).toBe(1);
    expect(boxLine(plot, 'c', 0, 1)).toBe(8);
    expect(boxLine(plot, 'g', 1)).toBe(9);
    expect(boxLine(plot, 'c', 9, 0)).toBe(0);
    expect(boxRange(plot, 'g', 0)).toEqual([1, 9]);
    expect(boxRange(plot, 'c', 0, 0)).toEqual([3, 8]);
    expect(boxRange(parsePlot('## 先\n本文'), 'g', 0)).toEqual([0, 2]);
    // a 中箱 in a 大箱 with no heading
    expect(boxLine(parsePlot('## 先\n本文\n# 後'), 'c', 0, 0)).toBe(0);
    expect(boxLine(parsePlot('## 先\n本文\n# 後'), 'g', 1)).toBe(2);
  });
});

// FR-PLOT-04, FR-PLOT-06, FR-PLOT-08: the plot's note, and the episodes of a 中箱
describe('the plot and the episodes', () => {
  const plot = parsePlot('# 大箱1：起\n## 中箱1-1：出会い\n## 中箱1-2：桜並木\n## 中箱1-3：別れ\n');
  const eps = [
    { path: 'ms/01.md', rel: '01.md', title: '一話' },
    { path: 'ms/02.md', rel: '02.md', title: '中箱1-2：桜並木' },
    { path: 'ms/03.md', rel: '03.md', title: '中箱1-3：別れ' },
  ];
  const links = { '01.md': '中箱1-1：出会いの朝', '03.md': '中箱1-1：出会い' };
  test('plotPathOf: [plot] file, else the note named so, else none', () => {
    const notes = [
      { path: 'notes/a.md', name: 'a.md' },
      { path: 'notes/b.md', name: 'b.md', title: 'プロット' },
    ];
    expect(plotPathOf('notes/x.md', notes)).toBe('notes/x.md');
    expect(plotPathOf('', notes)).toBe('notes/b.md');
    expect(plotPathOf('', [{ path: 'notes/a.md', name: 'a.md' }])).toBe('');
  });
  test('episodesFor: the linked (by heading or by its short name) first, then the unlinked of the same title', () => {
    const [c1, c2, c3] = plot.groups[0].cards;
    expect(episodesFor(plot, c1, links, eps).map(e => e.rel)).toEqual(['01.md', '03.md']);
    expect(episodesFor(plot, c2, links, eps).map(e => e.rel)).toEqual(['02.md']);
    expect(episodesFor(plot, c3, links, eps)).toEqual([]);
  });
  test('boxFor: the link, else the 中箱 of the same title, else none', () => {
    expect(boxFor(plot, eps[0], links)).toBe('中箱1-1：出会いの朝');
    expect(boxFor(plot, eps[1], links)).toBe('中箱1-2：桜並木');
    expect(boxFor(plot, { path: 'x', rel: 'x', title: '無関係' }, {})).toBeUndefined();
    expect(parsePlot(NEW_PLOT).groups.map(g => g.cards.length)).toEqual([0, 1]);
  });
});
