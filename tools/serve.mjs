// The app served from this folder, as GitHub Pages serves it (the screen tests and `npm run serve`): files only, on
// localhost (WebAuthn takes localhost as a secure place; an IP address cannot be a passkey's rp.id).
// NW_COVERAGE=1 (the screen tests): the app's scripts (app.js, boot.js, sw.js, lib/, ui/) are served instrumented by istanbul,
// their counts in globalThis.__coverage__ (tests/ui/lib/coverage.mjs)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PORT = Number(process.env.PORT || 4173);
const COVERAGE = !!process.env.NW_COVERAGE;
/** @type {Map<string, Buffer>} the instrumented scripts, made once for a run */
const instrumented = new Map();
const SCRIPT = /^\/(app\.js|boot\.js|sw\.js|(lib|ui)\/[^/]+\.js)$/;
/** @type {Record<string, string>} */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};
createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname));
  let file = join(ROOT, path);
  if (!file.startsWith(ROOT) || path.includes('node_modules')) return res.writeHead(404).end();
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = COVERAGE && SCRIPT.test(path) ? await instrument(file, path) : await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, 'localhost', () => console.log(`http://localhost:${PORT}/`));

// a script with istanbul's counters (globalThis, not an evaluated function: the page's Content-Security-Policy allows
// no eval). The service worker is a classic script; the rest are modules
/** @param {string} file @param {string} path */
async function instrument(file, path) {
  const done = instrumented.get(file);
  if (done) return done;
  const { createInstrumenter } = await import('istanbul-lib-instrument');
  const inst = createInstrumenter({
    coverageVariable: '__coverage__',
    coverageGlobalScope: 'globalThis',
    coverageGlobalScopeFunc: false,
    esModules: path !== '/sw.js',
    compact: false,
  });
  const body = Buffer.from(inst.instrumentSync(await readFile(file, 'utf8'), file));
  instrumented.set(file, body);
  return body;
}
