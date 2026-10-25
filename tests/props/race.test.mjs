// Races (fast-check's scheduler): GitHub's answers come back in an order the scheduler picks, while the author types
// and GitHub is written to elsewhere. The real ui/send.js and ui/work.js over the fake GitHub (tests/props/lib/device.mjs)
import { test, expect, vi } from 'vitest';
import fc from 'fast-check';
import * as db from './lib/memory-db.mjs';
import { Device, FakeGitHub, FakeRepo, FILES, fetchOver, headTexts, keptTexts } from './lib/device.mjs';
import { readFiles } from '../../ui/work.js';
import { stillHolds } from '../../lib/works.js';

vi.mock('../../ui/db.js', () => import('./lib/memory-db.mjs'));

const seed = process.env.NW_PROPS_SEED ? Number(process.env.NW_PROPS_SEED) : undefined;
const runs = (/** @type {number} */ n) => ({ numRuns: n, ...(seed !== undefined && { seed }) });
const EPISODES = ['chapters/01.md', 'chapters/02.md'];

// a new device and GitHub: the work open, its requests answered at once
async function start() {
  db.reset();
  const repo = new FakeRepo('author/novel', FILES);
  const fake = new FakeGitHub([repo]);
  globalThis.fetch = fetchOver(fake);
  return { repo, fake, device: await new Device(repo).open() };
}
// every request from now on answered when the scheduler says
/** @param {FakeGitHub} fake @param {fc.Scheduler} s */
const scheduled = (fake, s) => {
  globalThis.fetch = fetchOver(fake, p => s.schedule(Promise.resolve(), 'GitHub answers').then(p));
};
/** @param {string[]} tokens @param {string[]} texts the tokens not in any of the texts */
const lost = (tokens, texts) => tokens.filter(t => !texts.some(x => x.includes(t)));

// FR-SAVE-01, FR-SAVE-04, FR-SAVE-06, NFR-COMP-02, NFR-MAINT-02: a send while the author types and GitHub is written to elsewhere,
// in any order: nothing typed and nothing written elsewhere is lost; the branch only moves forward; sent once more
// with nothing in its way, everything typed is on GitHub
test('a send against typing and writes elsewhere, in any order: nothing lost, the branch never forced back', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.scheduler(),
      fc.array(fc.constantFrom(0, 1), { maxLength: 3 }),
      fc.array(fc.constantFrom(0, 1), { maxLength: 3 }),
      async (s, elsewhere, typing) => {
        const { repo, fake, device } = await start();
        /** @type {string[]} */
        const typed = [];
        /** @type {string[]} */
        const written = [];
        for (const [i, path] of EPISODES.entries()) {
          typed.push(`〈前${i}〉`);
          device.type(path, `${device.view().texts[path]}〈前${i}〉`);
        }
        const first = repo.refs.main;
        scheduled(fake, s);
        elsewhere.forEach((e, i) =>
          s.schedule(Promise.resolve(), `written elsewhere ${i}`).then(() => {
            written.push(`〔他${i}〕`);
            repo.push({ [EPISODES[e]]: `${repo.text(EPISODES[e])}〔他${i}〕` });
          }),
        );
        typing.forEach((e, i) =>
          s.schedule(Promise.resolve(), `typed ${i}`).then(() => {
            typed.push(`〈中${i}〉`);
            device.type(EPISODES[e], `${device.view().texts[EPISODES[e]]}〈中${i}〉`);
          }),
        );
        const sending = device.send().then(
          () => null,
          err => err,
        );
        await s.waitFor(sending);
        await s.waitAll();
        const there = Object.values(headTexts(repo));
        expect(lost(written, there)).toEqual([]);
        expect(lost(typed, [...there, ...keptTexts(device)])).toEqual([]);
        expect(repo.descends(repo.refs.main, first)).toBe(true);
        // sent again, nothing in the way: everything typed is on GitHub, and nothing is left to send
        globalThis.fetch = fetchOver(fake);
        await device.readIn();
        if (device.changes.size) await device.send();
        if (device.changes.size) await device.send();
        expect(lost(typed, Object.values(headTexts(repo)))).toEqual([]);
        expect(lost(written, Object.values(headTexts(repo)))).toEqual([]);
        expect(device.changes.size).toBe(0);
      },
    ),
    runs(2000),
  );
});

// FR-SAVE-08, FR-WORK-01, NFR-MAINT-02: the work read (the desk's readIn, the list's summary) while GitHub is written
// to elsewhere: what is read is one commit as it is on GitHub, and the refs it was read at say so: a summary kept by
// them still holds only when it is what a new reading gives
test('a work read while written elsewhere: one commit, as GitHub has it; a summary kept by its refs holds only when it is the same', async () => {
  await fc.assert(
    fc.asyncProperty(fc.scheduler(), fc.array(fc.constantFrom(0, 1, 2), { maxLength: 4 }), fc.boolean(), async (s, writes, toDraft) => {
      const { repo, fake } = await start();
      // (novel.toml names another branch: read after the default one)
      if (toDraft) {
        repo.refs.draft = repo.refs.main;
        repo.push({ 'novel.toml': `${repo.text('novel.toml')?.replace('branch = "main"', 'branch = "draft"')}` });
      }
      scheduled(fake, s);
      writes.forEach((w, i) =>
        s.schedule(Promise.resolve(), `written elsewhere ${i}`).then(() => {
          if (w === 2) repo.push({ 'novel.toml': `${repo.text('novel.toml')}# ${i}\n` });
          else repo.push({ [EPISODES[w]]: `${repo.text(EPISODES[w])}〔他${i}〕` }, toDraft ? 'draft' : 'main');
        }),
      );
      const { files, heads } = await s.waitFor(readFiles(repo.fullName, 'main', ''));
      await s.waitAll();
      // one commit, its files as GitHub has them, and that commit among the refs it was read at
      const at = Object.fromEntries(Object.entries(repo.files(files.commit)).map(([p, e]) => [p, e.sha]));
      expect(Object.fromEntries(Object.entries(files.blobs).map(([p, e]) => [p, e.sha]))).toEqual(at);
      expect(heads).toContainEqual([files.branch, files.commit]);
      // a summary kept by those refs: it holds now only when a new reading gives the same commit
      globalThis.fetch = fetchOver(fake);
      const now = heads.map(([b]) => repo.refs[b] ?? '');
      const fresh = await readFiles(repo.fullName, 'main', '');
      const kept = /** @type {any} */ ({ heads, chosen: '', overlay: false });
      if (stillHolds(kept, '', now, false)) expect(fresh.files.commit).toBe(files.commit);
    }),
    runs(2000),
  );
});
