/** Bounded, declarative Vite-manifest reachability. This never executes input. */
export const LIMITS = Object.freeze({ textBytes: 524288, chunks: 400, references: 3200, arrayItems: 512, inventoryFiles: 2000, manifestFiles: 2000, pathLength: 240, evidenceRows: 80, evidenceSteps: 24 });
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const fields = new Set(['file', 'name', 'names', 'src', 'isEntry', 'isDynamicEntry', 'imports', 'dynamicImports', 'css', 'assets']);
const own = (o, k) => Object.hasOwn(o, k);
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const sorted = iterable => [...iterable].sort(cmp);
function fail(message) { throw new Error(message); }
function object(value, label) { if (!value || Array.isArray(value) || typeof value !== 'object') fail(`${label}: object が必要です`); }
function path(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > LIMITS.pathLength || !/^[A-Za-z0-9_@./$+~-]+$/.test(value) || value.startsWith('/') || value.split('/').some(s => !s || s === '.' || s === '..' || forbidden.has(s))) fail(`${label}: 対応する相対パスではありません（URL・特殊文字・空区間・親参照は不可）`);
  return value;
}
function string(value, label) { if (typeof value !== 'string' || value.length > LIMITS.pathLength || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value)) fail(`${label}: 文字列が不正です`); return value; }
/** Reject duplicate object keys and deep nesting before semantic validation. */
export function parseStrictJSON(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > LIMITS.textBytes) fail('JSON は UTF-8 512 KiB 以下にしてください');
  let at = 0;
  const ws = () => { while (at < text.length && /[ \t\r\n]/.test(text[at])) at++; };
  function str() {
    const start = at++;
    while (at < text.length) {
      if (text[at] === '\\') { at += 2; continue; }
      if (text[at++] === '"') { try { return JSON.parse(text.slice(start, at)); } catch { fail('JSON 文字列が不正です'); } }
    }
    fail('JSON 文字列が閉じられていません');
  }
  function value(depth) {
    if (depth > 8) fail('JSON の入れ子が深すぎます');
    ws(); const c = text[at];
    if (c === '"') return str();
    if (c === '{') {
      at++; ws(); const out = Object.create(null); const seen = new Set();
      if (text[at] === '}') { at++; return out; }
      while (at < text.length) {
        ws(); if (text[at] !== '"') fail('JSON キーが不正です'); const key = str();
        if (forbidden.has(key) || seen.has(key)) fail('JSON の予約キー・重複キーは使えません'); seen.add(key);
        ws(); if (text[at++] !== ':') fail('JSON の区切りが不正です'); out[key] = value(depth + 1); ws();
        if (text[at] === '}') { at++; return out; } if (text[at++] !== ',') fail('JSON の区切りが不正です');
      }
      fail('JSON object が閉じられていません');
    }
    if (c === '[') {
      at++; ws(); const out = []; if (text[at] === ']') { at++; return out; }
      while (at < text.length) { out.push(value(depth + 1)); ws(); if (text[at] === ']') { at++; return out; } if (text[at++] !== ',') fail('JSON の配列が不正です'); }
      fail('JSON array が閉じられていません');
    }
    for (const [token, result] of [['true', true], ['false', false], ['null', null]]) if (text.startsWith(token, at)) { at += token.length; return result; }
    const n = text.slice(at).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (n) { at += n[0].length; const result = Number(n[0]); if (!Number.isFinite(result)) fail('JSON 数値が範囲外です'); return result; }
    fail('JSON の値が不正です');
  }
  const result = value(0); ws(); if (at !== text.length) fail('JSON の末尾に余分な内容があります'); return result;
}
export function parseManifest(text) {
  const input = parseStrictJSON(text); object(input, 'manifest'); const keys = Object.keys(input);
  if (keys.length > LIMITS.chunks) fail(`manifest は ${LIMITS.chunks} 項目以下です`);
  const result = new Map(); let references = 0;
  for (const key of keys.sort(cmp)) {
    path(key, 'manifest key'); const c = input[key]; object(c, key);
    for (const f of Object.keys(c)) if (!fields.has(f)) fail(`${key}: 未対応の field ${string(f, 'field')} があります`);
    path(c.file, `${key}.file`); references++;
    const chunk = {file: c.file};
    for (const f of ['src', 'name']) if (own(c, f)) chunk[f] = f === 'src' ? path(c[f], `${key}.${f}`) : string(c[f], `${key}.${f}`);
    for (const f of ['isEntry', 'isDynamicEntry']) if (own(c, f)) { if (typeof c[f] !== 'boolean') fail(`${key}.${f}: boolean が必要です`); chunk[f] = c[f]; }
    for (const f of ['imports', 'dynamicImports', 'css', 'assets', 'names']) if (own(c, f)) {
      if (!Array.isArray(c[f]) || c[f].length > LIMITS.arrayItems) fail(`${key}.${f}: 配列の上限は ${LIMITS.arrayItems} 件です`);
      chunk[f] = Object.freeze(c[f].map(v => f === 'names' ? string(v, f) : path(v, `${key}.${f}`)));
      if (new Set(chunk[f]).size !== chunk[f].length) fail(`${key}.${f}: 重複があります`);
      if (f !== 'names') references += c[f].length;
    }
    if (references > LIMITS.references) fail(`manifest の参照上限は ${LIMITS.references} 件です`);
    result.set(key, Object.freeze(chunk));
  }
  for (const [key, c] of result) for (const f of ['imports', 'dynamicImports']) for (const target of c[f] ?? []) if (!result.has(target)) fail(`${key}.${f}: 参照先 ${target} がありません`);
  if (allFiles(result).size > LIMITS.manifestFiles) fail(`manifest の固有ファイル参照上限は ${LIMITS.manifestFiles} 件です`);
  return result;
}
export function parseInventory(text) {
  const input = parseStrictJSON(text); object(input, 'inventory');
  if (Object.keys(input).length !== 1 || !own(input, 'files') || !Array.isArray(input.files) || input.files.length > LIMITS.inventoryFiles) fail(`inventory は {files:[...]}、上限 ${LIMITS.inventoryFiles} 件です`);
  const result = new Map();
  for (const f of input.files) {
    object(f, 'inventory file'); if (Object.keys(f).some(k => !['path', 'bytes', 'sha256'].includes(k))) fail('inventory に未対応の field があります');
    path(f.path, 'inventory.path'); if (result.has(f.path)) fail('inventory のパスが重複しています');
    if (own(f, 'bytes') && (!Number.isSafeInteger(f.bytes) || f.bytes < 0 || f.bytes > 1e12)) fail('bytes は 0〜1,000,000,000,000 の整数です');
    if (own(f, 'sha256') && (typeof f.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(f.sha256))) fail('sha256 は小文字の16進数64文字です');
    result.set(f.path, Object.freeze({...f}));
  }
  return result;
}
function allFiles(manifest) { const out = new Set(); for (const c of manifest.values()) for (const p of [c.file, ...(c.css ?? []), ...(c.assets ?? [])]) out.add(p); return out; }
function kind(p) { return /\.(m?js)$/.test(p) ? 'js' : p.endsWith('.css') ? 'css' : 'asset'; }
export function traceManifest(manifest, entry) {
  if (!(manifest instanceof Map) || !manifest.has(entry)) fail('entry が manifest にありません');
  const queue = [entry], seen = new Set([entry]), paths = new Map([[entry, [{type:'entry', value:entry}]]]);
  const evidence = new Map(), kinds = new Map();
  for (let i = 0; i < queue.length; i++) {
    const key = queue[i], c = manifest.get(key), before = paths.get(key);
    for (const f of ['file', 'css', 'assets']) for (const p of sorted(f === 'file' ? [c.file] : (c[f] ?? []))) if (!evidence.has(p)) { evidence.set(p, [...before, {type:f, value:p}]); kinds.set(p, kind(p)); }
    for (const f of ['imports', 'dynamicImports']) for (const next of sorted(c[f] ?? [])) if (!seen.has(next)) { if (!manifest.has(next)) fail('未解決の manifest 参照です'); seen.add(next); queue.push(next); paths.set(next, [...before, {type:f, value:next}]); }
  }
  return {reachableFiles:sorted(evidence.keys()), chunks:sorted(seen), fileEvidence:evidence, fileKinds:kinds};
}
function clippedEvidence(items) {
  if (items.length <= LIMITS.evidenceSteps) return items;
  const first = Math.floor((LIMITS.evidenceSteps - 1) / 2), last = LIMITS.evidenceSteps - first - 1;
  return [...items.slice(0, first), {type:'omitted', value:`${items.length - first - last} steps omitted`}, ...items.slice(-last)];
}
function checkInventory(manifest, inventory, label) {
  if (!inventory) return;
  if (!(inventory instanceof Map)) fail(`${label} inventory が不正です`);
  for (const p of allFiles(manifest)) if (!inventory.has(p)) fail(`${label} inventory に manifest 参照 ${p} がありません（部分 inventory は未対応）`);
}
export function rehearse({oldManifest, newManifest, oldInventory, newInventory, entry, policy = 'replacement', retained = []}) {
  if (!(oldManifest instanceof Map) || !(newManifest instanceof Map)) fail('parseManifest で解析してください');
  if (!oldManifest.get(entry)?.isEntry) fail('旧 manifest の isEntry:true を選んでください');
  if (!['replacement', 'retain-all', 'retain-subset'].includes(policy)) fail('保持方針が不正です');
  checkInventory(oldManifest, oldInventory, 'old'); checkInventory(newManifest, newInventory, 'new');
  const oldPaths = oldInventory ? new Set(oldInventory.keys()) : allFiles(oldManifest);
  const newPaths = newInventory ? new Set(newInventory.keys()) : allFiles(newManifest);
  if (policy === 'retain-subset' && (!Array.isArray(retained) || retained.length > LIMITS.inventoryFiles)) fail('保持リストが大きすぎます');
  const chosen = new Set();
  for (const p of policy === 'retain-subset' ? retained : []) { path(p, 'retained'); if (!oldPaths.has(p)) fail(`旧側にない保持パスです: ${p}`); chosen.add(p); }
  const trace = traceManifest(oldManifest, entry);
  const files = trace.reachableFiles.map(p => {
    let status, origin;
    if (newPaths.has(p)) {
      origin = 'new'; const oldHash = oldInventory?.get(p)?.sha256, newHash = newInventory?.get(p)?.sha256;
      status = oldHash && newHash ? (oldHash === newHash ? 'same-content' : 'changed-content') : 'unknown-content';
    } else if (oldPaths.has(p) && (policy === 'retain-all' || (policy === 'retain-subset' && chosen.has(p)))) { status = 'retained'; origin = 'old'; }
    else { status = 'missing'; origin = 'absent'; }
    return {path:p, kind:trace.fileKinds.get(p), status, origin};
  });
  const concerns = files.filter(f => f.status !== 'retained' && f.status !== 'same-content');
  const byPath = new Map(files.map(f => [f.path,f]));
  concerns.slice(0,LIMITS.evidenceRows).forEach(f => { f.evidence = clippedEvidence(trace.fileEvidence.get(f.path)); });
  const affectedDynamicEntries = [];
  const dynamicTargets = new Set(trace.chunks.flatMap(k=>oldManifest.get(k).dynamicImports??[]));
  for (const key of trace.chunks) if (oldManifest.get(key).isDynamicEntry || dynamicTargets.has(key)) {
    const branch = traceManifest(oldManifest, key).reachableFiles;
    const missingFiles = branch.filter(p => byPath.get(p)?.status === 'missing');
    const contentConcernFiles = branch.filter(p => ['changed-content','unknown-content'].includes(byPath.get(p)?.status));
    if (missingFiles.length || contentConcernFiles.length) affectedDynamicEntries.push({key, missingFiles:missingFiles.slice(0,8), missingFileCount:missingFiles.length, contentConcernFiles:contentConcernFiles.slice(0,8), contentConcernFileCount:contentConcernFiles.length, samplesTruncated:missingFiles.length>8||contentConcernFiles.length>8});
  }
  const needed = files.filter(f => f.status === 'missing');
  const retentionChecklist = needed.map(f => ({path:f.path, kind:f.kind, ...(oldInventory?.get(f.path)?.bytes === undefined ? {} : {bytes:oldInventory.get(f.path).bytes}), reason:'old reachable declaration absent under selected policy'}));
  const knownBytesRows = retentionChecklist.filter(f => f.bytes !== undefined);
  const counts = Object.fromEntries(['missing','retained','same-content','changed-content','unknown-content'].map(s => [s,files.filter(f => f.status === s).length]));
  const inventoryStats = inv => inv ? {provided:true, listedFiles:inv.size, byteKnownFiles:[...inv.values()].filter(f=>f.bytes!==undefined).length, knownBytes:[...inv.values()].reduce((s,f)=>s+(f.bytes??0),0)} : {provided:false};
  return {
    schemaVersion:1, model:'Vite manifest declared reachability; not runtime or deployment safety', entry, policy, retainedPaths:policy==='retain-subset'?sorted(chosen):[],
    availabilityBasis:{old:oldInventory?'explicit-inventory':'manifest-declarations',new:newInventory?'explicit-inventory':'manifest-declarations'},
    reachableFiles:trace.reachableFiles, files, graphCounts:{reachableReferences:files.length, reachableChunks:trace.chunks.length, ...counts},
    affectedDynamicEntries, retentionChecklist,
    retentionEstimate:{source:'explicit old inventory only', knownByteFiles:knownBytesRows.length, unknownByteFiles:retentionChecklist.length-knownBytesRows.length, knownBytes:knownBytesRows.reduce((s,f)=>s+f.bytes,0), complete:knownBytesRows.length===retentionChecklist.length},
    inventory:{old:inventoryStats(oldInventory),new:inventoryStats(newInventory)},
    outputLimits:{evidenceRows:Math.min(concerns.length,LIMITS.evidenceRows),evidenceRowsOmitted:Math.max(0,concerns.length-LIMITS.evidenceRows),evidenceSteps:LIMITS.evidenceSteps,omittedStepsMarked:true},
    limitations:[
      'Declared graph over-approximates possibilities; it does not predict requests, timing, cache state, route behavior, or retention duration.',
      'Same path is not proof of same bytes. Hash equality is only as trustworthy as supplied inventories.',
      'New paths take precedence over retained old paths. Same-path content conflicts cannot be fixed by retaining that path.',
      'No application code executes. Runtime-computed imports, public files absent from the manifest, service workers, APIs, CDN rewrites, and external resources are outside this model.',
      'A result with zero missing references is not a deployment safety verdict.'
    ]
  };
}
