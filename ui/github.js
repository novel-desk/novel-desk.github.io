// The requests to GitHub's REST API, with the token (in memory only). Every address is under api.github.com: the page's
// CSP lets nothing else be reached
import { API, failure, nextPage } from '../lib/github.js';

/** @type {string} */
let token = '';
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
/** @param {string} url @param {RequestInit} [init] */
async function request(url, init = {}) {
  /** @type {Response} */
  let res;
  try {
    res = await fetch(url.startsWith('https://') ? url : API + url, {
      ...init,
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: `Bearer ${token}`, ...init.headers },
    });
  } catch {
    throw new GitHubError('GitHub につながりません（オフラインかもしれません）', 0);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new GitHubError(failure(res.status, body.message), res.status);
  }
  return res;
}
/** @param {string} path @returns {Promise<any>} */
export const getJson = async path => (await request(path)).json();
/** @param {string} method @param {string} path @param {unknown} body @returns {Promise<any>} */
export const send = async (method, path, body) =>
  (await request(path, { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })).json();

// the repositories the token can read, every page of them
export async function repos() {
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
/** @param {string} repo @param {string} commit @returns {Promise<string>} the commit's tree */
export const treeOf = async (repo, commit) => (await getJson(`/repos/${repoPath(repo)}/git/commits/${commit}`)).tree.sha;
/** @param {string} repo @param {string} tree */
export const treeFiles = (repo, tree) => getJson(`/repos/${repoPath(repo)}/git/trees/${tree}?recursive=1`);
/** @param {string} repo @param {string} sha @returns {Promise<string>} its content, base64 */
export const blob = async (repo, sha) => (await getJson(`/repos/${repoPath(repo)}/git/blobs/${sha}`)).content;
/** @param {string} repo @param {string} text @returns {Promise<string>} the new blob */
export const newBlob = async (repo, text) => (await send('POST', `/repos/${repoPath(repo)}/git/blobs`, { content: text, encoding: 'utf-8' })).sha;
/** @param {string} repo @param {string} base @param {{ path: string, mode: string, type: 'blob', sha: string }[]} tree */
export const newTree = async (repo, base, tree) => (await send('POST', `/repos/${repoPath(repo)}/git/trees`, { base_tree: base, tree })).sha;
/** @param {string} repo @param {string} message @param {string} tree @param {string} parent */
export const newCommit = async (repo, message, tree, parent) =>
  (await send('POST', `/repos/${repoPath(repo)}/git/commits`, { message, tree, parents: [parent] })).sha;
// moves the branch onto the commit, only forward (a branch moved on elsewhere since: GitHubError 422)
/** @param {string} repo @param {string} branch @param {string} commit */
export const moveBranch = (repo, branch, commit) => send('PATCH', `/repos/${repoPath(repo)}/git/refs/heads/${refPath(branch)}`, { sha: commit, force: false });
