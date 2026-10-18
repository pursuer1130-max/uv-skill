'use strict';
const fs=require('node:fs');
const path=require('node:path');
const c=require('./uv_core.cjs');
function decode(bytes){
  if(bytes[0]===255&&bytes[1]===254)return bytes.subarray(2).toString('utf16le');
  try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
  catch{return new TextDecoder('gbk').decode(bytes);}
}
function parseIni(bytes){
  const rows=[];let section='';
  decode(bytes).replace(/^\uFEFF/,'').split(/\r?\n/).forEach((line,i)=>{
    const t=line.trim();if(!t||/^(;|#|\/\/)/.test(t))return;
    const s=t.match(/^\[([^\]]+)\]$/);if(s){section=s[1].trim().toUpperCase();return;}
    const kv=t.match(/^([^=]+)=(.*)$/);if(kv)rows.push({section,key:kv[1].trim().toUpperCase(),value:kv[2].trim(),line:i+1});
  });return rows;
}
function one(rows,section,key){
  const matches=rows.filter(r=>r.section===section&&r.key===key);
  if(matches.length>1)throw Error('AMBIGUOUS_INI:'+section+'.'+key);
  return matches[0]?.value??null;
}
function inspect(exe){
  const realExe=fs.realpathSync(exe),root=path.dirname(realExe),files=[];
  function walk(dir){
    for(const e of fs.readdirSync(dir,{withFileTypes:true})){
      if(files.length>50000)throw Error('SCAN_FILE_LIMIT');
      const full=path.join(dir,e.name);if(e.isSymbolicLink())continue;
      if(e.isDirectory())walk(full);else if(e.isFile())files.push({path:path.relative(root,full),bytes:fs.statSync(full).size});
    }
  }
  walk(root);
  const sources=[];
  function ini(relative){
    const file=path.join(root,relative);if(!fs.existsSync(file))return [];
    const bytes=fs.readFileSync(file);if(bytes.length>2*1024*1024)throw Error('INI_SIZE_LIMIT');
    sources.push({file:relative,sha256:c.hash(bytes)});return parseIni(bytes);
  }
  const project=ini('Project.ini'),spots=ini('Data/SpotColorSet.ini'),temp=ini('Data/Temp.ini');
  const whiteCandidates=[];
  for(let i=0;i<8;i++)if(one(spots,'SPOTCOLOR','ENABLE'+i)==='1')whiteCandidates.push({slot:i,name:one(spots,'SPOTCOLOR','SZNAME'+i),source:'Data/SpotColorSet.ini',mappingVerified:false});
  const bytes=fs.readFileSync(realExe),filters=new Set();
  for(const encoding of ['latin1','utf16le'])for(const str of bytes.toString(encoding).match(/[\x20-\x7e]{5,300}/g)||[])if(/\*\.(prn|prt|tiff?|psd|bmp|jpg|png|pdf)/i.test(str))filters.add(str);
  const extensions={};for(const f of files){const ext=path.extname(f.path).toLowerCase()||'(none)';extensions[ext]=(extensions[ext]||0)+1;}
  const result={schemaVersion:1,timestamp:c.now(),executable:realExe,executableSha256:c.hash(bytes),installation:root,inventory:{files:files.length,bytes:files.reduce((n,f)=>n+f.bytes,0),extensions},sources,projectMode:one(project,'PROJECT_CONFIG','PROJECT_MODE'),communicationType:one(project,'COMM_CONFIG','DEFAULT_COMM_TYPE'),tcp:{bindConfigured:one(project,'TCP_IP','ADDR'),portConfigured:one(project,'TCP_IP','PORT'),listenerVerified:false},whiteCandidates,watchedFolderHint:one(temp,'HOTFILE','HOTFILE_PATH'),fileFilterResources:[...filters],fileFilterEvidence:'binary resources only; verify live dialog and successful import',ripComponentsPresent:['RIP.dll','RIP_SDK2/RIP.dll','RIP_SDK2/HSCRipProc.dll'].filter(f=>fs.existsSync(path.join(root,f))),physicalDisconnectionVerified:false,productionReady:false,limits:['PROJECT_MODE=1 means debug in the observed Project.ini comment, not certified hardware isolation.','Device ready in debug mode is not board/camera evidence.','RIP DLLs and profile files do not prove activation or compatible task creation.','No settings, queues, watchers, network destinations or device registers were written.']};
  return {report:result,files};
}
function assertUnwatched(output,report){
  if(!report.watchedFolderHint)return;
  const resolve=p=>{let current=path.resolve(p),parts=[];while(!fs.existsSync(current)){const parent=path.dirname(current);if(parent===current)break;parts.unshift(path.basename(current));current=parent;}return path.join(fs.existsSync(current)?fs.realpathSync(current):current,...parts).toLowerCase();};
  const out=resolve(output),watch=resolve(report.watchedFolderHint);
  if(out===watch||out.startsWith(watch+path.sep))throw Error('OUTPUT_IS_PRINTEXP_WATCHER');
}
if(require.main===module){
  const args=process.argv.slice(2);
  if(args.length!==4||args[0]!=='--exe'||args[2]!=='--out')throw Error('Usage: node uv_printexp_scan.cjs --exe PRINTEXP_EXE --out NEW_LOCAL_DIRECTORY');
  const {report,files}=inspect(args[1]),out=path.resolve(args[3]);assertUnwatched(out,report);
  c.writeJSON(path.join(out,'scan.json'),report);c.writeJSON(path.join(out,'inventory.json'),files);
  console.log(JSON.stringify({out,files:files.length,projectMode:report.projectMode,fileFilterResources:report.fileFilterResources,whiteCandidates:report.whiteCandidates,watcherHint:report.watchedFolderHint,productionReady:false}));
}
module.exports={decode,parseIni,one,inspect,assertUnwatched};
