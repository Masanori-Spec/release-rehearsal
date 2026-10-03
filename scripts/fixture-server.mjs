import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { outputRoot, releaseNames, sha256 } from './fixture-build.mjs';

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.json', 'application/json; charset=utf-8'],
]);

export async function startFixtureServer(fixtures) {
  const releases = new Map();
  for (const name of releaseNames) {
    const files = new Map();
    for (const item of fixtures[name].inventory.files) {
      if (!item.path || item.path.startsWith('/') || item.path.split('/').includes('..')) throw new Error('Invalid fixture inventory path');
      const bytes = await readFile(join(outputRoot, name, item.path));
      if (sha256(bytes) !== item.sha256 || bytes.length !== item.bytes) throw new Error(`Fixture byte drift: ${name}/${item.path}`);
      files.set(item.path, { bytes, sha256: item.sha256 });
    }
    releases.set(name, files);
  }
  let activeRelease = 'old';
  let policy = 'replacement';
  let retained = new Set();
  let phase = 'before-switch';
  const requests = [];
  const server = createServer((req, res) => {
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).replace(/^\//, '') || 'index.html'; }
    catch { res.writeHead(400).end(); return; }
    // Exact inventory lookup only. No arbitrary disk paths, proxying, or SPA fallback.
    let origin = activeRelease;
    let file = releases.get(activeRelease).get(path);
    if (!file && activeRelease !== 'old' && (policy === 'retain-all' || (policy === 'retain-subset' && retained.has(path)))) {
      origin = 'old';
      file = releases.get('old').get(path);
    }
    const status = file ? 200 : 404;
    requests.push({ method, path, status, origin: file ? origin : 'absent', phase, sha256: file?.sha256 ?? null });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!file) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Fixture file not retained'); return; }
    const extension = path.slice(path.lastIndexOf('.'));
    res.writeHead(200, { 'Content-Type': contentTypes.get(extension) ?? 'application/octet-stream', 'Content-Length': file.bytes.length });
    res.end(method === 'HEAD' ? undefined : file.bytes);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    switchRelease(name, nextPolicy = 'replacement', declared = []) {
      if (!releases.has(name) || name === 'old') throw new Error('Choose new or unrelated fixture release');
      if (!['replacement', 'retain-all', 'retain-subset'].includes(nextPolicy)) throw new Error('Unknown fixture retention policy');
      activeRelease = name;
      policy = nextPolicy;
      retained = new Set(declared);
      phase = 'after-switch';
    },
    async close() { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); },
  };
}
