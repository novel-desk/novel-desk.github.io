import { describe, test, expect } from 'vitest';
import * as e from '../../lib/episodes.js';
import { firstLayout, headingsOf, tableOfContents } from '../../lib/layout.js';
import { foldersOf } from '../../lib/changes.js';

// a work as the screen has it: its files (path → text), and its layout
const shown = (files, over = {}) => {
  const layout = { ...firstLayout(), ...over };
  const paths = Object.keys(files);
  const toc = tableOfContents(layout, paths, foldersOf(paths));
  return { layout, toc, files: paths, headings: headingsOf(layout, toc, files), textOf: p => files[p] ?? null };
};

describe('names', () => {
  test('cleanTitle: no / \\ NUL or line breaks, not starting with a dot or a space, 80 characters and 240 bytes at most, 無題 when empty', () => {
    expect(e.cleanTitle(' .題/名\\a\nb  ')).toBe('題 名 a b');
    expect(e.cleanTitle('  ')).toBe('無題');
    expect([...e.cleanTitle('あ'.repeat(100))].length).toBe(80);
    expect(new TextEncoder().encode(e.cleanTitle('😀'.repeat(70))).length).toBe(240);
  });
  test('pad, width (2 digits at least), nextNumber up to 999999 (FR-TOC-02)', () => {
    expect(e.pad(7, 2)).toBe('07');
    expect([e.width(9), e.width(100)]).toEqual([2, 3]);
    expect(e.nextNumber(9)).toBe(10);
    expect(() => e.nextNumber(999999)).toThrow('これ以上は追加できません（番号の上限は 999999）');
  });
  test('renamedNumber, newName (the title in the name, or the number alone when it is kept elsewhere)', () => {
    expect(e.renamedNumber('07_駅で.md', 3, 3)).toBe('003_駅で.md');
    expect(e.renamedNumber('07.md', 12, 2)).toBe('12.md');
    expect(e.newName(firstLayout(), 3, 2, '題', true)).toBe('03_題.md');
    expect(e.newName({ ...firstLayout(), bare: true }, 3, 2, '題', false)).toBe('03');
    expect(e.newName({ ...firstLayout(), heading: true }, 3, 2, '題', true)).toBe('03.md');
  });
  test('nextHeadingNumber: one more than the heading before; none when it has no number, or the largest', () => {
    expect(e.nextHeadingNumber('# 第9話 駅\n')).toBe('第10話 ');
    expect(e.nextHeadingNumber('# 題だけ\n')).toBe('');
    expect(e.nextHeadingNumber('# 第三話 漢数字')).toBe('');
    expect(e.nextHeadingNumber('# 第999999話 最後')).toBe('');
    expect(e.nextHeadingNumber('本文だけ')).toBe('');
    expect(e.nextHeadingNumber(null)).toBe('');
  });
  test('withHeading: the title on the heading line, 第N話 kept; retitled: the number kept, null for a name with no title', () => {
    expect(e.withHeading('# 第1話 旧\n\n本文', '第1話', ' 新 ')).toBe('# 第1話 新\n\n本文');
    expect(e.withHeading('\n# 旧', '', '新')).toBe('\n# 新');
    expect(e.retitled('03_part/07_駅で.md', '改札')).toBe('03_part/07_改札.md');
    expect(e.retitled('03_part', '章')).toBe('03_章');
    expect(e.retitled('07.md', '改札')).toBeNull();
    expect(e.retitled('memo.md', '改札')).toBeNull();
  });
  test('movedTo, followedTitles, followedLinks: a chapter takes its episodes along, an episode moved itself wins', () => {
    const moved = [
      ['01_a', '02_a'],
      ['01_a/01_x.md', '05_x.md'],
    ];
    expect(e.movedTo('01_a/02_y.md', moved)).toBe('02_a/02_y.md');
    expect(e.movedTo('01_a/01_x.md', moved)).toBe('05_x.md');
    expect(e.movedTo('03.md', moved)).toBeNull();
    expect(e.followedTitles({ '01_a': '章', '01_a/01_x.md': 'x', '05_x.md': '古い', '09.md': '九' }, moved)).toEqual({
      '09.md': '九',
      '02_a': '章',
      '05_x.md': 'x',
    });
    expect(e.followedLinks({ '01_a/01_x.md': '箱', '01_a/02_y.md': '箱2', '09.md': '箱9' }, moved, ['09.md'])).toEqual({
      '05_x.md': '箱',
      '02_a/02_y.md': '箱2',
    });
  });
  test('trashStamp (Japan time), trashName: 日時_章_番号_題名, cut to fit a file name', () => {
    expect(e.trashStamp(Date.parse('2026-10-24T00:30:15Z'))).toBe('20261024T093015');
    const l = firstLayout();
    expect(e.trashName(l, '03_part/07_駅で.md', 'S', {})).toEqual({ stem: 'S_03_part_7_駅で', ext: '.md' });
    expect(e.trashName(l, '03_part', 'S', {})).toEqual({ stem: 'S_3_part', ext: '' });
    expect(e.trashName({ ...l, prefixed: true }, '2-09.md', 'S', {})).toEqual({ stem: 'S_2-09_第9話', ext: '.md' });
    const long = e.trashName(l, `01_${'題'.repeat(80)}/02_${'名'.repeat(80)}.md`, 'S', {});
    expect(new TextEncoder().encode(long.stem).length).toBeLessThanOrEqual(255 - 3 - 4);
  });
});

