'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const c=require('./uv_core.cjs');
function audit(root) {
  const files=[],syntaxErrors=[],groups=new Map();
  function walk(dir) {for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const file=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('AUDIT_LINK_REJECTED');
    if(entry.isDirectory()){walk(file);continue;}
    const bytes=fs.readFileSync(file),relative=path.relative(root,file),sha256=c.hash(bytes);
    const record={path:relative,bytes:bytes.length,sha256};
    if(!groups.has(sha256))groups.set(sha256,[]);groups.get(sha256).push(relative);
    if(/PRIVATE_KEY|license\.json/i.test(relative))record.inspection='metadata only; credential contents not logged';
    else if(/\.(md|json|yaml|jsx|cjs|ps1|py|txt)$/.test(relative)) {
      const text=bytes.toString('utf8');record.lines=text.split(/\r?\n/).length;
      record.fixedPathLines=[];record.actionReviewLines=[];
      for(const [index,line] of text.split(/\r?\n/).entries()) {
        if(/[CDE]:[\\/]|Users[\\/]Administrator/i.test(line))record.fixedPathLines.push(index+1);
        if(/saveAs|overwrite|Start-Process|\.send\(|\.connect\(|\.click\(|\.remove\(|Terminate|firmware|BOARD_WRITE/i.test(line))record.actionReviewLines.push(index+1);
      }
      try {
        if(relative.endsWith('.json'))JSON.parse(text.replace(/^\uFEFF/,''));
        if(/\.(cjs|jsx)$/.test(relative))new vm.Script(text.replace(/^\uFEFF/,'').replace(/^\s*#target[^\n]*\n/gm,''),{filename:relative});
      }catch(error){syntaxErrors.push({path:relative,error:error.message});}
    }
    files.push(record);
  }}walk(path.resolve(root));
  return {timestamp:c.now(),root:path.resolve(root),fileCount:files.length,files,duplicateContent:[...groups.values()].filter(a=>a.length>1),syntaxErrors,scope:'Every file hashed; text scanned; JS/JSON parsed. No Python executed. JSX syntax check is not a Photoshop execution test.'};
}
if(require.main===module){const result=audit(process.argv[2]||path.resolve(__dirname,'..'));if(process.argv[3])c.writeJSON(path.resolve(process.argv[3]),result);console.log(JSON.stringify({files:result.fileCount,duplicates:result.duplicateContent,syntaxErrors:result.syntaxErrors}));if(result.syntaxErrors.length)process.exitCode=1;}
module.exports={audit};
