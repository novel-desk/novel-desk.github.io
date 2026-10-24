import { describe, test, expect } from 'vitest';
import {
  CONFIG,
  firstLayout,
  inFolder,
  safeRel,
  parseLayout,
  numbered,
  prefixed,
  nameOrder,
  prefixedOrder,
  globPattern,
  relOf,
  episodeName,
  chapterName,
  isEpisode,
  episodeHeading,
  titleOf,
  tableOfContents,
  episodesOf,
  headingsOf,
  titleWith,
} from '../../lib/layout.js';

const layout = (over = {}) => ({ ...firstLayout(), ...over });

describe('novel.toml', () => {
  test('the first layout: numbered episodes at the top', () => {
    expect(CONFIG).toBe('novel.toml');
    expect(firstLayout()).toEqual({ title: '', dir: '', files: ['*.md'], exclude: [], prefixed: false, heading: false, titles: {}, branch: '' });
  });
  test('parseLayout: a work of the server version (dir, files, title = "heading", the branch, [titles])', () => {
    const src = [
      'title = "作品"',
      '[manuscript]',
      'dir = "/chapters/"',
      'files = "*.md"',
      'title = "heading"',
      'exclude = ["01_memo.md"]',
      '[notes]',
      'dir = "notes"',
      '[git]',
      'branch = " main "',
      '[titles]',
      '"02.md" = "二話"',
    ].join('\n');
    expect(parseLayout(src)).toEqual({
      layout: {
        title: '作品',
        dir: 'chapters',
        files: ['*.md'],
        exclude: ['01_memo.md'],
        prefixed: false,
        heading: true,
        titles: { '02.md': '二話' },
        branch: 'main',
      },
      problems: [],
    });
  });
  test('parseLayout: files as a list; naming = "chapter-number"; an empty files is "*.md"', () => {
    expect(parseLayout('[manuscript]\nfiles = ["[0-9][0-9].md", "x.md"]\nnaming = "chapter-number"').layout).toMatchObject({
      files: ['[0-9][0-9].md', 'x.md'],
      prefixed: true,
    });
    expect(parseLayout('[manuscript]\nfiles = ""').layout.files).toEqual(['*.md']);
  });
  test('parseLayout: novel.toml that cannot be read gives the first layout, and says why', () => {
    expect(parseLayout('title = 作品')).toEqual({
      layout: firstLayout(),
      problems: ['novel.toml が読めません（1 行目: 値「作品」は読めません（文字列は "" で囲みます））。本文のフォルダを一番上として読みます'],
    });
  });
  test('parseLayout: values of the wrong kind are said, and left as if they were not there', () => {
    const src = [
      'title = 3',
      'git = "main"',
      '[manuscript]',
      'dir = "../outside"',
      'files = 1',
      'exclude = "a.md"',
      'naming = true',
      'title = ["heading"]',
      '[titles]',
      '"01.md" = 1',
      '"02.md" = "二"',
    ].join('\n');
    expect(parseLayout(src)).toEqual({
      layout: { ...firstLayout(), titles: { '02.md': '二' } },
      problems: [
        '[git] が表ではありません',
        'title が文字列ではありません',
        'manuscript.dir「../outside」は作品の中のフォルダではないので、一番上として読みます',
        'manuscript.files が文字列でも配列でもありません',
        'manuscript.exclude が配列ではありません',
        'manuscript.naming が文字列ではありません',
        'manuscript.title が文字列ではありません',
        '[titles] の「01.md」が文字列ではありません',
      ],
    });
    expect(parseLayout('[manuscript]\nfiles = ["*.md", 1]\nexclude = [2, "a.md"]')).toEqual({
      layout: { ...firstLayout(), exclude: ['a.md'] },
      problems: ['manuscript.files に文字列でない値があります', 'manuscript.exclude に文字列でない値があります'],
    });
  });
  test('inFolder and safeRel: paths inside the work only', () => {
    expect(inFolder('', 'a.md')).toBe('a.md');
    expect(inFolder('c', 'a.md')).toBe('c/a.md');
    expect(safeRel('chapters/one')).toBe(true);
    for (const p of ['', '/abs', 'a/../b', './a', 'a//b', '.git/x', 'a\0b']) expect(safeRel(p)).toBe(false);
  });
});

