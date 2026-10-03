# Security and privacy boundaries

The browser product reads local JSON as data. It does not evaluate source, upload files, accept arbitrary URLs, perform network requests, or create accounts. The checked-in CSP blocks connections and embedding; the loopback development server exposes only the fixed product HTML, icon and src assets. No browser storage API is used.

Strict parsing rejects duplicate/reserved keys, unresolved manifest references, URLs, traversal, controls, unsupported paths, oversized documents and excessive graph sizes. Prototype-sensitive data is placed in Maps or null-prototype parser objects. Display uses text nodes rather than HTML injection. The Worker is replaceable and time bounded. Resource limits are practical guards, not a security audit or a guarantee against all browser denial of service.

The app cannot validate that an uploaded inventory matches the real output directory or server. SHA-256 equality describes supplied values, not a trusted attestation. Do not paste secrets; manifests can reveal source names and internal paths. The app does not need credentials or customer data. Browser extensions, OS clipboard, downloaded reports, screenshots, session restoration, and the hosting server's initial static page request are outside the app's control.

The fixture test server and Vite builder run only reviewed source from this repository. They never receive product uploads. Server switching occurs through an in-process test API, with no network mutation endpoint. Browser test evidence separates actual browser requests from later Node HTTP probes. Chromium sandbox stays enabled, and CI permissions are read-only contents. No deployment, repository mutation, cloud credential or third-party account is configured by the workflow.

This repository does not offer a production incident response service. To report a bug, provide a minimized synthetic reproduction without internal source paths, tokens, or customer information.
