'use strict';
// The former cross-machine height review has been permanently retired.
// Its unchanged implementation is archived in memory/height-lock-retirement-20261014.
// Current commands use current device evidence directly; no historical release exists.
if(require.main===module){
 process.stderr.write(JSON.stringify({status:'retired',error:'HISTORICAL_HEIGHT_REVIEW_RETIRED',targetInputSent:false})+'\n');
 process.exitCode=1;
}else{
 module.exports=Object.freeze({retired:true});
}
