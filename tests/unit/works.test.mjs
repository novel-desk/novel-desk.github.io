import { describe, test, expect } from 'vitest';
import { stillHolds, summaryOf, visibilityTag } from '../../lib/works.js';
import { viewOf } from '../../lib/view.js';

const read = config => ({
  blobs: { 'novel.toml': { sha: 'cfg', mode: '100644' }, '01.md': { sha: 's1', mode: '100644' }, '02.md': { sha: 's2', mode: '100644' } },
  config,
  problems: [],
  texts: { '01.md': '# 第1話 一\n\nあい う', '02.md': null },
  shaTexts: {},
});

describe('works', () => {
  // FR-WORK-01
  test('summaryOf: the title, the length counted as the desk counts it, the episodes, the last change', () => {
    expect(summaryOf(viewOf(read('title = "試験の題"\n'), new Map(), []), 'o/r', 100, [])).toEqual({ title: '試験の題', chars: 8, count: 2, updated: 100 });
    // no title: the repository's name; a change not sent counts, and is the last change
    const draft = { repo: 'o/r', path: '02.md', base: 's2', text: 'えお', at: 500 };
    expect(summaryOf(viewOf(read(null), new Map([['02.md', draft]]), []), 'o/r', 100, [draft])).toEqual({ title: 'r', chars: 10, count: 2, updated: 500 });
    expect(summaryOf(viewOf(read(null), new Map(), []), 'o/r', 0, []).updated).toBe(0);
  });
  // FR-WORK-01
  test('stillHolds: the same branch chosen, every ref where it was, no change not sent then or now', () => {
    const kept = {
      title: 't',
      chars: 1,
      count: 1,
      updated: 1,
      branch: 'main',
      chosen: '',
      heads: /** @type {[string, string][]} */ ([['main', 'c1']]),
      overlay: false,
    };
    expect(stillHolds(kept, '', ['c1'], false)).toBe(true);
    expect(stillHolds(kept, '', ['c2'], false)).toBe(false);
    expect(stillHolds(kept, '', ['c1', ''], false)).toBe(false);
    expect(stillHolds(kept, 'draft', ['c1'], false)).toBe(false);
    expect(stillHolds(kept, '', ['c1'], true)).toBe(false);
    expect(stillHolds({ ...kept, overlay: true }, '', ['c1'], false)).toBe(false);
    expect(stillHolds(null, '', ['c1'], false)).toBe(false);
    expect(stillHolds(undefined, '', [], false)).toBe(false);
  });
  // FR-GH-11
  test('visibilityTag: 公開 stands out; from `visibility`, else `private`; nothing when not known', () => {
    expect(visibilityTag({ visibility: 'public' })).toBe('<span class="vis public" title="GitHub のリポジトリの公開状態">公開</span>');
    expect(visibilityTag({ visibility: 'internal' })).toContain('組織内');
    expect(visibilityTag({ private: true })).toBe('<span class="vis private" title="GitHub のリポジトリの公開状態">非公開</span>');
    expect(visibilityTag({ private: false })).toContain('class="vis public"');
    expect(visibilityTag({})).toBe('');
    expect(visibilityTag({ visibility: 'odd' })).toBe('');
  });
});
