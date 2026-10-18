'use strict';
// Offline only. No app launch, printer input, queue submission or production configuration writes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function regular(p){const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.size<8||s.size>268435456)throw Error('REGULAR_BOUNDED_FILE_REQUIRED');}
function tiff(file){
 regular(file);const b=fs.readFileSync(file),le=b.subarray(0,4).equals(Buffer.from('49492a00','hex'));
 if(!le&&!b.subarray(0,4).equals(Buffer.from('4d4d002a','hex')))throw Error('CLASSIC_TIFF_REQUIRED');
 const u16=p=>{if(p<0||p+2>b.length)throw Error('TIFF_BOUNDS');return le?b.readUInt16LE(p):b.readUInt16BE(p);};
 const u32=p=>{if(p<0||p+4>b.length)throw Error('TIFF_BOUNDS');return le?b.readUInt32LE(p):b.readUInt32BE(p);};
 const start=u32(4),n=u16(start);if(n>4096||start<8||start+2+n*12+4>b.length)throw Error('TIFF_IFD_INVALID');
 const tags=new Map(),sizes={1:1,2:1,3:2,4:4,5:8,7:1,9:4,10:8,11:4,12:8};
 for(let i=0;i<n;i++){const p=start+2+i*12,id=u16(p),type=u16(p+2),count=u32(p+4),size=sizes[type]*count;if(!Number.isSafeInteger(size))throw Error('TIFF_TYPE_UNSUPPORTED');const offset=size<=4?p+8:u32(p+8);if(offset<0||offset+size>b.length||tags.has(id))throw Error('TIFF_TAG_INVALID');tags.set(id,{type,count,size,offset});}
 function values(id){const t=tags.get(id);if(!t)return [];if(![3,4].includes(t.type)||t.count>1000000)throw Error('TIFF_INTEGER_TAG_REQUIRED');return Array.from({length:t.count},(_,i)=>t.type===3?u16(t.offset+i*2):u32(t.offset+i*4));}
 function rational(id){const t=tags.get(id);if(!t||t.type!==5||t.count!==1||!u32(t.offset+4))return null;return u32(t.offset)/u32(t.offset+4);}
 const width=values(256)[0],height=values(257)[0],unit=values(296)[0];if(!width||!height)throw Error('TIFF_DIMENSIONS_REQUIRED');
 let dpi=[rational(282),rational(283)];if(unit===3)dpi=dpi.map(x=>x===null?null:x*2.54);else if(unit!==2)dpi=[null,null];
 return {b,le,tags,start,n,values,width,height,unit,dpi,nextIfd:u32(start+2+n*12),sha256:sha(b)};
}
function inspect(file){const t=tiff(file);return {status:t.dpi.every(x=>Number.isFinite(x)&&x>=300)?'dpi_ready':'dpi_repair_required',width:t.width,height:t.height,dpi:t.dpi,sha256:t.sha256,bytes:t.b.length,inputsSent:0};}
function normalize(file,out,{dpi=300,isolated=false,refit=false}={}){
 if(!isolated||!refit)throw Error('ISOLATED_OUTPUT_AND_REFIT_CONFIRMATION_REQUIRED');
 if(!Number.isInteger(dpi)||dpi<300||dpi>2400)throw Error('DPI_RANGE');
 file=path.resolve(file);out=path.resolve(out);if(file===out||fs.existsSync(out)||path.extname(out).toLowerCase()!=='.tif')throw Error('NEW_TIFF_COPY_REQUIRED');
 const t=tiff(file);if(t.nextIfd!==0||t.unit!==2)throw Error('USE_PHOTOSHOP_EXPORT_FOR_THIS_TIFF');
 const targets=[282,283].map(id=>t.tags.get(id));if(targets.some(x=>!x||x.type!==5||x.count!==1))throw Error('USE_PHOTOSHOP_EXPORT_FOR_MISSING_DPI_TAGS');
 const protectedRanges=[[0,8],[t.start,t.start+2+t.n*12+4]];
 for(const [id,tag] of t.tags)if(id!==282&&id!==283)protectedRanges.push([tag.offset,tag.offset+tag.size]);
 for(const [offsetId,countId] of [[273,279],[324,325]]){const offsets=t.values(offsetId),counts=t.values(countId);if(offsets.length!==counts.length)throw Error('TIFF_RASTER_RANGES_INVALID');offsets.forEach((o,i)=>{if(o+counts[i]>t.b.length)throw Error('TIFF_RASTER_BOUNDS');protectedRanges.push([o,o+counts[i]]);});}
 if(!t.tags.has(273)&&!t.tags.has(324))throw Error('TIFF_RASTER_RANGES_REQUIRED');
 for(const tag of targets)if(protectedRanges.some(([a,z])=>tag.offset<z&&tag.offset+8>a))throw Error('DPI_OVERLAPS_OTHER_DATA');
 const copy=Buffer.from(t.b);for(const tag of targets){if(t.le){copy.writeUInt32LE(dpi,tag.offset);copy.writeUInt32LE(1,tag.offset+4);}else{copy.writeUInt32BE(dpi,tag.offset);copy.writeUInt32BE(1,tag.offset+4);}}
 fs.writeFileSync(out,copy,{flag:'wx'});const after=inspect(out);if(!after.dpi.every(x=>x===dpi)||sha(fs.readFileSync(file))!==t.sha256)throw Error('DPI_COPY_VERIFICATION_FAILED');
 return {...after,status:'dpi_copy_verified',rasterPayloadUnchanged:true,sourcePreserved:true,refitAfterImportRequired:true,qualityIncreased:false,inputsSent:0};
}
function decodeJson(file){regular(file);const b=fs.readFileSync(file);for(const enc of ['utf-8','gb18030']){try{return JSON.parse(new TextDecoder(enc,{fatal:true}).decode(b));}catch{}}throw Error('TEMPLATE_JSON_INVALID');}
function templates(root,names){
 if(!path.isAbsolute(root)||!Array.isArray(names)||!names.length||names.length>128||new Set(names).size!==names.length)throw Error('CURRENT_LOADED_TEMPLATE_NAMES_REQUIRED');
 return names.map(name=>{if(typeof name!=='string'||name!==path.basename(name)||/[\\/:]|^\.{1,2}$/.test(name))throw Error('TEMPLATE_NAME_INVALID');
  const dir=path.join(root,'Vision',name),issues=[];let meta;
  try{meta=decodeJson(path.join(dir,'Temp.json')).Temp;if(meta.szName!==name)issues.push('METADATA_NAME_MISMATCH');if(!meta.vFeatures?.length)issues.push('RECOGNITION_FEATURES_MISSING');}catch{issues.push('METADATA_UNREADABLE');}
  for(const suffix of ['_ModelRow.tup','_ModelCol.tup','_Template_Model_.shm']){const p=path.join(dir,'Model2',name+suffix);try{regular(p);}catch{issues.push('MODEL2_MISSING:'+suffix);}}
  let image;try{image=inspect(path.join(root,'Template',name+'.tif'));if(image.status!=='dpi_ready')issues.push('TIFF_DPI_BELOW_300_OR_UNKNOWN');}catch{issues.push('TEMPLATE_TIFF_UNREADABLE');}
  return {name,status:issues.length?'repair_required':'ready_for_ui_verification',issues,image,ownedDraft:/^飞天_配准草稿_\d{8}_\d{6}$/.test(name),inputsSent:0};
 });
}
module.exports={inspect,normalize,templates};
if(require.main===module){try{const a=process.argv.slice(2),arg=k=>{const i=a.indexOf(k);return i<0?null:a[i+1];};let r;
 if(a[0]==='inspect')r=inspect(arg('--file'));
 else if(a[0]==='dpi-copy')r=normalize(arg('--file'),arg('--out'),{dpi:Number(arg('--dpi')||300),isolated:a.includes('--isolated-output-confirmed'),refit:a.includes('--refit-after-import')});
 else if(a[0]==='templates'){const o=JSON.parse(fs.readFileSync(arg('--observation'),'utf8'));const age=Date.now()-Date.parse(o.at);if(o.status!=='private_print_evidence_observed'||!Number.isFinite(age)||age<0||age>120000||!Array.isArray(o.loadedTemplates))throw Error('FRESH_LOADED_TEMPLATE_OBSERVATION_REQUIRED');r={status:'loaded_templates_checked',templates:templates(arg('--root'),o.loadedTemplates),privacy:'Private local job names; do not publish raw report',inputsSent:0};}
 else throw Error('USE_INSPECT_DPI_COPY_OR_TEMPLATES');console.log(JSON.stringify(r));
 }catch(e){console.error(e.message);process.exitCode=1;}}
