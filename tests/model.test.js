import test from 'node:test';
import assert from 'node:assert/strict';
import { parseManifest, parseInventory, traceManifest, rehearse } from '../src/model.js';
import { oracleReachability, oracleAvailability, randomManifest } from './oracle.js';

const parse = (value) => parseManifest(JSON.stringify(value));
const inventory = (files) => parseInventory(JSON.stringify({ files }));
const sorted = (values) => [...values].sort();
const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const single = (file = 'assets/main.js') => parse({
  'src/main.js': { file, isEntry: true, src: 'src/main.js' },
});
const inventoryFor = (manifest, overrides = {}, extras = []) => inventory([
  ...[...new Set([...manifest.values()].flatMap((chunk) => [chunk.file, ...(chunk.css ?? []), ...(chunk.assets ?? [])]))]
    .map((path) => ({ path, ...overrides[path] })),
  ...extras,
]);

function checkWitness(manifest, entry, path, witness, minimumDistance) {
  assert.ok(Array.isArray(witness), `evidence array for ${path}`);
  assert.deepEqual(witness[0], { type: 'entry', value: entry });
  assert.equal(witness.length, minimumDistance + 2, `shortest witness for ${path}`);
  let key = entry;
  for (const step of witness.slice(1, -1)) {
    assert.ok(['imports', 'dynamicImports'].includes(step.type), 'only dependency steps precede terminal');
    assert.ok((manifest.get(key)[step.type] ?? []).includes(step.value), `real graph edge ${key} -> ${step.value}`);
    key = step.value;
  }
  const terminal = witness.at(-1);
  assert.equal(terminal.value, path);
  if (terminal.type === 'file') assert.equal(manifest.get(key).file, path);
  else {
    assert.ok(['css', 'assets'].includes(terminal.type));
    assert.ok((manifest.get(key)[terminal.type] ?? []).includes(path));
  }
}

test('Vite manifest parsing preserves chunk references and optional terminal assets', () => {
  const parsed = parse({
    'src/main.js': { file: 'assets/main-abc.js', src: 'src/main.js', name: 'main', names: ['main'], isEntry: true, imports: ['_vendor.js'], dynamicImports: ['src/editor.js'], css: ['assets/main.css'], assets: ['assets/logo.svg'] },
    '_vendor.js': { file: 'assets/vendor.js' },
    'src/editor.js': { file: 'assets/editor.js', isDynamicEntry: true },
  });
  assert.ok(parsed instanceof Map);
  assert.equal(parsed.size, 3);
  assert.equal(parsed.get('src/main.js').file, 'assets/main-abc.js');
  assert.deepEqual(parsed.get('src/main.js').imports, ['_vendor.js']);
});

test('inventory supports optional size and SHA-256 metadata', () => {
  const parsed = inventory([{ path: 'assets/a.js', bytes: 0, sha256: hashA }, { path: 'assets/b.js' }]);
  assert.ok(parsed instanceof Map);
  assert.equal(parsed.get('assets/a.js').bytes, 0);
  assert.equal(parsed.get('assets/a.js').sha256, hashA);
  assert.ok(parsed.has('assets/b.js'));
});

for (const [label, value] of [
  ['null', null], ['array', []], ['string', 'manifest'], ['number', 4],
  ['missing file', { main: {} }], ['non-string file', { main: { file: 4 } }],
  ['null chunk', { main: null }], ['array chunk', { main: [] }],
  ['unknown chunk field', { main: { file: 'main.js', import: [] } }],
  ['imports not array', { main: { file: 'main.js', imports: 'dep' } }],
  ['dependency not string', { main: { file: 'main.js', imports: [1] } }],
  ['css not array', { main: { file: 'main.js', css: 'main.css' } }],
  ['asset not string', { main: { file: 'main.js', assets: [null] } }],
  ['entry flag not boolean', { main: { file: 'main.js', isEntry: 'true' } }],
  ['dynamic flag not boolean', { main: { file: 'main.js', isDynamicEntry: 1 } }],
  ['unresolved static reference', { main: { file: 'main.js', imports: ['absent'] } }],
  ['unresolved dynamic reference', { main: { file: 'main.js', dynamicImports: ['absent'] } }],
]) test(`rejects malformed manifest: ${label}`, () => assert.throws(() => parse(value)));

