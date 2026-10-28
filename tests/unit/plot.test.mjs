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
  boxLines,
  addGroup,
  boxChoices,
  boxHead,
  cardTitle,
  chapterOf,
  currentBox,
  doubleTap,
  foundBody,
  linkOf,
  moveBox,
  nextCardHead,
  nextGroupHead,
  parseSpec,
  PLOT_EMPTY,
  plotBoardHtml,
  plotPanelHtml,
  removeAsk,
  removeBox,
  toolsLabel,
  UNLINK,
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

// FR-PLOT-03: a box written by itself, found again by its heading
test('boxLines: a 大箱 (its name without 「大箱N：」), a 中箱; not when its first line is not that heading', () => {
  expect(boxLines(PLOT, 'g', 0, undefined, '大箱1：起「入学」')).toEqual({ start: 1, end: 9, name: '起「入学」' });
  expect(boxLines(PLOT, 'c', 0, 0, '中箱1-1：題')).toEqual({ start: 3, end: 8, name: '中箱1-1：題' });
  expect(boxLines(PLOT, 'c', 0, 0, '中箱1-1：別の題')).toBe(null);
  expect(boxLines('前書き\n# 大箱1', 'g', 0, undefined, '')).toBe(null);
});

// FR-PLOT-01, FR-PLOT-02, FR-PLOT-04, FR-PLOT-05: the boxes on the screen
describe('the boxes on the screen', () => {
  const text = '## 前の箱\n# 大箱1：起\n説明<\n## 中箱1-1：出会い\n本文\n## 中箱1-2：別れ\n# 付録\n';
  test('plotBoardHtml: the 大箱 folded or open, their tools (not up from the first, not down from the last), the 中箱 with their episodes or the button to make one', () => {
    const plot = parsePlot(text);
    const html = plotBoardHtml(plot, new Set(['付録']), { '01.md': '中箱1-1：出会い' }, [{ path: 'ms/01.md', rel: '01.md', title: '一<', chars: 1200 }]);
    expect(html).toContain('<details class="pgroup" open data-g="0"><summary><span class="pbox-tools"><button class="ghost" data-up="g:0" disabled');
    expect(html).toContain('（見出しの前） <small>1 箱</small>');
    expect(html).toContain('<details class="pgroup"  data-g="2">');
    expect(html).toContain('data-down="g:2" disabled');
    expect(html).toContain('大箱1：起 <small>2 箱</small></summary><p class="pcard-sum">説明&lt;</p>');
    expect(html).toContain('<button class="ep-chip" data-open="ms/01.md">一&lt; <small>1,200 字</small></button>');
    expect(html).toContain('data-write="1:1" title="この中箱の見出しを題名にして、新しい話を作成">新しい話を作成</button>');
    expect(html).not.toContain('data-write="1:0"');
    expect(html).toContain('<b>中箱1-1：出会い</b><span class="pbox-tools"><button class="ghost" data-up="c:1:0" disabled');
    expect(html).toContain('data-remove="c:1:1" title="この箱を削除" aria-label="この箱を削除" hidden>削除</button>');
    expect(html).toContain('<p class="pcard-sum">本文</p>');
    expect(html).toContain('<button class="ghost small" data-add-card="1">中箱を追加</button>');
    expect(html.endsWith('<button class="plot-add-group" id="plot-add-group">大箱を追加</button>')).toBe(true);
    expect(PLOT_EMPTY).toContain('<button id="plot-new">プロットを作成</button>');
  });
  test('parseSpec, boxHead: a box by its button; its heading', () => {
    const plot = parsePlot(text);
    expect(parseSpec('g:1')).toEqual(['g', 1]);
    expect(parseSpec('c:1:0')).toEqual(['c', 1, 0]);
    expect(boxHead(plot, 'g', 1, 0)).toBe('大箱1：起');
    expect(boxHead(plot, 'c', 1, 1)).toBe('中箱1-2：別れ');
  });
  test('cardTitle, chapterOf: an episode from a 中箱, titled by its heading, in the chapter its 大箱 names (or asked)', () => {
    expect(cardTitle('中箱1-2：別れ')).toBe('別れ');
    expect(cardTitle('中箱１－２')).toBe('中箱１－２');
    expect(cardTitle('伏線')).toBe('伏線');
    const items = [
      { type: 'chapter', title: '入学', path: 'ms/1_入学' },
      { type: 'episode', title: '一', path: 'ms/1_入学/01.md' },
    ];
    expect(chapterOf(items, '大箱1：起「入学」')).toBe('ms/1_入学');
    expect(chapterOf(items, '大箱2：承')).toBeUndefined();
    expect(chapterOf([items[1]], '大箱2：承')).toBe('');
  });
  test('nextGroupHead, addGroup: the next number; after the last 「大箱N」, else at the end', () => {
    const plot = parsePlot(text);
    expect(nextGroupHead(plot)).toBe('大箱2：');
    addGroup(plot, '大箱2：承');
    expect(plot.groups.map(g => g.head)).toEqual(['', '大箱1：起', '大箱2：承', '付録']);
    const none = parsePlot('# 付録\n');
    expect(nextGroupHead(none)).toBe('大箱1：');
    addGroup(none, '大箱1：起');
    expect(writePlot(none)).toBe('# 付録\n\n# 大箱1：起\n');
  });
  test('nextCardHead: by its 大箱’s number, else nothing', () => {
    const plot = parsePlot(text);
    expect(nextCardHead(plot.groups[1])).toBe('中箱1-3：');
    expect(nextCardHead(plot.groups[2])).toBe('');
  });
  test('moveBox: among its own; not past either end; the part before the first 大箱 stays first', () => {
    const plot = parsePlot(text);
    expect(moveBox(plot, 'c:1:0', 1)).toBe(true);
    expect(plot.groups[1].cards.map(c => c.head)).toEqual(['中箱1-2：別れ', '中箱1-1：出会い']);
    expect(moveBox(plot, 'c:1:1', 1)).toBe(false);
    expect(moveBox(plot, 'c:1:0', -1)).toBe(false);
    expect(moveBox(plot, 'g:1', -1)).toBe(false);
    expect(moveBox(plot, 'g:0', 1)).toBe(false);
    expect(moveBox(plot, 'g:1', 1)).toBe(true);
    expect(plot.groups.map(g => g.head)).toEqual(['', '付録', '大箱1：起']);
  });
  test('removeAsk, removeBox: a 大箱 with its 中箱, a 中箱, the part before the first', () => {
    const plot = parsePlot(text);
    expect(removeAsk(plot, 'g:1')).toBe('「大箱1：起」と、その中の中箱 2 個を削除しますか？（プロットの資料から削除します。対応している話は残ります）');
    expect(removeAsk(plot, 'c:1:0')).toBe('「中箱1-1：出会い」を削除しますか？（プロットの資料から削除します。対応している話は残ります）');
    expect(removeAsk(plot, 'g:0')).toContain('「見出しの前」と、その中の中箱 1 個を');
    removeBox(plot, 'c:1:0');
    expect(plot.groups[1].cards.map(c => c.head)).toEqual(['中箱1-2：別れ']);
    removeBox(plot, 'g:1');
    expect(plot.groups.map(g => g.head)).toEqual(['', '付録']);
  });
  test('toolsLabel: ⋯ while 削除 is hidden, × while shown', () => {
    expect(toolsLabel(true)).toBe('⋯');
    expect(toolsLabel(false)).toBe('×');
  });
});

