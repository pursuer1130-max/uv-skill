'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const p=require('../scripts/uv_printexp_logs.cjs');
function temp(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'uv-log-test-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;}
test('allowlisted events never retain production identifiers or credentials',()=>{
 const r=p.classify('[11:01:02] 模板【PRIVATE_CUSTOMER】成功识别 2 个产品 C:\\Orders\\secret.tif token=TOP_SECRET\n[11:01:03] nCurPass=22 account=CONFIDENTIAL\n');
 assert.equal(r.counts.products_recognized,1);assert.equal(r.events[1].pass,22);assert.doesNotMatch(JSON.stringify(r),/PRIVATE|SECRET|Orders|secret|CONFIDENTIAL/);
});
test('PRN packet numbers and RIP thread end are not physical print completion',()=>{
 const r=p.classify('[11:01:02] 输出PRN数据包[10/12]\n[11:01:03] RipThreadProc 线程结束\n');
 assert.equal(r.events[0].packet,10);assert.equal(r.events[0].reportedTotal,12);assert.equal(r.counts.print_finished_message,undefined);
});
test('UTF16 tail starts aligned and large file read stays bounded',t=>{
 const d=temp(t),f=path.join(d,'x.log');fs.writeFileSync(f,Buffer.concat([Buffer.from([255,254]),Buffer.from('[10:10:10] nCurPass=1\n'.repeat(10000)+'[10:11:10] nCurPass=321\n','utf16le')]));
 const r=p.readBounded(f,4096);assert.ok(r.bytesRead<=4100);assert.equal(r.coverage,'bounded_head_and_tail');assert.deepEqual(r.encoding,['utf-16le']);assert.equal(r.analysis.events.at(-1).pass,321);
});
test('UTF8 and GB18030 decoding preserves known Chinese messages',()=>{
 assert.equal(p.decode(Buffer.from('正常扫描结束'),null).text,'正常扫描结束');
 assert.equal(p.decode(Buffer.from([0xbf,0xaa,0xca,0xbc]),null).text,'开始');
});
test('partial UTF8 character at byte limit does not select a different encoding',()=>{
 const b=Buffer.from('正常扫描结束');assert.equal(p.decode(b.subarray(0,b.length-1),null).encoding,'utf-8');
});
test('UTF8 bounded tail still recognizes a complete final Chinese record',t=>{
 const d=temp(t),f=path.join(d,'x.log');fs.writeFileSync(f,'未知记录中文内容\n'.repeat(10000)+'[10:11:10] 正常扫描结束\n');
 const r=p.readBounded(f,1024);assert.equal(r.analysis.counts.scan_finished,1);assert.ok(r.encoding.every(e=>e==='utf-8'));
});
test('incomplete trailing log record is not classified',t=>{
 const d=temp(t),f=path.join(d,'x.log');fs.writeFileSync(f,'[10:10:10] nCurPass=2\n[10:10:11] 打印完成');
 assert.equal(p.readBounded(f,4096).analysis.counts.print_finished_message,undefined);
});
test('catalog reads no dump/database contents and redacts arbitrary file names',t=>{
 const d=temp(t);fs.mkdirSync(path.join(d,'Log'));fs.writeFileSync(path.join(d,'Log','PRIVATE_CLIENT.txt'),'SECRET');fs.writeFileSync(path.join(d,'client.dmp'),'SECRET');fs.writeFileSync(path.join(d,'jobs.db'),'SECRET');
 const r=p.inventory(d);assert.equal(r.logs.length,1);assert.equal(r.artifacts.length,2);assert.doesNotMatch(JSON.stringify(r),/PRIVATE_CLIENT|SECRET|client|jobs/);
});
test('collection budget and source files remain unchanged',async t=>{
 const d=temp(t);fs.mkdirSync(path.join(d,'Log'));const f=path.join(d,'Log','runlog.log'),b=Buffer.from('[10:00:00] nCurPass=4\n'.repeat(5000));fs.writeFileSync(f,b);
 const r=await p.collect(d,{maxFileBytes:2048,maxTotalBytes:3072,delayMs:0});assert.ok(r.limits.actualBytesRead<=3072);assert.deepEqual(fs.readFileSync(f),b);assert.equal(r.inputsSent,0);assert.equal(fs.readdirSync(d).length,1);
});
test('file growth and rotation never imply success and cross-root comparisons fail',()=>{
 const a={rootId:'a',at:'a',logs:[{id:'x',bytes:100}]},b={rootId:'a',at:'b',logs:[{id:'x',bytes:1,family:'Log'}]};
 assert.equal(p.compare(a,b).growth[0].meaning,'file_shrank_or_rotated');assert.equal(p.compare(a,b).printCompletion,'not_inferred');assert.throws(()=>p.compare(a,{...b,rootId:'b'}));
});
test('out of range budgets reject before scanning',async()=>{await assert.rejects(()=>p.collect('C:\\',{maxTotalBytes:999999999}),/INVALID_LIMIT/);});
test('inventory bounds report incomplete instead of asserting all logs found',t=>{const d=temp(t);fs.writeFileSync(path.join(d,'a.log'),'x');fs.writeFileSync(path.join(d,'b.log'),'x');assert.equal(p.inventory(d,{maxEntries:1}).coverage.installationMetadataComplete,false);});
