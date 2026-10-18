'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const h=require('../scripts/uv_hybrid.cjs');
const c=require('../scripts/uv_core.cjs');
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'uv-license-test-'));
  fs.mkdirSync(path.join(root,'license','devices'),{recursive:true});
  const keys=crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(path.join(root,'license','public_key.txt'),keys.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('hex'));
  function write(device,name,expires='2099-01-01T00:00:00Z'){
    const payload={device_id:device,expires_at:expires,plugin:'industrial-uv-print-troubleshooter'};
    const doc={payload,signature:crypto.sign(null,Buffer.from(h.canonical(payload)),keys.privateKey).toString('base64')};
    const file=path.join(root,'license',name);fs.writeFileSync(file,JSON.stringify(doc));return file;
  }
  return {root,write};
}
test('valid device-specific signed license is selected without rewriting the default',()=>{
  const f=fixture(),old=f.write('ANOTHER_DEVICE','license.json'),hash=c.fileHash(old);
  const selected=f.write(h.deviceId(),'devices/'+h.deviceId()+'.json');
  assert.equal(h.license(f.root).licenseFile,selected);assert.equal(c.fileHash(old),hash);
});
test('wrong device and expired licenses remain rejected',()=>{
  const f=fixture();f.write('ANOTHER_DEVICE','license.json');assert.throws(()=>h.license(f.root),/device/);
  f.write(h.deviceId(),'devices/'+h.deviceId()+'.json','2000-01-01T00:00:00Z');assert.throws(()=>h.license(f.root),/EXPIRED/);
});
test('invalid preferred signature never silently falls back to the default',()=>{
  const f=fixture();f.write(h.deviceId(),'license.json');
  const file=f.write(h.deviceId(),'devices/'+h.deviceId()+'.json');const doc=c.readJSON(file);doc.payload.device_id='TAMPERED';fs.writeFileSync(file,JSON.stringify(doc));
  assert.throws(()=>h.license(f.root),/signature/);
});
test('missing license fails closed',()=>{const f=fixture();assert.throws(()=>h.license(f.root),/MISSING/);});
test('unresolved privileged process prevents stopped-state configuration',()=>{
  const reg={registry:{PrintExp:{runningState:'stopped',candidates:[]}},unresolvedProcesses:[{software:'PrintExp',pid:123}]};
  assert.throws(()=>c.assertAppStopped(reg,'PrintExp'),/UNKNOWN/);
  reg.unresolvedProcesses=[];reg.registry.PrintExp.runningState='unknown';assert.throws(()=>c.assertAppStopped(reg,'PrintExp'),/UNKNOWN/);
  reg.registry.PrintExp.runningState='running';reg.registry.PrintExp.candidates=[{running:true}];assert.throws(()=>c.assertAppStopped(reg,'PrintExp'),/STILL_RUNNING/);
  reg.registry.PrintExp.runningState='stopped';reg.registry.PrintExp.candidates=[];assert.equal(c.assertAppStopped(reg,'PrintExp'),true);
});
