import { describe, test, expect } from 'vitest';
import { draftKey, draftOf, afterSend, typedOver } from '../../lib/drafts.js';

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
  test("typedOver: a file an operation put there keeps being that operation's, with the text typed", () => {
    const moved = { repo: 'o/r', path: '02.md', base: '', sha: 's1', from: { path: '01.md', base: 's1' }, op: 'op1', at: 1 };
    expect(typedOver(moved, '書いた', 5)).toEqual({
      repo: 'o/r',
      path: '02.md',
      base: '',
      from: { path: '01.md', base: 's1' },
      op: 'op1',
      text: '書いた',
      at: 5,
    });
  });
  test('afterSend: a change of an operation goes once sent; with a text typed since, a draft of the blob sent', () => {
    const gone = { repo: 'o/r', path: '01.md', base: 's1', gone: true, op: 'op1', at: 1 };
    expect(afterSend(gone, undefined, '', false)).toBeNull();
    const typed = { repo: 'o/r', path: '02.md', base: '', text: '後で', from: { path: '01.md', base: 's1' }, op: 'op1', at: 7 };
    expect(afterSend(typed, '先に', 's2', false)).toEqual({ repo: 'o/r', path: '02.md', base: 's2', text: '後で', at: 7 });
  });
});
