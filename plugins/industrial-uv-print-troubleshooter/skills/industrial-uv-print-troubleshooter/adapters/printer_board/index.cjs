'use strict';
const {adapter}=require('../base.cjs');
module.exports=adapter('PrinterBoard',{
  read:{level:'READ_ONLY',execute:async(args,ctx)=>ctx.registry.registry.PrinterBoard,verification:'LOCAL_TEST'}
});
