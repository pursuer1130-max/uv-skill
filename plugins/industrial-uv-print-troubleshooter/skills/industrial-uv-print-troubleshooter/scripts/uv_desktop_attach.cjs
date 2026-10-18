'use strict';
const path=require('node:path');
async function attach(sky,options){
  const {application,exe,appId}=options;
  if(!['RIIN','IKapCViewer'].includes(application))throw Error('USE_EXISTING_APP_GATEWAY');
  if(!path.win32.isAbsolute(exe)||path.win32.basename(exe).toLowerCase()!==(application+'.exe').toLowerCase())throw Error('APP_PATH_MISMATCH');
  const apps=await sky.list_apps();
  const entries=apps.filter(a=>a.id===appId);
  if(entries.length!==1||!appId.toLowerCase().endsWith('\\'+application.toLowerCase()+'.exe'))throw Error('OBSERVED_APP_ENTRY_REQUIRED');
  function select(windows){
    const candidates=windows.filter(w=>w.app===appId||w.app.toLowerCase()===('process:'+exe).toLowerCase());
    if(candidates.length>1)throw Error('WINDOW_SELECTION_REQUIRED');
    return candidates[0]||null;
  }
  let window=select(await sky.list_windows());
  if(window)return {status:'window_found',window,reused:true,launchAttempts:0,productionReady:false};
  if(options.launch!==true)return {status:'not_running_or_not_visible',launchAttempts:0,productionReady:false};
  if(options.launchAuthorized!==true||options.startupReviewed!==true||options.customerProducing!==false)throw Error('LAUNCH_CONTEXT_REQUIRED');
  let launchError=null;
  try{await sky.launch_app({app:entries[0].id});}
  catch(e){
    if(/turn.*ended|user.*stop|budget.*exhaust/i.test(e.message))throw e;
    launchError=e.message;
  }
  // A launcher can report no window while the real app appears under a process-backed ID.
  window=select(await sky.list_windows());
  return {status:window?'window_found':'pending_operator_or_startup',window,launchAttempts:1,launchError,autoRetry:false,productionReady:false};
}
module.exports={attach};