for (const text of ['{', '', '{"main":{"file":"main.js"},}', '{"main":{"file":"a.js"},"main":{"file":"b.js"}}']) {
  test(`rejects malformed or ambiguous manifest JSON: ${JSON.stringify(text)}`, () => assert.throws(() => parseManifest(text)));
}

for (const path of [
  '', '/etc/passwd', '../main.js', 'assets/../main.js', './main.js', 'assets/./main.js',
  'assets//main.js', 'assets/', 'https://example.com/main.js', '//example.com/main.js',
  'data:text/javascript,x', 'C:\\main.js', 'assets\\main.js', 'main.js?token=x', 'main.js#x',
  'assets/%2e%2e/main.js', 'main%00.js', 'assets/line\n.js', 'assets/tab\t.js', 'main\u0000.js',
  '__proto__', 'constructor', 'prototype', 'assets/__proto__/a.js', 'assets/constructor/a.js',
  'assets/prototype/a.js', '<script>.js', 'a'.repeat(241),
]) test(`rejects unsafe file path: ${JSON.stringify(path)}`, () => {
  assert.throws(() => parse({ main: { file: path } }));
  assert.throws(() => inventory([{ path }]));
});

test('rejects prototype-control chunk keys without mutating Object.prototype', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const input = `{"${key}":{"file":"assets/main.js"}}`;
    assert.throws(() => parseManifest(input));
  }
  assert.equal({}.polluted, undefined);
});

test('rejects unsafe references in each graph and terminal field', () => {
  for (const field of ['imports', 'dynamicImports', 'css', 'assets']) {
    assert.throws(() => parse({ main: { file: 'main.js', [field]: ['../escape'] } }));
  }
});

for (const [label, value] of [
  ['null', null], ['array root', []], ['missing files', {}], ['files not array', { files: {} }],
  ['missing path', { files: [{}] }], ['null record', { files: [null] }],
  ['negative bytes', { files: [{ path: 'a.js', bytes: -1 }] }],
  ['fractional bytes', { files: [{ path: 'a.js', bytes: 1.2 }] }],
  ['unsafe integer bytes', { files: [{ path: 'a.js', bytes: Number.MAX_SAFE_INTEGER + 1 }] }],
  ['string bytes', { files: [{ path: 'a.js', bytes: '1' }] }],
  ['short digest', { files: [{ path: 'a.js', sha256: 'abc' }] }],
  ['non-hex digest', { files: [{ path: 'a.js', sha256: 'z'.repeat(64) }] }],
  ['digest not string', { files: [{ path: 'a.js', sha256: 123 }] }],
  ['duplicate path', { files: [{ path: 'a.js' }, { path: 'a.js' }] }],
  ['unknown record field', { files: [{ path: 'a.js', size: 12 }] }],
]) test(`rejects malformed inventory: ${label}`, () => assert.throws(() => parseInventory(JSON.stringify(value))));

test('enforces resource limits before expensive analysis', () => {
  assert.throws(() => parseManifest(' '.repeat(512 * 1024 + 1) + '{}'));
  assert.throws(() => parseInventory(' '.repeat(512 * 1024 + 1) + '{"files":[]}'));
  assert.throws(() => parse(Object.fromEntries(Array.from({ length: 401 }, (_, index) => [`c${index}`, { file: `assets/${index}.js` }]))));
  assert.throws(() => inventory(Array.from({ length: 2001 }, (_, index) => ({ path: `assets/${index}.js` }))));
  assert.throws(() => parse({ main: { file: 'main.js', css: Array.from({ length: 513 }, (_, index) => `assets/${index}.css`) } }));
  assert.throws(() => parse(Object.fromEntries(Array.from({ length: 400 }, (_, index) => [`c${index}`, {
    file: `assets/${index}.js`, imports: Array.from({ length: 9 }, (_, target) => `c${target}`),
  }]))));
});

