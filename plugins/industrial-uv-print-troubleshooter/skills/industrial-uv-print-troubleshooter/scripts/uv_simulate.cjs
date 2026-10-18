'use strict';
const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const c=require('./uv_core.cjs');
const h=require('./uv_hybrid.cjs');
module.exports=async function simulate(dir,file,port=0) {
  if(!Number.isInteger(port)||port<0||port>65535)throw Error('MOCK_PORT_INVALID');
  const folder=c.confined(dir,'simulation');fs.mkdirSync(folder,{recursive:true});
  const mockInput=path.join(folder,'mock-rip-input'+path.extname(file));
  fs.copyFileSync(file,mockInput,fs.constants.COPYFILE_EXCL);
  let received=[];
  const server=net.createServer(socket=>socket.on('data',chunk=>received.push(chunk)));
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen({port,host:'127.0.0.1',exclusive:true},resolve);});
  try {
    const port=server.address().port, info=await h.inspectFile(mockInput);
    const request={adapter:'PrintExp',action:'owned_mock_send',level:'PRINT_JOB',args:{file:mockInput}};
    const permit=c.issuePermit(request,{mode:'SIMULATION_MODE'},{action:'send',file:fs.realpathSync(mockInput),host:'127.0.0.1',port,sha256:info.sha256,mockServer:server});
    const result=await h.send(mockInput,{host:'127.0.0.1',port,formatVerified:true,preparedMachine:true,permit},()=>{});
    const actual=c.hash(Buffer.concat(received));if(actual!==info.sha256)throw Error('MOCK_HASH_MISMATCH');
    const report={...result,mode:'SIMULATION_MODE',receiver:'owned loopback server',port,sha256:actual,mockRip:true,realRip:false,physicalPrint:false};
    c.writeJSON(path.join(folder,'result.json'),report);
    c.log(dir,{action:'simulation',status:'success',result:report});return report;
  } finally {await new Promise(r=>server.close(r));}
};
