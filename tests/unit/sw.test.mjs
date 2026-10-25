// The service worker keeps every file of the app's screens, and nothing that is not there
import { test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../..');

test('sw.js FILES: the page, its scripts and modules, the style, the manifest and the icons', () => {
  const src = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const files = JSON.parse(
    /const FILES = (\[[^\]]*\])/
      .exec(src)[1]
      .replace(/'/g, '"')
      .replace(/,\s*\]/, ']'),
  );
  const modules = ['lib', 'ui'].flatMap(dir => readdirSync(join(ROOT, dir)).map(f => `${dir}/${f}`));
  const top = ['index.html', 'app.js', 'boot.js', 'style.css', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
  expect([...files].sort()).toEqual(['./', ...top, ...modules].sort());
});
