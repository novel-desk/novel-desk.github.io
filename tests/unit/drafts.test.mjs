import { describe, test, expect } from 'vitest';
import { draftKey, draftOf, afterSend } from '../../lib/drafts.js';

describe('drafts', () => {
  test('draftKey: one for each repository and path', () => {
    expect(draftKey('o/r', 'a/01.md')).toBe('o/r\na/01.md');
  });
  test('draftOf: the text typed with the blob it was written from; none when it is the text read', () => {
    const typed = { repo: 'o/r', path: '01.md', base: 's1', read: '元', text: '元と足した', at: 5 };
    expect(draftOf(typed)).toEqual({ repo: 'o/r', path: '01.md', base: 's1', text: '元と足した', at: 5 });
    expect(draftOf({ ...typed, text: '元' })).toBeNull();
  });
  test('afterSend: gone when nothing was typed since; else written from the new blob, or from the old one after both were kept', () => {
    const draft = { repo: 'o/r', path: '01.md', base: 's1', text: '送った', at: 5 };
    expect(afterSend(draft, '送った', 's2', false)).toBeNull();
    expect(afterSend(draft, '送った', 's2', true)).toBeNull();
    const more = { ...draft, text: '送った後も' };
    expect(afterSend(more, '送った', 's2', false)).toEqual({ ...more, base: 's2' });
    expect(afterSend(more, '送った', 's2', true)).toBe(more);
  });
});
