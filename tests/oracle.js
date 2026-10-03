/**
 * Independent reference implementation for test use only.
 *
 * Reachability is a monotone fixed point over sets, not a queue/BFS. Shortest
 * distances use repeated whole-graph relaxation. Neither phase imports model
 * code, validation, sorting helpers, or traversal helpers.
 */

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const dependencyKeys = (chunk) => [
  ...(chunk.imports ?? []),
  ...(chunk.dynamicImports ?? []),
];
const declaredFiles = (chunk) => [
  chunk.file,
  ...(chunk.css ?? []),
  ...(chunk.assets ?? []),
];

export function oracleReachability(manifest, entry) {
  if (!manifest.has(entry)) throw new Error('Oracle entry does not exist');
  const reachable = new Set([entry]);
  let changed = true;
  while (changed) {
    changed = false;
    // Snapshot iteration deliberately makes this a set-propagation algorithm.
    for (const key of [...reachable]) {
      for (const dependency of dependencyKeys(manifest.get(key))) {
        if (!manifest.has(dependency)) {
          throw new Error(`Oracle unresolved reference: ${dependency}`);
        }
        if (!reachable.has(dependency)) {
          reachable.add(dependency);
          changed = true;
        }
      }
    }
  }

  const chunkDistance = new Map([...reachable].map((key) => [key, Infinity]));
  chunkDistance.set(entry, 0);
  changed = true;
  while (changed) {
    changed = false;
    for (const key of reachable) {
      const nextDistance = chunkDistance.get(key) + 1;
      for (const dependency of dependencyKeys(manifest.get(key))) {
        if (nextDistance < chunkDistance.get(dependency)) {
          chunkDistance.set(dependency, nextDistance);
          changed = true;
        }
      }
    }
  }

  const fileDistance = new Map();
  for (const key of reachable) {
    for (const file of declaredFiles(manifest.get(key))) {
      const distance = chunkDistance.get(key);
      fileDistance.set(file, Math.min(fileDistance.get(file) ?? Infinity, distance));
    }
  }
  return {
    chunkKeys: [...reachable].sort(compare),
    files: [...fileDistance.keys()].sort(compare),
    chunkDistance,
    fileDistance,
  };
}

/** An intentionally separate availability oracle based only on set algebra. */
export function oracleAvailability({ required, newFiles, oldFiles, policy, retained = [] }) {
  const available = new Set(newFiles);
  const oldSet = new Set(oldFiles);
  if (policy === 'retain-all') {
    for (const path of oldSet) available.add(path);
  } else if (policy === 'retain-subset') {
    for (const path of retained) if (oldSet.has(path)) available.add(path);
  } else if (policy !== 'replacement') {
    throw new Error('Oracle unsupported policy');
  }
  return {
    available: [...required].filter((path) => available.has(path)).sort(compare),
    missing: [...required].filter((path) => !available.has(path)).sort(compare),
  };
}

/** A repeatable PRNG makes every randomized failure reproducible. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Valid Vite-like graphs, including back edges and an unreachable component. */
export function randomManifest(seed, size = 24) {
  const random = seededRandom(seed);
  const manifest = new Map();
  const liveSize = Math.max(2, Math.floor(size * 0.75));
  for (let index = 0; index < size; index += 1) {
    const connectedStart = index < liveSize ? 0 : liveSize;
    const connectedEnd = index < liveSize ? liveSize : size;
    const imports = [];
    const dynamicImports = [];
    for (let target = connectedStart; target < connectedEnd; target += 1) {
      const value = random();
      if (value < 0.07) imports.push(`chunk-${target}`);
      else if (value < 0.14) dynamicImports.push(`chunk-${target}`);
    }
    // Seeded variation plus a guaranteed reachable cycle tests termination.
    if (index === 0) imports.push('chunk-1');
    if (index === 1) dynamicImports.push('chunk-0');
    manifest.set(`chunk-${index}`, {
      file: `assets/chunk-${index}.${seed}.js`,
      imports: [...new Set(imports)],
      dynamicImports: [...new Set(dynamicImports)],
      css: random() < 0.65 ? [`assets/style-${index % 5}.css`] : [],
      assets: random() < 0.65 ? [`assets/image-${index % 7}.svg`] : [],
      ...(index === 0 ? { isEntry: true, src: 'src/main.js' } : {}),
    });
  }
  return manifest;
}
