import { describe, test, expect } from 'vitest';
import { parseToml } from '../../lib/toml.js';

const ok = src => {
  const r = parseToml(src);
  expect(r.error).toBe('');
  return r.table;
};
const fails = src => parseToml(src).error;

describe('toml', () => {
  test('the novel.toml of a work: comments, tables, texts', () => {
    const src = [
      '# Novel Writer の作品の設定',
      'title = "電脳都市の空"',
      '',
      '[manuscript]',
      'dir = "chapters"  # 本文',
      'files = "*.md"',
      'title = "heading"',
      '',
      '[git]',
      "branch = 'main'",
      '[plot]',
      'file = "notes/01_plot.md"',
    ].join('\r\n');
    expect(ok(src)).toEqual({
      title: '電脳都市の空',
      manuscript: { dir: 'chapters', files: '*.md', title: 'heading' },
      git: { branch: 'main' },
      plot: { file: 'notes/01_plot.md' },
    });
  });
  test('quoted and dotted keys, nested tables, arrays over lines, numbers and booleans, a byte order mark', () => {
    const src = [
      '\uFEFFa.b = 1',
      '[titles]',
      '"01_a.md" = "一"',
      "'2-' = '二'",
      '[plot.links]',
      '"01.md" = "箱"',
      '[x]',
      'list = [ "a", # 一つ目',
      "  'b',",
      '  [1, -2, +3_000], true, false,',
      ']',
      'empty = []',
      'zero = 0',
    ].join('\n');
    expect(ok(src)).toEqual({
      a: { b: 1 },
      titles: { '01_a.md': '一', '2-': '二' },
      plot: { links: { '01.md': '箱' } },
      x: { list: ['a', 'b', [1, -2, 3000], true, false], empty: [], zero: 0 },
    });
  });
  test('escapes of a basic text', () => {
    expect(ok('a = "\\"\\\\\\n\\t\\r\\b\\f\\u3042\\U0001F600"').a).toBe('"\\\n\t\r\b\fあ\u{1F600}');
  });
  test('a header after a dotted table, and a table made by a key, are the same table', () => {
    expect(ok('[a.b]\nx = 1\n[a]\ny = 2')).toEqual({ a: { b: { x: 1 }, y: 2 } });
  });
  test('what cannot be read, said with its line', () => {
    expect(fails('a = """\nx\n"""')).toBe('1 行目: 複数行の文字列（"""）には対応していません');
    expect(fails("a = '''x'''")).toBe("1 行目: 複数行の文字列（'''）には対応していません");
    expect(fails('\na = "x')).toBe('2 行目: 文字列が閉じていません（" が足りません）');
    expect(fails('a = "x\ny"')).toBe('1 行目: 文字列が閉じていません（" が足りません）');
    expect(fails("a = 'x")).toBe("1 行目: 文字列が閉じていません（' が足りません）");
    expect(fails("a = 'x\n'")).toBe("1 行目: 文字列が閉じていません（' が足りません）");
    expect(fails('a = "\\x"')).toBe('1 行目: エスケープ「\\x」は読めません');
    expect(fails('a = "\\')).toBe('1 行目: エスケープ「\\」は読めません');
    expect(fails('a = "\\u12"')).toBe('1 行目: \\u の後に 16 進数が 4 桁ありません');
    expect(fails('a = "\\U1234"')).toBe('1 行目: \\U の後に 16 進数が 8 桁ありません');
    expect(fails('a = { b = 1 }')).toBe('1 行目: インラインテーブル（{ }）には対応していません');
    expect(fails('a = 2026-10-24')).toBe('1 行目: 値「2026-10-24」は読めません（文字列は "" で囲みます）');
    expect(fails('a = main')).toBe('1 行目: 値「main」は読めません（文字列は "" で囲みます）');
    expect(fails('a = 1.5')).toBe('1 行目: 値「1.5」は読めません（文字列は "" で囲みます）');
    expect(fails('a =')).toBe('1 行目: 値がありません');
    expect(fails('a = [1 2]')).toBe('1 行目: 配列の値の間に「,」がありません');
    expect(fails('a = "x" b')).toBe('1 行目: 「b」は読めません');
    expect(fails('[[a]]')).toBe('1 行目: 表の配列（[[ ]]）には対応していません');
    expect(fails('[a\nb = 1')).toBe('1 行目: 表の名前が「]」で閉じていません');
    expect(fails('[a] x')).toBe('1 行目: 「x」は読めません');
    expect(fails('[a]\n[a]')).toBe('2 行目: 表「[a]」が 2 回あります');
    expect(fails('a = 1\na = 2')).toBe('2 行目: キー「a」が 2 回あります');
    expect(fails('a = 1\n[a.b]')).toBe('2 行目: 「a.b」は表ではありません（「a」に値があります）');
    expect(fails('a\n')).toBe('1 行目: キー「a」の後に「=」がありません');
    expect(fails('= 1')).toBe('1 行目: キーに「=」は使えません');
    expect(fails('a. = 1')).toBe('1 行目: キーに「=」は使えません');
    expect(fails('[]')).toBe('1 行目: キーに「]」は使えません');
    expect(fails('a.')).toBe('1 行目: キーがありません');
    expect(fails('a.\nb = 1')).toBe('1 行目: キーがありません');
  });
  test('nothing at all is an empty table', () => {
    expect(ok('')).toEqual({});
    expect(ok('# only a comment\n\n')).toEqual({});
  });
});
test('toml: an array not closed at the end of the file', () => {
  expect(parseToml('a = [1,').error).toBe('1 行目: 値がありません');
});
