const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../website/theme.js'),'utf8');
function setup(systemDark,saved=null,blocked=false){
  const storage=new Map(saved?[['g-trots-color-theme-v1',saved]]:[]);
  const listeners={}; const root={dataset:{},style:{}};
  const media={matches:systemDark,addEventListener:(name,fn)=>{listeners.system=fn;}};
  const ctx={location:{pathname:'/'},document:{documentElement:root,readyState:'loading',querySelector:()=>({content:''}),querySelectorAll:()=>[],addEventListener:()=>{},dispatchEvent:()=>{}},localStorage:{getItem:k=>{if(blocked)throw Error('blocked');return storage.get(k)||null;},setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},MutationObserver:class{observe(){}},CustomEvent:class{},window:{matchMedia:()=>media,addEventListener:()=>{}}};
  vm.runInNewContext(source,ctx);
  return {root,theme:ctx.window.GTrotsTheme,storage,listeners,media};
}
assert.equal(setup(true).theme.current(),'dark');
assert.equal(setup(false).theme.current(),'light');
assert.equal(setup(true,'light').theme.current(),'light');
assert.equal(setup(false,'dark').theme.current(),'dark');
assert.equal(setup(true,null,true).theme.current(),'dark');
assert.equal(setup(false,null,true).theme.current(),'light');
const a=setup(false);a.theme.toggle();assert.equal(a.storage.get('g-trots-color-theme-v1'),'dark');
a.listeners.system({matches:false});assert.equal(a.theme.current(),'dark');
a.theme.reset();assert.equal(a.theme.current(),'light');
a.media.matches=true;a.listeners.system({matches:true});assert.equal(a.theme.current(),'dark');
const html=fs.readFileSync(require('node:path').join(__dirname,'../website/index.html'),'utf8');
const bootstrap=html.match(/<script id="gt-theme-bootstrap">([\s\S]*?)<\/script>/)[1];
for(const blocked of [false,true]) for(const dark of [false,true]) {
  const root={dataset:{},style:{}};
  vm.runInNewContext(bootstrap,{document:{documentElement:root},location:{pathname:'/'},matchMedia:()=>({matches:dark}),localStorage:{getItem:()=>{if(blocked)throw Error('blocked');return null;}}});
  assert.equal(root.dataset.theme,dark?'dark':'light');
}
console.log('public-theme: OK · device preference, first paint, blocked storage, persistence, system changes');
