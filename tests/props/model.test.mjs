// Model-based tests (fast-check's commands): random sequences of what the author does on a device (type, add, rename,
// put in the trash and move an episode, send, read the work again) and of what is done elsewhere (a text written, an
// episode put in _trash/, moved, renumbered, or put in _trash/ with a new one at its path), over the real lib/
// (changes, drafts, view, episodes), ui/send.js and ui/work.js with the fake GitHub (tests/props/lib/device.mjs).
// After every step: nothing typed or written elsewhere is lost; what was typed in an episode is never in another
// episode's file, and an episode is never put back once it went elsewhere (each episode holds a mark of its own:
// ［E1］); a text is set aside only when its episode was put in _trash/ elsewhere, never because it moved (it goes
// where its episode is now); after every send the lines of novel.toml written by hand are as they were and no file is taken away or
// changed that the send did not mean to
import { test, expect, vi } from 'vitest';
import fc from 'fast-check';
import * as db from './lib/memory-db.mjs';
import { Device, FakeGitHub, FakeRepo, FILES, HAND_LINES, fetchOver, headTexts, keptTexts } from './lib/device.mjs';
import * as plans from '../../lib/episodes.js';

vi.mock('../../ui/db.js', () => import('./lib/memory-db.mjs'));

const seed = process.env.NW_PROPS_SEED ? Number(process.env.NW_PROPS_SEED) : undefined;

/**
 * @typedef {object} Model
 * @property {string[]} typed the tokens typed on the device
 * @property {string[]} written the tokens written elsewhere
 * @property {Map<string, string>} of the episode each token was typed in (its mark; none for a mark typed itself)
 * @property {Set<string>} trashed the episodes put in _trash/ elsewhere
 * @property {number} n
 */
/** @typedef {{ device: Device, repo: FakeRepo }} Real */

/** @param {string[]} tokens @param {string[]} texts the tokens not in any of the texts */
const lost = (tokens, texts) => tokens.filter(t => !texts.some(x => x.includes(t)));
const MARK = /［E\d+］/g;
/** @param {string} text the marks of the episodes in it */
const marks = text => [...new Set(text.match(MARK) ?? [])];
/**
 * Nothing typed or written elsewhere lost: on GitHub, or kept on the device. On GitHub, no file is two episodes, what
 * was typed in an episode is in its file only, and an episode is in one file at most outside _trash/ (none once put
 * there elsewhere: not put back)
 * @param {Model} m @param {Real} r
 */
