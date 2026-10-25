// Model-based tests (fast-check's commands): random sequences of what the author does on a device (type, add, rename,
// put in the trash and move an episode, send, read the work again) and of writes elsewhere, over the real lib/
// (changes, drafts, view, episodes), ui/send.js and ui/work.js with the fake GitHub (tests/props/lib/device.mjs).
// After every step: nothing typed or written elsewhere is lost, and after every send the lines of novel.toml written by
// hand are as they were and no file is taken away or changed that the send did not mean to
import { test, expect, vi } from 'vitest';
import fc from 'fast-check';
import * as db from './lib/memory-db.mjs';
import { Device, FakeGitHub, FakeRepo, FILES, HAND_LINES, fetchOver, headTexts, keptTexts } from './lib/device.mjs';
import * as plans from '../../lib/episodes.js';

vi.mock('../../ui/db.js', () => import('./lib/memory-db.mjs'));

const seed = process.env.NW_PROPS_SEED ? Number(process.env.NW_PROPS_SEED) : undefined;

/** @typedef {{ typed: string[], written: string[], n: number }} Model */
/** @typedef {{ device: Device, repo: FakeRepo }} Real */

/** @param {string[]} tokens @param {string[]} texts the tokens not in any of the texts */
const lost = (tokens, texts) => tokens.filter(t => !texts.some(x => x.includes(t)));
/** @param {Model} m @param {Real} r nothing typed or written elsewhere lost: on GitHub, or kept on the device */
function nothingLost(m, r) {
  const there = Object.values(headTexts(r.repo));
  expect(lost(m.written, there)).toEqual([]);
  expect(lost(m.typed, [...there, ...keptTexts(r.device)])).toEqual([]);
}
/** @param {Real} r @param {number} i the i-th episode the device shows (none: '') */
const episode = (r, i) => {
  const all = r.device.episodes();
  return all.length ? all[i % all.length] : '';
};
// an operation's plan applied, when it can be made (a plan refused, as the desk says it in a toast, changes nothing)
/** @param {Real} r @param {() => import('../../lib/episodes.js').Plan} make */
const operate = (r, make) => {
  /** @type {import('../../lib/episodes.js').Plan} */
  let plan;
  try {
    plan = make();
  } catch {
    return;
  }
  r.device.apply(plan);
};

