import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const fixtureUrl = new URL('./fixtures/stage10-routes.json', import.meta.url);
const fixture = JSON.parse(await readFile(fileURLToPath(fixtureUrl), 'utf8'));
const baseUrl = process.env.STE_SMOKE_URL ?? 'http://127.0.0.1:4173/';

async function fetchPage(pathname) {
  const url = new URL(pathname, baseUrl);
  const response = await fetch(url);
  assert.equal(response.ok, true, `${pathname} returned HTTP ${response.status}`);
  const html = await response.text();
  const marker = fixture.rootMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(html, new RegExp(marker), `${pathname} is missing the app root`);
  return html;
}

const rootHtml = await fetchPage('/');
for (const route of fixture.routes) await fetchPage(route);

const entryCandidates = [...rootHtml.matchAll(/(?:src|href)="([^\"]+\.(?:js|tsx|css))"/g)]
  .map((match) => match[1])
  .filter((path) => path.startsWith('/'));
assert.ok(entryCandidates.length > 0, 'index page did not expose a loadable app asset');

for (const asset of entryCandidates.slice(0, 3)) {
  const response = await fetch(new URL(asset, baseUrl));
  assert.equal(response.ok, true, `${asset} returned HTTP ${response.status}`);
}

console.log(`stage10 route smoke passed: ${fixture.routes.length} routes, ${entryCandidates.length} app assets`);
