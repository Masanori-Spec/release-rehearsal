import {readFile,readdir,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const productFiles=['src/app.js','src/model.js','src/demo.js','src/worker.js'];
for(const file of productFiles){const text=await readFile(resolve(root,file),'utf8');assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|eval)\s*\(|\bnew\s+Function\b|innerHTML|outerHTML|insertAdjacentHTML|localStorage|sessionStorage|indexedDB/.test(text),`Forbidden product behavior in ${file}`);}
const html=await readFile(resolve(root,'index.html'),'utf8');assert.match(html,/<html lang="ja">/);assert.match(html,/connect-src 'none'/);assert.doesNotMatch(html,/<script(?![^>]*\bsrc=)[^>]*>/);assert.doesNotMatch(html,/\son\w+=/i);assert.ok(html.includes('デプロイの安全性'));
const all=[];async function walk(dir){for(const name of await readdir(resolve(root,dir))){if(['node_modules','fixture-output','.git','test-results'].includes(name))continue;const path=dir?`${dir}/${name}`:name;if((await stat(resolve(root,path))).isDirectory())await walk(path);else if(/\.(?:js|mjs)$/.test(path))all.push(path);}}await walk('');
for(const file of all){const r=spawnSync(process.execPath,['--check',resolve(root,file)],{encoding:'utf8'});assert.equal(r.status,0,`${file}\n${r.stderr}`);}
console.log(`Static safety/syntax checks passed (${all.length} JavaScript files). This does not replace browser or security review.`);