/** @implements {fc.AsyncCommand<Model, Real>} */
class Type {
  /** @param {number} i */
  constructor(i) {
    this.i = i;
  }
  check = () => true;
  /** @param {Model} m @param {Real} r */
  async run(m, r) {
    const path = episode(r, this.i);
    if (!path) return;
    const t = `〈打${++m.n}〉`;
    m.typed.push(t);
    r.device.type(path, `${r.device.view().texts[path] ?? ''}${t}`);
    nothingLost(m, r);
  }
  toString = () => `Type(${this.i})`;
}
/** @implements {fc.AsyncCommand<Model, Real>} */
class Elsewhere {
  /** @param {number} i */
  constructor(i) {
    this.i = i;
  }
  check = () => true;
  /** @param {Model} m @param {Real} r */
  async run(m, r) {
    const files = Object.keys(headTexts(r.repo)).filter(p => p.startsWith('chapters/') && !p.includes(plans.TRASH));
    if (!files.length) return;
    const path = files[this.i % files.length];
    const t = `〔他${++m.n}〕`;
    m.written.push(t);
    r.repo.push({ [path]: `${r.repo.text(path)}${t}` });
    nothingLost(m, r);
  }
  toString = () => `Elsewhere(${this.i})`;
}
/** @implements {fc.AsyncCommand<Model, Real>} */
class Operation {
  /** @param {'add' | 'rename' | 'trash' | 'up' | 'down'} kind @param {number} i */
  constructor(kind, i) {
    Object.assign(this, { kind, i });
  }
  check = () => true;
  /** @param {Model} m @param {Real} r */
  async run(m, r) {
    const d = r.device,
      path = episode(r, this.i);
    if (this.kind === 'add') operate(r, () => plans.addEpisode(d.shown(), '', `新${++m.n}`));
    else if (!path) return;
    else if (this.kind === 'rename') operate(r, () => plans.rename(d.shown(), path, `題${++m.n}`));
    else if (this.kind === 'trash') operate(r, () => plans.trash(d.shown(), path, Date.UTC(2026, 9, 1) + ++m.n * 1000));
    else {
      const want = plans.moveBy(plans.orderOf(d.shown().toc), path, this.kind === 'up' ? -1 : 1);
      if (want) operate(r, () => plans.reorder(d.shown(), want));
    }
    nothingLost(m, r);
  }
  toString = () => `Operation(${this.kind}, ${this.i})`;
}
/** @implements {fc.AsyncCommand<Model, Real>} */
class Send {
  check = () => true;
  /** @param {Model} m @param {Real} r */
  async run(m, r) {
    const before = r.repo.refs.main;
    const taken = new Map(r.device.changes);
    let sent;
    try {
      sent = await r.device.send();
    } catch {
      // (not sent: an operation over a file changed elsewhere, said; nothing moved on GitHub)
      expect(r.repo.refs.main).toBe(before);
      nothingLost(m, r);
      return;
    }
    // the lines of novel.toml written by hand, as they were
    const toml = /** @type {string} */ (r.repo.text('novel.toml')).split('\n');
    for (const line of HAND_LINES) expect(toml).toContain(line);
    // nothing taken away or changed that the send did not mean to: a file of the commit it went on that no change sent
    // was about is there as it was
    const parent = /** @type {string} */ (r.repo.head().parents[0]);
    const was = r.repo.files(parent),
      now = r.repo.files(r.repo.refs.main);
    const meant = new Set([...sent.sent.map(s => s.draft.path), 'novel.toml']);
    for (const [path, e] of Object.entries(was)) if (!meant.has(path)) expect(now[path]?.sha, path).toBe(e.sha);
    for (const path of Object.keys(was)) if (!now[path]) expect(taken.get(path)?.gone, path).toBe(true);
    nothingLost(m, r);
  }
  toString = () => 'Send';
}
/** @implements {fc.AsyncCommand<Model, Real>} */
class ReadIn {
  check = () => true;
  /** @param {Model} m @param {Real} r */
  async run(m, r) {
    await r.device.readIn();
    nothingLost(m, r);
  }
  toString = () => 'ReadIn';
}

const commands = [
  fc.nat(5).map(i => new Type(i)),
  fc.nat(5).map(i => new Elsewhere(i)),
  fc.tuple(fc.constantFrom(/** @type {const} */ ('add'), 'rename', 'trash', 'up', 'down'), fc.nat(5)).map(([k, i]) => new Operation(k, i)),
  fc.constant(new Send()),
  fc.constant(new ReadIn()),
];

// FR-SAVE-01, FR-SAVE-04, FR-SAVE-06, FR-TOC-02〜05, NFR-COMP-02, NFR-MAINT-02
test('typed, operated, sent, read again and written elsewhere in any order: nothing lost, novel.toml’s own lines kept, no file taken that was not meant', async () => {
  await fc.assert(
    fc.asyncProperty(fc.commands(commands, { maxCommands: 30 }), async cmds => {
      db.reset();
      const repo = new FakeRepo('author/novel', FILES);
      globalThis.fetch = fetchOver(new FakeGitHub([repo]));
      const device = await new Device(repo).open();
      /** @type {Model} */
      const m = { typed: [], written: [], n: 0 };
      await fc.asyncModelRun(() => ({ model: m, real: { device, repo } }), cmds);
      // at the end, read again and sent with nothing in the way: everything typed is on GitHub
      await device.readIn();
      for (let i = 0; i < 3 && device.changes.size; i++) await device.send();
      expect(device.changes.size).toBe(0);
      expect(lost(m.typed, Object.values(headTexts(repo)))).toEqual([]);
      expect(lost(m.written, Object.values(headTexts(repo)))).toEqual([]);
    }),
    { numRuns: 20000, ...(seed !== undefined && { seed }) },
  );
});
