'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const base=__dirname;
// Once this preparation owns the lock and archives the old command, validation failure
// cannot leave that old command pending. Launch only after success and matching returned ID.
// Preserve the previous bytes as local evidence; this does not cancel a running helper.
const preparationLock=path.join(base,'.prepare-command.lock');
const preparationLockFd=fs.openSync(preparationLock,'wx');
process.once('exit',()=>{try{fs.closeSync(preparationLockFd);}finally{try{fs.unlinkSync(preparationLock);}catch{}}});
const pendingCommand=path.join(base,'command.json');
if(fs.existsSync(pendingCommand)){
 const prior=fs.lstatSync(pendingCommand);
 if(!prior.isFile()||prior.isSymbolicLink())throw Error('PENDING_COMMAND_NOT_REGULAR_FILE');
 const previousCommand=JSON.parse(fs.readFileSync(pendingCommand,'utf8'));
 if(/^[a-f0-9]{32}$/.test(previousCommand.id||'')&&fs.existsSync(path.join(base,'runs',previousCommand.id,'started.json'))&&!fs.existsSync(path.join(base,'runs',previousCommand.id,'result.json')))throw Error('PREVIOUS_COMMAND_UNRESOLVED');
 const archive=path.join(base,'superseded-commands');
 fs.mkdirSync(archive,{recursive:true});
 if(fs.lstatSync(archive).isSymbolicLink())throw Error('COMMAND_ARCHIVE_LINK_REJECTED');
 fs.renameSync(pendingCommand,path.join(archive,crypto.randomUUID().replaceAll('-','')+'.json'));
}
const action=process.argv[2]||'read-only';
if(!['read-only','selftest','capture','capture-footer','capture-view','capture-controls','capture-print-evidence','capture-import-dialog','fill-import-file','submit-import-once','capture-z-panel','set-z-target','position-z-once','close-z-panel','open-z-panel','open-template-import','open-template-editor','open-new-template','capture-new-template','create-registration-template','capture-template-editor','capture-draft-editor','restore-draft-window','draft-editor-control','select-draft-features','open-texture-import','verify-product','print-once','select-products','scan-region-control','set-scan-height','scan-once','navigate'].includes(action))throw Error('ACTION_NOT_ALLOWED');
const command={id:crypto.randomUUID().replaceAll('-',''),createdAt:new Date().toISOString(),action};
if(!['read-only','selftest'].includes(action)){
 const targetIndex=process.argv.indexOf('--target-exe');const targetPath=targetIndex>=0?process.argv[targetIndex+1]:null;
 if(!targetPath||!path.isAbsolute(targetPath)||path.basename(targetPath).toLowerCase()!=='printexp_x64.exe')throw Error('FRESH_TARGET_EXE_REQUIRED');
 Object.assign(command,{targetPath,targetSha256:crypto.createHash('sha256').update(fs.readFileSync(targetPath)).digest('hex')});
}
// The retired historical-height review is never an action prerequisite.
if(process.argv.includes('--device-review'))throw Error('HISTORICAL_HEIGHT_REVIEW_RETIRED');

