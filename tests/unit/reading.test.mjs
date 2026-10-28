// The preview and the way to the next and previous episodes, decided (lib/reading.js)
import { describe, test, expect } from 'vitest';
import * as rd from '../../lib/reading.js';

describe('the preview', () => {
  // FR-EDIT-06: the way on at the preview's end
  test('episodeNav: the episodes before and after by title; none before, a space; none after, 最後の話です', () => {
    expect(rd.episodeNav({ title: '一<' }, { title: '三' })).toBe(
      '<nav class="ep-nav"><button class="ghost" data-go="-1">‹ 一&lt;</button><button class="ghost" data-go="1">三 ›</button></nav>',
    );
    expect(rd.episodeNav(null, null)).toBe('<nav class="ep-nav"><span></span><span class="muted small">最後の話です</span></nav>');
  });
  test('slideFrames: from and to along the axis, faded away from 0', () => {
    expect(rd.slideFrames('Y', 0, -25)).toEqual([
      { transform: 'translateY(0%)', opacity: 1 },
      { transform: 'translateY(-25%)', opacity: 0 },
    ]);
    expect(rd.slideFrames('X', 25, 0)).toEqual([
      { transform: 'translateX(25%)', opacity: 0 },
      { transform: 'translateX(0%)', opacity: 1 },
    ]);
  });
  test('scrollAfterMove: pulled back from the next, the end of this one above the way on; else the top', () => {
    const o = { atEnd: true, reading: true, navTops: [1000], height: 600 };
    expect(rd.scrollAfterMove(o)).toBe(440);
    expect(rd.scrollAfterMove({ ...o, navTops: [100] })).toBe(0);
    expect(rd.scrollAfterMove({ ...o, atEnd: false })).toBe(0);
    expect(rd.scrollAfterMove({ ...o, reading: false })).toBe(0);
    expect(rd.scrollAfterMove({ ...o, navTops: [] })).toBe(0);
  });
  // FR-EDIT-05: the place read kept when the preview is switched on and off
  test('placeAt, intoLine, scrollToPlace: the first line not above the top, how far into it; back to it', () => {
    const rows = [
      { line: 0, top: 0, height: 20 },
      { line: 2, top: 20, height: 40 },
      { line: 3, top: 60, height: 0 },
    ];
    expect(rd.placeAt(rows, 30)).toEqual({ line: 2, into: 0.25 });
    expect(rd.placeAt(rows, 0)).toEqual({ line: 0, into: 0 });
    expect(rd.placeAt(rows, 19)).toEqual({ line: 2, into: 0 });
    expect(rd.intoLine(70, 60, 0)).toBe(10);
    expect(rd.scrollToPlace([{ top: 20, height: 40 }], 0.25)).toBe(30);
    expect(rd.scrollToPlace([], 0.25)).toBe(0);
  });
});