describe('names', () => {
  test('numbered: number, title, .md; a number too long sorts last', () => {
    expect(numbered('03_駅で.md')).toEqual({ number: 3, title: '駅で', md: true });
    expect(numbered('2_第二章')).toEqual({ number: 2, title: '第二章', md: false });
    expect(numbered('07.md')).toEqual({ number: 7, title: '', md: true });
    expect(numbered('1234567890123456789.md')?.number).toBe(Number.MAX_SAFE_INTEGER);
    expect(numbered('memo.md')).toBeNull();
  });
  test('prefixed: chapter, number, part, title; chapter 1 when none', () => {
    expect(prefixed('2-09.md')).toEqual({ chapter: 2, number: 9, part: 0, title: '' });
    expect(prefixed('09.md')).toEqual({ chapter: 1, number: 9, part: 0, title: '' });
    expect(prefixed('2-11-2_題名.md')).toEqual({ chapter: 2, number: 11, part: 2, title: '題名' });
    expect(prefixed('a.md')).toBeNull();
  });
  test('nameOrder: numbers as numbers, then the names', () => {
    expect(['10_b.md', '2_a.md', 'memo', '2_0.md'].sort(nameOrder)).toEqual(['10_b.md', '2_0.md', '2_a.md', 'memo'].sort(nameOrder));
    expect(['10_b.md', '2_a.md', '2_0.md'].sort(nameOrder)).toEqual(['2_0.md', '2_a.md', '10_b.md']);
    expect(nameOrder('b', 'a')).toBe(1);
    expect(nameOrder('a', 'a')).toBe(0);
  });
  test('prefixedOrder: chapter, number, part, then the name', () => {
    expect(['2-01.md', '1-10.md', '1-02-2.md', '1-02.md', '1-02_b.md', '1-02_a.md'].sort(prefixedOrder)).toEqual([
      '1-02.md',
      '1-02_a.md',
      '1-02_b.md',
      '1-02-2.md',
      '1-10.md',
      '2-01.md',
    ]);
  });
  test('globPattern: * ? [..] [!..], the rest as written; a [ not closed cannot be read', () => {
    expect(globPattern('*.md').test('01_a.md')).toBe(true);
    expect(globPattern('*.md').test('01_a.txt')).toBe(false);
    expect(globPattern('0?.md').test('01.md')).toBe(true);
    expect(globPattern('[0-9][0-9].md').test('12.md')).toBe(true);
    expect(globPattern('[0-9][0-9].md').test('1a.md')).toBe(false);
    expect(globPattern('[!a]*').test('b.md')).toBe(true);
    expect(globPattern('[!a]*').test('a.md')).toBe(false);
    expect(globPattern('[]]x').test(']x')).toBe(true);
    expect(globPattern('[\\^]').test('^')).toBe(true);
    expect(globPattern('a+(b).md').test('a+(b).md')).toBe(true);
    expect(globPattern('[0-9.md')).toBeNull();
  });
});

describe('episodes', () => {
  const l = layout({ dir: 'chapters', exclude: ['03.md'] });
  test('relOf: from the manuscript folder; null outside it', () => {
    expect(relOf(l, 'chapters/01.md')).toBe('01.md');
    expect(relOf(l, 'chaptersX/01.md')).toBeNull();
    expect(relOf(layout(), '01.md')).toBe('01.md');
  });
  test('episodeName: the shape, files, and exclude', () => {
    expect(episodeName(l, '01_a.md', '01_a.md')).toBe(true);
    expect(episodeName(l, 'memo.md', 'memo.md')).toBe(false);
    expect(episodeName(l, '03.md', '03.md')).toBe(false);
    expect(episodeName(layout({ files: ['[0-9][0-9].md'] }), '123.md', '123.md')).toBe(false);
    expect(episodeName(layout({ files: ['[0-9.md'] }), '123.md', '123.md')).toBe(true);
    expect(episodeName(layout({ prefixed: true }), '2-01.md', '2-01.md')).toBe(true);
    expect(episodeName(layout({ prefixed: true }), 'x.md', 'x.md')).toBe(false);
  });
  test('chapterName: a numbered folder', () => {
    expect(chapterName('01_第一章')).toBe(true);
    expect(chapterName('01.md')).toBe(false);
    expect(chapterName('notes')).toBe(false);
  });
  test('isEpisode: an episode at the top of the manuscript folder or in a chapter, nothing deeper', () => {
    expect(isEpisode(l, 'chapters/01.md')).toBe(true);
    expect(isEpisode(l, 'chapters/01_章/02.md')).toBe(true);
    expect(isEpisode(l, 'chapters/notes/02.md')).toBe(false);
    expect(isEpisode(l, 'chapters/01_章/x/02.md')).toBe(false);
    expect(isEpisode(l, 'notes/01.md')).toBe(false);
    expect(isEpisode(layout({ prefixed: true }), '01_章/02.md')).toBe(false);
  });
  test('episodeHeading: 「# 第1話 題名」 gives 題名; 「# 題名」 and 「# 第1話」 the whole; null without a heading', () => {
    expect(episodeHeading('\uFEFF\n# 第１話　空を飛ぶ\r\n本文')).toBe('空を飛ぶ');
    expect(episodeHeading('# 猫の耳')).toBe('猫の耳');
    expect(episodeHeading('# 第十二話')).toBe('第十二話');
    expect(episodeHeading('#  ')).toBeNull();
    expect(episodeHeading('本文')).toBeNull();
    expect(episodeHeading('')).toBeNull();
  });
  test('titleOf: the heading, else [titles], else the name, else 第 n 話 / 第 n 章', () => {
    const t = layout({ titles: { '02.md': '二話', '01_章': '' } });
    expect(titleOf(t, '01.md', { '01.md': '見出し' })).toBe('見出し');
    expect(titleOf(t, '02.md')).toBe('二話');
    expect(titleOf(t, '01_章/03_駅で.md')).toBe('駅で');
    expect(titleOf(t, '04.md')).toBe('第4話');
    expect(titleOf(t, '01_章')).toBe('章');
    expect(titleOf(t, '05')).toBe('第5章');
    expect(titleOf(t, 'memo.md')).toBe('memo');
  });
  test('titleOf: the chapter-number naming', () => {
    const p = layout({ prefixed: true });
    expect(titleOf(p, '2-')).toBe('第2章');
    expect(titleOf(p, '2-09.md')).toBe('第9話');
    expect(titleOf(p, '2-11-2.md')).toBe('第11話（2）');
    expect(titleOf(p, '2-12_題.md')).toBe('題');
    expect(titleOf(p, 'memo.md')).toBe('memo');
  });
});

