import { describe, test, expect } from 'vitest';
import { historyDraft, historyListHtml, snapshotted, versionHtml, versionsOf, SNAPSHOT_EVERY, SNAPSHOTS_KEPT } from '../../lib/history.js';
import { diffHtml } from '../../lib/diff.js';

describe('history', () => {
  // FR-HIST-04
  test('snapshotted: one version every 10 minutes of writing; none for the same text; forced before a version is put back; the oldest go', () => {
    expect(SNAPSHOT_EVERY).toBe(600000);
    const one = snapshotted([], 'a', 1000);
    expect(one).toEqual([{ at: 1000, text: 'a' }]);
    expect(snapshotted(one, 'ab', 1000 + SNAPSHOT_EVERY - 1)).toBe(one);
    expect(snapshotted(one, 'ab', 1000 + SNAPSHOT_EVERY)).toEqual([...one, { at: 1000 + SNAPSHOT_EVERY, text: 'ab' }]);
    expect(snapshotted(one, 'a', 1000 + 2 * SNAPSHOT_EVERY)).toBe(one);
    expect(snapshotted(one, 'ab', 1001, true)).toEqual([...one, { at: 1001, text: 'ab' }]);
    const full = Array.from({ length: SNAPSHOTS_KEPT }, (_, i) => ({ at: i, text: String(i) }));
    const next = snapshotted(full, 'new', 10 ** 9);
    expect(next.length).toBe(SNAPSHOTS_KEPT);
    expect(next[0].text).toBe('1');
  });
  // FR-HIST-01
  test('versionsOf: the draft first, then the versions of this device and of GitHub, the newest first', () => {
    const commits = [
      { sha: 'c2', commit: { message: '10/2 二\n\n本文', committer: { date: '2026-10-02T00:00:00Z' } } },
      { sha: 'c1', commit: { message: '10/1 一', committer: { date: 'bad' } } },
    ];
    const at = Date.parse('2026-10-01T12:00:00Z');
    expect(versionsOf({ draft: { text: 'd', at: 9e12 }, snapshots: [{ at, text: 's' }], commits })).toEqual([
      { kind: 'here', at: 9e12, subject: '', text: 'd', ref: '' },
      { kind: 'github', at: Date.parse('2026-10-02T00:00:00Z'), subject: '10/2 二', text: null, ref: 'c2' },
      { kind: 'snapshot', at, subject: '', text: 's', ref: '' },
      { kind: 'github', at: 0, subject: '10/1 一', text: null, ref: 'c1' },
    ]);
    expect(versionsOf({ draft: null, snapshots: [], commits: [] })).toEqual([]);
  });
});

// FR-HIST-01: the version not sent yet, at the top of the history
test('historyDraft: a draft with a text; none for an operation’s file with no text, or no draft', () => {
  expect(historyDraft({ text: '本文', at: 5, sha: 'x' })).toEqual({ text: '本文', at: 5 });
  expect(historyDraft({ at: 5 })).toBe(null);
  expect(historyDraft(undefined)).toBe(null);
});

