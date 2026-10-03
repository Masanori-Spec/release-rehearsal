import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFixtures, sha256 } from '../scripts/fixture-build.mjs';
import { startFixtureServer } from '../scripts/fixture-server.mjs';
import { parseManifest, parseInventory, rehearse } from '../src/model.js';

const fixtures = await buildFixtures({ verify: true });
const parsed = Object.fromEntries(Object.entries(fixtures).map(([name, fixture]) => [name, {
  manifest: parseManifest(JSON.stringify(fixture.manifest)),
  inventory: parseInventory(JSON.stringify(fixture.inventory)),
}]));
const model = (release, policy, retained = []) => rehearse({
  oldManifest: parsed.old.manifest,
  newManifest: parsed[release].manifest,
  oldInventory: parsed.old.inventory,
  newInventory: parsed[release].inventory,
  entry: 'index.html', policy, retained,
});
const declared = model('new', 'replacement').retentionChecklist.map(row => row.path);

for (const [release, policy] of [['new', 'replacement'], ['new', 'retain-all'], ['new', 'retain-subset'], ['unrelated', 'replacement']]) {
  test(`actual fixture HTTP bytes match model: ${release}/${policy}`, async () => {
    const server = await startFixtureServer(fixtures);
    try {
      const baseline = await fetch(server.url);
      assert.equal(baseline.status, 200);
      assert.equal(sha256(Buffer.from(await baseline.arrayBuffer())), parsed.old.inventory.get('index.html').sha256);
      server.switchRelease(release, policy, policy === 'retain-subset' ? declared : []);
      for (const row of model(release, policy, declared).files) {
        const response = await fetch(`${server.url}/${row.path}`);
        assert.equal(response.status, row.status === 'missing' ? 404 : 200, row.path);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        if (response.ok) {
          const origin = row.origin === 'old' ? 'old' : release;
          assert.equal(sha256(Buffer.from(await response.arrayBuffer())), parsed[origin].inventory.get(row.path).sha256, row.path);
        }
      }
      const document = await fetch(server.url);
      assert.equal(sha256(Buffer.from(await document.arrayBuffer())), parsed[release].inventory.get('index.html').sha256, 'New release wins same-path collisions even with retention');
      assert.equal((await fetch(`${server.url}/assets/absent.js`)).status, 404, 'No SPA fallback masks missing chunks');
      assert.equal((await fetch(server.url, { method: 'POST' })).status, 405, 'No external release-switching endpoint');
    } finally { await server.close(); }
  });
}
