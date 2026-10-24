// A GitHub of the screen tests: the REST API that the app uses (the repositories of the token, refs, commits, trees,
// blobs), kept in memory and answered through Playwright's routing. Nothing reaches the real GitHub: every request that
// is not to this page's server is answered here or refused (and noted in `outside`)
import { createHash } from 'node:crypto';

export const TOKEN = 'test-token-not-real';
const sha1 = (/** @type {string | Buffer} */ s) => createHash('sha1').update(s).digest('hex');
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Accept, Content-Type, X-GitHub-Api-Version',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'Link',
};

/**
 * A repository: its objects (blobs by sha; trees as flat maps of path → { mode, sha }; commits) and its branches
 */
export class FakeRepo {
  /** @param {string} fullName @param {Record<string, string | Buffer>} files @param {{ branch?: string, private?: boolean }} [o] */
  constructor(fullName, files, o = {}) {
    this.fullName = fullName;
    this.defaultBranch = o.branch ?? 'main';
    this.private = o.private ?? true;
    /** @type {Map<string, Buffer>} */
    this.blobs = new Map();
    /** @type {Map<string, Record<string, { mode: string, sha: string }>>} */
    this.trees = new Map();
    /** @type {Map<string, { tree: string, parents: string[], message: string, date: string }>} */
    this.commits = new Map();
    // the time of the next commit (each one a minute after the one before)
    this.clock = Date.parse('2026-10-01T00:00:00Z');
    /** @type {Record<string, string>} */
    this.refs = {};
    /** @type {Record<string, string>} the tags, by name: their commits */
    this.tags = {};
    /** @type {{ id: number, tag_name: string, name: string, body: string, created_at: string }[]} */
    this.releases = [];
    this.refs[this.defaultBranch] = this.commit(files, '最初', []);
  }
  /** @param {string | Buffer} content */
  blob(content) {
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const sha = sha1(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]));
    this.blobs.set(sha, bytes);
    return sha;
  }
  /** @param {Record<string, { mode: string, sha: string }>} entries */
  tree(entries) {
    const sha = sha1(`tree ${JSON.stringify(Object.entries(entries).sort())}`);
    this.trees.set(sha, entries);
    return sha;
  }
  /** @param {Record<string, string | Buffer>} files @param {string} message @param {string[]} parents */
  commit(files, message, parents) {
    /** @type {Record<string, { mode: string, sha: string }>} */
    const entries = {};
    for (const [path, content] of Object.entries(files)) entries[path] = { mode: '100644', sha: this.blob(content) };
    return this.commitTree(this.tree(entries), message, parents);
  }
  /** @param {string} tree @param {string} message @param {string[]} parents */
  commitTree(tree, message, parents) {
    const sha = sha1(`commit ${tree} ${parents.join(',')} ${message} ${this.commits.size}`);
    this.clock += 60000;
    this.commits.set(sha, { tree, parents, message, date: new Date(this.clock).toISOString() });
    return sha;
  }
  // a commit made elsewhere (another device): these files changed (null: deleted), on top of the branch
  /** @param {Record<string, string | null>} changes @param {string} [branch] */
  push(changes, branch = this.defaultBranch) {
    const head = this.refs[branch];
    const entries = { ...this.files(head) };
    for (const [path, text] of Object.entries(changes)) {
      if (text === null) delete entries[path];
      else entries[path] = { mode: entries[path]?.mode ?? '100644', sha: this.blob(text) };
    }
    this.refs[branch] = this.commitTree(this.tree(entries), 'ほかの端末で', [head]);
    return this.refs[branch];
  }
  /** @param {string} commit */
  files(commit) {
    return /** @type {Record<string, { mode: string, sha: string }>} */ (this.trees.get(/** @type {any} */ (this.commits.get(commit)).tree));
  }
  // the text of a file at the head of a branch (undefined when it is not there)
  /** @param {string} path @param {string} [branch] */
  text(path, branch = this.defaultBranch) {
    const e = this.files(this.refs[branch])[path];
    return e && this.blobs.get(e.sha)?.toString();
  }
  /** @param {string} [branch] */
  head(branch = this.defaultBranch) {
    return /** @type {{ tree: string, parents: string[], message: string, date: string }} */ (this.commits.get(this.refs[branch]));
  }
  // the commits of a branch, the newest first (first parents), with the ones that changed `path` only when it is given
  /** @param {string} from a commit @param {string} [path] */
  log(from, path) {
    const out = [];
    for (let c = from; c; c = this.commits.get(c)?.parents[0] ?? '') {
      const parent = this.commits.get(c)?.parents[0];
      if (path && this.files(c)[path]?.sha === (parent ? this.files(parent)[path]?.sha : undefined)) continue;
      out.push(c);
    }
    return out;
  }
  // the commits of `head` not in `base`, and the files they change (as GitHub's compare API, from where they meet)
  /** @param {string} base @param {string} head */
  compare(base, head) {
    const [b, h] = [this.refs[base], this.refs[head]];
    const inBase = new Set(this.ancestors(b));
    const commits = this.ancestors(h)
      .filter(c => !inBase.has(c))
      .reverse()
      .map(sha => {
        const c = /** @type {{ message: string, date: string }} */ (this.commits.get(sha));
        return { sha, commit: { message: c.message, committer: { date: c.date } } };
      });
    const from = this.files(this.meet(b, h)),
      to = this.files(h);
    const files = [...new Set([...Object.keys(from), ...Object.keys(to)])]
      .filter(p => from[p]?.sha !== to[p]?.sha)
      .sort()
      .map(p => ({ filename: p, status: !from[p] ? 'added' : !to[p] ? 'removed' : 'modified', additions: 1, deletions: from[p] && to[p] ? 1 : 0 }));
    return { status: commits.length ? 'ahead' : 'identical', ahead_by: commits.length, commits, files };
  }
  /** @param {string} c @returns {string[]} every commit it comes from, itself first */
  ancestors(c) {
    const out = [];
    for (let at = [c]; at.length; at = at.flatMap(x => this.commits.get(x)?.parents ?? [])) for (const x of at) if (!out.includes(x)) out.push(x);
    return out;
  }
  /** @param {string} a @param {string} b the commit where they meet (the first of b's ancestors that is a's) */
  meet(a, b) {
    const of = new Set(this.ancestors(a));
    return /** @type {string} */ (this.ancestors(b).find(c => of.has(c)));
  }
  // `head` merged into the branch `base`: 'none' when base has it all, 'conflict' when a file changed on both sides,
  // else the merge commit (the branch moved onto it)
  /** @param {string} base @param {string} head @param {string} message */
  merge(base, head, message) {
    const [b, h] = [this.refs[base], this.refs[head]];
    if (this.descends(b, h)) return 'none';
    const m = this.files(this.meet(b, h)),
      ours = this.files(b),
      theirs = this.files(h);
    const entries = { ...ours };
    for (const p of new Set([...Object.keys(m), ...Object.keys(theirs)])) {
      if (m[p]?.sha === theirs[p]?.sha) continue;
      if (m[p]?.sha !== ours[p]?.sha && ours[p]?.sha !== theirs[p]?.sha) return 'conflict';
      if (theirs[p]) entries[p] = theirs[p];
      else delete entries[p];
    }
    this.refs[base] = this.commitTree(this.tree(entries), message ?? `Merge ${head} into ${base}`, [b, h]);
    return this.refs[base];
  }
  /** @param {string} ancestor @param {string} commit */
  descends(commit, ancestor) {
    for (let c = [commit]; c.length; c = c.flatMap(x => this.commits.get(x)?.parents ?? [])) if (c.includes(ancestor)) return true;
    return false;
  }
}

