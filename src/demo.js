// Synthetic declarations, deliberately not measurements of a real build.
const sha = c => c.repeat(64);
const base = {
  'src/main.js': {file:'assets/main-old.js',isEntry:true,imports:['_shared.js'],dynamicImports:['src/editor.js']},
  '_shared.js': {file:'assets/shared-old.js'},
  'src/editor.js': {file:'assets/editor-old.js',isDynamicEntry:true,imports:['_shared.js'],css:['assets/editor-old.css'],assets:['assets/preview-old.svg']},
  'src/admin.js': {file:'assets/admin-old.js',isEntry:true}
};
const changed = {
  'src/main.js': {file:'assets/main-new.js',isEntry:true,imports:['_shared.js'],dynamicImports:['src/editor.js']},
  '_shared.js': {file:'assets/shared-new.js'},
  'src/editor.js': {file:'assets/editor-new.js',isDynamicEntry:true,imports:['_shared.js'],css:['assets/editor-new.css'],assets:['assets/preview-new.svg']},
  'src/admin.js': {file:'assets/admin-old.js',isEntry:true}
};
const inventory = m => ({files:[...new Set(Object.values(m).flatMap(c=>[c.file,...(c.css??[]),...(c.assets??[])]))].sort().map((path,i)=>({path,bytes:100+i*31,sha256:sha(path.includes('new')?'b':'a')}))});
export const DEMOS = {
  changed:{name:'遅延チャンクが変わる',note:'合成データ：選択 entry → dynamicImports → CSS / 画像。共通チャンクも更新。サイズ・SHA-256 は説明用の架空値です。',old:base,new:changed,oldInventory:inventory(base),newInventory:inventory(changed)},
  unrelated:{name:'別 entry だけが変わる',note:'合成データ：admin だけ更新。選択した main の宣言グラフには到達しません。架空の SHA-256 を付けた負の対照です。',old:base,new:{...base,'src/admin.js':{file:'assets/admin-new.js',isEntry:true}},oldInventory:inventory(base),newInventory:inventory({...base,'src/admin.js':{file:'assets/admin-new.js',isEntry:true}})},
  collision:{name:'同じパス、中身は不明',note:'合成データ：両 manifest が同じパスを宣言。inventory を外し、同名だけでは同じ内容と判断できない例です。',old:base,new:base}
};
