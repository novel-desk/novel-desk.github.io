// The requests to GitHub's REST API, with the token (in memory only). Every address is under api.github.com: the page's
// CSP lets nothing else be reached
import { API, failure, nextPage } from '../lib/github.js';

/** @type {string} */
let token = '';
// told when GitHub refuses the token (401: expired, or deleted): app.js listens
const refusals = new EventTarget();
/** @param {() => void} f */
export const onRefused = f => refusals.addEventListener('refused', f);
/**
 * A GitHub App in use in place of the token (ui/appkey.js): the installation's token for a request (`fresh`: asked
 * for again, the one before refused), the repositories it is installed on, and who the commits are written by
 * @typedef {{ tokenFor: (url: string, fresh: boolean) => Promise<string>, repos: () => Promise<any[]>, account: (url: string) => Promise<{ login: string, id: number } | undefined>, who: () => Promise<import('../lib/appkey.js').Who>, author: { name: string, email: string } | null }} App
 */
/** @type {App | null} */
let app = null;
/** @param {App | null} a */
export const useApp = a => {
  app = a;
};
/** @param {string} t */
export const useToken = t => {
  token = t;
};

// A request that fails: why, said for the screen; `status` 0 when GitHub was not reached (offline)
export class GitHubError extends Error {
  /** @param {string} message @param {number} status */
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
/** @param {string} url @param {RequestInit} [init] @param {string} [as] another token than the one in use (the one with
 * Administration, for one request: not kept, and a refusal of it is not the token in use refused) */
async function request(url, init = {}, as = '') {
  let res = await attempt(url, init, as || (app ? await app.tokenFor(url, false) : token));
  // (an App's installation token refused: asked for again, once)
  if (res.status === 401 && !as && app) res = await attempt(url, init, await app.tokenFor(url, true));
  if (res.status === 401 && !as) refusals.dispatchEvent(new Event('refused'));
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new GitHubError(failure(res.status, body.message), res.status);
  }
  return res;
}
/** @param {string} url @param {RequestInit} init @param {string} bearer @returns {Promise<Response>} */
async function attempt(url, init, bearer) {
  try {
    return await fetch(url.startsWith('https://') ? url : API + url, {
      ...init,
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: `Bearer ${bearer}`, ...init.headers },
    });
  } catch {
    throw new GitHubError('GitHub につながりません（オフラインかもしれません）', 0);
  }
}
/** @param {string} path @returns {Promise<any>} */
export const getJson = async path => (await request(path)).json();
/** @param {string} method @param {string} path @param {unknown} body @returns {Promise<any>} */
export const send = async (method, path, body) =>
  (await request(path, { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })).json();

