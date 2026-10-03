# Official Vite release fixtures

These are fixed, tiny, reviewed in-repository applications built with the exact official `vite` version in `package-lock.json`. The product does not execute uploaded source, run Vite on user input, or fetch user-supplied URLs.

## Releases

- `old`: a shell with two dynamic imports, a lazy shared dependency, lazy CSS, a JavaScript-imported SVG, and a CSS background SVG
- `new`: changes the shared dependency, lazy CSS, and both SVGs; Vite also changes the dependent lazy chunk URLs
- `unrelated`: only changes shell text; the old lazy closure retains identical URLs and SHA-256 values

`fixtures/app` contains the common application. `fixtures/releases/old` and `new` provide the only differing source files. The unrelated release deliberately reuses the old sources with a shell-only build constant.

## Commands and evidence

1. `npm ci --ignore-scripts` installs locked development tools
2. `npm run fixture:build` builds all three releases into ignored `fixture-output/` and updates the checked-in `fixtures/generated/` snapshots
3. `npm run fixture:verify` rebuilds and rejects any byte or manifest drift against those snapshots
4. `npm test` includes real-output model checks and real static HTTP response/hash checks, without a browser launch
5. The reviewed CI release gate installs Chromium and runs `npm run fixture:browser`, followed by the product UI test

`*.manifest.json` is the actual Vite manifest. `*.inventory.json` lists every emitted regular file with measured byte length and SHA-256, including `index.html` and `.vite/manifest.json`. `metadata.json` identifies the five old lazy-closure URLs changed by the new release. Snapshot generation includes no wall-clock timestamps or machine paths.

The CI browser gate enables Chromium's sandbox and uses a fresh context for each case. It opens the old document, verifies that none of the lazy closure has been fetched, switches the server's release in-process, and clicks the old tab's lazy feature. Cases:

- Replacement: actual missing old lazy dependency request and caught lazy-load failure
- Retain all: old feature, CSS, and both assets load successfully
- Declared subset: the model's missing-file checklist is retained; it contains fewer files than the full old output
- Unrelated negative control: replacement still loads the old lazy feature successfully with identical content hashes

Screenshots and JSON request/model evidence are saved under `test-results/fixture/` by CI. No browser result is claimed until that CI job has actually run successfully. The script refuses a local launch; browser execution in the current cloud workspace was not attempted.

## Limits

The static server has no SPA fallback, caching, CDN, service worker, authentication, API, or release-switching HTTP endpoint. It binds only to loopback, serves exact inventoried bytes, and gives new files precedence at colliding paths. These tests establish these fixture behaviors, not general deployment safety or a recommended retention duration.

The model intentionally includes the old entry JS in its declared closure. The unrelated control therefore still reports that missing old entry URL, even though an already-open browser has already evaluated it and successfully imports its unchanged lazy branch. That difference is a deliberate guard against treating graph reachability as a prediction of runtime requests.

Official references: [Vite manifest schema](https://vite.dev/guide/backend-integration), [Vite static assets](https://vite.dev/guide/assets), [Rolldown code splitting](https://rolldown.rs/in-depth/manual-code-splitting), [Playwright browser installation](https://playwright.dev/docs/browsers).
