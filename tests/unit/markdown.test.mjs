import { describe, test, expect } from 'vitest';
import { dirOf, linkedPath, relPath, splitImages, picturePaths, renderMd } from '../../lib/markdown.js';

const src = path => `blob:${path}`;

describe('markdown', () => {
  test('relPath: a path from the top as the link written in a file (FR-EDIT-07)', () => {
    expect(relPath('chapters/01.md', 'notes/images/a.jpg')).toBe('../notes/images/a.jpg');
    expect(relPath('notes/a/b.md', 'notes/images/a.jpg')).toBe('../images/a.jpg');
    expect(relPath('01.md', 'images/a.jpg')).toBe('images/a.jpg');
    expect(relPath('images/x.md', 'images/a.jpg')).toBe('a.jpg');
  });
  test('dirOf: the folder of a path', () => {
    expect(dirOf('a/b/c.md')).toBe('a/b');
    expect(dirOf('c.md')).toBe('');
    expect(dirOf(null)).toBe('');
  });
  test('linkedPath: a link from a file, as a path from the top; addresses outside the repository are null', () => {
    expect(linkedPath('chapters/01.md', '../images/a.png')).toBe('images/a.png');
    expect(linkedPath('chapters/01.md', './b.png')).toBe('chapters/b.png');
    expect(linkedPath('01.md', 'images//a.png')).toBe('images/a.png');
    expect(linkedPath('01.md', 'https://example.com/a.png')).toBeNull();
    expect(linkedPath('01.md', '//example.com/a.png')).toBeNull();
    expect(linkedPath('01.md', 'data:image/png;base64,AAAA')).toBeNull();
  });
  test('splitImages: the text and the pictures of a line', () => {
    expect(splitImages('前![絵](a.png)後')).toEqual(['前', '![絵](a.png)', '後']);
    expect(splitImages('![a](x.png)![b](y.png)')).toEqual(['', '![a](x.png)', '', '![b](y.png)', '']);
    expect(splitImages('![no close')).toEqual(['![no close']);
    expect(splitImages('![a](no end')).toEqual(['![a](no end']);
    expect(splitImages('![a] (x.png)')).toEqual(['![a] (x.png)']);
    expect(splitImages('![a]()')).toEqual(['![a]()']);
    expect(splitImages('![a](x y)')).toEqual(['![a](x y)']);
  });
  test('picturePaths: the files the pictures point at, each once, in order (not the outside ones)', () => {
    const text = '![a](../images/a.png)\n![b](https://x/b.png) ![a](../images/a.png)\n- ![c](c.png)';
    expect(picturePaths(text, 'chapters/01.md')).toEqual(['images/a.png', 'chapters/c.png']);
  });
  test('renderMd: headings, lists, paragraphs, each line numbered', () => {
    expect(renderMd('# 第1話 はじまり\n本文\n- 一\n* 二\n終わり', '01.md', src)).toBe(
      '<h1 data-l="0">第1話 はじまり</h1><p data-l="1">本文</p><ul><li data-l="2">一</li><li data-l="3">二</li></ul><p data-l="4">終わり</p>',
    );
    expect(renderMd('- 最後まで', '01.md', src)).toBe('<ul><li data-l="0">最後まで</li></ul>');
    expect(renderMd('#### 四\n##### 五', '01.md', src)).toBe('<h4 data-l="0">四</h4><p data-l="1">##### 五</p>');
  });
  test('renderMd: rubies, and the text made safe', () => {
    expect(renderMd('|電脳《でんのう》と漢字《かんじ》<b>', '01.md', src)).toBe(
      '<p data-l="0"><ruby>電脳<rt>でんのう</rt></ruby>と<ruby>漢字<rt>かんじ</rt></ruby>&lt;b&gt;</p>',
    );
  });
  test('renderMd: pictures by the address given for their file; outside ones as written; one not found by its alt only', () => {
    expect(renderMd('![絵](../images/a.png)', 'chapters/01.md', src)).toBe('<p data-l="0"><img alt="絵" src="blob:images/a.png"></p>');
    expect(renderMd('![外](https://x/b.png)', '01.md', src)).toBe('<p data-l="0"><img alt="外" src="https://x/b.png"></p>');
    expect(renderMd('![無](none.png)', '01.md', () => '')).toBe('<p data-l="0"><img alt="無"></p>');
    expect(renderMd('![a"](x.png)', '01.md', () => 'blob:"x')).toBe('<p data-l="0"><img alt="a&quot;" src="blob:&quot;x"></p>');
  });
});
