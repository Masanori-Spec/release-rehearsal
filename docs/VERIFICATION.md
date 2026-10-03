# Verification status

Date: 2026-10-03. This record distinguishes local checks from the required browser release gate.

## Passed locally

- Core parser / graph / policy / digest / provenance / bytes / bounds tests
- Independent fixed-point oracle over 120 seeded cyclic/disconnected graphs; 90 policy comparisons
- Actual official Vite 8.3.2 old/new/unrelated fixture builds
- Rebuilt fixture manifest / measured byte / SHA-256 snapshot verification
- Actual loopback HTTP availability and content-hash tests across replacement, retain-all, declared subset and unrelated control
- Product JavaScript syntax and static no-network/no-eval/no-HTML-injection checks
- Dependency audit at creation: 0 known vulnerabilities in installed locked dependencies

Exact local suite result is in `local-test-results.txt`. Audit findings are time-dependent.

## Required but not yet run

- Playwright fixture release gate in reviewed, authorized GitHub Actions CI
- Playwright desktop (1440×1000) and mobile (390×844) UI flows, download, reset, invalid input and no off-origin request checks
- Inspection of CI screenshots at both viewports

No local browser launch was retried. The project explicitly refuses its browser commands outside GitHub Actions; Chromium's sandbox remains enabled in CI. Browser verification is pending, not passed. Until the exact reviewed commit's gate succeeds and screenshots are inspected, this remains a source-review candidate.

## Gate assertions

The fixture gate opens an old tab while its lazy closure is cold, changes the same static server's release, then clicks the old tab's lazy feature. Replacement must produce an observed missing dependency and failed lazy load. Retain-all and declared subset must receive the old hashes and load old feature/CSS/assets. The unrelated control must load the unchanged lazy branch under replacement.

A missing old entry JS declaration is deliberately allowed in the unrelated control, since the already-open tab has evaluated it. No blanket assertion equates every graph-missing path to a future browser request. Requests used for browser proof are captured before later HTTP probes and kept separate in JSON evidence.

Fixture model excludes cache, CDN, Service Worker, API, routing rewrites and arbitrary code. It makes no production safety claim. CI artifacts are stored for 14 days; durable evidence should record the exact commit and relevant result files after a successful gate.