test('documented inclusive input limits accept valid boundary cases', () => {
  assert.equal(single('a'.repeat(240)).size, 1);
  assert.equal(inventory(Array.from({ length: 2000 }, (_, index) => ({ path: `assets/${index}.js` }))).size, 2000);
  assert.equal(inventory([{ path: 'asset.bin', bytes: 1_000_000_000_000 }]).get('asset.bin').bytes, 1_000_000_000_000);
  const chunks = Object.fromEntries(Array.from({ length: 400 }, (_, index) => [`c${index}`, {
    file: `assets/${index}.js`, imports: Array.from({ length: 7 }, (_, target) => `c${target}`),
  }]));
  assert.equal(parse(chunks).size, 400, '400 files plus 2800 graph edges equals 3200 references');
  assert.equal(parse({ main: { file: 'main.js', assets: Array.from({ length: 512 }, (_, index) => `assets/${index}.svg`) } }).get('main').assets.length, 512);
  const base = '{"files":[]}';
  assert.equal(parseInventory(base + ' '.repeat(512 * 1024 - base.length)).size, 0);
});

test('cyclic dependencies terminate and disconnected declarations stay excluded', () => {
  const manifest = parse({
    main: { file: 'main.js', imports: ['shared'], dynamicImports: ['editor'] },
    shared: { file: 'shared.js', imports: ['main'], css: ['shared.css'] },
    editor: { file: 'editor.js', imports: ['shared'], assets: ['icon.svg'] },
    unused: { file: 'unused.js', css: ['unused.css'], assets: ['unused.svg'] },
  });
  const result = traceManifest(manifest, 'main');
  assert.deepEqual(result.chunks, ['editor', 'main', 'shared']);
  assert.deepEqual(result.reachableFiles, ['editor.js', 'icon.svg', 'main.js', 'shared.css', 'shared.js']);
  assert.equal(result.fileKinds.get('shared.css'), 'css');
  assert.equal(result.fileKinds.get('icon.svg'), 'asset');
  assert.equal(result.fileKinds.get('main.js'), 'js');
});

test('trace rejects a nonexistent entry', () => assert.throws(() => traceManifest(single(), 'missing')));

test('120 seeded cyclic and disconnected graphs match an independent fixed-point oracle', () => {
  for (let seed = 1; seed <= 120; seed += 1) {
    const manifest = parse(Object.fromEntries(randomManifest(seed)));
    const expected = oracleReachability(manifest, 'chunk-0');
    const actual = traceManifest(manifest, 'chunk-0');
    assert.deepEqual(actual.reachableFiles, expected.files, `reachable files, seed ${seed}`);
    assert.deepEqual(actual.chunks, expected.chunkKeys, `reachable chunks, seed ${seed}`);
    for (const file of expected.files) checkWitness(manifest, 'chunk-0', file, actual.fileEvidence.get(file), expected.fileDistance.get(file));
  }
});

test('evidence uses the shortest dependency chain rather than first long discovery', () => {
  const manifest = parse({
    main: { file: 'main.js', imports: ['long', 'short'] },
    long: { file: 'long.js', imports: ['middle'] },
    middle: { file: 'middle.js', dynamicImports: ['target'] },
    short: { file: 'short.js', dynamicImports: ['target'] },
    target: { file: 'target.js', css: ['target.css'] },
  });
  const trace = traceManifest(manifest, 'main');
  assert.deepEqual(trace.fileEvidence.get('target.css'), [
    { type: 'entry', value: 'main' }, { type: 'imports', value: 'short' },
    { type: 'dynamicImports', value: 'target' }, { type: 'css', value: 'target.css' },
  ]);
});