describe('adding (FR-TOC-02, FR-TOC-03)', () => {
  const files = { 'novel.toml': '', '01_はじまり.md': 'a', '02_part/01_x.md': 'b', '03_駅で.md': 'c', 'memo.txt': '' };
  test('an episode at the end of the top, its title in its name', () => {
    expect(e.addEpisode(shown(files), '', '新しい話')).toEqual({
      moves: [],
      writes: [{ path: '04_新しい話.md', text: '' }],
      edits: [],
      path: '04_新しい話.md',
    });
  });
  test('an episode at the end of a chapter; a chapter not there is refused', () => {
    expect(e.addEpisode(shown(files), '02_part', '話').path).toBe('02_part/02_話.md');
    expect(() => e.addEpisode(shown(files), '03_駅で.md', '話')).toThrow('章が見つかりません');
    // (a chapter's folder not there yet: the episode makes it, as the server version's create_dir_all)
    expect(e.addEpisode(shown(files), '05_new', '話').path).toBe('05_new/01_話.md');
    expect(() => e.addEpisode(shown(files), 'zz/a', '話')).toThrow('章が見つかりません');
  });
  test('one more digit needed: the others renamed first (99 → 099 …), their titles following', () => {
    const many = Object.fromEntries(Array.from({ length: 99 }, (_, i) => [`ms/${e.pad(i + 1, 2)}.md`, '']));
    const w = shown(many, { dir: 'ms', bare: true, titles: { '99.md': '九十九' } });
    const plan = e.addEpisode(w, '', '百');
    expect(plan.moves).toHaveLength(99);
    expect(plan.moves[98]).toEqual(['ms/99.md', 'ms/099.md']);
    expect(plan.writes).toEqual([{ path: 'ms/100.md', text: '' }]);
    expect(plan.edits).toEqual([
      { key: ['titles', '99.md'], value: null },
      { key: ['titles', '099.md'], value: '九十九' },
      { key: ['titles', '100.md'], value: '百' },
    ]);
  });
  test('title = "heading": the heading numbered on from the episode before', () => {
    const w = shown({ '01.md': '# 第1話 一\n', '02.md': '# 第2話 二\n' }, { heading: true });
    expect(e.addEpisode(w, '', '三').writes).toEqual([{ path: '03.md', text: '# 第3話 三\n\n' }]);
    expect(e.addEpisode(shown({}, { heading: true }), '', '最初').writes).toEqual([{ path: '01.md', text: '# 最初\n\n' }]);
  });
  test('the name taken (a file of another kind): refused', () => {
    expect(() => e.addEpisode(shown({ '01_a.md': '', '02_新しい話.md/x': '' }), '', '新しい話')).toThrow('同じ名前があります');
  });
  test('a chapter at the end with one new episode; its title in [titles] when names hold no titles', () => {
    expect(e.addChapter(shown(files), '第二部')).toEqual({
      moves: [],
      writes: [{ path: '04_第二部/01_新しい話.md', text: '' }],
      edits: [],
      path: '04_第二部/01_新しい話.md',
    });
    const bare = e.addChapter(shown({ '01.md': '' }, { bare: true }), '章');
    expect(bare.writes[0].path).toBe('02/01.md');
    expect(bare.edits).toEqual([
      { key: ['titles', '02'], value: '章' },
      { key: ['titles', '02/01.md'], value: '新しい話' },
    ]);
    expect(e.addChapter(shown({}), '最初の章').path).toBe('01_最初の章/01_新しい話.md');
    expect(() => e.addChapter(shown({ '01_a.md': '', '02_章': '' }), '章')).toThrow('同じ名前があります');
  });
  test('the chapter-number naming: 「2-10.md」, the numbers running on across chapters, the prefix kept', () => {
    const l = { prefixed: true, bare: true };
    const w = shown({ '01.md': '', '02.md': '', '2-03.md': '' }, l);
    expect(e.addEpisode(w, '', '新')).toEqual({
      moves: [],
      writes: [{ path: '2-04.md', text: '' }],
      edits: [{ key: ['titles', '2-04.md'], value: '新' }],
      path: '2-04.md',
    });
    expect(e.addEpisode(w, '1-', '新').path).toBe('04.md');
    expect(e.addEpisode(shown({}, l), '', '新').path).toBe('01.md');
    expect(() => e.addEpisode(w, '01.md', '新')).toThrow('章が見つかりません');
    expect(() => e.addEpisode(shown({}, { ...l, dir: 'ms' }), 'other/2-', '新')).toThrow('章が見つかりません');
    expect(() => e.addEpisode(shown({ '01.md': '', '02.md/x': '' }, l), '', '新')).toThrow('同じ名前があります');
    const ch = e.addChapter(w, '第三章');
    expect(ch.path).toBe('3-04.md');
    expect(ch.edits).toEqual([
      { key: ['titles', '3-04.md'], value: '新しい話' },
      { key: ['titles', '3-'], value: '第三章' },
    ]);
    expect(e.addChapter(shown({}, l), '一').path).toBe('01.md');
  });
});

