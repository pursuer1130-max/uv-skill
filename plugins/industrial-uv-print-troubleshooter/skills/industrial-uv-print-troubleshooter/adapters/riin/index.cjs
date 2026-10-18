'use strict';
const fs=require('node:fs');
const path=require('node:path');
const c=require('../../scripts/uv_core.cjs');
const h=require('../../scripts/uv_hybrid.cjs');
const {adapter}=require('../base.cjs');
async function state(registry) {
  const app=registry.registry.RIIN||{status:'unavailable'};
  const root=app.selected?.workingDirectory;
  const files=root?fs.readdirSync(root).filter(n=>/hot.?folder|help|\.ini$/i.test(n)).map(n=>path.join(root,n)):[];
  return {...app,interfacePriority:['official API','hot folder/file exchange','CLI/IPC','GUI'],evidenceFiles:files,hotFolder:'unverified',license:'not_inspected'};
}
module.exports=adapter('RIIN',{
  stage:{level:'PRINT_JOB',validate:async args=>{
    await h.inspectFile(args.file);
    if(!args.hotFolder||!path.isAbsolute(args.hotFolder)||!fs.statSync(args.hotFolder).isDirectory())throw Error('HOT_FOLDER_REQUIRED');
    if(!args.evidence?.source||args.evidence.verified!==true||!args.evidence.outputMode||!args.parameters)throw Error('RIIN_CONFIG_EVIDENCE_REQUIRED');
    if(c.fileHash(args.file)!==args.sha256)throw Error('INPUT_CHANGED');
  },execute:async(args,ctx)=>{
    const target=path.join(args.hotFolder,ctx.job.id+path.extname(args.file));
    const temp=path.join(args.hotFolder,'.'+ctx.job.id+'.partial');
    if(fs.existsSync(target))throw Error('RIIN_JOB_ALREADY_STAGED');
    if(args.evidence.ignoresPartial!==true)throw Error('HOT_FOLDER_PARTIAL_FILTER_UNVERIFIED');
    fs.copyFileSync(args.file,temp,fs.constants.COPYFILE_EXCL);
    if(c.fileHash(temp)!==args.sha256)throw Error('STAGING_HASH_MISMATCH');
    // A same-directory rename presents only the completed file to the watcher.
    fs.renameSync(temp,target);
    c.updateJob(ctx.dir,j=>{j.riin={input:target,inputHash:args.sha256,parameters:c.redact(args.parameters),evidence:args.evidence,status:'submitted_acceptance_unknown',expectedOutput:args.expectedOutput||null};});
    return {input:target,status:'submitted_acceptance_unknown',rip:'unverified'};
  }},
  collect:{level:'READ_ONLY',validate:async args=>{if(!args.file||!args.jobId)throw Error('RIP_OUTPUT_ID_REQUIRED');},execute:async(args,ctx)=>{
    const j=c.readJSON(path.join(ctx.dir,'job.json'));
    if(j.id!==args.jobId||!j.riin.expectedOutput||path.resolve(args.file)!==path.resolve(j.riin.expectedOutput))throw Error('RIP_OUTPUT_ASSOCIATION_UNVERIFIED');
    const a=await h.inspectFile(args.file);await new Promise(r=>setTimeout(r,300));const b=await h.inspectFile(args.file);
    if(a.sha256!==b.sha256||a.mtimeMs!==b.mtimeMs)throw Error('RIP_OUTPUT_STILL_WRITING');
    c.updateJob(ctx.dir,j=>{j.riin.output=b;j.riin.status='output_collected_format_unverified';});return b;
  },verification:'LOCAL_TEST'}
},state);
