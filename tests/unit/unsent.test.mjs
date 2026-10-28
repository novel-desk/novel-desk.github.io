// 未送信の一覧 as it is drawn (lib/unsent.js)
import { test, expect } from 'vitest';
import { discardQuestion, parkedCards, unparkOf, unsentRows } from '../../lib/unsent.js';

/** @param {string} path */
const said = path => (path === 'ep/001.md' ? '第1話<' : path);

// FR-SAVE-09: each change not sent read before it is given up
test('unsentRows: a text by its title; an operation with what it adds, deletes, changes, moves, and the keys it sets', () => {
  const html = unsentRows(
    [
      { kind: 'text', path: 'ep/001.md' },
      {
        kind: 'op',
        op: 'o1',
        keys: 2,
        changes: [
          { repo: 'a/b', path: 'ep/002.md', base: '', at: 1, op: 'o1', text: '' },
          { repo: 'a/b', path: 'ep/003.md', base: 's3', at: 1, op: 'o1', gone: true },
          { repo: 'a/b', path: 'ep/004.md', base: 's4', at: 1, op: 'o1', text: 'x' },
          { repo: 'a/b', path: 'ep/new.md', base: '', at: 1, op: 'o1', from: { path: 'ep/005.md', base: 's5' } },
        ],
      },
      { kind: 'op', op: 'o2', keys: 0, changes: [{ repo: 'a/b', path: 'ep/001.md', base: '', at: 1, op: 'o2', text: '' }] },
    ],
    said,
  );
  expect(html).toContain('<b>第1話&lt;</b><small>書いた文章</small></div><button class="ghost danger" data-discard="0">');
  expect(html).toContain('ep/002.md（追加）<br>ep/003.md（削除）<br>ep/004.md（書き換え）<br>ep/005.md → ep/new.md<br>novel.toml の設定 2 か所</small>');
  expect(html).toContain('data-discard="1"');
  expect(html).toContain('<small>第1話&lt;（追加）</small>');
  expect(html).not.toContain('novel.toml の設定 0');
});
// FR-SAVE-09: a text set aside: sent beside GitHub's, put in the episode open, or given up
test('parkedCards: the text whole, when and why it was set aside; 送信 only when synced, 挿入 only with an episode open', () => {
  const now = Date.parse('2026-10-27T05:00:00Z');
  const d = { repo: 'a/b', path: 'ep/<1>.md', base: '', at: now - 120000, text: '本文&', parked: '削除されていた', aside: 'x' };
  const both = parkedCards([d], { send: true, put: true }, now);
  expect(both).toContain('<b>ep/&lt;1&gt;.md</b>');
  expect(both).toContain('（2 分前） に保留');
  expect(both).toContain('削除されていたため、送れませんでした');
  expect(both).toContain('readonly>本文&amp;</textarea>');
  expect(both).toContain('data-unpark-send="0"');
  expect(both).toContain('data-unpark-put="0"');
  expect(both).toContain('data-unpark-drop="0"');
  const neither = parkedCards([d, d], { send: false, put: false }, now);
  expect(neither).not.toContain('data-unpark-send');
  expect(neither).not.toContain('data-unpark-put');
  expect(neither).toContain('data-unpark-drop="1"');
  expect(parkedCards([d], { send: true, put: true })).toContain('に保留');
});
test('discardQuestion: an operation (its texts stay), a text by its title (back to GitHub’s, kept in the history)', () => {
  expect(discardQuestion({ kind: 'op', op: 'o', changes: [], keys: 0 }, said)).toBe('この操作を取り消しますか？（その中で書いた文章は、元の話に残ります）');
  expect(discardQuestion({ kind: 'text', path: 'ep/001.md' }, said)).toBe(
    '「第1話<」に書いた文章を捨てますか？（GitHub の版に戻ります。捨てた文章はこの端末の履歴に残ります）',
  );
});
test('unparkOf: which button of which card', () => {
  expect(unparkOf({ unparkSend: '2' })).toEqual({ how: 'send', i: 2 });
  expect(unparkOf({ unparkPut: '0' })).toEqual({ how: 'put', i: 0 });
  expect(unparkOf({ unparkDrop: '1' })).toEqual({ how: 'drop', i: 1 });
});
