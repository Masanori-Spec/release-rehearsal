import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { parseManifest, parseInventory, rehearse, traceManifest } from '../src/model.js';
import { buildFixtures, fixtureEntry, lazyEntry, projectRoot } from './fixture-build.mjs';
import { startFixtureServer } from './fixture-server.mjs';

// This project's cloud sandbox did not permit local browser launches. This gate
// is run in authorized reviewed CI, with the Chromium sandbox left enabled.
if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Browser release gate is CI-only in this project. No local browser is launched.');

const fixtures = await buildFixtures({ verify: true });
const artifacts = join(projectRoot, 'test-results/fixture');
await mkdir(artifacts, { recursive: true });
const parsed = Object.fromEntries(Object.entries(fixtures).map(([name, value]) => [name, {
  manifest: parseManifest(JSON.stringify(value.manifest)),
  inventory: parseInventory(JSON.stringify(value.inventory)),
}]));
const analyze = (name, policy, retained = []) => rehearse({
  oldManifest: parsed.old.manifest,
  newManifest: parsed[name].manifest,
  oldInventory: parsed.old.inventory,
  newInventory: parsed[name].inventory,
  entry: fixtureEntry,
  policy,
  retained,
});
const lazyPaths = traceManifest(parsed.old.manifest, lazyEntry).reachableFiles;
const replacement = analyze('new', 'replacement');
const declared = replacement.files.filter(file => file.status === 'missing').map(file => file.path);
assert.ok(declared.length > 0, 'Model must find old output paths absent in replacement');
assert.ok(declared.length < fixtures.old.inventory.files.length, 'Declared subset must retain fewer files than the full old output');
const cases = [
  { name: 'replacement-fails', release: 'new', policy: 'replacement', expected: 'failed' },
  { name: 'retain-all-passes', release: 'new', policy: 'retain-all', expected: 'loaded' },
  { name: 'declared-subset-passes', release: 'new', policy: 'retain-subset', retained: declared, expected: 'loaded' },
  { name: 'unrelated-negative-control', release: 'unrelated', policy: 'replacement', expected: 'loaded' },
];
const results = [];
const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
try {
  for (const testCase of cases) {
    const server = await startFixtureServer(fixtures);
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const browserErrors = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    const report = analyze(testCase.release, testCase.policy, testCase.retained ?? []);
    const lazyReport = { reachableFiles: lazyPaths, files: report.files.filter(file => lazyPaths.includes(file.path)) };
    try {
      await page.goto(server.url, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.fixtureReady === true);
      assert.equal(await page.locator('#shell-release').textContent(), 'old shell');
      // The lazy closure must be genuinely cold before deployment switches.
      for (const path of lazyReport.reachableFiles) {
        assert.ok(!server.requests.some(request => request.path === path), `Old tab eagerly fetched lazy dependency ${path}`);
      }
      server.switchRelease(testCase.release, testCase.policy, testCase.retained ?? []);
      await page.locator('#load-feature').click();
      await page.waitForFunction(() => window.fixtureResult?.state !== 'waiting');
      const result = await page.evaluate(() => window.fixtureResult);
      assert.equal(result.state, testCase.expected);
      assert.equal(await page.locator('#shell-release').textContent(), 'old shell', 'The old document must stay open');
      if (testCase.expected === 'failed') {
        assert.ok(lazyReport.files.some(file => file.status === 'missing'));
        assert.ok(server.requests.some(request => request.phase === 'after-switch' && request.status === 404 && lazyReport.reachableFiles.includes(request.path)), 'Failure requires an observed old lazy dependency 404');
        assert.match(result.error, /fetch|load|import|css/i);
      } else {
        assert.ok(lazyReport.files.every(file => ['retained', 'same-content'].includes(file.status)), 'Model must account for all old lazy dependencies');
        assert.equal(result.value, 'lazy feature: shared dependency v1');
        await page.waitForFunction(() => { const image = document.querySelector('#feature-badge'); return image?.complete && image.naturalWidth === 32; });
        assert.equal(await page.locator('#result').evaluate(element => getComputedStyle(element).color), 'rgb(23, 79, 143)');
        await page.waitForLoadState('networkidle');
        for (const path of lazyReport.reachableFiles) {
          const request = server.requests.find(request => request.phase === 'after-switch' && request.path === path && request.status === 200);
          assert.ok(request, `No successful browser request for lazy dependency ${path}`);
          assert.equal(request.sha256, parsed.old.inventory.get(path).sha256, `Browser received changed bytes at ${path}`);
        }
        assert.deepEqual(browserErrors, []);
      }
      await page.screenshot({ path: join(artifacts, `${testCase.name}.png`), fullPage: true });
      const browserRequests = server.requests.map(request=>({...request}));
      const probeStart = server.requests.length;
      // Verify every modeled path against real HTTP bytes after the browser test.
      for (const row of report.files) {
        const response = await fetch(`${server.url}/${row.path}`);
        assert.equal(response.status, row.status === 'missing' ? 404 : 200, `Model/HTTP availability disagreement at ${row.path}`);
      }
      results.push({ name: testCase.name, passed: true, browserResult: result, declared: testCase.retained ?? [], report, browserRequests, httpProbeRequests:server.requests.slice(probeStart), browserErrors });
      console.log(`PASS ${testCase.name}`);
    } catch (error) {
      results.push({ name: testCase.name, passed: false, error: error.message, report, requests: server.requests, browserErrors });
      await page.screenshot({ path: join(artifacts, `${testCase.name}-failure.png`), fullPage: true }).catch(() => {});
      throw error;
    } finally {
      await context.close();
      await server.close();
      await writeFile(join(artifacts, 'results.json'), `${JSON.stringify({ browser: browser.version(), sandbox: true, results }, null, 2)}\n`);
    }
  }
} finally {
  await browser.close();
}
