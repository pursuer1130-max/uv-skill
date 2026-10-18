'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const c=require('./uv_core.cjs');
const h=require('./uv_hybrid.cjs');
const m=require('./uv_master.cjs');
const simulate=require('./uv_simulate.cjs');
const peScan=require('./uv_printexp_scan.cjs');
async function rehearse(root,options={}){
  const mockPort=options.mockPort??9100;
  if(!Number.isInteger(mockPort)||mockPort<0||mockPort>65535)throw Error('MOCK_PORT_INVALID');
  const license=h.license(path.resolve(__dirname,'..'));
  if(license.code!=='LICENSE_OK')throw Error(license.code);
  const authorization={validHere:true,deviceBound:license.deviceBound,expiresAt:license.expiresAt,newComputer:'select a valid signed device license or obtain one from the issuer; never patch the check'};
  const registry=await c.discover();
  const pe=registry.registry.PrintExp;
  const inspection=pe.status==='available'?peScan.inspect(pe.selected.path).report:null;
  if(inspection)peScan.assertUnwatched(root,inspection);
  if(options.spotWhiteName && !inspection?.whiteCandidates.some(x=>x.name===options.spotWhiteName))throw Error('SPOT_NAME_NOT_IN_OBSERVED_CONFIG');
  fs.mkdirSync(root,{recursive:true});
  const {dir,job}=c.createJob(root,{mode:'SIMULATION_MODE'});
  if(inspection)c.writeJSON(path.join(dir,'printexp-inspection.json'),inspection);
  c.writeJSON(path.join(dir,'capabilities.json'),registry);
  const steps={};
  async function step(name,fn){
    try{steps[name]=await fn();}
    catch(e){steps[name]={status:'blocked',error:c.redact(e.message),autoRetry:false};}
    c.log(dir,{jobId:job.id,action:name,...steps[name]});
  }
  async function action(adapter,action,args,mode='SIMULATION_MODE'){
    const p=await m.plan(dir,{adapter,action,args},mode,registry);
    return m.execute(p.file,{registry});
  }
  await step('Photoshop',async()=>{
    if(registry.registry.Photoshop.status!=='available')throw Error('PS_UNAVAILABLE_OR_SELECTION_REQUIRED');
    const result=await action('Photoshop','prepress',{demo:true,dpi:72,white:true,varnish:!options.spotWhiteName,...(options.spotWhiteName?{spotWhiteName:options.spotWhiteName}:{})});
    return {status:'executed',scope:'real Photoshop creation and export/reopen verification',result};
  });
  const artwork=path.join(dir,'artwork','artwork.tif');
  const exported=steps.Photoshop.status==='executed';
  await step('RIIN',async()=>{
    const observed=await m.adapters.RIIN.read_state(registry);
    if(!exported)throw Error('PS_EXPORT_REQUIRED');
    const input=path.join(dir,'unwatched-rip-fixture');fs.mkdirSync(input);
    const result=await action('RIIN','stage',{file:artwork,sha256:c.fileHash(artwork),hotFolder:input,parameters:{purpose:'simulation only'},evidence:{source:'Owned empty simulation folder; NOT a configured RIIN watcher',verified:true,outputMode:'simulation only',ignoresPartial:false}});
    if(fs.readdirSync(input).length)throw Error('SIMULATION_WROTE_WATCHER');
    return {status:'simulated',scope:'adapter validation only; no RIIN RIP executed',observed,result,realRip:false,prnCreated:false};
  });
  await step('PrintExpConfig',async()=>{
    const app=registry.registry.PrintExp;
    if(app.status!=='available')throw Error('PRINTEXP_UNAVAILABLE_OR_SELECTION_REQUIRED');
    const names=fs.readdirSync(app.selected.workingDirectory).filter(n=>n.toLowerCase()==='project.ini');
    if(names.length!==1)throw Error('PROJECT_INI_NOT_UNIQUE');
    const ini=path.join(app.selected.workingDirectory,names[0]),before=c.fileHash(ini);
    const result=await action('PrintExp','ini_preview',{ini},'OBSERVE_MODE');
    if(c.fileHash(ini)!==before)throw Error('INI_UNEXPECTED_CHANGE');
    return {status:'observed',scope:'read-only; installed configuration unchanged',sha256:before,result};
  });
  await step('PrintExpTransport',async()=>{
    if(!exported)throw Error('PS_EXPORT_REQUIRED');
    const result=await simulate(dir,artwork,mockPort);
    return {status:'executed',scope:'owned 127.0.0.1:'+result.port+' mock only; not PrintExp acceptance',listenerClosed:true,result};
  });
  await step('IKapCViewer',async()=>{
    if(!exported)throw Error('PS_EXPORT_REQUIRED');
    const observed=await m.adapters.IKapCViewer.read_state(registry);
    const result=await action('IKapCViewer','read_capture',{file:path.join(dir,'artwork','preview.png'),source:'Synthetic Photoshop reference image, NOT an IKap camera capture'},'OBSERVE_MODE');
    return {status:'fixture_only',scope:'image handoff/hash reading only; IKap GUI and camera not operated',observed,result,realCapture:false};
  });
  const factoryChecks=[
    'Verify the Skill authorization on the factory computer; this installation may be device-bound. Obtain legitimate authorization when the device differs.',
    'Rediscover all app paths and check callable desktop tools; observe only while customer production is running.',
    'Verify RIIN activation and matching printer DPF, head/ink/channel order, curve and ICC. Export a PRN to an unwatched local directory and inspect separations.',
    'Verify white/varnish names, spot versus alpha type and mask polarity. Demo RGB/profile and 72 PPI artwork are NOT production calibration.',
    'Inspect the actual PrintExp queue and board. Configure 0.0.0.0:9100 only through the existing stopped/no-pending-jobs gateway; verify the listener executable and parent chain, including a documented NWReceive helper when applicable.',
    'Verify exact PRN compatibility and prepared test material. Obtain an operator-confirmed job plan before sending; inspect queue after any ambiguous transfer.',
    'Verify camera model, real capture, pixel-to-mm calibration and coordinate transform. A saved reference image is not inspection or positioning evidence.',
    'Inspect and approve the physical first article before production; validate pause/resume/cancel and cleaning separately under appropriate machine conditions.'
  ];
  const report={schemaVersion:1,jobId:job.id,jobDir:dir,mode:'SIMULATION_MODE',timestamp:c.now(),authorization,steps,requestedMockPort:mockPort,spotWhiteName:options.spotWhiteName||null,productionReady:false,realRip:false,physicalPrint:false,realCameraCapture:false,autoSubmit:false,factoryChecks};
  c.writeJSON(path.join(dir,'rehearsal.json'),report);
  c.updateJob(dir,j=>{j.mode='SIMULATION_MODE';j.status=Object.values(steps).some(s=>s.status==='blocked')?'unknown':'success';j.result={scope:'offline rehearsal only',report:path.join(dir,'rehearsal.json'),productionReady:false,physicalPrint:false};});
  return report;
}
function parseArgs(args){
  const values={};
  for(let i=0;i<args.length;i+=2){
    const key=args[i],value=args[i+1];
    if(!['--root','--mock-port','--spot-white-name'].includes(key)||Object.hasOwn(values,key)||!value||value.startsWith('--'))throw Error('REHEARSAL_ARGUMENT_INVALID');
    values[key]=value;
  }
  if(values['--mock-port']!==undefined&&!/^\d+$/.test(values['--mock-port']))throw Error('MOCK_PORT_INVALID');
  const mockPort=values['--mock-port']===undefined?9100:Number(values['--mock-port']);
  if(mockPort>65535)throw Error('MOCK_PORT_INVALID');
  return {root:path.resolve(values['--root']||path.join(os.tmpdir(),'UV-Skill-Rehearsal')),options:{mockPort,spotWhiteName:values['--spot-white-name']}};
}
if(require.main===module){
  const {root,options}=parseArgs(process.argv.slice(2));
  rehearse(root,options).then(r=>console.log(JSON.stringify({jobDir:r.jobDir,steps:Object.fromEntries(Object.entries(r.steps).map(([k,v])=>[k,{status:v.status,error:v.error}])),mockPort:r.steps.PrintExpTransport.result?.port,productionReady:false}))).catch(e=>{console.error(JSON.stringify({status:'blocked',error:e.message}));process.exitCode=1;});
}
module.exports={rehearse,parseArgs};
