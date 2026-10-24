import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
// the PNG icons drawn from icon.svg (`node tools/icons.mjs`)
const dir = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const svg = readFileSync(`${dir}/icon.svg`, 'utf8');
const b = await chromium.launch({ channel: 'chrome' });
for (const [file, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await p.screenshot({ path: `${dir}/${file}` });
  await p.close();
}
await b.close();
