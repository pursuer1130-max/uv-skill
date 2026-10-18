'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {psdHeader,readiness}=require('../scripts/uv_site_preflight.cjs');
function fixture(){const b=Buffer.alloc(26);b.write('8BPS');b.writeUInt16BE(1,4);b.writeUInt16BE(3,12);b.writeUInt32BE(800,14);b.writeUInt32BE(1200,18);b.writeUInt16BE(8,22);b.writeUInt16BE(3,24);return b;}
test('PSD header reads dimensions while remaining non-production',()=>{const r=psdHeader(fixture());assert.equal(r.width,1200);assert.equal(r.height,800);assert.equal(r.productionReady,false);});
test('reject truncated, bad signature and oversized PSD',()=>{assert.throws(()=>psdHeader(fixture().subarray(0,20)));const b=fixture();b[0]=0;assert.throws(()=>psdHeader(b));const huge=fixture();huge.writeUInt32BE(30001,18);assert.throws(()=>psdHeader(huge));});
test('reserved fields and invalid channel count are rejected',()=>{const b=fixture();b[8]=1;assert.throws(()=>psdHeader(b));const c=fixture();c.writeUInt16BE(0,12);assert.throws(()=>psdHeader(c));});
test('fresh inventory never authorizes machine execution',()=>{const now=Date.now();const r=readiness({observedAt:new Date(now).toISOString(),apps:[{name:'PrintExp',detection:'available',runningState:'running'}]},now);assert.equal(r.freshInventory,true);assert.equal(r.stages[0].automation,'blocked');assert.equal(r.manualGate.automaticPrint,false);});
test('stale and future observations fail closed',()=>{const now=Date.now();for(const t of [now-300001,now+1])assert.equal(readiness({observedAt:new Date(t).toISOString(),apps:[]},now).freshInventory,false);});
test('missing inventory rejected',()=>assert.throws(()=>readiness(null)));
test('legacy production confirmations cannot enable machine output',()=>{
 const c=require('../scripts/uv_core.cjs');
 for(const level of ['PRINT_JOB','MACHINE_PARAMETER'])assert.throws(()=>c.authorize({level},{mode:'PRODUCTION_MODE',preparedMachine:true,confirmation:{}}),/SITE_OPERATOR_NATIVE_SOFTWARE_ONLY/);
 assert.throws(()=>c.authorize({level:'SOFTWARE_CONTROL',adapter:'PrintExp'},{mode:'PRODUCTION_MODE',softwareControlAuthorized:true}),/SITE_OPERATOR_NATIVE_SOFTWARE_ONLY/);
 assert.throws(()=>c.issuePermit({level:'SOFTWARE_CONTROL'},{mode:'PRODUCTION_MODE',softwareControlAuthorized:true},{action:'ini'}),/SITE_OPERATOR_NATIVE_SOFTWARE_ONLY/);
 assert.equal(c.authorize({level:'READ_ONLY'},{mode:'OBSERVE_MODE'}).allowed,true);
 assert.equal(c.authorize({level:'PRINT_JOB'},{mode:'SIMULATION_MODE'}).simulated,true);
});
