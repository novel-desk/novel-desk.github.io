import { test, expect } from 'vitest';
import {
  bareTags,
  nextTag,
  pathOrder,
  releaseBody,
  releaseEpisodeHtml,
  releaseEpisodes,
  releaseEpisodesHtml,
  releaseLabel,
  releasesHtml,
  releasesOf,
} from '../../lib/releases.js';
import { firstLayout, tableOfContents } from '../../lib/layout.js';

// FR-REL-01, FR-REL-02
test('releaseLabel: trimmed, no control characters, 80 at most; nothing left is none', () => {
  expect(releaseLabel('  第一稿\u0007 ')).toBe('第一稿');
  expect([...(releaseLabel('あ'.repeat(90)) ?? '')].length).toBe(80);
  expect(releaseLabel(' \n ')).toBeNull();
});
test('nextTag: one more than the largest v and a number', () => {
  expect(nextTag([])).toBe('v1');
  expect(nextTag(['v2', 'v10', 'x', 'v3a'])).toBe('v11');
});
test('releasesOf: the releases of a tag v and a number, the newest first, their name or tag', () => {
  expect(
    releasesOf([
      { tag_name: 'v1', name: '第一稿', created_at: '2026-10-01T00:00:00Z' },
      { tag_name: 'draft', name: 'x', created_at: '2026-10-03T00:00:00Z' },
      { tag_name: 'v2', name: null, created_at: '2026-10-02T00:00:00Z' },
    ]),
  ).toEqual([
    { tag: 'v2', label: 'v2', date: '2026-10-02T00:00:00Z' },
    { tag: 'v1', label: '第一稿', date: '2026-10-01T00:00:00Z' },
  ]);
  // the tags v and a number without a release, by their tags (as the server version lists them)
  expect(
    releasesOf(
      [{ tag_name: 'v1', name: '第一稿', created_at: '2026-10-01T00:00:00Z' }],
      [
        { name: 'v1', date: '2026-09-30T00:00:00Z' },
        { name: 'v3', date: '2026-10-05T00:00:00Z' },
        { name: 'keep', date: '2026-10-06T00:00:00Z' },
      ],
    ),
  ).toEqual([
    { tag: 'v3', label: 'v3', date: '2026-10-05T00:00:00Z' },
    { tag: 'v1', label: '第一稿', date: '2026-10-01T00:00:00Z' },
  ]);
});
test('pathOrder: part by part, numbers as numbers; a folder before what is in it', () => {
  expect(['ms/10_b.md', 'ms/2_a/01.md', 'ms/2_a', 'ms/1.md'].sort(pathOrder)).toEqual(['ms/1.md', 'ms/2_a', 'ms/2_a/01.md', 'ms/10_b.md']);
});

// FR-REL-01: what the release says on GitHub
test('releaseBody: its name, the episodes and the characters', () => {
  expect(releaseBody('第一稿', [{ chars: 10 }, { chars: 5 }])).toBe('第一稿（2 話、15 字）');
  expect(releaseBody('空', [])).toBe('空（0 話、0 字）');
});
// FR-REL-02: the releases listed, and their episodes read
test('bareTags: the tags v and a number with no release', () => {
  expect(bareTags(['v1', 'v2', 'draft', 'v3'], [{ tag_name: 'v2' }])).toEqual(['v1', 'v3']);
});
test('releasesHtml: each with its tag and when; none, said', () => {
  const html = releasesHtml([{ tag: 'v1', label: '第一稿<', date: '2026-10-01T03:04:05Z' }]);
  expect(html).toBe(
    `<button class="version" data-tag="v1" data-label="第一稿&lt;"><b>第一稿&lt;</b><small>v1 ・ ${new Date('2026-10-01T03:04:05Z').toLocaleString('ja-JP')}</small></button>`,
  );
  expect(releasesHtml([])).toBe('<p class="muted">まだリリースはありません。「リリースを作成」で、いまの原稿を残せます。</p>');
});
test('releaseEpisodes: titles (the headings then), chapters, lengths and texts, in the order of the paths', () => {
  const l = { ...firstLayout(), heading: true };
  const toc = tableOfContents(l, ['10.md', '2_章/01.md', '02.md'], ['2_章']);
  const texts = { '10.md': '# 第10話 終\n本文', '2_章/01.md': '一話', '02.md': '二' };
  expect(releaseEpisodes(l, toc, texts)).toEqual([
    { path: '02.md', title: '第2話', chapter: '', chars: 1, text: '二' },
    { path: '2_章/01.md', title: '第1話', chapter: '章', chars: 2, text: '一話' },
    { path: '10.md', title: '終', chapter: '', chars: 8, text: '# 第10話 終\n本文' },
  ]);
});
test('releaseEpisodesHtml, releaseEpisodeHtml: the episodes (the chapter first); one read, put back only when it is here', () => {
  const e = { path: '2_章/01.md', title: '一<', chapter: '章', chars: 1200, text: '本文&' };
  expect(releaseEpisodesHtml([e, { ...e, chapter: '' }])).toBe(
    '<button class="ghost back-releases">‹ リリース一覧</button><button class="version" data-episode="0"><b>章 / 一&lt;</b><small>1,200 字</small></button><button class="version" data-episode="1"><b>一&lt;</b><small>1,200 字</small></button>',
  );
  expect(releaseEpisodeHtml('第一稿', e, 3, true)).toBe(
    '<button class="ghost back-release">‹ 第一稿</button><textarea class="version-text" readonly aria-label="リリースの本文">本文&amp;</textarea><button class="primary" data-restore="3">この話を今の原稿に復元</button>',
  );
  expect(releaseEpisodeHtml('第一稿', e, 3, false)).toContain('今の原稿には、同じ場所にこの話がありません');
  expect(releaseEpisodeHtml('第一稿', e, 3, false)).not.toContain('data-restore');
});
