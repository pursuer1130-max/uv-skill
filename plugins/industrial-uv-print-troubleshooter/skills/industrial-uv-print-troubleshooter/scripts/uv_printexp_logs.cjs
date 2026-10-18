'use strict';
// Passive file reader: no application input, process launch, socket, SQL, or file write.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const families=new Set(['Log','Log/main','Log/remote_monitor','logfile','RIP_SDK2/log']);
const rules=[
 ['pass_write',/Start Write PassInfo/i],['pass_counter',/\bnCurPass\s*=\s*(\d+)/i,'pass'],
 ['scan_finished',/正常扫描结束/],['scan_started',/开始扫描|start\s+scan/i],
 ['products_recognized',/成功识别\s*(\d+)\s*个产品/,'products'],
 ['print_data_generated',/打印数据已生成完毕/],['rip_callback_ok',/OnRipFinish success/i],
 ['print_started_message',/开始打印|正在打印|StartPrint\b/i],['print_finished_message',/打印完成|打印结束|PrintFinish\b/i],
 ['scan_cancel_message',/取消扫描|CancelScan\b/i],['print_cancel_message',/取消打印|CancelPrint\b/i],
 ['print_pause_message',/暂停打印|PausePrint\b/i],
 ['vision_splice_started',/bmpSplicing5.*(?:\bstart\b|prepare tif)/],
 ['vision_splice_finished',/bmpSplicing5.*ok end/],
 ['vision_transform_finished',/transformTifImage.*ok end/],
 ['vision_section_callback',/sendSectionRipCallback/],
 ['rip_packet',/PRN.*?\[(\d+)\/(\d+)\]/,'packet'],
 ['rip_thread_finished',/RipThreadProc.*(?:结束|exit|end)/i],
 ['rip_output_thread_finished',/输出线程结束/],
 ['rip_output_complete',/输出完成\s*OK/],
 ['qt_signal_missing',/QObject::connect: No such signal/],['qt_slot_missing',/QObject::connect: No such slot/],
 ['qt_wait_teardown',/QWaitCondition: Destroyed while threads are still waiting/],
 ['communication_not_connected',/m_bIsConnect\s*!=\s*TRUE/],
 ['error_message',/\[(?:错误|error|fatal)\]/i],['warning_message',/\[(?:警告|warn|warning)\]/i]
];
function classify(text){
 const counts={},events=[];let unmatched=0,lines=0;
 for(const line of text.split(/\r?\n/)){
  if(!line)continue;lines++;let found=false;
  const timestamp=line.match(/(?:^|\[)(\d{2}:\d{2}:\d{2}(?:[.:]\d{3})?)/)?.[1]||null;
  for(const [kind,re,field] of rules){const m=line.match(re);if(!m)continue;found=true;counts[kind]=(counts[kind]||0)+1;
   const event={kind,time:timestamp};if(field==='pass'||field==='products')event[field]=Number(m[1]);
   if(field==='packet'){event.packet=Number(m[1]);event.reportedTotal=Number(m[2]);}
   // Store only fixed enums and numeric fields. Never output raw lines, paths, names or credentials.
   if(kind!=='pass_write'){events.push(event);if(events.length>200)events.shift();}
  }if(!found)unmatched++;
 }
 return {lines,unmatched,counts,events};
}
function encoding(head){if(head[0]===255&&head[1]===254)return 'utf-16le';if(head[0]===254&&head[1]===255)return 'utf-16be';return null;}
function decode(bytes,enc){if(enc)return {text:new TextDecoder(enc,{fatal:false}).decode(bytes),encoding:enc};
 try{return {text:new TextDecoder('utf-8',{fatal:true}).decode(bytes,{stream:true}),encoding:'utf-8'};}
 catch{return {text:new TextDecoder('gb18030',{fatal:false}).decode(bytes),encoding:'gb18030-fallback'};}
}
function noLinks(p){for(let q=path.resolve(p);;q=path.dirname(q)){if(fs.lstatSync(q).isSymbolicLink())throw Error('LINK_REJECTED');if(q===path.dirname(q))break;}}
function readBounded(file,maxBytes){
 noLinks(file);const fd=fs.openSync(file,'r');try{
  const start=fs.fstatSync(fd);if(!start.isFile())throw Error('NOT_REGULAR_FILE');
  const head=Buffer.alloc(4);fs.readSync(fd,head,0,4,0);const enc=encoding(head),unit=enc?2:1;
  const limit=Math.floor(Math.min(start.size,maxBytes)/unit)*unit;
  const chunks=limit>=start.size?[{offset:0,length:limit}]:[{offset:0,length:Math.floor(limit/2/unit)*unit},{offset:Math.ceil((start.size-limit/2)/unit)*unit,length:Math.floor(limit/2/unit)*unit}];
  let read=0,text='',formats=[];const ranges=[];
  for(const c of chunks){const b=Buffer.alloc(c.length),n=fs.readSync(fd,b,0,b.length,c.offset),d=decode(b.subarray(0,n),enc||(c.offset>0?(formats[0]==='gb18030-fallback'?'gb18030':formats[0]):null));read+=n;formats.push(d.encoding);let s=d.text;
   if(c.offset>0)s=s.slice(s.indexOf('\n')+1);if(c.offset+n<start.size||n<c.length)s=s.slice(0,Math.max(0,s.lastIndexOf('\n')));
   // A trailing live record can be incomplete; do not classify it until it has a newline.
   else if(!s.endsWith('\n'))s=s.slice(0,Math.max(0,s.lastIndexOf('\n')));
   text+=s+'\n';ranges.push({offset:c.offset,bytes:n,sha256:hash(b.subarray(0,n))});
  }
  const end=fs.fstatSync(fd),replacement=fs.statSync(file);
  return {bytesRead:read+4,snapshotBytes:start.size,coverage:limit>=start.size?'complete_at_initial_size':'bounded_head_and_tail',encoding:[...new Set(formats)],ranges,changedDuringRead:start.size!==end.size||start.mtimeMs!==end.mtimeMs||start.ino!==replacement.ino,analysis:classify(text)};
 }finally{fs.closeSync(fd);}
}
function inventory(root,{maxEntries=30000,maxDepth=18}={}){
 if(!path.isAbsolute(root))throw Error('ABSOLUTE_ROOT_REQUIRED');noLinks(root);if(!fs.statSync(root).isDirectory())throw Error('ROOT_NOT_DIRECTORY');
 const logs=[],artifacts=[],errors=[];let visited=0,complete=true;
 function walk(dir,depth){if(depth>maxDepth){complete=false;errors.push({kind:'depth_limit'});return;}
  let list;try{list=fs.readdirSync(dir,{withFileTypes:true});}catch(e){complete=false;errors.push({kind:'directory_unreadable',code:e.code||'READ_ERROR'});return;}
  for(const ent of list){if(++visited>maxEntries){complete=false;return;}const p=path.join(dir,ent.name),rel=path.relative(root,p).replaceAll('\\','/');
   if(ent.isSymbolicLink()){errors.push({kind:'link_skipped',id:hash(rel).slice(0,16)});complete=false;continue;}
   if(ent.isDirectory()){walk(p,depth+1);continue;}if(!ent.isFile())continue;
   const ext=path.extname(ent.name).toLowerCase(),inLog=/(^|\/)(?:log|logs|logfile)(\/|$)/i.test(rel);
   const kind=ext==='.log'||(ext==='.txt'&&inLog)?'text_log':ext==='.dmp'?'crash_dump':ext==='.etl'?'trace_file':ext==='.db'&&!/^thumbs\.db$/i.test(ent.name)?'database_candidate':null;
   if(!kind)continue;try{const st=fs.statSync(p),dirRel=path.posix.dirname(rel),family=families.has(dirRel)?dirRel:'other/'+hash(dirRel).slice(0,12);
    const safeName=/^(?:Log\[\d{4}_\d{2}_\d{2}\]\.txt|contourMatch_\d{8}_log\.txt|runlog\.log)$/i.test(ent.name)?ent.name:'file-'+hash(rel).slice(0,16)+ext;
    const item={id:hash(rel).slice(0,20),kind,family,name:safeName,bytes:st.size,mtime:st.mtime.toISOString()};
    Object.defineProperty(item,'source',{value:p,enumerable:false});(kind==='text_log'?logs:artifacts).push(item);
   }catch(e){complete=false;errors.push({kind:'file_unreadable',code:e.code||'READ_ERROR'});}
  }
 }
 walk(root,0);return {rootId:hash(fs.realpathSync(root).toLowerCase()).slice(0,20),logs,artifacts,coverage:{installationMetadataComplete:complete,visitedEntries:visited,maxEntries,maxDepth,otherInstallationsSearched:false,appDataIncluded:false,windowsEventLogIncluded:false},errors};
}
async function collect(root,{latestPerFamily=3,maxFileBytes=2*1024*1024,maxTotalBytes=12*1024*1024,delayMs=40}={}){
 for(const [n,v,lo,hi] of [['latestPerFamily',latestPerFamily,1,3],['maxFileBytes',maxFileBytes,1024,2097152],['maxTotalBytes',maxTotalBytes,1024,12582912],['delayMs',delayMs,0,1000]])if(!Number.isInteger(v)||v<lo||v>hi)throw Error('INVALID_LIMIT:'+n);
 const inv=inventory(root),groups={};for(const l of inv.logs)(groups[l.family]||=[]).push(l);
 for(const list of Object.values(groups))list.sort((a,b)=>b.mtime.localeCompare(a.mtime));
 const samples=[];let used=0;
 for(let rank=0;rank<latestPerFamily;rank++)for(const list of Object.values(groups)){
  const f=list[rank];if(!f)continue;if(used+1028>maxTotalBytes)continue;
  try{const sample=readBounded(f.source,Math.min(maxFileBytes,maxTotalBytes-used-4));used+=sample.bytesRead;samples.push({id:f.id,family:f.family,name:f.name,mtime:f.mtime,...sample});}
  catch(e){samples.push({id:f.id,family:f.family,status:'unreadable_no_retry',code:/^[A-Z_]+$/.test(e.code||e.message)?e.code||e.message:'READ_ERROR'});}
  if(delayMs)await new Promise(r=>setTimeout(r,delayMs));
 }
 return {schemaVersion:1,at:new Date().toISOString(),mode:'onsite_readonly_observation',...inv,families:Object.entries(groups).map(([family,list])=>({family,files:list.length,bytes:list.reduce((n,f)=>n+f.bytes,0),newest:list[0]?.mtime})),samples,limits:{latestPerFamily,maxFileBytes,maxTotalBytes,actualBytesRead:used,delayMs},privacy:{rawLinesSaved:false,customerPathsSaved:false,dumpsRead:false,databasesOpened:false},meaning:'Log messages describe software activity. They do not prove physical completion, quality, readiness, or a callable device API.',inputsSent:0};
}
function compare(a,b){
 if(a.rootId!==b.rootId)throw Error('DIFFERENT_INSTALLATION');
 const growth=[];for(const n of b.logs){const old=a.logs.find(x=>x.id===n.id);if(old&&n.bytes!==old.bytes)growth.push({id:n.id,family:n.family,deltaBytes:n.bytes-old.bytes,meaning:n.bytes>old.bytes?'file_grew':'file_shrank_or_rotated'});}
 return {from:a.at,to:b.at,growth,physicalState:'unknown',printCompletion:'not_inferred',inputsSent:0};
}
module.exports={classify,decode,readBounded,inventory,collect,compare};
if(require.main===module){
 const a=process.argv.slice(2);if(a.length!==2||a[0]!=='--root'){console.error('Usage: node uv_printexp_logs.cjs --root <freshly-identified-installation-directory>\nRead-only; writes JSON to stdout, never writes to the installation.');process.exitCode=2;}
 else collect(path.resolve(a[1])).then(r=>process.stdout.write(JSON.stringify(r,null,2)+'\n')).catch(e=>{console.error(JSON.stringify({status:'blocked',code:e.code||e.message,inputsSent:0}));process.exitCode=1;});
}
