'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const os=require('node:os');
const HERE=__dirname,NAME='industrial-uv-print-troubleshooter',SKILL='skills/'+NAME;
const deployedScript=path.join(HERE,'../scripts/uv_learning_update.cjs');
const script=fs.existsSync(deployedScript)?deployedScript:path.join(HERE,'uv_learning_update.cjs');
const {update,sha}=require(script);
const core=fs.readFileSync(path.join(path.dirname(script),'uv_core.cjs'));
const put=(p,b)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,b);};
const write=(p,o)=>put(p,JSON.stringify(o,null,2)+'\n');
function cleanupFixture(dir){
  const base=path.resolve(os.tmpdir()),target=path.resolve(dir),norm=p=>process.platform==='win32'?p.toLowerCase():p;
  assert.equal(norm(path.dirname(target)),norm(base),'Fixture cleanup must remain directly inside os.tmpdir().');
  assert.match(path.basename(target),/^uv-learning-fixture-[A-Za-z0-9]+$/,'Only this test fixture prefix may be removed.');
  assert.equal(fs.lstatSync(target).isSymbolicLink(),false,'Fixture root must not be a link.');
  assert.equal(norm(fs.realpathSync(target)),norm(target),'Fixture root must retain its resolved identity.');
  fs.rmSync(target,{recursive:true,force:true});
}
function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uv-learning-fixture-'));t.after(()=>cleanupFixture(dir));
  const source=path.join(dir,'source'),work=path.join(dir,'work'),evidence=path.join(dir,'evidence');
  put(path.join(source,SKILL,'scripts/uv_core.cjs'),core);
  put(path.join(source,'license.bin'),Buffer.from([0,1,17,240,255]));
  write(path.join(source,'.codex-plugin/plugin.json'),{name:NAME,version:'0.1.0+fixture',description:'Do not change me.'});
  const files=[SKILL+'/scripts/uv_core.cjs','license.bin','.codex-plugin/plugin.json'];
  write(path.join(source,'maintenance/site-20260916/integrity.json'),{schemaVersion:1,version:'0.1.0+fixture',files:files.map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(source,p)))}))});
  put(path.join(evidence,'capture.txt'),'Observed waveform file selector, not pulse graph.\n');
  const record=path.join(dir,'record.json'),review=path.join(dir,'review.json');
  const r={schemaVersion:1,source:'Read-only PrintExp observation',scope:'This software session only.',observation:'The waveform page displays a file selector and an Apply control.',classification:'observed',limitations:'No waveform was applied; file names do not prove hardware compatibility.',evidence:[{path:'capture.txt',sha256:sha(fs.readFileSync(path.join(evidence,'capture.txt'))),verification:'Reviewed the captured page text.',classification:'observed'}]};
  const bind=()=>{write(record,r);write(review,{schemaVersion:1,operator:'Codex independent reviewer',reviewerType:'agent',reason:'Evidence supports this bounded observation; no operational authorization.',recordSha256:sha(fs.readFileSync(record)),evidence:r.evidence.map(e=>e.path),verified:true,sensitiveReviewPassed:true});};bind();
  const opts={sourceRoot:source,workRoot:work,evidenceRoot:evidence,record,review,codex:path.join(dir,'codex.exe')};
  let calls=0;
  const installer=()=>{
    calls++;const version=JSON.parse(fs.readFileSync(path.join(source,'.codex-plugin/plugin.json'))).version;
    const installedPath=path.join(dir,'cache','uv-print',NAME,version);fs.cpSync(source,installedPath,{recursive:true});
    return {pluginId:NAME+'@uv-print',name:NAME,marketplaceName:'uv-print',version,installedPath,authPolicy:'ON_INSTALL'};
  };
  return {dir,source,work,evidence,r,bind,opts,installer,calls:()=>calls};
}
test('preview is inert; promotion uses existing learner, installed hashes and license bytes survive; duplicate is inert',t=>{
  const f=fixture(t),before=fs.readFileSync(path.join(f.source,'license.bin'));
  assert.equal(update(f.opts,{installer:f.installer}).status,'preview');assert.equal(fs.existsSync(f.work),false);
  const first=update({...f.opts,apply:true},{installer:f.installer});assert.equal(first.status,'installed_and_verified');assert.equal(first.filesVerified,6);assert.equal(f.calls(),1);
  assert.deepEqual(fs.readFileSync(path.join(f.source,'license.bin')),before);
  const manifest=fs.readFileSync(path.join(f.source,'.codex-plugin/plugin.json'));
  const second=update({...f.opts,apply:true},{installer:f.installer});assert.equal(second.status,'no_changes');assert.equal(f.calls(),1);assert.deepEqual(fs.readFileSync(path.join(f.source,'.codex-plugin/plugin.json')),manifest);
  const idx=fs.readFileSync(path.join(f.source,SKILL,'knowledge/validated/index.md'),'utf8');assert.match(idx,/observed/);assert.doesNotMatch(idx,/physically_verified\]/);
});
test('changed evidence rejects before mutation or installation',t=>{
  const f=fixture(t);put(path.join(f.evidence,'capture.txt'),'changed');
  assert.throws(()=>update({...f.opts,apply:true},{installer:f.installer}),/EVIDENCE_HASH_MISMATCH/);assert.equal(f.calls(),0);assert.equal(fs.existsSync(f.work),false);
});
test('baseline drift rejects without recalculating any hash',t=>{
  const f=fixture(t),index=path.join(f.source,'maintenance/site-20260916/integrity.json'),before=fs.readFileSync(index);put(path.join(f.source,'license.bin'),'drift');
  assert.throws(()=>update({...f.opts,apply:true},{installer:f.installer}),/BASELINE_DRIFT/);assert.deepEqual(fs.readFileSync(index),before);assert.equal(f.calls(),0);
});
test('installer failure retains validated source and needs_refresh; retry only refreshes',t=>{
  const f=fixture(t);let attempts=0;
  const result=update({...f.opts,apply:true},{installer:()=>{attempts++;throw Error('offline');}});
  assert.equal(result.status,'needs_refresh');assert.equal(attempts,1);
  const manifest=fs.readFileSync(path.join(f.source,'.codex-plugin/plugin.json'));
  const rawDir=path.join(f.source,SKILL,'knowledge/raw'),raw=fs.readdirSync(rawDir);
  assert.equal(update(f.opts,{installer:f.installer}).status,'preview_refresh_required');
  const retry=update({...f.opts,apply:true},{installer:f.installer});assert.equal(retry.status,'installed_and_verified');assert.equal(retry.published,false);assert.deepEqual(fs.readdirSync(rawDir),raw);assert.deepEqual(fs.readFileSync(path.join(f.source,'.codex-plugin/plugin.json')),manifest);
});
test('record cannot supply write paths or executable/sensitive content',t=>{
  const f=fixture(t);f.r.outputPath='../../arbitrary.cjs';f.bind();assert.throws(()=>update({...f.opts,apply:true},{installer:f.installer}),/SCHEMA_FIELD_REJECTED/);
  delete f.r.outputPath;f.r.observation='require("node:fs").writeFileSync("escape", "x")';f.bind();assert.throws(()=>update({...f.opts,apply:true},{installer:f.installer}),/EXECUTABLE_CONTENT_REJECTED/);
  f.r.observation='password: abcdef';f.bind();assert.throws(()=>update({...f.opts,apply:true},{installer:f.installer}),/SENSITIVE_CONTENT_REJECTED/);assert.equal(f.calls(),0);
});
test('evidence traversal and symbolic link escape reject',t=>{
  const f=fixture(t);f.r.evidence[0].path='../capture.txt';f.bind();assert.throws(()=>update({...f.opts,apply:true},{installer:f.installer}),/RELATIVE_PATH_REQUIRED/);
  f.r.evidence[0].path='link/capture.txt';f.bind();
  try{fs.symlinkSync(f.evidence,path.join(f.evidence,'link'),'junction');}catch(e){if(e.code==='EPERM'){t.diagnostic('Junction unavailable; traversal rejection still verified.');return;}throw e;}
  assert.throws(()=>update({...f.opts,apply:true},{installer:f.installer}),/SYMLINK_REJECTED/);
});
test('review is record-bound and classification cannot be raised above supporting evidence',t=>{
  const f=fixture(t);f.r.classification='physically_verified';f.bind();assert.throws(()=>update({...f.opts,apply:true},{installer:f.installer}),/CLASSIFICATION_EVIDENCE_REQUIRED/);
  f.r.classification='observed';f.bind();const review=JSON.parse(fs.readFileSync(f.opts.review));review.recordSha256='a'.repeat(64);write(f.opts.review,review);assert.throws(()=>update({...f.opts,apply:true},{installer:f.installer}),/BOUND_VERIFIED_REVIEW_REQUIRED/);
});
test('installer response cannot bypass identity or cache index verification',t=>{
  const f=fixture(t);const result=update({...f.opts,apply:true},{installer:()=>{const info=f.installer();put(path.join(info.installedPath,'license.bin'),'tampered');return info;}});assert.equal(result.status,'needs_refresh');assert.equal(result.error,'CACHE_FILE_MISMATCH');
});
test('global source lock prevents simultaneous writers using different work roots',t=>{
  const f=fixture(t),real=fs.realpathSync(f.source),identity=process.platform==='win32'?real.toLowerCase():real;
  const lock=path.join(os.tmpdir(),'uv-learning-lock-'+sha(identity));fs.mkdirSync(lock);t.after(()=>{if(fs.existsSync(lock))fs.rmdirSync(lock);});
  assert.throws(()=>update({...f.opts,apply:true,workRoot:path.join(f.dir,'other-work')},{installer:f.installer}),/UPDATE_BUSY_OR_STALE_LOCK/);assert.equal(f.calls(),0);assert.equal(fs.existsSync(f.work),false);
});
test('source write failure rolls back byte for byte and does not install',t=>{
  const f=fixture(t),manifest=path.join(f.source,'.codex-plugin/plugin.json'),index=path.join(f.source,'maintenance/site-20260916/integrity.json');
  const beforeManifest=fs.readFileSync(manifest),beforeIndex=fs.readFileSync(index),rename=fs.renameSync;
  fs.renameSync=(from,to)=>{if(to===manifest)throw Error('fixture injected write failure');return rename(from,to);};
  try{assert.throws(()=>update({...f.opts,apply:true},{installer:f.installer}),/fixture injected write failure/);}finally{fs.renameSync=rename;}
  assert.deepEqual(fs.readFileSync(manifest),beforeManifest);assert.deepEqual(fs.readFileSync(index),beforeIndex);assert.equal(f.calls(),0);
  const raw=path.join(f.source,SKILL,'knowledge/raw');assert.equal(fs.existsSync(raw)?fs.readdirSync(raw).length:0,0);
});
test('a later source release does not republish or reinstall an existing conclusion',t=>{
  const f=fixture(t);update({...f.opts,apply:true},{installer:f.installer});
  const manifest=path.join(f.source,'.codex-plugin/plugin.json'),index=path.join(f.source,'maintenance/site-20260916/integrity.json');
  const m=JSON.parse(fs.readFileSync(manifest));m.version='0.1.0+later.maintenance';write(manifest,m);
  const i=JSON.parse(fs.readFileSync(index));i.version=m.version;i.files.find(x=>x.path==='.codex-plugin/plugin.json').sha256=sha(fs.readFileSync(manifest));write(index,i);
  const r=update({...f.opts,apply:true},{installer:f.installer});assert.equal(r.status,'no_changes');assert.equal(r.currentCacheVerified,false);assert.equal(f.calls(),1);assert.equal(r.version,m.version);
});
test('installation cache paths cannot be used as maintenance source',t=>{
  const f=fixture(t);
  assert.throws(()=>update({...f.opts,sourceRoot:path.join(f.dir,'plugins','cache',NAME,'version'),apply:true},{installer:f.installer}),/CACHE_IS_NOT_MAINTENANCE_SOURCE/);
  assert.equal(f.calls(),0);
});
test('Windows source/work separation is case insensitive',{skip:process.platform!=='win32'},t=>{
  const f=fixture(t);
  assert.throws(()=>update({...f.opts,workRoot:path.join(f.source.toUpperCase(),'nested-work'),apply:true},{installer:f.installer}),/WORK_MUST_BE_OUTSIDE_SOURCE/);
  assert.equal(f.calls(),0);
});
test('recursive fixture cleanup rejects an unrelated directory',t=>{
  const f=fixture(t),unrelated=path.join(f.dir,'unrelated');fs.mkdirSync(unrelated);put(path.join(unrelated,'keep.txt'),'keep');
  assert.throws(()=>cleanupFixture(unrelated),/Fixture cleanup must remain directly inside/);assert.equal(fs.readFileSync(path.join(unrelated,'keep.txt'),'utf8'),'keep');
});