// whether GitHub takes the token (a GitHubError when it does not)
export const check = () => getJson('/user/repos?per_page=1');
// the repositories the token can read, every page of them (an App: the ones it is installed on)
export async function repos() {
  if (app) return app.repos();
  /** @type {any[]} */
  const found = [];
  /** @type {string | null} */
  let url = '/user/repos?per_page=100&sort=updated';
  while (url) {
    const res = await request(url);
    found.push(...(await res.json()));
    url = nextPage(res.headers.get('Link'));
  }
  return found;
}
/** @param {string} repo 「owner/name」 */
const repoPath = repo => repo.split('/').map(encodeURIComponent).join('/');
/** @param {string} branch */
const refPath = branch => branch.split('/').map(encodeURIComponent).join('/');
/** @param {string} repo @param {string} branch @returns {Promise<string>} the commit the branch is at */
export const headOf = async (repo, branch) => (await getJson(`/repos/${repoPath(repo)}/git/ref/heads/${refPath(branch)}`)).object.sha;
/** @param {string} repo @param {string} commit @returns {Promise<{ tree: string, date: number }>} the commit's tree, and when it was made */
export async function commitOf(repo, commit) {
  const c = await getJson(`/repos/${repoPath(repo)}/git/commits/${commit}`);
  return { tree: c.tree.sha, date: Date.parse(c.committer?.date ?? '') || 0 };
}
/** @param {string} repo @param {string} commit @returns {Promise<string>} the commit's tree */
export const treeOf = async (repo, commit) => (await commitOf(repo, commit)).tree;
// when a file was last changed on a branch (its last commit; 0 when it has none)
// the latest commit of the repository's default branch (none: an empty repository, GitHubError 409)
/** @param {string} repo @returns {Promise<any[]>} */
export const latest = repo => getJson(`/repos/${repoPath(repo)}/commits?per_page=1`);
/** @param {string} repo @param {string} branch @param {string} path @returns {Promise<number>} */
export async function lastChange(repo, branch, path) {
  const list = await getJson(`/repos/${repoPath(repo)}/commits?sha=${encodeURIComponent(branch)}&path=${encodeURIComponent(path)}&per_page=1`);
  return Date.parse(list[0]?.commit?.committer?.date ?? '') || 0;
}
/** @param {string} repo @param {string} tree */
export const treeFiles = (repo, tree) => getJson(`/repos/${repoPath(repo)}/git/trees/${tree}?recursive=1`);
/** @param {string} repo @param {string} sha @returns {Promise<string>} its content, base64 */
export const blob = async (repo, sha) => (await getJson(`/repos/${repoPath(repo)}/git/blobs/${sha}`)).content;
// the commits of a branch that changed a file, the newest first (500 at most)
/** @param {string} repo @param {string} branch @param {string} path @returns {Promise<any[]>} */
export async function commitsOf(repo, branch, path) {
  /** @type {any[]} */
  const found = [];
  /** @type {string | null} */
  let url = `/repos/${repoPath(repo)}/commits?sha=${encodeURIComponent(branch)}&path=${encodeURIComponent(path)}&per_page=100`;
  for (let page = 0; url && page < 5; page++) {
    const res = await request(url);
    found.push(...(await res.json()));
    url = nextPage(res.headers.get('Link'));
  }
  return found;
}
// the commits of a branch, the newest first (300 at most)
/** @param {string} repo @param {string} branch @returns {Promise<any[]>} */
export async function branchCommits(repo, branch) {
  /** @type {any[]} */
  const found = [];
  /** @type {string | null} */
  let url = `/repos/${repoPath(repo)}/commits?sha=${encodeURIComponent(branch)}&per_page=100`;
  for (let page = 0; url && page < 3; page++) {
    const res = await request(url);
    found.push(...(await res.json()));
    url = nextPage(res.headers.get('Link'));
  }
  return found;
}
// the repository's branches (100 at most)
/** @param {string} repo @returns {Promise<string[]>} */
export const branches = async repo => (await getJson(`/repos/${repoPath(repo)}/branches?per_page=100`)).map((/** @type {{ name: string }} */ b) => b.name);
// a branch made at a commit
/** @param {string} repo @param {string} name @param {string} commit */
export const newBranch = (repo, name, commit) => send('POST', `/repos/${repoPath(repo)}/git/refs`, { ref: `refs/heads/${name}`, sha: commit });
// what `head` has that `base` has not: its commits and the files they change
/** @param {string} repo @param {string} base @param {string} head @returns {Promise<{ commits: any[], files: any[], merge_base_commit: { sha: string } }>} */
export const compare = (repo, base, head) => getJson(`/repos/${repoPath(repo)}/compare/${refPath(base)}...${refPath(head)}`);
// the blob of a file at a commit (the Contents API)
/** @param {string} repo @param {string} path @param {string} ref @returns {Promise<string>} */
export const shaAt = async (repo, path, ref) =>
  (await getJson(`/repos/${repoPath(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`)).sha;
// `head` merged into `base` on GitHub: the merge commit, or null when base had it all (a conflict: GitHubError 409)
/** @param {string} repo @param {string} base @param {string} head @param {string} message @returns {Promise<string | null>} */
export async function merge(repo, base, head, message) {
  const res = await request(`/repos/${repoPath(repo)}/merges`, {
    method: 'POST',
    body: JSON.stringify({ base, head, commit_message: message }),
    headers: { 'Content-Type': 'application/json' },
  });
  return res.status === 204 ? null : (await res.json()).sha;
}
// the repository's releases and tags (100 each at most)
/** @param {string} repo @returns {Promise<any[]>} */
export const releases = repo => getJson(`/repos/${repoPath(repo)}/releases?per_page=100`);
/** @param {string} repo @returns {Promise<string[]>} */
export const tags = async repo => (await getJson(`/repos/${repoPath(repo)}/tags?per_page=100`)).map((/** @type {{ name: string }} */ t) => t.name);
// a release made: the tag at the commit, with its name and what it says
/** @param {string} repo @param {{ tag: string, commit: string, name: string, body: string }} r */
export const newRelease = (repo, r) =>
  send('POST', `/repos/${repoPath(repo)}/releases`, { tag_name: r.tag, target_commitish: r.commit, name: r.name, body: r.body });
// the commit a tag is at (an annotated tag is followed to its commit)
/** @param {string} repo @param {string} tag @returns {Promise<string>} */
export async function tagCommit(repo, tag) {
  let o = (await getJson(`/repos/${repoPath(repo)}/git/ref/tags/${refPath(tag)}`)).object;
  for (let i = 0; o.type === 'tag' && i < 5; i++) o = (await getJson(`/repos/${repoPath(repo)}/git/tags/${o.sha}`)).object;
  return o.sha;
}
// a file as it was at a commit: its blob and its content (base64)
/** @param {string} repo @param {string} path @param {string} ref @returns {Promise<{ sha: string, content: string }>} */
export const fileAt = (repo, path, ref) =>
  getJson(`/repos/${repoPath(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`);
