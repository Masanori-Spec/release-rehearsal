import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { DEMOS } from '../src/demo.js';
import { parseInventory, parseManifest, rehearse } from '../src/model.js';

// Source-level state regression harness, not a substitute for the CI browser
// gate. Controllable file reads and Worker deliveries exercise interrupted
// event ordering deterministically without launching a browser.
const appSource = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8'))
  .replace(/^import \{DEMOS\} from '\.\/demo\.js';\n/, '')
  .replace("new URL('./worker.js',import.meta.url)", "'worker.js'");

class Element {
  constructor(tag = 'div') {
    this.tag = tag;
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    this.handlers = {};
    this.children = [];
  }
  addEventListener(name, handler) { this.handlers[name] = handler; }
  append(...children) {
    this.children.push(...children);
    if (this.tag === 'select' && !this.value && children.length) this.value = children[0].value;
  }
  replaceChildren(...children) {
    this.children = [];
    if (this.tag === 'select') this.value = '';
    this.append(...children);
  }
  focus() {}
  remove() {}
  click() {}
}

function harness() {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, new Element(id === 'entry' ? 'select' : 'div'));
    return elements.get(id);
  };
  get('demo').value = 'changed';
  const workers = [];
  const timers = [];
  const windowHandlers = {};
  class Worker {
    constructor() { workers.push(this); }
    postMessage(data) { this.sent = data; }
    terminate() { this.terminated = true; }
  }
  const context = {
    DEMOS,
    document: {
      getElementById: get,
      createElement: tag => new Element(tag),
      createTextNode: text => ({ textContent: text }),
      body: new Element('body'),
    },
    window: { addEventListener(name,handler) { windowHandlers[name]=handler; } },
    Worker,
    URL,
    Blob,
    setTimeout: callback => { timers.push(callback); return timers.length; },
    clearTimeout() {},
  };
  vm.runInNewContext(appSource, context, { filename: 'app.js' });
  return { get, workers, timers, windowHandlers };
}

function beginUpload(ui, inputId = 'old-file') {
  let resolve;
  const text = new Promise(complete => { resolve = complete; });
  const target = { files: [{ size: 100, text: () => text }], value: 'selected.json' };
  const completion = ui.get(inputId).handlers.change({ target });
  return { resolve, completion };
}

function answer(worker) {
  const data = worker.sent;
  const oldManifest = parseManifest(data.oldText);
  const report = rehearse({
    oldManifest,
    newManifest: parseManifest(data.newText),
    oldInventory: data.oldInventoryText.trim() ? parseInventory(data.oldInventoryText) : undefined,
    newInventory: data.newInventoryText.trim() ? parseInventory(data.newInventoryText) : undefined,
    entry: data.entry,
    policy: data.policy,
    retained: data.retained,
  });
  worker.onmessage({ data: {
    id: data.id,
    entries: [...oldManifest].filter(([, chunk]) => chunk.isEntry).map(([key]) => key),
    report,
    json: JSON.stringify(report),
  } });
}

const uploadedManifest = JSON.stringify({ 'alternate.html': { file: 'alternate.js', isEntry: true } });

test('successful file read invalidates an already rendered report computed during the read', async () => {
  const ui = harness();
  const upload = beginUpload(ui);
  ui.get('run').handlers.click();
  answer(ui.workers.at(-1));
  assert.equal(ui.get('results').hidden, false, 'baseline report was rendered');
  upload.resolve(uploadedManifest);
  await upload.completion;
  assert.equal(ui.get('old-text').value, uploadedManifest);
  assert.equal(ui.get('results').hidden, true, 'upload completion must hide the stale report');
});

test('successful file read rejects a late Worker response for pre-upload input', async () => {
  const ui = harness();
  const upload = beginUpload(ui);
  ui.get('run').handlers.click();
  const worker = ui.workers.at(-1);
  upload.resolve(uploadedManifest);
  await upload.completion;
  assert.equal(worker.terminated, true, 'completion must stop the stale Worker');
  answer(worker); // Simulates a response already queued before termination.
  assert.equal(ui.get('old-text').value, uploadedManifest);
  assert.equal(ui.get('results').hidden, true, 'late data must not revive the stale report');
});

test('manual text edit wins over an older pending file read', async () => {
  const ui = harness();
  const upload = beginUpload(ui);
  ui.get('old-text').value = 'manual input';
  ui.get('old-text').handlers.input();
  upload.resolve(uploadedManifest);
  await upload.completion;
  assert.equal(ui.get('old-text').value, 'manual input');
});

test('a newer completed file read wins over an older delayed read', async () => {
  const ui = harness();
  const first = beginUpload(ui);
  const second = beginUpload(ui);
  second.resolve(uploadedManifest);
  await second.completion;
  first.resolve('obsolete input');
  await first.completion;
  assert.equal(ui.get('old-text').value, uploadedManifest);
});

test('loading a demo cancels an older pending file read', async () => {
  const ui = harness();
  const upload = beginUpload(ui);
  ui.get('load-demo').handlers.click();
  const demoText = ui.get('old-text').value;
  upload.resolve(uploadedManifest);
  await upload.completion;
  assert.equal(ui.get('old-text').value, demoText);
});


test('timeout retires the Worker token and rejects an already queued success response', () => {
  const ui=harness(); ui.get('run').handlers.click(); const worker=ui.workers.at(-1);
  ui.timers[0]();
  assert.equal(worker.terminated,true);
  assert.match(ui.get('message').textContent,/8秒/);
  answer(worker);
  assert.equal(ui.get('results').hidden,true);
  assert.match(ui.get('message').textContent,/8秒/);
});

test('Worker error retires its token and rejects an already queued success response', () => {
  const ui=harness(); ui.get('run').handlers.click(); const worker=ui.workers.at(-1);
  worker.onerror();
  const error=ui.get('message').textContent;
  answer(worker);
  assert.equal(ui.get('results').hidden,true);
  assert.equal(ui.get('message').textContent,error);
});

test('pagehide retires a pending Worker without accepting its queued response', () => {
  const ui=harness(); ui.get('run').handlers.click(); const worker=ui.workers.at(-1);
  ui.windowHandlers.pagehide(); answer(worker);
  assert.equal(worker.terminated,true);
  assert.equal(ui.get('results').hidden,true);
  assert.match(ui.get('message').textContent,/中断/);
});

test('pagehide preserves an already completed report and rejects duplicate Worker delivery', () => {
  const ui=harness(); ui.get('run').handlers.click(); const worker=ui.workers.at(-1);answer(worker);
  const banner=ui.get('result-banner').textContent;
  ui.windowHandlers.pagehide();
  worker.onmessage({data:{id:worker.sent.id,error:'late duplicate'}});
  assert.equal(ui.get('results').hidden,false);
  assert.equal(ui.get('result-banner').textContent,banner);
  assert.doesNotMatch(ui.get('message').textContent,/late duplicate/);
});
