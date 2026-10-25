// tools/server_diff.mjs: the differences from the server version's style.css and index.html found rule by rule and
// element by element, and only the ones docs/server-differences.md gives reasons for let through
import { test, expect } from 'vitest';
import { cssDiffs, docNumbers, htmlDiffs, judge, parseAllowed, parseCss } from '../../tools/server_diff.mjs';

test('parseCss: by @media and selector, the values that take effect; comments, spaces and quotes not counted', () => {
  const r = parseCss(`/* x */ :root[data-theme=dark] { --a: 1 } .a, .b > .c { color: red; height: 1px; height: 2px }
    @media (max-width: 760px) { .a { color: blue } @media (pointer: coarse) { .a { left: 0 } } } .a { color: green; content: "a;b" }`);
  expect([...r.keys()]).toEqual([
    ':root[data-theme="dark"]',
    '.a',
    '.b > .c',
    '@media (max-width: 760px) .a',
    '@media (max-width: 760px) @media (pointer: coarse) .a',
  ]);
  expect(Object.fromEntries(r.get('.a') ?? [])).toEqual({ color: 'green', height: '1px ; 2px', content: '"a;b"' });
  expect(() => parseCss('.a { color: red')).toThrow('CSS の { } が閉じていません');
});
test('cssDiffs: a rule in one only, a value changed or missing; the same rules written otherwise, none', () => {
  expect(cssDiffs('.a{color:red}', '.a { color : red ; }')).toEqual([]);
  expect(cssDiffs('.a{color:red} .b{top:0}', '.a{color:blue;left:0} .c{top:0}')).toEqual([
    { key: 'css .a {color}', server: 'red', desk: 'blue' },
    { key: 'css .a {left}', server: '', desk: '0' },
    { key: 'css - .b', server: 'top: 0', desk: '' },
    { key: 'css + .c', server: '', desk: 'top: 0' },
  ]);
});
test('htmlDiffs: elements by id or by their path; one in one only said once; attributes, text, parent and order', () => {
  const server = `<!doctype html><html><head><script>a()</script><meta charset="utf-8"></head><body>
    <section id="s"><button class="ghost" id="b" title="t">押す</button><p>文<b>太</b></p></section>
    <div id="d"><i>1</i><i>2</i></div><svg viewBox="0 0 1 1"><path d="M1"/></svg><input id="i"></body></html>`;
  expect(htmlDiffs(server, server)).toEqual([]);
  const desk = `<!doctype html><html><head><meta charset="utf-8"><script src="x.js"></script></head><body>
    <div id="d"><i>2</i><i>1</i></div><section id="s"><p>文<b>太</b></p></section><button class="ghost" id="b">押した</button>
    <svg viewBox="0 0 1 1"><path d="M2"/></svg><input id="i"><aside id="new"><span>中</span></aside></body></html>`;
  expect(htmlDiffs(server, desk).map(d => d.key)).toEqual([
    'html - html > head > script',
    'html + html > head > script[src="x.js"]',
    'html + #new',
    'html #b parent',
    'html #b [title]',
    'html #b text',
    'html #d > i:1 text',
    'html #d > i:2 text',
    'html html > body > svg text',
    'html html > body order',
  ]);
});
test('parseAllowed, docNumbers, judge: what is let through; stale lines and numbers the document has not, said', () => {
  const { commit, allowed } = parseAllowed('# c\ncommit 4874314\n\nA1 css + .x\nB2 html #b text\n');
  expect(commit).toBe('4874314');
  expect([...allowed]).toEqual([
    ['css + .x', 'A1'],
    ['html #b text', 'B2'],
  ]);
  expect(() => parseAllowed('???')).toThrow('読めない行');
  expect([...docNumbers('# t\n## A1. 始め方\n### B2．名前\n## 各項目\n')]).toEqual(['A1', 'B2']);
  const r = judge(
    [
      { key: 'css + .x', server: '', desk: 'a' },
      { key: 'css .y {top}', server: '0', desk: '1' },
    ],
    new Map([
      ['css + .x', 'A1'],
      ['css + .gone', 'A3'],
    ]),
    new Set(['A1']),
  );
  expect(r).toEqual({ unexplained: [{ key: 'css .y {top}', server: '0', desk: '1' }], stale: ['css + .gone'], unknown: ['A3'] });
});
