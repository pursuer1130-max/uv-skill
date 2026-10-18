'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const c=require('./uv_core.cjs');
const adapters={Photoshop:require('../adapters/photoshop/index.cjs'),PrintExp:require('../adapters/printexp/index.cjs'),RIIN:require('../adapters/riin/index.cjs'),IKapCViewer:require('../adapters/ikap/index.cjs'),PrinterBoard:require('../adapters/printer_board/index.cjs')};
async function plan(dir,request,mode='OBSERVE_MODE',registry) {
  const job=c.validateJob(c.readJSON(path.join(dir,'job.json'))), adapter=adapters[request.adapter];
  if(!adapter)throw Error('ADAPTER_UNKNOWN');
  if(!c.MODES.includes(mode))throw Error('MODE_UNKNOWN');
  const cap=adapter.capabilities().find(x=>x.action===request.action);
  if(!cap)throw Error('ACTION_UNKNOWN');
  if(mode==='OBSERVE_MODE'&&cap.level!=='READ_ONLY')throw Error('GATE_OBSERVE_READ_ONLY');
  const normalized={adapter:request.adapter,action:request.action,level:cap.level,args:request.args||{}};
  const reg=registry||await c.discover();
  await adapter.validate(request.action,normalized.args,{job,dir,registry:reg,mode});
  const before=await adapter.read_state(reg,{job,dir,mode});
  const data={id:crypto.randomUUID(),jobId:job.id,computer:os.hostname(),createdAt:c.now(),expiresAt:new Date(Date.now()+15*60000).toISOString(),mode,request:normalized,requestHash:c.hash(JSON.stringify(normalized)),before,stages:['Detect','Read','Validate','Simulate'],simulation:{networkWrites:0,uiActions:0,hardwareWrites:0,effect:cap.level},confirmationRequired:mode==='PRODUCTION_MODE'&&['PRINT_JOB','MACHINE_PARAMETER'].includes(cap.level)};
  const file=c.confined(dir,'plans/'+data.id+'.json');c.writeJSON(file,data);
  c.log(dir,{jobId:job.id,software:request.adapter,version:before.selected?.version||null,action:'plan',before,after:before,status:'validated',humanConfirmed:false});
  return {file,plan:data};
}
function confirm(file,operator,statement) {
  const p=c.readJSON(file);
  if(!operator||!statement||statement.length<8)throw Error('HUMAN_OPERATOR_AND_EXPLICIT_STATEMENT_REQUIRED');
  if(!p.confirmationRequired||p.computer!==os.hostname()||Date.parse(p.expiresAt)<Date.now())throw Error('PLAN_NOT_CONFIRMABLE');
  const approval={planHash:c.fileHash(file),requestHash:p.requestHash,operator,statement,computer:os.hostname(),timestamp:c.now(),expiresAt:new Date(Date.now()+5*60000).toISOString()};
  const target=file+'.approval.json';c.writeJSON(target,approval);
  c.log(path.dirname(path.dirname(path.resolve(file))),{jobId:p.jobId,software:p.request.adapter,action:'Confirm',status:'recorded',humanConfirmed:true,operator,requestHash:p.requestHash});
  return target;
}
async function execute(file,options={}) {
  const p=c.readJSON(file),dir=path.dirname(path.dirname(path.resolve(file)));
  if(!c.MODES.includes(p.mode)||p.computer!==os.hostname()||Date.parse(p.expiresAt)<Date.now()||p.requestHash!==c.hash(JSON.stringify(p.request)))throw Error('PLAN_INVALID_OR_EXPIRED');
  const job=c.validateJob(c.readJSON(path.join(dir,'job.json')));
  if(job.id!==p.jobId)throw Error('JOB_PLAN_MISMATCH');
  const adapter=adapters[p.request.adapter];
  if(!adapter||adapter.capabilities().find(x=>x.action===p.request.action)?.level!==p.request.level)throw Error('PLAN_ACTION_TAMPERED');
  const reg=options.registry||await c.discover();
  let confirmation=null;
  if(p.confirmationRequired) {
    if(!options.approvalFile)throw Error('GATE_HUMAN_CONFIRMATION_REQUIRED');
    confirmation=c.readJSON(options.approvalFile);
    if(confirmation.planHash!==c.fileHash(file))throw Error('APPROVAL_PLAN_MISMATCH');
  }
  const args=p.request.args;
  const context={dir,job,mode:p.mode,registry:reg,copyOnly:p.request.adapter==='Photoshop',backupVerified:false,softwareControlAuthorized:args.softwareControlAuthorized===true,customerProducing:args.customerProducing===true,preparedMachine:args.evidence?.preparedMachine===true,confirmation,approvalFile:options.approvalFile,gui:options.gui};
  c.authorize(p.request,context);
  // An attempt is never replayed automatically, even if its result could not be saved.
  fs.writeFileSync(file+'.attempted',c.now(),{flag:'wx'});
  c.log(dir,{jobId:job.id,software:p.request.adapter,action:'Execute',status:'started',humanConfirmed:!!confirmation,requestHash:p.requestHash});
  try {
    const result=await adapter.execute_safe_action(p.request.action,args,context);
    c.updateJob(dir,j=>{j.mode=p.mode;j.status=result.status==='command_sent_result_requires_verification'?'unknown':'success';j.result=result;j.operatorConfirmation=confirmation?{operator:confirmation.operator,timestamp:confirmation.timestamp,requestHash:confirmation.requestHash}:null;});
    return result;
  } catch(error) {
    c.updateJob(dir,j=>{j.status='unknown';j.errors.push({timestamp:c.now(),error:c.redact(error.message),action:p.request.action});});
    throw error;
  }
}
function parse(argv) {
  const a={command:argv[0]||'help'};
  for(let i=1;i<argv.length;i++){if(!argv[i].startsWith('--'))throw Error('NAMED_ARGUMENT_REQUIRED');a[argv[i].slice(2)]=argv[i+1]&&!argv[i+1].startsWith('--')?argv[++i]:true;}return a;
}
async function main() {
  const a=parse(process.argv.slice(2));
  require('./uv_hybrid.cjs').license(path.resolve(__dirname,'..'));
  let result;
  if(a.command==='discover') {result=await c.discover();if(a.out)c.writeJSON(path.resolve(a.out),result);}
  else if(a.command==='job') {fs.mkdirSync(path.resolve(a.root),{recursive:true});result=c.createJob(path.resolve(a.root));}
  else if(a.command==='plan')result=await plan(path.resolve(a.job),c.readJSON(a.request),a.mode||'OBSERVE_MODE');
  else if(a.command==='confirm')result={approval:confirm(a.plan,a.operator,a.statement)};
  else if(a.command==='execute')result=await execute(path.resolve(a.plan),{approvalFile:a.approval});
  else if(a.command==='simulate')result=await require('./uv_simulate.cjs')(path.resolve(a.job),path.resolve(a.file));
  else if(a.command==='diagnose')result=c.diagnose(a.category,a.evidence?c.readJSON(a.evidence):[]);
  else if(a.command==='learn') {if(!a['knowledge-root'])throw Error('EXPLICIT_USB_KNOWLEDGE_ROOT_REQUIRED');result={rawFile:c.learn(path.resolve(a['knowledge-root']),c.readJSON(a.record))};}
  else if(a.command==='promote') {if(!a['knowledge-root'])throw Error('EXPLICIT_USB_KNOWLEDGE_ROOT_REQUIRED');result=c.promote(path.resolve(a['knowledge-root']),a.id,c.readJSON(a.review));}
  else if(a.command==='capabilities')result=Object.fromEntries(Object.entries(adapters).map(([k,v])=>[k,v.capabilities()]));
  else result={commands:['discover [--out FILE]','job --root LOCAL_OUTPUT','plan --job DIR --request JSON [--mode OBSERVE_MODE|SIMULATION_MODE|PRODUCTION_MODE]','confirm --plan FILE --operator NAME --statement EXACT_HUMAN_AUTHORIZATION','execute --plan FILE [--approval FILE]','simulate --job DIR --file FILE','diagnose --category CODE [--evidence JSON]','learn --record JSON --knowledge-root USB_PATH','promote --id ID --review JSON --knowledge-root USB_PATH','capabilities'],defaultMode:'OBSERVE_MODE'};
  console.log(JSON.stringify(result));
}
if(require.main===module)main().catch(e=>{console.error(JSON.stringify({status:'blocked',error:e.message}));process.exitCode=1;});
module.exports={adapters,plan,confirm,execute};
