'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const source=process.argv[2]||path.join(__dirname,'../adapters/printexp/desktop-compat/prepare-command.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uv-product-guard-'));
fs.copyFileSync(source,path.join(dir,'prepare-command.cjs'));
const exe=path.join(dir,'PrintExp_X64.exe');fs.writeFileSync(exe,'NONEXECUTABLE_ISOLATED_FIXTURE');
const id='22222222222222222222222222222222',runDir=path.join(dir,'runs',id);fs.mkdirSync(runDir,{recursive:true});
const image=Buffer.from('ISOLATED_BUTTON_IMAGE_FIXTURE');fs.writeFileSync(path.join(runDir,'control-17075.png'),image);
const report={status:'controls_observed',at:new Date().toISOString(),width:2560,height:1400,controls:[{name:'产品验证',automationId:'17075',enabled:true,offscreen:false}]};
const save=()=>fs.writeFileSync(path.join(runDir,'result.json'),JSON.stringify(report));save();
const run=args=>spawnSync(process.execPath,[path.join(dir,'prepare-command.cjs'),...args],{encoding:'utf8',windowsHide:true});
const args=['verify-product',id,'--product-verification-authorized','--target-exe',exe];let checks=0;
assert.equal(run([]).status,0);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'command.json'))).action,'read-only');checks++;
for(const command of [['verify-product',id,'--target-exe',exe],['verify-product','invalid','--product-verification-authorized','--target-exe',exe],['print-once',id,'--print-authorized','--operator-ready','--target-exe',exe]]){assert.notEqual(run(command).status,0);checks++;}
assert.equal(run(args).status,0);const prepared=JSON.parse(fs.readFileSync(path.join(dir,'command.json')));assert.equal(prepared.action,'verify-product');assert.equal(prepared.productVerificationAuthorized,true);assert.equal(prepared.expectedControlSha256,crypto.createHash('sha256').update(image).digest('hex'));assert.equal(prepared.inputRoute,'native-mouse');checks++;
const last=fs.readFileSync(path.join(dir,'command.json'));
for(const change of [()=>{report.at=new Date(Date.now()-360000).toISOString();},()=>{report.at=new Date().toISOString();report.controls[0].enabled=false;},()=>{report.controls[0].enabled=true;report.controls.push({...report.controls[0]});}]){change();save();assert.notEqual(run(args).status,0);assert.equal(fs.existsSync(path.join(dir,'command.json')),false);assert.ok(fs.readdirSync(path.join(dir,'superseded-commands')).some(n=>fs.readFileSync(path.join(dir,'superseded-commands',n)).equals(last)));checks++;}
console.log(JSON.stringify({status:'passed',checks,scope:'isolated command preparation and rejection only; no executable fixture, GUI or machine input'}));
