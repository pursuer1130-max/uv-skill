'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const runFile = promisify(execFile);
const MODES = ['OBSERVE_MODE', 'SIMULATION_MODE', 'PRODUCTION_MODE'];
const CLASSES = ['READ_ONLY','FILE_CHANGE','SOFTWARE_CONTROL','PRINT_JOB','MACHINE_PARAMETER','FIRMWARE','BOARD_WRITE'];
const now = () => new Date().toISOString();
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const fileHash = file => hash(fs.readFileSync(file));
const readJSON = file => JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
function writeJSON(file, data, overwrite=false) {
  fs.mkdirSync(path.dirname(file), {recursive:true});
  if (!overwrite) return fs.writeFileSync(file, JSON.stringify(data,null,2)+'\n', {flag:'wx'});
  const tmp = file+'.'+crypto.randomUUID()+'.tmp';
  try { fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{flag:'wx'}); fs.renameSync(tmp,file); }
  finally { if(fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}
function confined(root, relative) {
  const base=path.resolve(root), target=path.resolve(base,relative);
  if(target!==base && !target.startsWith(base+path.sep)) throw Error('PATH_ESCAPE');
  let cursor=target;
  while(cursor!==path.dirname(cursor)) {
    if(fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) throw Error('LINK_PATH_REJECTED');
    cursor=path.dirname(cursor);
  }
  return target;
}
function redact(value) {
  if(Array.isArray(value)) return value.map(redact);
  if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,/password|secret|token|api.?key|license|credential|signature/i.test(k)?'[REDACTED]':redact(v)]));
  if(typeof value==='string') return value.replace(/((?:password|secret|token|api[_-]?key|authorization)\s*[:=]\s*)[^\s,;]+/gi,'$1[REDACTED]').replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]').slice(0,16000);
  return value;
}
function validateJob(job) {
  const required=['id','mode','originalImage','processedImage','dimensions','dpi','material','colorMode','whiteInk','varnish','photoshop','riin','printexp','machine','vision','operatorConfirmation','status','errors','result','createdAt','updatedAt'];
  if(!job || required.some(k=>!Object.hasOwn(job,k))) throw Error('JOB_SCHEMA_MISSING_FIELD');
  if(!/^UV-[A-Za-z0-9-]+$/.test(job.id)||!MODES.includes(job.mode)) throw Error('JOB_SCHEMA_INVALID');
  if(job.dpi!==null && !(Number.isFinite(job.dpi)&&job.dpi>0)) throw Error('JOB_DPI_INVALID');
  if(!Array.isArray(job.errors)||!Array.isArray(job.photoshop.operations)) throw Error('JOB_SCHEMA_INVALID');
  if(!['pending','running','success','failed','unknown'].includes(job.status)) throw Error('JOB_STATUS_INVALID');
  return job;
}
function createJob(root, data={}) {
  const job={schemaVersion:1,id:'UV-'+crypto.randomUUID(),mode:'OBSERVE_MODE',originalImage:null,processedImage:null,dimensions:null,dpi:null,material:null,colorMode:null,whiteInk:{mapping:'unverified'},varnish:{mapping:'unverified'},photoshop:{operations:[]},riin:{},printexp:{},machine:{printerModel:null,boardModel:null},vision:{status:'unknown'},operatorConfirmation:null,status:'pending',errors:[],result:null,createdAt:now(),updatedAt:now(),...data};
  validateJob(job); const dir=confined(root,job.id); fs.mkdirSync(dir); writeJSON(path.join(dir,'job.json'),job); return {dir,job};
}
function updateJob(dir, mutate) {
  const file=path.join(dir,'job.json'), job=validateJob(readJSON(file));
  mutate(job); job.updatedAt=now(); validateJob(job);
  const backup=file+'.'+crypto.randomUUID()+'.bak'; fs.copyFileSync(file,backup,fs.constants.COPYFILE_EXCL);
  writeJSON(file,job,true); return job;
}
function log(dir,event) {
  fs.mkdirSync(dir,{recursive:true});
  fs.appendFileSync(path.join(dir,'events.jsonl'),JSON.stringify(redact({timestamp:now(),computer:os.hostname(),...event}))+'\n');
}
async function discover() {
  if(process.platform!=='win32') return {timestamp:now(),computer:os.hostname(),registry:Object.fromEntries(['Photoshop','PrintExp','RIIN','IKapCViewer','PrinterBoard'].map(n=>[n,{status:n==='PrinterBoard'?'unknown':'unavailable'}])),warnings:['WINDOWS_REQUIRED']};
  const {stdout}=await runFile('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'uv_discover.ps1')],{windowsHide:true,timeout:60000,maxBuffer:4*1024*1024});
  return JSON.parse(stdout.replace(/^\uFEFF/,''));
}
function assertAppStopped(registry,name) {
  const app=registry.registry[name];
  if(!app||app.runningState==='unknown'||(registry.unresolvedProcesses||[]).some(p=>p.software===name))throw Error('APP_RUNNING_STATE_UNKNOWN');
  if(app.runningState==='running'||app.selected?.running||(app.candidates||[]).some(p=>p.running))throw Error('APP_STILL_RUNNING');
  return true;
}
function authorize(request,ctx={}) {
  const mode=ctx.mode||'OBSERVE_MODE', level=request.level;
  if(!MODES.includes(mode)||!CLASSES.includes(level)) throw Error('GATE_INVALID_MODE_OR_ACTION');
  if(['FIRMWARE','BOARD_WRITE'].includes(level)) throw Error('GATE_DEFAULT_DENY');
  if(level==='READ_ONLY') return {allowed:true,simulated:false};
  // Site policy: physical actions are performed only by a qualified operator in vendor software.
  if(mode!=='SIMULATION_MODE' && (['PRINT_JOB','MACHINE_PARAMETER'].includes(level) || request.adapter==='PrintExp')) throw Error('SITE_OPERATOR_NATIVE_SOFTWARE_ONLY');
  if(mode==='OBSERVE_MODE') throw Error('GATE_OBSERVE_READ_ONLY');
  if(ctx.customerProducing && level!=='FILE_CHANGE') throw Error('GATE_PRODUCTION_OBSERVATION_ONLY');
  if(level==='FILE_CHANGE' && !ctx.copyOnly && !ctx.backupVerified) throw Error('GATE_BACKUP_REQUIRED');
  if(['PRINT_JOB','MACHINE_PARAMETER'].includes(level)) {
    if(mode==='SIMULATION_MODE') return {allowed:true,simulated:true};
    if(!ctx.confirmation || ctx.confirmation.requestHash!==hash(JSON.stringify(request)) || ctx.confirmation.computer!==os.hostname() || !ctx.confirmation.operator || !ctx.confirmation.statement || !Number.isFinite(Date.parse(ctx.confirmation.expiresAt)) || Date.parse(ctx.confirmation.expiresAt)<Date.now()) throw Error('GATE_HUMAN_CONFIRMATION_REQUIRED');
    if(!ctx.preparedMachine) throw Error('GATE_PREPARED_MACHINE_REQUIRED');
  }
  if(level==='SOFTWARE_CONTROL' && mode==='SIMULATION_MODE')return {allowed:true,simulated:true};
  if(level==='SOFTWARE_CONTROL' && !ctx.softwareControlAuthorized) throw Error('GATE_SOFTWARE_CONTROL_CONTEXT_REQUIRED');
  return {allowed:true,simulated:false};
}
// In-process, scope-bound permits keep legacy transports inside the same gateway.
const permits=new WeakMap();
function issuePermit(request,ctx,scope) {
  if((scope.action==='send'&&request.level!=='PRINT_JOB')||(scope.action==='ini'&&request.level!=='SOFTWARE_CONTROL'))throw Error('GATE_SCOPE_CLASS_MISMATCH');
  if(ctx.mode!=='SIMULATION_MODE')throw Error('SITE_OPERATOR_NATIVE_SOFTWARE_ONLY');
  const decision=authorize(request,ctx);
  if(decision.simulated) {
    const address=scope.mockServer?.address();
    if(!(scope.mockServer instanceof require('node:net').Server)||!address||address.address!=='127.0.0.1'||address.port!==scope.port||scope.host!=='127.0.0.1')throw Error('GATE_SIMULATION_NO_LIVE_TRANSPORT');
  }
  const permit={}; permits.set(permit,{...scope,expires:Date.now()+60000}); return permit;
}
function checkPermit(permit,scope) {
  const saved=permits.get(permit);
  if(!saved||saved.expires<Date.now()||Object.entries(scope).some(([k,v])=>saved[k]!==v)) throw Error('SAFETY_GATEWAY_REQUIRED');
  permits.delete(permit);
}
function diagnose(category,evidence=[]) {
  const catalog=readJSON(path.join(__dirname,'../knowledge/errors/catalog.json'));
  const entry=catalog.find(x=>x.category===category);
  if(!entry) throw Error('UNKNOWN_DIAGNOSIS_CATEGORY');
  return {category,confirmedCauses:evidence.filter(x=>x.level==='confirmed'&&x.source&&x.verification).map(redact),probableCauses:evidence.filter(x=>x.level==='probable'&&x.source).map(redact),pendingCauses:entry.causes,nextReadOnlyCheck:entry.check};
}
function learn(root,record) {
  if(!record.source||!record.observation||!record.scope) throw Error('KNOWLEDGE_SOURCE_REQUIRED');
  const data=redact({...record,id:crypto.randomUUID(),timestamp:now(),validation:'raw'});
  const file=confined(root,'raw/'+data.id+'.json');writeJSON(file,data);return file;
}
function promote(root,id,review) {
  if(!/^[a-f0-9-]{36}$/.test(id)) throw Error('KNOWLEDGE_ID_INVALID');
  if(!review.operator||!review.reason||!review.evidence) throw Error('KNOWLEDGE_REVIEW_REQUIRED');
  const data=readJSON(confined(root,'raw/'+id+'.json'));
  const result={...data,validation:'validated',review:redact({...review,timestamp:now()})};
  writeJSON(confined(root,'validated/'+id+'.json'),result); return result;
}
module.exports={now,hash,fileHash,readJSON,writeJSON,confined,redact,validateJob,createJob,updateJob,log,discover,assertAppStopped,authorize,issuePermit,checkPermit,diagnose,learn,promote,runFile,MODES};
