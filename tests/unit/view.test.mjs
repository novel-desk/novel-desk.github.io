import { describe, test, expect } from 'vitest';
import { viewOf, namedBranch, shasToLook } from '../../lib/view.js';

const read = over => ({
  blobs: { 'novel.toml': { sha: 'cfg', mode: '100644' }, '01.md': { sha: 's1', mode: '100644' }, '02.md': { sha: 's2', mode: '100644' } },
  config: '[manuscript]\ntitle = "heading"\n',
  problems: [],
  texts: { '01.md': '# 第1話 一\n', '02.md': null },
  shaTexts: { s1: '# 第1話 一\n', s2: null, s9: '# 第9話 九\n' },
  ...over,
});
const changes = list => new Map(list.map(c => [c.path, c]));

describe('view', () => {
  test('the work as read, with no change', () => {
    const v = viewOf(read(), new Map(), []);
    expect(v.toc.map(e => e.path)).toEqual(['01.md', '02.md']);
    expect(v.texts).toEqual({ '01.md': '# 第1話 一\n', '02.md': null });
    expect(v.headings).toEqual({ '01.md': '一' });
    expect(v.layout.heading).toBe(true);
    expect(v.problems).toEqual([]);
  });
  test('the changes over it: a draft, a file moved (its text by its blob), a new file, a file gone; novel.toml with its keys set', () => {
    const v = viewOf(
      read(),
      changes([
        { repo: 'o/r', path: '01.md', base: 's1', text: '# 第1話 改\n', at: 1 },
        { repo: 'o/r', path: '02.md', base: 's2', gone: true, op: 'a', at: 1 },
        { repo: 'o/r', path: '03.md', base: '', sha: 's9', from: { path: '09.md', base: 's9' }, op: 'a', at: 1 },
        { repo: 'o/r', path: '04.md', base: '', sha: 'unknown', op: 'a', at: 1 },
        { repo: 'o/r', path: '05.md', base: '', text: '', op: 'b', at: 1 },
        { repo: 'o/r', path: '06.md', base: '', bytes: new Uint8Array([1]), op: 'b', at: 1 },
      ]),
      [{ key: ['title'], value: '題', op: 'c' }],
    );
    expect(v.toc.map(e => e.path)).toEqual(['01.md', '03.md', '04.md', '05.md', '06.md']);
    expect(v.texts).toEqual({ '01.md': '# 第1話 改\n', '03.md': '# 第9話 九\n', '04.md': null, '05.md': '', '06.md': null });
    expect(v.layout.title).toBe('題');
    expect(v.config).toBe('title = "題"\n[manuscript]\ntitle = "heading"\n');
  });
  test('no novel.toml: the first layout; a novel.toml that cannot take the keys says why; a file read only by its blob', () => {
    const none = viewOf(read({ config: null, problems: ['novel.toml が UTF-8 ではないので読めません'], texts: {} }), new Map(), []);
    expect(none.layout.heading).toBe(false);
    expect(none.problems).toEqual(['novel.toml が UTF-8 ではないので読めません']);
    expect(none.texts['01.md']).toBe('# 第1話 一\n');
    expect(viewOf(read({ texts: {}, shaTexts: {} }), new Map(), []).texts['01.md']).toBeNull();
    const made = viewOf(read({ config: null }), new Map(), [{ key: ['title'], value: '新' }]);
    expect([made.config, made.layout.title]).toEqual(['title = "新"\n', '新']);
    const bad = viewOf(read({ config: 'a = b' }), new Map(), [{ key: ['title'], value: 'x' }]);
    expect(bad.problems[0]).toMatch(/^novel\.toml が読めないので、書き換えません/);
    expect(bad.problems[1]).toMatch(/^novel\.toml が読めません/);
  });
});

// FR-WORK-01: the branch read; FR-SAVE-04: the texts that tell the files apart
test('namedBranch: the one novel.toml names, not the default nor the one gone', () => {
  expect(namedBranch('dev', 'main', '')).toBe('dev');
  expect(namedBranch('', 'main', '')).toBe('');
  expect(namedBranch('main', 'main', '')).toBe('');
  expect(namedBranch('dev', 'main', 'dev')).toBe('');
});
test('shasToLook: for a text whose file changed, the blobs written from and read, and those of its kind come or changed; each once', () => {
  const was = { blobs: { 'a.md': { sha: 'r1' }, 'b.md': { sha: 'r2' }, 'p.png': { sha: 'r3' } } };
  const now = { blobs: { 'a.md': { sha: 'n1' }, 'b.md': { sha: 'r2' }, 'c.md': { sha: 'n3' }, 'p.png': { sha: 'n4' } } };
  const drafts = [
    { repo: 'o/r', path: 'a.md', base: 'r0', text: 't', at: 1 },
    { repo: 'o/r', path: 'x.md', base: 'r1', text: 't', at: 1 },
    { repo: 'o/r', path: 'b.md', base: 'r2', text: 't', at: 1 },
    { repo: 'o/r', path: 'n.md', base: '', text: 't', at: 1 },
    { repo: 'o/r', path: 'c.md', base: 'r9', op: 'o', text: 't', at: 1 },
  ];
  expect(shasToLook(drafts, was, now)).toEqual(['r0', 'r1', 'n1', 'n3']);
  expect(shasToLook([], was, now)).toEqual([]);
});
