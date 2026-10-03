import assert from 'node:assert/strict';
import test from 'node:test';
import { LIMITS, parseInventory, parseManifest, rehearse } from '../src/model.js';

const parse = value => parseManifest(JSON.stringify(value));
const oldManifest = parse({ main: { file: 'current-old.js', isEntry: true } });
const newManifest = parse({ main: { file: 'new.js', isEntry: true } });

for (const policy of ['replacement', 'retain-all']) {
  test(`${policy} ignores stale hidden subset paths from a previous manifest`, () => {
    const report = rehearse({ oldManifest, newManifest, entry: 'main', policy, retained: ['previous-old.js'] });
    assert.equal(report.files[0].status, policy === 'replacement' ? 'missing' : 'retained');
    assert.deepEqual(report.retainedPaths, []);
  });
}

test('retain-subset still rejects stale paths instead of inventing old-file availability', () => {
  assert.throws(() => rehearse({ oldManifest, newManifest, entry: 'main', policy: 'retain-subset', retained: ['previous-old.js'] }));
});

test('maximum accepted unique-file graph fits the inventory and apply-retention limits', () => {
  const raw = Object.fromEntries(Array.from({ length: 4 }, (_, index) => [`c${index}`, {
    file: `assets/c${index}.js`,
    ...(index === 0 ? { isEntry: true, imports: ['c1', 'c2', 'c3'] } : {}),
    assets: Array.from({ length: 499 }, (_, asset) => `assets/c${index}-${asset}.svg`),
  }]));
  const manifest = parse(raw);
  const replacement = rehearse({ oldManifest: manifest, newManifest: parse({}), entry: 'c0' });
  assert.equal(replacement.retentionChecklist.length, LIMITS.manifestFiles);
  assert.equal(LIMITS.manifestFiles, LIMITS.inventoryFiles);
  const inventory = parseInventory(JSON.stringify({ files: replacement.retentionChecklist.map(row => ({ path: row.path })) }));
  const retained = rehearse({
    oldManifest: manifest,
    newManifest: parse({}),
    oldInventory: inventory,
    entry: 'c0',
    policy: 'retain-subset',
    retained: replacement.retentionChecklist.map(row => row.path),
  });
  assert.equal(retained.graphCounts.missing, 0);
  assert.equal(retained.graphCounts.retained, LIMITS.manifestFiles);
  raw.c3.assets.push('assets/one-over.svg');
  assert.throws(() => parse(raw), /固有ファイル/);
});