test('reordering input keys and edges preserves deterministic evidence', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const original = randomManifest(seed, 18);
    const reversed = new Map([...original].reverse().map(([key, chunk]) => [key, {
      ...chunk,
      imports: [...chunk.imports].reverse(), dynamicImports: [...chunk.dynamicImports].reverse(),
      css: [...chunk.css].reverse(), assets: [...chunk.assets].reverse(),
    }]));
    const a = traceManifest(parse(Object.fromEntries(original)), 'chunk-0');
    const b = traceManifest(parse(Object.fromEntries(reversed)), 'chunk-0');
    assert.deepEqual(a.reachableFiles, b.reachableFiles, `file order, seed ${seed}`);
    assert.deepEqual([...a.fileEvidence].sort(), [...b.fileEvidence].sort(), `evidence order, seed ${seed}`);
  }
});

test('replacement reports every reachable old-only path missing', () => {
  const oldManifest = parse({ main: { file: 'old.js', isEntry: true, css: ['old.css'], assets: ['logo.svg'], dynamicImports: ['editor'] }, editor: { file: 'editor.js' }, unused: { file: 'unused.js' } });
  const newManifest = parse({ main: { file: 'new.js', assets: ['logo.svg'] } });
  const report = rehearse({ oldManifest, newManifest, entry: 'main', policy: 'replacement' });
  assert.deepEqual(report.reachableFiles, ['editor.js', 'logo.svg', 'old.css', 'old.js']);
  assert.deepEqual(sorted(report.files.filter((file) => file.status === 'missing').map((file) => file.path)), ['editor.js', 'old.css', 'old.js']);
  assert.equal(report.files.find((file) => file.path === 'logo.svg').status, 'unknown-content');
  assert.equal(report.files.find((file) => file.path === 'logo.svg').origin, 'new');
  assert.ok(!report.files.some((file) => file.path === 'unused.js'));
});

test('retention policies match set-algebra oracle over 30 manifests each', () => {
  for (let seed = 1; seed <= 30; seed += 1) {
    const oldManifest = parse(Object.fromEntries(randomManifest(seed, 18)));
    const newManifest = parse(Object.fromEntries(randomManifest(seed + 1000, 18)));
    const required = oracleReachability(oldManifest, 'chunk-0').files;
    const oldFiles = [...oldManifest.values()].flatMap((chunk) => [chunk.file, ...(chunk.css ?? []), ...(chunk.assets ?? [])]);
    const newFiles = [...newManifest.values()].flatMap((chunk) => [chunk.file, ...(chunk.css ?? []), ...(chunk.assets ?? [])]);
    const retained = required.filter((_, index) => index % 3 === 0);
    for (const policy of ['replacement', 'retain-all', 'retain-subset']) {
      const expected = oracleAvailability({ required, oldFiles, newFiles, policy, retained });
      const actual = rehearse({ oldManifest, newManifest, entry: 'chunk-0', policy, retained });
      assert.deepEqual(sorted(actual.files.filter((file) => file.status === 'missing').map((file) => file.path)), expected.missing, `missing ${policy}, seed ${seed}`);
      assert.deepEqual(sorted(actual.files.filter((file) => file.status !== 'missing').map((file) => file.path)), expected.available, `available ${policy}, seed ${seed}`);
      assert.equal(actual.files.length, required.length);
    }
  }
});

test('retaining an old-only file preserves the old origin', () => {
  const oldManifest = single('assets/old.js');
  const newManifest = single('assets/new.js');
  const report = rehearse({ oldManifest, newManifest, entry: 'src/main.js', policy: 'retain-subset', retained: ['assets/old.js'] });
  assert.equal(report.files[0].status, 'retained');
  assert.equal(report.files[0].origin, 'old');
  assert.equal(report.graphCounts.retained, 1);
});

