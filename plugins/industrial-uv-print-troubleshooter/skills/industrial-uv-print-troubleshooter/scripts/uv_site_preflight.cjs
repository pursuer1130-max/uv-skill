'use strict';
const fs=require('node:fs'),path=require('node:path');
const hybrid=require('./uv_hybrid.cjs');
function psdHeader(b){
 if(b.length<26||b.toString('ascii',0,4)!=='8BPS'||b.readUInt16BE(4)!==1)throw Error('PSD_HEADER_INVALID');
 if(b.subarray(6,12).some(v=>v!==0))throw Error('PSD_RESERVED_NONZERO');
 const channels=b.readUInt16BE(12),height=b.readUInt32BE(14),width=b.readUInt32BE(18),depth=b.readUInt16BE(22),mode=b.readUInt16BE(24);
 if(channels<1||channels>56||height<1||height>30000||width<1||width>30000||![1,8,16,32].includes(depth)||![0,1,2,3,4,7,8,9].includes(mode))throw Error('PSD_HEADER_RANGE');
 return {width,height,channels,depth,colorModeCode:mode,scope:'PSD v1 header only; image data, ICC, DPI and spot semantics require Photoshop reopen validation',productionReady:false};
}
async function fileCheck(file){
 const info=await hybrid.inspectFile(file);
 const fd=fs.openSync(file,'r'),header=Buffer.alloc(26);let count;
 try{count=fs.readSync(fd,header,0,26,0);}finally{fs.closeSync(fd);}
 const psd=info.kind==='PSD'?psdHeader(header.subarray(0,count)):null;
 const after=await hybrid.inspectFile(file);
 if(info.sha256!==after.sha256||info.bytes!==after.bytes||info.mtimeMs!==after.mtimeMs)throw Error('INPUT_CHANGED');
 const ext=path.extname(file).toLowerCase();
 const expected={'.psd':'PSD','.tif':'TIFF','.tiff':'TIFF','.png':'PNG','.jpg':'JPEG','.jpeg':'JPEG','.bmp':'BMP'}[ext];
 if(!expected||expected!==info.kind)throw Error('EXTENSION_SIGNATURE_MISMATCH');
 return {kind:info.kind,bytes:info.bytes,sha256:info.sha256,psd,scope:'stable file identity and signature; no RIP, rendering or print certification',productionReady:false};
}
function readiness(report,now=Date.now()){
 if(!report||!Array.isArray(report.apps))throw Error('INVENTORY_REQUIRED');
 const time=Date.parse(report.observedAt),fresh=Number.isFinite(time)&&now>=time&&now-time<=300000;
 return {schemaVersion:1,freshInventory:fresh,stages:report.apps.map(a=>({software:a.name,readOnlyIdentification:fresh&&a.detection==='available'?'observed':'needs_rediscovery',automation:'blocked',reason:!fresh?'stale or invalid observation':a.runningState==='unknown'?'unknown runtime state':a.requiresSelection?'ambiguous installation':'documented interface and isolated functional test required'})),manualGate:{required:true,executor:'qualified operator in original vendor software',automaticPrint:false},productionReady:false};
}
async function main(){
 const [action,file,...rest]=process.argv.slice(2);if(rest.length)throw Error('UNEXPECTED_ARGUMENT');
 if(action==='file'&&file){hybrid.license(path.resolve(__dirname,'..'));console.log(JSON.stringify(await fileCheck(file),null,2));}
 else if(action==='readiness'&&file)console.log(JSON.stringify(readiness(JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''))),null,2));
 else throw Error('Usage: node uv_site_preflight.cjs file <authorized-test-copy> | readiness <redacted-inventory.json>');
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={psdHeader,fileCheck,readiness};