/** @param {string} repo @param {string} text @returns {Promise<string>} the new blob */
export const newBlob = async (repo, text) => (await send('POST', `/repos/${repoPath(repo)}/git/blobs`, { content: text, encoding: 'utf-8' })).sha;
/** @param {string} repo @param {string} base64 @returns {Promise<string>} the new blob of these bytes */
export const newBytes = async (repo, base64) => (await send('POST', `/repos/${repoPath(repo)}/git/blobs`, { content: base64, encoding: 'base64' })).sha;
/** @param {string} repo @param {string} base @param {{ path: string, mode: string, type: 'blob', sha: string | null }[]} tree (sha null: the file deleted) */
export const newTree = async (repo, base, tree) => (await send('POST', `/repos/${repoPath(repo)}/git/trees`, { base_tree: base, tree })).sha;
/** @param {string} repo @param {string} message @param {string} tree @param {string} parent */
export const newCommit = async (repo, message, tree, parent) =>
  (await send('POST', `/repos/${repoPath(repo)}/git/commits`, { message, tree, parents: [parent], ...writtenBy() })).sha;
// who a commit is written by: an App's commits, the author (GitHub would write them as the App; so it does when the
// author is not known yet); a token's, its user
const writtenBy = () => (app?.author ? { author: app.author, committer: app.author } : {});
// moves the branch onto the commit, only forward (a branch moved on elsewhere since: GitHubError 422)
/** @param {string} repo @param {string} branch @param {string} commit */
export const moveBranch = (repo, branch, commit) => send('PATCH', `/repos/${repoPath(repo)}/git/refs/heads/${refPath(branch)}`, { sha: commit, force: false });

// --- the repository itself (FR-WORK-02, FR-GH-02, FR-GH-10, FR-GH-11, FR-GH-12)

/** @typedef {import('../lib/works.js').RepoMeta} RepoMeta */
// a repository as GitHub says it now, or null when it is not found (GitHub sends a renamed one's old name on)
/** @param {string} path @returns {Promise<RepoMeta | null>} */
async function metaAt(path) {
  try {
    const r = await getJson(path);
    return { id: r.id, full_name: r.full_name, default_branch: r.default_branch, visibility: r.visibility, private: r.private };
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) return null;
    throw err;
  }
}
/** @param {string} repo */
export const repoMeta = repo => metaAt(`/repos/${repoPath(repo)}`);
/** @param {number} id */
export const repoById = id => metaAt(`/repositories/${id}`);
// a file put in a repository with its commit (the Contents API: the only way to make the first commit of an empty one)
/** @param {string} repo @param {string} path @param {string} base64 @param {string} message @returns {Promise<string>} the commit */
export const putFile = async (repo, path, base64, message) =>
  (await send('PUT', `/repos/${repoPath(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, { message, content: base64, ...writtenBy() }))
    .commit.sha;
// a request with another token than the one in use (`as`: the one with Administration, an App's JWT or an
// installation's token), its answer and the next page's address
/** @param {string} as @param {string} method @param {string} path @param {unknown} [body] @returns {Promise<{ json: any, next: string | null }>} */
export async function requestAs(as, method, path, body) {
  const res = await request(
    path,
    body === undefined ? { method } : { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } },
    as,
  );
  return { json: await res.json(), next: nextPage(res.headers.get('Link')) };
}
/** @param {string} as @param {string} method @param {string} path @param {unknown} [body] @returns {Promise<any>} */
const sendAs = async (as, method, path, body) => (await requestAs(as, method, path, body)).json;
// a private repository made with the token `as` (Administration): the owner's (its user's when '' or its own login)
/** @param {string} as @param {string} owner @param {string} name @param {string} description @returns {Promise<RepoMeta>} */
export async function createRepo(as, owner, name, description) {
  const me = (await sendAs(as, 'GET', '/user')).login;
  const body = { name, description, private: true, auto_init: false };
  const r = await sendAs(as, 'POST', !owner || owner === me ? '/user/repos' : `/orgs/${encodeURIComponent(owner)}/repos`, body);
  return { id: r.id, full_name: r.full_name, default_branch: r.default_branch || 'main', visibility: r.visibility, private: r.private };
}
// a repository renamed with the token `as` (Administration); GitHub sends the old name on to it
/** @param {string} as @param {string} repo @param {string} name @returns {Promise<RepoMeta>} */
export async function renameRepo(as, repo, name) {
  const r = await sendAs(as, 'PATCH', `/repos/${repoPath(repo)}`, { name });
  return { id: r.id, full_name: r.full_name, default_branch: r.default_branch, visibility: r.visibility, private: r.private };
}

// A GitHub App made from its manifest (GitHub's manifest flow): the code GitHub gave back turned into the App, with its
// private key (pem). Asked without a token: the code is the proof, and it is taken once, within the hour
/** @param {string} code @returns {Promise<{ id: number, client_id: string, slug: string, pem: string }>} */
export async function convertManifest(code) {
  const res = await fetch(`${API}/app-manifests/${encodeURIComponent(code)}/conversions`, {
    method: 'POST',
    cache: 'no-store',
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (!res.ok) throw new GitHubError(failure(res.status), res.status);
  return res.json();
}
