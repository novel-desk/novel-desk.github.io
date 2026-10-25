// A GitHub App's private key in use in place of a token (FR-GH-01: no token to make again every 90 days). The key is
// WebCrypto's, made from the .pem once and kept so that it cannot be taken out (extractable: false; ui/vault.js keeps
// it in IndexedDB). It signs a JWT for 9 minutes; with it, GitHub gives each installation of the App a token for an
// hour, used for the requests about that installation's repositories, and asked for again before it ends and when
// GitHub refuses it (ui/github.js). The commits are written as the author, not as the App
import { base64url, jwtBody, ownerOf, pkcs8Of, renewNow } from '../lib/appkey.js';
import * as gh from './github.js';

/** @typedef {{ name: string, email: string }} Author */

// the key from the .pem's text, that cannot be taken out (throws when it is not a key GitHub made)
/** @param {string} pem @returns {Promise<CryptoKey>} */
export const importKey = pem =>
  crypto.subtle.importKey('pkcs8', /** @type {BufferSource} */ (pkcs8Of(pem)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);

/**
 * The App, as ui/github.js uses it (gh.useApp)
 * @param {string} appId its ID or Client ID @param {CryptoKey} key @param {Author} author @returns {gh.App}
 */
export function appOf(appId, key, author) {
  /** @type {Map<number, { token: string, expires: number }>} the installations' tokens */
  const tokens = new Map();
  /** @type {{ id: number, account: { login: string } }[] | null} where it is installed (read once) */
  let installations = null;
  const jwt = async () => {
    const body = jwtBody(appId, Date.now());
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(body));
    return `${body}.${base64url(new Uint8Array(sig))}`;
  };
  /** @returns {Promise<{ id: number, account: { login: string } }[]>} */
  const listed = async () => (installations ??= (await gh.requestAs(await jwt(), 'GET', '/app/installations?per_page=100')).json);
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
      const owner = ownerOf(url);
      const i = (await listed()).find(x => !owner || x.account.login.toLowerCase() === owner);
      if (!i)
        throw new gh.GitHubError(
          'このリポジトリには GitHub App が入っていません（GitHub の App の設定の Install App で、作品のリポジトリに入れてください）',
          404,
        );
      return tokenOf(i.id, fresh);
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
