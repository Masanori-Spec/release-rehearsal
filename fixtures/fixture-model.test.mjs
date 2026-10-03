import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { parseManifest, parseInventory, rehearse, traceManifest } from '../src/model.js';

const load = async (name, type) => readFile(new URL(`generated/${name}.${type}.json`, import.meta.url), 'utf8');
const fixtures = {};
for (const name of ['old', 'new', 'unrelated']) fixtures[name] = {
  manifest: parseManifest(await load(name, 'manifest')),
  inventory: parseInventory(await load(name, 'inventory')),
};
const report = (name, policy, retained = []) => rehearse({
  oldManifest: fixtures.old.manifest,
  newManifest: fixtures[name].manifest,
  oldInventory: fixtures.old.inventory,
  newInventory: fixtures[name].inventory,
  entry: 'index.html', policy, retained,
});

test('official Vite fixture exposes changed lazy/shared/CSS/asset URLs through the actual manifest', () => {
  const result = report('new', 'replacement');
  const missing = result.files.filter(file => file.status === 'missing');
  for (const pattern of [/lazy-.*\.js$/, /shared-.*\.js$/, /lazy-.*\.css$/, /badge-.*\.svg$/, /texture-.*\.svg$/]) {
    assert.ok(missing.some(file => pattern.test(file.path)), `Missing fixture edge: ${pattern}`);
  }
  assert.ok(result.affectedDynamicEntries.some(entry => entry.key === 'src/lazy.js'));
  assert.equal(result.retentionEstimate.complete, true);
  assert.ok(result.retentionEstimate.knownBytes > 0);
});

test('declared subset retains precisely missing reachable old paths with measured bytes', () => {
  const replacement = report('new', 'replacement');
  const declared = replacement.retentionChecklist.map(file => file.path);
  assert.ok(declared.length < fixtures.old.inventory.size);
  for (const policy of ['retain-all', 'retain-subset']) {
    const result = report('new', policy, declared);
    assert.equal(result.graphCounts.missing, 0);
    assert.equal(result.graphCounts['changed-content'], 0);
    assert.equal(result.graphCounts['unknown-content'], 0);
    assert.equal(result.graphCounts.retained, declared.length);
  }
});

test('unrelated entry update preserves every old lazy closure URL and SHA-256', () => {
  const result = report('unrelated', 'replacement');
  const lazyPaths = traceManifest(fixtures.old.manifest, 'src/lazy.js').reachableFiles;
  assert.equal(lazyPaths.length, 5);
  for (const path of lazyPaths) {
    assert.equal(result.files.find(file => file.path === path).status, 'same-content');
    assert.equal(fixtures.old.inventory.get(path).sha256, fixtures.unrelated.inventory.get(path).sha256);
  }
  assert.notEqual(fixtures.old.manifest.get('index.html').file, fixtures.unrelated.manifest.get('index.html').file);
  assert.ok(result.files.some(file => file.status === 'missing'), 'Conservative graph includes old entry; it must not pretend to predict browser failure');
  assert.deepEqual(result.affectedDynamicEntries, []);
});
