'use strict';
// Data-only promotion through the existing learner. No machine, USB or parameter API.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const NAME='industrial-uv-print-troubleshooter',PLUGIN=NAME+'@uv-print';
const SKILL='skills/'+NAME,KNOW=SKILL+'/knowledge';
const MANIFEST='.codex-plugin/plugin.json',INTEGRITY='maintenance/site-20260916/integrity.json';
const INDEX=KNOW+'/validated/index.md',TOOL='uv_learning_update/v1';
const CLASSIFICATIONS=['observed','documented','executed','physically_verified'];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=b=>JSON.parse(b.toString('utf8').replace(/^\uFEFF/,''));
const bytes=o=>Buffer.from(JSON.stringify(o,null,2)+'\n');
const fail=(code,detail)=>{throw Object.assign(new Error(code),{code,detail});};
function noLinks(p){
  let q=path.resolve(p);
  for(;;){if(fs.existsSync(q)&&fs.lstatSync(q).isSymbolicLink())fail('SYMLINK_REJECTED');const up=path.dirname(q);if(up===q)break;q=up;}
  return path.resolve(p);
}
function relative(p){
  if(typeof p!=='string'||!p||p.includes('\\')||p.includes(':')||p.startsWith('/')||p.split('/').some(x=>!x||x==='.'||x==='..'))fail('RELATIVE_PATH_REQUIRED');
  return p;
}
function within(root,rel){const p=path.resolve(root,...relative(rel).split('/'));if(!p.startsWith(root+path.sep))fail('PATH_ESCAPE');return noLinks(p);}
const comparePath=p=>process.platform==='win32'?p.toLowerCase():p;
function separate(a,b){a=comparePath(a);b=comparePath(b);return a!==b&&!a.startsWith(b+path.sep)&&!b.startsWith(a+path.sep);}
function sourceRoot(p){const r=noLinks(path.resolve(p));if(/\/plugins\/cache(?:\/|$)/i.test(r.replace(/\\/g,'/')))fail('CACHE_IS_NOT_MAINTENANCE_SOURCE');return r;}
function file(p,max=4*1024*1024){noLinks(p);const s=fs.statSync(p);if(!s.isFile()||s.size>max)fail('INPUT_FILE_INVALID');return fs.readFileSync(p);}
function keys(o,allowed){if(!o||Array.isArray(o)||typeof o!=='object'||Object.keys(o).some(k=>!allowed.includes(k)))fail('SCHEMA_FIELD_REJECTED');}
function prose(v){
  if(typeof v!=='string'||!v.trim()||v.length>12000)fail('PROSE_REQUIRED');
  if(/```|<script|\b(?:eval|require|exec|spawn|import)\s*\(|(?:^|\n)\s*#!|\b(?:function\s+[A-Za-z_$]|(?:const|let)\s+\w+\s*=|import\s+.+\s+from\s|(?:Remove-Item|Set-Content|Invoke-Expression|Start-Process)\b)/i.test(v))fail('EXECUTABLE_CONTENT_REJECTED');
  if(/(?:password|secret|token|api[_ -]?key|authorization)\s*[:=]\s*\S|Bearer\s+\S|(?:密码|口令)\s*(?:是|为|[:：=])\s*\S|([0-9])\1{5}/i.test(v))fail('SENSITIVE_CONTENT_REJECTED');
  if(/\b(?:x|y)\s*[:=]\s*-?\d|(?:屏幕|点击|鼠标)坐标\s*[:：=]/i.test(v))fail('TRANSIENT_COORDINATES_REJECTED');
  return v.trim();
}
function inputs(opts){
  const evidenceRoot=noLinks(opts.evidenceRoot),recordBytes=file(path.resolve(opts.record)),r=json(recordBytes),review=json(file(path.resolve(opts.review)));
  if(!fs.statSync(evidenceRoot).isDirectory())fail('EVIDENCE_ROOT_REQUIRED');
  keys(r,['schemaVersion','source','scope','observation','classification','limitations','evidence']);
  if(r.schemaVersion!==1||!CLASSIFICATIONS.includes(r.classification)||!Array.isArray(r.evidence)||!r.evidence.length||r.evidence.length>32)fail('RECORD_SCHEMA_INVALID');
  for(const k of ['source','scope','observation','limitations'])r[k]=prose(r[k]);
  const seen=new Set();
  r.evidence=r.evidence.map(e=>{
    keys(e,['path','sha256','verification','classification']);relative(e.path);
    if(!/^[a-f0-9]{64}$/.test(e.sha256)||!CLASSIFICATIONS.includes(e.classification)||seen.has(e.path))fail('EVIDENCE_SCHEMA_INVALID');
    seen.add(e.path);prose(e.verification);
    if(sha(file(within(evidenceRoot,e.path),64*1024*1024))!==e.sha256)fail('EVIDENCE_HASH_MISMATCH');
    return {path:e.path,sha256:e.sha256,verification:e.verification.trim(),classification:e.classification};
  });
  if(!r.evidence.some(e=>e.classification===r.classification))fail('CLASSIFICATION_EVIDENCE_REQUIRED');
  keys(review,['schemaVersion','operator','reviewerType','reason','recordSha256','evidence','verified','sensitiveReviewPassed']);
  if(review.schemaVersion!==1||!['agent','human'].includes(review.reviewerType)||review.verified!==true||review.sensitiveReviewPassed!==true||review.recordSha256!==sha(recordBytes))fail('BOUND_VERIFIED_REVIEW_REQUIRED');
  prose(review.operator);prose(review.reason);
  if(!Array.isArray(review.evidence)||review.evidence.length!==seen.size||review.evidence.some(p=>!seen.delete(p))||seen.size)fail('REVIEW_EVIDENCE_MISMATCH');
  // Fixed order is the dedup identity; review timestamps and formatting cannot create new facts.
  const normalized={schemaVersion:1,source:r.source,scope:r.scope,observation:r.observation,classification:r.classification,limitations:r.limitations,evidence:[...r.evidence].sort((a,b)=>a.path.localeCompare(b.path))};
  return {record:normalized,review,contentSha256:sha(bytes(normalized))};
}
function baseline(root){
  const raw=file(within(root,INTEGRITY)),index=json(raw),seen=new Set();
  if(index.schemaVersion!==1||!Array.isArray(index.files))fail('INTEGRITY_SCHEMA_INVALID');
  for(const e of index.files){relative(e.path);if(seen.has(e.path)||e.path===INTEGRITY||!/^[a-f0-9]{64}$/.test(e.sha256))fail('INTEGRITY_SCHEMA_INVALID');seen.add(e.path);if(sha(file(within(root,e.path),128*1024*1024))!==e.sha256)fail('BASELINE_DRIFT',e.path);}
  if(!seen.has(MANIFEST))fail('MANIFEST_NOT_INDEXED');
  const manifestRaw=file(within(root,MANIFEST)),manifest=json(manifestRaw);
  if(manifest.name!==NAME||typeof manifest.version!=='string'||index.version!==manifest.version)fail('SOURCE_IDENTITY_INVALID');
  return {index,raw,manifest,manifestRaw,seen};
}
function managed(root,b){
  const records=[];
  for(const bucket of ['raw','validated']){
    const dir=within(root,KNOW+'/'+bucket);if(!fs.existsSync(dir))continue;
    for(const n of fs.readdirSync(dir)){
      if(!/^[a-f0-9-]{36}\.json$/.test(n))continue;
      const rel=KNOW+'/'+bucket+'/'+n,d=json(file(within(root,rel)));
      if(d.learningUpdate?.tool!==TOOL)continue;
      if(!b.seen.has(rel))fail('MANAGED_DATA_NOT_INDEXED');
      if(bucket==='validated'){
        if(d.validation!=='validated'||!d.learningUpdate.contentSha256||!d.id||!CLASSIFICATIONS.includes(d.classification))fail('MANAGED_RECORD_INVALID');
        records.push(d);
      }
    }
  }
  if(fs.existsSync(within(root,INDEX))&&!b.seen.has(INDEX))fail('MANAGED_INDEX_NOT_INDEXED');
  if(fs.existsSync(within(root,INDEX))&&file(within(root,INDEX)).toString('utf8')!==indexMarkdown(records))fail('MANAGED_INDEX_UNEXPECTED_CONTENT');
  return records;
}
function indexMarkdown(records){
  return '# 已验证研究结论（自动维护）\n\n<!-- uv_learning_update/v1: data-only; do not hand-edit -->\n\n'+
    '仅索引本工具经证据核对及审查的记录。observed、documented、executed、physically_verified 保持原等级；历史研究不构成当前设备动作授权。\n\n'+
    records.slice().sort((a,b)=>a.learningUpdate.contentSha256.localeCompare(b.learningUpdate.contentSha256)).map(d=>
      '- ['+d.classification+'] ['+d.id+']('+d.id+'.json) — '+d.observation.replace(/[\r\n]+/g,' ').replace(/[<>]/g,'').slice(0,300).replace(/[\\`*_{}\[\]()!#|]/g,'\\$&')+'\n').join('');
}
function atomic(p,data){const tmp=p+'.learning-'+crypto.randomUUID()+'.tmp';fs.mkdirSync(path.dirname(p),{recursive:true});try{fs.writeFileSync(tmp,data,{flag:'wx'});fs.renameSync(tmp,p);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
function saveReceipt(p,r){atomic(p,bytes(r));return r;}
function publish(root,changes,backupDir){
  const before=new Map();fs.mkdirSync(backupDir,{recursive:true});
  for(const rel of changes.keys()){
    const target=within(root,rel),old=fs.existsSync(target)?file(target,128*1024*1024):null;before.set(rel,old);
    if(old!==null){const b=within(backupDir,rel);fs.mkdirSync(path.dirname(b),{recursive:true});fs.writeFileSync(b,old,{flag:'wx'});if(sha(file(b,128*1024*1024))!==sha(old))fail('BACKUP_HASH_MISMATCH');}
  }
  const written=[];
  try{
    for(const [rel,data]of changes){const target=within(root,rel),old=before.get(rel);if((fs.existsSync(target)?sha(file(target,128*1024*1024)):null)!==(old===null?null:sha(old)))fail('SOURCE_CHANGED_DURING_PREPARE');atomic(target,data);written.push(rel);}
    baseline(root);
  }catch(e){
    let rollbackError=false;
    for(const rel of written.reverse())try{const old=before.get(rel),p=within(root,rel);if(old===null)fs.unlinkSync(p);else atomic(p,old);}catch{rollbackError=true;}
    if(rollbackError)fail('ROLLBACK_INCOMPLETE');throw e;
  }
}
function install(codex){
  const p=noLinks(path.resolve(codex));if(!fs.statSync(p).isFile())fail('CODEX_EXE_REQUIRED');
  const r=spawnSync(p,['plugin','add',PLUGIN,'--json'],{shell:false,windowsHide:true,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024});
  if(r.error||r.status!==0)fail('INSTALLER_FAILED');
  try{return JSON.parse(r.stdout.replace(/^\uFEFF/,''));}catch{fail('INSTALLER_JSON_INVALID');}
}
function verifyCache(info,root,b){
  if(info?.pluginId!==PLUGIN||info.name!==NAME||info.marketplaceName!=='uv-print'||info.version!==b.manifest.version||typeof info.installedPath!=='string'||!path.isAbsolute(info.installedPath))fail('INSTALL_RECEIPT_IDENTITY_MISMATCH');
  const cache=noLinks(path.resolve(info.installedPath));
  if(path.basename(cache)!==info.version||path.basename(path.dirname(cache))!==NAME||!separate(cache,root))fail('CACHE_PATH_INVALID');
  if(sha(file(within(cache,INTEGRITY)))!==sha(b.raw))fail('CACHE_INTEGRITY_MISMATCH');
  for(const e of b.index.files)if(sha(file(within(cache,e.path),128*1024*1024))!==e.sha256)fail('CACHE_FILE_MISMATCH',e.path);
  return {installedPath:cache,filesVerified:b.index.files.length};
}
function updateUnlocked(opts,deps={}){
  for(const k of ['sourceRoot','record','review','evidenceRoot','workRoot','codex'])if(typeof opts[k]!=='string'||!opts[k])fail('REQUIRED_ARGUMENT_MISSING',k);
  const root=sourceRoot(opts.sourceRoot),work=noLinks(path.resolve(opts.workRoot));
  if(!separate(root,work))fail('WORK_MUST_BE_OUTSIDE_SOURCE');
  const data=inputs(opts),b=baseline(root),existing=managed(root,b),found=existing.find(d=>d.learningUpdate.contentSha256===data.contentSha256);
  const transaction=within(work,'uv-learning-'+data.contentSha256),receiptPath=within(transaction,'receipt.json');
  let prior=fs.existsSync(receiptPath)?json(file(receiptPath)):null;
  if(prior&&(prior.sourceRoot!==root||prior.contentSha256!==data.contentSha256))fail('RECEIPT_IDENTITY_MISMATCH');
  if(found&&prior?.status==='installed_and_verified'){
    if(prior.version!==b.manifest.version)return {status:'no_changes',version:b.manifest.version,recordPreviouslyInstalledAt:prior.version,currentCacheVerified:false,contentSha256:data.contentSha256,installerInvoked:false};
    const checked=verifyCache(prior.installation,root,b);
    return {status:'no_changes',version:b.manifest.version,contentSha256:data.contentSha256,currentCacheVerified:true,...checked,installerInvoked:false};
  }
  if(!opts.apply)return {status:found?'preview_refresh_required':'preview',contentSha256:data.contentSha256,classification:data.record.classification,sourceRoot:root,version:b.manifest.version,installerInvoked:false,plannedWrites:found?[]:['knowledge/raw/<uuid>.json','knowledge/validated/<uuid>.json','knowledge/validated/index.md',MANIFEST,INTEGRITY]};
  fs.mkdirSync(transaction,{recursive:true});
  let published=false,version=b.manifest.version;
  if(!found){
    const stage=within(transaction,'stage-'+crypto.randomUUID());fs.mkdirSync(stage,{recursive:true});
    const corePath=within(root,SKILL+'/scripts/uv_core.cjs');if(!b.seen.has(SKILL+'/scripts/uv_core.cjs'))fail('CORE_NOT_INDEXED');
    const core=require(corePath);
    version=b.manifest.version.split('+')[0]+'+codex.learn.'+Date.now()+'.'+data.contentSha256.slice(0,12);
    const learningUpdate={tool:TOOL,contentSha256:data.contentSha256,revisionVersion:version,evidenceRoot:noLinks(path.resolve(opts.evidenceRoot))};
    const rawFile=core.learn(stage,{...data.record,learningUpdate,notOperationalAuthorization:true});
    const id=path.basename(rawFile,'.json');
    const validated=core.promote(stage,id,{...data.review,notMachineAuthorization:true});
    const changes=new Map([
      [KNOW+'/raw/'+id+'.json',file(rawFile)],
      [KNOW+'/validated/'+id+'.json',file(within(stage,'validated/'+id+'.json'))],
      [INDEX,Buffer.from(indexMarkdown([...existing,validated]))]
    ]);
    // Preserve every other manifest byte rather than reserializing unrelated metadata.
    const oldText=b.manifestRaw.toString('utf8'),oldVersion=JSON.stringify(b.manifest.version);
    const pattern=new RegExp('("version"\\s*:\\s*)'+oldVersion.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
    const newText=oldText.replace(pattern,(_,prefix)=>prefix+JSON.stringify(version));
    if(newText===oldText)fail('MANIFEST_VERSION_REPLACEMENT_FAILED');
    changes.set(MANIFEST,Buffer.from(newText));
    const next=json(b.raw);next.version=version;next.generatedAt=new Date().toISOString();
    for(const [rel,value]of changes){const entry=next.files.find(e=>e.path===rel);if(entry)entry.sha256=sha(value);else next.files.push({path:rel,sha256:sha(value)});}
    changes.set(INTEGRITY,bytes(next));
    // Baseline still must match after staging; never recalculate unrelated entries.
    if(sha(file(within(root,INTEGRITY)))!==sha(b.raw))fail('SOURCE_CHANGED_DURING_PREPARE');baseline(root);
    publish(root,changes,within(transaction,'backup-'+crypto.randomUUID()));published=true;
  }
  const current=baseline(root);
  let receipt={schemaVersion:1,tool:TOOL,status:'needs_refresh',sourceRoot:root,contentSha256:data.contentSha256,version:current.manifest.version,published,classification:data.record.classification,notMachineAuthorization:true};
  saveReceipt(receiptPath,receipt);
  try{
    const info=(deps.installer||install)(opts.codex),checked=verifyCache(info,root,current);
    receipt={...receipt,status:'installed_and_verified',installation:info,...checked,installerInvoked:true};
  }catch(e){receipt={...receipt,error:e.code||'REFRESH_FAILED',installerInvoked:true};}
  return saveReceipt(receiptPath,receipt);
}
function update(opts,deps={}){
  if(!opts.apply)return updateUnlocked(opts,deps);
  // Cross-work-root mutex; keep it outside the plugin. A stale lock requires review.
  for(const k of ['sourceRoot','record','review','evidenceRoot','workRoot','codex'])if(typeof opts[k]!=='string'||!opts[k])fail('REQUIRED_ARGUMENT_MISSING',k);
  const root=sourceRoot(opts.sourceRoot),work=noLinks(path.resolve(opts.workRoot));
  if(!separate(root,work))fail('WORK_MUST_BE_OUTSIDE_SOURCE');
  inputs(opts);baseline(root);
  const realRoot=fs.realpathSync(root),identity=process.platform==='win32'?realRoot.toLowerCase():realRoot;
  const lock=within(noLinks(os.tmpdir()),'uv-learning-lock-'+sha(identity));
  try{fs.mkdirSync(lock);}catch(e){if(e.code==='EEXIST')fail('UPDATE_BUSY_OR_STALE_LOCK');throw e;}
  try{return updateUnlocked(opts,deps);}finally{fs.rmdirSync(lock);}
}
function cli(argv){
  const names={'--source-root':'sourceRoot','--record':'record','--review':'review','--evidence-root':'evidenceRoot','--work-root':'workRoot','--codex':'codex'},o={};
  for(let i=0;i<argv.length;i++){const a=argv[i];if(a==='--apply'){if(o.apply)fail('DUPLICATE_ARGUMENT');o.apply=true;}else if(names[a]){const k=names[a];if(o[k]||!argv[i+1]||argv[i+1].startsWith('--'))fail('ARGUMENT_INVALID');o[k]=argv[++i];}else fail('ARGUMENT_INVALID');}
  return update(o);
}
if(require.main===module){try{const r=cli(process.argv.slice(2));process.stdout.write(JSON.stringify(r,null,2)+'\n');if(r.status==='needs_refresh')process.exitCode=2;}catch(e){process.stderr.write(JSON.stringify({status:'rejected',error:e.code||'UPDATE_FAILED',detail:e.detail})+'\n');process.exitCode=1;}}
module.exports={update,sha,TOOL};
