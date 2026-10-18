'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {attach}=require('../scripts/uv_desktop_attach.cjs');
const options={application:'RIIN',exe:'C:\\Vendor\\RIIN.exe',appId:'{TEST}\\Vendor\\RIIN.exe'};
const window={id:1,app:'process:C:\\Vendor\\RIIN.exe',title:'Test fixture, not a real window'};
function provider(before=[],after=[],error=null){
  let reads=0,launches=0;
  return {list_apps:async()=>[{id:options.appId,windows:before}],list_windows:async()=>{reads++;return launches?after:before;},launch_app:async()=>{launches++;if(error)throw Error(error);},counts:()=>({reads,launches})};
}
const allowed={...options,launch:true,launchAuthorized:true,startupReviewed:true,customerProducing:false};
test('existing process-backed window is reused without launch',async()=>{const p=provider([window]);const r=await attach(p,options);assert.equal(r.reused,true);assert.equal(p.counts().launches,0);});
test('observe-only attach never starts a missing app',async()=>{const p=provider();assert.equal((await attach(p,options)).status,'not_running_or_not_visible');assert.equal(p.counts().launches,0);});
test('missing startup context and active production block launching',async()=>{for(const o of [{...options,launch:true},{...allowed,customerProducing:true}]){const p=provider();await assert.rejects(attach(p,o),/CONTEXT/);assert.equal(p.counts().launches,0);}});
test('one authorized launch resolves a fresh returned window',async()=>{const p=provider([],[window]);assert.equal((await attach(p,allowed)).status,'window_found');assert.equal(p.counts().launches,1);});
test('no-targetable-window error is recovered by observation, not another launch',async()=>{const p=provider([],[window],'launched app did not expose a targetable window');const r=await attach(p,allowed);assert.equal(r.window,window);assert.equal(p.counts().launches,1);});
test('ambiguous windows are not guessed',async()=>{const p=provider([window,{...window,id:2}]);await assert.rejects(attach(p,allowed),/SELECTION/);assert.equal(p.counts().launches,0);});
test('interruptions stop and PrintExp cannot use this launch helper',async()=>{const p=provider([],[],'user stopped Computer Use');await assert.rejects(attach(p,allowed),/user stopped/);assert.equal(p.counts().reads,1);await assert.rejects(attach(p,{...allowed,application:'PrintExp'}),/GATEWAY/);});
