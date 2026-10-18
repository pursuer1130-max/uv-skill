'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const plugin=path.resolve(__dirname,'../../..'),skill='skills/industrial-uv-print-troubleshooter',legacy=skill+'/site-config/height-safety.json';
test('actual LoadCheck ignores only retired source height archive while requiring current EXE and Skill integrity',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'uv-archive-loadcheck-'));t.after(()=>{assert.match(path.basename(root),/^uv-archive-loadcheck-/);fs.rmSync(root,{recursive:true,force:true});});
 fs.cpSync(plugin,root,{recursive:true});
 const index=JSON.parse(fs.readFileSync(path.join(root,'maintenance/site-20260916/integrity.json')));assert.equal(index.files.some(x=>x.path.replaceAll('\\','/')===legacy),false);
 const launch=()=>cp.spawnSync('pwsh.exe',['-NoProfile','-File',path.join(root,skill,'scripts/uv_site_readonly.ps1'),'-Action','LoadCheck'],{encoding:'utf8',windowsHide:true});
 let result=launch();assert.equal(result.status,0,result.stdout+result.stderr);
 const archive=path.join(root,legacy);fs.mkdirSync(path.dirname(archive),{recursive:true});fs.writeFileSync(archive,'changed retired record');result=launch();assert.equal(result.status,0,result.stdout+result.stderr);fs.unlinkSync(archive);result=launch();assert.equal(result.status,0,result.stdout+result.stderr);
 for(const relative of [skill+'/adapters/printexp/desktop-compat/UVMenuCompat.exe',skill+'/SKILL.md']){const file=path.join(root,relative),before=fs.readFileSync(file);fs.appendFileSync(file,'integrity mutation fixture');result=launch();assert.notEqual(result.status,0);assert.match(result.stdout+result.stderr,/HASH_MISMATCH/);fs.writeFileSync(file,before);}
});
