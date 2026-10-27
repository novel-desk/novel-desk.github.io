// A GitHub of the screen tests: the REST API that the app uses (the repositories of the token, refs, commits, trees,
// blobs), kept in memory and answered through Playwright's routing. Nothing reaches the real GitHub: every request that
// is not to this page's server is answered here or refused (and noted in `outside`)
import { createHash, generateKeyPairSync, verify } from 'node:crypto';

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
  /**
   * @param {string} fullName @param {Record<string, string | Buffer> | null} files (null: an empty repository, no commit)
   * @param {{ branch?: string, private?: boolean, push?: boolean }} [o] push: false, a repository the token can only read
   */
  constructor(fullName, files, o = {}) {
    // (given by the FakeGitHub it is in)
    this.id = 0;
    this.fullName = fullName;
    this.defaultBranch = o.branch ?? 'main';
    this.private = o.private ?? true;
    this.writable = o.push ?? true;
    // who its commits are written by, as its listing of commits says (made up for the tests)
    this.author = { name: '試験の作者', email: 'author@example.invalid' };
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
    if (files) this.refs[this.defaultBranch] = this.commit(files, '最初', []);
  }
  get empty() {
    return Object.keys(this.refs).length === 0;
  }
  /** a repository as GitHub's API says it */
  meta() {
    return {
      id: this.id,
      full_name: this.fullName,
      name: this.fullName.split('/')[1],
      private: this.private,
      visibility: this.private ? 'private' : 'public',
      default_branch: this.defaultBranch,
    };
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
      .map(p => ({
        filename: p,
        status: !from[p] ? 'added' : !to[p] ? 'removed' : 'modified',
        additions: 1,
        deletions: from[p] && to[p] ? 1 : 0,
        ...(to[p] && { sha: to[p].sha }),
      }));
    return { status: commits.length ? 'ahead' : 'identical', ahead_by: commits.length, commits, files, merge_base_commit: { sha: this.meet(b, h) } };
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
    this.ids = 0;
    for (const r of repos) r.id = ++this.ids;
    /** @type {Record<string, string>} the names GitHub sends on to another (a repository renamed) */
    this.movedTo = {};
    /** @type {string[]} the tokens that can make and rename repositories (Administration) */
    this.adminTokens = [];
    // a repository made here is one the token in use can read (false: its Repository access does not have it yet)
    this.newReadable = true;
    /** @type {Set<string>} the repositories the tokens other than the admin ones cannot read */
    this.unreadable = new Set();
    /** @type {string[]} the tokens it takes */
    this.tokens = [TOKEN];
    /** @type {Record<string, string>} the GitHub user of a token ('author' when not given) */
    this.logins = {};
    /** @type {Record<string, number>} the GitHub accounts' numbers, by login (one not here is given the next) */
    this.userIds = { author: 1001 };
    /** @type {string[]} the requests that came with an admin token */
    this.adminCalls = [];
    /** @type {string[]} the requests made to anything but this page's server and the API (refused) */
    this.outside = [];
    /** @type {string[]} the API requests, 「GET /path」, but the GitHub App's own (below) */
    this.calls = [];
    /** @type {string[]} the GitHub App's own requests (made from its manifest, its installations, their tokens, itself), 「POST /path」 */
    this.appCalls = [];
    // how far the page's clock is set from this machine's (ms; a test that sets the page's clock): the App's JWTs and
    // its installations' tokens are judged by the page's time
    this.timeOffset = 0;
    /** @type {((method: string, path: string) => number | undefined) | null} a status to answer instead, for a test */
    this.fail = null;
    // the repositories' listing comes in pages of this many
    this.perPage = 100;
    // GitHub not reached (the network is down)
    this.down = false;
    /** @type {((method: string, path: string) => void) | null} done before a request is answered, for a test */
    this.before = null;
    // the trees answered as cut short (a repository with too many files for one listing)
    this.truncated = false;
    /**
     * A GitHub App (its ID or Client ID, the public key of its private key, and where it is installed: the owners and
     * their repositories), or none. Its JWTs are checked with the key; its installations' tokens are given for an hour
     * (appTokenLife) and taken until they end or are revoked
     * (`appId`: its number, when `id` is its Client ID; `owner`: the account that made it, the author's when not given)
     * @type {{ id: string, appId?: number, owner?: string, publicKey: import('node:crypto').KeyObject, installations: { id: number, account: string, repos: string[] }[] } | null}
     */
    this.app = null;
    this.appTokenLife = 3600000;
    /** @type {Map<string, { installation: number, expires: number }>} */
    this.appTokens = new Map();
    // the repositories of an installation come in pages of this many
    this.installationPerPage = 100;
    /** @type {{ author?: unknown, committer?: unknown }[]} who the commits made through the API were written by, as sent */
    this.written = [];
    // --- the manifest flow (github.com's pages): the manifests posted (with the state in the address), the Apps made
    // from them by their codes, and the pages of installing them visited
    /** @type {{ manifest: any, state: string | null }[]} */
    this.manifests = [];
    /** @type {Map<string, { used: boolean, id: number, clientId: string, slug: string, pem: string, publicKey: import('node:crypto').KeyObject, setup: string }>} */
    this.codes = new Map();
    // the author presses Create at once (false: the page stays on GitHub, nothing sent back)
    this.createNow = true;
    // the account an App is made on (the one logged in to github.com)
    this.makeOwner = 'author';
    /** @type {string[] | null} the repositories the author installs the App on when its page opens (null: not installed, the page stays) */
    this.installRepos = ['author/novel'];
    /** @type {string[]} the pages of installing an App visited */
    this.installPages = [];
  }
  // github.com's pages of the manifest flow: the manifest posted (the App made, and back to its redirect_url with the
  // code and the state), and the page of installing it (installed, and back to its setup_url)
  /** @param {import('@playwright/test').Route} route @param {URL} url */
  answerWeb(route, url) {
    const req = route.request();
    /** @param {string} to */
    const back = to =>
      route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><meta http-equiv="refresh" content="0;url=${to}"><p>GitHub</p>`,
      });
    const stay = () =>
      route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><p>GitHub（試験の偽物）</p>' });
    if (url.pathname === '/settings/apps/new' && req.method() === 'POST') {
      const manifest = JSON.parse(String(new URLSearchParams(req.postData() ?? '').get('manifest')));
      const state = url.searchParams.get('state');
      this.manifests.push({ manifest, state });
      const n = this.codes.size + 1;
      const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const code = `testcode${n}${'0'.repeat(8)}`;
      const slug = String(manifest.name).toLowerCase().replace(/ /g, '-');
      this.codes.set(code, {
        used: false,
        id: 900 + n,
        clientId: `Iv23testclient${n}`,
        slug,
        pem: privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
        publicKey,
        setup: manifest.setup_url,
      });
      if (!this.createNow) return stay();
      return back(`${manifest.redirect_url}?${new URLSearchParams({ code, state: String(state) })}`);
    }
    const inst = /^\/apps\/([^/]+)\/installations\/new$/.exec(url.pathname);
    const made = inst && [...this.codes.values()].find(c => c.slug === inst[1]);
    if (made && req.method() === 'GET') {
      this.installPages.push(url.pathname);
      if (!this.installRepos) return stay();
      /** @type {NonNullable<FakeGitHub['app']>} */ (this.app).installations.push({ id: 8, account: 'author', repos: this.installRepos });
      return back(`${made.setup}?installation_id=8&setup_action=install`);
    }
    this.outside.push(url.href);
    return route.abort('blockedbyclient');
  }
  // an App made from its manifest: its code turned into the App and its private key, once (GitHub's conversions)
  /** @param {string} code @param {(status: number, body: unknown) => Promise<void>} reply */
  convert(code, reply) {
    const c = this.codes.get(code);
    if (!c || c.used) return reply(404, { message: 'Not Found' });
    c.used = true;
    this.app = { id: c.clientId, appId: c.id, owner: this.makeOwner, publicKey: c.publicKey, installations: [] };
    return reply(201, {
      id: c.id,
      slug: c.slug,
      client_id: c.clientId,
      name: c.slug,
      owner: { login: 'author', id: 1001 },
      client_secret: 'test-client-secret-not-real',
      webhook_secret: null,
      pem: c.pem,
    });
  }
  // whether a request comes with a JWT of the App: signed by its key, its own, not ended, and for 10 minutes at most
  /** @param {string | undefined} auth */
  appJwt(auth) {
    const [h, c, s] = String(auth)
      .replace(/^Bearer /, '')
      .split('.');
    if (!this.app || !s) return false;
    if (!verify('sha256', Buffer.from(`${h}.${c}`), this.app.publicKey, Buffer.from(s, 'base64url'))) return false;
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
    // (GitHub takes the App's Client ID or its number)
    return (claims.iss === this.app.id || claims.iss === String(this.app.appId)) && claims.exp * 1000 > this.now() && claims.exp - claims.iat <= 660;
  }
  // the time as the page's clock says it
  now() {
    return Date.now() + this.timeOffset;
  }
  // a GitHub account's number (one not known yet given the next)
  /** @param {string} login */
  userId(login) {
    this.userIds[login] ??= 1001 + Object.keys(this.userIds).length;
    return this.userIds[login];
  }
  // the installation an installation's token is of (undefined: not one, ended, or revoked)
  /** @param {string | undefined} auth */
  installationOf(auth) {
    const t = this.appTokens.get(String(auth).replace(/^Bearer /, ''));
    return t && t.expires > this.now() ? t.installation : undefined;
  }
  // the App's own requests: its installations, a token for one, the repositories of one
  /** @param {string} method @param {URL} url @param {string | undefined} auth @param {(status: number, body: unknown, headers?: Record<string, string>) => Promise<void>} reply */
  answerApp(method, url, auth, reply) {
    const app = /** @type {NonNullable<FakeGitHub['app']>} */ (this.app);
    if (url.pathname === '/installation/repositories') {
      const i = app.installations.find(x => x.id === this.installationOf(auth));
      if (!i) return reply(401, { message: 'Bad credentials' });
      const page = Number(url.searchParams.get('page') || 1),
        per = this.installationPerPage;
      const repos = i.repos.map(n => /** @type {FakeRepo} */ (this.repos.get(n)).meta());
      const more = page * per < repos.length;
      return reply(
        200,
        { total_count: repos.length, repositories: repos.slice((page - 1) * per, page * per) },
        more ? { Link: `<https://api.github.com/installation/repositories?page=${page + 1}>; rel="next"` } : {},
      );
    }
    if (!this.appJwt(auth)) return reply(401, { message: 'A JSON web token could not be decoded' });
    if (url.pathname === '/app/installations' && method === 'GET')
      return reply(
        200,
        app.installations.map(i => ({ id: i.id, account: { login: i.account, id: this.userId(i.account) } })),
      );
    // the App itself: its number, its Client ID, the account that made it
    if (url.pathname === '/app' && method === 'GET') {
      const owner = app.owner ?? 'author';
      return reply(200, { id: app.appId ?? Number(app.id), client_id: app.id, owner: { login: owner, id: this.userId(owner) } });
    }
    const m = /^\/app\/installations\/(\d+)\/access_tokens$/.exec(url.pathname);
    if (m && method === 'POST' && app.installations.some(i => i.id === Number(m[1]))) {
      const token = `ghs_test_${this.appTokens.size + 1}`;
      const expires = this.now() + this.appTokenLife;
      this.appTokens.set(token, { installation: Number(m[1]), expires });
      return reply(201, { token, expires_at: new Date(expires).toISOString() });
    }
    return reply(404, { message: 'Not Found' });
  }
  // a repository renamed (or moved to another owner) on GitHub: its old name sent on to it
  /** @param {string} from @param {string} to */
  rename(from, to) {
    const repo = /** @type {FakeRepo} */ (this.repos.get(from));
    this.repos.delete(from);
    repo.fullName = to;
    this.repos.set(to, repo);
    this.movedTo[from] = to;
  }
  /** @param {import('@playwright/test').BrowserContext} context @param {string} origin this page's server */
  async install(context, origin) {
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      if (url.origin === 'https://github.com') return this.answerWeb(route, url);
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
    const own = url.pathname === '/app' || url.pathname.startsWith('/app/') || url.pathname.startsWith('/app-manifests/');
    (own ? this.appCalls : this.calls).push(`${method} ${url.pathname}${url.search}`);
    this.before?.(method, url.pathname);
    /** @type {(status: number, body: unknown, headers?: Record<string, string>) => Promise<void>} */
    const reply = (status, body, headers = {}) =>
      route.fulfill({ status, headers: { ...CORS, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const headers = req.headers();
    const conversion = /^\/app-manifests\/([^/]+)\/conversions$/.exec(url.pathname);
    if (conversion && method === 'POST') return this.convert(conversion[1], reply);
    if (this.app && (url.pathname === '/app' || url.pathname.startsWith('/app/') || url.pathname === '/installation/repositories'))
      return this.answerApp(method, url, headers.authorization, reply);
    const admin = this.adminTokens.some(t => headers.authorization === `Bearer ${t}`);
    if (admin) this.adminCalls.push(`${method} ${url.pathname}`);
    if (!admin && !this.tokens.some(t => headers.authorization === `Bearer ${t}`) && this.installationOf(headers.authorization) === undefined)
      return reply(401, { message: 'Bad credentials' });
    const failing = this.fail?.(method, url.pathname);
    if (failing) return reply(failing, { message: 'test failure' });
    const body = method === 'GET' ? null : req.postDataJSON();
    const path = decodeURIComponent(url.pathname);
    // the repository itself: as GitHub says it (a renamed one's old name sent on), made, renamed
    if (path === '/user' && method === 'GET') {
      const login = this.logins[String(headers.authorization).replace(/^Bearer /, '')] ?? 'author';
      return reply(200, { login, id: this.userId(login) });
    }
    if ((path === '/user/repos' || /^\/orgs\/[^/]+\/repos$/.test(path)) && method === 'POST') {
      if (!admin) return reply(403, { message: 'Resource not accessible by personal access token' });
      const owner = path === '/user/repos' ? 'author' : path.split('/')[2];
      const full = `${owner}/${body.name}`;
      if (this.repos.has(full)) return reply(422, { message: 'name already exists on this account' });
      const made = new FakeRepo(full, null, { private: body.private });
      made.id = ++this.ids;
      this.repos.set(full, made);
      if (!this.newReadable) this.unreadable.add(full);
      return reply(201, made.meta());
    }
    const byId = /^\/repositories\/(\d+)$/.exec(path);
    if (byId) {
      const found = [...this.repos.values()].find(r => r.id === Number(byId[1]));
      return found && !this.unreadable.has(found.fullName) ? reply(200, found.meta()) : reply(404, { message: 'Not Found' });
    }
    const named = /^\/repos\/([^/]+\/[^/]+)$/.exec(path);
    if (named) {
      const found = this.repos.get(named[1]) ?? this.repos.get(this.movedTo[named[1]]);
      if (!found || (!admin && this.unreadable.has(found.fullName))) return reply(404, { message: 'Not Found' });
      if (method === 'GET') return reply(200, found.meta());
      if (method === 'PATCH') {
        if (!admin) return reply(403, { message: 'Resource not accessible by personal access token' });
        const full = `${found.fullName.split('/')[0]}/${body.name}`;
        if (this.repos.has(full)) return reply(422, { message: 'name already exists on this account' });
        this.rename(found.fullName, full);
        return reply(200, found.meta());
      }
    }
    const unread = /^\/repos\/([^/]+\/[^/]+)\//.exec(path);
    if (unread && !admin && this.unreadable.has(unread[1])) return reply(404, { message: 'Not Found' });
    if (path === '/user/repos') {
      const all = [...this.repos.values()];
      const page = Number(url.searchParams.get('page') || 1);
      const list = all.slice((page - 1) * this.perPage, page * this.perPage).map(r => ({
        full_name: r.fullName,
        name: r.fullName.split('/')[1],
        private: r.private,
        id: r.id,
        visibility: r.private ? 'private' : 'public',
        default_branch: r.defaultBranch,
        permissions: { admin: false, push: r.writable, pull: true },
      }));
      const more = page * this.perPage < all.length;
      return reply(200, list, more ? { Link: `<https://api.github.com/user/repos?page=${page + 1}>; rel="next"` } : {});
    }
    const r = /^\/repos\/([^/]+\/[^/]+)\/commits$/.exec(path);
    if (r && method === 'GET' && this.repos.get(r[1])) {
      const repo = /** @type {FakeRepo} */ (this.repos.get(r[1]));
      const from = repo.refs[url.searchParams.get('sha') ?? repo.defaultBranch] ?? url.searchParams.get('sha') ?? '';
      // (a branch or a commit it does not have: GitHub says so)
      if (from && !repo.commits.has(from)) return reply(404, { message: 'No commit found for SHA' });
      const per = Number(url.searchParams.get('per_page') || 30),
        page = Number(url.searchParams.get('page') || 1);
      const all = repo.log(from, url.searchParams.get('path') ?? undefined);
      const list = all.slice((page - 1) * per, page * per).map(sha => {
        const c = /** @type {{ message: string, date: string, parents: string[] }} */ (repo.commits.get(sha));
        return {
          sha,
          commit: { message: c.message, committer: { date: c.date }, author: { ...repo.author, date: c.date } },
          parents: c.parents.map(p => ({ sha: p })),
        };
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
    const put = /^\/repos\/([^/]+\/[^/]+)\/contents\/(.+)$/.exec(path);
    if (put && method === 'PUT' && this.repos.get(put[1])) {
      // (the Contents API: a file and its commit, on the default branch; the first commit of an empty repository)
      const repo = /** @type {FakeRepo} */ (this.repos.get(put[1]));
      const head = repo.refs[repo.defaultBranch];
      const entries = head ? { ...repo.files(head) } : {};
      entries[put[2]] = { mode: '100644', sha: repo.blob(Buffer.from(body.content, 'base64')) };
      repo.refs[repo.defaultBranch] = repo.commitTree(repo.tree(entries), body.message, head ? [head] : []);
      return reply(201, { content: { path: put[2], sha: entries[put[2]].sha }, commit: { sha: repo.refs[repo.defaultBranch] } });
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
    if (repo.empty) return reply(409, { message: 'Git Repository is empty.' });
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
      return reply(200, { sha: g[1], tree, truncated: this.truncated });
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
    if (method === 'POST' && rest === 'commits') {
      this.written.push({ author: body.author, committer: body.committer });
      return reply(201, { sha: repo.commitTree(body.tree, body.message, body.parents) });
    }
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