for (const [label, oldMetadata, newMetadata, expected] of [
  ['equal hashes', { sha256: hashA }, { sha256: hashA }, 'same-content'],
  ['different hashes', { sha256: hashA }, { sha256: hashB }, 'changed-content'],
  ['missing both hashes', { bytes: 12 }, { bytes: 12 }, 'unknown-content'],
  ['different byte sizes without hashes', { bytes: 12 }, { bytes: 13 }, 'unknown-content'],
  ['old hash only', { sha256: hashA }, {}, 'unknown-content'],
  ['new hash only', {}, { sha256: hashA }, 'unknown-content'],
]) test(`same-path content comparison: ${label}`, () => {
  const oldManifest = single();
  const newManifest = single();
  const oldInventory = inventoryFor(oldManifest, { 'assets/main.js': oldMetadata });
  const newInventory = inventoryFor(newManifest, { 'assets/main.js': newMetadata });
  for (const policy of ['replacement', 'retain-all', 'retain-subset']) {
    const result = rehearse({ oldManifest, newManifest, oldInventory, newInventory, entry: 'src/main.js', policy, retained: ['assets/main.js'] });
    assert.equal(result.files[0].status, expected, `${policy} cannot hide collision`);
    assert.equal(result.files[0].origin, 'new', `${policy} new path takes precedence`);
  }
});

test('an inventory can prove an old path remains in the new deployment beyond manifest declarations', () => {
  const oldManifest = single('assets/old.js');
  const newManifest = single('assets/new.js');
  const oldInventory = inventoryFor(oldManifest, { 'assets/old.js': { sha256: hashA } });
  const newInventory = inventoryFor(newManifest, {}, [{ path: 'assets/old.js', sha256: hashA }]);
  const report = rehearse({ oldManifest, newManifest, oldInventory, newInventory, entry: 'src/main.js', policy: 'replacement' });
  assert.equal(report.files[0].status, 'same-content');
  assert.equal(report.files[0].origin, 'new');
});

test('inventories that omit manifest-declared files are rejected rather than quietly inferred', () => {
  const oldManifest = single('assets/old.js');
  const newManifest = single('assets/new.js');
  assert.throws(() => rehearse({ oldManifest, newManifest, oldInventory: inventory([]), entry: 'src/main.js', policy: 'replacement' }));
  assert.throws(() => rehearse({ oldManifest, newManifest, newInventory: inventory([]), entry: 'src/main.js', policy: 'replacement' }));
});

test('dynamic-entry impact includes transitive terminal losses and content concerns', () => {
  const oldManifest = parse({
    main: { file: 'main-old.js', isEntry: true, dynamicImports: ['editor'] },
    editor: { file: 'editor.js', isDynamicEntry: true, imports: ['vendor'], assets: ['editor.svg'] },
    vendor: { file: 'vendor.js', css: ['vendor.css'] },
    unused: { file: 'unused.js', isDynamicEntry: true },
  });
  const newManifest = parse({ main: { file: 'main-new.js', imports: ['vendor'] }, vendor: { file: 'vendor.js' } });
  const report = rehearse({ oldManifest, newManifest, entry: 'main', policy: 'replacement' });
  const affected = report.affectedDynamicEntries.find((item) => item.key === 'editor');
  assert.ok(affected);
  assert.deepEqual(sorted(affected.missingFiles), ['editor.js', 'editor.svg', 'vendor.css']);
  assert.deepEqual(sorted(affected.contentConcernFiles), ['vendor.js']);
  assert.ok(!report.affectedDynamicEntries.some((item) => item.key === 'unused'));
});

