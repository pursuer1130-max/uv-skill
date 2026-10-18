'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const c=require('./uv_core.cjs');
const h=require('./uv_hybrid.cjs');
async function connect(root){
  fs.mkdirSync(root,{recursive:true});
  const dir=c.confined(root,'CONNECT-'+crypto.randomUUID());fs.mkdirSync(dir);
  let authorization;
  try{authorization=h.license(path.resolve(__dirname,'..'));}
  catch(e){
    const request={plugin:'industrial-uv-print-troubleshooter',device_id:h.deviceId(),requestedAt:c.now(),error:e.message,action:'Issuer supplies a signed license/devices/<device_id>.json matching the existing public key; no private key on a factory computer.'};
    c.writeJSON(path.join(dir,'license-request.json'),request);
    return {status:'license_required',dir,requestFile:path.join(dir,'license-request.json'),autoLaunch:false,productionReady:false};
  }
  const registry=await c.discover(),file=path.join(dir,'capabilities.json');c.writeJSON(file,registry);
  let startup;
  try{const r=await c.runFile('powershell.exe',['-NoProfile','-File',path.join(__dirname,'uv_startup_probe.ps1'),'-RegistryFile',file],{windowsHide:true,timeout:30000,maxBuffer:1024*1024});startup=JSON.parse(r.stdout.replace(/^\uFEFF/,''));}
  catch(e){startup={status:'probe_failed',error:c.redact(e.message)};}
  const index=path.resolve(__dirname,'../assets/riin-driver-candidates/index.json');
  const candidates=fs.existsSync(index)?c.readJSON(index):{packages:[],note:'No packaged candidates; request matching vendor DPF and curve'};
  const report={timestamp:c.now(),status:'checks_complete_not_connected',dir,authorization,registry,startup,driverCandidates:candidates,autoLaunch:false,autoImportDrivers:false,guiConnected:false,productionReady:false,next:'Read startup statuses. Select an actual returned GUI window after operator-handled elevation. Do not import a driver by filename alone. Run uv_rehearse.cjs for offline file tests.'};
  c.writeJSON(path.join(dir,'connect.json'),report);
  return {status:report.status,dir,apps:startup.apps?Object.fromEntries(Object.entries(startup.apps).map(([k,v])=>[k,v.status])):startup,driverCandidates:candidates.packages?.length||0,guiConnected:false,productionReady:false};
}
if(require.main===module){
  const args=process.argv.slice(2);
  if(args.length&&!(args.length===2&&args[0]==='--root'))throw Error('Usage: node uv_connect.cjs [--root LOCAL_OUTPUT]');
  connect(path.resolve(args[1]||path.join(os.tmpdir(),'UV-Skill-Connect'))).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(JSON.stringify({status:'blocked',error:e.message}));process.exitCode=1;});
}
module.exports={connect};
