'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const s=require('../scripts/uv_printexp_scan.cjs');
test('INI decoding supports GBK comments and ignores commented receiver addresses',()=>{
  const bytes=Buffer.concat([Buffer.from(';'),Buffer.from([0xb0,0xe5]),Buffer.from('\r\n[PROJECT_CONFIG]\r\nPROJECT_MODE=1\r\n[TCP_IP]\r\n;ADDR=127.0.0.1\r\nPORT=9100')]);
  const rows=s.parseIni(bytes);assert.equal(s.one(rows,'PROJECT_CONFIG','PROJECT_MODE'),'1');assert.equal(s.one(rows,'TCP_IP','ADDR'),null);
});
test('duplicate configuration is ambiguous, not last-value-wins',()=>{
  assert.throws(()=>s.one(s.parseIni(Buffer.from('[TCP_IP]\nPORT=9100\nPORT=9101')),'TCP_IP','PORT'),/AMBIGUOUS/);
});
test('UTF16 INI and section scoping are preserved',()=>{
  const b=Buffer.concat([Buffer.from([255,254]),Buffer.from('[A]\nX=1\n[B]\nX=2','utf16le')]);
  assert.equal(s.one(s.parseIni(b),'B','X'),'2');
});
test('scan is read-only and debug does not establish hardware or RIP readiness',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'uv-scan-'));fs.mkdirSync(path.join(root,'Data'));
  const exe=path.join(root,'PrintExp_X64.exe');fs.writeFileSync(exe,'MZ fixture PRN (*.prn)|*.prn||');
  fs.writeFileSync(path.join(root,'Project.ini'),'[PROJECT_CONFIG]\nPROJECT_MODE=1');
  fs.writeFileSync(path.join(root,'Data','SpotColorSet.ini'),'[SPOTCOLOR]\nEnable0=1\nszName0=White ink');
  const before=fs.readdirSync(root);const {report}=s.inspect(exe);
  assert.equal(report.whiteCandidates[0].name,'White ink');assert.equal(report.productionReady,false);assert.equal(report.physicalDisconnectionVerified,false);assert.deepEqual(fs.readdirSync(root),before);assert.match(report.fileFilterResources[0],/prn/);
});
test('known watcher and descendants are rejected as output directories',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'uv-watch-'));
  assert.throws(()=>s.assertUnwatched(path.join(root,'new-job'),{watchedFolderHint:root}),/WATCHER/);
  assert.doesNotThrow(()=>s.assertUnwatched(root+'-sibling',{watchedFolderHint:root}));
});
test('rehearsal defaults to 9100 and ephemeral port requires an explicit option',()=>{
  const p=require('../scripts/uv_rehearse.cjs').parseArgs;
  assert.equal(p([]).options.mockPort,9100);
  assert.equal(p(['--mock-port','0','--spot-white-name','White ink']).options.mockPort,0);
  for(const args of [['--mock-port','-1'],['--mock-port','65536'],['--mock-port','abc'],['--root'],['--root','a','--root','b'],['--send','yes']])assert.throws(()=>p(args));
});
