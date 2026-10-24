// The record of a work's writing, drawn (no screen of its own: ui/record.js shows it; tested by itself in tests/unit;
// from the server version's public/lib/record.js, and the points from its src/record.rs).
// A point is a day ("2026-10-23") or a month ("2026-10") with the characters at its end and what it added (null for
// the first one, whose start is not known): src/record.rs.

/** @typedef {{ at: string, chars: number, added: number | null }} Point */
/** @typedef {{ at: string, added: number }} Bar */

const DAY = 86400000;
/** @type {(at: string) => number} */
const timeOf = at => Date.parse(`${at}T00:00:00Z`);
/** @type {(t: number) => string} */
const dayOf = t => new Date(t).toISOString().slice(0, 10);

/**
 * The last `count` days up to the last point's day, each one: a day with no point added nothing (the work did not
 * change); the first point adds nothing either (its start is not known).
 * @param {Point[]} days @param {number} count @returns {Bar[]}
 */
export function lastDays(days, count) {
  if (!days.length) return [];
  const by = new Map(days.map(p => [p.at, p.added ?? 0]));
  const until = timeOf(days[days.length - 1].at);
  return Array.from({ length: count }, (_, i) => {
    const at = dayOf(until - (count - 1 - i) * DAY);
    return { at, added: by.get(at) ?? 0 };
  });
}

/**
 * Every month from the first point's to the last's, each one (as lastDays).
 * @param {Point[]} months @returns {Bar[]}
 */
export function allMonths(months) {
  if (!months.length) return [];
  const by = new Map(months.map(p => [p.at, p.added ?? 0]));
  const [y0, m0] = months[0].at.split('-').map(Number);
  const [y1, m1] = months[months.length - 1].at.split('-').map(Number);
  const count = (y1 - y0) * 12 + (m1 - m0) + 1;
  return Array.from({ length: count }, (_, i) => {
    const y = y0 + Math.floor((m0 - 1 + i) / 12),
      m = ((m0 - 1 + i) % 12) + 1;
    const at = `${y}-${String(m).padStart(2, '0')}`;
    return { at, added: by.get(at) ?? 0 };
  });
}

/** @type {(x: number) => string} */
const signed = x => (x > 0 ? `＋${x.toLocaleString('ja-JP')}` : x < 0 ? `−${(-x).toLocaleString('ja-JP')}` : '0');

/**
 * A bar chart of what each day or month added, as SVG: the bars above the line grew, those below shrank. Each bar
 * says its day and its count (its title). The largest growth and shrinking are written in a row above the bars, the
 * first and the last day in a row under them: no label lies over a bar.
 * @param {Bar[]} bars @returns {string}
 */
export function barChart(bars) {
  if (!bars.length) return '';
  const W = 320,
    H = 150,
    row = 16;
  const up = Math.max(0, ...bars.map(b => b.added)),
    down = Math.max(0, ...bars.map(b => -b.added));
  const span = up + down || 1;
  // the bars between the two rows; the line at zero where the room above and below is as the largest bars ask
  const scale = (H - row * 2) / span;
  const zero = row + up * scale;
  const step = W / bars.length;
  const rects = bars
    .map((b, i) => {
      const h = Math.abs(b.added) * scale,
        y = b.added >= 0 ? zero - h : zero;
      return `<rect class="${b.added >= 0 ? 'rec-up' : 'rec-down'}" x="${(i * step + step * 0.15).toFixed(1)}" y="${y.toFixed(1)}" width="${(step * 0.7).toFixed(1)}" height="${h.toFixed(1)}"><title>${b.at} ${signed(b.added)}字</title></rect>`;
    })
    .join('');
  const last = bars[bars.length - 1];
  const least = down ? `<text class="rec-label" x="${W}" y="${row - 4}" text-anchor="end">最小 ${signed(-down)}字</text>` : '';
  return `<svg class="rec-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="増えた字数のグラフ">
<text class="rec-label" x="0" y="${row - 4}">最大 ${signed(up)}字</text>${least}
<line class="rec-zero" x1="0" x2="${W}" y1="${zero.toFixed(1)}" y2="${zero.toFixed(1)}"/>${rects}
<text class="rec-label" x="0" y="${H - 3}">${bars[0].at}</text><text class="rec-label" x="${W}" y="${H - 3}" text-anchor="end">${last.at}</text></svg>`;
}

export { signed };

// --- the points (the server version's src/record.rs), from the characters noted at each day's end

// the day in Japan of a time: 「2026-10-24」
/** @param {number} ms */
export const japanDate = ms => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
/**
 * Each day's and each month's points from the characters at the end of each day (by day): what each added is its
 * count less the one before (null for the first)
 * @param {Record<string, number>} ends @returns {{ days: Point[], months: Point[] }}
 */
export function daysAndMonths(ends) {
  /** @param {[string, number][]} list */
  const added = list => {
    /** @type {number | null} */
    let before = null;
    return list.map(([at, chars]) => {
      const p = { at, chars, added: before === null ? null : chars - before };
      before = chars;
      return p;
    });
  };
  const days = Object.entries(ends).sort(([a], [b]) => (a < b ? -1 : 1));
  /** @type {Map<string, number>} */
  const months = new Map();
  for (const [day, n] of days) months.set(day.slice(0, 7), n);
  return { days: added(days), months: added([...months]) };
}
// Each day's last commit before today (Japan time), from the commits of a branch as the REST API lists them (the
// newest first): the days before this device kept the record are counted from these
/** @param {{ sha: string, commit: { committer: { date: string } } }[]} commits @param {string} today @returns {{ day: string, sha: string }[]} */
export function lastOfDays(commits, today) {
  /** @type {Map<string, { at: number, sha: string }>} */
  const last = new Map();
  for (const c of commits) {
    const at = Date.parse(c.commit.committer.date);
    if (Number.isNaN(at)) continue;
    const day = japanDate(at);
    if (day >= today) continue;
    if (!last.has(day) || /** @type {{ at: number }} */ (last.get(day)).at < at) last.set(day, { at, sha: c.sha });
  }
  return [...last].sort(([a], [b]) => Number(a > b) - Number(a < b)).map(([day, { sha }]) => ({ day, sha }));
}
