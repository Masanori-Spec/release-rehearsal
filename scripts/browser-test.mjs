import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startServer} from './serve.mjs';
if(process.env.GITHUB_ACTIONS!=='true')throw new Error('UI browser checks are CI-only here. No local launch is attempted.');
const output=new URL('../test-results/ui/',import.meta.url);await mkdir(output,{recursive:true});
const server=await startServer();let browser;const evidence=[];
try{
  browser=await chromium.launch({headless:true,chromiumSandbox:true});
  for(const viewport of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844}]){
    const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},serviceWorkers:'block',acceptDownloads:true});
    const page=await context.newPage();const errors=[];const requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',req=>requests.push(req.url()));
    await page.goto(server.url);await page.waitForFunction(()=>document.querySelector('#old-text').value.length>10);
    await page.keyboard.press('Tab');assert.equal(await page.locator('.skip').evaluate(e=>document.activeElement===e),true,'Skip link should be first focusable element');await page.keyboard.press('Enter');
    await page.locator('#run').click();await page.locator('#results').waitFor({state:'visible'});assert.match(await page.locator('#result-banner').textContent(),/不足参照/);assert.equal(await page.locator('#paths .path-card').count(),5);
    assert.ok(await page.locator('#dynamic').textContent().then(t=>t.includes('src/editor.js')));
    const downloadPromise=page.waitForEvent('download');await page.locator('#download').click();const download=await downloadPromise;const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);const report=JSON.parse(Buffer.concat(chunks).toString());assert.equal(report.graphCounts.missing,5);assert.equal(report.retentionChecklist.length,5);
    await page.screenshot({path:new URL(`${viewport.name}-replacement.png`,output).pathname,fullPage:true});
    await page.locator('#apply-retention').click();assert.equal(await page.locator('#policy').inputValue(),'retain-subset');assert.equal(await page.locator('#results').isVisible(),false);await page.locator('#run').click();await page.locator('#results').waitFor({state:'visible'});assert.match(await page.locator('#result-banner').textContent(),/不足参照はありません/);assert.match(await page.locator('#result-banner').textContent(),/安全性を示す結果ではありません/);
    await page.locator('#policy').selectOption('retain-all');await page.locator('#run').click();await page.locator('#results').waitFor({state:'visible'});assert.match(await page.locator('#result-banner').textContent(),/不足参照はありません/);
    await page.locator('#demo').selectOption('unrelated');await page.locator('#load-demo').click();await page.locator('#run').click();await page.locator('#results').waitFor({state:'visible'});assert.equal(await page.locator('#paths .path-card').count(),0);assert.equal(await page.locator('#dynamic .dynamic-item').count(),0);
    await page.locator('#demo').selectOption('collision');await page.locator('#load-demo').click();await page.locator('#run').click();await page.locator('#results').waitFor({state:'visible'});assert.match(await page.locator('#result-banner').textContent(),/内容は未確認/);
    await page.locator('#old-text').fill('{"main.js":{"file":"https://evil.invalid/x.js","isEntry":true}}');assert.equal(await page.locator('#results').isVisible(),false);await page.locator('#run').click();await page.waitForFunction(()=>document.querySelector('#message').classList.contains('error'));assert.match(await page.locator('#message').textContent(),/相対パス/);
    await page.locator('#old-file').setInputFiles({name:'huge.json',mimeType:'application/json',buffer:Buffer.alloc(524289,32)});assert.match(await page.locator('#message').textContent(),/512 KiB/);
    await page.locator('#load-demo').click();await page.locator('#run').click();await page.locator('#load-demo').click();await page.waitForTimeout(100);assert.equal(await page.locator('#results').isVisible(),false,'Demo reset cancels pending result');
    await page.locator('#demo').selectOption('changed');await page.locator('#load-demo').click();await page.locator('#run').click();await page.locator('#results').waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'No horizontal viewport overflow');
    for(const control of ['#run','#download','#policy','#entry'])assert.ok(await page.locator(control).evaluate(el=>el.getBoundingClientRect().width>0));
    assert.deepEqual(errors,[]);assert.ok(requests.every(url=>url.startsWith(server.url)),'Product must not make off-origin requests');
    await page.screenshot({path:new URL(`${viewport.name}-final.png`,output).pathname,fullPage:true});evidence.push({viewport,passed:true,errors,requests,modelMissing:report.graphCounts.missing});await context.close();
  }
}finally{if(browser)await browser.close();await server.close();await writeFile(new URL('results.json',output),JSON.stringify({sandbox:true,evidence},null,2)+'\n');}
console.log('UI desktop/mobile, worker/error/reset/retention/download/no-off-origin checks passed');