if(action==='fill-import-file'||action==='submit-import-once'){
 const arg=n=>{const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:null;};
 if(!process.argv.includes('--import-authorized')||!process.argv.includes('--import-only-no-print'))throw Error('CURRENT_IMPORT_ONLY_AUTHORIZATION_REQUIRED');
 const previous=process.argv[3];if(!/^[a-f0-9]{32}$/.test(previous||''))throw Error('INVALID_OBSERVATION_ID');const report=JSON.parse(fs.readFileSync(path.join(base,'runs',previous,'result.json'),'utf8')),age=Date.now()-Date.parse(report.at);
 if(report.status!=='import_dialog_observed'||!Number.isFinite(age)||age<0||age>120000||report.fileType!==(process.argv.includes('--texture-import')?'图片文件 (*.tif;*.pdf;*.ai)':'图片文件(*.tif)')||report.filenameId!=='1148'||report.openButtonId!=='1'||!/^[a-f0-9]{64}$/.test(report.dialogStateSha256||''))throw Error('FRESH_EXACT_TIFF_DIALOG_REQUIRED');
 const rawFile=arg('--file');if(!rawFile||!path.isAbsolute(rawFile)||path.extname(rawFile).toLowerCase()!=='.tif')throw Error('LOCAL_TIFF_REQUIRED');const file=path.resolve(rawFile);const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size<8||stat.size>268435456)throw Error('TIFF_SIZE_OR_TYPE_NOT_ALLOWED');const data=fs.readFileSync(file);if(!['49492a00','4d4d002a'].includes(data.subarray(0,4).toString('hex')))throw Error('TIFF_SIGNATURE_REQUIRED');const fileHash=crypto.createHash('sha256').update(data).digest('hex');
 if(action==='submit-import-once'&&report.filenameSha256!==crypto.createHash('sha256').update(file).digest('hex'))throw Error('IMPORT_FIELD_FILE_MISMATCH');
 Object.assign(command,{importAuthorized:true,importOnlyNoPrintConfirmed:true,filePath:file,fileSha256:fileHash,expectedFileType:report.fileType,expectedDialogStateSha256:report.dialogStateSha256});
 if(action==='submit-import-once'&&process.argv.includes('--texture-import')){
  const manifest=arg('--template-guard');if(!manifest||!path.isAbsolute(manifest))throw Error('VERIFIED_LOCAL_TEMPLATE_BACKUP_REQUIRED');const g=JSON.parse(fs.readFileSync(manifest,'utf8')),age=Date.now()-Date.parse(g.createdAt);if(g.customerLocalBackupAuthorized!==true||g.isolatedDirectoryConfirmed!==true||!Number.isFinite(age)||age<0||age>600000||!path.isAbsolute(g.targetPath||''))throw Error('FRESH_AUTHORIZED_TEMPLATE_BACKUP_REQUIRED');const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  if(g.schemaVersion===2){
   if(g.guardKind!=='owned-new-draft-first-texture'||g.targetOriginallyAbsent!==true||!/^飞天_配准草稿_[0-9]{8}_[0-9]{6}$/.test(g.draftName)||fs.existsSync(g.targetPath)||!path.isAbsolute(g.metadataPath||'')||!Array.isArray(g.files)||g.files.length<2||g.files.length>64||!g.files.some(f=>f.sourcePath===g.metadataPath))throw Error('VERIFIED_NEW_DRAFT_BACKUP_REQUIRED');
   for(const f of g.files)if(!path.isAbsolute(f.sourcePath||'')||!path.isAbsolute(f.backupPath||'')||hash(f.sourcePath)!==f.sha256||hash(f.backupPath)!==f.sha256)throw Error('DRAFT_OR_BACKUP_CHANGED');Object.assign(command,{newDraftGuardPath:manifest,newDraftGuardSha256:hash(manifest)});
  }else{if(g.schemaVersion!==1||!path.isAbsolute(g.backupPath||''))throw Error('FRESH_AUTHORIZED_TEMPLATE_BACKUP_REQUIRED');if(hash(g.targetPath)!==g.originalSha256||hash(g.backupPath)!==g.originalSha256)throw Error('TEMPLATE_OR_BACKUP_CHANGED');Object.assign(command,{templateFilePath:g.targetPath,templateBackupPath:g.backupPath,templateOriginalSha256:g.originalSha256});}
 }
}
if(action==='set-z-target'||action==='position-z-once'){
 const arg=n=>{const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:null;};
 for(const flag of ['--height-action-authorized','--operator-ready','--coordinate-semantics-confirmed','--limits-confirmed'])if(!process.argv.includes(flag))throw Error('CURRENT_Z_CONFIRMATIONS_REQUIRED');
 const previous=process.argv[3];if(!/^[a-f0-9]{32}$/.test(previous||''))throw Error('INVALID_OBSERVATION_ID');
 const report=JSON.parse(fs.readFileSync(path.join(base,'runs',previous,'result.json'),'utf8')),age=Date.now()-Date.parse(report.at);
 if(report.status!=='z_panel_observed_readonly'||!Number.isFinite(age)||age<0||age>120000||!/^[a-f0-9]{64}$/.test(report.panelStateSha256||''))throw Error('FRESH_Z_PANEL_OBSERVATION_REQUIRED');
 if(report.mainWindowObserved!==true||report.mainWindowEnabled!==true||report.activeJobState!=='idle')throw Error('CURRENT_IDLE_Z_MAIN_STATE_REQUIRED');
 const thickness=Number(arg('--thickness-mm')),gap=Number(arg('--gap-mm')),approved=Number(arg('--approved-target-mm')),target=Math.round((thickness+gap)*1000)/1000;
 if(![thickness,gap,approved,target].every(Number.isFinite)||thickness<=0||gap<=0||approved<=0||target!==approved)throw Error('EXPLICIT_MATCHING_TARGET_REQUIRED');
 const one=(id,type)=>{const a=report.controls.filter(c=>c.id===id&&c.type===type&&c.enabled&&!c.offscreen);if(a.length!==1)throw Error('EXACT_Z_CONTROLS_REQUIRED');return a[0];};
 const input=one('118','ControlType.Edit'),position=one('110','ControlType.Text'),button=one('109','ControlType.Button');if(button.name!=='定位高度'||!/^Z位置:\s*[0-9]+(?:\.[0-9]+)?\s*mm\s*$/.test(position.name))throw Error('Z_POSITION_SEMANTICS_UNKNOWN');
 if(action==='position-z-once'&&Number(input.numericValue)!==target)throw Error('Z_TARGET_NOT_ENTERED');
 Object.assign(command,{heightActionAuthorized:true,operatorReadyConfirmed:true,coordinateSemanticsConfirmed:true,limitsConfirmed:true,thicknessMm:thickness,gapMm:gap,targetMm:target,approvedTargetMm:approved,expectedPanelStateSha256:report.panelStateSha256,expectedPositionText:position.name});
}
if(action==='close-z-panel'){
 if(!process.argv.includes('--z-panel-close-authorized'))throw Error('Z_PANEL_CLOSE_NOT_AUTHORIZED');
 const previous=process.argv[3];if(!/^[a-f0-9]{32}$/.test(previous||''))throw Error('INVALID_OBSERVATION_ID');
 const report=JSON.parse(fs.readFileSync(path.join(base,'runs',previous,'result.json'),'utf8'));const age=Date.now()-Date.parse(report.at);
 if(report.status!=='z_panel_observed_readonly'||!Number.isFinite(age)||age<0||age>120000||!/^[a-f0-9]{64}$/.test(report.panelStateSha256||''))throw Error('FRESH_Z_PANEL_OBSERVATION_REQUIRED');
 Object.assign(command,{zPanelCloseAuthorized:true,expectedPanelStateSha256:report.panelStateSha256});
}
if(action==='open-z-panel'){
 if(!process.argv.includes('--z-panel-authorized'))throw Error('Z_PANEL_NAVIGATION_NOT_AUTHORIZED');
 const previous=process.argv[3];if(!/^[a-f0-9]{32}$/.test(previous||''))throw Error('INVALID_OBSERVATION_ID');
 const report=JSON.parse(fs.readFileSync(path.join(base,'runs',previous,'result.json'),'utf8'));const age=Date.now()-Date.parse(report.at);
 if(report.status!=='controls_observed'||!Number.isFinite(age)||age<0||age>120000)throw Error('FRESH_Z_PANEL_BUTTON_OBSERVATION_REQUIRED');
 const match=report.controls.filter(c=>c.name==='Z轴'&&c.automationId==='11048'&&c.enabled&&!c.offscreen);
 if(match.length!==1||match[0].screenshot!=='control-11048.png')throw Error('UNIQUE_Z_PANEL_BUTTON_REQUIRED');
 Object.assign(command,{zPanelAuthorized:true,expectedWidth:report.width,expectedHeight:report.height,expectedControlSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(base,'runs',previous,'control-11048.png'))).digest('hex')});
}
if(action==='select-products'){
 if(!process.argv.includes('--selection-authorized'))throw Error('CURRENT_SELECTION_AUTHORIZATION_REQUIRED');
 const previous=process.argv[3];if(!/^[a-f0-9]{32}$/.test(previous||''))throw Error('INVALID_OBSERVATION_ID');
 const report=JSON.parse(fs.readFileSync(path.join(base,'runs',previous,'result.json'),'utf8'));
 const age=Date.now()-Date.parse(report.at);if(report.status!=='private_viewport_captured'||!Number.isFinite(age)||age<0||age>300000)throw Error('FRESH_CANVAS_OBSERVATION_REQUIRED');
 const rect=process.argv.slice(4,8).map(Number);if(rect.length!==4||rect.some(n=>!Number.isInteger(n)))throw Error('INTEGER_RECTANGLE_REQUIRED');
 const [x1,y1,x2,y2]=rect;if(x1<30||y1<300||x2>=report.width-600||y2>=report.height-190||x2-x1<10||y2-y1<10||x2-x1>1000||y2-y1>800)throw Error('RECTANGLE_OUTSIDE_CANVAS_LIMITS');
 const reference=path.join('runs',previous,'viewport-private.png');
 Object.assign(command,{selectionAuthorized:true,x1,y1,x2,y2,expectedWidth:report.width,expectedHeight:report.height,referenceView:reference,referenceViewSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(base,reference))).digest('hex')});
}
if(action==='set-scan-height'){
 if(!process.argv.includes('--scan-height-authorized')||!process.argv.includes('--operator-ready'))throw Error('CURRENT_SCAN_HEIGHT_CONFIRMATION_REQUIRED');const i=process.argv.indexOf('--approved-height-mm'),height=i>=0?Number(process.argv[i+1]):NaN;if(!Number.isFinite(height)||height<=0||Math.round(height*1000)/1000!==height)throw Error('EXPLICIT_SCAN_HEIGHT_REQUIRED');const previous=process.argv[3];if(!/^[a-f0-9]{32}$/.test(previous||''))throw Error('INVALID_OBSERVATION_ID');const report=JSON.parse(fs.readFileSync(path.join(base,'runs',previous,'result.json'),'utf8')),age=Date.now()-Date.parse(report.at);if(report.status!=='controls_observed'||!Number.isFinite(age)||age<0||age>120000)throw Error('FRESH_SCAN_CONTROLS_REQUIRED');const fields=report.controls.filter(c=>c.automationId==='35008'&&c.controlType==='ControlType.Edit'&&c.enabled&&!c.offscreen&&c.numericValue!==null);if(fields.length!==1)throw Error('EXACT_SCAN_HEIGHT_REQUIRED');Object.assign(command,{scanHeightAuthorized:true,operatorReadyConfirmed:true,approvedHeightMm:height,expectedScanHeight:fields[0].numericValue,expectedWidth:report.width,expectedHeight:report.height,expectedPanelSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(base,'runs',previous,'scan-panel.png'))).digest('hex')});
}
if(action==='scan-region-control'){
 const previous=process.argv[3],control=process.argv[4];if(!/^[a-f0-9]{32}$/.test(previous||'')||!['all-toggle','expand','zone-1','zone-2','zone-3','zone-4','zones-2-3','zones-1-2-3','zones-1-2-3-4','zones-5-6-7'].includes(control))throw Error('INVALID_REGION_REQUEST');
 const report=JSON.parse(fs.readFileSync(path.join(base,'runs',previous,'result.json'),'utf8'));
 const age=Date.now()-Date.parse(report.at);if(report.status!=='controls_observed'||!Number.isFinite(age)||age<0||age>120000)throw Error('FRESH_REGION_OBSERVATION_REQUIRED');
 Object.assign(command,{regionControl:control,expectedPanelSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(base,'runs',previous,'scan-panel.png'))).digest('hex')});
}
if(process.argv.includes('--current-z-standard')||process.argv.includes('--safe-z-mm'))throw Error('CURRENT_Z_SHORTCUT_RETIRED');
// Archived height-safety/height-transition records do not gate current commands.
// The scan field remains bound only to its own fresh unchanged observation.
if(action==='scan-once'){
 if(!process.argv.includes('--scan-only-authorized')||!process.argv.includes('--operator-ready'))throw Error('CURRENT_SCAN_ONLY_AUTHORIZATION_REQUIRED');
 const previous=process.argv[3];if(!/^[a-f0-9]{32}$/.test(previous||''))throw Error('INVALID_OBSERVATION_ID');
 const report=JSON.parse(fs.readFileSync(path.join(base,'runs',previous,'result.json'),'utf8'));
 const age=Date.now()-Date.parse(report.at);
 if(report.status!=='controls_observed'||!Number.isFinite(age)||age<0||age>120000||report.mainWindowEnabled!==true||report.activeJobState!=='idle')throw Error('FRESH_SCAN_OBSERVATION_REQUIRED');
 const scan=report.controls.filter(c=>c.name==='开始扫描'&&c.automationId==='17070'&&c.enabled&&!c.offscreen),heights=report.controls.filter(c=>c.automationId==='35008'),height=heights[0];
 const observedHeight=height?.numericValue;
 if(scan.length!==1||scan[0].screenshot!=='control-17070.png'||heights.length!==1||observedHeight===null||observedHeight===undefined||!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(observedHeight).trim())||!Number.isFinite(Number(observedHeight)))throw Error('SCAN_CONTROL_OR_HEIGHT_MISSING');
 Object.assign(command,{scanOnlyAuthorized:true,operatorReadyConfirmed:true,expectedScanHeight:height.numericValue,expectedWidth:report.width,expectedHeight:report.height,expectedHeaderSha256:report.headerSha256,expectedControlSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(base,'runs',previous,'control-17070.png'))).digest('hex')});
 const regionsIndex=process.argv.indexOf('--regions');if(regionsIndex>=0){const regions=process.argv[regionsIndex+1];if(!['1,2,3','1,2,3,4'].includes(regions))throw Error('REGION_SET_NOT_ALLOWED');Object.assign(command,{approvedRegions:regions,expectedPanelSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(base,'runs',previous,'scan-panel.png'))).digest('hex')});}
}
if(action==='print-once'){
 if(!process.argv.includes('--print-authorized')||!process.argv.includes('--operator-ready'))throw Error('CURRENT_PRINT_AUTHORIZATION_REQUIRED');
 const arg=n=>{const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:null;},previous=process.argv[3],verify=arg('--verification-run');
 if(!/^[a-f0-9]{32}$/.test(previous||'')||!/^[a-f0-9]{32}$/.test(verify||''))throw Error('OBSERVATION_AND_VERIFICATION_REQUIRED');
 const report=JSON.parse(fs.readFileSync(path.join(base,'runs',previous,'result.json'),'utf8')),verification=JSON.parse(fs.readFileSync(path.join(base,'runs',verify,'result.json'),'utf8'));
 const captureAge=Date.now()-Date.parse(report.at),verificationAge=Date.now()-Date.parse(verification.at);
 if(report.status!=='controls_observed'||!Number.isFinite(captureAge)||captureAge<0||captureAge>120000||verification.action!=='verify-product'||verification.targetInputSent!==true||!Number.isFinite(verificationAge)||verificationAge<0||verificationAge>600000)throw Error('FRESH_PRINT_EVIDENCE_REQUIRED');
 const selectionId=arg('--selection-run');if(!/^[a-f0-9]{32}$/.test(selectionId||''))throw Error('CURRENT_SELECTION_EVIDENCE_REQUIRED');const selected=JSON.parse(fs.readFileSync(path.join(base,'runs',selectionId,'result.json'),'utf8'));if(selected.action!=='select-products'||selected.status!=='rectangle_drag_sent_requires_visual_readback'||selected.targetInputSent!==true||!Number.isFinite(Date.parse(selected.at))||Date.parse(selected.at)>Date.parse(verification.at))throw Error('VERIFIED_SELECTION_ORDER_REQUIRED');
 const line=arg('--verification-line'),template=arg('--template'),count=arg('--count');if(!line||!template||!/^\d+$/.test(count||'')||Number(count)<1||!line.endsWith('成功识别 '+count+' 个产品'))throw Error('EXACT_VERIFICATION_READBACK_REQUIRED');
 Object.assign(command,{printAuthorized:true,operatorReadyConfirmed:true,expectedWidth:report.width,expectedHeight:report.height,expectedProductCount:count,expectedVerificationLine:line,expectedTemplateSha256:crypto.createHash('sha256').update(template).digest('hex'),expectedControlSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(base,'runs',previous,'control-17061.png'))).digest('hex'),expectedPanelSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(base,'runs',previous,'scan-panel.png'))).digest('hex')});
}
if(action==='verify-product'){
 if(!process.argv.includes('--product-verification-authorized'))throw Error('CURRENT_PRODUCT_VERIFICATION_AUTHORIZATION_REQUIRED');
 const previous=process.argv[3];if(!/^[a-f0-9]{32}$/.test(previous||''))throw Error('INVALID_OBSERVATION_ID');
 const report=JSON.parse(fs.readFileSync(path.join(base,'runs',previous,'result.json'),'utf8'));
 if(!['controls_observed','private_viewport_captured'].includes(report.status)||Date.now()-Date.parse(report.at)>300000)throw Error('FRESH_VERIFICATION_OBSERVATION_REQUIRED');
 const button=report.controls.filter(c=>c.name==='产品验证'&&c.automationId==='17075'&&c.enabled&&!c.offscreen);if(button.length!==1)throw Error('UNIQUE_VERIFICATION_BUTTON_REQUIRED');
 Object.assign(command,{productVerificationAuthorized:true,inputRoute:'native-mouse',expectedWidth:report.width,expectedHeight:report.height,expectedControlSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(base,'runs',previous,'control-17075.png'))).digest('hex')});
}
if(action==='open-texture-import'){
 if(!process.argv.includes('--texture-import-navigation-authorized'))throw Error('TEXTURE_IMPORT_NAVIGATION_NOT_AUTHORIZED');const previous=process.argv[3];if(!/^[a-f0-9]{32}$/.test(previous||''))throw Error('INVALID_OBSERVATION_ID');const report=JSON.parse(fs.readFileSync(path.join(base,'runs',previous,'result.json'),'utf8')),age=Date.now()-Date.parse(report.at);if(report.status!=='texture_import_button_observed'||!Number.isFinite(age)||age<0||age>120000||report.controlId!=='17071'||report.controlName!=='导入贴图')throw Error('FRESH_TEXTURE_ENTRY_REQUIRED');const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(base,'runs',previous,'texture-import-button.png'))).digest('hex');if(hash!==report.controlSha256)throw Error('TEXTURE_CONTROL_HASH_MISMATCH');Object.assign(command,{textureImportNavigationAuthorized:true,expectedControlSha256:hash,expectedEditorTitleSha256:report.editorTitleSha256});
}
if(action==='open-template-editor'){
 if(!process.argv.includes('--editor-navigation-authorized'))throw Error('EDITOR_NAVIGATION_NOT_AUTHORIZED');const previous=process.argv[3];if(!/^[a-f0-9]{32}$/.test(previous||''))throw Error('INVALID_OBSERVATION_ID');const report=JSON.parse(fs.readFileSync(path.join(base,'runs',previous,'result.json'),'utf8')),age=Date.now()-Date.parse(report.at);if(report.status!=='controls_observed'||!Number.isFinite(age)||age<0||age>120000)throw Error('FRESH_EDITOR_CONTROL_REQUIRED');const c=report.controls.filter(c=>c.name==='编辑'&&c.automationId==='35006'&&c.enabled&&!c.offscreen);if(c.length!==1||c[0].screenshot!=='control-35006.png')throw Error('UNIQUE_EDITOR_CONTROL_REQUIRED');Object.assign(command,{templateEditorNavigationAuthorized:true,inputRoute:'native-mouse',expectedWidth:report.width,expectedHeight:report.height,expectedControlSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(base,'runs',previous,'control-35006.png'))).digest('hex')});
}
if(action==='open-new-template'){
 if(!process.argv.includes('--new-template-authorized'))throw Error('NEW_TEMPLATE_NAVIGATION_NOT_AUTHORIZED');
 const previous=process.argv[3];if(!/^[a-f0-9]{32}$/.test(previous||''))throw Error('INVALID_OBSERVATION_ID');
 const report=JSON.parse(fs.readFileSync(path.join(base,'runs',previous,'result.json'),'utf8')),age=Date.now()-Date.parse(report.at);
 if(report.status!=='controls_observed'||!Number.isFinite(age)||age<0||age>120000||report.mainWindowEnabled!==true||report.activeJobState!=='idle')throw Error('FRESH_IDLE_NEW_TEMPLATE_CONTROL_REQUIRED');
 const c=report.controls.filter(c=>c.name==='新建'&&c.automationId==='17072'&&c.enabled&&!c.offscreen);if(c.length!==1||c[0].screenshot!=='control-17072.png')throw Error('UNIQUE_NEW_TEMPLATE_CONTROL_REQUIRED');
 Object.assign(command,{newTemplateNavigationAuthorized:true,inputRoute:'native-mouse',expectedWidth:report.width,expectedHeight:report.height,expectedControlSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(base,'runs',previous,'control-17072.png'))).digest('hex')});
}
if(action==='create-registration-template'){
 if(!process.argv.includes('--new-template-authorized')||!process.argv.includes('--registration-only-no-print'))throw Error('REGISTRATION_ONLY_AUTHORIZATION_REQUIRED');
 const previous=process.argv[3],i=process.argv.indexOf('--name'),name=i>=0?process.argv[i+1]:'';
 if(!/^[a-f0-9]{32}$/.test(previous||'')||!/^飞天_配准草稿_[0-9]{8}_[0-9]{6}$/.test(name))throw Error('UNIQUE_DRAFT_NAME_REQUIRED');
 const report=JSON.parse(fs.readFileSync(path.join(base,'runs',previous,'result.json'),'utf8')),age=Date.now()-Date.parse(report.at);
 if(report.status!=='new_template_dialog_observed'||!Number.isFinite(age)||age<0||age>120000||!/[a-f0-9]{64}/.test(report.dialogStateSha256||'')||report.nameValue!==''||report.multiState!=='Off'||report.autoState!=='Off')throw Error('FRESH_BLANK_NEW_TEMPLATE_DIALOG_REQUIRED');
 Object.assign(command,{newTemplateAuthorized:true,registrationOnlyNoPrint:true,newTemplateName:name,expectedDialogStateSha256:report.dialogStateSha256});
}
if(action==='draft-editor-control'||action==='select-draft-features'||action==='restore-draft-window'){
 if(!process.argv.includes('--draft-editor-authorized')||!process.argv.includes('--no-print'))throw Error('DRAFT_ONLY_AUTHORIZATION_REQUIRED');
 const previous=process.argv[3];if(!/^[a-f0-9]{32}$/.test(previous||''))throw Error('INVALID_OBSERVATION_ID');
 const report=JSON.parse(fs.readFileSync(path.join(base,'runs',previous,'result.json'),'utf8')),age=Date.now()-Date.parse(report.at),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 if(report.status!==(action==='restore-draft-window'?'owned_draft_window_offscreen':'owned_draft_editor_observed')||!Number.isFinite(age)||age<0||age>120000||!/^编辑模板 - 飞天_配准草稿_[0-9]{8}_[0-9]{6}$/.test(report.editorTitle||'')||hash(report.editorTitle)!==report.editorTitleSha256||report.targetSha256!==command.targetSha256||!Number.isInteger(report.targetProcessId)||!Number.isFinite(Date.parse(report.targetProcessStartUtc)))throw Error('FRESH_OWNED_DRAFT_REQUIRED');
 Object.assign(command,{draftEditorAuthorized:true,draftNoPrint:true,observationAt:report.at,expectedEditorTitleSha256:report.editorTitleSha256,expectedWidth:report.width,expectedHeight:report.height,expectedProcessId:report.targetProcessId,expectedProcessStartUtc:report.targetProcessStartUtc});
 if(action==='restore-draft-window'){
  const [rw,rh]=process.argv.slice(4,6).map(Number);if(![rw,rh,report.left,report.top].every(Number.isInteger)||rw<900||rw>2000||rh<650||rh>1200)throw Error('DRAFT_RESTORE_SIZE_INVALID');Object.assign(command,{expectedLeft:report.left,expectedTop:report.top,restoreWidth:rw,restoreHeight:rh});
 }else if(action==='draft-editor-control'){
  const choices={'rectangle-tool':['17078','矩形','Button'],'outer-contour-on':['17208','只寻找外轮廓','CheckBox'],'units-mm':['17121','毫米单位','RadioButton'],'verify-features':['17074','验证特征','Button'],'auto-align':['17307','自动对位','Button'],'save-draft':['17023','保存','Button'],'edit-image':['17107','编辑图片','Button'],'edit-template':['17111','编辑模板','Button'],'select-tool':['17076','选择','Button'],'scale-down':['17046','小','Button'],'undo-texture':['17021','撤消','Button'],'close-draft-unsaved':['','关闭','Button']};
  choices['show-texture']=['17085','显示贴图','Button'];choices['focus-scale-step']=['17038','单位:','ComboBox'];const choice=choices[process.argv[4]];if(!choice)throw Error('DRAFT_CONTROL_NOT_ALLOWED');const [id,name,type]=choice,c=report.controls.filter(c=>c.id===id&&c.name===name&&c.type==='ControlType.'+type&&c.enabled&&!c.offscreen);if(c.length!==1||!(/^[a-f0-9]{64}$/).test(c[0].sha256)||id==='17208'&&c[0].toggleState!=='Off')throw Error('FRESH_DRAFT_CONTROL_REQUIRED');
  if(hash(fs.readFileSync(path.join(base,'runs',previous,'draft-control-'+id+'.png')))!==c[0].sha256)throw Error('DRAFT_CONTROL_IMAGE_CHANGED');Object.assign(command,{draftControlId:id,expectedControlSha256:c[0].sha256});
  if(id==='17046'){const amount=Number(report.scaleStep);if(report.uniformScale!==true||typeof report.scaleStep!=='string'||!Number.isFinite(amount)||amount<=0||amount>10)throw Error('DRAFT_SCALE_STEP_OR_MODE_INVALID');command.expectedScaleStep=report.scaleStep;}
 }else{
  const pointOnly=process.argv.includes('--point-select-only'),transform=process.argv.includes('--texture-transform-only');const [x1,y1,x2,y2]=process.argv.slice(4,8).map(Number);if(![x1,y1,x2,y2].every(Number.isInteger)||Math.min(x1,x2)<report.canvasLeft||Math.min(y1,y2)<report.canvasTop||Math.max(x1,x2)>=report.canvasRight||Math.max(y1,y2)>=report.canvasBottom||(pointOnly?(x2!==x1||y2!==y1):(transform?(Math.abs(x2-x1)<10||Math.abs(y2-y1)<10):(x2-x1<10||y2-y1<10))))throw Error('DRAFT_SELECTION_OUTSIDE_CANVAS');if(pointOnly)command.draftPointOnly=true;if(transform){if(pointOnly||report.uniformScale!==true||!report.controls.some(c=>c.id==='17046'&&c.name==='小'&&c.enabled&&!c.offscreen))throw Error('SELECTED_UNIFORM_TEXTURE_REQUIRED');command.draftTextureTransform=true;}
  const reference=path.join('runs',previous,'draft-editor-private.png'),h=hash(fs.readFileSync(path.join(base,reference)));if(h!==report.viewSha256)throw Error('DRAFT_REFERENCE_CHANGED');Object.assign(command,{x1,y1,x2,y2,referenceView:reference,referenceViewSha256:h});
 }
}
if(action==='open-template-import'){
 const previous=process.argv[3];if(!/^[a-f0-9]{32}$/.test(previous||''))throw Error('INVALID_OBSERVATION_ID');
 const report=JSON.parse(fs.readFileSync(path.join(base,'runs',previous,'result.json'),'utf8'));
 if(report.status!=='controls_observed'||Date.now()-Date.parse(report.at)>600000)throw Error('FRESH_CONTROL_OBSERVATION_REQUIRED');
 const match=report.controls.filter(c=>c.name==='导入'&&c.automationId==='17098'&&c.enabled&&!c.offscreen);
 if(match.length!==1||match[0].screenshot!=='control-17098.png')throw Error('UNIQUE_IMPORT_CONTROL_REQUIRED');
 Object.assign(command,{expectedWidth:report.width,expectedHeight:report.height,expectedControlSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(base,'runs',previous,'control-17098.png'))).digest('hex')});
 if(process.argv.includes('--native-mouse'))command.inputRoute='native-mouse';
}
if(command.action==='navigate'){
 const previous=process.argv[6];if(!/^[a-f0-9]{32}$/.test(previous||''))throw Error('INVALID_OBSERVATION_ID');
 const report=JSON.parse(fs.readFileSync(path.join(base,'runs',previous,'result.json'),'utf8'));
 const blockedObservation=report.status==='blocked'&&report.error==='HEADER_CHANGED_REOBSERVE_REQUIRED'&&report.inputMayHaveBeenSent===false;
 const image=report.status==='captured'||report.status==='controls_observed'||blockedObservation?'before.png':'after.png';
 const header=fs.readFileSync(path.join(base,'runs',previous,image));
 const headerHash=crypto.createHash('sha256').update(header).digest('hex');
 if(!blockedObservation&&headerHash!==(report.headerSha256||report.afterSha256))throw Error('OBSERVATION_HASH_MISMATCH');
 const geometry=report.status==='captured'||report.status==='controls_observed'?report:JSON.parse(fs.readFileSync(path.join(base,'runs',previous,'geometry.json'),'utf8'));
 Object.assign(command,{page:process.argv[3],x:Number(process.argv[4]),y:Number(process.argv[5]),expectedWidth:geometry.width,expectedHeight:geometry.height,expectedHeaderSha256:headerHash});
 if(!['文件','常规打印','设置','校准','电压','高级','视觉打印'].includes(command.page))throw Error('PAGE_NOT_ALLOWED');
 if(!Number.isInteger(command.x)||!Number.isInteger(command.y)||command.y<25||command.y>85||command.x<160||command.x>command.expectedWidth-100)throw Error('POINT_OUTSIDE_NAVIGATION_BAND');
}
const dst=path.join(base,'command.json'),tmp=dst+'.'+command.id+'.tmp';fs.writeFileSync(tmp,JSON.stringify(command,null,2)+'\n',{flag:'wx'});fs.renameSync(tmp,dst);
console.log(JSON.stringify({id:command.id,action:command.action,page:command.page||null}));