test('dynamic-import targets remain visible when optional isDynamicEntry metadata is omitted', () => {
  const oldManifest = parse({ main: { file: 'old.js', isEntry: true, dynamicImports: ['lazy'] }, lazy: { file: 'lazy.js' } });
  const report = rehearse({ oldManifest, newManifest: single('new.js'), entry: 'main', policy: 'replacement' });
  assert.equal(report.affectedDynamicEntries.length, 1);
  assert.equal(report.affectedDynamicEntries[0].key, 'lazy');
  assert.deepEqual(report.affectedDynamicEntries[0].missingFiles, ['lazy.js']);
});

test('dynamic branch samples remain bounded without losing full impact counts', () => {
  const assets = Array.from({ length: 25 }, (_, index) => `assets/lazy-${index}.svg`);
  const oldManifest = parse({ main: { file: 'old.js', isEntry: true, dynamicImports: ['lazy'] }, lazy: { file: 'lazy.js', assets } });
  const newManifest = parse({ main: { file: 'new.js', isEntry: true, assets: assets.slice(0, 10) } });
  const report = rehearse({ oldManifest, newManifest, entry: 'main', policy: 'replacement' });
  const branch = report.affectedDynamicEntries.find((item) => item.key === 'lazy');
  assert.equal(branch.missingFileCount, 16);
  assert.equal(branch.contentConcernFileCount, 10);
  assert.equal(branch.missingFiles.length, 8);
  assert.equal(branch.contentConcernFiles.length, 8);
  assert.equal(branch.samplesTruncated, true);
  const files = new Map(report.files.map((file) => [file.path, file]));
  for (const path of branch.missingFiles) assert.equal(files.get(path).status, 'missing');
  for (const path of branch.contentConcernFiles) assert.equal(files.get(path).status, 'unknown-content');
});

test('rehearsal does not mutate parsed manifests or supplied retained array', () => {
  const oldManifest = parse(Object.fromEntries(randomManifest(22, 12)));
  const newManifest = parse(Object.fromEntries(randomManifest(23, 12)));
  const retained = ['assets/chunk-1.22.js', 'assets/chunk-0.22.js'];
  const before = JSON.stringify({ old: [...oldManifest], next: [...newManifest], retained });
  rehearse({ oldManifest, newManifest, entry: 'chunk-0', policy: 'retain-subset', retained });
  assert.equal(JSON.stringify({ old: [...oldManifest], next: [...newManifest], retained }), before);
});

test('rehearsal rejects invalid policy and unresolved selected entry', () => {
  const oldManifest = single();
  const newManifest = single();
  assert.throws(() => rehearse({ oldManifest, newManifest, entry: 'src/main.js', policy: 'invented' }));
  assert.throws(() => rehearse({ oldManifest, newManifest, entry: 'absent', policy: 'replacement' }));
});

test('availability provenance never presents inferred declarations as deployed-file evidence', () => {
  const oldManifest = single('old.js');
  const newManifest = single('new.js');
  const inferred = rehearse({ oldManifest, newManifest, entry: 'src/main.js', policy: 'replacement' });
  assert.deepEqual(inferred.availabilityBasis, { old: 'manifest-declarations', new: 'manifest-declarations' });
  assert.ok(inferred.limitations.some((text) => /not a deployment safety verdict/i.test(text)));
  const supplied = rehearse({ oldManifest, newManifest, oldInventory: inventoryFor(oldManifest), newInventory: inventoryFor(newManifest), entry: 'src/main.js', policy: 'replacement' });
  assert.deepEqual(supplied.availabilityBasis, { old: 'explicit-inventory', new: 'explicit-inventory' });
});

