'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function result(runtime,id){try{return JSON.parse(await fs.readFile(path.join(runtime,'runs',id,'result.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
// Call only after successful preparation. The caller supplies a fresh, uniquely returned Sky window.
async function dispatch(sky,{runtime,id,window,timeoutMs=20000,pollMs=100}){
 if(!/^[a-f0-9]{32}$/.test(id)||!path.isAbsolute(runtime)||!window?.app||!Number.isInteger(window.id)||timeoutMs<100||timeoutMs>45000||pollMs<10||pollMs>1000)throw Error('DISPATCH_ARGUMENTS_INVALID');
 const old=await result(runtime,id);if(old)return {status:'already_finished_no_relaunch',result:old};
 try{await fs.access(path.join(runtime,'runs',id,'started.json'));return {status:'already_started_no_relaunch',automaticRetry:false};}catch(e){if(e.code!=='ENOENT')throw e;}
 const c=JSON.parse(await fs.readFile(path.join(runtime,'command.json'),'utf8')),age=Date.now()-Date.parse(c.createdAt);
 if(c.id!==id||!Number.isFinite(age)||age<0||age>120000)throw Error('EXACT_FRESH_PREPARED_COMMAND_REQUIRED');
 // Identity/foreground/idle/image guards remain in the native adapter. No shell launch or inferred window handles.
 let launchError=null;try{await sky.launch_app({app:path.join(runtime,'UVMenuCompat.exe')});}catch(e){if(/turn.*ended|user.*stop|budget.*exhaust/i.test(e.message))throw e;launchError=String(e.message);}
 await sky.activate_window({window});const end=Date.now()+timeoutMs;
 while(Date.now()<end){const r=await result(runtime,id);if(r)return {status:'finished',result:r,launchError};await sleep(pollMs);}
 return {status:'outcome_pending_inspect_same_id',id,launchError,automaticRetry:false};
}
module.exports={dispatch};
