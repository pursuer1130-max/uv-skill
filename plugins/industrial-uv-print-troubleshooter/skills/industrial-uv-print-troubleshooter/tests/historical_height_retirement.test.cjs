'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const adapter=path.join(__dirname,'../adapters/printexp/desktop-compat');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'uv-height-retired-'));
 t.after(()=>{assert.match(path.basename(root),/^uv-height-retired-/);fs.rmSync(root,{recursive:true,force:true});});
 fs.copyFileSync(path.join(adapter,'prepare-command.cjs'),path.join(root,'prepare-command.cjs'));
 const exe=path.join(root,'PrintExp_X64.exe');fs.writeFileSync(exe,'ISOLATED_NOT_EXECUTABLE');
 const id='1'.repeat(32),dir=path.join(root,'runs',id);fs.mkdirSync(dir,{recursive:true});
 const report={status:'controls_observed',at:new Date().toISOString(),mainWindowEnabled:true,activeJobState:'idle',width:1920,height:1080,headerSha256:'a'.repeat(64),controls:[{name:'开始扫描',automationId:'17070',controlType:'ControlType.Button',enabled:true,offscreen:false,screenshot:'control-17070.png'},{automationId:'35008',controlType:'ControlType.Edit',numericValue:0}]};
 const save=()=>fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report));save();
 for(const name of ['scan-panel.png','control-17070.png','control-17061.png'])fs.writeFileSync(path.join(dir,name),'ISOLATED_IMAGE_'+name);
 const run=(action,args=[],observation=id)=>cp.spawnSync(process.execPath,[path.join(root,'prepare-command.cjs'),action,observation,...args,'--target-exe',exe],{encoding:'utf8',windowsHide:true});
 return {root,exe,id,dir,report,save,run};
}
const scanFlags=['--scan-only-authorized','--operator-ready','--regions','1,2,3,4'];
test('scan permits unchanged numeric/string zero and does not read or mutate old locks',t=>{
 const f=fixture(t),marker=path.join(f.root,'height-transition.json');
 for(const legacy of [JSON.stringify({followUpMotionBlocked:true,targetMm:20}),'{broken'])for(const height of [0,'0','0.0','3']){
  fs.writeFileSync(marker,legacy);f.report.controls[1].numericValue=height;f.save();
  const r=f.run('scan-once',scanFlags);assert.equal(r.status,0,r.stderr);
  const c=JSON.parse(fs.readFileSync(path.join(f.root,'command.json')));assert.equal(c.expectedScanHeight,height);assert.equal(c.approvedRegions,'1,2,3,4');assert.equal(c.deviceReviewId,undefined);assert.equal(fs.readFileSync(marker,'utf8'),legacy);
 }
});
test('scan still requires complete fresh idle controls, explicit authorization and finite unchanged field',t=>{
 const f=fixture(t);for(const flag of scanFlags.slice(0,2))assert.notEqual(f.run('scan-once',scanFlags.filter(x=>x!==flag)).status,0);
 const invalid=[{at:'bad-date'},{at:new Date(Date.now()+30000).toISOString()},{at:new Date(Date.now()-121000).toISOString()},{activeJobState:'busy'},{mainWindowEnabled:false}];
 const original={...f.report};for(const value of invalid){Object.assign(f.report,original,value);f.save();const r=f.run('scan-once',scanFlags);assert.notEqual(r.status,0);assert.match(r.stderr,/FRESH_SCAN_OBSERVATION_REQUIRED/);}
 Object.assign(f.report,original);for(const value of [null,undefined,'','NaN','Infinity']){f.report.controls[1].numericValue=value;f.save();assert.notEqual(f.run('scan-once',scanFlags).status,0);}
 f.report.controls[1].numericValue=0;f.report.controls.push({...f.report.controls[1]});f.save();assert.notEqual(f.run('scan-once',scanFlags).status,0);
});
test('print preparation accepts historical archived lock and retains selection/verification/template evidence',t=>{
 const f=fixture(t),marker=path.join(f.root,'height-transition.json'),legacy='{invalid legacy JSON';fs.writeFileSync(marker,legacy);
 const selection='2'.repeat(32),verification='3'.repeat(32);for(const id of [selection,verification])fs.mkdirSync(path.join(f.root,'runs',id));
 const at=new Date(Date.now()-1000).toISOString();fs.writeFileSync(path.join(f.root,'runs',selection,'result.json'),JSON.stringify({at,action:'select-products',status:'rectangle_drag_sent_requires_visual_readback',targetInputSent:true}));
 fs.writeFileSync(path.join(f.root,'runs',verification,'result.json'),JSON.stringify({at:new Date().toISOString(),action:'verify-product',targetInputSent:true}));
 const flags=['--print-authorized','--operator-ready','--selection-run',selection,'--verification-run',verification,'--verification-line','21:00:00 成功识别 2 个产品','--template','isolated-template','--count','2'];
 const r=f.run('print-once',flags);assert.equal(r.status,0,r.stderr);const c=JSON.parse(fs.readFileSync(path.join(f.root,'command.json')));assert.equal(c.expectedProductCount,'2');assert.equal(c.expectedTemplateSha256,crypto.createHash('sha256').update('isolated-template').digest('hex'));assert.equal(fs.readFileSync(marker,'utf8'),legacy);
 assert.notEqual(f.run('print-once',flags.filter(x=>x!=='--print-authorized')).status,0);
});
test('Z positioning retains current input semantics while ignoring immutable archived lock',t=>{
 const f=fixture(t),legacy=JSON.stringify({followUpMotionBlocked:true,targetMm:100});fs.writeFileSync(path.join(f.root,'height-transition.json'),legacy);
 Object.assign(f.report,{status:'z_panel_observed_readonly',mainWindowObserved:true,panelStateSha256:'a'.repeat(64),controls:[{id:'118',type:'ControlType.Edit',numericValue:'9',enabled:true,offscreen:false},{id:'110',type:'ControlType.Text',name:'Z位置: 9.00 mm  ',enabled:true,offscreen:false},{id:'109',type:'ControlType.Button',name:'定位高度',enabled:true,offscreen:false}]});f.save();
 const flags=['--height-action-authorized','--operator-ready','--coordinate-semantics-confirmed','--limits-confirmed','--thickness-mm','6.5','--gap-mm','2.5','--approved-target-mm','9'];
 assert.equal(f.run('position-z-once',flags).status,0);assert.equal(fs.readFileSync(path.join(f.root,'height-transition.json'),'utf8'),legacy);assert.notEqual(f.run('position-z-once',flags.filter(x=>x!=='--coordinate-semantics-confirmed')).status,0);
 f.report.controls[0].numericValue='8';f.save();assert.notEqual(f.run('position-z-once',flags).status,0);
});
test('retired device-review route cannot establish a shortcut in a new command',t=>{
 const f=fixture(t),r=f.run('scan-once',[...scanFlags,'--device-review','a'.repeat(32)]);assert.notEqual(r.status,0);assert.match(r.stderr,/HISTORICAL_HEIGHT_REVIEW_RETIRED/);assert.equal(fs.existsSync(path.join(f.root,'command.json')),false);
});
test('native source retains actual dispatch controls and never reads historical height lock',()=>{
 const source=fs.readFileSync(path.join(adapter,'MenuCompat.cs'),'utf8');
 for(const text of ['SCAN_HEIGHT_CHANGED','ACTIVE_OR_UNKNOWN_JOB','CURRENT_SCAN_ONLY_AUTHORIZATION_REQUIRED','CURRENT_PRINT_AUTHORIZATION_REQUIRED','Z_AUTHORIZATION_OR_STATE_CHANGED','PARTIAL_PRINT_INPUT_NO_RETRY','COMMAND_ALREADY_CONSUMED','EXACT_Z_CONTROLS_REQUIRED'])assert.ok(source.includes(text),text);
 for(const text of ['height-transition.json','height-safety.json','HEIGHT_REQUIRES_SITE_REVALIDATION','ValidateDeviceReview','SCAN_HEIGHT_DIFFERS_FROM_RECENT_Z_TARGET'])assert.ok(!source.includes(text),text);
 assert.ok(source.includes('z-position-attempt.json'));
});
test('staging verifies the four-file runtime without propagating the historical marker',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(adapter,'runtime-manifest.json'))),source=fs.readFileSync(path.join(adapter,'Stage-DesktopCompat.ps1'),'utf8');
 assert.equal(manifest.files.length,4);assert.equal(manifest.files.some(x=>x.name==='review-current-device.cjs'),false);assert.ok(!source.includes('height-safety.json'));assert.ok(!source.includes('height-transition.json'));assert.ok(source.includes('SOURCE_HASH_MISMATCH'));assert.ok(source.includes('STAGED_HASH_MISMATCH'));
});
