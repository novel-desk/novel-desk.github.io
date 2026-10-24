import { describe, test, expect } from 'vitest';
import { editToml, quote, tableEdits } from '../../lib/tomledit.js';
import { parseToml } from '../../lib/toml.js';

const SRC = [
  '# 作品の設定',
  'title = "星降る坂の町"  # 題名',
  '',
  '[manuscript]',
  'dir = "chapters"',
  'title = "heading"',
  '',
  '[titles]',
  '"01_a.md" = "一"  # 最初',
  "'02_b.md' = '二'",
  '',
  '[git]',
  'branch = "main"',
  '',
].join('\n');
const ok = (src, edits) => {
  const r = editToml(src, edits);
  expect(r.error).toBe('');
  return /** @type {string} */ (r.text);
};

// FR-PLOT-07: what the app did not change stays as it was, to the character (as the server version's toml_edit)
describe('editToml', () => {
  test('a value changed: only the value, the key as written and the comment after it stay', () => {
    expect(ok(SRC, [{ key: ['titles', '01_a.md'], value: '最初の話' }])).toBe(SRC.replace('"01_a.md" = "一"', '"01_a.md" = "最初の話"'));
    expect(ok(SRC, [{ key: ['title'], value: '新しい題' }])).toBe(SRC.replace('"星降る坂の町"', '"新しい題"'));
  });
  test('a key removed takes its line; a key not there is nothing to remove', () => {
    expect(ok(SRC, [{ key: ['titles', '02_b.md'], value: null }])).toBe(SRC.replace("'02_b.md' = '二'\n", ''));
    expect(ok(SRC, [{ key: ['titles', 'none.md'], value: null }])).toBe(SRC);
  });
  test('a key added after the last key of its table, quoted when it must be', () => {
    expect(ok(SRC, [{ key: ['titles', '03_c/01.md'], value: '三 "引用"\t' }])).toBe(
      SRC.replace("'02_b.md' = '二'\n", '\'02_b.md\' = \'二\'\n"03_c/01.md" = "三 \\"引用\\"\\t"\n'),
    );
    expect(ok(SRC, [{ key: ['git', 'remote'], value: 'origin' }])).toBe(SRC.replace('branch = "main"\n', 'branch = "main"\nremote = "origin"\n'));
  });
  test('a key added under an empty header; at the top before the first header; a table made at the end', () => {
    expect(ok('[titles]\n[git]\n', [{ key: ['titles', 'a.md'], value: 'A' }])).toBe('[titles]\n"a.md" = "A"\n[git]\n');
    expect(ok('# c\n[git]\n', [{ key: ['title'], value: '題' }])).toBe('# c\ntitle = "題"\n[git]\n');
    expect(ok('# only a comment', [{ key: ['title'], value: '題' }])).toBe('# only a comment\ntitle = "題"\n');
    expect(ok(SRC, [{ key: ['plot', 'file'], value: 'notes/plot.md' }])).toBe(`${SRC}\n[plot]\nfile = "notes/plot.md"\n`);
    expect(ok('title = "a"', [{ key: ['plot', 'file'], value: 'p' }])).toBe('title = "a"\n\n[plot]\nfile = "p"\n');
    expect(ok('', [{ key: ['titles', '01.md'], value: '一' }])).toBe('[titles]\n"01.md" = "一"\n');
  });
  test('a table made before a table inside it; a dotted key written by the table it is under', () => {
    const src = '[plot.links]\n"01.md" = "箱"\n';
    expect(ok(src, [{ key: ['plot', 'file'], value: 'p.md' }])).toBe('[plot]\nfile = "p.md"\n\n[plot.links]\n"01.md" = "箱"\n');
    expect(ok('[plot]\nfile = "p.md"\nlinks."01.md" = "箱"\n', [{ key: ['plot', 'links', '02.md'], value: '次' }])).toBe(
      '[plot]\nfile = "p.md"\nlinks."01.md" = "箱"\nlinks."02.md" = "次"\n',
    );
    expect(ok('[plot]\nfile = "p.md"\n[plot.links]\n"01.md" = "箱"\n', [{ key: ['plot', 'links', '02.md'], value: '次' }])).toBe(
      '[plot]\nfile = "p.md"\n[plot.links]\n"01.md" = "箱"\n"02.md" = "次"\n',
    );
  });
  test('the last line without a line end; the byte order mark and \\r\\n line ends kept', () => {
    expect(ok('[titles]\n"a.md" = "A"', [{ key: ['titles', 'b.md'], value: 'B' }])).toBe('[titles]\n"a.md" = "A"\n"b.md" = "B"\n');
    expect(ok('\uFEFF[titles]\r\n"a.md" = "A"\r\n', [{ key: ['titles', 'b.md'], value: 'B' }])).toBe('\uFEFF[titles]\r\n"a.md" = "A"\r\n"b.md" = "B"\r\n');
  });
  test('edits in order', () => {
    expect(
      ok('[titles]\n"a.md" = "A"\n', [
        { key: ['titles', 'a.md'], value: null },
        { key: ['titles', 'b.md'], value: 'A' },
      ]),
    ).toBe('[titles]\n"b.md" = "A"\n');
  });
  test('not changed: a file that cannot be read, mixed line ends, a key under a value that is not a table', () => {
    expect(editToml('a = b', [{ key: ['t'], value: 'x' }])).toEqual({
      text: null,
      error: expect.stringMatching(/^novel\.toml が読めないので、書き換えません（1 行目/),
    });
    expect(editToml('a = "1"\r\nb = "2"\n', [{ key: ['t'], value: 'x' }]).error).toMatch(/改行の形が行によって違う/);
    expect(editToml('a = "1"\r\nb = "2"\r', [{ key: ['t'], value: 'x' }]).error).toMatch(/改行の形が行によって違う/);
    expect(editToml('titles = "x"\n', [{ key: ['titles', 'a.md'], value: 'A' }])).toEqual({
      text: null,
      error: 'novel.toml の「titles.a.md」を書き換えられません（表でない値があります）',
    });
    expect(editToml('a = [1]\n', [{ key: ['a', 'b'], value: 'B' }]).error).toBe('novel.toml の「a.b」を書き換えられません（表でない値があります）');
    expect(ok('x = "1"\n', [{ key: ['t', 'u', 'v'], value: null }])).toBe('x = "1"\n');
  });
  test('quote: the escapes of a basic string, control characters as \\u', () => {
    expect(quote('a"b\\c\n\u0001\u007f')).toBe('"a\\"b\\\\c\\n\\u0001\\u007f"');
    expect(parseToml(`k = ${quote('改行\n"と"\\\u0002')}`).table).toEqual({ k: '改行\n"と"\\\u0002' });
  });
  test('tableEdits: the keys gone removed, the new and changed set', () => {
    expect(tableEdits(['titles'], { a: '1', b: '2', c: '3' }, { a: '1', b: '二', d: '4' })).toEqual([
      { key: ['titles', 'c'], value: null },
      { key: ['titles', 'b'], value: '二' },
      { key: ['titles', 'd'], value: '4' },
    ]);
  });
});