describe('the table of contents', () => {
  test('chapters and loose episodes in one numbering; empty chapters too; other files left out', () => {
    const l = layout({ dir: 'chapters' });
    const paths = ['chapters/10_終.md', 'chapters/2_章/02.md', 'chapters/2_章/1_a.md', 'chapters/01.md', 'chapters/memo.md', 'README.md', 'novel.toml'];
    const toc = tableOfContents(l, paths, ['chapters', 'chapters/2_章', 'chapters/3_空', 'chapters/3_空/x', 'notes', 'chapters/notes']);
    expect(toc).toEqual([
      { type: 'episode', path: 'chapters/01.md', rel: '01.md' },
      {
        type: 'chapter',
        path: 'chapters/2_章',
        rel: '2_章',
        episodes: [
          { type: 'episode', path: 'chapters/2_章/1_a.md', rel: '2_章/1_a.md' },
          { type: 'episode', path: 'chapters/2_章/02.md', rel: '2_章/02.md' },
        ],
      },
      { type: 'chapter', path: 'chapters/3_空', rel: '3_空', episodes: [] },
      { type: 'episode', path: 'chapters/10_終.md', rel: '10_終.md' },
    ]);
    expect(episodesOf(toc).map(e => e.rel)).toEqual(['01.md', '2_章/1_a.md', '2_章/02.md', '10_終.md']);
    expect(tableOfContents(l, paths).length).toBe(3);
  });
  test('the chapter-number naming: chapters by number, their episodes in order', () => {
    const l = layout({ prefixed: true });
    const toc = tableOfContents(l, ['10-01.md', '2-02.md', '09.md', '2-01.md', 'x.md', '2_章/01.md'], ['2_章']);
    expect(toc.map(c => [c.rel, c.type === 'chapter' && c.episodes.map(e => e.path)])).toEqual([
      ['1-', ['09.md']],
      ['2-', ['2-01.md', '2-02.md']],
      ['10-', ['10-01.md']],
    ]);
  });
  test('headingsOf: the titles from the first lines, only with title = "heading"', () => {
    const toc = tableOfContents(layout({ dir: 'c' }), ['c/01.md', 'c/02.md', 'c/03.md']);
    const texts = { 'c/01.md': '# 第1話 空\n本文', 'c/02.md': '本文だけ', 'c/03.md': null };
    expect(headingsOf(layout({ dir: 'c', heading: true }), toc, texts)).toEqual({ '01.md': '空' });
    expect(headingsOf(layout({ dir: 'c' }), toc, texts)).toEqual({});
  });
  test('titleWith: the heading of the text being sent (title = "heading"), else the title as it is', () => {
    const h = layout({ heading: true });
    expect(titleWith(h, '01.md', '# 第1話 新しい題\n本文', { '01.md': '古い題' })).toBe('新しい題');
    expect(titleWith(h, '01.md', '本文だけ', { '01.md': '古い題' })).toBe('古い題');
    expect(titleWith(layout(), '01_題.md', '# 見出し', {})).toBe('題');
  });
});
