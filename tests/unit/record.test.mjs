// FR-WORK-08: the record of a work's writing drawn (public/lib/record.js)
import { describe, expect, test } from 'vitest';
import { allMonths, barChart, daysAndMonths, japanDate, lastDays, lastOfDays, signed } from '../../lib/record.js';

describe('record', () => {
  test('the last days, each one: a day not kept added nothing, nor the first', () => {
    const days = [
      { at: '2026-09-29', chars: 100, added: null },
      { at: '2026-10-01', chars: 150, added: 50 },
      { at: '2026-10-02', chars: 120, added: -30 },
    ];
    expect(lastDays(days, 4)).toEqual([
      { at: '2026-09-29', added: 0 },
      { at: '2026-09-30', added: 0 },
      { at: '2026-10-01', added: 50 },
      { at: '2026-10-02', added: -30 },
    ]);
    expect(lastDays([], 30)).toEqual([]);
  });

  test('every month from the first to the last, over a year', () => {
    const months = [
      { at: '2025-11', chars: 10, added: null },
      { at: '2026-02', chars: 40, added: 30 },
    ];
    expect(allMonths(months).map(m => `${m.at} ${m.added}`)).toEqual(['2025-11 0', '2025-12 0', '2026-01 0', '2026-02 30']);
    expect(allMonths([])).toEqual([]);
  });

  test('the chart: bars above the line grew, below shrank, each with its day and count; the labels off the bars', () => {
    const svg = barChart([
      { at: '2026-10-01', added: 50 },
      { at: '2026-10-02', added: -30 },
      { at: '2026-10-03', added: 0 },
    ]);
    expect(svg.match(/class="rec-up"/g)).toHaveLength(2);
    expect(svg.match(/class="rec-down"/g)).toHaveLength(1);
    expect(svg).toContain('<title>2026-10-01 ＋50字</title>');
    expect(svg).toContain('<title>2026-10-02 −30字</title>');
    expect(svg).toContain('最大 ＋50字');
    expect(svg).toContain('最小 −30字');
    // the labels in their rows, the bars between them: none lies over a bar
    const ys = [...svg.matchAll(/<rect[^>]* y="([\d.]+)"[^>]* height="([\d.]+)"/g)].map(m => [Number(m[1]), Number(m[1]) + Number(m[2])]);
    const top = Math.min(...ys.map(([y]) => y)),
      bottom = Math.max(...ys.map(([, end]) => end));
    for (const [, y] of svg.matchAll(/<text[^>]* y="([\d.]+)"/g)) expect(Number(y) < top || Number(y) - 9 > bottom).toBe(true);
    expect(svg).toContain('>2026-10-03</text>');
    // nothing written: a flat line; nothing shrank: no least
    expect(barChart([{ at: '2026-10-01', added: 0 }])).toContain('rec-zero');
    expect(barChart([{ at: '2026-10-01', added: 5 }])).not.toContain('最小');
    expect(barChart([])).toBe('');
    expect(signed(1234)).toBe('＋1,234');
  });
});

// FR-WORK-08: the points from the characters at the end of each day (src/record.rs days_and_months)
describe('points', () => {
  test('japanDate: the day in Japan', () => {
    expect(japanDate(Date.parse('2026-10-23T15:00:00Z'))).toBe('2026-10-24');
  });
  test('daysAndMonths: each day and month with what it added (null for the first)', () => {
    expect(daysAndMonths({ '2026-10-02': 150, '2026-09-30': 100, '2026-10-05': 120 })).toEqual({
      days: [
        { at: '2026-09-30', chars: 100, added: null },
        { at: '2026-10-02', chars: 150, added: 50 },
        { at: '2026-10-05', chars: 120, added: -30 },
      ],
      months: [
        { at: '2026-09', chars: 100, added: null },
        { at: '2026-10', chars: 120, added: 20 },
      ],
    });
    expect(daysAndMonths({})).toEqual({ days: [], months: [] });
  });
  test("lastOfDays: each day's last commit before today, by day; a date that cannot be read left out", () => {
    const c = (sha, date) => ({ sha, commit: { committer: { date } } });
    expect(
      lastOfDays(
        [
          c('e', '2026-10-24T01:00:00Z'),
          c('d', '2026-10-22T01:00:00Z'),
          c('b', '2026-10-21T14:00:00Z'),
          c('c', '2026-10-21T16:00:00Z'),
          c('a', '2026-10-21T13:00:00Z'),
          c('f', '2026-10-20T00:00:00Z'),
          c('g', '2026-10-20T01:00:00Z'),
          c('x', 'bad'),
        ],
        '2026-10-24',
      ),
    ).toEqual([
      { day: '2026-10-20', sha: 'g' },
      { day: '2026-10-21', sha: 'b' },
      { day: '2026-10-22', sha: 'd' },
    ]);
  });
});
