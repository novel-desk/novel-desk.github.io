// オフラインでも開けるように、アプリの画面のファイルだけを控える。いつもはネットワークを先に使い、届かないときだけ控えを出す。
// GitHub の API への要求には手を出さない（作品の文章とトークンは、画面が IndexedDB に置く）
const CACHE = 'novel-writer-js-v15';
// this worker (self, with the types of a service worker for the type check)
const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));
// every file of the screens (a test checks it against the files of the app)
const FILES = [
  './',
  'index.html',
  'app.js',
  'style.css',
  'manifest.webmanifest',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'lib/branches.js',
  'lib/changes.js',
  'lib/characters.js',
  'lib/commit.js',
  'lib/diff.js',
  'lib/drafts.js',
  'lib/expiry.js',
  'lib/episodes.js',
  'lib/format.js',
  'lib/github.js',
  'lib/history.js',
  'lib/install.js',
  'lib/layout.js',
  'lib/markdown.js',
  'lib/merge.js',
  'lib/notelist.js',
  'lib/notes.js',
  'lib/passkey.js',
  'lib/plot.js',
  'lib/record.js',
  'lib/releases.js',
  'lib/sync.js',
  'lib/toml.js',
  'lib/tomledit.js',
  'lib/view.js',
  'lib/works.js',
  'ui/branches.js',
  'ui/characters.js',
  'ui/db.js',
  'ui/desk.js',
  'ui/dom.js',
  'ui/github.js',
  'ui/history.js',
  'ui/images.js',
  'ui/notes.js',
  'ui/picker.js',
  'ui/plot.js',
  'ui/reading.js',
  'ui/record.js',
  'ui/releases.js',
  'ui/repo.js',
  'ui/send.js',
  'ui/shared.js',
  'ui/sidenote.js',
  'ui/textbox.js',
  'ui/trace.js',
  'ui/unsent.js',
  'ui/vault.js',
  'ui/work.js',
  'ui/works.js',
];
const urls = new Set(FILES.map(f => new URL(f, location.href).href));

sw.addEventListener('install', e => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
      .then(() => sw.skipWaiting()),
  );
});
sw.addEventListener('activate', e => {
  e.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});
sw.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  url.search = '';
  if (e.request.method !== 'GET' || !urls.has(url.href)) return;
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        // (by its address: a page's own request, a navigation, cannot be given other options)
        const res = await fetch(url.href, { cache: 'no-cache' });
        if (res.ok) await cache.put(url.href, res.clone());
        return res;
      } catch (err) {
        const kept = await cache.match(url.href);
        if (kept) return kept;
        throw err;
      }
    })(),
  );
});
