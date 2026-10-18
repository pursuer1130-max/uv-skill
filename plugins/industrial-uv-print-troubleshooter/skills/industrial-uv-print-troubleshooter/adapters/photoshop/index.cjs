'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {adapter}=require('../base.cjs');
const c=require('../../scripts/uv_core.cjs');
async function validate(args) {
  if(args.input && (!path.isAbsolute(args.input)||!fs.statSync(args.input).isFile())) throw Error('PS_INPUT_REQUIRED');
  if(!args.input && args.demo!==true) throw Error('PS_INPUT_OR_DEMO_REQUIRED');
  if(args.dpi!==undefined && !(args.dpi>0&&args.dpi<=2400)) throw Error('PS_DPI_INVALID');
  if(args.colorMode && !['RGB','CMYK'].includes(args.colorMode)) throw Error('PS_MODE_INVALID');
  if(args.colorMode==='CMYK' && !args.profile) throw Error('PS_EXPLICIT_PROFILE_REQUIRED');
  if(args.spotWhiteName!==undefined && (args.demo!==true||args.white!==true||typeof args.spotWhiteName!=='string'||!args.spotWhiteName.trim()||args.spotWhiteName.length>64||/[\x00-\x1f\x7f]/.test(args.spotWhiteName))) throw Error('PS_SPOT_WHITE_DEMO_NAME_INVALID');
  if(args.spotWhiteName && (args.resize||args.canvas)) throw Error('PS_SPOT_DEMO_FIXED_GEOMETRY');
  for(const key of ['resize','canvas']) if(args[key] && (!Array.isArray(args[key])||args[key].length!==2||args[key].some(x=>!Number.isFinite(x)||x<=0))) throw Error('PS_DIMENSION_INVALID');
}
async function execute(args,ctx) {
  const config={...args,outputDir:c.confined(ctx.dir,'artwork'),metadataFile:c.confined(ctx.dir,'photoshop-result.json')};
  if(fs.existsSync(config.outputDir)||fs.existsSync(config.metadataFile)) throw Error('PS_OUTPUT_EXISTS_USE_NEW_JOB');
  const inputHash=args.input?c.fileHash(args.input):null;
  const script=c.confined(ctx.dir,'photoshop-run.jsx');
  const shared=path.resolve(__dirname,'../../scripts/uv_prepress.jsx').replace(/\\/g,'/');
  fs.writeFileSync(script,'#target photoshop\nvar UV_PREPRESS_CONFIG = '+JSON.stringify(config)+';\n$.evalFile(new File('+JSON.stringify(shared)+'));\n',{flag:'wx'});
  let invocation;
  try {
    invocation=await c.runFile('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve(__dirname,'../../scripts/photoshop_session.ps1'),'-Action','run','-BatchScript',script],{windowsHide:true,timeout:60000,maxBuffer:128*1024});
  } catch(error) {throw Error('PS_INVOCATION_UNCERTAIN: inspect '+config.metadataFile+' and Photoshop before retry. '+error.message);}
  if(args.input && c.fileHash(args.input)!==inputHash) throw Error('PS_SOURCE_CHANGED');
  const result=c.readJSON(config.metadataFile);
  if(!fs.existsSync(path.join(config.outputDir,'VERIFIED.txt'))) throw Error('PS_EXPORT_INCOMPLETE');
  c.updateJob(ctx.dir,j=>{j.originalImage=args.input||null;j.processedImage=path.join(config.outputDir,'artwork.tif');j.dimensions=result.dimensions;j.dpi=result.dpi;j.colorMode=result.colorMode;j.photoshop={version:result.version,operations:result.operations,sourceHash:inputHash,channels:result.channels};j.whiteInk={requested:!!args.white,mapping:'unverified'};j.varnish={requested:!!args.varnish,mapping:'unverified'};});
  return {...result,files:config.outputDir,invocation:invocation.stdout.trim()};
}
module.exports=adapter('Photoshop',{
  inspect:{level:'READ_ONLY',validate:args=>{if(!args.file) throw Error('FILE_REQUIRED');},execute:async args=>require('../../scripts/uv_hybrid.cjs').inspectFile(args.file),verification:'LOCAL_TEST'},
  prepress:{level:'FILE_CHANGE',validate,execute,verification:'LOCAL_TEST'}
});
