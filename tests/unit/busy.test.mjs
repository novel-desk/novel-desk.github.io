import { test, expect } from 'vitest';
import { BUSY_WAIT, busyBand } from '../../lib/busy.js';

// a band that writes down what it was told, and a clock moved by hand
function fake() {
  /** @type {string[]} */
  const said = [];
  /** @type {{ f: () => void, at: number }[]} */
  let timers = [];
  let now = 0;
  const band = {
    show: (/** @type {string} */ t) => said.push(`show ${t}`),
    hide: () => said.push('hide'),
    later: (/** @type {() => void} */ f, /** @type {number} */ ms) => {
      const t = { f, at: now + ms };
      timers.push(t);
      return t;
    },
    cancel: (/** @type {unknown} */ t) => {
      timers = timers.filter(x => x !== t);
    },
  };
  /** @param {number} ms */
  const pass = ms => {
    now += ms;
    for (const t of timers.filter(x => x.at <= now)) {
      timers = timers.filter(x => x !== t);
      t.f();
    }
  };
  return { said, band, pass, pending: () => timers.length };
}
// an operation ended by hand
function held() {
  /** @type {(v: string) => void} */
  let done = () => {};
  /** @type {(e: Error) => void} */
  let fail = () => {};
  const p = new Promise((res, rej) => {
    done = res;
    fail = rej;
  });
  return { work: () => p, done, fail };
}

// DESK-OPS-05: shown only once the operation has taken longer than BUSY_WAIT
test('busyBand: nothing shown for an operation ending within the wait; shown after it, hidden when it ends', async () => {
  const { said, band, pass, pending } = fake();
  const busy = busyBand(band);
  const quick = held();
  const q = busy('読み込んでいます…', quick.work);
  pass(BUSY_WAIT - 1);
  quick.done('ok');
  expect(await q).toBe('ok');
  pass(10);
  expect(said).toEqual([]);
  expect(pending()).toBe(0);
  const slow = held();
  const s = busy('作成しています…', slow.work);
  pass(BUSY_WAIT);
  expect(said).toEqual(['show 作成しています…']);
  slow.done('made');
  expect(await s).toBe('made');
  expect(said).toEqual(['show 作成しています…', 'hide']);
});

// DESK-OPS-05: several at once: shown until the last ends, saying what the latest is doing
test('busyBand: several at once: one band, the latest text, hidden when the last ends', async () => {
  const { said, band, pass, pending } = fake();
  const busy = busyBand(band);
  const a = held(),
    b = held();
  const pa = busy('A', a.work);
  pass(100);
  const pb = busy('B', b.work);
  expect(pending()).toBe(1);
  pass(BUSY_WAIT);
  expect(said).toEqual(['show B']);
  const c = held();
  const pc = busy('C', c.work);
  expect(said).toEqual(['show B', 'show C']);
  c.done('');
  await pc;
  expect(said.at(-1)).toBe('show B');
  b.done('');
  await pb;
  expect(said.at(-1)).toBe('show A');
  a.done('');
  await pa;
  expect(said.at(-1)).toBe('hide');
  expect(said.filter(x => x === 'hide')).toHaveLength(1);
  // two both ending within the wait: nothing shown
  const d = held(),
    e = held();
  const pd = busy('D', d.work),
    pe = busy('E', e.work);
  d.done('');
  await pd;
  e.done('');
  await pe;
  pass(BUSY_WAIT);
  expect(said.at(-1)).toBe('hide');
});

// DESK-OPS-05: failed: the band hidden all the same, the failure passed on
test('busyBand: an operation failing hides the band and throws', async () => {
  const { said, band, pass } = fake();
  const busy = busyBand(band);
  const f = held();
  const p = busy('送信しています…', f.work);
  pass(BUSY_WAIT);
  f.fail(new Error('だめ'));
  await expect(p).rejects.toThrow('だめ');
  expect(said).toEqual(['show 送信しています…', 'hide']);
});

// DESK-OPS-05: a button given cannot be pressed meanwhile, and is put back as it was (failed or not)
test('busyBand: the button given is disabled while the operation runs, and put back as it was', async () => {
  const { band } = fake();
  const busy = busyBand(band);
  const button = { disabled: false };
  const ok = held();
  const p = busy('作成しています…', ok.work, button);
  expect(button.disabled).toBe(true);
  ok.done('');
  await p;
  expect(button.disabled).toBe(false);
  const bad = held();
  const q = busy('作成しています…', bad.work, button);
  expect(button.disabled).toBe(true);
  bad.fail(new Error('x'));
  await expect(q).rejects.toThrow('x');
  expect(button.disabled).toBe(false);
  // (disabled before: left disabled)
  const off = { disabled: true };
  await busy('…', async () => '', off);
  expect(off.disabled).toBe(true);
});
