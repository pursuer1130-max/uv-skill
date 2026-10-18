'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const source=process.argv[2]||path.join(__dirname,'../adapters/printexp/desktop-compat/prepare-command.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uv-command-test-'));
fs.copyFileSync(source,path.join(dir,'prepare-command.cjs'));
const exe=path.join(dir,'PrintExp_X64.exe');fs.writeFileSync(exe,'NONEXECUTABLE_TEST_FIXTURE');
function run(args){return spawnSync(process.execPath,[path.join(dir,'prepare-command.cjs'),...args],{encoding:'utf8',windowsHide:true});}
let count=0;
assert.equal(run([]).status,0);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'command.json'))).action,'read-only');count++;
for(const forbidden of ['print','fill-import-file','submit-import-file','reset','clean']){assert.notEqual(run([forbidden]).status,0);count++;}
const id='11111111111111111111111111111111';fs.mkdirSync(path.join(dir,'runs',id),{recursive:true});
fs.writeFileSync(path.join(dir,'runs',id,'result.json'),JSON.stringify({status:'controls_observed',at:new Date().toISOString(),controls:[]}));
for(const flags of [[],['--scan-only-authorized'],['--operator-ready'],['--scan-only-authorized','--operator-ready']]){
 assert.notEqual(run(['scan-once',id,'--target-exe',exe,...flags]).status,0);count++;
}
assert.equal(fs.existsSync(path.join(dir,'command.json')),false);const archived=fs.readdirSync(path.join(dir,'superseded-commands'));assert.equal(archived.length,1);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'superseded-commands',archived[0]))).action,'read-only');count++;
const rd=path.join(dir,'runs',id),crypto=require('node:crypto');
fs.writeFileSync(path.join(rd,'scan-panel.png'),'PANEL_FIXTURE');
fs.writeFileSync(path.join(rd,'control-17070.png'),'BUTTON_FIXTURE');
const fixture={mainWindowEnabled:true,activeJobState:'idle',status:'controls_observed',at:new Date().toISOString(),width:1920,height:1080,headerSha256:'a'.repeat(64),controls:[{name:'开始扫描',automationId:'17070',enabled:true,offscreen:false,screenshot:'control-17070.png'},{automationId:'35008',numericValue:'9.65'}]};
function report(at=new Date().toISOString()){fs.writeFileSync(path.join(rd,'result.json'),JSON.stringify({...fixture,at}));}
report();
for(const control of ['zone-4','zones-1-2-3-4','zones-5-6-7']){assert.equal(run(['scan-region-control',id,control,'--target-exe',exe]).status,0);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'command.json'))).regionControl,control);count++;}
assert.notEqual(run(['scan-region-control',id,'zones-1-16','--target-exe',exe]).status,0);count++;
for(const at of ['bad-date',new Date(Date.now()+60000).toISOString(),new Date(Date.now()-121000).toISOString()]){report(at);assert.notEqual(run(['scan-region-control',id,'zone-4','--target-exe',exe]).status,0);assert.equal(fs.existsSync(path.join(dir,'command.json')),false);count++;}
report();
const scanArgs=['scan-once',id,'--target-exe',exe,'--scan-only-authorized','--operator-ready','--regions'];
assert.equal(run([...scanArgs,'1,2,3,4']).status,0);
const scanCommand=JSON.parse(fs.readFileSync(path.join(dir,'command.json')));
assert.equal(scanCommand.approvedRegions,'1,2,3,4');assert.equal(scanCommand.expectedPanelSha256,crypto.createHash('sha256').update('PANEL_FIXTURE').digest('hex'));count++;
for(const regions of ['1,2,3,4,5','1-4','4,3,2,1']){assert.notEqual(run([...scanArgs,regions]).status,0);count++;}
fixture.mainWindowEnabled=true;fixture.activeJobState='idle';fixture.controls.push({name:'新建',automationId:'17072',enabled:true,offscreen:false,screenshot:'control-17072.png'});fs.writeFileSync(path.join(rd,'control-17072.png'),'NEW_TEMPLATE_BUTTON');report();
assert.notEqual(run(['open-new-template',id,'--target-exe',exe]).status,0);count++;
assert.equal(run(['open-new-template',id,'--new-template-authorized','--target-exe',exe]).status,0);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'command.json'))).newTemplateNavigationAuthorized,true);count++;
fixture.activeJobState='busy';report();assert.notEqual(run(['open-new-template',id,'--new-template-authorized','--target-exe',exe]).status,0);count++;fixture.activeJobState='idle';report();
fs.writeFileSync(path.join(dir,'height-transition.json'),JSON.stringify({followUpMotionBlocked:true}));
const archiveScan=run([...scanArgs,'1,2,3,4']);assert.equal(archiveScan.status,0,archiveScan.stderr);assert.equal(fs.readFileSync(path.join(dir,'height-transition.json'),'utf8'),JSON.stringify({followUpMotionBlocked:true}));count++;
const draftReport={status:'new_template_dialog_observed',at:new Date().toISOString(),dialogStateSha256:'a'.repeat(64),nameValue:'',multiState:'Off',autoState:'Off'};
fs.writeFileSync(path.join(rd,'result.json'),JSON.stringify(draftReport));
const draftArgs=['create-registration-template',id,'--new-template-authorized','--registration-only-no-print','--name','飞天_配准草稿_20260930_120000','--target-exe',exe];
assert.equal(run(draftArgs).status,0);const draft=JSON.parse(fs.readFileSync(path.join(dir,'command.json')));assert.equal(draft.registrationOnlyNoPrint,true);assert.equal(draft.printAuthorized,undefined);count++;
assert.notEqual(run(draftArgs.filter(x=>x!=='--registration-only-no-print')).status,0);count++;
for(const override of [{nameValue:'existing'},{multiState:'On'},{autoState:'On'},{at:'invalid'}]){fs.writeFileSync(path.join(rd,'result.json'),JSON.stringify({...draftReport,...override}));assert.notEqual(run(draftArgs).status,0);count++;}
const digest=x=>crypto.createHash('sha256').update(x).digest('hex'),title='编辑模板 - 飞天_配准草稿_20260930_115020';
const owned={status:'owned_draft_editor_observed',at:new Date().toISOString(),editorTitle:title,editorTitleSha256:digest(title),targetSha256:digest(fs.readFileSync(exe)),targetProcessId:10,targetProcessStartUtc:new Date().toISOString(),width:1400,height:900,canvasLeft:30,canvasTop:100,canvasRight:960,canvasBottom:830,viewSha256:digest('DRAFT_VIEW'),controls:[{id:'17023',name:'保存',type:'ControlType.Button',enabled:true,offscreen:false,sha256:digest('DRAFT_SAVE')}]};
fs.writeFileSync(path.join(rd,'draft-editor-private.png'),'DRAFT_VIEW');fs.writeFileSync(path.join(rd,'draft-control-17023.png'),'DRAFT_SAVE');
const draftWrite=(override={})=>fs.writeFileSync(path.join(rd,'result.json'),JSON.stringify({...owned,...override}));
const da=['draft-editor-control',id,'save-draft','--target-exe',exe,'--draft-editor-authorized','--no-print'];draftWrite();assert.equal(run(da).status,0);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'command.json'))).draftControlId,'17023');count++;
for(const flag of ['--draft-editor-authorized','--no-print']){assert.notEqual(run(da.filter(x=>x!==flag)).status,0);count++;}
for(const override of [{editorTitle:'编辑模板 - customer'},{at:'invalid'},{at:new Date(Date.now()-121000).toISOString()},{at:new Date(Date.now()+30000).toISOString()},{editorTitleSha256:'0'.repeat(64)},{targetSha256:'0'.repeat(64)},{controls:[]}]){draftWrite(override);assert.notEqual(run(da).status,0);assert.equal(fs.existsSync(path.join(dir,'command.json')),false);count++;}
draftWrite();assert.notEqual(run(da.map(x=>x==='save-draft'?'print':x)).status,0);count++;
const dragArgs=['select-draft-features',id,'100','120','800','700','--target-exe',exe,'--draft-editor-authorized','--no-print'];assert.equal(run(dragArgs).status,0);count++;
for(const xy of [['0','0','800','700'],['100','120','1000','700'],['100','120','800','840']]){assert.notEqual(run([...dragArgs.slice(0,2),...xy,...dragArgs.slice(6)]).status,0);count++;}
fs.writeFileSync(path.join(rd,'draft-editor-private.png'),'CHANGED');assert.notEqual(run(dragArgs).status,0);count++;
draftWrite({status:'owned_draft_window_offscreen',left:-458,top:77,width:458,height:107});
const restoreArgs=['restore-draft-window',id,'1418','919','--target-exe',exe,'--draft-editor-authorized','--no-print'];assert.equal(run(restoreArgs).status,0);count++;
assert.notEqual(run(restoreArgs.filter(x=>x!=='--no-print')).status,0);count++;
assert.notEqual(run(restoreArgs.map(x=>x==='1418'?'100000':x)).status,0);count++;
draftWrite();assert.notEqual(run(restoreArgs).status,0);count++;
// A registration edit cannot grant print or scan applicability.
for(const [choice,id2,name] of [['edit-template','17111','编辑模板'],['select-tool','17076','选择'],['scale-down','17046','小'],['show-texture','17085','显示贴图'],['focus-scale-step','17038','单位:']]){
 const c={id:id2,name,type:id2==='17038'?'ControlType.ComboBox':'ControlType.Button',enabled:true,offscreen:false,sha256:digest('FIT_CONTROL')};fs.writeFileSync(path.join(rd,'draft-control-'+id2+'.png'),'FIT_CONTROL');
 const args2=da.map(x=>x==='save-draft'?choice:x);draftWrite({controls:[c],scaleStep:'0.35',uniformScale:true});assert.equal(run(args2).status,0);count++;
 draftWrite({controls:[{...c,enabled:false}],scaleStep:'0.35',uniformScale:true});assert.notEqual(run(args2).status,0);count++;
 if(choice==='scale-down'){draftWrite({controls:[c],scaleStep:'10',uniformScale:true});assert.equal(run(args2).status,0);count++;for(const override of [{scaleStep:'NaN'},{scaleStep:'0'},{scaleStep:'10.01'},{uniformScale:false}]){draftWrite({controls:[c],scaleStep:'0.35',uniformScale:true,...override});assert.notEqual(run(args2).status,0);count++;}}
}
draftWrite();fs.writeFileSync(path.join(rd,'draft-editor-private.png'),'DRAFT_VIEW');const pointArgs=[...dragArgs.slice(0,2),'500','400','500','400',...dragArgs.slice(6),'--point-select-only'];assert.equal(run(pointArgs).status,0);count++;assert.notEqual(run(pointArgs.filter(x=>x!=='--point-select-only')).status,0);count++;assert.notEqual(run([...dragArgs,'--point-select-only']).status,0);count++;
assert.notEqual(run(['print-once','--target-exe',exe]).status,0);assert.notEqual(run([...scanArgs,'1,2,3,4']).status,0);count+=2;
const transformArgs=[...dragArgs.slice(0,2),'700','600','500','400',...dragArgs.slice(6),'--texture-transform-only'];draftWrite({uniformScale:true,controls:[{id:'17046',name:'小',enabled:true,offscreen:false}]});assert.equal(run(transformArgs).status,0);count++;assert.notEqual(run(transformArgs.filter(x=>x!=='--texture-transform-only')).status,0);count++;draftWrite({uniformScale:false});assert.notEqual(run(transformArgs).status,0);count++;draftWrite({uniformScale:true,controls:[]});assert.notEqual(run(transformArgs).status,0);count++;
console.log(JSON.stringify({status:'passed',checks:count,scope:'isolated command-validation fixtures only; no GUI or hardware input',testDirectory:dir}));
