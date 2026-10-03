import {DEMOS} from './demo.js';
const $ = id => document.getElementById(id);
const labels = {'missing':'方針上、不足','retained':'旧側から保持','same-content':'提供 hash 一致','changed-content':'同一パス・hash 不一致','unknown-content':'同一パス・内容不明'};
let worker, timer, sequence = 0, latestReport, latestJSON, busy = false, inputContext = 'locally edited, unverified input';
const fileEpoch = new Map();
function el(tag,text,className) { const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(className)n.className=className; return n; }
function message(text,error=false) { $('message').textContent=text; $('message').className=error?'message error':'message'; }
function endWorker(){sequence++;if(worker)worker.terminate();worker=undefined;clearTimeout(timer);busy=false;$('run').disabled=false;$('refresh-entries').disabled=false;}
function invalidate(){endWorker();latestReport=undefined;latestJSON=undefined;$('results').hidden=true;message('入力が変わりました。「参照をリハーサル」で再計算してください');}
function entries(values,selected){$('entry').replaceChildren();for(const v of values){const o=el('option',v);o.value=v;$('entry').append(o);}if(values.includes(selected))$('entry').value=selected;}
function request(inspectOnly=false){
  endWorker(); const id=sequence; busy=true;$('run').disabled=true;$('refresh-entries').disabled=true;latestReport=undefined;latestJSON=undefined;$('results').hidden=true;message(inspectOnly?'entry を読み取っています…':'宣言グラフを確認しています…');
  try {worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});}catch{endWorker();message('解析 Worker を開始できません。HTTP のローカルサーバーで開いてください',true);return;}
  timer=setTimeout(()=>{if(id===sequence){endWorker();message('処理時間の上限（8秒）に達しました。入力を小さくしてください',true);}},8000);
  worker.onerror=()=>{if(id===sequence){endWorker();message('解析 Worker を実行できません。HTTP サーバーとブラウザの対応状況を確認してください',true);}};
  worker.onmessage=({data})=>{if(data.id!==sequence)return;endWorker();if(data.error){message(data.error,true);return;}const selected=$('entry').value;entries(data.entries,selected);if(inspectOnly){message(data.entries.length?'entry を更新しました':'isEntry:true の項目がありません',!data.entries.length);return;}latestReport=data.report;latestJSON=data.json;render(data.report);message('入力した宣言にもとづくリハーサルができました');};
  worker.postMessage({id,inspectOnly,oldText:$('old-text').value,newText:$('new-text').value,oldInventoryText:$('old-inventory').value,newInventoryText:$('new-inventory').value,entry:$('entry').value,policy:$('policy').value,inputContext,retained:$('retained').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)});
}
function formatBytes(bytes){return `${bytes.toLocaleString('ja-JP')} B`;}
function render(r){
  const missing=r.graphCounts.missing, unknown=r.graphCounts['unknown-content'], changed=r.graphCounts['changed-content'];
  $('result-context').textContent=`旧 entry: ${r.entry} · 可用性の根拠: 旧 ${r.inventory.old.provided?'明示 inventory':'manifest 宣言'} / 新 ${r.inventory.new.provided?'明示 inventory':'manifest 宣言'}`;
  $('result-banner').className=`result-banner${missing||changed?' warning':''}`;
  $('result-banner').textContent=missing?`選択した保持方針では、旧グラフに ${missing} 件の不足参照があります。実際に要求されるファイルや失敗の発生を予測するものではありません。`:`宣言上の不足参照はありません。${changed?'ただし同一パスの hash 不一致があります。':unknown?'ただし同一パスの内容は未確認です。':''} デプロイの安全性を示す結果ではありません。`;
  $('metrics').replaceChildren();
  for(const [title,value,note,alert] of [['不足参照',missing,'宣言グラフ上の件数',missing>0],['動的 entry の影響候補',r.affectedDynamicEntries.length,'route ではなくモジュール',false],['同一パスの内容不明',unknown,'SHA-256 が未提供',false],['到達する参照',r.graphCounts.reachableReferences,'実リクエスト数ではありません',false]]){const box=el('div',undefined,`metric${alert?' alert':''}`);box.append(el('span',title),el('strong',String(value)),el('span',note,'metric-note'));$('metrics').append(box);}
  $('paths').replaceChildren(); const paths=r.files.filter(f=>f.status==='missing'&&f.evidence);
  if(!paths.length)$('paths').append(el('p',missing?'経路の表示上限に達しました。JSON レポートの files を確認してください。':'この方針で不足する宣言上の参照はありません。','empty'));
  for(const f of paths){const card=el('div',undefined,'path-card');const title=el('div',undefined,'path-file');title.append(el('span',f.kind,'type-chip'),el('strong',f.path));const chain=el('ol',undefined,'path-chain');for(const step of f.evidence){const row=el('li');row.append(el('span',step.type),document.createTextNode(step.value));chain.append(row);}card.append(title,chain);$('paths').append(card);}
  if(paths.length<missing)$('paths').append(el('p',`${missing-paths.length} 件の経路は省略。レポートには不足パス一覧を含みます。`,'panel-note'));
  $('dynamic').replaceChildren();if(!r.affectedDynamicEntries.length)$('dynamic').append(el('p','到達する動的 entry の先に、不足・内容懸念は見つかりませんでした。','empty'));
  for(const d of r.affectedDynamicEntries.slice(0,80)){const row=el('div',undefined,'dynamic-item');row.append(el('strong',d.key),el('p',`不足 ${d.missingFileCount} / 同一パスの内容懸念 ${d.contentConcernFileCount}`));$('dynamic').append(row);}
  if(r.affectedDynamicEntries.length>80)$('dynamic').append(el('p','画面では先頭 80 件を表示。すべてのモジュールはレポートに含みます。','panel-note'));
  const est=r.retentionEstimate;
  $('retention-summary').textContent=`不足 ${r.retentionChecklist.length} パス。${r.inventory.old.provided?`旧 inventory に明記されたサイズ合計 ${formatBytes(est.knownBytes)}（サイズ既知 ${est.knownByteFiles} / 不明 ${est.unknownByteFiles}）。`:'旧 inventory 未提供のため、実ファイル数・保持容量は不明です。'} 保持期間は見積もりません。`;
  $('retention-list').replaceChildren();for(const f of r.retentionChecklist.slice(0,80)){const row=el('div',undefined,'file-row');row.append(el('span',f.path),el('span',f.bytes===undefined?'bytes 不明':formatBytes(f.bytes)));$('retention-list').append(row);}
  if(r.retentionChecklist.length>80)$('retention-list').append(el('p','画面は先頭 80 件。JSON レポートには完全な不足パス一覧を含みます。','panel-note'));
  $('apply-retention').hidden=!r.retentionChecklist.length;
  $('content-concerns').replaceChildren();const conflicts=r.files.filter(f=>['changed-content','unknown-content'].includes(f.status));
  if(!conflicts.length)$('content-concerns').append(el('p','同一パスの内容に関する未解決項目はありません。入力した hash の正しさや実配信状態は検証していません。','panel-note'));
  for(const f of conflicts.slice(0,80)){const row=el('div',undefined,'content-row');row.append(el('strong',`${labels[f.status]}: `),document.createTextNode(f.path));$('content-concerns').append(row);}
  if(conflicts.length>80)$('content-concerns').append(el('p','先頭 80 件のみ表示。全件は JSON レポートに含みます。','panel-note'));
  $('results').hidden=false;
}
function loadDemo(){for(const field of ['old-text','new-text','old-inventory','new-inventory'])fileEpoch.set(field,(fileEpoch.get(field)??0)+1);invalidate();const d=DEMOS[$('demo').value];inputContext=`synthetic-demo:${$('demo').value}; invented bytes and digests for explanation`; $('old-text').value=JSON.stringify(d.old,null,2);$('new-text').value=JSON.stringify(d.new,null,2);$('old-inventory').value=d.oldInventory?JSON.stringify(d.oldInventory,null,2):'';$('new-inventory').value=d.newInventory?JSON.stringify(d.newInventory,null,2):'';$('demo-note').textContent=d.note;$('policy').value='replacement';$('subset-control').hidden=true;$('retained').value='';entries(Object.entries(d.old).filter(([,c])=>c.isEntry).map(([k])=>k),'src/main.js');message('合成デモを読み込みました。方針を選び、参照をリハーサルしてください');}
for(const [inputId,fieldId] of [['old-file','old-text'],['new-file','new-text'],['old-inventory-file','old-inventory'],['new-inventory-file','new-inventory']])$(inputId).addEventListener('change',async event=>{const f=event.target.files[0];if(!f)return;invalidate();const epoch=(fileEpoch.get(fieldId)??0)+1;fileEpoch.set(fieldId,epoch);if(f.size>524288){message('JSON ファイルは 512 KiB 以下にしてください',true);event.target.value='';return;}try{const text=await f.text();if(fileEpoch.get(fieldId)!==epoch)return;invalidate();inputContext='locally supplied input; verify source and inventory pairing';$(fieldId).value=text;$('demo-note').textContent='ローカル入力を使用中。manifest と inventory の組み合わせを確認してください。';message('ファイルを読み込みました。旧 manifest を変更した場合は entry を更新してください');}catch{if(fileEpoch.get(fieldId)===epoch)message('ファイルを読み取れませんでした',true);}event.target.value='';});
for(const id of ['old-text','new-text','old-inventory','new-inventory','retained'])$(id).addEventListener('input',()=>{fileEpoch.set(id,(fileEpoch.get(id)??0)+1);invalidate();inputContext='locally edited input; may include synthetic values';$('demo-note').textContent='編集されたローカル入力を使用中。説明用の値と実ビルドの値を混在させないでください。';});
$('entry').addEventListener('change',invalidate);$('policy').addEventListener('change',()=>{invalidate();$('subset-control').hidden=$('policy').value!=='retain-subset';});
$('load-demo').addEventListener('click',loadDemo);$('refresh-entries').addEventListener('click',()=>request(true));$('run').addEventListener('click',()=>request());
$('apply-retention').addEventListener('click',()=>{const additions=latestReport?.retentionChecklist.map(f=>f.path)??[];const existing=$('policy').value==='retain-subset'?$('retained').value.split(/\r?\n/).filter(Boolean):[];$('retained').value=[...new Set([...existing,...additions])].sort().join('\n');$('policy').value='retain-subset';$('subset-control').hidden=false;invalidate();message('不足パスを保持リストへ追加しました。変更後の方針で再計算してください');$('retained').focus();});
$('download').addEventListener('click',()=>{if(!latestJSON||busy)return;const blob=new Blob([latestJSON+'\n'],{type:'application/json'});const url=URL.createObjectURL(blob);const a=el('a');a.href=url;a.download='release-rehearsal-report.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);});
window.addEventListener('pagehide',()=>{const wasBusy=busy;endWorker();if(wasBusy)message('解析を中断しました。必要ならもう一度リハーサルしてください');});
loadDemo();
