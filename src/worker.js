import {parseManifest, parseInventory, rehearse} from './model.js';
self.onmessage = ({data}) => {
  try {
    const oldManifest = parseManifest(data.oldText), newManifest = parseManifest(data.newText);
    const entries = [...oldManifest].filter(([,c])=>c.isEntry).map(([k])=>k);
    if (data.inspectOnly) { self.postMessage({id:data.id,entries}); return; }
    const oldInventory = data.oldInventoryText.trim() ? parseInventory(data.oldInventoryText) : undefined;
    const newInventory = data.newInventoryText.trim() ? parseInventory(data.newInventoryText) : undefined;
    const report = rehearse({oldManifest,newManifest,oldInventory,newInventory,entry:data.entry,policy:data.policy,retained:data.retained});
    report.inputContext = typeof data.inputContext === 'string' ? data.inputContext.slice(0,200) : 'locally supplied, unverified input';
    const json = JSON.stringify(report,null,2);
    if (new TextEncoder().encode(json).length > 8*1024*1024) throw new Error('レポートが 8 MiB の出力上限を超えました。入力を小さくしてください');
    self.postMessage({id:data.id,report,json,entries});
  } catch(error) { self.postMessage({id:data.id,error:error instanceof Error?error.message:'解析できませんでした'}); }
};