// FR-PLOT-04, FR-PLOT-06: the 中箱 of the open episode
describe('the 中箱 of the open episode', () => {
  const plot = parsePlot('# 大箱1：起\n## 中箱1-1：出会い\n本文<\n## 中箱1-2：別れ\n');
  test('plotPanelHtml, foundBody: found, with its text; not found, said; none', () => {
    const found = findCard(plot, '中箱1-1：出会い');
    expect(foundBody(found)).toBe('本文<');
    expect(foundBody(null)).toBe('');
    expect(plotPanelHtml(found, '中箱1-1：出会い', '<p>本文</p>')).toBe(
      '<div class="plot-panel-head"><b>中箱1-1：出会い</b><span class="grow"></span><button class="ghost small" data-plot-pick>中箱を変更</button><button class="ghost small" data-plot-open>プロット</button></div><div class="preview plot-panel-body"><p>本文</p></div>',
    );
    expect(plotPanelHtml(null, '中箱9<', '')).toContain('中箱「中箱9&lt;」が見つかりません');
    expect(plotPanelHtml(null, undefined, '')).toContain(
      'この話に対応するプロットの中箱はありません</span><span class="grow"></span><button class="ghost small" data-plot-pick>中箱を選択</button>',
    );
  });
  test('currentBox, boxChoices, linkOf: the one it goes with; every 中箱, and the way to take it away; taken away', () => {
    const ep = { path: 'ms/02.md', rel: '02.md', title: '別れ' };
    expect(currentBox(plot, ep, { '02.md': '中箱1-1：出会い' })).toBe('中箱1-1：出会い');
    expect(currentBox(plot, ep, { '02.md': '中箱9：無い' })).toBe('');
    expect(currentBox(plot, undefined, {})).toBe('');
    expect(boxChoices(plot, '中箱1-1：出会い')).toEqual(['中箱1-1：出会い', '中箱1-2：別れ', UNLINK]);
    expect(boxChoices(plot, '')).toEqual(['中箱1-1：出会い', '中箱1-2：別れ']);
    expect(linkOf(UNLINK)).toBe('');
    expect(linkOf('中箱1-2：別れ')).toBe('中箱1-2：別れ');
  });
  // FR-PLOT-03: a double tap on a box opens it
  test('doubleTap: the same box within 400 ms and 30 px', () => {
    const last = { edit: 'c:0:0', at: 1000, x: 10, y: 10 };
    expect(doubleTap(last, { edit: 'c:0:0', at: 1399, x: 30, y: 20 })).toBe(true);
    expect(doubleTap(null, { edit: 'c:0:0', at: 1399, x: 10, y: 10 })).toBe(false);
    expect(doubleTap(last, { edit: 'c:0:1', at: 1100, x: 10, y: 10 })).toBe(false);
    expect(doubleTap(last, { edit: 'c:0:0', at: 1400, x: 10, y: 10 })).toBe(false);
    expect(doubleTap(last, { edit: 'c:0:0', at: 1100, x: 40, y: 10 })).toBe(false);
  });
});
