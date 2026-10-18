'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
test('started command without completion cannot be replaced',t=>{const f=fixture(t),id='b'.repeat(32),pending=path.join(f.root,'command.json'),body=JSON.stringify({id});fs.writeFileSync(pending,body);fs.mkdirSync(path.join(f.root,'runs',id),{recursive:true});fs.writeFileSync(path.join(f.root,'runs',id,'started.json'),'{}');const r=f.run('read-only');assert.notEqual(r.status,0);assert.match(r.stderr,/PREVIOUS_COMMAND_UNRESOLVED/);assert.equal(fs.readFileSync(pending,'utf8'),body);});
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'uv-command-lifecycle-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const script=path.join(root,'prepare-command.cjs');
 fs.copyFileSync(path.join(__dirname,'../adapters/printexp/desktop-compat/prepare-command.cjs'),script);
 return {root,run:(...args)=>cp.spawnSync(process.execPath,[script,...args],{encoding:'utf8'})};
}
test('failed preparation removes an earlier actionable command and preserves its exact bytes',t=>{
 const f=fixture(t),old=JSON.stringify({id:'a'.repeat(32),action:'scan-once',createdAt:new Date().toISOString()});
 fs.writeFileSync(path.join(f.root,'command.json'),old);
 const r=f.run('not-an-action');assert.notEqual(r.status,0);assert.match(r.stderr,/ACTION_NOT_ALLOWED/);
 assert.equal(fs.existsSync(path.join(f.root,'command.json')),false);
 const dir=path.join(f.root,'superseded-commands'),files=fs.readdirSync(dir);assert.equal(files.length,1);
 assert.equal(fs.readFileSync(path.join(dir,files[0]),'utf8'),old);
 assert.equal(fs.existsSync(path.join(f.root,'.prepare-command.lock')),false);
});
test('invalid current command preserves historical archive and cannot replay the previous command',t=>{
 const f=fixture(t),exe=path.join(f.root,'PrintExp_X64.exe'),marker=path.join(f.root,'height-transition.json');
 fs.writeFileSync(exe,'NOT_AN_EXECUTABLE');
 const state=JSON.stringify({schemaVersion:1,followUpMotionBlocked:true,targetMm:9});fs.writeFileSync(marker,state);
 assert.equal(f.run('read-only').status,0);
 const r=f.run('scan-once','--scan-only-authorized','--operator-ready','--target-exe',exe);
 assert.notEqual(r.status,0);assert.match(r.stderr,/INVALID_OBSERVATION_ID/);
 assert.equal(fs.existsSync(path.join(f.root,'command.json')),false);assert.equal(fs.readFileSync(marker,'utf8'),state);
});
test('successful preparation commits exactly the newly returned command id',t=>{
 const f=fixture(t);assert.equal(f.run('read-only').status,0);const r=f.run('capture','--target-exe','not-absolute');assert.notEqual(r.status,0);
 const good=f.run('read-only');assert.equal(good.status,0,good.stderr);
 assert.equal(JSON.parse(good.stdout).id,JSON.parse(fs.readFileSync(path.join(f.root,'command.json'))).id);
 assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,'command.json'))).action,'read-only');
});
test('concurrent or interrupted preparation requires inspection instead of overwriting commands',t=>{
 const f=fixture(t),pending=path.join(f.root,'command.json');fs.writeFileSync(pending,'original');
 fs.writeFileSync(path.join(f.root,'.prepare-command.lock'),'existing-preparation');
 const r=f.run('read-only');assert.notEqual(r.status,0);assert.match(r.stderr,/EEXIST/);
 assert.equal(fs.readFileSync(pending,'utf8'),'original');assert.equal(fs.readFileSync(path.join(f.root,'.prepare-command.lock'),'utf8'),'existing-preparation');
});
