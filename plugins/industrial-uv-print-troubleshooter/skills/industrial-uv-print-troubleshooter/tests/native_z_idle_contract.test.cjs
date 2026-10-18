'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const adapter=path.join(__dirname,'../adapters/printexp/desktop-compat');
test('native modal/unknown classification never manufactures an idle state',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'uv-z-native-contract-'));t.after(()=>{assert.match(path.basename(root),/^uv-z-native-contract-/);fs.rmSync(root,{recursive:true,force:true});});
 const source=path.join(root,'ZIdleContract.ps1');
 fs.writeFileSync(source,`$ErrorActionPreference='Stop'
$auditType=[Reflection.Assembly]::LoadFrom($args[0]).GetType('MenuCompat',$true)
$auditMethod=$auditType.GetMethod('ClassifyZMainJobState',[Reflection.BindingFlags]'NonPublic,Static')
if($null -eq $auditMethod){throw 'NATIVE_CLASSIFIER_MISSING'}
$auditCases=@(@($true,$true,'idle','idle'),@($true,$true,'busy','busy'),@($true,$true,'unknown','unknown'),@($true,$true,'other','unknown'),@($true,$false,'idle','unknown'),@($true,$false,'busy','unknown'),@($false,$true,'idle','unknown'),@($false,$false,'idle','unknown'))
foreach($auditCase in $auditCases){$auditActual=$auditMethod.Invoke($null,[object[]]@($auditCase[0],$auditCase[1],$auditCase[2]));if($auditActual -ne $auditCase[3]){throw 'UNSAFE_NATIVE_MAIN_STATE_CLASSIFICATION'}}
Write-Output 'Native classifier: 8 cases passed; no form or application constructed.'
`);
 const run=cp.spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',source,path.join(adapter,'UVMenuCompat.exe')],{encoding:'utf8',windowsHide:true});assert.ifError(run.error);assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/8 cases passed/);
});
test('native Z dispatch checks reliable current main state after ready caption and before input',()=>{
 const source=fs.readFileSync(path.join(adapter,'MenuCompat.cs'),'utf8');const start=source.indexOf('if(action=="set-z-target"||action=="position-z-once"){'),end=source.indexOf('if(action=="close-z-panel")',start),branch=source.slice(start,end);
 const ready=branch.indexOf('DEVICE_NOT_READY'),idle=branch.indexOf('ReadJobState(main)!="idle"'),input=branch.indexOf('valuePattern.SetValue');assert.ok(ready>=0&&idle>ready&&input>idle);
 for(const token of ['MAIN_Z_JOB_STATE_UNKNOWN','main.Current.IsEnabled','ACTIVE_OR_UNKNOWN_Z_JOB'])assert.ok(branch.includes(token),token);
 for(const token of ['mainWindowObserved=zMain!=null','activeJobState=zJobState','mainStateReadReason=zMainReason','main_disabled_by_modal_state_unobservable','main_parent_identity_mismatch','FindVisibleProcessWindow(pid,"PrintExp")'])assert.ok(source.includes(token),token);
});