function nothingLost(m, r) {
  const files = headTexts(r.repo);
  const there = Object.values(files);
  expect(lost(m.written, there)).toEqual([]);
  expect(lost(m.typed, [...there, ...keptTexts(r.device)])).toEqual([]);
  /** @type {Map<string, string[]>} */
  const at = new Map();
  for (const [path, text] of Object.entries(files)) {
    const own = marks(text);
    expect(own.length, `${path}: ${text}`).toBeLessThanOrEqual(1);
    for (const t of m.typed) if (text.includes(t) && m.of.get(t)) expect(own, `${t} in ${path}`).toEqual([m.of.get(t)]);
    if (own.length && !path.includes(plans.TRASH)) at.set(own[0], [...(at.get(own[0]) ?? []), path]);
  }
  for (const [mark, paths] of at) expect(paths.length + (m.trashed.has(mark) ? 1 : 0), `${mark}: ${paths}`).toBe(1);
  // a text set aside because its file is gone there or is another file now: only an episode put in _trash/ elsewhere
  // (FR-TOC-06), or a file made on the device where another one is made (an episode added, the addition given up);
  // one moved, renumbered or swapped elsewhere takes it where it is now (FR-TOC-04)
  for (const d of r.device.refused.filter(x => x.base))
    for (const mark of marks(/** @type {string} */ (d.text))) expect(m.trashed.has(mark), `${mark} set aside: ${d.path}`).toBe(true);
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
    const text = r.device.view().texts[path] ?? '';
    m.typed.push(t);
    m.of.set(t, marks(text)[0] ?? '');
    r.device.type(path, `${text}${t}`);
    nothingLost(m, r);
  }
  toString = () => `Type(${this.i})`;
}
/** @implements {fc.AsyncCommand<Model, Real>} */
class Elsewhere {
  /** @param {'write' | 'trash' | 'move' | 'swap' | 'replace'} kind @param {number} i @param {number} j */
  constructor(kind, i, j) {
    Object.assign(this, { kind, i, j });
  }
  check = () => true;
  /** @param {Model} m @param {Real} r */
  async run(m, r) {
    const files = Object.keys(headTexts(r.repo)).filter(p => p.startsWith('chapters/') && !p.includes(plans.TRASH));
    if (!files.length) return;
    const path = files[this.i % files.length],
      other = files[this.j % files.length];
    const text = /** @type {string} */ (r.repo.text(path));
    const n = ++m.n;
    /** @param {string} p put in _trash/ (as the server version and this app do), the episode it is noted */
    const trash = p => {
      for (const mark of marks(/** @type {string} */ (r.repo.text(p)))) m.trashed.add(mark);
      return { [p]: null, [`${plans.TRASH}/2026100${n % 10}-${n}/${p}`]: /** @type {string} */ (r.repo.text(p)) };
    };
    if (this.kind === 'write') {
      const t = `〔他${n}〕`;
      m.written.push(t);
      r.repo.push({ [path]: `${text}${t}` });
    } else if (this.kind === 'trash') r.repo.push(trash(path));
    else if (this.kind === 'move') r.repo.push({ [path]: null, [`chapters/${50 + n}.md`]: text });
    else if (this.kind === 'swap' && other !== path) r.repo.push({ [path]: /** @type {string} */ (r.repo.text(other)), [other]: text });
    else if (this.kind === 'replace') r.repo.push({ ...trash(path), [path]: `# 新しい話${n}\n\n［E${100 + n}］\n` });
    nothingLost(m, r);
  }
  toString = () => `Elsewhere(${this.kind}, ${this.i}, ${this.j})`;
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
    if (this.kind === 'add') {
      const before = new Set(d.episodes());
      operate(r, () => plans.addEpisode(d.shown(), '', `新${++m.n}`));
      // (the new episode's mark, typed in it)
      const made = d.episodes().find(p => !before.has(p));
      if (made) {
        const mark = `［E${1000 + m.n}］`;
        m.typed.push(mark);
        d.type(made, `${d.view().texts[made] ?? ''}\n${mark}\n`);
      }
    } else if (!path) return;
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
    // (nothing left to send, every text set aside: no commit made, the branch as it was)
    if (!sent.message) {
      expect([r.repo.refs.main, sent.sent]).toEqual([before, []]);
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
    // (a text goes where its file is now: FR-TOC-04)
    const meant = new Set([...sent.sent.map(s => s.to), 'novel.toml']);
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
  fc
    .tuple(fc.constantFrom(/** @type {const} */ ('write'), 'trash', 'move', 'swap', 'replace'), fc.nat(5), fc.nat(5))
    .map(([k, i, j]) => new Elsewhere(k, i, j)),
  fc.tuple(fc.constantFrom(/** @type {const} */ ('add'), 'rename', 'trash', 'up', 'down'), fc.nat(5)).map(([k, i]) => new Operation(k, i)),
  fc.constant(new Send()),
  fc.constant(new ReadIn()),
];

// FR-SAVE-01, FR-SAVE-04, FR-SAVE-06, FR-SAVE-09, FR-TOC-02〜06, NFR-COMP-02, NFR-MAINT-02
test('typed, operated, sent, read again, written, deleted, moved and renumbered elsewhere in any order: nothing lost, never in another episode nor put back, novel.toml’s own lines kept, no file taken that was not meant', async () => {
  await fc.assert(
    fc.asyncProperty(fc.commands(commands, { maxCommands: 30 }), async cmds => {
      db.reset();
      const repo = new FakeRepo('author/novel', FILES);
      globalThis.fetch = fetchOver(new FakeGitHub([repo]));
      const device = await new Device(repo).open();
      /** @type {Model} */
      const m = { typed: [], written: [], of: new Map(), trashed: new Set(), n: 0 };
      await fc.asyncModelRun(() => ({ model: m, real: { device, repo } }), cmds);
      // at the end, read again and sent with nothing in the way: everything typed is on GitHub, or set aside on the device
      await device.readIn();
      for (let i = 0; i < 3 && device.changes.size; i++) await device.send();
      expect(device.changes.size).toBe(0);
      expect(lost(m.typed, [...Object.values(headTexts(repo)), ...keptTexts(device)])).toEqual([]);
      expect(lost(m.written, Object.values(headTexts(repo)))).toEqual([]);
      nothingLost(m, { device, repo });
    }),
    { numRuns: 20000, ...(seed !== undefined && { seed }) },
  );
});
