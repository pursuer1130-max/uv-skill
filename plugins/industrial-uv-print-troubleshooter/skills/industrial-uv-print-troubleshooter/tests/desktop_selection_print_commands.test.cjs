'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const source=process.argv[2]||path.join(__dirname,'../adapters/printexp/desktop-compat/prepare-command.cjs'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'uv-selection-print-'));
fs.copyFileSync(source,path.join(dir,'prepare-command.cjs'));const exe=path.join(dir,'PrintExp_X64.exe');fs.writeFileSync(exe,'NONEXECUTABLE_FIXTURE');
const ids=['a'.repeat(32),'b'.repeat(32),'c'.repeat(32),'d'.repeat(32)];for(const id of ids)fs.mkdirSync(path.join(dir,'runs',id),{recursive:true});
const write=(id,o)=>fs.writeFileSync(path.join(dir,'runs',id,'result.json'),JSON.stringify(o));
const now=Date.now(),view={status:'private_viewport_captured',at:new Date(now).toISOString(),width:2560,height:1400};write(ids[0],view);fs.writeFileSync(path.join(dir,'runs',ids[0],'viewport-private.png'),'FAKE_IMAGE_NOT_FOR_GUI');
const capture={status:'controls_observed',at:new Date(now).toISOString(),width:2560,height:1400};write(ids[1],capture);
for(const n of ['control-17061.png','scan-panel.png'])fs.writeFileSync(path.join(dir,'runs',ids[1],n),'FAKE_IMAGE_NOT_FOR_GUI');
const verification={action:'verify-product',targetInputSent:true,at:new Date(now-1000).toISOString()};write(ids[2],verification);
const selection={action:'select-products',status:'rectangle_drag_sent_requires_visual_readback',targetInputSent:true,at:new Date(now-2000).toISOString()};write(ids[3],selection);
const run=args=>spawnSync(process.execPath,[path.join(dir,'prepare-command.cjs'),...args],{encoding:'utf8',windowsHide:true});let checks=0;
const selectArgs=['select-products',ids[0],'230','1110','336','1180','--selection-authorized','--target-exe',exe];
assert.equal(run(selectArgs).status,0);checks++;
assert.notEqual(run(selectArgs.filter(a=>a!=='--selection-authorized')).status,0);checks++;
for(const bad of ['NaN','0','2500']){const args=[...selectArgs];args[2]=bad;assert.notEqual(run(args).status,0);checks++;}
for(const invalid of ['invalid',new Date(Date.now()-360000).toISOString(),new Date(Date.now()+60000).toISOString()]){view.at=invalid;write(ids[0],view);assert.notEqual(run(selectArgs).status,0);checks++;}
const printArgs=['print-once',ids[1],'--print-authorized','--operator-ready','--selection-run',ids[3],'--verification-run',ids[2],'--verification-line','00:00:00  模板【TEST】成功识别 2 个产品','--template','TEST','--count','2','--target-exe',exe];
assert.equal(run(printArgs).status,0);const saved=JSON.parse(fs.readFileSync(path.join(dir,'command.json')));assert.equal(saved.expectedVerificationLine,'00:00:00  模板【TEST】成功识别 2 个产品');assert.equal(saved.expectedProductCount,'2');checks++;
for(const flag of ['--print-authorized','--operator-ready']){assert.notEqual(run(printArgs.filter(a=>a!==flag)).status,0);checks++;}
for(const invalid of ['invalid',new Date(Date.now()-660000).toISOString(),new Date(Date.now()+60000).toISOString()]){verification.at=invalid;write(ids[2],verification);assert.notEqual(run(printArgs).status,0);checks++;}
verification.at=new Date(Date.now()).toISOString();write(ids[2],verification);selection.at=new Date(Date.now()+10000).toISOString();write(ids[3],selection);assert.notEqual(run(printArgs).status,0);checks++;
console.log(JSON.stringify({status:'passed',checks,scope:'Nonexecuting command fixtures only; no GUI, scan, print or device input'}));
