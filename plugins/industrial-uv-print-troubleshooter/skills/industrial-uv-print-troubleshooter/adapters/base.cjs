'use strict';
const path=require('node:path');
const fs=require('node:fs');
const c=require('../scripts/uv_core.cjs');
function adapter(name,actions,readState) {
  return {
    name,
    detect(registry){return registry.registry[name]||{status:'unavailable'};},
    capabilities(){return Object.entries(actions).map(([action,spec])=>({action,level:spec.level,verification:spec.verification||'REQUIRES_REAL_MACHINE_TEST'}));},
    async read_state(registry,ctx={}){return readState?readState(registry,ctx):this.detect(registry);},
    async validate(action,args,ctx){
      if(!Object.hasOwn(actions,action)) throw Error('ACTION_UNSUPPORTED: '+name+'.'+action);
      if(actions[action].validate) await actions[action].validate(args,ctx);
      return {valid:true};
    },
    async execute_safe_action(action,args,ctx){
      await this.validate(action,args,ctx);
      const request={adapter:name,action,level:actions[action].level,args};
      const before=await this.read_state(ctx.registry,ctx);
      let started=false;
      try {
        const decision=c.authorize(request,ctx);
        c.log(ctx.dir,{jobId:ctx.job.id,software:name,version:before.selected?.version||null,action,before,after:null,status:'authorized',humanConfirmed:!!ctx.confirmation,requestHash:c.hash(JSON.stringify(request))});
        if(decision.simulated) {
          const result={status:'simulated',request,physicalPrint:false};
          c.log(ctx.dir,{jobId:ctx.job.id,software:name,action,before,after:before,status:'simulated',humanConfirmed:false});
          return result;
        }
        if(ctx.confirmation) {
          if(!ctx.approvalFile) throw Error('APPROVAL_RECEIPT_REQUIRED');
          fs.writeFileSync(ctx.approvalFile+'.used',c.now(),{flag:'wx'});
        }
        started=true;
        const result=await actions[action].execute(args,{...ctx,request});
        const after=await this.read_state(ctx.registry,ctx);
        c.log(ctx.dir,{jobId:ctx.job.id,software:name,version:before.selected?.version||null,action,before,after,status:'success',result,humanConfirmed:!!ctx.confirmation});
        return result;
      } catch(error) {
        c.log(ctx.dir,{jobId:ctx.job.id,software:name,action,before,after:null,status:started?'unknown':'blocked',error:error.message,humanConfirmed:!!ctx.confirmation});
        throw error;
      }
    },
    collect_result(dir){return c.readJSON(path.join(dir,'job.json')).result;},
    handle_error(error){return {status:'failed',error:error.message,retry:'Read output and application state before retry; no automatic UI replay'};}
  };
}
module.exports={adapter};