describe('renaming (FR-TOC-05)', () => {
  test('a file name with its title: renamed, the titles and links following', () => {
    const w = shown(
      { '01_a.md': '', '02_part/01_x.md': '', '02_part/img.png': '' },
      { titles: { '02_part/01_x.md': 'X' }, links: { '02_part/01_x.md': '箱' } },
    );
    expect(e.rename(w, '01_a.md', '新/題')).toEqual({ moves: [['01_a.md', '01_新 題.md']], writes: [], edits: [], path: '01_新 題.md' });
    // (the files outside the manuscript folder stay)
    const inDir = shown({ 'ms/01_a.md': '', 'notes/n.md': '' }, { dir: 'ms' });
    expect(e.rename(inDir, 'ms/01_a.md', 'b').moves).toEqual([['ms/01_a.md', 'ms/01_b.md']]);
    const ch = e.rename(w, '02_part', '第二部');
    expect(ch.moves).toEqual([
      ['02_part/01_x.md', '02_第二部/01_x.md'],
      ['02_part/img.png', '02_第二部/img.png'],
    ]);
    expect(ch.edits).toEqual([
      { key: ['titles', '02_part/01_x.md'], value: null },
      { key: ['titles', '02_第二部/01_x.md'], value: 'X' },
      { key: ['plot', 'links', '02_part/01_x.md'], value: null },
      { key: ['plot', 'links', '02_第二部/01_x.md'], value: '箱' },
    ]);
  });
  test('a name with no title, or naming = "number": the title in [titles]', () => {
    expect(e.rename(shown({ '07.md': '' }), '07.md', '駅').edits).toEqual([{ key: ['titles', '07.md'], value: '駅' }]);
    expect(e.rename(shown({ '07_a.md': '' }, { bare: true }), '07_a.md', '駅')).toEqual({
      moves: [],
      writes: [],
      edits: [{ key: ['titles', '07_a.md'], value: '駅' }],
      path: '07_a.md',
    });
  });
  test('title = "heading": the first line rewritten, its entry in [titles] dropped; no heading: [titles]', () => {
    const w = shown({ 'ms/01.md': '# 第1話 旧\n\n本文', 'ms/02.md': '本文だけ' }, { dir: 'ms', heading: true, titles: { '01.md': '古い' } });
    expect(e.rename(w, 'ms/01.md', '新')).toEqual({
      moves: [],
      writes: [{ path: 'ms/01.md', text: '# 第1話 新\n\n本文' }],
      edits: [{ key: ['titles', '01.md'], value: null }],
      path: 'ms/01.md',
    });
    expect(e.rename(w, 'ms/02.md', '新').edits).toEqual([{ key: ['titles', '02.md'], value: '新' }]);
    const plain = shown({ '01.md': '# 題\n' }, { heading: true });
    expect(e.rename(plain, '01.md', '新').edits).toEqual([]);
    expect(() => e.rename(shown({ '01.md': null }, { heading: true }), '01.md', '新')).toThrow('見つかりません');
  });
  test('the name taken, or nothing there: refused; the chapter-number naming: [titles]', () => {
    expect(() => e.rename(shown({ '01_a.md': '', '01_b.md': '' }), '01_a.md', 'b')).toThrow('同じ名前があります');
    expect(e.rename(shown({ '01_a.md': '' }), '01_a.md', 'a').moves).toEqual([]);
    expect(() => e.rename(shown({ '01_a.md': '' }), 'memo.txt', 'b')).toThrow('見つかりません');
    expect(() => e.rename(shown({ '01_a.md': '' }), '02_b.md', 'b')).toThrow('見つかりません');
    expect(() => e.rename(shown({ 'x/01_a.md': '' }, { dir: 'ms' }), 'x/01_a.md', 'b')).toThrow('見つかりません');
    const p = shown({ '2-01.md': '' }, { prefixed: true, bare: true });
    expect(e.rename(p, '2-01.md', '一').edits).toEqual([{ key: ['titles', '2-01.md'], value: '一' }]);
    expect(e.rename(p, '2-', '二章').edits).toEqual([{ key: ['titles', '2-'], value: '二章' }]);
    expect(() => e.rename(p, 'memo', '二章')).toThrow('見つかりません');
  });
});

