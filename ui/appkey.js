// A GitHub App's private key in use in place of a token (FR-GH-01: no token to make again every 90 days). The key is
// WebCrypto's, made from the .pem once and kept so that it cannot be taken out (extractable: false; ui/vault.js keeps
// it in IndexedDB). It signs a JWT for 9 minutes; with it, GitHub gives each installation of the App a token for an
// hour, used for the requests about that installation's repositories, and asked for again before it ends and when
// GitHub refuses it (ui/github.js). The commits are written as the author, not as the App
import { appName, base64url, deviceOf, jwtBody, manifestOf, ownerOf, pkcs8Of, renewNow, suffixOf } from '../lib/appkey.js';
import * as store from './db.js';
import * as gh from './github.js';

/** @typedef {{ name: string, email: string }} Author */
/** @typedef {{ id: number, account: { login: string, id: number } }} Installation */

// the key from the .pem's text, that cannot be taken out (throws when it is not a key GitHub made)
/** @param {string} pem @returns {Promise<CryptoKey>} */
export const importKey = pem =>
  crypto.subtle.importKey('pkcs8', /** @type {BufferSource} */ (pkcs8Of(pem)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);

/**
 * The App, as ui/github.js uses it (gh.useApp)
 * @param {string} appId its ID or Client ID @param {CryptoKey} key @param {Author | null} author (null: not known yet) @returns {gh.App}
 */
export function appOf(appId, key, author) {
  /** @type {Map<number, { token: string, expires: number }>} the installations' tokens */
  const tokens = new Map();
  /** @type {Installation[]} where it is installed (read once it is installed somewhere) */
  let installations = [];
  const jwt = async () => {
    const body = jwtBody(appId, Date.now());
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(body));
    return `${body}.${base64url(new Uint8Array(sig))}`;
  };
  /** @returns {Promise<Installation[]>} */
  const listed = async () => {
    if (!installations.length) installations = (await gh.requestAs(await jwt(), 'GET', '/app/installations?per_page=100')).json;
    return installations;
  };
  // the installation on the owner of the repository a request is about (none: the first one)
  /** @param {string} url */
  const installationFor = async url => {
    const owner = ownerOf(url);
    return (await listed()).find(x => !owner || x.account.login.toLowerCase() === owner);
  };
  // an installation's token: the one kept, unless it is to be asked for again
  /** @param {number} id @param {boolean} fresh */
  const tokenOf = async (id, fresh) => {
    const kept = tokens.get(id);
    if (kept && !fresh && !renewNow(kept, Date.now())) return kept.token;
    const made = (await gh.requestAs(await jwt(), 'POST', `/app/installations/${id}/access_tokens`, {})).json;
    tokens.set(id, { token: made.token, expires: Date.parse(made.expires_at) });
    return made.token;
  };
  return {
    author,
    // the token of the installation on the owner of the repository a request is about (none: the first one)
    tokenFor: async (url, fresh) => {
      const i = await installationFor(url);
      if (!i)
        throw new gh.GitHubError(
          'このリポジトリには GitHub App が入っていません（GitHub の App の設定の Install App で、作品のリポジトリに入れてください）',
          404,
        );
      return tokenOf(i.id, fresh);
    },
    // the account it is installed on for a repository (its owner)
    account: async url => (await installationFor(url))?.account,
    // whose it is: the account that made it (the only one it can be installed on: public: false), and its ID and
    // Client ID (GitHub's /app, asked with the JWT: known before it is installed anywhere)
    who: async () => {
      const a = (await gh.requestAs(await jwt(), 'GET', '/app')).json;
      return { id: a.owner.id, login: a.owner.login, appIds: [String(a.id), String(a.client_id)] };
    },
    // the repositories it is installed on, every page of each installation's (the App writes to them: Contents)
    repos: async () => {
      /** @type {any[]} */
      const found = [];
      for (const i of await listed()) {
        const token = await tokenOf(i.id, false);
        /** @type {string | null} */
        let url = '/installation/repositories?per_page=100';
        while (url) {
          const { json, next } = await gh.requestAs(token, 'GET', url);
          found.push(...json.repositories);
          url = next;
        }
      }
      return found.map(r => ({ ...r, permissions: { push: true } }));
    },
  };
}

// --- the manifest flow (FR-GH-01, NFR-SEC-10): GitHub makes the App on the author's account from the manifest posted
// to it, and comes back with a code and the state sent; the code is turned into the App and its key once

// The flow started: its state (random, used once) kept with the passkey made for the key, and the manifest posted to
// GitHub (the page leaves for GitHub: the author presses Create there)
/** @param {Uint8Array | null} credentialId */
export async function startManifest(credentialId) {
  const state = base64url(crypto.getRandomValues(new Uint8Array(24)));
  await store.put('prefs', 'app-manifest', { state, at: Date.now(), credentialId });
  const base = location.origin + location.pathname;
  const form = document.createElement('form');
  form.method = 'post';
  form.action = `https://github.com/settings/apps/new?state=${state}`;
  form.hidden = true;
  const manifest = document.createElement('input');
  manifest.type = 'hidden';
  manifest.name = 'manifest';
  manifest.value = JSON.stringify(manifestOf(base, appName(deviceOf(navigator), new Date(), suffixOf(crypto.getRandomValues(new Uint8Array(6))))));
  form.append(manifest);
  document.body.append(form);
  form.submit();
}
// The App GitHub made, from the code it gave back: its ID (the Client ID, which a JWT names), its slug (its page),
// and its key made at once into one that cannot be taken out. Nothing else of the answer is kept: the private key's
// text, the client secret and the webhook's secret are left with the answer, which nothing holds once this returns
/** @param {string} code @returns {Promise<{ appId: string, slug: string, key: CryptoKey }>} */
export async function madeApp(code) {
  const made = await gh.convertManifest(code);
  return { appId: made.client_id, slug: made.slug, key: await importKey(made.pem) };
}