export class FakeGitHub {
  /** @param {FakeRepo[]} repos */
  constructor(repos) {
    /** @type {Map<string, FakeRepo>} */
    this.repos = new Map(repos.map(r => [r.fullName, r]));
    /** @type {string[]} the tokens it takes */
    this.tokens = [TOKEN];
    /** @type {string[]} the requests made to anything but this page's server and the API (refused) */
    this.outside = [];
    /** @type {string[]} the API requests, 「GET /path」 */
    this.calls = [];
    /** @type {((method: string, path: string) => number | undefined) | null} a status to answer instead, for a test */
    this.fail = null;
    // the repositories' listing comes in pages of this many
    this.perPage = 100;
    // GitHub not reached (the network is down)
    this.down = false;
    /** @type {((method: string, path: string) => void) | null} done before a request is answered, for a test */
    this.before = null;
  }
  /** @param {import('@playwright/test').BrowserContext} context @param {string} origin this page's server */
  async install(context, origin) {
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      if (url.origin !== 'https://api.github.com') {
        this.outside.push(url.href);
        return route.abort('blockedbyclient');
      }
      return this.answer(route);
    });
  }
  /** @param {import('@playwright/test').Route} route */
  async answer(route) {
    const req = route.request();
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (this.down) return route.abort('internetdisconnected');
    const url = new URL(req.url());
    this.calls.push(`${method} ${url.pathname}${url.search}`);
    this.before?.(method, url.pathname);
    /** @type {(status: number, body: unknown, headers?: Record<string, string>) => Promise<void>} */
    const reply = (status, body, headers = {}) =>
      route.fulfill({ status, headers: { ...CORS, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const headers = req.headers();
    if (!this.tokens.some(t => headers.authorization === `Bearer ${t}`)) return reply(401, { message: 'Bad credentials' });
    const failing = this.fail?.(method, url.pathname);
    if (failing) return reply(failing, { message: 'test failure' });
    const body = method === 'GET' ? null : req.postDataJSON();
    const path = decodeURIComponent(url.pathname);
    if (path === '/user/repos') {
      const all = [...this.repos.values()];
      const page = Number(url.searchParams.get('page') || 1);
      const list = all.slice((page - 1) * this.perPage, page * this.perPage).map(r => ({
        full_name: r.fullName,
        name: r.fullName.split('/')[1],
        private: r.private,
        visibility: r.private ? 'private' : 'public',
        default_branch: r.defaultBranch,
      }));
      const more = page * this.perPage < all.length;
      return reply(200, list, more ? { Link: `<https://api.github.com/user/repos?page=${page + 1}>; rel="next"` } : {});
    }
    const r = /^\/repos\/([^/]+\/[^/]+)\/commits$/.exec(path);
    if (r && method === 'GET' && this.repos.get(r[1])) {
      const repo = /** @type {FakeRepo} */ (this.repos.get(r[1]));
      const from = repo.refs[url.searchParams.get('sha') ?? repo.defaultBranch] ?? url.searchParams.get('sha') ?? '';
      const per = Number(url.searchParams.get('per_page') || 30),
        page = Number(url.searchParams.get('page') || 1);
      const all = repo.log(from, url.searchParams.get('path') ?? undefined);
      const list = all.slice((page - 1) * per, page * per).map(sha => {
        const c = /** @type {{ message: string, date: string, parents: string[] }} */ (repo.commits.get(sha));
        return { sha, commit: { message: c.message, committer: { date: c.date }, author: { date: c.date } }, parents: c.parents.map(p => ({ sha: p })) };
      });
      const more = page * per < all.length;
      return reply(
        200,
        list,
        more
          ? {
              Link: `<https://api.github.com${url.pathname}?${new URLSearchParams({ ...Object.fromEntries(url.searchParams), page: String(page + 1) })}>; rel="next"`,
            }
          : {},
      );
    }
    const f = /^\/repos\/([^/]+\/[^/]+)\/contents\/(.+)$/.exec(path);
    if (f && method === 'GET' && this.repos.get(f[1])) {
      const repo = /** @type {FakeRepo} */ (this.repos.get(f[1]));
      const ref = url.searchParams.get('ref') ?? repo.defaultBranch;
      const e = repo.commits.has(ref) ? repo.files(ref)[f[2]] : repo.refs[ref] ? repo.files(repo.refs[ref])[f[2]] : undefined;
      if (!e) return reply(404, { message: 'Not Found' });
      const b = /** @type {Buffer} */ (repo.blobs.get(e.sha));
      return reply(200, { type: 'file', path: f[2], sha: e.sha, size: b.length, encoding: 'base64', content: b.toString('base64').replace(/.{60}/g, '$&\n') });
    }
    const br = /^\/repos\/([^/]+\/[^/]+)\/(branches|merges|compare\/(.+)\.\.\.(.+))$/.exec(path);
    if (br && this.repos.get(br[1])) {
      const repo = /** @type {FakeRepo} */ (this.repos.get(br[1]));
      if (br[2] === 'branches')
        return reply(
          200,
          Object.keys(repo.refs).map(name => ({ name, commit: { sha: repo.refs[name] } })),
        );
      if (br[3]) return reply(200, repo.compare(br[3], br[4]));
      const r = repo.merge(body.base, body.head, body.commit_message);
      return r === 'none'
        ? route.fulfill({ status: 204, headers: CORS })
        : r === 'conflict'
          ? reply(409, { message: 'Merge Conflict' })
          : reply(201, { sha: r });
    }
    const rel = /^\/repos\/([^/]+\/[^/]+)\/(releases|tags)$/.exec(path);
    if (rel && this.repos.get(rel[1])) {
      const repo = /** @type {FakeRepo} */ (this.repos.get(rel[1]));
      if (method === 'GET' && rel[2] === 'tags')
        return reply(
          200,
          Object.keys(repo.tags).map(name => ({ name, commit: { sha: repo.tags[name] } })),
        );
      if (method === 'GET') return reply(200, [...repo.releases].reverse());
      if (repo.tags[body.tag_name]) return reply(422, { message: 'Validation Failed' });
      const commit = repo.refs[body.target_commitish] ?? body.target_commitish;
      if (!repo.commits.has(commit)) return reply(422, { message: 'Validation Failed' });
      repo.tags[body.tag_name] = commit;
      const made = { id: repo.releases.length + 1, tag_name: body.tag_name, name: body.name, body: body.body, created_at: new Date(repo.clock).toISOString() };
      repo.clock += 60000;
      repo.releases.push(made);
      return reply(201, made);
    }
    const m = /^\/repos\/([^/]+\/[^/]+)\/git\/(.+)$/.exec(path);
    const repo = m && this.repos.get(m[1]);
    if (!m || !repo) return reply(404, { message: 'Not Found' });
    const rest = m[2];
    let g;
    if (method === 'GET' && (g = /^ref\/tags\/(.+)$/.exec(rest))) {
      const sha = repo.tags[g[1]];
      return sha ? reply(200, { ref: `refs/tags/${g[1]}`, object: { type: 'commit', sha } }) : reply(404, { message: 'Not Found' });
    }
    if (method === 'GET' && (g = /^ref\/heads\/(.+)$/.exec(rest))) {
      const sha = repo.refs[g[1]];
      return sha ? reply(200, { ref: `refs/heads/${g[1]}`, object: { type: 'commit', sha } }) : reply(404, { message: 'Not Found' });
    }
    if (method === 'GET' && (g = /^commits\/(\w+)$/.exec(rest))) {
      const c = repo.commits.get(g[1]);
      return c
        ? reply(200, {
            sha: g[1],
            tree: { sha: c.tree },
            message: c.message,
            committer: { date: c.date },
            author: { date: c.date },
            parents: c.parents.map(sha => ({ sha })),
          })
        : reply(404, {});
    }
    if (method === 'GET' && (g = /^trees\/(\w+)$/.exec(rest))) {
      const entries = repo.trees.get(g[1]);
      if (!entries) return reply(404, {});
      const folders = new Set(
        Object.keys(entries).flatMap(p =>
          p
            .split('/')
            .slice(0, -1)
            .map((_, i, a) => a.slice(0, i + 1).join('/')),
        ),
      );
      const tree = [
        ...[...folders].map(p => ({ path: p, mode: '040000', type: 'tree', sha: sha1(p) })),
        ...Object.entries(entries).map(([p, e]) => ({ path: p, mode: e.mode, type: e.mode === '160000' ? 'commit' : 'blob', sha: e.sha })),
      ];
      return reply(200, { sha: g[1], tree, truncated: false });
    }
    if (method === 'GET' && (g = /^blobs\/(\w+)$/.exec(rest))) {
      const b = repo.blobs.get(g[1]);
      // (GitHub cuts the base64 into lines)
      return b ? reply(200, { sha: g[1], size: b.length, encoding: 'base64', content: b.toString('base64').replace(/.{60}/g, '$&\n') }) : reply(404, {});
    }
    if (method === 'POST' && rest === 'blobs') return reply(201, { sha: repo.blob(Buffer.from(body.content, body.encoding === 'base64' ? 'base64' : 'utf8')) });
    if (method === 'POST' && rest === 'trees') {
      const entries = { ...repo.trees.get(body.base_tree) };
      for (const e of body.tree) {
        if (e.sha === null) delete entries[e.path];
        else entries[e.path] = { mode: e.mode, sha: e.sha };
      }
      return reply(201, { sha: repo.tree(entries) });
    }
    if (method === 'POST' && rest === 'commits') return reply(201, { sha: repo.commitTree(body.tree, body.message, body.parents) });
    if (method === 'POST' && rest === 'refs') {
      const name = String(body.ref).replace(/^refs\/heads\//, '');
      if (repo.refs[name]) return reply(422, { message: 'Reference already exists' });
      repo.refs[name] = body.sha;
      return reply(201, { ref: body.ref, object: { type: 'commit', sha: body.sha } });
    }
    if (method === 'PATCH' && (g = /^refs\/heads\/(.+)$/.exec(rest))) {
      const now = repo.refs[g[1]];
      if (!body.force && !repo.descends(body.sha, now)) return reply(422, { message: 'Update is not a fast forward' });
      repo.refs[g[1]] = body.sha;
      return reply(200, { ref: `refs/heads/${g[1]}`, object: { type: 'commit', sha: body.sha } });
    }
    return reply(404, { message: 'Not Found' });
  }
}