describe('the trash (FR-TOC-06)', () => {
  const now = Date.parse('2026-10-24T00:30:15Z');
  test('an episode moved to _trash/ with the time and its title; its titles and links go', () => {
    const w = shown({ '01_a.md': '', '_trash/20261024T093015_1_A.md': '' }, { titles: { '01_a.md': 'A' }, links: { '01_a.md': '箱' } });
    expect(e.trash(w, '01_a.md', now)).toEqual({
      moves: [['01_a.md', '_trash/20261024T093015_1_A-2.md']],
      writes: [],
      edits: [
        { key: ['titles', '01_a.md'], value: null },
        { key: ['plot', 'links', '01_a.md'], value: null },
      ],
      path: '',
    });
  });
  test('a chapter with every file in it; the chapter-number naming refuses a chapter; nothing there is refused', () => {
    const w = shown({ '02_part/01_x.md': '', '02_part/a.png': '' });
    expect(e.trash(w, '02_part', now).moves).toEqual([
      ['02_part/01_x.md', '_trash/20261024T093015_2_part/01_x.md'],
      ['02_part/a.png', '_trash/20261024T093015_2_part/a.png'],
    ]);
    expect(() => e.trash(shown({ '2-01.md': '' }, { prefixed: true, bare: true }), '2-', now)).toThrow('章の削除と並べ替えは、まだアプリではできません');
    expect(e.trash(shown({ '2-01.md': '' }, { prefixed: true, bare: true }), '2-01.md', now).moves).toEqual([
      ['2-01.md', '_trash/20261024T093015_2-01_第1話.md'],
    ]);
    expect(() => e.trash(shown({ '01_a.md': '' }), '02_b.md', now)).toThrow('見つかりません');
  });
});

