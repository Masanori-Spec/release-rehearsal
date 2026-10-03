import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, version as viteVersion } from 'vite';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const outputRoot = join(projectRoot, 'fixture-output');
export const snapshotRoot = join(projectRoot, 'fixtures/generated');
export const releaseNames = ['old', 'new', 'unrelated'];
export const fixtureEntry = 'index.html';
export const lazyEntry = 'src/lazy.js';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function inventory(directory, prefix = '') {
  const files = [];
  for (const entry of (await readdir(join(directory, prefix), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await inventory(directory, path));
    else if (entry.isFile()) {
      const bytes = await readFile(join(directory, path));
      files.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
    } else throw new Error(`Unexpected non-file fixture output: ${path}`);
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function manifestClosure(manifest, entry) {
  const files = new Set();
  const seen = new Set();
  function walk(key) {
    if (seen.has(key)) return;
    seen.add(key);
    const node = manifest[key];
    assert.ok(node, `Missing fixture manifest key ${key}`);
    files.add(node.file);
    for (const path of [...(node.css ?? []), ...(node.assets ?? [])]) files.add(path);
    for (const key of [...(node.imports ?? []), ...(node.dynamicImports ?? [])]) walk(key);
  }
  walk(entry);
  return [...files].sort();
}

export async function buildFixtures({ verify = false } = {}) {
  // Only this repository's fixed, reviewed tiny fixture source is ever built.
  // Product uploads never reach this script, Vite, or an execution API.
  await mkdir(outputRoot, { recursive: true });
  await mkdir(snapshotRoot, { recursive: true });
  const fixtures = {};
  const snapshots = {};
  for (const name of releaseNames) {
    const source = join(outputRoot, 'source', name);
    const dist = join(outputRoot, name);
    await rm(source, { recursive: true, force: true });
    await cp(join(projectRoot, 'fixtures/app'), source, { recursive: true });
    await cp(join(projectRoot, 'fixtures/releases', name === 'new' ? 'new' : 'old'), join(source, 'src'), { recursive: true });
    await build({
      configFile: false,
      root: source,
      base: '/',
      logLevel: 'warn',
      define: { __SHELL_RELEASE__: JSON.stringify(name === 'unrelated' ? 'old shell with unrelated copy edit' : `${name} shell`) },
      build: {
        outDir: dist,
        emptyOutDir: true,
        manifest: true,
        assetsInlineLimit: 0,
        cssCodeSplit: true,
        sourcemap: false,
        target: 'es2022',
        rolldownOptions: {
          output: {
            codeSplitting: { groups: [{ name: 'shared', test: /[/\\]shared\.js$/, minSize: 0 }] },
          },
        },
      },
    });
    const manifest = JSON.parse(await readFile(join(dist, '.vite/manifest.json'), 'utf8'));
    const files = await inventory(dist);
    const measuredInventory = { files };
    fixtures[name] = { manifest, inventory: measuredInventory, dist };
    snapshots[`${name}.manifest.json`] = manifest;
    snapshots[`${name}.inventory.json`] = measuredInventory;
  }
  const oldLazy = manifestClosure(fixtures.old.manifest, lazyEntry);
  const newFiles = new Set(fixtures.new.inventory.files.map(file => file.path));
  const unrelatedFiles = new Map(fixtures.unrelated.inventory.files.map(file => [file.path, file]));
  const oldFiles = new Map(fixtures.old.inventory.files.map(file => [file.path, file]));
  const changedLazy = oldLazy.filter(path => !newFiles.has(path));
  assert.ok(changedLazy.some(path => /lazy-.*\.js$/.test(path)), 'Changed lazy chunk missing');
  assert.ok(changedLazy.some(path => /shared-.*\.js$/.test(path)), 'Changed shared dependency missing');
  assert.ok(changedLazy.some(path => /\.css$/.test(path)), 'Changed lazy CSS missing');
  assert.ok(changedLazy.filter(path => /\.svg$/.test(path)).length >= 2, 'Changed JS and CSS assets missing');
  for (const path of oldLazy) {
    assert.equal(unrelatedFiles.get(path)?.sha256, oldFiles.get(path)?.sha256, `Negative control changed lazy dependency ${path}`);
  }
  assert.notEqual(fixtures.old.manifest[fixtureEntry].file, fixtures.unrelated.manifest[fixtureEntry].file, 'Negative control must actually change entry');
  snapshots['metadata.json'] = {
    format: 1,
    viteVersion,
    fixtureEntry,
    lazyEntry,
    source: 'fixed in-repository fixture source; official Vite build()',
    inventory: 'SHA-256 and byte lengths measured from emitted files, including index.html and .vite/manifest.json',
    lazyClosure: oldLazy,
    removedLazyFiles: changedLazy,
    negativeControl: 'Only shell text changes; every old lazy-closure URL has identical bytes',
  };
  for (const [name, value] of Object.entries(snapshots)) {
    const body = `${JSON.stringify(value, null, 2)}\n`;
    const target = join(snapshotRoot, name);
    if (verify) assert.equal(await readFile(target, 'utf8'), body, `Fixture snapshot drift: ${relative(projectRoot, target)}. Run npm run fixture:build and review the diff.`);
    else await writeFile(target, body);
  }
  console.log(`${verify ? 'Verified' : 'Built'} official Vite ${viteVersion} fixtures: ${releaseNames.join(', ')}; ${oldLazy.length} old lazy dependencies, ${changedLazy.length} changed paths.`);
  return fixtures;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const unexpected = process.argv.slice(2).filter(arg => arg !== '--verify');
  if (unexpected.length) throw new Error(`Unsupported fixture-build arguments: ${unexpected.join(', ')}`);
  await buildFixtures({ verify: process.argv.includes('--verify') });
}
