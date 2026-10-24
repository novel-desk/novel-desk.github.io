import { describe, test, expect } from 'vitest';
import { API, bytesOf, textOf, nextPage, imageType, filesOf, failure, japaneseText, japaneseScore } from '../../lib/github.js';

describe('github', () => {
  test('API: GitHub REST API (the only place the CSP lets the page reach)', () => {
    expect(API).toBe('https://api.github.com');
  });
  test('bytesOf: base64 with line ends, as GitHub gives a blob', () => {
    const b64 = Buffer.from('こんにちは、世界').toString('base64');
    expect(Buffer.from(bytesOf(`${b64.slice(0, 8)}\n${b64.slice(8)}\n`)).toString()).toBe('こんにちは、世界');
  });
  test('textOf: UTF-8 text; null for other bytes', () => {
    expect(textOf(new TextEncoder().encode('本文'))).toBe('本文');
    expect(textOf(new Uint8Array([0x82, 0xa0]))).toBeNull();
  });
  test('nextPage: the next page of the Link header; none for the last page or no header', () => {
    const link = '<https://api.github.com/user/repos?page=2>; rel="next", <https://api.github.com/user/repos?page=5>; rel="last"';
    expect(nextPage(link)).toBe('https://api.github.com/user/repos?page=2');
    expect(nextPage('<https://api.github.com/user/repos?page=1>; rel="prev"')).toBeNull();
    expect(nextPage(null)).toBeNull();
  });
  // NFR-SEC-15: never SVG
  test('imageType: by the name, in any case; unknown names, and SVG, as bytes', () => {
    expect(imageType('images/a.PNG')).toBe('image/png');
    expect(imageType('a.jpeg')).toBe('image/jpeg');
    expect(imageType('a.svg')).toBe('application/octet-stream');
    expect(imageType('a.webp')).toBe('image/webp');
    expect(imageType('a.txt')).toBe('application/octet-stream');
  });
  test('filesOf: the blobs by path and the folders; links and submodules left out', () => {
    const entries = [
      { path: 'chapters', mode: '040000', type: 'tree', sha: 't1' },
      { path: 'chapters/01.md', mode: '100644', type: 'blob', sha: 'b1' },
      { path: 'run.sh', mode: '100755', type: 'blob', sha: 'b2' },
      { path: 'link.md', mode: '120000', type: 'blob', sha: 'b3' },
      { path: 'sub', mode: '160000', type: 'commit', sha: 'c1' },
    ];
    expect(filesOf(entries)).toEqual({
      blobs: { 'chapters/01.md': { sha: 'b1', mode: '100644' }, 'run.sh': { sha: 'b2', mode: '100755' } },
      folders: ['chapters'],
    });
  });
  test('failure: what each status means, with what GitHub said', () => {
    expect(failure(401)).toBe('トークンが使えません（期限切れか、消されたかもしれません）');
    expect(failure(403, 'rate limit')).toBe('権限がないか、回数の上限に達しました: rate limit');
    expect(failure(404)).toMatch(/^見つかりません/);
    expect(failure(409)).toBe('リポジトリが空です');
    expect(failure(500)).toBe('GitHub がエラーを返しました（500）');
  });
});

// FR-WORK-03: Japanese texts in other encodings, read as text
describe('japaneseText', () => {
  const sjis = Buffer.from([0x82, 0xa0, 0x82, 0xa2, 0x82, 0xa4, 0x8a, 0xbf, 0x8e, 0x9a]); // あいう漢字
  const euc = Buffer.from([0xa4, 0xa2, 0xa4, 0xa4, 0xa4, 0xa6, 0xb4, 0xc1, 0xbb, 0xfa]);
  const jis = Buffer.from([0x1b, 0x24, 0x42, 0x24, 0x22, 0x24, 0x24, 0x1b, 0x28, 0x42]); // あい
  test('Shift-JIS, EUC-JP, ISO-2022-JP and UTF-16 with its BOM, as text', () => {
    expect(japaneseText(new Uint8Array(sjis))).toBe('あいう漢字');
    expect(japaneseText(new Uint8Array(euc))).toBe('あいう漢字');
    expect(japaneseText(new Uint8Array(jis))).toBe('あい');
    expect(japaneseText(new Uint8Array([0xff, 0xfe, 0x42, 0x30, 0x44, 0x30]))).toBe('あい');
    expect(japaneseText(new Uint8Array([0xfe, 0xff, 0x30, 0x42]))).toBe('あ');
    expect(japaneseText(new Uint8Array([0xff, 0xfe, 0x00, 0xd8]))).toBeNull();
  });
  test('UTF-8 already, or no Japanese (no kana, or garbled): none', () => {
    expect(japaneseText(new TextEncoder().encode('もうUTF-8'))).toBeNull();
    expect(japaneseText(new TextEncoder().encode('ascii only'))).toBeNull();
    // Latin-1 「Pokémon」: reads as Shift-JIS with no kana
    expect(japaneseText(new Uint8Array([0x50, 0x6f, 0x6b, 0xe9, 0x6d, 0x6f, 0x6e]))).toBeNull();
    // bytes that no encoding reads
    expect(japaneseText(new Uint8Array([0x82, 0xff, 0xff, 0x82]))).toBeNull();
    // an escape with no JIS after it in plain ASCII is ASCII
    expect(japaneseText(new Uint8Array([0x1b, 0x24, 0x41]))).toBeNull();
  });
  test('japaneseScore: kana, kanji and full-width marks count; half-width katakana and control characters count against', () => {
    expect(japaneseScore('あ漢！\n\t')).toBe(3);
    expect(japaneseScore('ｱ\u0001x')).toBe(-30);
  });
});