describe('reordering (FR-TOC-04)', () => {
  const files = { '01_a.md': '', '02_b.md': '', '03_part/01_x.md': '', '03_part/02_y.md': '', '03_part/i.png': '' };
  test('the whole order: numbered again, the files in a moved chapter going along, the open episode followed', () => {
    const w = shown(files, { titles: { '03_part/02_y.md': 'Y' } });
    const want = [
      { type: 'chapter', path: '03_part', episodes: ['03_part/02_y.md', '01_a.md'] },
      { type: 'episode', path: '02_b.md' },
      { type: 'episode', path: '03_part/01_x.md' },
    ];
    const plan = e.reorder(w, want);
    expect(new Map(plan.moves)).toEqual(
      new Map([
        ['01_a.md', '01_part/02_a.md'],
        ['03_part/01_x.md', '03_x.md'],
        ['03_part/02_y.md', '01_part/01_y.md'],
        ['03_part/i.png', '01_part/i.png'],
      ]),
    );
    expect(plan.edits).toEqual([
      { key: ['titles', '03_part/02_y.md'], value: null },
      { key: ['titles', '01_part/01_y.md'], value: 'Y' },
    ]);
    expect(e.placeAfter(w.layout, want, '01_a.md')).toBe('01_part/02_a.md');
    expect(e.placeAfter(w.layout, want, 'zz/none.md')).toBe('zz/none.md');
    expect(e.placeAfter({ ...w.layout, dir: 'ms' }, want, 'other/x.md')).toBe('other/x.md');
  });
  test('an order that does not match the table of contents, and the chapter-number naming, are refused', () => {
    const w = shown(files);
    const order = e.orderOf(w.toc);
    expect(() => e.reorder(w, order.slice(1))).toThrow('並び順が目次と合いません。再読み込みしてください');
    expect(() => e.reorder(w, [...order, { type: 'episode', path: '01_a.md' }])).toThrow('並び順が目次と合いません');
    expect(() => e.reorder(w, [{ type: 'chapter', path: '01_a.md', episodes: [] }, ...order.slice(1)])).toThrow('並び順が目次と合いません');
    expect(e.reorder(w, order).moves).toEqual([]);
    expect(() => e.reorder(shown({ '01.md': '' }, { prefixed: true, bare: true }), [])).toThrow('章の削除と並べ替えは');
  });
  test('moveBy: up and down in its list (the top, or a chapter); not past its ends', () => {
    const order = e.orderOf(shown(files).toc);
    expect(e.moveBy(order, '02_b.md', -1)?.map(it => it.path)).toEqual(['02_b.md', '01_a.md', '03_part']);
    expect(e.moveBy(order, '03_part/02_y.md', -1)?.[2]).toEqual({ type: 'chapter', path: '03_part', episodes: ['03_part/02_y.md', '03_part/01_x.md'] });
    expect(e.moveBy(order, '01_a.md', -1)).toBeNull();
    expect(e.moveBy(order, 'none.md', 1)).toBeNull();
    expect(order[2]).toEqual({ type: 'chapter', path: '03_part', episodes: ['03_part/01_x.md', '03_part/02_y.md'] });
  });
  test('moveToChapter and dropOn: into a chapter, out of it, before another; a chapter before an item', () => {
    const order = e.orderOf(shown(files).toc);
    expect(e.moveToChapter(order, '01_a.md', '03_part')).toEqual([
      { type: 'episode', path: '02_b.md' },
      { type: 'chapter', path: '03_part', episodes: ['03_part/01_x.md', '03_part/02_y.md', '01_a.md'] },
    ]);
    expect(e.moveToChapter(order, '03_part/01_x.md', '').map(it => it.path)).toEqual(['01_a.md', '02_b.md', '03_part', '03_part/01_x.md']);
    expect(e.dropOn(order, '01_a.md', '01_a.md', false)).toBeNull();
    expect(e.dropOn(order, '01_a.md', '03_part', true)?.[1]).toEqual({
      type: 'chapter',
      path: '03_part',
      episodes: ['03_part/01_x.md', '03_part/02_y.md', '01_a.md'],
    });
    expect(e.dropOn(order, '01_a.md', '03_part/02_y.md', false)?.[1]).toEqual({
      type: 'chapter',
      path: '03_part',
      episodes: ['03_part/01_x.md', '01_a.md', '03_part/02_y.md'],
    });
    expect(e.dropOn(order, '03_part/01_x.md', '01_a.md', false)?.map(it => it.path)).toEqual(['03_part/01_x.md', '01_a.md', '02_b.md', '03_part']);
    expect(e.dropOn(order, '03_part', '02_b.md', false)?.map(it => it.path)).toEqual(['01_a.md', '03_part', '02_b.md']);
    const two = [...order, { type: 'chapter', path: '04_c', episodes: ['04_c/01.md'] }];
    expect(e.dropOn(two, '04_c', '03_part/01_x.md', false)?.map(it => it.path)).toEqual(['01_a.md', '02_b.md', '04_c', '03_part']);
  });
});