// FR-HIST-01, FR-HIST-02: the screen 履歴
describe('the screen 履歴', () => {
  const now = Date.parse('2026-10-27T05:00:00Z');
  /** @type {import('../../lib/history.js').Version[]} */
  const versions = [
    { kind: 'here', at: now - 60000, subject: '', text: '今の<', ref: '' },
    { kind: 'snapshot', at: now - 120000, subject: '', text: '前', ref: '' },
    { kind: 'github', at: now - 180000, subject: '第1話 +10字<', text: null, ref: 'c1' },
    { kind: 'github', at: now - 240000, subject: '読んだ', text: '読んだ本文', ref: 'c2' },
  ];
  test('historyListHtml: this device’s versions, GitHub’s (its tab on), each with when, its kind, length and subject', () => {
    const local = historyListHtml(versions, 'local', '', '話', now);
    expect(local).toContain('<button data-tab="local" class="on">ローカル履歴（2）</button>');
    expect(local).toContain('<button data-tab="github" class="">GitHub 履歴（2）</button>');
    expect(local).toContain('<button class="version" data-v="0"><b>');
    expect(local).toContain('（1 分前）<span class="tag">未送信</span></b><small>3 字</small>');
    expect(local).toContain('<span class="tag">自動</span></b><small>1 字</small>');
    expect(local).not.toContain('data-v="2"');
    const remote = historyListHtml(versions, 'github', '', '話', now);
    expect(remote).toContain('<button data-tab="github" class="on">');
    expect(remote).toContain('<button class="version" data-v="2"><b>');
    expect(remote).toContain('<span class="tag">GitHub</span></b><small>第1話 +10字&lt;</small>');
    expect(remote).toContain('<small>5 字 ・ 読んだ</small>');
    expect(historyListHtml(versions, 'local', '', '話')).toContain('data-v="1"');
  });
  test('historyListHtml: none here, said; GitHub’s not read (why), or none (not sent yet)', () => {
    expect(historyListHtml([], 'local', 'x', '話', now)).toContain('まだローカルの履歴はありません。書いていると、10 分おきに自動で残ります。');
    expect(historyListHtml([], 'local', 'x', '話', now)).not.toContain('class="error"');
    const failed = historyListHtml([], 'github', '<オフライン>', '資料', now);
    expect(failed).toContain('<p class="error">GitHub の履歴を読めませんでした: &lt;オフライン&gt;</p>');
    expect(failed).not.toContain('履歴はありません');
    expect(historyListHtml([], 'github', '', '資料<', now)).toContain('GitHub にこの資料&lt;の履歴はありません（まだ送っていません）。');
  });
  test('versionHtml: the changes from the one before and to the text now, the whole text, as the view chooses', () => {
    const [html] = diffHtml('前', '今の<');
    const v = versionHtml({ v: versions[0], i: 0, text: '今の<', before: versions[1], was: '前', now: '今の<', view: 'now', at: now });
    expect(v).toContain('3 字 ・ まだ送っていない版</span>');
    expect(v).toContain(
      '<button data-view="before" class="">前と比べる</button><button data-view="now" class="on">今と比べる</button><button data-view="text" class="">全文</button>',
    );
    expect(v).toContain(`<div class="version-diff" data-for="before" hidden><p class="muted small">前の版（`);
    expect(v).toContain('（2 分前）、1 字）からこの版までの変更：1 か所</p>');
    expect(v).toContain(`<div class="diff">${html}</div></div>`);
    expect(v).toContain('<div class="version-diff" data-for="now"><p class="muted small">この版から今の本文（3 字）までの変更：ありません</p></div>');
    expect(v).toContain('<textarea class="version-text" readonly aria-label="この版の全文" hidden>今の&lt;</textarea>');
    expect(v).toContain('<button class="primary restore-history" data-restore="0">この版を復元</button>');
  });
  test('versionHtml: none before; the whole text shown; the kinds said', () => {
    const v = versionHtml({ v: versions[3], i: 3, text: '読んだ本文', before: undefined, was: null, now: '読んだ本文と今', view: 'text', at: now });
    expect(v).toContain('5 字 ・ GitHub</span>');
    expect(v).toContain('<p class="muted small">これより前の版はありません。</p>');
    expect(v).toContain('までの変更：1 か所</p><div class="diff">');
    expect(v).toContain('aria-label="この版の全文">読んだ本文</textarea>');
    expect(v).toContain('data-for="before" hidden');
    const s = versionHtml({ v: versions[1], i: 1, text: '前', before: versions[2], was: '前', now: '前', view: 'before' });
    expect(s).toContain('1 字 ・ 自動のスナップショット</span>');
    expect(s).toContain('からこの版までの変更：ありません</p></div>');
    expect(s).toContain('<div class="version-diff" data-for="before"><p');
  });
});
