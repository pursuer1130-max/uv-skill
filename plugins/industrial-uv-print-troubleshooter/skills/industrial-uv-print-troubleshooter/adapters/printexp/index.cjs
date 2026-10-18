'use strict';
const fs=require('node:fs');
const {adapter}=require('../base.cjs');
const c=require('../../scripts/uv_core.cjs');
const h=require('../../scripts/uv_hybrid.cjs');
function machineEvidence(args) {
  const e=args.evidence;
  if(!e||!e.protocol||!e.source||!e.printerModel||!e.boardModel||e.formatVerified!==true||e.preparedMachine!==true) throw Error('MACHINE_PROTOCOL_EVIDENCE_REQUIRED');
  if(!e.receiverIsPrintSoftware) throw Error('DIRECT_BOARD_TRANSPORT_FORBIDDEN');
}
async function validateSend(args) {
  machineEvidence(args);
  const info=await h.inspectFile(args.file);
  if(args.sha256!==info.sha256) throw Error('PAYLOAD_HASH_MISMATCH');
  if(!args.host || ['0.0.0.0','::'].includes(args.host)||!Number.isInteger(args.port)||args.port<1||args.port>65535) throw Error('RECEIVER_ADDRESS_REQUIRED');
  if(['TIFF','PSD','PNG','JPEG','BMP'].includes(info.kind)&&args.evidence.artworkReceiverVerified!==true) throw Error('RIP_PAYLOAD_REQUIRED');
}
async function state(registry) {
  const app=registry.registry.PrintExp||{status:'unavailable'};
  return {...app,listeners:(registry.listeners||[]).filter(x=>app.selected?.pids?.includes(x.OwningProcess)),board:registry.registry.PrinterBoard};
}
const guiActions=['pause','resume','cancel','clean'];
const actions={
  launch:{level:'PRINT_JOB',validate(args){if(!args.exe||!fs.existsSync(args.exe)||!args.evidence?.preparedMachine||args.evidence.queueReviewed!==true)throw Error('LAUNCH_QUEUE_CONTEXT_REQUIRED');},execute:async(args,ctx)=>{
    if(!ctx.gui?.launch)throw Error('GUI_PROVIDER_UNAVAILABLE');
    const selected=ctx.registry.registry.PrintExp?.selected;
    if(!selected||fs.realpathSync(args.exe)!==fs.realpathSync(selected.path))throw Error('LAUNCH_TARGET_MISMATCH');
    return ctx.gui.launch(args.exe);
  }},
  send:{level:'PRINT_JOB',validate:validateSend,execute:async (args,ctx)=>{
    const permit=c.issuePermit(ctx.request,ctx,{action:'send',file:fs.realpathSync(args.file),host:args.host,port:args.port,sha256:args.sha256});
    return h.send(args.file,{host:args.host,port:args.port,formatVerified:true,preparedMachine:true,permit},(stage,status,detail)=>c.log(ctx.dir,{jobId:ctx.job.id,software:'PrintExp',action:stage,status,...detail}));
  }},
  ini_preview:{level:'READ_ONLY',validate:args=>{if(!args.ini)throw Error('INI_REQUIRED');},execute:args=>h.configureIni(args.ini,false),verification:'LOCAL_TEST'},
  ini_apply:{level:'SOFTWARE_CONTROL',validate:args=>{if(!args.ini||!args.sha256||args.stopped!==true||args.noPendingJobs!==true)throw Error('INI_STOPPED_CONTEXT_REQUIRED');},execute:async(args,ctx)=>{
    const fresh=await c.discover();
    c.assertAppStopped(fresh,'PrintExp');
    if(c.fileHash(args.ini)!==args.sha256)throw Error('INI_CHANGED');
    const permit=c.issuePermit(ctx.request,ctx,{action:'ini',file:fs.realpathSync(args.ini)});
    return h.configureIni(args.ini,true,permit);
  }}
};
for(const action of guiActions) actions[action]={
  level:action==='clean'?'MACHINE_PARAMETER':'PRINT_JOB',
  validate(args) {
    if(!args.observation||!args.observation.window||!Number.isFinite(args.observation.elementIndex)||args.observation.disabled!==false||!args.observation.treeHash)throw Error('FRESH_ENABLED_GUI_OBSERVATION_REQUIRED');
    if(Date.now()-Date.parse(args.observation.timestamp)>300000||!Number.isFinite(Date.parse(args.observation.timestamp))||Date.parse(args.observation.timestamp)>Date.now()+1000)throw Error('GUI_OBSERVATION_STALE');
    if(action==='pause'&&args.jobState!=='running')throw Error('PAUSE_REQUIRES_RUNNING_JOB');
    if(action==='resume'&&args.jobState!=='paused')throw Error('RESUME_REQUIRES_PAUSED_JOB');
    if(!args.targetJob||!args.evidence?.preparedMachine)throw Error('GUI_TARGET_CONTEXT_REQUIRED');
    if(action==='clean'&&!args.evidence.maintenanceReady)throw Error('CLEAN_MAINTENANCE_CONTEXT_REQUIRED');
  },
  async execute(args,ctx) {
    if(!ctx.gui)throw Error('GUI_PROVIDER_UNAVAILABLE');
    const observation=args.observation;
    const before=await ctx.gui.read(observation.window);
    if(c.hash(before.tree)!==observation.treeHash)throw Error('GUI_STATE_CHANGED_REOBSERVE');
    await ctx.gui.click(observation.window,observation.elementIndex);
    const after=await ctx.gui.read(observation.window);
    return {status:'command_sent_result_requires_verification',before,after,physicalPrint:'unverified',autoRetry:false};
  }
};
module.exports=adapter('PrintExp',actions,state);
