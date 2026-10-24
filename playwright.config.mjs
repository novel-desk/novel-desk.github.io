// Playwright Test: the screen tests (tests/ui/*.spec.mjs, fixtures in tests/ui/lib/test.mjs). `npm run test:ui`
// Chrome (installed here) and WebKit (Safari's engine), from Playwright's image in Docker: this machine's system is too
// old for Playwright's WebKit (it needs glibc 2.38), as in the server version. NW_NO_WEBKIT=1 leaves WebKit out.
// The app is served as files by tools/serve.mjs on localhost; GitHub is a fake (tests/ui/lib/fake-github.mjs)
import { defineConfig } from '@playwright/test';

const PORT = 4173;
const WEBKIT_PORT = 3124;
const webkit = !process.env.NW_NO_WEBKIT;
// No service worker but in the test of offline: in WebKit, the requests of a page that a service worker controls are not
// seen by Playwright's routing, and would reach the real GitHub instead of the fake
const use = { baseURL: `http://localhost:${PORT}/`, serviceWorkers: /** @type {const} */ ('block') };
const chrome = { ...use, browserName: 'chromium', channel: 'chrome', headless: true };
const webkitUse = { ...use, browserName: 'webkit', connectOptions: { wsEndpoint: `ws://127.0.0.1:${WEBKIT_PORT}/` } };

export default defineConfig({
  testDir: 'tests/ui',
  testMatch: '*.spec.mjs',
  workers: 2,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [['list']],
  outputDir: 'test-results',
  projects: [{ name: 'chrome', use: chrome }, ...(webkit ? [{ name: 'webkit', use: webkitUse }] : [])],
  webServer: [
    { command: `PORT=${PORT} node tools/serve.mjs`, port: PORT, reuseExistingServer: false, stdout: 'ignore' },
    // the WebKit of Playwright's image, on this machine's network (so it reaches the server on localhost). The container
    // is stopped when the run ends, and one left from a run that was killed is removed first
    ...(webkit
      ? [
          {
            command:
              `bash -c 'docker rm -f nwjs-ui-webkit >/dev/null 2>&1; trap "docker stop nwjs-ui-webkit >/dev/null 2>&1" EXIT INT TERM; ` +
              `docker run --rm --init --network host --name nwjs-ui-webkit mcr.microsoft.com/playwright:v1.64.1-noble ` +
              `npx -y playwright@1.64.1 run-server --port ${WEBKIT_PORT} --host 127.0.0.1 & wait'`,
            port: WEBKIT_PORT,
            reuseExistingServer: false,
            timeout: 180000,
            stdout: /** @type {const} */ ('ignore'),
            stderr: /** @type {const} */ ('pipe'),
            gracefulShutdown: { signal: /** @type {const} */ ('SIGTERM'), timeout: 20000 },
          },
        ]
      : []),
  ],
});
