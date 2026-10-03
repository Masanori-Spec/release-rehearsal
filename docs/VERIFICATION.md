# Verification status

Date: 2026-10-03. **Automatically tested public prototype.** The automated source and browser assertions passed. Manual screenshot inspection and separate raw network-JSON inspection were not performed.

## Exact verified CI result

- Repository: [Masanori-Spec/release-rehearsal](https://github.com/Masanori-Spec/release-rehearsal)
- Tested source commit: [`84ebfbd7b6ddf19de6bbaa0cd1edd654e46c7ae4`](https://github.com/Masanori-Spec/release-rehearsal/commit/84ebfbd7b6ddf19de6bbaa0cd1edd654e46c7ae4)
- [Run 37105665374](https://github.com/Masanori-Spec/release-rehearsal/actions/runs/37105665374), [job 111153556846](https://github.com/Masanori-Spec/release-rehearsal/actions/runs/37105665374/job/111153556846): success
- All 52 source files at that commit matched the locally reviewed Git blob contents
- Durable, selected CI text: [ci-log-excerpt.txt](ci-log-excerpt.txt)
- Structured result/provenance record: [CI_EVIDENCE.json](CI_EVIDENCE.json)

Verified CI text reports:

- 117 tests, 117 pass, 0 fail
- 21 JavaScript files pass syntax/static checks
- Official pinned Vite 8.3.2 old/new/unrelated fixture snapshots verified
- Dependency audit reports 0 known vulnerabilities at the time of that run
- PASS `replacement-fails`
- PASS `retain-all-passes`
- PASS `declared-subset-passes`
- PASS `unrelated-negative-control`
- Desktop/mobile UI, worker/error/reset/retention/download/no-off-origin request checks passed

The model suite includes an independent fixed-point oracle for 120 seeded graphs and 90 policy comparisons. It covers cycles, disconnected modules, deterministic shortest witnesses, same-path hashes/unknowns, inventory provenance, partial byte totals, strict malicious input, and declared input/output bounds. Deterministic UI-state regressions cover asynchronous upload races and late queued Worker responses after termination.

The browser suite asserts desktop 1440×1000 and mobile 390×844 flows. It rejects horizontal viewport overflow at those sizes and captures screenshots. These assertions are useful automated evidence; they are not a human visual review.

## What remains uninspected

The browser artifact download host returned a blocked-access error. The ZIP was not downloaded. No bypass or alternate rehosting was used.

Consequently:

- Screenshots have **not** been visually inspected
- Raw network/request JSON has **not** been separately inspected
- Browser version and individual recorded request rows have not been independently extracted from the artifact
- The artifact SHA-256 below is reported by GitHub's upload text; it was **not** recomputed from downloaded bytes

This limitation is retained in the completion scope. The project can be inspected and reproduced as an automatically tested public prototype; it is not claimed to be visually polished by manual inspection, security-audited, production-ready, or universally correct for deployments. No user action is required for this documented prototype deliverable.

## Artifact metadata reported by CI

[Original browser-evidence artifact](https://github.com/Masanori-Spec/release-rehearsal/actions/runs/37105665374/artifacts/11267663300)

- Artifact ID: `11267663300`
- Upload reports: 10 files; 1,492,931 bytes
- Upload-reported SHA-256: `c0728e90bf46cc5badeb8a2843d5f63a85e1a6bf8233c6a883efe8693afca75c`
- GitHub-reported expiry: **2026-10-17 07:14:47 UTC**
- The raw artifact is not included in this repository or source archive

GitHub artifact access and retention are separate from source availability. The durable excerpt and metadata preserve the verified text result without pretending to preserve screenshot or request contents.

## Fixture claim boundary

The gate opens an old tab while its lazy closure is cold, changes the same static server's release, then clicks the old tab's lazy feature. Replacement must produce an observed missing dependency and a caught lazy-load failure. Retain-all and declared subset must receive old hashes and load the old feature/CSS/assets. The unrelated control must load the unchanged lazy branch under replacement.

A missing old entry JS declaration is deliberately allowed in the unrelated control because the already-open tab has evaluated it. No assertion equates every graph-missing path to a future browser request. The test code separates browser requests from later Node HTTP probes. That separation was source-reviewed; the saved JSON itself was not separately inspected.

The fixture model excludes caches, CDN behavior, Service Workers, APIs, routing rewrites and arbitrary uploaded code. Passing this fixture does not establish deployment safety, retention duration, security, or behavior outside the supported model. Chromium's sandbox stays enabled. The browser commands refuse local execution in this project; no denied local browser launch was retried.

## Local reproduction

`npm test`, `npm run check`, `npm run fixture:verify` and `npm audit --audit-level=moderate` passed locally before publication. Exact local output is [local-test-results.txt](local-test-results.txt). The GitHub workflow runs the browser assertions and uploads its own evidence. Audit results and hosted artifact availability may change over time.
