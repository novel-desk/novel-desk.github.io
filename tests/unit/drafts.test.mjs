import { describe, test, expect } from 'vitest';
import { draftKey, draftOf, afterHeld, afterSend, goneWhileSent, keptAfterSend, sameVersion, typedOver } from '../../lib/drafts.js';

describe('drafts', () => {
  // FR-SAVE-01: a draft sent is deleted from the device only while it is still the version this page wrote; another
  // tab's written since (another text, or the same text written again) stays
  test('sameVersion: the same text written at the same time; none kept, another text or another time: not', () => {
    const mine = { repo: 'o/r', path: 'a.md', base: 'b1', text: '書いた', at: 10 };
    expect(sameVersion({ ...mine }, mine)).toBe(true);
    expect(sameVersion(undefined, mine)).toBe(false);
    expect(sameVersion({ ...mine, text: '別のタブ' }, mine)).toBe(false);
    expect(sameVersion({ ...mine, at: 11 }, mine)).toBe(false);
  });
  test('draftKey: one for each repository and path', () => {
    expect(draftKey('o/r', 'a/01.md')).toBe('o/r\na/01.md');
  });
  test('draftOf: the text typed with the blob it was written from; none when it is the text read', () => {
    const typed = { repo: 'o/r', path: '01.md', base: 's1', read: '元', text: '元と足した', at: 5 };
    expect(draftOf(typed)).toEqual({ repo: 'o/r', path: '01.md', base: 's1', text: '元と足した', at: 5 });
    expect(draftOf({ ...typed, text: '元' })).toBeNull();
  });
  // FR-SAVE-01, FR-SAVE-04, FR-SAVE-08: typed while the send was on its way, put in the text sent, nothing of either lost
  test('afterSend: gone when nothing was typed since; else written from the new blob; the text sent put together with the one there: what was typed since put in it line by line', () => {
    const draft = { repo: 'o/r', path: '01.md', base: 's1', text: '送った\n', at: 5 };
    expect(afterSend(draft, '送った\n', 's2', '送った\n')).toBeNull();
    expect(afterSend(draft, '送った\n', 's2', 'ほかで\n送った\n')).toBeNull();
    const more = { ...draft, text: '送った\n後も\n' };
    expect(afterSend(more, '送った\n', 's2', '送った\n')).toEqual({ ...more, base: 's2' });
    // (the text sent as it was taken: what was typed as it is, its line ends too)
    const crlf = { ...draft, text: '送った\r\n後も\r\n' };
    expect(afterSend(crlf, '送った\n', 's2', '送った\n')).toEqual({ ...crlf, base: 's2' });
    expect(afterSend(more, '送った\n', 's2', 'ほかで\n送った\n')).toEqual({ ...more, base: 's2', text: 'ほかで\n送った\n後も\n' });
  });
  // FR-SAVE-04, FR-SAVE-05, DESK-SAVE-01: a text held back (places side by side in it) stays on the device, on the blob there now
  test('afterHeld: still what was taken, the text with the places side by side, written from the blob there; typed on meanwhile, as it is', () => {
    const draft = { repo: 'o/r', path: '01.md', base: 's1', text: '送った\n', at: 5, branch: 'main' };
    expect(afterHeld(draft, '送った\n', '並べた\n', 's2')).toEqual({ ...draft, base: 's2', text: '並べた\n' });
    const more = { ...draft, text: '送った\n後も\n' };
    expect(afterHeld(more, '送った\n', '並べた\n', 's2')).toBe(more);
  });
  // FR-SAVE-01, FR-SAVE-04, DESK-SAVE-01: the texts held back kept on the device as it has them now, nothing typed lost
  test('keptAfterSend: a text held back, the text with places side by side where it goes; typed on meanwhile, as typed where it is; gone meanwhile, none; another text gone to its path stays', () => {
    const d = (/** @type {string} */ path, /** @type {string} */ text) => ({ repo: 'o/r', path, base: 's1', text, at: 5 });
    const a = d('a.md', '書いた\n');
    const held = (/** @type {any} */ draft, to = draft.path) => ({ draft, to, text: '並べた\n', theirs: 's2' });
    // (still what was taken: the text with the places side by side, on the blob there, where it goes)
    expect(keptAfterSend(new Map([['a.md', a]]), new Map([['a.md', a]]), [held(a)])).toEqual(new Map([['a.md', { ...a, base: 's2', text: '並べた\n' }]]));
    expect(keptAfterSend(new Map([['a.md', a]]), new Map([['a.md', a]]), [held(a, 'b.md')])).toEqual(
      new Map([['b.md', { ...a, path: 'b.md', base: 's2', text: '並べた\n' }]]),
    );
    // (typed on meanwhile: as typed, where it is)
    const more = d('a.md', '書いた\n後も\n');
    const typed = keptAfterSend(new Map([['a.md', more]]), new Map([['a.md', more]]), [held(a, 'b.md')]);
    expect(typed).toEqual(new Map([['a.md', more]]));
    expect(typed.get('a.md')).toBe(more);
    // (gone from the device meanwhile: none)
    expect(keptAfterSend(new Map(), new Map(), [held(a)])).toEqual(new Map());
    // (another text gone to its path by the send: it stays there; the one held back goes where it goes)
    const other = d('a.md', 'ほかの話\n');
    expect(keptAfterSend(new Map([['a.md', other]]), new Map([['a.md', a]]), [held(a, 'b.md')])).toEqual(
      new Map([
        ['a.md', other],
        ['b.md', { ...a, path: 'b.md', base: 's2', text: '並べた\n' }],
      ]),
    );
    // (what is left of the others as it was)
    const c = d('c.md', '別\n');
    expect(keptAfterSend(new Map([['c.md', c]]), new Map(), [])).toEqual(new Map([['c.md', c]]));
  });
  // FR-SAVE-01
  test('goneWhileSent: a text typed back to the one read while it was sent is that text read; an operation as it was sent', () => {
    const draft = { repo: 'o/r', path: '01.md', base: 's1', text: '送った', at: 5 };
    expect(goneWhileSent(draft, '元')).toEqual({ ...draft, text: '元' });
    const op = { repo: 'o/r', path: '02.md', base: '', sha: 's1', op: 'op1', at: 1 };
    expect(goneWhileSent(op, '元')).toBe(op);
  });
  test("typedOver: a file an operation put there keeps being that operation's, with the text typed", () => {
    const moved = { repo: 'o/r', path: '02.md', base: '', sha: 's1', from: { path: '01.md', base: 's1' }, op: 'op1', auto: true, at: 1 };
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
    expect(afterSend(gone, undefined, '', undefined)).toBeNull();
    const typed = { repo: 'o/r', path: '02.md', base: '', text: '後で', from: { path: '01.md', base: 's1' }, op: 'op1', at: 7 };
    expect(afterSend(typed, '先に', 's2', '先に')).toEqual({ repo: 'o/r', path: '02.md', base: 's2', text: '後で', at: 7 });
    // (a change with no text, an operation's made while the send was on its way, which the desk does not make then:
    // as it is)
    expect(afterSend(gone, '先に', 's2', 'ほかで\n先に')).toBe(gone);
  });
});