// FR-EDIT-06: the hint, the pull past the end, the swipe, the wheel
describe('the way to the next and previous episodes', () => {
  test('hintStep: shown for the one asked; taken away only when it is the one shown', () => {
    expect(rd.hintStep(0, 1, true)).toEqual({ shown: 1, show: true, hide: false });
    expect(rd.hintStep(1, 1, false)).toEqual({ shown: 0, show: false, hide: true });
    expect(rd.hintStep(1, -1, false)).toEqual({ shown: 1, show: false, hide: false });
  });
  test('hintText, hintPlace: next over the bottom edge, previous under the top, in the middle', () => {
    const rect = { top: 100, bottom: 700, left: 50, width: 400 };
    expect(rd.hintText(1)).toBe('次の話へ移動');
    expect(rd.hintText(-1)).toBe('前の話へ移動');
    expect(rd.hintPlace(1, rect, 30)).toEqual({ top: 658, left: 250 });
    expect(rd.hintPlace(-1, rect, 30)).toEqual({ top: 112, left: 250 });
  });
  test('pullStart: only at an edge with an episode beyond it', () => {
    expect(rd.pullStart({ 1: true, '-1': false }, 500)).toEqual({ startY: 500, can: { 1: true, '-1': false }, edge: 0, ready: false });
    expect(rd.pullStart({ 1: false, '-1': true }, 500).startY).toBe(500);
    expect(rd.pullStart({ 1: false, '-1': false }, 500).startY).toBe(null);
  });
  test('pullMove, pullEnd: up past the bottom, ready past PULL, back under it; let go, moved on', () => {
    const at = { bottom: true, top: false };
    let p = rd.pullStart({ 1: true, '-1': false }, 500);
    let m = rd.pullMove(p, 500, at);
    expect(m).toEqual({ pull: { ...p, edge: 0, ready: false }, hints: [] });
    m = rd.pullMove(m.pull, 450, at);
    expect(m.pull.edge).toBe(1);
    expect(m.hints).toEqual([]);
    m = rd.pullMove(m.pull, 500 - rd.PULL - 1, at);
    expect(m.pull.ready).toBe(true);
    expect(m.hints).toEqual([[1, true]]);
    m = rd.pullMove(m.pull, 500 - rd.PULL - 5, at);
    expect(m.hints).toEqual([]);
    const back = rd.pullMove(m.pull, 480, at);
    expect(back.pull.ready).toBe(false);
    expect(back.hints).toEqual([[1, false]]);
    expect(rd.pullEnd(back.pull)).toEqual({ pull: { ...back.pull, startY: null, ready: false }, go: 0 });
    const ended = rd.pullEnd(m.pull);
    expect(ended.go).toBe(1);
    expect(ended.pull.startY).toBe(null);
    expect(ended.pull.ready).toBe(false);
    p = rd.pullStart({ 1: false, '-1': false }, 0);
    expect(rd.pullMove(p, 100, at)).toEqual({ pull: p, hints: [] });
  });
  test('pullMove: the other way, the hint taken away; an edge it cannot pull past; the edge left, given up', () => {
    const p = rd.pullStart({ 1: true, '-1': true }, 500);
    const up = rd.pullMove(p, 300, { bottom: true, top: true });
    expect(up.pull).toMatchObject({ edge: 1, ready: true });
    const down = rd.pullMove(up.pull, 800, { bottom: true, top: true });
    expect(down.hints).toEqual([
      [1, false],
      [-1, true],
    ]);
    expect(down.pull).toMatchObject({ edge: -1, ready: true });
    const none = rd.pullMove(rd.pullStart({ 1: true, '-1': false }, 500), 600, { bottom: true, top: true });
    expect(none.pull).toMatchObject({ edge: 0, ready: false, startY: 500 });
    const left = rd.pullMove(up.pull, 200, { bottom: false, top: true });
    expect(left).toEqual({ pull: { ...up.pull, startY: null, ready: false }, hints: [[1, false]] });
    const leftTop = rd.pullMove(down.pull, 900, { bottom: true, top: false });
    expect(leftTop.hints).toEqual([[-1, false]]);
  });
  test('swipeStart, swipeOf: one finger away from the left edge; far, sideways, nothing selected', () => {
    expect(rd.swipeStart(1, 25)).toBe(25);
    expect(rd.swipeStart(1, 24)).toBe(null);
    expect(rd.swipeStart(2, 100)).toBe(null);
    expect(rd.swipeOf(-71, 10, false)).toBe(1);
    expect(rd.swipeOf(71, -10, false)).toBe(-1);
    expect(rd.swipeOf(70, 0, false)).toBe(0);
    expect(rd.swipeOf(100, 50, false)).toBe(0);
    expect(rd.swipeOf(100, 0, true)).toBe(0);
  });
  test('wheelDir: down at the bottom with a next, up at the top with one before', () => {
    const both = { bottom: true, top: true };
    expect(rd.wheelDir(10, both, { next: true, prev: true })).toBe(1);
    expect(rd.wheelDir(10, both, { next: false, prev: true })).toBe(0);
    expect(rd.wheelDir(10, { bottom: false, top: true }, { next: true, prev: true })).toBe(0);
    expect(rd.wheelDir(-10, both, { next: true, prev: true })).toBe(-1);
    expect(rd.wheelDir(-10, { bottom: true, top: false }, { next: true, prev: true })).toBe(0);
    expect(rd.wheelDir(-10, both, { next: true, prev: false })).toBe(0);
    expect(rd.wheelDir(0, both, { next: true, prev: true })).toBe(0);
  });
  test('wheelStep: a turn started at the edge pushes on, the hint past 150, moved on past 400', () => {
    let s = rd.wheelStep(rd.WHEEL, 100, 1000, 1);
    expect(s).toEqual({ wheel: { pushed: 100, last: 1000, armed: 1 }, hints: [[1, false]], go: 0 });
    s = rd.wheelStep(s.wheel, 100, 1100, 1);
    expect(s.hints).toEqual([[1, true]]);
    s = rd.wheelStep(s.wheel, 250, 1200, 1);
    expect(s).toEqual({
      wheel: { pushed: 0, last: 1200, armed: 1 },
      hints: [
        [1, true],
        [1, false],
      ],
      go: 1,
    });
  });
  test('wheelStep: not past an edge, or a turn started elsewhere, or the other way: let go', () => {
    const still = rd.wheelStep({ pushed: 120, last: 1000, armed: 1 }, 10, 1100, 0);
    expect(still).toEqual({
      wheel: { pushed: 0, last: 1100, armed: 1 },
      hints: [
        [1, false],
        [-1, false],
      ],
      go: 0,
    });
    const notArmed = rd.wheelStep({ pushed: 0, last: 1000, armed: 0 }, 10, 1100, 1);
    expect(notArmed).toEqual({
      wheel: { pushed: 0, last: 1100, armed: 0 },
      hints: [
        [1, false],
        [-1, false],
      ],
      go: 0,
    });
    const other = rd.wheelStep({ pushed: -120, last: 1000, armed: 1 }, 50, 1100, 1);
    expect(other).toEqual({
      wheel: { pushed: 50, last: 1100, armed: 1 },
      hints: [
        [1, false],
        [-1, false],
        [1, false],
      ],
      go: 0,
    });
  });
});