test('retention byte totals are partial unless every missing path has explicit bytes', () => {
  const oldManifest = parse({ main: { file: 'old.js', isEntry: true, css: ['old.css'], assets: ['logo.svg'] } });
  const newManifest = single('new.js');
  const oldInventory = inventory([{ path: 'old.js', bytes: 25 }, { path: 'old.css', bytes: 0 }, { path: 'logo.svg' }]);
  const report = rehearse({ oldManifest, newManifest, oldInventory, entry: 'main', policy: 'replacement' });
  assert.equal(report.retentionEstimate.knownBytes, 25);
  assert.equal(report.retentionEstimate.knownByteFiles, 2);
  assert.equal(report.retentionEstimate.unknownByteFiles, 1);
  assert.equal(report.retentionEstimate.complete, false);
  const inferred = rehearse({ oldManifest, newManifest, entry: 'main', policy: 'replacement' });
  assert.equal(inferred.retentionEstimate.knownBytes, 0);
  assert.equal(inferred.retentionEstimate.unknownByteFiles, 3);
  assert.equal(inferred.retentionEstimate.complete, false);
});

test('long evidence chains are explicitly clipped to the declared report bound', () => {
  const chunks = Object.fromEntries(Array.from({ length: 60 }, (_, index) => [`c${index}`, {
    file: `assets/c${String(index).padStart(3, '0')}.js`,
    ...(index === 0 ? { isEntry: true } : {}),
    ...(index < 59 ? { imports: [`c${index + 1}`] } : {}),
  }]));
  const oldManifest = parse(chunks);
  const report = rehearse({ oldManifest, newManifest: single('new.js'), entry: 'c0', policy: 'replacement' });
  const long = report.files.find((row) => row.path === 'assets/c059.js');
  assert.ok(long.evidence.some((step) => step.type === 'omitted'));
  assert.ok(long.evidence.length <= report.outputLimits.evidenceSteps);
  assert.deepEqual(long.evidence[0], { type: 'entry', value: 'c0' });
  assert.deepEqual(long.evidence.at(-1), { type: 'file', value: 'assets/c059.js' });
  assert.equal(traceManifest(oldManifest, 'c0').fileEvidence.get('assets/c059.js').length, 61);
});

test('large report keeps complete classifications while bounding evidence rows', () => {
  const oldManifest = parse({ main: { file: 'main.js', isEntry: true, assets: Array.from({ length: 120 }, (_, index) => `assets/image-${index}.svg`) } });
  const report = rehearse({ oldManifest, newManifest: single('new.js'), entry: 'main', policy: 'replacement' });
  assert.equal(report.files.length, 121);
  assert.equal(report.graphCounts.missing, 121);
  assert.equal(report.retentionChecklist.length, 121);
  assert.equal(report.files.filter((row) => row.evidence).length, 80);
  assert.equal(report.outputLimits.evidenceRows, 80);
  assert.equal(report.outputLimits.evidenceRowsOmitted, 41);
});

test('metadata and duplicate JSON fields cannot bypass semantic validation', () => {
  for (const text of [
    '{"main":{"file":"a.js","file":"b.js"}}',
    '{"main":{"file":"a.js","\\u0066ile":"b.js"}}',
    '{"main":{"file":"a.js","name":"bad\\u202ename"}}',
    '{"main":{"file":"a.js","names":[1]}}',
    '{"main":{"file":"a.js","src":"../hidden"}}',
    '{"main":{"file":"a.js","imports":["main","main"]}}',
  ]) assert.throws(() => parseManifest(text));
  for (const text of [
    '{"files":[],"files":[]}',
    '{"files":[{"path":"a.js","bytes":1,"bytes":2}]}',
    '{"files":[{"path":"a.js","bytes":1e1000}]}',
    '{"files":[{"path":"a.js","bytes":1000000000001}]}',
    '{"files":[{"path":"a.js","bytes":01}]}',
    '{"files":[]} true',
    '{"files":[] /* comment */}',
  ]) assert.throws(() => parseInventory(text));
});

test('retention rejects unknown paths and path traversal rather than accepting invented availability', () => {
  const oldManifest = single('old.js');
  const newManifest = single('new.js');
  for (const retained of [['unknown.js'], ['../old.js'], 'old.js', [null]]) {
    assert.throws(() => rehearse({ oldManifest, newManifest, entry: 'src/main.js', policy: 'retain-subset', retained }));
  }
});
